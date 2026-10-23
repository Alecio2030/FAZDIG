import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { escolherImagem } from '../../lib/fotos';
import * as DocumentPicker from 'expo-document-picker';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaCompras from './ConsultaCompras';
import DespesaForm from './DespesaForm';
import { useSessao } from '../../contexto/SessaoContext';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { centroDaUnidade } from '../../lib/unidades';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd, lerNumero, mascaraCpfCnpj, moedaParaCampo, numeroParaCampo, somenteDigitos } from '../../lib/formatos';
import { chaveItemNota, chaveNfeValida, codigoBarras, dadosDaChave, lerXmlCte, lerXmlNfe, numeroBase, type LeituraNota } from '../../lib/notaFiscal';
import { perguntar } from '../../lib/perguntar';
import { fornecedorPeloDocumento, lerFotoDocumento, listaCompradores, type DocComprador } from '../../lib/documentos';
import { CATEGORIAS_INSUMO, MEDIDAS, ROTULO_CATEGORIA_INSUMO, UNIDADES, ehEmbalagem, embalagemDe, medidaSugerida, nomeUnidade, saldoDe, textoSaldo, unidadesParaBanco } from '../../lib/insumos';
import { somarDias } from '../../lib/reproducao';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Item = {
  chave: string;
  tipo: 'insumo' | 'servico';
  insumoId: string | null;
  novo: boolean; // produto cadastrado agora, nesta compra
  categoria: string;
  unidade: string;
  temMinimo: boolean;
  descricao: string;
  qtd: string;
  /** embalagem do cadastro (ex.: saco de 50 kg): padrao = 50, medida = 'kg'. null: produto sem embalagem com conteúdo */
  padrao: number | null;
  medida: string;
  /** quanto tem cada embalagem NESTA compra (ex.: 25, quando veio saco de 25 kg) */
  conteudo: string;
  unit: string;
  total: string;
  lote: string;
  validade: string;
  minimo: string;
  /** impostos destacados no item (R$) */
  icms: string;
  ipi: string;
  st: string;
  impostos: boolean; // quadro de impostos do item aberto
  /** como veio na nota fiscal (entrada por foto ou XML) */
  nota?: { descricao: string; unidade: string | null; qtd: number | null; chaveItem: string };
};
type Origem = { tipo: 'foto' | 'xml'; cnpj: string | null; chave: string | null; codigoBarras: string | null; arquivo: string | null };
type Rateio = { chave: string; centroId: string | null; perc: string };
/** Compra de mercadoria transportada pelo frete à parte (CT-e / NF de frete) que está sendo lançado. */
type Transportada = { id: string; numero: number; data: string; fornecedor: string | null; documento: string | null; soma: number };
const CAMPOS_TRANSP = 'id, numero, data, numero_documento, situacao, chave_nfe, pessoa:pessoas ( nome, cpf_cnpj ), itens:compra_itens ( valor_total )';
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const paraTransportada = (c: any): Transportada => ({
  id: c.id,
  numero: c.numero,
  data: c.data,
  fornecedor: um(c.pessoa)?.nome ?? null,
  documento: c.numero_documento ?? null,
  soma: ((c.itens as any[]) ?? []).reduce((t, i) => t + Number(i.valor_total ?? 0), 0),
});
const listaNumeros = (l: number[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
type Parcela = { chave: string; venc: string; valor: string };

let cont = 0;
const chave = () => `k${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);
const r2 = (x: number) => Math.round(x * 100) / 100;
const CAMPOS_PRODUTO = 'id, categoria, unidade, unidade_dose, conteudo_por_unidade, conteudo_qtd, conteudo_medida, estoque_minimo';
/** Embalagem do cadastro para o item: padrão, medida e o conteúdo desta compra (vem igual ao do cadastro). */
const embalagemItem = (p: any): Pick<Item, 'padrao' | 'medida' | 'conteudo'> => {
  const e = embalagemDe(p);
  return e ? { padrao: e.qtd, medida: e.medida, conteudo: numeroParaCampo(e.qtd) } : { padrao: null, medida: '', conteudo: '' };
};
/** Produto novo (cadastrado na compra) em embalagem: o conteúdo informado aqui vira o do cadastro. */
const pedeConteudo = (i: Item) => i.tipo === 'insumo' && !!i.insumoId && (i.padrao != null || (i.novo && ehEmbalagem(i.unidade)));
/** Quantas embalagens do cadastro vale 1 embalagem desta compra (saco de 25 kg num cadastro de 50 kg = 0,5). */
const fatorEmb = (i: Item) => {
  const c = n(i.conteudo);
  return i.padrao && c && c > 0 ? c / i.padrao : 1;
};
/** Quantidade que entra no estoque, na unidade de compra do cadastro. */
const qtdEstoque = (i: Item): number | null => {
  const q = n(i.qtd);
  return q == null ? null : Math.round(q * fatorEmb(i) * 10000) / 10000;
};
const itemVazio = (): Item => ({ chave: chave(), tipo: 'insumo', insumoId: null, novo: false, categoria: 'outro', unidade: 'un', temMinimo: true, descricao: '', qtd: '', padrao: null, medida: '', conteudo: '', unit: '', total: '', lote: '', validade: '', minimo: '', icms: '', ipi: '', st: '', impostos: false });

/**
 * Compras: Produtos (insumos e peças, com estoque) ou Despesa (sem estoque: energia, serviço, manutenção...).
 * A compra de bovinos fica em Movimentações. Ninguém escolhe conta do plano: o banco classifica pela origem.
 */
export default function CompraForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'CompraForm'>>();
  const { fazendaAtiva, modoAdm } = useSessao();
  const fid = fazendaAtiva?.id;
  // V137: no Administrativo e no Particular não há estoque: só a despesa (sem estoque)
  const soDespesa = modoAdm || fazendaAtiva?.tipo === 'particular';

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  /** o que está sendo lançado: produtos (estoque) ou despesa (sem estoque, tela própria) */
  const [modo, setModo] = useState<'produtos' | 'despesa'>(soDespesa ? 'despesa' : 'produtos');
  const [despesaId, setDespesaId] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [documento, setDocumento] = useState('');
  const [itens, setItens] = useState<Item[]>([itemVazio()]);
  const [frete, setFrete] = useState('');
  const [seguro, setSeguro] = useState('');
  const [acrescimo, setAcrescimo] = useState('');
  const [compradores, setCompradores] = useState<DocComprador[]>([]);
  const [compradorId, setCompradorId] = useState<string | null>(null);
  const [porFora, setPorFora] = useState(false);
  const [outras, setOutras] = useState('');
  const [desconto, setDesconto] = useState('');
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [forma, setForma] = useState<string[]>(['avista']);
  const [nParc, setNParc] = useState('2');
  const [primeiro, setPrimeiro] = useState('');
  const [intervalo, setIntervalo] = useState('30');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [obs, setObs] = useState('');
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [lendo, setLendo] = useState<string | null>(null);
  const [avisoNota, setAvisoNota] = useState<string | null>(null);
  // frete à parte (CT-e / NF de frete): as compras que esta nota transportou
  const [freteAberto, setFreteAberto] = useState(false);
  const [transportadas, setTransportadas] = useState<Transportada[]>([]);
  const [transpNum, setTranspNum] = useState('');
  const [transpErro, setTranspErro] = useState<string | null>(null);
  /** compra de mercadoria aberta para alterar: os fretes à parte que ela já recebe */
  const [fretesRecebidos, setFretesRecebidos] = useState<{ numero: number; valor: number }[]>([]);

  const [pendentes, setPendentes] = useState<any[]>([]);
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});

  // Documento padrão da nota: o CPF/CNPJ dos dados fiscais da fazenda ativa; sem isso, o principal do produtor.
  const docFazenda = useRef<string>('');
  const compradorPadrao = (l: DocComprador[]) => (docFazenda.current ? l.find((x) => somenteDigitos(x.cpf_cnpj) === docFazenda.current)?.id : null) ?? l.find((x) => x.principal)?.id ?? l[0]?.id ?? null;
  useEffect(() => {
    (async () => {
      if (fid) {
        const { data } = await supabase.from('fazendas').select('cpf_cnpj').eq('id', fid).maybeSingle();
        docFazenda.current = somenteDigitos((data as any)?.cpf_cnpj ?? '');
      }
      const l = await listaCompradores();
      setCompradores(l);
      setCompradorId((atual) => atual ?? compradorPadrao(l));
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid]);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Compra nº ${numero}` : 'Compras' });
  }, [navegacao, id, numero]);

  const recarregarTopo = useCallback(async () => {
    if (!fid) return;
    const [{ data: u }, { data: p }] = await Promise.all([
      supabase.from('compras').select('numero').order('numero', { ascending: false }).limit(1),
      supabase.from('compras').select('id, numero, data, compra_itens ( quantidade, unidade, insumo:insumos ( nome ) )').eq('fazenda_id', fid).eq('situacao', 'a_completar').order('data'),
    ]);
    setProximo(((u?.[0]?.numero as number) ?? 0) + 1);
    setPendentes(p ?? []);
  }, [fid]);
  useEffect(() => {
    recarregarTopo();
  }, [recarregarTopo]);

  // ---- totais ----
  const somaItens = itens.reduce((s, i) => s + (n(i.total) ?? 0), 0);
  const somaIpi = itens.reduce((t, i) => t + (n(i.ipi) ?? 0), 0);
  const somaSt = itens.reduce((t, i) => t + (n(i.st) ?? 0), 0);
  const acessorios = (n(seguro) ?? 0) + (n(outras) ?? 0) + (n(acrescimo) ?? 0) - (n(desconto) ?? 0);
  // valor a pagar: produtos + frete + seguro + outras + acréscimo - desconto + IPI + ICMS-ST (o ICMS próprio já está no preço)
  const total = r2(somaItens + (n(frete) ?? 0) + acessorios + somaIpi + somaSt);
  const comprador = compradores.find((x) => x.id === compradorId) ?? null;
  // Custo de cada item: frete e acessórios rateados pelo valor; impostos do item; créditos conforme o comprador.
  // Mesma conta do banco (salvar_compra): o último item fica com a sobra dos centavos.
  const custos = (() => {
    const fr = n(frete) ?? 0;
    let fa = 0;
    let aa = 0;
    return itens.map((it, k) => {
      const v = n(it.total) ?? 0;
      const ultimo = k === itens.length - 1;
      const f = ultimo ? r2(fr - fa) : somaItens > 0 ? r2((fr * v) / somaItens) : 0;
      const a = ultimo ? r2(acessorios - aa) : somaItens > 0 ? r2((acessorios * v) / somaItens) : 0;
      fa += f;
      aa += a;
      const icms = n(it.icms) ?? 0;
      const ipi = n(it.ipi) ?? 0;
      const st = n(it.st) ?? 0;
      const cIcms = comprador?.credito_icms ? icms : 0;
      const cIpi = comprador?.credito_ipi ? ipi : 0;
      const base = Math.max(0, v + f + a + (ipi - cIpi) + st - icms);
      const cPis = comprador?.credito_pis_cofins ? r2((base * comprador.perc_pis) / 100) : 0;
      const cCof = comprador?.credito_pis_cofins ? r2((base * comprador.perc_cofins) / 100) : 0;
      const custo = r2(v + f + a + ipi + st - cIcms - cIpi - cPis - cCof);
      const q = it.tipo === 'insumo' ? qtdEstoque(it) : n(it.qtd);
      return { frete: f, acessorios: a, ipi, st, cIcms, cIpi, cPis, cCof, custo, unitario: q ? custo / q : null };
    });
  })();
  // frete à parte: o custo desta nota (já sem os créditos) vai para os itens das compras transportadas, pelo valor
  const custoFrete = r2(custos.reduce((t, c) => t + c.custo, 0));
  const baseTransp = transportadas.reduce((t, x) => t + x.soma, 0);
  const partesFrete = (() => {
    let acum = 0;
    return transportadas.map((x, k) => {
      const v = k === transportadas.length - 1 ? r2(custoFrete - acum) : baseTransp > 0 ? r2((custoFrete * x.soma) / baseTransp) : 0;
      acum += v;
      return v;
    });
  })();
  const temAcrescimo = custos.some((c, k) => Math.abs(c.custo - (n(itens[k].total) ?? 0)) > 0.004);
  const somaRateio = rateio.reduce((s, x) => s + (n(x.perc) ?? 0), 0);
  const somaParcelas = parcelas.reduce((s, x) => s + (n(x.valor) ?? 0), 0);

  // Parcelas: geradas pelo nº, 1º vencimento e intervalo (a prazo). À vista: uma, na data da compra.
  const gerarParcelas = useCallback(() => {
    if (forma[0] === 'avista') {
      setParcelas([{ chave: chave(), venc: data, valor: moedaParaCampo(total) }]);
      return;
    }
    const q = Math.max(1, Math.min(60, Number(nParc) || 1));
    const base = paraBanco(primeiro) ?? (paraBanco(data) ? somarDias(paraBanco(data)!, Number(intervalo) || 30) : null);
    if (!base) return;
    const cada = Math.floor((total / q) * 100) / 100;
    const ultima = r2(total - cada * (q - 1));
    setParcelas(
      Array.from({ length: q }, (_, i) => ({ chave: chave(), venc: doBanco(somarDias(base, i * (Number(intervalo) || 30))), valor: moedaParaCampo(i === q - 1 ? ultima : cada) })),
    );
  }, [forma, nParc, primeiro, intervalo, data, total]);
  const manterParcelas = useRef(false); // compra aberta: mantém as parcelas gravadas até a pessoa mexer
  useEffect(() => {
    if (carregando) return;
    if (manterParcelas.current) {
      manterParcelas.current = false;
      return;
    }
    gerarParcelas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forma[0], nParc, primeiro, intervalo, total, forma[0] === 'avista' ? data : '', carregando]);

  // ---- listas ----
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
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, fid)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [fid]);
  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }));
  }, [fid]);

  // ---- itens ----
  const mudar = (k: string, campos: Partial<Item>) => setItens((l) => l.map((i) => (i.chave === k ? { ...i, ...campos } : i)));

  async function escolherProduto(k: string, iid: string | null) {
    if (!iid) return mudar(k, { insumoId: null });
    const { data: p } = await supabase.from('insumos').select(CAMPOS_PRODUTO).eq('id', iid).single();
    mudar(k, { insumoId: iid, novo: false, categoria: p?.categoria ?? 'outro', unidade: p?.unidade ?? 'un', temMinimo: p?.estoque_minimo != null, ...embalagemItem(p) });
  }
  function criarProduto(k: string) {
    return async (nome: string): Promise<ItemRapido> => {
      const d = await consulta<any>(supabase.from('insumos').insert({ nome: nome.trim(), categoria: 'outro', unidade: 'un', cadastro_completo: false }).select('id, nome').single());
      mudar(k, { insumoId: d.id, novo: true, categoria: 'outro', unidade: 'un', temMinimo: false, padrao: null, medida: '', conteudo: '' });
      return { id: d.id, titulo: d.nome, detalhe: 'Produto novo: escolha a categoria e a unidade abaixo' };
    };
  }
  async function mudarNovo(it: Item, campos: { categoria?: string; unidade?: string }) {
    const cat = campos.categoria ?? it.categoria;
    const sug = CATEGORIAS_INSUMO.find((c) => c.valor === cat);
    const un = campos.unidade ?? (campos.categoria && sug ? sug.unidade : it.unidade);
    mudar(it.chave, { categoria: cat, unidade: un, ...(un !== it.unidade ? { medida: medidaSugerida(un, undefined)[0] ?? '', conteudo: '' } : {}) });
    if (it.insumoId) await supabase.from('insumos').update({ categoria: cat, unidade: un }).eq('id', it.insumoId);
  }
  function mudarQtdOuUnit(it: Item, campo: 'qtd' | 'unit', t: string) {
    const q = campo === 'qtd' ? n(t) : n(it.qtd);
    const u = campo === 'unit' ? n(t) : n(it.unit);
    mudar(it.chave, { [campo]: t, ...(q != null && u != null ? { total: moedaParaCampo(r2(q * u)) } : {}) } as Partial<Item>);
  }
  function mudarTotal(it: Item, t: string) {
    const q = n(it.qtd);
    const v = n(t);
    mudar(it.chave, { total: t, ...(it.tipo === 'insumo' && q && v != null ? { unit: moedaParaCampo(r2(v / q)) } : {}) });
  }

  // ---- frete à parte (CT-e / NF de frete) ----
  /** Liga o quadro do frete: item em branco (ou ainda sem produto) vira o serviço "Frete". */
  function abrirFrete() {
    setFreteAberto(true);
    setItens((l) => l.map((i) => (i.tipo === 'insumo' && !i.insumoId ? { ...i, tipo: 'servico', descricao: i.descricao.trim() || 'Frete' } : i)));
  }
  function fecharFrete() {
    setFreteAberto(false);
    setTransportadas([]);
    setTranspNum('');
    setTranspErro(null);
  }
  /** Por que a compra não pode receber este frete (null = pode). */
  async function recusaTransportada(c: any): Promise<string | null> {
    if (c.id === id) return 'Esta é a própria nota de frete.';
    if (c.situacao !== 'confirmada') return `A compra nº ${c.numero} ainda está a completar: complete a compra antes de lançar o frete dela.`;
    const { data: f } = await supabase.from('compra_fretes').select('compra_id').eq('frete_compra_id', c.id).limit(1);
    if (f?.length) return `A compra nº ${c.numero} é uma nota de frete: frete não se rateia em outro frete.`;
    return null;
  }
  async function incluirTransportada(c: any) {
    if (transportadas.some((x) => x.id === c.id)) return setTranspErro(`A compra nº ${c.numero} já está na lista.`);
    const motivo = await recusaTransportada(c);
    if (motivo) return setTranspErro(motivo);
    setTransportadas((l) => [...l, paraTransportada(c)].sort((a, b) => a.numero - b.numero));
    setTranspNum('');
  }
  async function adicionarTransportada() {
    setTranspErro(null);
    const m = /^0*(\d+)$/.exec(transpNum.trim());
    if (!m || !fid) return setTranspErro('Digite o número da compra transportada.');
    const { data: c } = await supabase.from('compras').select(CAMPOS_TRANSP).eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!c) return setTranspErro(`Não há compra nº ${m[1]}.`);
    await incluirTransportada(c);
  }
  async function escolherTransportada(cid: string | null) {
    setTranspErro(null);
    if (!cid) return;
    const { data: c } = await supabase.from('compras').select(CAMPOS_TRANSP).eq('id', cid).maybeSingle();
    if (c) await incluirTransportada(c);
  }
  /** Últimas compras de mercadoria, para escolher a transportada (fora as notas de frete e as já escolhidas). */
  const carregarUltimasCompras = useCallback(async (): Promise<ItemLista[]> => {
    if (!fid) return [];
    const [cs, fr] = await Promise.all([
      consulta<any[]>(supabase.from('compras').select(CAMPOS_TRANSP).eq('fazenda_id', fid).eq('situacao', 'confirmada').order('data', { ascending: false }).order('numero', { ascending: false }).limit(80)),
      consulta<any[]>(supabase.from('compra_fretes').select('frete_compra_id')),
    ]);
    const fretes = new Set(fr.map((x) => x.frete_compra_id));
    return cs
      .filter((c) => c.id !== id && !fretes.has(c.id) && !transportadas.some((x) => x.id === c.id))
      .map((c) => {
        const t = paraTransportada(c);
        return { id: c.id, titulo: `Compra nº ${t.numero} · ${doBanco(t.data)}`, detalhe: [t.fornecedor, t.documento ? `Nota ${t.documento}` : null, formatarMoeda(t.soma)].filter(Boolean).join(' · ') };
      });
  }, [fid, id, transportadas]);
  /** CT-e lido: acha as compras das notas transportadas, pela chave da NF-e ou pelo nº da nota (e o CNPJ do fornecedor, quando a chave diz). */
  async function acharTransportadas(notas: { chave: string | null; numero: string | null }[]): Promise<{ achadas: Transportada[]; faltam: string[] }> {
    const achadas: any[] = [];
    const faltam: string[] = [];
    if (!fid || !notas.length) return { achadas: [], faltam };
    const chaves = notas.map((x) => (chaveNfeValida(x.chave) ? somenteDigitos(x.chave!) : null));
    const validas = chaves.filter((x): x is string => !!x);
    const porChave = validas.length ? await consulta<any[]>(supabase.from('compras').select(CAMPOS_TRANSP).eq('fazenda_id', fid).in('chave_nfe', validas)) : [];
    let recentes: any[] | null = null;
    for (let k = 0; k < notas.length; k++) {
      let c = chaves[k] ? porChave.find((x) => x.chave_nfe === chaves[k]) : null;
      const dados = chaves[k] ? dadosDaChave(chaves[k]) : null;
      const num = dados?.numero ?? numeroBase(notas[k].numero);
      if (!c && num) {
        recentes = recentes ?? (await consulta<any[]>(supabase.from('compras').select(CAMPOS_TRANSP).eq('fazenda_id', fid).eq('situacao', 'confirmada').order('data', { ascending: false }).limit(300)));
        const iguais = recentes.filter((x) => numeroBase(x.numero_documento) === num && (!dados || somenteDigitos(um(x.pessoa)?.cpf_cnpj ?? '') === dados.cnpj));
        if (iguais.length === 1) c = iguais[0];
      }
      if (c && !achadas.some((x) => x.id === c.id) && !(await recusaTransportada(c))) achadas.push(c);
      else if (!c) faltam.push(num ? `nº ${num}` : 'sem número legível');
    }
    return { achadas: achadas.map(paraTransportada).sort((a, b) => a.numero - b.numero), faltam };
  }

  // ---- entrada pela nota fiscal (foto lida pela IA ou XML da NF-e) ----
  function escolherFoto() {
    Alert.alert('Foto da nota fiscal', 'Enquadre o DANFE (ou o DACTE do frete) inteiro, com boa luz.', [
      { text: 'Tirar foto', onPress: () => lerFoto(true) },
      { text: 'Escolher da galeria', onPress: () => lerFoto(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function lerFoto(camera: boolean) {
    setErro(null);
    setAviso(null);
    try {
      const r = await escolherImagem(camera, { quality: 0.7 });
      if ('negado' in r) return setErro(camera ? 'Sem permissão para usar a câmera. Libere nos Ajustes do celular.' : 'Sem permissão para abrir as fotos. Libere nos Ajustes do celular.');
      if (!r.foto) return;
      const a = r.foto;
      setLendo('Lendo a nota… (uns 10 segundos)');
      const res = await lerFotoDocumento('nota_fiscal', a.base64, a.mimeType);
      if ('erro' in res) {
        setLendo(null);
        return setErro(`${res.erro} Você pode tentar de novo ou digitar a compra.`);
      }
      const d = res;
      await aplicarLeitura(d.dados as LeituraNota, 'foto', d.arquivo ?? null);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setLendo(null);
  }

  async function lerXml() {
    setErro(null);
    setAviso(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['text/xml', 'application/xml', '*/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      setLendo('Lendo o XML…');
      const texto = await (await fetch(r.assets[0].uri)).text();
      // o CT-e vem primeiro: ele também traz, dentro, as chaves das NF-e transportadas
      const l = lerXmlCte(texto) ?? lerXmlNfe(texto);
      if (!l) {
        setLendo(null);
        return setErro('Esse arquivo não é o XML de uma NF-e nem de um CT-e. O XML vem no e-mail do fornecedor ou da transportadora, junto com o PDF.');
      }
      await aplicarLeitura(l, 'xml', null);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setLendo(null);
  }

  /** Preenche a tela com a nota: fornecedor pelo CNPJ, produtos pelo vínculo aprendido, valores e vencimentos. */
  async function aplicarLeitura(l: LeituraNota, tipo: 'foto' | 'xml', arquivo: string | null) {
    if (!fid) return;
    const faltou: string[] = [...(l.nao_lido ?? [])];
    const chaveNfe = chaveNfeValida(l.chave) ? somenteDigitos(l.chave!) : null;
    if (chaveNfe) {
      const { data: ja } = await supabase.from('compras').select('numero').eq('chave_nfe', chaveNfe).maybeSingle();
      if (ja) return setErro(`Esta nota fiscal já foi lançada na compra nº ${ja.numero}.`);
    }
    // em nome de quem é a nota? (destinatário) — define os créditos
    let compradorNota: DocComprador | null = null;
    let forcar = false;
    const avisoDest: string[] = [];
    const destDoc = somenteDigitos(l.destinatario?.cnpj_cpf ?? '');
    if (destDoc) {
      compradorNota = compradores.find((x) => somenteDigitos(x.cpf_cnpj) === destDoc) ?? null;
      if (!compradorNota && destDoc.length >= 11) {
        const seguir = await perguntar(
          'Nota de outro destinatário',
          'Esta nota não está em nome de nenhum dos seus documentos de compra. Ela não é desta fazenda?',
          'Lançar mesmo assim',
          'Não lançar',
        );
        if (!seguir) return setAviso('Nota não lançada: está em nome de outro destinatário.');
        avisoDest.push('a nota está em nome de outro destinatário: confira o documento de compra');
      }
    }
    const cb = codigoBarras(l.codigo_barras);
    if (cb) {
      const { data: ja } = await supabase.from('compras').select('numero').eq('codigo_barras', cb).maybeSingle();
      if (ja) return setErro(`Este documento (mesmo código de barras) já foi lançado na compra nº ${ja.numero}.`);
    }
    // fornecedor pelo CNPJ/CPF (só cadastra se o número estiver certo; senão tenta pelo nome)
    const forn = await fornecedorPeloDocumento(l.emitente?.nome, l.emitente?.cnpj_cpf);
    const fornecedor = forn.id;
    const doc = fornecedor ? somenteDigitos(((await supabase.from('pessoas').select('cpf_cnpj').eq('id', fornecedor).maybeSingle()).data as any)?.cpf_cnpj ?? '') : '';
    const atencao: string[] = [...avisoDest];
    if (forn.aviso) atencao.push(forn.aviso);
    // mesma nota já gravada? pelo fornecedor + nº; ou, sem depender do fornecedor, pelo nº + valor total
    {
      const docs = l.numero ? [...new Set([l.numero, [l.numero, l.serie ? `série ${l.serie}` : null].filter(Boolean).join(' ')])] : [];
      const porForn = fornecedor && docs.length ? ((await supabase.from('compras').select('numero').eq('pessoa_id', fornecedor).in('numero_documento', docs).limit(1)).data as any[]) : [];
      const porValor = !porForn?.length && docs.length && l.valor_total ? ((await supabase.from('compras').select('numero').in('numero_documento', docs).eq('valor_total', l.valor_total).limit(1)).data as any[]) : [];
      // o nº da nota pode ter saído diferente na leitura: mesmo fornecedor e mesmo valor total também levantam a dúvida
      const porFornValor = !porForn?.length && !porValor?.length && fornecedor && l.valor_total ? ((await supabase.from('compras').select('numero, data').eq('pessoa_id', fornecedor).eq('valor_total', l.valor_total).order('data', { ascending: false }).limit(1)).data as any[]) : [];
      const igual = porForn?.[0] ?? porValor?.[0] ?? porFornValor?.[0];
      if (igual) {
        const motivo = porForn?.length ? `com a nota ${l.numero} deste fornecedor` : porValor?.length ? `com a nota ${l.numero} e o mesmo valor` : `deste fornecedor com o mesmo valor (${formatarMoeda(l.valor_total!)}), de ${doBanco(igual.data)}`;
        const seguir = await perguntar('Nota já lançada?', `Já existe a compra nº ${igual.numero} ${motivo}. Abrir a leitura mesmo assim?`, 'Abrir mesmo assim', 'Voltar');
        if (!seguir) return;
        atencao.push(`já existe a compra nº ${igual.numero} ${motivo}`);
      }
    }
    // itens: o que já foi aprendido deste fornecedor vem com o produto do estoque
    const vinc = doc ? await consulta<any[]>(supabase.from('nota_vinculos').select('chave_item, insumo_id, fator').eq('cnpj', doc)) : [];
    const ids = [...new Set(vinc.map((v) => v.insumo_id))];
    const prods = ids.length ? await consulta<any[]>(supabase.from('insumos').select(CAMPOS_PRODUTO).in('id', ids)) : [];
    // CT-e / DACTE: frete à parte. Os itens são serviço e as notas transportadas apontam as compras que recebem o custo.
    const eCte = l.tipo_documento === 'cte' || (l.notas_transportadas ?? []).length > 0;
    const transp = eCte ? await acharTransportadas(l.notas_transportadas ?? []) : null;
    let semVinculo = 0;
    const novos: Item[] = (l.itens ?? []).map((x) => {
      const ck = chaveItemNota(x);
      const v = vinc.find((y) => y.chave_item === ck);
      const pr = v ? prods.find((y) => y.id === v.insumo_id) : null;
      const qtdNota = x.quantidade ?? null;
      const qtd = qtdNota != null ? qtdNota * (pr ? Number(v.fator) || 1 : 1) : null;
      const totalItem = x.valor_total ?? (qtdNota != null && x.valor_unitario != null ? r2(qtdNota * x.valor_unitario) : null);
      if (eCte) {
        return {
          ...itemVazio(),
          tipo: 'servico' as const,
          descricao: x.descricao || 'Frete',
          qtd: '1',
          total: totalItem != null ? moedaParaCampo(totalItem) : '',
          icms: x.valor_icms ? moedaParaCampo(x.valor_icms) : '',
          impostos: !!x.valor_icms,
        };
      }
      if (!pr) semVinculo++;
      return {
        ...itemVazio(),
        insumoId: pr?.id ?? null,
        categoria: pr?.categoria ?? 'outro',
        unidade: pr?.unidade ?? 'un',
        temMinimo: pr ? pr.estoque_minimo != null : true,
        ...embalagemItem(pr),
        descricao: x.descricao,
        qtd: qtd != null ? numeroParaCampo(Math.round(qtd * 10000) / 10000) : '',
        total: totalItem != null ? moedaParaCampo(totalItem) : '',
        unit: totalItem != null && qtd ? moedaParaCampo(r2(totalItem / qtd)) : '',
        lote: x.lote ?? '',
        validade: x.validade ? doBanco(x.validade) : '',
        icms: x.valor_icms ? moedaParaCampo(x.valor_icms) : '',
        ipi: x.valor_ipi ? moedaParaCampo(x.valor_ipi) : '',
        st: x.valor_icms_st ? moedaParaCampo(x.valor_icms_st) : '',
        impostos: !!(x.valor_icms || x.valor_ipi || x.valor_icms_st),
        nota: { descricao: x.descricao, unidade: x.unidade, qtd: qtdNota, chaveItem: ck },
      };
    });
    if (!novos.length) faltou.push('itens');
    const hoje = paraBanco(hojeBR())!;
    const dataNota = l.data_emissao && l.data_emissao <= hoje ? l.data_emissao : null;
    if (!dataNota) faltou.push('data');
    // para conferir com o total da nota: frete + seguro + outras + IPI + ST dos itens - desconto
    const ipiItens = (l.itens ?? []).reduce((t, x) => t + (x.valor_ipi ?? 0), 0);
    const stItens = (l.itens ?? []).reduce((t, x) => t + (x.valor_icms_st ?? 0), 0);
    const outrasNota = (l.frete ?? 0) + (l.seguro ?? 0) + (l.outras_despesas ?? 0) + ipiItens + stItens;
    const somaNota = novos.reduce((t, i) => t + (n(i.total) ?? 0), 0) + outrasNota - (l.desconto ?? 0);
    if (!ipiItens && l.valor_ipi) atencao.push(`a nota tem IPI de ${formatarMoeda(l.valor_ipi)} que não veio por item: lance no item (toque em "Impostos do item")`);
    if (!stItens && l.valor_icms_st) atencao.push(`a nota tem ICMS-ST de ${formatarMoeda(l.valor_icms_st)} que não veio por item: lance no item`);
    if (compradorNota) setCompradorId(compradorNota.id);
    setPorFora(forcar);

    setPessoaId(fornecedor);
    setDocumento([l.numero, l.serie ? `série ${l.serie}` : null].filter(Boolean).join(' ') || '');
    if (dataNota) setData(doBanco(dataNota));
    setItens(novos.length ? novos : [itemVazio()]);
    setFrete(l.frete ? moedaParaCampo(l.frete) : '');
    setSeguro(l.seguro ? moedaParaCampo(l.seguro) : '');
    setAcrescimo('');
    setOutras(l.outras_despesas ? moedaParaCampo(l.outras_despesas) : '');
    if (l.frete) atencao.push(`frete de ${formatarMoeda(l.frete)} rateado nos itens pelo valor de cada um (vai para o custo do produto)`);
    setDesconto(l.desconto ? moedaParaCampo(l.desconto) : '');
    // vencimentos da nota (duplicatas / vencimento da fatura ou boleto): as datas lidas sempre valem.
    // Se a soma não bate com a nota, os valores vêm divididos pelo total e o aviso pede conferência.
    const dups = (l.duplicatas ?? []).filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const somaDup = dups.reduce((t, d) => t + (Number(d.valor) || 0), 0);
    const aVistaNaData = dups.length === 1 && dataNota && dups[0].vencimento <= dataNota;
    if (dups.length && !aVistaNaData) {
      let valores = dups.map((d) => Number(d.valor) || 0);
      if (Math.abs(somaDup - somaNota) >= 0.05 && somaNota > 0) {
        const cada = r2(somaNota / dups.length);
        valores = dups.map((_, i) => (i === dups.length - 1 ? r2(somaNota - cada * (dups.length - 1)) : cada));
        atencao.push(somaDup > 0 ? `os vencimentos lidos somam ${formatarMoeda(somaDup)} e a nota ${formatarMoeda(somaNota)}: as datas foram mantidas e o valor dividido igualmente, confira as parcelas` : 'os valores das parcelas não foram lidos: as datas foram mantidas e o valor dividido igualmente, confira');
      }
      manterParcelas.current = true;
      setForma(['prazo']);
      setNParc(String(dups.length));
      setPrimeiro(doBanco(dups[0].vencimento));
      setParcelas(dups.map((d, i) => ({ chave: chave(), venc: doBanco(d.vencimento), valor: moedaParaCampo(valores[i]) })));
    } else {
      setForma(['avista']);
      if (!dups.length) atencao.push(dataNota ? 'nenhum vencimento na nota: ficou à vista, na data da nota' : 'nenhum vencimento nem data lidos: ficou à vista, com a data de hoje. Confira');
    }
    setOrigem({ tipo, cnpj: doc || null, chave: chaveNfe, codigoBarras: cb, arquivo });
    setFreteAberto(eCte);
    setTransportadas(transp?.achadas ?? []);
    setTranspNum('');
    setTranspErro(null);

    const partes: string[] = [];
    if (eCte) partes.push(tipo === 'xml' ? 'XML do CT-e lido (frete à parte).' : 'Conhecimento de transporte lido (frete à parte).');
    else partes.push(tipo === 'xml' ? `XML lido: ${novos.length} ${novos.length === 1 ? 'item' : 'itens'}.` : `Nota lida: ${novos.length} ${novos.length === 1 ? 'item' : 'itens'}.`);
    if (transp) {
      if (transp.achadas.length) partes.push(`O frete será rateado no custo dos itens da${transp.achadas.length > 1 ? 's compras' : ' compra'} nº ${listaNumeros(transp.achadas.map((x) => x.numero))}.`);
      if (transp.faltam.length) partes.push(`Não achei a compra da nota transportada ${transp.faltam.join(', ')}: lance primeiro a compra da mercadoria, ou informe o nº da compra no quadro do frete.`);
      if (!transp.achadas.length && !transp.faltam.length) partes.push('As notas transportadas não foram lidas: informe o nº da compra no quadro do frete.');
    }
    if (l.legivel === false) partes.push('Quase nada pôde ser lido: tire outra foto ou digite a compra.');
    if (semVinculo) partes.push(`${semVinculo === 1 ? '1 item precisa' : `${semVinculo} itens precisam`} ser apontado(s) para o produto do estoque (o sistema aprende para a próxima nota).`);
    if (l.valor_total != null && Math.abs(l.valor_total - somaNota) > 0.05) partes.push(`O total da nota é ${formatarMoeda(l.valor_total)} e a soma lida deu ${formatarMoeda(somaNota)}: confira os valores.`);
    if (faltou.length) partes.push(`Não veio na leitura: ${[...new Set(faltou)].join(', ')}.`);
    if (atencao.length) partes.push(`Atenção: ${atencao.join('; ')}.`);
    partes.push('Complete o rateio e o pagamento e confira tudo antes de gravar.');
    setAvisoNota(partes.join(' '));
  }

  // ---- abrir compra existente (completar entrada rápida ou alterar) ----
  async function abrir(cid: string) {
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const c = await consulta<any>(
        supabase
          .from('compras')
          .select('*, itens:compra_itens ( *, insumo:insumos ( categoria, unidade, unidade_dose, conteudo_por_unidade, conteudo_qtd, conteudo_medida, estoque_minimo ) ), rateio:compra_rateios ( centro_custo_id, percentual ), parcelas:lancamentos ( valor, data_vencimento, parcela )')
          .eq('id', cid)
          .single(),
      );
      if (c.tipo === 'animais') {
        setCarregando(false);
        return setErro(`A compra nº ${c.numero} é de animais: não se altera aqui. Para mudar, exclua a entrada em Pecuário › Movimentações › Consultar e lance de novo.`);
      }
      if (c.tipo === 'despesa') {
        // despesa sem estoque: abre na tela própria
        setModo('despesa');
        setDespesaId(c.id);
        setCarregando(false);
        return;
      }
      setId(c.id);
      setNumero(c.numero);
      setData(doBanco(c.data));
      setPessoaId(c.pessoa_id);
      setDocumento(c.numero_documento ?? '');
      setItens(
        (c.itens as any[]).map((i) => {
          const ins = Array.isArray(i.insumo) ? i.insumo[0] : i.insumo;
          const emb = embalagemItem(ins);
          // veio em embalagem diferente da do cadastro: mostra como foi comprado (10 sacos de 25 kg)
          const comoVeio = emb.padrao != null && Number(i.embalagens) > 0 && Number(i.conteudo_embalagem) > 0;
          return {
            ...itemVazio(),
            ...emb,
            ...(comoVeio ? { conteudo: numeroParaCampo(i.conteudo_embalagem) } : {}),
            tipo: i.tipo_item === 'insumo' ? 'insumo' : 'servico',
            insumoId: i.insumo_id,
            categoria: ins?.categoria ?? 'outro',
            unidade: ins?.unidade ?? i.unidade ?? 'un',
            temMinimo: ins?.estoque_minimo != null,
            descricao: i.descricao ?? '',
            qtd: numeroParaCampo(comoVeio ? i.embalagens : i.quantidade),
            unit: comoVeio ? moedaParaCampo(r2(Number(i.valor_total) / Number(i.embalagens))) : Number(i.valor_unitario) ? moedaParaCampo(i.valor_unitario) : '',
            total: Number(i.valor_total) ? moedaParaCampo(i.valor_total) : '',
            lote: i.lote_fabricacao ?? '',
            validade: i.validade ? doBanco(i.validade) : '',
            icms: Number(i.icms) ? moedaParaCampo(i.icms) : '',
            ipi: Number(i.ipi) ? moedaParaCampo(i.ipi) : '',
            st: Number(i.icms_st) ? moedaParaCampo(i.icms_st) : '',
            impostos: !!(Number(i.icms) || Number(i.ipi) || Number(i.icms_st)),
          } as Item;
        }),
      );
      setFrete(Number(c.frete) ? moedaParaCampo(c.frete) : '');
      setSeguro(Number(c.seguro) ? moedaParaCampo(c.seguro) : '');
      setAcrescimo(Number(c.acrescimo_financeiro) ? moedaParaCampo(c.acrescimo_financeiro) : '');
      if (c.comprador_doc_id) setCompradorId(c.comprador_doc_id);
      setPorFora(!!compradores.find((x) => x.id === c.comprador_doc_id && !x.lanca));
      setOutras(Number(c.outras_despesas) ? moedaParaCampo(c.outras_despesas) : '');
      setDesconto(Number(c.desconto) ? moedaParaCampo(c.desconto) : '');
      setRateio((c.rateio as any[]).map((x) => ({ chave: chave(), centroId: x.centro_custo_id, perc: numeroParaCampo(x.percentual) })));
      setBancoId(c.conta_bancaria_id);
      const ps = ((c.parcelas as any[]) ?? []).sort((a, b) => a.parcela - b.parcela);
      setForma([c.forma_pagamento ?? (ps.length > 1 ? 'prazo' : 'avista')]);
      if (ps.length > 1) setNParc(String(ps.length));
      setParcelas(ps.map((x) => ({ chave: chave(), venc: doBanco(x.data_vencimento), valor: moedaParaCampo(x.valor) })));
      manterParcelas.current = ps.length > 0;
      setObs(c.situacao === 'a_completar' ? '' : c.observacoes ?? '');
      // frete à parte: as compras que esta nota transportou e, se for mercadoria, os fretes que ela recebe
      const [lig, rec] = await Promise.all([
        consulta<any[]>(supabase.from('compra_fretes').select('compra_id').eq('frete_compra_id', cid)),
        consulta<any[]>(supabase.from('compra_fretes').select('frete_compra_id, valor_rateado').eq('compra_id', cid)),
      ]);
      const ts = lig.length ? await consulta<any[]>(supabase.from('compras').select(CAMPOS_TRANSP).in('id', lig.map((x) => x.compra_id))) : [];
      setTransportadas(ts.map(paraTransportada).sort((a, b) => a.numero - b.numero));
      setFreteAberto(ts.length > 0);
      const fs = rec.length ? await consulta<any[]>(supabase.from('compras').select('id, numero').in('id', rec.map((x) => x.frete_compra_id))) : [];
      setFretesRecebidos(rec.map((x) => ({ numero: fs.find((f) => f.id === x.frete_compra_id)?.numero ?? 0, valor: Number(x.valor_rateado) })).sort((a, b) => a.numero - b.numero));
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setCarregando(false);
  }

  // V149: veio da Consulta pelo botão "Alterar ou excluir": abre a compra já carregada
  useEffect(() => {
    if (params?.abrirId) abrir(params.abrirId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.abrirId]);

  async function abrirPorNumero() {
    setAlterarErro(null);
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m || !fid) return setAlterarErro('Digite o número da compra.');
    const { data: c } = await supabase.from('compras').select('id, fazenda_id, fazenda:fazendas ( nome )').eq('numero', Number(m[1])).maybeSingle();
    if (!c) return setAlterarErro(`Não há compra nº ${m[1]}.`);
    // produtos entram no estoque de uma fazenda: altera-se com essa fazenda em uso
    if (c.fazenda_id !== fid) return setAlterarErro(`A compra nº ${m[1]} é ${c.fazenda_id ? `da ${(Array.isArray(c.fazenda) ? c.fazenda[0] : (c.fazenda as any))?.nome ?? 'outra fazenda'}` : 'do Administrativo'}: troque a fazenda em uso para alterar.`);
    setAlterarAberto(false);
    setAlterarNum('');
    abrir(c.id);
  }

  function limpar() {
    setId(null);
    setNumero(null);
    setData(hojeBR());
    setPessoaId(null);
    setDocumento('');
    setItens([itemVazio()]);
    setFrete('');
    setSeguro('');
    setAcrescimo('');
    setPorFora(false);
    setCompradorId(compradorPadrao(compradores));
    setOutras('');
    setDesconto('');
    setRateio([]);
    setBancoId(null);
    setForma(['avista']);
    setPrimeiro('');
    setObs('');
    setErros({});
    setOrigem(null);
    setAvisoNota(null);
    fecharFrete();
    setFretesRecebidos([]);
  }

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!data || !dataValida(data)) e.data = 'Informe a data da compra.';
    if (!pessoaId) e.pessoa = 'Informe o fornecedor.';
    itens.forEach((i, k) => {
      const q = n(i.qtd);
      const t = n(i.total);
      if (i.tipo === 'insumo' && !i.insumoId) e[`p${k}`] = `Item ${k + 1}: escolha o produto.`;
      if (i.tipo === 'servico' && !i.descricao.trim()) e[`p${k}`] = `Item ${k + 1}: descreva o serviço ou item.`;
      if (i.tipo === 'insumo' && (q == null || q <= 0)) e[`q${k}`] = `Item ${k + 1}: informe a quantidade.`;
      if (pedeConteudo(i)) {
        const c = n(i.conteudo);
        if (i.padrao != null && (c == null || c <= 0)) e[`c${k}`] = `Item ${k + 1}: informe quanto tem cada ${nomeUnidade(i.unidade)} (${i.medida}).`;
        if (i.padrao == null && i.conteudo.trim() && (c == null || c <= 0 || !i.medida)) e[`c${k}`] = `Item ${k + 1}: quantidade de cada ${nomeUnidade(i.unidade)} inválida.`;
      }
      if (t == null || t <= 0) e[`t${k}`] = `Item ${k + 1}: informe o valor.`;
      if (i.validade && !dataValida(i.validade)) e[`v${k}`] = `Item ${k + 1}: validade inválida.`;
      if (i.minimo.trim() && (n(i.minimo) == null || n(i.minimo)! < 0)) e[`m${k}`] = `Item ${k + 1}: estoque mínimo inválido.`;
    });
    if (total <= 0) e.total = 'O total da compra precisa ser maior que zero.';
    if (freteAberto && !transportadas.length) e.frete = 'Frete à parte: informe a compra transportada, ou toque em "Não é frete à parte".';
    else if (transportadas.length && itens.some((i) => i.tipo === 'insumo')) e.frete = 'Nota de frete à parte não tem produto de estoque: marque os itens como "Serviço / outro".';
    if (rateio.length) {
      if (rateio.some((x) => !x.centroId)) e.rateio = 'Escolha o centro de custo de cada linha do rateio.';
      else if (new Set(rateio.map((x) => x.centroId)).size !== rateio.length) e.rateio = 'Há centro de custo repetido no rateio.';
      else if (Math.abs(somaRateio - 100) > 0.001) e.rateio = `O rateio soma ${formatarNumero(somaRateio, 2)}%: precisa fechar 100%.`;
    }
    if (!parcelas.length) e.parcelas = 'Informe o pagamento.';
    else if (parcelas.some((p) => !dataValida(p.venc) || n(p.valor) == null || n(p.valor)! <= 0)) e.parcelas = 'Confira o vencimento e o valor de cada parcela.';
    else if (Math.abs(somaParcelas - total) > 0.009) e.parcelas = `As parcelas somam ${formatarMoeda(somaParcelas)} e o total é ${formatarMoeda(total)}.`;
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    const p = {
      id,
      fazenda_id: fid,
      data: paraBanco(data),
      pessoa_id: pessoaId,
      numero_documento: documento,
      conta_contabil_id: null, // classificação automática: o banco define pela categoria dos produtos
      conta_bancaria_id: bancoId,
      forma_pagamento: forma[0],
      frete: n(frete) ?? 0,
      seguro: n(seguro) ?? 0,
      acrescimo_financeiro: n(acrescimo) ?? 0,
      outras_despesas: n(outras) ?? 0,
      comprador_doc_id: compradorId,
      forcar_por_fora: porFora,
      desconto: n(desconto) ?? 0,
      observacoes: obs,
      itens: itens.map((i) => ({
        tipo_item: i.tipo,
        insumo_id: i.tipo === 'insumo' ? i.insumoId : null,
        descricao: i.tipo === 'servico' ? i.descricao : null,
        // o estoque conta na embalagem do cadastro: 10 sacos de 25 kg entram como 5 sacos de 50 kg
        quantidade: i.tipo === 'insumo' ? qtdEstoque(i) : n(i.qtd) ?? 1,
        unidade: i.tipo === 'insumo' ? i.unidade : 'un',
        valor_unitario: i.tipo === 'insumo' ? (fatorEmb(i) === 1 ? n(i.unit) : null) ?? r2((n(i.total) ?? 0) / (qtdEstoque(i) || 1)) : n(i.total),
        embalagens: i.tipo === 'insumo' && i.padrao != null && fatorEmb(i) !== 1 ? n(i.qtd) : null,
        conteudo_embalagem: i.tipo === 'insumo' && i.padrao != null && fatorEmb(i) !== 1 ? n(i.conteudo) : null,
        valor_total: n(i.total),
        lote_fabricacao: i.tipo === 'insumo' ? i.lote : null,
        validade: i.tipo === 'insumo' && i.validade ? paraBanco(i.validade) : null,
        estoque_minimo: i.tipo === 'insumo' && i.minimo.trim() ? n(i.minimo) : null,
        icms: n(i.icms) ?? 0,
        ipi: n(i.ipi) ?? 0,
        icms_st: n(i.st) ?? 0,
      })),
      rateio: rateio.map((x) => ({ centro_custo_id: x.centroId, percentual: n(x.perc) })),
      parcelas: parcelas.map((x) => ({ vencimento: paraBanco(x.venc), valor: n(x.valor) })),
      fretes_de: transportadas.map((x) => x.id),
    };
    // Compra nova parecida com uma já gravada: pergunta antes (vale também para a digitada à mão).
    if (!id && fid && pessoaId) {
      const doc = documento.trim();
      const [porDoc, porValor] = await Promise.all([
        doc ? supabase.from('compras').select('numero').eq('pessoa_id', pessoaId).eq('numero_documento', doc).limit(1) : Promise.resolve({ data: [] as any[] }),
        supabase.from('compras').select('numero').eq('pessoa_id', pessoaId).eq('data', paraBanco(data)).eq('valor_total', total).limit(1),
      ]);
      const porDocValor = doc && !porDoc.data?.length && !porValor.data?.length ? await supabase.from('compras').select('numero').eq('numero_documento', doc).eq('valor_total', total).limit(1) : { data: [] as any[] };
      const igual = porDoc.data?.[0] ?? porValor.data?.[0] ?? porDocValor.data?.[0];
      if (igual) {
        const motivo = porDoc.data?.length ? `com o documento ${doc} deste fornecedor` : porValor.data?.length ? `deste fornecedor, em ${data}, no valor de ${formatarMoeda(total)}` : `com o documento ${doc} e o mesmo valor (${formatarMoeda(total)}), de outro fornecedor`;
        const ok = await perguntar('Compra repetida?', `Já existe a compra nº ${igual.numero} ${motivo}. Gravar mesmo assim?`, 'Gravar mesmo assim', 'Voltar');
        if (!ok) return;
      }
    }
    setSalvando(true);
    // produto novo em embalagem: o conteúdo informado na compra vira o do cadastro (Saco: 50 kg, consumo em kg)
    for (const i of itens) {
      const c = n(i.conteudo);
      if (i.tipo !== 'insumo' || !i.insumoId || !i.novo || i.padrao != null || !ehEmbalagem(i.unidade) || !c || c <= 0 || !i.medida) continue;
      const consumo = i.medida === i.unidade ? [] : [i.medida];
      await supabase.from('insumos').update(unidadesParaBanco({ compra: [i.unidade], qtd: i.conteudo, medida: [i.medida], consumo: consumo.length ? consumo : [i.unidade], conteudo: '' })).eq('id', i.insumoId);
    }
    const { data: r, error } = await supabase.rpc('salvar_compra', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { id: string; numero: number; total: number; frete_aparte?: number };
    let extra = '';
    if (origem) {
      const vinculos = origem.cnpj
        ? itens
            .filter((i) => i.tipo === 'insumo' && i.insumoId && i.nota && i.nota.qtd && qtdEstoque(i))
            .map((i) => ({ cnpj: origem.cnpj, chave_item: i.nota!.chaveItem, descricao: i.nota!.descricao, insumo: i.insumoId, fator: qtdEstoque(i)! / i.nota!.qtd! }))
        : [];
      const { error: e2 } = await supabase.rpc('registrar_nota_compra', { p: { compra: res.id, chave: origem.chave ?? '', codigo_barras: origem.codigoBarras ?? '', arquivo: origem.arquivo ?? '', vinculos } });
      if (e2) extra = ` Atenção: ${traduzirErro(e2)}`;
      else if (vinculos.length) extra = ' Os produtos desta nota ficaram aprendidos para a próxima.';
    }
    if (id && voltarDaConsulta(navegacao, params?.abrirId, false)) return;
    const pagar = parcelas.length === 1 ? '1 conta a pagar lançada' : `${parcelas.length} parcelas lançadas no contas a pagar`;
    setAviso(
      transportadas.length
        ? `Compra nº ${res.numero} gravada: ${formatarMoeda(res.total)}. Frete de ${formatarMoeda(Number(res.frete_aparte ?? custoFrete))} rateado no custo dos itens da${transportadas.length > 1 ? 's compras' : ' compra'} nº ${listaNumeros(transportadas.map((x) => x.numero))} (o estoque delas já está com o custo novo) e ${pagar}.${extra}`
        : `Compra nº ${res.numero} gravada: ${formatarMoeda(res.total)}. Estoque atualizado e ${pagar}.${fretesRecebidos.length ? ' O frete à parte desta compra foi rateado de novo nos itens.' : ''}${extra}`,
    );
    limpar();
    recarregarTopo();
  }

  function excluir() {
    const obsFrete = transportadas.length
      ? ` O frete sai do custo da${transportadas.length > 1 ? 's compras' : ' compra'} nº ${listaNumeros(transportadas.map((x) => x.numero))}.`
      : fretesRecebidos.length
        ? ` O frete à parte que ela recebe (compra nº ${listaNumeros(fretesRecebidos.map((x) => x.numero))}) fica sem esta mercadoria para ratear.`
        : '';
    Alert.alert('Excluir compra', `Excluir a compra nº ${numero}? Sai do estoque e do contas a pagar.${obsFrete}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_compra', { p_id: id }), 'compra_id', String(id));
          if (error) return setErro(traduzirErro(error));
          if (voltarDaConsulta(navegacao, params?.abrirId, true)) return;
          setAviso(`Compra nº ${numero} excluída.`);
          limpar();
          recarregarTopo();
        },
      },
    ]);
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaCompras />
      </Tela>
    );
  }
  if (carregando) {
    return (
      <Tela>
        {abas}
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 24 }} />
      </Tela>
    );
  }
  // Produtos entram no estoque; despesa vai direto para o resultado e para o contas a pagar (ou caixa/banco).
  const seletorModo = !id && !soDespesa && (
    <Escolha
      rotulo="O que você está lançando"
      opcoes={[
        { valor: 'produtos', rotulo: 'Produtos (estoque)' },
        { valor: 'despesa', rotulo: 'Despesa (sem estoque)' },
      ]}
      valor={[modo]}
      aoMudar={(v) => {
        setModo(v[0] as 'produtos' | 'despesa');
        setDespesaId(null);
        setErro(null);
        setAviso(null);
      }}
    />
  );
  if (modo === 'despesa') {
    return (
      <Tela>
        {abas}
        {seletorModo}
        <Text style={estilos.nota2}>Energia, serviço, manutenção, contador, seguro e outras contas que não entram no estoque. Vai direto para a despesa e para o contas a pagar, ou já sai do caixa/banco.</Text>
        <DespesaForm
          abrirId={despesaId}
          aoFechar={(motivo) => {
            if (motivo && motivo !== 'saiu' && voltarDaConsulta(navegacao, params?.abrirId, motivo === 'excluiu')) return;
            setDespesaId(null);
            recarregarTopo();
          }}
        />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {seletorModo}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Compra nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>

      {!id && pendentes.length > 0 && (
        <View style={estilos.pendentes}>
          <Text style={estilos.pendTitulo}>
            {pendentes.length === 1 ? '1 compra de entrada rápida a completar' : `${pendentes.length} compras de entrada rápida a completar`}
          </Text>
          {pendentes.map((p) => (
            <Pressable key={p.id} onPress={() => abrir(p.id)} style={estilos.pendItem} accessibilityRole="button">
              <Text style={estilos.pendTexto}>
                Nº {p.numero} · {doBanco(p.data)} ·{' '}
                {(p.compra_itens as any[]).map((i) => `${formatarNumero(Number(i.quantidade))} ${i.unidade} ${(Array.isArray(i.insumo) ? i.insumo[0] : i.insumo)?.nome ?? ''}`).join(', ')}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={cores.primaria} />
            </Pressable>
          ))}
        </View>
      )}
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair desta compra e lançar uma nova
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar a compra nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar uma compra já cadastrada
        </Text>
      )}

      {!id && (
        <View style={estilos.nota}>
          <Text style={estilos.notaTitulo}>Entrada pela nota fiscal</Text>
          {lendo ? (
            <View style={estilos.linhaCentro}>
              <ActivityIndicator color={cores.primaria} />
              <Text style={estilos.notaTexto}>{lendo}</Text>
            </View>
          ) : (
            <>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="📷  Foto da nota" tipo="secundario" onPress={escolherFoto} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao titulo="📄  XML (NF-e / CT-e)" tipo="secundario" onPress={lerXml} />
                </View>
              </View>
              <Text style={estilos.notaTexto}>
                {origem ? 'Leu outra nota por engano? Toque de novo para substituir.' : 'Tem o XML (vem no e-mail do fornecedor)? Use-o: é exato e não gasta a IA. Sem ele, a foto do DANFE resolve. Vale também para o frete à parte: XML do CT-e ou foto do DACTE.'}
              </Text>
            </>
          )}
        </View>
      )}
      {avisoNota && <Aviso tipo="info" texto={avisoNota} />}

      <CampoPessoaBusca rotulo="Fornecedor *" valorId={pessoaId} aoMudar={setPessoaId} tipoNovo="fornecedor" erro={erros.pessoa} />
      <Campo rotulo="Nº da nota / documento" value={documento} onChangeText={setDocumento} autoCapitalize="characters" />
      {compradores.filter((x) => x.lanca || x.id === compradorId).length > 1 && (
        <Escolha
          rotulo="Nota em nome de"
          opcoes={compradores.filter((x) => x.lanca || x.id === compradorId).map((x) => ({ valor: x.id, rotulo: x.nome }))}
          valor={compradorId ? [compradorId] : []}
          aoMudar={(v) => setCompradorId(v[0])}
        />
      )}

      {/* ---------- frete à parte (CT-e / NF de frete) ---------- */}
      {fretesRecebidos.length > 0 && (
        <Text style={estilos.nota2}>
          Esta compra recebe frete à parte: {fretesRecebidos.map((x) => `compra nº ${x.numero} (${formatarMoeda(x.valor)})`).join(', ')}. Ao salvar, o frete é rateado de novo nos itens.
        </Text>
      )}
      {!freteAberto ? (
        fretesRecebidos.length === 0 && (
          <Text style={estilos.link} onPress={abrirFrete}>
            Esta nota é de frete à parte (CT-e)? Informar a compra transportada
          </Text>
        )
      ) : (
        <View style={estilos.frete}>
          <View style={estilos.itemTopo}>
            <Text style={estilos.freteTitulo}>Frete à parte: compras transportadas</Text>
            <Text style={estilos.link} onPress={fecharFrete}>
              Não é frete à parte
            </Text>
          </View>
          <Text style={estilos.nota2}>O custo deste frete vai para o custo dos itens das compras abaixo, rateado pelo valor de cada item.</Text>
          {transportadas.map((x, k) => (
            <View key={x.id} style={estilos.freteLinha}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={estilos.freteCompra}>
                  Compra nº {x.numero} · {doBanco(x.data)}
                </Text>
                <Text style={estilos.nota2}>{[x.fornecedor, x.documento ? `Nota ${x.documento}` : null, `itens ${formatarMoeda(x.soma)}`].filter(Boolean).join(' · ')}</Text>
                {custoFrete > 0 && baseTransp > 0 && <Text style={estilos.freteParte}>Recebe {formatarMoeda(partesFrete[k])} do frete</Text>}
              </View>
              <Pressable onPress={() => setTransportadas((l) => l.filter((y) => y.id !== x.id))} hitSlop={10} accessibilityLabel={`Tirar a compra ${x.numero}`}>
                <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
              </Pressable>
            </View>
          ))}
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Compra nº (da mercadoria)" value={transpNum} onChangeText={(t) => setTranspNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={transpErro} />
            </View>
            <View style={{ width: 120, paddingTop: 26 }}>
              <Botao titulo="Adicionar" tipo="secundario" onPress={adicionarTransportada} />
            </View>
          </View>
          <SeletorLista rotulo="Ou escolha nas últimas compras" valorId={null} aoMudar={escolherTransportada} carregar={carregarUltimasCompras} dicaBusca="Nº da compra, fornecedor ou nota" vazio="Nenhuma compra de mercadoria para escolher." />
          {transportadas.length > 0 && custoFrete > 0 && (
            <Text style={estilos.nota2}>
              Custo do frete a ratear: <Text style={{ fontWeight: '800', color: cores.texto }}>{formatarMoeda(custoFrete)}</Text>
              {Math.abs(custoFrete - total) > 0.004 ? ` (total da nota ${formatarMoeda(total)}, menos os créditos do documento)` : ''}
            </Text>
          )}
          {erros.frete && <Text style={estilos.erro}>{erros.frete}</Text>}
        </View>
      )}

      {/* ---------- itens ---------- */}
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
          {it.nota && (
            <View style={[estilos.naNota, !it.insumoId && it.tipo === 'insumo' && { borderColor: '#E0A800', backgroundColor: '#FFF6E0' }]}>
              <Text style={estilos.naNotaTexto}>
                Na nota: {it.nota.descricao}
                {it.nota.qtd != null ? ` · ${formatarQtd(it.nota.qtd)} ${it.nota.unidade ?? ''}` : ''}
              </Text>
              {it.tipo === 'insumo' && !it.insumoId && <Text style={estilos.naNotaDica}>Aponte abaixo o produto do seu estoque (ou cadastre). Se for frete ou serviço, marque "Serviço / outro".</Text>}
              {it.tipo === 'insumo' && it.insumoId && it.nota.unidade && it.nota.unidade.toLowerCase() !== it.unidade.toLowerCase() && (
                <Text style={estilos.naNotaDica}>
                  Na nota vem em {it.nota.unidade}; o estoque conta em {it.unidade}. Confira a quantidade: a conversão fica aprendida.
                </Text>
              )}
            </View>
          )}
          <Escolha
            opcoes={[
              { valor: 'insumo', rotulo: 'Produto (estoque)' },
              { valor: 'servico', rotulo: 'Serviço / outro' },
            ]}
            valor={[it.tipo]}
            aoMudar={(v) => mudar(it.chave, { tipo: v[0] as any })}
          />
          {it.tipo === 'insumo' ? (
            <>
              <CampoBuscaRapida
                rotulo="Produto *"
                valorId={it.insumoId}
                aoMudar={(v) => escolherProduto(it.chave, v)}
                buscar={buscarProdutos}
                lerNome={lerProduto}
                criar={criarProduto(it.chave)}
                rotuloNovo="produto novo"
                icone="cube"
                placeholder="Nome do produto"
                erro={erros[`p${k}`]}
              />
              {it.novo && (
                <>
                  <Escolha rotulo="Categoria do produto novo" opcoes={CATEGORIAS_INSUMO.map((c) => ({ valor: c.valor, rotulo: c.rotulo }))} valor={[it.categoria]} aoMudar={(v) => mudarNovo(it, { categoria: v[0] })} />
                  <Escolha rotulo="Unidade de compra" opcoes={UNIDADES} valor={[it.unidade]} aoMudar={(v) => mudarNovo(it, { unidade: v[0] })} />
                </>
              )}
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Campo rotulo={`Qtde. (${it.unidade}) *`} value={it.qtd} onChangeText={(t) => mudarQtdOuUnit(it, 'qtd', t)} keyboardType="decimal-pad" erro={erros[`q${k}`]} />
                </View>
                <View style={{ flex: 1 }}>
                  <CampoMoeda rotulo="R$ unitário" valor={it.unit} aoMudar={(t) => mudarQtdOuUnit(it, 'unit', t)} />
                </View>
              </View>
              {pedeConteudo(it) && (
                <View style={estilos.embalagem}>
                  <View style={estilos.embLinha}>
                    <Text style={estilos.embTexto}>{nomeUnidade(it.unidade).charAt(0).toUpperCase() + nomeUnidade(it.unidade).slice(1)} desta compra:</Text>
                    <View style={{ width: 110 }}>
                      <Campo rotulo="" value={it.conteudo} onChangeText={(t) => mudar(it.chave, { conteudo: t })} keyboardType="decimal-pad" placeholder="Ex.: 50" />
                    </View>
                    <Text style={estilos.embTexto}>{it.medida}</Text>
                  </View>
                  {it.padrao == null && (
                    <Escolha rotulo={`Medida do conteúdo de 1 ${nomeUnidade(it.unidade)}`} opcoes={MEDIDAS.filter((m) => m.valor !== it.unidade)} valor={it.medida ? [it.medida] : []} aoMudar={(v) => mudar(it.chave, { medida: v[0] })} />
                  )}
                  {erros[`c${k}`] ? <Text style={estilos.embErro}>{erros[`c${k}`]}</Text> : null}
                  {(() => {
                    const q = n(it.qtd);
                    const c = n(it.conteudo);
                    if (it.padrao == null) return <Text style={estilos.embNota}>Produto novo: esta quantidade fica no cadastro como a embalagem padrão.</Text>;
                    if (!c || c <= 0) return null;
                    const total = q ? ` ${formatarQtd(q)} ${nomeUnidade(it.unidade)} = ${formatarQtd(q * c)} ${it.medida}.` : '';
                    if (c === it.padrao) return <Text style={estilos.embNota}>Igual ao cadastro ({nomeUnidade(it.unidade)} de {formatarQtd(it.padrao)} {it.medida}).{total} Se veio de outro tamanho, mude aqui.</Text>;
                    return (
                      <Text style={[estilos.embNota, { color: cores.cafe, fontWeight: '700' }]}>
                        No cadastro o {nomeUnidade(it.unidade)} é de {formatarQtd(it.padrao)} {it.medida}.{total}
                        {q ? ` Entra no estoque como ${formatarQtd(qtdEstoque(it))} ${nomeUnidade(it.unidade)} de ${formatarQtd(it.padrao)} ${it.medida}.` : ''}
                      </Text>
                    );
                  })()}
                </View>
              )}
              <CampoMoeda rotulo="Valor do item (R$) *" valor={it.total} aoMudar={(t) => mudarTotal(it, t)} erro={erros[`t${k}`]} />
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Campo rotulo="Lote do fabricante" value={it.lote} onChangeText={(t) => mudar(it.chave, { lote: t })} autoCapitalize="characters" />
                </View>
                <View style={{ flex: 1 }}>
                  <CampoData rotulo="Validade" valor={it.validade} aoMudar={(t) => mudar(it.chave, { validade: t })} erro={erros[`v${k}`]} />
                </View>
              </View>
              {it.insumoId && !it.temMinimo && (
                <Campo
                  rotulo={`Estoque mínimo (${it.unidade}) – alerta de reposição`}
                  value={it.minimo}
                  onChangeText={(t) => mudar(it.chave, { minimo: t })}
                  keyboardType="decimal-pad"
                  placeholder="Opcional"
                  erro={erros[`m${k}`]}
                />
              )}
            </>
          ) : (
            <>
              <Campo rotulo="Descrição *" value={it.descricao} onChangeText={(t) => mudar(it.chave, { descricao: t })} autoCapitalize="sentences" placeholder="Ex.: Frete da nota, montagem, instalação" erro={erros[`p${k}`]} />
              <CampoMoeda rotulo="Valor (R$) *" valor={it.total} aoMudar={(t) => mudar(it.chave, { total: t })} erro={erros[`t${k}`]} />
            </>
          )}
          {it.impostos ? (
            <View style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <CampoMoeda rotulo="ICMS" valor={it.icms} aoMudar={(t) => mudar(it.chave, { icms: t })} />
              </View>
              <View style={{ flex: 1 }}>
                <CampoMoeda rotulo="IPI" valor={it.ipi} aoMudar={(t) => mudar(it.chave, { ipi: t })} />
              </View>
              <View style={{ flex: 1 }}>
                <CampoMoeda rotulo="ICMS-ST" valor={it.st} aoMudar={(t) => mudar(it.chave, { st: t })} />
              </View>
            </View>
          ) : (
            <Text style={estilos.link} onPress={() => mudar(it.chave, { impostos: true })}>
              + Impostos do item (ICMS, IPI, ICMS-ST)
            </Text>
          )}
        </View>
      ))}
      <Text style={estilos.link} onPress={() => setItens((l) => [...l, itemVazio()])}>
        + Adicionar item
      </Text>

      {/* ---------- totais ---------- */}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Frete" valor={frete} aoMudar={setFrete} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Seguro" valor={seguro} aoMudar={setSeguro} />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Outras despesas" valor={outras} aoMudar={setOutras} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Acréscimo financeiro" valor={acrescimo} aoMudar={setAcrescimo} />
        </View>
      </View>
      <CampoMoeda rotulo="Desconto" valor={desconto} aoMudar={setDesconto} />
      {(somaIpi > 0 || somaSt > 0) && (
        <Text style={estilos.nota2}>
          Somados dos itens: {somaIpi > 0 ? `IPI ${formatarMoeda(somaIpi)}` : ''}
          {somaIpi > 0 && somaSt > 0 ? ' · ' : ''}
          {somaSt > 0 ? `ICMS-ST ${formatarMoeda(somaSt)}` : ''} (entram no valor a pagar)
        </Text>
      )}
      {temAcrescimo && somaItens > 0 && (
        <View style={estilos.custo}>
          <Text style={estilos.custoTitulo}>Custo de cada item (rateio pelo valor)</Text>
          {comprador && <Text style={estilos.nota2}>Créditos de {comprador.nome}: {[comprador.credito_icms && 'ICMS', comprador.credito_ipi && 'IPI', comprador.credito_pis_cofins && 'PIS/COFINS'].filter(Boolean).join(', ') || 'nenhum'}</Text>}
          {itens.map((it, k) => {
            const c = custos[k];
            const nome = it.tipo === 'servico' ? it.descricao : it.nota?.descricao ?? it.descricao;
            return (
              <View key={it.chave} style={{ gap: 2 }}>
                <Text style={estilos.custoItem}>
                  Item {k + 1}{nome ? ` · ${nome}` : ''}
                </Text>
                <Text style={estilos.custoLinha}>
                  {[
                    formatarMoeda(n(it.total) ?? 0),
                    c.frete ? `+ frete ${formatarMoeda(c.frete)}` : null,
                    c.acessorios > 0 ? `+ despesas ${formatarMoeda(c.acessorios)}` : c.acessorios < 0 ? `− desconto ${formatarMoeda(-c.acessorios)}` : null,
                    c.ipi ? `+ IPI ${formatarMoeda(c.ipi)}` : null,
                    c.st ? `+ ICMS-ST ${formatarMoeda(c.st)}` : null,
                    c.cIcms ? `− crédito ICMS ${formatarMoeda(c.cIcms)}` : null,
                    c.cIpi ? `− crédito IPI ${formatarMoeda(c.cIpi)}` : null,
                    c.cPis + c.cCof ? `− crédito PIS/COFINS ${formatarMoeda(c.cPis + c.cCof)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}{' '}
                  = <Text style={{ fontWeight: '800' }}>{formatarMoeda(c.custo)}</Text>
                  {c.unitario != null && (n(it.qtd) ?? 0) !== 1 ? `  (${formatarMoeda(c.unitario)} por ${it.unidade}${it.tipo === 'insumo' && it.padrao != null ? ` de ${formatarQtd(it.padrao)} ${it.medida}` : ''})` : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      <View style={estilos.total}>
        <Text style={estilos.totalRotulo}>Total da compra</Text>
        <Text style={estilos.totalValor}>{formatarMoeda(total)}</Text>
      </View>
      {erros.total && <Text style={estilos.erro}>{erros.total}</Text>}

      {/* ---------- classificação ---------- */}
      <Secao titulo="Para onde vai o custo" />
      <Text style={estilos.nota2}>A classificação é automática, pela categoria de cada produto. Aqui só se aponta o centro de custo, se quiser.</Text>
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
        <Text style={estilos.link} onPress={() => setRateio((l) => [...l, { chave: chave(), centroId: null, perc: numeroParaCampo(r2(Math.max(0, 100 - somaRateio))) }])}>
          + Centro de custo
        </Text>
        {rateio.length > 0 && <Text style={[estilos.soma, Math.abs(somaRateio - 100) > 0.001 && { color: cores.erro }]}>Soma {formatarNumero(somaRateio, 2)}%</Text>}
      </View>
      {erros.rateio && <Text style={estilos.erro}>{erros.rateio}</Text>}

      {/* ---------- pagamento ---------- */}
      <Secao titulo="Pagamento (contas a pagar)" />
      <SeletorLista rotulo="Conta bancária de saída" valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} permitirLimpar vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />
      <Escolha
        rotulo="Forma"
        opcoes={[
          { valor: 'avista', rotulo: 'À vista' },
          { valor: 'prazo', rotulo: 'A prazo / parcelado' },
        ]}
        valor={forma}
        aoMudar={setForma}
      />
      {forma[0] === 'prazo' && (
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
      {parcelas.length > 1 && (
        <Text style={[estilos.soma, Math.abs(somaParcelas - total) > 0.009 && { color: cores.erro }]}>Parcelas somam {formatarMoeda(somaParcelas)}</Text>
      )}
      {erros.parcelas && <Text style={estilos.erro}>{erros.parcelas}</Text>}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={id ? 'Salvar lançamento' : 'Gravar compra'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir compra" tipo="perigo" onPress={excluir} />}
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
  subtitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  soma: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  pendentes: { backgroundColor: '#FFF6E0', borderRadius: tam.raio, borderWidth: 1, borderColor: '#E0A800', padding: 12, gap: 6 },
  pendTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  pendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  pendTexto: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto },
  nota: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 8 },
  notaTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.info },
  notaTexto: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19, flexShrink: 1 },
  nota2: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  frete: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 10 },
  freteTitulo: { flex: 1, fontSize: tam.texto, fontWeight: '800', color: cores.info },
  freteLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10 },
  freteCompra: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  freteParte: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.cafe },
  custo: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  custoTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
  custoItem: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  custoLinha: { fontSize: tam.pequeno + 1, color: cores.texto },
  linhaCentro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  naNota: { borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 8, gap: 4 },
  naNotaTexto: { fontSize: tam.pequeno, fontWeight: '700', color: cores.texto },
  naNotaDica: { fontSize: tam.pequeno, color: cores.cafe, lineHeight: 18 },
  embalagem: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 8 },
  embLinha: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 },
  embTexto: { fontSize: tam.texto, fontWeight: '600', color: cores.texto, paddingBottom: 14 },
  embNota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 18 },
  embErro: { fontSize: tam.pequeno, color: cores.erro },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemNum: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  totalRotulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  totalValor: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
  parcNum: { width: 28, paddingTop: 36, fontSize: tam.texto, fontWeight: '800', color: cores.textoSuave },
});
