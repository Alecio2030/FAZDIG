-- =====================================================================================
-- Fazenda Digital V152 - banco
--  1) Imobilizado EM FORMAÇÃO (lavoura, curral, barragem, estrada, casa, galpão...)
--     O bem nasce com o código (ex.: FI 069) e o seu CENTRO DE CUSTO dentro do grupo
--     "IMOBILIZADO EM FORMAÇÃO" da fazenda (ex.: 4.1.08-001). Tudo o que for lançado nesse
--     centro (insumos das atividades, mão de obra, máquinas, serviços, combustível,
--     depreciação de outros bens, transferências) é o custo de formação.
--     Ao informar a data de início da operação, o bem é ativado com esse custo e começa
--     a depreciação/exaustão; na lavoura, o talhão é criado sozinho (se ainda não existir).
--  2) Abastecimento: rateio do custo em vários centros de custo (percentuais).
--  3) Transferências entre fazendas: bens, produtos do estoque (para o estoque ou direto
--     num centro de custo da outra fazenda) e gado (os animais levam o número e o brinco).
-- Não apaga nem altera dados existentes. Pode rodar mais de uma vez.
-- =====================================================================================

-- ---------- 1. Imobilizado em formação ----------
alter table public.imobilizados drop constraint if exists imobilizados_situacao_check;
alter table public.imobilizados add constraint imobilizados_situacao_check check (situacao in ('ativo', 'baixado', 'formacao'));
alter table public.imobilizados drop constraint if exists imobilizados_valor_aquisicao_check;
alter table public.imobilizados add constraint imobilizados_valor_aquisicao_check check (valor_aquisicao > 0 or (situacao = 'formacao' and valor_aquisicao >= 0));
alter table public.imobilizados alter column vida_util drop not null;
alter table public.imobilizados drop constraint if exists imobilizados_vida_util_check;
alter table public.imobilizados add constraint imobilizados_vida_util_check check (vida_util > 0 or (situacao = 'formacao' and vida_util is null));

alter table public.imobilizados add column if not exists formacao_centro_id uuid references public.centros_custo(id) on delete set null;
alter table public.imobilizados add column if not exists formacao_inicio date;
alter table public.imobilizados add column if not exists formacao_valor_anterior numeric not null default 0;
alter table public.imobilizados add column if not exists operacao_inicio date;
alter table public.imobilizados add column if not exists formacao_resumo jsonb;
alter table public.centros_custo add column if not exists imobilizado_id uuid references public.imobilizados(id) on delete set null;
create index if not exists centros_custo_imob_idx on public.centros_custo (imobilizado_id) where imobilizado_id is not null;

