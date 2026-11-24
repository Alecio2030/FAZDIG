-- Fazenda Digital V187 – Modo Vaqueiro: Trato do dia (dieta e leitura de cocho), sal no cocho com baixa do estoque e chuva
-- (rodado direto no Supabase; guardado aqui só como registro)

alter table public.campo_registros drop constraint if exists campo_registros_tipo_check;
alter table public.campo_registros add constraint campo_registros_tipo_check
  check (tipo in ('contagem', 'vistoria', 'tarefa_feita', 'sanidade', 'nascimento', 'morte', 'sumido', 'achado', 'cio', 'pesagem', 'transferencia', 'trato', 'chuva'));
alter table public.fornecimentos add column if not exists leitura_cocho text;
alter table public.estoque_movimentos add column if not exists campo_registro_id uuid references public.campo_registros(id) on delete set null;

-- Pacote: também as dietas (trato do dia de cada lote), o sal mineral com saldo e os pluviômetros
create or replace function public.campo_pacote(p_fazenda uuid)
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare v json;
begin
  if not acesso_fazenda(p_fazenda) then raise exception 'Você não tem acesso a esta fazenda.'; end if;
  begin
    perform gerar_fornecimentos(p_fazenda);    -- o trato de hoje já sai pronto (como no Trato do dia)
  exception when others then null;
  end;
  select json_build_object(
    'gerado_em', now(),
    'fazenda', (select json_build_object('id', f.id, 'nome', f.nome) from fazendas f where f.id = p_fazenda),
    'mangas', coalesce((select json_agg(json_build_object('id', a.id, 'nome', a.nome, 'capim', a.capim_cultura, 'area_ha', a.area_ha) order by a.nome)
                          from areas a where a.fazenda_id = p_fazenda and a.tipo = 'manga' and coalesce(a.ativa, true)), '[]'),
    'lotes', coalesce((select json_agg(x order by x.numero) from (
        select l.id, l.numero, l.descricao, l.sexo, l.categoria, l.manga_id, m.nome as manga, r.nome as raca, fe.descricao as ferro,
               l.proprietario, (select p.nome from pessoas p where p.id = l.pessoa_terceiro_id) as dono_terceiro,
               (select count(*) from animais an where an.lote_id = l.id and an.situacao = 'ativo')::int as cabecas,
               (select count(*) from animais an where an.lote_id = l.id and an.situacao = 'ativo' and an.sexo = 'M')::int as machos,
               (select count(*) from animais an where an.lote_id = l.id and an.situacao = 'ativo' and an.sexo = 'F')::int as femeas
          from lotes l left join areas m on m.id = l.manga_id left join racas r on r.id = l.raca_id left join ferros fe on fe.id = l.ferro_id
         where l.fazenda_id = p_fazenda and l.situacao = 'ativo') x), '[]'),
    'animais', coalesce((select json_agg(json_build_object(
          'id', an.id, 'n', an.numero_interno, 'brinco', an.brinco, 'nome', an.nome, 'registro', an.registro, 'sexo', an.sexo,
          'raca', r.nome, 'ferro', fe.descricao, 'lote_id', an.lote_id, 'nasc', an.data_nascimento, 'nasc_aprox', an.nascimento_aproximado,
          'peso', an.peso_atual_kg, 'peso_data', an.peso_atual_data, 'categoria', an.categoria) order by an.numero_interno)
        from animais an left join racas r on r.id = an.raca_id left join ferros fe on fe.id = an.ferro_id
       where an.fazenda_id = p_fazenda and an.situacao = 'ativo'), '[]'),
    'medicamentos', coalesce((select json_agg(json_build_object(
          'id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'dose', i.dose_recomendada, 'dose_por', i.dose_por, 'cada_kg', i.dose_cada_kg,
          'unidade_dose', coalesce(i.unidade_dose, i.unidade), 'unidade', i.unidade, 'conteudo', i.conteudo_por_unidade,
          'via', i.via_aplicacao, 'serve', i.indicacoes, 'carencia_carne', i.carencia_carne_dias, 'carencia_leite', i.carencia_leite_dias,
          'saldo', saldo_insumo(p_fazenda, i.id)) order by i.nome)
        from insumos i where i.ativo and i.categoria in ('vacina', 'medicamento') and i.dose_recomendada is not null
         and (i.dose_por is distinct from 'kg' or i.dose_cada_kg is not null)), '[]'),
    -- V187: sal mineral (para a baixa do sal posto no cocho)
    'sais', coalesce((select json_agg(json_build_object('id', i.id, 'nome', i.nome, 'unidade', i.unidade, 'saldo', saldo_insumo(p_fazenda, i.id)) order by i.nome)
        from insumos i where i.ativo and i.categoria = 'sal_mineral'), '[]'),
    -- V187: dieta vigente de cada lote com trato automático (kg por cabeça de cada alimento) e o trato de hoje
    'dietas', coalesce((select json_agg(x) from (
        select l.id as lote_id, dt.id as dieta_id, dt.numero, dt.descricao, coalesce(dt.tratos_dia, 1) as tratos_dia,
               (select json_agg(json_build_object('alimento_id', di.alimento_id, 'nome', di.nome, 'kg_cab', di.kg_mn) order by di.ordem)
                  from dieta_itens di where di.dieta_id = dt.id and di.kg_mn > 0) as itens,
               (select json_build_object('id', f.id, 'data', f.data, 'situacao', f.situacao, 'cabecas', f.cabecas, 'leitura', f.leitura_cocho)
                  from fornecimentos f where f.lote_id = l.id and f.data = current_date) as hoje
          from lotes l join dietas dt on dt.id = dieta_vigente(l.id, current_date)
         where l.fazenda_id = p_fazenda and l.situacao = 'ativo' and dt.fornecimento_auto) x), '[]'),
    'pluviometros', coalesce((select json_agg(distinct coalesce(c.local, '')) from chuvas c where c.fazenda_id = p_fazenda and c.data >= current_date - 365), '[]'),
    'tarefas', coalesce((select json_agg(json_build_object('id', i.id, 'data', i.data, 'titulo', i.titulo, 'obs', i.observacao, 'autor', i.autor_nome) order by i.data)
        from agenda_itens i where i.agenda = 'fazenda' and i.fazenda_id = p_fazenda and i.feito_em is null and agenda_acesso('fazenda', p_fazenda)), '[]'),
    'pendentes', coalesce((select count(*) from campo_registros c where c.fazenda_id = p_fazenda and c.autor = auth.uid() and c.situacao = 'pendente'), 0)
  ) into v;
  return v;
