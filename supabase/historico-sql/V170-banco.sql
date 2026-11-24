-- Fazenda Digital V170 – Parcelas intermediárias
-- Compras, Vendas, Contas a pagar e Contas a receber: além das parcelas normais, parcelas intermediárias
-- (a 1ª pode ser a entrada). Cada série tem numeração própria: "Interm. 2/5", "Parc. 7/36".
-- Não apaga nem altera dados. Pode rodar mais de uma vez.

alter table public.lancamentos add column if not exists intermediaria boolean not null default false;

-- nº da parcela dentro da sua série (intermediárias ou normais), pela ordem da lista enviada
create or replace function public.parc_serie(p_parcelas jsonb, p_k int)
returns int language sql immutable set search_path to 'public' as $$
  select count(*)::int from jsonb_array_elements(coalesce(p_parcelas, '[]')) with ordinality e(x, o)
  where o <= p_k
    and coalesce((x->>'intermediaria')::boolean, false) = coalesce((p_parcelas->(p_k - 1)->>'intermediaria')::boolean, false)
$$;
-- total de parcelas da série
create or replace function public.parc_serie_total(p_parcelas jsonb, p_k int)
returns int language sql immutable set search_path to 'public' as $$
  select count(*)::int from jsonb_array_elements(coalesce(p_parcelas, '[]')) e(x)
  where coalesce((x->>'intermediaria')::boolean, false) = coalesce((p_parcelas->(p_k - 1)->>'intermediaria')::boolean, false)
$$;
-- é intermediária?
create or replace function public.parc_interm(p_parcelas jsonb, p_k int)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce((p_parcelas->(p_k - 1)->>'intermediaria')::boolean, false)
$$;

-- encaixa a marca nas funções que gravam as parcelas (troca só a linha do insert)
do $$
declare
  f record; d text; n1 int; n2 int;
begin
  for f in
    select * from (values
      ('salvar_titulo', 'situacao, parcela, total_parcelas, codigo_barras', 'situacao, parcela, total_parcelas, intermediaria, codigo_barras',
                        '''aberto'', v_n, v_tot,', '''aberto'', parc_serie(p->''parcelas'', v_n), parc_serie_total(p->''parcelas'', v_n), parc_interm(p->''parcelas'', v_n),'),
      ('salvar_compra', 'situacao, parcela, total_parcelas, compra_id', 'situacao, parcela, total_parcelas, intermediaria, compra_id',
                        '''aberto'', v_n, v_tot_parc, v_id', '''aberto'', parc_serie(p->''parcelas'', v_n), parc_serie_total(p->''parcelas'', v_n), parc_interm(p->''parcelas'', v_n), v_id'),
      ('salvar_venda',  'situacao, parcela, total_parcelas, venda_id', 'situacao, parcela, total_parcelas, intermediaria, venda_id',
                        '''aberto'', v_n, v_tot, v_id', '''aberto'', parc_serie(p->''parcelas'', v_n), parc_serie_total(p->''parcelas'', v_n), parc_interm(p->''parcelas'', v_n), v_id')
    ) t(fn, col_de, col_para, val_de, val_para)
  loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f.fn and pg_get_function_identity_arguments(p.oid) = 'p jsonb';
    if d is null then raise exception 'Função % não encontrada.', f.fn; end if;
    if position('parc_serie(' in d) > 0 then continue; end if; -- já ajustada
    n1 := (length(d) - length(replace(d, f.col_de, ''))) / length(f.col_de);
    n2 := (length(d) - length(replace(d, f.val_de, ''))) / length(f.val_de);
    if n1 <> 1 or n2 <> 1 then raise exception 'Função % diferente do esperado (% / %): não alterada.', f.fn, n1, n2; end if;
    execute replace(replace(d, f.col_de, f.col_para), f.val_de, f.val_para);
  end loop;
end $$;

select 'V170 ok | intermediaria: ' ||
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'lancamentos' and column_name = 'intermediaria') ||
  ' | funções ajustadas: ' ||
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('salvar_titulo', 'salvar_compra', 'salvar_venda') and pg_get_functiondef(p.oid) like '%parc_serie(%') || ' de 3' as conferencia;
