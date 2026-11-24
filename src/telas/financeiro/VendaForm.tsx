import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import ParcelasIntermediarias, { CampoQtdeIntermediarias, ajustarIntermediarias, erroIntermediarias, gerarSerie, juntarParcelas, somaLinhas, type LinhaParcela } from '../../componentes/ParcelasIntermediarias';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import ItensVendaGado, { itemGadoVazio, itensGadoParaBanco, calcItem, cabecasItem, sexoItem, useLotesVenda, validarItensGado, type ItemGado, type SaldoFaixa } from '../../componentes/ItensVendaGado';
import { faixaDaIdade } from '../../lib/faixas';
import { mesesEntre } from '../../lib/rebanho';
import type { GrupoParceriaVenda, ParceriaDaVenda } from '../../lib/movimentacoes';
import Interruptor from '../../componentes/Interruptor';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import ResumoPessoa from '../../componentes/ResumoPessoa';
import { lerFazendasCliente, type FazendaCliente } from '../../componentes/FazendasCliente';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaVendas from './ConsultaVendas';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { centroDaUnidade } from '../../lib/unidades';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { ROTULO_CATEGORIA_INSUMO, saldoDe, textoSaldo } from '../../lib/insumos';
import { useSigla } from '../../lib/useSigla';
import { somarDias } from '../../lib/reproducao';
import { r2v } from '../../lib/vendas';
import { CAMPOS_POSICAO, nomeLocal, posicoes, rotuloTipo, type Posicao } from '../../lib/armazem';
import { textoSacas } from '../../lib/posColheita';
import { cotacaoReferencia, lerCotacoes, type Cotacao } from '../../lib/cotacoes';
import { aCompensar, lerContratos, rotuloContrato, saldoSacas, textoPreco, type ContratoCafe } from '../../lib/contratosCafe';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Item = { chave: string; tipo: 'outro' | 'insumo'; insumoId: string | null; unidade: string; descricao: string; qtd: string; unit: string; total: string; /** V198: custo médio do estoque (por unidade de estoque) */ custo?: number | null };
type Rateio = { chave: string; centroId: string | null; perc: string };
type Parcela = { chave: string; venc: string; valor: string };
type Faixa = { sexo: 'M' | 'F'; faixa: string; idade_de: number; idade_ate: number | null; cabecas: number };

