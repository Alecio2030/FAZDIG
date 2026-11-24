-- FAZENDA DIGITAL V175 – Dieta formulada pelo GMD, tratos por dia e fornecimento automático para o lote
-- Não apaga nem altera dados lançados. Pode rodar mais de uma vez.

-- =====================================================================================
-- 1. Parâmetros da Pecuária (valores usuais; o operador muda em Financeiro › Parâmetros)
-- =====================================================================================
insert into public.parametros (chave, grupo, rotulo, unidade, valor_padrao, ordem, ajuda) values
  ('cms_pv_corte', 'Pecuária', 'Consumo de matéria seca – gado de corte', '% do peso vivo', 2.4, 201, 'Usado na dieta quando não se informa outro.'),
  ('cms_pv_outros', 'Pecuária', 'Consumo de matéria seca – genética e leite sem produção', '% do peso vivo', 2.0, 202, null),
  ('gmd_confinamento', 'Pecuária', 'Ganho de peso diário usual no confinamento', 'kg/dia', 1.4, 203, 'Sugerido na dieta de corte.'),
  ('gmd_pasto', 'Pecuária', 'Ganho de peso diário usual a pasto', 'kg/dia', 0.5, 204, 'Usado para estimar o ganho entre pesagens.'),
  ('tratos_dia', 'Pecuária', 'Tratos por dia', 'vezes', 3, 205, 'Sugerido na dieta; cada dieta pode ter o seu.'),
  ('mineral_g_cab', 'Pecuária', 'Mineral por cabeça por dia (quando não informado)', 'g', 100, 206, 'Usado na formulação se o mineral ficar sem quantidade.'),
  ('kg_arroba', 'Pecuária', 'kg da arroba (peso vivo)', 'kg', 30, 207, null),
  ('rendimento_carcaca', 'Pecuária', 'Rendimento de carcaça', '%', 52, 208, 'Usado no resultado do lote.')
on conflict (chave) do nothing;

-- =====================================================================================
-- 2. Ligações: alimento -> produto do estoque; dieta -> tratos e fornecimento automático
-- =====================================================================================
alter table public.alimentos add column if not exists insumo_id uuid references public.insumos(id);
alter table public.dietas add column if not exists tratos_dia smallint;
alter table public.dietas add column if not exists fornecimento_auto boolean not null default false;
alter table public.dietas add column if not exists fornecer_desde date;

