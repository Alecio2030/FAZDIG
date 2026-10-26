import React from 'react';
import { ActivityIndicator, Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSessao } from '../contexto/SessaoContext';
import { cores } from '../tema';
import type { PilhaParams } from './rotas';
import LimiteErro from '../componentes/LimiteErro';
import { BotaoVoltar, opcoesBarra, usePC } from '../componentes/Cabecalho';
import { podeModulo } from '../lib/acessos';

import Entrar from '../telas/auth/Entrar';
import CriarConta from '../telas/auth/CriarConta';
import EsqueciSenha from '../telas/auth/EsqueciSenha';
import PrimeiroAcesso from '../telas/auth/PrimeiroAcesso';
import NovaSenha from '../telas/auth/NovaSenha';
import Modulo from '../telas/Modulo';
import Mais from '../telas/Mais';
import EmConstrucao from '../telas/EmConstrucao';
import Agenda from '../telas/Agenda';
import Capa from '../telas/Capa';
import TitulosSemana from '../telas/financeiro/TitulosSemana';
import PessoaForm from '../telas/cadastros/PessoaForm';
import FazendaForm from '../telas/cadastros/FazendaForm';
import ProdutorForm from '../telas/cadastros/ProdutorForm';
import UsuarioForm from '../telas/cadastros/UsuarioForm';
import ContaForm from '../telas/financeiro/ContaForm';
import InsumoForm from '../telas/agricola/InsumoForm';
import ContaBancariaForm from '../telas/financeiro/ContaBancariaForm';
import CentroForm from '../telas/financeiro/CentroForm';
import AreaForm from '../telas/cadastros/AreaForm';
import MangaDetalhe from '../telas/cadastros/MangaDetalhe';
import VisaoPasto from '../telas/cadastros/VisaoPasto';
import CompraForm from '../telas/financeiro/CompraForm';
import CompraDetalhe from '../telas/financeiro/CompraDetalhe';
import TituloForm from '../telas/financeiro/TituloForm';
import TituloBaixa from '../telas/financeiro/TituloBaixa';
import TituloDetalhe from '../telas/financeiro/TituloDetalhe';
import VendaForm from '../telas/financeiro/VendaForm';
import VendaDetalhe from '../telas/financeiro/VendaDetalhe';
import ImobilizadoForm from '../telas/financeiro/ImobilizadoForm';
import FinanciamentoForm from '../telas/financeiro/FinanciamentoForm';
import RelatorioCaixa from '../telas/financeiro/RelatorioCaixa';
import RelatorioResultado from '../telas/financeiro/RelatorioResultado';
import ExportarContabilidade from '../telas/financeiro/ExportarContabilidade';
import TipoLancamentoForm from '../telas/financeiro/TipoLancamentoForm';
import ImobilizadoDetalhe from '../telas/financeiro/ImobilizadoDetalhe';
import TransferenciaForm from '../telas/TransferenciaForm';
import ConciliacaoBancaria from '../telas/financeiro/ConciliacaoBancaria';
import TalhaoForm from '../telas/agricola/TalhaoForm';
import TalhaoDetalhe from '../telas/agricola/TalhaoDetalhe';
import AnaliseForm from '../telas/agricola/AnaliseForm';
import AnaliseDetalhe from '../telas/agricola/AnaliseDetalhe';
import AtividadeForm from '../telas/agricola/AtividadeForm';
import AtividadeDetalhe from '../telas/agricola/AtividadeDetalhe';
import SafraForm from '../telas/agricola/SafraForm';
import SafraDetalhe from '../telas/agricola/SafraDetalhe';
import ColheitaForm from '../telas/agricola/ColheitaForm';
import ColheitaDetalhe from '../telas/agricola/ColheitaDetalhe';
import FechamentoColheita from '../telas/agricola/FechamentoColheita';
import PosColheitaForm from '../telas/agricola/PosColheitaForm';
import PosColheitaDetalhe from '../telas/agricola/PosColheitaDetalhe';
import ArmazemForm from '../telas/agricola/ArmazemForm';
import ContratoCafeForm from '../telas/agricola/ContratoCafeForm';
import ContratoCafeDetalhe from '../telas/agricola/ContratoCafeDetalhe';
import LoteCafeDetalhe from '../telas/agricola/LoteCafeDetalhe';
import MonitoramentoForm from '../telas/agricola/MonitoramentoForm';
import MonitoramentoDetalhe from '../telas/agricola/MonitoramentoDetalhe';
import SateliteTalhao from '../telas/agricola/SateliteTalhao';
import ClimaForm from '../telas/agricola/ClimaForm';
import PlanoAdubacao from '../telas/agricola/PlanoAdubacao';
import DesenharArea from '../telas/cadastros/DesenharArea';
import RacaForm from '../telas/cadastros/RacaForm';
import FerroForm from '../telas/cadastros/FerroForm';
import Animais from '../telas/rebanho/Animais';
import AnimalForm from '../telas/rebanho/AnimalForm';
import ConsultaAnimal from '../telas/rebanho/ConsultaAnimal';
import LoteForm from '../telas/rebanho/LoteForm';
import MovimentacaoForm from '../telas/rebanho/MovimentacaoForm';
import MovimentacaoDetalhe from '../telas/rebanho/MovimentacaoDetalhe';
import PesagemForm from '../telas/rebanho/PesagemForm';
import PesagemDetalhe from '../telas/rebanho/PesagemDetalhe';
import LoteDetalhe from '../telas/rebanho/LoteDetalhe';
import DietaForm from '../telas/rebanho/DietaForm';
import DietaDetalhe from '../telas/rebanho/DietaDetalhe';
import AlimentoForm from '../telas/rebanho/AlimentoForm';
import ReproducaoForm from '../telas/reproducao/ReproducaoForm';
import ReproFemea from '../telas/reproducao/ReproFemea';
import IatfDetalhe from '../telas/reproducao/IatfDetalhe';
import SanidadeForm from '../telas/rebanho/SanidadeForm';
import SanidadeDetalhe from '../telas/rebanho/SanidadeDetalhe';
import FrotaPainel from '../telas/frota/FrotaPainel';
import VeiculoForm from '../telas/frota/VeiculoForm';
import VeiculoDetalhe from '../telas/frota/VeiculoDetalhe';
import AbastecimentoForm from '../telas/frota/AbastecimentoForm';
import ManutencaoForm from '../telas/frota/ManutencaoForm';
import LeituraForm from '../telas/frota/LeituraForm';
import FrotaRelatorio from '../telas/frota/FrotaRelatorio';
import FreteForm from '../telas/frota/FreteForm';
import RegistroLancamentos from '../telas/RegistroLancamentos';
import CopiaSeguranca from '../telas/CopiaSeguranca';
import NotaFiscalConfig from '../telas/NotaFiscalConfig';

