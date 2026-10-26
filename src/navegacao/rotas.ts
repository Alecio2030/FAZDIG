import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TipoArea = 'manga' | 'talhao';

/** abrirId (V149): vem da Consulta pelo botão "Alterar ou excluir" e abre o lançamento já carregado no Cadastrar. */
type Abertura = { aba?: 'cadastrar' | 'consultar'; aviso?: string; abrirId?: string };

// Todas as telas da pilha principal e o que cada uma recebe.
export type PilhaParams = {
  /** email: já vem preenchido quando se chega de Criar conta ou de Esqueci minha senha */
  Entrar: { email?: string; aviso?: string } | undefined;
  CriarConta: undefined;
  /** Trocar a senha por um código enviado ao e-mail */
  EsqueciSenha: { email?: string } | undefined;
  PrimeiroAcesso: undefined;
  /** aberta pelo link do e-mail de troca de senha */
  NovaSenha: undefined;
  /** Página de início: logo, logo do proprietário e fazendas com o tempo; dela se entra no sistema */
  Capa: undefined;
  Principal: undefined;
  /** Das agendas: títulos que vencem hoje e nos próximos 7 dias */
  TitulosSemana: { tipo: 'pagar' | 'receber' };
  EmConstrucao: { titulo: string; descricao?: string };
  /** Agenda por fazenda e do Escritório Central: produtor e gerente, com as obrigações automáticas */
  /** sem parâmetro: lista das agendas (Produtor, cada Fazenda, Escritório); com parâmetro: uma agenda aberta */
  Agenda: { agenda: 'produtor' | 'admin' | 'fazenda' | 'escritorio'; fazendaId?: string } | undefined;
  // Etapa 2: cadastros de base
  // Padrão das telas: sem id abre nas abas Cadastrar | Consultar;
  // "aviso" é a mensagem de sucesso depois de cadastrar.
  PessoaForm: { id?: string; banco?: boolean } & Abertura;
  FazendaForm: { id?: string } & Abertura;
  ProdutorForm: undefined;
  UsuarioForm: { email?: string } & Abertura;
  // Agrícola
  InsumoForm: { id?: string; grupo?: 'veterinario' } & Abertura;
  // Financeiro
  ContaForm: { id?: string } & Abertura;
  /** nova: veio de outra tela (ex.: Financiamentos) com a conta digitada; cadastra e volta para ela */
  ContaBancariaForm: { id?: string; nova?: { banco?: string; agencia?: string; conta?: string } } & Abertura;
  CentroForm: { id?: string } & Abertura;
  AreaForm: { tipo: TipoArea; id?: string } & Abertura;
  MangaDetalhe: { id: string };
  VisaoPasto: undefined;
  CompraForm: Abertura | undefined;
  CompraDetalhe: { id: string };
  /** Contas a pagar: abas Lançar | Pagar | Consultar; "numero" abre o título para alterar */
  TituloForm: { tipo?: 'pagar' | 'receber'; aba?: 'lancar' | 'pagar' | 'consultar'; aviso?: string; numero?: number } | undefined;
  /** Vendas: animais (baixa o rebanho) e outros produtos e serviços; gera o contas a receber */
  /** contratoId: entrega de um contrato de café (venda futura ou troca) */
  VendaForm: { aba?: 'cadastrar' | 'consultar'; aviso?: string; contratoId?: string; excluirNumero?: number } | undefined;
  VendaDetalhe: { id: string };
  TituloBaixa: { id: string };
  TituloDetalhe: { id: string };
  ImobilizadoForm: Abertura | undefined;
  FinanciamentoForm: Abertura | undefined;
  RelatorioCaixa: undefined;
  RelatorioResultado: undefined;
  ExportarContabilidade: undefined;
  TipoLancamentoForm: Abertura | undefined;
  ImobilizadoDetalhe: { id: string };
  /** V152: transferências de bens, estoque e gado entre fazendas */
  TransferenciaForm: { aba?: 'cadastrar' | 'consultar' } | undefined;
  /** V153: conciliação bancária (extrato x sistema) */
  ConciliacaoBancaria: undefined;
  TalhaoForm: Abertura | undefined;
  TalhaoDetalhe: { id: string };
  /** análise de solo ou foliar do talhão: foto do laudo ou digitada; e o painel com as contas e o parecer */
  AnaliseForm: { areaId: string; id?: string };
  AnaliseDetalhe: { id: string };
  /** "pre" vem do plano de adubação: abre já com os produtos e a dose da aplicação programada */
  /** "irrigar" vem do balanço hídrico: abre como Irrigação, com a lâmina sugerida (0 = sem lâmina) */
  AtividadeForm: ({ areaId?: string; numeroRetorno?: number; irrigar?: { lamina: number }; pre?: { sub: string; produtos: { insumoId: string; dose: number; unidade: string; por: string }[]; parcelaIds: string[]; obs?: string } } & Omit<Abertura, 'aba'> & { aba?: 'cadastrar' | 'retorno' | 'consultar' }) | undefined;
  /** Plano de adubação: "analiseId" monta um novo a partir da análise de solo; "id" mostra o plano e as aplicações */
  PlanoAdubacao: { analiseId?: string; id?: string };
  AtividadeDetalhe: { id: string };
  /** Safras: abrir, alterar, encerrar e consultar (previsto x colhido) */
  /** id: já abre a safra para alterar, encerrar ou excluir (vem do painel da safra) */
  SafraForm: ({ id?: string } & Abertura) | undefined;
  // Frota (V119): veículos, tratores, máquinas e equipamentos
  FrotaPainel: undefined;
  VeiculoForm: ({ id?: string } & Abertura) | undefined;
  VeiculoDetalhe: { id: string };
  AbastecimentoForm: ({ id?: string; veiculoId?: string } & Abertura) | undefined;
  ManutencaoForm: ({ id?: string; veiculoId?: string; planoIds?: string[] } & Abertura) | undefined;
  LeituraForm: { veiculoId?: string } | undefined;
  FrotaRelatorio: undefined;
  FreteForm: ({ id?: string; veiculoId?: string } & Abertura) | undefined;
  // V122: só para o dono e o administrador
  /** Quem lançou o quê, por período e por pessoa */
  RegistroLancamentos: undefined;
  /** Cópias de segurança: a automática da semana, a feita na hora e o arquivo para guardar */
  CopiaSeguranca: undefined;
  /** V156: NF-e por fazenda — dados fiscais, certificado A1, numeração, ambiente e teste com a Sefaz */
  NotaFiscalConfig: undefined;
  SafraDetalhe: { id: string };
  /** Colheitas: abas Lançar | Pagamento (vales e fechamento dos colhedores) | Consultar */
  ColheitaForm: { areaId?: string; aba?: 'lancar' | 'pagamento' | 'consultar'; aviso?: string; abrirId?: string } | undefined;
  ColheitaDetalhe: { id: string };
  FechamentoColheita: { id: string };
  /** Secagem e pilagem do café: abas Secagem | Pilagem | Consultar */
  PosColheitaForm: { aba?: 'secagem' | 'pilagem' | 'consultar'; abrirNumero?: number } | undefined;
  PosColheitaDetalhe: { tipo: 'secagem' | 'pilagem'; id: string };
  /** Armazém de café: abas Entrada (lote e classificação) | Movimentar | Consultar (estoque) */
  ArmazemForm: { aba?: 'entrada' | 'movimentar' | 'contratos' | 'cotacao' | 'consultar' } | undefined;
  /** Contratos de café: venda futura e troca por insumos */
  ContratoCafeForm: { id?: string };
  ContratoCafeDetalhe: { id: string };
  LoteCafeDetalhe: { id: string };
  /** Pragas e doenças: abas Lançar (foto da planta analisada pela IA, ou à mão) | Consultar */
  MonitoramentoForm: { areaId?: string; aba?: 'cadastrar' | 'consultar'; aviso?: string } | undefined;
  MonitoramentoDetalhe: { id: string };
  /** Satélite: índice de vigor (NDVI) do talhão, imagem, histórico e alerta de queda */
  SateliteTalhao: { id: string };
  /** Clima e chuva: abas Previsão (tempo, alertas, pulverização) | Chuva (pluviômetro) | Consultar */
  ClimaForm: { aba?: 'previsao' | 'chuva' | 'irrigacao' | 'consultar' } | undefined;
  DesenharArea: { id: string };
  RacaForm: { id?: string } & Abertura;
  FerroForm: { id?: string } & Abertura;
  // Etapa 3: rebanho
  Animais: { loteId?: string; semLote?: boolean } | undefined;
  ConsultaAnimal: undefined;
  AnimalForm: { id?: string; loteId?: string; aba?: 'cadastrar' | 'consultar' };
  LoteForm: { id?: string } & Abertura;
  LoteDetalhe: { id: string };
  MovimentacaoForm: Abertura | undefined;
  MovimentacaoDetalhe: { id: string };
  PesagemForm: Abertura | undefined;
  PesagemDetalhe: { id: string };
  SanidadeForm: Abertura | undefined;
  SanidadeDetalhe: { id: string };
  DietaForm: { id?: string } & Abertura;
  DietaDetalhe: { id: string };
  AlimentoForm: { id?: string } & Abertura;
  ReproducaoForm: ({ tipo?: string; iatfId?: string } & Abertura) | undefined;
  ReproFemea: { id: string };
  IatfDetalhe: { id: string };
};

export type NavPilha = NativeStackNavigationProp<PilhaParams>;
