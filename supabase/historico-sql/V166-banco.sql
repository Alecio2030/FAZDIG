-- V166 · Análises e laudos
-- 1) talhao_analises.referencias: a coluna "valor adequado" do laboratório (min/max por parâmetro), usada quando o sistema
--    não tem faixa própria (ex.: foliar fora da pré-florada e da granação, ou outra cultura).
-- 2) laudos_insumo: laudo de fertilizante orgânico e de corretivo (calcário), ligado (ou não) ao produto do estoque.
-- Não apaga dados e pode rodar mais de uma vez.

alter table public.talhao_analises add column if not exists referencias jsonb;

create table if not exists public.laudos_insumo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('organico', 'corretivo')),
  insumo_id uuid references public.insumos(id) on delete set null,
  data date not null,
  laboratorio text,
  numero_laudo text,
  amostra text,
  fornecedor text,
  -- orgânico: os teores do laudo estão sobre a matéria seca ou sobre o produto como vem (úmido)
  base text check (base is null or base in ('seca', 'umida')),
  dados jsonb not null default '{}'::jsonb,
  arquivo_documento text,
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists laudos_insumo_data on public.laudos_insumo (data desc);
create index if not exists laudos_insumo_insumo on public.laudos_insumo (insumo_id);

-- os produtos do estoque são do Grupo: os laudos deles também
alter table public.laudos_insumo enable row level security;
drop policy if exists laudos_insumo_select on public.laudos_insumo;
create policy laudos_insumo_select on public.laudos_insumo for select using (public.e_usuario());
drop policy if exists laudos_insumo_insert on public.laudos_insumo;
create policy laudos_insumo_insert on public.laudos_insumo for insert with check (public.e_usuario());
drop policy if exists laudos_insumo_update on public.laudos_insumo;
create policy laudos_insumo_update on public.laudos_insumo for update using (public.e_usuario_completo()) with check (public.e_usuario_completo());
drop policy if exists laudos_insumo_delete on public.laudos_insumo;
create policy laudos_insumo_delete on public.laudos_insumo for delete using (public.e_usuario_completo());

select 'V166 ok | laudos de insumo: ' || (select count(*) from public.laudos_insumo)
  || ' | análises com referência do laboratório: ' || (select count(*) from public.talhao_analises where referencias is not null);
