-- V200 · Cadastro de lote: origem "De outro lote", controle individual (brinco, ferro, peso) e finalidade.
-- Pode rodar de novo sem problema.

alter table public.lotes add column if not exists finalidade text;
alter table public.lotes add column if not exists finalidade_outra text;
alter table public.lotes add column if not exists controle_individual boolean not null default false;

alter table public.lotes drop constraint if exists lotes_finalidade_check;
alter table public.lotes add constraint lotes_finalidade_check check (finalidade is null or finalidade in
  ('cria','recria','engorda_pasto','semiconfinamento','confinamento','reproducao','descarte','outra'));

alter table public.lotes drop constraint if exists lotes_origem_check;
alter table public.lotes add constraint lotes_origem_check check (origem is null or origem in
  ('compra','parceria','cria','outra','outros_lotes'));

-- Monta o lote recém-aberto:
--  p.lote        lote novo (já criado por abrir_lote; com origem "De outro lote" foi aberto vazio)
--  p.data        data da criação (vale para a troca de lote e para os pesos)
--  p.fontes      [{lote: uuid|null, quantidade}]  (lote null = rebanho individual, animais sem lote)
--  p.animais     [{fonte: índice em p.fontes | null, brinco, ferro, peso}]  (controle individual)
-- Com fontes: os animais saem dos lotes de origem e entram no novo, com o registro da troca de lote
-- (Pecuário › Movimentações), uma por lote de origem. Sem fontes: os animais já criados no lote recebem,
-- em ordem, o brinco, o ferro e o peso de cada linha.
create or replace function public.montar_lote(p json)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lote uuid := (p->>'lote')::uuid;
  v_data date := coalesce(nullif(p->>'data','')::date, current_date);
  v_faz uuid; v_sexo char(1); v_num int;
  v_fontes json := case when json_typeof(p->'fontes') = 'array' then p->'fontes' else '[]'::json end;
  v_linhas json := case when json_typeof(p->'animais') = 'array' then p->'animais' else '[]'::json end;
  f record; l record; a record;
  v_fonte uuid; v_qtd int; v_usados uuid[] := '{}'; v_escolhidos uuid[]; v_id uuid;
  v_brinco text; v_mov uuid; v_total int := 0; v_n int; v_onde text;
