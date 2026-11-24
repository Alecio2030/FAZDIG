-- FAZENDA DIGITAL V176 – Balancete com as contas patrimoniais (Ativo, Passivo e Patrimônio Líquido) do Grupo
-- Não apaga nem altera dados. Pode rodar mais de uma vez.
-- Sistema gerencial: os saldos são apurados a partir dos registros (bancos, títulos, estoques, imobilizado,
-- financiamentos), na data pedida. O PL fecha a conta: Saldos de abertura = Ativo – Passivo – Resultado – Retiradas.

create or replace function public.balancete_patrimonial(p_ate date)
returns table(codigo text, nome text, grau integer, valor numeric)
language sql stable set search_path to 'public'
as $$
  with
  -- pago (principal) de cada título até a data
  pago as (
    select b.lancamento_id, sum(b.valor_principal) as v
    from baixas b where b.situacao = 'confirmada' and b.data <= p_ate group by b.lancamento_id
  ),
  tit as (
    select l.*, pc.codigo as conta_cod, coalesce(p.v, 0) as pago_v,
      greatest(l.valor - coalesce(p.v, 0), 0) as aberto,
      public.unidade_particular(l.fazenda_id) as part,
      (select v.tipo from vendas v where v.id = l.venda_id) as venda_tipo
    from lancamentos l
    left join plano_contas pc on pc.id = l.conta_contabil_id
    left join pago p on p.lancamento_id = l.id
    where l.situacao <> 'cancelado' and l.data_emissao <= p_ate
  ),
  linhas as (
    -- 1.1.01 Disponibilidades: saldo de cada caixa/banco na data
    select coalesce(pc.codigo, '1.1.01.001') as codigo,
      coalesce(c.saldo_inicial, 0) * (case when c.data_saldo_inicial is null or c.data_saldo_inicial <= p_ate then 1 else 0 end)
      + coalesce((select sum(case when l.tipo = 'receber' then b.valor_pago else -b.valor_pago end)
                  from baixas b join lancamentos l on l.id = b.lancamento_id
                  where b.conta_bancaria_id = c.id and b.situacao = 'confirmada' and b.data <= p_ate
                    and (c.data_saldo_inicial is null or b.data >= c.data_saldo_inicial)
                    and (inicio_sistema() is null or b.data >= inicio_sistema())), 0) as valor
    from contas_bancarias c left join plano_contas pc on pc.id = c.conta_plano_id
    union all
    -- 1.1.02 Clientes: contas a receber em aberto na data (sem o Particular)
    select case when t.venda_tipo = 'animais' then '1.1.02.001' when t.venda_tipo = 'cafe' then '1.1.02.002' else '1.1.02.003' end, t.aberto
    from tit t
    where t.tipo = 'receber' and t.aberto > 0 and not t.part and coalesce(t.conta_cod, '') not like '2.1.%' and coalesce(t.conta_cod, '') not like '2.2.%'
    union all
    -- 1.1.02.05x Adiantamentos pagos (a fornecedores e funcionários)
    select t.conta_cod, t.pago_v from tit t where t.tipo = 'pagar' and t.conta_cod in ('1.1.02.051', '1.1.02.052') and t.pago_v > 0
    union all
    -- 1.1.03 Estoques: entradas menos saídas, a custo, por categoria do produto
    select case
             when lower(i.categoria) = 'defensivo' then '1.1.03.001'
             when lower(i.categoria) in ('fertilizante', 'adubo', 'corretivo') then '1.1.03.002'
             when lower(i.categoria) = 'semente' then '1.1.03.003'
             when lower(i.categoria) in ('racao', 'sal_mineral', 'sal', 'proteinado', 'suplemento', 'silagem', 'volumoso') then '1.1.03.004'
             when lower(i.categoria) in ('medicamento', 'vacina', 'semen', 'embriao') then '1.1.03.005'
             else '1.1.03.006' end,
      sum(em.quantidade * coalesce(em.valor_unitario, 0) * case when em.tipo = 'saida' then -1 else 1 end)
    from estoque_movimentos em join insumos i on i.id = em.insumo_id
    where em.data <= p_ate
    group by 1
    union all
    -- 1.6.01 Imobilizado: valor dos bens em uso na data, por categoria
    select case
             when im.situacao = 'formacao' then '1.6.01.011'
             when im.categoria = 'tratores' then '1.6.01.001'
             when im.categoria = 'maquinas' then '1.6.01.002'
             when im.categoria = 'veiculos' then '1.6.01.004'
             when im.categoria in ('benfeitorias', 'cercas', 'barragens', 'estradas') then '1.6.01.007'
             when im.categoria in ('cafe', 'perene', 'pastagem') then '1.6.01.009'
             else '1.6.01.006' end,
      coalesce(im.valor_aquisicao, 0)
    from imobilizados im
    where coalesce(im.data_ativacao, im.formacao_inicio, p_ate) <= p_ate
      and not (im.situacao = 'baixado' and im.data_baixa is not null and im.data_baixa <= p_ate)
    union all
    -- 1.6.09 (–) Depreciação e exaustão acumuladas até a data (dos bens que ainda estão em uso)
    select '1.6.09.001', -sum(d.valor)
    from public.depreciacao_mensal('1900-01-01', p_ate) d join imobilizados im on im.id = d.imobilizado_id
    where not (im.situacao = 'baixado' and im.data_baixa is not null and im.data_baixa <= p_ate)
    union all
    -- 2.1.01 Fornecedores: contas a pagar em aberto (sem financiamentos, adiantamentos, retiradas e Particular)
    select '2.1.01.003', -t.aberto
    from tit t
    where t.tipo = 'pagar' and t.aberto > 0 and t.financiamento_id is null and not t.part
      and coalesce(t.conta_cod, '') not in ('1.1.02.051', '1.1.02.052') and coalesce(t.conta_cod, '') not like '2.3.05.%'
    union all
    -- 2.1.03 Adiantamentos de clientes recebidos (contratos de café)
    select '2.1.03.001', -t.pago_v from tit t where t.tipo = 'receber' and t.conta_cod = '2.1.03.001' and t.pago_v > 0
    union all
    -- 2.1.04 / 2.2.01 Financiamentos: principal das parcelas ainda não pago (até 12 meses = curto prazo)
    select case when fp.vencimento <= p_ate + 365
                then case when f.finalidade = 'custeio' then '2.1.04.001' else '2.1.04.002' end
                else '2.2.01.001' end,
      -round(fp.principal * case when l.id is null or l.valor <= 0 then 1 else greatest(0, 1 - coalesce(p.v, 0) / l.valor) end, 2)
    from financiamento_parcelas fp
    join financiamentos f on f.id = fp.financiamento_id
    left join lancamentos l on l.id = fp.lancamento_id and l.situacao <> 'cancelado'
    left join pago p on p.lancamento_id = l.id
    where coalesce(f.data_liberacao, f.primeiro_vencimento) <= p_ate and fp.principal > 0
    union all
    -- 2.3.05 Retiradas e Particular dos sócios (competência)
    select case when t.part then case when t.tipo = 'receber' then '2.3.05.004' else '2.3.05.003' end else t.conta_cod end,
      case when t.tipo = 'receber' then -t.valor else t.valor end   -- retirada diminui o PL (devedora)
    from tit t where (t.part or coalesce(t.conta_cod, '') like '2.3.05.%') and not coalesce(t.abertura, false)
    union all
    -- 2.3.90 Resultado acumulado das atividades (receitas – custos e despesas, competência)
    select '2.3.90.001', -coalesce(sum(case when m.conta_codigo like '3.%' then m.valor else -m.valor end), 0)   -- lucro aumenta o PL (credor)
    from public.movimentos_resultado(array['3', '4'], '1900-01-01', p_ate) m
  ),
  soma as (select l.codigo, sum(l.valor) as valor from linhas l where l.codigo is not null group by l.codigo),
  -- nas linhas: devedor positivo, credor negativo. No resultado: Ativo positivo; Passivo e PL positivos quando credores
  ativo as (select coalesce(sum(valor), 0) v from soma where codigo like '1.%'),
  devido as (select coalesce(sum(-valor), 0) v from soma where codigo like '2.1.%' or codigo like '2.2.%'),
  pl_mov as (select coalesce(sum(valor), 0) v from soma where codigo like '2.3.%'),
  todos as (
    select s.codigo, case when s.codigo like '1.%' then s.valor else -s.valor end as valor from soma s
    union all
    -- o que fecha a conta é o saldo de abertura (o patrimônio que já existia na implantação)
    select '2.3.01.001', (select v from ativo) - (select v from devido) + (select v from pl_mov)
  ),
  folhas as (select t.codigo, sum(t.valor) as valor from todos t group by t.codigo),
  nomes as (
    select pc.codigo, pc.nome from plano_contas pc where pc.codigo ~ '^[12](\.|$)'
    union all select '1.6.09', '(–) DEPRECIAÇÃO E EXAUSTÃO ACUMULADAS'
    union all select '1.6.09.001', '(–) Depreciação e exaustão acumuladas'
    union all select '2.3.90', 'RESULTADO ACUMULADO'
    union all select '2.3.90.001', 'Resultado das atividades (desde o início do sistema)'
  ),
  contas as (
    select n.codigo, min(n.nome) as nome, array_length(string_to_array(n.codigo, '.'), 1) as grau
    from nomes n group by n.codigo
  )
  select c.codigo, c.nome, c.grau,
    round(coalesce((select sum(f.valor) from folhas f where f.codigo = c.codigo or f.codigo like c.codigo || '.%'), 0), 2)::numeric
  from contas c
  order by c.codigo
$$;
grant execute on function public.balancete_patrimonial(date) to authenticated;

select 'V176 ok | Ativo: ' || (select valor from public.balancete_patrimonial(current_date) where codigo = '1')
  || ' | Passivo + PL: ' || (select valor from public.balancete_patrimonial(current_date) where codigo = '2');
