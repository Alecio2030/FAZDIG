-- V164: venda de gado de vários lotes de uma vez (nº do lote e cabeças de cada um; o peso bruto total é repartido
-- entre os lotes pelas cabeças). Cada lote gera a sua saída do rebanho, todas ligadas à mesma venda.
-- Não apaga nem altera dados. Pode rodar mais de uma vez.

do $$
declare d text; novo text;
begin
  d := pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure);
  if position('V164: vários lotes' in d) > 0 then return; end if; -- já atualizada

  novo := replace(d, 'v_bv numeric; v_cli numeric;', 'v_bv numeric; v_cli numeric; v_mov_ids uuid[]; v_qtot int; lt jsonb;');

  novo := replace(novo,
    $a$    v_mov := public.lancar_movimentacao(json_build_object(
      'tipo', 'venda', 'fazenda', v_faz, 'data', v_data, 'lote_origem', a->>'lote_origem',$a$,
    $b$    if jsonb_array_length(coalesce(a->'lotes', '[]'::jsonb)) > 1 then
      -- V164: vários lotes: uma saída por lote, todas desta venda
      if nullif(a->>'pesagem', '') is not null then raise exception 'Com vários lotes, a venda não usa a pesagem: informe o peso bruto total.'; end if;
      select coalesce(sum(nullif(x->>'quantidade', '')::int), 0) into v_qtot from jsonb_array_elements(a->'lotes') x;
      if v_qtot < 1 then raise exception 'Informe as cabeças de cada lote.'; end if;
      v_cab := 0;
      v_mov_ids := '{}';
      for lt in select * from jsonb_array_elements(a->'lotes') loop
        if coalesce(nullif(lt->>'quantidade', '')::int, 0) < 1 then raise exception 'Informe as cabeças de cada lote.'; end if;
        v_mov := public.lancar_movimentacao(json_build_object(
          'tipo', 'venda', 'fazenda', v_faz, 'data', v_data, 'lote_origem', lt->>'lote_id',
          'quantidade', (lt->>'quantidade')::int, 'animais', '[]'::json,
          'peso_total', case when v_bruto_kg is not null then round(v_bruto_kg * (lt->>'quantidade')::int / v_qtot, 2) end,
          'pessoa', p->>'pessoa_id', 'documento', p->>'numero_documento', 'obs', p->>'observacoes'));
        v_mov_ids := v_mov_ids || (v_mov->>'id')::uuid;
        v_cab := v_cab + (v_mov->>'cabecas')::int;
      end loop;
    else
    v_mov := public.lancar_movimentacao(json_build_object(
      'tipo', 'venda', 'fazenda', v_faz, 'data', v_data, 'lote_origem', a->>'lote_origem',$b$);

  novo := replace(novo,
    $a$    v_cab := (v_mov->>'cabecas')::int;
$a$,
    $b$    v_cab := (v_mov->>'cabecas')::int;
      v_mov_ids := array[v_mov_id];
    end if;
$b$);

  novo := replace(novo, 'update movimentacoes set venda_id = v_id where id = v_mov_id;', 'update movimentacoes set venda_id = v_id where id = any (v_mov_ids);');

  if position('V164: vários lotes' in novo) = 0 or position('any (v_mov_ids)' in novo) = 0 or position('v_mov_ids := array[v_mov_id]' in novo) = 0
     or position('v_mov_ids uuid[]' in novo) = 0 then
    raise exception 'V164: não foi possível atualizar salvar_venda (rode antes o banco da V161).';
  end if;
  execute novo;
end $$;

-- conferência
select 'V164 ok' as resultado,
  (select position('V164: vários lotes' in pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure)) > 0) as venda_varios_lotes;
