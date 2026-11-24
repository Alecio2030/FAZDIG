-- V157: NF-e de produtor rural, etapa 2 (emissão da nota de venda, DANFE, consulta e cancelamento).
-- Não apaga nem altera dados. Pode rodar mais de uma vez.

-- Tributação padrão de cada tipo de produto, para a operação dentro do estado e para fora.
-- Vale para o Grupo todo; na conferência da nota dá para trocar só daquela nota.
create table if not exists public.nfe_regras (
  produto text not null check (produto in ('cafe', 'bovinos', 'outros')),
  destino text not null check (destino in ('interna', 'interestadual')),
  natureza text not null,
  ncm text not null,
  cfop text not null,
  cst_icms text not null,                 -- 00, 20, 40, 41, 51, 90 (regime normal) ou CSOSN 102, 300, 400 (Simples)
  aliquota_icms numeric not null default 0,
  reducao_bc numeric not null default 0,  -- % de redução da base (CST 20)
  cst_pis text not null default '08',
  cst_cofins text not null default '08',
  texto_legal text,                       -- vai nas informações complementares (ex.: o artigo do diferimento)
  updated_at timestamptz not null default now(),
  primary key (produto, destino)
);
alter table public.nfe_regras enable row level security;
drop policy if exists nfe_regras_ler on public.nfe_regras;
create policy nfe_regras_ler on public.nfe_regras for select to authenticated using (true);
grant select on public.nfe_regras to authenticated;

-- Sugestão inicial (a contabilidade confere e ajusta na tela): dentro do ES, café cru e gado com ICMS diferido;
-- para fora, tributado a 12%. Produtor pessoa física não recolhe PIS/COFINS na nota (CST 08).
insert into public.nfe_regras (produto, destino, natureza, ncm, cfop, cst_icms, aliquota_icms, texto_legal) values
  ('cafe', 'interna', 'Venda de produção do estabelecimento', '09011110', '5101', '51', 0, 'ICMS diferido conforme o RICMS/ES.'),
  ('cafe', 'interestadual', 'Venda de produção do estabelecimento', '09011110', '6101', '00', 12, null),
  ('bovinos', 'interna', 'Venda de produção do estabelecimento', '01022990', '5101', '51', 0, 'ICMS diferido conforme o RICMS/ES.'),
  ('bovinos', 'interestadual', 'Venda de produção do estabelecimento', '01022990', '6101', '00', 12, null),
  ('outros', 'interna', 'Venda de mercadoria', '00000000', '5102', '00', 17, null),
  ('outros', 'interestadual', 'Venda de mercadoria', '00000000', '6102', '00', 12, null)
on conflict (produto, destino) do nothing;

/** Grava a tributação padrão de um produto (só o Produtor ou o Administrador). */
create or replace function public.salvar_nfe_regra(p jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.nfe_pode_configurar() then raise exception 'Só o Produtor ou o Administrador alteram a tributação.'; end if;
  if coalesce(p->>'cfop', '') !~ '^[1-7][0-9]{3}$' then raise exception 'CFOP inválido: são 4 números.'; end if;
  if coalesce(p->>'ncm', '') !~ '^[0-9]{8}$' then raise exception 'NCM inválido: são 8 números.'; end if;
  if coalesce(p->>'cst_icms', '') not in ('00','20','40','41','51','90','102','300','400') then raise exception 'CST do ICMS não suportado.'; end if;
  update public.nfe_regras set
    natureza = coalesce(nullif(trim(p->>'natureza'), ''), natureza),
    ncm = p->>'ncm', cfop = p->>'cfop', cst_icms = p->>'cst_icms',
    aliquota_icms = coalesce(nullif(p->>'aliquota_icms', '')::numeric, 0),
    reducao_bc = coalesce(nullif(p->>'reducao_bc', '')::numeric, 0),
    cst_pis = coalesce(nullif(p->>'cst_pis', ''), '08'), cst_cofins = coalesce(nullif(p->>'cst_cofins', ''), '08'),
    texto_legal = nullif(trim(p->>'texto_legal'), ''), updated_at = now()
  where produto = p->>'produto' and destino = p->>'destino';
  if not found then raise exception 'Regra não encontrada.'; end if;
end $$;

-- As notas emitidas
create table if not exists public.nfe_notas (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references public.fazendas(id),
  venda_id uuid references public.vendas(id) on delete set null,
  ambiente smallint not null,
  serie integer not null,
  numero integer not null,
  chave text,
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'enviando', 'autorizada', 'rejeitada', 'denegada', 'cancelada')),
  cstat text,
  motivo text,
  protocolo text,
  autorizada_em timestamptz,
  valor numeric,
  dest_nome text,
  dest_doc text,
  dados jsonb,                -- o que foi conferido na tela (para emitir de novo se a Sefaz rejeitar)
  xml text,                   -- o XML autorizado (nfeProc), que é o documento fiscal
  xml_cancelamento text,
  cancelada_em timestamptz,
  motivo_cancelamento text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fazenda_id, ambiente, serie, numero)
);
create index if not exists nfe_notas_venda on public.nfe_notas (venda_id);
create index if not exists nfe_notas_fazenda on public.nfe_notas (fazenda_id, created_at desc);
alter table public.nfe_notas enable row level security;
drop policy if exists nfe_notas_ler on public.nfe_notas;
create policy nfe_notas_ler on public.nfe_notas for select to authenticated using (public.acesso_fazenda(fazenda_id));
grant select on public.nfe_notas to authenticated;
-- quem grava as notas é só o servidor (função "nfe")

/** Reserva o próximo número da série da fazenda (sem pular nem repetir, mesmo com duas pessoas emitindo juntas). */
create or replace function public.nfe_reservar_numero(p_fazenda uuid)
returns table (numero integer, serie integer, ambiente smallint) language plpgsql security definer set search_path to 'public' as $$
begin
  return query
    update public.nfe_config c set proximo_numero = c.proximo_numero + 1, updated_at = now()
     where c.fazenda_id = p_fazenda
    returning c.proximo_numero - 1, c.serie, c.ambiente;
end $$;

revoke execute on function public.salvar_nfe_regra(jsonb) from public, anon;
grant execute on function public.salvar_nfe_regra(jsonb) to authenticated;
revoke execute on function public.nfe_reservar_numero(uuid) from public, anon, authenticated;

-- conferência
select 'V157 ok' as resultado,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('nfe_regras', 'nfe_notas')) as tabelas_novas,
  (select count(*) from public.nfe_regras) as regras,
  (select count(*) from pg_proc where proname in ('salvar_nfe_regra', 'nfe_reservar_numero')) as funcoes_novas;