begin
  select fazenda_id, sexo, numero into v_faz, v_sexo, v_num from lotes where id = v_lote;
  if not found then raise exception 'Lote não encontrado.'; end if;
  if not public.acesso_fazenda(v_faz) then raise exception 'Você não tem acesso a esta fazenda.'; end if;
  if v_data > current_date then raise exception 'A data não pode ser futura.'; end if;

  create temp table if not exists _ml (animal uuid, brinco text, ferro uuid, peso numeric, fonte int) on commit drop;
  truncate _ml;

  -- Brincos repetidos na própria tela
  select upper(btrim(x->>'brinco')) into v_brinco from json_array_elements(v_linhas) x
   where nullif(btrim(x->>'brinco'),'') is not null group by 1 having count(*) > 1 limit 1;
  if v_brinco is not null then raise exception 'O brinco % foi digitado mais de uma vez.', v_brinco; end if;

  if json_array_length(v_fontes) > 0 then
    -- ===== Vindos de outros lotes ou do rebanho individual =====
    for f in select (o - 1)::int as i, nullif(x->>'lote','')::uuid as lote, coalesce((x->>'quantidade')::int, 0) as qtd
               from json_array_elements(v_fontes) with ordinality as t(x, o) order by o loop
      v_fonte := f.lote; v_qtd := f.qtd;
      if v_qtd < 1 then raise exception 'Informe a quantidade de cada origem.'; end if;
      if v_fonte = v_lote then raise exception 'O lote de origem não pode ser o próprio lote novo.'; end if;
      if v_fonte is not null and not exists (select 1 from lotes where id = v_fonte and fazenda_id = v_faz) then
        raise exception 'Lote de origem não encontrado nesta fazenda.';
      end if;
      v_onde := case when v_fonte is null then 'no rebanho individual (sem lote)'
                     else 'no lote ' || public.codigo_lote_txt(v_fonte) end;

      -- 1) linhas desta origem com brinco de animal que já existe: tem de estar nesta origem
      for l in select x->>'brinco' as brinco, nullif(x->>'ferro','')::uuid as ferro, nullif(x->>'peso','')::numeric as peso
                 from json_array_elements(v_linhas) x
                where (x->>'fonte')::int = f.i loop
        if nullif(btrim(l.brinco),'') is null then
          -- linha sem brinco (só ferro ou peso): fica com um animal qualquer desta origem
          if v_fonte is null then
            raise exception 'Do rebanho individual informe o brinco de cada animal.';
          end if;
          insert into _ml values (null, null, l.ferro, l.peso, f.i);
          continue;
        end if;
        select id, lote_id, sexo into a from animais
         where fazenda_id = v_faz and situacao = 'ativo' and upper(btrim(brinco)) = upper(btrim(l.brinco));
        if found then
          if a.lote_id is distinct from v_fonte then
            raise exception 'O brinco % não está %. Confira a origem desta linha.', l.brinco, v_onde;
          end if;
          if a.sexo is distinct from v_sexo then
            raise exception 'O brinco % é de %; o lote novo é só de %.', l.brinco,
              case a.sexo when 'M' then 'macho' else 'fêmea' end, case v_sexo when 'M' then 'machos' else 'fêmeas' end;
          end if;
          insert into _ml values (a.id, null, l.ferro, l.peso, f.i);
          v_usados := v_usados || a.id;
        else
          if v_fonte is null then
            raise exception 'O brinco % não existe no rebanho desta fazenda. Do rebanho individual só vêm animais já identificados.', l.brinco;
          end if;
          insert into _ml values (null, btrim(l.brinco), l.ferro, l.peso, f.i);  -- animal sem brinco recebe este
        end if;
      end loop;

      if v_fonte is null and (select count(*) from _ml where fonte = f.i) < v_qtd then
        raise exception 'Do rebanho individual informe o brinco de cada animal (% de %).', (select count(*) from _ml where fonte = f.i), v_qtd;
      end if;
      if (select count(*) from _ml where fonte = f.i) > v_qtd then
        raise exception 'Há mais brincos que a quantidade informada %.', v_onde;
      end if;

      -- 2) linhas sem animal (brinco novo) e as cabeças que faltam: animais desta origem, primeiro os sem brinco
      v_n := (select count(*) from _ml where fonte = f.i and animal is null and brinco is not null);
      v_escolhidos := array(
        select id from animais
         where fazenda_id = v_faz and situacao = 'ativo' and sexo = v_sexo
           and lote_id = v_fonte and id <> all (v_usados)
           order by (brinco is null) desc, numero_interno desc
         limit v_qtd - (select count(*) from _ml where fonte = f.i and animal is not null));
      if coalesce(array_length(v_escolhidos, 1), 0) < v_qtd - (select count(*) from _ml where fonte = f.i and animal is not null) then
        raise exception 'Há só % % disponíveis %; a tela pede %.',
          (select count(*) from animais where fazenda_id = v_faz and situacao = 'ativo' and sexo = v_sexo and lote_id = v_fonte),
          case v_sexo when 'M' then 'machos' else 'fêmeas' end, v_onde, v_qtd;
      end if;
      -- brinco novo só vai para animal que ainda não tem brinco
      if v_n > 0 and (select count(*) from animais where id = any (v_escolhidos[1:v_n]) and brinco is null) < v_n then
        raise exception 'Não há % animais sem brinco % para receber os brincos novos digitados.', v_n, v_onde;
      end if;
      -- liga os brincos novos aos primeiros escolhidos (sem brinco) e o restante entra sem dados por linha
      for v_id in select unnest(v_escolhidos) loop
        -- primeiro os brincos novos (os escolhidos começam pelos sem brinco), depois as linhas só com ferro/peso
        update _ml set animal = v_id where ctid = (select ctid from _ml where fonte = f.i and animal is null
                                                     order by (brinco is null) limit 1);
        if not found then insert into _ml values (v_id, null, null, null, f.i); end if;
        v_usados := v_usados || v_id;
      end loop;

      -- registro da troca de lote, uma por origem
      insert into movimentacoes (fazenda_id, data, tipo, lote_origem_id, lote_destino_id, observacoes)
        values (v_faz, v_data, 'transferencia_lote', v_fonte, v_lote,
                'Formação do lote ' || public.codigo_lote_txt(v_lote))
        returning id into v_mov;
      insert into movimentacao_itens (fazenda_id, movimentacao_id, animal_id, quantidade, sexo, raca_id, ferro_id, peso_kg, lote_original_id)
        select v_faz, v_mov, an.id, 1, an.sexo, an.raca_id, an.ferro_id, m.peso, an.lote_id
          from _ml m join animais an on an.id = m.animal where m.fonte = f.i;
      v_total := v_total + v_qtd;
    end loop;

    update animais an set lote_id = v_lote, sexo_diferente_lote = false
      from _ml m where an.id = m.animal;
  else
    -- ===== Animais novos já criados no lote: brinco, ferro e peso em ordem =====
    insert into _ml (animal, brinco, ferro, peso, fonte)
    select an.id, nullif(btrim(x.j->>'brinco'),''), nullif(x.j->>'ferro','')::uuid, nullif(x.j->>'peso','')::numeric, null
      from (select row_number() over (order by numero_interno) as r, id from animais where lote_id = v_lote and situacao = 'ativo') an
      join (select o as r, j from json_array_elements(v_linhas) with ordinality as t(j, o)) x on x.r = an.r;
    v_total := (select count(*) from _ml);
  end if;

  -- brinco novo não pode existir em outro animal da fazenda
  select m.brinco into v_brinco from _ml m join animais o on o.fazenda_id = v_faz and upper(btrim(o.brinco)) = upper(m.brinco) and o.id <> m.animal
   where m.brinco is not null limit 1;
  if v_brinco is not null then raise exception 'O brinco % já é de outro animal desta fazenda.', v_brinco; end if;

  update animais an set
      brinco = coalesce(m.brinco, an.brinco),
      ferro_id = coalesce(m.ferro, an.ferro_id),
      peso_atual_kg = coalesce(m.peso, an.peso_atual_kg),
      peso_atual_data = case when m.peso is not null then v_data else an.peso_atual_data end
    from _ml m where an.id = m.animal and (m.brinco is not null or m.ferro is not null or m.peso is not null);

  return json_build_object('lote', v_lote, 'numero', v_num, 'cabecas', v_total);
