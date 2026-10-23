-- =====================================================================
-- Fazenda Digital V131 - banco
-- O GRUPO (produtor) é o tronco; cada fazenda é uma filial.
--  * Caixa, bancos, aplicações, contas a pagar e a receber, financiamentos
--    e imobilizado são do Grupo (aparecem juntos, de qualquer fazenda).
--  * Compras, vendas, custos e despesas continuam marcados pela fazenda
--    (ou pela ADMINISTRAÇÃO, a sede: registro sem fazenda).
--  * Financiamento: a "fazenda" passa a ser a FAZENDA DA DESPESA (juros);
--    nos contratos já lançados fica em branco para você informar.
--  * Bem do imobilizado: do Grupo, alocado numa fazenda; transferência
--    entre fazendas guardada no histórico.
-- Rode inteiro no Supabase › SQL Editor (Run). Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Acesso aos registros do Grupo / Administração (sem fazenda):
--    quem vê o financeiro (dono, administrador, escritório) e o
--    administrador do sistema.
-- ---------------------------------------------------------------------
create or replace function public.acesso_fazenda(fid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.e_admin_sistema()
      or (fid is null and public.ve_financeiro(null))
      or exists (select 1 from public.usuarios_fazenda uf
                  where uf.user_id = auth.uid() and uf.fazenda_id = fid and uf.ativo);
$$;

create or replace function public.acesso_completo(fid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.e_admin_sistema()
      or (fid is null and public.ve_financeiro(null) and public.e_usuario_completo())
      or exists (select 1 from public.usuarios_fazenda uf
                  where uf.user_id = auth.uid() and uf.fazenda_id = fid and uf.ativo and uf.nivel = 'completo');
$$;

-- ---------------------------------------------------------------------
-- 2. Registros que podem ser do Grupo / Administração (fazenda em branco)
-- ---------------------------------------------------------------------
alter table lancamentos            alter column fazenda_id drop not null;
alter table baixas                 alter column fazenda_id drop not null;
alter table recorrencias           alter column fazenda_id drop not null;
alter table financiamentos         alter column fazenda_id drop not null;
alter table financiamento_parcelas alter column fazenda_id drop not null;
alter table imobilizados           alter column fazenda_id drop not null;
alter table compras                alter column fazenda_id drop not null;
alter table compra_itens           alter column fazenda_id drop not null;

-- ---------------------------------------------------------------------
-- 3. Numeração única do Grupo (não mais por fazenda): título nº, compra nº,
--    venda nº, financiamento nº e bem nº não se repetem entre as fazendas.
-- ---------------------------------------------------------------------
create or replace function public.numerar_lancamento()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('lancamentos-grupo-' || new.tipo));
    select coalesce(max(numero), 0) + 1 into new.numero from lancamentos where tipo = new.tipo;
  end if;
  return new;
end $$;

create or replace function public.numerar_compra()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('compras-grupo'));
    select coalesce(max(numero), 0) + 1 into new.numero from public.compras;
  end if;
  return new;
end $$;

create or replace function public.numerar_venda()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('vendas-grupo'));
    select coalesce(max(numero), 0) + 1 into new.numero from public.vendas;
  end if;
  return new;
end $$;

create or replace function public.numerar_imobilizado()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('imobilizados-grupo'));
    select coalesce(max(numero), 0) + 1 into new.numero from public.imobilizados;
  end if;
  return new;
end $$;

create or replace function public.numerar_grupo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v int;
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext(tg_table_name || '-grupo'));
    execute format('select coalesce(max(numero),0)+1 from public.%I', tg_table_name) into v;
    new.numero := v;
  end if;
  return new;
end $$;
drop trigger if exists trg_num_financiamentos on financiamentos;
create trigger trg_num_financiamentos before insert on financiamentos for each row execute function numerar_grupo();