create table if not exists public.fornecimentos (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references public.fazendas(id),
  lote_id uuid not null references public.lotes(id),
  dieta_id uuid,                            -- dieta que gerou o trato (sem vínculo: a dieta pode ser excluída)
  data date not null,
  cabecas integer not null,
  situacao text not null default 'automatico' check (situacao in ('automatico', 'corrigido', 'sem_trato')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_by uuid,
  unique (lote_id, data)
);
create table if not exists public.fornecimento_itens (
  id uuid primary key default gen_random_uuid(),
  fornecimento_id uuid not null references public.fornecimentos(id),
  fazenda_id uuid not null,
  ordem smallint not null default 0,
  alimento_id uuid,
  insumo_id uuid references public.insumos(id),
  nome text not null,
  kg_previsto numeric not null default 0,   -- kg de matéria natural do lote inteiro no dia, pela dieta
  kg_servido numeric not null default 0,    -- o que foi servido (= previsto, até alguém corrigir)
  qtd_estoque numeric not null default 0,   -- o que saiu do estoque, na unidade do produto
  falta_kg numeric not null default 0,      -- kg servidos sem estoque para baixar
  sem_estoque text                          -- motivo quando não baixa: 'sem_ligacao', 'sem_conversao'
);
create index if not exists fornecimento_itens_forn on public.fornecimento_itens (fornecimento_id);
create index if not exists fornecimentos_faz_data on public.fornecimentos (fazenda_id, data);
alter table public.estoque_movimentos add column if not exists fornecimento_id uuid references public.fornecimentos(id);
create index if not exists estoque_mov_fornecimento on public.estoque_movimentos (fornecimento_id) where fornecimento_id is not null;

alter table public.fornecimentos enable row level security;
alter table public.fornecimento_itens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecimentos' and policyname = 'fornecimentos_select') then
    create policy fornecimentos_select on public.fornecimentos for select using (public.acesso_fazenda(fazenda_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fornecimento_itens' and policyname = 'fornecimento_itens_select') then
    create policy fornecimento_itens_select on public.fornecimento_itens for select using (public.acesso_fazenda(fazenda_id));
  end if;
end $$;

-- =====================================================================================
-- 3. Contas auxiliares
-- =====================================================================================
-- Quantos "unidades do estoque" são p_kg quilos do produto (null se não dá para converter).
create or replace function public.kg_para_estoque(p_insumo uuid, p_kg numeric)
returns numeric language sql stable set search_path to 'public'
as $$
  select case
    when i.unidade = 'kg' then p_kg
    when i.unidade = 'g' then p_kg * 1000
    when i.unidade = 't' then p_kg / 1000
    when i.conteudo_medida in ('kg', 'g', 't') and coalesce(i.conteudo_qtd, 0) > 0
      then p_kg / (i.conteudo_qtd * case i.conteudo_medida when 'kg' then 1 when 'g' then 0.001 else 1000 end)
    when i.unidade_dose = 'kg' and coalesce(i.conteudo_por_unidade, 0) > 0 then p_kg / i.conteudo_por_unidade
    else null end
  from insumos i where i.id = p_insumo
$$;

create or replace function public.saldo_insumo(p_fazenda uuid, p_insumo uuid)
returns numeric language sql stable security definer set search_path to 'public'
as $$
  select coalesce(sum(case when tipo = 'saida' then -quantidade else quantidade end), 0)
  from estoque_movimentos where fazenda_id = p_fazenda and insumo_id = p_insumo
$$;

-- R$ por kg (matéria natural) do alimento pelo custo médio do produto ligado no estoque.
create or replace function public.preco_kg_alimento(p_alimento uuid, p_fazenda uuid)
returns numeric language sql stable security definer set search_path to 'public'
as $$
  select round(public.custo_medio_insumo(a.insumo_id, p_fazenda, current_date) * public.kg_para_estoque(a.insumo_id, 1), 4)
  from alimentos a where a.id = p_alimento and a.insumo_id is not null
$$;
grant execute on function public.preco_kg_alimento(uuid, uuid) to authenticated;

-- Dieta que vale para o lote no dia (a mais recente com fornecimento automático).
create or replace function public.dieta_vigente(p_lote uuid, p_data date)
returns uuid language sql stable set search_path to 'public'
as $$
  select d.id from dietas d
  where d.lote_id = p_lote and d.fornecimento_auto and coalesce(d.fornecer_desde, d.data) <= p_data
  order by coalesce(d.fornecer_desde, d.data) desc, d.numero desc
  limit 1
$$;

-- Baixa do estoque de um item do trato (até o saldo disponível; o que faltar fica marcado).
create or replace function public.baixar_item_trato(p_item uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare it fornecimento_itens%rowtype; f fornecimentos%rowtype; v_q numeric; v_ja numeric; v_saldo numeric; v_baixa numeric; v_nome text;
begin
  select * into it from fornecimento_itens where id = p_item;
  select * into f from fornecimentos where id = it.fornecimento_id;
  if it.insumo_id is null then
    update fornecimento_itens set falta_kg = kg_servido, sem_estoque = 'sem_ligacao' where id = p_item;
    return;
  end if;
  v_q := public.kg_para_estoque(it.insumo_id, it.kg_servido);
  if v_q is null then
    update fornecimento_itens set falta_kg = kg_servido, sem_estoque = 'sem_conversao' where id = p_item;
    return;
  end if;
  v_ja := it.qtd_estoque;
  if v_q - v_ja <= 0.00005 then
    update fornecimento_itens set falta_kg = 0, sem_estoque = null where id = p_item;
    return;
  end if;
  v_saldo := public.saldo_insumo(f.fazenda_id, it.insumo_id);
  v_baixa := round(least(v_q - v_ja, greatest(v_saldo, 0)), 4);
  if v_baixa > 0 then
    select 'Lote ' || coalesce(numero::text, '') into v_nome from lotes where id = f.lote_id;
    insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, valor_unitario, fornecimento_id, observacoes)
    values (f.fazenda_id, it.insumo_id, f.data, 'saida', v_baixa,
            coalesce(public.custo_medio_insumo(it.insumo_id, f.fazenda_id, f.data), public.custo_medio_insumo(it.insumo_id, f.fazenda_id, current_date), 0),
            f.id, 'Trato – ' || coalesce(v_nome, 'lote'));
  end if;
  update fornecimento_itens
     set qtd_estoque = v_ja + v_baixa,
         falta_kg = case when v_q > 0 then round(it.kg_servido * greatest(0, 1 - (v_ja + v_baixa) / v_q), 3) else 0 end,
         sem_estoque = null
   where id = p_item;
end $$;

-- =====================================================================================
-- 4. Gera o trato de cada dia pela dieta do lote e baixa o estoque (roda sozinho toda madrugada
--    e também quando alguém abre a tela do Trato). Completa o que faltou quando chega estoque.
-- =====================================================================================
create or replace function public.gerar_fornecimentos(p_fazenda uuid default null)
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare l record; d date; v_dieta uuid; v_cab int; v_id uuid; n int := 0; it record; x record;
begin
  if p_fazenda is not null and auth.uid() is not null and not public.acesso_fazenda(p_fazenda) then
    raise exception 'Você não tem acesso a esta fazenda.';
  end if;
  -- 1) o que faltou de estoque nos dias anteriores, se agora houver
  for x in select fi.id from fornecimento_itens fi join fornecimentos f on f.id = fi.fornecimento_id
           where fi.falta_kg > 0 and fi.sem_estoque is null and fi.insumo_id is not null
             and (p_fazenda is null or f.fazenda_id = p_fazenda) and f.data >= current_date - 60 loop
    perform public.baixar_item_trato(x.id);
  end loop;
  -- 2) os dias que ainda não têm trato (até 31 dias para trás)
  for l in select lo.id, lo.fazenda_id,
             greatest(min(coalesce(dt.fornecer_desde, dt.data)), current_date - 31) as inicio
           from lotes lo join dietas dt on dt.lote_id = lo.id and dt.fornecimento_auto
           where lo.situacao = 'ativo' and (p_fazenda is null or lo.fazenda_id = p_fazenda)
           group by lo.id, lo.fazenda_id loop
    d := greatest(l.inicio, coalesce((select max(f.data) + 1 from fornecimentos f where f.lote_id = l.id), l.inicio));
    while d <= current_date loop
      v_dieta := public.dieta_vigente(l.id, d);
      select count(*) into v_cab from animais where lote_id = l.id and situacao = 'ativo';
      if v_dieta is not null and v_cab > 0 and not exists (select 1 from fornecimentos where lote_id = l.id and data = d) then
        insert into fornecimentos (fazenda_id, lote_id, dieta_id, data, cabecas) values (l.fazenda_id, l.id, v_dieta, d, v_cab)
        returning id into v_id;
        for it in select di.ordem, di.alimento_id, di.nome, di.kg_mn, a.insumo_id
                  from dieta_itens di left join alimentos a on a.id = di.alimento_id
                  where di.dieta_id = v_dieta and di.kg_mn > 0 order by di.ordem loop
          insert into fornecimento_itens (fornecimento_id, fazenda_id, ordem, alimento_id, insumo_id, nome, kg_previsto, kg_servido)
          values (v_id, l.fazenda_id, it.ordem, it.alimento_id, it.insumo_id, it.nome, round(it.kg_mn * v_cab, 2), round(it.kg_mn * v_cab, 2));
        end loop;
        for x in select id from fornecimento_itens where fornecimento_id = v_id loop
          perform public.baixar_item_trato(x.id);
        end loop;
        n := n + 1;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return n;
end $$;
grant execute on function public.gerar_fornecimentos(uuid) to authenticated;

-- Correção do que foi servido no dia (só a exceção). sem_trato = não houve trato: devolve tudo ao estoque.
create or replace function public.corrigir_fornecimento(p jsonb)
returns json language plpgsql security definer set search_path to 'public'
as $$
declare f fornecimentos%rowtype; x jsonb; v_sem boolean := coalesce((p->>'sem_trato')::boolean, false); r record;
begin
  select * into f from fornecimentos where id = (p->>'id')::uuid;
  if f.id is null then raise exception 'Trato não encontrado.'; end if;
  if not public.acesso_fazenda(f.fazenda_id) then raise exception 'Você não tem acesso a esta fazenda.'; end if;
  -- desfaz a baixa do dia e refaz com o que foi servido
  delete from estoque_movimentos where fornecimento_id = f.id;
  update fornecimento_itens set qtd_estoque = 0, falta_kg = 0, sem_estoque = null where fornecimento_id = f.id;
  if v_sem then
    update fornecimento_itens set kg_servido = 0 where fornecimento_id = f.id;
  else
    for x in select * from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) loop
      if coalesce((x->>'kg_servido')::numeric, 0) < 0 then raise exception 'Quantidade negativa.'; end if;
      update fornecimento_itens set kg_servido = round((x->>'kg_servido')::numeric, 2)
       where id = (x->>'id')::uuid and fornecimento_id = f.id;
    end loop;
  end if;
  update fornecimentos set situacao = case when v_sem then 'sem_trato'
                                           when exists (select 1 from fornecimento_itens where fornecimento_id = f.id and kg_servido <> kg_previsto) then 'corrigido'
                                           else 'automatico' end,
         observacoes = coalesce(nullif(trim(p->>'obs'), ''), observacoes), updated_by = auth.uid()
   where id = f.id;
  for r in select id from fornecimento_itens where fornecimento_id = f.id and kg_servido > 0 loop
    perform public.baixar_item_trato(r.id);
  end loop;
  return json_build_object('id', f.id, 'situacao', (select situacao from fornecimentos where id = f.id));
