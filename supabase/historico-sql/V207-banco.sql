-- Fazenda Digital V207 · banco (pode rodar mais de uma vez; não apaga dados)
-- Entrada por parceria com vários itens (sexo, idade, raça, ferro, lote e peso por item), numa parceria só.

-- 1) Entrada com itens: cada item entra no seu lote (o lote digitado que não existe é cadastrado); uma parceria para todos
create or replace function public.lancar_entrada_parceria_itens(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare m jsonb := p->'mov'; c jsonb := coalesce(p->'parceria', '{}'::jsonb); it jsonb; k int := 0;
  v_faz uuid := (m->>'fazenda')::uuid; v_data date := coalesce((m->>'data')::date, current_date);
  v_mod text := c->>'modalidade'; v_prev date := nullif(c->>'data_prevista', '')::date;
  v_preco numeric := nullif(c->>'preco_cab_mes', '')::numeric; v_pf numeric := nullif(c->>'perc_fazenda', '')::numeric;
  v_pp numeric := nullif(c->>'perc_parceiro', '')::numeric; v_kg numeric := coalesce(nullif(c->>'kg_arroba', '')::numeric, 30);
  v_lote json; v_lote_id uuid; v_mov json; v_movs uuid[] := '{}'; v_lotes uuid[] := '{}'; v_res jsonb := '[]';
  v_cab int := 0; v_peso numeric := 0; v_sem_peso boolean := false; v_pi numeric; v_id uuid; v_num int; v_g json; v_l uuid;
begin
  if v_faz is null or not acesso_fazenda(v_faz) then raise exception 'Você não tem acesso a esta fazenda.'; end if;
  if nullif(m->>'pessoa', '') is null then raise exception 'Informe o parceiro (dono dos animais).'; end if;
  if jsonb_array_length(coalesce(p->'itens', '[]')) = 0 then raise exception 'Informe pelo menos um item.'; end if;
  if v_data > current_date then raise exception 'A data não pode ser futura.'; end if;
  if coalesce(v_mod, '') not in ('apascentamento', 'rendimento') then raise exception 'Escolha a condição da parceria: apascentamento ou rendimento.'; end if;
  if v_prev is not null and v_prev <= v_data then raise exception 'A data prevista para sair precisa ser depois da entrada.'; end if;
  if v_mod = 'apascentamento' then
    if v_prev is null then raise exception 'Informe a data prevista para sair (o contas a receber vai até ela).'; end if;
    if coalesce(v_preco, 0) <= 0 then raise exception 'Informe o preço por cabeça por mês.'; end if;
    v_pf := null; v_pp := null;
  else
    if v_pf is null or v_pp is null or abs(v_pf + v_pp - 100) > 0.001 then raise exception 'As participações da fazenda e do parceiro precisam somar 100%%.'; end if;
    if v_kg <= 0 then raise exception 'Informe os kg da arroba.'; end if;
    v_preco := null;
  end if;

  for it in select * from jsonb_array_elements(p->'itens') loop
    k := k + 1;
    v_pi := nullif(it->>'peso_total', '')::numeric;
    if v_mod = 'rendimento' and coalesce(v_pi, 0) <= 0 then raise exception 'Item %: na parceria por rendimento, informe o peso (kg): o ganho é calculado a partir dele.', k; end if;
    if coalesce(nullif(it->>'lote', '')::int, 0) < 1 then raise exception 'Item %: informe o nº do lote.', k; end if;
    v_lote := lote_pelo_numero(v_faz, (it->>'lote')::int, nullif(it->>'sexo', ''), nullif(it->>'categoria', ''), nullif(it->>'raca', '')::uuid,
                nullif(it->>'ferro', '')::uuid, nullif(it->>'nascimento', '')::date, coalesce((it->>'nasc_aprox')::boolean, true), v_data);
    v_lote_id := (v_lote->>'id')::uuid;
    v_mov := lancar_movimentacao(json_build_object('tipo', 'entrada_parceria', 'fazenda', v_faz, 'data', v_data, 'lote_destino', v_lote_id,
      'quantidade', it->>'quantidade', 'peso_total', v_pi, 'sexo', nullif(it->>'sexo', ''), 'categoria', nullif(it->>'categoria', ''),
      'raca', nullif(it->>'raca', ''), 'ferro', nullif(it->>'ferro', ''), 'nascimento', nullif(it->>'nascimento', ''),
      'nasc_aprox', coalesce((it->>'nasc_aprox')::boolean, true), 'pessoa', m->>'pessoa', 'documento', m->>'documento', 'obs', m->>'obs'));
    v_movs := v_movs || (v_mov->>'id')::uuid;
    if not v_lote_id = any (v_lotes) then v_lotes := v_lotes || v_lote_id; end if;
    v_cab := v_cab + (v_mov->>'cabecas')::int;
    if v_pi is null then v_sem_peso := true; else v_peso := v_peso + v_pi; end if;
    v_res := v_res || jsonb_build_object('mov', v_mov->>'id', 'cabecas', (v_mov->>'cabecas')::int, 'de', (v_mov->>'de')::int, 'ate', (v_mov->>'ate')::int,
      'lote', (v_lote->>'numero')::int, 'lote_novo', (v_lote->>'novo')::boolean);
  end loop;

  select coalesce(max(numero), 0) + 1 into v_num from parcerias where fazenda_id = v_faz;
  insert into parcerias (fazenda_id, numero, mov_entrada_id, lote_id, pessoa_id, modalidade, data_entrada, data_prevista, preco_cab_mes,
    cabecas_entrada, peso_entrada_kg, kg_arroba, perc_fazenda, perc_parceiro, observacoes, venda_id)
  values (v_faz, v_num, v_movs[1], v_lotes[1], (m->>'pessoa')::uuid, v_mod, v_data, v_prev, v_preco, v_cab,
    case when v_sem_peso then null else v_peso end, v_kg, v_pf, v_pp, nullif(trim(m->>'obs'), ''),
    (select id from vendas where id = nullif(c->>'venda_id', '')::uuid and fazenda_id = v_faz))
  returning id into v_id;
  update movimentacoes set parceria_id = v_id where id = any (v_movs);

  -- lote só com os animais desta parceria: passa a ser do parceiro
  foreach v_l in array v_lotes loop
    if not exists (select 1 from animais a where a.lote_id = v_l and a.situacao = 'ativo'
                    and a.id not in (select animal_id from movimentacao_itens where movimentacao_id = any (v_movs))) then
      update lotes set proprietario = 'terceiro', pessoa_terceiro_id = (m->>'pessoa')::uuid, origem = 'parceria',
        origem_parceria = case v_mod when 'apascentamento' then 'apascentamento' else 'engorda' end
       where id = v_l;
    end if;
  end loop;

  v_g := parceria_gerar(v_id);
  return json_build_object('ids', to_json(v_movs), 'id', v_movs[1], 'cabecas', v_cab, 'itens', v_res, 'parceria', v_num,
    'titulos', (v_g->>'titulos')::int, 'total', (v_g->>'total')::numeric);
end $$;

-- 2) A saída acha a parceria por qualquer um dos lotes dela
create or replace function public.parceria_aberta_do_lote(p_lote uuid)
returns uuid language sql stable set search_path to 'public' as $$
  select p.id from parcerias p
   where p.situacao = 'aberta'
     and (p.lote_id = p_lote or exists (select 1 from movimentacoes m where m.parceria_id = p.id and m.tipo = 'entrada_parceria' and m.lote_destino_id = p_lote))
   order by p.data_entrada desc limit 1;
