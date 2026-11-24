-- Fazenda Digital V191 – a Venda de gado olha o Estoque de gado
-- (rodado direto no Supabase; guardado aqui só como registro)
-- Regra: o rebanho é o estoque Total; o Com GTA só se move por GTA e NF.
--   Venda com NF e GTA informadas: confere e baixa no Com GTA (e no Total).
--   Venda sem NF ou sem GTA: confere e baixa só no Total.
-- Vale para a fazenda que tem lançamento no Estoque de gado. A que não tem segue só pelo rebanho, como antes.

-- a fazenda usa o Estoque de gado?
create or replace function public.estoque_gado_usado(p_faz uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from estoque_fiscal_lanc where fazenda_id = p_faz);
$$;

-- quantidades por faixa ("M13", "F0"...) dos animais de uma movimentação, pela idade na data dela
create or replace function public.mov_chaves_faixa(p_mov uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
    select trim(f.sexo) || f.de::text as k, count(*)::int as n
      from movimentacao_itens i
      join movimentacoes m on m.id = i.movimentacao_id
      join animais a on a.id = i.animal_id
      join faixas_idade f on trim(f.sexo) = trim(a.sexo)
       and public.idade_meses(a.data_nascimento, m.data) >= f.de
       and (f.ate is null or public.idade_meses(a.data_nascimento, m.data) <= f.ate)
     where i.movimentacao_id = p_mov and a.data_nascimento is not null
     group by 1) x;
$$;