-- Números repetidos entre fazendas (só se houver mais de uma com movimento) ganham número novo, no fim da fila.
do $$
declare r record; v int;
begin
  for r in select id, tipo from (select id, tipo, row_number() over (partition by tipo, numero order by created_at, id) n from lancamentos) x where n > 1 loop
    select coalesce(max(numero), 0) + 1 into v from lancamentos where tipo = r.tipo;
    update lancamentos set numero = v where id = r.id;
  end loop;
  for r in select id from (select id, row_number() over (partition by numero order by created_at, id) n from compras) x where n > 1 loop
    update compras set numero = (select coalesce(max(numero), 0) + 1 from compras) where id = r.id;
  end loop;
  for r in select id from (select id, row_number() over (partition by numero order by created_at, id) n from vendas) x where n > 1 loop
    update vendas set numero = (select coalesce(max(numero), 0) + 1 from vendas) where id = r.id;
  end loop;
  for r in select id from (select id, row_number() over (partition by numero order by created_at, id) n from financiamentos) x where n > 1 loop
    update financiamentos set numero = (select coalesce(max(numero), 0) + 1 from financiamentos) where id = r.id;
  end loop;
  for r in select id from (select id, row_number() over (partition by numero order by created_at, id) n from imobilizados) x where n > 1 loop
    update imobilizados set numero = (select coalesce(max(numero), 0) + 1 from imobilizados) where id = r.id;
  end loop;
end $$;

drop index if exists lancamentos_numero_uq;
create unique index if not exists lancamentos_numero_grupo_uq on lancamentos (tipo, numero);
alter table compras drop constraint if exists compras_fazenda_numero_key;
create unique index if not exists compras_numero_grupo_uq on compras (numero);
drop index if exists compras_chave_nfe_uk;
create unique index if not exists compras_chave_nfe_grupo_uk on compras (chave_nfe) where chave_nfe is not null;
drop index if exists compras_codigo_barras_uk;
create unique index if not exists compras_codigo_barras_grupo_uk on compras (codigo_barras) where codigo_barras is not null;
drop index if exists vendas_fazenda_numero_uq;
create unique index if not exists vendas_numero_grupo_uq on vendas (numero);
alter table financiamentos drop constraint if exists financiamentos_fazenda_id_numero_key;
create unique index if not exists financiamentos_numero_grupo_uq on financiamentos (numero);
alter table imobilizados drop constraint if exists imobilizados_fazenda_id_numero_key;
create unique index if not exists imobilizados_numero_grupo_uq on imobilizados (numero);

-- ---------------------------------------------------------------------
-- 4. O pagamento segue a unidade do título; o título de financiamento
--    segue a fazenda da despesa do contrato.
-- ---------------------------------------------------------------------
create or replace function public.baixas_seguem_titulo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update baixas set fazenda_id = new.fazenda_id where lancamento_id = new.id and fazenda_id is distinct from new.fazenda_id;
  return null;
end $$;
drop trigger if exists trg_baixas_seguem_titulo on lancamentos;
create trigger trg_baixas_seguem_titulo after update of fazenda_id on lancamentos
  for each row when (old.fazenda_id is distinct from new.fazenda_id) execute function baixas_seguem_titulo();

create or replace function public.financiamento_segue_fazenda()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update financiamento_parcelas set fazenda_id = new.fazenda_id where financiamento_id = new.id and fazenda_id is distinct from new.fazenda_id;
  update lancamentos set fazenda_id = new.fazenda_id where financiamento_id = new.id and fazenda_id is distinct from new.fazenda_id;
  return null;
end $$;
drop trigger if exists trg_financiamento_segue_fazenda on financiamentos;
create trigger trg_financiamento_segue_fazenda after update of fazenda_id on financiamentos
  for each row when (old.fazenda_id is distinct from new.fazenda_id) execute function financiamento_segue_fazenda();

-- Informar (ou trocar) a fazenda da despesa de um financiamento, mesmo com parcelas já pagas.
create or replace function public.definir_fazenda_financiamento(p_id uuid, p_fazenda uuid)
returns void language plpgsql set search_path to 'public' as $$
begin
  if not exists (select 1 from financiamentos where id = p_id) or not acesso_completo(null) then
    raise exception 'Financiamento não encontrado ou sem permissão.';
  end if;
  if p_fazenda is not null and not exists (select 1 from fazendas where id = p_fazenda) then raise exception 'Fazenda não encontrada.'; end if;
  update financiamentos set fazenda_id = p_fazenda where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 5. Funções de gravação: aceitam a Administração (sem fazenda), procuram
