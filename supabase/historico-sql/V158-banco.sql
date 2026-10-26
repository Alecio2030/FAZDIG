-- V158: venda de gado sem lote e sem pesagem: sai do rebanho da fazenda pela quantidade, sexo e faixa de idade.
-- Não apaga nem altera dados. Pode rodar mais de uma vez.

/** Idade em meses completos numa data. */
create or replace function public.idade_meses(p_nasc date, p_em date default current_date)
returns integer language sql immutable as $$
  select case when p_nasc is null then null
              else (extract(year from age(p_em, p_nasc)) * 12 + extract(month from age(p_em, p_nasc)))::int end;
$$;

/** Estoque de gado da fazenda por sexo e faixa de idade (as faixas usadas na GTA e nas declarações de rebanho). */
create or replace function public.estoque_gado_faixas(p_fazenda uuid)
returns table (sexo char(1), faixa text, idade_de integer, idade_ate integer, cabecas integer)
language sql stable security definer set search_path to 'public' as $$
  with f(faixa, de, ate, ordem) as (values ('0 a 12 meses', 0, 12, 1), ('13 a 24 meses', 13, 24, 2), ('25 a 36 meses', 25, 36, 3), ('acima de 36 meses', 37, null::int, 4))
  select a.sexo, f.faixa, f.de, f.ate, count(*)::int
    from animais a
    join f on public.idade_meses(a.data_nascimento) >= f.de and (f.ate is null or public.idade_meses(a.data_nascimento) <= f.ate)
   where a.fazenda_id = p_fazenda and a.situacao = 'ativo' and a.data_nascimento is not null and public.acesso_fazenda(p_fazenda)
   group by a.sexo, f.faixa, f.de, f.ate, f.ordem
   order by a.sexo, f.ordem;
$$;
revoke execute on function public.estoque_gado_faixas(uuid) from public, anon;
grant execute on function public.estoque_gado_faixas(uuid) to authenticated;

-- saída (venda, morte, saída de parceria) pode não ter lote: vem do rebanho da fazenda pelo sexo e faixa de idade
alter table public.movimentacoes drop constraint if exists mov_tem_lote;
alter table public.movimentacoes add constraint mov_tem_lote check (lote_origem_id is not null or lote_destino_id is not null or tipo in ('venda', 'morte', 'saida_parceria'));

-- lancar_movimentacao: nas saídas (venda, morte, saída de parceria) sem lote, tira do rebanho da fazenda pelo sexo e faixa de idade
do $$
declare d text; novo text;
begin
  d := pg_get_functiondef('public.lancar_movimentacao(json)'::regprocedure);
  if position('idade_de' in d) > 0 then return; end if; -- já atualizada
  novo := replace(d,
$a$  if v_orig is null then raise exception 'Escolha o lote de origem.'; end if;
  if not exists (select 1 from lotes where id = v_orig and fazenda_id = v_faz) then raise exception 'Lote de origem não encontrado.'; end if;$a$,
$b$  if v_orig is null then
    -- V158: sem lote, a saída vem do rebanho da fazenda pelo sexo e pela faixa de idade
    if v_tipo in ('venda', 'morte', 'saida_parceria') and v_sexo is not null and nullif(p->>'idade_de', '') is not null then
      if v_qtd < 1 then raise exception 'Informe a quantidade de cabeças.'; end if;
      v_animais := array(
        select id from animais
         where fazenda_id = v_faz and situacao = 'ativo' and sexo = v_sexo and data_nascimento is not null
           and public.idade_meses(data_nascimento, v_data) >= (p->>'idade_de')::int
           and public.idade_meses(data_nascimento, v_data) <= coalesce(nullif(p->>'idade_ate', '')::int, 99999)
         order by (brinco is null) desc, numero_interno desc limit v_qtd);
      if coalesce(array_length(v_animais, 1), 0) < v_qtd then
        raise exception 'No rebanho desta fazenda há % % nessa faixa de idade, e a saída é de %. Confira o estoque ou lance a entrada dos animais antes.',
          coalesce(array_length(v_animais, 1), 0), case v_sexo when 'M' then 'machos' else 'fêmeas' end, v_qtd;
      end if;
    else
      raise exception 'Escolha o lote de origem (ou informe o sexo e a faixa de idade).';
    end if;
  elsif not exists (select 1 from lotes where id = v_orig and fazenda_id = v_faz) then raise exception 'Lote de origem não encontrado.'; end if;$b$);
  novo := replace(novo,
    $a$select count(*) into v_n from animais where id = any (v_animais) and lote_id = v_orig and situacao = 'ativo';$a$,
    $b$select count(*) into v_n from animais where id = any (v_animais) and (v_orig is null or lote_id = v_orig) and situacao = 'ativo';$b$);
  if novo = d or position('idade_de' in novo) = 0 or position('v_orig is null or lote_id' in novo) = 0 then
    raise exception 'V158: não foi possível atualizar lancar_movimentacao (texto da função diferente do esperado).';
  end if;
  execute novo;
end $$;

-- salvar_venda: passa o sexo e a faixa de idade e aceita a venda sem lote
do $$
declare d text; novo text;
begin
  d := pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure);
  if position('idade_de' in d) > 0 then return; end if; -- já atualizada
  novo := replace(d,
    $a$'peso_total', v_bruto_kg, 'pessoa', p->>'pessoa_id',$a$,
    $b$'peso_total', v_bruto_kg, 'sexo', a->>'sexo', 'idade_de', a->>'idade_de', 'idade_ate', a->>'idade_ate', 'pessoa', p->>'pessoa_id',$b$);
  novo := replace(novo, $a$case when v_tipo = 'animais' then (a->>'lote_origem')::uuid end$a$, $b$case when v_tipo = 'animais' then nullif(a->>'lote_origem', '')::uuid end$b$);
  novo := replace(novo, $a$values (v_faz, v_id, 'animal', (a->>'lote_origem')::uuid,$a$, $b$values (v_faz, v_id, 'animal', nullif(a->>'lote_origem', '')::uuid,$b$);
  if position('idade_de' in novo) = 0 or position($x$'animal', nullif(a->>'lote_origem', '')::uuid$x$ in novo) = 0 or position($x$then nullif(a->>'lote_origem', '')::uuid end$x$ in novo) = 0 then
    raise exception 'V158: não foi possível atualizar salvar_venda (texto da função diferente do esperado).';
  end if;
  execute novo;
end $$;

-- conferência
select 'V158 ok' as resultado,
  (select count(*) from pg_proc where proname in ('idade_meses', 'estoque_gado_faixas')) as funcoes_novas,
  (select position('idade_de' in pg_get_functiondef('public.lancar_movimentacao(json)'::regprocedure)) > 0) as movimentacao_atualizada,
  (select position('idade_de' in pg_get_functiondef('public.salvar_venda(jsonb)'::regprocedure)) > 0) as venda_atualizada;
