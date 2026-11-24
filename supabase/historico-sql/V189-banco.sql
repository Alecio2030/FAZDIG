-- Fazenda Digital V189 – Estoque de gado: dois estoques (Total e Com GTA) e a Diferença
-- (rodado direto no Supabase; guardado aqui só como registro)

-- parte de cada lançamento que tem GTA (o resto é Diferença)
alter table public.estoque_fiscal_lanc add column if not exists quantidades_gta jsonb;

-- os saldos iniciais já lançados eram o estoque do IDAF (com GTA): ficam como Total e Com GTA iguais
update public.estoque_fiscal_lanc set quantidades_gta = quantidades
 where tipo = 'inicial' and quantidades_gta is null;

drop function if exists public.estoque_fiscal_gado(uuid, date);
create function public.estoque_fiscal_gado(p_fazenda uuid, p_data date default current_date)
returns table(chave text, sexo text, faixa integer, saldo integer, entradas integer, saidas integer, saldo_gta integer, diferenca integer)
language sql stable security definer set search_path to 'public' as $function$
  with mov as (
    -- lançamentos: quantidades = total; com GTA = quantidades_gta (ou tudo, quando veio de movimentação com GTA)
    select k.key as chave, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int as q,
           case when l.quantidades_gta is not null then coalesce(nullif(l.quantidades_gta ->> k.key, '')::numeric, 0)::int
                when l.gta_numero is not null then coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int
                else 0 end as qg
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k
     where l.fazenda_id = p_fazenda and l.data <= p_data
    union all
    -- GTAs emitidas: movimentam o total e o com GTA
    select k.key, s.v, s.v
      from gtas g, jsonb_each(g.quantidades) k,
           lateral (select (case when g.direcao = 'entrada' then 1 else -1 end) * coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int as v) s
     where g.fazenda_id = p_fazenda and g.situacao = 'emitida' and coalesce(g.emissao, g.created_at::date) <= p_data
  ),
  linhas(chave) as (values ('M0'), ('F0'), ('F3'), ('F9'), ('M13'), ('F13'), ('M25'), ('F25'), ('M37'), ('F37'))
  select l.chave, left(l.chave, 1), substr(l.chave, 2)::int,
         coalesce(sum(m.q), 0)::int,
         coalesce(sum(m.q) filter (where m.q > 0), 0)::int,
         coalesce(-sum(m.q) filter (where m.q < 0), 0)::int,
         coalesce(sum(m.qg), 0)::int,
         (coalesce(sum(m.q), 0) - coalesce(sum(m.qg), 0))::int
    from linhas l
    left join mov m on m.chave = l.chave
   where public.acesso_fazenda(p_fazenda)
   group by l.chave
   order by substr(l.chave, 2)::int, left(l.chave, 1) desc;
$function$;
grant execute on function public.estoque_fiscal_gado(uuid, date) to authenticated;