--    repetidos no Grupo inteiro e deixam mudar a unidade ao alterar.
--    (troca pontual de trechos; se o trecho novo já estiver lá, não mexe)
-- ---------------------------------------------------------------------
do $$
declare
  t text[];
  trocas text[][] := array[
    -- título avulso
    ['salvar_titulo', 'if v_faz is null or not acesso_fazenda(v_faz) then', 'if not acesso_fazenda(v_faz) then'],
    ['salvar_titulo', 'from lancamentos where fazenda_id = v_faz and codigo_barras = v_cb', 'from lancamentos where codigo_barras = v_cb'],
    ['salvar_titulo', 'select * into l from lancamentos where id = v_id and fazenda_id = v_faz;', 'select * into l from lancamentos where id = v_id;'],
    ['salvar_titulo', 'previsto = false where id = v_id;', 'previsto = false, fazenda_id = v_faz where id = v_id;'],
    -- despesa sem estoque
    ['salvar_despesa', 'if v_faz is null or not public.acesso_fazenda(v_faz) then', 'if not public.acesso_fazenda(v_faz) then'],
    ['salvar_despesa', 'from compras where fazenda_id = v_faz and codigo_barras = v_cb', 'from compras where codigo_barras = v_cb'],
    ['salvar_despesa', 'from lancamentos where fazenda_id = v_faz and codigo_barras = v_cb', 'from lancamentos where codigo_barras = v_cb'],
    ['salvar_despesa', 'select * into v_ant from compras where id = v_id and fazenda_id = v_faz;', 'select * into v_ant from compras where id = v_id;'],
    ['salvar_despesa', 'update compras set tipo_despesa = v_chave,', 'update compras set fazenda_id = v_faz, tipo_despesa = v_chave,'],
    -- financiamento (v_faz = fazenda da despesa; em branco = a informar)
    ['salvar_financiamento', 'if v_faz is null or not public.acesso_fazenda(v_faz) then', 'if not public.acesso_completo(null) then'],
    ['salvar_financiamento', 'select numero into v_num from financiamentos where id = v_id and fazenda_id = v_faz;', 'select numero into v_num from financiamentos where id = v_id;'],
    ['salvar_financiamento', 'update financiamentos set parcela_fixa =', 'update financiamentos set fazenda_id = v_faz where id = v_id and fazenda_id is distinct from v_faz;' || chr(10) || '  update financiamentos set parcela_fixa ='],
    -- imobilizado (a alocação muda só pela transferência)
    ['salvar_imobilizado', 'if v_faz is null or not public.acesso_fazenda(v_faz) then', 'if not public.acesso_fazenda(v_faz) then'],
    ['salvar_imobilizado', 'where id = v_id and fazenda_id = v_faz returning numero into v_num;', 'where id = v_id returning numero into v_num;'],
    ['imobilizado_nota_repetida', 'where b.fazenda_id = new.fazenda_id and b.id <> new.id', 'where b.id <> new.id']
  ];
  v_def text;
begin
  foreach t slice 1 in array trocas loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = t[1] limit 1;
    if v_def is null then raise exception 'Função % não encontrada.', t[1]; end if;
    -- já atualizada (o trecho novo está lá e o antigo não, ou o novo contém o antigo)
    if strpos(v_def, t[3]) > 0 and (strpos(v_def, t[2]) = 0 or strpos(t[3], t[2]) > 0) then continue; end if;
    if strpos(v_def, t[2]) = 0 then raise exception 'Trecho não encontrado em %: %', t[1], t[2]; end if;
    execute replace(v_def, t[2], t[3]);
  end loop;
end $$;

