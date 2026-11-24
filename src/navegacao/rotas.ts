import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TipoArea = 'manga' | 'talhao';

/** abrirId (V149): vem da Consulta pelo botão "Alterar ou excluir" e abre o lançamento já carregado no Cadastrar. */
type Abertura = { aba?: 'cadastrar' | 'consultar'; aviso?: string; abrirId?: string };

// Todas as telas da pilha principal e o que cada uma recebe.
export type PilhaParams = {
  /** email: já vem preenchido quando se chega de Criar conta ou de Esqueci minha senha */
  Entrar: { email?: string; aviso?: string } | undefined;
  CriarConta: undefined;
  /** V184: o vaqueiro entra só aqui */
  ModoVaqueiro: undefined;
  /** V184: o gerente confere o que veio do campo */
  CampoConferir: undefined;
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
  /** novo (V158): cadastro pedido de outra tela (ex.: cliente na Venda); ao salvar, volta para ela com a pessoa escolhida */
  PessoaForm: { id?: string; banco?: boolean; novo?: { nome: string; tipo: string } } & Abertura;
  FazendaForm: { id?: string } & Abertura;
  ProdutorForm: undefined;
  UsuarioForm: { email?: string } & Abertura;
  // Agrícola
  InsumoForm: { id?: string; grupo?: 'veterinario' } & Abertura;
  /** V179: Mais › Estoque: primeiro a fazenda, depois o saldo dos produtos dela */
  EstoqueInsumos: { fazendaId?: string } | undefined;
  /** V179: estoque de um produto numa fazenda: saldo, custos, entradas e saídas e o estoque inicial */
  EstoqueDetalhe: { insumoId: string; fazendaId: string };
  // Financeiro
  ContaForm: { id?: string } & Abertura;
  /** nova: veio de outra tela (ex.: Financiamentos) com a conta digitada; cadastra e volta para ela */
  ContaBancariaForm: { id?: string; nova?: { banco?: string; agencia?: string; conta?: string } } & Abertura;
  CentroForm: { id?: string } & Abertura;
  AreaForm: { tipo: TipoArea; id?: string } & Abertura;
  MangaDetalhe: { id: string };
  Capins: undefined;
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
  /** V183: pagar pelo banco (copia o código e abre o app do banco) */
  PagamentoBanco: { id: string };
  TituloDetalhe: { id: string };
  ImobilizadoForm: Abertura | undefined;
  FinanciamentoForm: Abertura | undefined;
  RelatorioCaixa: undefined;
  RelatorioResultado: undefined;
  /** V173: balancete das contas de resultado, sintético (grau 3) ou analítico (grau 4) */
  Balancete: undefined;
  /** V173: lançamentos de uma conta do plano (centro de custo de grau 3 ou conta de grau 4) no período */
  /** V174: parâmetros (vida útil, residual) e rateio padrão das despesas sem centro */
  Parametros: undefined;
  /** V174: fechamento do mês: depreciação/exaustão lançadas sozinhas e pendências */
  FechamentoMes: undefined;
  /** V175: trato do dia dos lotes (gerado sozinho pela dieta; corrige-se só a exceção) */
  TratoDia: { data?: string; id?: string } | undefined;
  LancamentosConta: { codigo: string; nome: string; periodo?: string; de?: string; ate?: string; unidade?: string };
  /** V177: razão de uma conta patrimonial (Ativo, Passivo e PL): saldo anterior, débitos, créditos e saldo */
  RazaoConta: { codigo: string; nome: string; periodo?: string; de?: string; ate?: string };
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
  /** V166: Agrícola › Análises e laudos (solo, folha, adubo orgânico e calcário) */
  LaudoForm: Abertura | undefined;
  LaudoInsumoDetalhe: { id: string };
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
  /** V157: conferência e emissão da NF-e de uma venda */
  NotaFiscalEmitir: { vendaId: string; /** V203: a nota pode juntar várias vendas (a primeira é a principal) */ vendaIds?: string[] };
  /** V157: uma NF-e (DANFE, XML, consulta e cancelamento) */
  NotaFiscalDetalhe: { id: string; aviso?: string };
  /** V157: busca das NF-e emitidas */
  NotasFiscais: undefined;
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
  /** V163: GTA – vem preparada a partir de um movimento ou de uma venda */
  GtaForm: (Abertura & { movimentacaoId?: string; vendaId?: string }) | undefined;
  /** V178: estoque de gado (sexo, faixa da GTA, total e com GTA) */
  EstoqueFiscal: Abertura | undefined;
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
