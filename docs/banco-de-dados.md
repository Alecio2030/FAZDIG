# Banco de dados (Supabase / PostgreSQL)

Retrato tirado em 23/10/2026, com o banco na V153.

Projeto Supabase: `ultkkwvojisfgpebnhhl` ("fazenda-digital").

| Item | Quantidade |
|---|---|
| Tabelas | 114 |
| Visões | 3 (`v_saldo_lotes`, `v_saldo_estoque`, `frota_leituras_todas`) |
| Funções (regras no banco) | 224 |
| Regras de acesso (RLS) | 320 |
| Gatilhos | 59 |
| Pasta de arquivos (Storage) | 1 (`documentos`: fotos de notas, laudos, plantas e exportações) |
| Extensões | pgcrypto, uuid-ossp, pg_net, pg_cron, supabase_vault, pg_stat_statements |

## Tarefas agendadas no banco (pg_cron)

| Tarefa | Quando (horário UTC) |
|---|---|
| `cafe-cotacao-pedir` / `cafe-cotacao-gravar` | dias úteis, duas vezes ao dia (cotação do conilon) |
| `fazenda-digital-copia-semanal` | domingo, 6h (cópia de segurança) |
| `agenda-apagar-cumpridas` | todo dia, 3h10 (apaga tarefas cumpridas há mais de 3 dias) |

## Funções na nuvem (Edge Functions)

O código está em `supabase/functions/`.

| Função | Para que serve | Chave usada |
|---|---|---|
| `ler-documento` | Lê foto de nota fiscal, CT-e, conta, boleto, comprovante e NF de bem | ANTHROPIC_API_KEY |
| `ler-extrato` | Lê extrato bancário (foto, PDF ou Excel) para a conciliação | ANTHROPIC_API_KEY |
| `ler-classificacao` | Lê laudo/romaneio de classificação de café | ANTHROPIC_API_KEY |
| `agronomo` | Lê laudo de análise de solo/foliar e dá o parecer | ANTHROPIC_API_KEY |
| `diagnostico-planta` | Foto da planta: praga, doença ou deficiência | ANTHROPIC_API_KEY |
| `interpretar-voz` | Lançamento por voz nas Atividades | ANTHROPIC_API_KEY |
| `satelite` | Vigor da lavoura (NDVI) pelo Sentinel-2 | COPERNICUS_CLIENT_ID / _SECRET |
| `exportar-contabilidade` | Gera o CSV para a contabilidade | — |

No Supabase ainda existe a função `limpeza-temporaria`, que está desativada (responde só "desativada"). Ela pode ser apagada no painel do Supabase.

## Tabelas por assunto

- **Acesso e cadastro base**: produtor, fazendas, usuarios_fazenda, convites_acesso, admins_sistema, pessoas, pessoas_faturamento, documentos_comprador, contas_bancarias, areas, manga_estruturas.
- **Pecuária**: animais, animal_pesos, animal_deps, dep_caracteristicas, racas, ferros, faixas_etarias, lotes, movimentacoes, movimentacao_itens, pesagens, pesagem_itens, transferencia_animais, manga_manejos, alimentos, dietas, dieta_itens.
- **Sanidade e reprodução**: sanidade, sanidade_itens, sanidade_reforcos, reproducao, repro_eventos, repro_protocolos, repro_iatf, repro_iatf_femeas.
- **Agricultura**: safras, safra_talhoes, talhao_analises, talhao_podas, atividades_agricolas, atividade_areas, atividade_insumos, atividade_operadores, adubacao_planos, adubacao_parcelas, monitoramentos, chuvas, satelite_indices, producao_movimentos, vendas_producao.
- **Café**: colheitas, colheita_medidas, colheita_vales, colheita_fechamentos, colheita_fechamento_itens, pc_colhedores, pc_eventos, pc_locais, pc_lotes, cafe_secagens, cafe_secagem_itens, cafe_pilagens, cafe_pilagem_itens, cafe_lotes, cafe_movimentos, cafe_contratos, cafe_cotacoes, cafe_cotacao_pedidos.
- **Estoque e compras**: insumos, estoque_movimentos, compras, compra_itens, compra_rateios, compra_fretes, compra_frete_itens, nota_vinculos.
- **Vendas**: vendas, venda_itens, venda_rateios.
- **Financeiro**: lancamentos, lancamento_rateios, baixas, recorrencias, tipos_lancamento, financiamentos, financiamento_parcelas, extratos_bancarios, extrato_linhas, centros_custo, plano_contas.
- **Imobilizado e transferências**: imobilizados, imobilizado_alocacoes, imobilizado_rateios, transferencias, transferencia_itens.
- **Frota**: frota_veiculos, frota_planos, frota_leituras, frota_abastecimentos, frota_abastecimento_rateios, frota_manutencoes, frota_manutencao_itens, frota_fretes.
- **Agenda**: agenda_itens, agenda_obrigacoes, agenda_participantes, agenda_rotinas.
- **Segurança**: copias_seguranca.
- **Sobras de versões antigas** (guardadas, sem uso nas telas): plano_contas_v91, plano_contas_v141, plano_contas_v142, tipos_lancamento_v141, v131_feito.

## O que falta para o banco ficar 100% no GitHub

Os arquivos de `supabase/historico-sql/` cobrem só as versões V130 em diante (as anteriores foram rodadas e não ficaram guardadas). O retrato completo do banco (o SQL de todas as tabelas, funções e regras) ainda precisa ser gerado com a ferramenta oficial do Supabase (`supabase db dump`), num computador com acesso ao projeto. Com ele, o banco poderá ser recriado do zero para cada novo produtor que comprar o sistema.