/** Centro de custo do bem em formação: cria (ou renomeia) a divisão dentro do grupo "IMOBILIZADO EM FORMAÇÃO" da unidade. */
create or replace function public.formacao_centro(p_imob uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  b imobilizados%rowtype; v_cod2 text; v_cod3 text; v_conta uuid; v_pai uuid; v_cod_pai text; v_n int; v uuid; v_nome text;
begin
  select * into b from imobilizados where id = p_imob;
  if b.id is null then return null; end if;
  if public.unidade_particular(b.fazenda_id) then raise exception 'O Particular dos sócios não tem bem em formação.'; end if;
  v_nome := left(trim(coalesce(b.codigo_patrimonial || ' ', '') || b.nome), 120);
  -- já tem centro: só acerta o nome
  if b.formacao_centro_id is not null and exists (select 1 from centros_custo where id = b.formacao_centro_id) then
    update centros_custo set nome = v_nome, imobilizado_id = b.id where id = b.formacao_centro_id and (nome, imobilizado_id) is distinct from (v_nome, b.id);
    return b.formacao_centro_id;
  end if;
  -- grupo da unidade no grupo 4 (4.1 = Fazenda 3 Irmãos; 4.9 = Administrativo)
  if b.fazenda_id is null then
    select codigo into v_cod2 from plano_contas where codigo ~ '^4\.[0-9]+$' and fazenda_id is null and coalesce(adm, false) order by codigo limit 1;
  else
    select codigo into v_cod2 from plano_contas where codigo ~ '^4\.[0-9]+$' and fazenda_id = b.fazenda_id order by codigo limit 1;
  end if;
  if v_cod2 is null then raise exception 'A unidade do bem ainda não tem o grupo no plano de contas (4.N).'; end if;
  -- grau 3 "IMOBILIZADO EM FORMAÇÃO" (o 08, ou o próximo livre)
  select codigo into v_cod3 from plano_contas where codigo ~ ('^' || replace(v_cod2, '.', '\.') || '\.[0-9]{2}$') and nome ilike '%FORMA%' order by codigo limit 1;
  if v_cod3 is null then
    v_n := 8;
    while exists (select 1 from plano_contas where codigo = v_cod2 || '.' || lpad(v_n::text, 2, '0')) loop v_n := v_n + 1; end loop;
    v_cod3 := v_cod2 || '.' || lpad(v_n::text, 2, '0');
  end if;
  v_conta := public.conta_garantir(v_cod3, 'IMOBILIZADO EM FORMAÇÃO');
  v_pai := public.centro_do_grau3(v_conta);
  select codigo into v_cod_pai from centros_custo where id = v_pai;
  select coalesce(max(nullif(split_part(codigo, '-', 2), '')::int), 0) + 1 into v_n
    from centros_custo where centro_pai_id = v_pai and split_part(codigo, '-', 2) ~ '^[0-9]+$';
  insert into centros_custo (codigo, nome, centro_pai_id, fazenda_id, ativo, imobilizado_id)
    values (v_cod_pai || '-' || lpad(v_n::text, 3, '0'), v_nome, v_pai, b.fazenda_id, true, b.id)
    returning id into v;
  update imobilizados set formacao_centro_id = v where id = b.id;
  return v;
end $$;

create or replace function public.salvar_imobilizado(p jsonb)
returns json language plpgsql set search_path to 'public' as $$
declare
  v_id uuid := nullif(p->>'id','')::uuid; v_num int; v_faz uuid := (p->>'fazenda_id')::uuid; v_soma numeric := 0; r jsonb;
  v_sit text := coalesce(nullif(p->>'situacao',''), 'ativo'); v_ant imobilizados%rowtype; v_centro uuid;
  v_form boolean;
begin
  if not public.acesso_fazenda(v_faz) then raise exception 'Sem acesso a esta fazenda.'; end if;
  if v_id is not null then
    select * into v_ant from imobilizados where id = v_id;
    if v_ant.id is null then raise exception 'Bem não encontrado.'; end if;
    if v_ant.situacao = 'formacao' and v_sit <> 'formacao' then
      raise exception 'Este bem está em formação: para começar a usar, informe a data de início da operação em "Concluir a formação".';
    end if;
    if v_ant.situacao <> 'formacao' and v_sit = 'formacao' then
      raise exception 'Um bem já ativado não volta para "em formação".';
    end if;
  end if;
  v_form := v_sit = 'formacao';
  if not v_form then
    if jsonb_array_length(coalesce(p->'rateio','[]')) = 0 then raise exception 'Informe o rateio por centro de custo (soma 100%%).'; end if;
    for r in select * from jsonb_array_elements(p->'rateio') loop v_soma := v_soma + (r->>'percentual')::numeric; end loop;
    if abs(v_soma - 100) > 0.001 then raise exception 'O rateio precisa somar 100%% (soma atual: %).', v_soma; end if;
  elsif public.unidade_particular(v_faz) then
    raise exception 'O Particular dos sócios não tem bem em formação.';
  end if;

  if v_id is null then
    insert into imobilizados (fazenda_id, codigo_patrimonial, nome, descricao, metodo, categoria, valor_aquisicao, data_ativacao, vida_util, vida_unidade,
      residual_perc, pessoa_id, documento, compra_id, area_id, situacao, data_baixa, motivo_baixa, observacoes, chave_nfe, arquivo_documento, item_nota,
      formacao_inicio, formacao_valor_anterior)
    values (v_faz, nullif(trim(p->>'codigo_patrimonial'),''), trim(p->>'nome'), nullif(trim(p->>'descricao'),''), p->>'metodo', p->>'categoria',
      case when v_form then coalesce(nullif(p->>'formacao_valor_anterior','')::numeric, 0) else (p->>'valor_aquisicao')::numeric end,
      (p->>'data_ativacao')::date,
      case when v_form then null else (p->>'vida_util')::numeric end,
      case when p->>'metodo' = 'exaustao' then 'safras' else coalesce(p->>'vida_unidade','anos') end,
      case when v_form then 0 else coalesce((p->>'residual_perc')::numeric,0) end,
      nullif(p->>'pessoa_id','')::uuid, nullif(trim(p->>'documento'),''), nullif(p->>'compra_id','')::uuid, nullif(p->>'area_id','')::uuid,
      v_sit, nullif(p->>'data_baixa','')::date, nullif(trim(p->>'motivo_baixa'),''), nullif(trim(p->>'observacoes'),''),
      nullif(p->>'chave_nfe',''), nullif(p->>'arquivo_documento',''), nullif(p->>'item_nota','')::int,
      case when v_form then (p->>'data_ativacao')::date end,
      case when v_form then coalesce(nullif(p->>'formacao_valor_anterior','')::numeric, 0) else 0 end)
    returning id, numero into v_id, v_num;
  else
    update imobilizados set codigo_patrimonial = nullif(trim(p->>'codigo_patrimonial'),''), nome = trim(p->>'nome'), descricao = nullif(trim(p->>'descricao'),''),
      metodo = p->>'metodo', categoria = p->>'categoria',
      valor_aquisicao = case when v_form then coalesce(nullif(p->>'formacao_valor_anterior','')::numeric, 0) else (p->>'valor_aquisicao')::numeric end,
      data_ativacao = (p->>'data_ativacao')::date,
      vida_util = case when v_form then null else (p->>'vida_util')::numeric end,
      vida_unidade = case when p->>'metodo' = 'exaustao' then 'safras' else coalesce(p->>'vida_unidade','anos') end,
      residual_perc = case when v_form then 0 else coalesce((p->>'residual_perc')::numeric,0) end,
      pessoa_id = nullif(p->>'pessoa_id','')::uuid, documento = nullif(trim(p->>'documento'),''), compra_id = nullif(p->>'compra_id','')::uuid,
      area_id = nullif(p->>'area_id','')::uuid, situacao = v_sit, data_baixa = nullif(p->>'data_baixa','')::date,
      motivo_baixa = nullif(trim(p->>'motivo_baixa'),''), observacoes = nullif(trim(p->>'observacoes'),''),
      chave_nfe = coalesce(nullif(p->>'chave_nfe',''), chave_nfe),
      arquivo_documento = coalesce(nullif(p->>'arquivo_documento',''), arquivo_documento),
      formacao_inicio = case when v_form then (p->>'data_ativacao')::date else formacao_inicio end,
      formacao_valor_anterior = case when v_form then coalesce(nullif(p->>'formacao_valor_anterior','')::numeric, 0) else formacao_valor_anterior end
    where id = v_id returning numero into v_num;
    if v_num is null then raise exception 'Bem não encontrado.'; end if;
    delete from imobilizado_rateios where imobilizado_id = v_id;
  end if;
  if v_form then
    -- a lavoura em formação: o mesmo talhão não pode estar em dois bens em formação
    if nullif(p->>'area_id','') is not null and exists (select 1 from imobilizados where area_id = (p->>'area_id')::uuid and situacao = 'formacao' and id <> v_id) then
      raise exception 'Este talhão já está em outro bem em formação.';
    end if;
    v_centro := public.formacao_centro(v_id);
  else
    for r in select * from jsonb_array_elements(p->'rateio') loop
      insert into imobilizado_rateios values (v_id, (r->>'centro_custo_id')::uuid, (r->>'percentual')::numeric);
    end loop;
  end if;
  return json_build_object('id', v_id, 'numero', v_num, 'centro_id', v_centro,
                           'centro', (select codigo || ' ' || nome from centros_custo where id = v_centro),
                           'codigo', (select codigo_patrimonial from imobilizados where id = v_id));
end $$;

/**
 * Conclui a formação: o bem passa a "em uso" na data de início da operação, com o custo acumulado
 * (calculado e conferido na tela), e começa a depreciação/exaustão. O centro da formação é encerrado.
 * Lavoura sem talhão: cria o talhão com os dados informados (o centro de custo dele nasce sozinho).
 */
create or replace function public.concluir_formacao(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid := (p->>'id')::uuid; b imobilizados%rowtype; v_data date := nullif(p->>'data','')::date;
  v_valor numeric := round(coalesce(nullif(p->>'valor','')::numeric, 0), 2); v_vida numeric := nullif(p->>'vida_util','')::numeric;
  v_area uuid; v_soma numeric := 0; r jsonb; v_centro uuid; a jsonb := p->'talhao'; v_rat int := 0;
begin
  select * into b from imobilizados where id = v_id;
  if b.id is null or not acesso_completo(b.fazenda_id) then raise exception 'Bem não encontrado ou sem permissão.'; end if;
  if b.situacao <> 'formacao' then raise exception 'Este bem não está em formação.'; end if;
  if v_data is null then raise exception 'Informe a data de início da operação.'; end if;
  if v_data > current_date then raise exception 'A data de início da operação não pode ser futura.'; end if;
  if v_data < b.data_ativacao then raise exception 'A operação não pode começar antes do início da formação (%).', to_char(b.data_ativacao, 'DD/MM/YYYY'); end if;
  if v_valor <= 0 then raise exception 'O custo de formação está zerado: confira os lançamentos no centro de custo do bem.'; end if;
  if coalesce(v_vida, 0) <= 0 then raise exception 'Informe a vida útil (% ).', case when b.metodo = 'exaustao' then 'safras' else 'anos' end; end if;

  v_area := b.area_id;
  if b.metodo = 'exaustao' and v_area is null then
    if b.fazenda_id is null then raise exception 'Lavoura em formação precisa estar numa fazenda.'; end if;
    if a is null or nullif(trim(a->>'nome'), '') is null then raise exception 'Informe o nome do talhão que será criado.'; end if;
    if exists (select 1 from areas where fazenda_id = b.fazenda_id and tipo = case when b.categoria = 'pastagem' then 'manga' else 'talhao' end and upper(trim(nome)) = upper(trim(a->>'nome'))) then
      raise exception 'Já existe o talhão "%" nesta fazenda: escolha outro nome ou ligue o bem a ele.', trim(a->>'nome');
    end if;
    insert into areas (fazenda_id, tipo, nome, area_ha, area_util_ha, especie, capim_cultura, variedade, data_plantio, plantas_total,
                       espacamento_linhas_m, espacamento_plantas_m, ativa)
      values (b.fazenda_id, case when b.categoria = 'pastagem' then 'manga' else 'talhao' end, trim(a->>'nome'), nullif(a->>'area_ha','')::numeric, nullif(a->>'area_util_ha','')::numeric,
              nullif(trim(a->>'especie'),''), nullif(trim(a->>'especie'),''), nullif(trim(a->>'variedade'),''), nullif(a->>'data_plantio','')::date,
              nullif(a->>'plantas_total','')::int, nullif(a->>'espacamento_linhas_m','')::numeric, nullif(a->>'espacamento_plantas_m','')::numeric, true)
      returning id into v_area;
  end if;

  -- rateio da depreciação/exaustão daqui em diante
  delete from imobilizado_rateios where imobilizado_id = v_id;
  for r in select * from jsonb_array_elements(coalesce(p->'rateio','[]')) loop
    if nullif(r->>'centro_custo_id','') is null then continue; end if;
    insert into imobilizado_rateios values (v_id, (r->>'centro_custo_id')::uuid, (r->>'percentual')::numeric);
    v_soma := v_soma + (r->>'percentual')::numeric; v_rat := v_rat + 1;
  end loop;
  if v_rat = 0 then
    v_centro := case when v_area is not null then public.centro_da_area(v_area) end;
    if v_centro is null then raise exception 'Escolha o centro de custo que vai receber a % do bem.', case when b.metodo = 'exaustao' then 'exaustão' else 'depreciação' end; end if;
    insert into imobilizado_rateios values (v_id, v_centro, 100);
  elsif abs(v_soma - 100) > 0.001 then
    raise exception 'O rateio precisa somar 100%% (soma atual: %).', v_soma;
  end if;

  update imobilizados set situacao = 'ativo', valor_aquisicao = v_valor, data_ativacao = v_data, operacao_inicio = v_data,
    vida_util = v_vida, vida_unidade = case when metodo = 'exaustao' then 'safras' else 'anos' end,
    residual_perc = coalesce(nullif(p->>'residual_perc','')::numeric, 0), area_id = v_area,
    formacao_resumo = p->'resumo'
  where id = v_id;
  update centros_custo set ativo = false where id = b.formacao_centro_id;
  return json_build_object('id', v_id, 'numero', b.numero, 'area_id', v_area, 'area_criada', b.area_id is null and v_area is not null);
end $$;

/** Volta a conclusão (lançou a data errada): o bem retorna a "em formação" e o centro reabre. */
create or replace function public.reabrir_formacao(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare b imobilizados%rowtype;
begin
  select * into b from imobilizados where id = p_id;
  if b.id is null or not acesso_completo(b.fazenda_id) then raise exception 'Bem não encontrado ou sem permissão.'; end if;
  if b.operacao_inicio is null or b.formacao_centro_id is null then raise exception 'Este bem não veio de uma formação.'; end if;
  if b.situacao <> 'ativo' then raise exception 'Só dá para reabrir um bem em uso.'; end if;
  delete from imobilizado_rateios where imobilizado_id = p_id;
  update imobilizados set situacao = 'formacao', valor_aquisicao = formacao_valor_anterior, data_ativacao = coalesce(formacao_inicio, data_ativacao),
    vida_util = null, residual_perc = 0, operacao_inicio = null, formacao_resumo = null where id = p_id;
  update centros_custo set ativo = true where id = b.formacao_centro_id;
end $$;

-- bem excluído: o centro da formação sai junto (ou fica inativo, se já tiver lançamentos)
create or replace function public.trg_imob_excluir_centro()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if old.formacao_centro_id is not null then
    update centros_custo set ativo = false, imobilizado_id = null where id = old.formacao_centro_id;
    begin
      delete from centros_custo where id = old.formacao_centro_id;
    exception when others then null;
    end;
  end if;
  return old;
end $$;
drop trigger if exists trg_imob_excluir_centro on public.imobilizados;
create trigger trg_imob_excluir_centro after delete on public.imobilizados for each row execute function public.trg_imob_excluir_centro();

-- Atividades: enquanto a lavoura do talhão está em formação, o custo vai para o centro da formação
do $$
declare d text; v_old text := 'select id into v_centro from centros_custo where area_id = (a->>''area'')::uuid and ativo order by codigo limit 1;';
begin
  d := pg_get_functiondef('public.salvar_atividade'::regproc);
  if position('formacao_centro_id' in d) > 0 then raise notice 'salvar_atividade já ajustada.'; return; end if;
  if position(v_old in d) = 0 then raise notice 'ATENÇÃO: não achei a linha do centro em salvar_atividade; a atividade continua indo para o centro do talhão.'; return; end if;
  d := replace(d, v_old,
    'select i.formacao_centro_id into v_centro from imobilizados i where i.area_id = (a->>''area'')::uuid and i.situacao = ''formacao'' and i.formacao_centro_id is not null limit 1; '
    || 'if v_centro is null then ' || v_old || ' end if;');
  execute d;
end $$;

-- Resultado de caixa: o que foi pago para um bem em formação é investimento (vai para o Imobilizado), não despesa
select public.conta_garantir('1.6.01.011', 'Imobilizado em Formação');

create or replace function public.fracao_formacao(p_lanc uuid)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select case when exists (select 1 from centros_custo c where c.id = l.centro_custo_id and c.imobilizado_id is not null) then 1::numeric else 0::numeric end
       where l.centro_custo_id is not null),
    (select sum(r.percentual) / 100 from lancamento_rateios r join centros_custo c on c.id = r.centro_custo_id where r.lancamento_id = l.id and c.imobilizado_id is not null),
    (select sum(r.percentual) / 100 from compra_rateios r join centros_custo c on c.id = r.centro_custo_id join compras cp on cp.id = r.compra_id
      where r.compra_id = l.compra_id and c.imobilizado_id is not null and cp.tipo = 'despesa'),
    0)
  from lancamentos l
  where l.id = p_lanc and l.tipo = 'pagar' and l.financiamento_id is null and (l.compra_id is null or exists (select 1 from compras cp where cp.id = l.compra_id and cp.tipo = 'despesa'))
$$;

CREATE OR REPLACE FUNCTION public.resultado_caixa(p_fazendas uuid[], p_de date, p_ate date, p_adm boolean DEFAULT false)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with b as (
    select bx.id, bx.valor_principal, bx.juros + bx.multa as encargos, bx.desconto, l.tipo, l.conta_contabil_id, public.unidade_particular(bx.fazenda_id) as part, bx.fazenda_id as faz,
      (inicio_sistema() is not null and bx.data < inicio_sistema()) as pre,
      case when fp.id is not null and (fp.principal + fp.juros + fp.vm) > 0 then round(bx.valor_principal * (fp.juros + fp.vm) / (fp.principal + fp.juros + fp.vm), 2) else 0 end as juros_parcela,
      -- V152: parte do título paga para bem em formação (centro de custo da formação)
      least(1, coalesce(public.fracao_formacao(l.id), 0)) as form
    from baixas bx
      join lancamentos l on l.id = bx.lancamento_id
      left join financiamento_parcelas fp on fp.lancamento_id = l.id
    where bx.situacao = 'confirmada' and bx.data between p_de and p_ate and (bx.fazenda_id = any(p_fazendas) or ((p_adm or '00000000-0000-0000-0000-000000000000'::uuid = any(p_fazendas)) and bx.fazenda_id is null))
  ),
  linhas as (
    select conta_contabil_id as conta, tipo, round((valor_principal - juros_parcela) * (1 - form), 2) as valor, pre, part from b where form < 1
    union all
    select public.conta_do_tipo('imob_formacao'), tipo, (valor_principal - juros_parcela) - round((valor_principal - juros_parcela) * (1 - form), 2), pre, part from b where form > 0
    union all
    select public.conta_do_tipo('juros', faz), tipo, juros_parcela, pre, part from b where juros_parcela > 0
    union all
    select public.conta_do_tipo(case when tipo = 'receber' then 'rendimentos' else 'juros' end, faz), tipo, encargos, pre, part from b where encargos > 0
    union all
    select public.conta_do_tipo(case when tipo = 'receber' then 'desconto_concedido' else 'desconto_obtido' end, faz), case when tipo = 'receber' then 'pagar' else 'receber' end, desconto, pre, part from b where desconto > 0
  ),
  soma as (
    select x.conta, coalesce(sum(x.valor) filter (where x.tipo = 'receber'), 0) as entradas, coalesce(sum(x.valor) filter (where x.tipo = 'pagar'), 0) as saidas
    from (select case when pre then public.conta_do_tipo('saldo_abertura') when part then public.conta_do_tipo(case when tipo = 'receber' then 'particular_receita' else 'particular_despesa' end) else conta end as conta, tipo, valor from linhas) x group by x.conta
  )
  select json_build_object(
    'contas', coalesce((select json_agg(json_build_object('conta_id', s.conta, 'entradas', s.entradas, 'saidas', s.saidas)) from soma s), '[]'::json),
    'caixa_entradas', coalesce((select sum(case when tipo = 'receber' then valor_principal + encargos - desconto else 0 end) from b), 0),
    'caixa_saidas', coalesce((select sum(case when tipo = 'pagar' then valor_principal + encargos - desconto else 0 end) from b), 0),
    'pendentes', (select count(*) from baixas bx where bx.situacao = 'pendente' and bx.data between p_de and p_ate and (bx.fazenda_id = any(p_fazendas) or ((p_adm or '00000000-0000-0000-0000-000000000000'::uuid = any(p_fazendas)) and bx.fazenda_id is null))),
    'abertura_conta', public.conta_do_tipo('saldo_abertura'),
    'inicio', inicio_sistema()
  );
$function$;

-- tipo de lançamento do sistema para a conta do imobilizado em formação
insert into public.tipos_lancamento (chave, nome, uso, conta_id, ordem, ativo, padrao)
  select 'imob_formacao', 'Imobilizado em formação (pago para bem em formação)', 'sistema', id, 905, true, true from public.plano_contas where codigo = '1.6.01.011'
  on conflict do nothing;

-- movimentação que veio de transferência entre fazendas só se desfaz pela transferência
do $$
declare d text; v_old text := '  if m.venda_id is not null then';
begin
  d := pg_get_functiondef('public.excluir_movimentacao'::regproc);
  if position('transferencia_id' in d) > 0 then return; end if;
  if position(v_old in d) = 0 then raise notice 'ATENÇÃO: excluir_movimentacao não ajustada.'; return; end if;
  d := replace(d, v_old, '  if m.transferencia_id is not null then raise exception ''Esta movimentação veio da transferência entre fazendas: desfaça em Mais › Transferências.''; end if;' || chr(10) || v_old);
  execute d;
end $$;

-- ---------- 2. Abastecimento: rateio por centros de custo ----------
create table if not exists public.frota_abastecimento_rateios (
  abastecimento_id uuid not null references public.frota_abastecimentos(id) on delete cascade,
  centro_custo_id uuid not null references public.centros_custo(id),
  percentual numeric not null check (percentual > 0 and percentual <= 100),
  primary key (abastecimento_id, centro_custo_id)
);
alter table public.frota_abastecimento_rateios enable row level security;
drop policy if exists frota_abastecimento_rateios_all on public.frota_abastecimento_rateios;
create policy frota_abastecimento_rateios_all on public.frota_abastecimento_rateios for all
  using (exists (select 1 from frota_abastecimentos a where a.id = abastecimento_id and acesso_fazenda(a.fazenda_id)))
  with check (exists (select 1 from frota_abastecimentos a where a.id = abastecimento_id and acesso_fazenda(a.fazenda_id)));

/**
 * Grava o abastecimento (salvar_abastecimento, como sempre) e depois o rateio:
 * sem rateio = centro do veículo (como antes); um centro = tudo nele; vários = percentuais (soma 100%).
 * No posto, a despesa e o contas a pagar acompanham o rateio.
 */
create or replace function public.salvar_abastecimento_rateio(p jsonb)
returns json language plpgsql set search_path to 'public' as $$
declare v_res json; v_id uuid; v_comp uuid; r jsonb; v_soma numeric := 0; v_n int := 0; v_unico uuid; v_faz uuid := nullif(p->>'fazenda_id','')::uuid;
begin
  for r in select * from jsonb_array_elements(coalesce(p->'rateio','[]')) loop
    if nullif(r->>'centro_custo_id','') is null then raise exception 'Escolha o centro de custo de cada linha do rateio.'; end if;
    if coalesce(nullif(r->>'percentual','')::numeric, 0) <= 0 then raise exception 'Percentual do rateio inválido.'; end if;
    if not exists (select 1 from centros_custo where id = (r->>'centro_custo_id')::uuid and fazenda_id is not distinct from v_faz) then
      raise exception 'Há centro de custo de outra fazenda no rateio.';
    end if;
    v_soma := v_soma + (r->>'percentual')::numeric; v_n := v_n + 1; v_unico := (r->>'centro_custo_id')::uuid;
  end loop;
  if v_n > 0 and abs(v_soma - 100) > 0.001 then raise exception 'O rateio entre os centros de custo precisa somar 100%% (soma atual: %).', v_soma; end if;

  v_res := public.salvar_abastecimento(p);
  v_id := (v_res->>'id')::uuid;
  delete from frota_abastecimento_rateios where abastecimento_id = v_id;
  if v_n = 0 then return v_res; end if;
  insert into frota_abastecimento_rateios (abastecimento_id, centro_custo_id, percentual)
    select v_id, (x->>'centro_custo_id')::uuid, sum((x->>'percentual')::numeric) from jsonb_array_elements(p->'rateio') x group by 1, 2;
  select compra_id into v_comp from frota_abastecimentos where id = v_id;
  if v_comp is not null then
    update compras set centro_custo_id = case when v_n = 1 then v_unico end where id = v_comp;
    update lancamentos set centro_custo_id = case when v_n = 1 then v_unico end where compra_id = v_comp;
    delete from compra_rateios where compra_id = v_comp;
    insert into compra_rateios (compra_id, centro_custo_id, percentual)
      select compra_id, centro_custo_id, percentual from (select v_comp as compra_id, centro_custo_id, percentual from frota_abastecimento_rateios where abastecimento_id = v_id) z;
  end if;
  return v_res;
end $$;

-- ---------- 3. Transferências entre fazendas ----------
create table if not exists public.transferencias (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid references public.fazendas(id) on delete cascade,      -- de onde sai
  numero integer,
  para_fazenda_id uuid references public.fazendas(id) on delete cascade, -- para onde vai (em branco = Administrativo)
  data date not null,
  tipo text not null check (tipo in ('estoque', 'bem', 'gado')),
  destino text not null check (destino in ('estoque', 'centro', 'imobilizado', 'lote')),
  centro_custo_id uuid references public.centros_custo(id),
  imobilizado_id uuid references public.imobilizados(id) on delete cascade,
  lote_origem_id uuid references public.lotes(id),
  lote_destino_id uuid references public.lotes(id),
  valor numeric not null default 0,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.transferencia_itens (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references public.transferencias(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id),
  quantidade numeric not null check (quantidade > 0),
  custo_unitario numeric,
  valor numeric not null default 0
);
create table if not exists public.transferencia_animais (
  transferencia_id uuid not null references public.transferencias(id) on delete cascade,
  animal_id uuid not null references public.animais(id) on delete cascade,
  numero_origem integer,
  numero_destino integer,
  primary key (transferencia_id, animal_id)
);
alter table public.estoque_movimentos add column if not exists transferencia_id uuid references public.transferencias(id) on delete cascade;
create index if not exists transferencias_faz_idx on public.transferencias (fazenda_id, data);
create index if not exists transferencias_para_idx on public.transferencias (para_fazenda_id, data);
create index if not exists transferencias_centro_idx on public.transferencias (centro_custo_id) where centro_custo_id is not null;

drop trigger if exists trg_numerar on public.transferencias;
create trigger trg_numerar before insert on public.transferencias for each row execute function public.numerar_generico();

alter table public.transferencias enable row level security;
alter table public.transferencia_itens enable row level security;
alter table public.transferencia_animais enable row level security;
drop policy if exists transferencias_select on public.transferencias;
create policy transferencias_select on public.transferencias for select using (acesso_fazenda(fazenda_id) or acesso_fazenda(para_fazenda_id));
drop policy if exists transferencia_itens_select on public.transferencia_itens;
create policy transferencia_itens_select on public.transferencia_itens for select
  using (exists (select 1 from transferencias t where t.id = transferencia_id and (acesso_fazenda(t.fazenda_id) or acesso_fazenda(t.para_fazenda_id))));
drop policy if exists transferencia_animais_select on public.transferencia_animais;
create policy transferencia_animais_select on public.transferencia_animais for select
  using (exists (select 1 from transferencias t where t.id = transferencia_id and (acesso_fazenda(t.fazenda_id) or acesso_fazenda(t.para_fazenda_id))));

-- a entrada vinda de transferência não é "estoque inicial"
CREATE OR REPLACE FUNCTION public.mov_estoque_inicial(m estoque_movimentos)
 RETURNS boolean LANGUAGE sql IMMUTABLE
AS $function$
  select m.tipo = 'entrada' and m.compra_id is null and m.compra_item_id is null and m.venda_id is null
     and m.atividade_id is null and m.sanidade_id is null and m.sanidade_item_id is null and m.sanidade_reforco_id is null
     and m.frota_abastecimento_id is null and m.frota_manutencao_id is null and m.transferencia_id is null;
$function$;

/** Produtos do estoque para outra fazenda: entram no estoque de lá (pelo custo médio daqui) ou vão direto para um centro de custo de lá. */
create or replace function public.transferir_estoque(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_de uuid := (p->>'fazenda_id')::uuid; v_para uuid := nullif(p->>'para_fazenda_id','')::uuid;
  v_data date := coalesce(nullif(p->>'data','')::date, current_date); v_destino text := coalesce(nullif(p->>'destino',''), 'estoque');
  v_centro uuid := nullif(p->>'centro_custo_id','')::uuid; v_id uuid; v_num int; it jsonb; v_ins insumos%rowtype;
  v_qtd numeric; v_custo numeric; v_total numeric := 0; v_n int := 0; v_desc text; v_nome_para text; v_nome_de text;
begin
  if not acesso_fazenda(v_de) then raise exception 'Sem acesso à fazenda de origem.'; end if;
  if not acesso_fazenda(v_para) then raise exception 'Sem acesso à unidade de destino.'; end if;
  if v_de is not distinct from v_para then raise exception 'A origem e o destino são a mesma fazenda.'; end if;
  if v_data > current_date then raise exception 'A data não pode ser futura.'; end if;
  if v_destino not in ('estoque', 'centro') then raise exception 'Destino inválido.'; end if;
  if v_destino = 'estoque' and (v_para is null or unidade_particular(v_para)) then raise exception 'O estoque só existe nas fazendas: escolha "Direto num centro de custo".'; end if;
  if v_destino = 'centro' then
    if v_centro is null then raise exception 'Escolha o centro de custo de destino.'; end if;
    if not exists (select 1 from centros_custo where id = v_centro and fazenda_id is not distinct from v_para) then raise exception 'O centro de custo escolhido não é da unidade de destino.'; end if;
  end if;
  if jsonb_array_length(coalesce(p->'itens','[]')) = 0 then raise exception 'Informe os produtos e as quantidades.'; end if;
  select nome into v_nome_de from fazendas where id = v_de;
  v_nome_para := coalesce((select nome from fazendas where id = v_para), 'Administrativo');

  insert into transferencias (fazenda_id, para_fazenda_id, data, tipo, destino, centro_custo_id, observacoes)
    values (v_de, v_para, v_data, 'estoque', v_destino, case when v_destino = 'centro' then v_centro end, nullif(trim(p->>'observacoes'),''))
    returning id, numero into v_id, v_num;

  for it in select * from jsonb_array_elements(p->'itens') loop
    select * into v_ins from insumos where id = nullif(it->>'insumo_id','')::uuid;
    if v_ins.id is null then raise exception 'Produto não encontrado.'; end if;
    v_qtd := nullif(it->>'quantidade','')::numeric;
    if coalesce(v_qtd, 0) <= 0 then raise exception 'Informe a quantidade de %.', v_ins.nome; end if;
    v_custo := custo_medio_insumo(v_ins.id, v_de, v_data);
    v_n := v_n + 1;
    insert into transferencia_itens (transferencia_id, insumo_id, quantidade, custo_unitario, valor)
      values (v_id, v_ins.id, v_qtd, v_custo, round(coalesce(v_custo, 0) * v_qtd, 2));
    v_total := v_total + round(coalesce(v_custo, 0) * v_qtd, 2);
    v_desc := 'Transferência nº ' || v_num || ' para ' || v_nome_para;
    insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, valor_unitario, observacoes, transferencia_id)
      values (v_de, v_ins.id, v_data, 'saida', v_qtd, v_custo, v_desc, v_id);
    perform conferir_saldo_insumo(v_de, v_ins.id);
    if v_destino = 'estoque' then
      insert into estoque_movimentos (fazenda_id, insumo_id, data, tipo, quantidade, valor_unitario, observacoes, transferencia_id)
        values (v_para, v_ins.id, v_data, 'entrada', v_qtd, v_custo, 'Transferência nº ' || v_num || ' de ' || v_nome_de, v_id);
    end if;
  end loop;
  update transferencias set valor = v_total where id = v_id;
  return json_build_object('id', v_id, 'numero', v_num, 'itens', v_n, 'valor', v_total);
end $$;

/** Bem do imobilizado para outra fazenda: usa a transferência do bem (o código patrimonial vai junto) e registra aqui. */
create or replace function public.transferir_bem(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare b imobilizados%rowtype; v_res json; v_id uuid; v_num int; v_centro uuid;
begin
  select * into b from imobilizados where id = (p->>'id')::uuid;
  if b.id is null then raise exception 'Bem não encontrado.'; end if;
  if b.situacao = 'formacao' then raise exception 'Bem em formação não se transfere: conclua a formação antes.'; end if;
  v_res := public.transferir_imobilizado(p);
  select centro_custo_id into v_centro from imobilizado_rateios where imobilizado_id = b.id limit 1;
  insert into transferencias (fazenda_id, para_fazenda_id, data, tipo, destino, centro_custo_id, imobilizado_id, valor, observacoes)
    values (b.fazenda_id, nullif(p->>'para_fazenda_id','')::uuid, coalesce(nullif(p->>'data','')::date, current_date), 'bem', 'imobilizado', v_centro, b.id,
            b.valor_aquisicao, nullif(trim(p->>'observacoes'),''))
    returning id, numero into v_id, v_num;
  return json_build_object('id', v_id, 'numero', v_num, 'bem', b.numero, 'codigo', b.codigo_patrimonial);
end $$;

-- movimentações do rebanho: entrada e saída por transferência entre fazendas
alter table public.movimentacoes drop constraint if exists movimentacoes_tipo_check;
alter table public.movimentacoes add constraint movimentacoes_tipo_check check (tipo in ('nascimento', 'compra', 'venda', 'morte', 'entrada_parceria', 'saida_parceria',
  'entrada_confinamento', 'saida_confinamento', 'transferencia_lote', 'transferencia_manga', 'transferencia_saida', 'transferencia_entrada'));
alter table public.movimentacoes add column if not exists transferencia_id uuid references public.transferencias(id) on delete cascade;

/** Gado para outra fazenda: os animais vão para um lote de lá com o mesmo número (se estiver livre), brinco e registro. */
create or replace function public.transferir_gado(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_de uuid := (p->>'fazenda_id')::uuid; v_para uuid := nullif(p->>'para_fazenda_id','')::uuid;
  v_data date := coalesce(nullif(p->>'data','')::date, current_date);
  v_orig uuid := nullif(p->>'lote_origem_id','')::uuid; v_dest uuid := nullif(p->>'lote_destino_id','')::uuid;
  v_qtd int := coalesce(nullif(p->>'quantidade','')::int, 0);
  v_animais uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'animais','[]'))::uuid), '{}');
  v_id uuid; v_num int; v_n int; v_mov_s uuid; v_mov_e uuid; a record; v_novo int; v_trocados int := 0; v_brinco text; v_sexo_lote char(1);
