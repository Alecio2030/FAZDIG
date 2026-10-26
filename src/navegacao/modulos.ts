import type { NomeIcone } from '../componentes/ItemMenu';
import type { NavPilha, PilhaParams } from './rotas';

// Mapa de todas as funções do sistema, por aba.
// Cada etapa futura troca o "Em construção" de uma função pela tela de verdade.

export type Funcao = {
  chave: string;
  titulo: string;
  descricao: string;
  icone: NomeIcone;
  /** só aparece para o dono e o administrador */
  soDono?: boolean;
  /** só aparece para quem tem o Financeiro liberado (V139: Compras, Imobilizado e Vendas foram para o Mais) */
  soFinanceiro?: boolean;
  /** tela pronta; sem isso, abre "Em construção" */
  tela?: { rota: keyof PilhaParams; params?: object };
};
export type ChaveModulo = 'pecuario' | 'agricola' | 'frota' | 'financeiro' | 'mais';

export const MODULOS: Record<ChaveModulo, { titulo: string; funcoes: Funcao[] }> = {
  pecuario: {
    titulo: 'Pecuário',
    funcoes: [
      { chave: 'animais', titulo: 'Animais', descricao: 'Com ou sem controle genealógico', icone: 'paw-outline', tela: { rota: 'AnimalForm', params: {} } },
      { chave: 'lotes', titulo: 'Lotes', descricao: 'Lotes próprios e de parceria', icone: 'albums-outline', tela: { rota: 'LoteForm', params: {} } },
      { chave: 'movimentacoes', titulo: 'Movimentações', descricao: 'Nascimento, compra, morte, parceria e transferências (a venda é em Mais › Vendas)', icone: 'swap-horizontal-outline', tela: { rota: 'MovimentacaoForm', params: {} } },
      { chave: 'pesagens', titulo: 'Pesagens', descricao: 'Romaneio de pesagem por lote ou manga', icone: 'speedometer-outline', tela: { rota: 'PesagemForm', params: {} } },
      { chave: 'sanidade', titulo: 'Sanidade', descricao: 'Vacinas, vermífugos e tratamentos', icone: 'medkit-outline', tela: { rota: 'SanidadeForm', params: {} } },
      { chave: 'dietas', titulo: 'Dietas', descricao: 'Formular, calcular e registrar a dieta dos lotes', icone: 'nutrition-outline', tela: { rota: 'DietaForm', params: {} } },
      { chave: 'alimentos', titulo: 'Alimentos', descricao: 'Composição (MS, PB, NDT, FDN) e preço dos alimentos', icone: 'leaf-outline', tela: { rota: 'AlimentoForm', params: {} } },
      { chave: 'medicamentos', titulo: 'Medicamentos e vacinas', descricao: 'Cadastro, dose recomendada e estoque', icone: 'flask-outline', tela: { rota: 'InsumoForm', params: { grupo: 'veterinario' } } },
      { chave: 'reproducao', titulo: 'Reprodução', descricao: 'IATF, cobertura, IA, TE/FIV, diagnóstico e parto', icone: 'git-branch-outline', tela: { rota: 'ReproducaoForm', params: {} } },
      { chave: 'mangas', titulo: 'Mangas (pastos)', descricao: 'Áreas de pasto e capim', icone: 'map-outline', tela: { rota: 'AreaForm', params: { tipo: 'manga' } } },
      { chave: 'visao_pasto', titulo: 'Visão do Pasto', descricao: 'Mapa das mangas e ocupação: ocupado, descanso e vedado', icone: 'navigate-circle-outline', tela: { rota: 'VisaoPasto' } },
      { chave: 'racas', titulo: 'Raças', descricao: 'Raças do rebanho', icone: 'bookmark-outline', tela: { rota: 'RacaForm', params: {} } },
      { chave: 'ferros', titulo: 'Ferros', descricao: 'Ferro próprio e de terceiros', icone: 'flame-outline', tela: { rota: 'FerroForm', params: {} } },
    ],
  },
  agricola: {
    titulo: 'Agrícola',
    funcoes: [
      { chave: 'safras', titulo: 'Safras', descricao: 'Abertura, previsão por talhão e encerramento; previsto x colhido', icone: 'calendar-outline', tela: { rota: 'SafraForm', params: {} } },
      { chave: 'talhoes', titulo: 'Talhões', descricao: 'Lavouras: mapa, satélite (vigor), cultura, estande, podas, análises e exaustão', icone: 'grid-outline', tela: { rota: 'TalhaoForm', params: {} } },
      { chave: 'atividades', titulo: 'Atividades', descricao: 'Adubação, pulverização, poda, capina e irrigação: baixa o estoque e vai para o custo do talhão; o que sobrar volta pelo Retorno', icone: 'construct-outline', tela: { rota: 'AtividadeForm', params: {} } },
      { chave: 'pragas', titulo: 'Pragas e doenças', descricao: 'Foto da planta: a IA aponta praga, doença ou deficiência; monitoramento por talhão', icone: 'bug-outline', tela: { rota: 'MonitoramentoForm', params: {} } },
      { chave: 'clima', titulo: 'Clima e chuva', descricao: 'Previsão do tempo, alertas, janela de pulverização, pluviômetro e balanço de chuva', icone: 'rainy-outline', tela: { rota: 'ClimaForm', params: {} } },
      { chave: 'colheitas', titulo: 'Colheitas', descricao: 'Colheita por talhão (manual, lona ou automotriz), produção dos colhedores, vales e fechamento do pagamento', icone: 'basket-outline', tela: { rota: 'ColheitaForm', params: {} } },
      { chave: 'pos_colheita', titulo: 'Secagem e pilagem', descricao: 'Secador e pilagem, próprios ou de terceiros (R$ ou % das sacas); rendimento e onde está o café', icone: 'flame-outline', tela: { rota: 'PosColheitaForm', params: {} } },
      { chave: 'armazem_cafe', titulo: 'Armazém de café', descricao: 'Café beneficiado na fazenda ou em terceiros: lotes, classificação, movimentações, contratos (venda futura e troca por insumos), cotação do dia e estoque', icone: 'business-outline', tela: { rota: 'ArmazemForm', params: {} } },
      { chave: 'insumos', titulo: 'Insumos e estoque', descricao: 'Entradas, saídas e saldo de insumos', icone: 'cube-outline', tela: { rota: 'InsumoForm', params: {} } },
    ],
  },
  frota: {
    titulo: 'Frota',
    funcoes: [
      { chave: 'frota_painel', titulo: 'Situação da frota', descricao: 'Manutenções vencidas e perto de vencer, km/horas de cada um e o gasto do mês', icone: 'speedometer-outline', tela: { rota: 'FrotaPainel' } },
      { chave: 'veiculos', titulo: 'Veículos e máquinas', descricao: 'Cadastro, uso (agricultura, pecuária, administrativo ou particular) e plano de manutenção', icone: 'car-sport-outline', tela: { rota: 'VeiculoForm', params: {} } },
      { chave: 'abastecimentos', titulo: 'Abastecimentos', descricao: 'Do tanque da fazenda (baixa o estoque) ou no posto (despesa e contas a pagar); consumo por km/L ou L/h', icone: 'water-outline', tela: { rota: 'AbastecimentoForm', params: {} } },
      { chave: 'manutencoes', titulo: 'Manutenções e trocas de óleo', descricao: 'Preventiva (zera os itens do plano) e corretiva; peças do estoque e serviço de oficina', icone: 'build-outline', tela: { rota: 'ManutencaoForm', params: {} } },
      { chave: 'fretes', titulo: 'Fretes', descricao: 'Viagens para terceiros (receita) ou transporte próprio: contratante, destino, km, carga, pedágio, alimentação, comissão e resultado por km', icone: 'navigate-outline', tela: { rota: 'FreteForm', params: {} } },
      { chave: 'leituras', titulo: 'Atualizar km ou horas', descricao: 'Hodômetro ou horímetro entre um abastecimento e outro, para os avisos não atrasarem', icone: 'timer-outline', tela: { rota: 'LeituraForm', params: {} } },
      { chave: 'frota_gastos', titulo: 'Gastos da frota', descricao: 'Combustível e manutenção por uso e por veículo, custo por km ou por hora', icone: 'stats-chart-outline', tela: { rota: 'FrotaRelatorio' } },
    ],
  },
  financeiro: {
    titulo: 'Financeiro',
    funcoes: [
      { chave: 'pagar', titulo: 'Contas a pagar', descricao: 'Lançar, pagar (dar baixa) e consultar: vencimentos, contas contínuas e saldos', icone: 'arrow-up-circle-outline', tela: { rota: 'TituloForm', params: {} } },
      { chave: 'receber', titulo: 'Contas a receber', descricao: 'Lançar, receber (dar baixa) e consultar: vendas a prazo, arrendamentos e outros', icone: 'arrow-down-circle-outline', tela: { rota: 'TituloForm', params: { tipo: 'receber' } } },
      { chave: 'financiamentos', titulo: 'Financiamentos', descricao: 'Contratos, tabela de parcelas, juros e saldo devedor', icone: 'cash-outline', tela: { rota: 'FinanciamentoForm', params: {} } },
      { chave: 'conciliacao', titulo: 'Conciliação bancária', descricao: 'Extrato do banco (OFX, PDF, Excel ou foto) x sistema: casa sozinho e mostra o que não bateu para baixar, lançar ou parear', icone: 'git-compare-outline', tela: { rota: 'ConciliacaoBancaria' } },
      { chave: 'rel_caixa', titulo: 'Extrato e fluxo de caixa', descricao: 'Extrato de caixa e bancos por período e o previsto a pagar e a receber, mês a mês', icone: 'stats-chart-outline', tela: { rota: 'RelatorioCaixa' } },
      { chave: 'rel_resultado', titulo: 'Resultado da atividade', descricao: 'Receitas e despesas do período pela estrutura do plano, por fazenda ou de todas', icone: 'trending-up-outline', tela: { rota: 'RelatorioResultado' } },
      { chave: 'exportar', titulo: 'Exportar para a contabilidade', descricao: 'Arquivo do período (abre no Excel) com conta, fazenda e centro de custo', icone: 'download-outline', tela: { rota: 'ExportarContabilidade' } },
      { chave: 'contas', titulo: 'Bancos e caixa', descricao: 'Contas bancárias, caixa e saldos', icone: 'wallet-outline', tela: { rota: 'ContaBancariaForm', params: {} } },
      { chave: 'plano', titulo: 'Plano de contas', descricao: 'Estrutura de referência dos relatórios: o sistema classifica sozinho', icone: 'list-outline', tela: { rota: 'ContaForm', params: {} } },
      { chave: 'tipos', titulo: 'Tipos de despesa e receita', descricao: 'A lista que aparece nas telas e a conta do plano de cada tipo', icone: 'pricetags-outline', tela: { rota: 'TipoLancamentoForm', params: {} } },
      { chave: 'centros', titulo: 'Centros de custo', descricao: 'Contas de grau 3 do plano, com talhões, mangas e lotes', icone: 'pie-chart-outline', tela: { rota: 'CentroForm', params: {} } },
    ],
  },
  mais: {
    titulo: 'Mais',
    funcoes: [
      { chave: 'agenda', titulo: 'Agenda', descricao: 'Do Produtor, das Fazendas e do Escritório: participantes, envio de tarefas e obrigações automáticas', icone: 'calendar-outline', tela: { rota: 'Agenda' } },
      { chave: 'pessoas', titulo: 'Pessoas', descricao: 'Clientes, fornecedores, funcionários e parceiros', icone: 'people-outline', tela: { rota: 'PessoaForm', params: {} } },
      { chave: 'fazendas', titulo: 'Fazendas e Particular', descricao: 'Dados das fazendas, do produtor e o Particular dos sócios', icone: 'home-outline', tela: { rota: 'FazendaForm', params: {} } },
      { chave: 'compras', titulo: 'Compras', descricao: 'Produtos (estoque) e despesas sem estoque: custo, centro de custo e contas a pagar', soFinanceiro: true, icone: 'cart-outline', tela: { rota: 'CompraForm', params: {} } },
      { chave: 'imobilizado', titulo: 'Imobilizado', descricao: 'Máquinas, benfeitorias e lavouras: em formação (custo acumulado no centro do bem), depreciação, exaustão e rateio', soFinanceiro: true, icone: 'construct-outline', tela: { rota: 'ImobilizadoForm', params: {} } },
      { chave: 'transferencias', titulo: 'Transferências', descricao: 'Bens, produtos do estoque e gado entre fazendas: para o estoque, o imobilizado ou direto num centro de custo da outra fazenda (leva o código de origem)', icone: 'swap-horizontal-outline', tela: { rota: 'TransferenciaForm', params: {} } },
      { chave: 'vendas', titulo: 'Vendas', descricao: 'Venda de animais (baixa o rebanho), de café (baixa o armazém) e de outros produtos e serviços: gera o contas a receber', soFinanceiro: true, icone: 'pricetag-outline', tela: { rota: 'VendaForm', params: {} } },
      { chave: 'notas', titulo: 'Notas fiscais (NF-e)', descricao: 'Emitir a NF-e pelo nº da venda e buscar as emitidas desta fazenda: DANFE, XML e cancelamento', soFinanceiro: true, icone: 'receipt-outline', tela: { rota: 'NotasFiscais' } },
      { chave: 'nfe', titulo: 'Nota fiscal (NF-e)', descricao: 'Certificado digital A1, série e numeração de cada fazenda e teste com a Sefaz', icone: 'document-text-outline', soDono: true, tela: { rota: 'NotaFiscalConfig' } },
      { chave: 'usuarios', titulo: 'Usuários e acessos', descricao: 'Quem entra no sistema, o que pode fazer, quem vê o Financeiro e as agendas de cada participante', icone: 'key-outline', soDono: true, tela: { rota: 'UsuarioForm', params: {} } },
      { chave: 'registro', titulo: 'Auditoria', descricao: 'Quem lançou o quê: registro dos lançamentos por período e por pessoa', icone: 'footsteps-outline', soDono: true, tela: { rota: 'RegistroLancamentos' } },
      { chave: 'copia', titulo: 'Cópia de segurança', descricao: 'Cópia automática toda semana, cópia na hora e arquivo para guardar fora do sistema', icone: 'shield-checkmark-outline', soDono: true, tela: { rota: 'CopiaSeguranca' } },
    ],
  },
};

/** Abre a tela da função, ou "Em construção" se ainda não existir. */
export function abrirFuncao(navegacao: NavPilha, f: Funcao) {
  // push: sempre abre uma tela nova e limpa (navigate reaproveitaria uma já aberta, com os dados dela).
  if (f.tela) (navegacao.push as (rota: string, params?: object) => void)(f.tela.rota, f.tela.params);
  else navegacao.navigate('EmConstrucao', { titulo: f.titulo, descricao: f.descricao });
}
