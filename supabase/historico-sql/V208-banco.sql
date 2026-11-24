-- Fazenda Digital V208 · banco (pode rodar mais de uma vez; não apaga dados)
-- Entrada por parceria sem lote (o lote é informado depois, em Pecuário › Parcerias)

-- 1) lancar_movimentacao: a entrada por parceria aceita ficar sem lote
do $$
declare d text := pg_get_functiondef('public.lancar_movimentacao(json)'::regprocedure); n text;
begin
  if position('V208' in d) > 0 then return; end if;
  n := replace(d,
    E'    if v_dest is null then raise exception ''Escolha o lote de destino.''; end if;\n    select sexo into v_lote_sexo from lotes where id = v_dest and fazenda_id = v_faz and situacao = ''ativo'';\n    if not found then raise exception ''Lote de destino não encontrado ou encerrado.''; end if;',
    E'    -- V208: a entrada por parceria pode ficar sem lote (o lote é informado depois)\n'
    || E'    if v_dest is null and v_tipo <> ''entrada_parceria'' then raise exception ''Escolha o lote de destino.''; end if;\n'
    || E'    if v_dest is not null then\n'
    || E'      select sexo into v_lote_sexo from lotes where id = v_dest and fazenda_id = v_faz and situacao = ''ativo'';\n'
    || E'      if not found then raise exception ''Lote de destino não encontrado ou encerrado.''; end if;\n'
    || E'    end if;');
  if n = d then raise exception 'lancar_movimentacao: trecho não encontrado'; end if;
  execute n;
end $$;

-- 2) Entrada com itens: lote opcional em cada item
do $$
declare d text := pg_get_functiondef('public.lancar_entrada_parceria_itens(jsonb)'::regprocedure); n text;
begin
  if position('V208' in d) > 0 then return; end if;
  n := replace(d,
    E'    if coalesce(nullif(it->>''lote'', '''')::int, 0) < 1 then raise exception ''Item %: informe o nº do lote.'', k; end if;\n    v_lote := lote_pelo_numero(',
    E'    -- V208: sem lote, os animais ficam sem lote até ele ser informado em Pecuário › Parcerias\n'
    || E'    v_lote := null; v_lote_id := null;\n'
    || E'    if coalesce(nullif(it->>''lote'', '''')::int, 0) > 0 then\n'
    || E'    v_lote := lote_pelo_numero(');
  n := replace(n,
    E'    v_lote_id := (v_lote->>''id'')::uuid;\n',
    E'    v_lote_id := (v_lote->>''id'')::uuid;\n    end if;\n');
  n := replace(n,
    E'    if not v_lote_id = any (v_lotes) then v_lotes := v_lotes || v_lote_id; end if;',
    E'    if v_lote_id is not null and not v_lote_id = any (v_lotes) then v_lotes := v_lotes || v_lote_id; end if;');
  if position('V208' in n) = 0 or position('v_lote_id is not null and not' in n) = 0 then raise exception 'lancar_entrada_parceria_itens: trecho não encontrado'; end if;
  execute n;
end $$;

-- 3) Pôr no lote, depois, os animais de um item da entrada que ficaram sem lote
create or replace function public.parceria_por_no_lote(p_mov uuid, p_lote integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare m movimentacoes%rowtype; a animais%rowtype; v_lote json; v_id uuid; v_n int; v_ids uuid[];
begin
  select * into m from movimentacoes where id = p_mov;
  if not found then raise exception 'Movimentação não encontrada.'; end if;
  if not acesso_fazenda(m.fazenda_id) then raise exception 'Você não tem acesso a esta fazenda.'; end if;
  if m.tipo <> 'entrada_parceria' then raise exception 'Só a entrada por parceria recebe o lote por aqui.'; end if;
  if coalesce(p_lote, 0) < 1 then raise exception 'Informe o nº do lote.'; end if;
  v_ids := array(select an.id from movimentacao_itens i join animais an on an.id = i.animal_id
                  where i.movimentacao_id = p_mov and an.situacao = 'ativo' and an.lote_id is null);
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Os animais deste item já estão em lote (ou já saíram).'; end if;
  select * into a from animais where id = v_ids[1];
  v_lote := lote_pelo_numero(m.fazenda_id, p_lote, trim(a.sexo), a.categoria, a.raca_id, a.ferro_id, a.data_nascimento, coalesce(a.nascimento_aproximado, true), m.data);
  v_id := (v_lote->>'id')::uuid;
  update animais set lote_id = v_id, lote_original_id = coalesce(lote_original_id, v_id) where id = any (v_ids);
  get diagnostics v_n = row_count;
  update movimentacoes set lote_destino_id = v_id where id = p_mov and lote_destino_id is null;
  update movimentacao_itens set lote_original_id = v_id where movimentacao_id = p_mov and lote_original_id is null;
  if m.parceria_id is not null then
    update parcerias set lote_id = coalesce(lote_id, v_id) where id = m.parceria_id;
    -- lote só com animais de parceria: passa a ser do parceiro
    if not exists (select 1 from animais x where x.lote_id = v_id and x.situacao = 'ativo'
                    and x.id not in (select i.animal_id from movimentacao_itens i join movimentacoes mm on mm.id = i.movimentacao_id
                                      where mm.parceria_id = m.parceria_id and mm.tipo = 'entrada_parceria')) then
      update lotes l set proprietario = 'terceiro', pessoa_terceiro_id = p.pessoa_id, origem = 'parceria',
        origem_parceria = case p.modalidade when 'apascentamento' then 'apascentamento' else 'engorda' end
        from parcerias p where p.id = m.parceria_id and l.id = v_id;
    end if;
  end if;
  return json_build_object('lote', (v_lote->>'numero')::int, 'novo', (v_lote->>'novo')::boolean, 'cabecas', v_n);
end $$;

select 'V208 ok | parceria sem lote: ' || exists(select 1 from pg_proc where proname = 'parceria_por_no_lote') as conferencia;