$$;

-- 3) Rendimento na saída: peso de entrada de cada animal, em qualquer item da entrada
do $$
declare d text := pg_get_functiondef('public.lancar_saida_parceria(jsonb)'::regprocedure); n text;
begin
  if position('V207' in d) > 0 then return; end if;
  n := replace(d, 'i.movimentacao_id = r.mov_entrada_id',
    'i.movimentacao_id in (select mm.id from movimentacoes mm where (mm.parceria_id = r.id and mm.tipo = ''entrada_parceria'') or mm.id = r.mov_entrada_id) /* V207 */');
  if n = d then raise exception 'lancar_saida_parceria: trecho não encontrado'; end if;
  execute n;
end $$;

-- 4) Excluir um item da entrada: a parceria continua com os outros itens
do $$
declare d text := pg_get_functiondef('public.excluir_movimentacao(uuid)'::regprocedure); n text;
begin
  if position('V207' in d) > 0 then return; end if;
  n := replace(d,
    E'    select id into v_par from parcerias where mov_entrada_id = p_id;\n    if v_par is not null then\n',
    E'    select id into v_par from parcerias where mov_entrada_id = p_id or id = m.parceria_id limit 1;\n'
    || E'    -- V207: parceria com vários itens: sai só este item; a parceria continua com os outros\n'
    || E'    if v_par is not null and exists (select 1 from movimentacoes where parceria_id = v_par and tipo = ''entrada_parceria'' and id <> p_id) then\n'
    || E'      if exists (select 1 from movimentacoes where parceria_id = v_par and tipo <> ''entrada_parceria'') then\n'
    || E'        raise exception ''Esta parceria já tem saída lançada: exclua primeiro as saídas.'';\n'
    || E'      end if;\n'
    || E'      update parcerias set mov_entrada_id = (select id from movimentacoes where parceria_id = v_par and tipo = ''entrada_parceria'' and id <> p_id order by created_at limit 1)\n'
    || E'       where id = v_par and mov_entrada_id = p_id;\n'
    || E'      v_r := excluir_movimentacao_base(p_id);\n'
    || E'      update parcerias pr set\n'
    || E'        cabecas_entrada = (select count(*) from movimentacao_itens i join movimentacoes mm on mm.id = i.movimentacao_id where mm.parceria_id = v_par and mm.tipo = ''entrada_parceria''),\n'
    || E'        peso_entrada_kg = (select sum(i.peso_kg) from movimentacao_itens i join movimentacoes mm on mm.id = i.movimentacao_id where mm.parceria_id = v_par and mm.tipo = ''entrada_parceria''),\n'
    || E'        lote_id = (select lote_destino_id from movimentacoes where id = pr.mov_entrada_id)\n'
    || E'       where id = v_par;\n'
    || E'      perform parceria_gerar(v_par);\n'
    || E'      return v_r;\n'
    || E'    end if;\n'
    || E'    if v_par is not null then\n');
  if n = d then raise exception 'excluir_movimentacao: trecho não encontrado'; end if;
  execute n;
end $$;

select 'V207 ok | entrada da parceria com itens: ' || exists(select 1 from pg_proc where proname = 'lancar_entrada_parceria_itens') as conferencia;
