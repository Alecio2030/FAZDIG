-- FAZENDA DIGITAL V174 – Parâmetros, rateio padrão, depreciação/exaustão no resultado e fechamento do mês
-- Não apaga nem altera dados lançados. Pode rodar mais de uma vez.

-- =====================================================================================
-- 1. PARÂMETROS do sistema (valores usuais já preenchidos; o operador muda se quiser)
-- =====================================================================================
create table if not exists public.parametros (
  chave text primary key,
  grupo text not null,
  rotulo text not null,
  unidade text,
  valor_padrao numeric not null,
  valor numeric,
  ordem integer not null default 0,
  ajuda text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.parametros enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'parametros' and policyname = 'parametros_select') then
    create policy parametros_select on public.parametros for select using (public.e_usuario());
  end if;
end $$;

-- Imobilizado: vida útil (anos) e valor residual (%) usuais de cada categoria (uso gerencial)
insert into public.parametros (chave, grupo, rotulo, unidade, valor_padrao, ordem, ajuda) values
  ('vida_tratores', 'Imobilizado', 'Tratores', 'anos', 10, 101, null),
  ('resid_tratores', 'Imobilizado', 'Tratores', '%', 10, 102, null),
  ('vida_maquinas', 'Imobilizado', 'Máquinas agrícolas', 'anos', 10, 103, null),
  ('resid_maquinas', 'Imobilizado', 'Máquinas agrícolas', '%', 10, 104, null),
  ('vida_implementos', 'Imobilizado', 'Implementos', 'anos', 10, 105, null),
  ('resid_implementos', 'Imobilizado', 'Implementos', '%', 10, 106, null),
  ('vida_veiculos', 'Imobilizado', 'Veículos', 'anos', 5, 107, null),
  ('resid_veiculos', 'Imobilizado', 'Veículos', '%', 20, 108, null),
  ('vida_benfeitorias', 'Imobilizado', 'Benfeitorias e construções', 'anos', 25, 109, null),
  ('resid_benfeitorias', 'Imobilizado', 'Benfeitorias e construções', '%', 0, 110, null),
  ('vida_cercas', 'Imobilizado', 'Cercas e currais', 'anos', 10, 111, null),
  ('resid_cercas', 'Imobilizado', 'Cercas e currais', '%', 0, 112, null),
  ('vida_barragens', 'Imobilizado', 'Barragens, represas e açudes', 'anos', 25, 113, null),
  ('resid_barragens', 'Imobilizado', 'Barragens, represas e açudes', '%', 0, 114, null),
  ('vida_estradas', 'Imobilizado', 'Estradas, terraplanagem e drenagem', 'anos', 10, 115, null),
  ('resid_estradas', 'Imobilizado', 'Estradas, terraplanagem e drenagem', '%', 0, 116, null),
  ('vida_equipamentos', 'Imobilizado', 'Equipamentos', 'anos', 10, 117, null),
  ('resid_equipamentos', 'Imobilizado', 'Equipamentos', '%', 10, 118, null),
  ('vida_outros', 'Imobilizado', 'Outros bens', 'anos', 10, 119, null),
  ('resid_outros', 'Imobilizado', 'Outros bens', '%', 0, 120, null),
  ('vida_cafe', 'Imobilizado', 'Lavoura de café (exaustão)', 'anos', 15, 121, null),
  ('resid_cafe', 'Imobilizado', 'Lavoura de café (exaustão)', '%', 0, 122, null),
  ('vida_perene', 'Imobilizado', 'Outra cultura perene / pomar (exaustão)', 'anos', 15, 123, null),
  ('resid_perene', 'Imobilizado', 'Outra cultura perene / pomar (exaustão)', '%', 0, 124, null),
  ('vida_pastagem', 'Imobilizado', 'Pastagem plurianual (exaustão)', 'anos', 8, 125, null),
  ('resid_pastagem', 'Imobilizado', 'Pastagem plurianual (exaustão)', '%', 0, 126, null)
on conflict (chave) do nothing;

create or replace function public.param(p_chave text)
returns numeric language sql stable security definer set search_path to 'public'
as $$ select coalesce(valor, valor_padrao) from parametros where chave = p_chave $$;

-- Grava os valores (null = volta ao usual). Só Produtor, Administrador e Escritório.
create or replace function public.salvar_parametros(p jsonb)
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare x jsonb; n integer := 0; v numeric;
begin
  if not (public.e_dono() or public.e_escritorio() or public.e_admin_sistema()) then
    raise exception 'Só o Produtor, o Administrador ou o Escritório mudam os parâmetros.';
  end if;
  for x in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    v := nullif(x->>'valor', '')::numeric;
    if v is not null and v < 0 then raise exception 'Valor negativo em %.', x->>'chave'; end if;
    update parametros set valor = v, updated_at = now(), updated_by = auth.uid()
     where chave = x->>'chave' and valor is distinct from v;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