-- confere o saldo e lança a saída da venda no Estoque de gado
create or replace function public.estoque_gado_baixar_venda(p_faz uuid, p_data date, p_mov uuid, p_q jsonb, p_com_gta boolean, p_nf text, p_gta text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare k record; v_tem int; v_rot text; v_neg jsonb;
begin
  if not public.estoque_gado_usado(p_faz) then return; end if;
  if p_q is null or p_q = '{}'::jsonb then return; end if;
  for k in select key, (value #>> '{}')::int as q from jsonb_each(p_q) loop
    select case when p_com_gta then least(e.saldo_gta, e.saldo) else e.saldo end into v_tem from public.estoque_fiscal_gado(p_faz, p_data) e where e.chave = k.key;
    if k.q > coalesce(v_tem, 0) then
      select rotulo into v_rot from faixas_idade where trim(sexo) || de::text = k.key;
      raise exception 'No Estoque de gado desta fazenda há % % de % (%), e a venda é de %.',
        greatest(coalesce(v_tem, 0), 0), case when left(k.key, 1) = 'M' then 'machos' else 'fêmeas' end, coalesce(v_rot, k.key),
        case when p_com_gta then 'com GTA, porque a venda tem NF e GTA' else 'estoque total' end, k.q;
    end if;
  end loop;
  select jsonb_object_agg(key, -((value #>> '{}')::int)) into v_neg from jsonb_each(p_q);
  insert into estoque_fiscal_lanc (fazenda_id, data, tipo, quantidades, quantidades_gta, nf_numero, gta_numero, movimentacao_id, observacoes, created_by)
  values (p_faz, p_data, 'movimentacao', v_neg, case when p_com_gta then v_neg else '{}'::jsonb end,
          nullif(trim(p_nf), ''), nullif(trim(p_gta), ''), p_mov, 'Venda', auth.uid());
end $$;
revoke execute on function public.estoque_gado_baixar_venda(uuid, date, uuid, jsonb, boolean, text, text) from public, anon, authenticated;

-- saldo: a GTA ligada a uma venda que já baixou no Estoque de gado não baixa de novo
--   (a venda já tirou do Total; se ela já tirou também do Com GTA, a GTA não mexe em nada)
create or replace function public.estoque_fiscal_gado(p_fazenda uuid, p_data date default current_date)
returns table(chave text, sexo text, faixa integer, saldo integer, entradas integer, saidas integer, saldo_gta integer, diferenca integer)
language sql stable security definer set search_path to 'public' as $function$
  with mov as (
    select k.key as chave, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int as q, 0 as qg
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k
     where l.fazenda_id = p_fazenda and l.data <= p_data
    union all
    select k.key, 0, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades_gta) k
     where l.fazenda_id = p_fazenda and l.data <= p_data and l.quantidades_gta is not null
    union all
    -- movimentação com GTA (sem a parte com GTA separada): tudo com GTA
    select k.key, 0, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k
     where l.fazenda_id = p_fazenda and l.data <= p_data and l.quantidades_gta is null and l.gta_numero is not null
    union all
    select k.key, case when v.ja_total then 0 else s.v end, case when v.ja_gta then 0 else s.v end
      from gtas g
      cross join lateral (
        select exists (select 1 from estoque_fiscal_lanc l where l.fazenda_id = g.fazenda_id and l.movimentacao_id is not null
                         and (l.movimentacao_id = g.movimentacao_id or l.movimentacao_id in (select id from movimentacoes where g.venda_id is not null and venda_id = g.venda_id))) as ja_total,
               exists (select 1 from estoque_fiscal_lanc l where l.fazenda_id = g.fazenda_id and l.movimentacao_id is not null
                         and coalesce(l.quantidades_gta, '{}'::jsonb) <> '{}'::jsonb
                         and (l.movimentacao_id = g.movimentacao_id or l.movimentacao_id in (select id from movimentacoes where g.venda_id is not null and venda_id = g.venda_id))) as ja_gta
      ) v,
      jsonb_each(g.quantidades) k,
      lateral (select (case when g.direcao = 'entrada' then 1 else -1 end) * coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int as v) s
     where g.fazenda_id = p_fazenda and g.situacao = 'emitida' and coalesce(g.emissao, g.created_at::date) <= p_data
  ),
  linhas(chave) as (values ('M0'), ('F0'), ('F3'), ('F9'), ('M13'), ('F13'), ('M25'), ('F25'), ('M37'), ('F37'))
  select l.chave, left(l.chave, 1), substr(l.chave, 2)::int,
         coalesce(sum(m.q), 0)::int,
         coalesce(sum(m.q) filter (where m.q > 0), 0)::int,
         coalesce(-sum(m.q) filter (where m.q < 0), 0)::int,
         coalesce(sum(m.qg), 0)::int,
         (coalesce(sum(m.q), 0) - coalesce(sum(m.qg), 0))::int
    from linhas l
    left join mov m on m.chave = l.chave
   where public.acesso_fazenda(p_fazenda)
   group by l.chave
   order by substr(l.chave, 2)::int, left(l.chave, 1) desc;
$function$;
grant execute on function public.estoque_fiscal_gado(uuid, date) to authenticated;

-- salvar_venda: confere e baixa no Estoque de gado (troca só os trechos da baixa do gado)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure);
  n := d;
  n := replace(n, 'v_q numeric; v_cl record;', 'v_q numeric; v_cl record; v_com_gta boolean; v_chave text; v_reb int; v_qf int; v_mid uuid;');
  n := replace(n, E'  if v_tipo = ''animais'' then\n    v_forma := a->>''forma_preco'';',
    E'  -- V191: com NF e GTA informadas, a venda sai do estoque Com GTA; sem elas, só do Total\n  v_com_gta := nullif(trim(p->>''numero_documento''), '''') is not null and nullif(trim(p->>''gta_numero''), '''') is not null;\n  if v_tipo = ''animais'' then\n    v_forma := a->>''forma_preco'';');
  n := replace(n, E'    else\n    v_mov := public.lancar_movimentacao(json_build_object(',
    E'    else\n'
    '    v_qf := coalesce(nullif(a->>''quantidade'','''')::int, 0);\n'
    '    if nullif(a->>''lote_origem'','''') is null and nullif(a->>''pesagem'','''') is null and jsonb_array_length(coalesce(a->''animais'',''[]''::jsonb)) = 0\n'
    '       and nullif(a->>''sexo'','''') is not null and nullif(a->>''idade_de'','''') is not null and public.estoque_gado_usado(v_faz) then\n'
    '      -- V191: por sexo e faixa, a venda olha o Estoque de gado; os animais do rebanho só saem se estiverem lá\n'
    '      if v_qf < 1 then raise exception ''Informe a quantidade de cabeças.''; end if;\n'
    '      v_chave := upper(trim(a->>''sexo'')) || ((a->>''idade_de'')::int)::text;\n'
    '      select count(*) into v_reb from animais where fazenda_id = v_faz and situacao = ''ativo'' and sexo = upper(trim(a->>''sexo'')) and data_nascimento is not null\n'
    '         and public.idade_meses(data_nascimento, v_data) >= (a->>''idade_de'')::int and public.idade_meses(data_nascimento, v_data) <= coalesce(nullif(a->>''idade_ate'','''')::int, 99999);\n'
    '      if v_reb < v_qf then\n'
    '        insert into movimentacoes (fazenda_id, data, tipo, pessoa_id, documento, observacoes)\n'
    '          values (v_faz, v_data, ''venda'', nullif(p->>''pessoa_id'','''')::uuid, nullif(trim(p->>''numero_documento''),''''), nullif(trim(p->>''observacoes''),''''))\n'
    '          returning id into v_mid;\n'
    '        insert into movimentacao_itens (fazenda_id, movimentacao_id, animal_id, quantidade, sexo, peso_kg)\n'
    '          values (v_faz, v_mid, null, v_qf, upper(trim(a->>''sexo'')), case when v_bruto_kg is not null then round(v_bruto_kg / v_qf, 2) end);\n'
    '        perform public.estoque_gado_baixar_venda(v_faz, v_data, v_mid, jsonb_build_object(v_chave, v_qf), v_com_gta, p->>''numero_documento'', p->>''gta_numero'');\n'
    '        v_mov := json_build_object(''id'', v_mid, ''cabecas'', v_qf);\n'
    '      end if;\n'
    '    end if;\n'
    '    if v_mov is null then\n'
    '    v_mov := public.lancar_movimentacao(json_build_object(');
  n := replace(n, E'''pesagem'', a->>''pesagem''));\n    v_mov_id := (v_mov->>''id'')::uuid;',
    E'''pesagem'', a->>''pesagem''));\n    end if;\n    v_mov_id := (v_mov->>''id'')::uuid;');
  n := replace(n, E'    v_bt := nullif(a->>''barriga_tipo'','''');',
    E'    -- V191: a saída também baixa no Estoque de gado (por lote, pesagem ou animais: pela idade dos animais)\n'
    '    for v_mid in select unnest(v_mov_ids) loop\n'
    '      if not exists (select 1 from estoque_fiscal_lanc where movimentacao_id = v_mid) then\n'
    '        perform public.estoque_gado_baixar_venda(v_faz, v_data, v_mid, public.mov_chaves_faixa(v_mid), v_com_gta, p->>''numero_documento'', p->>''gta_numero'');\n'
    '      end if;\n'
    '    end loop;\n'
    '    v_bt := nullif(a->>''barriga_tipo'','''');');
  if position('V191: por sexo e faixa' in n) = 0 or position('V191: a saída também' in n) = 0 or position('v_com_gta boolean' in n) = 0
     or position(E'a->>''pesagem''));\n    end if;' in n) = 0 or position('v_com_gta := ' in n) = 0 then
    raise exception 'salvar_venda: algum trecho não foi encontrado (nada alterado).';
  end if;
  execute n;
end $$;
