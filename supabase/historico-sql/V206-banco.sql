-- Fazenda Digital V206 · banco (pode rodar mais de uma vez; não apaga dados)
-- Completa o que da V198 não tinha entrado no banco: Atividades em vários dias e custo da venda de insumos do estoque.

-- 1) Atividades: vários dias e horários
alter table public.atividades_agricolas
  add column if not exists periodos jsonb,
  add column if not exists dias integer,
  add column if not exists horas_total numeric(10,2);

-- 2) Venda de produtos do estoque: custo (CMV) e receita próprios
alter table public.venda_itens
  add column if not exists custo_unitario numeric,
  add column if not exists custo_total numeric(14,2);

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
do $$
declare d text := pg_get_functiondef('public.classificar_lancamento'::regproc); n text;
begin
  if position('V198' in d) > 0 then return; end if;
  n := replace(d,
    E'    select case tipo when ''animais'' then ''venda_bovinos'' when ''cafe'' then ''venda_cafe'' else ''outras_receitas'' end into v_chave from vendas where id = new.venda_id;\n',
    E'    select case tipo when ''animais'' then ''venda_bovinos'' when ''cafe'' then ''venda_cafe'' else ''outras_receitas'' end into v_chave from vendas where id = new.venda_id;\n    -- V198: produto do estoque vendido\n    if v_chave = ''outras_receitas'' and exists (select 1 from venda_itens where venda_id = new.venda_id and tipo_item = ''insumo'') then v_chave := ''venda_materiais''; end if;\n');
  if n = d then raise exception 'classificar_lancamento: trecho não encontrado'; end if;
  execute n;
end $$;

-- salvar_venda (versão V203): a saída do produto vai ao custo médio, gravado no estoque e no item da venda
do $$
declare d text := pg_get_functiondef('public.salvar_venda'::regproc); n text;
begin
  if position('v_cu numeric' in d) > 0 then return; end if;
  n := replace(d, E'v_fica boolean := coalesce((p->>''gado_fica'')::boolean, false);\nbegin', E'v_fica boolean := coalesce((p->>''gado_fica'')::boolean, false); v_cu numeric;\nbegin');
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
  if position('cmv_materiais' in d) > 0 then return; end if;
  n := replace(d, E'    union all\n    select d.data, d.conta_id, -d.valor, ''depreciacao''',
    E'    union all\n    select em.data, public.conta_do_tipo(''cmv_materiais'', em.fazenda_id), -round(em.quantidade * em.valor_unitario, 2),\n      ''venda'', v.id, ''Venda nº '' || v.numero, ''Custo do material vendido: '' || coalesce((select i.nome from insumos i where i.id = em.insumo_id), ''''),\n      (select nome from pessoas where id = v.pessoa_id), null::text\n    from estoque_movimentos em join vendas v on v.id = em.venda_id\n    where em.tipo = ''saida'' and coalesce(em.valor_unitario, 0) > 0 and em.data between p_de and p_ate\n    union all\n    select d.data, d.conta_id, -d.valor, ''depreciacao''');
  if n = d then raise exception 'movimentos_resultado: trecho não encontrado'; end if;
  execute n;
end $$;

-- vendas de produto já lançadas: custo médio no estoque e no item
update public.estoque_movimentos em set valor_unitario = public.custo_medio_insumo(em.insumo_id, em.fazenda_id, em.data)
 where em.venda_id is not null and em.tipo = 'saida' and em.valor_unitario is null;
update public.venda_itens vi set custo_unitario = em.valor_unitario, custo_total = round(vi.quantidade * em.valor_unitario, 2)
  from public.estoque_movimentos em
 where em.venda_id = vi.venda_id and em.insumo_id = vi.insumo_id and em.tipo = 'saida' and vi.tipo_item = 'insumo' and vi.custo_unitario is null;

-- 3) Parceria ligada à venda (gado vendido que fica na fazenda): a consulta da venda sabe se a parceria já foi registrada
alter table public.parcerias add column if not exists venda_id uuid references public.vendas(id) on delete set null;
create index if not exists parcerias_venda_idx on public.parcerias (venda_id);
do $$
declare d text := pg_get_functiondef('public.lancar_entrada_parceria(jsonb)'::regprocedure); n text;
begin
  if position('venda_id' in d) > 0 then return; end if;
  n := replace(d,
    'cabecas_entrada, peso_entrada_kg, kg_arroba, perc_fazenda, perc_parceiro, observacoes)',
    'cabecas_entrada, peso_entrada_kg, kg_arroba, perc_fazenda, perc_parceiro, observacoes, venda_id)');
  n := replace(n,
    'v_cab, v_peso, v_kg, v_pf, v_pp, nullif(trim(m->>''obs''), ''''))',
    'v_cab, v_peso, v_kg, v_pf, v_pp, nullif(trim(m->>''obs''), ''''),
    (select id from vendas where id = nullif(c->>''venda_id'', '''')::uuid and fazenda_id = v_faz))');
  if position('venda_id)' in n) = 0 or position('c->>''venda_id''' in n) = 0 then raise exception 'lancar_entrada_parceria: trecho não encontrado'; end if;
  execute n;
end $$;

select 'V206 ok | custo da venda: ' || exists(select 1 from information_schema.columns where table_name = 'venda_itens' and column_name = 'custo_unitario')
  || ' | atividades em vários dias: ' || exists(select 1 from information_schema.columns where table_name = 'atividades_agricolas' and column_name = 'periodos') as conferencia;
