-- =====================================================================================
-- Fazenda Digital V168 – Plano de contas espelho e classificação automática
-- JÁ APLICADO DIRETO NO SUPABASE em 29/10/2026. Este arquivo fica como REGISTRO.
-- Pode rodar mais de uma vez: só cria/atualiza tabela de modelo, funções e gatilhos;
-- não apaga nem altera lançamentos.
--
-- O que foi feito UMA VEZ só (fora deste arquivo, com cópia de segurança no esquema backup_v168):
--   * Receitas (3) e Custos (4) com grau 2 de 2 dígitos: 4.01 ... 4.10 = fazendas, 4.50 = Administração (sede).
--   * Grau 3: .01 Agrícola, .02 Pecuária, .10 Operacionais, .20 Financeiras, .50 Outras; .90 Deduções (só receitas).
--   * Mesmas contas de grau 4, com o mesmo código final, em todas as fazendas; .999 "Outros a Classificar" em cada grupo.
--   * Fazenda Desengano duplicada (4.13) e o cadastro "VANESSA PAULA CASSANI" excluídos.
--   * IOF dos financiamentos reclassificado de Tarifas Bancárias para IOF.
-- =====================================================================================

-- ---------- 1. Modelo do plano (o que toda fazenda tem) ----------
create table if not exists public.plano_modelo (
  lado text not null check (lado in ('3','4')),
  sufixo text not null,                       -- '01' (grau 3) ou '01.001' (grau 4)
  nome text not null,
  na_sede boolean not null default true,      -- a Administração (sede) também recebe
  primary key (lado, sufixo)
);
alter table public.plano_modelo enable row level security;
drop policy if exists plano_modelo_ler on public.plano_modelo;
create policy plano_modelo_ler on public.plano_modelo for select to authenticated using (true);

