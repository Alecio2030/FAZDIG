-- V165 · Imobilizado × Frota
-- O bem nasce no Imobilizado (código, depreciação) e, se for "Controlar na Frota", ganha a ficha na Frota ligada a ele.
-- 1) um bem só tem uma ficha na Frota;
-- 2) o que muda no bem (fazenda por transferência, nome, baixa, exclusão) vai sozinho para a Frota;
-- 3) veículo da Frota ainda sem bem: o sistema cria o bem no Imobilizado (valor R$ 1,00 para completar) e liga.
-- Não apaga dados e pode rodar mais de uma vez.

-- 1) uma ficha da Frota por bem
create unique index if not exists frota_veiculos_imobilizado_unico
  on public.frota_veiculos (imobilizado_id) where imobilizado_id is not null;

-- 2) o bem manda na ficha da Frota
create or replace function public.trg_imob_para_frota()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    -- o bem saiu do Imobilizado: a ficha fica fora de uso (o histórico de abastecimento e manutenção continua guardado)
    update frota_veiculos set ativo = false where imobilizado_id = old.id;
    return old;
  end if;
  if new.fazenda_id is distinct from old.fazenda_id and new.fazenda_id is not null then
    update frota_veiculos set fazenda_id = new.fazenda_id where imobilizado_id = new.id;
  end if;
  if new.nome is distinct from old.nome then
    update frota_veiculos set nome = new.nome where imobilizado_id = new.id;
  end if;
  if new.situacao is distinct from old.situacao then
    if new.situacao = 'baixado' then
      update frota_veiculos set ativo = false where imobilizado_id = new.id;
    elsif old.situacao = 'baixado' then
      update frota_veiculos set ativo = true where imobilizado_id = new.id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_imob_para_frota on public.imobilizados;
create trigger trg_imob_para_frota after update on public.imobilizados
  for each row execute function public.trg_imob_para_frota();
drop trigger if exists trg_imob_para_frota_del on public.imobilizados;
create trigger trg_imob_para_frota_del before delete on public.imobilizados
  for each row execute function public.trg_imob_para_frota();

-- 3) veículos que estavam só na Frota: cria o bem e liga
do $$
declare
  v record; v_cat text; v_vida numeric; v_centro uuid; v_bem uuid;
begin
  for v in select * from frota_veiculos where imobilizado_id is null and fazenda_id is not null order by numero loop
    v_cat := case v.tipo
      when 'trator' then 'tratores'
      when 'colhedora' then 'maquinas'
      when 'implemento' then 'implementos'
      when 'equipamento' then 'equipamentos'
      when 'outro' then 'outros'
      else 'veiculos' end;
    v_vida := case v_cat when 'veiculos' then 5 else 10 end;
    -- rateio: o centro de custo da ficha; sem ele, o mais usado pelos veículos da mesma fazenda
    v_centro := coalesce(v.centro_custo_id,
      (select centro_custo_id from frota_veiculos where fazenda_id = v.fazenda_id and centro_custo_id is not null
        group by centro_custo_id order by count(*) desc limit 1));
    if v_centro is null then
      raise notice 'Veículo nº % (%) sem centro de custo: cadastre-o pelo Imobilizado.', v.numero, v.nome;
      continue;
    end if;
    insert into imobilizados (fazenda_id, nome, descricao, metodo, categoria, valor_aquisicao, data_ativacao, vida_util, vida_unidade,
                              residual_perc, situacao, observacoes)
    values (v.fazenda_id, v.nome,
      nullif(concat_ws(' · ', nullif(trim(concat_ws(' ', v.marca, v.modelo)), ''), case when v.ano is not null then 'ano ' || v.ano end,
        case when v.placa is not null then 'placa ' || v.placa end, case when v.chassi is not null then 'chassi ' || v.chassi end,
        case when v.renavam is not null then 'renavam ' || v.renavam end), ''),
      'depreciacao', v_cat, 1, coalesce(v.data_leitura_inicial, current_date), v_vida, 'anos', 0, 'ativo',
      'Veio da Frota (V165): completar valor de aquisição, data de ativação e vida útil.')
    returning id into v_bem;
    insert into imobilizado_rateios values (v_bem, v_centro, 100);
    update frota_veiculos set imobilizado_id = v_bem where id = v.id;
  end loop;
end $$;

select 'V165 ok | veículos na Frota: ' || count(*) || ' | ligados ao Imobilizado: ' || count(imobilizado_id)
  || ' | sem bem: ' || (count(*) - count(imobilizado_id)) from public.frota_veiculos;