-- Relatórios: opção de incluir a Administração (registros sem fazenda).
do $$
declare v_def text;
begin
  if to_regprocedure('public.resultado_caixa(uuid[],date,date)') is not null then
    v_def := pg_get_functiondef('public.resultado_caixa(uuid[],date,date)'::regprocedure);
    v_def := replace(v_def, 'resultado_caixa(p_fazendas uuid[], p_de date, p_ate date)', 'resultado_caixa(p_fazendas uuid[], p_de date, p_ate date, p_adm boolean DEFAULT false)');
    v_def := replace(v_def, 'bx.fazenda_id = any(p_fazendas)', '(bx.fazenda_id = any(p_fazendas) or ((p_adm or ''00000000-0000-0000-0000-000000000000''::uuid = any(p_fazendas)) and bx.fazenda_id is null))');
    if strpos(v_def, 'and bx.fazenda_id is null') = 0 then raise exception 'resultado_caixa: trecho não encontrado.'; end if;
    execute v_def;
    drop function public.resultado_caixa(uuid[], date, date);
  end if;
  if to_regprocedure('public.exportar_contabilidade(uuid[],date,date)') is not null then
    v_def := pg_get_functiondef('public.exportar_contabilidade(uuid[],date,date)'::regprocedure);
    v_def := replace(v_def, 'exportar_contabilidade(p_fazendas uuid[], p_de date, p_ate date)', 'exportar_contabilidade(p_fazendas uuid[], p_de date, p_ate date, p_adm boolean DEFAULT false)');
    -- a Administração vem também pelo código 00000000-... na lista (o arquivo é montado por uma função do servidor)
    v_def := replace(v_def, 'fi.fazenda_id = any(p_fazendas)', '(fi.fazenda_id = any(p_fazendas) or ((p_adm or ''00000000-0000-0000-0000-000000000000''::uuid = any(p_fazendas)) and fi.fazenda_id is null))');
    v_def := replace(v_def, 'l.fazenda_id = any(p_fazendas)', '(l.fazenda_id = any(p_fazendas) or ((p_adm or ''00000000-0000-0000-0000-000000000000''::uuid = any(p_fazendas)) and l.fazenda_id is null))');
    v_def := replace(v_def, 'f.nome as fazenda', 'coalesce(f.nome, ''Grupo / Administração (sede)'') as fazenda');
    if strpos(v_def, 'and l.fazenda_id is null') = 0 then raise exception 'exportar_contabilidade: trecho não encontrado.'; end if;
    execute v_def;
    drop function public.exportar_contabilidade(uuid[], date, date);
  end if;
end $$;

-- Contas contínuas: gera as de todas as unidades a que a pessoa tem acesso (fazendas e Administração).
create or replace function public.gerar_recorrentes(p_fazenda uuid)
returns integer language plpgsql set search_path to 'public' as $$
declare r recorrencias%rowtype; m date; v_venc date; v_comp text; v_id uuid; v_n int := 0; v_ult int;
begin
  for r in select * from recorrencias where ativa and acesso_fazenda(fazenda_id) loop
    m := date_trunc('month', r.inicio)::date;
    while m <= (date_trunc('month', current_date) + interval '1 month')::date and (r.fim is null or m <= r.fim) loop
      v_comp := to_char(m, 'YYYY-MM');
      v_ult := extract(day from (m + interval '1 month - 1 day'))::int;
      v_venc := m + (least(r.dia_vencimento, v_ult) - 1);
      if not exists (select 1 from lancamentos where recorrencia_id = r.id and competencia = v_comp) then
        insert into lancamentos (fazenda_id, tipo, pessoa_id, descricao, documento, conta_contabil_id, conta_bancaria_id, valor,
          data_emissao, data_vencimento, vencimento_original, situacao, parcela, total_parcelas, recorrencia_id, competencia, previsto, created_by)
        values (r.fazenda_id, r.tipo, r.pessoa_id, r.descricao || ' – ' || to_char(m, 'MM/YYYY'), r.documento, r.conta_contabil_id, r.conta_bancaria_id,
          r.valor, least(current_date, v_venc), v_venc, v_venc, 'aberto', 1, 1, r.id, v_comp, true, r.created_by)
        returning id into v_id;
        insert into lancamento_rateios (lancamento_id, centro_custo_id, percentual)
          select v_id, (x->>'centro_custo_id')::uuid, (x->>'percentual')::numeric from jsonb_array_elements(r.rateio) x;
        v_n := v_n + 1;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  return v_n;
