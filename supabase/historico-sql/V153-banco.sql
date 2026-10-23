-- =====================================================================================
-- Fazenda Digital V153 - banco: CONCILIAÇÃO BANCÁRIA (Financeiro › Conciliação bancária)
--  O extrato do banco (arquivo OFX do internet banking, foto, PDF ou planilha Excel/CSV) é
--  guardado linha a linha e casado com os pagamentos e recebimentos do sistema na mesma conta.
--  O que não bater fica pendente, com as opções: dar baixa num título em aberto, lançar como
--  despesa ou receita (Grupo/Administrativo, Fazenda ou Particular com o sócio), parear à mão
--  ou ignorar.
-- Não apaga nem altera dados existentes. Pode rodar mais de uma vez.
-- Se ainda não rodou o banco da V152, rode-o ANTES.
-- =====================================================================================

create table if not exists public.extratos_bancarios (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.contas_bancarias(id) on delete cascade,
  de date,
  ate date,
  saldo_inicial numeric,
  saldo_final numeric,
  origem text not null check (origem in ('ofx', 'foto', 'pdf', 'planilha')),
  arquivo text,
  nome_arquivo text,
  linhas integer not null default 0,
  repetidas integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.extrato_linhas (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_bancarios(id) on delete cascade,
  conta_bancaria_id uuid not null references public.contas_bancarias(id) on delete cascade,
  data date not null,
  valor numeric not null check (valor <> 0),          -- + entrou na conta, - saiu
  descricao text,
  documento text,
  id_banco text not null,                              -- FITID do OFX ou a "impressão digital" da linha
  situacao text not null default 'pendente' check (situacao in ('pendente', 'conciliado', 'ignorado')),
  baixa_id uuid references public.baixas(id) on delete set null,
  como text,                                           -- automatico, manual, baixa, lancado
  conciliado_por uuid,
  conciliado_em timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists extrato_linhas_banco_uk on public.extrato_linhas (conta_bancaria_id, id_banco);
create unique index if not exists extrato_linhas_baixa_uk on public.extrato_linhas (baixa_id) where baixa_id is not null;
create index if not exists extrato_linhas_conta_idx on public.extrato_linhas (conta_bancaria_id, situacao, data);

-- baixa estornada: a linha do extrato volta a ficar pendente
create or replace function public.trg_extrato_baixa_estornada()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.situacao in ('estornada', 'rejeitada') and old.situacao is distinct from new.situacao then
    update extrato_linhas set situacao = 'pendente', baixa_id = null, como = null, conciliado_por = null, conciliado_em = null where baixa_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_extrato_baixa_estornada on public.baixas;
create trigger trg_extrato_baixa_estornada after update of situacao on public.baixas for each row execute function public.trg_extrato_baixa_estornada();

alter table public.extratos_bancarios enable row level security;
alter table public.extrato_linhas enable row level security;
drop policy if exists extratos_bancarios_select on public.extratos_bancarios;
create policy extratos_bancarios_select on public.extratos_bancarios for select using (ve_financeiro(null) or e_admin_sistema());
drop policy if exists extrato_linhas_select on public.extrato_linhas;
create policy extrato_linhas_select on public.extrato_linhas for select using (ve_financeiro(null) or e_admin_sistema());

create or replace function public.conciliacao_permitida()
returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (e_admin_sistema() or ve_financeiro(null)) then raise exception 'Só quem vê o Financeiro faz a conciliação bancária.'; end if;
end $$;

/**
 * Guarda o extrato importado. Linha que já estava guardada (mesmo FITID / mesma impressão digital) não entra de novo.
 * p: {conta_bancaria_id, de, ate, saldo_inicial, saldo_final, origem, arquivo, nome_arquivo,
 *     linhas: [{data, valor, descricao, documento, id_banco}]}
 */
create or replace function public.importar_extrato(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_conta uuid := (p->>'conta_bancaria_id')::uuid; v_id uuid; x jsonb; v_novas int := 0; v_rep int := 0; v_val numeric;
begin
  perform conciliacao_permitida();
  if not exists (select 1 from contas_bancarias where id = v_conta) then raise exception 'Escolha a conta do banco.'; end if;
  if jsonb_array_length(coalesce(p->'linhas', '[]')) = 0 then raise exception 'O extrato não trouxe nenhum lançamento.'; end if;
  insert into extratos_bancarios (conta_bancaria_id, de, ate, saldo_inicial, saldo_final, origem, arquivo, nome_arquivo)
    values (v_conta, nullif(p->>'de','')::date, nullif(p->>'ate','')::date, nullif(p->>'saldo_inicial','')::numeric, nullif(p->>'saldo_final','')::numeric,
            coalesce(nullif(p->>'origem',''), 'ofx'), nullif(p->>'arquivo',''), nullif(p->>'nome_arquivo',''))
    returning id into v_id;
  for x in select * from jsonb_array_elements(p->'linhas') loop
    v_val := round(nullif(x->>'valor','')::numeric, 2);
    if v_val is null or v_val = 0 or nullif(x->>'data','') is null or nullif(x->>'id_banco','') is null then continue; end if;
    insert into extrato_linhas (extrato_id, conta_bancaria_id, data, valor, descricao, documento, id_banco)
      values (v_id, v_conta, (x->>'data')::date, v_val, nullif(trim(x->>'descricao'),''), nullif(trim(x->>'documento'),''), x->>'id_banco')
      on conflict (conta_bancaria_id, id_banco) do nothing;
    if found then v_novas := v_novas + 1; else v_rep := v_rep + 1; end if;
  end loop;
  update extratos_bancarios set linhas = v_novas, repetidas = v_rep where id = v_id;
  if v_novas = 0 then delete from extratos_bancarios where id = v_id; v_id := null; end if;
  return json_build_object('id', v_id, 'novas', v_novas, 'repetidas', v_rep);
end $$;

/** Casa uma linha do extrato com um pagamento/recebimento do sistema (mesma conta, mesmo sentido). */
create or replace function public.conciliar_parear(p_linha uuid, p_baixa uuid, p_como text default 'manual')
returns void language plpgsql security definer set search_path to 'public' as $$
declare li extrato_linhas%rowtype; b baixas%rowtype; v_tipo text;
begin
  perform conciliacao_permitida();
  select * into li from extrato_linhas where id = p_linha;
  if li.id is null then raise exception 'Linha do extrato não encontrada.'; end if;
  if li.situacao = 'conciliado' then raise exception 'Esta linha do extrato já está conciliada.'; end if;
  select * into b from baixas where id = p_baixa;
  if b.id is null or b.situacao <> 'confirmada' then raise exception 'Pagamento/recebimento não encontrado (ou ainda não confirmado).'; end if;
  if b.conta_bancaria_id is distinct from li.conta_bancaria_id then raise exception 'Este pagamento foi lançado em outra conta.'; end if;
  select tipo into v_tipo from lancamentos where id = b.lancamento_id;
  if (v_tipo = 'receber') <> (li.valor > 0) then raise exception 'Sentidos diferentes: um é entrada e o outro é saída.'; end if;
  if exists (select 1 from extrato_linhas where baixa_id = p_baixa) then raise exception 'Este pagamento já está casado com outra linha do extrato.'; end if;
  update extrato_linhas set situacao = 'conciliado', baixa_id = p_baixa, como = coalesce(p_como, 'manual'), conciliado_por = auth.uid(), conciliado_em = now() where id = p_linha;
end $$;

/**
 * Encontro automático: para cada linha pendente do extrato, procura na mesma conta um pagamento/recebimento
 * confirmado, do mesmo sentido e do MESMO valor, ainda sem par, com data até p_dias dias de diferença
 * (o mais próximo da data do banco). Devolve quantos pares fez.
 */
create or replace function public.conciliar_automatico(p_conta uuid, p_dias int default 5)
returns int language plpgsql security definer set search_path to 'public' as $$
declare li record; v_baixa uuid; v_n int := 0;
begin
  perform conciliacao_permitida();
  for li in select * from extrato_linhas where conta_bancaria_id = p_conta and situacao = 'pendente' order by data, abs(valor) loop
    select b.id into v_baixa
      from baixas b join lancamentos l on l.id = b.lancamento_id
     where b.conta_bancaria_id = p_conta and b.situacao = 'confirmada'
       and (l.tipo = 'receber') = (li.valor > 0)
       and abs(coalesce(b.valor_pago, 0) - abs(li.valor)) < 0.005
       and abs(b.data - li.data) <= p_dias
       and not exists (select 1 from extrato_linhas x where x.baixa_id = b.id)
     order by abs(b.data - li.data), b.created_at
     limit 1;
    if v_baixa is not null then
      update extrato_linhas set situacao = 'conciliado', baixa_id = v_baixa, como = 'automatico', conciliado_por = auth.uid(), conciliado_em = now() where id = li.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

/** Desfaz o par (ou volta uma linha ignorada para pendente). */
create or replace function public.conciliar_desfazer(p_linha uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform conciliacao_permitida();
  update extrato_linhas set situacao = 'pendente', baixa_id = null, como = null, conciliado_por = null, conciliado_em = null where id = p_linha;
end $$;

create or replace function public.conciliar_ignorar(p_linha uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform conciliacao_permitida();
  update extrato_linhas set situacao = 'ignorado', baixa_id = null, como = 'ignorado', conciliado_por = auth.uid(), conciliado_em = now() where id = p_linha and situacao = 'pendente';
end $$;

/** Dá baixa num título em aberto com o valor da linha do extrato (o que passar do saldo do título vira juros/multa). */
create or replace function public.conciliar_baixar(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare li extrato_linhas%rowtype; l lancamentos%rowtype; v_saldo numeric; v_val numeric; v_res json;
begin
  perform conciliacao_permitida();
  select * into li from extrato_linhas where id = (p->>'linha_id')::uuid;
  if li.id is null or li.situacao <> 'pendente' then raise exception 'Linha do extrato não encontrada ou já resolvida.'; end if;
  select * into l from lancamentos where id = (p->>'lancamento_id')::uuid;
  if l.id is null then raise exception 'Título não encontrado.'; end if;
  if (l.tipo = 'receber') <> (li.valor > 0) then raise exception 'Entrada no banco só baixa conta a receber; saída só baixa conta a pagar.'; end if;
  v_saldo := l.valor - coalesce(l.valor_pago, 0);
  v_val := abs(li.valor);
  v_res := baixar_titulo(jsonb_build_object(
    'lancamento_id', l.id, 'data', li.data, 'conta_bancaria_id', li.conta_bancaria_id,
    'valor_principal', least(v_val, v_saldo),
    'juros', greatest(v_val - v_saldo, 0),
    'multa', 0,
    'desconto', 0,
    'observacoes', 'Conciliação bancária: ' || coalesce(li.descricao, '')));
  -- a baixa pode ficar aguardando a confirmação do dono: a linha já fica casada (se for rejeitada, volta a pendente)
  update extrato_linhas set situacao = 'conciliado', baixa_id = (v_res->>'id')::uuid, como = 'baixa', conciliado_por = auth.uid(), conciliado_em = now() where id = li.id;
  return json_build_object('baixa_id', v_res->>'id', 'situacao', v_res->>'situacao', 'numero', l.numero);
end $$;

/**
 * Lança como despesa ou receita e já dá a baixa na data e no valor do extrato.
 * p: {linha_id, fazenda_id (em branco = Administrativo/Grupo), conta_contabil_id, centro_custo_id (no Particular: o sócio),
 *     pessoa_id, descricao, documento}
 */
create or replace function public.conciliar_lancar(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare li extrato_linhas%rowtype; v_faz uuid := nullif(p->>'fazenda_id','')::uuid; v_tipo text; v_lanc uuid; v_num int; v_res json; v_centro uuid := nullif(p->>'centro_custo_id','')::uuid;
begin
  perform conciliacao_permitida();
  select * into li from extrato_linhas where id = (p->>'linha_id')::uuid;
  if li.id is null or li.situacao <> 'pendente' then raise exception 'Linha do extrato não encontrada ou já resolvida.'; end if;
  if not acesso_fazenda(v_faz) then raise exception 'Sem acesso a esta unidade.'; end if;
  if nullif(p->>'conta_contabil_id','') is null then raise exception 'Escolha o que é (o tipo da despesa ou da receita).'; end if;
  if unidade_particular(v_faz) and v_centro is null then raise exception 'Diga de qual sócio é.'; end if;
  if v_centro is not null and not exists (select 1 from centros_custo where id = v_centro and fazenda_id is not distinct from v_faz) then
    raise exception 'O centro de custo (ou o sócio) não é desta unidade.';
  end if;
  v_tipo := case when li.valor > 0 then 'receber' else 'pagar' end;
  insert into lancamentos (fazenda_id, tipo, pessoa_id, descricao, documento, conta_contabil_id, centro_custo_id, conta_bancaria_id, valor,
                           data_emissao, data_vencimento, situacao, parcela, total_parcelas, observacoes)
    values (v_faz, v_tipo, nullif(p->>'pessoa_id','')::uuid, coalesce(nullif(trim(p->>'descricao'),''), li.descricao, 'Lançado pela conciliação bancária'),
            coalesce(nullif(trim(p->>'documento'),''), li.documento), (p->>'conta_contabil_id')::uuid, v_centro, li.conta_bancaria_id, abs(li.valor),
            li.data, li.data, 'aberto', 1, 1, 'Lançado pela conciliação bancária')
    returning id, numero into v_lanc, v_num;
  if v_centro is not null then
    insert into lancamento_rateios (lancamento_id, centro_custo_id, percentual) values (v_lanc, v_centro, 100) on conflict do nothing;
  end if;
  v_res := baixar_titulo(jsonb_build_object('lancamento_id', v_lanc, 'data', li.data, 'conta_bancaria_id', li.conta_bancaria_id,
                                            'valor_principal', abs(li.valor), 'observacoes', 'Conciliação bancária: ' || coalesce(li.descricao, '')));
  update extrato_linhas set situacao = 'conciliado', baixa_id = (v_res->>'id')::uuid, como = 'lancado', conciliado_por = auth.uid(), conciliado_em = now() where id = li.id;
  return json_build_object('lancamento_id', v_lanc, 'numero', v_num, 'situacao', v_res->>'situacao', 'tipo', v_tipo);
end $$;

/** Exclui um extrato importado por engano (as linhas saem junto; os pagamentos do sistema ficam como estão). */
create or replace function public.excluir_extrato(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform conciliacao_permitida();
  delete from extratos_bancarios where id = p_id;
end $$;

-- conferência
select 'V153 ok' as resultado,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('extratos_bancarios', 'extrato_linhas')) as tabelas_novas,
  (select count(*) from pg_proc where proname in ('importar_extrato', 'conciliar_parear', 'conciliar_desfazer', 'conciliar_ignorar', 'conciliar_baixar', 'conciliar_lancar', 'excluir_extrato', 'conciliar_automatico')) as funcoes_novas;