insert into public.plano_modelo (lado, sufixo, nome, na_sede) values
('4','01','AGRÍCOLA',false),
('4','01.001','Adubos e Fertilizantes',false),('4','01.002','Defensivos',false),('4','01.003','Inseticidas e Fungicidas',false),
('4','01.004','Sementes e Mudas',false),('4','01.005','Energia Elétrica',false),('4','01.006','Combustíveis e Lubrificantes',false),
('4','01.007','Manutenção de Tratores, Máquinas e Veículos',false),('4','01.008','Salários e Encargos',false),('4','01.009','INSS e FGTS',false),
('4','01.010','Mão de Obra de Terceiros',false),('4','01.011','Mão de Obra de Colheita',false),('4','01.012','Serviços de Terceiros na Lavoura',false),
('4','01.013','Secagem e Beneficiamento por Terceiros',false),('4','01.099','Outros Custos Agrícolas',false),('4','01.999','Outros a Classificar',false),
('4','02','PECUÁRIA',false),
('4','02.001','Custo Aquisição Gado Bovino de Pasto',false),('4','02.002','Custo Aquisição Gado Bovino para Confinamento',false),
('4','02.003','Sal Mineral e Proteinados',false),('4','02.004','Ração Pronta',false),('4','02.005','Silagem de Milho',false),
('4','02.006','Silagem de Capiaçu',false),('4','02.007','Silagem de Capim',false),('4','02.008','Medicamentos e Vacinas',false),
('4','02.009','Inseminação, Sêmen e Embriões',false),('4','02.010','Adubação de Pastagens',false),('4','02.011','Defensivos de Pastagens',false),
('4','02.012','Recuperação de Cercas',false),('4','02.013','Combustíveis e Lubrificantes',false),('4','02.014','Manutenção de Tratores, Máquinas e Veículos',false),
('4','02.015','Salários e Encargos',false),('4','02.016','INSS e FGTS',false),('4','02.017','Mão de Obra de Terceiros',false),
('4','02.018','Energia Elétrica',false),('4','02.099','Outros Custos da Pecuária',false),('4','02.999','Outros a Classificar',false),
('4','10','DESPESAS OPERACIONAIS',true),
('4','10.001','Salários e Encargos',true),('4','10.002','INSS e FGTS',true),('4','10.003','Energia Elétrica',true),
('4','10.004','Benefícios a Funcionários (Alimentação, Transporte)',true),('4','10.005','Internet, Telefone e Programas',true),
('4','10.006','Honorários (Contador, Advogado, Assessoria Técnica)',true),('4','10.007','Impostos e Taxas (ITR, Licenças)',true),
('4','10.008','Seguros',true),('4','10.009','Manutenção de Benfeitorias e Instalações',true),('4','10.010','Combustíveis de Veículos da Administração',true),
('4','10.011','Manutenção de Veículos da Administração',true),('4','10.012','Fretes sobre Vendas',true),('4','10.013','Comissões, Corretagens e Leilões',true),
('4','10.014','Classificação e Armazenagem de Café',true),('4','10.015','Custos dos Fretes Prestados',true),
('4','10.099','Outras Despesas Operacionais',true),('4','10.999','Outros a Classificar',true),
('4','20','DESPESAS FINANCEIRAS',true),
('4','20.001','Juros',true),('4','20.002','IOF',true),('4','20.003','Despesas com Contratação de Créditos',true),('4','20.004','Tarifas Bancárias',true),('4','20.999','Outros a Classificar',true),
('4','50','OUTRAS DESPESAS',true),
('4','50.001','Custo dos Bens do Imobilizado Vendidos',true),('4','50.002','Perdas e Sinistros',true),('4','50.099','Outras Despesas',true),('4','50.999','Outros a Classificar',true),
('3','01','AGRÍCOLA',false),('3','01.001','Venda de Café',false),('3','01.999','Outros a Classificar',false),
('3','02','PECUÁRIA',false),('3','02.001','Venda de Gado Bovino Empastado',false),('3','02.002','Venda de Gado Bovino Confinado',false),('3','02.003','Venda de Leite',false),('3','02.999','Outros a Classificar',false),
('3','10','RECEITAS OPERACIONAIS',true),('3','10.001','Arrendamento e Aluguel de Pasto',true),('3','10.002','Receita de Fretes Prestados',true),('3','10.099','Outras Receitas Operacionais',true),('3','10.999','Outros a Classificar',true),
('3','20','RECEITAS FINANCEIRAS',true),('3','20.001','Juros Ativos',true),('3','20.002','Rendimentos de Aplicações',true),('3','20.003','Descontos Obtidos',true),('3','20.999','Outros a Classificar',true),
('3','50','OUTRAS RECEITAS',true),('3','50.001','Venda de Bens do Imobilizado',true),('3','50.099','Outras Receitas',true),('3','50.999','Outros a Classificar',true),
('3','90','DEDUÇÕES DAS VENDAS',true),('3','90.001','Vendas Canceladas',false),('3','90.002','ICMS',false),('3','90.003','Funrural',false),('3','90.004','Descontos Concedidos',true)
on conflict (lado, sufixo) do nothing;

-- ---------- 2. Criação de contas ----------
create or replace function public.conta_garantir(p_cod text, p_nome text, p_sistema boolean default true)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; pai plano_contas%rowtype; v_niv int := array_length(string_to_array(p_cod, '.'), 1); v_tipo text; v_nat text;
begin
  select id into v_id from plano_contas where codigo = p_cod;
  if v_id is not null then return v_id; end if;
  select * into pai from plano_contas where codigo = array_to_string((string_to_array(p_cod, '.'))[1:v_niv - 1], '.');
  if pai.id is null then raise exception 'Conta de cima de % não encontrada.', p_cod; end if;
  v_tipo := case when p_cod like '2.3%' then 'patrimonio_liquido' when pai.tipo = 'patrimonio_liquido' then 'patrimonio_liquido'
                 when p_cod like '2%' then 'passivo' else pai.tipo end;
  v_nat := case when p_cod ~ '^3\.[0-9]+\.90' then 'devedora' when v_tipo in ('ativo', 'despesa') then 'devedora' else 'credora' end;
  insert into plano_contas (codigo, nome, tipo, natureza, conta_pai_id, analitica, ativa, fazenda_id, adm, sistema)
    values (p_cod, p_nome, v_tipo, v_nat, pai.id, v_niv >= 4, true, case when v_niv > 2 then pai.fazenda_id end, case when v_niv > 2 then pai.adm else false end, p_sistema)
    returning id into v_id;
  return v_id;
end $function$;

