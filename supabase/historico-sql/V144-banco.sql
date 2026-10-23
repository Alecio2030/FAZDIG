-- =====================================================================================
-- Fazenda Digital V144 – Centros de custo = contas de grau 3 do grupo 4 (Custos e despesas)
-- RODE ESTE ARQUIVO INTEIRO no SQL Editor do Supabase (Run). Pode rodar mais de uma vez: não faz mal.
--
--  • Cada conta de grau 3 do grupo 4 (4.1.01 AGRÍCOLA, 4.1.02 PECUÁRIA, 4.1.05 DESPESAS OPERACIONAIS...)
--    É um centro de custo, com o mesmo código e o mesmo nome. O sistema cria sozinho, agora e sempre que
--    uma conta de grau 3 do grupo 4 entrar, mudar de nome ou de código no Plano de contas.
--  • Dentro deles, o sistema cria sozinho as divisões (mesmo código + "-" + nº):
--      talhão           -> dentro do 4.N.01 AGRÍCOLA da fazenda   (ex.: 4.1.01-001 Talhão 1)
--      manga e lote     -> dentro do 4.N.02 PECUÁRIA da fazenda   (ex.: 4.2.02-001 Manga do Rio)
--    É por elas que o custo vai ao talhão, à manga e ao lote (atividades, colheita, secagem, pilagem).
--  • Os centros do Particular (sócios) continuam como estão: não são do grupo 4.
-- No fim aparece a relação dos centros.
-- =====================================================================================
begin;

alter table centros_custo add column if not exists conta_plano_id uuid references plano_contas(id) on delete set null;
create unique index if not exists centros_custo_conta_plano_uk on centros_custo (conta_plano_id) where conta_plano_id is not null;
comment on column centros_custo.conta_plano_id is 'V144: conta de grau 3 do grupo 4 que é este centro de custo (código e nome vêm do plano)';