let cont = 0;
const chave = () => `v${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);
const UNIDADES_OUTRO = [
  { valor: 'un', rotulo: 'Unidade' },
  { valor: 'kg', rotulo: 'kg' },
  { valor: 'cx', rotulo: 'Caixa' },
  { valor: 'sc', rotulo: 'Saca' },
  { valor: 't', rotulo: 'Tonelada' },
  { valor: 'dz', rotulo: 'Dúzia' },
  { valor: 'l', rotulo: 'Litro' },
];
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
      .select('nome, razao_social, cpf_cnpj, uf')
      .eq('id', fid)
      .maybeSingle()
      .then(({ data }) => {
        setGtaUf((u) => u || String((data as any)?.uf ?? '').trim().toUpperCase());
        setFaturadoPor((data as any)?.cpf_cnpj ? `${(data as any).razao_social ?? (data as any).nome} · ${(data as any).cpf_cnpj}` : null);
      });
  }, [fid]);

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [proximo, setProximo] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [tipo, setTipo] = useState<string[]>([params?.contratoId ? 'cafe' : 'animais']);
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  // V159: fazenda do cliente (produtor rural) para onde vai a mercadoria, e a GTA da venda de gado
  const [fazCliente, setFazCliente] = useState<FazendaCliente[]>([]);
  const [fatId, setFatId] = useState<string | null>(null);
  const [gtaNum, setGtaNum] = useState('');
  const [gtaSerie, setGtaSerie] = useState('');
  const [gtaUf, setGtaUf] = useState('');
  useEffect(() => {
    setFatId(null);
    if (!pessoaId) return setFazCliente([]);
    lerFazendasCliente(pessoaId)
      .then((l) => {
        setFazCliente(l);
        if (l.length === 1) setFatId(l[0].id ?? null);
      })
      .catch(() => setFazCliente([]));
  }, [pessoaId]);
  // V193: cliente que é titular de outra fazenda do Grupo: venda de uma e compra da outra (mesmo CPF/CNPJ é transferência)
  const [fazGrupo, setFazGrupo] = useState<{ id: string; nome: string; ie: string }[]>([]);
  const [mesmoTitular, setMesmoTitular] = useState(false);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  useEffect(() => {
    setFazGrupo([]);
    setMesmoTitular(false);
    setDestinoId(null);
    if (!pessoaId || !fid) return;
    (async () => {
      const dig = (t: unknown) => String(t ?? '').replace(/\D/g, '');
      const [pe, fs] = await Promise.all([
        supabase.from('pessoas').select('cpf_cnpj').eq('id', pessoaId).maybeSingle(),
        supabase.from('fazendas').select('id, nome, cpf_cnpj, inscricao_estadual'),
      ]);
      const doc = dig(pe.data?.cpf_cnpj);
      if (!doc) return;
      const lista = ((fs.data ?? []) as any[]).filter((f) => dig(f.cpf_cnpj) === doc);
      if (lista.some((f) => f.id === fid)) return setMesmoTitular(true);
      setFazGrupo(lista.map((f) => ({ id: f.id, nome: f.nome, ie: dig(f.inscricao_estadual) })));
      if (lista.length === 1) setDestinoId(lista[0].id);
    })().catch(() => setFazGrupo([]));
  }, [pessoaId, fid]);
  // V194: a fazenda do cliente escolhida (mesmo CPF/CNPJ e mesma Inscrição Estadual) já diz qual fazenda do Grupo compra
  const destinoPelaIE = (() => {
    const ie = String(fazCliente.find((f) => f.id === fatId)?.inscricao_estadual ?? '').replace(/\D/g, '');
    return ie ? fazGrupo.find((f) => f.ie === ie) ?? null : null;
  })();
  useEffect(() => {
    if (destinoPelaIE) setDestinoId(destinoPelaIE.id);
  }, [destinoPelaIE?.id]);
  const [documento, setDocumento] = useState('');
  const [docSerie, setDocSerie] = useState('');
  // V203: gado em itens (cada item com sexo, idade, lote, peso e preço próprios)
  const [itensGado, setItensGado] = useState<ItemGado[]>([itemGadoVazio()]);
  const lotesVenda = useLotesVenda(fid);
  const [gadoFica, setGadoFica] = useState(false);
  const [estoqueRebanho, setEstoqueRebanho] = useState<Faixa[] | null>(null);
  // V191: saldo do Estoque de gado por sexo e faixa (null = a fazenda não usa)
  const [estoqueGado, setEstoqueGado] = useState<{ chave: string; sexo: string; faixa: number; saldo: number; saldo_gta: number }[] | null>(null);
  const [itens, setItens] = useState<Item[]>([itemVazio()]);
  // descontos na nota
  const [descAberto, setDescAberto] = useState(true);
  const [funPerc, setFunPerc] = useState('');
  const [funValor, setFunValor] = useState('');
  const [comissao, setComissao] = useState('');
  const [frete, setFrete] = useState('');
  const [outrosDesc, setOutrosDesc] = useState('');
  // classificação e recebimento
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [pagto, setPagto] = useState<string[]>(['avista']);
  const [nParc, setNParc] = useState('1');
  const [prazo1, setPrazo1] = useState('30');
  const [primeiro, setPrimeiro] = useState('');
  const [intervalo, setIntervalo] = useState('30');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [nInterm, setNInterm] = useState('0');
  const [interm, setInterm] = useState<LinhaParcela[]>([]);
  const [fixo, setFixo] = useState('');
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
  const cab = itensGado.reduce((t, it) => t + cabecasItem(it), 0);
  const valorGado = r2v(itensGado.reduce((t, it) => t + calcItem(it).valor, 0));
  const pesoGado = itensGado.reduce((t, it) => t + (n(it.peso) ?? 0), 0);
  const arrobasGado = itensGado.reduce((t, it) => t + calcItem(it).arrobas, 0);
  const somaItens = itens.reduce((s, i) => s + (n(i.total) ?? 0), 0);
  const cafeMarcado = (posCafe ?? []).filter((x) => cafeSel[x.chave]);
  const valorCafe = (x: Posicao) => r2v((n(cafeSel[x.chave]?.sacas ?? '') ?? 0) * (n(cafeSel[x.chave]?.preco ?? '') ?? 0));
  const sacasCafe = cafeMarcado.reduce((s, x) => s + (n(cafeSel[x.chave].sacas) ?? 0), 0);
  const somaCafe = cafeMarcado.reduce((s, x) => s + valorCafe(x), 0);
  const bruto = deAnimais ? valorGado : deCafe ? r2v(somaCafe) : r2v(somaItens);
  const descontos = r2v((n(funValor) ?? 0) + (n(comissao) ?? 0) + (n(frete) ?? 0) + (n(outrosDesc) ?? 0));
  const liquido = r2v(bruto - descontos);
  const somaRateio = rateio.reduce((s, x) => s + (n(x.perc) ?? 0), 0);
  // V170: intermediárias só no a prazo
  const somaInterm = pagto[0] !== 'avista' ? somaLinhas(interm) : 0;
  const valorFixo = pagto[0] !== 'avista' && interm.length ? n(fixo) ?? 0 : 0;
  const somaParcelas = r2v(parcelas.reduce((s, x) => s + (n(x.valor) ?? 0), 0) + somaInterm);
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
    const q = Math.max(1, Math.min(120, Number(nParc) || 1));
    // V203: prazo em dias (contados da data da venda) ou data certa do 1º vencimento
    const base = pagto[0] === 'dias' ? (paraBanco(data) ? somarDias(paraBanco(data)!, Number(prazo1) || 0) : null) : paraBanco(primeiro) ?? (paraBanco(data) ? somarDias(paraBanco(data)!, Number(intervalo) || 30) : null);
    if (!base) return;
    // V170: as normais dividem o que sobra depois das intermediárias (ou têm o valor fixo informado)
    const restante = r2v(liquido - somaInterm);
    if (restante <= 0 && valorFixo <= 0) return setParcelas([]);
    setParcelas(gerarSerie(q, base, Number(intervalo) || 30, restante, valorFixo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagto[0], nParc, primeiro, intervalo, prazo1, liquido, pagto[0] !== 'data' ? data : '', somaInterm, valorFixo]);
  useEffect(() => {
    setInterm((l) => ajustarIntermediarias(l, pagto[0] !== 'avista' ? nInterm : '0'));
  }, [nInterm, pagto[0]]);

  // ---- estoque (para o gado que sai do rebanho por sexo e idade) ----
  useEffect(() => {
    if (!deAnimais || !fid) return;
    supabase.rpc('estoque_gado_faixas', { p_fazenda: fid }).then(({ data }) => setEstoqueRebanho(((data ?? []) as Faixa[])));
    // V191: com lançamento no Estoque de gado, a venda olha o saldo dele (o rebanho é o Total)
    supabase
      .from('estoque_fiscal_lanc')
      .select('id', { count: 'exact', head: true })
      .eq('fazenda_id', fid)
      .then(({ count }) => {
        if (!count) return setEstoqueGado(null);
        supabase.rpc('estoque_fiscal_gado', { p_fazenda: fid, p_data: hojeBanco() }).then(({ data }) => setEstoqueGado((data ?? []) as any[]));
      });
  }, [deAnimais, fid]);
  // V199: na implantação a venda aceita Estoque de gado negativo (Financeiro › Parâmetros › Pecuária)
  const [aceitaNegativo, setAceitaNegativo] = useState(false);
  useEffect(() => {
    supabase
      .from('parametros')
      .select('valor, valor_padrao')
      .eq('chave', 'venda_gado_negativo')
      .maybeSingle()
      .then(({ data: p }) => setAceitaNegativo(Number(p?.valor ?? p?.valor_padrao ?? 0) === 1));
  }, []);
  // V191: com NF e GTA informadas, só vale o estoque Com GTA; sem elas, o Total
  const comGta = !!documento.trim() && !!gtaNum.trim();
  const estoque: Faixa[] | null = estoqueGado
    ? estoqueGado
        .map((x) => ({ sexo: x.sexo as 'M' | 'F', faixa: x.chave, idade_de: x.faixa, idade_ate: null, cabecas: Math.max(comGta ? x.saldo_gta : x.saldo, 0) }))
        .filter((x) => x.cabecas > 0)
    : estoqueRebanho;
  const nomeEstoque = estoqueGado ? (comGta ? 'No Estoque de gado (com GTA)' : 'No Estoque de gado') : 'No rebanho';
  const saldosGado: SaldoFaixa[] | null = estoque ? estoque.map((x) => ({ sexo: x.sexo, idade_de: x.idade_de, cabecas: x.cabecas })) : null;

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
    // V198: traz o custo médio do estoque e já propõe o valor de venda igual ao custo (pode mudar)
    const { data: cm } = await supabase.rpc('custo_medio_insumo', { p_insumo: iid, p_fazenda: fid, p_data: paraBanco(data) ?? new Date().toISOString().slice(0, 10) });
    const custo = cm != null ? Number(cm) : null;
    setItens((l) =>
      l.map((i) => {
        if (i.chave !== k) return i;
        const unit = custo != null ? moedaParaCampo(r2v(custo)) : i.unit;
        const q = n(i.qtd), u = n(unit);
        return { ...i, insumoId: iid, unidade: p?.unidade ?? 'un', descricao: p?.nome ?? '', custo, unit, total: q != null && u != null ? moedaParaCampo(r2v(q * u)) : i.total };
      }),
    );
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
  async function salvar(semGtaConfirmado?: unknown) {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    const iso = paraBanco(data);
    if (!iso) e.data = 'Informe a data da venda.';
    else if (iso > hojeBanco()) e.data = 'A data da venda não pode ser futura.';
    if (!pessoaId) e.pessoa = 'Informe o cliente.';
    else if (mesmoTitular) e.pessoa = 'O cliente é o titular desta fazenda: entre fazendas do mesmo titular é transferência (Mais › Transferências).';
    else if (fazGrupo.length && !destinoId) e.pessoa = 'Escolha a fazenda do Grupo que compra.';
    else if (fazGrupo.length && deCafe) e.pessoa = 'Venda de café entre fazendas do Grupo ainda não está pronta: use Mais › Transferências.';
    else if (contratoAtivo && pessoaId !== contratoAtivo.pessoa_id) e.pessoa = `O cliente tem de ser o do contrato: ${contratoAtivo.pessoa_nome}.`;
    if (deAnimais) {
      Object.assign(e, validarItensGado(itensGado, lotesVenda, saldosGado, !(estoqueGado && aceitaNegativo), nomeEstoque));
      if (gadoFica && fazGrupo.length) e.gadoFica = 'Venda para fazenda do Grupo não usa "o gado fica na fazenda".';
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
      const eInt = pagto[0] !== 'avista' ? erroIntermediarias(interm) : null;
      if (eInt) e.parcelas = eInt;
      else if (!parcelas.length || parcelas.some((p) => !dataValida(p.venc) || (n(p.valor) ?? 0) <= 0)) e.parcelas = 'Confira o vencimento e o valor de cada parcela.';
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
      documento_serie: docSerie,
      conta_contabil_id: null, // classificação automática: o banco define pelo tipo da venda (bovinos, café ou outras receitas)
      conta_bancaria_id: bancoId,
      forma_pagamento: pagto[0] === 'avista' ? 'avista' : 'prazo',
      fazenda_destino_id: fazGrupo.length ? destinoId ?? '' : '',
      observacoes: obs,
      pessoa_faturamento_id: fatId ?? '',
      gta_numero: deAnimais ? gtaNum.trim() : '',
      gta_serie: deAnimais ? gtaSerie.trim() : '',
      gta_uf: deAnimais ? gtaUf.trim() : '',
      // V203: gado em itens; "o gado fica na fazenda" vira estoque de terceiros do comprador
      itens_gado: deAnimais ? itensGadoParaBanco(itensGado, lotesVenda) : [],
      gado_fica: deAnimais && gadoFica,
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
            unidade: i.unidade || 'un',
            valor_unitario: n(i.unit) ?? '',
            valor_total: n(i.total),
          })),
      funrural_perc: funPerc.trim() ? n(funPerc) : '',
      funrural_valor: n(funValor) ?? 0,
      comissao: n(comissao) ?? 0,
      frete: n(frete) ?? 0,
      outros_descontos: n(outrosDesc) ?? 0,
      rateio: rateio.map((x) => ({ centro_custo_id: x.centroId, percentual: n(x.perc) })),
      parcelas: juntarParcelas(parcelas, pagto[0] !== 'avista' ? interm : []),
    };
    // V161: a venda grava sem a GTA, mas avisa que o gado só pode ser transportado com ela (e com a NF, onde for obrigatória)
    if (deAnimais && !gtaNum.trim() && semGtaConfirmado !== true) {
      Alert.alert(
        'Venda sem GTA',
        'O gado só pode ser transportado com a GTA (e com a nota fiscal, no estado em que ela for obrigatória). Você pode gravar a venda agora e informar a GTA depois, na consulta da venda.',
        [
          { text: 'Voltar e informar', style: 'cancel' },
          { text: 'Gravar sem a GTA', onPress: () => void salvar(true) },
        ],
      );
      return;
    }
    setSalvando(true);
    const { data: r, error } = contratoAtivo ? await supabase.rpc('salvar_venda_contrato', { p: { ...p, cafe_contrato_id: contratoAtivo.id } }) : await supabase.rpc('salvar_venda', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; liquido: number; cabecas: number | null; compensado?: number; contrato?: number; saldo_sacas?: number };
    const comp = Number(res.compensado ?? 0);
    const textoContrato = contratoAtivo
      ? ` Contrato nº ${contratoAtivo.numero}: ${Number(res.saldo_sacas ?? 0) > 0 ? `faltam ${textoSacas(Number(res.saldo_sacas))}` : 'concluído'}${comp > 0 ? `; ${formatarMoeda(comp)} ${contratoAtivo.tipo === 'troca' ? 'quitaram a compra dos insumos' : 'foram abatidos do adiantamento'} sem movimentar dinheiro; fica a receber ${formatarMoeda(Math.max(0, Number(res.liquido) - comp))}` : ''}.`
      : '';
    const nInt = pagto[0] !== 'avista' ? interm.length : 0;
    const receber = parcelas.length + nInt === 1 ? '1 título no contas a receber' : nInt ? `${nInt} intermediária${nInt > 1 ? 's' : ''} e ${parcelas.length} parcela${parcelas.length > 1 ? 's' : ''} no contas a receber` : `${parcelas.length} parcelas no contas a receber`;
    const textoAviso = deAnimais
        ? `Venda nº ${res.numero} gravada: ${itensGado.length} ${itensGado.length === 1 ? 'item' : 'itens'}, ${formatarNumero(res.cabecas ?? cab)} ${(res.cabecas ?? cab) === 1 ? 'cabeça saiu' : 'cabeças saíram'} do rebanho${gadoFica ? ' (ficam na fazenda, no estoque de terceiros do comprador)' : ''}, ${formatarMoeda(Number(res.liquido))} a receber (${receber}).`
        : deCafe
          ? `Venda nº ${res.numero} gravada: ${textoSacas(sacasCafe)} de café saíram do armazém, ${formatarMoeda(Number(res.liquido))} ${comp > 0 ? 'no total' : 'a receber'} (${receber}).${textoContrato}`
          : `Venda nº ${res.numero} gravada: ${formatarMoeda(Number(res.liquido))} a receber (${receber}).`;
    // V205: o gado fica na fazenda: depois da venda abre a Entrada por parceria já preenchida (um grupo por sexo e faixa de idade)
    let parceriaVenda: ParceriaDaVenda | null = null;
    if (deAnimais && gadoFica && pessoaId) {
      const iso = paraBanco(data) ?? hojeBanco();
      const mapa = new Map<string, GrupoParceriaVenda>();
      for (const it of itensGado) {
        const l = it.lote.trim() ? lotesVenda.find((y) => String(y.numero) === it.lote.trim()) ?? null : null;
        const sx = sexoItem(it, lotesVenda);
        const de = it.faixa ? Number(it.faixa) : sx && l?.nascimento_ref ? faixaDaIdade(sx, mesesEntre(l.nascimento_ref, iso)).de : null;
        const faixa = sx && de !== null ? `${sx}${de}` : '';
        const racaId = it.racaId ?? l?.raca_id ?? null;
        const ferroId = it.ferroId ?? l?.ferro_id ?? null;
        const k = `${sx}|${faixa}|${racaId ?? ''}|${ferroId ?? ''}`;
        const g = mapa.get(k) ?? { cab: 0, sexo: sx, faixa, racaId, ferroId, peso: 0 };
        g.cab += cabecasItem(it);
        g.peso += n(it.peso) ?? 0;
        mapa.set(k, g);
      }
      const grupos = [...mapa.values()].filter((g) => g.cab > 0);
      if (grupos.length) parceriaVenda = { venda: res.numero, vendaId: (r as any)?.id ?? undefined, pessoaId, data, grupos, parte: 1, partes: grupos.length };
    }
    const fimVenda = (av: string) =>
      parceriaVenda ? navegacao.replace('MovimentacaoForm', { aviso: av, parceriaVenda }) : navegacao.replace('VendaForm', { aviso: av });
    // V160: ao fechar a venda, pergunta se emite a NF-e agora (se já tem o nº da nota, foi emitida fora)
    if (documento.trim()) return fimVenda(`${textoAviso} NF nº ${documento.trim()} emitida fora do sistema: não se emite outra NF-e para esta venda.`);
    let vendaId: string | null = (r as any)?.id ?? null;
    if (!vendaId) {
      const { data: vx } = await supabase.from('vendas').select('id').eq('fazenda_id', fid!).eq('numero', res.numero).maybeSingle();
      vendaId = (vx as any)?.id ?? null;
    }
    Alert.alert('EMITIR NF?', `Venda nº ${res.numero} gravada. Quer emitir a NF-e desta venda agora?`, [
      {
        text: 'Agora não',
        style: 'cancel',
        onPress: () => fimVenda(`${textoAviso} Para emitir a nota depois (sozinha ou junto com outras vendas do mesmo cliente): Mais › Notas fiscais › Emitir NF-e de vendas, com o nº ${res.numero}.`),
      },
      {
        text: 'Emitir NF',
        onPress: () => {
          if (!vendaId) return fimVenda(textoAviso);
          // V205: com parceria, a NF-e abre por cima; ao voltar dela, a parceria está esperando
          if (parceriaVenda) {
            navegacao.replace('MovimentacaoForm', { aviso: textoAviso, parceriaVenda });
            return navegacao.push('NotaFiscalEmitir', { vendaId });
          }
          navegacao.replace('NotaFiscalEmitir', { vendaId });
        },
      },
    ]);
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
          { valor: 'outros', rotulo: 'Outros produtos (mamão, banana, milho...) e serviços' },
        ]}
        valor={tipo}
        aoMudar={setTipo}
      />
      {faturadoPor ? <Text style={{ fontSize: 13, color: '#56625A' }}>Faturamento em nome de: {faturadoPor}</Text> : null}
      <CampoPessoaBusca rotulo="Cliente *" valorId={pessoaId} aoMudar={setPessoaId} tipoNovo="cliente" erro={erros.pessoa} />
      {/* V164: os dados do comprador logo abaixo; tocar no nome abre o cadastro */}
      <ResumoPessoa pessoaId={pessoaId} />
      {mesmoTitular && <Aviso tipo="erro" texto="O cliente é o titular desta fazenda: entre fazendas do mesmo titular é transferência (Mais › Transferências)." />}
      {fazGrupo.length > 0 && !destinoPelaIE && (
        <Escolha
          rotulo="Fazenda do Grupo que compra *"
          opcoes={fazGrupo.map((f) => ({ valor: f.id, rotulo: f.nome }))}
          valor={destinoId ? [destinoId] : []}
          aoMudar={(v) => setDestinoId(v[0] ?? null)}
        />
      )}
      {fazCliente.length > 0 && (
        <Escolha
          rotulo="Fazenda do cliente (para onde vai)"
          opcoes={fazCliente.map((f) => ({ valor: f.id!, rotulo: [f.nome_fazenda || 'Fazenda', f.municipio].filter(Boolean).join(' · ') }))}
          valor={fatId ? [fatId] : []}
          aoMudar={(v) => setFatId(v[0] ?? null)}
        />
      )}
      {/* V160: número e série da Nota Fiscal (não obrigatório: se a NF-e for emitida por aqui, o número entra sozinho) */}
      <View style={estilos.linha}>
        <View style={{ flex: 2 }}>
          <Campo rotulo="Nº da Nota Fiscal" value={documento} onChangeText={(t) => setDocumento(t.replace(/\D/g, ''))} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Série" value={docSerie} onChangeText={(t) => setDocSerie(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
        </View>
      </View>
      {/* V204: nº informado = NF já emitida fora do sistema; não se pergunta nem se emite outra (evita NF em duplicidade) */}
      {documento.trim() ? (
        <Aviso tipo="info" texto={`NF nº ${documento.trim()} já emitida fora do sistema: ao gravar, não pergunta da NF-e, e esta venda não entra em Emitir NF-e de vendas (assim não sai nota em duplicidade).`} />
      ) : (
        <Text style={estilos.nota}>Se ainda não tem a nota, deixe em branco: ao gravar, o sistema pergunta se quer emitir a NF-e agora, e o número entra sozinho.</Text>
      )}

      {deAnimais ? (
        <>
          {/* ---------- animais (V203: em itens) ---------- */}
          <Secao titulo="Itens da venda" />
          {estoqueGado && aceitaNegativo ? (
            <Aviso tipo="info" texto="Implantação: a venda grava mesmo sem saldo no Estoque de gado (fica negativo). Para voltar a bloquear: Financeiro › Parâmetros › Pecuária, ponha 0." />
          ) : null}
          <ItensVendaGado
            itens={itensGado}
            setItens={setItensGado}
            lotes={lotesVenda}
            fid={fid!}
            dataIso={paraBanco(data) ?? hojeBanco()}
            estoque={saldosGado}
            nomeEstoque={nomeEstoque}
            erros={erros}
            aoPuxarPesagem={(x) => {
              if (x.data) setData(x.data);
              if (x.pessoaId && !pessoaId) setPessoaId(x.pessoaId);
            }}
          />
          {cab > 0 && valorGado > 0 && (
            <View style={estilos.calculo}>
              <Text style={estilos.calcTitulo}>Totais da venda</Text>
              <Text style={estilos.calcLinha}>
                {formatarNumero(cab)} cab.{pesoGado > 0 ? ` · ${formatarNumero(pesoGado, 1)} kg brutos (média ${formatarNumero(pesoGado / cab, 2)} kg)` : ''}
                {arrobasGado > 0 ? ` · ${formatarNumero(arrobasGado, 2)} @ (média ${formatarNumero(arrobasGado / cab, 2)} @)` : ''}
              </Text>
              <Text style={estilos.calcLinha}>
                Preço médio por cabeça {formatarMoeda(valorGado / cab)} · <Text style={{ fontWeight: '800' }}>Total {formatarMoeda(valorGado)}</Text>
              </Text>
              {(n(funValor) ?? 0) > 0 && (
                <Text style={estilos.calcLinha}>
                  Funrural/Senar (−) {formatarMoeda(n(funValor) ?? 0)} · Líquido {formatarMoeda(liquido)}
                </Text>
              )}
            </View>
          )}
          <Interruptor
            rotulo="O gado fica na fazenda"
            descricao={gadoFica ? 'Sai do nosso estoque e entra no estoque de terceiros do comprador (parceria), na fazenda. Ao gravar, abre a Entrada por parceria já preenchida para você informar o lote e as condições.' : 'Marque se o comprador deixa o gado aqui, em parceria.'}
            valor={gadoFica}
            aoMudar={setGadoFica}
          />
          {erros.gadoFica ? <Text style={estilos.erro}>{erros.gadoFica}</Text> : null}
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
                  { valor: 'outro', rotulo: 'Produto da fazenda / serviço' },
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
                      <CampoMoeda rotulo="Valor de venda unitário" valor={it.unit} aoMudar={(t) => mudarQtdOuUnit(it, 'unit', t)} />
                    </View>
                  </View>
                  {it.insumoId && (
                    <Text style={estilos.nota}>
                      {it.custo != null
                        ? (() => {
                            const q = n(it.qtd) ?? 0;
                            const ct = r2v(q * it.custo);
                            const vt = n(it.total) ?? 0;
                            return `Custo médio do estoque: ${formatarMoeda(it.custo)} por ${it.unidade}${q ? ` · custo ${formatarMoeda(ct)} · margem ${formatarMoeda(vt - ct)}` : ''}`;
                          })()
                        : 'Produto sem custo de entrada no estoque desta fazenda: sai sem custo.'}
                    </Text>
                  )}
                  <Text style={estilos.nota}>Sai do estoque ao gravar, pelo custo médio (vai para Custo dos Materiais Vendidos); o valor de venda vai para a Receita e o Contas a receber (ou o caixa, se à vista).</Text>
                </>
              ) : (
                <>
                  <Campo rotulo="O que vendeu *" value={it.descricao} onChangeText={(t) => mudar(it.chave, { descricao: t })} autoCapitalize="sentences" placeholder="Ex.: Mamão formosa, banana prata, milho em grão, serviço de trator" erro={erros[`p${k}`]} />
                  {/* V160: produto da fazenda com quantidade e unidade (vão para a nota fiscal) */}
                  <Escolha rotulo="Unidade" opcoes={UNIDADES_OUTRO} valor={[it.unidade]} aoMudar={(v) => mudar(it.chave, { unidade: v[0] ?? 'un' })} />
                  <View style={estilos.linha}>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo={`Qtde. (${it.unidade})`} value={it.qtd} onChangeText={(t) => mudarQtdOuUnit(it, 'qtd', t)} keyboardType="decimal-pad" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CampoMoeda rotulo="Valor unitário" valor={it.unit} aoMudar={(t) => mudarQtdOuUnit(it, 'unit', t)} />
                    </View>
                  </View>
                </>
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
          { valor: 'dias', rotulo: 'Prazo em dias' },
          { valor: 'data', rotulo: 'Data certa' },
        ]}
        valor={pagto}
        aoMudar={setPagto}
      />
      {pagto[0] !== 'avista' && (
        <>
          <View style={[estilos.linha, { flexWrap: 'wrap' }]}>
            <View style={{ width: 80 }}>
              <Campo rotulo="Parcelas" value={nParc} onChangeText={(t) => setNParc(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            </View>
            {pagto[0] === 'dias' && (
              <View style={{ width: 100 }}>
                <Campo rotulo="1ª em (dias)" value={prazo1} onChangeText={(t) => setPrazo1(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" />
              </View>
            )}
            <CampoQtdeIntermediarias valor={nInterm} aoMudar={setNInterm} />
            {Number(nParc) > 1 && (
              <View style={{ width: 110 }}>
                <Campo rotulo="Demais a cada (dias)" value={intervalo} onChangeText={(t) => setIntervalo(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
              </View>
            )}
          </View>
          {pagto[0] === 'data' && <CampoData rotulo="Data do 1º vencimento *" valor={primeiro} aoMudar={setPrimeiro} />}
        </>
      )}
      <ParcelasIntermediarias
        normais={parcelas}
        setNormais={setParcelas}
        interm={pagto[0] !== 'avista' ? interm : []}
        setInterm={setInterm}
        fixo={fixo}
        setFixo={setFixo}
        total={liquido}
        rotuloTotal="o valor a receber"
        erro={erros.parcelas}
        mostrarUma
      />
      <Text style={estilos.nota}>Mesmo à vista, a venda vai para o Contas a receber: o recebimento é confirmado em Financeiro › Contas a receber › Receber, quando o dinheiro entrar.</Text>

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />
      {deAnimais && (
        <>
          {/* V159: venda de gado não fecha sem a GTA (ela vai junto para a nota fiscal) */}
          <Secao titulo="GTA (Guia de Trânsito Animal)" />
          <View style={estilos.linha}>
            <View style={{ flex: 2 }}>
              <Campo rotulo="Número da GTA" value={gtaNum} onChangeText={(t) => setGtaNum(t.replace(/[^0-9A-Za-z-]/g, '').slice(0, 20))} autoCapitalize="characters" erro={erros.gta} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Série" value={gtaSerie} onChangeText={(t) => setGtaSerie(t.toUpperCase().slice(0, 5))} autoCapitalize="characters" />
            </View>
            <View style={{ width: 70 }}>
              <Campo rotulo="UF" value={gtaUf} onChangeText={(t) => setGtaUf(t.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} autoCapitalize="characters" />
            </View>
          </View>
          <Text style={estilos.nota}>A GTA é obrigatória para transportar o gado. Tire no sistema do órgão de defesa sanitária (no ES, o IDAF) e informe o número aqui, ou depois, na consulta da venda. Ela vai sozinha para a nota fiscal.</Text>
        </>
      )}
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
