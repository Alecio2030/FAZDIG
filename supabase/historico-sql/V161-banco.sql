-- V161: a venda de gado grava sem a GTA e sem a NF (há estados que não exigem nota de produtor para produtor);
-- a GTA é exigida para o transporte e na NF-e do gado, e pode ser informada depois na venda.
-- Não apaga nem altera dados. Pode rodar mais de uma vez.

do $$
declare d text; novo text;
begin
  d := pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure);
  if position('Informe o número da GTA: venda' in d) = 0 then return; end if; -- já atualizada
  novo := replace(d,
    $a$  -- V159: venda de gado não fecha sem a GTA
  if v_tipo = 'animais' and nullif(trim(p->>'gta_numero'), '') is null then raise exception 'Informe o número da GTA: venda de gado não fecha sem a GTA.'; end if;
$a$, $b$  -- V161: a venda grava sem a GTA (ela é exigida para o transporte e na NF-e do gado; pode ser informada depois)
$b$);
  if position('Informe o número da GTA: venda' in novo) > 0 then raise exception 'V161: não foi possível atualizar salvar_venda.'; end if;
  execute novo;
end $$;

-- informar (ou corrigir) a GTA de uma venda de gado já gravada
create or replace function public.informar_gta_venda(p_venda uuid, p_numero text, p_serie text default null, p_uf text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v record;
begin
  select id, fazenda_id, tipo into v from vendas where id = p_venda;
  if not found or not public.acesso_fazenda(v.fazenda_id) then raise exception 'Venda não encontrada.'; end if;
  if v.tipo <> 'animais' then raise exception 'A GTA é só da venda de gado.'; end if;
  if nullif(trim(p_numero), '') is null then raise exception 'Informe o número da GTA.'; end if;
  update vendas set gta_numero = trim(p_numero), gta_serie = nullif(upper(trim(p_serie)), ''), gta_uf = nullif(upper(trim(p_uf)), '') where id = p_venda;
end $$;
revoke execute on function public.informar_gta_venda(uuid, text, text, text) from public, anon;
grant execute on function public.informar_gta_venda(uuid, text, text, text) to authenticated;

-- conferência
select 'V161 ok' as resultado,
  (select position('Informe o número da GTA: venda' in pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure)) = 0) as venda_sem_trava_gta,
  (select count(*) from pg_proc where proname = 'informar_gta_venda') as funcao_gta;
