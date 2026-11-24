-- Fazenda Digital V204 · banco
-- Parte 1: venda (e outras saídas) pelos brincos sem lote: os animais escolhidos saem do rebanho da fazenda
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.lancar_movimentacao(json)'::regprocedure) into d;
  if position('V204' in d) > 0 then return; end if;
  n := replace(d,
    $a$    if v_tipo in ('venda', 'morte', 'saida_parceria') and v_sexo is not null and nullif(p->>'idade_de', '') is not null then$a$,
    $b$    if v_tipo in ('venda', 'morte', 'saida_parceria') and array_length(v_animais, 1) is not null then
      null; -- V204: animais escolhidos pelo brinco, sem lote (conferidos abaixo: desta fazenda e ativos)
    elsif v_tipo in ('venda', 'morte', 'saida_parceria') and v_sexo is not null and nullif(p->>'idade_de', '') is not null then$b$);
  n := replace(n,
    $a$select count(*) into v_n from animais where id = any (v_animais) and (v_orig is null or lote_id = v_orig) and situacao = 'ativo';$a$,
    $b$select count(*) into v_n from animais where id = any (v_animais) and fazenda_id = v_faz and (v_orig is null or lote_id = v_orig) and situacao = 'ativo';$b$);
  if n = d or position('V204' in n) = 0 or position('fazenda_id = v_faz and (v_orig is null' in n) = 0 then raise exception 'lancar_movimentacao: trecho não encontrado'; end if;
  execute n;
end $$;

-- Parte 2: NF já emitida fora do sistema (nº informado na venda e que não saiu pelo emissor do sistema)
create or replace function public.venda_nf_externa(p_venda uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select nullif(trim(v.numero_documento), '') from vendas v
   where v.id = p_venda and nullif(trim(v.numero_documento), '') is not null
     and not exists (
       select 1 from nfe_notas n
        where n.numero::text = trim(v.numero_documento)
          and (n.venda_id = v.id or n.id in (select nota_id from nfe_nota_vendas where venda_id = v.id)));
$$;

do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.nfe_vendas_juntar(uuid, integer[])'::regprocedure) into d;
  if position('V204' in d) > 0 then return; end if;
  n := replace(d,
    $a$    if v_nf is not null then raise exception 'A venda nº % já tem a NF-e nº % autorizada.', n, v_nf; end if;$a$,
    $b$    if v_nf is not null then raise exception 'A venda nº % já tem a NF-e nº % autorizada.', n, v_nf; end if;
    -- V204: venda lançada com o nº da NF já emitida fora do sistema não gera outra nota
    if public.venda_nf_externa(v.id) is not null then
      raise exception 'A venda nº % foi lançada com a NF nº % já emitida fora do sistema: não se emite outra NF-e para ela.', n, public.venda_nf_externa(v.id);
    end if;$b$);
  if n = d then raise exception 'nfe_vendas_juntar: trecho não encontrado'; end if;
  execute n;
end $$;

-- trava no banco: nenhuma NF-e nova para venda com NF emitida fora
create or replace function public.nfe_bloqueia_nf_externa()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_nf text; v_num int;
begin
  if new.venda_id is null then return new; end if;
  v_nf := public.venda_nf_externa(new.venda_id);
  if v_nf is not null then
    select numero into v_num from vendas where id = new.venda_id;
    raise exception 'A venda nº % foi lançada com a NF nº % já emitida fora do sistema: não se emite outra NF-e para ela.', v_num, v_nf;
  end if;
  return new;
end $$;

drop trigger if exists nfe_bloqueia_nf_externa on public.nfe_notas;
create trigger nfe_bloqueia_nf_externa before insert on public.nfe_notas for each row execute function public.nfe_bloqueia_nf_externa();
drop trigger if exists nfe_bloqueia_nf_externa on public.nfe_nota_vendas;
create trigger nfe_bloqueia_nf_externa before insert on public.nfe_nota_vendas for each row execute function public.nfe_bloqueia_nf_externa();
