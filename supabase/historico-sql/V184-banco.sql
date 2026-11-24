-- Fazenda Digital V184 – Modo Vaqueiro (perfil Vaqueiro, pacote para usar sem sinal e lançamentos do campo)
-- (rodado direto no Supabase; guardado aqui só como registro)

-- 1) Perfil Vaqueiro
alter table public.usuarios_fazenda drop constraint if exists usuarios_fazenda_perfil_check;
alter table public.usuarios_fazenda add constraint usuarios_fazenda_perfil_check
  check (perfil = any (array['dono','admin','gerente','funcionario','escritorio','vaqueiro']));
alter table public.convites_acesso drop constraint if exists convites_acesso_perfil_check;
alter table public.convites_acesso add constraint convites_acesso_perfil_check
  check (perfil = any (array['admin','gerente','funcionario','escritorio','vaqueiro']));

-- salvar_acesso: aceita o Vaqueiro (só lançamentos, sem financeiro, só o Pecuário)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.salvar_acesso(text,text,text,text,uuid[],boolean,jsonb,boolean,text[])'::regprocedure);
  if position('''vaqueiro''' in d) = 0 then
    d := replace(d, $q$if p_perfil not in ('gerente', 'funcionario', 'escritorio', 'admin', 'dono')$q$,
                    $q$if p_perfil not in ('gerente', 'funcionario', 'escritorio', 'admin', 'dono', 'vaqueiro')$q$);
    d := replace(d, $q$v_nivel text := case when p_perfil in ('admin', 'dono') then 'completo' else p_nivel end;$q$,
                    $q$v_nivel text := case when p_perfil in ('admin', 'dono') then 'completo' when p_perfil = 'vaqueiro' then 'lancamento' else p_nivel end;$q$);
    d := replace(d, $q$v_fin boolean := case when p_perfil in ('admin', 'dono') then true else coalesce(p_financeiro, p_perfil = 'escritorio') end;$q$,
                    $q$v_fin boolean := case when p_perfil in ('admin', 'dono') then true when p_perfil = 'vaqueiro' then false else coalesce(p_financeiro, p_perfil = 'escritorio') end;$q$);
    d := replace(d, $q$v_mod text[] := case when p_perfil in ('admin', 'dono') or p_modulos is null then null$q$,
                    $q$v_mod text[] := case when p_perfil = 'vaqueiro' then array['pecuario'] when p_perfil in ('admin', 'dono') or p_modulos is null then null$q$);
    if (length(d) - length(replace(d, '''vaqueiro''', ''))) / length('''vaqueiro''') < 4 then raise exception 'salvar_acesso: texto não encontrado para o Vaqueiro'; end if;
    execute d;
  end if;
end $$;

-- anotação feita pelo vaqueiro aparece como "do vaqueiro"
create or replace function public.trg_agenda_marcar_produtor()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.criado_por := auth.uid();
  new.do_produtor := e_dono();
  new.autor := case when e_dono() then 'produtor' when e_escritorio() then 'escritorio'
                    when exists (select 1 from usuarios_fazenda uf where uf.user_id = auth.uid() and uf.ativo and uf.perfil = 'vaqueiro')
                     and not exists (select 1 from usuarios_fazenda uf where uf.user_id = auth.uid() and uf.ativo and uf.perfil <> 'vaqueiro') then 'vaqueiro'
                    else 'gerente' end;
  new.autor_nome := (select uf.nome from usuarios_fazenda uf where uf.user_id = auth.uid() and uf.ativo and uf.nome is not null limit 1);
  return new;
end $$;

-- 2) Lançamentos do campo (o id vem do celular: enviar de novo não duplica)
create table if not exists public.campo_registros (
  id uuid primary key,
  fazenda_id uuid not null references public.fazendas(id) on delete cascade,
  tipo text not null check (tipo in ('contagem', 'vistoria', 'tarefa_feita')),
  dados jsonb not null default '{}'::jsonb,
  fotos text[] not null default '{}',
  latitude numeric, longitude numeric,
  feito_em timestamptz not null,
  enviado_em timestamptz not null default now(),
  autor uuid default auth.uid(),
  autor_nome text,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'confirmado', 'rejeitado', 'aplicado')),
  resumo text,
  conferido_por uuid, conferido_em timestamptz, motivo text
);
create index if not exists campo_registros_faz_idx on public.campo_registros (fazenda_id, situacao, feito_em desc);
alter table public.campo_registros enable row level security;
drop policy if exists campo_registros_select on public.campo_registros;
create policy campo_registros_select on public.campo_registros for select using (acesso_fazenda(fazenda_id));

