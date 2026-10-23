import React, { useCallback, useEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Vazio from '../../componentes/Vazio';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { agruparDigitacao, formatarMoeda, formatarNumero, formatarQtd, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import {
  CARGAS_COMUNS, COBRANCAS, UNIDADES_CARGA, carregarVeiculos, combustivelDaViagem, itemVeiculo, lerLeiturasAtuais, textoLeitura,
  type LeituraAtual, type Veiculo,
} from '../../lib/frota';
import type { PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const n = (t: string) => lerNumero(t);
const r2 = (x: number) => Math.round(x * 100) / 100;
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const uf = (t: string) => t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);

type AbViagem = { chave: string; data: string; km: string; combustivel: string; litros: string; valor: string; arlaL: string; arlaV: string; local: string };
type MnViagem = { chave: string; data: string; km: string; descricao: string; valor: string; local: string };
let cont = 0;
const chave = () => `v${Date.now()}_${cont++}`;

/**
 * Frota › Fretes: a viagem do caminhão (ou de outro veículo), para terceiros (receita no Contas a receber)
 * ou transporte próprio. Km de saída e chegada, carga, documentos, valor do frete, despesas da viagem
 * (pedágio, alimentação, hospedagem, diária, carga e descarga, comissão do motorista) e o resultado por km.
 */
export default function FreteForm() {
  const { params } = useRoute<RouteProp<PilhaParams, 'FreteForm'>>();
  const { fazendaAtiva } = useSessao();
  // quem não vê o Financeiro não escolhe caixa nem banco: a despesa vai para o Contas a pagar e o escritório dá a baixa
  const padraoPagto = fazendaAtiva?.financeiro === false ? 'prazo' : 'pago';
  const fid = fazendaAtiva?.id;

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [leituras, setLeituras] = useState<Record<string, LeituraAtual>>({});
  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [tipo, setTipo] = useState<string[]>(['terceiro']);
  const [saida, setSaida] = useState(hojeBR());
  const [chegada, setChegada] = useState('');
  const [veiculoId, setVeiculoId] = useState<string | null>(params?.veiculoId ?? null);
  const [motoristaId, setMotoristaId] = useState<string | null>(null);
  const [contratanteId, setContratanteId] = useState<string | null>(null);
  const [oLocal, setOLocal] = useState('');
  const [oMun, setOMun] = useState('');
  const [oUf, setOUf] = useState('');
  const [dLocal, setDLocal] = useState('');
  const [dRegiao, setDRegiao] = useState('');
  const [dMun, setDMun] = useState('');
  const [dUf, setDUf] = useState('');
  const [carga, setCarga] = useState('');
  const [qtd, setQtd] = useState('');
  const [unidade, setUnidade] = useState<string[]>([]);
  const [peso, setPeso] = useState('');
  const [nf, setNf] = useState('');
  const [cte, setCte] = useState('');
  const [mdfe, setMdfe] = useState('');
  const [gta, setGta] = useState('');
  const [kmS, setKmS] = useState('');
  const [kmC, setKmC] = useState('');
  const [cobranca, setCobranca] = useState<string[]>(['fechado']);
  const [preco, setPreco] = useState('');
  const [valorFechado, setValorFechado] = useState('');
  const [descontos, setDescontos] = useState('');
  const [receber, setReceber] = useState<string[]>(['prazo']);
  const [contaId, setContaId] = useState<string | null>(null);
  const [vencimento, setVencimento] = useState('');
  const [pedagio, setPedagio] = useState('');
  const [alimentacao, setAlimentacao] = useState('');
  const [hospedagem, setHospedagem] = useState('');
  const [diaria, setDiaria] = useState('');
  const [cargaDescarga, setCargaDescarga] = useState('');
  const [outras, setOutras] = useState('');
  const [comissao, setComissao] = useState('');
  const [despPago, setDespPago] = useState<string[]>([padraoPagto]);
  const [despContaId, setDespContaId] = useState<string | null>(null);
  const [despVenc, setDespVenc] = useState('');
  const [obs, setObs] = useState('');
  const [abViagem, setAbViagem] = useState<AbViagem[]>([]);
  const [mnViagem, setMnViagem] = useState<MnViagem[]>([]);
  const [comb, setComb] = useState<{ valor: number | null; litros: number | null; estimado: boolean } | null>(null);
  const [alterarNum, setAlterarNum] = useState('');

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const terceiro = tipo[0] === 'terceiro';
  const veiculo = veiculos.find((v) => v.id === veiculoId) ?? null;
  const atual = veiculoId ? leituras[veiculoId] : null;
  const km = n(kmS) != null && n(kmC) != null && n(kmC)! >= n(kmS)! ? n(kmC)! - n(kmS)! : null;
  const valorFrete = !terceiro
    ? 0
    : cobranca[0] === 'km'
      ? r2((n(preco) ?? 0) * (km ?? 0))
      : cobranca[0] === 'tonelada'
        ? r2(((n(preco) ?? 0) * (n(peso) ?? 0)) / 1000)
        : cobranca[0] === 'unidade'
          ? r2((n(preco) ?? 0) * (n(qtd) ?? 0))
          : n(valorFechado) ?? 0;
  const liquido = r2(valorFrete - (terceiro ? n(descontos) ?? 0 : 0));
  const valorComissao = r2((valorFrete * (n(comissao) ?? 0)) / 100);
  const despesas = r2([pedagio, alimentacao, hospedagem, diaria, cargaDescarga, outras].reduce((s, x) => s + (n(x) ?? 0), 0) + valorComissao);
  const abValor = r2(abViagem.reduce((s, a) => s + (n(a.valor) ?? 0) + (n(a.arlaV) ?? 0), 0));
  const abLitros = abViagem.reduce((s, a) => s + (n(a.litros) ?? 0), 0);
  const mnValor = r2(mnViagem.reduce((s, m) => s + (n(m.valor) ?? 0), 0));
  const despesasTotal = r2(despesas + abValor + mnValor);
  const resultado = r2(liquido - despesas - mnValor - (comb?.valor ?? 0));

  const recarregar = useCallback(async () => {
    try {
      const [vs, ls] = await Promise.all([carregarVeiculos(fid, true), lerLeiturasAtuais()]);
      setVeiculos(vs);
      setLeituras(ls);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);
  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // combustível da viagem (abastecimentos entre a saída e a chegada; sem eles, estimado pelos km)
  useEffect(() => {
    const de = paraBanco(saida);
    if (!veiculo || !de) return setComb(null);
    const ate = (chegada && paraBanco(chegada)) || de;
    const t = setTimeout(() => {
      combustivelDaViagem(veiculo.id, veiculo.medidor, de, ate, km, { valor: abValor, litros: abLitros }).then(setComb).catch(() => setComb(null));
    }, 400);
    return () => clearTimeout(t);
  }, [veiculo, saida, chegada, km, abValor, abLitros]);

  const carregarVeiculosLista = useCallback(async (): Promise<ItemLista[]> => veiculos.filter((v) => v.ativo).map((v) => itemVeiculo(v, leituras[v.id])), [veiculos, leituras]);
  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.filter((c) => !c.fazenda_id || c.fazenda_id === fid).map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }));
  }, [fid]);

  function limpar() {
    setId(null);
    setNumero(null);
    setTipo(['terceiro']);
    setSaida(hojeBR());
    setChegada('');
    setVeiculoId(null);
    setMotoristaId(null);
    setContratanteId(null);
    setOLocal('');
    setOMun('');
    setOUf('');
    setDLocal('');
    setDRegiao('');
    setDMun('');
    setDUf('');
    setCarga('');
    setQtd('');
    setUnidade([]);
    setPeso('');
    setNf('');
    setCte('');
    setMdfe('');
    setGta('');
    setKmS('');
    setKmC('');
    setCobranca(['fechado']);
    setPreco('');
    setValorFechado('');
    setDescontos('');
    setReceber(['prazo']);
    setVencimento('');
    setPedagio('');
    setAlimentacao('');
    setHospedagem('');
    setDiaria('');
    setCargaDescarga('');
    setOutras('');
    setComissao('');
    setDespPago([padraoPagto]);
    setDespVenc('');
    setObs('');
    setAbViagem([]);
    setMnViagem([]);
    setErros({});
  }

  async function abrir(fretId: string) {
    setCarregando(true);
    setErro(null);
    try {
      const [f, abs, mns] = await Promise.all([
        consulta<any>(supabase.from('frota_fretes').select('*').eq('id', fretId).single()),
        consulta<any[]>(supabase.from('frota_abastecimentos').select('*').eq('frete_id', fretId).order('data').order('leitura')),
        consulta<any[]>(supabase.from('frota_manutencoes').select('*').eq('frete_id', fretId).order('data')),
      ]);
      const m = (v: any) => (Number(v) > 0 ? moedaParaCampo(v) : '');
      setId(f.id);
      setNumero(f.numero);
      setTipo([f.tipo]);
      setSaida(doBanco(f.data_saida));
      setChegada(f.data_chegada ? doBanco(f.data_chegada) : '');
      setVeiculoId(f.veiculo_id);
      setMotoristaId(f.motorista_id);
      setContratanteId(f.pessoa_id);
      setOLocal(f.origem_local ?? '');
      setOMun(f.origem_municipio ?? '');
      setOUf(f.origem_uf ?? '');
      setDLocal(f.destino_local ?? '');
      setDRegiao(f.destino_regiao ?? '');
      setDMun(f.destino_municipio ?? '');
      setDUf(f.destino_uf ?? '');
      setCarga(f.carga ?? '');
      setQtd(numeroParaCampo(f.carga_qtd));
      setUnidade(f.carga_unidade ? [f.carga_unidade] : []);
      setPeso(numeroParaCampo(f.peso_kg));
      setNf(f.nota_fiscal ?? '');
      setCte(f.cte ?? '');
      setMdfe(f.mdfe ?? '');
      setGta(f.gta ?? '');
      setKmS(numeroParaCampo(f.km_saida));
      setKmC(numeroParaCampo(f.km_chegada));
      setCobranca([f.cobranca]);
      setPreco(f.preco != null ? formatarNumero(Number(f.preco), 2) : '');
      setValorFechado(f.cobranca === 'fechado' ? m(f.valor_frete) : '');
      setDescontos(m(f.descontos));
      setReceber([f.receber_avista ? 'avista' : 'prazo']);
      setContaId(f.conta_bancaria_id);
      setVencimento(f.vencimento ? doBanco(f.vencimento) : '');
      setPedagio(m(f.pedagio));
      setAlimentacao(m(f.alimentacao));
      setHospedagem(m(f.hospedagem));
      setDiaria(m(f.diaria_motorista));
      setCargaDescarga(m(f.carga_descarga));
      setOutras(m(f.outras_despesas));
      setComissao(Number(f.comissao_perc) > 0 ? numeroParaCampo(f.comissao_perc) : '');
      setDespPago([f.despesas_pagas ? 'pago' : 'prazo']);
      setDespContaId(f.despesas_conta_id);
      setDespVenc(f.despesas_vencimento ? doBanco(f.despesas_vencimento) : '');
      setObs(f.observacoes ?? '');
      setAbViagem(
        abs.map((a) => ({
          chave: chave(),
          data: doBanco(a.data),
          km: numeroParaCampo(a.leitura),
          combustivel: a.combustivel ?? '',
          litros: numeroParaCampo(a.litros),
          valor: moedaParaCampo(a.valor_total),
          arlaL: numeroParaCampo(a.arla_litros),
          arlaV: moedaParaCampo(a.arla_valor),
          local: a.observacoes ?? '',
        })),
      );
      setMnViagem(mns.map((m) => ({ chave: chave(), data: doBanco(m.data), km: numeroParaCampo(m.leitura), descricao: m.descricao ?? '', valor: moedaParaCampo(m.valor_servico), local: m.observacoes ?? '' })));
      setAba('cadastrar');
      setErros({});
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setCarregando(false);
  }

  useEffect(() => {
    if (params?.id) abrir(params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  function mudarAb(k: string, campo: keyof AbViagem, valor: string) {
    setAbViagem((l) => l.map((x) => (x.chave === k ? { ...x, [campo]: valor } : x)));
  }
  function mudarMn(k: string, campo: keyof MnViagem, valor: string) {
    setMnViagem((l) => l.map((x) => (x.chave === k ? { ...x, [campo]: valor } : x)));
  }

  async function abrirPorNumero() {
    const mm = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!mm || !fid) return setErro('Digite o número do frete.');
    const { data: x } = await supabase.from('frota_fretes').select('id').eq('fazenda_id', fid).eq('numero', Number(mm[1])).maybeSingle();
    if (!x) return setErro(`Não há frete nº ${mm[1]} nesta fazenda.`);
    setAlterarNum('');
    abrir(x.id);
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(saida)) e.saida = 'Informe a data de saída.';
    if (chegada.trim() && !dataValida(chegada)) e.chegada = 'Data inválida.';
    if (!veiculoId) e.veiculo = 'Escolha o veículo.';
    if (terceiro && !contratanteId) e.contratante = 'Informe o contratante (quem paga o frete).';
    if (n(kmS) != null && n(kmC) != null && n(kmC)! < n(kmS)!) e.km = 'O km de chegada é menor que o de saída.';
    if (terceiro) {
      if (valorFrete <= 0) e.valor = cobranca[0] === 'fechado' ? 'Informe o valor do frete.' : 'Informe o preço e a quantidade (km, peso ou unidades) para calcular o frete.';
      if (receber[0] === 'avista' && !contaId) e.conta = 'Escolha o caixa ou o banco em que o dinheiro entrou.';
      if (receber[0] === 'prazo' && !dataValida(vencimento)) e.venc = 'Informe o vencimento.';
    }
    if ((n(comissao) ?? 0) > 100) e.comissao = 'Comissão de 0 a 100%.';
    if (abViagem.some((a) => !(n(a.litros)! > 0) || !(n(a.valor)! > 0) || (a.data.trim() && !dataValida(a.data)))) e.abViagem = 'Abastecimentos na viagem: confira a data, os litros e o valor de cada um.';
    if (mnViagem.some((m) => !m.descricao.trim() || (m.data.trim() && !dataValida(m.data)))) e.mnViagem = 'Manutenções na estrada: diga o que foi feito em cada uma e confira a data.';
    if (despesasTotal > 0 && despPago[0] === 'pago' && !despContaId) e.despConta = 'Despesas pagas: escolha de onde saiu o dinheiro.';
    if (despesasTotal > 0 && despPago[0] === 'prazo' && !dataValida(despVenc)) e.despVenc = 'Informe o vencimento das despesas.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    const p = {
      id,
      fazenda_id: fid,
      tipo: tipo[0],
      veiculo_id: veiculoId,
      motorista_id: motoristaId,
      pessoa_id: terceiro ? contratanteId : null,
      data_saida: paraBanco(saida),
      data_chegada: chegada.trim() ? paraBanco(chegada) : null,
      origem_local: oLocal,
      origem_municipio: oMun,
      origem_uf: oUf,
      destino_local: dLocal,
      destino_regiao: dRegiao,
      destino_municipio: dMun,
      destino_uf: dUf,
      carga,
      carga_qtd: n(qtd),
      carga_unidade: unidade[0] ?? null,
      peso_kg: n(peso),
      nota_fiscal: nf,
      cte,
      mdfe,
      gta,
      km_saida: n(kmS),
      km_chegada: n(kmC),
      cobranca: cobranca[0],
      preco: cobranca[0] === 'fechado' ? null : n(preco),
      valor_frete: valorFrete,
      descontos: n(descontos) ?? 0,
      receber_avista: receber[0] === 'avista',
      conta_bancaria_id: contaId,
      vencimento: receber[0] === 'prazo' && vencimento.trim() ? paraBanco(vencimento) : null,
      comissao_perc: n(comissao) ?? 0,
      pedagio: n(pedagio) ?? 0,
      alimentacao: n(alimentacao) ?? 0,
      hospedagem: n(hospedagem) ?? 0,
      diaria_motorista: n(diaria) ?? 0,
      carga_descarga: n(cargaDescarga) ?? 0,
      outras_despesas: n(outras) ?? 0,
      despesas_pagas: despPago[0] === 'pago',
      despesas_conta_id: despContaId,
      despesas_vencimento: despPago[0] === 'prazo' && despVenc.trim() ? paraBanco(despVenc) : null,
      observacoes: obs,
      abastecimentos: abViagem.map((a) => ({
        data: a.data.trim() ? paraBanco(a.data) : null,
        km: n(a.km),
        combustivel: a.combustivel.trim() || null,
        litros: n(a.litros),
        valor: n(a.valor),
        arla_litros: n(a.arlaL),
        arla_valor: n(a.arlaV) ?? 0,
        local: a.local,
      })),
      manutencoes: mnViagem.map((m) => ({ data: m.data.trim() ? paraBanco(m.data) : null, km: n(m.km), descricao: m.descricao, valor: n(m.valor) ?? 0, local: m.local })),
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_frete', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; valor: number; liquido: number; despesas: number; combustivel_viagem: number; manutencao_viagem: number; km: number | null; recebido: string | null; despesa_compra: number | null; despesa_baixa: string | null };
    const partes = [`Frete nº ${res.numero} ${id ? 'alterado' : 'lançado'}${res.km ? ` (${formatarQtd(res.km, 1)} km)` : ''}.`];
    if (terceiro) partes.push(res.recebido ? `Recebido ${formatarMoeda(res.liquido)}${res.recebido === 'pendente' ? ' (aguardando a confirmação do dono)' : ''}.` : `${formatarMoeda(res.liquido)} no Contas a receber.`);
    if (res.despesas > 0)
      partes.push(
        `Despesas da viagem: ${formatarMoeda(res.despesas)}${res.combustivel_viagem > 0 ? ` (combustível e Arla na estrada ${formatarMoeda(res.combustivel_viagem)})` : ''}${res.manutencao_viagem > 0 ? ` (manutenção na estrada ${formatarMoeda(res.manutencao_viagem)})` : ''}${despPago[0] === 'pago' ? ', pagas' : ', no Contas a pagar'} (compra nº ${res.despesa_compra}).`,
      );
    setAviso(partes.join(' '));
    limpar();
    recarregar();
  }

  function excluir() {
    Alert.alert('Excluir', `Excluir o frete nº ${numero}? Sai do Contas a receber e as despesas da viagem saem junto.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_frete', { p_id: id }), 'frete_id', String(id));
          if (error) return setErro(traduzirErro(error));
          setAviso(`Frete nº ${numero} excluído.`);
          limpar();
          recarregar();
        },
      },
    ]);
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Lançar" />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaFretes aoAbrir={abrir} />
      </Tela>
    );
  }

  const precoRotulo = cobranca[0] === 'km' ? 'R$ por km' : cobranca[0] === 'tonelada' ? 'R$ por tonelada' : `R$ por ${unidade[0] ?? 'unidade'}`;
  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Frete nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : 'novo'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Saída *" valor={saida} aoMudar={setSaida} erro={erros.saida} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair deste e lançar outro
        </Text>
      ) : (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar o frete nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      )}
      <CampoData rotulo="Chegada (em branco = em viagem)" valor={chegada} aoMudar={setChegada} erro={erros.chegada} />

      <Escolha
        rotulo="Tipo de frete"
        opcoes={[
          { valor: 'terceiro', rotulo: 'Para terceiros (receita)' },
          { valor: 'proprio', rotulo: 'Transporte próprio' },
        ]}
        valor={tipo}
        aoMudar={setTipo}
      />
      {!terceiro && <Text style={estilos.nota}>Transporte da própria produção ou de insumos: não gera receita; as despesas da viagem vão para "Frete de venda" e o resultado mostra quanto custou levar a carga.</Text>}

      <SeletorLista rotulo="Veículo *" valorId={veiculoId} aoMudar={setVeiculoId} carregar={carregarVeiculosLista} dicaBusca="Nome ou placa" erro={erros.veiculo} vazio="Nenhum veículo cadastrado. Cadastre em Frota › Veículos e máquinas." />
      <CampoPessoaBusca rotulo="Motorista" valorId={motoristaId} aoMudar={setMotoristaId} tipoNovo="funcionario" />
      {terceiro && <CampoPessoaBusca rotulo="Contratante (quem paga o frete) *" valorId={contratanteId} aoMudar={setContratanteId} tipoNovo="cliente" erro={erros.contratante} />}

      <Secao titulo="Origem" />
      <Campo rotulo="Fazenda / local de carregamento" value={oLocal} onChangeText={setOLocal} autoCapitalize="words" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Município" value={oMun} onChangeText={setOMun} autoCapitalize="words" />
        </View>
        <View style={{ width: 80 }}>
          <Campo rotulo="UF" value={oUf} onChangeText={(t) => setOUf(uf(t))} autoCapitalize="characters" maxLength={2} />
        </View>
      </View>

      <Secao titulo="Destino" />
      <Campo rotulo="Fazenda / local de entrega" value={dLocal} onChangeText={setDLocal} autoCapitalize="words" placeholder="Ex.: Fazenda Boa Vista, Cooperativa, Frigorífico" />
      <Campo rotulo="Região" value={dRegiao} onChangeText={setDRegiao} autoCapitalize="words" placeholder="Ex.: Norte do ES, Sul da Bahia" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Município" value={dMun} onChangeText={setDMun} autoCapitalize="words" />
        </View>
        <View style={{ width: 80 }}>
          <Campo rotulo="UF" value={dUf} onChangeText={(t) => setDUf(uf(t))} autoCapitalize="characters" maxLength={2} />
        </View>
      </View>

      <Secao titulo="Carga e documentos" />
      <Escolha rotulo="Carga" opcoes={CARGAS_COMUNS.map((c) => ({ valor: c, rotulo: c }))} valor={CARGAS_COMUNS.includes(carga) ? [carga] : []} aoMudar={(v) => setCarga(v[0] === 'Outro' ? '' : v[0] ?? '')} />
      <Campo rotulo="Descrição da carga" value={carga} onChangeText={setCarga} autoCapitalize="sentences" placeholder="Ex.: Café conilon beneficiado, Bois gordos" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Quantidade" value={qtd} onChangeText={(t) => setQtd(agruparDigitacao(t))} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Peso (kg)" value={peso} onChangeText={(t) => setPeso(agruparDigitacao(t))} keyboardType="decimal-pad" />
        </View>
      </View>
      <Escolha rotulo="Unidade" opcoes={UNIDADES_CARGA} valor={unidade} aoMudar={(v) => setUnidade(unidade[0] === v[0] ? [] : v)} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Nota fiscal" value={nf} onChangeText={setNf} autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="CT-e" value={cte} onChangeText={setCte} autoCapitalize="characters" />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="MDF-e" value={mdfe} onChangeText={setMdfe} autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="GTA (gado)" value={gta} onChangeText={setGta} autoCapitalize="characters" />
        </View>
      </View>

      <Secao titulo="Quilometragem" />
      {veiculo && veiculo.medidor === 'km' && <Text style={estilos.nota}>Última leitura do veículo: {textoLeitura(atual?.leitura, 'km')}{atual?.data ? ` em ${doBanco(atual.data)}` : ''}</Text>}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Km de saída" value={kmS} onChangeText={(t) => setKmS(agruparDigitacao(t))} keyboardType="decimal-pad" erro={erros.km} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Km de chegada" value={kmC} onChangeText={(t) => setKmC(agruparDigitacao(t))} keyboardType="decimal-pad" />
        </View>
      </View>
      {km != null && <Text style={estilos.destaque}>{formatarQtd(km, 1)} km rodados</Text>}
      <Text style={estilos.nota}>Os km entram no hodômetro do veículo: valem para o consumo e para os avisos de manutenção.</Text>

      {terceiro && (
        <>
          <Secao titulo="Valor do frete" />
          <Escolha rotulo="Forma de cobrança" opcoes={COBRANCAS} valor={cobranca} aoMudar={setCobranca} />
          {cobranca[0] === 'fechado' ? (
            <CampoMoeda rotulo="Valor do frete (R$) *" valor={valorFechado} aoMudar={setValorFechado} erro={erros.valor} />
          ) : (
            <>
              <Campo rotulo={`${precoRotulo} *`} value={preco} onChangeText={(t) => setPreco(agruparDigitacao(t))} keyboardType="decimal-pad" erro={erros.valor} />
              <Text style={estilos.destaque}>
                Frete: {formatarMoeda(valorFrete)}
                {cobranca[0] === 'tonelada' && !n(peso) ? ' (informe o peso)' : cobranca[0] === 'km' && km == null ? ' (informe os km)' : cobranca[0] === 'unidade' && !n(qtd) ? ' (informe a quantidade)' : ''}
              </Text>
            </>
          )}
          <CampoMoeda rotulo="Descontos (impostos e retenções do contratante)" valor={descontos} aoMudar={setDescontos} />
          <Text style={estilos.nota}>A receber: {formatarMoeda(liquido)}</Text>
          <Escolha
            rotulo="Recebimento"
            opcoes={[
              { valor: 'prazo', rotulo: 'A receber' },
              { valor: 'avista', rotulo: 'Já recebi' },
            ]}
            valor={receber}
            aoMudar={setReceber}
          />
          {receber[0] === 'avista' ? (
            <SeletorLista rotulo="Onde o dinheiro entrou *" valorId={contaId} aoMudar={setContaId} carregar={carregarBancos} erro={erros.conta} vazio={fazendaAtiva?.financeiro === false ? 'Seu acesso não mostra o caixa e os bancos. Escolha "A pagar" (ou "A receber"): o escritório dá a baixa.' : 'Nenhuma conta. Cadastre em Financeiro › Bancos e caixa.'} />
          ) : (
            <CampoData rotulo="Vencimento *" valor={vencimento} aoMudar={setVencimento} erro={erros.venc} />
          )}
        </>
      )}

      <Secao titulo="Despesas da viagem" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Pedágio" valor={pedagio} aoMudar={setPedagio} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Alimentação do motorista" valor={alimentacao} aoMudar={setAlimentacao} />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Hospedagem / pernoite" valor={hospedagem} aoMudar={setHospedagem} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Diária do motorista" valor={diaria} aoMudar={setDiaria} />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Carga e descarga (chapa)" valor={cargaDescarga} aoMudar={setCargaDescarga} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Outras (balsa, lona, estacionamento)" valor={outras} aoMudar={setOutras} />
        </View>
      </View>
      {terceiro && (
        <Campo rotulo={`Comissão do motorista (% do frete)${valorComissao > 0 ? ` = ${formatarMoeda(valorComissao)}` : ''}`} value={comissao} onChangeText={(t) => setComissao(agruparDigitacao(t))} keyboardType="decimal-pad" placeholder="0" erro={erros.comissao} />
      )}

      <Secao titulo="Abastecimentos na viagem" />
      <Text style={estilos.nota}>No posto, durante a viagem. Ficam gravados no veículo (consumo, hodômetro e gastos) e entram nas despesas da viagem.</Text>
      {abViagem.map((a, i) => (
        <View key={a.chave} style={estilos.caixa}>
          <View style={estilos.caixaTopo}>
            <Text style={estilos.caixaTitulo}>{i + 1}º abastecimento</Text>
            <Pressable onPress={() => setAbViagem((l) => l.filter((y) => y.chave !== a.chave))} hitSlop={8} accessibilityLabel="Tirar abastecimento">
              <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
            </Pressable>
          </View>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Data" valor={a.data} aoMudar={(t) => mudarAb(a.chave, 'data', t)} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Km na hora" value={a.km} onChangeText={(t) => mudarAb(a.chave, 'km', agruparDigitacao(t))} keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={estilos.linha}>
            <View style={{ flex: 1.3 }}>
              <Campo rotulo="Combustível" value={a.combustivel} onChangeText={(t) => mudarAb(a.chave, 'combustivel', t)} autoCapitalize="words" placeholder={veiculo?.combustivel ?? 'Diesel S10'} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Litros *" value={a.litros} onChangeText={(t) => mudarAb(a.chave, 'litros', agruparDigitacao(t))} keyboardType="decimal-pad" />
            </View>
          </View>
          <CampoMoeda rotulo="Valor do combustível (R$) *" valor={a.valor} aoMudar={(t) => mudarAb(a.chave, 'valor', t)} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Arla 32 (litros)" value={a.arlaL} onChangeText={(t) => mudarAb(a.chave, 'arlaL', agruparDigitacao(t))} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1.2 }}>
              <CampoMoeda rotulo="Arla 32 (R$)" valor={a.arlaV} aoMudar={(t) => mudarAb(a.chave, 'arlaV', t)} />
            </View>
          </View>
          <Campo rotulo="Posto / cidade" value={a.local} onChangeText={(t) => mudarAb(a.chave, 'local', t)} autoCapitalize="words" />
          {n(a.litros) && n(a.valor) ? <Text style={estilos.nota}>{formatarMoeda(n(a.valor)! / n(a.litros)!)} o litro</Text> : null}
        </View>
      ))}
      {erros.abViagem ? <Text style={estilos.erro}>{erros.abViagem}</Text> : null}
      <Text style={estilos.link} onPress={() => setAbViagem((l) => [...l, { chave: chave(), data: l.length ? l[l.length - 1].data : saida, km: '', combustivel: veiculo?.combustivel ?? '', litros: '', valor: '', arlaL: '', arlaV: '', local: '' }])}>
        + Abastecimento na viagem
      </Text>
      {abViagem.length > 0 && <Text style={estilos.destaque}>Combustível e Arla na viagem: {formatarQtd(abLitros, 1)} L · {formatarMoeda(abValor)}</Text>}

      <Secao titulo="Manutenções na estrada" />
      {mnViagem.map((m, i) => (
        <View key={m.chave} style={estilos.caixa}>
          <View style={estilos.caixaTopo}>
            <Text style={estilos.caixaTitulo}>{i + 1}ª manutenção</Text>
            <Pressable onPress={() => setMnViagem((l) => l.filter((y) => y.chave !== m.chave))} hitSlop={8} accessibilityLabel="Tirar manutenção">
              <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
            </Pressable>
          </View>
          <Campo rotulo="O que foi feito *" value={m.descricao} onChangeText={(t) => mudarMn(m.chave, 'descricao', t)} autoCapitalize="sentences" placeholder="Ex.: conserto de pneu, troca de lâmpada, guincho" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Data" valor={m.data} aoMudar={(t) => mudarMn(m.chave, 'data', t)} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Km" value={m.km} onChangeText={(t) => mudarMn(m.chave, 'km', agruparDigitacao(t))} keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Valor (R$)" valor={m.valor} aoMudar={(t) => mudarMn(m.chave, 'valor', t)} />
            </View>
            <View style={{ flex: 1.2 }}>
              <Campo rotulo="Oficina / cidade" value={m.local} onChangeText={(t) => mudarMn(m.chave, 'local', t)} autoCapitalize="words" />
            </View>
          </View>
        </View>
      ))}
      {erros.mnViagem ? <Text style={estilos.erro}>{erros.mnViagem}</Text> : null}
      <Text style={estilos.link} onPress={() => setMnViagem((l) => [...l, { chave: chave(), data: saida, km: '', descricao: '', valor: '', local: '' }])}>
        + Manutenção na estrada
      </Text>
      <Text style={estilos.nota}>Ficam no histórico de manutenções do veículo (corretivas, na estrada).</Text>

      {despesasTotal > 0 && (
        <>
          <Text style={estilos.destaque}>Despesas da viagem: {formatarMoeda(despesasTotal)}</Text>
          <Escolha
            rotulo="Pagamento das despesas"
            opcoes={[
              { valor: 'pago', rotulo: 'Já paguei' },
              { valor: 'prazo', rotulo: 'A pagar' },
            ]}
            valor={despPago}
            aoMudar={setDespPago}
          />
          {despPago[0] === 'pago' ? (
            <SeletorLista rotulo="De onde saiu o dinheiro *" valorId={despContaId} aoMudar={setDespContaId} carregar={carregarBancos} erro={erros.despConta} vazio={fazendaAtiva?.financeiro === false ? 'Seu acesso não mostra o caixa e os bancos. Escolha "A pagar" (ou "A receber"): o escritório dá a baixa.' : 'Nenhuma conta. Cadastre em Financeiro › Bancos e caixa.'} />
          ) : (
            <CampoData rotulo="Vencimento *" valor={despVenc} aoMudar={setDespVenc} erro={erros.despVenc} />
          )}
        </>
      )}
      <Text style={estilos.nota}>Abastecimento feito no tanque da fazenda antes de sair é lançado em Frota › Abastecimentos: ele entra sozinho no resultado da viagem.</Text>

      {veiculo && (
        <View style={estilos.resultado}>
          <Text style={estilos.resTitulo}>Resultado da viagem</Text>
          {terceiro && <Par a="Frete líquido" b={formatarMoeda(liquido)} />}
          <Par a="Despesas da viagem" b={`− ${formatarMoeda(despesas)}`} />
          {mnValor > 0 && <Par a="Manutenção na estrada" b={`− ${formatarMoeda(mnValor)}`} />}
          <Par
            a={`Combustível e Arla${comb?.estimado ? ' (estimado pelo consumo médio)' : ''}${comb?.litros ? ` · ${formatarQtd(comb.litros, 1)} L` : ''}`}
            b={comb?.valor != null ? `− ${formatarMoeda(comb.valor)}` : 'sem dados'}
          />
          <Par a={terceiro ? 'Resultado' : 'Custo do transporte'} b={formatarMoeda(terceiro ? resultado : -resultado)} forte />
          {km ? <Par a={terceiro ? 'Resultado por km' : 'Custo por km'} b={formatarMoeda((terceiro ? resultado : -resultado) / km)} /> : null}
          {km && terceiro && valorFrete > 0 ? <Par a="Frete por km" b={formatarMoeda(valorFrete / km)} /> : null}
          <Text style={estilos.nota}>Não entram a depreciação do caminhão nem a manutenção: veja em Gastos da frota.</Text>
        </View>
      )}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 64, paddingTop: 12, textAlignVertical: 'top' }} />
      <Botao titulo={id ? 'Salvar alterações' : 'Lançar frete'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir frete" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={estilos.par}>
      <Text style={[estilos.parA, forte && { fontWeight: '800', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { fontWeight: '800' }]}>{b}</Text>
    </View>
  );
}

function periodo(p: string): { de: string; ate: string } {
  const hoje = hojeBanco();
  const [a, m] = hoje.split('-').map(Number);
  const iso = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
  if (p === 'mes_passado') return { de: iso(a, m - 1, 1), ate: iso(a, m, 0) };
  if (p === 'ano') return { de: `${a}-01-01`, ate: hoje };
  if (p === '12m') return { de: iso(a, m - 11, 1), ate: hoje };
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}

/** Consulta: os fretes do período, com km, receita, despesas e resultado; totais por contratante. Tocando, abre para alterar. */
function ConsultaFretes({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const { fazendaAtiva } = useSessao();
  const [per, setPer] = useState<string[]>(['mes']);
  const [lista, setLista] = useState<any[] | null>(null);
  const [comb, setComb] = useState<Record<string, number>>({});
  const [manut, setManut] = useState<Record<string, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const { de, ate } = periodo(per[0]);

  useEffect(() => {
    setLista(null);
    (async () => {
      try {
        const fs = await consulta<any[]>(
          supabase
            .from('frota_fretes')
            .select('*, veiculo:frota_veiculos ( nome ), contratante:pessoas!frota_fretes_pessoa_id_fkey ( nome ), motorista:pessoas!frota_fretes_motorista_id_fkey ( nome )')
            .eq('fazenda_id', fazendaAtiva?.id)
            .gte('data_saida', de)
            .lte('data_saida', ate)
            .order('data_saida', { ascending: false })
            .order('numero', { ascending: false }),
        );
        // combustível de cada viagem: abastecimentos do veículo entre a saída e a chegada
        const vids = [...new Set(fs.map((f) => f.veiculo_id))];
        const ab = vids.length
          ? await consulta<any[]>(supabase.from('frota_abastecimentos').select('veiculo_id, data, valor_total, arla_valor, frete_id').in('veiculo_id', vids).gte('data', de))
          : [];
        const mn = fs.length ? await consulta<any[]>(supabase.from('frota_manutencoes').select('frete_id, valor_servico').in('frete_id', fs.map((f) => f.id))) : [];
        const c: Record<string, number> = {};
        const mt: Record<string, number> = {};
        for (const f of fs) {
          const fim = f.data_chegada ?? f.data_saida;
          c[f.id] = ab
            .filter((a) => a.frete_id === f.id || (!a.frete_id && a.veiculo_id === f.veiculo_id && a.data >= f.data_saida && a.data <= fim))
            .reduce((s, a) => s + Number(a.valor_total ?? 0) + Number(a.arla_valor ?? 0), 0);
          mt[f.id] = mn.filter((m) => m.frete_id === f.id).reduce((s, m) => s + Number(m.valor_servico ?? 0), 0);
        }
        setManut(mt);
        setComb(c);
        setLista(fs);
      } catch (e) {
        setErro(traduzirErro(e));
        setLista([]);
      }
    })();
  }, [de, ate, fazendaAtiva?.id]);

  const desp = (f: any) =>
    ['pedagio', 'alimentacao', 'hospedagem', 'diaria_motorista', 'carga_descarga', 'outras_despesas'].reduce((s, k) => s + Number(f[k] ?? 0), 0) + Number(f.valor_frete) * Number(f.comissao_perc ?? 0) / 100 + (manut[f.id] ?? 0);
  const liq = (f: any) => Number(f.valor_frete) - Number(f.descontos ?? 0);
  const kmDe = (f: any) => (f.km_saida != null && f.km_chegada != null ? Number(f.km_chegada) - Number(f.km_saida) : 0);
  const tot = (lista ?? []).reduce(
    (s, f) => ({ km: s.km + kmDe(f), rec: s.rec + liq(f), desp: s.desp + desp(f), comb: s.comb + (comb[f.id] ?? 0) }),
    { km: 0, rec: 0, desp: 0, comb: 0 },
  );
  const resultado = tot.rec - tot.desp - tot.comb;
  const porContratante: Record<string, { nome: string; viagens: number; valor: number }> = {};
  for (const f of lista ?? []) {
    if (f.tipo !== 'terceiro') continue;
    const nome = um(f.contratante)?.nome ?? '—';
    porContratante[nome] = porContratante[nome] ?? { nome, viagens: 0, valor: 0 };
    porContratante[nome].viagens++;
    porContratante[nome].valor += liq(f);
  }

  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Escolha
        rotulo="Período (pela saída)"
        opcoes={[
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'mes_passado', rotulo: 'Mês passado' },
          { valor: 'ano', rotulo: 'Este ano' },
          { valor: '12m', rotulo: '12 meses' },
        ]}
        valor={per}
        aoMudar={setPer}
      />
      {!lista && <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 24 }} />}
      {lista && lista.length === 0 && <Vazio icone="navigate-outline" texto="Nenhum frete neste período." />}
      {lista && lista.length > 0 && (
        <>
          <View style={estilos.resultado}>
            <Text style={estilos.resTitulo}>
              {lista.length} {lista.length === 1 ? 'viagem' : 'viagens'} · {formatarQtd(tot.km, 1)} km
            </Text>
            <Par a="Fretes (líquido)" b={formatarMoeda(tot.rec)} />
            <Par a="Despesas de viagem (com manutenção na estrada)" b={`− ${formatarMoeda(tot.desp)}`} />
            <Par a="Combustível e Arla" b={`− ${formatarMoeda(tot.comb)}`} />
            <Par a="Resultado" b={formatarMoeda(resultado)} forte />
            {tot.km > 0 && <Par a="Por km" b={formatarMoeda(resultado / tot.km)} />}
          </View>
          {Object.keys(porContratante).length > 0 && (
            <>
              <Secao titulo="Por contratante" />
              {Object.values(porContratante)
                .sort((a, b) => b.valor - a.valor)
                .map((c) => (
                  <Par key={c.nome} a={`${c.nome} (${c.viagens})`} b={formatarMoeda(c.valor)} />
                ))}
            </>
          )}
          <Secao titulo="Viagens" />
          <Lista>
            {lista.map((f) => {
              const k = kmDe(f);
              const res = liq(f) - desp(f) - (comb[f.id] ?? 0);
              return (
                <Linha
                  key={f.id}
                  titulo={`Nº ${f.numero} · ${doBanco(f.data_saida)} · ${[f.origem_municipio || f.origem_local, f.destino_municipio || f.destino_local].filter(Boolean).join(' → ') || um(f.veiculo)?.nome}`}
                  linhas={[
                    [f.tipo === 'terceiro' ? um(f.contratante)?.nome : 'Transporte próprio', um(f.veiculo)?.nome, um(f.motorista)?.nome].filter(Boolean).join(' · '),
                    [f.carga, f.peso_kg ? `${formatarQtd(Number(f.peso_kg))} kg` : null, k ? `${formatarQtd(k, 1)} km` : null, f.data_chegada ? null : 'em viagem'].filter(Boolean).join(' · '),
                    `Resultado ${formatarMoeda(res)}${k ? ` · ${formatarMoeda(res / k)}/km` : ''}`,
                  ]}
                  direita={f.tipo === 'terceiro' ? formatarMoeda(liq(f)) : undefined}
                  onPress={() => aoAbrir(f.id)}
                />
              );
            })}
          </Lista>
        </>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { minWidth: 90, paddingTop: 4 },
  numeroRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  numeroValor: { fontSize: tam.titulo - 4, fontWeight: '800', color: cores.cafe },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  destaque: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  resultado: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.primaria, padding: 12, gap: 6 },
  resTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  erro: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.erro },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 8 },
  caixaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caixaTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.cafe },
  par: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '700' },
});
