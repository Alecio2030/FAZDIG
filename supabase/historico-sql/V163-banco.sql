-- V163: GTA (Guia de Trânsito Animal). A e-GTA é emitida no Siapec (IDAF) com o login do produtor;
-- o app prepara a ficha (procedência, destino, finalidade e quantidades por sexo e faixa da GTA) e guarda a GTA emitida
-- (digitada ou lida da foto/PDF), ligada ao movimento e à venda.
-- Faixas da GTA: as mesmas para machos e fêmeas (0 a 12, 13 a 24, 25 a 36 e acima de 36 meses);
-- as faixas próprias das fêmeas no estoque do IDAF (0 a 2, 3 a 8, 9 a 12) somam em "0 a 12" na GTA.
-- Não apaga nem altera dados existentes. Pode rodar mais de uma vez.

create table if not exists public.gtas (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references public.fazendas(id) on delete cascade,
  direcao text not null default 'saida' check (direcao in ('saida', 'entrada')),
  numero text,                 -- como sai na e-GTA: "ES 816265 D"
  situacao text not null default 'preparada' check (situacao in ('preparada', 'emitida', 'cancelada')),
  emissao date,
  validade date,
  finalidade text,
  transporte text,
  autenticidade text,          -- código de autenticidade da e-GTA
  origem jsonb not null default '{}'::jsonb,   -- { doc, nome, estabelecimento, codigo, municipio, uf }
  destino jsonb not null default '{}'::jsonb,
  quantidades jsonb not null default '{}'::jsonb, -- { "M0": 39, "M13": 5, "F0": 0, ... } (chave = sexo + início da faixa da GTA)
  total_machos integer not null default 0,
  total_femeas integer not null default 0,
  movimentacao_id uuid references public.movimentacoes(id) on delete set null,
  venda_id uuid references public.vendas(id) on delete set null,
  arquivo text,                -- foto/PDF guardado na pasta documentos
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gtas_fazenda_idx on public.gtas (fazenda_id, created_at desc);
create index if not exists gtas_mov_idx on public.gtas (movimentacao_id);
create index if not exists gtas_venda_idx on public.gtas (venda_id);
create unique index if not exists gtas_numero_unico on public.gtas (fazenda_id, direcao, upper(replace(numero, ' ', ''))) where numero is not null and situacao <> 'cancelada';

alter table public.gtas enable row level security;
drop policy if exists gtas_ler on public.gtas;
create policy gtas_ler on public.gtas for select to authenticated using (public.acesso_fazenda(fazenda_id));
drop policy if exists gtas_incluir on public.gtas;
create policy gtas_incluir on public.gtas for insert to authenticated with check (public.acesso_fazenda(fazenda_id));
drop policy if exists gtas_alterar on public.gtas;
create policy gtas_alterar on public.gtas for update to authenticated using (public.acesso_fazenda(fazenda_id)) with check (public.acesso_fazenda(fazenda_id));
drop policy if exists gtas_excluir on public.gtas;
create policy gtas_excluir on public.gtas for delete to authenticated using (public.acesso_fazenda(fazenda_id));
revoke all on public.gtas from anon;

-- Faixa da GTA de uma idade em meses (igual para os dois sexos)
create or replace function public.faixa_gta(p_meses integer)
returns integer language sql immutable as $$
  select case when p_meses is null then null when p_meses <= 12 then 0 when p_meses <= 24 then 13 when p_meses <= 36 then 25 else 37 end;
$$;
grant execute on function public.faixa_gta(integer) to authenticated;

-- Os animais de uma venda pelas faixas da GTA (as mesmas para machos e fêmeas), na idade da data da saída
create or replace function public.venda_gado_faixas(p_venda uuid)
returns table (sexo character, faixa text, ordem integer, cabecas integer, peso_kg numeric)
language sql stable security definer set search_path to 'public' as $$
  select trim(coalesce(i.sexo, a.sexo))::character,
         case public.faixa_gta(public.idade_meses(a.data_nascimento, m.data)) when 0 then '0 a 12 meses' when 13 then '13 a 24 meses' when 25 then '25 a 36 meses' else 'acima de 36 meses' end,
         public.faixa_gta(public.idade_meses(a.data_nascimento, m.data)),
         count(*)::int, sum(i.peso_kg)
    from vendas v
    join movimentacoes m on m.venda_id = v.id
    join movimentacao_itens i on i.movimentacao_id = m.id
    join animais a on a.id = i.animal_id
   where v.id = p_venda and a.data_nascimento is not null and public.acesso_fazenda(v.fazenda_id)
   group by 1, 2, 3
   order by 3, 1 desc; -- como na GTA: macho e fêmea de cada faixa
$$;
revoke execute on function public.venda_gado_faixas(uuid) from public, anon;
grant execute on function public.venda_gado_faixas(uuid) to authenticated;

-- A GTA emitida de uma venda também vai para a própria venda (número, série e UF), que segue para a NF-e
create or replace function public.gta_na_venda()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare m text[];
begin
  if new.venda_id is not null and new.situacao = 'emitida' and new.numero is not null then
    m := regexp_match(upper(trim(new.numero)), '^([A-Z]{2})\s*([0-9]+)\s*([A-Z0-9]*)$');
    if m is not null then
      update vendas set gta_uf = m[1], gta_numero = m[2], gta_serie = nullif(m[3], '') where id = new.venda_id;
    else
      update vendas set gta_numero = new.numero where id = new.venda_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.gta_na_venda() from public, anon, authenticated;
drop trigger if exists gta_na_venda on public.gtas;
create trigger gta_na_venda before insert or update on public.gtas for each row execute function public.gta_na_venda();

-- conferência
select 'V163 ok' as resultado,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'gtas') as tabela_gtas,
  (select count(*) from pg_proc where proname in ('faixa_gta', 'gta_na_venda')) as funcoes;