-- fazenda nova nasce com o plano completo do modelo, grau 2 com 2 dígitos
create or replace function public.montar_contas_unidade(p_n integer, p_nome text, p_faz uuid, p_adm boolean)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_nn text := lpad(p_n::text, 2, '0'); r text := '3.' || v_nn; d text := '4.' || v_nn; m record;
begin
  perform public.conta_garantir(r, upper(p_nome));
  perform public.conta_garantir(d, upper(p_nome));
  update plano_contas set fazenda_id = p_faz, adm = p_adm where codigo in (r, d);
  for m in select * from plano_modelo where (not p_adm or na_sede) order by lado, length(sufixo), sufixo loop
    perform public.conta_garantir(m.lado || '.' || v_nn || '.' || m.sufixo, m.nome);
  end loop;
  update plano_contas set fazenda_id = p_faz, adm = p_adm where codigo like r || '.%' or codigo like d || '.%';
end $function$;

create or replace function public.contas_da_fazenda_nova()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_n int;
begin
  if tg_op = 'INSERT' then
    if new.tipo is distinct from 'fazenda' then return new; end if;
    select coalesce(max((string_to_array(codigo, '.'))[2]::int), 0) + 1 into v_n from plano_contas
      where codigo ~ '^[34]\.[0-9]+$' and not coalesce(adm, false);
    if v_n = 50 then v_n := 51; end if;   -- o 50 é da Administração (sede)
    perform public.montar_contas_unidade(v_n, new.nome, new.id, false);
  elsif new.nome is distinct from old.nome then
    update plano_contas set nome = upper(new.nome) where fazenda_id = new.id and codigo ~ '^[34]\.[0-9]+$';
  end if;
  return new;
end $function$;

-- conta de resultado criada pela tela do Plano de contas: herda a fazenda (ou a sede) e a natureza da conta de cima
create or replace function public.trg_conta_herda_unidade()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare pai plano_contas%rowtype;
begin
  if new.conta_pai_id is null or new.codigo !~ '^[34]\.[0-9]+\.' then return new; end if;
  select * into pai from plano_contas where id = new.conta_pai_id;
  if new.fazenda_id is null and pai.fazenda_id is not null then new.fazenda_id := pai.fazenda_id; end if;
  if pai.adm then new.adm := true; end if;
  if new.codigo ~ '^3\.[0-9]+\.90' then new.natureza := 'devedora';
  elsif new.tipo = 'despesa' then new.natureza := 'devedora';
  elsif new.tipo = 'receita' then new.natureza := 'credora'; end if;
  return new;
end $function$;
drop trigger if exists trg_conta_herda_unidade on public.plano_contas;
create trigger trg_conta_herda_unidade before insert on public.plano_contas
  for each row execute function public.trg_conta_herda_unidade();

-- espelho: conta de resultado criada ou renomeada numa unidade vale para todas
create or replace function public.trg_espelhar_conta()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_lado text; v_pref text; v_suf text; v_g3 text; u record; v_pai text;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.codigo !~ '^[34]\.[0-9]{2}\.[0-9]{2}(\.[0-9]{3})?$' then return new; end if;
  v_lado := split_part(new.codigo, '.', 1);
  v_pref := v_lado || '.' || split_part(new.codigo, '.', 2);
  v_suf := substr(new.codigo, length(v_pref) + 2);
  v_g3 := split_part(v_suf, '.', 1);
  if tg_op = 'INSERT' then
    insert into plano_modelo (lado, sufixo, nome, na_sede) values (v_lado, v_suf, new.nome, v_g3 not in ('01','02'))
      on conflict (lado, sufixo) do nothing;
    for u in select codigo, coalesce(adm,false) adm from plano_contas
              where codigo ~ ('^' || v_lado || '\.[0-9]{2}$') and codigo <> v_pref loop
      continue when u.adm and v_g3 in ('01','02');
      if v_suf like '%.%' and not exists (select 1 from plano_contas where codigo = u.codigo || '.' || v_g3) then
        select nome into v_pai from plano_contas where codigo = v_pref || '.' || v_g3;
        perform public.conta_garantir(u.codigo || '.' || v_g3, v_pai, new.sistema);
      end if;
      perform public.conta_garantir(u.codigo || '.' || v_suf, new.nome, new.sistema);
    end loop;
  elsif (new.nome, new.ativa) is distinct from (old.nome, old.ativa) and new.codigo = old.codigo then
    update plano_modelo set nome = new.nome where lado = v_lado and sufixo = v_suf;
    update plano_contas set nome = new.nome, ativa = new.ativa
     where codigo ~ ('^' || v_lado || '\.[0-9]{2}\.' || replace(v_suf, '.', '\.') || '$') and id <> new.id
       and (nome, ativa) is distinct from (new.nome, new.ativa);
  end if;
  return new;
