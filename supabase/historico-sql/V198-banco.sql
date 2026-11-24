-- Fazenda Digital V198 — RODAR NO SQL EDITOR DO SUPABASE ANTES DE PUBLICAR O APP (pode rodar de novo sem problema)

-- 1) Manga: risco de inundação (não tem / total / parcial com %) e grau (baixo, médio, alto)
alter table public.areas
  add column if not exists inundacao_tipo text,
  add column if not exists inundacao_perc numeric(5,2),
  add column if not exists inundacao_risco text;
alter table public.areas drop constraint if exists areas_inundacao_tipo_chk;
alter table public.areas add constraint areas_inundacao_tipo_chk check (inundacao_tipo is null or inundacao_tipo in ('nenhum','total','parcial'));
alter table public.areas drop constraint if exists areas_inundacao_risco_chk;
alter table public.areas add constraint areas_inundacao_risco_chk check (inundacao_risco is null or inundacao_risco in ('baixo','medio','alto'));
alter table public.areas drop constraint if exists areas_inundacao_perc_chk;
alter table public.areas add constraint areas_inundacao_perc_chk check (inundacao_perc is null or (inundacao_perc > 0 and inundacao_perc <= 100));

-- 2) Atividades: vários dias e horários (início e fim de cada um), total de dias e de horas
alter table public.atividades_agricolas
  add column if not exists periodos jsonb,
  add column if not exists dias integer,
  add column if not exists horas_total numeric(10,2);

-- 3) Vendas de produtos do estoque: custo (CMV) e receita próprios
alter table public.venda_itens
  add column if not exists custo_unitario numeric,
  add column if not exists custo_total numeric(14,2);

-- contas no plano (o gatilho espelha em todas as fazendas)
insert into public.plano_contas (codigo, nome, tipo, conta_pai_id, analitica, ativa, sistema)
select '3.01.10.003', 'Venda de Materiais e Insumos', 'receita', id, true, true, true from public.plano_contas
 where codigo = '3.01.10' and not exists (select 1 from public.plano_contas where codigo = '3.01.10.003');
insert into public.plano_contas (codigo, nome, tipo, conta_pai_id, analitica, ativa, sistema)
select '4.01.50.003', 'Custo dos Materiais Vendidos', 'despesa', id, true, true, true from public.plano_contas
 where codigo = '4.01.50' and not exists (select 1 from public.plano_contas where codigo = '4.01.50.003');

insert into public.tipos_lancamento (chave, nome, uso, conta_id, ordem, ativo, padrao)
select 'venda_materiais', 'Venda de materiais e insumos do estoque', 'sistema', id, 48, true, false from public.plano_contas where codigo = '3.01.10.003'
on conflict (chave) do update set conta_id = excluded.conta_id;
insert into public.tipos_lancamento (chave, nome, uso, conta_id, ordem, ativo, padrao)
select 'cmv_materiais', 'Custo dos materiais vendidos', 'sistema', id, 49, true, false from public.plano_contas where codigo = '4.01.50.003'
on conflict (chave) do update set conta_id = excluded.conta_id;

-- venda com produto do estoque: receita em Venda de Materiais e Insumos
create or replace function public.classificar_lancamento()
 returns trigger language plpgsql set search_path to 'public'
as $function$
declare v_tipo text; v_desp text; v_chave text;
begin
  if new.conta_contabil_id is not null then return new; end if;
  if new.compra_id is not null then
    select tipo, tipo_despesa into v_tipo, v_desp from compras where id = new.compra_id;
    if v_tipo = 'despesa' then v_chave := v_desp;
    elsif v_tipo = 'animais' then v_chave := 'compra_animais';
    else
      select 'estoque_' || i.categoria into v_chave from compra_itens ci join insumos i on i.id = ci.insumo_id
        where ci.compra_id = new.compra_id order by ci.valor_total desc limit 1;
    end if;
  elsif new.venda_id is not null then
    select case tipo when 'animais' then 'venda_bovinos' when 'cafe' then 'venda_cafe' else 'outras_receitas' end into v_chave from vendas where id = new.venda_id;
    -- V198: produto do estoque vendido
    if v_chave = 'outras_receitas' and exists (select 1 from venda_itens where venda_id = new.venda_id and tipo_item = 'insumo') then v_chave := 'venda_materiais'; end if;
  elsif new.venda_producao_id is not null then
    v_chave := 'venda_cafe';
  end if;
  if v_chave is not null then new.conta_contabil_id := public.conta_do_tipo(v_chave); end if;
  return new;
end $function$;