-- 3) Pacote para o celular guardar (lotes, animais, mangas e tarefas da fazenda)
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
    'tarefas', coalesce((select json_agg(json_build_object('id', i.id, 'data', i.data, 'titulo', i.titulo, 'obs', i.observacao, 'autor', i.autor_nome) order by i.data)
        from agenda_itens i where i.agenda = 'fazenda' and i.fazenda_id = p_fazenda and i.feito_em is null and agenda_acesso('fazenda', p_fazenda)), '[]'),
    'pendentes', coalesce((select count(*) from campo_registros c where c.fazenda_id = p_fazenda and c.autor = auth.uid() and c.situacao = 'pendente'), 0)
  ) into v;
  return v;
end $$;

-- 4) Recebe os lançamentos guardados no celular (um ou vários). Devolve os ids aceitos.
create or replace function public.campo_enviar(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; v_id uuid; v_faz uuid; v_tipo text; d jsonb; v_ok uuid[] := '{}'; v_erros jsonb := '[]'; v_nome text; v_resumo text;
  v_manga text; v_lote record; v_esperado int; v_contadas int; v_ruins text[]; v_quando timestamptz; v_n int;
begin
  for r in select * from jsonb_array_elements(coalesce(p->'registros', '[]'::jsonb)) loop
    begin
      v_id := (r->>'id')::uuid; v_faz := (r->>'fazenda_id')::uuid; v_tipo := r->>'tipo'; d := coalesce(r->'dados', '{}'::jsonb);
      v_quando := coalesce(nullif(r->>'feito_em', '')::timestamptz, now());
      if exists (select 1 from campo_registros where id = v_id) then v_ok := v_ok || v_id; continue; end if;   -- já recebido
      if not acesso_fazenda(v_faz) then raise exception 'Sem acesso a esta fazenda.'; end if;
      select uf.nome into v_nome from usuarios_fazenda uf where uf.user_id = auth.uid() and uf.fazenda_id = v_faz and uf.ativo limit 1;
      v_nome := coalesce(v_nome, meu_email(), 'Vaqueiro');
      v_resumo := null;

      if v_tipo = 'contagem' then
        v_contadas := (d->>'contadas')::int;
        if v_contadas is null or v_contadas < 0 then raise exception 'Contagem sem quantidade.'; end if;
        select l.id, l.numero into v_lote from lotes l where l.id = nullif(d->>'lote_id', '')::uuid and l.fazenda_id = v_faz;
        if v_lote.id is null then raise exception 'Lote não encontrado.'; end if;
        -- o esperado é o do sistema na hora em que chegou (o celular mostra o que tinha guardado)
        select count(*) into v_esperado from animais where lote_id = v_lote.id and situacao = 'ativo';
        select nome into v_manga from areas where id = nullif(d->>'manga_id', '')::uuid;
        d := d || jsonb_build_object('esperado', v_esperado, 'lote_numero', v_lote.numero, 'manga', v_manga);
        v_resumo := 'Contagem do lote ' || v_lote.numero || coalesce(' na manga ' || v_manga, '') || ': contou ' || v_contadas ||
                    case when v_contadas = v_esperado then ' (confere)' else ', o sistema tem ' || v_esperado ||
                      ' (' || case when v_contadas > v_esperado then 'sobram ' else 'faltam ' end || abs(v_contadas - v_esperado) || ')' end;
        insert into campo_registros (id, fazenda_id, tipo, dados, fotos, latitude, longitude, feito_em, autor_nome, resumo)
        values (v_id, v_faz, v_tipo, d, coalesce(array(select jsonb_array_elements_text(r->'fotos')), '{}'), nullif(r->>'lat', '')::numeric, nullif(r->>'lng', '')::numeric, v_quando, v_nome, v_resumo);
        if v_contadas <> v_esperado then
          insert into agenda_itens (fazenda_id, agenda, data, titulo, observacao)
          values (v_faz, 'fazenda', (v_quando at time zone 'America/Sao_Paulo')::date, 'Contagem não confere – lote ' || v_lote.numero,
                  v_resumo || '. Lançado por ' || v_nome || ' em ' || to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || coalesce('. ' || nullif(trim(d->>'obs'), ''), ''));
        end if;

      elsif v_tipo = 'vistoria' then
        select nome into v_manga from areas where id = nullif(d->>'manga_id', '')::uuid and fazenda_id = v_faz;
        if v_manga is null then raise exception 'Manga não encontrada.'; end if;
        v_ruins := array(select case k when 'agua' then 'Água' when 'cocho' then 'Cocho' when 'capim' then 'Capim' else 'Cerca' end
                           from unnest(array['agua','cocho','capim','cerca']) k where d->>k = 'ruim');
        v_resumo := 'Vistoria da manga ' || v_manga || ': ' ||
          concat_ws(', ', 'água ' || coalesce(d->>'agua', '—'), 'cocho ' || coalesce(d->>'cocho', '—'), 'capim ' || coalesce(d->>'capim', '—'), 'cerca ' || coalesce(d->>'cerca', '—')) ||
          case when coalesce(nullif(d->>'sal_sacos', '')::numeric, 0) > 0 then '; sal: ' || (d->>'sal_sacos') || ' saco(s)' else '' end;
        insert into campo_registros (id, fazenda_id, tipo, dados, fotos, latitude, longitude, feito_em, autor_nome, resumo)
        values (v_id, v_faz, v_tipo, d || jsonb_build_object('manga', v_manga), coalesce(array(select jsonb_array_elements_text(r->'fotos')), '{}'),
                nullif(r->>'lat', '')::numeric, nullif(r->>'lng', '')::numeric, v_quando, v_nome, v_resumo);
        if array_length(v_ruins, 1) > 0 then
          insert into agenda_itens (fazenda_id, agenda, data, titulo, observacao)
          values (v_faz, 'fazenda', (v_quando at time zone 'America/Sao_Paulo')::date, 'Manga ' || v_manga || ': ' || array_to_string(v_ruins, ', ') || ' ruim',
                  'Vistoria de ' || v_nome || ' em ' || to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || coalesce('. ' || nullif(trim(d->>'obs'), ''), ''));
        end if;

      elsif v_tipo = 'tarefa_feita' then
        update agenda_itens set feito_em = (v_quando at time zone 'America/Sao_Paulo')::date
         where id = nullif(d->>'item_id', '')::uuid and agenda = 'fazenda' and fazenda_id = v_faz and feito_em is null and agenda_acesso('fazenda', v_faz);
        get diagnostics v_n = row_count;
        insert into campo_registros (id, fazenda_id, tipo, dados, feito_em, autor_nome, situacao, resumo)
        values (v_id, v_faz, v_tipo, d, v_quando, v_nome, 'aplicado', 'Tarefa cumprida: ' || coalesce(d->>'titulo', '') || case when v_n = 0 then ' (já estava cumprida)' else '' end);
      else
        raise exception 'Tipo de lançamento do campo inválido.';
      end if;
      v_ok := v_ok || v_id;
    exception when others then
      v_erros := v_erros || jsonb_build_object('id', r->>'id', 'erro', sqlerrm);
    end;
  end loop;
  return json_build_object('aceitos', to_json(v_ok), 'erros', v_erros);
end $$;

-- 5) O gerente confere: confirma ou rejeita (com o motivo)
create or replace function public.campo_conferir(p_ids uuid[], p_aceitar boolean, p_motivo text default null)
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_n int;
begin
  if not p_aceitar and nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo da rejeição.'; end if;
  update campo_registros c set situacao = case when p_aceitar then 'confirmado' else 'rejeitado' end,
         conferido_por = auth.uid(), conferido_em = now(), motivo = case when p_aceitar then null else trim(p_motivo) end
   where c.id = any (p_ids) and c.situacao = 'pendente' and acesso_fazenda(c.fazenda_id)
     and not exists (select 1 from usuarios_fazenda uf where uf.user_id = auth.uid() and uf.fazenda_id = c.fazenda_id and uf.ativo and uf.perfil = 'vaqueiro');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.campo_pacote(uuid) to authenticated;
grant execute on function public.campo_enviar(jsonb) to authenticated;
grant execute on function public.campo_conferir(uuid[], boolean, text) to authenticated;
