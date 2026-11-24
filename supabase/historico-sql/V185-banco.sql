-- Fazenda Digital V185 – Modo Vaqueiro: Sanidade, Nascimento, Morte, Sumido/Achado e Cio
-- (rodado direto no Supabase; guardado aqui só como registro)

alter table public.campo_registros drop constraint if exists campo_registros_tipo_check;
alter table public.campo_registros add constraint campo_registros_tipo_check
  check (tipo in ('contagem', 'vistoria', 'tarefa_feita', 'sanidade', 'nascimento', 'morte', 'sumido', 'achado', 'cio'));
alter table public.campo_registros add column if not exists aplicado_ref uuid;   -- o que o sistema lançou ao confirmar (sanidade, movimentação)
alter table public.campo_registros add column if not exists erro_aplicar text;    -- por que não deu para lançar ao confirmar

-- Pacote: também os medicamentos e vacinas com dose recomendada e o saldo de cada um na fazenda
create or replace function public.campo_pacote(p_fazenda uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v json;
begin
  if not acesso_fazenda(p_fazenda) then raise exception 'Você não tem acesso a esta fazenda.'; end if;
  select json_build_object(
    'gerado_em', now(),
    'fazenda', (select json_build_object('id', f.id, 'nome', f.nome) from fazendas f where f.id = p_fazenda),
    'mangas', coalesce((select json_agg(json_build_object('id', a.id, 'nome', a.nome, 'capim', a.capim_cultura, 'area_ha', a.area_ha) order by a.nome)
                          from areas a where a.fazenda_id = p_fazenda and a.tipo = 'manga' and coalesce(a.ativa, true)), '[]'),
    'lotes', coalesce((select json_agg(x order by x.numero) from (
        select l.id, l.numero, l.descricao, l.sexo, l.categoria, l.manga_id, m.nome as manga, r.nome as raca, fe.descricao as ferro,
               l.proprietario, (select p.nome from pessoas p where p.id = l.pessoa_terceiro_id) as dono_terceiro,
               (select count(*) from animais an where an.lote_id = l.id and an.situacao = 'ativo')::int as cabecas,
               (select count(*) from animais an where an.lote_id = l.id and an.situacao = 'ativo' and an.sexo = 'M')::int as machos,
               (select count(*) from animais an where an.lote_id = l.id and an.situacao = 'ativo' and an.sexo = 'F')::int as femeas
          from lotes l left join areas m on m.id = l.manga_id left join racas r on r.id = l.raca_id left join ferros fe on fe.id = l.ferro_id
         where l.fazenda_id = p_fazenda and l.situacao = 'ativo') x), '[]'),
    'animais', coalesce((select json_agg(json_build_object(
          'id', an.id, 'n', an.numero_interno, 'brinco', an.brinco, 'nome', an.nome, 'registro', an.registro, 'sexo', an.sexo,
          'raca', r.nome, 'ferro', fe.descricao, 'lote_id', an.lote_id, 'nasc', an.data_nascimento, 'nasc_aprox', an.nascimento_aproximado,
          'peso', an.peso_atual_kg, 'peso_data', an.peso_atual_data, 'categoria', an.categoria) order by an.numero_interno)
        from animais an left join racas r on r.id = an.raca_id left join ferros fe on fe.id = an.ferro_id
       where an.fazenda_id = p_fazenda and an.situacao = 'ativo'), '[]'),
    'medicamentos', coalesce((select json_agg(json_build_object(
          'id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'dose', i.dose_recomendada, 'dose_por', i.dose_por, 'cada_kg', i.dose_cada_kg,
          'unidade_dose', coalesce(i.unidade_dose, i.unidade), 'unidade', i.unidade, 'conteudo', i.conteudo_por_unidade,
          'via', i.via_aplicacao, 'serve', i.indicacoes, 'carencia_carne', i.carencia_carne_dias, 'carencia_leite', i.carencia_leite_dias,
          'saldo', saldo_insumo(p_fazenda, i.id)) order by i.nome)
        from insumos i where i.ativo and i.categoria in ('vacina', 'medicamento') and i.dose_recomendada is not null
         and (i.dose_por is distinct from 'kg' or i.dose_cada_kg is not null)), '[]'),
    'tarefas', coalesce((select json_agg(json_build_object('id', i.id, 'data', i.data, 'titulo', i.titulo, 'obs', i.observacao, 'autor', i.autor_nome) order by i.data)
        from agenda_itens i where i.agenda = 'fazenda' and i.fazenda_id = p_fazenda and i.feito_em is null and agenda_acesso('fazenda', p_fazenda)), '[]'),
    'pendentes', coalesce((select count(*) from campo_registros c where c.fazenda_id = p_fazenda and c.autor = auth.uid() and c.situacao = 'pendente'), 0)
  ) into v;
  return v;
end $$;

-- Identificação de um animal para os textos
create or replace function public.campo_nome_animal(p_id uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(nullif(brinco, ''), nullif(nome, ''), 'nº ' || numero_interno) from animais where id = p_id
$$;

-- Recebe do celular. V185: também sanidade, nascimento, morte, sumido, achado e cio.
create or replace function public.campo_enviar(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; v_id uuid; v_faz uuid; v_tipo text; d jsonb; v_ok uuid[] := '{}'; v_erros jsonb := '[]'; v_nome text; v_resumo text;
  v_manga text; v_lote record; v_esperado int; v_contadas int; v_ruins text[]; v_quando timestamptz; v_n int; v_dia date; v_hora text;
  v_animal uuid; v_bicho text; v_lt uuid; v_ltn int; v_qtd int; v_fotos text[]; v_aviso text; v_produtor boolean := false;
begin
  for r in select * from jsonb_array_elements(coalesce(p->'registros', '[]'::jsonb)) loop
    begin
      v_id := (r->>'id')::uuid; v_faz := (r->>'fazenda_id')::uuid; v_tipo := r->>'tipo'; d := coalesce(r->'dados', '{}'::jsonb);
      v_quando := coalesce(nullif(r->>'feito_em', '')::timestamptz, now());
      v_dia := (v_quando at time zone 'America/Sao_Paulo')::date;
      v_hora := to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
      v_fotos := coalesce(array(select jsonb_array_elements_text(r->'fotos')), '{}');
      if exists (select 1 from campo_registros where id = v_id) then v_ok := v_ok || v_id; continue; end if;
      if not acesso_fazenda(v_faz) then raise exception 'Sem acesso a esta fazenda.'; end if;
      select uf.nome into v_nome from usuarios_fazenda uf where uf.user_id = auth.uid() and uf.fazenda_id = v_faz and uf.ativo limit 1;
      v_nome := coalesce(v_nome, meu_email(), 'Vaqueiro');
      v_resumo := null; v_aviso := null; v_produtor := false;

      if v_tipo = 'contagem' then
        v_contadas := (d->>'contadas')::int;
        if v_contadas is null or v_contadas < 0 then raise exception 'Contagem sem quantidade.'; end if;
        select l.id, l.numero into v_lote from lotes l where l.id = nullif(d->>'lote_id', '')::uuid and l.fazenda_id = v_faz;
        if v_lote.id is null then raise exception 'Lote não encontrado.'; end if;
        select count(*) into v_esperado from animais where lote_id = v_lote.id and situacao = 'ativo';
        select nome into v_manga from areas where id = nullif(d->>'manga_id', '')::uuid;
        d := d || jsonb_build_object('esperado', v_esperado, 'lote_numero', v_lote.numero, 'manga', v_manga);
        v_resumo := 'Contagem do lote ' || v_lote.numero || coalesce(' na manga ' || v_manga, '') || ': contou ' || v_contadas ||
                    case when v_contadas = v_esperado then ' (confere)' else ', o sistema tem ' || v_esperado ||
                      ' (' || case when v_contadas > v_esperado then 'sobram ' else 'faltam ' end || abs(v_contadas - v_esperado) || ')' end;
        if v_contadas <> v_esperado then v_aviso := 'Contagem não confere – lote ' || v_lote.numero; end if;

      elsif v_tipo = 'vistoria' then
        select nome into v_manga from areas where id = nullif(d->>'manga_id', '')::uuid and fazenda_id = v_faz;
        if v_manga is null then raise exception 'Manga não encontrada.'; end if;
        v_ruins := array(select case k when 'agua' then 'Água' when 'cocho' then 'Cocho' when 'capim' then 'Capim' else 'Cerca' end
                           from unnest(array['agua','cocho','capim','cerca']) k where d->>k = 'ruim');
        d := d || jsonb_build_object('manga', v_manga);
        v_resumo := 'Vistoria da manga ' || v_manga || ': ' ||
          concat_ws(', ', 'água ' || coalesce(d->>'agua', '—'), 'cocho ' || coalesce(d->>'cocho', '—'), 'capim ' || coalesce(d->>'capim', '—'), 'cerca ' || coalesce(d->>'cerca', '—')) ||
          case when coalesce(nullif(d->>'sal_sacos', '')::numeric, 0) > 0 then '; sal: ' || (d->>'sal_sacos') || ' saco(s)' else '' end;
        if array_length(v_ruins, 1) > 0 then v_aviso := 'Manga ' || v_manga || ': ' || array_to_string(v_ruins, ', ') || ' ruim'; end if;

      elsif v_tipo = 'tarefa_feita' then
        update agenda_itens set feito_em = v_dia
         where id = nullif(d->>'item_id', '')::uuid and agenda = 'fazenda' and fazenda_id = v_faz and feito_em is null and agenda_acesso('fazenda', v_faz);
        get diagnostics v_n = row_count;
        insert into campo_registros (id, fazenda_id, tipo, dados, feito_em, autor_nome, situacao, resumo)
        values (v_id, v_faz, v_tipo, d, v_quando, v_nome, 'aplicado', 'Tarefa cumprida: ' || coalesce(d->>'titulo', '') || case when v_n = 0 then ' (já estava cumprida)' else '' end);
        v_ok := v_ok || v_id;
        continue;

      elsif v_tipo in ('sanidade', 'morte', 'sumido', 'achado', 'cio', 'nascimento') then
        -- animal (identificado) ou lote com quantidade
        v_animal := nullif(d->>(case when v_tipo = 'nascimento' then 'mae_id' else 'animal_id' end), '')::uuid;
        if v_animal is not null and not exists (select 1 from animais where id = v_animal and fazenda_id = v_faz) then raise exception 'Animal não encontrado nesta fazenda.'; end if;
        v_bicho := case when v_animal is not null then campo_nome_animal(v_animal) end;
        v_lt := null; v_ltn := null;
        select id, numero into v_lt, v_ltn from lotes where id = coalesce(nullif(d->>'lote_id', '')::uuid, (select lote_id from animais where id = v_animal)) and fazenda_id = v_faz;
        v_qtd := greatest(coalesce(nullif(d->>'quantidade', '')::int, 1), 1);
        if v_tipo in ('sanidade', 'morte', 'sumido', 'achado') and v_animal is null and v_lt is null then raise exception 'Informe o animal ou o lote.'; end if;
        if v_tipo = 'cio' and v_animal is null then raise exception 'Informe a fêmea.'; end if;
        if v_tipo = 'nascimento' and v_lt is null then raise exception 'Informe a mãe ou o lote do bezerro.'; end if;
        d := d || jsonb_build_object('animal_nome', v_bicho, 'lote_numero', v_ltn);
        v_resumo := case v_tipo
          when 'sanidade' then case when jsonb_array_length(coalesce(d->'medicamentos', '[]')) > 0 then 'Sanidade' else 'Problema de saúde (sem aplicar)' end ||
               ' – ' || coalesce(v_bicho, v_qtd || ' cab. do lote ' || v_ltn) || coalesce(': ' || nullif(trim(d->>'diagnostico'), ''), '') ||
               coalesce(' · ' || (select string_agg(x->>'nome' || ' ' || coalesce(x->>'dose', '') || ' ' || coalesce(x->>'unidade', ''), ', ') from jsonb_array_elements(d->'medicamentos') x), '')
          when 'morte' then 'Morte – ' || coalesce(v_bicho, v_qtd || ' cab. do lote ' || v_ltn) || coalesce(': ' || nullif(trim(d->>'causa'), ''), '')
          when 'sumido' then 'Sumido – ' || coalesce(v_bicho, v_qtd || ' cab. do lote ' || v_ltn)
          when 'achado' then 'Achado – ' || coalesce(v_bicho, v_qtd || ' cab. do lote ' || v_ltn)
          when 'cio' then 'Cio – ' || v_bicho || coalesce(' (lote ' || v_ltn || ')', '')
          else 'Nascimento – ' || case d->>'sexo' when 'M' then 'macho' when 'F' then 'fêmea' else 'bezerro' end ||
               coalesce(', mãe ' || v_bicho, '') || coalesce(', lote ' || v_ltn, '') ||
               case when d->>'natimorto' = 'true' then ' (nasceu morto)' else '' end end;
        v_aviso := case v_tipo
          when 'sanidade' then case when jsonb_array_length(coalesce(d->'medicamentos', '[]')) = 0 then 'Problema de saúde para ver – ' || coalesce(v_bicho, 'lote ' || v_ltn) end
          when 'morte' then 'Morte no campo – ' || coalesce(v_bicho, v_qtd || ' cab. do lote ' || v_ltn)
          when 'sumido' then 'Animal sumido – ' || coalesce(v_bicho, v_qtd || ' cab. do lote ' || v_ltn)
          when 'cio' then 'Cio – ' || v_bicho || ': inseminar ou cobrir'
          else null end;
        v_produtor := v_tipo in ('sanidade', 'morte');
      else
        raise exception 'Tipo de lançamento do campo inválido.';
      end if;

      insert into campo_registros (id, fazenda_id, tipo, dados, fotos, latitude, longitude, feito_em, autor_nome, resumo)
      values (v_id, v_faz, v_tipo, d, v_fotos, nullif(r->>'lat', '')::numeric, nullif(r->>'lng', '')::numeric, v_quando, v_nome, v_resumo);

      -- aviso na hora: na agenda da fazenda (e na do Produtor, para saúde sem aplicar e morte)
      if v_aviso is not null then
        insert into agenda_itens (fazenda_id, agenda, data, titulo, observacao)
        values (v_faz, 'fazenda', v_dia, v_aviso,
                v_resumo || '. Lançado por ' || v_nome || ' em ' || v_hora || coalesce('. ' || nullif(trim(d->>'obs'), ''), '') ||
                case when array_length(v_fotos, 1) > 0 then ' (com foto em Pecuário › Conferir o campo)' else '' end);
        if v_produtor then
          insert into agenda_itens (fazenda_id, agenda, data, titulo, observacao)
          values (null, 'produtor', v_dia, v_aviso || ' (' || (select nome from fazendas where id = v_faz) || ')',
                  v_resumo || '. Lançado por ' || v_nome || ' em ' || v_hora || coalesce('. ' || nullif(trim(d->>'obs'), ''), ''));
        end if;
      end if;
      v_ok := v_ok || v_id;
    exception when others then
      v_erros := v_erros || jsonb_build_object('id', r->>'id', 'erro', sqlerrm);
    end;
  end loop;
  return json_build_object('aceitos', to_json(v_ok), 'erros', v_erros);
end $$;

-- Lança no sistema o que veio do campo (chamado ao confirmar). Devolve o id do que foi lançado.
create or replace function public.campo_aplicar(c campo_registros)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare d jsonb := c.dados; v_dia date := (c.feito_em at time zone 'America/Sao_Paulo')::date; v_json json; v_lote record; v_mae record;
  v_sexo char(1); v_mov uuid; v_an uuid; v_meds jsonb;
begin
  if c.tipo = 'sanidade' then
    if jsonb_array_length(coalesce(d->'medicamentos', '[]')) = 0 then return null; end if;     -- só o aviso
    v_meds := (select jsonb_agg(jsonb_build_object('insumo', x->>'insumo_id', 'dose', x->>'dose', 'baixar', true)) from jsonb_array_elements(d->'medicamentos') x);
    v_json := lancar_sanidade(json_build_object(
      'fazenda', c.fazenda_id, 'data', v_dia, 'tipo', coalesce(nullif(d->>'tipo', ''), 'tratamento'),
      'lote', case when nullif(d->>'animal_id', '') is null then d->>'lote_id' end, 'animal', nullif(d->>'animal_id', ''),
      'cabecas', coalesce(nullif(d->>'quantidade', '')::int, 1), 'diagnostico', d->>'diagnostico', 'responsavel', c.autor_nome,
      'obs', concat_ws('. ', nullif(trim(d->>'obs'), ''), 'Lançado pelo vaqueiro no campo'), 'peso_medio', nullif(d->>'peso', ''),
      'medicamentos', v_meds));
    return (v_json->>'id')::uuid;

  elsif c.tipo = 'morte' then
    v_json := lancar_movimentacao(json_build_object(
      'tipo', 'morte', 'fazenda', c.fazenda_id, 'data', v_dia,
      'lote_origem', coalesce(nullif(d->>'lote_id', ''), (select lote_id::text from animais where id = nullif(d->>'animal_id', '')::uuid)),
      'animais', case when nullif(d->>'animal_id', '') is not null then json_build_array(d->>'animal_id') else '[]'::json end,
      'quantidade', case when nullif(d->>'animal_id', '') is null then coalesce(nullif(d->>'quantidade', '')::int, 1) else 0 end,
      'obs', concat_ws('. ', 'Morte no campo' || coalesce(': ' || nullif(trim(d->>'causa'), ''), ''), nullif(trim(d->>'obs'), ''), 'Lançado por ' || c.autor_nome)));
    return (v_json->>'id')::uuid;

  elsif c.tipo = 'nascimento' then
    select * into v_mae from animais where id = nullif(d->>'mae_id', '')::uuid;
    select * into v_lote from lotes where id = coalesce(nullif(d->>'lote_id', '')::uuid, v_mae.lote_id) and fazenda_id = c.fazenda_id and situacao = 'ativo';
    if v_lote.id is null then raise exception 'Lote do bezerro não encontrado ou encerrado.'; end if;
    -- parto da mãe na reprodução
    if v_mae.id is not null then
      insert into repro_eventos (fazenda_id, animal_id, data, tipo, subtipo, crias, sexo_feto, observacoes)
      values (c.fazenda_id, v_mae.id, v_dia, 'parto', case when d->>'parto' in ('normal', 'assistido', 'cesarea') then d->>'parto' else 'normal' end, 1, nullif(d->>'sexo', ''),
              concat_ws('. ', case when d->>'natimorto' = 'true' then 'Nasceu morto' end, nullif(trim(d->>'obs'), ''), 'Lançado pelo vaqueiro no campo'));
    end if;
    if d->>'natimorto' = 'true' then return null; end if;
    v_sexo := nullif(d->>'sexo', '');
    if v_sexo is null then raise exception 'Informe o sexo do bezerro.'; end if;
    insert into movimentacoes (fazenda_id, data, tipo, lote_destino_id, observacoes)
    values (c.fazenda_id, v_dia, 'nascimento', v_lote.id, concat_ws('. ', 'Nascimento no campo', nullif(trim(d->>'obs'), ''), 'Lançado por ' || c.autor_nome))
    returning id into v_mov;
    -- o bezerro fica no lote da mãe, mesmo que o lote seja só de fêmeas (ao pé da mãe)
    insert into animais (fazenda_id, sexo, raca_id, ferro_id, data_nascimento, nascimento_aproximado, lote_id, lote_original_id, mae_id, peso_nascer_kg, brinco, sexo_diferente_lote)
    values (c.fazenda_id, v_sexo, coalesce(v_mae.raca_id, v_lote.raca_id), coalesce(v_mae.ferro_id, v_lote.ferro_id), v_dia, false, v_lote.id, v_lote.id, v_mae.id,
            nullif(d->>'peso', '')::numeric, nullif(trim(d->>'brinco'), ''), v_lote.sexo is not null and v_lote.sexo <> v_sexo)
    returning id into v_an;
    insert into movimentacao_itens (fazenda_id, movimentacao_id, animal_id, quantidade, sexo, peso_kg, lote_original_id)
    values (c.fazenda_id, v_mov, v_an, 1, v_sexo, nullif(d->>'peso', '')::numeric, v_lote.id);
    return v_mov;
  end if;
  return null;   -- contagem, vistoria, sumido, achado e cio: só ficam registrados (e o aviso já foi para a agenda)
end $$;

-- Conferir: ao confirmar, lança no sistema; se não der, fica pendente com o motivo (para corrigir ou rejeitar)
drop function if exists public.campo_conferir(uuid[], boolean, text);
create or replace function public.campo_conferir(p_ids uuid[], p_aceitar boolean, p_motivo text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare c campo_registros%rowtype; v_ok int := 0; v_erros jsonb := '[]'; v_ref uuid;
begin
  if not p_aceitar and nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo da rejeição.'; end if;
  for c in select * from campo_registros cr where cr.id = any (p_ids) and cr.situacao = 'pendente' and acesso_fazenda(cr.fazenda_id)
             and not exists (select 1 from usuarios_fazenda uf where uf.user_id = auth.uid() and uf.fazenda_id = cr.fazenda_id and uf.ativo and uf.perfil = 'vaqueiro')
           order by cr.feito_em loop
    if not p_aceitar then
      update campo_registros set situacao = 'rejeitado', conferido_por = auth.uid(), conferido_em = now(), motivo = trim(p_motivo), erro_aplicar = null where id = c.id;
      v_ok := v_ok + 1;
      continue;
    end if;
    begin
      v_ref := campo_aplicar(c);
      update campo_registros set situacao = 'confirmado', conferido_por = auth.uid(), conferido_em = now(), motivo = null, aplicado_ref = v_ref, erro_aplicar = null where id = c.id;
      v_ok := v_ok + 1;
    exception when others then
      update campo_registros set erro_aplicar = sqlerrm where id = c.id;
      v_erros := v_erros || jsonb_build_object('id', c.id, 'resumo', c.resumo, 'erro', sqlerrm);
    end;
  end loop;
  return json_build_object('feitos', v_ok, 'erros', v_erros);
end $$;

grant execute on function public.campo_pacote(uuid) to authenticated;
grant execute on function public.campo_enviar(jsonb) to authenticated;
grant execute on function public.campo_conferir(uuid[], boolean, text) to authenticated;
revoke execute on function public.campo_aplicar(campo_registros) from public, anon, authenticated;
