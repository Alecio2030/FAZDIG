-- =====================================================================================
-- Fazenda Digital V143 – Últimas compras no Estoque, últimos fornecimentos no Fornecedor
--                        e plano de contas com Receitas e Custos nos mesmos graus 2 e 3
-- RODE ESTE ARQUIVO INTEIRO no SQL Editor do Supabase (Run). Pode rodar mais de uma vez: não faz mal.
-- (As partes 1 a 4 já foram gravadas em 20/10; a parte 5, do plano de contas, é a que falta.)
-- No fim aparece a conferência: os graus 2 e 3 das Receitas e dos Custos, lado a lado.
-- =====================================================================================

-- 1. Código do produto (nº sequencial, criado pelo sistema; os já cadastrados seguem a ordem de cadastro)
create sequence if not exists insumos_codigo_seq;
alter table insumos add column if not exists codigo integer;
do $$
begin
  if exists (select 1 from insumos where codigo is null) then
    update insumos i set codigo = x.n
      from (select id, (select coalesce(max(codigo), 0) from insumos) + row_number() over (order by created_at, nome) n
              from insumos where codigo is null) x
     where i.id = x.id;
  end if;
  perform setval('insumos_codigo_seq', greatest((select coalesce(max(codigo), 0) from insumos), 1), (select count(*) > 0 from insumos));
end $$;
alter table insumos alter column codigo set default nextval('insumos_codigo_seq');
alter sequence insumos_codigo_seq owned by insumos.codigo;
create unique index if not exists insumos_codigo_uk on insumos (codigo);
comment on column insumos.codigo is 'V143: código do produto, sequencial, criado pelo sistema';

-- 2. Prazo de pagamento de uma compra, em texto: "À vista" ou "30 / 60 / 90 dias" (dias da data da compra até cada vencimento)
create or replace function public.prazo_compra(p_compra uuid)
returns text language sql stable set search_path = public as $$
  select case
    when c.pago_na_hora or c.forma_pagamento = 'avista' then 'À vista'
    else (select case when count(*) = 0 then null
                      when count(*) = 1 and min(l.data_vencimento) <= c.data then 'À vista'
                      else string_agg((l.data_vencimento - c.data)::text, ' / ' order by l.parcela, l.data_vencimento) || ' dias' end
            from lancamentos l where l.compra_id = c.id and l.tipo = 'pagar')
  end
  from compras c where c.id = p_compra
$$;

-- 3. As 3 últimas compras de cada produto (todas as unidades que o usuário pode ver; respeita os acessos)
create or replace function public.ultimas_compras_insumos(p_insumos uuid[], p_qtd int default 3)
returns table (insumo_id uuid, compra_id uuid, numero int, data date, fazenda_id uuid, fornecedor text,
               quantidade numeric, unidade text, conteudo_embalagem numeric, valor_unitario numeric, custo_unitario numeric,
               prazo text, situacao text)
language sql stable set search_path = public as $$
  select x.insumo_id, x.compra_id, x.numero, x.data, x.fazenda_id, x.fornecedor, x.quantidade, x.unidade, x.conteudo_embalagem,
         x.valor_unitario, x.custo_unitario, public.prazo_compra(x.compra_id), x.situacao
    from (select i.insumo_id, c.id compra_id, c.numero, c.data, c.fazenda_id, coalesce(p.nome, 'Fornecedor não informado') fornecedor,
                 i.quantidade, i.unidade, i.conteudo_embalagem, i.valor_unitario, i.custo_unitario, c.situacao,
                 row_number() over (partition by i.insumo_id order by c.data desc, c.numero desc, i.created_at desc) n
            from compra_itens i
            join compras c on c.id = i.compra_id
            left join pessoas p on p.id = c.pessoa_id
           where i.insumo_id = any (p_insumos) and c.situacao <> 'cancelada') x
   where x.n <= p_qtd
   order by x.insumo_id, x.data desc, x.numero desc
$$;

-- 4. Os 3 últimos fornecimentos (compras) de cada fornecedor, com os itens
create or replace function public.ultimos_fornecimentos(p_pessoas uuid[], p_qtd int default 3)
returns table (pessoa_id uuid, compra_id uuid, numero int, data date, fazenda_id uuid, numero_documento text, valor_total numeric,
               prazo text, itens jsonb)