end $$;
grant execute on function public.corrigir_fornecimento(jsonb) to authenticated;

-- =====================================================================================
-- 5. Dieta: grava também os tratos por dia e o fornecimento automático
-- =====================================================================================
create or replace function public.salvar_dieta(p jsonb)
returns json language plpgsql set search_path to 'public'
as $function$
declare v_id uuid; v_num int; it jsonb; i int := 0;
begin
  if p->>'id' is null then
    insert into public.dietas (fazenda_id, data, aptidao, lote_id, descricao, cabecas, pv, ecc, gmd, leite_l, gordura, del,
      genetica_tipo, cms_perc_pv, cms_kg, meta_pb, meta_ndt, meta_fdn_min, observacoes, tratos_dia, fornecimento_auto, fornecer_desde)
    values ((p->>'fazenda_id')::uuid, (p->>'data')::date, p->>'aptidao', nullif(p->>'lote_id','')::uuid, nullif(trim(p->>'descricao'),''),
      coalesce((p->>'cabecas')::int,0), (p->>'pv')::numeric, (p->>'ecc')::smallint, (p->>'gmd')::numeric, (p->>'leite_l')::numeric,
      (p->>'gordura')::numeric, (p->>'del')::int, p->>'genetica_tipo', (p->>'cms_perc_pv')::numeric, (p->>'cms_kg')::numeric,
      (p->>'meta_pb')::numeric, (p->>'meta_ndt')::numeric, (p->>'meta_fdn_min')::numeric, nullif(trim(p->>'observacoes'),''),
      nullif(p->>'tratos_dia','')::smallint, coalesce((p->>'fornecimento_auto')::boolean, false), nullif(p->>'fornecer_desde','')::date)
    returning id, numero into v_id, v_num;
  else
    v_id := (p->>'id')::uuid;
    update public.dietas set data = (p->>'data')::date, aptidao = p->>'aptidao', lote_id = nullif(p->>'lote_id','')::uuid,
      descricao = nullif(trim(p->>'descricao'),''), cabecas = coalesce((p->>'cabecas')::int,0), pv = (p->>'pv')::numeric,
      ecc = (p->>'ecc')::smallint, gmd = (p->>'gmd')::numeric, leite_l = (p->>'leite_l')::numeric, gordura = (p->>'gordura')::numeric,
      del = (p->>'del')::int, genetica_tipo = p->>'genetica_tipo', cms_perc_pv = (p->>'cms_perc_pv')::numeric, cms_kg = (p->>'cms_kg')::numeric,
      meta_pb = (p->>'meta_pb')::numeric, meta_ndt = (p->>'meta_ndt')::numeric, meta_fdn_min = (p->>'meta_fdn_min')::numeric,
      observacoes = nullif(trim(p->>'observacoes'),''),
      tratos_dia = nullif(p->>'tratos_dia','')::smallint, fornecimento_auto = coalesce((p->>'fornecimento_auto')::boolean, false),
      fornecer_desde = nullif(p->>'fornecer_desde','')::date
    where id = v_id returning numero into v_num;
    if v_num is null then raise exception 'Dieta não encontrada.'; end if;
    delete from public.dieta_itens where dieta_id = v_id;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    i := i + 1;
    insert into public.dieta_itens (dieta_id, ordem, alimento_id, nome, tipo, kg_mn, ms, pb, ndt, fdn, preco_kg_mn)
    values (v_id, i, nullif(it->>'alimento_id','')::uuid, it->>'nome', it->>'tipo', (it->>'kg_mn')::numeric,
      (it->>'ms')::numeric, (it->>'pb')::numeric, (it->>'ndt')::numeric, (it->>'fdn')::numeric, (it->>'preco_kg_mn')::numeric);
  end loop;

  if coalesce((p->>'fornecimento_auto')::boolean, false) and nullif(p->>'lote_id','') is not null then
    perform public.gerar_fornecimentos((p->>'fazenda_id')::uuid);
  end if;
  return json_build_object('id', v_id, 'numero', v_num);
