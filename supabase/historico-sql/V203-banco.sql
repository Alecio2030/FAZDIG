-- V203 · Venda de gado por itens, NF-e de várias vendas, estoque Com GTA baixado pela NF
-- Parte 1: estrutura e funções de apoio

-- itens da venda de gado: cada item com os seus dados e o seu preço
alter table venda_itens
  add column if not exists ordem int,
  add column if not exists movimentacao_id uuid references movimentacoes(id) on delete set null,
  add column if not exists pesagem_id uuid references pesagens(id) on delete set null,
  add column if not exists sexo char(1),
  add column if not exists idade_de int,
  add column if not exists idade_ate int,
  add column if not exists raca_id uuid references racas(id),
  add column if not exists ferro_id uuid references ferros(id),
  add column if not exists cabecas int,
  add column if not exists peso_liquido_kg numeric,
  add column if not exists barriga_tipo text,
  add column if not exists barriga_valor numeric,
  add column if not exists kg_arroba numeric,
  add column if not exists arrobas numeric,
  add column if not exists forma_preco text;

-- o gado vendido fica na fazenda (vira estoque de terceiros do comprador)
alter table vendas add column if not exists gado_fica boolean not null default false;

-- uma NF-e pode juntar várias vendas (mesmo cliente, mesma fazenda emitente e mesma fazenda do cliente)
create table if not exists nfe_nota_vendas (
  nota_id uuid not null references nfe_notas(id) on delete cascade,
  venda_id uuid not null references vendas(id) on delete cascade,
  primary key (nota_id, venda_id)
);
create index if not exists nfe_nota_vendas_venda on nfe_nota_vendas (venda_id);
alter table nfe_nota_vendas enable row level security;
drop policy if exists nfe_nota_vendas_ler on nfe_nota_vendas;
create policy nfe_nota_vendas_ler on nfe_nota_vendas for select
  using (exists (select 1 from nfe_notas n where n.id = nota_id and public.acesso_fazenda(n.fazenda_id)));

-- lançamento do Estoque de gado feito pela NF-e (sai junto se a nota for cancelada)
alter table estoque_fiscal_lanc add column if not exists nfe_nota_id uuid references nfe_notas(id) on delete cascade;