language sql stable set search_path = public as $$
  select x.pessoa_id, x.id, x.numero, x.data, x.fazenda_id, x.numero_documento, x.valor_total, public.prazo_compra(x.id),
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'produto', coalesce(s.nome, i.descricao, case i.tipo_item when 'animal' then 'Bovinos' else 'Serviço' end),
                    'codigo', s.codigo, 'quantidade', i.quantidade, 'unidade', i.unidade,
                    'conteudo_embalagem', i.conteudo_embalagem, 'conteudo_medida', s.conteudo_medida,
                    'valor_unitario', i.valor_unitario, 'custo_unitario', i.custo_unitario) order by i.created_at), '[]'::jsonb)
            from compra_itens i left join insumos s on s.id = i.insumo_id where i.compra_id = x.id)
    from (select c.*, row_number() over (partition by c.pessoa_id order by c.data desc, c.numero desc) n
            from compras c where c.pessoa_id = any (p_pessoas) and c.situacao <> 'cancelada') x
   where x.n <= p_qtd
   order by x.pessoa_id, x.data desc, x.numero desc
$$;

grant execute on function public.prazo_compra(uuid) to authenticated;
grant execute on function public.ultimas_compras_insumos(uuid[], int) to authenticated;
grant execute on function public.ultimos_fornecimentos(uuid[], int) to authenticated;

-- =====================================================================================
-- 5. PLANO DE CONTAS: Receitas (3) e Custos e despesas (4) com OS MESMOS graus 2 e 3
--    grau 2 = a fazenda (3.1 e 4.1 = FAZENDA 3 IRMÃOS; 3.2 e 4.2 = FAZENDA DAS GARÇAS; 3.9 e 4.9 = ADMINISTRAÇÃO)
--    grau 3, igual dos dois lados (centro de custo):
--      .01 AGRÍCOLA
--      .02 PECUÁRIA  (uma só; na Garças o empastado e o confinado viram uma Pecuária)
--      .05 OUTRAS RECEITAS  ×  DESPESAS OPERACIONAIS
--      .07 RECEITAS FINANCEIRAS  ×  DESPESAS FINANCEIRAS
--      .50 DEDUÇÕES DAS VENDAS (só nas Receitas: redutora da receita, não é custo)
--    As contas continuam as mesmas (lançamentos e tipos não mudam); só trocam código e nome.
--    Contas repetidas na junção da Pecuária da Garças viram uma só (o que apontava para a repetida passa para a que fica).
-- =====================================================================================
begin;

create table if not exists plano_contas_v142 as select * from plano_contas;

