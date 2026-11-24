-- Fazenda Digital V194 – a fazenda do Grupo que compra é achada pelo CPF/CNPJ + Inscrição Estadual da fazenda do cliente
-- (rodado direto no Supabase; guardado aqui só como registro)
create or replace function public.fazenda_grupo_do_faturamento(p_pf uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select f.id from pessoas_faturamento pf
    join pessoas p on p.id = pf.pessoa_id
    join fazendas f on so_digitos(f.cpf_cnpj) = so_digitos(p.cpf_cnpj) and so_digitos(f.inscricao_estadual) = so_digitos(pf.inscricao_estadual)
   where pf.id = p_pf and so_digitos(p.cpf_cnpj) <> '' and so_digitos(pf.inscricao_estadual) <> ''
   limit 1;
$$;
-- salvar_venda: destino = coalesce(fazenda_destino_id, fazenda_grupo_do_faturamento(pessoa_faturamento_id))
-- (trecho trocado no banco com replace sobre pg_get_functiondef, como nas versões anteriores)
-- venda nº 5 da Vargem Grande: gerada a compra nº 74 na Fazenda Pau Gigante (venda_grupo_gerar_compra)