grant execute on function public.param(text) to authenticated;
grant execute on function public.salvar_parametros(jsonb) to authenticated;

-- =====================================================================================
-- 2. RATEIO PADRÃO por unidade: o que o operador informou na 1ª vez fica guardado
--    chave = tipo da despesa (ex.: energia), 'geral' (qualquer despesa) ou 'depreciacao' (bem sem rateio)
-- =====================================================================================
create table if not exists public.rateios_padrao (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references public.fazendas(id),
  chave text not null,
  centro_custo_id uuid not null references public.centros_custo(id),
  percentual numeric(7,4) not null check (percentual > 0 and percentual <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists rateios_padrao_un on public.rateios_padrao
  (coalesce(fazenda_id, '00000000-0000-0000-0000-000000000000'::uuid), chave, centro_custo_id);
alter table public.rateios_padrao enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rateios_padrao' and policyname = 'rateios_padrao_select') then
    create policy rateios_padrao_select on public.rateios_padrao for select using (public.acesso_fazenda(fazenda_id));
  end if;
end $$;

-- Troca o rateio padrão de uma chave da unidade (lista vazia = apaga).
create or replace function public.salvar_rateio_padrao(p_fazenda uuid, p_chave text, p_rateio jsonb)
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare s numeric; n integer;
begin
  if not public.acesso_fazenda(p_fazenda) then raise exception 'Você não tem acesso a esta unidade.'; end if;
  if coalesce(trim(p_chave), '') = '' then raise exception 'Chave do rateio em branco.'; end if;
  select coalesce(sum((x->>'percentual')::numeric), 0), count(*) into s, n from jsonb_array_elements(coalesce(p_rateio, '[]'::jsonb)) x;
  if n > 0 and abs(s - 100) > 0.001 then raise exception 'O rateio padrão precisa somar 100%% (soma %).', s; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_rateio, '[]'::jsonb)) x
              join centros_custo c on c.id = (x->>'centro_custo_id')::uuid
             where c.fazenda_id is distinct from p_fazenda) then
    raise exception 'Há centro de custo de outra unidade no rateio.';
  end if;
  delete from rateios_padrao where fazenda_id is not distinct from p_fazenda and chave = p_chave;
  insert into rateios_padrao (fazenda_id, chave, centro_custo_id, percentual, updated_by)
  select p_fazenda, p_chave, (x->>'centro_custo_id')::uuid, (x->>'percentual')::numeric, auth.uid()
    from jsonb_array_elements(coalesce(p_rateio, '[]'::jsonb)) x;
  return n;
end $$;
grant execute on function public.salvar_rateio_padrao(uuid, text, jsonb) to authenticated;

-- =====================================================================================
-- 3. CONTAS de depreciação e exaustão (criadas numa fazenda, o plano espelho copia para todas)
-- =====================================================================================
do $$
declare v_base text;
begin
  select min(codigo) into v_base from plano_contas where codigo ~ '^4\.\d{2}$' and not coalesce(adm, false);
  if v_base is null then return; end if;
  perform public.conta_garantir(v_base || '.01.014', 'Depreciação de Máquinas e Benfeitorias', true);
  perform public.conta_garantir(v_base || '.01.015', 'Exaustão de Lavouras', true);
  perform public.conta_garantir(v_base || '.02.019', 'Depreciação de Máquinas e Benfeitorias', true);
  perform public.conta_garantir(v_base || '.02.020', 'Exaustão de Pastagens', true);
  perform public.conta_garantir(v_base || '.10.016', 'Depreciação de Máquinas, Veículos e Benfeitorias', true);
end $$;

-- Conta da quota do mês conforme o centro que recebe (Agrícola, Pecuária ou demais) e o método.
create or replace function public.conta_depreciacao(p_centro uuid, p_faz uuid, p_exaustao boolean)
returns uuid language plpgsql stable security definer set search_path to 'public'
as $$
declare v_cod text; v_pref text; v_g3 text; v_id uuid;
begin
  select coalesce(pc.codigo, pp.codigo) into v_cod
    from centros_custo cc
    left join plano_contas pc on pc.id = cc.conta_plano_id
    left join centros_custo pai on pai.id = cc.centro_pai_id
    left join plano_contas pp on pp.id = pai.conta_plano_id
   where cc.id = p_centro;
  if v_cod is null or v_cod !~ '^4\.\d{2}\.\d{2}' then
    select codigo into v_pref from plano_contas
     where codigo ~ '^4\.\d{2}$' and (fazenda_id = p_faz or (p_faz is null and coalesce(adm, false))) limit 1;
    v_g3 := '10';
  else
    v_pref := split_part(v_cod, '.', 1) || '.' || split_part(v_cod, '.', 2);
    v_g3 := split_part(v_cod, '.', 3);
  end if;
  if v_pref is null then return null; end if;
  select id into v_id from plano_contas where codigo = v_pref || '.' ||
    case v_g3 when '01' then '01.' || case when p_exaustao then '015' else '014' end
              when '02' then '02.' || case when p_exaustao then '020' else '019' end
              else '10.016' end;
  if v_id is null then v_id := public.conta_a_classificar(p_faz); end if;
  return v_id;
