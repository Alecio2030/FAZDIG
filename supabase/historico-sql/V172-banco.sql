-- Fazenda Digital V172 – Desconto no próprio item da compra
-- O item guarda o desconto dele (R$); o valor_total do item já é o líquido (qtde × unitário − desconto).
-- O desconto geral da nota continua sendo rateado pelo valor de cada item (como já era).
-- Não apaga nem altera dados. Pode rodar mais de uma vez.

alter table public.compra_itens add column if not exists desconto numeric not null default 0;

do $$
declare d text; c_de text; c_para text; v_de text; v_para text;
begin
  d := pg_get_functiondef('public.salvar_compra'::regproc);
  if position('it->>''desconto''' in d) > 0 then return; end if; -- já ajustada
  c_de := 'custo_total, custo_unitario, embalagens, conteudo_embalagem)';
  c_para := 'custo_total, custo_unitario, embalagens, conteudo_embalagem, desconto)';
  v_de := 'nullif(it->>''conteudo_embalagem'','''')::numeric)';
  v_para := 'nullif(it->>''conteudo_embalagem'','''')::numeric, coalesce(nullif(it->>''desconto'','''')::numeric, 0))';
  if (length(d) - length(replace(d, c_de, ''))) / length(c_de) <> 1 or (length(d) - length(replace(d, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'salvar_compra diferente do esperado: não alterada.';
  end if;
  execute replace(replace(d, c_de, c_para), v_de, v_para);
end $$;

select 'V172 ok | desconto do item: ' ||
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'compra_itens' and column_name = 'desconto') ||
  ' | salvar_compra: ' || (select case when pg_get_functiondef('public.salvar_compra'::regproc) like '%it->>''desconto''%' then 'ok' else 'não' end) as conferencia;
