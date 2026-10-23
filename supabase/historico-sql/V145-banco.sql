-- =====================================================================================
-- Fazenda Digital V145 – Talhão: total de plantas · Imobilizado: código patrimonial automático
-- RODE ESTE ARQUIVO INTEIRO no SQL Editor do Supabase (Run). Pode rodar mais de uma vez: não faz mal.
--
--  • Talhão: novo campo "Total de plantas efetivamente plantadas" (o do talhão inteiro).
--    As plantas por ha efetivas passam a ser calculadas: total ÷ área útil (ou total).
--  • Imobilizado: o código patrimonial nasce sozinho com a SIGLA da fazenda da entrada + nº em sequência
--    (ex.: TI 001, TI 002... na Fazenda 3 Irmãos; ADM 001 no Administrativo). Pode ser digitado outro.
--    Transferido para outra fazenda, o bem continua com o código que tinha. Código repetido é recusado.
--  • Os bens já cadastrados sem código recebem o automático, pela fazenda em que entraram.
-- No fim aparece a relação dos bens com o código.
-- =====================================================================================
begin;

-- ---------- talhão ----------
alter table areas add column if not exists plantas_total integer;
comment on column areas.plantas_total is 'V145: total de plantas efetivamente plantadas no talhão (plantas_ha_real = total ÷ área)';

-- ---------- imobilizado: fazenda da entrada do bem (antes de qualquer transferência) ----------
create or replace function public.fazenda_entrada_imob(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from imobilizado_alocacoes where imobilizado_id = p_id)
              then (select de_fazenda_id from imobilizado_alocacoes where imobilizado_id = p_id order by data, created_at limit 1)
              else (select fazenda_id from imobilizados where id = p_id) end;
$$;

-- ---------- próximo código: SIGLA + espaço + nº com 3 dígitos ----------
create or replace function public.proximo_codigo_patrimonial(p_fazenda uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_sigla text; v_n int;
begin
  select nullif(upper(trim(sigla)), '') into v_sigla from fazendas where id = p_fazenda;
  v_sigla := coalesce(v_sigla, case when p_fazenda is null then 'ADM' else 'BEM' end);
  select coalesce(max(substr(trim(codigo_patrimonial), length(v_sigla) + 2)::int), 0) + 1 into v_n
    from imobilizados
   where upper(left(trim(codigo_patrimonial), length(v_sigla) + 1)) = v_sigla || ' '
     and substr(trim(codigo_patrimonial), length(v_sigla) + 2) ~ '^[0-9]{1,9}$';
  return v_sigla || ' ' || lpad(v_n::text, 3, '0');
end $$;
grant execute on function public.proximo_codigo_patrimonial(uuid) to authenticated;

-- ---------- gatilho: cria o código quando vem em branco e não deixa repetir ----------
create or replace function public.trg_codigo_patrimonial()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_num int;
begin
  new.codigo_patrimonial := nullif(trim(new.codigo_patrimonial), '');
  if new.codigo_patrimonial is null then
    if tg_op = 'UPDATE' and nullif(trim(old.codigo_patrimonial), '') is not null then
      new.codigo_patrimonial := old.codigo_patrimonial;              -- o código nunca se perde
    elsif tg_op = 'UPDATE' then
      new.codigo_patrimonial := public.proximo_codigo_patrimonial(public.fazenda_entrada_imob(new.id));
    else
      new.codigo_patrimonial := public.proximo_codigo_patrimonial(new.fazenda_id);  -- fazenda da entrada
    end if;
  end if;
  if tg_op = 'INSERT' or new.codigo_patrimonial is distinct from old.codigo_patrimonial then
    select numero into v_num from imobilizados
     where upper(trim(codigo_patrimonial)) = upper(new.codigo_patrimonial) and id <> new.id limit 1;
    if v_num is not null then
      raise exception 'O código patrimonial % já é do bem nº %.', new.codigo_patrimonial, v_num;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_codigo_patrimonial on imobilizados;
create trigger trg_codigo_patrimonial before insert or update on imobilizados
  for each row execute function public.trg_codigo_patrimonial();

-- ---------- bens já cadastrados sem código: recebem o automático, na ordem do nº do bem ----------
do $$
declare r record;
begin
  for r in select id from imobilizados where nullif(trim(codigo_patrimonial), '') is null order by numero loop
    update imobilizados set codigo_patrimonial = public.proximo_codigo_patrimonial(public.fazenda_entrada_imob(r.id)) where id = r.id;
  end loop;
end $$;

commit;

-- conferência: os bens com o código
select i.numero as bem, i.codigo_patrimonial as codigo, i.nome, coalesce(f.nome, 'Administrativo') as alocado_em
  from imobilizados i left join fazendas f on f.id = i.fazenda_id
 order by i.codigo_patrimonial;
