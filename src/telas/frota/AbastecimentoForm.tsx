import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Vazio from '../../componentes/Vazio';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import RateioCentros, { rateioDoBanco, rateioInicial, validarRateio, type LinhaRateio } from '../../componentes/RateioCentros';
import { centroDaUnidade } from '../../lib/unidades';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { agruparDigitacao, formatarMoeda, formatarNumero, formatarQtd, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import {
  COMBUSTIVEIS, ROTULO_USO, USOS, calcularConsumo, carregarProdutosEstoque, carregarVeiculos, itemVeiculo, lerLeiturasAtuais,
  nomeMedidor, textoConsumo, textoLeitura, unidadeMedidor, type LeituraAtual, type Veiculo,
} from '../../lib/frota';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const n = (t: string) => lerNumero(t);
const r2 = (x: number) => Math.round(x * 100) / 100;
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * Frota › Abastecimentos: do tanque da fazenda (baixa o diesel do estoque pelo custo médio)
 * ou no posto (vira despesa e contas a pagar, classificada pelo uso do veículo; particular = retirada).
 * Com o km/horas de cada abastecimento o sistema calcula o consumo e acompanha o plano de manutenção.
 */
export default function AbastecimentoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AbastecimentoForm'>>();
  const { fazendaAtiva } = useSessao();
  // quem não vê o Financeiro não escolhe caixa nem banco: a despesa vai para o Contas a pagar e o escritório dá a baixa
  const padraoPagto = fazendaAtiva?.financeiro === false ? 'prazo' : 'pago';
  const fid = fazendaAtiva?.id;

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [leituras, setLeituras] = useState<Record<string, LeituraAtual>>({});
  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [veiculoId, setVeiculoId] = useState<string | null>(params?.veiculoId ?? null);
  const [leitura, setLeitura] = useState('');
  const [litros, setLitros] = useState('');
  const [cheio, setCheio] = useState(true);
  const [combustivel, setCombustivel] = useState<string[]>([]);
  const [origem, setOrigem] = useState<string[]>(['tanque']);
  const [insumoId, setInsumoId] = useState<string | null>(null);
  const [postoId, setPostoId] = useState<string | null>(null);
  const [valorLitro, setValorLitro] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [arlaLitros, setArlaLitros] = useState('');
  const [arlaValor, setArlaValor] = useState('');
  const [documento, setDocumento] = useState('');
  const [pagto, setPagto] = useState<string[]>([padraoPagto]);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [vencimento, setVencimento] = useState('');
  const [uso, setUso] = useState<string[]>([]);
  const [motoristaId, setMotoristaId] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [alterarNum, setAlterarNum] = useState('');
  // V152: centro de custo (opcional) e rateio em vários centros
  const [rateio, setRateio] = useState<LinhaRateio[]>(rateioInicial());

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const veiculo = veiculos.find((v) => v.id === veiculoId) ?? null;
  const med = veiculo?.medidor ?? 'km';
  const un = unidadeMedidor(med);
  const atual = veiculoId ? leituras[veiculoId] : null;
  const posto = origem[0] === 'posto';

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

  // veículo escolhido: combustível e uso vêm do cadastro
  useEffect(() => {
    if (!veiculo || id) return;
    setCombustivel(veiculo.combustivel ? [veiculo.combustivel] : []);
    setUso([veiculo.uso]);
    setRateio(rateioInicial(veiculo.fazenda_id === fid ? veiculo.centro_custo_id : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veiculoId, veiculos.length]);

  // posto: R$ por litro <-> total
  function mudarLitro(t: string) {
    setValorLitro(t);
    const v = n(t);
    const l = n(litros);
    if (v != null && l) setValorTotal(moedaParaCampo(Math.round(v * l * 100) / 100));
  }
  function mudarTotal(t: string) {
    setValorTotal(t);
    const v = n(t);
    const l = n(litros);
    if (v != null && l) setValorLitro(formatarNumero(v / l, 3));
  }

  const carregarVeiculosLista = useCallback(async (): Promise<ItemLista[]> => veiculos.filter((v) => v.ativo).map((v) => itemVeiculo(v, leituras[v.id])), [veiculos, leituras]);
  const carregarCombustiveis = useCallback(async () => (fid ? carregarProdutosEstoque(fid, ['combustivel']) : []), [fid]);
  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.filter((c) => !c.fazenda_id || c.fazenda_id === fid).map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }));
  }, [fid]);
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, fid)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [fid]);

  function limpar(manterVeiculo = false) {
    setId(null);
    setNumero(null);
    setData(hojeBR());
    if (!manterVeiculo) setVeiculoId(null);
    setLeitura('');
    setLitros('');
    setCheio(true);
    setOrigem(['tanque']);
    setPostoId(null);
    setValorLitro('');
    setValorTotal('');
    setArlaLitros('');
    setArlaValor('');
    setDocumento('');
    setPagto([padraoPagto]);
    setVencimento('');
    setMotoristaId(null);
    setObs('');
    setRateio(rateioInicial());
    setErros({});
  }

  async function abrir(aid: string) {
    setCarregando(true);
    setErro(null);
    try {
      const a = await consulta<any>(supabase.from('frota_abastecimentos').select('*, compra:compras ( pago_na_hora, conta_bancaria_id, numero_documento, lancamentos ( data_vencimento ) )').eq('id', aid).single());
      const c = um(a.compra);
      const rat = await consulta<any[]>(supabase.from('frota_abastecimento_rateios').select('centro_custo_id, percentual').eq('abastecimento_id', aid));
      setId(a.id);
      setNumero(a.numero);
      setData(doBanco(a.data));
      setVeiculoId(a.veiculo_id);
      setLeitura(numeroParaCampo(a.leitura));
      setLitros(numeroParaCampo(a.litros));
      setCheio(a.tanque_cheio !== false);
      setCombustivel(a.combustivel ? [a.combustivel] : []);
      setOrigem([a.origem]);
      setInsumoId(a.insumo_id);
      setPostoId(a.pessoa_id);
      setValorTotal(a.origem === 'posto' ? moedaParaCampo(a.valor_total) : '');
      setValorLitro(a.origem === 'posto' && a.valor_litro ? formatarNumero(Number(a.valor_litro), 3) : '');
      setArlaLitros(numeroParaCampo(a.arla_litros));
      setArlaValor(moedaParaCampo(a.arla_valor));
      setDocumento(c?.numero_documento ?? '');
      setPagto([c && !c.pago_na_hora ? 'prazo' : 'pago']);
      setBancoId(c?.conta_bancaria_id ?? null);
      setVencimento(c && !c.pago_na_hora && c.lancamentos?.[0]?.data_vencimento ? doBanco(c.lancamentos[0].data_vencimento) : '');
      setUso([a.uso]);
      setMotoristaId(a.motorista_id);
      setObs(a.observacoes ?? '');
      setRateio(rateioDoBanco(rat));
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

  async function abrirPorNumero() {
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m || !fid) return setErro('Digite o número do abastecimento.');
    const { data: a } = await supabase.from('frota_abastecimentos').select('id').eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!a) return setErro(`Não há abastecimento nº ${m[1]} nesta fazenda.`);
    setAlterarNum('');
    abrir(a.id);
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(data)) e.data = 'Informe a data.';
    if (!veiculoId) e.veiculo = 'Escolha o veículo ou a máquina.';
    if (veiculo && med !== 'nenhum' && (n(leitura) == null || n(leitura)! < 0)) e.leitura = `Informe o ${nomeMedidor(med)} (${un}).`;
    if (!(n(litros)! > 0)) e.litros = 'Informe os litros.';
    if (!posto && !insumoId) e.insumo = 'Escolha o combustível do tanque (o produto do estoque). Ele entra no estoque pelas Compras.';
    if (posto) {
      if (!(n(valorTotal)! > 0)) e.valor = 'Informe o valor pago (total ou por litro).';
      if (pagto[0] === 'pago' && !bancoId) e.banco = 'Escolha o caixa ou o banco de onde saiu o dinheiro.';
      if (pagto[0] === 'prazo' && !dataValida(vencimento)) e.venc = 'Informe o vencimento.';
    }
    const rat = validarRateio(rateio);
    if (rat.erro) e.rateio = rat.erro;
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    const total = n(valorTotal) ?? 0;
    const p = {
      id,
      fazenda_id: fid,
      veiculo_id: veiculoId,
      data: paraBanco(data),
      leitura: med === 'nenhum' ? null : n(leitura),
      litros: n(litros),
      combustivel: combustivel[0] ?? null,
      tanque_cheio: cheio,
      origem: origem[0],
      insumo_id: posto ? null : insumoId,
      pessoa_id: posto ? postoId : null,
      valor_total: posto ? total : null,
      arla_litros: posto ? n(arlaLitros) : null,
      arla_valor: posto ? n(arlaValor) ?? 0 : 0,
      numero_documento: documento.trim(),
      pago: pagto[0] === 'pago',
      conta_bancaria_id: bancoId,
      parcelas: posto && pagto[0] === 'prazo' ? [{ vencimento: paraBanco(vencimento), valor: r2(total + (n(arlaValor) ?? 0)) }] : [],
      uso: uso[0] ?? null,
      motorista_id: motoristaId,
      observacoes: obs,
      // V152: sem centro = o do veículo (como antes); um ou vários centros com os percentuais
      rateio: rat.rateio,
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_abastecimento_rateio', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; total: number | null; arla: number | null; sem_custo: boolean; compra_numero: number | null; baixa: string | null; pago: boolean | null };

    // consumo do trecho (tanque cheio a tanque cheio), para mostrar na hora
    let consumo = '';
    if (veiculo && med !== 'nenhum') {
      const hist = await consulta<any[]>(supabase.from('frota_abastecimentos').select('data, leitura, litros, tanque_cheio, valor_total').eq('veiculo_id', veiculo.id).order('data'));
      const c = calcularConsumo(hist.map((x) => ({ ...x, leitura: x.leitura == null ? null : Number(x.leitura), litros: Number(x.litros), valor_total: x.valor_total == null ? null : Number(x.valor_total) })), med);
      if (c.ultimo != null) consumo = ` Consumo do trecho: ${textoConsumo(c.ultimo, med)} (média ${textoConsumo(c.media, med)}).`;
    }
    const custo = res.total != null ? `${formatarMoeda(res.total)}${res.arla ? ` + Arla ${formatarMoeda(res.arla)}` : ''}` : null;
    const destino = posto
      ? res.pago
        ? res.baixa === 'pendente'
          ? ' O pagamento ficou aguardando a confirmação do dono.'
          : ' Já saiu do caixa/banco.'
        : ` Lançado no contas a pagar (compra nº ${res.compra_numero}).`
      : res.sem_custo
        ? ' Saiu do estoque, mas o produto ainda não tem custo (falta a compra com valor).'
        : ' Saiu do estoque do tanque.';
    setAviso(`Abastecimento nº ${res.numero} ${id ? 'alterado' : 'lançado'}: ${formatarQtd(n(litros), 2)} L${custo ? `, ${custo}` : ''}.${destino}${consumo}`);
    limpar();
    recarregar();
  }

  function excluir() {
    Alert.alert('Excluir', `Excluir o abastecimento nº ${numero}? O combustível volta ao estoque${posto ? '; a despesa e o contas a pagar saem junto' : ''}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_abastecimento', { p_id: id });
          if (error) return setErro(traduzirErro(error));
          setAviso(`Abastecimento nº ${numero} excluído.`);
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
        <ConsultaAbastecimentos veiculos={veiculos} veiculoInicial={params?.veiculoId ?? null} aoAbrir={abrir} />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Abastecimento nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : 'novo'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={() => limpar()}>
          Sair deste e lançar outro
        </Text>
      ) : (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar o abastecimento nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      )}

      <SeletorLista rotulo="Veículo ou máquina *" valorId={veiculoId} aoMudar={setVeiculoId} carregar={carregarVeiculosLista} dicaBusca="Nome ou placa" erro={erros.veiculo} vazio="Nenhum veículo cadastrado. Cadastre em Frota › Veículos e máquinas." />
      {veiculo && med !== 'nenhum' && (
        <Text style={estilos.nota}>
          Última leitura: {textoLeitura(atual?.leitura, med)}
          {atual?.data ? ` em ${doBanco(atual.data)}` : ''}
          {atual?.por_dia ? ` · uso médio de ${formatarQtd(atual.por_dia, 1)} ${un} por dia` : ''}
        </Text>
      )}
      <View style={estilos.linha}>
        {med !== 'nenhum' && (
          <View style={{ flex: 1.2 }}>
            <Campo rotulo={`${med === 'horas' ? 'Horímetro' : 'Hodômetro'} (${un}) *`} value={leitura} onChangeText={(t) => setLeitura(agruparDigitacao(t))} keyboardType="decimal-pad" erro={erros.leitura} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Campo rotulo="Litros *" value={litros} onChangeText={(t) => setLitros(agruparDigitacao(t))} keyboardType="decimal-pad" erro={erros.litros} />
        </View>
      </View>
      <Interruptor rotulo="Completou o tanque" descricao="O consumo é calculado de um tanque cheio até o outro." valor={cheio} aoMudar={setCheio} />
      <Escolha rotulo="Combustível" opcoes={COMBUSTIVEIS} valor={combustivel} aoMudar={(v) => setCombustivel(combustivel[0] === v[0] ? [] : v)} />

      <Secao titulo="De onde saiu" />
      <Escolha
        opcoes={[
          { valor: 'tanque', rotulo: 'Tanque da fazenda' },
          { valor: 'posto', rotulo: 'Posto' },
        ]}
        valor={origem}
        aoMudar={setOrigem}
      />
      {!posto ? (
        <>
          <SeletorLista rotulo="Combustível do estoque *" valorId={insumoId} aoMudar={setInsumoId} carregar={carregarCombustiveis} erro={erros.insumo} vazio="Nenhum combustível no estoque. Lance a compra do diesel em Mais › Compras (categoria Combustível)." />
          <Text style={estilos.nota}>Sai do estoque desta fazenda pelo custo médio. A despesa já foi lançada na compra do combustível.</Text>
        </>
      ) : (
        <>
          <CampoPessoaBusca rotulo="Posto" valorId={postoId} aoMudar={setPostoId} tipoNovo="fornecedor" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="R$ por litro" value={valorLitro} onChangeText={(t) => mudarLitro(agruparDigitacao(t))} keyboardType="decimal-pad" placeholder="0,000" />
            </View>
            <View style={{ flex: 1.2 }}>
              <CampoMoeda rotulo="Valor total (R$) *" valor={valorTotal} aoMudar={mudarTotal} erro={erros.valor} />
            </View>
          </View>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Arla 32 (litros)" value={arlaLitros} onChangeText={(t) => setArlaLitros(agruparDigitacao(t))} keyboardType="decimal-pad" placeholder="Se colocou" />
            </View>
            <View style={{ flex: 1.2 }}>
              <CampoMoeda rotulo="Arla 32 (R$)" valor={arlaValor} aoMudar={setArlaValor} />
            </View>
          </View>
          {(n(arlaValor) ?? 0) > 0 && <Text style={estilos.nota}>Total pago no posto: {formatarMoeda((n(valorTotal) ?? 0) + (n(arlaValor) ?? 0))} (o Arla não entra no cálculo do consumo).</Text>}
          <Campo rotulo="Nº do cupom / nota" value={documento} onChangeText={setDocumento} autoCapitalize="characters" />
          <Escolha
            rotulo="Pagamento"
            opcoes={[
              { valor: 'pago', rotulo: 'Já paguei' },
              { valor: 'prazo', rotulo: 'A pagar' },
            ]}
            valor={pagto}
            aoMudar={setPagto}
          />
          {pagto[0] === 'pago' ? (
            <SeletorLista rotulo="De onde saiu o dinheiro *" valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} erro={erros.banco} vazio={fazendaAtiva?.financeiro === false ? 'Seu acesso não mostra o caixa e os bancos. Escolha "A pagar" (ou "A receber"): o escritório dá a baixa.' : 'Nenhuma conta. Cadastre em Financeiro › Bancos e caixa.'} />
          ) : (
            <CampoData rotulo="Vencimento *" valor={vencimento} aoMudar={setVencimento} erro={erros.venc} />
          )}
        </>
      )}

      <Secao titulo="Centro de custo (opcional)" />
      <RateioCentros
        linhas={rateio}
        aoMudar={setRateio}
        carregar={carregarCentros}
        valor={posto ? (n(valorTotal) ?? 0) + (n(arlaValor) ?? 0) : null}
        erro={erros.rateio}
        vazio="Nenhum centro de custo nesta fazenda. Veja em Financeiro › Centros de custo."
      />
      <Text style={estilos.nota}>Em branco, vale o centro do cadastro do veículo. Serve também para o bem em formação (ex.: 4.1.08-001).</Text>
      <Secao titulo="Uso e motorista" />
      <Escolha rotulo="Uso deste abastecimento" opcoes={USOS.map((u) => ({ valor: u.valor, rotulo: u.rotulo }))} valor={uso} aoMudar={setUso} />
      {veiculo && uso[0] && uso[0] !== veiculo.uso && <Text style={estilos.nota}>Diferente do cadastro ({ROTULO_USO[veiculo.uso]}): vale só para este abastecimento.</Text>}
      {uso[0] === 'particular' && posto && <Text style={estilos.nota}>Particular: o que a fazenda pagar sai como retirada do proprietário, fora do resultado.</Text>}
      <CampoPessoaBusca rotulo="Motorista / operador" valorId={motoristaId} aoMudar={setMotoristaId} tipoNovo="funcionario" />
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 64, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={id ? 'Salvar alterações' : 'Lançar abastecimento'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir abastecimento" tipo="perigo" onPress={excluir} />}
      {!id && veiculo && (
        <Botao titulo="Ver a ficha do veículo" tipo="texto" onPress={() => navegacao.navigate('VeiculoDetalhe', { id: veiculo.id })} />
      )}
    </Tela>
  );
}

/** Consulta: os últimos abastecimentos (de um veículo ou de todos), com o consumo de cada trecho. Tocando, abre para alterar. */
function ConsultaAbastecimentos({ veiculos, veiculoInicial, aoAbrir }: { veiculos: Veiculo[]; veiculoInicial: string | null; aoAbrir: (id: string) => void }) {
  const { fazendaAtiva } = useSessao();
  const [veiculoId, setVeiculoId] = useState<string | null>(veiculoInicial);
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let q = supabase.from('frota_abastecimentos').select('*, veiculo:frota_veiculos ( nome, medidor ), insumo:insumos ( nome ), posto:pessoas!frota_abastecimentos_pessoa_id_fkey ( nome ), frete:frota_fretes ( numero )').order('data', { ascending: false }).order('numero', { ascending: false }).limit(60);
    q = veiculoId ? q.eq('veiculo_id', veiculoId) : q.eq('fazenda_id', fazendaAtiva?.id);
    consulta<any[]>(q).then(setLista).catch((e) => setErro(traduzirErro(e)));
  }, [veiculoId, fazendaAtiva?.id]);

  const carregar = useCallback(async (): Promise<ItemLista[]> => veiculos.map((v) => itemVeiculo(v)), [veiculos]);
  const v = veiculos.find((x) => x.id === veiculoId);
  const consumo = v && lista ? calcularConsumo(lista.map((x) => ({ data: x.data, leitura: x.leitura == null ? null : Number(x.leitura), litros: Number(x.litros), tanque_cheio: x.tanque_cheio, valor_total: x.valor_total })), v.medidor) : null;
  const totalLitros = (lista ?? []).reduce((s, x) => s + Number(x.litros), 0);
  const totalValor = (lista ?? []).reduce((s, x) => s + Number(x.valor_total ?? 0) + Number(x.arla_valor ?? 0), 0);

  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <SeletorLista rotulo="Veículo (em branco = todos desta fazenda)" valorId={veiculoId} aoMudar={setVeiculoId} carregar={carregar} permitirLimpar />
      {lista && lista.length > 0 && (
        <View style={estilos.quadro}>
          <Text style={estilos.quadroTexto}>
            {lista.length} {lista.length === 1 ? 'abastecimento' : 'abastecimentos'} · {formatarQtd(totalLitros, 1)} L · {formatarMoeda(totalValor)}
          </Text>
          {consumo?.media != null && v && <Text style={estilos.quadroTexto}>Consumo médio: {textoConsumo(consumo.media, v.medidor)}</Text>}
        </View>
      )}
      {lista && lista.length === 0 && <Vazio icone="water-outline" texto="Nenhum abastecimento lançado." />}
      {lista && lista.length > 0 && (
        <Lista>
          {lista.map((a) => {
            const ve = um(a.veiculo);
            return (
              <Linha
                key={a.id}
                titulo={`Nº ${a.numero} · ${doBanco(a.data)} · ${ve?.nome ?? ''}`}
                linhas={[
                  `${formatarQtd(Number(a.litros), 2)} L${a.combustivel ? ` de ${a.combustivel}` : ''}${a.tanque_cheio ? ' · tanque cheio' : ''}${a.leitura != null ? ` · ${textoLeitura(Number(a.leitura), ve?.medidor)}` : ''}`,
                  a.frete_id
                    ? `Na viagem do frete nº ${um(a.frete)?.numero ?? ''}${a.observacoes ? ` · ${a.observacoes}` : ''} (altera-se pelo frete)`
                    : a.origem === 'tanque' ? `Tanque da fazenda${um(a.insumo)?.nome ? ` (${um(a.insumo).nome})` : ''}` : `Posto${um(a.posto)?.nome ? `: ${um(a.posto).nome}` : ''}`,
                  Number(a.arla_valor) > 0 ? `Arla 32: ${a.arla_litros ? `${formatarQtd(Number(a.arla_litros), 1)} L · ` : ''}${formatarMoeda(Number(a.arla_valor))}` : null,
                  ROTULO_USO[a.uso],
                ]}
                direita={a.valor_total != null ? formatarMoeda(Number(a.valor_total) + Number(a.arla_valor ?? 0)) : undefined}
                onPress={() => aoAbrir(a.id)}
              />
            );
          })}
        </Lista>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { minWidth: 110, paddingTop: 4 },
  numeroRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  numeroValor: { fontSize: tam.titulo - 4, fontWeight: '800', color: cores.cafe },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 4 },
  quadroTexto: { fontSize: tam.pequeno + 1, color: cores.info, fontWeight: '700' },
});
