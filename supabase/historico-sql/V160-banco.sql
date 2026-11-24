-- V160: série da nota fiscal na venda; quando a NF-e da venda é autorizada, o número e a série entram sozinhos na venda
-- e no contas a receber. Não apaga nem altera dados existentes. Pode rodar mais de uma vez.

alter table public.vendas add column if not exists documento_serie text;

-- salvar_venda: grava a série da nota
do $$
declare d text; novo text;
begin
  d := pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure);
  if position('documento_serie' in d) > 0 then return; end if; -- já atualizada
  novo := replace(d,
    $a$insert into vendas (gta_numero,$a$,
    $b$insert into vendas (documento_serie, gta_numero,$b$);
  novo := replace(novo,
    $a$values (nullif(trim(p->>'gta_numero'), ''),$a$,
    $b$values (nullif(trim(p->>'documento_serie'), ''), nullif(trim(p->>'gta_numero'), ''),$b$);
  if position('insert into vendas (documento_serie' in novo) = 0 or position($x$values (nullif(trim(p->>'documento_serie')$x$ in novo) = 0 then
    raise exception 'V160: não foi possível atualizar salvar_venda (rode antes o banco da V159).';
  end if;
  execute novo;
end $$;

-- NF-e autorizada: o número e a série da nota vão para a venda e para os títulos do contas a receber dela
create or replace function public.nfe_nota_na_venda()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.situacao = 'autorizada' and new.venda_id is not null and new.ambiente = 1
     and (tg_op = 'INSERT' or old.situacao is distinct from 'autorizada') then
    update vendas set numero_documento = new.numero::text, documento_serie = new.serie::text where id = new.venda_id;
    update lancamentos set documento = new.numero::text where venda_id = new.venda_id;
  end if;
  return new;
end $$;
revoke execute on function public.nfe_nota_na_venda() from public, anon, authenticated;

drop trigger if exists nfe_nota_na_venda on public.nfe_notas;
create trigger nfe_nota_na_venda after insert or update of situacao on public.nfe_notas
  for each row execute function public.nfe_nota_na_venda();

-- conferência
select 'V160 ok' as resultado,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'vendas' and column_name = 'documento_serie') as campo_serie,
  (select position('documento_serie' in pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure)) > 0) as venda_atualizada,
  (select count(*) from pg_trigger where tgname = 'nfe_nota_na_venda') as gatilho_nota;
