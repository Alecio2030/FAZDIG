import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import SeletorAnimais from '../../componentes/SeletorAnimais';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaVendas from './ConsultaVendas';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { centroDaUnidade } from '../../lib/unidades';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { ROTULO_CATEGORIA_INSUMO, saldoDe, textoSaldo } from '../../lib/insumos';
import { codigoLote, nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { somarDias } from '../../lib/reproducao';
import { calcularVendaAnimais, r2v, textoFormaPreco, type FormaPreco } from '../../lib/vendas';
import { CAMPOS_POSICAO, nomeLocal, posicoes, rotuloTipo, type Posicao } from '../../lib/armazem';
import { textoSacas } from '../../lib/posColheita';
import { cotacaoReferencia, lerCotacoes, type Cotacao } from '../../lib/cotacoes';
import { aCompensar, lerContratos, rotuloContrato, saldoSacas, textoPreco, type ContratoCafe } from '../../lib/contratosCafe';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Item = { chave: string; tipo: 'outro' | 'insumo'; insumoId: string | null; unidade: string; descricao: string; qtd: string; unit: string; total: string };
type Rateio = { chave: string; centroId: string | null; perc: string };
type Parcela = { chave: string; venc: string; valor: string };
type InfoLote = { id: string; numero: number; descricao: string | null; cabecas: number };
type Faixa = { sexo: 'M' | 'F'; faixa: string; idade_de: number; idade_ate: number | null; cabecas: number };
const FAIXAS_ATE: Record<string, number | null> = { '0': 12, '13': 24, '25': 36, '37': null };
const FAIXAS = [
  { valor: '0', rotulo: '0 a 12 meses' },
  { valor: '13', rotulo: '13 a 24 meses' },
  { valor: '25', rotulo: '25 a 36 meses' },
  { valor: '37', rotulo: 'acima de 36 meses' },
];

let cont = 0;
const chave = () => `v${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);
const itemVazio = (): Item => ({ chave: chave(), tipo: 'outro', insumoId: null, unidade: 'un', descricao: '', qtd: '1', unit: '', total: '' });

/** Mais › Vendas: animais (dá baixa no rebanho) e outros produtos e serviços. Gera o contas a receber. */
export default function VendaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'VendaForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  // Dados fiscais da fazenda: em nome de quem sai a nota desta venda.
  const [faturadoPor, setFaturadoPor] = useState<string | null>(null);
  useEffect(() => {
    if (!fid) return;
    supabase
      .from('fazendas')
      .select('nome, razao_social, cpf_cnpj')
      .eq('id', fid)
      .maybeSingle()
      .then(({ data }) => setFaturadoPor((data as any)?.cpf_cnpj ? `${(data as any).razao_social ?? (data as any).nome} · ${(data as any).cpf_cnpj}` : null));
  }, [fid]);

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [proximo, setProximo] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [tipo, setTipo] = useState<string[]>([params?.contratoId ? 'cafe' : 'animais']);
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [documento, setDocumento] = useState('');
  // animais
  const [numPesagem, setNumPesagem] = useState('');
  const [pesagem, setPesagem] = useState<{ id: string; numero: number; texto: string; porBrinco: boolean } | null>(null);
  const [puxando, setPuxando] = useState(false);
  const [lote, setLote] = useState<InfoLote | null>(null);
  // V158: de onde saem os animais: de um lote, ou do rebanho da fazenda pelo sexo e faixa de idade (quem não controla por lote)
  const [origem, setOrigem] = useState<string[]>(['lote']);
  const [lotesAtivos, setLotesAtivos] = useState<ItemLista[] | null>(null);
  const [estoque, setEstoque] = useState<Faixa[] | null>(null);
  const [sexo, setSexo] = useState<string[]>([]);
  const [faixa, setFaixa] = useState<string[]>([]);
  const [modo, setModo] = useState<string[]>(['quantidade']);
  const [quantidade, setQuantidade] = useState('');
  const [animais, setAnimais] = useState<string[]>([]);
  const [peso, setPeso] = useState('');
  const [forma, setForma] = useState<string[]>(['arroba']);
  const [kgArroba, setKgArroba] = useState('30');
  const [barrigaTipo, setBarrigaTipo] = useState<string[]>(['nao']);
  const [barrigaValor, setBarrigaValor] = useState('');
  const [preco, setPreco] = useState('');
  // outros
  const [itens, setItens] = useState<Item[]>([itemVazio()]);
  // descontos na nota
  const [descAberto, setDescAberto] = useState(false);
  const [funPerc, setFunPerc] = useState('');
  const [funValor, setFunValor] = useState('');
  const [comissao, setComissao] = useState('');
  const [frete, setFrete] = useState('');
  const [outrosDesc, setOutrosDesc] = useState('');
  // classificação e recebimento
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [pagto, setPagto] = useState<string[]>(['avista']);
  const [nParc, setNParc] = useState('2');
  const [primeiro, setPrimeiro] = useState('');
  const [intervalo, setIntervalo] = useState('30');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [obs, setObs] = useState('');
  // excluir uma venda já lançada
  const [excluirAberto, setExcluirAberto] = useState(false);
  const [excluirNum, setExcluirNum] = useState('');
  const [excluirErro, setExcluirErro] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const deAnimais = tipo[0] === 'animais';
  const deCafe = tipo[0] === 'cafe';
  // café: lotes com saldo em cada armazém, e o que foi marcado para vender (sacas e preço por saca)
  const [posCafe, setPosCafe] = useState<Posicao[] | null>(null);
  const [cafeSel, setCafeSel] = useState<Record<string, { sacas: string; preco: string }>>({});
  const [cotsCafe, setCotsCafe] = useState<Cotacao[]>([]);
  // entrega de contrato de café (venda futura ou troca por insumos)
  const [contratos, setContratos] = useState<ContratoCafe[]>([]);
  const [contrato, setContrato] = useState<ContratoCafe | null>(null);
  const formaPreco = forma[0] as FormaPreco;

  useLayoutEffect(() => {
    navegacao.setOptions({ title: 'Vendas' });
  }, [navegacao]);

  const recarregarTopo = useCallback(async () => {
    if (!fid) return;
    const { data: u } = await supabase.from('vendas').select('numero').order('numero', { ascending: false }).limit(1);
    setProximo(((u?.[0]?.numero as number) ?? 0) + 1);
  }, [fid]);
  useEffect(() => {
    recarregarTopo();
  }, [recarregarTopo]);

  // café em estoque: carrega quando a venda é de café
  useEffect(() => {
    if (!deCafe || !fid) return;
    consulta<any[]>(supabase.from('cafe_movimentos').select(CAMPOS_POSICAO).eq('fazenda_id', fid).limit(10000))
      .then((m) => {
        setPosCafe(posicoes(m));
        lerCotacoes().then(setCotsCafe).catch(() => setCotsCafe([]));
      })
      .catch((x) => setErro(traduzirErro(x)));
    lerContratos(fid)
      .then((cs) => {
        const abertos = cs.filter((c) => c.situacao === 'aberto' && saldoSacas(c) > 0);
        setContratos(abertos);
        const pedido = params?.contratoId ? abertos.find((c) => c.id === params.contratoId) : null;
        if (pedido) {
          setContrato(pedido);
          setPessoaId(pedido.pessoa_id);
        }
      })
      .catch(() => setContratos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deCafe, fid]);

  /** Preço por saca sugerido: o do contrato (fixo); a fixar ou sem contrato, a cotação do tipo do lote. */
  const precoSugerido = (x: Posicao): string => {
    if (contrato?.preco_tipo === 'fixo' && contrato.preco != null) return moedaParaCampo(contrato.preco);
    if (contrato) return moedaParaCampo(cotacaoReferencia(cotsCafe, x.lote?.tipo)?.preco ?? null);
    return '';
  };
  function escolherContrato(cid: string) {
    const c = contratos.find((x) => x.id === cid) ?? null;
    setContrato(c);
    setCafeSel({});
    if (c) setPessoaId(c.pessoa_id);
  }

  // ---- cálculo ----
  const cab = modo[0] === 'quantidade' ? Number(quantidade || 0) : animais.length;
  /** desconto de barriga só entra na venda por arroba ou por kg */
  const usaBarriga = formaPreco !== 'cabeca' && barrigaTipo[0] !== 'nao';
  const calc = calcularVendaAnimais({
    cabecas: cab,
    pesoBruto: n(peso) ?? 0,
    forma: formaPreco,
    kgArroba: n(kgArroba) ?? 0,
    barrigaTipo: usaBarriga ? (barrigaTipo[0] as 'perc' | 'kg_cab') : null,
    barrigaValor: n(barrigaValor) ?? 0,
    preco: n(preco) ?? 0,
  });
  const somaItens = itens.reduce((s, i) => s + (n(i.total) ?? 0), 0);
  const cafeMarcado = (posCafe ?? []).filter((x) => cafeSel[x.chave]);
  const valorCafe = (x: Posicao) => r2v((n(cafeSel[x.chave]?.sacas ?? '') ?? 0) * (n(cafeSel[x.chave]?.preco ?? '') ?? 0));
  const sacasCafe = cafeMarcado.reduce((s, x) => s + (n(cafeSel[x.chave].sacas) ?? 0), 0);
  const somaCafe = cafeMarcado.reduce((s, x) => s + valorCafe(x), 0);
  const bruto = deAnimais ? calc.valor : deCafe ? r2v(somaCafe) : r2v(somaItens);
  const descontos = r2v((n(funValor) ?? 0) + (n(comissao) ?? 0) + (n(frete) ?? 0) + (n(outrosDesc) ?? 0));
  const liquido = r2v(bruto - descontos);
  const somaRateio = rateio.reduce((s, x) => s + (n(x.perc) ?? 0), 0);
  const somaParcelas = parcelas.reduce((s, x) => s + (n(x.valor) ?? 0), 0);
  const contratoAtivo = deCafe ? contrato : null;
  const faltaContrato = contratoAtivo ? saldoSacas(contratoAtivo) : 0;
  /** o que esta entrega quita sem dinheiro: adiantamento ainda não abatido, ou a compra da troca */
  const compensar = contratoAtivo ? Math.max(0, Math.min(liquido, aCompensar(contratoAtivo))) : 0;

  // Funrural/Senar em %: o valor acompanha o valor bruto da venda
  useEffect(() => {
    const p = n(funPerc);
    if (funPerc.trim() && p != null) setFunValor(bruto > 0 ? moedaParaCampo(r2v((bruto * p) / 100)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funPerc, bruto]);

  // parcelas: à vista = uma, na data da venda; a prazo = pelo nº, 1º vencimento e intervalo
  useEffect(() => {
    if (liquido <= 0) return setParcelas([]);
    if (pagto[0] === 'avista') return setParcelas([{ chave: chave(), venc: data, valor: moedaParaCampo(liquido) }]);
    const q = Math.max(1, Math.min(60, Number(nParc) || 1));
    const base = paraBanco(primeiro) ?? (paraBanco(data) ? somarDias(paraBanco(data)!, Number(intervalo) || 30) : null);
    if (!base) return;
    const cada = Math.floor((liquido / q) * 100) / 100;
    const ultima = r2v(liquido - cada * (q - 1));
    setParcelas(Array.from({ length: q }, (_, i) => ({ chave: chave(), venc: doBanco(somarDias(base, i * (Number(intervalo) || 30))), valor: moedaParaCampo(i === q - 1 ? ultima : cada) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagto[0], nParc, primeiro, intervalo, liquido, pagto[0] === 'avista' ? data : '']);

  // ---- lotes e pesagem ----
  const lerLote = useCallback(async (id: string): Promise<InfoLote> => {
    const [l, c] = await Promise.all([
      consulta<any>(supabase.from('lotes').select('id, numero, descricao').eq('id', id).single()),
      supabase.from('animais').select('id', { count: 'exact', head: true }).eq('lote_id', id).eq('situacao', 'ativo'),
    ]);
    return { ...l, cabecas: c.count ?? 0 };
  }, []);
  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, sexo').eq('fazenda_id', fid!).eq('situacao', 'ativo').order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla), detalhe: l.sexo === 'M' ? 'Lote de machos' : l.sexo === 'F' ? 'Lote de fêmeas' : 'Sexo não definido' }));
  }, [fid, sigla]);
  // V158: os lotes aparecem na própria tela (sem abrir outra página) e o estoque por sexo e faixa de idade
  useEffect(() => {
    if (!deAnimais || !fid) return;
    carregarLotes()
      .then((l) => {
        setLotesAtivos(l);
        // sem lote nenhum: já abre pelo rebanho (sexo e idade)
        if (!l.length) setOrigem(['faixa']);
      })
      .catch(() => setLotesAtivos([]));
    supabase.rpc('estoque_gado_faixas', { p_fazenda: fid }).then(({ data }) => setEstoque(((data ?? []) as Faixa[])));
  }, [deAnimais, fid, carregarLotes]);
  const faixaEscolhida = estoque?.find((x) => x.sexo === sexo[0] && String(x.idade_de) === faixa[0]) ?? null;
  const estoqueFaixa = (sx: string, de: string) => estoque?.find((x) => x.sexo === sx && String(x.idade_de) === de)?.cabecas ?? 0;
  const totalSexo = (sx: string) => (estoque ?? []).filter((x) => x.sexo === sx).reduce((t, x) => t + x.cabecas, 0);

  async function escolherLote(id: string | null) {
    setAnimais([]);
    setLote(id ? await lerLote(id).catch(() => null) : null);
  }
  function soltarPesagem() {
    if (!pesagem) return;
    setPesagem(null);
    setQuantidade('');
    setPeso('');
  }
  async function puxarPesagem() {
    setErros((e) => ({ ...e, pesagem: '' }));
    const num = Number(numPesagem);
    if (!Number.isInteger(num) || num < 1) return setErros((e) => ({ ...e, pesagem: 'Informe o número da pesagem.' }));
    setPuxando(true);
    try {
      const lista = await consulta<any[]>(
        supabase
          .from('pesagens')
          .select('id, numero, data, lote_id, destino_pessoa_id, peso_arroba, itens:pesagem_itens ( quantidade, peso_bruto_kg, brinco ), mov:movimentacoes ( id )')
          .eq('fazenda_id', fid!)
          .eq('numero', num)
          .limit(1),
      );
      const x = lista[0];
      if (!x) return setErros((e) => ({ ...e, pesagem: `Pesagem nº ${num} não encontrada nesta fazenda.` }));
      if ((Array.isArray(x.mov) ? x.mov : x.mov ? [x.mov] : []).length) return setErros((e) => ({ ...e, pesagem: `A pesagem nº ${num} já foi usada em outra movimentação ou venda.` }));
      const its = x.itens as { quantidade: number; peso_bruto_kg: number; brinco: string | null }[];
      const cabP = its.reduce((s, i) => s + i.quantidade, 0);
      const kg = its.reduce((s, i) => s + Number(i.peso_bruto_kg), 0);
      setData(doBanco(x.data));
      setModo(['quantidade']);
      setQuantidade(String(cabP));
      setPeso(numeroParaCampo(kg));
      if (Number(x.peso_arroba) > 0) setKgArroba(numeroParaCampo(x.peso_arroba));
      if (x.lote_id) {
        setOrigem(['lote']);
        await escolherLote(x.lote_id);
      }
      if (x.destino_pessoa_id) setPessoaId(x.destino_pessoa_id);
      setPesagem({
        id: x.id,
        numero: x.numero,
        porBrinco: its.length > 0 && its.every((i) => i.brinco && i.quantidade === 1),
        texto: `${formatarNumero(cabP)} cab., ${formatarNumero(kg, 1)} kg brutos, em ${doBanco(x.data)}.`,
      });
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setPuxando(false);
    }
  }

  // ---- outros produtos e serviços ----
  const mudar = (k: string, campos: Partial<Item>) => setItens((l) => l.map((i) => (i.chave === k ? { ...i, ...campos } : i)));
  const buscarProdutos = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      let q = supabase.from('insumos').select('id, nome, categoria, unidade, unidade_dose, conteudo_por_unidade').eq('ativo', true).order('nome').limit(60);
      if (t) q = q.ilike('nome', `%${t}%`);
      const ins = await consulta<any[]>(q);
      const movs = ins.length && fid ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade').eq('fazenda_id', fid).in('insumo_id', ins.map((i) => i.id))) : [];
      return ins.map((i) => ({ id: i.id, titulo: i.nome, detalhe: `${ROTULO_CATEGORIA_INSUMO[i.categoria] ?? i.categoria} · estoque ${textoSaldo(saldoDe(movs.filter((m) => m.insumo_id === i.id)), i)}` }));
    },
    [fid],
  );
  const lerProduto = useCallback(async (iid: string) => (await supabase.from('insumos').select('nome').eq('id', iid).maybeSingle()).data?.nome ?? null, []);
  async function escolherProduto(k: string, iid: string | null) {
    if (!iid) return mudar(k, { insumoId: null });
    const { data: p } = await supabase.from('insumos').select('nome, unidade').eq('id', iid).single();
    mudar(k, { insumoId: iid, unidade: p?.unidade ?? 'un', descricao: p?.nome ?? '' });
  }
  function mudarQtdOuUnit(it: Item, campo: 'qtd' | 'unit', t: string) {
    const q = campo === 'qtd' ? n(t) : n(it.qtd);
    const u = campo === 'unit' ? n(t) : n(it.unit);
    mudar(it.chave, { [campo]: t, ...(q != null && u != null ? { total: moedaParaCampo(r2v(q * u)) } : {}) } as Partial<Item>);
  }

  // ---- listas ----
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, fid)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [fid]);
  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.filter((c) => centroDaUnidade(c, fid)).map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }));
  }, [fid]);

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    const iso = paraBanco(data);
    if (!iso) e.data = 'Informe a data da venda.';
    else if (iso > hojeBanco()) e.data = 'A data da venda não pode ser futura.';
    if (!pessoaId) e.pessoa = 'Informe o cliente.';
    else if (contratoAtivo && pessoaId !== contratoAtivo.pessoa_id) e.pessoa = `O cliente tem de ser o do contrato: ${contratoAtivo.pessoa_nome}.`;
    if (deAnimais) {
      const doRebanho = origem[0] === 'faixa';
      if (!doRebanho && !lote) e.lote = 'Escolha o lote de onde saem os animais (ou "Do rebanho, por sexo e idade").';
      if (doRebanho) {
        if (!sexo.length) e.sexo = 'Informe o sexo dos animais.';
        if (!faixa.length) e.faixa = 'Informe a faixa de idade.';
        if (!Number.isInteger(cab) || cab < 1) e.quantidade = 'Informe a quantidade de cabeças.';
        else if (sexo.length && faixa.length && cab > estoqueFaixa(sexo[0], faixa[0]))
          e.quantidade = `No rebanho há ${formatarNumero(estoqueFaixa(sexo[0], faixa[0]))} ${sexo[0] === 'M' ? 'machos' : 'fêmeas'} de ${FAIXAS.find((f) => f.valor === faixa[0])?.rotulo}. Lance a entrada dos animais antes (Pecuário › Movimentações).`;
      } else if (modo[0] === 'quantidade') {
        if (!Number.isInteger(cab) || cab < 1) e.quantidade = 'Informe a quantidade de cabeças.';
        else if (lote && cab > lote.cabecas) e.quantidade = `O lote só tem ${formatarNumero(lote.cabecas)} cabeças.`;
      } else if (!animais.length) e.animais = 'Marque pelo menos um animal.';
      if (formaPreco !== 'cabeca' && (n(peso) ?? 0) <= 0) e.peso = 'Informe o peso bruto total (kg).';
      if (formaPreco === 'arroba' && (n(kgArroba) ?? 0) <= 0) e.kgArroba = 'Informe os kg da arroba.';
      if (usaBarriga && (n(barrigaValor) ?? 0) <= 0) e.barriga = 'Informe o desconto de barriga, ou marque "Sem desconto".';
      else if (formaPreco !== 'cabeca' && (n(peso) ?? 0) > 0 && calc.pesoLiquido <= 0) e.barriga = 'O desconto de barriga não pode zerar o peso.';
      if ((n(preco) ?? 0) <= 0) e.preco = 'Informe o preço.';
    } else if (deCafe) {
      if (!cafeMarcado.length) e.cafe = 'Marque o café que foi vendido.';
      else if (contratoAtivo && sacasCafe > faltaContrato + 0.005) e.cafe = `O contrato nº ${contratoAtivo.numero} só tem ${textoSacas(faltaContrato)} a entregar. O que passar vai em outra venda, sem contrato.`;
      for (const x of cafeMarcado) {
        const q = n(cafeSel[x.chave].sacas) ?? 0;
        if (q <= 0) e.cafe = `Informe as sacas do lote nº ${x.numero}.`;
        else if (q > x.saldo + 0.005) e.cafe = `O lote nº ${x.numero} só tem ${textoSacas(x.saldo)} em ${x.local?.nome ?? 'estoque'}.`;
        else if ((n(cafeSel[x.chave].preco) ?? 0) <= 0) e.cafe = `Informe o preço por saca do lote nº ${x.numero}.`;
      }
    } else {
      itens.forEach((i, k) => {
        if (i.tipo === 'insumo' && !i.insumoId) e[`p${k}`] = `Item ${k + 1}: escolha o produto.`;
        if (i.tipo === 'outro' && !i.descricao.trim()) e[`p${k}`] = `Item ${k + 1}: descreva o que foi vendido.`;
        if (i.tipo === 'insumo' && (n(i.qtd) ?? 0) <= 0) e[`q${k}`] = `Item ${k + 1}: informe a quantidade.`;
        if ((n(i.total) ?? 0) <= 0) e[`t${k}`] = `Item ${k + 1}: informe o valor.`;
      });
    }
    if (bruto > 0 && liquido <= 0) e.descontos = 'Os descontos não podem zerar o valor a receber.';
    if (rateio.length) {
      if (rateio.some((x) => !x.centroId)) e.rateio = 'Escolha o centro de custo de cada linha do rateio.';
      else if (new Set(rateio.map((x) => x.centroId)).size !== rateio.length) e.rateio = 'Há centro de custo repetido no rateio.';
      else if (Math.abs(somaRateio - 100) > 0.001) e.rateio = `O rateio soma ${formatarNumero(somaRateio, 2)}%: precisa fechar 100%.`;
    }
    if (liquido > 0) {
      if (!parcelas.length || parcelas.some((p) => !dataValida(p.venc) || (n(p.valor) ?? 0) <= 0)) e.parcelas = 'Confira o vencimento e o valor de cada parcela.';
      else if (Math.abs(somaParcelas - liquido) > 0.009) e.parcelas = `As parcelas somam ${formatarMoeda(somaParcelas)} e o valor a receber é ${formatarMoeda(liquido)}.`;
    }
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    const p = {
      fazenda_id: fid,
      tipo: tipo[0],
      data: iso,
      pessoa_id: pessoaId,
      numero_documento: documento,
      conta_contabil_id: null, // classificação automática: o banco define pelo tipo da venda (bovinos, café ou outras receitas)
      conta_bancaria_id: bancoId,
      forma_pagamento: pagto[0],
      observacoes: obs,
      animais: deAnimais
        ? {
            lote_origem: origem[0] === 'faixa' ? '' : lote!.id,
            quantidade: origem[0] === 'faixa' || modo[0] === 'quantidade' ? cab : 0,
            animais: origem[0] === 'faixa' || modo[0] === 'quantidade' ? [] : animais,
            sexo: origem[0] === 'faixa' ? sexo[0] : '',
            idade_de: origem[0] === 'faixa' ? faixa[0] : '',
            idade_ate: origem[0] === 'faixa' ? String(FAIXAS_ATE[faixa[0]] ?? '') : '',
            pesagem: pesagem?.id ?? '',
            peso_bruto: n(peso) ?? '',
            forma_preco: formaPreco,
            kg_arroba: n(kgArroba) ?? '',
            barriga_tipo: usaBarriga ? barrigaTipo[0] : '',
            barriga_valor: usaBarriga ? n(barrigaValor) : '',
            preco: n(preco),
            valor_bruto: bruto,
          }
        : null,
      itens: deAnimais
        ? []
        : deCafe
          ? cafeMarcado.map((x) => ({
              tipo_item: 'cafe',
              cafe_lote_id: x.loteId,
              cafe_local_id: x.localId,
              descricao: `Café ${rotuloTipo(x.lote ?? {})} · lote nº ${x.numero}`,
              quantidade: n(cafeSel[x.chave].sacas),
              unidade: 'sc',
              valor_unitario: n(cafeSel[x.chave].preco),
              valor_total: valorCafe(x),
            }))
        : itens.map((i) => ({
            tipo_item: i.tipo,
            insumo_id: i.tipo === 'insumo' ? i.insumoId : null,
            descricao: i.descricao,
            quantidade: n(i.qtd) ?? 1,
            unidade: i.tipo === 'insumo' ? i.unidade : 'un',
            valor_unitario: n(i.unit) ?? '',
            valor_total: n(i.total),
          })),
      funrural_perc: funPerc.trim() ? n(funPerc) : '',
      funrural_valor: n(funValor) ?? 0,
      comissao: n(comissao) ?? 0,
      frete: n(frete) ?? 0,
      outros_descontos: n(outrosDesc) ?? 0,
      rateio: rateio.map((x) => ({ centro_custo_id: x.centroId, percentual: n(x.perc) })),
      parcelas: parcelas.map((x) => ({ vencimento: paraBanco(x.venc), valor: n(x.valor) })),
    };
    setSalvando(true);
    const { data: r, error } = contratoAtivo ? await supabase.rpc('salvar_venda_contrato', { p: { ...p, cafe_contrato_id: contratoAtivo.id } }) : await supabase.rpc('salvar_venda', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; liquido: number; cabecas: number | null; compensado?: number; contrato?: number; saldo_sacas?: number };
    const comp = Number(res.compensado ?? 0);
    const textoContrato = contratoAtivo
      ? ` Contrato nº ${contratoAtivo.numero}: ${Number(res.saldo_sacas ?? 0) > 0 ? `faltam ${textoSacas(Number(res.saldo_sacas))}` : 'concluído'}${comp > 0 ? `; ${formatarMoeda(comp)} ${contratoAtivo.tipo === 'troca' ? 'quitaram a compra dos insumos' : 'foram abatidos do adiantamento'} sem movimentar dinheiro; fica a receber ${formatarMoeda(Math.max(0, Number(res.liquido) - comp))}` : ''}.`
      : '';
    const receber = parcelas.length === 1 ? '1 título no contas a receber' : `${parcelas.length} parcelas no contas a receber`;
    navegacao.replace('VendaForm', {
      aviso: deAnimais
        ? `Venda nº ${res.numero} gravada: ${formatarNumero(res.cabecas ?? cab)} ${(res.cabecas ?? cab) === 1 ? 'cabeça saiu' : 'cabeças saíram'} ${origem[0] === 'faixa' || !lote ? 'do rebanho' : `do lote ${codigoLote(lote.numero, sigla)}`}, ${formatarMoeda(Number(res.liquido))} a receber (${receber}).`
        : deCafe
          ? `Venda nº ${res.numero} gravada: ${textoSacas(sacasCafe)} de café saíram do armazém, ${formatarMoeda(Number(res.liquido))} ${comp > 0 ? 'no total' : 'a receber'} (${receber}).${textoContrato}`
          : `Venda nº ${res.numero} gravada: ${formatarMoeda(Number(res.liquido))} a receber (${receber}).`,
    });
  }

  // ---- excluir uma venda já lançada (não se altera: exclui e lança de novo) ----
  async function excluirPorNumero() {
    setExcluirErro(null);
    const m = /^0*(\d+)$/.exec(excluirNum.trim());
    if (!m || !fid) return setExcluirErro('Digite o número da venda.');
    const { data: v } = await supabase.from('vendas').select('id, numero, data, tipo, cabecas, valor_total, pessoa:pessoas ( nome )').eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!v) return setExcluirErro(`Não há venda nº ${m[1]}.`);
    const pes: any = Array.isArray((v as any).pessoa) ? (v as any).pessoa[0] : (v as any).pessoa;
    Alert.alert(
      'Excluir venda',
      `Excluir a venda nº ${v.numero}, de ${doBanco(v.data)}${pes?.nome ? `, para ${pes.nome}` : ''}, no valor de ${formatarMoeda(Number(v.valor_total))}?` +
        (v.tipo === 'animais' ? ` ${v.cabecas === 1 ? 'O animal volta' : `Os ${v.cabecas} animais voltam`} para o rebanho.` : v.tipo === 'cafe' ? ' O café volta para o armazém.' : ' Produto de estoque vendido volta para o estoque.') +
        ' O contas a receber dela é apagado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_venda', { p_id: v.id }), 'venda_id', String(v.id));
            if (error) return setExcluirErro(traduzirErro(error));
            setExcluirAberto(false);
            setExcluirNum('');
            setAviso(`Venda nº ${v.numero} excluída.`);
            recarregarTopo();
            if (lote) escolherLote(lote.id);
          },
        },
      ],
    );
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Lançar" />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaVendas />
      </Tela>
    );
  }

  const nomePreco = textoFormaPreco(formaPreco);

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Venda nº</Text>
          <Text style={estilos.numeroValor}>{proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {excluirAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Excluir a venda nº" value={excluirNum} onChangeText={(t) => setExcluirNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={excluirErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Excluir" tipo="perigo" onPress={excluirPorNumero} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setExcluirAberto(true)}>
          Excluir uma venda já lançada (venda não se altera: exclui e lança de novo)
        </Text>
      )}

      <Escolha
        rotulo="O que está vendendo"
        opcoes={[
          { valor: 'animais', rotulo: 'Animais' },
          { valor: 'cafe', rotulo: 'Café' },
          { valor: 'outros', rotulo: 'Outros produtos e serviços' },
        ]}
        valor={tipo}
        aoMudar={setTipo}
      />
      {faturadoPor ? <Text style={{ fontSize: 13, color: '#56625A' }}>Faturamento em nome de: {faturadoPor}</Text> : null}
      <CampoPessoaBusca rotulo="Cliente *" valorId={pessoaId} aoMudar={setPessoaId} tipoNovo="cliente" erro={erros.pessoa} />
      <Campo rotulo={deAnimais ? 'Nº da nota / GTA' : 'Nº da nota / documento'} value={documento} onChangeText={setDocumento} autoCapitalize="characters" />

      {deAnimais ? (
        <>
          {/* ---------- animais ---------- */}
          <Secao titulo="Animais" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo
                rotulo="Nº da pesagem"
                value={numPesagem}
                onChangeText={(t) => {
                  setNumPesagem(t.replace(/\D/g, '').slice(0, 6));
                  soltarPesagem();
                }}
                keyboardType="number-pad"
                placeholder="Se foi pesado"
              />
            </View>
            <View style={{ width: 140, paddingTop: 26 }}>
              <Botao titulo="Puxar dados" tipo="secundario" onPress={puxarPesagem} carregando={puxando} />
            </View>
          </View>
          {erros.pesagem ? <Text style={estilos.erro}>{erros.pesagem}</Text> : null}
          {pesagem && (
            <Aviso
              tipo="info"
              texto={`Pesagem nº ${pesagem.numero}: ${pesagem.texto} Lote, cabeças e peso foram preenchidos.${pesagem.porBrinco ? ' Como todas as pesadas têm brinco de animais do lote, saem exatamente esses.' : ''}`}
            />
          )}
          <Escolha
            rotulo="De onde saem os animais"
            opcoes={[
              { valor: 'lote', rotulo: 'De um lote' },
              { valor: 'faixa', rotulo: 'Do rebanho, por sexo e idade' },
            ]}
            valor={origem}
            aoMudar={(v) => {
              setOrigem(v);
              if (v[0] === 'faixa') {
                escolherLote(null);
                setModo(['quantidade']);
              }
            }}
          />
          {origem[0] === 'lote' ? (
            <>
              {lotesAtivos === null ? null : lotesAtivos.length ? (
                <Escolha
                  rotulo="Lote de origem *"
                  opcoes={lotesAtivos.map((l) => ({ valor: l.id, rotulo: l.titulo }))}
                  valor={lote ? [lote.id] : []}
                  aoMudar={(v) => escolherLote(v[0] ?? null)}
                  erro={erros.lote}
                />
              ) : (
                <Aviso tipo="info" texto='Nenhum lote ativo nesta fazenda. Use "Do rebanho, por sexo e idade".' />
              )}
            {lote && (
              <>
                <Text style={estilos.nota}>
                  {formatarNumero(lote.cabecas)} {lote.cabecas === 1 ? 'cabeça' : 'cabeças'} no lote agora.
                </Text>
                <Escolha
                  rotulo="Quais animais"
                  opcoes={[
                    { valor: 'quantidade', rotulo: 'Por quantidade' },
                    { valor: 'escolher', rotulo: 'Escolher os animais' },
                  ]}
                  valor={modo}
                  aoMudar={(v) => {
                    setModo(v);
                    if (v[0] === 'escolher' && pesagem) {
                      setPesagem(null);
                      setNumPesagem('');
                    }
                  }}
                />
                {modo[0] === 'quantidade' ? (
                  <Campo
                    rotulo="Quantidade de cabeças *"
                    value={quantidade}
                    onChangeText={(t) => setQuantidade(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    ajuda={pesagem ? undefined : 'O sistema tira primeiro os sem brinco e, entre eles, os de número mais alto.'}
                    erro={erros.quantidade}
                  />
                ) : (
                  <SeletorAnimais loteId={lote.id} valor={animais} aoMudar={setAnimais} erro={erros.animais} />
                )}
              </>
            )}
            </>
          ) : (
            <>
              {estoque !== null && !estoque.length ? (
                <Aviso tipo="erro" texto="Não há gado no rebanho desta fazenda. Lance a entrada dos animais (Pecuário › Movimentações: nascimento, compra ou estoque inicial) antes de vender." />
              ) : null}
              <Escolha
                rotulo="Sexo *"
                opcoes={[
                  { valor: 'M', rotulo: `Machos (${formatarNumero(totalSexo('M'))})` },
                  { valor: 'F', rotulo: `Fêmeas (${formatarNumero(totalSexo('F'))})` },
                ]}
                valor={sexo}
                aoMudar={setSexo}
                erro={erros.sexo}
              />
              <Escolha
                rotulo="Faixa de idade *"
                opcoes={FAIXAS.map((f) => ({ valor: f.valor, rotulo: sexo.length ? `${f.rotulo} (${formatarNumero(estoqueFaixa(sexo[0], f.valor))})` : f.rotulo }))}
                valor={faixa}
                aoMudar={setFaixa}
                erro={erros.faixa}
              />
              <Campo
                rotulo="Quantidade de cabeças *"
                value={quantidade}
                onChangeText={(t) => setQuantidade(t.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                ajuda={faixaEscolhida ? `${formatarNumero(faixaEscolhida.cabecas)} no estoque nessa faixa. O sistema tira primeiro os sem brinco.` : sexo.length && faixa.length ? 'Não há estoque nessa faixa.' : undefined}
                erro={erros.quantidade}
              />
            </>
          )}

          {/* ---------- peso e preço ---------- */}
          <Secao titulo="Peso e preço" />
          <Escolha
            rotulo="Como é o preço"
            opcoes={[
              { valor: 'arroba', rotulo: 'Por arroba' },
              { valor: 'kg', rotulo: 'Por kg vivo' },
              { valor: 'cabeca', rotulo: 'Por cabeça' },
            ]}
            valor={forma}
            aoMudar={setForma}
          />
          <Campo rotulo={`Peso bruto total (kg)${formaPreco === 'cabeca' ? '' : ' *'}`} value={peso} onChangeText={setPeso} keyboardType="decimal-pad" erro={erros.peso} />
          {formaPreco !== 'cabeca' && (
            <>
              <Escolha
                rotulo="Desconto de barriga"
                opcoes={[
                  { valor: 'nao', rotulo: 'Sem desconto' },
                  { valor: 'perc', rotulo: '% do peso' },
                  { valor: 'kg_cab', rotulo: 'kg por cabeça' },
                ]}
                valor={barrigaTipo}
                aoMudar={setBarrigaTipo}
              />
              {barrigaTipo[0] !== 'nao' && (
                <Campo
                  rotulo={barrigaTipo[0] === 'perc' ? 'Desconto de barriga (% do peso bruto)' : 'Desconto de barriga (kg por cabeça)'}
                  value={barrigaValor}
                  onChangeText={setBarrigaValor}
                  keyboardType="decimal-pad"
                  erro={erros.barriga}
                  ajuda={calc.barrigaKg > 0 ? `Desconta ${formatarNumero(calc.barrigaKg, 2)} kg: peso para a conta ${formatarNumero(calc.pesoLiquido, 2)} kg.` : undefined}
                />
              )}
            </>
          )}
          {formaPreco === 'arroba' && (
            <Campo
              rotulo="Kg da arroba *"
              value={kgArroba}
              onChangeText={setKgArroba}
              keyboardType="decimal-pad"
              erro={erros.kgArroba}
              ajuda={
                (n(kgArroba) ?? 0) > 0
                  ? `Arroba de 15 kg de carcaça com ${formatarNumero((15 / n(kgArroba)!) * 100, 2)}% de rendimento. 30 kg = boi em pé a 50%; acima de 30 (ex.: 31,45) já desconta barriga.`
                  : '30 kg = boi em pé a 50% de rendimento.'
              }
            />
          )}
          <CampoMoeda rotulo={`Preço (R$ por ${nomePreco}) *`} valor={preco} aoMudar={setPreco} erro={erros.preco} />
          {cab > 0 && calc.valor > 0 && (
            <View style={estilos.calculo}>
              <Text style={estilos.calcTitulo}>Conta da venda</Text>
              {formaPreco !== 'cabeca' && (
                <Text style={estilos.calcLinha}>
                  {formatarNumero(n(peso) ?? 0, 2)} kg brutos
                  {calc.barrigaKg > 0 ? ` − ${formatarNumero(calc.barrigaKg, 2)} kg de barriga = ${formatarNumero(calc.pesoLiquido, 2)} kg` : ''}
                  {formaPreco === 'arroba' ? ` ÷ ${formatarNumero(n(kgArroba) ?? 0, 2)} kg = ${formatarNumero(calc.arrobas, 2)} @` : ''}
                </Text>
              )}
              <Text style={estilos.calcLinha}>
                {formaPreco === 'arroba' ? `${formatarNumero(calc.arrobas, 2)} @` : formaPreco === 'kg' ? `${formatarNumero(calc.pesoLiquido, 2)} kg` : `${formatarNumero(cab)} cab.`} × {formatarMoeda(n(preco) ?? 0)} ={' '}
                <Text style={{ fontWeight: '800' }}>{formatarMoeda(calc.valor)}</Text>
              </Text>
              <Text style={estilos.nota}>
                Por cabeça: {formatarMoeda(calc.valor / cab)}
                {(n(peso) ?? 0) > 0 ? ` · ${formatarNumero((n(peso) ?? 0) / cab, 1)} kg brutos` : ''}
                {calc.arrobas > 0 ? ` · ${formatarNumero(calc.arrobas / cab, 2)} @` : ''}
                {formaPreco !== 'arroba' && calc.arrobas > 0 ? ` · equivale a ${formatarMoeda(calc.valor / calc.arrobas)} por @ de ${formatarNumero(n(kgArroba) || 30, 2)} kg` : ''}
              </Text>
            </View>
          )}
        </>
      ) : deCafe ? (
        <>
          {/* ---------- café ---------- */}
          {contratos.length > 0 && (
            <>
              <Secao titulo="Entrega de contrato" />
              <Escolha
                opcoes={[{ valor: '', rotulo: 'Sem contrato' }, ...contratos.map((c) => ({ valor: c.id, rotulo: rotuloContrato(c) }))]}
                valor={[contrato?.id ?? '']}
                aoMudar={(v) => escolherContrato(v[0])}
              />
              {contrato && (
                <Aviso
                  tipo="info"
                  texto={`${contrato.tipo === 'troca' ? `Troca por insumos (compra nº ${contrato.compra_numero ?? ''})` : 'Venda futura'}: ${textoPreco(contrato)}, faltam ${textoSacas(faltaContrato)}, entrega até ${doBanco(contrato.data_entrega)}.${
                    aCompensar(contrato) > 0
                      ? contrato.tipo === 'troca'
                        ? ` A compra tem ${formatarMoeda(aCompensar(contrato))} em aberto: esta venda quita a compra sem movimentar dinheiro.`
                        : ` Adiantamento a compensar: ${formatarMoeda(aCompensar(contrato))}, abatido do valor a receber.`
                      : ''
                  }`}
                />
              )}
            </>
          )}
          <Secao titulo="Café vendido" />
          {posCafe === null ? null : posCafe.length === 0 ? (
            <Text style={estilos.nota}>Nenhum café em estoque. A entrada é em Agrícola › Armazém de café.</Text>
          ) : (
            posCafe.map((x) => {
              const s = cafeSel[x.chave];
              return (
                <View key={x.chave} style={[estilos.item, !!s && { borderColor: cores.primaria }]}>
                  <Pressable
                    onPress={() =>
                      setCafeSel((a) => {
                        const novo = { ...a };
                        if (novo[x.chave]) delete novo[x.chave];
                        else {
                          const jaMarcado = (Object.values(a) as { sacas: string; preco: string }[]).reduce((t: number, y) => t + (n(y.sacas) ?? 0), 0);
                          const limite = contratoAtivo ? Math.max(0, Math.round((faltaContrato - jaMarcado) * 1000) / 1000) : x.saldo;
                          novo[x.chave] = { sacas: numeroParaCampo(Math.min(x.saldo, limite || x.saldo)), preco: Object.values(a).find((y) => y.preco)?.preco ?? precoSugerido(x) };
                        }
                        return novo;
                      })
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!s }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <Ionicons name={s ? 'checkbox' : 'square-outline'} size={26} color={s ? cores.primaria : cores.textoSuave} />
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.subtitulo}>
                        Lote nº {x.numero} · {textoSacas(x.saldo)}
                      </Text>
                      <Text style={estilos.nota}>
                        {rotuloTipo(x.lote ?? {})} · {nomeLocal(x.local)}
                      </Text>
                      {(() => {
                        const c = cotacaoReferencia(cotsCafe, x.lote?.tipo);
                        return c ? (
                          <Text style={estilos.nota}>
                            Cotação de {doBanco(c.data)}: {formatarMoeda(c.preco)} ({c.fonte}, tipo {c.tipo})
                          </Text>
                        ) : null;
                      })()}
                    </View>
                  </Pressable>
                  {s && (
                    <>
                      <View style={estilos.linha}>
                        <View style={{ flex: 1 }}>
                          <Campo rotulo="Sacas de 60 kg *" value={s.sacas} onChangeText={(t) => setCafeSel((a) => ({ ...a, [x.chave]: { ...a[x.chave], sacas: t } }))} keyboardType="decimal-pad" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <CampoMoeda rotulo="Preço por saca (R$) *" valor={s.preco} aoMudar={(t) => setCafeSel((a) => ({ ...a, [x.chave]: { ...a[x.chave], preco: t } }))} />
                        </View>
                      </View>
                      {valorCafe(x) > 0 && (
                        <Text style={estilos.nota}>
                          {textoSacas(n(s.sacas) ?? 0)} × {formatarMoeda(n(s.preco) ?? 0)} = {formatarMoeda(valorCafe(x))}
                          {(n(s.sacas) ?? 0) < x.saldo - 0.005 ? ` · ficam ${textoSacas(r2v(x.saldo - (n(s.sacas) ?? 0)))} no armazém` : ''}
                        </Text>
                      )}
                    </>
                  )}
                </View>
              );
            })
          )}
          {erros.cafe ? <Text style={{ fontSize: tam.pequeno, color: cores.erro }}>{erros.cafe}</Text> : null}
          {cafeMarcado.length > 0 && sacasCafe > 0 && (
            <Text style={estilos.nota}>
              Total: {textoSacas(sacasCafe)} ({formatarNumero(sacasCafe * 60)} kg){somaCafe > 0 ? ` · preço médio ${formatarMoeda(somaCafe / sacasCafe)} por saca` : ''}. A venda tira as sacas do lote e do armazém. O custo e a margem por saca aparecem na ficha da venda e no painel da safra.
            </Text>
          )}
        </>
      ) : (
        <>
          {/* ---------- outros produtos e serviços ---------- */}
          <Secao titulo="Itens" />
          {itens.map((it, k) => (
            <View key={it.chave} style={estilos.item}>
              <View style={estilos.itemTopo}>
                <Text style={estilos.itemNum}>Item {k + 1}</Text>
                {itens.length > 1 && (
                  <Pressable onPress={() => setItens((l) => l.filter((x) => x.chave !== it.chave))} hitSlop={10} accessibilityLabel={`Tirar item ${k + 1}`}>
                    <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
                  </Pressable>
                )}
              </View>
              <Escolha
                opcoes={[
                  { valor: 'outro', rotulo: 'Serviço / outro' },
                  { valor: 'insumo', rotulo: 'Produto do estoque' },
                ]}
                valor={[it.tipo]}
                aoMudar={(v) => mudar(it.chave, { tipo: v[0] as Item['tipo'], insumoId: null })}
              />
              {it.tipo === 'insumo' ? (
                <>
                  <CampoBuscaRapida rotulo="Produto *" valorId={it.insumoId} aoMudar={(v) => escolherProduto(it.chave, v)} buscar={buscarProdutos} lerNome={lerProduto} icone="cube" placeholder="Nome do produto" erro={erros[`p${k}`]} />
                  <View style={estilos.linha}>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo={`Qtde. (${it.unidade}) *`} value={it.qtd} onChangeText={(t) => mudarQtdOuUnit(it, 'qtd', t)} keyboardType="decimal-pad" erro={erros[`q${k}`]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CampoMoeda rotulo="R$ unitário" valor={it.unit} aoMudar={(t) => mudarQtdOuUnit(it, 'unit', t)} />
                    </View>
                  </View>
                  <Text style={estilos.nota}>Sai do estoque ao gravar.</Text>
                </>
              ) : (
                <Campo rotulo="Descrição *" value={it.descricao} onChangeText={(t) => mudar(it.chave, { descricao: t })} autoCapitalize="sentences" placeholder="Ex.: Sucata, serviço de trator, esterco" erro={erros[`p${k}`]} />
              )}
              <CampoMoeda rotulo="Valor (R$) *" valor={it.total} aoMudar={(t) => mudar(it.chave, { total: t })} erro={erros[`t${k}`]} />
            </View>
          ))}
          <Text style={estilos.link} onPress={() => setItens((l) => [...l, itemVazio()])}>
            + Adicionar item
          </Text>
          <Text style={estilos.nota}>Venda de café: marque "Café" em "O que está vendendo" (baixa o armazém e o lote).</Text>
        </>
      )}

      {/* ---------- descontos e total ---------- */}
      {descAberto || descontos > 0 ? (
        <>
          <Secao titulo="Descontos na nota" />
          <View style={estilos.linha}>
            <View style={{ width: 120 }}>
              <Campo rotulo="Funrural / Senar %" value={funPerc} onChangeText={setFunPerc} keyboardType="decimal-pad" placeholder="Ex.: 1,5" />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda
                rotulo="Funrural / Senar (R$)"
                valor={funValor}
                aoMudar={(t) => {
                  setFunPerc('');
                  setFunValor(t);
                }}
              />
            </View>
          </View>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Comissão" valor={comissao} aoMudar={setComissao} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Frete" valor={frete} aoMudar={setFrete} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Outros" valor={outrosDesc} aoMudar={setOutrosDesc} />
            </View>
          </View>
          <Text style={estilos.nota}>Só o que o comprador desconta do pagamento. O que você paga à parte (frete, comissão) é lançado no Contas a pagar.</Text>
          {erros.descontos && <Text style={estilos.erro}>{erros.descontos}</Text>}
        </>
      ) : (
        <Text style={estilos.link} onPress={() => setDescAberto(true)}>
          + Descontos na nota (Funrural / Senar, comissão, frete)
        </Text>
      )}
      <View style={estilos.total}>
        <View>
          <Text style={estilos.totalRotulo}>Valor a receber</Text>
          {descontos > 0 && (
            <Text style={estilos.nota}>
              {formatarMoeda(bruto)} − {formatarMoeda(descontos)} de descontos
            </Text>
          )}
        </View>
        <Text style={estilos.totalValor}>{formatarMoeda(Math.max(0, liquido))}</Text>
      </View>
      {compensar > 0 && contratoAtivo && (
        <Aviso
          tipo="info"
          texto={`Desta venda, ${formatarMoeda(compensar)} ${contratoAtivo.tipo === 'troca' ? `quitam a compra nº ${contratoAtivo.compra_numero ?? ''}` : 'são abatidos do adiantamento'} sem movimentar dinheiro${liquido - compensar > 0.004 ? ` e ${formatarMoeda(liquido - compensar)} ficam a receber` : '; não sobra nada a receber'}. Lance o recebimento à vista: o sistema baixa a parte compensada sozinho.`}
        />
      )}

      {/* ---------- classificação ---------- */}
      <Secao titulo="Classificação" />
      <Text style={estilos.nota}>A classificação é automática, pelo tipo da venda. Aqui só se aponta o centro de custo, se quiser.</Text>
      <Text style={estilos.subtitulo}>Rateio por centro de custo</Text>
      {rateio.map((x) => (
        <View key={x.chave} style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <SeletorLista rotulo="Centro de custo" valorId={x.centroId} aoMudar={(v) => setRateio((l) => l.map((y) => (y.chave === x.chave ? { ...y, centroId: v } : y)))} carregar={carregarCentros} vazio="Nenhum centro de custo. Cadastre em Financeiro › Centros de custo." />
          </View>
          <View style={{ width: 80 }}>
            <Campo rotulo="%" value={x.perc} onChangeText={(t) => setRateio((l) => l.map((y) => (y.chave === x.chave ? { ...y, perc: t } : y)))} keyboardType="decimal-pad" />
          </View>
          <Pressable onPress={() => setRateio((l) => l.filter((y) => y.chave !== x.chave))} hitSlop={8} style={{ paddingTop: 26 }} accessibilityLabel="Tirar centro">
            <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
          </Pressable>
        </View>
      ))}
      <View style={estilos.linhaEntre}>
        <Text style={estilos.link} onPress={() => setRateio((l) => [...l, { chave: chave(), centroId: null, perc: numeroParaCampo(r2v(Math.max(0, 100 - somaRateio))) }])}>
          + Centro de custo
        </Text>
        {rateio.length > 0 && <Text style={[estilos.soma, Math.abs(somaRateio - 100) > 0.001 && { color: cores.erro }]}>Soma {formatarNumero(somaRateio, 2)}%</Text>}
      </View>
      {erros.rateio && <Text style={estilos.erro}>{erros.rateio}</Text>}

      {/* ---------- recebimento ---------- */}
      <Secao titulo="Recebimento (contas a receber)" />
      <SeletorLista rotulo="Conta bancária / caixa prevista" valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} permitirLimpar vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />
      <Escolha
        rotulo="Forma"
        opcoes={[
          { valor: 'avista', rotulo: 'À vista' },
          { valor: 'prazo', rotulo: 'A prazo / parcelado' },
        ]}
        valor={pagto}
        aoMudar={setPagto}
      />
      {pagto[0] === 'prazo' && (
        <View style={estilos.linha}>
          <View style={{ width: 80 }}>
            <Campo rotulo="Parcelas" value={nParc} onChangeText={(t) => setNParc(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="1º vencimento" valor={primeiro} aoMudar={setPrimeiro} />
          </View>
          <View style={{ width: 90 }}>
            <Campo rotulo="A cada (dias)" value={intervalo} onChangeText={(t) => setIntervalo(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
          </View>
        </View>
      )}
      {parcelas.map((x, k) => (
        <View key={x.chave} style={estilos.linha}>
          <Text style={estilos.parcNum}>{k + 1}ª</Text>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="Vencimento" valor={x.venc} aoMudar={(t) => setParcelas((l) => l.map((y) => (y.chave === x.chave ? { ...y, venc: t } : y)))} />
          </View>
          <View style={{ flex: 1 }}>
            <CampoMoeda rotulo="Valor" valor={x.valor} aoMudar={(t) => setParcelas((l) => l.map((y) => (y.chave === x.chave ? { ...y, valor: t } : y)))} />
          </View>
        </View>
      ))}
      {parcelas.length > 1 && <Text style={[estilos.soma, Math.abs(somaParcelas - liquido) > 0.009 && { color: cores.erro }]}>Parcelas somam {formatarMoeda(somaParcelas)}</Text>}
      {erros.parcelas && <Text style={estilos.erro}>{erros.parcelas}</Text>}
      <Text style={estilos.nota}>O recebimento é confirmado em Financeiro › Contas a receber › Receber, quando o dinheiro entrar.</Text>

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />
      <Botao titulo="Gravar venda" onPress={salvar} carregando={salvando} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linhaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  subtitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  soma: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  parcNum: { width: 28, paddingTop: 36, fontSize: tam.texto, fontWeight: '800', color: cores.textoSuave },
  calculo: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 4 },
  calcTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.info },
  calcLinha: { fontSize: tam.texto, color: cores.texto, lineHeight: 24 },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemNum: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  totalRotulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  totalValor: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
});
