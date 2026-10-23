-- =====================================================================================
-- Fazenda Digital V142 – Plano de contas de 4 graus (9.9.99.999)
--   Grau 1: Ativo, Passivo, Receitas, Custos e despesas
--   Grau 2: nas Receitas e nos Custos, a FAZENDA (centro de custo); 3.9 / 4.9 = Administração (sede)
--   Grau 3: subcentro (Agrícola, Pecuária, Custo de produção de café, Despesas operacionais...)
--   Grau 4: conta analítica, onde os valores são alocados
-- O plano anterior (5 graus) fica guardado em plano_contas_v141.
-- =====================================================================================

-- (já gravado no Supabase em 20/10: plantas por ha efetivas e previsão em sacas/ha; repetir não faz mal)
alter table areas add column if not exists plantas_ha_real numeric;
alter table areas add column if not exists previsao_sc_ha numeric;

begin;

-- ---------- 0. cópia de segurança ----------
create table if not exists plano_contas_v141 as select * from plano_contas;
create table if not exists tipos_lancamento_v141 as select * from tipos_lancamento;

-- ---------- 1. colunas novas ----------
alter table plano_contas add column if not exists fazenda_id uuid references fazendas(id) on delete set null;
alter table plano_contas add column if not exists adm boolean not null default false;
alter table plano_contas add column if not exists sistema boolean not null default false;
comment on column plano_contas.fazenda_id is 'V142: fazenda (centro de custo) do grupo de grau 2 em Receitas e Custos, herdada pelas contas de baixo';
comment on column plano_contas.adm is 'V142: grupo da Administração (sede): lançamentos sem fazenda';
comment on column plano_contas.sistema is 'V142: conta criada pelo sistema (não veio da planilha do plano)';
alter table contas_bancarias add column if not exists conta_plano_id uuid references plano_contas(id) on delete set null;