end $function$;

-- =====================================================================================
-- 6. Silagem e volumoso comprados vão para a conta da silagem na Pecuária
-- =====================================================================================
create or replace function public.conta_do_insumo(p_insumo uuid, p_centro uuid)
returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_cat text; v_classe text; v_cod text; v_pref text; v_g3 text; v_s4 text; v_id uuid;
begin
  select lower(coalesce(categoria,'')), coalesce(atributos->>'classe','') into v_cat, v_classe from insumos where id = p_insumo;
  select coalesce(pc.codigo, pp.codigo) into v_cod
    from centros_custo cc
    left join plano_contas pc on pc.id = cc.conta_plano_id
    left join centros_custo pai on pai.id = cc.centro_pai_id
    left join plano_contas pp on pp.id = pai.conta_plano_id
   where cc.id = p_centro;
  if v_cod ~ '^4\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}$' and v_cod not like '%.999' then
    select id into v_id from plano_contas where codigo = v_cod and ativa;
    if v_id is not null then return v_id; end if;
  end if;
  if v_cod is null or v_cod !~ '^4\.[0-9]{2}\.[0-9]{2}' then return null; end if;
  v_pref := split_part(v_cod,'.',1) || '.' || split_part(v_cod,'.',2);
  v_g3 := split_part(v_cod,'.',3);
  v_s4 := case
    when v_cat in ('fertilizante','adubo','corretivo') then case v_g3 when '01' then '001' when '02' then '010' end
    when v_cat = 'defensivo' then case v_g3 when '01' then case when v_classe ~* 'inset|fung' then '003' else '002' end when '02' then '011' end
    when v_cat = 'semente' then case v_g3 when '01' then '004' end
    when v_cat = 'combustivel' then case v_g3 when '01' then '006' when '02' then '013' when '10' then '010' end
    when v_cat = 'peca' then case v_g3 when '01' then '007' when '02' then '014' when '10' then '011' end
    when v_cat = 'racao' then case v_g3 when '02' then '004' end
    when v_cat in ('silagem','volumoso') then case v_g3 when '02' then '005' end
    when v_cat in ('sal_mineral','sal','proteinado','suplemento') then case v_g3 when '02' then '003' end
    when v_cat in ('medicamento','vacina') then case v_g3 when '02' then '008' end
    when v_cat in ('semen','embriao') then case v_g3 when '02' then '009' end
  end;
  select id into v_id from plano_contas where codigo = v_pref || '.' || v_g3 || '.' || coalesce(v_s4, '999') and ativa;
  if v_id is null then select id into v_id from plano_contas where codigo = v_pref || '.' || v_g3 || '.999'; end if;
  return v_id;