const Pilha = createNativeStackNavigator<PilhaParams>();

const WEB = Platform.OS === 'web';

// Cada tela fica protegida: se der erro, aparece o aviso com Voltar (e não a página branca).
const protegidas = new Map<React.ComponentType<any>, React.ComponentType<any>>();
function P<T extends React.ComponentType<any>>(C: T): T {
  let W = protegidas.get(C);
  if (!W) {
    const Protegida = (props: any) => (
      <LimiteErro>
        <C {...props} />
      </LimiteErro>
    );
    Protegida.displayName = `Protegida(${C.displayName ?? C.name ?? 'Tela'})`;
    W = Protegida;
    protegidas.set(C, W);
  }
  return W as T;
}

/** Voltar: a página anterior; sem anterior (ex.: página recarregada no navegador), o sistema. */
function voltar(navigation: any) {
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.navigate('Principal');
}
const Abas = createBottomTabNavigator();

const tema = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: cores.primaria, background: cores.fundo, card: cores.cartao, text: cores.texto, border: cores.borda },
};

const Pecuario = () => <Modulo chave="pecuario" />;
const Agricola = () => <Modulo chave="agricola" />;
const Financeiro = () => <Modulo chave="financeiro" />;
const Frota = () => <Modulo chave="frota" />;

function AbasPrincipais() {
  // A aba Financeiro só aparece para quem tem o Financeiro liberado na fazenda em uso;
  // Pecuário, Agrícola e Frota, para quem o Produtor marcou esses módulos (Mais › Usuários e acessos).
  const { fazendaAtiva, modoAdm } = useSessao();
  const verFinanceiro = fazendaAtiva?.financeiro !== false;
  // V137: no Administrativo só Financeiro e Mais; no Particular, Financeiro, Frota e Mais; nas fazendas, tudo o que a pessoa abre
  const particular = !modoAdm && fazendaAtiva?.tipo === 'particular';
  const naFazenda = !modoAdm && !particular;
  const verPecuario = naFazenda && podeModulo(fazendaAtiva, 'pecuario');
  const verAgricola = naFazenda && podeModulo(fazendaAtiva, 'agricola');
  const verFrota = !modoAdm && podeModulo(fazendaAtiva, 'frota');
  // PC (navegador largo): barra mais alta, letras maiores e os botões juntos no meio (não espalhados pela tela toda).
  // Celular pelo navegador (V130): barra mais alta, letra maior e uma folga embaixo, longe da faixa do iPhone.
  const pc = usePC();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const celularWeb = WEB && !pc;
  const folgaBaixo = celularWeb ? Math.max(insets.bottom, 14) : 0;
  // Sem o Painel, o sistema abre no primeiro módulo liberado para a pessoa.
  // (no Administrativo e no Particular, abre direto no Financeiro)
  const primeira = !naFazenda && verFinanceiro
    ? 'Financeiro'
    : verPecuario
      ? 'Pecuario'
      : verAgricola
        ? 'Agricola'
        : verFrota
          ? 'Frota'
          : verFinanceiro
            ? 'Financeiro'
            : 'Mais';
  return (
    <Abas.Navigator
      // trocar de unidade (pelas caixinhas) remonta as abas e abre na primeira delas
      key={modoAdm ? 'adm' : fazendaAtiva?.id ?? 'nenhuma'}
      initialRouteName={primeira}
      screenOptions={({ route, navigation }) => ({
        ...opcoesBarra,
        // V136: a barra tem 3 linhas (título, Grupo e, em letra menor, a fazenda em uso e quem está usando)
        headerStyle: { ...opcoesBarra.headerStyle, height: insets.top + (pc ? 84 : 72) },
        headerLeft: () => <BotaoVoltar aoTocar={() => (navigation.canGoBack() ? navigation.goBack() : navigation.getParent()?.navigate('Capa'))} />,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#B9CFBD',
        tabBarActiveBackgroundColor: cores.primaria,
        tabBarStyle: {
          backgroundColor: cores.primariaEscura,
          borderTopColor: cores.primariaEscura,
          ...(pc ? { height: 70, paddingHorizontal: Math.max(0, (width - 820) / 2) } : null),
          ...(celularWeb ? { height: 64 + folgaBaixo, paddingBottom: folgaBaixo, paddingTop: 4 } : null),
        },
        tabBarItemStyle: celularWeb ? { paddingVertical: 4, borderRadius: 10 } : pc ? { borderRadius: 10, marginVertical: 6 } : undefined,
        tabBarLabelStyle: { fontSize: pc ? 16 : celularWeb ? 13 : 12, fontWeight: '700' },
        tabBarIcon: ({ color, size, focused }) => {
          const icones: Record<string, [string, string]> = {
            Pecuario: ['paw', 'paw-outline'],
            Agricola: ['leaf', 'leaf-outline'],
            Frota: ['car-sport', 'car-sport-outline'],
            Financeiro: ['cash', 'cash-outline'],
            Mais: ['menu', 'menu-outline'],
          };
          const [cheio, vazio] = icones[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={(focused ? cheio : vazio) as any} size={pc ? 27 : celularWeb ? 26 : size} color={color} />;
        },
      })}
    >
      {verPecuario && <Abas.Screen name="Pecuario" component={P(Pecuario)} options={{ title: 'Pecuário' }} />}
      {verAgricola && <Abas.Screen name="Agricola" component={P(Agricola)} options={{ title: 'Agrícola' }} />}
      {verFrota && <Abas.Screen name="Frota" component={P(Frota)} options={{ title: 'Frota' }} />}
      {verFinanceiro && <Abas.Screen name="Financeiro" component={P(Financeiro)} options={{ title: 'Financeiro' }} />}
      <Abas.Screen name="Mais" component={P(Mais)} options={{ title: 'Mais' }} />
    </Abas.Navigator>
  );
}

export default function Navegacao() {
  const { sessao, carregando, fazendas, entradaPausada, novaSenha } = useSessao();

  if (carregando && !novaSenha) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo }}>
        <ActivityIndicator size="large" color={cores.primaria} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={tema}>
      <Pilha.Navigator
        screenOptions={({ navigation }) =>
          sessao && !entradaPausada && !novaSenha && fazendas.length > 0
            ? { ...opcoesBarra, headerBackVisible: false, headerLeft: () => <BotaoVoltar aoTocar={() => voltar(navigation)} /> }
            : { headerBackTitle: 'Voltar', headerTintColor: cores.primaria, headerTitleStyle: { fontSize: WEB ? 22 : 18, fontWeight: '700' } }
        }
      >
        {novaSenha ? (
          <Pilha.Screen name="NovaSenha" component={P(NovaSenha)} options={{ title: 'Senha nova', headerBackVisible: false }} />
        ) : !sessao || entradaPausada ? (
          <>
            <Pilha.Screen name="Entrar" component={P(Entrar)} options={{ headerShown: false }} />
            <Pilha.Screen name="CriarConta" component={P(CriarConta)} options={{ title: 'Criar conta' }} />
            <Pilha.Screen name="EsqueciSenha" component={P(EsqueciSenha)} options={{ title: 'Esqueci minha senha' }} />
          </>
        ) : fazendas.length === 0 ? (
          <Pilha.Screen name="PrimeiroAcesso" component={P(PrimeiroAcesso)} options={{ headerShown: false }} />
        ) : (
          <>
            <Pilha.Screen name="Capa" component={P(Capa)} options={{ headerShown: false }} />
            <Pilha.Screen name="Principal" component={P(AbasPrincipais)} options={{ headerShown: false }} />
            <Pilha.Screen name="TitulosSemana" component={P(TitulosSemana)} />
            <Pilha.Screen name="EmConstrucao" component={P(EmConstrucao)} options={({ route }) => ({ title: route.params.titulo })} />
            <Pilha.Screen name="Agenda" component={P(Agenda)} options={{ title: 'Agenda' }} />
            <Pilha.Screen name="PessoaForm" component={P(PessoaForm)} options={{ title: 'Pessoa' }} />
            <Pilha.Screen name="FazendaForm" component={P(FazendaForm)} options={{ title: 'Fazenda' }} />
            <Pilha.Screen name="ProdutorForm" component={P(ProdutorForm)} options={{ title: 'Produtor' }} />
            <Pilha.Screen name="UsuarioForm" component={P(UsuarioForm)} options={{ title: 'Usuários e acessos' }} />
            <Pilha.Screen name="ContaForm" component={P(ContaForm)} options={{ title: 'Conta' }} />
            <Pilha.Screen name="InsumoForm" component={P(InsumoForm)} options={{ title: 'Insumo' }} />
            <Pilha.Screen name="ContaBancariaForm" component={P(ContaBancariaForm)} options={{ title: 'Bancos e caixa' }} />
            <Pilha.Screen name="CentroForm" component={P(CentroForm)} options={{ title: 'Centro de custo' }} />
            <Pilha.Screen name="AreaForm" component={P(AreaForm)} />
            <Pilha.Screen name="MangaDetalhe" component={P(MangaDetalhe)} options={{ title: 'Manga' }} />
            <Pilha.Screen name="VisaoPasto" component={P(VisaoPasto)} options={{ title: 'Visão do Pasto' }} />
            <Pilha.Screen name="CompraForm" component={P(CompraForm)} options={{ title: 'Compras' }} />
            <Pilha.Screen name="CompraDetalhe" component={P(CompraDetalhe)} options={{ title: 'Compra' }} />
            <Pilha.Screen name="TituloForm" component={P(TituloForm)} options={({ route }) => ({ title: route.params?.tipo === 'receber' ? 'Contas a receber' : 'Contas a pagar' })} />
            <Pilha.Screen name="VendaForm" component={P(VendaForm)} options={{ title: 'Vendas' }} />
            <Pilha.Screen name="VendaDetalhe" component={P(VendaDetalhe)} options={{ title: 'Venda' }} />
            <Pilha.Screen name="TituloBaixa" component={P(TituloBaixa)} options={{ title: 'Título' }} />
            <Pilha.Screen name="TituloDetalhe" component={P(TituloDetalhe)} options={{ title: 'Título' }} />
            <Pilha.Screen name="ImobilizadoForm" component={P(ImobilizadoForm)} options={{ title: 'Imobilizado' }} />
            <Pilha.Screen name="FinanciamentoForm" component={P(FinanciamentoForm)} options={{ title: 'Financiamentos' }} />
            <Pilha.Screen name="RelatorioCaixa" component={P(RelatorioCaixa)} options={{ title: 'Extrato e fluxo de caixa' }} />
            <Pilha.Screen name="RelatorioResultado" component={P(RelatorioResultado)} options={{ title: 'Resultado da atividade' }} />
            <Pilha.Screen name="ExportarContabilidade" component={P(ExportarContabilidade)} options={{ title: 'Exportar para a contabilidade' }} />
            <Pilha.Screen name="TipoLancamentoForm" component={P(TipoLancamentoForm)} options={{ title: 'Tipos de despesa e receita' }} />
            <Pilha.Screen name="ImobilizadoDetalhe" component={P(ImobilizadoDetalhe)} options={{ title: 'Bem' }} />
            <Pilha.Screen name="TransferenciaForm" component={P(TransferenciaForm)} options={{ title: 'Transferências' }} />
            <Pilha.Screen name="ConciliacaoBancaria" component={P(ConciliacaoBancaria)} options={{ title: 'Conciliação bancária' }} />
            <Pilha.Screen name="TalhaoForm" component={P(TalhaoForm)} options={{ title: 'Talhões' }} />
            <Pilha.Screen name="TalhaoDetalhe" component={P(TalhaoDetalhe)} options={{ title: 'Talhão' }} />
            <Pilha.Screen name="AnaliseForm" component={P(AnaliseForm)} options={{ title: 'Análise' }} />
            <Pilha.Screen name="AnaliseDetalhe" component={P(AnaliseDetalhe)} options={{ title: 'Análise' }} />
            <Pilha.Screen name="AtividadeForm" component={P(AtividadeForm)} options={{ title: 'Atividades' }} />
            <Pilha.Screen name="AtividadeDetalhe" component={P(AtividadeDetalhe)} options={{ title: 'Atividade' }} />
            <Pilha.Screen name="SafraForm" component={P(SafraForm)} options={{ title: 'Safras' }} />
            <Pilha.Screen name="SafraDetalhe" component={P(SafraDetalhe)} options={{ title: 'Safra' }} />
            <Pilha.Screen name="ColheitaForm" component={P(ColheitaForm)} options={{ title: 'Colheitas' }} />
            <Pilha.Screen name="ColheitaDetalhe" component={P(ColheitaDetalhe)} options={{ title: 'Colheita' }} />
            <Pilha.Screen name="FechamentoColheita" component={P(FechamentoColheita)} options={{ title: 'Fechamento' }} />
            <Pilha.Screen name="PosColheitaForm" component={P(PosColheitaForm)} options={{ title: 'Secagem e pilagem' }} />
            <Pilha.Screen name="PosColheitaDetalhe" component={P(PosColheitaDetalhe)} />
            <Pilha.Screen name="ArmazemForm" component={P(ArmazemForm)} options={{ title: 'Armazém de café' }} />
            <Pilha.Screen name="ContratoCafeForm" component={P(ContratoCafeForm)} options={{ title: 'Contrato de café' }} />
            <Pilha.Screen name="ContratoCafeDetalhe" component={P(ContratoCafeDetalhe)} options={{ title: 'Contrato de café' }} />
            <Pilha.Screen name="LoteCafeDetalhe" component={P(LoteCafeDetalhe)} options={{ title: 'Lote de café' }} />
            <Pilha.Screen name="MonitoramentoForm" component={P(MonitoramentoForm)} options={{ title: 'Pragas e doenças' }} />
            <Pilha.Screen name="MonitoramentoDetalhe" component={P(MonitoramentoDetalhe)} options={{ title: 'Ocorrência' }} />
            <Pilha.Screen name="SateliteTalhao" component={P(SateliteTalhao)} options={{ title: 'Satélite' }} />
            <Pilha.Screen name="ClimaForm" component={P(ClimaForm)} options={{ title: 'Clima e chuva' }} />
            <Pilha.Screen name="PlanoAdubacao" component={P(PlanoAdubacao)} options={{ title: 'Plano de adubação' }} />
            <Pilha.Screen name="DesenharArea" component={P(DesenharArea)} options={{ title: 'Desenhar no mapa' }} />
            <Pilha.Screen name="RacaForm" component={P(RacaForm)} options={{ title: 'Raça' }} />
            <Pilha.Screen name="FerroForm" component={P(FerroForm)} options={{ title: 'Ferro' }} />
            <Pilha.Screen name="Animais" component={P(Animais)} options={{ title: 'Animais' }} />
            <Pilha.Screen name="AnimalForm" component={P(AnimalForm)} options={{ title: 'Animal' }} />
            <Pilha.Screen name="ConsultaAnimal" component={P(ConsultaAnimal)} options={{ title: 'Consultar animal' }} />
            <Pilha.Screen name="LoteForm" component={P(LoteForm)} options={{ title: 'Lote' }} />
            <Pilha.Screen name="LoteDetalhe" component={P(LoteDetalhe)} options={{ title: 'Lote' }} />
            <Pilha.Screen name="MovimentacaoForm" component={P(MovimentacaoForm)} options={{ title: 'Movimentações' }} />
            <Pilha.Screen name="MovimentacaoDetalhe" component={P(MovimentacaoDetalhe)} options={{ title: 'Movimentação' }} />
            <Pilha.Screen name="PesagemForm" component={P(PesagemForm)} options={{ title: 'Pesagens' }} />
            <Pilha.Screen name="PesagemDetalhe" component={P(PesagemDetalhe)} options={{ title: 'Pesagem' }} />
            <Pilha.Screen name="SanidadeForm" component={P(SanidadeForm)} options={{ title: 'Sanidade' }} />
            <Pilha.Screen name="SanidadeDetalhe" component={P(SanidadeDetalhe)} options={{ title: 'Sanidade' }} />
            <Pilha.Screen name="FrotaPainel" component={P(FrotaPainel)} options={{ title: 'Situação da frota' }} />
            <Pilha.Screen name="VeiculoForm" component={P(VeiculoForm)} options={{ title: 'Veículos e máquinas' }} />
            <Pilha.Screen name="VeiculoDetalhe" component={P(VeiculoDetalhe)} options={{ title: 'Veículo' }} />
            <Pilha.Screen name="AbastecimentoForm" component={P(AbastecimentoForm)} options={{ title: 'Abastecimentos' }} />
            <Pilha.Screen name="ManutencaoForm" component={P(ManutencaoForm)} options={{ title: 'Manutenções' }} />
            <Pilha.Screen name="LeituraForm" component={P(LeituraForm)} options={{ title: 'Atualizar km ou horas' }} />
            <Pilha.Screen name="FrotaRelatorio" component={P(FrotaRelatorio)} options={{ title: 'Gastos da frota' }} />
            <Pilha.Screen name="FreteForm" component={P(FreteForm)} options={{ title: 'Fretes' }} />
            <Pilha.Screen name="RegistroLancamentos" component={P(RegistroLancamentos)} options={{ title: 'Auditoria' }} />
            <Pilha.Screen name="CopiaSeguranca" component={P(CopiaSeguranca)} options={{ title: 'Cópia de segurança' }} />
            <Pilha.Screen name="NotaFiscalConfig" component={P(NotaFiscalConfig)} options={{ title: 'Nota fiscal (NF-e)' }} />
            <Pilha.Screen name="DietaForm" component={P(DietaForm)} options={{ title: 'Dietas' }} />
            <Pilha.Screen name="DietaDetalhe" component={P(DietaDetalhe)} options={{ title: 'Dieta' }} />
            <Pilha.Screen name="AlimentoForm" component={P(AlimentoForm)} options={{ title: 'Alimentos' }} />
            <Pilha.Screen name="ReproducaoForm" component={P(ReproducaoForm)} options={{ title: 'Reprodução' }} />
            <Pilha.Screen name="ReproFemea" component={P(ReproFemea)} options={{ title: 'Fêmea' }} />
            <Pilha.Screen name="IatfDetalhe" component={P(IatfDetalhe)} options={{ title: 'IATF' }} />
          </>
        )}
      </Pilha.Navigator>
    </NavigationContainer>
  );
}
