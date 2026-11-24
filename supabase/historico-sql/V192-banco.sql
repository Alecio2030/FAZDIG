-- Fazenda Digital V192 – Estoque de gado separado por dono: Próprio na fazenda, de cada Terceiro na fazenda
-- (parceiro) e Próprio em posse de terceiros (remessas em parceria), cada um com Total e Com GTA.
-- (rodado direto no Supabase; guardado aqui só como registro)

alter table public.estoque_fiscal_lanc add column if not exists dono text not null default 'proprio';
alter table public.estoque_fiscal_lanc add column if not exists parceiro_id uuid references public.pessoas(id);
alter table public.estoque_fiscal_lanc add column if not exists par_id uuid;  -- liga os dois lados de remessa, retorno e acerto
alter table public.estoque_fiscal_lanc drop constraint if exists estoque_fiscal_lanc_dono_check;
alter table public.estoque_fiscal_lanc add constraint estoque_fiscal_lanc_dono_check
  check (dono in ('proprio', 'terceiro', 'remessa') and ((dono = 'proprio') = (parceiro_id is null)));
alter table public.estoque_fiscal_lanc drop constraint if exists estoque_fiscal_lanc_tipo_check;
alter table public.estoque_fiscal_lanc add constraint estoque_fiscal_lanc_tipo_check
  check (tipo in ('inicial', 'nascimento', 'morte', 'evolucao', 'ajuste_entrada', 'ajuste_saida', 'movimentacao', 'comunicacao',
                  'entrada_parceria', 'saida_parceria', 'remessa', 'retorno', 'acerto'));
create index if not exists estoque_fiscal_lanc_par_idx on public.estoque_fiscal_lanc (par_id);

-- a GTA também diz de quem é o gado (padrão: próprio)
alter table public.gtas add column if not exists dono text not null default 'proprio';
alter table public.gtas add column if not exists parceiro_id uuid references public.pessoas(id);
alter table public.gtas drop constraint if exists gtas_dono_check;
alter table public.gtas add constraint gtas_dono_check
  check (dono in ('proprio', 'terceiro', 'remessa') and ((dono = 'proprio') = (parceiro_id is null)));

-- excluir um lado de um lançamento ligado apaga o outro
create or replace function public.trg_estoque_lanc_par() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if old.par_id is not null then delete from estoque_fiscal_lanc where par_id = old.par_id and id <> old.id; end if;
  return old;
end $$;
drop trigger if exists trg_estoque_lanc_par on public.estoque_fiscal_lanc;
create trigger trg_estoque_lanc_par after delete on public.estoque_fiscal_lanc for each row execute function public.trg_estoque_lanc_par();

-- saldos por dono: uma grade de 10 faixas para cada dono (o próprio sempre aparece)
create or replace function public.estoque_gado_donos(p_fazenda uuid, p_data date default current_date)
returns table(dono text, parceiro_id uuid, parceiro text, chave text, sexo text, faixa integer, saldo integer, entradas integer, saidas integer, saldo_gta integer, diferenca integer)
language sql stable security definer set search_path to 'public' as $function$
  with mov as (
    select l.dono, l.parceiro_id, k.key as chave, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int as q, 0 as qg
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k
     where l.fazenda_id = p_fazenda and l.data <= p_data
    union all
    select l.dono, l.parceiro_id, k.key, 0, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades_gta) k
     where l.fazenda_id = p_fazenda and l.data <= p_data and l.quantidades_gta is not null
    union all
    select l.dono, l.parceiro_id, k.key, 0, coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int
      from estoque_fiscal_lanc l, jsonb_each(l.quantidades) k
     where l.fazenda_id = p_fazenda and l.data <= p_data and l.quantidades_gta is null and l.gta_numero is not null
    union all
    -- GTA de gado nosso em posse de terceiro: a de saída tira do Próprio e põe no quadro do parceiro; a de entrada (devolução) faz o inverso
    select x.dono, x.pid, k.key, x.f * (case when v.ja_total then 0 else s.v end), x.f * (case when v.ja_gta then 0 else s.v end)
      from gtas g
      cross join lateral (
        select g.dono as dono, g.parceiro_id as pid, 1 as f where g.dono <> 'remessa'
        union all select 'proprio', null::uuid, 1 where g.dono = 'remessa'
        union all select 'remessa', g.parceiro_id, -1 where g.dono = 'remessa'
      ) x
      cross join lateral (
        select exists (select 1 from estoque_fiscal_lanc l where l.fazenda_id = g.fazenda_id and l.movimentacao_id is not null
                         and (l.movimentacao_id = g.movimentacao_id or l.movimentacao_id in (select id from movimentacoes where g.venda_id is not null and venda_id = g.venda_id))) as ja_total,
               exists (select 1 from estoque_fiscal_lanc l where l.fazenda_id = g.fazenda_id and l.movimentacao_id is not null
                         and coalesce(l.quantidades_gta, '{}'::jsonb) <> '{}'::jsonb
                         and (l.movimentacao_id = g.movimentacao_id or l.movimentacao_id in (select id from movimentacoes where g.venda_id is not null and venda_id = g.venda_id))) as ja_gta
      ) v,
      jsonb_each(g.quantidades) k,
      lateral (select (case when g.direcao = 'entrada' then 1 else -1 end) * coalesce(nullif(k.value #>> '{}', '')::numeric, 0)::int as v) s
     where g.fazenda_id = p_fazenda and g.situacao = 'emitida' and coalesce(g.emissao, g.created_at::date) <= p_data
  ),
  donos as (select distinct m.dono, m.parceiro_id from mov m union select 'proprio', null::uuid),
  linhas(chave) as (values ('M0'), ('F0'), ('F3'), ('F9'), ('M13'), ('F13'), ('M25'), ('F25'), ('M37'), ('F37'))
  select d.dono, d.parceiro_id, p.nome, l.chave, left(l.chave, 1), substr(l.chave, 2)::int,
         coalesce(sum(m.q), 0)::int,
         coalesce(sum(m.q) filter (where m.q > 0), 0)::int,
         coalesce(-sum(m.q) filter (where m.q < 0), 0)::int,
         coalesce(sum(m.qg), 0)::int,
         (coalesce(sum(m.q), 0) - coalesce(sum(m.qg), 0))::int
    from donos d
    cross join linhas l
    left join pessoas p on p.id = d.parceiro_id
    left join mov m on m.chave = l.chave and m.dono = d.dono and m.parceiro_id is not distinct from d.parceiro_id
   where public.acesso_fazenda(p_fazenda)
   group by d.dono, d.parceiro_id, p.nome, l.chave
   order by case d.dono when 'proprio' then 0 when 'terceiro' then 1 else 2 end, p.nome, substr(l.chave, 2)::int, left(l.chave, 1) desc;
$function$;
grant execute on function public.estoque_gado_donos(uuid, date) to authenticated;

-- o estoque "da fazenda" que a venda, o nascimento e a transferência olham é só o Próprio na fazenda
create or replace function public.estoque_fiscal_gado(p_fazenda uuid, p_data date default current_date)
returns table(chave text, sexo text, faixa integer, saldo integer, entradas integer, saidas integer, saldo_gta integer, diferenca integer)
language sql stable security definer set search_path to 'public' as $function$
  select d.chave, d.sexo, d.faixa, d.saldo, d.entradas, d.saidas, d.saldo_gta, d.diferenca
    from public.estoque_gado_donos(p_fazenda, p_data) d
   where d.dono = 'proprio';
$function$;
grant execute on function public.estoque_fiscal_gado(uuid, date) to authenticated;