-- troca o código de um grupo e de tudo o que está dentro dele (passa por um prefixo provisório "x")
create or replace function public.renumerar_grupo(p_velho text, p_novo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update plano_contas set codigo = 'x' || p_novo || substr(codigo, length(p_velho) + 1)
   where codigo = p_velho or codigo like p_velho || '.%';
  update plano_contas set codigo = substr(codigo, 2) where codigo like 'x%';
end $$;

-- junta duas contas: tudo o que apontava para p_de passa a apontar para p_para, e p_de é apagada
create or replace function public.fundir_conta(p_de uuid, p_para uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_de is null or p_para is null or p_de = p_para then return; end if;
  for r in select cl.relname tab, a.attname col
             from pg_constraint c join pg_class cl on cl.oid = c.conrelid
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
            where c.contype = 'f' and c.confrelid = 'public.plano_contas'::regclass and cl.relnamespace = 'public'::regnamespace loop
    if r.tab = 'plano_contas' then
      execute format('update public.plano_contas set %I = $1 where %I = $2', r.col, r.col) using p_para, p_de;
    else
      execute format('update public.%I set %I = $1 where %I = $2', r.tab, r.col, r.col) using p_para, p_de;
    end if;
  end loop;
  delete from plano_contas where id = p_de;
end $$;

do $$
declare v_pec uuid; v_conf uuid; v_conf_cod text; c record; v_alvo uuid; v_n int;
begin
  -- (a) Receitas: financeiras .05 -> .07 ; outras .09 -> .05 (só uma vez: se já existe o 3.1.07, já foi feito)
  if not exists (select 1 from plano_contas where codigo = '3.1.07') then
    perform public.renumerar_grupo('3.1.05', '3.1.07');  perform public.renumerar_grupo('3.1.09', '3.1.05');
    perform public.renumerar_grupo('3.2.05', '3.2.07');  perform public.renumerar_grupo('3.2.09', '3.2.05');
    perform public.renumerar_grupo('3.9.05', '3.9.07');  perform public.renumerar_grupo('3.9.09', '3.9.05');
  end if;

  -- (b) Garças, custos: o confinado sai do caminho (4.2.98, provisório) e o empastado vira 4.2.02 PECUÁRIA
  select codigo into v_conf_cod from plano_contas where codigo ~ '^4\.2\.[0-9]+$' and upper(nome) like '%CONFINAD%' limit 1;
  if v_conf_cod is not null and v_conf_cod <> '4.2.98' then perform public.renumerar_grupo(v_conf_cod, '4.2.98'); end if;
  if exists (select 1 from plano_contas where codigo = '4.2.01' and upper(nome) like '%EMPASTAD%') then
    perform public.renumerar_grupo('4.2.01', '4.2.02');
  end if;
  update plano_contas set nome = 'PECUÁRIA' where codigo = '4.2.02';
  select id into v_pec from plano_contas where codigo = '4.2.02';
  select id into v_conf from plano_contas where codigo = '4.2.98';

  -- (c) as contas do confinado entram na Pecuária: nome igual (ou Medicamentos -> Medicamentos e Vacinas) junta; as outras mudam de grupo
  if v_conf is not null and v_pec is not null then
    for c in select * from plano_contas where conta_pai_id = v_conf order by codigo loop
      select id into v_alvo from plano_contas
       where conta_pai_id = v_pec and analitica
         and lower(trim(nome)) = case when lower(trim(c.nome)) = 'medicamentos' then 'medicamentos e vacinas' else lower(trim(c.nome)) end
       limit 1;
      if v_alvo is not null then
        perform public.fundir_conta(c.id, v_alvo);
      else
        -- o custo do gado do confinado vira 4.2.02.002 (Custo Aquisição Gado Bovino para Confinamento)
        if lower(trim(c.nome)) = 'custo do gado' and not exists (select 1 from plano_contas where codigo = '4.2.02.002') then
          v_n := 2;
        else
          select coalesce(max(split_part(codigo, '.', 4)::int), 0) + 1 into v_n from plano_contas
           where conta_pai_id = v_pec and split_part(codigo, '.', 4)::int < 99;
        end if;
        update plano_contas set conta_pai_id = v_pec, codigo = '4.2.02.' || lpad(v_n::text, 3, '0') where id = c.id;
      end if;
    end loop;
    perform public.fundir_conta(v_conf, v_pec);   -- o grupo do confinado, já vazio
  end if;

  -- (d) uma só Pecuária também nas Receitas (caso tenha ficado de alguma versão um 3.2.03 de confinado)
  update plano_contas set nome = 'PECUÁRIA' where codigo ~ '^3\.[0-9]+\.02$';
  select id into v_conf from plano_contas where codigo = '3.2.03' and upper(nome) like '%CONFINAD%';
  if v_conf is not null then
    for c in select * from plano_contas where conta_pai_id = v_conf loop
      perform public.fundir_conta(c.id, (select id from plano_contas where codigo = '3.2.02.001'));
    end loop;
    perform public.fundir_conta(v_conf, (select id from plano_contas where codigo = '3.2.02'));
  end if;
end $$;

-- nomes iguais dos dois lados
update plano_contas set nome = 'AGRÍCOLA' where codigo ~ '^[34]\.[0-9]+\.01$';
update plano_contas set nome = 'RECEITAS FINANCEIRAS' where codigo ~ '^3\.[0-9]+\.07$';
update plano_contas set nome = 'OUTRAS RECEITAS' where codigo ~ '^3\.[0-9]+\.05$';

-- Pecuária: uma só; a separação pasto × confinamento fica só nas analíticas de venda e de aquisição do gado
--   Receitas 3.N.02: .001 Venda de Gado Bovino Empastado, .002 Venda de Leite, .003 Venda de Gado Bovino Confinado
--   Custos   4.N.02: .001 Custo Aquisição Gado Bovino de Pasto, .002 Custo Aquisição Gado Bovino para Confinamento
update plano_contas set nome = 'Venda de Gado Bovino Empastado' where codigo ~ '^3\.[0-9]+\.02\.001$';
update plano_contas set nome = 'Custo Aquisição Gado Bovino de Pasto' where codigo ~ '^4\.[0-9]+\.02\.001$';
update plano_contas set nome = 'Custo Aquisição Gado Bovino para Confinamento' where codigo ~ '^4\.[0-9]+\.02\.002$';
select public.conta_garantir('3.1.02.003', 'Venda de Gado Bovino Confinado');
select public.conta_garantir('3.2.02.003', 'Venda de Gado Bovino Confinado');

-- o lado que faltava em cada centro
select public.conta_garantir('4.1.02', 'PECUÁRIA');
select public.conta_garantir('4.1.02.001', 'Custo Aquisição Gado Bovino de Pasto');
select public.conta_garantir('4.1.02.002', 'Custo Aquisição Gado Bovino para Confinamento');
select public.conta_garantir('4.1.02.099', 'Outros Custos da Pecuária');
select public.conta_garantir('4.2.01', 'AGRÍCOLA');
select public.conta_garantir('4.2.01.099', 'Outros Custos Agrícolas');

drop function public.renumerar_grupo(text, text);
drop function public.fundir_conta(uuid, uuid);

-- fazenda nova cadastrada: já nasce com os mesmos graus 3 nas Receitas e nos Custos
create or replace function public.montar_contas_unidade(p_n int, p_nome text, p_faz uuid, p_adm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r text := '3.' || p_n; d text := '4.' || p_n;
begin
  perform public.conta_garantir(r, upper(p_nome));
  perform public.conta_garantir(d, upper(p_nome));
  update plano_contas set fazenda_id = p_faz, adm = p_adm where codigo in (r, d);
  update plano_contas set fazenda_id = p_faz, adm = p_adm where codigo like r || '.%' or codigo like d || '.%';
  if not p_adm then
    -- .01 AGRÍCOLA e .02 PECUÁRIA, dos dois lados
    perform public.conta_garantir(r || '.01', 'AGRÍCOLA');
    perform public.conta_garantir(r || '.01.001', 'Venda de Café');
    perform public.conta_garantir(d || '.01', 'AGRÍCOLA');
    perform public.conta_garantir(d || '.01.099', 'Outros Custos Agrícolas');
    perform public.conta_garantir(r || '.02', 'PECUÁRIA');
    perform public.conta_garantir(r || '.02.001', 'Venda de Gado Bovino Empastado');
    perform public.conta_garantir(r || '.02.002', 'Venda de Leite');
    perform public.conta_garantir(r || '.02.003', 'Venda de Gado Bovino Confinado');
    perform public.conta_garantir(d || '.02', 'PECUÁRIA');
    perform public.conta_garantir(d || '.02.001', 'Custo Aquisição Gado Bovino de Pasto');
    perform public.conta_garantir(d || '.02.002', 'Custo Aquisição Gado Bovino para Confinamento');
    perform public.conta_garantir(d || '.02.099', 'Outros Custos da Pecuária');
  end if;
  -- .05 OUTRAS RECEITAS × DESPESAS OPERACIONAIS
  perform public.conta_garantir(r || '.05', 'OUTRAS RECEITAS');
  perform public.conta_garantir(r || '.05.002', 'Arrendamento e Aluguel de Pasto');
  perform public.conta_garantir(r || '.05.003', 'Venda de Bens do Imobilizado');
  perform public.conta_garantir(r || '.05.004', 'Receita de Fretes Prestados');
  perform public.conta_garantir(r || '.05.099', 'Outras Receitas');
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
  -- .07 RECEITAS FINANCEIRAS × DESPESAS FINANCEIRAS
  perform public.conta_garantir(r || '.07', 'RECEITAS FINANCEIRAS');
  perform public.conta_garantir(r || '.07.001', 'Juros Ativos');
  perform public.conta_garantir(r || '.07.003', 'Rendimentos de Aplicações');
  perform public.conta_garantir(r || '.07.004', 'Descontos Obtidos');
  perform public.conta_garantir(d || '.07', 'DESPESAS FINANCEIRAS');
  perform public.conta_garantir(d || '.07.001', 'Juros');
  perform public.conta_garantir(d || '.07.002', 'IOF');
  perform public.conta_garantir(d || '.07.003', 'Despesas com Contratação de Créditos');
  perform public.conta_garantir(d || '.07.004', 'Tarifas Bancárias');
  -- .50 DEDUÇÕES DAS VENDAS (só Receitas)
  perform public.conta_garantir(r || '.50', 'DEDUÇÕES DAS VENDAS');
  if not p_adm then
    perform public.conta_garantir(r || '.50.001', 'Vendas Canceladas');
    perform public.conta_garantir(r || '.50.002', 'ICMS');
    perform public.conta_garantir(r || '.50.003', 'Funrural');
  end if;
  perform public.conta_garantir(r || '.50.004', 'Descontos Concedidos');
end $$;

commit;

-- conferência: os graus 2 e 3 das Receitas e dos Custos, lado a lado
select coalesce(r.cod, d.cod) as centro, r.nome as receitas, d.nome as custos_e_despesas
  from (select substr(codigo, 3) cod, nome from plano_contas where codigo ~ '^3\.[0-9]+(\.[0-9]+)?$') r
  full join (select substr(codigo, 3) cod, nome from plano_contas where codigo ~ '^4\.[0-9]+(\.[0-9]+)?$') d on d.cod = r.cod
 order by string_to_array(coalesce(r.cod, d.cod), '.')::int[];