end $function$;

-- Identificar e pesar os animais de um lote já aberto (controle individual).
--  p.lote, p.data, p.animais [{id, brinco, ferro, peso}]
create or replace function public.identificar_animais_lote(p json)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lote uuid := (p->>'lote')::uuid;
  v_data date := coalesce(nullif(p->>'data','')::date, current_date);
  v_faz uuid; v_brinco text; v_n int;
begin
  select fazenda_id into v_faz from lotes where id = v_lote;
  if not found then raise exception 'Lote não encontrado.'; end if;
  if not public.acesso_fazenda(v_faz) then raise exception 'Você não tem acesso a esta fazenda.'; end if;
  if v_data > current_date then raise exception 'A data não pode ser futura.'; end if;

  create temp table if not exists _ia (animal uuid, brinco text, ferro uuid, peso numeric) on commit drop;
  truncate _ia;
  insert into _ia select (x->>'id')::uuid, nullif(btrim(x->>'brinco'),''), nullif(x->>'ferro','')::uuid, nullif(x->>'peso','')::numeric
    from json_array_elements(case when json_typeof(p->'animais') = 'array' then p->'animais' else '[]'::json end) x;

  if exists (select 1 from _ia i left join animais a on a.id = i.animal and a.lote_id = v_lote and a.situacao = 'ativo' where a.id is null) then
    raise exception 'Algum animal não está mais neste lote. Abra o lote de novo.';
  end if;
  select upper(brinco) into v_brinco from _ia where brinco is not null group by 1 having count(*) > 1 limit 1;
  if v_brinco is not null then raise exception 'O brinco % foi digitado mais de uma vez.', v_brinco; end if;
  select i.brinco into v_brinco from _ia i join animais o on o.fazenda_id = v_faz and upper(btrim(o.brinco)) = upper(i.brinco) and o.id <> i.animal
   where i.brinco is not null limit 1;
  if v_brinco is not null then raise exception 'O brinco % já é de outro animal desta fazenda.', v_brinco; end if;

  update animais a set
      brinco = i.brinco,
      ferro_id = i.ferro,
      peso_atual_kg = coalesce(i.peso, a.peso_atual_kg),
      peso_atual_data = case when i.peso is not null and i.peso is distinct from a.peso_atual_kg then v_data else a.peso_atual_data end
    from _ia i where a.id = i.animal;
  get diagnostics v_n = row_count;
  update lotes set controle_individual = true where id = v_lote;
  return json_build_object('animais', v_n);