end $function$;
drop trigger if exists trg_espelhar_conta on public.plano_contas;
create trigger trg_espelhar_conta after insert or update of nome, ativa on public.plano_contas
  for each row execute function public.trg_espelhar_conta();

-- ---------- 3. Centros de custo de grau 3 e de grau 4 ----------
-- centro de grau 4: filho do grau 3, código = código da conta, nome "GRUPO › Conta"; o .999 fica oculto
create or replace function public.centro_do_grau4(p_conta uuid)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare c plano_contas%rowtype; g plano_contas%rowtype; v uuid; v_pai uuid; v_nome text; v_ativo boolean;
begin
  select * into c from plano_contas where id = p_conta;
  if c.id is null or c.codigo !~ '^4\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}$' then return null; end if;
  select * into g from plano_contas where codigo = split_part(c.codigo,'.',1)||'.'||split_part(c.codigo,'.',2)||'.'||split_part(c.codigo,'.',3);
  if g.id is null then return null; end if;
  v_pai := public.centro_do_grau3(g.id);
  v_nome := left(g.nome || ' › ' || c.nome, 160);
  v_ativo := c.ativa and g.ativa and c.codigo not like '%.999';
  select id into v from centros_custo where conta_plano_id = c.id;
  if v is null then
    insert into centros_custo (codigo, nome, centro_pai_id, fazenda_id, conta_plano_id, ativo)
      values (c.codigo, v_nome, v_pai, c.fazenda_id, c.id, v_ativo) returning id into v;
  else
    update centros_custo set codigo = c.codigo, nome = v_nome, centro_pai_id = v_pai, fazenda_id = c.fazenda_id, ativo = v_ativo
     where id = v and (codigo, nome, centro_pai_id, fazenda_id, ativo) is distinct from (c.codigo, v_nome, v_pai, c.fazenda_id, v_ativo);
  end if;
  return v;
end $function$;

create or replace function public.trg_centro_plano()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare r record;
begin
  if tg_op = 'DELETE' then
    update centros_custo set ativo = false where conta_plano_id = old.id;
    return old;
  end if;
  if new.codigo ~ '^4\.[0-9]+\.[0-9]+$' then
    perform public.centro_do_grau3(new.id);
    if tg_op = 'UPDATE' then
      for r in select id from plano_contas where conta_pai_id = new.id loop perform public.centro_do_grau4(r.id); end loop;
    end if;
  elsif new.codigo ~ '^4\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}$' then
    perform public.centro_do_grau4(new.id);
  elsif tg_op = 'UPDATE' and new.codigo not like 'x%' then
    update centros_custo set ativo = false where conta_plano_id = new.id;
  end if;
  return new;
end $function$;

-- ---------- 4. Classificação automática ----------
-- conta certa na unidade: mesmo código final; centro de grau 4 = a própria conta; o grupo do centro manda (destino); senão .999
create or replace function public.conta_na_unidade(p_conta uuid, p_faz uuid, p_centro uuid)
 returns uuid language plpgsql stable security definer set search_path to 'public' as $function$
