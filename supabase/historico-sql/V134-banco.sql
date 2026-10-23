-- V134: JÁ FOI RODADO no Supabase (não precisa rodar de novo). Fica aqui só como registro.
-- Tarefa cumprida fica 3 dias em "Tarefas cumpridas" e depois o banco apaga sozinho.
create or replace function public.agenda_apagar_cumpridas()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  delete from public.agenda_itens
   where feito_em is not null
     and feito_em < ((now() at time zone 'America/Sao_Paulo')::date - 3);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.agenda_apagar_cumpridas() from public, anon, authenticated;
select cron.unschedule('agenda-apagar-cumpridas') where exists (select 1 from cron.job where jobname = 'agenda-apagar-cumpridas');
select cron.schedule('agenda-apagar-cumpridas', '10 3 * * *', 'select public.agenda_apagar_cumpridas()');