-- as vendas que uma nota cobre (a principal e as juntadas)
create or replace function public.nfe_vendas_da_nota(p_nota uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select venda_id from nfe_notas where id = p_nota and venda_id is not null
  union
  select venda_id from nfe_nota_vendas where nota_id = p_nota;
$$;

-- venda já tem NF-e autorizada (produção)?
create or replace function public.venda_nfe_autorizada(p_venda uuid)
returns int language sql stable security definer set search_path to 'public' as $$
  select n.numero from nfe_notas n
   where n.situacao = 'autorizada' and n.ambiente = 1
     and (n.venda_id = p_venda or exists (select 1 from nfe_nota_vendas x where x.nota_id = n.id and x.venda_id = p_venda))
   order by n.created_at desc limit 1;
$$;

-- cabeças da venda por sexo e faixa (chaves do Estoque de gado: M0, F3, M13...), em números positivos
create or replace function public.venda_chaves_gado(p_venda uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb; m record; v_q jsonb := '{}';
begin
  select coalesce(jsonb_object_agg(key, q), '{}') into v from (
    select k.key, -sum((k.value #>> '{}')::int) as q
      from estoque_fiscal_lanc l
      join movimentacoes mv on mv.id = l.movimentacao_id
      cross join lateral jsonb_each(l.quantidades) k
     where mv.venda_id = p_venda and l.dono = 'proprio' and l.nfe_nota_id is null
     group by k.key
    having sum((k.value #>> '{}')::int) < 0) x;
  if v <> '{}'::jsonb then return v; end if;
  for m in select id from movimentacoes where venda_id = p_venda loop
    select coalesce(jsonb_object_agg(key, total), '{}') into v_q from (
      select key, sum((value #>> '{}')::int) as total
        from (select * from jsonb_each(v_q) union all select * from jsonb_each(public.mov_chaves_faixa(m.id))) z group by key) y;
  end loop;
  return v_q;
end $$;

-- inverte o sinal das quantidades
create or replace function public.jsonb_negar(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key, -((value #>> '{}')::int)), '{}') from jsonb_each(coalesce(p, '{}'));
$$;

/*
  Um item da venda de gado: tira os animais do rebanho (lote, animais escolhidos, pesagem ou sexo/faixa)
  e faz a conta do preço. Devolve os dados do item. A baixa no Estoque de gado fica com salvar_venda.
  Preço: por arroba (peso sem a barriga ÷ kg da arroba), por kg bruto ou por cabeça.
*/
create or replace function public.venda_gado_item(p_faz uuid, p_data date, p jsonb, a jsonb, p_com_gta boolean, p_ordem int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_forma text := a->>'forma_preco'; v_preco numeric := nullif(a->>'preco','')::numeric;
  v_bruto numeric := nullif(a->>'peso_bruto','')::numeric; v_liq numeric; v_kg_arr numeric; v_arr numeric; v_valor numeric; v_cli numeric;
  v_bt text := nullif(a->>'barriga_tipo',''); v_bv numeric := coalesce(nullif(a->>'barriga_valor','')::numeric, 0);
  v_mov json; v_mid uuid; v_cab int; v_qf int := coalesce(nullif(a->>'quantidade','')::int, 0); v_chave text; v_reb int;
  v_k text := 'Item ' || p_ordem || ': ';
  v_sexo text := nullif(upper(trim(a->>'sexo')), '');
begin
  if v_forma is null or v_forma not in ('arroba','kg','cabeca') then raise exception '%informe o preço por arroba, por kg ou por cabeça.', v_k; end if;
  if coalesce(v_preco, 0) <= 0 then raise exception '%informe o preço.', v_k; end if;
  if v_forma in ('arroba','kg') and coalesce(v_bruto, 0) <= 0 then raise exception '%informe o peso bruto (kg).', v_k; end if;
  if v_bruto is not null and v_bruto <= 0 then v_bruto := null; end if;

  -- de onde saem os animais: por sexo e faixa (sem lote) usa o Estoque de gado; senão, a saída normal do rebanho
  if nullif(a->>'lote_origem','') is null and nullif(a->>'pesagem','') is null and jsonb_array_length(coalesce(a->'animais','[]'::jsonb)) = 0
     and v_sexo is not null and nullif(a->>'idade_de','') is not null and public.estoque_gado_usado(p_faz) then
    if v_qf < 1 then raise exception '%informe a quantidade de cabeças.', v_k; end if;
    v_chave := v_sexo || ((a->>'idade_de')::int)::text;
    select count(*) into v_reb from animais where fazenda_id = p_faz and situacao = 'ativo' and sexo = v_sexo and data_nascimento is not null
       and public.idade_meses(data_nascimento, p_data) >= (a->>'idade_de')::int and public.idade_meses(data_nascimento, p_data) <= coalesce(nullif(a->>'idade_ate','')::int, 99999);
    if v_reb < v_qf then
      insert into movimentacoes (fazenda_id, data, tipo, pessoa_id, documento, observacoes)
        values (p_faz, p_data, 'venda', nullif(p->>'pessoa_id','')::uuid, nullif(trim(p->>'numero_documento'),''), nullif(trim(p->>'observacoes'),''))
        returning id into v_mid;
      insert into movimentacao_itens (fazenda_id, movimentacao_id, animal_id, quantidade, sexo, raca_id, ferro_id, peso_kg)
        values (p_faz, v_mid, null, v_qf, v_sexo, nullif(a->>'raca_id','')::uuid, nullif(a->>'ferro_id','')::uuid, case when v_bruto is not null then round(v_bruto / v_qf, 2) end);
      perform public.estoque_gado_baixar_venda(p_faz, p_data, v_mid, jsonb_build_object(v_chave, v_qf), p_com_gta, p->>'numero_documento', p->>'gta_numero');
      v_mov := json_build_object('id', v_mid, 'cabecas', v_qf);
    end if;
  end if;
  if v_mov is null then
    v_mov := public.lancar_movimentacao(json_build_object(
      'tipo', 'venda', 'fazenda', p_faz, 'data', p_data, 'lote_origem', a->>'lote_origem',
      'quantidade', v_qf, 'animais', coalesce(a->'animais', '[]'::jsonb),
      'peso_total', v_bruto, 'sexo', v_sexo, 'idade_de', a->>'idade_de', 'idade_ate', a->>'idade_ate',
      'pessoa', p->>'pessoa_id', 'documento', p->>'numero_documento', 'obs', p->>'observacoes', 'pesagem', a->>'pesagem'));
  end if;
  v_mid := (v_mov->>'id')::uuid;
  v_cab := (v_mov->>'cabecas')::int;

  -- conta do preço
  if v_bt is not null and v_bt not in ('perc','kg_cab') then raise exception '%desconto de barriga inválido.', v_k; end if;
  if v_bv <= 0 then v_bt := null; v_bv := null; end if;
  v_liq := case when v_bruto is null then null
                when v_bt = 'perc' then round(v_bruto * (1 - v_bv / 100), 2)
                when v_bt = 'kg_cab' then round(v_bruto - v_bv * v_cab, 2)
                else v_bruto end;
  if v_liq is not null and v_liq <= 0 then raise exception '%o desconto de barriga não pode zerar o peso.', v_k; end if;
  v_kg_arr := coalesce(nullif(a->>'kg_arroba','')::numeric, 30);
  if v_kg_arr <= 0 then raise exception '%informe os kg da arroba.', v_k; end if;
  v_arr := case when v_liq is not null then round(v_liq / v_kg_arr, 2) end;
  v_valor := case v_forma when 'arroba' then round(v_arr * v_preco, 2) when 'kg' then round(v_bruto * v_preco, 2) else round(v_cab * v_preco, 2) end;
  v_cli := nullif(a->>'valor','')::numeric;
  if v_cli is not null then
    if abs(v_cli - v_valor) > 0.02 then raise exception '%o valor calculado (%) é diferente do mostrado na tela (%). Confira cabeças, peso e preço.', v_k, v_valor, v_cli; end if;
    v_valor := v_cli;
  end if;

  return jsonb_build_object(
    'mov', v_mid, 'cabecas', v_cab, 'peso_bruto', v_bruto, 'peso_liquido', v_liq, 'arrobas', v_arr, 'kg_arroba', case when v_bruto is not null then v_kg_arr end,
    'barriga_tipo', v_bt, 'barriga_valor', v_bv, 'forma', v_forma, 'preco', v_preco, 'valor', v_valor,
    'lote', nullif(a->>'lote_origem',''), 'pesagem', nullif(a->>'pesagem',''), 'sexo', v_sexo,
    'idade_de', nullif(a->>'idade_de','')::int, 'idade_ate', nullif(a->>'idade_ate','')::int,
    'raca', nullif(a->>'raca_id',''), 'ferro', nullif(a->>'ferro_id',''));
end $$;

-- V203 · Parte 2: salvar_venda com vários itens de gado
-- - cada item tem os seus dados e o seu preço; a venda soma os itens
-- - a venda baixa o estoque Total; o Com GTA só sai pela NF-e autorizada (ou pela NF já emitida fora, com a GTA, informadas na venda)
-- - à vista também vai para o Contas a receber (o financeiro faz o recebimento)
-- - "o gado fica na fazenda": entra no estoque de terceiros do comprador
create or replace function public.salvar_venda(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_faz uuid := (p->>'fazenda_id')::uuid; v_tipo text := coalesce(nullif(p->>'tipo',''), 'outros'); v_data date := (p->>'data')::date;
  v_itens jsonb; v_res jsonb := '[]'; ri jsonb; k int := 0;
  v_id uuid; v_num int; v_cab int := 0; v_mov_ids uuid[] := '{}';
  v_bruto_kg numeric; v_liq_kg numeric; v_arr numeric; v_formas text[]; v_kgs numeric[];
  v_valor numeric := 0;
  v_fun numeric := coalesce(nullif(p->>'funrural_valor','')::numeric, 0); v_com numeric := coalesce(nullif(p->>'comissao','')::numeric, 0);
  v_fre numeric := coalesce(nullif(p->>'frete','')::numeric, 0); v_out numeric := coalesce(nullif(p->>'outros_descontos','')::numeric, 0);
  v_liq numeric; it jsonb; r jsonb; pc jsonb; v_soma numeric := 0; v_parc numeric := 0; v_n int := 0; v_tot int; v_l uuid; v_saldo numeric; v_nome text; v_q numeric; v_cl record;
  v_com_gta boolean; v_mid uuid; v_chaves jsonb; v_fica boolean := coalesce((p->>'gado_fica')::boolean, false);
begin
  if v_faz is null or not public.acesso_fazenda(v_faz) then raise exception 'Sem acesso a esta fazenda.'; end if;
  if v_tipo not in ('animais','outros','cafe') then raise exception 'Tipo de venda inválido.'; end if;
  if v_data is null then raise exception 'Informe a data da venda.'; end if;
  if v_data > current_date then raise exception 'A data da venda não pode ser futura.'; end if;
  if nullif(p->>'pessoa_id','') is null then raise exception 'Informe o comprador.'; end if;
  if nullif(p->>'pessoa_faturamento_id', '') is not null
     and not exists (select 1 from pessoas_faturamento where id = (p->>'pessoa_faturamento_id')::uuid and pessoa_id = (p->>'pessoa_id')::uuid) then
    raise exception 'A fazenda escolhida não é deste cliente.';
  end if;
  if nullif(trim(p->>'numero_documento'), '') is not null and exists (select 1 from vendas where fazenda_id = v_faz and tipo = v_tipo and trim(numero_documento) = trim(p->>'numero_documento')) then
    raise exception 'Já existe venda com a NF nº % nesta fazenda.', trim(p->>'numero_documento');
  end if;
  if nullif(trim(p->>'gta_numero'), '') is not null and exists (select 1 from vendas where fazenda_id = v_faz and trim(gta_numero) = trim(p->>'gta_numero')) then
    raise exception 'Já existe venda com a GTA nº % nesta fazenda.', trim(p->>'gta_numero');
  end if;
  if least(v_fun, v_com, v_fre, v_out) < 0 then raise exception 'Os descontos não podem ser negativos.'; end if;
  for r in select * from jsonb_array_elements(coalesce(p->'rateio','[]')) loop v_soma := v_soma + (r->>'percentual')::numeric; end loop;
  if jsonb_array_length(coalesce(p->'rateio','[]')) > 0 and abs(v_soma - 100) > 0.001 then raise exception 'O rateio entre os centros de custo precisa somar 100%%.'; end if;
  if v_fica and v_tipo <> 'animais' then v_fica := false; end if;

  -- NF já emitida fora do sistema + GTA, informadas na venda: sai junto do estoque Com GTA (como a NF-e autorizada)
  v_com_gta := nullif(trim(p->>'numero_documento'), '') is not null and nullif(trim(p->>'gta_numero'), '') is not null;
  if v_tipo = 'animais' then
    v_itens := coalesce(p->'itens_gado', '[]'::jsonb);
    if jsonb_array_length(v_itens) = 0 and jsonb_typeof(p->'animais') = 'object' then v_itens := jsonb_build_array(p->'animais'); end if;
    if jsonb_array_length(v_itens) = 0 then raise exception 'Informe pelo menos um item de gado.'; end if;
    for it in select * from jsonb_array_elements(v_itens) loop
      k := k + 1;
      ri := public.venda_gado_item(v_faz, v_data, p, it, v_com_gta, k);
      v_res := v_res || jsonb_build_array(ri);
      v_mov_ids := v_mov_ids || (ri->>'mov')::uuid;
      v_cab := v_cab + (ri->>'cabecas')::int;
      v_valor := v_valor + (ri->>'valor')::numeric;
      if ri->>'peso_bruto' is not null then v_bruto_kg := coalesce(v_bruto_kg, 0) + (ri->>'peso_bruto')::numeric; end if;
      if ri->>'peso_liquido' is not null then v_liq_kg := coalesce(v_liq_kg, 0) + (ri->>'peso_liquido')::numeric; end if;
      if ri->>'arrobas' is not null then v_arr := coalesce(v_arr, 0) + (ri->>'arrobas')::numeric; end if;
      v_formas := array_append(v_formas, ri->>'forma');
      if ri->>'kg_arroba' is not null then v_kgs := array_append(v_kgs, (ri->>'kg_arroba')::numeric); end if;
    end loop;
    -- a saída também baixa no Estoque de gado (Total; o Com GTA só com a NF)
    for v_mid in select unnest(v_mov_ids) loop
      if not exists (select 1 from estoque_fiscal_lanc where movimentacao_id = v_mid) then
        perform public.estoque_gado_baixar_venda(v_faz, v_data, v_mid, public.mov_chaves_faixa(v_mid), v_com_gta, p->>'numero_documento', p->>'gta_numero');
      end if;
    end loop;
  else
    if jsonb_array_length(coalesce(p->'itens','[]')) = 0 then raise exception 'A venda precisa de pelo menos um item.'; end if;
    for it in select * from jsonb_array_elements(p->'itens') loop
      if coalesce((it->>'valor_total')::numeric, 0) <= 0 then raise exception 'Cada item precisa de valor.'; end if;
      v_valor := v_valor + (it->>'valor_total')::numeric;
    end loop;
  end if;

  v_liq := v_valor - v_fun - v_com - v_fre - v_out;
  if v_liq <= 0 then raise exception 'Os descontos não podem zerar o valor a receber.'; end if;
  v_tot := jsonb_array_length(coalesce(p->'parcelas','[]'));
  if v_tot = 0 then raise exception 'Informe o recebimento (à vista ou as parcelas).'; end if;
  for pc in select * from jsonb_array_elements(p->'parcelas') loop v_parc := v_parc + (pc->>'valor')::numeric; end loop;
  if abs(v_parc - v_liq) > 0.009 then raise exception 'A soma das parcelas (%) é diferente do valor a receber (%).', v_parc, v_liq; end if;

  insert into vendas (documento_serie, gta_numero, gta_serie, gta_uf, pessoa_faturamento_id, fazenda_id, tipo, pessoa_id, data, numero_documento, conta_contabil_id, conta_bancaria_id, forma_pagamento, valor_bruto, funrural_perc, funrural_valor,
    comissao, frete, outros_descontos, valor_total, situacao, observacoes, pesagem_id, lote_id, cabecas, peso_bruto_kg, barriga_tipo, barriga_valor, peso_liquido_kg,
    forma_preco, kg_arroba, arrobas, preco, gado_fica, created_by)
  values (nullif(trim(p->>'documento_serie'), ''), nullif(trim(p->>'gta_numero'), ''), nullif(upper(trim(p->>'gta_serie')), ''), nullif(upper(trim(p->>'gta_uf')), ''), nullif(p->>'pessoa_faturamento_id', '')::uuid,
    v_faz, v_tipo, (p->>'pessoa_id')::uuid, v_data, nullif(trim(p->>'numero_documento'),''), nullif(p->>'conta_contabil_id','')::uuid, nullif(p->>'conta_bancaria_id','')::uuid,
    p->>'forma_pagamento', v_valor, nullif(p->>'funrural_perc','')::numeric, v_fun, v_com, v_fre, v_out, v_liq, 'confirmada', nullif(trim(p->>'observacoes'),''),
    -- um item só: os dados dele também no cabeçalho (como antes); vários: só os totais
    case when k = 1 then (v_res->0->>'pesagem')::uuid end, case when k = 1 then (v_res->0->>'lote')::uuid end,
    case when v_tipo = 'animais' then v_cab end, v_bruto_kg,
    case when k = 1 then v_res->0->>'barriga_tipo' end, case when k = 1 then (v_res->0->>'barriga_valor')::numeric end, v_liq_kg,
    case when v_tipo = 'animais' and (select count(distinct x) from unnest(v_formas) x) = 1 then v_formas[1] end,
    case when coalesce(array_length(v_kgs, 1), 0) > 0 and (select count(distinct x) from unnest(v_kgs) x) = 1 then v_kgs[1] end,
    v_arr, case when k = 1 then (v_res->0->>'preco')::numeric end, v_fica, auth.uid())
  returning id, numero into v_id, v_num;

  if v_tipo = 'animais' then
    update movimentacoes set venda_id = v_id where id = any (v_mov_ids);
    k := 0;
    for ri in select * from jsonb_array_elements(v_res) loop
      k := k + 1;
      insert into venda_itens (fazenda_id, venda_id, tipo_item, ordem, lote_id, movimentacao_id, pesagem_id, sexo, idade_de, idade_ate, raca_id, ferro_id,
        cabecas, descricao, quantidade, unidade, peso_kg, peso_liquido_kg, barriga_tipo, barriga_valor, kg_arroba, arrobas, forma_preco, valor_unitario, valor_total)
      values (v_faz, v_id, 'animal', k, (ri->>'lote')::uuid, (ri->>'mov')::uuid, (ri->>'pesagem')::uuid,
        coalesce(ri->>'sexo', (select max(i.sexo) from movimentacao_itens i where i.movimentacao_id = (ri->>'mov')::uuid having count(distinct i.sexo) = 1)),
        (ri->>'idade_de')::int, (ri->>'idade_ate')::int, (ri->>'raca')::uuid, (ri->>'ferro')::uuid,
        (ri->>'cabecas')::int, 'Bovinos',
        case ri->>'forma' when 'arroba' then (ri->>'arrobas')::numeric when 'kg' then (ri->>'peso_bruto')::numeric else (ri->>'cabecas')::numeric end,
        case ri->>'forma' when 'arroba' then 'arroba' when 'kg' then 'kg' else 'cabeca' end,
        (ri->>'peso_bruto')::numeric, (ri->>'peso_liquido')::numeric, ri->>'barriga_tipo', (ri->>'barriga_valor')::numeric,
        (ri->>'kg_arroba')::numeric, (ri->>'arrobas')::numeric, ri->>'forma', (ri->>'preco')::numeric, (ri->>'valor')::numeric);
    end loop;
  else
    for it in select * from jsonb_array_elements(p->'itens') loop
      v_q := coalesce(nullif(it->>'quantidade','')::numeric, 1);
      if (coalesce(it->>'tipo_item','') = 'cafe') <> (v_tipo = 'cafe') then raise exception 'Venda de café só leva café; os outros itens vão em outra venda.'; end if;
      if it->>'tipo_item' = 'cafe' then
        select c.numero, c.data_entrada into v_cl from cafe_lotes c where c.id = nullif(it->>'cafe_lote_id','')::uuid and c.fazenda_id = v_faz;
        if not found then raise exception 'Escolha o lote de café de cada item.'; end if;
        if not exists (select 1 from pc_locais where id = nullif(it->>'cafe_local_id','')::uuid and fazenda_id = v_faz) then raise exception 'Informe o armazém de onde sai o café do lote nº %.', v_cl.numero; end if;
        if v_q <= 0 then raise exception 'Informe as sacas do lote nº %.', v_cl.numero; end if;
        if v_data < v_cl.data_entrada then raise exception 'A venda não pode ser antes da entrada do lote nº % no armazém.', v_cl.numero; end if;
        v_saldo := cafe_saldo((it->>'cafe_lote_id')::uuid, (it->>'cafe_local_id')::uuid);
        if v_q > v_saldo + 0.005 then raise exception 'O lote de café nº % só tem % sacas neste armazém e a venda é de %.', v_cl.numero, v_saldo, v_q; end if;
        insert into cafe_movimentos (fazenda_id, lote_id, local_id, data, tipo, sacas, venda_id, observacoes)
        values (v_faz, (it->>'cafe_lote_id')::uuid, (it->>'cafe_local_id')::uuid, v_data, 'venda', -v_q, v_id, 'Venda nº ' || v_num);
      end if;
      if it->>'tipo_item' = 'insumo' then
        if nullif(it->>'insumo_id','') is null then raise exception 'Item de produto sem o produto escolhido.'; end if;
        if v_q <= 0 then raise exception 'Informe a quantidade do produto.'; end if;
        select coalesce(sum(case when tipo = 'saida' then -quantidade else quantidade end), 0) into v_saldo
          from estoque_movimentos where fazenda_id = v_faz and insumo_id = (it->>'insumo_id')::uuid;
        if v_q > v_saldo + 0.0001 then
          select nome into v_nome from insumos where id = (it->>'insumo_id')::uuid;
          raise exception 'Estoque de % insuficiente: tem % e a venda é de %.', v_nome, v_saldo, v_q;
        end if;
        insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, venda_id, observacoes, created_by)
        values (v_faz, (it->>'insumo_id')::uuid, v_data, 'saida', v_q, v_id, 'Venda nº ' || v_num, auth.uid());
      end if;
      insert into venda_itens (fazenda_id, venda_id, tipo_item, cafe_lote_id, cafe_local_id, insumo_id, descricao, quantidade, unidade, valor_unitario, valor_total)
      values (v_faz, v_id, case when it->>'tipo_item' in ('insumo','cafe') then it->>'tipo_item' else 'outro' end, nullif(it->>'cafe_lote_id','')::uuid, nullif(it->>'cafe_local_id','')::uuid, nullif(it->>'insumo_id','')::uuid, nullif(trim(it->>'descricao'),''),
        v_q, nullif(it->>'unidade',''), coalesce(nullif(it->>'valor_unitario','')::numeric, (it->>'valor_total')::numeric), (it->>'valor_total')::numeric);
    end loop;
  end if;

  if v_tipo = 'cafe' then update vendas set sacas = (select sum(quantidade) from venda_itens where venda_id = v_id) where id = v_id; end if;

  insert into venda_rateios (venda_id, centro_custo_id, percentual)
    select v_id, (x->>'centro_custo_id')::uuid, (x->>'percentual')::numeric from jsonb_array_elements(coalesce(p->'rateio','[]')) x;

  for pc in select * from jsonb_array_elements(p->'parcelas') loop
    if coalesce((pc->>'valor')::numeric, 0) <= 0 then raise exception 'Cada parcela precisa de valor.'; end if;
    v_n := v_n + 1;
    insert into lancamentos (fazenda_id, tipo, pessoa_id, descricao, documento, conta_contabil_id, centro_custo_id, conta_bancaria_id, valor,
      data_emissao, data_vencimento, vencimento_original, situacao, parcela, total_parcelas, intermediaria, venda_id, created_by)
    values (v_faz, 'receber', (p->>'pessoa_id')::uuid, 'Venda nº ' || v_num || case when v_tipo = 'animais' then ' – ' || v_cab || ' cab.' when v_tipo = 'cafe' then ' – ' || (select replace(trim(trailing '.' from trim(trailing '0' from round(sum(quantidade), 3)::text)), '.', ',') from venda_itens where venda_id = v_id) || ' sacas de café' else '' end,
      nullif(trim(p->>'numero_documento'),''), nullif(p->>'conta_contabil_id','')::uuid,
      case when jsonb_array_length(coalesce(p->'rateio','[]')) = 1 then (p->'rateio'->0->>'centro_custo_id')::uuid end,
      nullif(p->>'conta_bancaria_id','')::uuid, (pc->>'valor')::numeric, v_data, (pc->>'vencimento')::date, (pc->>'vencimento')::date, 'aberto', parc_serie(p->'parcelas', v_n), parc_serie_total(p->'parcelas', v_n), parc_interm(p->'parcelas', v_n), v_id, auth.uid())
    returning id into v_l;
    insert into lancamento_rateios (lancamento_id, centro_custo_id, percentual)
      select v_l, (x->>'centro_custo_id')::uuid, (x->>'percentual')::numeric from jsonb_array_elements(coalesce(p->'rateio','[]')) x;
  end loop;

  -- V203: à vista não recebe mais sozinho: fica no Contas a receber até o financeiro fazer o recebimento.
  -- V194: venda para fazenda do Grupo gera a compra do outro lado
  v_mid := coalesce(nullif(p->>'fazenda_destino_id', '')::uuid, public.fazenda_grupo_do_faturamento(nullif(p->>'pessoa_faturamento_id', '')::uuid));
  if v_mid is not null and v_mid <> v_faz then
    if v_fica then raise exception 'Venda para fazenda do Grupo não usa "o gado fica na fazenda".'; end if;
    perform public.venda_grupo_gerar_compra(v_id, v_mid);
  end if;

  -- V203: o gado fica na fazenda: entra no estoque de terceiros do comprador (separado por parceiro)
  if v_fica and public.estoque_gado_usado(v_faz) then
    v_chaves := public.venda_chaves_gado(v_id);
    if v_chaves <> '{}'::jsonb then
      insert into estoque_fiscal_lanc (fazenda_id, data, tipo, dono, parceiro_id, quantidades, quantidades_gta, nf_numero, gta_numero, movimentacao_id, observacoes, created_by)
      values (v_faz, v_data, 'movimentacao', 'terceiro', (p->>'pessoa_id')::uuid, v_chaves, case when v_com_gta then v_chaves else '{}'::jsonb end,
        nullif(trim(p->>'numero_documento'), ''), nullif(trim(p->>'gta_numero'), ''), v_mov_ids[1], 'Venda nº ' || v_num || ' – o gado fica na fazenda', auth.uid());
    end if;
  end if;

  return json_build_object('id', v_id, 'numero', v_num, 'bruto', v_valor, 'liquido', v_liq, 'cabecas', case when v_tipo = 'animais' then v_cab end, 'itens', k);
end $function$;

-- V203 · Parte 3: NF-e autorizada baixa o estoque Com GTA; cancelada, devolve. Uma NF-e pode cobrir várias vendas.

-- número da nota nas vendas que ela cobre
create or replace function public.nfe_nota_na_venda()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.situacao = 'autorizada' and new.ambiente = 1
     and (tg_op = 'INSERT' or old.situacao is distinct from 'autorizada') then
    update vendas set numero_documento = new.numero::text, documento_serie = new.serie::text where id in (select public.nfe_vendas_da_nota(new.id));
    update lancamentos set documento = new.numero::text where venda_id in (select public.nfe_vendas_da_nota(new.id));
  end if;
  return new;
end $function$;

-- Estoque de gado pela NF-e: autorizada (produção) tira do Com GTA; cancelada, devolve
create or replace function public.nfe_estoque_gado()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v vendas%rowtype; v_movs uuid[]; v_k jsonb; v_data date; v_dest uuid;
begin
  if new.situacao = 'cancelada' and old.situacao = 'autorizada' then
    delete from estoque_fiscal_lanc where nfe_nota_id = new.id;
    return new;
  end if;
  if not (new.situacao = 'autorizada' and new.ambiente = 1 and (tg_op = 'INSERT' or old.situacao is distinct from 'autorizada')) then return new; end if;
  v_data := coalesce((new.autorizada_em at time zone 'America/Sao_Paulo')::date, current_date);
  for v in select * from vendas where id in (select public.nfe_vendas_da_nota(new.id)) and tipo = 'animais' loop
    if not public.estoque_gado_usado(v.fazenda_id) then continue; end if;
    v_movs := array(select id from movimentacoes where venda_id = v.id order by created_at);
    if coalesce(array_length(v_movs, 1), 0) = 0 then continue; end if;
    -- já saiu do Com GTA (NF de fora + GTA informadas na venda, ou nota anterior)
    if exists (select 1 from estoque_fiscal_lanc where movimentacao_id = any (v_movs) and dono = 'proprio' and coalesce(quantidades_gta, '{}'::jsonb) <> '{}'::jsonb) then continue; end if;
    v_k := public.venda_chaves_gado(v.id);
    if v_k = '{}'::jsonb then continue; end if;
    insert into estoque_fiscal_lanc (fazenda_id, data, tipo, dono, quantidades, quantidades_gta, nf_numero, gta_numero, movimentacao_id, nfe_nota_id, observacoes)
    values (v.fazenda_id, greatest(v_data, v.data), 'movimentacao', 'proprio', '{}', public.jsonb_negar(v_k), new.numero::text, v.gta_numero, v_movs[1], new.id,
            'NF-e nº ' || new.numero || ' da venda nº ' || v.numero);
    -- o gado ficou na fazenda: o estoque do comprador também passa a ter NF
    if v.gado_fica then
      insert into estoque_fiscal_lanc (fazenda_id, data, tipo, dono, parceiro_id, quantidades, quantidades_gta, nf_numero, gta_numero, movimentacao_id, nfe_nota_id, observacoes)
      values (v.fazenda_id, greatest(v_data, v.data), 'movimentacao', 'terceiro', v.pessoa_id, '{}', v_k, new.numero::text, v.gta_numero, v_movs[1], new.id,
              'NF-e nº ' || new.numero || ' da venda nº ' || v.numero || ' – o gado fica na fazenda');
    end if;
    -- venda para fazenda do Grupo: a compra do outro lado passa a ter NF
    if v.compra_grupo_id is not null then
      select fazenda_id into v_dest from compras where id = v.compra_grupo_id;
      if v_dest is not null and not exists (select 1 from estoque_fiscal_lanc where compra_id = v.compra_grupo_id and coalesce(quantidades_gta, '{}'::jsonb) <> '{}'::jsonb) then
        insert into estoque_fiscal_lanc (fazenda_id, data, tipo, dono, quantidades, quantidades_gta, nf_numero, gta_numero, compra_id, nfe_nota_id, observacoes)
        values (v_dest, greatest(v_data, v.data), 'movimentacao', 'proprio', '{}', v_k, new.numero::text, v.gta_numero, v.compra_grupo_id, new.id,
                'NF-e nº ' || new.numero || ' da venda nº ' || v.numero);
      end if;
    end if;
  end loop;
  return new;
end $function$;

drop trigger if exists nfe_estoque_gado on nfe_notas;
create trigger nfe_estoque_gado after insert or update of situacao on nfe_notas
  for each row execute function public.nfe_estoque_gado();

-- excluir venda: não com NF-e autorizada
create or replace function public.excluir_venda(p_id uuid)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare v vendas%rowtype; m record; v_cab int := 0; x record; v_nf int;
begin
  select * into v from vendas where id = p_id;
  if not found or not public.acesso_completo(v.fazenda_id) then raise exception 'Só quem tem acesso completo pode excluir vendas.'; end if;
  v_nf := public.venda_nfe_autorizada(p_id);
  if v_nf is not null then raise exception 'A venda nº % tem a NF-e nº % autorizada: cancele a nota antes de excluir a venda.', v.numero, v_nf; end if;
  for x in select id, lancamento_id from baixas where compensa_venda_id = p_id loop
    delete from baixas where id = x.id;
    perform atualizar_titulo(x.lancamento_id);
  end loop;
  -- recebimento automático da venda à vista (até a V202) sai junto
  delete from baixas where observacoes = 'Venda à vista' and lancamento_id in (select id from lancamentos where venda_id = p_id);
  if v.compra_grupo_id is not null then
    delete from baixas where observacoes = 'Compra à vista' and lancamento_id in (select id from lancamentos where compra_id = v.compra_grupo_id);
    if exists (select 1 from baixas b join lancamentos l on l.id = b.lancamento_id where l.compra_id = v.compra_grupo_id and b.situacao in ('pendente','confirmada')) then
      raise exception 'A compra desta venda na outra fazenda já tem pagamento lançado: estorne o pagamento em Contas a pagar antes de excluir.';
    end if;
    delete from lancamentos where compra_id = v.compra_grupo_id;
    delete from estoque_movimentos where compra_id = v.compra_grupo_id;
    delete from compra_itens where compra_id = v.compra_grupo_id;
    update vendas set compra_grupo_id = null where id = p_id;
    delete from compras where id = v.compra_grupo_id;
  end if;
  if exists (select 1 from baixas b join lancamentos l on l.id = b.lancamento_id where l.venda_id = p_id and b.situacao in ('pendente','confirmada')) then
    raise exception 'Esta venda já tem recebimento lançado: estorne o recebimento em Contas a receber antes de excluir.';
  end if;
  update venda_itens set movimentacao_id = null where venda_id = p_id;
  for m in select id from movimentacoes where venda_id = p_id loop
    update movimentacoes set venda_id = null where id = m.id;
    v_cab := v_cab + coalesce((public.excluir_movimentacao(m.id)->>'cabecas')::int, 0);
  end loop;
  delete from lancamentos where venda_id = p_id;
  delete from estoque_movimentos where venda_id = p_id;
  delete from vendas where id = p_id;
  if v.cafe_contrato_id is not null then update cafe_contratos set situacao = 'aberto' where id = v.cafe_contrato_id and situacao = 'concluido'; end if;
  return json_build_object('numero', v.numero, 'cabecas', v_cab);
end $function$;

-- vendas que podem entrar numa NF-e: da fazenda, do cliente e da fazenda do cliente, ainda sem nota autorizada
create or replace function public.nfe_vendas_juntar(p_fazenda uuid, p_numeros int[])
returns json language plpgsql stable security definer set search_path to 'public' as $function$
declare v record; v_ids uuid[] := '{}'; v_pessoa uuid; v_fat uuid; v_tipo text; v_prim boolean := true; v_nf int; n int;
begin
  if not public.acesso_fazenda(p_fazenda) then raise exception 'Sem acesso a esta fazenda.'; end if;
  if coalesce(array_length(p_numeros, 1), 0) = 0 then raise exception 'Informe o número das vendas.'; end if;
  foreach n in array p_numeros loop
    select vd.id, vd.pessoa_id, vd.pessoa_faturamento_id, vd.tipo into v from vendas vd where vd.fazenda_id = p_fazenda and vd.numero = n;
    if not found then raise exception 'Não há venda nº % nesta fazenda.', n; end if;
    v_nf := public.venda_nfe_autorizada(v.id);
    if v_nf is not null then raise exception 'A venda nº % já tem a NF-e nº % autorizada.', n, v_nf; end if;
    if v_prim then
      v_pessoa := v.pessoa_id; v_fat := v.pessoa_faturamento_id; v_tipo := v.tipo; v_prim := false;
    else
      if v.pessoa_id is distinct from v_pessoa then raise exception 'A venda nº % é de outro cliente: a NF-e junta só vendas do mesmo cliente.', n; end if;
      if v.pessoa_faturamento_id is distinct from v_fat then raise exception 'A venda nº % é para outra fazenda do cliente (outra Inscrição Estadual): a NF-e junta só vendas para a mesma fazenda.', n; end if;
      if v.tipo <> v_tipo then raise exception 'A venda nº % é de outro tipo (gado, café ou outros): faça notas separadas.', n; end if;
    end if;
    if v.id <> all (v_ids) then v_ids := v_ids || v.id; end if;
  end loop;
  return json_build_object('vendas', v_ids);
end $function$;

-- venda para fazenda do Grupo: item a item (com as cabeças de cada item) e sem pagamento automático
create or replace function public.venda_grupo_gerar_compra(p_venda uuid, p_dest uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  v vendas%rowtype; fo fazendas%rowtype; fd fazendas%rowtype;
  v_forn uuid; v_cid uuid; v_cnum int; v_q jsonb := '{}'; v_com_gta boolean := false; r record; it record; v_item uuid;
  v_fator numeric; v_custo numeric; v_qm jsonb; v_qi numeric;
begin
  select * into v from vendas where id = p_venda;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if v.compra_grupo_id is not null then raise exception 'Esta venda já tem a compra na fazenda do Grupo.'; end if;
  select * into fo from fazendas where id = v.fazenda_id;
  select * into fd from fazendas where id = p_dest;
  if not found then raise exception 'Fazenda que compra não encontrada.'; end if;
  if p_dest = v.fazenda_id then raise exception 'A fazenda que compra tem de ser outra.'; end if;
  if not acesso_fazenda(p_dest) then raise exception 'Sem acesso à fazenda que compra.'; end if;
  if so_digitos(fo.cpf_cnpj) = '' or so_digitos(fd.cpf_cnpj) = '' then raise exception 'Informe o CPF/CNPJ das duas fazendas em Mais › Fazendas.'; end if;
  if so_digitos(fo.cpf_cnpj) = so_digitos(fd.cpf_cnpj) then
    raise exception 'As duas fazendas são do mesmo titular (mesmo CPF/CNPJ): é transferência, em Mais › Transferências.';
  end if;
  if v.tipo = 'cafe' then raise exception 'Venda de café entre fazendas do Grupo ainda não está pronta: use Mais › Transferências ou lance a compra à parte.'; end if;

  select id into v_forn from pessoas where so_digitos(cpf_cnpj) = so_digitos(fo.cpf_cnpj) order by created_at limit 1;
  if v_forn is null then
    insert into pessoas (nome, cpf_cnpj, tipos, municipio, uf, ativo)
    values (coalesce(nullif(trim(fo.razao_social), ''), fo.nome), fo.cpf_cnpj, array['fornecedor', 'cliente'], fo.municipio, fo.uf, true)
    returning id into v_forn;
  elsif not exists (select 1 from pessoas where id = v_forn and 'fornecedor' = any (coalesce(tipos, '{}'))) then
    update pessoas set tipos = array_append(coalesce(tipos, '{}'), 'fornecedor') where id = v_forn;
  end if;

  insert into compras (fazenda_id, tipo, pessoa_id, data, numero_documento, valor_total, situacao, observacoes, forma_pagamento, conta_bancaria_id,
    cabecas, peso_bruto_kg, peso_liquido_kg, forma_preco, kg_arroba, arrobas, preco, venda_grupo_id, pago_na_hora, created_by)
  values (p_dest, case when v.tipo = 'animais' then 'animais' else 'insumos' end, v_forn, v.data, v.numero_documento, v.valor_total, 'confirmada',
    'Compra da ' || fo.nome || ' (venda nº ' || v.numero || ')', coalesce(v.forma_pagamento, 'prazo'), v.conta_bancaria_id,
    v.cabecas, v.peso_bruto_kg, v.peso_liquido_kg, v.forma_preco, v.kg_arroba, v.arrobas, v.preco, p_venda, false, auth.uid())
  returning id, numero into v_cid, v_cnum;

  v_fator := case when coalesce(v.valor_bruto, 0) > 0 then v.valor_total / v.valor_bruto else 1 end;
  for it in select * from venda_itens where venda_id = p_venda order by ordem nulls first, created_at loop
    v_custo := round(it.valor_total * v_fator, 2);
    v_qi := case when it.tipo_item = 'animal' then coalesce(it.cabecas, v.cabecas) else it.quantidade end;
    insert into compra_itens (fazenda_id, compra_id, tipo_item, insumo_id, descricao, quantidade, unidade, peso_kg, valor_unitario, valor_total, custo_total, custo_unitario)
    values (p_dest, v_cid, case when it.tipo_item in ('animal', 'insumo') then it.tipo_item else 'outro' end, it.insumo_id, it.descricao,
      v_qi, case when it.tipo_item = 'animal' then 'cabeca' else it.unidade end,
      it.peso_kg, it.valor_unitario, it.valor_total, v_custo, round(v_custo / nullif(v_qi, 0), 6))
    returning id into v_item;
    if it.tipo_item = 'insumo' and it.insumo_id is not null then
      insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, valor_unitario, compra_id, compra_item_id, observacoes, created_by)
      values (p_dest, it.insumo_id, v.data, 'entrada', it.quantidade, round(v_custo / it.quantidade, 6), v_cid, v_item, 'Compra da ' || fo.nome, auth.uid());
    end if;
  end loop;

  if v.tipo = 'animais' then
    for r in select m.id from movimentacoes m where m.venda_id = p_venda loop
      select coalesce(jsonb_object_agg(k.key, -((k.value #>> '{}')::int)), '{}'), bool_or(coalesce(l.quantidades_gta, '{}'::jsonb) <> '{}'::jsonb)
        into v_qm, v_com_gta
        from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k where l.movimentacao_id = r.id and l.dono = 'proprio';
      if v_qm = '{}'::jsonb then v_qm := mov_chaves_faixa(r.id); end if;
      select coalesce(jsonb_object_agg(key, total), '{}') into v_q from (
        select key, sum((value #>> '{}')::int) as total from (select * from jsonb_each(v_q) union all select * from jsonb_each(v_qm)) z group by key) y;
    end loop;
    v_com_gta := coalesce(v_com_gta, false) or (nullif(trim(v.numero_documento), '') is not null and nullif(trim(v.gta_numero), '') is not null);
    if v_q <> '{}'::jsonb then
      insert into estoque_fiscal_lanc (fazenda_id, data, tipo, dono, quantidades, quantidades_gta, nf_numero, gta_numero, compra_id, observacoes, created_by)
      values (p_dest, v.data, 'movimentacao', 'proprio', v_q, case when v_com_gta then v_q else '{}'::jsonb end,
        nullif(trim(v.numero_documento), ''), nullif(trim(v.gta_numero), ''), v_cid, 'Compra da ' || fo.nome || ' (venda nº ' || v.numero || ')', auth.uid());
    end if;
  end if;

  insert into lancamentos (fazenda_id, tipo, pessoa_id, descricao, documento, conta_bancaria_id, valor, data_emissao, data_vencimento, vencimento_original,
    situacao, parcela, total_parcelas, intermediaria, compra_id, created_by)
  select p_dest, 'pagar', v_forn, 'Compra nº ' || v_cnum || ' – da ' || fo.nome, l.documento, l.conta_bancaria_id, l.valor, l.data_emissao, l.data_vencimento,
         l.vencimento_original, 'aberto', l.parcela, l.total_parcelas, l.intermediaria, v_cid, auth.uid()
    from lancamentos l where l.venda_id = p_venda and l.tipo = 'receber';

  update vendas set compra_grupo_id = v_cid where id = p_venda;
  -- V203: à vista também fica no Contas a pagar (o financeiro faz o pagamento), como a venda no Contas a receber
  return v_cnum;
end $function$;

-- vendas de gado já lançadas: o item único recebe os dados do cabeçalho
update venda_itens vi set
  ordem = 1, cabecas = v.cabecas, peso_liquido_kg = v.peso_liquido_kg, barriga_tipo = v.barriga_tipo, barriga_valor = v.barriga_valor,
  kg_arroba = v.kg_arroba, arrobas = v.arrobas, forma_preco = v.forma_preco, pesagem_id = v.pesagem_id,
  movimentacao_id = (select m.id from movimentacoes m where m.venda_id = v.id order by m.created_at limit 1)
from vendas v
where vi.venda_id = v.id and v.tipo = 'animais' and vi.tipo_item = 'animal' and vi.cabecas is null;

-- Parte 4: a mesma movimentação pode ter, além da própria saída, o lançamento da NF-e (Com GTA) e o do estoque de terceiros
drop index if exists estoque_fiscal_lanc_mov_uq;
create unique index estoque_fiscal_lanc_mov_uq on estoque_fiscal_lanc (movimentacao_id)
  where movimentacao_id is not null and dono = 'proprio' and nfe_nota_id is null;
