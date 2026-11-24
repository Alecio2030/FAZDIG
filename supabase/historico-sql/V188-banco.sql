-- Fazenda Digital V188 – Modo Vaqueiro: Contagem sem lote (sexo, idade provável e raça)
-- (rodado direto no Supabase; guardado aqui só como registro)

-- Pacote: também a lista de raças cadastradas (para escolher no campo, sem sinal)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.campo_pacote(uuid)'::regprocedure);
  if position('''racas''' in d) = 0 then
    d := replace(d, $q$'pendentes', coalesce($q$,
      $q$'racas', coalesce((select json_agg(r.nome order by r.nome) from racas r), '[]'),
    'pendentes', coalesce($q$);
    if position('''racas''' in d) = 0 then raise exception 'campo_pacote: texto não encontrado'; end if;
    execute d;
  end if;
end $$;

-- campo_enviar: contagem sem lote = grupos (sexo, faixa de idade, raça, cabeças); vai sempre como aviso ao gerente
do $$
declare d text;
begin
  d := pg_get_functiondef('public.campo_enviar(jsonb)'::regprocedure);
  if position('Contagem sem lote' in d) = 0 then
    d := replace(d, $q$        select l.id, l.numero into v_lote from lotes l where l.id = nullif(d->>'lote_id', '')::uuid and l.fazenda_id = v_faz;
        if v_lote.id is null then raise exception 'Lote não encontrado.'; end if;$q$,
$q$        if nullif(d->>'lote_id', '') is null then
          if jsonb_typeof(d->'grupos') is distinct from 'array' or jsonb_array_length(d->'grupos') = 0 then raise exception 'Contagem sem lote: informe sexo, idade provável e raça.'; end if;
          if exists (select 1 from jsonb_array_elements(d->'grupos') g
                      where coalesce(g->>'sexo', '') not in ('M', 'F') or nullif(g->>'faixa', '') is null or nullif(trim(g->>'raca'), '') is null
                         or coalesce(nullif(g->>'qtd', '')::int, 0) <= 0) then
            raise exception 'Contagem sem lote: cada grupo precisa de sexo, idade provável, raça e cabeças.';
          end if;
          select coalesce(sum((g->>'qtd')::int), 0) into v_contadas from jsonb_array_elements(d->'grupos') g;
          select nome into v_manga from areas where id = nullif(d->>'manga_id', '')::uuid;
          d := d || jsonb_build_object('contadas', v_contadas, 'esperado', null, 'manga', v_manga);
          v_resumo := 'Contagem sem lote' || coalesce(' na manga ' || v_manga, '') || ': ' || v_contadas || ' cab. (' ||
            (select string_agg((g->>'qtd') || ' ' || case when g->>'sexo' = 'M' then 'macho(s)' else 'fêmea(s)' end || ' ' || (g->>'faixa') || ', ' || trim(g->>'raca'), '; ')
               from jsonb_array_elements(d->'grupos') g) || ')';
          v_aviso := 'Contagem sem lote' || coalesce(' – manga ' || v_manga, '') || ': ' || v_contadas || ' cab. para identificar';
        else
        select l.id, l.numero into v_lote from lotes l where l.id = nullif(d->>'lote_id', '')::uuid and l.fazenda_id = v_faz;
        if v_lote.id is null then raise exception 'Lote não encontrado.'; end if;$q$);
    -- fecha o "else" logo depois do aviso da contagem com lote
    d := replace(d, $q$        if v_contadas <> v_esperado then v_aviso := 'Contagem não confere – lote ' || v_lote.numero; end if;$q$,
$q$        if v_contadas <> v_esperado then v_aviso := 'Contagem não confere – lote ' || v_lote.numero; end if;
        end if;$q$);
    if position('Contagem sem lote' in d) = 0 then raise exception 'campo_enviar: texto não encontrado'; end if;
    execute d;
  end if;
end $$;
