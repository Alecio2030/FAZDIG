-- Fazenda Digital V195 – Estimativa das mangas (sequeiro) nas águas e na seca, pelo capim, área e gado
-- (rodado direto no Supabase; guardado aqui só como registro)

-- capins: valores iniciais usuais (fertilidade média, sequeiro), editáveis
create table if not exists public.capins (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ms_ano_t numeric not null check (ms_ano_t > 0),          -- t de matéria seca por ha no ano
  perc_aguas numeric not null check (perc_aguas between 1 and 99),
  gmd_aguas numeric, gmd_seca numeric,                    -- kg/dia
  descanso_aguas int, descanso_seca int,                  -- dias
  altura_entrada_cm numeric, altura_saida_cm numeric,
  palavras text[] not null default '{}',                  -- para reconhecer o capim digitado na manga
  prioridade int not null default 10,                     -- menor = mais específico
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.capins enable row level security;
drop policy if exists capins_ler on public.capins;
create policy capins_ler on public.capins for select to authenticated using (true);
drop policy if exists capins_gravar on public.capins;
create policy capins_gravar on public.capins for all to authenticated using (true) with check (true);

insert into public.capins (nome, ms_ano_t, perc_aguas, gmd_aguas, gmd_seca, descanso_aguas, descanso_seca, altura_entrada_cm, altura_saida_cm, palavras, prioridade) values
  ('Braquiária decumbens', 9, 75, 0.50, 0.15, 30, 60, 30, 15, array['decumbens','braquiaria','brachiaria'], 50),
  ('Marandu', 11, 75, 0.60, 0.20, 28, 45, 30, 15, array['marandu','brizantha','braquiarao'], 10),
  ('Piatã', 11, 70, 0.65, 0.25, 28, 45, 35, 20, array['piata'], 10),
  ('Xaraés', 13, 75, 0.60, 0.20, 30, 45, 30, 15, array['xaraes','mg5','mg-5','mg 5'], 10),
  ('Mombaça', 18, 80, 0.70, 0.20, 30, 60, 90, 45, array['mombaca'], 10),
  ('Tanzânia', 16, 80, 0.65, 0.20, 30, 60, 70, 35, array['tanzania'], 10),
  ('Massai', 13, 75, 0.55, 0.20, 28, 45, 55, 25, array['massai'], 10),
  ('Zuri', 20, 80, 0.70, 0.25, 30, 60, 75, 35, array['zuri'], 10),
  ('Humidícola', 7, 70, 0.35, 0.10, 35, 60, 20, 10, array['humidicola'], 20),
  ('Quicuio', 8, 70, 0.40, 0.12, 30, 60, 25, 10, array['quicuio','kikuyu'], 10),
  ('Tifton 85', 16, 75, 0.60, 0.25, 25, 45, 25, 10, array['tifton'], 10)
on conflict (nome) do nothing;

-- parâmetros gerais da estimativa (uma linha)
create table if not exists public.pastagem_parametros (
  id int primary key default 1 check (id = 1),
  eficiencia_perc numeric not null default 50,     -- quanto da forragem o gado aproveita
  consumo_perc_pv numeric not null default 2.5,    -- consumo de matéria seca, % do peso vivo por dia
  ua_kg numeric not null default 450,
  mes_aguas_ini int not null default 10, mes_aguas_fim int not null default 3,
  fator_fraca numeric not null default 0.7, fator_media numeric not null default 1, fator_boa numeric not null default 1.3,
  pesos jsonb not null default '{"M0":150,"M13":300,"M25":420,"M37":500,"F0":50,"F3":120,"F9":180,"F13":280,"F25":380,"F37":450}'
);
insert into public.pastagem_parametros (id) values (1) on conflict (id) do nothing;
alter table public.pastagem_parametros enable row level security;
drop policy if exists pastagem_parametros_ler on public.pastagem_parametros;
create policy pastagem_parametros_ler on public.pastagem_parametros for select to authenticated using (true);
drop policy if exists pastagem_parametros_gravar on public.pastagem_parametros;
create policy pastagem_parametros_gravar on public.pastagem_parametros for update to authenticated using (true) with check (true);

alter table public.areas add column if not exists capim_id uuid references public.capins(id);
alter table public.areas add column if not exists fertilidade text not null default 'media';
alter table public.areas drop constraint if exists areas_fertilidade_check;
alter table public.areas add constraint areas_fertilidade_check check (fertilidade in ('fraca', 'media', 'boa'));

create or replace function public.sem_acento(t text) returns text language sql immutable as $$
  select lower(translate(coalesce(t, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))
$$;

-- o capim da manga: o escolhido ou o reconhecido pelo nome digitado
create or replace function public.capim_da_manga(p_area uuid) returns uuid language sql stable security definer set search_path to 'public' as $$
  select coalesce(a.capim_id,
    (select c.id from capins c, unnest(c.palavras) w
      where c.ativo and sem_acento(a.capim_cultura) like '%' || w || '%'
      order by c.prioridade, length(w) desc limit 1))
  from areas a where a.id = p_area;
$$;

-- estimativa da manga nas águas e na seca, a lotação de agora e os dias de ocupação previstos
create or replace function public.manga_estimativa(p_area uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  a areas%rowtype; c capins%rowtype; pp pastagem_parametros%rowtype;
  v_area numeric; v_fator numeric; v_dias_aguas int; v_dias_seca int; v_aguas_agora boolean; m int;
  v_cons numeric; r jsonb := '{}'; e text; v_bio numeric; v_dias int; v_uaha numeric; v_cab jsonb; k text;
  v_lot record; v_ua_agora numeric; v_cap_agora numeric; v_ocup numeric; v_entrada date;
begin
  select * into a from areas where id = p_area;
  if not found or not acesso_fazenda(a.fazenda_id) then return null; end if;
  select * into pp from pastagem_parametros where id = 1;
  select * into c from capins where id = capim_da_manga(p_area);
  v_area := coalesce(a.area_util_ha, a.area_ha);
  -- dias de cada estação pelos meses dos parâmetros
  v_dias_aguas := 0;
  for m in 1..12 loop
    if (pp.mes_aguas_ini <= pp.mes_aguas_fim and m between pp.mes_aguas_ini and pp.mes_aguas_fim)
       or (pp.mes_aguas_ini > pp.mes_aguas_fim and (m >= pp.mes_aguas_ini or m <= pp.mes_aguas_fim)) then
      v_dias_aguas := v_dias_aguas + extract(day from (make_date(2025, m, 1) + interval '1 month - 1 day'))::int;
    end if;
  end loop;
  v_dias_seca := 365 - v_dias_aguas;
  m := extract(month from current_date)::int;
  v_aguas_agora := (pp.mes_aguas_ini <= pp.mes_aguas_fim and m between pp.mes_aguas_ini and pp.mes_aguas_fim)
                or (pp.mes_aguas_ini > pp.mes_aguas_fim and (m >= pp.mes_aguas_ini or m <= pp.mes_aguas_fim));
  v_cons := pp.ua_kg * pp.consumo_perc_pv / 100;            -- kg MS por UA por dia
  v_fator := case a.fertilidade when 'fraca' then pp.fator_fraca when 'boa' then pp.fator_boa else pp.fator_media end;

  -- lotação de agora: gado dos lotes que estão na manga (último peso; sem peso, o peso padrão da faixa)
  select count(*) as cab,
         coalesce(sum(coalesce(an.peso_atual_kg,
           (pp.pesos ->> (select trim(f.sexo) || f.de from faixas_idade f where trim(f.sexo) = trim(an.sexo)
                            and idade_meses(an.data_nascimento, current_date) >= f.de and (f.ate is null or idade_meses(an.data_nascimento, current_date) <= f.ate) limit 1))::numeric,
           case when trim(an.sexo) = 'M' then 300 else 280 end)), 0) as kg
    into v_lot
    from animais an join lotes l on l.id = an.lote_id
   where l.manga_id = p_area and l.situacao = 'ativo' and an.situacao = 'ativo';
  v_ua_agora := round(v_lot.kg / pp.ua_kg, 2);

  r := jsonb_build_object('capim', c.nome, 'capim_reconhecido', c.id is not null, 'fertilidade', a.fertilidade, 'area_ha', v_area,
         'estacao_agora', case when v_aguas_agora then 'aguas' else 'seca' end,
         'lotacao', jsonb_build_object('cabecas', v_lot.cab, 'ua', v_ua_agora, 'ua_ha', case when coalesce(v_area, 0) > 0 then round(v_ua_agora / v_area, 2) end));
  if c.id is null or coalesce(v_area, 0) <= 0 then return r; end if;

  foreach e in array array['aguas', 'seca'] loop
    v_dias := case when e = 'aguas' then v_dias_aguas else v_dias_seca end;
    v_bio := c.ms_ano_t * 1000 * v_fator * (case when e = 'aguas' then c.perc_aguas else 100 - c.perc_aguas end) / 100;  -- kg MS/ha na estação
    v_uaha := round(v_bio * pp.eficiencia_perc / 100 / (v_cons * v_dias), 2);
    v_cab := '{}';
    for k in select key from jsonb_each(pp.pesos) loop
      v_cab := v_cab || jsonb_build_object(k, floor(v_uaha * v_area / ((pp.pesos ->> k)::numeric / pp.ua_kg)));
    end loop;
    r := r || jsonb_build_object(e, jsonb_build_object(
      'dias', v_dias, 'biomassa_kg_ha', round(v_bio), 'ua_ha', v_uaha, 'ua', round(v_uaha * v_area, 1), 'cabecas', v_cab,
      'gmd', case when e = 'aguas' then c.gmd_aguas else c.gmd_seca end,
      'descanso', case when e = 'aguas' then c.descanso_aguas else c.descanso_seca end,
      'altura_entrada', c.altura_entrada_cm, 'altura_saida', c.altura_saida_cm));
  end loop;

  -- capacidade de agora (a informada na manga vale por cima da estimada) e dias de ocupação previstos
  e := case when v_aguas_agora then 'aguas' else 'seca' end;
  v_cap_agora := coalesce(case when v_aguas_agora then a.capacidade_aguas else a.capacidade_seca end, (r -> e ->> 'ua_ha')::numeric) * v_area;
  if v_ua_agora > 0 then
    -- forragem que acumula no descanso, aproveitada pelo gado que está na manga
    v_ocup := floor((r -> e ->> 'biomassa_kg_ha')::numeric / (r -> e ->> 'dias')::numeric * coalesce(a.descanso_dias, (r -> e ->> 'descanso')::int)
                    * v_area * pp.eficiencia_perc / 100 / (v_ua_agora * v_cons));
    select min(coalesce((select max(mv.data) from movimentacoes mv where mv.tipo = 'transferencia_manga' and mv.manga_destino_id = p_area and mv.lote_origem_id = l.id), l.data_abertura))
      into v_entrada from lotes l where l.manga_id = p_area and l.situacao = 'ativo'
       and exists (select 1 from animais an where an.lote_id = l.id and an.situacao = 'ativo');
  end if;
  r := jsonb_set(r, '{lotacao}', (r -> 'lotacao') || jsonb_build_object(
         'capacidade_ua', round(v_cap_agora, 1),
         'situacao', case when v_ua_agora = 0 then 'vazia' when v_ua_agora > v_cap_agora * 1.05 then 'acima' when v_ua_agora < v_cap_agora * 0.7 then 'abaixo' else 'dentro' end,
         'dias_ocupacao', v_ocup, 'entrada', v_entrada, 'sair_em', case when v_entrada is not null and v_ocup is not null then v_entrada + v_ocup::int end));
  return r;
end $$;
grant execute on function public.manga_estimativa(uuid) to authenticated;

-- avisos da agenda da fazenda: manga acima da capacidade e fim da ocupação prevista (quando a manga não tem limite digitado)
create or replace function public.agenda_pastos(p_fazenda uuid) returns table(tipo text, data date, titulo text, detalhe text, ref uuid)
language plpgsql stable security definer set search_path to 'public' as $$
declare a record; x jsonb; l jsonb;
begin
  for a in select id, nome, ocupacao_max_dias from areas where fazenda_id = p_fazenda and tipo = 'manga' and ativa
            and exists (select 1 from lotes lo where lo.manga_id = areas.id and lo.situacao = 'ativo') loop
    x := manga_estimativa(a.id);
    l := x -> 'lotacao';
    if l is null or coalesce((l ->> 'ua')::numeric, 0) = 0 then continue; end if;
    if l ->> 'situacao' = 'acima' then
      tipo := 'pasto_lotacao'; data := current_date; titulo := 'Manga acima da capacidade: ' || a.nome;
      detalhe := qtd_br((l ->> 'ua')::numeric) || ' UA na manga; a capacidade estimada é ' || qtd_br((l ->> 'capacidade_ua')::numeric) || ' UA (' ||
                 case when x ->> 'estacao_agora' = 'aguas' then 'águas' else 'seca' end || ')';
      ref := a.id; return next;
    end if;
    if a.ocupacao_max_dias is null and l ->> 'sair_em' is not null then
      tipo := 'pasto_ocupacao'; data := (l ->> 'sair_em')::date; titulo := 'Tirar o gado da manga: ' || a.nome;
      detalhe := 'Ocupação prevista de ' || (l ->> 'dias_ocupacao') || ' dias desde ' || to_char((l ->> 'entrada')::date, 'DD/MM/YYYY') || ' (estimativa pelo capim e pela lotação)';
      ref := a.id; return next;
    end if;
  end loop;
end $$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.agenda_automatica_extra(uuid,date)'::regprocedure);
  n := replace(d, 'select * from estoque union all select * from validade union all select * from cafe union all select * from pesar',
                  'select * from estoque union all select * from validade union all select * from cafe union all select * from pesar union all select * from public.agenda_pastos(p_fazenda)');
  if n = d then raise exception 'agenda_automatica_extra: trecho não encontrado (nada alterado).'; end if;
  execute n;
end $$;