end $function$;

-- =====================================================================================
-- 7. Roda sozinho toda madrugada (5h10, horário de Brasília = 8h10 UTC)
-- =====================================================================================
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'fazenda-digital-trato-diario') then
    perform cron.schedule('fazenda-digital-trato-diario', '10 8 * * *', 'select public.gerar_fornecimentos(null)');
  end if;
end $$;

-- =====================================================================================
-- 8. O trato entra no resultado (centro de custo do lote) e no fechamento do mês
-- =====================================================================================
create or replace function public.movimentos_resultado(p_prefixos text[], p_de date, p_ate date, p_conta text default null)
returns table(data date, conta_id uuid, conta_codigo text, valor numeric, origem text, origem_id uuid, documento text, historico text, pessoa text, centro text)
language sql stable set search_path to 'public'
as $function$
  with tit as (
    select l.id, l.fazenda_id, l.tipo, l.numero, l.parcela, l.total_parcelas, l.descricao, l.valor, l.data_emissao,
      l.conta_contabil_id, l.compra_id, l.venda_id, l.financiamento_id, l.centro_custo_id, l.pessoa_id, l.situacao, l.abertura,
      case when fp.id is not null and (fp.principal + fp.juros + fp.vm) > 0 then (fp.juros + fp.vm) / (fp.principal + fp.juros + fp.vm) else 0 end as fj
    from lancamentos l left join financiamento_parcelas fp on fp.lancamento_id = l.id
    where l.situacao <> 'cancelado'
  ),
  rotulo as (
    select t.*,
      case when t.compra_id is not null then 'Compra nº ' || (select numero from compras where id = t.compra_id)
           when t.venda_id is not null then 'Venda nº ' || (select numero from vendas where id = t.venda_id)
           when t.financiamento_id is not null then 'Financiamento nº ' || (select numero from financiamentos where id = t.financiamento_id)
           else 'Título nº ' || coalesce(t.numero::text, '') end
        || case when t.total_parcelas > 1 then ' – parcela ' || t.parcela || '/' || t.total_parcelas else '' end as doc,
      (select nome from pessoas where id = t.pessoa_id) as pes,
      coalesce((select cc.codigo || ' ' || cc.nome from centros_custo cc where cc.id = t.centro_custo_id),
        (select string_agg(cc.codigo || ' ' || cc.nome || ' ' || trim(to_char(r.percentual, 'FM990D00')) || '%', ' / ') from lancamento_rateios r join centros_custo cc on cc.id = r.centro_custo_id where r.lancamento_id = t.id),
        (select string_agg(cc.codigo || ' ' || cc.nome || ' ' || trim(to_char(r.percentual, 'FM990D00')) || '%', ' / ') from compra_rateios r join centros_custo cc on cc.id = r.centro_custo_id where r.compra_id = t.compra_id)) as cen
    from tit t
  ),
  mov as materialized (   -- V175: calculado uma vez só (sem isso, o plano refazia as contas a cada linha)
    select r.data_emissao as data, x.conta, x.v * case when r.tipo = 'receber' then 1 else -1 end as credito,
      'titulo'::text as origem, r.id as origem_id, r.doc as documento, coalesce(r.descricao, '') || x.compl as historico, r.pes as pessoa, r.cen as centro
    from rotulo r cross join lateral (values
      (r.conta_contabil_id, round(r.valor * (1 - r.fj), 2), ''::text),
      (public.conta_do_tipo('juros', r.fazenda_id), r.valor - round(r.valor * (1 - r.fj), 2), ' (juros e variação monetária)')
    ) as x(conta, v, compl)
    where not coalesce(r.abertura, false) and r.data_emissao between p_de and p_ate and x.v <> 0
    union all
    select b.data, x.conta, x.credito, 'titulo', r.id, r.doc, coalesce(r.descricao, '') || x.compl, r.pes, r.cen
    from baixas b join rotulo r on r.id = b.lancamento_id
      cross join lateral (values
        (public.conta_do_tipo(case when r.tipo = 'receber' then 'rendimentos' else 'juros' end, r.fazenda_id),
          (coalesce(b.juros, 0) + coalesce(b.multa, 0)) * case when r.tipo = 'receber' then 1 else -1 end, ' (juros e multa por atraso)'::text),
        (public.conta_do_tipo(case when r.tipo = 'receber' then 'desconto_concedido' else 'desconto_obtido' end, r.fazenda_id),
          coalesce(b.desconto, 0) * case when r.tipo = 'receber' then -1 else 1 end, ' (desconto)')
      ) as x(conta, credito, compl)
    where b.situacao = 'confirmada' and b.data between p_de and p_ate and x.credito <> 0
    union all
    select v.data, v.conta_id, -v.valor, v.origem, v.origem_id,
      case v.origem when 'atividade' then 'Atividade nº ' || coalesce((select a.numero::text from atividades_agricolas a where a.id = v.origem_id), '')
                    else 'Abastecimento nº ' || coalesce((select f.numero::text from frota_abastecimentos f where f.id = v.origem_id), '') end,
      case v.origem when 'atividade' then coalesce((select initcap(replace(a.tipo, '_', ' ')) || coalesce(' – ' || nullif(a.descricao, ''), '') from atividades_agricolas a where a.id = v.origem_id), '') || ': '
                    else '' end
        || coalesce((select i.nome from insumos i where i.id = v.insumo_id), '') || case when v.valor < 0 then ' (retorno ao estoque)' else '' end,
      null::text,
      (select cc.codigo || ' ' || cc.nome from centros_custo cc where cc.id = v.centro_custo_id)
    from v_consumos_classificados v
    where v.data between p_de and p_ate and v.valor <> 0
    union all
    select em.data, coalesce(public.conta_do_insumo(em.insumo_id, cl.id), public.conta_a_classificar(em.fazenda_id)),
      -round(em.quantidade * em.valor_unitario * case when em.tipo = 'entrada' then -1 else 1 end, 2),
      'sanidade', s.id, 'Sanidade', initcap(coalesce(s.tipo, '')) || ': ' || coalesce((select i.nome from insumos i where i.id = em.insumo_id), ''),
      null, (select cc.codigo || ' ' || cc.nome from centros_custo cc where cc.id = cl.id)
    from estoque_movimentos em join sanidade s on s.id = em.sanidade_id
      left join lateral (select c.id from centros_custo c where c.lote_id = s.lote_id limit 1) cl on true
    where em.sanidade_id is not null and em.data between p_de and p_ate
    union all
    -- V175: trato do lote (fornecimento da dieta): o que saiu do estoque vai para o centro do lote
    select em.data, coalesce(public.conta_do_insumo(em.insumo_id, cl.id), public.conta_a_classificar(em.fazenda_id)),
      -round(em.quantidade * coalesce(em.valor_unitario, 0), 2),
      'fornecimento', f.id, 'Trato do lote ' || coalesce((select lo.numero::text from lotes lo where lo.id = f.lote_id), ''),
      'Trato: ' || coalesce((select i.nome from insumos i where i.id = em.insumo_id), ''),
      null, (select cc.codigo || ' ' || cc.nome from centros_custo cc where cc.id = cl.id)
    from estoque_movimentos em join fornecimentos f on f.id = em.fornecimento_id
      left join lateral (select c.id from centros_custo c where c.lote_id = f.lote_id limit 1) cl on true
    where em.fornecimento_id is not null and em.data between p_de and p_ate
    union all
    -- V174: depreciação e exaustão do mês (calculadas a partir do Imobilizado; nada é digitado)
    select d.data, d.conta_id, -d.valor, 'depreciacao', d.imobilizado_id, d.documento, d.historico, null,
      (select cc.codigo || ' ' || cc.nome from centros_custo cc where cc.id = d.centro_custo_id)
    from public.depreciacao_mensal(p_de, p_ate) d
    where d.valor <> 0
  )
  select m.data, pc.id, pc.codigo,
    round(case when pc.codigo like '3.%' then m.credito else -m.credito end, 2) as valor,
    m.origem, m.origem_id, m.documento, m.historico, m.pessoa, m.centro
  from mov m join plano_contas pc on pc.id = m.conta
  where m.conta is not null
    and exists (select 1 from unnest(p_prefixos) p where pc.codigo like p || '.%')
    and (p_conta is null or pc.codigo = p_conta or pc.codigo like p_conta || '.%')
  order by m.data, pc.codigo, m.documento, m.origem_id, m.centro, m.credito
