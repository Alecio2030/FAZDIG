-- V202 · Contas a pagar e a receber: vencimento não pode ser antes da data da compra / emissão.
-- Vale para tudo o que grava títulos (compras, despesas, vendas, títulos avulsos).
-- Só confere quando o vencimento ou a emissão muda: baixas e estornos de títulos antigos seguem normais.
-- Pode rodar de novo sem problema.

create or replace function public.lanc_conferir_vencimento()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.data_vencimento is not null and new.data_emissao is not null
     and new.data_vencimento < new.data_emissao
     and (tg_op = 'INSERT' or new.data_vencimento is distinct from old.data_vencimento or new.data_emissao is distinct from old.data_emissao) then
    raise exception 'O vencimento % é antes da data % (%). Confira o dia e o ano.',
      to_char(new.data_vencimento, 'DD/MM/YYYY'),
      case when new.compra_id is not null then 'da compra' when new.venda_id is not null then 'da venda' else 'de emissão' end,
      to_char(new.data_emissao, 'DD/MM/YYYY');
  end if;
  return new;
end $function$;

drop trigger if exists trg_lanc_conferir_vencimento on public.lancamentos;
create trigger trg_lanc_conferir_vencimento
  before insert or update of data_vencimento, data_emissao on public.lancamentos
  for each row execute function public.lanc_conferir_vencimento();
