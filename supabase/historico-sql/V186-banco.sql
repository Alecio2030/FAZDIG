-- Fazenda Digital V186 – Modo Vaqueiro: Pesagem e Transferências (manga e lote)
-- (rodado direto no Supabase; guardado aqui só como registro)

alter table public.campo_registros drop constraint if exists campo_registros_tipo_check;
alter table public.campo_registros add constraint campo_registros_tipo_check
  check (tipo in ('contagem', 'vistoria', 'tarefa_feita', 'sanidade', 'nascimento', 'morte', 'sumido', 'achado', 'cio', 'pesagem', 'transferencia'));

-- campo_enviar: recebe também pesagem e transferência (só confere e monta o resumo; lança ao confirmar)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.campo_enviar(jsonb)'::regprocedure);
  if position('''pesagem''' in d) = 0 then
    d := replace(d, $q$      else
        raise exception 'Tipo de lançamento do campo inválido.';$q$, $q$      elsif v_tipo = 'pesagem' then
        select l.id, l.numero into v_lote from lotes l where l.id = nullif(d->>'lote_id', '')::uuid and l.fazenda_id = v_faz;
        if v_lote.id is null then raise exception 'Lote da pesagem não encontrado.'; end if;
        if jsonb_array_length(coalesce(d->'itens', '[]')) = 0 then raise exception 'Pesagem sem pesadas.'; end if;
        select sum(greatest(coalesce((x->>'quantidade')::int, 1), 1)) into v_qtd from jsonb_array_elements(d->'itens') x;
        d := d || jsonb_build_object('lote_numero', v_lote.numero);
        v_resumo := 'Pesagem do lote ' || v_lote.numero || ': ' || v_qtd || ' cab., ' ||
                    translate(to_char((select sum((x->>'peso')::numeric) from jsonb_array_elements(d->'itens') x), 'FM999,999,990.0'), ',.', '.,') || ' kg (média ' ||
                    translate(to_char((select sum((x->>'peso')::numeric) from jsonb_array_elements(d->'itens') x) / greatest(v_qtd, 1), 'FM999,990.0'), ',.', '.,') || ' kg)';

      elsif v_tipo = 'transferencia' then
        select l.id, l.numero into v_lote from lotes l where l.id = nullif(d->>'lote_origem', '')::uuid and l.fazenda_id = v_faz;
        if v_lote.id is null then raise exception 'Lote de origem não encontrado.'; end if;
        if d->>'modo' = 'manga' then
          select nome into v_manga from areas where id = nullif(d->>'manga_destino', '')::uuid and fazenda_id = v_faz and tipo = 'manga';
          if v_manga is null then raise exception 'Manga de destino não encontrada.'; end if;
          v_resumo := 'Troca de manga – lote ' || v_lote.numero || ' para a manga ' || v_manga;
        else
          select numero into v_ltn from lotes where id = nullif(d->>'lote_destino', '')::uuid and fazenda_id = v_faz and situacao = 'ativo';
          if v_ltn is null then raise exception 'Lote de destino não encontrado ou encerrado.'; end if;
          v_qtd := case when jsonb_array_length(coalesce(d->'animais', '[]')) > 0 then jsonb_array_length(d->'animais') else greatest(coalesce((d->>'quantidade')::int, 0), 0) end;
          if v_qtd < 1 then raise exception 'Informe os animais ou a quantidade.'; end if;
          v_resumo := 'Troca de lote – ' || v_qtd || ' cab.' ||
                      case d->>'sexo' when 'M' then ' (machos)' when 'F' then ' (fêmeas)' else '' end ||
                      ' do lote ' || v_lote.numero || ' para o lote ' || v_ltn;
        end if;
      else
        raise exception 'Tipo de lançamento do campo inválido.';$q$);
    if position('''pesagem''' in d) = 0 then raise exception 'campo_enviar: texto não encontrado'; end if;
    execute d;
  end if;
end $$;

-- campo_aplicar: ao confirmar, lança a pesagem (nº sai na hora) e a transferência
do $$
declare d text;
begin
  d := pg_get_functiondef('public.campo_aplicar(campo_registros)'::regprocedure);
  if position('''pesagem''' in d) = 0 then
    d := replace(d, $q$  return null;
end $q$, $q$  if c.tipo = 'pesagem' then
    v_json := lancar_pesagem(json_build_object(
      'fazenda', c.fazenda_id, 'data', v_dia, 'lote', d->>'lote_id', 'objetivo', coalesce(nullif(d->>'objetivo', ''), 'controle'),
      'objetivo_outro', d->>'objetivo_outro', 'peso_arroba', coalesce(nullif(d->>'peso_arroba', ''), '30'),
      'obs', concat_ws('. ', nullif(trim(d->>'obs'), ''), 'Pesagem do vaqueiro (' || c.autor_nome || ')'),
      'itens', d->'itens'));
    return (v_json->>'id')::uuid;

  elsif c.tipo = 'transferencia' then
    if d->>'modo' = 'manga' then
      v_json := lancar_movimentacao(json_build_object('tipo', 'transferencia_manga', 'fazenda', c.fazenda_id, 'data', v_dia,
        'lote_origem', d->>'lote_origem', 'manga_destino', d->>'manga_destino',
        'obs', concat_ws('. ', nullif(trim(d->>'obs'), ''), 'Lançado pelo vaqueiro (' || c.autor_nome || ')')));
    else
      -- por brinco (os escolhidos) ou por quantidade (do sexo escolhido; primeiro os sem brinco)
      v_meds := case when jsonb_array_length(coalesce(d->'animais', '[]')) > 0 then d->'animais'
                     else coalesce((select jsonb_agg(a.id) from (select id from animais
                            where lote_id = (d->>'lote_origem')::uuid and situacao = 'ativo' and (nullif(d->>'sexo', '') is null or sexo = (d->>'sexo')::char)
                            order by (brinco is null) desc, numero_interno desc limit greatest(coalesce((d->>'quantidade')::int, 0), 0)) a), '[]'::jsonb) end;
      if jsonb_array_length(v_meds) < greatest(coalesce((d->>'quantidade')::int, 0), jsonb_array_length(coalesce(d->'animais', '[]'))) then
        raise exception 'O lote de origem não tem essa quantidade%.', case d->>'sexo' when 'M' then ' de machos' when 'F' then ' de fêmeas' else '' end;
      end if;
      v_json := lancar_movimentacao(json_build_object('tipo', 'transferencia_lote', 'fazenda', c.fazenda_id, 'data', v_dia,
        'lote_origem', d->>'lote_origem', 'lote_destino', d->>'lote_destino', 'animais', v_meds, 'quantidade', 0,
        'obs', concat_ws('. ', nullif(trim(d->>'obs'), ''), 'Lançado pelo vaqueiro (' || c.autor_nome || ')')));
    end if;
    return (v_json->>'id')::uuid;
  end if;
  return null;
end $q$);
    if position('''pesagem''' in d) = 0 then raise exception 'campo_aplicar: texto não encontrado'; end if;
    execute d;
  end if;
end $$;
revoke execute on function public.campo_aplicar(campo_registros) from public, anon, authenticated;