begin
  if not acesso_completo(v_de) or not acesso_completo(v_para) then raise exception 'É preciso acesso completo nas duas fazendas.'; end if;
  if v_para is null or unidade_particular(v_para) then raise exception 'Escolha a fazenda de destino.'; end if;
  if v_de = v_para then raise exception 'A origem e o destino são a mesma fazenda.'; end if;
  if v_data > current_date then raise exception 'A data não pode ser futura.'; end if;
  if not exists (select 1 from lotes where id = v_orig and fazenda_id = v_de) then raise exception 'Escolha o lote de origem.'; end if;
  select sexo into v_sexo_lote from lotes where id = v_dest and fazenda_id = v_para and situacao = 'ativo';
  if not found then raise exception 'Escolha o lote de destino (aberto) na outra fazenda.'; end if;

  if array_length(v_animais, 1) is null then
    if v_qtd < 1 then raise exception 'Informe a quantidade de cabeças ou escolha os animais.'; end if;
    v_animais := array(select id from animais where lote_id = v_orig and situacao = 'ativo' order by (brinco is null) desc, numero_interno desc limit v_qtd);
    if coalesce(array_length(v_animais, 1), 0) < v_qtd then raise exception 'O lote só tem % cabeças.', coalesce(array_length(v_animais, 1), 0); end if;
  else
    select count(*) into v_n from animais where id = any (v_animais) and lote_id = v_orig and situacao = 'ativo';
    if v_n <> array_length(v_animais, 1) then raise exception 'Algum animal escolhido não está mais neste lote.'; end if;
  end if;
  v_n := array_length(v_animais, 1);
  if v_sexo_lote is not null and exists (select 1 from animais where id = any (v_animais) and sexo is distinct from v_sexo_lote) then
    raise exception 'O lote de destino é só de %.', case v_sexo_lote when 'M' then 'machos' else 'fêmeas' end;
  end if;
  select string_agg(a2.brinco, ', ') into v_brinco from animais a2
    where a2.id = any (v_animais) and a2.brinco is not null and exists (select 1 from animais x where x.fazenda_id = v_para and upper(x.brinco) = upper(a2.brinco));
  if v_brinco is not null then raise exception 'Na outra fazenda já há animal com o brinco %.', v_brinco; end if;

  insert into transferencias (fazenda_id, para_fazenda_id, data, tipo, destino, lote_origem_id, lote_destino_id, observacoes)
    values (v_de, v_para, v_data, 'gado', 'lote', v_orig, v_dest, nullif(trim(p->>'observacoes'),''))
    returning id, numero into v_id, v_num;
  insert into movimentacoes (fazenda_id, data, tipo, lote_origem_id, documento, observacoes, transferencia_id)
    values (v_de, v_data, 'transferencia_saida', v_orig, 'Transf. nº ' || v_num, 'Para ' || (select nome from fazendas where id = v_para) || coalesce(' · ' || nullif(trim(p->>'observacoes'),''), ''), v_id)
    returning id into v_mov_s;
  insert into movimentacoes (fazenda_id, data, tipo, lote_destino_id, documento, observacoes, transferencia_id)
    values (v_para, v_data, 'transferencia_entrada', v_dest, 'Transf. nº ' || v_num, 'De ' || (select nome from fazendas where id = v_de) || coalesce(' · ' || nullif(trim(p->>'observacoes'),''), ''), v_id)
    returning id into v_mov_e;
  insert into movimentacao_itens (fazenda_id, movimentacao_id, animal_id, quantidade, sexo, raca_id, ferro_id, peso_kg, lote_original_id)
    select v_de, v_mov_s, x.id, 1, x.sexo, x.raca_id, x.ferro_id, x.peso_atual_kg, x.lote_id from animais x where x.id = any (v_animais);

  for a in select id, numero_interno from animais where id = any (v_animais) order by numero_interno loop
    if exists (select 1 from animais where fazenda_id = v_para and numero_interno = a.numero_interno) then
      update fazendas set animal_ultimo = animal_ultimo + 1 where id = v_para returning animal_ultimo into v_novo;
      v_trocados := v_trocados + 1;
    else
      v_novo := a.numero_interno;
      update fazendas set animal_ultimo = greatest(animal_ultimo, v_novo) where id = v_para;
    end if;
    insert into transferencia_animais (transferencia_id, animal_id, numero_origem, numero_destino) values (v_id, a.id, a.numero_interno, v_novo);
    update animais set fazenda_id = v_para, lote_id = v_dest, numero_interno = v_novo, sexo_diferente_lote = false where id = a.id;
  end loop;
  insert into movimentacao_itens (fazenda_id, movimentacao_id, animal_id, quantidade, sexo, raca_id, ferro_id, peso_kg, lote_original_id)
    select v_para, v_mov_e, x.id, 1, x.sexo, x.raca_id, x.ferro_id, x.peso_atual_kg, v_dest from animais x where x.id = any (v_animais);
  return json_build_object('id', v_id, 'numero', v_num, 'cabecas', v_n, 'renumerados', v_trocados);
