-- FAZENDA DIGITAL V173 – Balancete e soma dos centros de custo (grau 3) nas abas
-- Não apaga nem altera dados. Pode rodar mais de uma vez.
-- Regime de competência: usa public.movimentos_resultado (títulos pela emissão, Atividades,
-- abastecimentos e sanidade pela data do consumo, juros/multas/descontos pela baixa).

-- Soma de cada conta das Receitas (3) e dos Custos e despesas (4) da(s) unidade(s), até o grau pedido.
-- p_fazendas: ids das fazendas; '00000000-0000-0000-0000-000000000000' = Administrativo (sede).
create or replace function public.balancete_resultado(p_fazendas uuid[], p_de date, p_ate date, p_grau integer default 4)
returns table(codigo text, nome text, grau integer, analitica boolean, valor numeric, qtde integer)
language sql stable
set search_path to 'public'
as $$
  with pref as (
    select pc.codigo
    from plano_contas pc
    where pc.codigo ~ '^[34]\.\d{2}$'
      and (pc.fazenda_id = any(p_fazendas)
           or (pc.fazenda_id is null and coalesce(pc.adm, false) and '00000000-0000-0000-0000-000000000000'::uuid = any(p_fazendas)))
  ),
  s as (
    select m.conta_codigo, m.valor, m.qtde
    from public.saldos_resultado(coalesce((select array_agg(codigo) from pref), array['x']), p_de, p_ate) m
  ),
  contas as (
    select pc.codigo, pc.nome,
      array_length(string_to_array(pc.codigo, '.'), 1) as grau,
      coalesce(pc.analitica, false) as analitica
    from plano_contas pc
    where exists (select 1 from pref p where pc.codigo = p.codigo or pc.codigo like p.codigo || '.%' or p.codigo like pc.codigo || '.%')
  )
  select c.codigo, c.nome, c.grau, c.analitica,
    coalesce((select sum(s.valor) from s where s.conta_codigo = c.codigo or s.conta_codigo like c.codigo || '.%'), 0)::numeric(14,2),
    coalesce((select sum(s.qtde) from s where s.conta_codigo = c.codigo or s.conta_codigo like c.codigo || '.%'), 0)::integer
  from contas c
  where c.grau <= greatest(1, least(coalesce(p_grau, 4), 4))
  order by c.codigo
$$;

grant execute on function public.balancete_resultado(uuid[], date, date, integer) to authenticated;

select 'V173 ok | balancete_resultado: ' || count(*) || ' contas com movimento em todas as unidades'
from public.balancete_resultado((select array_agg(id) || '00000000-0000-0000-0000-000000000000'::uuid from fazendas), '2000-01-01', '2100-12-31', 4)
where valor <> 0;