end $function$;

-- Código do lote para as mensagens (sigla da fazenda + número com 3 dígitos).
create or replace function public.codigo_lote_txt(p_lote uuid)
returns text language sql stable set search_path to 'public' as $$
  select coalesce(nullif(btrim(f.sigla),''), 'Lote') || ' ' || lpad(l.numero::text, 3, '0')
    from lotes l join fazendas f on f.id = l.fazenda_id where l.id = p_lote
$$;

-- Abre o lote inteiro numa só operação (se algo der errado, nada fica gravado):
--  p.abrir   os parâmetros de abrir_lote (fazenda, sexo, quantidade, descricao, categoria, raca, ferro,
--            nascimento, nasc_aprox, manga, proprietario, dono, abertura, obs)
--  p.extras  origem, pesos, finalidade, mineral etc. (colunas do lote)
--  p.montar  fontes e animais (ver montar_lote); vazio = nada a montar
create or replace function public.criar_lote(p json)
returns json
language plpgsql
set search_path to 'public'
as $function$
declare
  a json := p->'abrir';
  e json := coalesce(p->'extras', '{}'::json);
  m json := p->'montar';
  r json; v_lote uuid; r2 json;
begin
  r := public.abrir_lote(
    (a->>'fazenda')::uuid, a->>'sexo', coalesce((a->>'quantidade')::int, 0), a->>'descricao', a->>'categoria',
    nullif(a->>'raca','')::uuid, nullif(a->>'ferro','')::uuid, nullif(a->>'nascimento','')::date,
    coalesce((a->>'nasc_aprox')::boolean, false), nullif(a->>'manga','')::uuid, coalesce(a->>'proprietario','proprio'),
    nullif(a->>'dono','')::uuid, coalesce(nullif(a->>'abertura','')::date, current_date), a->>'obs');
  v_lote := (r->>'id')::uuid;

  update lotes set
      origem = e->>'origem',
      origem_parceria = e->>'origem_parceria',
      origem_outra = e->>'origem_outra',
      perc_criador = (e->>'perc_criador')::numeric,
      perc_parceiro = (e->>'perc_parceiro')::numeric,
      peso_inicial_total = (e->>'peso_inicial_total')::numeric,
      peso_inicial_medio = (e->>'peso_inicial_medio')::numeric,
      ecc = (e->>'ecc')::smallint,
      peso_parcial_data = (e->>'peso_parcial_data')::date,
      peso_parcial_total = (e->>'peso_parcial_total')::numeric,
      peso_parcial_medio = (e->>'peso_parcial_medio')::numeric,
      engorda_perc_arrobas = (e->>'engorda_perc_arrobas')::numeric,
      aluguel_pasto_cab_dia = (e->>'aluguel_pasto_cab_dia')::numeric,
      aluguel_suplemento_cab_dia = (e->>'aluguel_suplemento_cab_dia')::numeric,
      mineral_insumo_id = (e->>'mineral_insumo_id')::uuid,
      mineral_kg_cab_dia = (e->>'mineral_kg_cab_dia')::numeric,
      alimentar_insumo_id = (e->>'alimentar_insumo_id')::uuid,
      alimentar_kg_cab_dia = (e->>'alimentar_kg_cab_dia')::numeric,
      finalidade = e->>'finalidade',
      finalidade_outra = e->>'finalidade_outra',
      controle_individual = coalesce((e->>'controle_individual')::boolean, false)
    where id = v_lote;

  if json_typeof(m) = 'object' and (json_typeof(m->'fontes') = 'array' or json_typeof(m->'animais') = 'array') then
    r2 := public.montar_lote(json_build_object('lote', v_lote, 'data', a->>'abertura', 'fontes', m->'fontes', 'animais', m->'animais'));
    return json_build_object('id', v_lote, 'numero', (r->>'numero')::int, 'cabecas', coalesce((r2->>'cabecas')::int, (r->>'cabecas')::int));
  end if;
  return r;
end $function$;
grant execute on function public.criar_lote(json) to authenticated;

grant execute on function public.montar_lote(json) to authenticated;
grant execute on function public.identificar_animais_lote(json) to authenticated;
grant execute on function public.codigo_lote_txt(uuid) to authenticated;
