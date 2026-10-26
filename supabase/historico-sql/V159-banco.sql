-- V159: cliente produtor rural (fazendas do cliente com IE, inscrição no órgão de defesa sanitária, localidade e distrito)
-- e GTA obrigatória na venda de gado. Não apaga nem altera dados. Pode rodar mais de uma vez.

alter table public.pessoas_faturamento add column if not exists inscricao_sanitaria text;
alter table public.pessoas_faturamento add column if not exists localidade text;
alter table public.pessoas_faturamento add column if not exists distrito text;

alter table public.vendas add column if not exists gta_numero text;
alter table public.vendas add column if not exists gta_serie text;
alter table public.vendas add column if not exists gta_uf text;

-- salvar_venda: grava a GTA e a fazenda do cliente; venda de gado não fecha sem a GTA
do $$
declare d text; novo text;
begin
  d := pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure);
  if position('gta_numero' in d) > 0 then return; end if; -- já atualizada
  novo := replace(d,
    $a$  if nullif(p->>'pessoa_id','') is null then raise exception 'Informe o comprador.'; end if;$a$,
    $b$  if nullif(p->>'pessoa_id','') is null then raise exception 'Informe o comprador.'; end if;
  -- V159: venda de gado não fecha sem a GTA
  if v_tipo = 'animais' and nullif(trim(p->>'gta_numero'), '') is null then raise exception 'Informe o número da GTA: venda de gado não fecha sem a GTA.'; end if;
  if nullif(p->>'pessoa_faturamento_id', '') is not null
     and not exists (select 1 from pessoas_faturamento where id = (p->>'pessoa_faturamento_id')::uuid and pessoa_id = (p->>'pessoa_id')::uuid) then
    raise exception 'A fazenda escolhida não é deste cliente.';
  end if;$b$);
  novo := replace(novo,
    $a$insert into vendas (fazenda_id, tipo, pessoa_id, data,$a$,
    $b$insert into vendas (gta_numero, gta_serie, gta_uf, pessoa_faturamento_id, fazenda_id, tipo, pessoa_id, data,$b$);
  novo := replace(novo,
    $a$values (v_faz, v_tipo, (p->>'pessoa_id')::uuid, v_data,$a$,
    $b$values (nullif(trim(p->>'gta_numero'), ''), nullif(upper(trim(p->>'gta_serie')), ''), nullif(upper(trim(p->>'gta_uf')), ''), nullif(p->>'pessoa_faturamento_id', '')::uuid,
    v_faz, v_tipo, (p->>'pessoa_id')::uuid, v_data,$b$);
  if position('V159' in novo) = 0 or position('gta_numero, gta_serie, gta_uf, pessoa_faturamento_id' in novo) = 0 or position($x$nullif(trim(p->>'gta_numero'), ''), nullif(upper$x$ in novo) = 0 then
    raise exception 'V159: não foi possível atualizar salvar_venda (texto da função diferente do esperado).';
  end if;
  execute novo;
end $$;

-- conferência
select 'V159 ok' as resultado,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pessoas_faturamento' and column_name in ('inscricao_sanitaria', 'localidade', 'distrito')) as campos_cliente,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'vendas' and column_name in ('gta_numero', 'gta_serie', 'gta_uf')) as campos_gta,
  (select position('gta_numero' in pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure)) > 0) as venda_atualizada;