declare c plano_contas%rowtype; v_lado text; g text; v_suf text; v_g3 text; v_cg3 text; v_cc text; v_id uuid;
begin
  if p_conta is null then return null; end if;
  select * into c from plano_contas where id = p_conta;
  if c.id is null or c.tipo not in ('receita', 'despesa') or c.codigo !~ '^[34]\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}$' then return p_conta; end if;
  if p_faz is not null and public.unidade_particular(p_faz) then return p_conta; end if;
  v_lado := split_part(c.codigo, '.', 1);
  select codigo into g from plano_contas
   where codigo ~ ('^' || v_lado || '\.[0-9]{2}$') and case when p_faz is null then coalesce(adm,false) else fazenda_id = p_faz end
   order by codigo limit 1;
  if g is null then return p_conta; end if;
  v_suf := split_part(c.codigo, '.', 3) || '.' || split_part(c.codigo, '.', 4);
  v_g3 := split_part(c.codigo, '.', 3);
  if v_lado = '4' and p_centro is not null then
    select coalesce(pc.codigo, pp.codigo) into v_cc
      from centros_custo cc
      left join plano_contas pc on pc.id = cc.conta_plano_id
      left join centros_custo pai on pai.id = cc.centro_pai_id
      left join plano_contas pp on pp.id = pai.conta_plano_id
     where cc.id = p_centro;
    if v_cc ~ '^4\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}$' and v_cc like g || '.%' and v_cc not like '%.999' then
      select id into v_id from plano_contas where codigo = v_cc and ativa;
      if v_id is not null then return v_id; end if;
    end if;
    v_cg3 := split_part(v_cc, '.', 3);
    if nullif(v_cg3, '') is not null and v_cg3 <> v_g3 then
      select id into v_id from plano_contas
       where codigo like g || '.' || v_cg3 || '.%' and analitica and ativa and lower(trim(nome)) = lower(trim(c.nome))
       order by codigo limit 1;
      if v_id is null then select id into v_id from plano_contas where codigo = g || '.' || v_cg3 || '.999'; end if;
      if v_id is not null then return v_id; end if;
    end if;
  end if;
  select id into v_id from plano_contas where codigo = g || '.' || v_suf and analitica and ativa;
  if v_id is null then select id into v_id from plano_contas where codigo = g || '.' || v_g3 || '.999'; end if;
  if v_id is null then select id into v_id from plano_contas where codigo = g || '.10.999'; end if;
  return coalesce(v_id, p_conta);
end $function$;
create or replace function public.conta_na_unidade(p_conta uuid, p_faz uuid)
 returns uuid language sql stable security definer set search_path to 'public' as $function$ select public.conta_na_unidade(p_conta, p_faz, null::uuid) $function$;

create or replace function public.ajustar_conta_unidade()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.conta_contabil_id is not null then
    new.conta_contabil_id := public.conta_na_unidade(new.conta_contabil_id, new.fazenda_id, nullif(to_jsonb(new)->>'centro_custo_id','')::uuid);
  end if;
  return new;
end $function$;
drop trigger if exists trg_classificar_lancamento_unidade on public.lancamentos;
create trigger trg_classificar_lancamento_unidade before insert or update of conta_contabil_id, fazenda_id, centro_custo_id on public.lancamentos
  for each row execute function public.ajustar_conta_unidade();
drop trigger if exists trg_conta_unidade on public.compras;
create trigger trg_conta_unidade before insert or update of conta_contabil_id, fazenda_id, centro_custo_id on public.compras
  for each row execute function public.ajustar_conta_unidade();
drop trigger if exists trg_conta_unidade on public.vendas;
create trigger trg_conta_unidade before insert or update of conta_contabil_id, fazenda_id, centro_custo_id on public.vendas
  for each row execute function public.ajustar_conta_unidade();

-- consumo do estoque: grau 4 pela categoria do produto e grau 3 pelo centro (destino)
create or replace function public.conta_do_insumo(p_insumo uuid, p_centro uuid)
 returns uuid language plpgsql stable security definer set search_path to 'public' as $function$
declare v_cat text; v_classe text; v_cod text; v_pref text; v_g3 text; v_s4 text; v_id uuid;
begin
  select lower(coalesce(categoria,'')), coalesce(atributos->>'classe','') into v_cat, v_classe from insumos where id = p_insumo;
  select coalesce(pc.codigo, pp.codigo) into v_cod
    from centros_custo cc
    left join plano_contas pc on pc.id = cc.conta_plano_id
    left join centros_custo pai on pai.id = cc.centro_pai_id
    left join plano_contas pp on pp.id = pai.conta_plano_id
   where cc.id = p_centro;
  if v_cod ~ '^4\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}$' and v_cod not like '%.999' then
    select id into v_id from plano_contas where codigo = v_cod and ativa;
    if v_id is not null then return v_id; end if;
  end if;
  if v_cod is null or v_cod !~ '^4\.[0-9]{2}\.[0-9]{2}' then return null; end if;
  v_pref := split_part(v_cod,'.',1) || '.' || split_part(v_cod,'.',2);
  v_g3 := split_part(v_cod,'.',3);
  v_s4 := case
    when v_cat in ('fertilizante','adubo','corretivo') then case v_g3 when '01' then '001' when '02' then '010' end
    when v_cat = 'defensivo' then case v_g3 when '01' then case when v_classe ~* 'inset|fung' then '003' else '002' end when '02' then '011' end
    when v_cat = 'semente' then case v_g3 when '01' then '004' end
    when v_cat = 'combustivel' then case v_g3 when '01' then '006' when '02' then '013' when '10' then '010' end
    when v_cat = 'peca' then case v_g3 when '01' then '007' when '02' then '014' when '10' then '011' end
    when v_cat = 'racao' then case v_g3 when '02' then '004' end
    when v_cat in ('sal_mineral','sal','proteinado','suplemento') then case v_g3 when '02' then '003' end
    when v_cat in ('medicamento','vacina') then case v_g3 when '02' then '008' end
    when v_cat in ('semen','embriao') then case v_g3 when '02' then '009' end
  end;
  select id into v_id from plano_contas where codigo = v_pref || '.' || v_g3 || '.' || coalesce(v_s4, '999') and ativa;
  if v_id is null then select id into v_id from plano_contas where codigo = v_pref || '.' || v_g3 || '.999'; end if;
  return v_id;
