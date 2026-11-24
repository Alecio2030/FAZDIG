-- Fazenda Digital V171 – Contas a pagar/receber liberadas para alterar e excluir (implantação)
-- - Grupo de parcelas: os títulos gravados juntos no mesmo lançamento (mesmo instante, mesma pessoa que lançou).
-- - Excluir todas as parcelas do lançamento de uma vez.
-- - Estornar os pagamentos do grupo (para excluir) e do título (para alterar).
-- Não apaga nem altera dados. Pode rodar mais de uma vez.

-- títulos lançados direto no contas a pagar/receber junto com este (as parcelas do mesmo lançamento)
create or replace function public.titulos_do_grupo(p_id uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select g.id from lancamentos l join lancamentos g
    on g.created_at = l.created_at and g.tipo = l.tipo and g.created_by is not distinct from l.created_by
   and g.descricao is not distinct from l.descricao and g.pessoa_id is not distinct from l.pessoa_id
  where l.id = p_id
    and g.compra_id is null and g.venda_id is null and g.financiamento_id is null and g.frete_id is null
    and g.colheita_id is null and g.fech_colheita_id is null and g.vale_colheita_id is null
    and g.cafe_secagem_id is null and g.cafe_pilagem_id is null and g.cafe_movimento_id is null
    and g.cafe_contrato_id is null and g.venda_producao_id is null and g.recorrencia_id is null
    and public.acesso_fazenda(g.fazenda_id)
$$;

-- quantas parcelas tem o lançamento deste título (para o botão "Excluir as N parcelas")
create or replace function public.contar_grupo_titulo(p_id uuid)
returns int language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from public.titulos_do_grupo(p_id)
$$;

-- exclui todas as parcelas do lançamento (cada uma passa pelas regras do excluir_titulo)
create or replace function public.excluir_titulos_grupo(p_id uuid)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v uuid; v_n int := 0;
begin
  for v in select x from public.titulos_do_grupo(p_id) x loop
    perform public.excluir_titulo(v);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Título não encontrado.'; end if;
  return v_n;
end $$;

-- estornar_pagamentos passa a aceitar 'grupo' (todas as parcelas do lançamento)
create or replace function public.estornar_pagamentos(p_campo text, p_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ids uuid[];
  v_n int := 0;
  b record;
  v_compra uuid;
begin
  if not (public.e_dono() or public.e_admin_sistema()) then
    raise exception 'Só o Produtor ou o Administrador pode estornar e excluir lançamento que já tem pagamento. Peça a um deles, ou estorne o pagamento em Contas a pagar/receber.';
  end if;

  if p_campo = 'movimentacao' then
    -- compra de animais: os títulos são da compra ligada à entrada
    select compra_id into v_compra from movimentacoes where id = p_id;
    if v_compra is null then return 0; end if;
    p_campo := 'compra_id';
    p_id := v_compra;
  end if;

  if p_campo = 'grupo' then
    select array_agg(x) into v_ids from public.titulos_do_grupo(p_id) x;
  else
    if p_campo not in ('id', 'compra_id', 'venda_id', 'financiamento_id', 'frete_id', 'colheita_id', 'fech_colheita_id',
                       'vale_colheita_id', 'cafe_secagem_id', 'cafe_pilagem_id', 'cafe_movimento_id') then
      raise exception 'Lançamento não previsto para estorno: %.', p_campo;
    end if;
    execute format('select array_agg(id) from lancamentos where %I = $1', p_campo) into v_ids using p_id;
  end if;
  if v_ids is null then return 0; end if;

  if exists (select 1 from lancamentos where id = any (v_ids) and cafe_contrato_id is not null) then
    raise exception 'Este lançamento é adiantamento de contrato de café: estorne o recebimento em Contas a receber (o sistema confere as entregas).';
  end if;
  if exists (select 1 from lancamentos where id = any (v_ids) and not public.acesso_completo(fazenda_id)) then
    raise exception 'Sem acesso completo à unidade deste lançamento.';
  end if;

  for b in
    select id, lancamento_id from baixas
     where lancamento_id = any (v_ids) and situacao in ('pendente', 'confirmada') and compensa_venda_id is null
  loop
    update baixas set situacao = 'estornada', motivo = 'Estornado para excluir ou alterar o lançamento (implantação/correção)',
                      confirmado_por = auth.uid(), confirmado_em = now()
     where id = b.id;
    perform public.atualizar_titulo(b.lancamento_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

select 'V171 ok | funções: ' ||
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    and p.proname in ('titulos_do_grupo', 'contar_grupo_titulo', 'excluir_titulos_grupo')) || ' de 3 | estorno do grupo: ' ||
  (select case when pg_get_functiondef('public.estornar_pagamentos'::regproc) like '%''grupo''%' then 'sim' else 'não' end) as conferencia;