end $$;

-- Quotas mensais de depreciação/exaustão de cada bem, já repartidas pelos centros de custo.
-- Linear por mês, a partir do mês seguinte à ativação; para no fim da vida útil, na baixa e no mês atual.
-- Rateio: o do bem; sem ele, o rateio padrão 'depreciacao' da unidade; sem ele, Despesas Operacionais.
create or replace function public.depreciacao_mensal(p_de date, p_ate date)
returns table(data date, conta_id uuid, valor numeric, imobilizado_id uuid, centro_custo_id uuid, documento text, historico text)
language sql stable set search_path to 'public'
as $$
  with bens as (
    select i.id, i.fazenda_id, i.numero, i.codigo_patrimonial, i.nome, coalesce(i.metodo, 'depreciacao') = 'exaustao' as exaustao,
      date_trunc('month', i.data_ativacao)::date as m0,
      round(coalesce(i.vida_util, 0) * case when i.vida_unidade = 'meses' then 1 else 12 end)::int as meses,
      i.valor_aquisicao * (1 - coalesce(i.residual_perc, 0) / 100) as base,
      case when i.situacao = 'baixado' and i.data_baixa is not null then date_trunc('month', i.data_baixa)::date end as mbaixa
    from imobilizados i
    where i.situacao in ('ativo', 'baixado') and i.data_ativacao is not null and coalesce(i.valor_aquisicao, 0) > 0 and coalesce(i.vida_util, 0) > 0
  ),
  quotas as (
    select b.*, g::date as mes, round(b.base / b.meses, 2) as quota
    from bens b
    cross join lateral generate_series(
      greatest((b.m0 + interval '1 month')::date, date_trunc('month', p_de)::date),
      least((b.m0 + make_interval(months => b.meses))::date, date_trunc('month', current_date)::date,
            coalesce(b.mbaixa, 'infinity'::date), date_trunc('month', p_ate)::date),
      interval '1 month') g
    where b.meses > 0
  ),
  rat as (
    select q.*, r.centro_custo_id as centro, r.percentual
    from quotas q join imobilizado_rateios r on r.imobilizado_id = q.id
    union all
    select q.*, rp.centro_custo_id, rp.percentual
    from quotas q join rateios_padrao rp on rp.fazenda_id is not distinct from q.fazenda_id and rp.chave = 'depreciacao'
    where not exists (select 1 from imobilizado_rateios r where r.imobilizado_id = q.id)
    union all
    select q.*, null::uuid, 100
    from quotas q
    where not exists (select 1 from imobilizado_rateios r where r.imobilizado_id = q.id)
      and not exists (select 1 from rateios_padrao rp where rp.fazenda_id is not distinct from q.fazenda_id and rp.chave = 'depreciacao')
  )
  select (r.mes + interval '1 month' - interval '1 day')::date,
    public.conta_depreciacao(r.centro, r.fazenda_id, r.exaustao),
    round(r.quota * r.percentual / 100, 2),
    r.id, r.centro,
    'Bem nº ' || r.numero || coalesce(' (' || r.codigo_patrimonial || ')', ''),
    case when r.exaustao then 'Exaustão ' else 'Depreciação ' end || to_char(r.mes, 'MM/YYYY') || ': ' || r.nome
  from rat r
  where (r.mes + interval '1 month' - interval '1 day')::date between p_de and p_ate
$$;
grant execute on function public.depreciacao_mensal(date, date) to authenticated;

-- =====================================================================================
-- 4. MOVIMENTOS DO RESULTADO: passa a trazer a depreciação e a exaustão do mês
--    (o resto é igual à versão anterior)
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
  mov as (
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

-- =====================================================================================
-- 5. FECHAMENTO DO MÊS: o que entrou sozinho e o que precisa de alguém
-- =====================================================================================
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
    'custos', coalesce((select sum(valor) from mov), 0)
  )
$$;
grant execute on function public.fechamento_mes(uuid[], date, date) to authenticated;

select 'V174 ok | parâmetros: ' || (select count(*) from parametros)
  || ' | contas de depreciação: ' || (select count(*) from plano_contas where codigo ~ '^4\.\d{2}\.(01\.01[45]|02\.0(19|20)|10\.016)$')
  || ' | quotas deste ano: ' || (select coalesce(sum(valor), 0) from depreciacao_mensal(date_trunc('year', current_date)::date, current_date));