$function$;

create or replace function public.fechamento_mes(p_fazendas uuid[], p_de date, p_ate date)
returns json language sql stable set search_path to 'public'
as $$
  with pref as (
    select pc.codigo from plano_contas pc
    where pc.codigo ~ '^4\.\d{2}$'
      and (pc.fazenda_id = any(p_fazendas)
           or (pc.fazenda_id is null and coalesce(pc.adm, false) and '00000000-0000-0000-0000-000000000000'::uuid = any(p_fazendas)))
  ),
  mov as (
    select m.* from public.movimentos_resultado(coalesce((select array_agg(codigo) from pref), array['x']), p_de, p_ate) m
  ),
  bens as (
    select i.* from imobilizados i
    where (i.fazenda_id = any(p_fazendas) or (i.fazenda_id is null and '00000000-0000-0000-0000-000000000000'::uuid = any(p_fazendas)))
      and i.situacao = 'ativo'
  )
  select json_build_object(
    'depreciacao', coalesce((select sum(valor) from mov where origem = 'depreciacao'), 0),
    'depreciacao_bens', (select count(distinct origem_id) from mov where origem = 'depreciacao'),
    'depreciacao_centros', coalesce((select json_agg(x order by x.centro) from (
        select coalesce(centro, 'Sem centro (Despesas Operacionais)') as centro, sum(valor) as valor from mov where origem = 'depreciacao' group by 1) x), '[]'::json),
    'a_classificar_valor', coalesce((select sum(valor) from mov where conta_codigo like '%.999'), 0),
    'a_classificar_qtde', (select count(*) from mov where conta_codigo like '%.999'),
    'a_classificar_contas', coalesce((select json_agg(distinct conta_codigo) from mov where conta_codigo like '%.999'), '[]'::json),
    'sem_centro_valor', coalesce((select sum(valor) from mov where centro is null and origem <> 'depreciacao'), 0),
    'sem_centro_qtde', (select count(*) from mov where centro is null and origem <> 'depreciacao'),
    'bens_sem_rateio', coalesce((select json_agg(json_build_object('id', b.id, 'numero', b.numero, 'nome', b.nome)) from bens b
        where not exists (select 1 from imobilizado_rateios r where r.imobilizado_id = b.id)), '[]'::json),
    'bens_sem_vida', coalesce((select json_agg(json_build_object('id', b.id, 'numero', b.numero, 'nome', b.nome)) from bens b
        where coalesce(b.vida_util, 0) <= 0 or b.data_ativacao is null or coalesce(b.valor_aquisicao, 0) <= 0), '[]'::json),
    'tem_rateio_depreciacao', exists (select 1 from rateios_padrao rp where rp.chave = 'depreciacao'
        and (rp.fazenda_id = any(p_fazendas) or (rp.fazenda_id is null and '00000000-0000-0000-0000-000000000000'::uuid = any(p_fazendas)))),
    'custos', coalesce((select sum(valor) from mov), 0),
    -- V175: trato servido sem estoque para baixar (falta de produto, alimento sem ligação ou sem conversão para kg)
    'trato_faltas', coalesce((select json_agg(json_build_object('data', f.data, 'lote', (select lo.numero from lotes lo where lo.id = f.lote_id),
        'item', fi.nome, 'kg', fi.falta_kg, 'motivo', coalesce(fi.sem_estoque, 'falta')) order by f.data, fi.nome)
      from fornecimento_itens fi join fornecimentos f on f.id = fi.fornecimento_id
      where fi.falta_kg > 0 and f.data between p_de and p_ate
        and (f.fazenda_id = any(p_fazendas))), '[]'::json)
  )
$$;
grant execute on function public.fechamento_mes(uuid[], date, date) to authenticated;

select 'V175 ok | parâmetros: ' || (select count(*) from parametros) || ' | tarefa do trato: ' || (select count(*) from cron.job where jobname = 'fazenda-digital-trato-diario');