-- ---------- o centro de uma conta de grau 3 do grupo 4 (cria ou acerta) ----------
create or replace function public.centro_do_grau3(p_conta uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c plano_contas%rowtype; v uuid;
begin
  select * into c from plano_contas where id = p_conta;
  if c.id is null or c.codigo !~ '^4\.[0-9]+\.[0-9]+$' then return null; end if;
  select id into v from centros_custo where conta_plano_id = c.id;
  if v is null then select id into v from centros_custo where codigo = c.codigo; end if;
  if v is null then
    insert into centros_custo (codigo, nome, fazenda_id, conta_plano_id, ativo)
      values (c.codigo, c.nome, c.fazenda_id, c.id, c.ativa) returning id into v;
  else
    update centros_custo set codigo = c.codigo, nome = c.nome, fazenda_id = c.fazenda_id, conta_plano_id = c.id,
                             ativo = c.ativa, centro_pai_id = null
     where id = v and (codigo, nome, fazenda_id, conta_plano_id, ativo, centro_pai_id)
                      is distinct from (c.codigo, c.nome, c.fazenda_id, c.id, c.ativa, null::uuid);
    -- as divisões acompanham o código e a fazenda do centro
    update centros_custo set codigo = c.codigo || '-' || split_part(codigo, '-', 2), fazenda_id = c.fazenda_id
     where centro_pai_id = v and codigo like '%-%' and (codigo not like c.codigo || '-%' or fazenda_id is distinct from c.fazenda_id);
  end if;
  return v;
end $$;

-- ---------- divisão automática (talhão, manga, lote) dentro do centro de grau 3 ----------
create or replace function public.centro_divisao(p_fazenda uuid, p_grupo text, p_nome text, p_area uuid, p_lote uuid, p_ativo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_conta uuid; v_pai uuid; v_cod_pai text; v uuid; v_atual centros_custo%rowtype; v_n int;
begin
  if p_fazenda is null or public.unidade_particular(p_fazenda) then return null; end if;
  select id into v_conta from plano_contas
   where fazenda_id = p_fazenda and codigo ~ ('^4\.[0-9]+\.' || p_grupo || '$') order by codigo limit 1;
  if v_conta is null then return null; end if;
  v_pai := public.centro_do_grau3(v_conta);
  select codigo into v_cod_pai from centros_custo where id = v_pai;
  select * into v_atual from centros_custo
   where (p_area is not null and area_id = p_area) or (p_lote is not null and lote_id = p_lote)
   order by coalesce(centro_pai_id = v_pai, false) desc, codigo limit 1;
  if v_atual.id is not null and v_atual.centro_pai_id = v_pai then
    update centros_custo set nome = p_nome, ativo = p_ativo, fazenda_id = p_fazenda
     where id = v_atual.id and (nome, ativo, fazenda_id) is distinct from (p_nome, p_ativo, p_fazenda);
    return v_atual.id;
  end if;
  select coalesce(max(nullif(split_part(codigo, '-', 2), '')::int), 0) + 1 into v_n
    from centros_custo where centro_pai_id = v_pai and split_part(codigo, '-', 2) ~ '^[0-9]+$';
  if v_atual.id is not null then
    -- era de outra estrutura (versão antiga ou outra fazenda): passa para dentro do centro certo
    update centros_custo set centro_pai_id = v_pai, codigo = v_cod_pai || '-' || lpad(v_n::text, 3, '0'),
                             nome = p_nome, fazenda_id = p_fazenda, ativo = p_ativo
     where id = v_atual.id;
    return v_atual.id;
  end if;
  insert into centros_custo (codigo, nome, centro_pai_id, fazenda_id, area_id, lote_id, ativo)
    values (v_cod_pai || '-' || lpad(v_n::text, 3, '0'), p_nome, v_pai, p_fazenda, p_area, p_lote, p_ativo)
    returning id into v;
  return v;
end $$;

create or replace function public.centro_da_area(p_area uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select id, fazenda_id, tipo, nome, coalesce(ativa, true) ativa into a from areas where id = p_area;
  if a.id is null then return null; end if;
  return public.centro_divisao(a.fazenda_id, case when a.tipo = 'talhao' then '01' else '02' end, a.nome, a.id, null, a.ativa);
end $$;

create or replace function public.centro_do_lote(p_lote uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare l record;
begin
  select id, fazenda_id, numero, descricao, situacao into l from lotes where id = p_lote;
  if l.id is null then return null; end if;
  return public.centro_divisao(l.fazenda_id, '02',
    'Lote ' || coalesce(l.numero::text, '') || coalesce(' – ' || nullif(trim(l.descricao), ''), ''), null, l.id, l.situacao = 'ativo');
end $$;

-- ---------- gatilhos: o plano, os talhões/mangas e os lotes mantêm os centros sozinhos ----------
create or replace function public.trg_centro_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update centros_custo set ativo = false where conta_plano_id = old.id;
    return old;
  end if;
  if new.codigo ~ '^4\.[0-9]+\.[0-9]+$' then
    perform public.centro_do_grau3(new.id);
  elsif tg_op = 'UPDATE' and new.codigo not like 'x%' then
    -- deixou de ser grau 3 do grupo 4
    update centros_custo set ativo = false where conta_plano_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_centro_plano on plano_contas;
create trigger trg_centro_plano after insert or update of codigo, nome, ativa, fazenda_id on plano_contas
  for each row execute function public.trg_centro_plano();
drop trigger if exists trg_centro_plano_excluir on plano_contas;
create trigger trg_centro_plano_excluir before delete on plano_contas
  for each row execute function public.trg_centro_plano();

create or replace function public.trg_centro_area()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.centro_da_area(new.id);
  return new;
end $$;
drop trigger if exists trg_centro_area on areas;
create trigger trg_centro_area after insert or update of nome, tipo, fazenda_id, ativa on areas
  for each row execute function public.trg_centro_area();

create or replace function public.trg_centro_lote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.centro_do_lote(new.id);
  return new;
end $$;
drop trigger if exists trg_centro_lote on lotes;
create trigger trg_centro_lote after insert or update of numero, descricao, situacao, fazenda_id on lotes
  for each row execute function public.trg_centro_lote();

-- ---------- a tela "Montar centros" deixa de existir: a função passa a só acertar os centros da fazenda ----------
drop function if exists public.montar_centros_fazenda(uuid);
create function public.montar_centros_fazenda(p_fazenda uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in select id from plano_contas where codigo ~ '^4\.[0-9]+\.[0-9]+$' and fazenda_id is not distinct from p_fazenda loop
    perform public.centro_do_grau3(r.id); v_n := v_n + 1;
  end loop;
  for r in select id from areas where fazenda_id = p_fazenda loop perform public.centro_da_area(r.id); v_n := v_n + 1; end loop;
  for r in select id from lotes where fazenda_id = p_fazenda loop perform public.centro_do_lote(r.id); v_n := v_n + 1; end loop;
  return jsonb_build_object('codigo', (select substr(min(codigo), 1, 3) from plano_contas where codigo ~ '^4\.[0-9]+$' and fazenda_id = p_fazenda), 'centros', v_n);
end $$;
grant execute on function public.montar_centros_fazenda(uuid) to authenticated;

-- ---------- agora: cria os centros de todas as contas de grau 3 do grupo 4, talhões, mangas e lotes ----------
do $$
declare r record;
begin
  for r in select id from plano_contas where codigo ~ '^4\.[0-9]+\.[0-9]+$' order by codigo loop perform public.centro_do_grau3(r.id); end loop;
  for r in select id from areas order by fazenda_id, tipo, nome loop perform public.centro_da_area(r.id); end loop;
  for r in select id from lotes order by fazenda_id, numero loop perform public.centro_do_lote(r.id); end loop;
end $$;

commit;

-- conferência: os centros de custo
select c.codigo, c.nome, f.nome as fazenda, case when c.ativo then '' else 'inativo' end as situacao
  from centros_custo c left join fazendas f on f.id = c.fazenda_id
 order by c.codigo;