-- ---------- 2. funções de apoio ----------
-- cria a conta se ainda não existir (conta de cima pelo código; tipo e natureza herdados)
create or replace function public.conta_garantir(p_cod text, p_nome text, p_sistema boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; pai plano_contas%rowtype; v_niv int := array_length(string_to_array(p_cod, '.'), 1); v_tipo text; v_nat text;
begin
  select id into v_id from plano_contas where codigo = p_cod;
  if v_id is not null then return v_id; end if;
  select * into pai from plano_contas where codigo = array_to_string((string_to_array(p_cod, '.'))[1:v_niv - 1], '.');
  if pai.id is null then raise exception 'Conta de cima de % não encontrada.', p_cod; end if;
  v_tipo := case when p_cod like '2.3%' then 'patrimonio_liquido' when pai.tipo = 'patrimonio_liquido' then 'patrimonio_liquido'
                 when p_cod like '2%' then 'passivo' else pai.tipo end;
  v_nat := case when p_cod ~ '^3\.[0-9]+\.50' then 'devedora' when v_tipo in ('ativo', 'despesa') then 'devedora' else 'credora' end;
  insert into plano_contas (codigo, nome, tipo, natureza, conta_pai_id, analitica, ativa, fazenda_id, adm, sistema)
    values (p_cod, p_nome, v_tipo, v_nat, pai.id, v_niv >= 4, true, case when v_niv > 2 then pai.fazenda_id end, case when v_niv > 2 then pai.adm else false end, p_sistema)
    returning id into v_id;
  return v_id;
end $$;

-- grupos de grau 2 de uma unidade (fazenda ou Administração), com as contas que o sistema usa sozinho.
-- Só cria o que faltar: as contas do plano do produtor ficam como ele cadastrou.
create or replace function public.montar_contas_unidade(p_n int, p_nome text, p_faz uuid, p_adm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r text := '3.' || p_n; d text := '4.' || p_n;
begin
  perform public.conta_garantir(r, upper(p_nome));
  perform public.conta_garantir(d, upper(p_nome));
  update plano_contas set fazenda_id = p_faz, adm = p_adm where codigo in (r, d);
  update plano_contas set fazenda_id = p_faz, adm = p_adm where codigo like r || '.%' or codigo like d || '.%';
  if not p_adm then
    perform public.conta_garantir(r || '.01', 'AGRÍCOLA');
    perform public.conta_garantir(r || '.01.001', 'Venda de Café');
    perform public.conta_garantir(r || '.02', 'PECUÁRIA');
    perform public.conta_garantir(r || '.02.001', 'Venda Gado Bovino');
    perform public.conta_garantir(r || '.02.002', 'Venda de Leite');
  end if;
  perform public.conta_garantir(r || '.05', 'RECEITAS FINANCEIRAS');
  perform public.conta_garantir(r || '.05.001', 'Juros Ativos');
  perform public.conta_garantir(r || '.05.003', 'Rendimentos de Aplicações');
  perform public.conta_garantir(r || '.05.004', 'Descontos Obtidos');
  perform public.conta_garantir(r || '.09', 'OUTRAS RECEITAS');
  perform public.conta_garantir(r || '.09.002', 'Arrendamento e Aluguel de Pasto');
  perform public.conta_garantir(r || '.09.003', 'Venda de Bens do Imobilizado');
  perform public.conta_garantir(r || '.09.004', 'Receita de Fretes Prestados');
  perform public.conta_garantir(r || '.09.099', 'Outras Receitas');
  perform public.conta_garantir(r || '.50', 'DEDUÇÕES DAS VENDAS');
  if not p_adm then
    perform public.conta_garantir(r || '.50.001', 'Vendas Canceladas');
    perform public.conta_garantir(r || '.50.002', 'ICMS');
    perform public.conta_garantir(r || '.50.003', 'Funrural');
  end if;
  perform public.conta_garantir(r || '.50.004', 'Descontos Concedidos');

  perform public.conta_garantir(d || '.05', 'DESPESAS OPERACIONAIS');
  perform public.conta_garantir(d || '.05.001', 'Salários e Encargos');
  perform public.conta_garantir(d || '.05.002', 'INSS e FGTS');
  perform public.conta_garantir(d || '.05.004', 'Energia Elétrica');
  perform public.conta_garantir(d || '.05.006', 'Benefícios a Funcionários (Alimentação, Transporte)');
  perform public.conta_garantir(d || '.05.007', 'Internet, Telefone e Programas');
  perform public.conta_garantir(d || '.05.008', 'Honorários (Contador, Advogado, Assessoria Técnica)');
  perform public.conta_garantir(d || '.05.009', 'Impostos e Taxas (ITR, Licenças)');
  perform public.conta_garantir(d || '.05.010', 'Seguros');
  perform public.conta_garantir(d || '.05.011', 'Manutenção de Benfeitorias e Instalações');
  perform public.conta_garantir(d || '.05.012', 'Combustíveis de Veículos da Administração');
  perform public.conta_garantir(d || '.05.013', 'Fretes sobre Vendas');
  perform public.conta_garantir(d || '.05.014', 'Comissões, Corretagens e Leilões');
  perform public.conta_garantir(d || '.05.015', 'Classificação e Armazenagem de Café');
  perform public.conta_garantir(d || '.05.016', 'Custos dos Fretes Prestados');
  perform public.conta_garantir(d || '.05.017', 'Manutenção de Veículos da Administração');
  perform public.conta_garantir(d || '.05.099', 'Outras Despesas');
  perform public.conta_garantir(d || '.07', 'DESPESAS FINANCEIRAS');
  perform public.conta_garantir(d || '.07.001', 'Juros');
  perform public.conta_garantir(d || '.07.002', 'IOF');
  perform public.conta_garantir(d || '.07.003', 'Despesas com Contratação de Créditos');
  perform public.conta_garantir(d || '.07.004', 'Tarifas Bancárias');
end $$;

-- ---------- 3. troca do plano ----------
alter table plano_contas disable trigger trg_proteger_grau1;
update plano_contas set nome = 'ATIVO', tipo = 'ativo', natureza = 'devedora' where codigo = '1' and conta_pai_id is null;
update plano_contas set nome = 'PASSIVO', tipo = 'passivo', natureza = 'credora' where codigo = '2' and conta_pai_id is null;
update plano_contas set nome = 'RECEITAS', tipo = 'receita', natureza = 'credora' where codigo = '3' and conta_pai_id is null;
update plano_contas set nome = 'CUSTOS E DESPESAS', tipo = 'despesa', natureza = 'devedora' where codigo = '4' and conta_pai_id is null;
alter table plano_contas enable trigger trg_proteger_grau1;
update plano_contas set sistema = false where conta_pai_id is null;

-- as contas antigas saem do caminho dos códigos (são apagadas no fim)
update plano_contas set codigo = 'v141.' || codigo, ativa = false where conta_pai_id is not null and codigo not like 'v141.%';

do $$
begin
  perform public.conta_garantir('1.1', 'CIRCULANTE', false);
  perform public.conta_garantir('1.1.01', 'DISPONIBILIDADES', false);
  perform public.conta_garantir('1.1.01.001', 'Caixa Geral', false);
  perform public.conta_garantir('1.1.01.151', 'Aplicações Financeiras', false);
  perform public.conta_garantir('1.1.02', 'CRÉDITOS COMERCIAIS', false);
  perform public.conta_garantir('1.1.02.001', 'Clientes Pecuária', false);
  perform public.conta_garantir('1.1.02.002', 'Clientes Agrícola', false);
  perform public.conta_garantir('1.6', 'PERMANENTE', false);
  perform public.conta_garantir('1.6.01', 'IMOBILIZADO', false);
  perform public.conta_garantir('1.6.01.001', 'Tratores Agrícolas', false);
  perform public.conta_garantir('1.6.01.002', 'Máquinas Pesadas', false);
  perform public.conta_garantir('1.6.01.003', 'Veículos Pesados', false);
  perform public.conta_garantir('1.6.01.004', 'Veículos Utilitários', false);
  perform public.conta_garantir('1.6.01.005', 'Veículos Automóveis', false);
  perform public.conta_garantir('2.1', 'CIRCULANTE', false);
  perform public.conta_garantir('2.1.01', 'FORNECEDORES', false);
  perform public.conta_garantir('2.1.01.001', 'Fornecedores da Pecuária', false);
  perform public.conta_garantir('2.1.01.002', 'Fornecedores da Agricultura', false);
  perform public.conta_garantir('3.1', 'FAZENDA 3 IRMÃOS', false);
  perform public.conta_garantir('3.1.01', 'AGRÍCOLA', false);
  perform public.conta_garantir('3.1.01.001', 'Venda de Café', false);
  perform public.conta_garantir('3.1.02', 'PECUÁRIA', false);
  perform public.conta_garantir('3.1.02.001', 'Venda Gado Bovino', false);
  perform public.conta_garantir('3.1.05', 'RECEITAS FINANCEIRAS', false);
  perform public.conta_garantir('3.1.05.001', 'Juros Ativos', false);
  perform public.conta_garantir('3.1.09', 'OUTRAS RECEITAS', false);
  perform public.conta_garantir('3.1.50', 'DEDUÇÕES DAS VENDAS', false);
  perform public.conta_garantir('3.1.50.001', 'Vendas Canceladas', false);
  perform public.conta_garantir('3.1.50.002', 'ICMS', false);
  perform public.conta_garantir('3.2', 'FAZENDA DAS GARÇAS', false);
  perform public.conta_garantir('3.2.01', 'AGRÍCOLA', false);
  perform public.conta_garantir('3.2.01.001', 'Venda de Café', false);
  perform public.conta_garantir('3.2.02', 'PECUÁRIA', false);
  perform public.conta_garantir('3.2.02.001', 'Venda Gado Bovino', false);
  perform public.conta_garantir('3.2.05', 'RECEITAS FINANCEIRAS', false);
  perform public.conta_garantir('3.2.05.001', 'Juros Ativos', false);
  perform public.conta_garantir('3.2.09', 'OUTRAS RECEITAS', false);
  perform public.conta_garantir('3.2.50', 'DEDUÇÕES DAS VENDAS', false);
  perform public.conta_garantir('3.2.50.001', 'Vendas Canceladas', false);
  perform public.conta_garantir('3.2.50.002', 'ICMS', false);
  perform public.conta_garantir('4.1', 'FAZENDA 3 IRMÃOS', false);
  perform public.conta_garantir('4.1.01', 'CUSTO PRODUÇÃO DE CAFÉ', false);
  perform public.conta_garantir('4.1.01.001', 'Salários e Encargos', false);
  perform public.conta_garantir('4.1.01.002', 'INSS e FGTS', false);
  perform public.conta_garantir('4.1.01.003', 'Mão de Obra de Terceiros', false);
  perform public.conta_garantir('4.1.01.004', 'Mão de Obra de Colheita', false);
  perform public.conta_garantir('4.1.01.011', 'Adubos e Fertilizantes', false);
  perform public.conta_garantir('4.1.01.012', 'Defensivos', false);
  perform public.conta_garantir('4.1.01.013', 'Inseticidas e Fungicidas', false);
  perform public.conta_garantir('4.1.01.014', 'Energia Elétrica', false);
  perform public.conta_garantir('4.1.05', 'DESPESAS OPERACIONAIS', false);
  perform public.conta_garantir('4.1.05.001', 'Salários e Encargos', false);
  perform public.conta_garantir('4.1.05.002', 'INSS e FGTS', false);
  perform public.conta_garantir('4.1.05.003', 'FGTS', false);
  perform public.conta_garantir('4.1.05.004', 'Energia Elétrica', false);
  perform public.conta_garantir('4.1.07', 'DESPESAS FINANCEIRAS', false);
  perform public.conta_garantir('4.1.07.001', 'Juros', false);
  perform public.conta_garantir('4.1.07.002', 'IOF', false);
  perform public.conta_garantir('4.1.07.003', 'Despesas com Contratação de Créditos', false);
  perform public.conta_garantir('4.2', 'FAZENDA DAS GARÇAS', false);
  perform public.conta_garantir('4.2.01', 'CUSTOS GADOS EMPASTADOS', false);
  perform public.conta_garantir('4.2.01.001', 'Compras de Bovinos', false);
  perform public.conta_garantir('4.2.01.021', 'Sal Mineral e Proteinados', false);
  perform public.conta_garantir('4.2.01.022', 'Silagem de Milho', false);
  perform public.conta_garantir('4.2.01.023', 'Silagem de Capiaçu', false);
  perform public.conta_garantir('4.2.01.024', 'Ração Pronta', false);
  perform public.conta_garantir('4.2.01.025', 'Recuperação de Cercas', false);
  perform public.conta_garantir('4.2.01.026', 'Defensivos de Pastagens', false);
  perform public.conta_garantir('4.2.01.027', 'Adubação de Pastagens', false);
  perform public.conta_garantir('4.2.01.028', 'Medicamentos e Vacinas', false);
  perform public.conta_garantir('4.2.01.029', 'Salários e Encargos', false);
  perform public.conta_garantir('4.2.01.030', 'Mão de Obra de Terceiros', false);
  perform public.conta_garantir('4.2.02', 'CUSTOS DE GADOS CONFINADOS', false);
  perform public.conta_garantir('4.2.02.001', 'Custo do Gado', false);
  perform public.conta_garantir('4.2.02.002', 'Ração Pronta', false);
  perform public.conta_garantir('4.2.02.003', 'Medicamentos', false);
  perform public.conta_garantir('4.2.02.004', 'Silagem de Milho', false);
  perform public.conta_garantir('4.2.02.005', 'Silagem de Capim', false);
  perform public.conta_garantir('4.2.02.006', 'Salários e Encargos', false);
  perform public.conta_garantir('4.2.02.007', 'Mão de Obra de Terceiros', false);
  perform public.conta_garantir('1.1.02.003', 'Clientes Diversos', true);
  perform public.conta_garantir('1.1.02.051', 'Adiantamentos a Fornecedores', true);
  perform public.conta_garantir('1.1.02.052', 'Adiantamentos a Funcionários', true);
  perform public.conta_garantir('1.1.03', 'ESTOQUES', true);
  perform public.conta_garantir('1.1.03.001', 'Defensivos Agrícolas', true);
  perform public.conta_garantir('1.1.03.002', 'Adubos e Fertilizantes', true);
  perform public.conta_garantir('1.1.03.003', 'Sementes e Mudas', true);
  perform public.conta_garantir('1.1.03.004', 'Rações, Sal Mineral e Suplementos', true);
  perform public.conta_garantir('1.1.03.005', 'Medicamentos, Vacinas e Sêmen', true);
  perform public.conta_garantir('1.1.03.006', 'Combustíveis, Lubrificantes e Peças', true);
  perform public.conta_garantir('1.1.03.007', 'Café Beneficiado', true);
  perform public.conta_garantir('1.1.03.008', 'Animais para Recria e Engorda', true);
  perform public.conta_garantir('1.6.01.006', 'Implementos e Equipamentos', true);
  perform public.conta_garantir('1.6.01.007', 'Benfeitorias e Instalações', true);
  perform public.conta_garantir('1.6.01.008', 'Terras', true);
  perform public.conta_garantir('1.6.01.009', 'Lavouras Permanentes', true);
  perform public.conta_garantir('1.6.01.010', 'Rebanho Reprodutor', true);
  perform public.conta_garantir('2.1.01.003', 'Fornecedores Diversos', true);
  perform public.conta_garantir('2.1.03', 'ADIANTAMENTOS DE CLIENTES', true);
  perform public.conta_garantir('2.1.03.001', 'Adiantamentos de Contratos de Café (Venda Futura)', true);
  perform public.conta_garantir('2.1.04', 'FINANCIAMENTOS E EMPRÉSTIMOS', true);
  perform public.conta_garantir('2.1.04.001', 'Financiamento de Custeio', true);
  perform public.conta_garantir('2.1.04.002', 'Empréstimos Bancários', true);
  perform public.conta_garantir('2.2', 'NÃO CIRCULANTE', true);
  perform public.conta_garantir('2.2.01', 'FINANCIAMENTOS DE LONGO PRAZO', true);
  perform public.conta_garantir('2.2.01.001', 'Financiamentos para Investimentos', true);
  perform public.conta_garantir('2.3', 'PATRIMÔNIO LÍQUIDO', true);
  perform public.conta_garantir('2.3.01', 'CAPITAL E SALDOS DE ABERTURA', true);
  perform public.conta_garantir('2.3.01.001', 'Saldos de Abertura (Implantação do Sistema)', true);
  perform public.conta_garantir('2.3.05', 'RETIRADAS E PARTICULAR DOS SÓCIOS', true);
  perform public.conta_garantir('2.3.05.001', 'Retiradas do Produtor', true);
  perform public.conta_garantir('2.3.05.002', 'Veículos Particulares dos Proprietários', true);
  perform public.conta_garantir('2.3.05.003', 'Despesas Particulares dos Sócios', true);
  perform public.conta_garantir('2.3.05.004', 'Receitas Particulares dos Sócios', true);
  perform public.conta_garantir('4.1.01.015', 'Combustíveis e Lubrificantes', true);
  perform public.conta_garantir('4.1.01.016', 'Manutenção de Tratores, Máquinas e Veículos', true);
  perform public.conta_garantir('4.1.01.017', 'Serviços de Terceiros na Lavoura', true);
  perform public.conta_garantir('4.1.01.018', 'Secagem e Beneficiamento por Terceiros', true);
  perform public.conta_garantir('4.1.01.019', 'Sementes e Mudas', true);
  perform public.conta_garantir('4.2.01.031', 'Combustíveis e Lubrificantes', true);
  perform public.conta_garantir('4.2.01.032', 'Manutenção de Tratores, Máquinas e Veículos', true);
  perform public.conta_garantir('4.2.01.033', 'Inseminação, Sêmen e Embriões', true);
end $$;

-- grupos por fazenda (centro de custo) e da Administração
update plano_contas set fazenda_id = 'db157cd0-c980-4f85-b17f-96bdc7efcbe9' where codigo in ('3.1', '4.1');
update plano_contas set fazenda_id = 'f47d0948-5ddc-407e-a15d-5205f9c41c83' where codigo in ('3.2', '4.2');
update plano_contas c set fazenda_id = g.fazenda_id from plano_contas g
  where g.codigo in ('3.1', '4.1', '3.2', '4.2') and c.codigo like g.codigo || '.%';
select public.montar_contas_unidade(1, 'FAZENDA 3 IRMÃOS', 'db157cd0-c980-4f85-b17f-96bdc7efcbe9', false);
select public.montar_contas_unidade(2, 'FAZENDA DAS GARÇAS', 'f47d0948-5ddc-407e-a15d-5205f9c41c83', false);
select public.montar_contas_unidade(9, 'ADMINISTRAÇÃO (SEDE)', null, true);

-- outras fazendas que já existam (cada uma ganha o seu grau 2)
do $$
declare f record; v_n int;
begin
  for f in select id, nome from fazendas where tipo = 'fazenda' and id not in ('db157cd0-c980-4f85-b17f-96bdc7efcbe9', 'f47d0948-5ddc-407e-a15d-5205f9c41c83') order by created_at loop
    select coalesce(max((string_to_array(codigo, '.'))[2]::int), 0) + 1 into v_n from plano_contas
      where array_length(string_to_array(codigo, '.'), 1) = 2 and codigo ~ '^[34]\.[0-9]+$' and not adm;
    if v_n = 9 then v_n := 10; end if;
    perform public.montar_contas_unidade(v_n, f.nome, f.id, false);
  end loop;
end $$;

-- ---------- 4. a conta certa em cada fazenda ----------
-- Receita ou despesa lançada numa fazenda vai para a conta de mesmo nome do grupo (grau 2) daquela
-- fazenda: primeiro a do mesmo subcentro (grau 3), depois qualquer uma; não havendo, "Outras despesas"
-- ou "Outras receitas" da fazenda. Sem fazenda = Administração. Ativo, passivo e Particular não mudam.
create or replace function public.conta_na_unidade(p_conta uuid, p_faz uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare c plano_contas%rowtype; g plano_contas%rowtype; v_pai text; v_id uuid; v_raiz text;
begin
  if p_conta is null then return null; end if;
  select * into c from plano_contas where id = p_conta;
  if c.id is null or c.tipo not in ('receita', 'despesa') then return p_conta; end if;
  if p_faz is not null and public.unidade_particular(p_faz) then return p_conta; end if;
  v_raiz := split_part(c.codigo, '.', 1);
  select * into g from plano_contas
    where conta_pai_id = (select id from plano_contas where codigo = v_raiz)
      and case when p_faz is null then adm else fazenda_id = p_faz end
    order by codigo limit 1;
  if g.id is null then return p_conta; end if;
  if c.codigo like g.codigo || '.%' then return p_conta; end if;
  select lower(trim(nome)) into v_pai from plano_contas where id = c.conta_pai_id;
  select x.id into v_id from plano_contas x join plano_contas px on px.id = x.conta_pai_id
    where x.codigo like g.codigo || '.%' and x.analitica and x.ativa and lower(trim(x.nome)) = lower(trim(c.nome)) and lower(trim(px.nome)) = v_pai
    order by x.codigo limit 1;
  if v_id is null then
    select x.id into v_id from plano_contas x where x.codigo like g.codigo || '.%' and x.analitica and x.ativa and lower(trim(x.nome)) = lower(trim(c.nome))
      order by x.codigo limit 1;
  end if;
  if v_id is null then
    select x.id into v_id from plano_contas x where x.codigo like g.codigo || '.%' and x.analitica and x.ativa
        and lower(x.nome) = case when c.tipo = 'receita' then 'outras receitas' else 'outras despesas' end
      order by x.codigo limit 1;
  end if;
  return coalesce(v_id, p_conta);
end $$;

create or replace function public.conta_do_tipo(p_chave text, p_faz uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select public.conta_na_unidade(public.conta_do_tipo(p_chave), p_faz) $$;

-- vale para tudo o que grava conta: títulos, compras, vendas, contas contínuas, pós-colheita
create or replace function public.ajustar_conta_unidade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.conta_contabil_id is not null then new.conta_contabil_id := public.conta_na_unidade(new.conta_contabil_id, new.fazenda_id); end if;
  return new;
end $$;
-- em lancamentos o nome fica entre trg_classificar_lancamento e trg_marcar_abertura (ordem alfabética)
drop trigger if exists trg_classificar_lancamento_unidade on lancamentos;
create trigger trg_classificar_lancamento_unidade before insert or update of conta_contabil_id, fazenda_id on lancamentos
  for each row execute function public.ajustar_conta_unidade();
drop trigger if exists trg_conta_unidade on compras;
create trigger trg_conta_unidade before insert or update of conta_contabil_id, fazenda_id on compras for each row execute function public.ajustar_conta_unidade();
drop trigger if exists trg_conta_unidade on vendas;
create trigger trg_conta_unidade before insert or update of conta_contabil_id, fazenda_id on vendas for each row execute function public.ajustar_conta_unidade();
drop trigger if exists trg_conta_unidade on recorrencias;
create trigger trg_conta_unidade before insert or update of conta_contabil_id, fazenda_id on recorrencias for each row execute function public.ajustar_conta_unidade();
drop trigger if exists trg_conta_unidade on pc_lotes;
create trigger trg_conta_unidade before insert or update of conta_contabil_id, fazenda_id on pc_lotes for each row execute function public.ajustar_conta_unidade();

-- para a tela dos Tipos: em que conta o tipo cai em cada fazenda
create or replace function public.contas_por_unidade(p_conta uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('unidade', u.nome, 'codigo', c.codigo, 'nome', c.nome) order by u.ordem, u.nome), '[]'::json)
  from (select f.id, f.nome, 1 as ordem from fazendas f where f.tipo = 'fazenda' and coalesce(f.ativa, true)
        union all select null::uuid, 'Administração (sede)', 2) u
  join plano_contas c on c.id = public.conta_na_unidade(p_conta, u.id)
  where (select tipo from plano_contas where id = p_conta) in ('receita', 'despesa');
$$;

-- ---------- 5. tipos do sistema apontam para o plano novo ----------
update tipos_lancamento t set conta_id = c.id
  from (values
    ('energia', '4.1.01.014'),
    ('combustivel', '4.1.01.015'),
    ('manut_maquinas', '4.1.01.016'),
    ('manut_benfeitorias', '4.1.05.011'),
    ('combustivel_pecuaria', '4.2.01.031'),
    ('manut_pecuaria', '4.2.01.032'),
    ('combustivel_admin', '4.1.05.012'),
    ('manut_admin', '4.1.05.017'),
    ('custo_frete', '4.1.05.016'),
    ('manut_pastos', '4.2.01.025'),
    ('servico_lavoura', '4.1.01.017'),
    ('secagem', '4.1.01.018'),
    ('mo_lavoura', '4.1.01.003'),
    ('mo_pecuaria', '4.2.01.030'),
    ('veterinario', '4.2.01.028'),
    ('inseminacao', '4.2.01.033'),
    ('frete_vendas', '4.1.05.013'),
    ('comissao', '4.1.05.014'),
    ('armazenagem', '4.1.05.015'),
    ('salarios', '4.1.05.001'),
    ('encargos', '4.1.05.002'),
    ('beneficios', '4.1.05.006'),
    ('internet', '4.1.05.007'),
    ('honorarios', '4.1.05.008'),
    ('impostos', '4.1.05.009'),
    ('seguros', '4.1.05.010'),
    ('juros', '4.1.07.001'),
    ('tarifas', '4.1.07.004'),
    ('outras_despesas', '4.1.05.099'),
    ('financ_custeio', '2.1.04.001'),
    ('financ_investimento', '2.2.01.001'),
    ('emprestimo', '2.1.04.002'),
    ('adiant_fornecedor', '1.1.02.051'),
    ('adiant_funcionario', '1.1.02.052'),
    ('retirada', '2.3.05.001'),
    ('arrendamento', '3.1.09.002'),
    ('venda_leite', '3.1.02.002'),
    ('venda_imobilizado', '3.1.09.003'),
    ('rendimentos', '3.1.05.003'),
    ('outras_receitas', '3.1.09.099'),
    ('venda_cafe', '3.1.01.001'),
    ('adiant_clientes', '2.1.03.001'),
    ('compra_animais', '1.1.03.008'),
    ('estoque_peca', '1.1.03.006'),
    ('estoque_combustivel', '1.1.03.006'),
    ('estoque_outro', '1.1.03.006'),
    ('estoque_vacina', '1.1.03.005'),
    ('estoque_medicamento', '1.1.03.005'),
    ('estoque_semen', '1.1.03.005'),
    ('estoque_sal_mineral', '1.1.03.004'),
    ('estoque_racao', '1.1.03.004'),
    ('estoque_semente', '1.1.03.003'),
    ('estoque_fertilizante', '1.1.03.002'),
    ('estoque_adubo', '1.1.03.002'),
    ('estoque_defensivo', '1.1.03.001'),
    ('particular_receita', '2.3.05.004'),
    ('particular_despesa', '2.3.05.003'),
    ('desconto_obtido', '3.1.05.004'),
    ('funrural', '3.1.50.003'),
    ('venda_bovinos', '3.1.02.001'),
    ('desconto_concedido', '3.1.50.004'),
    ('mo_colheita', '4.1.01.004'),
    ('veiculo_particular', '2.3.05.002'),
    ('receita_frete', '3.1.09.004'),
    ('saldo_abertura', '2.3.01.001')
  ) m(chave, cod) join plano_contas c on c.codigo = m.cod
  where t.chave = m.chave;
-- tipos criados pelo usuário: vão para a conta de mesmo nome, ou Outras despesas / Outras receitas
update tipos_lancamento t set conta_id = coalesce(
    (select n.id from plano_contas n where n.analitica and n.codigo not like 'v141.%' and lower(n.nome) = lower(o.nome) and split_part(n.codigo, '.', 1) = split_part(replace(o.codigo, 'v141.', ''), '.', 1) order by n.codigo limit 1),
    (select id from plano_contas where codigo = case when t.uso = 'receber' then '3.1.09.099' else '4.1.05.099' end))
  from plano_contas o where o.id = t.conta_id and o.codigo like 'v141.%';

-- ---------- 6. o que já foi lançado passa para o plano novo ----------
create temp table de_para on commit drop as
  select o.id as velha,
    coalesce(
      (select t.conta_id from tipos_lancamento_v141 tv join tipos_lancamento t on t.chave = tv.chave where tv.conta_id = o.id order by t.chave limit 1),
      (select id from plano_contas where codigo = case o.tipo when 'receita' then '3.1.09.099' when 'despesa' then '4.1.05.099' end)) as nova
  from plano_contas o where o.codigo like 'v141.%';
update lancamentos l set conta_contabil_id = d.nova from de_para d where l.conta_contabil_id = d.velha;
update lancamentos l set conta_origem_id = public.conta_na_unidade(d.nova, l.fazenda_id) from de_para d where l.conta_origem_id = d.velha;
update compras x set conta_contabil_id = d.nova from de_para d where x.conta_contabil_id = d.velha;
update vendas x set conta_contabil_id = d.nova from de_para d where x.conta_contabil_id = d.velha;
update recorrencias x set conta_contabil_id = d.nova from de_para d where x.conta_contabil_id = d.velha;
update pc_lotes x set conta_contabil_id = d.nova from de_para d where x.conta_contabil_id = d.velha;
update frota_fretes x set despesas_conta_id = d.nova from de_para d where x.despesas_conta_id = d.velha;
-- sobra alguma conta antiga em uso? então para tudo (nada é apagado)
do $$
begin
  if exists (select 1 from lancamentos where conta_contabil_id in (select velha from de_para) or conta_origem_id in (select velha from de_para))
     or exists (select 1 from tipos_lancamento where conta_id in (select velha from de_para)) then
    raise exception 'Ainda há lançamentos em contas do plano antigo.';
  end if;
end $$;
delete from plano_contas where codigo like 'v141.%';

-- ---------- 7. bancos e caixas: cada um ganha a sua conta em Disponibilidades ----------
create or replace function public.vincular_conta_bancaria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text; v_ini int; v_fim int; v_base text; v_cod text; v_n int;
begin
  if new.tipo = 'caixa' then v_ini := 1; v_fim := 99; v_base := '1.1.01.001'; v_nome := coalesce(nullif(trim(new.nome), ''), 'Caixa');
  elsif new.tipo in ('aplicacao', 'aplicação', 'investimento') then v_ini := 151; v_fim := 199; v_base := '1.1.01.151'; v_nome := 'Aplicação ' || coalesce(nullif(trim(new.nome), ''), '');
  else v_ini := 101; v_fim := 150; v_base := null;
    v_nome := 'Banco ' || coalesce(nullif(trim(new.banco), ''), nullif(trim(new.nome), ''), '') || ' CC Ag. ' || coalesce(nullif(trim(new.agencia), ''), '0000') || ' Nº ' || coalesce(nullif(trim(new.conta), ''), '00000');
  end if;
  if new.conta_plano_id is not null then
    if v_base is null then update plano_contas set nome = v_nome where id = new.conta_plano_id and sistema; end if;
    return new;
  end if;
  -- a primeira conta de caixa e a de aplicação usam as contas da planilha (Caixa Geral, Aplicações Financeiras)
  if v_base is not null and not exists (select 1 from contas_bancarias where conta_plano_id = (select id from plano_contas where codigo = v_base) and id <> new.id) then
    new.conta_plano_id := (select id from plano_contas where codigo = v_base);
    if new.conta_plano_id is not null then return new; end if;
  end if;
  select coalesce(max((string_to_array(codigo, '.'))[4]::int), v_ini - 1) + 1 into v_n from plano_contas
    where codigo like '1.1.01.%' and (string_to_array(codigo, '.'))[4]::int between v_ini and v_fim;
  if v_n > v_fim then return new; end if;
  v_cod := '1.1.01.' || lpad(v_n::text, 3, '0');
  new.conta_plano_id := public.conta_garantir(v_cod, v_nome, true);
  return new;
end $$;
drop trigger if exists trg_vincular_conta_bancaria on contas_bancarias;
create trigger trg_vincular_conta_bancaria before insert or update of nome, banco, agencia, conta, tipo on contas_bancarias
  for each row execute function public.vincular_conta_bancaria();
update contas_bancarias set nome = nome where conta_plano_id is null;

-- ---------- 8. fazenda nova: o sistema cria o grau 2 dela (Receitas e Custos) ----------
create or replace function public.contas_da_fazenda_nova()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if tg_op = 'INSERT' then
    if new.tipo is distinct from 'fazenda' then return new; end if;
    select coalesce(max((string_to_array(codigo, '.'))[2]::int), 0) + 1 into v_n from plano_contas
      where codigo ~ '^[34]\.[0-9]+$' and not adm;
    if v_n = 9 then v_n := 10; end if;
    perform public.montar_contas_unidade(v_n, new.nome, new.id, false);
  elsif new.nome is distinct from old.nome then
    update plano_contas set nome = upper(new.nome) where fazenda_id = new.id and codigo ~ '^[34]\.[0-9]+$';
  end if;
  return new;
end $$;
drop trigger if exists trg_contas_da_fazenda on fazendas;
create trigger trg_contas_da_fazenda after insert or update of nome on fazendas for each row execute function public.contas_da_fazenda_nova();

-- ---------- 9. plano de 4 graus na tela do plano ----------
do $$
declare d text := pg_get_functiondef('public.alterar_conta(jsonb)'::regprocedure);
begin
  d := replace(d, '> 5 then', '> 4 then');
  d := replace(d, 'passariam do 5º nível', 'passariam do 4º grau');
  d := replace(d, 'if v_niv_novo = 5 then', 'if v_niv_novo = 4 then');
  if d like '%> 5 then%' or d not like '%v_niv_novo = 4 then%' then raise exception 'alterar_conta: trecho não encontrado'; end if;
  execute d;
end $$;

-- ---------- 10. relatórios: juros, rendimentos e descontos na conta da fazenda certa ----------
do $$
declare d text := pg_get_functiondef('public.resultado_caixa(uuid[], date, date, boolean)'::regprocedure);
begin
  d := replace(d, 'public.unidade_particular(bx.fazenda_id) as part,', 'public.unidade_particular(bx.fazenda_id) as part, bx.fazenda_id as faz,');
  d := replace(d, 'select public.conta_do_tipo(''juros''), tipo, juros_parcela', 'select public.conta_do_tipo(''juros'', faz), tipo, juros_parcela');
  d := replace(d, '''rendimentos'' else ''juros'' end), tipo, encargos', '''rendimentos'' else ''juros'' end, faz), tipo, encargos');
  d := replace(d, '''desconto_obtido'' end), case when tipo', '''desconto_obtido'' end, faz), case when tipo');
  if d not like '%conta_do_tipo(''juros'', faz)%' or d not like '%end, faz), tipo, encargos%' or d not like '%end, faz), case when tipo%' or d not like '%as faz,%' then
    raise exception 'resultado_caixa: trecho não encontrado';
  end if;
  execute d;
  d := pg_get_functiondef('public.exportar_contabilidade(uuid[], date, date, boolean)'::regprocedure);
  d := replace(d, '(public.conta_do_tipo(''juros''), t.valor -', '(public.conta_do_tipo(''juros'', t.fazenda_id), t.valor -');
  d := replace(d, '(public.conta_do_tipo(''juros''), bx.valor_principal', '(public.conta_do_tipo(''juros'', bx.fazenda_id), bx.valor_principal');
  d := replace(d, '''rendimentos'' else ''juros'' end), bx.encargos', '''rendimentos'' else ''juros'' end, bx.fazenda_id), bx.encargos');
  d := replace(d, '''desconto_obtido'' end), -bx.desconto', '''desconto_obtido'' end, bx.fazenda_id), -bx.desconto');
  if d not like '%(''juros'', t.fazenda_id)%' or d not like '%(''juros'', bx.fazenda_id)%' or d not like '%end, bx.fazenda_id), bx.encargos%' or d not like '%end, bx.fazenda_id), -bx.desconto%' then
    raise exception 'exportar_contabilidade: trecho não encontrado';
  end if;
  execute d;
end $$;

commit;

-- conferência: deve mostrar o plano novo de 4 graus
select codigo, nome, tipo, case when sistema then 'criada pelo sistema' else '' end as origem from plano_contas order by string_to_array(codigo, '.')::int[];