-- salvar_venda: a saída do produto vai ao custo médio, gravado no estoque e no item da venda
do $$
declare d text := pg_get_functiondef('public.salvar_venda'::regproc); n text;
begin
  if position('v_cu numeric' in d) > 0 then return; end if; -- já atualizada
  n := replace(d, E'v_qf int; v_mid uuid;\nbegin', E'v_qf int; v_mid uuid; v_cu numeric;\nbegin');
  if n = d then raise exception 'salvar_venda: trecho 1 não encontrado'; end if; d := n;
  n := replace(d, E'      v_q := coalesce(nullif(it->>''quantidade'','''')::numeric, 1);\n', E'      v_q := coalesce(nullif(it->>''quantidade'','''')::numeric, 1);\n      v_cu := null;\n');
  if n = d then raise exception 'salvar_venda: trecho 2 não encontrado'; end if; d := n;
  n := replace(d, E'        insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, venda_id, observacoes, created_by)\n        values (v_faz, (it->>''insumo_id'')::uuid, v_data, ''saida'', v_q, v_id, ''Venda nº '' || v_num, auth.uid());',
    E'        -- V198: sai do estoque pelo custo médio (vai para Custo dos Materiais Vendidos)\n        v_cu := public.custo_medio_insumo((it->>''insumo_id'')::uuid, v_faz, v_data);\n        insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, valor_unitario, venda_id, observacoes, created_by)\n        values (v_faz, (it->>''insumo_id'')::uuid, v_data, ''saida'', v_q, v_cu, v_id, ''Venda nº '' || v_num, auth.uid());');
  if n = d then raise exception 'salvar_venda: trecho 3 não encontrado'; end if; d := n;
  n := replace(d, 'insert into venda_itens (fazenda_id, venda_id, tipo_item, cafe_lote_id, cafe_local_id, insumo_id, descricao, quantidade, unidade, valor_unitario, valor_total)',
    'insert into venda_itens (fazenda_id, venda_id, tipo_item, cafe_lote_id, cafe_local_id, insumo_id, descricao, quantidade, unidade, valor_unitario, valor_total, custo_unitario, custo_total)');
  if n = d then raise exception 'salvar_venda: trecho 4 não encontrado'; end if; d := n;
  n := replace(d, E'(it->>''valor_total'')::numeric), (it->>''valor_total'')::numeric);\n    end loop;',
    E'(it->>''valor_total'')::numeric), (it->>''valor_total'')::numeric, v_cu, round(v_q * v_cu, 2));\n    end loop;');
  if n = d then raise exception 'salvar_venda: trecho 5 não encontrado'; end if; d := n;
  execute d;
end $$;

-- resultado: Custo dos Materiais Vendidos pela saída do estoque na venda
do $$
declare d text := pg_get_functiondef('public.movimentos_resultado'::regproc); n text;
begin
  if position('cmv_materiais' in d) > 0 then return; end if; -- já atualizada
  n := replace(d, E'    union all\n    select d.data, d.conta_id, -d.valor, ''depreciacao''',
    E'    union all\n    select em.data, public.conta_do_tipo(''cmv_materiais'', em.fazenda_id), -round(em.quantidade * em.valor_unitario, 2),\n      ''venda'', v.id, ''Venda nº '' || v.numero, ''Custo do material vendido: '' || coalesce((select i.nome from insumos i where i.id = em.insumo_id), ''''),\n      (select nome from pessoas where id = v.pessoa_id), null::text\n    from estoque_movimentos em join vendas v on v.id = em.venda_id\n    where em.tipo = ''saida'' and coalesce(em.valor_unitario, 0) > 0 and em.data between p_de and p_ate\n    union all\n    select d.data, d.conta_id, -d.valor, ''depreciacao''');
  if n = d then raise exception 'movimentos_resultado: trecho não encontrado'; end if;
  execute n;
end $$;

-- vendas de produto já lançadas: custo médio no estoque e no item (para o CMV)
update public.estoque_movimentos em set valor_unitario = public.custo_medio_insumo(em.insumo_id, em.fazenda_id, em.data)
 where em.venda_id is not null and em.tipo = 'saida' and em.valor_unitario is null;
update public.venda_itens vi set custo_unitario = em.valor_unitario, custo_total = round(vi.quantidade * em.valor_unitario, 2)
  from public.estoque_movimentos em
 where em.venda_id = vi.venda_id and em.insumo_id = vi.insumo_id and em.tipo = 'saida' and vi.tipo_item = 'insumo' and vi.custo_unitario is null;