end $$;

-- Saldo de todas as contas do Grupo (a fazenda informada não limita mais).
create or replace function public.saldo_contas(p_fazenda uuid)
returns table(id uuid, nome text, tipo text, saldo numeric) language sql stable set search_path to 'public' as $$
  select s.id, s.nome, s.tipo, s.saldo from public.saldos_painel() s order by s.nome;
$$;

-- ---------------------------------------------------------------------
-- 6. Imobilizado: transferência entre fazendas (só muda a alocação)
-- ---------------------------------------------------------------------
create table if not exists imobilizado_alocacoes (
  id uuid primary key default gen_random_uuid(),
  imobilizado_id uuid not null references imobilizados(id) on delete cascade,
  data date not null,
  de_fazenda_id uuid references fazendas(id),
  para_fazenda_id uuid references fazendas(id),
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists imobilizado_alocacoes_bem_idx on imobilizado_alocacoes (imobilizado_id, data);
alter table imobilizado_alocacoes enable row level security;
drop policy if exists imobilizado_alocacoes_select on imobilizado_alocacoes;
create policy imobilizado_alocacoes_select on imobilizado_alocacoes for select using (e_usuario());

create or replace function public.transferir_imobilizado(p jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid := (p->>'id')::uuid;
  v_para uuid := nullif(p->>'para_fazenda_id','')::uuid;
  v_data date := coalesce(nullif(p->>'data','')::date, current_date);
  v_centro uuid := nullif(p->>'centro_custo_id','')::uuid;
  b imobilizados%rowtype;
begin
  select * into b from imobilizados where id = v_id;
  if not found or not acesso_completo(b.fazenda_id) or not acesso_completo(v_para) then
    raise exception 'Bem não encontrado ou sem permissão para transferir.';
  end if;
  if b.situacao <> 'ativo' then raise exception 'Este bem já foi baixado.'; end if;
  if b.fazenda_id is not distinct from v_para then raise exception 'O bem já está alocado nesse lugar.'; end if;
  if v_data > current_date then raise exception 'A data da transferência não pode ser futura.'; end if;
  if v_data < b.data_ativacao then raise exception 'A data da transferência é anterior à ativação do bem.'; end if;
  if v_centro is null then
    select id into v_centro from centros_custo where ativo and centro_pai_id is null and fazenda_id is not distinct from v_para order by codigo limit 1;
  end if;
  if v_centro is null then raise exception 'Escolha o centro de custo do lugar de destino.'; end if;
  if not exists (select 1 from centros_custo where id = v_centro and (fazenda_id is null or fazenda_id is not distinct from v_para)) then
    raise exception 'O centro de custo escolhido é de outra fazenda.';
  end if;
  insert into imobilizado_alocacoes (imobilizado_id, data, de_fazenda_id, para_fazenda_id, observacoes)
  values (v_id, v_data, b.fazenda_id, v_para, nullif(trim(p->>'observacoes'),''));
  update imobilizados set fazenda_id = v_para, area_id = null where id = v_id;
  delete from imobilizado_rateios where imobilizado_id = v_id;
  insert into imobilizado_rateios values (v_id, v_centro, 100);
  return json_build_object('id', v_id, 'numero', b.numero);
end $$;

-- ---------------------------------------------------------------------
-- 7. Dados que já estão no sistema
-- ---------------------------------------------------------------------
-- Caixa, bancos e aplicações: do Grupo.
update contas_bancarias set fazenda_id = null where fazenda_id is not null;
-- Financiamentos: do Grupo; a fazenda da despesa (juros) fica em branco para você informar.
-- (só na primeira vez que este arquivo roda)
do $$
begin
  if not exists (select 1 from pg_class where relname = 'v131_feito') then
    update financiamentos set fazenda_id = null where fazenda_id is not null;
    create table v131_feito (feito_em timestamptz default now());
    insert into v131_feito default values;
    alter table v131_feito enable row level security;
  end if;
end $$;

notify pgrst, 'reload schema';