end $$;

-- campo_enviar: recebe também o trato e a chuva
do $$
declare d text;
begin
  d := pg_get_functiondef('public.campo_enviar(jsonb)'::regprocedure);
  if position('''trato''' in d) = 0 then
    d := replace(d, $q$      else
        raise exception 'Tipo de lançamento do campo inválido.';$q$, $q$      elsif v_tipo = 'trato' then
        select l.id, l.numero into v_lote from lotes l where l.id = nullif(d->>'lote_id', '')::uuid and l.fazenda_id = v_faz;
        if v_lote.id is null then raise exception 'Lote do trato não encontrado.'; end if;
        d := d || jsonb_build_object('lote_numero', v_lote.numero);
        v_resumo := 'Trato do lote ' || v_lote.numero || ' em ' || to_char(coalesce(nullif(d->>'data', '')::date, v_dia), 'DD/MM') || ': ' ||
                    case when d->>'sem_trato' = 'true' then 'não tratou' when d->>'igual' = 'true' then 'servido como previsto' else 'servido diferente do previsto' end ||
                    coalesce(' · cocho: ' || nullif(d->>'leitura', ''), '');
        if d->>'sem_trato' = 'true' or d->>'leitura' in ('Muita sobra', 'Não comeu') then
          v_aviso := 'Trato do lote ' || v_lote.numero || ': ' || case when d->>'sem_trato' = 'true' then 'não tratou' else 'cocho com ' || lower(d->>'leitura') end;
        end if;

      elsif v_tipo = 'chuva' then
        if nullif(d->>'mm', '') is null or (d->>'mm')::numeric < 0 or (d->>'mm')::numeric > 500 then raise exception 'Milímetros da chuva inválidos.'; end if;
        v_resumo := 'Chuva de ' || to_char(coalesce(nullif(d->>'data', '')::date, v_dia), 'DD/MM') || ': ' ||
                    translate(to_char((d->>'mm')::numeric, 'FM990.0'), '.', ',') || ' mm' || coalesce(' (' || nullif(trim(d->>'local'), '') || ')', '');
      else
        raise exception 'Tipo de lançamento do campo inválido.';$q$);
    if position('''trato''' in d) = 0 then raise exception 'campo_enviar: texto não encontrado'; end if;
    execute d;
  end if;
