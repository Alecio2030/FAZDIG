-- V156: NF-e de produtor rural, etapa 1 (configuração por fazenda e certificado digital A1).
-- Não apaga nem altera dados. Pode rodar mais de uma vez.
--
-- Cada fazenda emite com os seus dados fiscais (nome/razão social, CPF ou CNPJ e Inscrição Estadual, já no cadastro
-- da Fazenda) e com o seu certificado A1. O certificado fica guardado cifrado numa tabela que o app não lê:
-- só a função "nfe" do servidor abre, para assinar e falar com a Sefaz.

-- Configuração da NF-e de cada fazenda
create table if not exists public.nfe_config (
  fazenda_id uuid primary key references public.fazendas(id) on delete cascade,
  ambiente smallint not null default 2 check (ambiente in (1, 2)),       -- 1 = produção (vale de verdade), 2 = homologação (teste da Sefaz)
  serie integer not null default 920 check (serie between 0 and 999),    -- emitente pessoa física (CPF): séries 920 a 969
  proximo_numero integer not null default 1 check (proximo_numero between 1 and 999999999),
  crt smallint not null default 3 check (crt in (1, 2, 3, 4)),           -- 3 = regime normal (o comum do produtor rural)
  cert_titular text,
  cert_documento text,
  cert_validade timestamptz,
  cert_carregado_em timestamptz,
  cert_carregado_por uuid,
  ultimo_teste_em timestamptz,
  ultimo_teste_cstat text,
  ultimo_teste_motivo text,
  updated_at timestamptz not null default now()
);

alter table public.nfe_config enable row level security;

-- quem tem acesso à fazenda vê a configuração (sem o certificado); só o Produtor/Administrador altera, pela função abaixo
drop policy if exists nfe_config_ler on public.nfe_config;
create policy nfe_config_ler on public.nfe_config for select to authenticated using (public.acesso_fazenda(fazenda_id));

-- O certificado A1 cifrado (o arquivo .pfx e a senha). Nenhum usuário do app lê esta tabela: só o servidor.
create table if not exists public.nfe_certificados (
  fazenda_id uuid primary key references public.fazendas(id) on delete cascade,
  pfx_cifrado text not null,
  senha_cifrada text not null,
  updated_at timestamptz not null default now()
);
alter table public.nfe_certificados enable row level security;
revoke all on public.nfe_certificados from anon, authenticated;

/** Quem pode configurar a NF-e e enviar o certificado: o Produtor e o Administrador (e o administrador do sistema). */
create or replace function public.nfe_pode_configurar()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.e_admin_sistema() or public.e_dono();
$$;

/** Grava a série, o próximo número, o ambiente e o regime da fazenda. */
create or replace function public.salvar_nfe_config(p_fazenda uuid, p_ambiente smallint, p_serie integer, p_proximo integer, p_crt smallint)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.nfe_pode_configurar() then raise exception 'Só o Produtor ou o Administrador configuram a nota fiscal.'; end if;
  if not exists (select 1 from public.fazendas where id = p_fazenda and coalesce(tipo, 'fazenda') = 'fazenda') then
    raise exception 'Fazenda não encontrada.';
  end if;
  if p_ambiente = 1 and not exists (select 1 from public.nfe_config where fazenda_id = p_fazenda and cert_validade > now()) then
    raise exception 'Para passar para produção, envie antes um certificado A1 válido.';
  end if;
  insert into public.nfe_config (fazenda_id, ambiente, serie, proximo_numero, crt, updated_at)
    values (p_fazenda, p_ambiente, p_serie, p_proximo, p_crt, now())
  on conflict (fazenda_id) do update
    set ambiente = excluded.ambiente, serie = excluded.serie, proximo_numero = excluded.proximo_numero, crt = excluded.crt, updated_at = now();
end $$;

revoke execute on function public.nfe_pode_configurar() from public, anon;
revoke execute on function public.salvar_nfe_config(uuid, smallint, integer, integer, smallint) from public, anon;
grant execute on function public.nfe_pode_configurar() to authenticated;
grant execute on function public.salvar_nfe_config(uuid, smallint, integer, integer, smallint) to authenticated;
grant select on public.nfe_config to authenticated;

-- conferência
select 'V156 ok' as resultado,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('nfe_config', 'nfe_certificados')) as tabelas_novas,
  (select count(*) from pg_proc where proname in ('nfe_pode_configurar', 'salvar_nfe_config')) as funcoes_novas;
