-- Fazenda Digital V199 (já aplicado no Supabase; este arquivo é só registro)
-- Venda de animais aceita Estoque de gado negativo na implantação (parâmetro venda_gado_negativo = 1).
insert into public.parametros (chave, grupo, rotulo, unidade, valor_padrao, ordem, ajuda)
values ('venda_gado_negativo', 'Pecuária', 'Venda de animais aceita Estoque de gado negativo (implantação)', '1 = aceita, 0 = não', 1, 209,
        'Durante a implantação a venda grava mesmo sem saldo no Estoque de gado (fica negativo). Ponha 0 para voltar a bloquear.')
on conflict (chave) do nothing;
-- estoque_gado_baixar_venda: a conferência do saldo só roda quando o parâmetro for 0 (função substituída no banco).
