-- Fazenda Digital V193 – Venda entre fazendas do Grupo (titulares diferentes) e à vista no Caixa geral
-- (rodado direto no Supabase; guardado aqui só como registro)
-- Regras: mesmo CPF/CNPJ = transferência (Mais › Transferências); CPF/CNPJ diferente = venda de uma e compra da outra,
-- num lançamento só (estoques, contas a receber e a pagar). À vista: recebe e paga sozinho no Caixa geral
-- (ou na conta escolhida). Gestão consolidada do Grupo: o caixa e os bancos são do Grupo.

-- Caixa geral do Grupo
insert into public.contas_bancarias (nome, tipo, fazenda_id, saldo_inicial, data_saldo_inicial, ativa)
select 'Caixa geral', 'caixa', null, 0, current_date, true
 where not exists (select 1 from public.contas_bancarias where tipo = 'caixa' and fazenda_id is null and nome = 'Caixa geral');

create or replace function public.caixa_geral() returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from contas_bancarias where tipo = 'caixa' and fazenda_id is null and ativa order by (nome = 'Caixa geral') desc, created_at limit 1;
$$;

-- ligações venda ↔ compra do Grupo
alter table public.vendas add column if not exists compra_grupo_id uuid references public.compras(id) on delete set null;
alter table public.compras add column if not exists venda_grupo_id uuid references public.vendas(id) on delete set null;
alter table public.estoque_fiscal_lanc add column if not exists compra_id uuid references public.compras(id) on delete cascade;

create or replace function public.so_digitos(t text) returns text language sql immutable as $$ select regexp_replace(coalesce(t, ''), '\D', '', 'g') $$;