end $$;

-- campo_aplicar: ao confirmar, corrige o trato (o que foi servido e a leitura de cocho), grava a chuva e baixa o sal do cocho
do $$
declare d text;
begin
  d := pg_get_functiondef('public.campo_aplicar(campo_registros)'::regprocedure);
  if position('''trato''' in d) = 0 then
    d := replace(d, $q$  return null;
end $q$, $q$  if c.tipo = 'trato' then
    perform gerar_fornecimentos(c.fazenda_id);
    select * into v_lote from fornecimentos where lote_id = (d->>'lote_id')::uuid and data = coalesce(nullif(d->>'data', '')::date, v_dia);
    if v_lote.id is null then raise exception 'Não há trato automático deste lote nesse dia (o lote está sem dieta com fornecimento automático).'; end if;
    if d->>'sem_trato' = 'true' or d->>'igual' is distinct from 'true' then
      perform corrigir_fornecimento(jsonb_build_object('id', v_lote.id, 'sem_trato', d->>'sem_trato' = 'true',
        'obs', concat_ws('. ', nullif(trim(d->>'obs'), ''), 'Vaqueiro: ' || c.autor_nome),
        'itens', coalesce((select jsonb_agg(jsonb_build_object('id', fi.id, 'kg_servido', coalesce((x->>'kg')::numeric, fi.kg_servido)))
                             from fornecimento_itens fi
                             left join lateral (select y from jsonb_array_elements(coalesce(d->'itens', '[]')) y
                                                 where (y->>'alimento_id') = fi.alimento_id::text limit 1) z(x) on true
                            where fi.fornecimento_id = v_lote.id), '[]'::jsonb)));
    end if;
    update fornecimentos set leitura_cocho = nullif(d->>'leitura', ''),
           observacoes = case when d->>'igual' = 'true' and d->>'sem_trato' is distinct from 'true' and nullif(trim(d->>'obs'), '') is not null
                              then concat_ws('. ', observacoes, trim(d->>'obs')) else observacoes end
     where id = v_lote.id;
    return v_lote.id;

  elsif c.tipo = 'chuva' then
    insert into chuvas (fazenda_id, data, mm, local, observacoes, created_by)
    values (c.fazenda_id, coalesce(nullif(d->>'data', '')::date, v_dia), round((d->>'mm')::numeric, 1), coalesce(trim(d->>'local'), ''),
            concat_ws('. ', nullif(trim(d->>'obs'), ''), 'Vaqueiro: ' || c.autor_nome), c.autor)
    on conflict (fazenda_id, data, local) do update set mm = excluded.mm, observacoes = excluded.observacoes
    returning id into v_mov;
    return v_mov;

  elsif c.tipo = 'vistoria' and nullif(d->>'sal_insumo_id', '') is not null and coalesce(nullif(d->>'sal_qtd', '')::numeric, 0) > 0 then
    insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, valor_unitario, observacoes, campo_registro_id)
    values (c.fazenda_id, (d->>'sal_insumo_id')::uuid, v_dia, 'saida', (d->>'sal_qtd')::numeric,
            coalesce(custo_medio_insumo((d->>'sal_insumo_id')::uuid, c.fazenda_id, v_dia), 0),
            'Sal no cocho – manga ' || coalesce(d->>'manga', '') || ' (vaqueiro: ' || c.autor_nome || ')', c.id)
    returning id into v_mov;
    return v_mov;
  end if;
  return null;
end $q$);
    if position('''trato''' in d) = 0 then raise exception 'campo_aplicar: texto não encontrado'; end if;
    execute d;
  end if;
end $$;
revoke execute on function public.campo_aplicar(campo_registros) from public, anon, authenticated;