end $$;

/** Desfaz uma transferência (lançada por engano). */
create or replace function public.excluir_transferencia(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare t transferencias%rowtype; i record; a record; v_ult int;
begin
  select * into t from transferencias where id = p_id;
  if t.id is null or not acesso_completo(t.fazenda_id) or not acesso_completo(t.para_fazenda_id) then raise exception 'Transferência não encontrada ou sem permissão.'; end if;
  if t.tipo = 'estoque' then
    delete from transferencias where id = p_id;          -- os movimentos de estoque saem junto
    if t.destino = 'estoque' then
      for i in select distinct insumo_id from transferencia_itens where transferencia_id = p_id loop perform conferir_saldo_insumo(t.para_fazenda_id, i.insumo_id); end loop;
    end if;
  elsif t.tipo = 'bem' then
    raise exception 'Para devolver o bem, faça uma nova transferência dele de volta.';
  else
    for a in select ta.*, x.fazenda_id, x.lote_id, x.situacao from transferencia_animais ta join animais x on x.id = ta.animal_id where ta.transferencia_id = p_id loop
      if a.fazenda_id is distinct from t.para_fazenda_id or a.situacao <> 'ativo' then
        raise exception 'Algum animal desta transferência já foi movimentado na outra fazenda (vendido, morto ou transferido): não dá para desfazer.';
      end if;
      if exists (select 1 from animais where fazenda_id = t.fazenda_id and numero_interno = a.numero_origem and id <> a.animal_id) then
        update fazendas set animal_ultimo = animal_ultimo + 1 where id = t.fazenda_id returning animal_ultimo into v_ult;
      else v_ult := a.numero_origem; end if;
      update animais set fazenda_id = t.fazenda_id, lote_id = t.lote_origem_id, numero_interno = v_ult, sexo_diferente_lote = false where id = a.animal_id;
    end loop;
    delete from transferencias where id = p_id;          -- as movimentações saem junto
  end if;
end $$;

-- conferência
select 'V152 ok' as resultado,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('transferencias', 'transferencia_itens', 'transferencia_animais', 'frota_abastecimento_rateios')) as tabelas_novas,
  (select count(*) from pg_proc where proname in ('formacao_centro', 'concluir_formacao', 'reabrir_formacao', 'salvar_abastecimento_rateio', 'transferir_estoque', 'transferir_bem', 'transferir_gado', 'excluir_transferencia')) as funcoes_novas,
  (select position('formacao_centro_id' in pg_get_functiondef('public.salvar_atividade'::regproc)) > 0) as atividade_ajustada;
