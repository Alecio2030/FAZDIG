-- Fazenda Digital V197 (rodado direto no Supabase; só registro)
-- mangas_lotacao(p_fazenda): por manga ativa, cabeças, UA, capacidade da estação de agora e as cabeças estimadas
-- (capacidade em UA ÷ UA média por cabeça do gado da manga; manga vazia: a média do rebanho da fazenda, ou 1 UA)
create or replace function public.mangas_lotacao(p_fazenda uuid)
returns table(area_id uuid, cabecas int, ua numeric, capacidade_ua numeric, estimado_cab int, estacao text)
language plpgsql stable security definer set search_path to 'public' as $$
declare a record; x jsonb; v_ua_cab_faz numeric; pp pastagem_parametros%rowtype;
begin
  if not acesso_fazenda(p_fazenda) then return; end if;
  select * into pp from pastagem_parametros where id = 1;
  select avg(coalesce(an.peso_atual_kg,
           (pp.pesos ->> (select trim(f.sexo) || f.de from faixas_idade f where trim(f.sexo) = trim(an.sexo)
                            and idade_meses(an.data_nascimento, current_date) >= f.de and (f.ate is null or idade_meses(an.data_nascimento, current_date) <= f.ate) limit 1))::numeric,
           case when trim(an.sexo) = 'M' then 300 else 280 end)) / pp.ua_kg
    into v_ua_cab_faz from animais an where an.fazenda_id = p_fazenda and an.situacao = 'ativo';
  for a in select id from areas where fazenda_id = p_fazenda and tipo = 'manga' and ativa loop
    x := manga_estimativa(a.id);
    area_id := a.id;
    cabecas := coalesce((x -> 'lotacao' ->> 'cabecas')::int, 0);
    ua := coalesce((x -> 'lotacao' ->> 'ua')::numeric, 0);
    capacidade_ua := (x -> 'lotacao' ->> 'capacidade_ua')::numeric;
    estacao := x ->> 'estacao_agora';
    estimado_cab := case when capacidade_ua is null then null
                         else floor(capacidade_ua / greatest(coalesce(case when cabecas > 0 then ua / cabecas end, v_ua_cab_faz, 1), 0.05))::int end;
    return next;
  end loop;
end $$;
grant execute on function public.mangas_lotacao(uuid) to authenticated;
