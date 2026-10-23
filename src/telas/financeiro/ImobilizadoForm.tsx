import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import EntradaDocumento from '../../componentes/EntradaDocumento';
import ConsultaImobilizado from './ConsultaImobilizado';
import Interruptor from '../../componentes/Interruptor';
import PainelFormacao from './PainelFormacao';
import { CATEGORIAS_FORMACAO } from '../../lib/formacao';
import { useSessao } from '../../contexto/SessaoContext';
import { ADM, centroDaUnidade, idUnidade, nomeUnidade, opcoesUnidade, valorUnidade } from '../../lib/unidades';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { CATEGORIAS_IMOB, calcular, textoMes, type Metodo } from '../../lib/imobilizado';
import { custoHoraBem } from '../../lib/maoObra';
import { chaveNfeValida, lerXmlNfe } from '../../lib/notaFiscal';
import { abrirFotoDocumento, fornecedorPeloDocumento } from '../../lib/documentos';
import { somenteDigitos } from '../../lib/formatos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Rateio = { chave: string; centroId: string | null; perc: string };
/** Item da nota do bem, como veio da foto (IA) ou do XML. */
type ItemBem = {
  descricao: string;
  quantidade: number | null;
  valor_total: number | null;
  nome_sugerido?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano_fabricacao?: string | null;
  ano_modelo?: string | null;
  numero_serie?: string | null;
  chassi?: string | null;
  placa?: string | null;
  renavam?: string | null;
  categoria?: string | null;
};
/** A nota lida, guardada enquanto se cadastram os bens dela (uma nota pode ter vários bens). */
type NotaLida = { itens: ItemBem[]; extras: number; somaItens: number; total: number | null; usados: number[] };
const TODOS = 'todos';
const r2 = (v: number) => Math.round(v * 100) / 100;
let cont = 0;
const chave = () => `r${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);

/** Imobilizado: bens com depreciação (máquinas, benfeitorias) ou exaustão (lavouras perenes), com rateio por centro de custo. */
export default function ImobilizadoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ImobilizadoForm'>>();
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const fid = fazendaAtiva?.id;
  // O bem é do Grupo, alocado numa fazenda (ou na Administração). Depois de gravado, muda só por Transferir.
  const [alocado, setAlocado] = useState<string>(modoAdm ? ADM : fid ?? ADM);

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [ativacao, setAtivacao] = useState(hojeBR());
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [metodo, setMetodo] = useState<Metodo>('depreciacao');
  const [categoria, setCategoria] = useState<string[]>([]);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [vida, setVida] = useState('');
  const [residual, setResidual] = useState('');
  const [rateio, setRateio] = useState<Rateio[]>([{ chave: chave(), centroId: null, perc: '100' }]);
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [documento, setDocumento] = useState('');
  const [compraId, setCompraId] = useState<string | null>(null);
  const [compraNum, setCompraNum] = useState('');
  const [situacao, setSituacao] = useState<string[]>(['ativo']);
  const [dataBaixa, setDataBaixa] = useState('');
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  // custo por hora de uso (tratores, máquinas, veículos, implementos e equipamentos): vai para o custo das atividades
  const [consumo, setConsumo] = useState('');
  const [precoLitro, setPrecoLitro] = useState('');
  const [manutHora, setManutHora] = useState('');
  // V152: bem em formação (lavoura, curral, barragem, estrada, casa, galpão...)
  const [valorAnterior, setValorAnterior] = useState('');
  const [bemCarregado, setBemCarregado] = useState<any>(null);
  const [criarTalhao, setCriarTalhao] = useState(false);
  const [talhaoNome, setTalhaoNome] = useState('');
  const [talhaoHa, setTalhaoHa] = useState('');
  const [chaveNfe, setChaveNfe] = useState<string | null>(null);
  const [arquivoDoc, setArquivoDoc] = useState<string | null>(null);
  const [notaLida, setNotaLida] = useState<NotaLida | null>(null);
  const [itemNota, setItemNota] = useState<string[]>([]);
  const [avisoNota, setAvisoNota] = useState<string | null>(null);

  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Bem nº ${numero}` : 'Imobilizado' });
  }, [navegacao, id, numero]);

  const proximoNumero = useCallback(() => {
    if (!fid) return;
    supabase
      .from('imobilizados')
      .select('numero')
      .order('numero', { ascending: false })
      .limit(1)
      .then(({ data }) => setProximo(((data?.[0]?.numero as number) ?? 0) + 1));
  }, [fid]);
  useEffect(proximoNumero, [proximoNumero]);

  // V145: código patrimonial automático = sigla da fazenda da entrada + sequência (ex.: TI 001).
  // Fica para sempre com o bem, mesmo transferido. Pode ser digitado outro.
  const [codigoAuto, setCodigoAuto] = useState<string | null>(null);
  useEffect(() => {
    if (id) return setCodigoAuto(null);
    let vivo = true;
    supabase.rpc('proximo_codigo_patrimonial', { p_fazenda: idUnidade(alocado) }).then(({ data }) => vivo && setCodigoAuto(typeof data === 'string' ? data : null));
    return () => {
      vivo = false;
    };
  }, [alocado, id, aviso]);

  const somaRateio = rateio.reduce((s, x) => s + (n(x.perc) ?? 0), 0);
  const formacao = situacao[0] === 'formacao';
  const unidade = metodo === 'exaustao' ? 'safras' : 'anos';
  const usaHora = ['tratores', 'maquinas', 'veiculos', 'implementos', 'equipamentos'].includes(categoria[0] ?? '');
  const custoHora = custoHoraBem({ consumo_l_hora: n(consumo), preco_litro: n(precoLitro), manutencao_hora: n(manutHora) });
  const ativIso = paraBanco(ativacao);
  const calc =
    !formacao && n(valor) && n(vida) && ativIso
      ? calcular({ valor_aquisicao: n(valor), data_ativacao: ativIso, vida_util: n(vida), residual_perc: n(residual) ?? 0, situacao: situacao[0], data_baixa: paraBanco(dataBaixa) }, hojeBanco())
      : null;

  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, idUnidade(alocado))).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [alocado]);
  const carregarAreas = useCallback(async (): Promise<ItemLista[]> => {
    const faz = idUnidade(alocado);
    if (!faz) return [];
    const d = await consulta<any[]>(supabase.from('areas').select('id, nome, tipo, area_ha, capim_cultura').eq('fazenda_id', faz).eq('ativa', true).order('nome'));
    return d.map((a) => ({ id: a.id, titulo: a.nome, detalhe: [a.tipo === 'talhao' ? 'Talhão' : a.tipo === 'manga' ? 'Manga' : a.tipo, a.capim_cultura, a.area_ha ? `${formatarNumero(Number(a.area_ha), 2)} ha` : null].filter(Boolean).join(' · ') }));
  }, [alocado]);

  function mudarMetodo(m: Metodo) {
    setMetodo(m);
    setCategoria([]);
  }
  function mudarCategoria(v: string[]) {
    setCategoria(v);
    const c = CATEGORIAS_IMOB.find((x) => x.valor === v[0]);
    if (c && !vida.trim()) setVida(String(c.vida));
  }

  async function puxarCompra() {
    setErro(null);
    const m = /^0*(\d+)$/.exec(compraNum.trim());
    if (!m || !fid) return setErro('Digite o número da compra.');
    const { data: c } = await supabase.from('compras').select('id, data, valor_total, pessoa_id, numero_documento, chave_nfe, arquivo_documento').eq('numero', Number(m[1])).maybeSingle();
    if (!c) return setErro(`Não há compra nº ${m[1]}.`);
    setCompraId(c.id);
    // frete cobrado à parte (CT-e) desta compra também é custo do bem
    const { data: fr } = await supabase.from('compra_fretes').select('valor_rateado').eq('compra_id', c.id);
    const freteAparte = ((fr as any[]) ?? []).reduce((t, x) => t + Number(x.valor_rateado ?? 0), 0);
    setValor(moedaParaCampo(Number(c.valor_total) + freteAparte));
    setAtivacao(doBanco(c.data));
    setPessoaId(c.pessoa_id);
    setDocumento(c.numero_documento ?? '');
    if (c.chave_nfe) setChaveNfe(c.chave_nfe);
    if (c.arquivo_documento) setArquivoDoc(c.arquivo_documento);
    setAviso(`Dados puxados da compra nº ${m[1]}: valor${freteAparte > 0 ? ` (com ${formatarMoeda(freteAparte)} de frete à parte)` : ''}, data, fornecedor e nota. Confira o valor se a compra tinha outros itens.`);
  }

  // ---- entrada pela nota fiscal do bem (foto lida pela IA ou XML da NF-e) ----
  /** Preenche a tela com a nota para conferência. Nada é gravado aqui. */
  async function aoLerNota(l: any, arquivo: string | null, origem: 'foto' | 'xml') {
    if (!fid) return;
    setErro(null);
    setAviso(null);
    const faltou: string[] = [...(l?.nao_lido ?? [])];
    const partes: string[] = [];
    const itens: ItemBem[] = (l?.itens ?? []).map((x: any) => ({ ...x, descricao: x.descricao ?? 'Item sem descrição' }));

    const ch = chaveNfeValida(l?.chave) ? somenteDigitos(l.chave) : null;
    let fornecedor: string | null = null;
    try {
      const f = await fornecedorPeloDocumento(l?.emitente?.nome, l?.emitente?.cnpj_cpf);
      fornecedor = f.id;
      if (f.aviso) partes.push(`Atenção: ${f.aviso}.`);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    const docTxt = [l?.numero, l?.serie ? `série ${l.serie}` : null].filter(Boolean).join(' ');
    const docs = [...new Set([docTxt, l?.numero].filter(Boolean))] as string[];

    // mesma nota já cadastrada em bem? (pela chave; sem chave, pelo fornecedor + nº da nota)
    const jaBens: { numero: number; item_nota: number | null }[] = [];
    if (ch) jaBens.push(...(((await supabase.from('imobilizados').select('numero, item_nota').eq('chave_nfe', ch)).data as any[]) ?? []));
    if (fornecedor && docs.length) jaBens.push(...(((await supabase.from('imobilizados').select('numero, item_nota').eq('pessoa_id', fornecedor).in('documento', docs)).data as any[]) ?? []));
    const usados = [...new Set(jaBens.map((b) => b.item_nota).filter((x): x is number => x != null && x >= 0))];
    const numerosBens = [...new Set(jaBens.map((b) => b.numero))].sort((a, b) => a - b);
    const notaCompleta = jaBens.length > 0 && (itens.length <= 1 || jaBens.some((b) => b.item_nota === -1 || b.item_nota == null) || usados.length >= itens.length);
    if (notaCompleta) {
      return setErro(`Esta nota fiscal já foi cadastrada no${numerosBens.length > 1 ? 's bens' : ' bem'} nº ${numerosBens.join(', ')}. Para ver ou alterar, use "Alterar um bem já cadastrado".`);
    }
    if (usados.length) partes.push(`Desta nota já ${usados.length === 1 ? 'foi cadastrado 1 item' : `foram cadastrados ${usados.length} itens`} (bem nº ${numerosBens.join(', ')}), marcados com ✓.`);

    // a nota já está nas Compras? (pela chave; sem chave, pelo fornecedor + nº da nota)
    let compraLigada: { id: string; numero: number } | null = null;
    if (ch) compraLigada = ((await supabase.from('compras').select('id, numero').eq('chave_nfe', ch).limit(1)).data as any[])?.[0] ?? null;
    if (!compraLigada && fornecedor && docs.length) compraLigada = ((await supabase.from('compras').select('id, numero').eq('pessoa_id', fornecedor).in('numero_documento', docs).limit(1)).data as any[])?.[0] ?? null;

    const hoje = hojeBanco();
    const dataNota = l?.data_emissao && /^\d{4}-\d{2}-\d{2}$/.test(l.data_emissao) && l.data_emissao <= hoje ? l.data_emissao : null;
    if (!dataNota) faltou.push('data');

    limpar();
    setPessoaId(fornecedor);
    setDocumento(docTxt);
    if (dataNota) setAtivacao(doBanco(dataNota));
    setChaveNfe(ch);
    setArquivoDoc(arquivo);
    if (compraLigada) {
      setCompraId(compraLigada.id);
      setCompraNum(String(compraLigada.numero));
      partes.push(`Esta nota já está lançada na compra nº ${compraLigada.numero}: o bem ficou ligado a ela.`);
    }

    const extras = (l?.frete ?? 0) + (l?.outras_despesas ?? 0) - (l?.desconto ?? 0);
    const somaItens = itens.reduce((t, i) => t + (i.valor_total ?? 0), 0);
    const nota: NotaLida = { itens, extras, somaItens, total: l?.valor_total ?? null, usados };
    setNotaLida(nota);

    partes.unshift(origem === 'xml' ? 'XML lido.' : 'Nota lida.');
    if (l?.legivel === false) partes.push('Quase nada pôde ser lido: tire outra foto ou digite o bem.');
    if (!itens.length) {
      faltou.push('itens');
      if (nota.total) setValor(moedaParaCampo(nota.total));
    } else if (itens.length === 1) {
      aplicarItem(nota, '0');
    } else partes.push(`A nota tem ${itens.length} itens: escolha abaixo qual é este bem (ou "Nota inteira" se for um bem só, como uma construção).`);
    if (faltou.length) partes.push(`Não veio na leitura: ${[...new Set(faltou)].join(', ')}.`);
    partes.push('Confira tudo, complete a vida útil e o rateio, e toque em "Cadastrar bem".');
    setAvisoNota(partes.join(' '));
  }

  async function aoLerXml(texto: string) {
    const l = lerXmlNfe(texto);
    if (!l) return setErro('Esse arquivo não é o XML de uma NF-e. O XML vem no e-mail do fornecedor, junto com o PDF da nota.');
    await aoLerNota(l, null, 'xml');
  }

  /** Põe na tela o item escolhido da nota (ou a nota inteira), com a parte do frete/desconto que cabe a ele. */
  function aplicarItem(nota: NotaLida, escolha: string) {
    if (escolha !== TODOS && nota.usados.includes(Number(escolha))) return setErro('Este item da nota já foi cadastrado como bem. Escolha outro.');
    setErro(null);
    setItemNota([escolha]);
    let cat: string | null = null;
    if (escolha === TODOS) {
      const v = nota.total ?? r2(nota.somaItens + nota.extras);
      if (v) setValor(moedaParaCampo(v));
      const cats = [...new Set(nota.itens.map((i) => i.categoria).filter(Boolean))];
      cat = cats.length === 1 ? (cats[0] as string) : null;
      setNome('');
      setDescricao(`Nota com ${nota.itens.length} itens`);
    } else {
      const it = nota.itens[Number(escolha)];
      if (!it) return;
      const base = it.valor_total ?? 0;
      const parte = nota.somaItens > 0 ? (nota.extras * base) / nota.somaItens : 0;
      if (base) setValor(moedaParaCampo(r2(base + parte)));
      cat = it.categoria ?? null;
      const marcaModelo = [it.marca, it.modelo].filter(Boolean).join(' ');
      setNome((it.nome_sugerido || marcaModelo || it.descricao).slice(0, 80));
      const ano = it.ano_fabricacao || it.ano_modelo ? `ano ${[it.ano_fabricacao, it.ano_modelo].filter(Boolean).join('/')}` : null;
      const det = [marcaModelo || null, ano, it.numero_serie ? `série ${it.numero_serie}` : null, it.chassi ? `chassi ${it.chassi}` : null, it.placa ? `placa ${it.placa}` : null, it.renavam ? `renavam ${it.renavam}` : null].filter(Boolean);
      setDescricao(det.length ? det.join(' · ') : it.descricao);
    }
    const c = CATEGORIAS_IMOB.find((x) => x.valor === cat && x.metodo === 'depreciacao');
    setMetodo('depreciacao');
    setCategoria(c ? [c.valor] : []);
    if (c) setVida(String(c.vida));
  }

  async function abrir(iid: string) {
    try {
      const b = await consulta<any>(supabase.from('imobilizados').select('*, rateio:imobilizado_rateios ( centro_custo_id, percentual ), compra:compras ( numero )').eq('id', iid).single());
      setId(b.id);
      setAlocado(valorUnidade(b.fazenda_id));
      setNumero(b.numero);
      setAtivacao(doBanco(b.data_ativacao));
      setNome(b.nome);
      setCodigo(b.codigo_patrimonial ?? '');
      setDescricao(b.descricao ?? '');
      setMetodo(b.metodo);
      setCategoria([b.categoria]);
      setAreaId(b.area_id);
      setValor(moedaParaCampo(b.valor_aquisicao));
      setVida(b.vida_util != null ? numeroParaCampo(b.vida_util) : '');
      setResidual(Number(b.residual_perc) ? numeroParaCampo(b.residual_perc) : '');
      setRateio((b.rateio as any[]).map((r) => ({ chave: chave(), centroId: r.centro_custo_id, perc: numeroParaCampo(r.percentual) })));
      setPessoaId(b.pessoa_id);
      setDocumento(b.documento ?? '');
      setCompraId(b.compra_id);
      const cp = Array.isArray(b.compra) ? b.compra[0] : b.compra;
      setCompraNum(cp?.numero ? String(cp.numero) : '');
      setSituacao([b.situacao]);
      setDataBaixa(b.data_baixa ? doBanco(b.data_baixa) : '');
      setMotivo(b.motivo_baixa ?? '');
      setObs(b.observacoes ?? '');
      setConsumo(numeroParaCampo(b.consumo_l_hora));
      setPrecoLitro(moedaParaCampo(b.preco_litro));
      setManutHora(moedaParaCampo(b.manutencao_hora));
      setChaveNfe(b.chave_nfe ?? null);
      setArquivoDoc(b.arquivo_documento ?? null);
      setValorAnterior(b.situacao === 'formacao' && Number(b.formacao_valor_anterior) ? moedaParaCampo(b.formacao_valor_anterior) : '');
      if (b.situacao === 'formacao') setValor('');
      setBemCarregado(b);
      setCriarTalhao(false);
      setNotaLida(null);
      setItemNota([]);
      setAvisoNota(null);
      setErros({});
      setAviso(null);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }
  // V149: veio da Consulta pelo botão "Alterar ou excluir": abre o bem já carregado
  useEffect(() => {
    if (params?.abrirId) abrir(params.abrirId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.abrirId]);

  async function abrirPorNumero() {
    setAlterarErro(null);
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m || !fid) return setAlterarErro('Digite o número do bem.');
    const { data } = await supabase.from('imobilizados').select('id').eq('numero', Number(m[1])).maybeSingle();
    if (!data) return setAlterarErro(`Não há bem nº ${m[1]}.`);
    setAlterarAberto(false);
    setAlterarNum('');
    abrir(data.id);
  }

  function limpar(manterNota = false) {
    if (!manterNota) {
      setChaveNfe(null);
      setArquivoDoc(null);
      setNotaLida(null);
      setAvisoNota(null);
      setPessoaId(null);
      setDocumento('');
      setCompraId(null);
      setCompraNum('');
      setAtivacao(hojeBR());
    }
    setItemNota([]);
    setId(null);
    setAlocado(fid ?? ADM);
    setNumero(null);
    setNome('');
    setCodigo('');
    setDescricao('');
    setMetodo('depreciacao');
    setCategoria([]);
    setAreaId(null);
    setValor('');
    setVida('');
    setResidual('');
    setRateio([{ chave: chave(), centroId: null, perc: '100' }]);
    setSituacao(['ativo']);
    setDataBaixa('');
    setMotivo('');
    setObs('');
    setConsumo('');
    setPrecoLitro('');
    setManutHora('');
    setValorAnterior('');
    setBemCarregado(null);
    setCriarTalhao(false);
    setTalhaoNome('');
    setTalhaoHa('');
    setErros({});
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    if (usaHora && consumo.trim() && (n(consumo) == null || n(consumo)! < 0)) {
      setErros({ consumo: 'Consumo inválido.' });
      return setErro('Consumo inválido.');
    }
    const e: Record<string, string> = {};
    if (!ativacao || !dataValida(ativacao)) e.ativacao = 'Informe a data de ativação.';
    if (!nome.trim()) e.nome = 'Informe o nome do bem.';
    if (!categoria[0]) e.categoria = 'Escolha a categoria.';
    if (formacao) {
      if (valorAnterior.trim() && (n(valorAnterior) == null || n(valorAnterior)! < 0)) e.valor = 'Valor dos gastos anteriores inválido.';
      if (metodo === 'exaustao' && criarTalhao && !areaId && !talhaoNome.trim()) e.talhao = 'Informe o nome do talhão a criar.';
      if (!idUnidade(alocado)) {
        if (metodo === 'exaustao') e.categoria = 'Lavoura em formação precisa estar numa fazenda.';
      }
    } else {
      if (!n(valor) || n(valor)! <= 0) e.valor = 'Informe o valor de aquisição.';
      if (!n(vida) || n(vida)! <= 0) e.vida = `Informe a vida útil em ${unidade}.`;
      if (residual.trim() && (n(residual) == null || n(residual)! < 0 || n(residual)! >= 100)) e.residual = 'De 0 a 99%.';
      if (!rateio.length || rateio.some((x) => !x.centroId)) e.rateio = 'Escolha o centro de custo de cada linha do rateio.';
      else if (new Set(rateio.map((x) => x.centroId)).size !== rateio.length) e.rateio = 'Há centro de custo repetido.';
      else if (Math.abs(somaRateio - 100) > 0.001) e.rateio = `O rateio soma ${formatarNumero(somaRateio, 2)}%: precisa fechar 100%.`;
    }
    if (situacao[0] === 'baixado' && (!dataBaixa || !dataValida(dataBaixa))) e.baixa = 'Informe a data da baixa.';
    if (codigo.trim()) {
      let q = supabase.from('imobilizados').select('numero').ilike('codigo_patrimonial', codigo.trim());
      if (id) q = q.neq('id', id);
      const outro = ((await q.limit(1)).data as any[] | null)?.[0];
      if (outro) e.codigo = `O código ${codigo.trim().toUpperCase()} já é do bem nº ${outro.numero}.`;
    }
    if (!id && notaLida && notaLida.itens.length > 1 && !itemNota[0]) e.itemNota = 'Escolha qual item da nota é este bem.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    setSalvando(true);
    // V152: lavoura em formação sem talhão: cria o talhão agora, para as atividades já irem para a formação
    let areaFinal = areaId;
    if (formacao && metodo === 'exaustao' && criarTalhao && !areaId) {
      const { data: na, error: ea } = await supabase
        .from('areas')
        .insert({ fazenda_id: idUnidade(alocado), tipo: categoria[0] === 'pastagem' ? 'manga' : 'talhao', nome: talhaoNome.trim(), area_ha: n(talhaoHa), ativa: true })
        .select('id')
        .single();
      if (ea) {
        setSalvando(false);
        return setErro(`O talhão não foi criado: ${traduzirErro(ea)}`);
      }
      areaFinal = (na as any).id;
      setAreaId(areaFinal);
      setCriarTalhao(false);
    }
    const { data: r, error } = await supabase.rpc('salvar_imobilizado', {
      p: {
        id,
        fazenda_id: idUnidade(alocado),
        codigo_patrimonial: codigo.trim() || null, // em branco: o banco cria o automático (sigla + sequência)
        nome,
        descricao,
        metodo,
        categoria: categoria[0],
        valor_aquisicao: formacao ? 0 : n(valor),
        formacao_valor_anterior: formacao ? n(valorAnterior) ?? 0 : null,
        data_ativacao: ativIso,
        vida_util: n(vida),
        vida_unidade: unidade,
        residual_perc: n(residual) ?? 0,
        pessoa_id: pessoaId,
        documento,
        compra_id: compraId,
        area_id: areaFinal,
        situacao: situacao[0],
        data_baixa: situacao[0] === 'baixado' ? paraBanco(dataBaixa) : null,
        motivo_baixa: situacao[0] === 'baixado' ? motivo : null,
        observacoes: obs,
        chave_nfe: chaveNfe,
        arquivo_documento: arquivoDoc,
        item_nota: !id && notaLida ? (itemNota[0] === TODOS || !notaLida.itens.length ? -1 : itemNota[0] != null ? Number(itemNota[0]) : null) : null,
        rateio: formacao ? [] : rateio.map((x) => ({ centro_custo_id: x.centroId, percentual: n(x.perc) })),
      },
    });
    if (!error && (r as any)?.id && !formacao) {
      // custo por hora de uso: fica no cadastro do bem (só para as categorias que trabalham por hora)
      const { error: e2 } = await supabase
        .from('imobilizados')
        .update(usaHora ? { consumo_l_hora: n(consumo), preco_litro: n(precoLitro), manutencao_hora: n(manutHora) } : { consumo_l_hora: null, preco_litro: null, manutencao_hora: null })
        .eq('id', (r as any).id);
      if (e2) {
        setSalvando(false);
        return setErro(`O bem foi gravado, mas o custo por hora não: ${traduzirErro(e2)}`);
      }
    }
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    // nota com vários bens: mantém a nota para cadastrar o próximo item
    const idx = itemNota[0] != null && itemNota[0] !== TODOS ? Number(itemNota[0]) : null;
    const nota = !id && notaLida && idx != null ? { ...notaLida, usados: [...notaLida.usados, idx] } : null;
    const faltam = nota ? nota.itens.length - nota.usados.length : 0;
    if (id && voltarDaConsulta(navegacao, params?.abrirId, false)) return;
    const rr = r as any;
    if (formacao) {
      setAviso(
        `Bem nº ${rr.numero}${rr.codigo ? ` (${rr.codigo})` : ''} – ${nome.trim()} ${id ? 'alterado' : 'cadastrado EM FORMAÇÃO'}. ` +
          `Centro de custo da formação: ${rr.centro ?? '–'}. Escolha esse centro nas Compras, Despesas, Contas a pagar, Abastecimentos e Transferências` +
          `${metodo === 'exaustao' && areaFinal ? '; as Atividades no talhão já vão sozinhas para ele' : ''}. Quando começar a operar, abra o bem e informe a data de início da operação.`,
      );
      limpar();
      proximoNumero();
      return;
    }
    setAviso(`Bem nº ${(r as any).numero} (${nome.trim()}) ${id ? 'alterado' : 'cadastrado'}.${faltam > 0 ? ` A nota ainda tem ${faltam} ${faltam === 1 ? 'item' : 'itens'}: escolha o próximo abaixo.` : ''}`);
    if (nota && faltam > 0) {
      limpar(true);
      setNotaLida(nota);
      setAvisoNota(null);
    } else limpar();
    proximoNumero();
  }

  function excluir() {
    Alert.alert('Excluir bem', `Excluir o bem nº ${numero}? Se ele foi vendido ou sucateado, prefira dar baixa.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('imobilizados').delete().eq('id', id!);
          if (error) return setErro(traduzirErro(error));
          if (voltarDaConsulta(navegacao, params?.abrirId, true)) return;
          setAviso(`Bem nº ${numero} excluído.`);
          limpar();
          proximoNumero();
        },
      },
    ]);
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaImobilizado />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {!id && (
        <Escolha
          rotulo="Situação do bem *"
          opcoes={[
            { valor: 'ativo', rotulo: 'Pronto, já em uso' },
            { valor: 'formacao', rotulo: 'Em formação (lavoura, curral, barragem, estrada, casa, galpão…)' },
          ]}
          valor={situacao}
          aoMudar={(v) => {
            setSituacao(v);
            if (v[0] === 'formacao' && categoria[0] && !CATEGORIAS_FORMACAO.includes(categoria[0])) setCategoria([]);
          }}
        />
      )}
      {!id && formacao && (
        <Text style={estilos.nota}>
          O bem já nasce com o código e com um centro de custo próprio, dentro de IMOBILIZADO EM FORMAÇÃO da fazenda. Tudo o que for lançado nesse centro (insumos, mão de obra, máquinas,
          serviços, combustível, depreciação de outros bens) forma o custo do bem. Na data de início da operação o bem é ativado com esse custo e começa a {metodo === 'exaustao' ? 'exaustão' : 'depreciação'}.
        </Text>
      )}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Bem nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo={formacao ? 'Início da formação *' : 'Data de ativação *'} valor={ativacao} aoMudar={setAtivacao} erro={erros.ativacao} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={() => limpar()}>
          Sair deste bem e cadastrar outro
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar o bem nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar um bem já cadastrado
        </Text>
      )}

      {!id && !formacao && (
        <EntradaDocumento
          titulo="Entrada pela nota fiscal do bem"
          tipo="bem"
          rotuloFoto="Foto da nota"
          instrucao="Enquadre o DANFE inteiro, com boa luz. A descrição do produto (modelo, série, chassi) precisa aparecer."
          dica={notaLida ? 'Leu outra nota por engano? Toque de novo para substituir.' : 'Tem o XML (vem no e-mail do fornecedor)? É exato e não gasta a IA. Sem ele, a foto do DANFE resolve.'}
          aoLer={aoLerNota}
          aoXml={aoLerXml}
          aoErro={setErro}
        />
      )}
      {avisoNota && <Aviso tipo="info" texto={avisoNota} />}
      {!id && notaLida && notaLida.itens.length > 1 && (
        <Escolha
          rotulo="Qual item da nota é este bem? *"
          opcoes={[
            ...notaLida.itens
              .map((it, k) => ({ valor: String(k), rotulo: `${notaLida.usados.includes(k) ? '✓ ' : ''}${it.nome_sugerido || it.descricao}${it.valor_total ? ` · ${formatarMoeda(it.valor_total)}` : ''}` })),
            ...(notaLida.usados.length ? [] : [{ valor: TODOS, rotulo: 'Nota inteira (um bem só)' }]),
          ]}
          valor={itemNota}
          aoMudar={(v) => aplicarItem(notaLida, v[0])}
          erro={erros.itemNota}
        />
      )}
      {id && arquivoDoc && (
        <Text
          style={estilos.link}
          onPress={async () => {
            if (!(await abrirFotoDocumento(arquivoDoc))) setErro('Não foi possível abrir a foto da nota.');
          }}
        >
          📷 Ver a foto da nota
        </Text>
      )}

      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Veio de uma compra? Nº da compra" value={compraNum} onChangeText={(t) => setCompraNum(t.replace(/\D/g, ''))} keyboardType="number-pad" />
        </View>
        <View style={{ width: 110, paddingTop: 26 }}>
          <Botao titulo="Puxar" tipo="secundario" onPress={puxarCompra} />
        </View>
      </View>

      {id ? (
        <Text style={estilos.nota}>Alocado em: {nomeUnidade(idUnidade(alocado), fazendas)}. Para levar a outra fazenda, use "Transferir para outra fazenda", mais abaixo.</Text>
      ) : (
        <Escolha
          rotulo="Onde o bem fica (alocado em) *"
          opcoes={opcoesUnidade(fazendas)}
          valor={[alocado]}
          aoMudar={(v) => {
            if (v[0] !== alocado) {
              setRateio([]);
              setAreaId(null);
            }
            setAlocado(v[0]);
          }}
        />
      )}
      <Campo rotulo="Nome do bem *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder="Ex.: Trator John Deere 6100J, Café Conilon – Talhão 02" erro={erros.nome} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo
            rotulo="Código patrimonial"
            value={codigo}
            onChangeText={setCodigo}
            autoCapitalize="characters"
            placeholder={codigoAuto ? `Automático: ${codigoAuto}` : 'Automático (sigla da fazenda + nº)'}
            erro={erros.codigo}
          />
        </View>
      </View>
      <Text style={estilos.nota}>
        {id
          ? 'O código acompanha o bem para sempre, mesmo se for transferido para outra fazenda. Pode ser trocado digitando outro.'
          : 'Em branco, o sistema cria o código com a sigla da fazenda e o próximo número (ex.: TI 001). Se usa outro critério, digite o seu.'}
      </Text>
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} autoCapitalize="sentences" placeholder="Modelo, série, chassi, área…" />

      <Secao titulo="Tipo de ativo" />
      <Escolha
        opcoes={[
          { valor: 'depreciacao', rotulo: 'Depreciação (máquinas, benfeitorias)' },
          { valor: 'exaustao', rotulo: 'Exaustão (lavoura perene)' },
        ]}
        valor={[metodo]}
        aoMudar={(v) => mudarMetodo(v[0] as Metodo)}
      />
      <Escolha rotulo="Categoria *" opcoes={CATEGORIAS_IMOB.filter((c) => c.metodo === metodo && (!formacao || CATEGORIAS_FORMACAO.includes(c.valor))).map((c) => ({ valor: c.valor, rotulo: c.rotulo }))} valor={categoria} aoMudar={mudarCategoria} erro={erros.categoria} />
      {metodo === 'exaustao' && <SeletorLista rotulo="Talhão / área" valorId={areaId} aoMudar={setAreaId} carregar={carregarAreas} permitirLimpar vazio="Nenhuma área cadastrada." />}
      {formacao && metodo === 'exaustao' && !areaId && (
        <>
          <Interruptor
            rotulo={categoria[0] === 'pastagem' ? 'Criar a manga agora' : 'Criar o talhão agora'}
            descricao="Recomendado: com o talhão criado, as Atividades lançadas nele (adubação, plantio, defensivos…) vão sozinhas para o custo da formação. Sem ele, o talhão é criado ao concluir a formação."
            valor={criarTalhao}
            aoMudar={setCriarTalhao}
          />
          {criarTalhao && (
            <View style={estilos.linha}>
              <View style={{ flex: 1.4 }}>
                <Campo rotulo={categoria[0] === 'pastagem' ? 'Nome da manga *' : 'Nome do talhão *'} value={talhaoNome} onChangeText={setTalhaoNome} autoCapitalize="sentences" placeholder="Ex.: Talhão Vanessa" erro={erros.talhao} />
              </View>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Área (ha)" value={talhaoHa} onChangeText={setTalhaoHa} keyboardType="decimal-pad" />
              </View>
            </View>
          )}
        </>
      )}

      {formacao ? (
        <>
          <Secao titulo="Custo da formação" />
          <CampoMoeda
            rotulo="Gastos anteriores ao sistema (R$)"
            valor={valorAnterior}
            aoMudar={setValorAnterior}
            erro={erros.valor}
            ajuda="Só o que já foi gasto na formação antes de começar a lançar no sistema (ex.: mudas, preparo do solo). O resto o sistema soma sozinho pelo centro de custo."
          />
        </>
      ) : (
      <>
      <Secao titulo="Valores" />
      <CampoMoeda rotulo="Valor de aquisição / formação (R$) *" valor={valor} aoMudar={setValor} erro={erros.valor} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo={`Vida útil (${unidade}) *`} value={vida} onChangeText={setVida} keyboardType="decimal-pad" erro={erros.vida} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Valor residual %" value={residual} onChangeText={setResidual} keyboardType="decimal-pad" placeholder="Ex.: 10" erro={erros.residual} />
        </View>
      </View>
      {calc && (
        <View style={estilos.calc}>
          <Linha2 a={`${metodo === 'exaustao' ? 'Exaustão' : 'Depreciação'} mensal`} b={formatarMoeda(calc.mensal)} forte />
          <Linha2 a="Valor a depreciar (sem o residual)" b={formatarMoeda(calc.base)} />
          <Linha2 a={`Acumulado até hoje (${calc.decorridos} de ${calc.meses} meses)`} b={formatarMoeda(calc.acumulado)} />
          <Linha2 a="Valor contábil hoje" b={formatarMoeda(calc.contabil)} forte />
          <Linha2 a="Termina em" b={textoMes(calc.fim)} />
          {metodo === 'exaustao' && <Text style={estilos.nota}>Exaustão linear: 1 safra = 12 meses.</Text>}
        </View>
      )}
      </>
      )}

      {usaHora && !formacao && (
        <>
          <Secao titulo="Custo por hora de uso" />
          <Text style={estilos.nota}>Vai para o custo do talhão em Agrícola › Atividades (horas de máquina x custo por hora). A depreciação não entra aqui: ela continua pelo rateio mensal abaixo.</Text>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Consumo (litros/hora)" value={consumo} onChangeText={setConsumo} keyboardType="decimal-pad" placeholder="Ex.: 8" erro={erros.consumo} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Preço do litro (R$)" valor={precoLitro} aoMudar={setPrecoLitro} />
            </View>
          </View>
          <CampoMoeda rotulo="Manutenção por hora (R$)" valor={manutHora} aoMudar={setManutHora} ajuda="Peças, pneus, óleo e oficina: o gasto do ano dividido pelas horas trabalhadas no ano." />
          <View style={estilos.calc}>
            <Linha2 a="Custo por hora de uso" b={custoHora != null ? formatarMoeda(custoHora) : 'não informado'} forte />
            {custoHora == null && <Text style={estilos.nota}>Em branco: o uso deste bem não entra no custo das atividades.</Text>}
          </View>
        </>
      )}

      {!formacao && (
      <>
      <Secao titulo="Rateio mensal por centro de custo *" />
      {rateio.map((x) => (
        <View key={x.chave} style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <SeletorLista rotulo="Centro de custo" valorId={x.centroId} aoMudar={(v) => setRateio((l) => l.map((y) => (y.chave === x.chave ? { ...y, centroId: v } : y)))} carregar={carregarCentros} vazio="Nenhum centro de custo. Cadastre em Financeiro › Centros de custo." />
          </View>
          <View style={{ width: 80 }}>
            <Campo rotulo="%" value={x.perc} onChangeText={(t) => setRateio((l) => l.map((y) => (y.chave === x.chave ? { ...y, perc: t } : y)))} keyboardType="decimal-pad" />
          </View>
          {rateio.length > 1 && (
            <Pressable onPress={() => setRateio((l) => l.filter((y) => y.chave !== x.chave))} hitSlop={8} style={{ paddingTop: 26 }} accessibilityLabel="Tirar centro">
              <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
            </Pressable>
          )}
        </View>
      ))}
      <View style={estilos.linhaEntre}>
        <Text style={estilos.link} onPress={() => setRateio((l) => [...l, { chave: chave(), centroId: null, perc: numeroParaCampo(Math.max(0, Math.round((100 - somaRateio) * 100) / 100)) }])}>
          + Centro de custo
        </Text>
        <Text style={[estilos.soma, Math.abs(somaRateio - 100) > 0.001 && { color: cores.erro }]}>
          Soma {formatarNumero(somaRateio, 2)}%{calc ? ` · ${formatarMoeda(calc.mensal)}/mês` : ''}
        </Text>
      </View>
      {erros.rateio && <Text style={estilos.erro}>{erros.rateio}</Text>}
      </>
      )}

      <Secao titulo="Origem" />
      <CampoPessoaBusca rotulo="Fornecedor" valorId={pessoaId} aoMudar={setPessoaId} tipoNovo="fornecedor" />
      <Campo rotulo="Nota fiscal / documento" value={documento} onChangeText={setDocumento} autoCapitalize="characters" />

      {id && bemCarregado && (formacao || bemCarregado.operacao_inicio) && (
        <PainelFormacao
          bem={bemCarregado}
          aoMudar={(texto) => {
            abrir(id);
            setAviso(texto);
          }}
          aoErro={setErro}
        />
      )}
      {id && !formacao && (
        <>
          <Secao titulo="Situação" />
          <Escolha
            opcoes={[
              { valor: 'ativo', rotulo: 'Em uso' },
              { valor: 'baixado', rotulo: 'Baixado (vendido, sucateado, erradicado)' },
            ]}
            valor={situacao}
            aoMudar={setSituacao}
          />
          {situacao[0] === 'baixado' && (
            <>
              <CampoData rotulo="Data da baixa *" valor={dataBaixa} aoMudar={setDataBaixa} erro={erros.baixa} />
              <Campo rotulo="Motivo" value={motivo} onChangeText={setMotivo} autoCapitalize="sentences" />
            </>
          )}
          {situacao[0] === 'ativo' && (
            <TransferirBem
              id={id}
              atual={idUnidade(alocado)}
              aoTransferir={(texto) => {
                abrir(id);
                setAviso(texto);
              }}
            />
          )}
        </>
      )}
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={id ? 'Salvar alterações' : formacao ? 'Cadastrar bem em formação' : 'Cadastrar bem'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir bem" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

/**
 * Transferência do bem entre fazendas (ou para a Administração): o bem e o valor continuam do Grupo;
 * muda só onde ele está alocado e, daí em diante, o centro de custo que recebe a depreciação e o custo de uso.
 */
function TransferirBem({ id, atual, aoTransferir }: { id: string; atual: string | null; aoTransferir: (aviso: string) => void }) {
  const { fazendas } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [para, setPara] = useState<string[]>([]);
  const [data, setData] = useState(hojeBR());
  const [centroId, setCentroId] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const destino = para[0] ? idUnidade(para[0]) : undefined;

  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    if (destino === undefined) return [];
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, destino)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [destino]);

  async function transferir() {
    setErro(null);
    if (destino === undefined) return setErro('Escolha para onde o bem vai.');
    if (!dataValida(data)) return setErro('Data da transferência inválida.');
    setSalvando(true);
    // V152: registra também em Mais › Transferências (o código patrimonial vai junto)
    const { error } = await supabase.rpc('transferir_bem', { p: { id, para_fazenda_id: destino, data: paraBanco(data), centro_custo_id: centroId, observacoes: obs } });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setAberto(false);
    setPara([]);
    setCentroId(null);
    setObs('');
    aoTransferir(`Bem transferido para ${nomeUnidade(destino, fazendas)} em ${data}. A depreciação e o custo de uso passam a ir para lá.`);
  }

  if (!aberto) return <Botao titulo="Transferir para outra fazenda" tipo="secundario" onPress={() => setAberto(true)} />;
  return (
    <View style={{ gap: 10, backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12 }}>
      <Text style={{ fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura }}>Transferir o bem</Text>
      <Text style={estilos.nota}>O bem continua do Grupo, com o mesmo valor: não gera conta a pagar nem a receber. Muda só onde ele fica e quem recebe a depreciação.</Text>
      <Escolha
        rotulo="Para onde vai *"
        opcoes={opcoesUnidade(fazendas).filter((o) => idUnidade(o.valor) !== atual)}
        valor={para}
        aoMudar={(v) => {
          setPara(v);
          setCentroId(null);
        }}
      />
      <CampoData rotulo="Data da transferência *" valor={data} aoMudar={setData} />
      {destino !== undefined && (
        <SeletorLista rotulo="Centro de custo no destino" valorId={centroId} aoMudar={setCentroId} carregar={carregarCentros} permitirLimpar vazio="Nenhum centro de custo neste lugar. Cadastre em Financeiro › Centros de custo." />
      )}
      <Text style={estilos.nota}>Sem escolher, vai para o centro principal do destino.</Text>
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Botao titulo="Transferir" onPress={transferir} carregando={salvando} />
      <Botao titulo="Cancelar" tipo="texto" onPress={() => setAberto(false)} />
    </View>
  );
}

function Linha2({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.calcRotulo, forte && { fontWeight: '700', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.calcValor, forte && { color: cores.primariaEscura }]}>{b}</Text>
    </View>
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
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  soma: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  calc: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  calcRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  calcValor: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
});