end $function$;

create or replace function public.conta_a_classificar(p_faz uuid)
 returns uuid language sql stable security definer set search_path to 'public' as $function$
  select x.id from plano_contas g join plano_contas x on x.codigo = g.codigo || '.10.999'
   where g.codigo ~ '^4\.[0-9]{2}$' and case when p_faz is null then coalesce(g.adm,false) else g.fazenda_id = p_faz end
   order by g.codigo limit 1 $function$;

-- consumos do estoque já classificados (atividades e abastecimentos), para os relatórios
create or replace view public.v_consumos_classificados with (security_invoker = true) as
select em.id movimento_id, em.data, em.fazenda_id, em.insumo_id, aa.centro_custo_id,
       coalesce(public.conta_do_insumo(em.insumo_id, aa.centro_custo_id), public.conta_a_classificar(em.fazenda_id)) conta_id,
       round(em.quantidade * em.valor_unitario * coalesce(aa.percentual,100) / 100 * case when em.tipo = 'entrada' then -1 else 1 end, 2) valor,
       'atividade'::text origem, em.atividade_id origem_id
  from estoque_movimentos em join atividade_areas aa on aa.atividade_id = em.atividade_id
 where em.atividade_id is not null
union all
select em.id, em.data, em.fazenda_id, em.insumo_id, coalesce(r.centro_custo_id, v.centro_custo_id),
       coalesce(public.conta_do_insumo(em.insumo_id, coalesce(r.centro_custo_id, v.centro_custo_id)), public.conta_a_classificar(em.fazenda_id)),
       round(em.quantidade * em.valor_unitario * coalesce(r.percentual,100) / 100, 2),
       'abastecimento', em.frota_abastecimento_id
  from estoque_movimentos em
  join frota_abastecimentos fa on fa.id = em.frota_abastecimento_id
  left join frota_veiculos v on v.id = fa.veiculo_id
  left join frota_abastecimento_rateios r on r.abastecimento_id = fa.id
 where em.frota_abastecimento_id is not null and em.tipo = 'saida';

-- ---------- 5. Financiamento: IOF e despesas de contratação cada um na sua conta ----------
-- (a função salvar_financiamento foi ajustada direto no Supabase: lança um título para o IOF, tipo 'iof',
--  e outro para as despesas de contratação, tipo 'desp_contratacao', no lugar de um só em Tarifas Bancárias)
insert into tipos_lancamento (chave, nome, uso, conta_id, ordem, ativo, padrao)
select 'iof', 'IOF de financiamento', 'sistema', (select id from plano_contas where codigo = '4.01.20.002'), 990, true, true
where not exists (select 1 from tipos_lancamento where chave = 'iof') and exists (select 1 from plano_contas where codigo = '4.01.20.002');
insert into tipos_lancamento (chave, nome, uso, conta_id, ordem, ativo, padrao)
select 'desp_contratacao', 'Despesas de contratação de crédito', 'sistema', (select id from plano_contas where codigo = '4.01.20.003'), 991, true, true
where not exists (select 1 from tipos_lancamento where chave = 'desp_contratacao') and exists (select 1 from plano_contas where codigo = '4.01.20.003');

select 'V168 ok | contas do modelo: ' || (select count(*) from public.plano_modelo)
  || ' | unidades (4.NN): ' || (select count(*) from public.plano_contas where codigo ~ '^4\.[0-9]{2}$')
  || ' | centros de grau 4: ' || (select count(*) from public.centros_custo where codigo ~ '^4\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}$');
