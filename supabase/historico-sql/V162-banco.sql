-- V162: faixas de idade do gado por sexo (exigência da GTA/IDAF e da NF-e) em todo o sistema.
--   Machos: 0 a 12, 13 a 24, 25 a 36 e + 36 meses
--   Fêmeas: 0 a 2, 3 a 8, 9 a 12, 13 a 24, 25 a 36 e + 36 meses
-- O animal continua gravado com a data de nascimento (exata ou aproximada); a faixa é calculada pela idade,
-- então o estoque "envelhece" sozinho e cada animal muda de faixa no tempo certo.
-- Não apaga nem altera dados existentes. Pode rodar mais de uma vez.

-- 1) A tabela das faixas (a mesma do app, em src/lib/faixas.ts)
create table if not exists public.faixas_idade (
  sexo char(1) not null check (sexo in ('M', 'F')),
  de integer not null check (de >= 0),
  ate integer check (ate is null or ate >= de),
  rotulo text not null,
  ordem integer not null,
  primary key (sexo, de)
);
alter table public.faixas_idade enable row level security;
drop policy if exists faixas_idade_ler on public.faixas_idade;
create policy faixas_idade_ler on public.faixas_idade for select to authenticated using (true);
revoke insert, update, delete on public.faixas_idade from anon, authenticated;

insert into public.faixas_idade (sexo, de, ate, rotulo, ordem) values
  ('M', 0, 12, '0 a 12 meses', 1),
  ('M', 13, 24, '13 a 24 meses', 2),
  ('M', 25, 36, '25 a 36 meses', 3),
  ('M', 37, null, '+ 36 meses', 4),
  ('F', 0, 2, '0 a 2 meses', 1),
  ('F', 3, 8, '3 a 8 meses', 2),
  ('F', 9, 12, '9 a 12 meses', 3),
  ('F', 13, 24, '13 a 24 meses', 4),
  ('F', 25, 36, '25 a 36 meses', 5),
  ('F', 37, null, '+ 36 meses', 6)
on conflict (sexo, de) do nothing;

-- 2) Em que faixa cai uma idade
create or replace function public.faixa_idade(p_sexo text, p_meses integer)
returns table (de integer, ate integer, rotulo text, ordem integer)
language sql stable set search_path to 'public' as $$
  select f.de, f.ate, f.rotulo, f.ordem from faixas_idade f
   where f.sexo = upper(trim(p_sexo)) and p_meses >= f.de and (f.ate is null or p_meses <= f.ate)
   limit 1;
$$;
grant execute on function public.faixa_idade(text, integer) to authenticated;

-- 3) Estoque de gado da fazenda por sexo e faixa (agora com as faixas próprias de cada sexo)
create or replace function public.estoque_gado_faixas(p_fazenda uuid)
returns table (sexo character, faixa text, idade_de integer, idade_ate integer, cabecas integer)
language sql stable security definer set search_path to 'public' as $$
  select f.sexo, f.rotulo, f.de, f.ate, count(*)::int
    from animais a
    join faixas_idade f on f.sexo = trim(a.sexo)
     and public.idade_meses(a.data_nascimento) >= f.de
     and (f.ate is null or public.idade_meses(a.data_nascimento) <= f.ate)
   where a.fazenda_id = p_fazenda and a.situacao = 'ativo' and a.data_nascimento is not null and public.acesso_fazenda(p_fazenda)
   group by f.sexo, f.rotulo, f.de, f.ate, f.ordem
   order by f.sexo, f.ordem;
$$;
revoke execute on function public.estoque_gado_faixas(uuid) from public, anon;
grant execute on function public.estoque_gado_faixas(uuid) to authenticated;

-- 4) Os animais de uma venda de gado por sexo e faixa, com a idade na data da saída (para a GTA e a NF-e)
create or replace function public.venda_gado_faixas(p_venda uuid)
returns table (sexo character, faixa text, ordem integer, cabecas integer, peso_kg numeric)
language sql stable security definer set search_path to 'public' as $$
  select f.sexo, f.rotulo, f.ordem, count(*)::int, sum(i.peso_kg)
    from vendas v
    join movimentacoes m on m.venda_id = v.id
    join movimentacao_itens i on i.movimentacao_id = m.id
    join animais a on a.id = i.animal_id
    join faixas_idade f on f.sexo = trim(coalesce(i.sexo, a.sexo))
     and public.idade_meses(a.data_nascimento, m.data) >= f.de
     and (f.ate is null or public.idade_meses(a.data_nascimento, m.data) <= f.ate)
   where v.id = p_venda and a.data_nascimento is not null and public.acesso_fazenda(v.fazenda_id)
   group by f.sexo, f.rotulo, f.ordem
   order by f.sexo desc, f.ordem; -- machos primeiro, como na GTA
$$;
revoke execute on function public.venda_gado_faixas(uuid) from public, anon;
grant execute on function public.venda_gado_faixas(uuid) to authenticated;

-- conferência
select 'V162 ok' as resultado,
  (select count(*) from public.faixas_idade where sexo = 'M') as faixas_machos,
  (select count(*) from public.faixas_idade where sexo = 'F') as faixas_femeas,
  (select count(*) from pg_proc where proname in ('faixa_idade', 'venda_gado_faixas')) as funcoes_novas;