-- recebe/paga à vista os títulos abertos de uma venda ou compra
create or replace function public.baixar_avista(p_lancs uuid[], p_conta uuid, p_data date, p_obs text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare l record;
begin
  for l in select id, fazenda_id, valor - coalesce(valor_pago, 0) as saldo from lancamentos where id = any (p_lancs) and situacao in ('aberto', 'parcial') loop
    if l.saldo > 0.004 then
      insert into baixas (fazenda_id, lancamento_id, data, valor_principal, juros, multa, desconto, conta_bancaria_id, observacoes, situacao, confirmado_por, confirmado_em)
      values (l.fazenda_id, l.id, p_data, l.saldo, 0, 0, 0, p_conta, p_obs, 'confirmada', auth.uid(), now());
      perform atualizar_titulo(l.id);
    end if;
  end loop;
end $$;
revoke execute on function public.baixar_avista(uuid[], uuid, date, text) from public, anon, authenticated;

-- venda à vista: entra sozinha no caixa (o da venda ou o Caixa geral)
create or replace function public.venda_avista_receber(p_venda uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v vendas%rowtype; v_conta uuid;
begin
  select * into v from vendas where id = p_venda;
  if not found or v.forma_pagamento is distinct from 'avista' then return; end if;
  v_conta := coalesce(v.conta_bancaria_id, caixa_geral());
  if v_conta is null then raise exception 'Cadastre o Caixa geral em Financeiro › Bancos e caixa.'; end if;
  perform baixar_avista(array(select id from lancamentos where venda_id = p_venda), v_conta, v.data, 'Venda à vista');
end $$;
revoke execute on function public.venda_avista_receber(uuid) from public, anon, authenticated;

-- a compra na fazenda do Grupo que compra: estoque, contas a pagar e, à vista, o pagamento no mesmo caixa
create or replace function public.venda_grupo_gerar_compra(p_venda uuid, p_dest uuid)
returns int language plpgsql security definer set search_path to 'public' as $$
declare
  v vendas%rowtype; fo fazendas%rowtype; fd fazendas%rowtype;
  v_forn uuid; v_cid uuid; v_cnum int; v_q jsonb := '{}'; v_com_gta boolean := false; r record; it record; v_item uuid;
  v_fator numeric; v_custo numeric; v_conta uuid; v_qm jsonb;
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

  -- fornecedor = titular da fazenda que vende (acha pelo CPF/CNPJ ou cadastra)
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
    v.cabecas, v.peso_bruto_kg, v.peso_liquido_kg, v.forma_preco, v.kg_arroba, v.arrobas, v.preco, p_venda, v.forma_pagamento = 'avista', auth.uid())
  returning id, numero into v_cid, v_cnum;

  -- o custo de cada item é o valor dele, proporcional ao líquido da venda (o que a compradora paga)
  v_fator := case when coalesce(v.valor_bruto, 0) > 0 then v.valor_total / v.valor_bruto else 1 end;
  for it in select * from venda_itens where venda_id = p_venda loop
    v_custo := round(it.valor_total * v_fator, 2);
    insert into compra_itens (fazenda_id, compra_id, tipo_item, insumo_id, descricao, quantidade, unidade, peso_kg, valor_unitario, valor_total, custo_total, custo_unitario)
    values (p_dest, v_cid, case when it.tipo_item in ('animal', 'insumo') then it.tipo_item else 'outro' end, it.insumo_id, it.descricao,
      case when it.tipo_item = 'animal' then v.cabecas else it.quantidade end, case when it.tipo_item = 'animal' then 'cabeca' else it.unidade end,
      it.peso_kg, it.valor_unitario, it.valor_total, v_custo,
      round(v_custo / nullif(case when it.tipo_item = 'animal' then v.cabecas else it.quantidade end, 0), 6))
    returning id into v_item;
    if it.tipo_item = 'insumo' and it.insumo_id is not null then
      insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, valor_unitario, compra_id, compra_item_id, observacoes, created_by)
      values (p_dest, it.insumo_id, v.data, 'entrada', it.quantidade, round(v_custo / it.quantidade, 6), v_cid, v_item, 'Compra da ' || fo.nome, auth.uid());
    end if;
  end loop;

  -- gado: entra no Estoque de gado da compradora com as mesmas faixas que saíram da vendedora
  if v.tipo = 'animais' then
    for r in select m.id from movimentacoes m where m.venda_id = p_venda loop
      select coalesce(jsonb_object_agg(k.key, -((k.value #>> '{}')::int)), '{}'), bool_or(coalesce(l.quantidades_gta, '{}'::jsonb) <> '{}'::jsonb)
        into v_qm, v_com_gta
        from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k where l.movimentacao_id = r.id;
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

  -- contas a pagar: as mesmas parcelas do contas a receber
  insert into lancamentos (fazenda_id, tipo, pessoa_id, descricao, documento, conta_bancaria_id, valor, data_emissao, data_vencimento, vencimento_original,
    situacao, parcela, total_parcelas, intermediaria, compra_id, created_by)
  select p_dest, 'pagar', v_forn, 'Compra nº ' || v_cnum || ' – da ' || fo.nome, l.documento, l.conta_bancaria_id, l.valor, l.data_emissao, l.data_vencimento,
         l.vencimento_original, 'aberto', l.parcela, l.total_parcelas, l.intermediaria, v_cid, auth.uid()
    from lancamentos l where l.venda_id = p_venda and l.tipo = 'receber';

  update vendas set compra_grupo_id = v_cid where id = p_venda;

  -- à vista: paga no mesmo caixa em que a venda recebeu (sai e entra no caixa do Grupo)
  if v.forma_pagamento = 'avista' then
    v_conta := coalesce(v.conta_bancaria_id, caixa_geral());
    perform baixar_avista(array(select id from lancamentos where compra_id = v_cid), v_conta, v.data, 'Compra à vista');
  end if;
  return v_cnum;
end $$;
grant execute on function public.venda_grupo_gerar_compra(uuid, uuid) to authenticated;

-- salvar_venda: valida a fazenda que compra no início e, no fim, recebe à vista e gera a compra do Grupo
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure);
  n := d;
  n := replace(n, E'  if least(v_fun, v_com, v_fre, v_out) < 0 then',
    E'  -- V193: NF ou GTA repetida na mesma fazenda (evita gravar a mesma venda duas vezes)\n'
    '  if nullif(trim(p->>''numero_documento''), '''') is not null and exists (select 1 from vendas where fazenda_id = v_faz and tipo = v_tipo and trim(numero_documento) = trim(p->>''numero_documento'')) then\n'
    '    raise exception ''Já existe venda com a NF nº % nesta fazenda.'', trim(p->>''numero_documento'');\n'
    '  end if;\n'
    '  if nullif(trim(p->>''gta_numero''), '''') is not null and exists (select 1 from vendas where fazenda_id = v_faz and trim(gta_numero) = trim(p->>''gta_numero'')) then\n'
    '    raise exception ''Já existe venda com a GTA nº % nesta fazenda.'', trim(p->>''gta_numero'');\n'
    '  end if;\n'
    '  if least(v_fun, v_com, v_fre, v_out) < 0 then');
  n := replace(n, E'  return json_build_object(''id'', v_id, ''numero'', v_num, ''bruto'', v_valor, ''liquido'', v_liq, ''cabecas'', v_cab);',
    E'  -- V193: à vista recebe sozinho no caixa; venda para fazenda do Grupo gera a compra do outro lado\n'
    '  perform public.venda_avista_receber(v_id);\n'
    '  if nullif(p->>''fazenda_destino_id'', '''') is not null then\n'
    '    perform public.venda_grupo_gerar_compra(v_id, (p->>''fazenda_destino_id'')::uuid);\n'
    '  end if;\n'
    '  return json_build_object(''id'', v_id, ''numero'', v_num, ''bruto'', v_valor, ''liquido'', v_liq, ''cabecas'', v_cab);');
  if position('V193: NF ou GTA repetida' in n) = 0 or position('V193: à vista recebe' in n) = 0 then
    raise exception 'salvar_venda: trecho não encontrado (nada alterado).';
  end if;
  execute n;
end $$;

-- excluir a venda desfaz o recebimento à vista e a compra do Grupo (com o pagamento à vista dela)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.excluir_venda(uuid)'::regprocedure);
  n := replace(d, E'  if exists (select 1 from baixas b join lancamentos l on l.id = b.lancamento_id where l.venda_id = p_id',
    E'  -- V193: o recebimento automático da venda à vista sai junto\n'
    '  delete from baixas where observacoes = ''Venda à vista'' and lancamento_id in (select id from lancamentos where venda_id = p_id);\n'
    '  if v.compra_grupo_id is not null then\n'
    '    delete from baixas where observacoes = ''Compra à vista'' and lancamento_id in (select id from lancamentos where compra_id = v.compra_grupo_id);\n'
    '    if exists (select 1 from baixas b join lancamentos l on l.id = b.lancamento_id where l.compra_id = v.compra_grupo_id and b.situacao in (''pendente'',''confirmada'')) then\n'
    '      raise exception ''A compra desta venda na outra fazenda já tem pagamento lançado: estorne o pagamento em Contas a pagar antes de excluir.'';\n'
    '    end if;\n'
    '    delete from lancamentos where compra_id = v.compra_grupo_id;\n'
    '    delete from estoque_movimentos where compra_id = v.compra_grupo_id;\n'
    '    delete from compra_itens where compra_id = v.compra_grupo_id;\n'
    '    update vendas set compra_grupo_id = null where id = p_id;\n'
    '    delete from compras where id = v.compra_grupo_id;\n'
    '  end if;\n'
    '  if exists (select 1 from baixas b join lancamentos l on l.id = b.lancamento_id where l.venda_id = p_id');
  if n = d then raise exception 'excluir_venda: trecho não encontrado (nada alterado).'; end if;
  execute n;
end $$;

-- a compra que veio de venda do Grupo só sai pela venda
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.excluir_compra(uuid)'::regprocedure);
  n := replace(d, E'if v_faz is null or not public.acesso_completo(v_faz) then raise exception ''Sem permissão para excluir.''; end if;',
    E'if v_faz is null or not public.acesso_completo(v_faz) then raise exception ''Sem permissão para excluir.''; end if;\r\n'
    '  if (select venda_grupo_id from compras where id = p_id) is not null then raise exception ''Esta compra veio de uma venda entre fazendas do Grupo: exclua a venda (Mais › Vendas) na fazenda que vendeu.''; end if;');
  if n = d then raise exception 'excluir_compra: trecho não encontrado (nada alterado).'; end if;
  execute n;
end $$;
