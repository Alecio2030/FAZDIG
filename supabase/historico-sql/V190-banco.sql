-- Fazenda Digital V190 – Estoque de gado: comunicação ao IDAF dos nascimentos e mortes
-- (rodado direto no Supabase; guardado aqui só como registro)

alter table public.estoque_fiscal_lanc drop constraint if exists estoque_fiscal_lanc_tipo_check;
alter table public.estoque_fiscal_lanc add constraint estoque_fiscal_lanc_tipo_check
  check (tipo in ('inicial', 'nascimento', 'morte', 'evolucao', 'ajuste_entrada', 'ajuste_saida', 'movimentacao', 'comunicacao'));
-- comunicação ao IDAF: o que foi comunicado {"nasc": {"M0": n, "F0": n}, "morte": {"M13": n, ...}} e o protocolo
alter table public.estoque_fiscal_lanc add column if not exists comunicado jsonb;
alter table public.estoque_fiscal_lanc add column if not exists protocolo text;

-- saldo: o Com GTA passa a ser lido da própria coluna (a comunicação mexe só no Com GTA)
create or replace function public.estoque_fiscal_gado(p_fazenda uuid, p_data date default current_date)
returns table(chave text, sexo text, faixa integer, saldo integer, entradas integer, saidas integer, saldo_gta integer, diferenca integer)
language sql stable security definer set search_path to 'public' as $function$
  with mov as (
    select k.key as chave, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int as q, 0 as qg
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k
     where l.fazenda_id = p_fazenda and l.data <= p_data
    union all
    select k.key, 0, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades_gta) k
     where l.fazenda_id = p_fazenda and l.data <= p_data and l.quantidades_gta is not null
    union all
    -- movimentação com GTA (sem a parte com GTA separada): tudo com GTA
    select k.key, 0, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k
     where l.fazenda_id = p_fazenda and l.data <= p_data and l.quantidades_gta is null and l.gta_numero is not null
    union all
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
