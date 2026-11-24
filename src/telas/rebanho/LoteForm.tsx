import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import CampoNascimento, { NASCIMENTO_FAIXA, lerNascimento, nascimentoDoBanco, type ValorNascimento } from '../../componentes/CampoNascimento';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { CampoFerro, CampoRaca } from '../../componentes/CamposApoio';
import SiglaFazenda from '../../componentes/SiglaFazenda';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import { saldoDe, textoSaldo } from '../../lib/insumos';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaLotes from './ConsultaLotes';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { CATEGORIAS, SEXOS, codigoLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { FINALIDADES, LINHA_VAZIA, MAX_INDIVIDUAL, SEM_LOTE, type LinhaIndividual } from '../../lib/lotes';
import GradeIndividual, { type Dica, type GrupoGrade } from './GradeIndividual';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const ORIGENS = [
  { valor: 'compra', rotulo: 'Compra' },
  { valor: 'parceria', rotulo: 'Parceria' },
  { valor: 'cria', rotulo: 'Cria' },
  { valor: 'outros_lotes', rotulo: 'De outro lote' },
  { valor: 'outra', rotulo: 'Outra' },
];
const SIM_NAO = [
  { valor: 'nao', rotulo: 'Não' },
  { valor: 'sim', rotulo: 'Sim' },
];

/** V200 · Origem do lote formado de outros lotes (ou do rebanho individual, sem lote). */
type Fonte = { chave: string; loteId: string | null; qtd: string };
type ItemFonte = ItemLista & { saldo: number };
type AnimalLote = { id: string; numero_interno: number; brinco: string | null; ferro_id: string | null; peso_atual_kg: number | null };
let seqFonte = 1;
const novaFonte = (): Fonte => ({ chave: `f${seqFonte++}`, loteId: null, qtd: '' });
const intervalo = (n: number) => Array.from({ length: Math.max(0, Math.min(n, MAX_INDIVIDUAL)) }, (_, i) => i);
const PARCERIAS = [
  { valor: 'apascentamento', rotulo: 'Apascentamento' },
  { valor: 'engorda', rotulo: 'Engorda' },
];
const ESCORES = ['1', '2', '3', '4', '5'].map((v) => ({ valor: v, rotulo: v }));

/** Número com até 2 casas para pôr no campo ("412,35"). */
const paraCampo = (n: number) => numeroParaCampo(Math.round(n * 100) / 100);
const numOuNulo = (t: string) => lerNumero(t);

type Composicao = { categoria: string | null; racaId: string | null; ferroId: string | null; nascIso: string | null; nascAprox: boolean };

export default function LoteForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'LoteForm'>>();
  const id = params?.id;
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla, carregada: carregadaSigla } = useSigla(fid);

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [numero, setNumero] = useState<number | null>(null);
  const [descricao, setDescricao] = useState('');
  const [sexo, setSexo] = useState<string[]>([]);
  const [categoria, setCategoria] = useState<string[]>([]);
  const [quantidade, setQuantidade] = useState('');
  const [racaId, setRacaId] = useState<string | null>(null);
  const [ferroId, setFerroId] = useState<string | null>(null);
  const [nasc, setNasc] = useState<ValorNascimento>(NASCIMENTO_FAIXA);
  const [mangaId, setMangaId] = useState<string | null>(null);
  const [proprietario, setProprietario] = useState<string[]>(['proprio']);
  const [donoId, setDonoId] = useState<string | null>(null);
  const [abertura, setAbertura] = useState(hojeBR());
  const [situacao, setSituacao] = useState<string[]>(['ativo']);
  const [obs, setObs] = useState('');
  const [proximoNumero, setProximoNumero] = useState<number | null>(null);
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);
  const [origem, setOrigem] = useState<string[]>([]);
  const [parceria, setParceria] = useState<string[]>([]);
  const [origemOutra, setOrigemOutra] = useState('');
  const [percCriador, setPercCriador] = useState('');
  const [percParceiro, setPercParceiro] = useState('');
  const [pesoIniTotal, setPesoIniTotal] = useState('');
  const [pesoIniMedio, setPesoIniMedio] = useState('');
  const [ecc, setEcc] = useState<string[]>([]);
  const [pesoParData, setPesoParData] = useState('');
  const [pesoParTotal, setPesoParTotal] = useState('');
  const [pesoParMedio, setPesoParMedio] = useState('');
  const [engPercArrobas, setEngPercArrobas] = useState('');
  const [alugPasto, setAlugPasto] = useState('');
  const [alugSuplemento, setAlugSuplemento] = useState('');
  const [mineralId, setMineralId] = useState<string | null>(null);
  const [mineralKg, setMineralKg] = useState('');
  const [alimentarId, setAlimentarId] = useState<string | null>(null);
  const [alimentarKg, setAlimentarKg] = useState('');
  const [finalidade, setFinalidade] = useState<string[]>([]);
  const [finalidadeOutra, setFinalidadeOutra] = useState('');
  const [individual, setIndividual] = useState<string[]>(['nao']);
  const [fontes, setFontes] = useState<Fonte[]>(() => [novaFonte()]);
  const [itensFonte, setItensFonte] = useState<ItemFonte[]>([]);
  const [dados, setDados] = useState<Record<string, LinhaIndividual>>({});
  const [dicas, setDicas] = useState<Record<string, Dica>>({});
  const [pesoMexido, setPesoMexido] = useState(false);
  const [ferros, setFerros] = useState<ItemLista[]>([]);
  const [animaisLote, setAnimaisLote] = useState<AnimalLote[] | null>(null);
  const [dataPeso, setDataPeso] = useState(hojeBR());
  const [original, setOriginal] = useState<Composicao | null>(null);
  const [cabecas, setCabecas] = useState(0);
  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const baseIso = paraBanco(abertura) ?? hojeBanco();

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? (numero ? codigoLote(numero, sigla) : 'Lote') : 'Lotes' });
  }, [navegacao, id, numero, sigla]);

  // Número que o novo lote vai receber (o banco confirma ao gravar).
  useEffect(() => {
    if (id || !fid) return;
    supabase
      .from('lotes')
      .select('numero')
      .eq('fazenda_id', fid)
      .order('numero', { ascending: false })
      .limit(1)
      .then(({ data: d }) => setProximoNumero(((d?.[0]?.numero as number) ?? 0) + 1));
  }, [id, fid]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('lotes')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setErro(traduzirErro(error));
        else if (data) {
          const base = data.data_abertura ?? hojeBanco();
          setNumero(data.numero);
          setDescricao(data.descricao ?? '');
          setSexo(data.sexo ? [data.sexo.trim()] : []);
          setCategoria(data.categoria ? [data.categoria] : []);
          setRacaId(data.raca_id);
          setFerroId(data.ferro_id);
          setNasc(nascimentoDoBanco(data.nascimento_ref, data.nascimento_aproximado, base));
          setMangaId(data.manga_id);
          setProprietario([data.proprietario]);
          setDonoId(data.pessoa_terceiro_id);
          setAbertura(doBanco(data.data_abertura));
          setSituacao([data.situacao]);
          setObs(data.observacoes ?? '');
          setOrigem(data.origem ? [data.origem] : []);
          setParceria(data.origem_parceria ? [data.origem_parceria] : []);
          setOrigemOutra(data.origem_outra ?? '');
          setPercCriador(numeroParaCampo(data.perc_criador));
          setPercParceiro(numeroParaCampo(data.perc_parceiro));
          setPesoIniTotal(numeroParaCampo(data.peso_inicial_total));
          setPesoIniMedio(numeroParaCampo(data.peso_inicial_medio));
          setEcc(data.ecc != null ? [String(data.ecc)] : []);
          setPesoParData(data.peso_parcial_data ? doBanco(data.peso_parcial_data) : '');
          setPesoParTotal(numeroParaCampo(data.peso_parcial_total));
          setPesoParMedio(numeroParaCampo(data.peso_parcial_medio));
          setEngPercArrobas(numeroParaCampo(data.engorda_perc_arrobas));
          setAlugPasto(moedaParaCampo(data.aluguel_pasto_cab_dia));
          setAlugSuplemento(moedaParaCampo(data.aluguel_suplemento_cab_dia));
          setMineralId(data.mineral_insumo_id);
          setMineralKg(numeroParaCampo(data.mineral_kg_cab_dia));
          setAlimentarId(data.alimentar_insumo_id);
          setAlimentarKg(numeroParaCampo(data.alimentar_kg_cab_dia));
          setFinalidade(data.finalidade ? [data.finalidade] : []);
          setFinalidadeOutra(data.finalidade_outra ?? '');
          setIndividual([data.controle_individual ? 'sim' : 'nao']);
          setOriginal({
            categoria: data.categoria,
            racaId: data.raca_id,
            ferroId: data.ferro_id,
            nascIso: data.nascimento_ref,
            nascAprox: data.nascimento_aproximado,
          });
        }
        setCarregando(false);
      });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      supabase
        .from('animais')
        .select('id', { count: 'exact', head: true })
        .eq('lote_id', id)
        .eq('situacao', 'ativo')
        .then(({ count }) => setCabecas(count ?? 0));
    }, [id]),
  );

  const outrosLotes = origem[0] === 'outros_lotes';
  const ind = individual[0] === 'sim';
  const sexoLote = sexo[0] === 'M' || sexo[0] === 'F' ? (sexo[0] as 'M' | 'F') : null;

  // Ferros (uma vez só, para a grade individual).
  useEffect(() => {
    if (!ind || ferros.length) return;
    supabase
      .from('ferros')
      .select('id, descricao, proprio, pessoas ( nome )')
      .order('proprio', { ascending: false })
      .order('descricao')
      .then(({ data: d }) =>
        setFerros(
          (d ?? []).map((x: any) => {
            const dono = Array.isArray(x.pessoas) ? x.pessoas[0] : x.pessoas;
            return { id: x.id, titulo: x.descricao, detalhe: x.proprio ? 'Ferro próprio' : `De ${dono?.nome ?? 'terceiro'}` };
          }),
        ),
      );
  }, [ind, ferros.length]);

  // Origens possíveis (lotes ativos do mesmo sexo, com saldo, e o rebanho individual sem lote).
  useEffect(() => {
    if (id || !outrosLotes || !fid || !sexoLote) return setItensFonte([]);
    let vivo = true;
    (async () => {
      const lotes = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao').eq('fazenda_id', fid).eq('situacao', 'ativo').order('numero'));
      const anim = await consulta<any[]>(supabase.from('animais').select('lote_id').eq('fazenda_id', fid).eq('situacao', 'ativo').eq('sexo', sexoLote).limit(20000));
      const cont: Record<string, number> = {};
      for (const a of anim) cont[a.lote_id ?? SEM_LOTE] = (cont[a.lote_id ?? SEM_LOTE] ?? 0) + 1;
      const itens: ItemFonte[] = lotes
        .filter((l) => (cont[l.id] ?? 0) > 0)
        .map((l) => ({ id: l.id, titulo: codigoLote(l.numero, sigla) + (l.descricao ? ` – ${l.descricao}` : ''), detalhe: `${formatarNumero(cont[l.id])} ${sexoLote === 'M' ? 'machos' : 'fêmeas'}`, saldo: cont[l.id] }));
      if (cont[SEM_LOTE]) itens.push({ id: SEM_LOTE, titulo: 'Rebanho individual (sem lote)', detalhe: `${formatarNumero(cont[SEM_LOTE])} ${sexoLote === 'M' ? 'machos' : 'fêmeas'} · pelo brinco`, saldo: cont[SEM_LOTE] });
      if (vivo) setItensFonte(itens);
    })().catch((e) => vivo && setErro(traduzirErro(e)));
    return () => {
      vivo = false;
    };
  }, [id, outrosLotes, fid, sexoLote, sigla]);
  const carregarFontes = useCallback(async (): Promise<ItemLista[]> => itensFonte, [itensFonte]);

  // Do rebanho individual só vêm animais identificados: liga o controle individual sozinho.
  useEffect(() => {
    if (!id && outrosLotes && fontes.some((f) => f.loteId === SEM_LOTE) && !ind) setIndividual(['sim']);
  }, [id, outrosLotes, fontes, ind]);

  // Edição com controle individual: os animais do lote.
  useEffect(() => {
    if (!id || !ind) return;
    supabase
      .from('animais')
      .select('id, numero_interno, brinco, ferro_id, peso_atual_kg')
      .eq('lote_id', id)
      .eq('situacao', 'ativo')
      .order('numero_interno')
      .limit(MAX_INDIVIDUAL)
      .then(({ data: d, error: e }) => {
        if (e) return setErro(traduzirErro(e));
        const lista = (d ?? []) as AnimalLote[];
        setAnimaisLote(lista);
        setDados((ant) => {
          const novo = { ...ant };
          for (const a of lista) if (!novo[a.id]) novo[a.id] = { brinco: a.brinco ?? '', ferroId: a.ferro_id, peso: numeroParaCampo(a.peso_atual_kg) };
          return novo;
        });
      });
  }, [id, ind, cabecas]);

  const qtdFontes = fontes.reduce((s, f) => s + (Number(f.qtd) || 0), 0);
  const qtdNova = outrosLotes ? qtdFontes : Number(quantidade || 0);

  // Linhas da grade: no cadastro, uma por cabeça (por origem, quando vem de outros lotes); na edição, os animais do lote.
  const grupos: GrupoGrade[] = useMemo(() => {
    const linha = (chave: string, rotulo: string) => ({ chave, rotulo, valor: dados[chave] ?? LINHA_VAZIA, dica: dicas[chave] ?? null });
    if (id) return [{ chave: 'e', linhas: (animaisLote ?? []).map((a) => linha(a.id, `nº ${a.numero_interno}`)) }];
    if (!outrosLotes) return [{ chave: 'n', linhas: intervalo(qtdNova).map((i) => linha(`n|${i}`, String(i + 1))) }];
    let ord = 0;
    return fontes
      .filter((f) => f.loteId && Number(f.qtd) > 0)
      .map((f) => ({
        chave: f.chave,
        titulo: `${itensFonte.find((x) => x.id === f.loteId)?.titulo ?? 'Origem'} · ${formatarNumero(Number(f.qtd))} cab.`,
        linhas: intervalo(Number(f.qtd)).map((i) => linha(`${f.chave}|${i}`, String(++ord))),
      }));
  }, [id, animaisLote, outrosLotes, qtdNova, fontes, itensFonte, dados, dicas]);
  const linhasGrade = useMemo(() => grupos.flatMap((g) => g.linhas), [grupos]);

  const mudarLinha = useCallback((chave: string, v: LinhaIndividual) => {
    setDados((ant) => {
      if ((ant[chave]?.peso ?? '') !== v.peso) setPesoMexido(true);
      return { ...ant, [chave]: v };
    });
    if ((v.brinco ?? '') === '') setDicas((ant) => (ant[chave] ? { ...ant, [chave]: undefined as any } : ant));
  }, []);

  // Pesos individuais → Peso Bruto (Inicial no cadastro, Parcial na edição): médio dos pesados; total = médio × cabeças.
  const resumoPesos = useMemo(() => {
    const pesos = linhasGrade.map((l) => lerNumero(l.valor.peso)).filter((n): n is number => n != null && n > 0);
    if (!pesos.length) return null;
    const medio = pesos.reduce((s, n) => s + n, 0) / pesos.length;
    return { pesados: pesos.length, medio };
  }, [linhasGrade]);
  useEffect(() => {
    if (!ind || !pesoMexido || !resumoPesos) return;
    const cab = id ? cabecas : qtdNova;
    const total = resumoPesos.medio * (cab || resumoPesos.pesados);
    if (id) {
      setPesoParData(dataPeso);
      setPesoParMedio(paraCampo(resumoPesos.medio));
      setPesoParTotal(paraCampo(total));
    } else {
      setPesoIniMedio(paraCampo(resumoPesos.medio));
      setPesoIniTotal(paraCampo(total));
    }
  }, [ind, pesoMexido, resumoPesos, id, cabecas, qtdNova, dataPeso]);

  // Ao sair do brinco: diz onde está o animal (ou se é brinco novo).
  const verificarBrinco = useCallback(
    async (chave: string, brinco: string) => {
      const b = brinco.trim();
      if (!b || !fid) return;
      const { data: achados } = await supabase
        .from('animais')
        .select('id, lote_id, sexo, lote:lotes!animais_lote_id_fkey ( numero )')
        .eq('fazenda_id', fid)
        .eq('situacao', 'ativo')
        .ilike('brinco', b.replace(/[%_]/g, ''))
        .limit(1);
      const a: any = achados?.[0];
      const ondeEsta = a ? (a.lote_id ? `no lote ${codigoLote((Array.isArray(a.lote) ? a.lote[0] : a.lote)?.numero, sigla)}` : 'sem lote') : '';
      let dica: Dica | null = null;
      if (id) {
        if (a && a.id !== chave) dica = { tipo: 'erro', texto: `Brinco já é de outro animal (${ondeEsta}).` };
      } else if (!outrosLotes) {
        if (a) dica = { tipo: 'erro', texto: `Brinco já é de outro animal (${ondeEsta}).` };
      } else {
        const fonte = fontes.find((f) => chave.startsWith(`${f.chave}|`));
        const loteFonte = fonte?.loteId === SEM_LOTE ? null : fonte?.loteId ?? null;
        if (a && a.sexo !== sexoLote) dica = { tipo: 'erro', texto: `Este brinco é de ${a.sexo === 'M' ? 'macho' : 'fêmea'} (${ondeEsta}).` };
        else if (a && (a.lote_id ?? null) === loteFonte) dica = { tipo: 'ok', texto: `✓ ${ondeEsta === 'sem lote' ? 'Animal sem lote' : 'Está ' + ondeEsta}` };
        else if (a) dica = { tipo: 'erro', texto: `Está ${ondeEsta}. Mude a origem ou o brinco.` };
        else if (fonte?.loteId === SEM_LOTE) dica = { tipo: 'erro', texto: 'Brinco não encontrado no rebanho.' };
        else dica = { tipo: 'aviso', texto: 'Brinco novo: vai para um animal sem brinco deste lote.' };
      }
      setDicas((ant) => ({ ...ant, [chave]: dica as any }));
    },
    [fid, id, outrosLotes, fontes, sexoLote, sigla],
  );

  // ---- listas ----
  const carregarRacas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('racas').select('id, nome').order('nome'));
    return d.map((r) => ({ id: r.id, titulo: r.nome }));
  }, []);
  const carregarFerros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('ferros').select('id, descricao, proprio, pessoas ( nome )').order('proprio', { ascending: false }).order('descricao'));
    return d.map((x) => {
      const dono = Array.isArray(x.pessoas) ? x.pessoas[0] : x.pessoas;
      return { id: x.id, titulo: x.descricao, detalhe: x.proprio ? 'Ferro próprio' : `De ${dono?.nome ?? 'terceiro'}` };
    });
  }, []);
  const carregarMangas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(
      supabase.from('areas').select('id, nome, capim_cultura, capacidade_aguas, capacidade_seca, ativa').eq('fazenda_id', fid!).eq('tipo', 'manga').order('nome'),
    );
    return d.map((a) => ({
      id: a.id,
      titulo: a.nome,
      detalhe:
        [
          a.capim_cultura,
          a.capacidade_aguas != null || a.capacidade_seca != null ? `capacidade ${a.capacidade_aguas != null ? formatarNumero(a.capacidade_aguas, 2) : '–'} águas / ${a.capacidade_seca != null ? formatarNumero(a.capacidade_seca, 2) : '–'} seca (UA/ha)` : null,
        ]
          .filter(Boolean)
          .join(', ') || null,
      oculto: !a.ativa,
    }));
  }, [fid]);

  // ---- estoque (mineral e alimentar) ----
  const buscarNoEstoque = useCallback(
    async (categorias: string[], t: string): Promise<ItemRapido[]> => {
      let q = supabase.from('insumos').select('id, nome, unidade, unidade_dose, conteudo_por_unidade').eq('ativo', true).in('categoria', categorias).order('nome').limit(100);
      if (t) q = q.ilike('nome', `%${t}%`);
      const ins = await consulta<any[]>(q);
      const movs = ins.length && fid
        ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade').eq('fazenda_id', fid).in('insumo_id', ins.map((i) => i.id)))
        : [];
      return ins.map((i) => ({ id: i.id, titulo: i.nome, detalhe: `Estoque ${textoSaldo(saldoDe(movs.filter((m) => m.insumo_id === i.id)), i)}` }));
    },
    [fid],
  );
  const buscarMineral = useCallback((t: string) => buscarNoEstoque(['sal_mineral'], t), [buscarNoEstoque]);
  const buscarAlimentar = useCallback((t: string) => buscarNoEstoque(['racao', 'outro'], t), [buscarNoEstoque]);
  const lerInsumo = useCallback(async (iid: string) => (await supabase.from('insumos').select('nome').eq('id', iid).maybeSingle()).data?.nome ?? null, []);
  const criarInsumo = useCallback(async (categoria: string, nome: string): Promise<ItemRapido> => {
    const d = await consulta<any>(supabase.from('insumos').insert({ nome: nome.trim(), categoria, unidade: 'kg' }).select('id, nome').single());
    return { id: d.id, titulo: d.nome, detalhe: 'Cadastrado agora, sem estoque (entra pelas Compras)' };
  }, []);

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    const terceiro = proprietario[0] === 'terceiro';
    const n = quantidade.trim() ? Number(quantidade) : 0;
    const lido = lerNascimento(nasc, baseIso);
    if (sexo.length === 0) e.sexo = 'Escolha o sexo do lote.';
    if (!id && !outrosLotes && (!Number.isInteger(n) || n < 0 || n > 5000)) e.quantidade = 'Informe um número de 0 a 5.000.';
    if (lido.erro) e.nasc = lido.erro;
    else if (!id && !outrosLotes && n > 0 && !lido.iso) e.nasc = 'Informe a idade: cada cabeça vira um animal, e animal não entra sem idade.';
    if (finalidade[0] === 'outra' && !finalidadeOutra.trim()) e.finalidadeOutra = 'Informe qual é a finalidade.';
    if (!id && outrosLotes) {
      const usados = new Set<string>();
      fontes.forEach((f, i) => {
        const item = itensFonte.find((x) => x.id === f.loteId);
        const q = Number(f.qtd) || 0;
        if (!f.loteId) e[`fonte${i}`] = 'Escolha de onde vêm os animais.';
        else if (usados.has(f.loteId)) e[`fonte${i}`] = 'Esta origem já está em outra linha.';
        else if (q < 1) e[`fonte${i}`] = 'Informe a quantidade.';
        else if (item && q > item.saldo) e[`fonte${i}`] = `Só há ${formatarNumero(item.saldo)} nesta origem.`;
        if (f.loteId) usados.add(f.loteId);
      });
      if (qtdFontes > 5000) e.fonte0 = 'No máximo 5.000 cabeças.';
      // do rebanho individual, cada animal pelo brinco
      fontes.forEach((f) => {
        if (f.loteId !== SEM_LOTE) return;
        intervalo(Number(f.qtd) || 0).forEach((i) => {
          if (!(dados[`${f.chave}|${i}`]?.brinco ?? '').trim()) e.grade = 'Do rebanho individual (sem lote), informe o brinco de cada animal.';
        });
      });
    }
    if (ind) {
      const vistos = new Set<string>();
      for (const l of linhasGrade) {
        const b = l.valor.brinco.trim().toUpperCase();
        if (b && vistos.has(b)) e.grade = `O brinco ${b} está repetido na lista.`;
        if (b) vistos.add(b);
        if (l.valor.peso.trim() && (lerNumero(l.valor.peso) == null || (lerNumero(l.valor.peso) ?? 0) <= 0)) e.grade = `Peso inválido na linha ${l.rotulo}.`;
        if (l.dica?.tipo === 'erro') e.grade = `Confira o brinco da linha ${l.rotulo}: ${l.dica.texto}`;
      }
      if (!id && qtdNova > MAX_INDIVIDUAL) e.grade = `Com controle individual, até ${formatarNumero(MAX_INDIVIDUAL)} cabeças por vez. Abra o lote e identifique os demais depois.`;
      if (id && pesoMexido && (!dataPeso || !dataValida(dataPeso))) e.dataPeso = 'Informe a data do peso.';
    }
    if (terceiro && !donoId) e.dono = 'Informe o proprietário dos animais.';
    if (!abertura || !dataValida(abertura)) e.abertura = 'Informe a data de criação.';
    if (origem[0] === 'parceria' && parceria.length === 0) e.parceria = 'Escolha: Apascentamento ou Engorda.';
    if (origem[0] === 'outra' && !origemOutra.trim()) e.origemOutra = 'Informe qual é a origem.';
    const engorda = origem[0] === 'parceria' && parceria[0] === 'engorda';
    const pc = numOuNulo(percCriador);
    const pp = numOuNulo(percParceiro);
    if (engorda) {
      if (pc == null || pp == null) e.perc = 'Informe o % do Criador e o % do Parceiro.';
      else if (pc < 0 || pp < 0 || Math.abs(pc + pp - 100) > 0.01) e.perc = 'Os dois percentuais precisam somar 100%.';
    }
    const pesos = { piT: numOuNulo(pesoIniTotal), piM: numOuNulo(pesoIniMedio), ppT: numOuNulo(pesoParTotal), ppM: numOuNulo(pesoParMedio) };
    if ([pesos.piT, pesos.piM].some((x) => x != null && x < 0) || (pesoIniTotal.trim() && pesos.piT == null) || (pesoIniMedio.trim() && pesos.piM == null)) e.pesoIni = 'Peso inválido.';
    if ([pesos.ppT, pesos.ppM].some((x) => x != null && x < 0) || (pesoParTotal.trim() && pesos.ppT == null) || (pesoParMedio.trim() && pesos.ppM == null)) e.pesoPar = 'Peso inválido.';
    const temParcial = pesos.ppT != null || pesos.ppM != null;
    if (pesoParData && !dataValida(pesoParData)) e.pesoParData = 'Data inválida.';
    else if (temParcial && !pesoParData) e.pesoParData = 'Informe a data do peso parcial.';
    const fim = {
      arr: numOuNulo(engPercArrobas),
      pasto: numOuNulo(alugPasto),
      supl: numOuNulo(alugSuplemento),
      minKg: numOuNulo(mineralKg),
      aliKg: numOuNulo(alimentarKg),
    };
    const apasc = origem[0] === 'parceria' && parceria[0] === 'apascentamento';
    if (engorda && engPercArrobas.trim() && (fim.arr == null || fim.arr < 0 || fim.arr > 100)) e.engArr = 'Informe de 0 a 100%.';
    if (apasc && alugPasto.trim() && (fim.pasto == null || fim.pasto < 0)) e.alugPasto = 'Valor inválido.';
    if (apasc && alugSuplemento.trim() && (fim.supl == null || fim.supl < 0)) e.alugSupl = 'Valor inválido.';
    if (mineralKg.trim() && (fim.minKg == null || fim.minKg < 0)) e.mineralKg = 'Quantidade inválida.';
    else if (fim.minKg != null && !mineralId) e.mineral = 'Escolha o mineral.';
    if (alimentarKg.trim() && (fim.aliKg == null || fim.aliKg < 0)) e.alimentarKg = 'Quantidade inválida.';
    else if (fim.aliKg != null && !alimentarId) e.alimentar = 'Escolha o alimento.';
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');
    if (situacao[0] === 'encerrado' && cabecas > 0) {
      return setErro(`O lote ainda tem ${formatarNumero(cabecas)} ${cabecas === 1 ? 'animal' : 'animais'}. Passe-os para outro lote antes de encerrar.`);
    }
    if (!fid) return;

    const extras = {
      origem: origem[0] ?? null,
      origem_parceria: origem[0] === 'parceria' ? parceria[0] ?? null : null,
      origem_outra: origem[0] === 'outra' ? origemOutra.trim() || null : null,
      perc_criador: engorda ? pc : null,
      perc_parceiro: engorda ? pp : null,
      peso_inicial_total: pesos.piT,
      peso_inicial_medio: pesos.piM,
      ecc: ecc[0] ? Number(ecc[0]) : null,
      peso_parcial_data: pesoParData ? paraBanco(pesoParData) : null,
      peso_parcial_total: pesos.ppT,
      peso_parcial_medio: pesos.ppM,
      engorda_perc_arrobas: engorda ? fim.arr : null,
      aluguel_pasto_cab_dia: apasc ? fim.pasto : null,
      aluguel_suplemento_cab_dia: apasc ? fim.supl : null,
      mineral_insumo_id: mineralId,
      mineral_kg_cab_dia: fim.minKg,
      alimentar_insumo_id: alimentarId,
      alimentar_kg_cab_dia: fim.aliKg,
      finalidade: finalidade[0] ?? null,
      finalidade_outra: finalidade[0] === 'outra' ? finalidadeOutra.trim() || null : null,
      controle_individual: ind,
    };
    const linhaParaEnvio = (v: LinhaIndividual) => ({ brinco: v.brinco.trim() || null, ferro: v.ferroId, peso: lerNumero(v.peso) });

    setSalvando(true);

    if (!id) {
      // V200: tudo numa operação só (lote, origem, animais vindos de outros lotes e identificação individual).
      let montar: any = null;
      if (outrosLotes) {
        const comFonte = fontes.filter((f) => f.loteId && Number(f.qtd) > 0);
        montar = {
          fontes: comFonte.map((f) => ({ lote: f.loteId === SEM_LOTE ? null : f.loteId, quantidade: Number(f.qtd) })),
          animais: ind
            ? comFonte.flatMap((f, fi) =>
                intervalo(Number(f.qtd))
                  .map((i) => dados[`${f.chave}|${i}`])
                  .filter((v) => v && (v.brinco.trim() || v.ferroId || v.peso.trim()))
                  .map((v) => ({ fonte: fi, ...linhaParaEnvio(v!) })),
              )
            : [],
        };
      } else if (ind && n > 0) {
        const linhas = intervalo(n).map((i) => dados[`n|${i}`] ?? LINHA_VAZIA);
        while (linhas.length && !linhas[linhas.length - 1].brinco.trim() && !linhas[linhas.length - 1].ferroId && !linhas[linhas.length - 1].peso.trim()) linhas.pop();
        if (linhas.length) montar = { animais: linhas.map(linhaParaEnvio) };
      }
      const { data, error } = await supabase.rpc('criar_lote', {
        p: {
          abrir: {
            fazenda: fid,
            sexo: sexo[0],
            quantidade: outrosLotes ? 0 : n,
            descricao: descricao.trim() || null,
            categoria: categoria[0] ?? null,
            raca: racaId,
            ferro: ferroId,
            nascimento: lido.iso,
            nasc_aprox: lido.aprox,
            manga: mangaId,
            proprietario: proprietario[0],
            dono: terceiro ? donoId : null,
            abertura: baseIso,
            obs: obs.trim() || null,
          },
          extras,
          montar,
        },
      });
      setSalvando(false);
      if (error) return setErro(traduzirErro(error));
      const r = data as { id: string; numero: number; cabecas: number };
      navegacao.replace('LoteForm', {
        aviso:
          `Lote ${codigoLote(r.numero, sigla)} aberto com ${formatarNumero(r.cabecas)} ${r.cabecas === 1 ? 'cabeça' : 'cabeças'}.` +
          (outrosLotes
            ? ' Os animais saíram dos lotes de origem (a troca de lote fica em Pecuário › Movimentações).'
            : r.cabecas > 0 && !ind
              ? ' Cada uma recebeu um número interno; o brinco pode ser posto depois em cada animal.'
              : ''),
      });
      return;
    }

    // Edição: se o sexo mudou, todos os animais do lote precisam ser do novo sexo.
    if (cabecas > 0) {
      const { count } = await supabase
        .from('animais')
        .select('id', { count: 'exact', head: true })
        .eq('lote_id', id)
        .eq('situacao', 'ativo')
        .neq('sexo', sexo[0]);
      if (count) {
        setSalvando(false);
        return setErro(`Há ${count} ${count === 1 ? 'animal' : 'animais'} de outro sexo neste lote. Um lote é sempre de um sexo só.`);
      }
    }

    const registro = {
      descricao: descricao.trim() || null,
      sexo: sexo[0],
      categoria: categoria[0] ?? null,
      raca_id: racaId,
      ferro_id: ferroId,
      nascimento_ref: lido.iso,
      nascimento_aproximado: lido.aprox,
      manga_id: mangaId,
      proprietario: proprietario[0],
      pessoa_terceiro_id: terceiro ? donoId : null,
      data_abertura: baseIso,
      situacao: situacao[0],
      observacoes: obs.trim() || null,
      ...extras,
    };
    const { error } = await supabase.from('lotes').update(registro).eq('id', id);
    if (error) {
      setSalvando(false);
      return setErro(traduzirErro(error));
    }

    // V200: identificação e peso individual dos animais do lote (só o que mudou)
    if (ind && animaisLote?.length) {
      const mudados = animaisLote
        .map((a) => ({ a, v: dados[a.id] ?? LINHA_VAZIA }))
        .filter(({ a, v }) => (a.brinco ?? '') !== v.brinco.trim() || (a.ferro_id ?? null) !== (v.ferroId ?? null) || lerNumero(v.peso) !== (a.peso_atual_kg == null ? null : Number(a.peso_atual_kg)));
      if (mudados.length) {
        const { error: eInd } = await supabase.rpc('identificar_animais_lote', {
          p: {
            lote: id,
            data: paraBanco(dataPeso) ?? hojeBanco(),
            animais: mudados.map(({ a, v }) => ({
              id: a.id,
              brinco: v.brinco.trim() || null,
              ferro: v.ferroId,
              peso: lerNumero(v.peso) !== (a.peso_atual_kg == null ? null : Number(a.peso_atual_kg)) ? lerNumero(v.peso) : null,
            })),
          },
        });
        if (eInd) {
          setSalvando(false);
          return setErro(`O lote foi salvo, mas a identificação dos animais não: ${traduzirErro(eInd)}`);
        }
      }
    }

    const mudou =
      original &&
      (original.categoria !== registro.categoria ||
        original.racaId !== registro.raca_id ||
        original.ferroId !== registro.ferro_id ||
        original.nascIso !== registro.nascimento_ref ||
        original.nascAprox !== registro.nascimento_aproximado);

    setSalvando(false);
    if (mudou && cabecas > 0) {
      Alert.alert(
        'Aplicar aos animais?',
        `Categoria, raça, ferro ou nascimento do lote mudaram. Aplicar também aos ${formatarNumero(cabecas)} ${cabecas === 1 ? 'animal' : 'animais'} do lote?`,
        [
          { text: 'Só no lote', style: 'cancel', onPress: () => navegacao.goBack() },
          {
            text: 'Aplicar a todos',
            onPress: async () => {
              const { error: e2 } = await supabase
                .from('animais')
                .update({
                  categoria: registro.categoria,
                  raca_id: registro.raca_id,
                  ferro_id: registro.ferro_id,
                  data_nascimento: registro.nascimento_ref,
                  nascimento_aproximado: registro.nascimento_aproximado,
                })
                .eq('lote_id', id)
                .eq('situacao', 'ativo');
              if (e2) setErro(traduzirErro(e2));
              else navegacao.goBack();
            },
          },
        ],
      );
    } else {
      navegacao.goBack();
    }
  }

  async function abrirParaAlterar() {
    setAlterarErro(null);
    const m = /^[a-z]{0,3}\s*0*(\d+)$/i.exec(alterarNum.trim());
    if (!m || !fid) return setAlterarErro('Digite o número do lote (ex.: 3 ou FC 003).');
    const { data } = await supabase.from('lotes').select('id').eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!data) return setAlterarErro(`Não há lote ${codigoLote(Number(m[1]), sigla)} nesta fazenda.`);
    setAlterarAberto(false);
    setAlterarNum('');
    navegacao.navigate('LoteForm', { id: data.id });
  }

  function excluir() {
    Alert.alert('Excluir lote', `Excluir ${codigoLote(numero, sigla)}? Só é possível se ele nunca teve animais nem lançamentos. Caso contrário, encerre o lote.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('lotes').delete().eq('id', id!);
          if (error) setErro(traduzirErro(error));
          else voltarDaConsulta(navegacao, id, true); // V149: se veio da ficha, volta direto à Consulta
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

  const sexoAtual = sexo[0] as 'M' | 'F' | undefined;
  const sexoTravado = !!id && cabecas > 0 && !!sexoAtual;
  const qtdCabecas = id ? cabecas : qtdNova;

  const abas = !id && <AbasCadastro aba={aba} aoMudar={setAba} />;

  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaLotes />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {/* Sem sigla não há como formar o número do lote: só então pede a sigla. */}
      {!id && carregadaSigla && !sigla && <SiglaFazenda />}

      {/* ----- número e data de criação ----- */}
      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Lote nº</Text>
          <Text style={estilos.numeroValor}>{id ? codigoLote(numero, sigla) : proximoNumero ? codigoLote(proximoNumero, sigla) : '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data de criação *" valor={abertura} aoMudar={setAbertura} erro={erros.abertura} />
        </View>
      </View>
      {!id &&
        (alterarAberto ? (
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Alterar o lote nº" value={alterarNum} onChangeText={setAlterarNum} autoCapitalize="characters" placeholder={`Ex.: ${sigla ?? 'FC'} 003 ou 3`} erro={alterarErro} />
            </View>
            <View style={{ width: 110, paddingTop: 26 }}>
              <Botao titulo="Abrir" tipo="secundario" onPress={abrirParaAlterar} />
            </View>
          </View>
        ) : (
          <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
            Alterar um lote já cadastrado
          </Text>
        ))}
      {id && (
        <View style={estilos.linhaCab}>
          <Text style={estilos.cab}>{formatarNumero(cabecas)} {cabecas === 1 ? 'cabeça' : 'cabeças'}</Text>
          <View style={{ flex: 1 }}>
            <Botao titulo="Ver os animais" tipo="secundario" onPress={() => navegacao.navigate('Animais', { loteId: id })} />
          </View>
        </View>
      )}

      {/* ----- finalidade (V200) ----- */}
      <Escolha rotulo="Finalidade do lote" opcoes={FINALIDADES} valor={finalidade} aoMudar={(v) => setFinalidade(finalidade[0] === v[0] ? [] : v)} />
      {finalidade[0] === 'outra' && (
        <Campo rotulo="Qual finalidade? *" value={finalidadeOutra} onChangeText={setFinalidadeOutra} autoCapitalize="sentences" erro={erros.finalidadeOutra} />
      )}

      {/* ----- origem ----- */}
      <Escolha
        rotulo="Origem"
        opcoes={id && origem[0] !== 'outros_lotes' ? ORIGENS.filter((o) => o.valor !== 'outros_lotes') : ORIGENS}
        valor={origem}
        aoMudar={(v) => {
          if (id && origem[0] === 'outros_lotes') return; // formado de outros lotes: a origem fica
          setOrigem(v);
        }}
      />
      {id && origem[0] === 'outros_lotes' && <Text style={[estilos.nota, { textAlign: 'left' }]}>Formado de outros lotes (a troca está em Pecuário › Movimentações).</Text>}
      {!id && outrosLotes && (
        <View style={estilos.caixa}>
          <Text style={estilos.caixaTitulo}>De onde vêm os animais</Text>
          <Escolha
            rotulo="Sexo do lote *"
            opcoes={SEXOS.map((s) => ({ valor: s.valor, rotulo: s.valor === 'M' ? 'Machos' : 'Fêmeas' }))}
            valor={sexo}
            aoMudar={(v) => {
              setSexo(v);
              setCategoria([]);
              setFontes([novaFonte()]);
              setDicas({});
            }}
            erro={erros.sexo}
          />
          {sexoLote &&
            fontes.map((f, i) => (
              <View key={f.chave} style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <SeletorLista
                    rotulo={i === 0 ? 'Lote de origem *' : `Origem ${i + 1} *`}
                    valorId={f.loteId}
                    aoMudar={(v) => setFontes((ant) => ant.map((x) => (x.chave === f.chave ? { ...x, loteId: v } : x)))}
                    carregar={carregarFontes}
                    erro={erros[`fonte${i}`]}
                    vazio={`Nenhum lote com ${sexoLote === 'M' ? 'machos' : 'fêmeas'} nesta fazenda.`}
                  />
                </View>
                <View style={{ width: 90 }}>
                  <Campo
                    rotulo="Cabeças"
                    value={f.qtd}
                    onChangeText={(t) => setFontes((ant) => ant.map((x) => (x.chave === f.chave ? { ...x, qtd: t.replace(/\D/g, '').slice(0, 4) } : x)))}
                    keyboardType="number-pad"
                    placeholder="Qtde."
                  />
                </View>
                {fontes.length > 1 && (
                  <Text style={[estilos.link, { paddingTop: 34 }]} onPress={() => setFontes((ant) => ant.filter((x) => x.chave !== f.chave))}>
                    ✕
                  </Text>
                )}
              </View>
            ))}
          {sexoLote && (
            <Text style={estilos.link} onPress={() => setFontes((ant) => [...ant, novaFonte()])}>
              + Mais uma origem (outro lote ou o rebanho individual)
            </Text>
          )}
          {qtdFontes > 0 && <Text style={estilos.cab}>Total do lote novo: {formatarNumero(qtdFontes)} {qtdFontes === 1 ? 'cabeça' : 'cabeças'}</Text>}
        </View>
      )}
      {origem[0] === 'cria' && <Text style={[estilos.nota, { textAlign: 'left' }]}>Crias da fazenda.</Text>}
      {origem[0] === 'parceria' && (
        <Escolha rotulo="Tipo de parceria *" opcoes={PARCERIAS} valor={parceria} aoMudar={setParceria} erro={erros.parceria} />
      )}
      {origem[0] === 'parceria' && parceria[0] === 'engorda' && (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo
              rotulo="% do Criador *"
              value={percCriador}
              onChangeText={(t) => {
                setPercCriador(t);
                const n = lerNumero(t);
                setPercParceiro(n != null && n >= 0 && n <= 100 ? paraCampo(100 - n) : '');
              }}
              keyboardType="decimal-pad"
              placeholder="Ex.: 50"
              erro={erros.perc}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Campo
              rotulo="% do Parceiro *"
              value={percParceiro}
              onChangeText={(t) => {
                setPercParceiro(t);
                const n = lerNumero(t);
                setPercCriador(n != null && n >= 0 && n <= 100 ? paraCampo(100 - n) : '');
              }}
              keyboardType="decimal-pad"
              placeholder="Ex.: 50"
            />
          </View>
        </View>
      )}
      {origem[0] === 'outra' && (
        <Campo rotulo="Qual origem? *" value={origemOutra} onChangeText={setOrigemOutra} autoCapitalize="sentences" erro={erros.origemOutra} />
      )}

      {/* ----- animais do lote: sexo, quantidade e relação (V200) ----- */}
      <Secao titulo="Animais do lote" />
      {!id && outrosLotes ? null : sexoTravado ? (
        <Text style={estilos.travado}>
          Sexo: {sexoAtual === 'M' ? 'machos' : 'fêmeas'}. Não pode mudar com animais no lote.
        </Text>
      ) : (
        <Escolha rotulo="Sexo *" opcoes={SEXOS.map((s) => ({ valor: s.valor, rotulo: s.valor === 'M' ? 'Machos' : 'Fêmeas' }))} valor={sexo} aoMudar={(v) => { setSexo(v); setCategoria([]); }} erro={erros.sexo} />
      )}
      {!id && !outrosLotes && (
        <Campo
          rotulo="Quantidade de cabeças *"
          value={quantidade}
          onChangeText={(t) => setQuantidade(t.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          placeholder="Ex.: 50"
          ajuda="Cada cabeça recebe um número interno. Deixe 0 para abrir o lote vazio."
          erro={erros.quantidade}
        />
      )}
      {/* ----- controle individual (V200) ----- */}
      <Escolha
        rotulo="Controle individual (brinco e ferro de cada animal)"
        opcoes={SIM_NAO}
        valor={individual}
        aoMudar={(v) => v.length && setIndividual(v)}
      />
      {ind && (
        <View style={{ gap: 8 }}>
          {id && <CampoData rotulo="Data do peso" valor={dataPeso} aoMudar={setDataPeso} erro={erros.dataPeso} />}
          {linhasGrade.length === 0 ? (
            <Text style={[estilos.nota, { textAlign: 'left' }]}>
              {id ? 'Nenhum animal ativo neste lote.' : outrosLotes ? 'Escolha as origens e as cabeças: abre uma linha para cada animal.' : 'Informe a quantidade de cabeças: abre uma linha para cada animal.'}
            </Text>
          ) : (
            <>
              <Text style={[estilos.nota, { textAlign: 'left' }]}>
                {outrosLotes && !id
                  ? 'Brinco que já existe: o animal certo sai do lote de origem. Brinco novo: vai para um animal sem brinco daquele lote. Linha em branco: o sistema escolhe.'
                  : 'Brinco, ferro e peso são opcionais em cada linha; o peso entra no histórico do animal.'}
              </Text>
              <GradeIndividual grupos={grupos} ferros={ferros} ferroPadrao={id ? 'Sem ferro' : outrosLotes ? 'O mesmo' : 'Do lote'} aoMudar={mudarLinha} aoSairBrinco={verificarBrinco} />
              {resumoPesos && (
                <Text style={estilos.travado}>
                  {formatarNumero(resumoPesos.pesados)} de {formatarNumero(id ? cabecas : qtdNova)} pesados · médio {formatarNumero(resumoPesos.medio, 2)} kg
                  {pesoMexido ? (id ? ' → Peso Bruto Parcial' : ' → Peso Bruto Inicial') : ''}
                </Text>
              )}
              {(id ? cabecas : qtdNova) > MAX_INDIVIDUAL && (
                <Text style={estilos.travado}>A lista mostra os primeiros {formatarNumero(MAX_INDIVIDUAL)} animais.</Text>
              )}
            </>
          )}
          {erros.grade && <Aviso tipo="erro" texto={erros.grade} />}
        </View>
      )}

      {/* ----- pesos e condição ----- */}
      <Secao titulo="Pesos e condição" />
      <PesoTotalMedio
        titulo="Peso Bruto Inicial (kg)"
        total={pesoIniTotal}
        medio={pesoIniMedio}
        aoMudarTotal={setPesoIniTotal}
        aoMudarMedio={setPesoIniMedio}
        cabecas={qtdCabecas}
        erro={erros.pesoIni}
      />
      <Escolha rotulo="Escore de Condição Corporal" opcoes={ESCORES} valor={ecc} aoMudar={(v) => setEcc(ecc[0] === v[0] ? [] : v)} />
      <PesoTotalMedio
        titulo="Peso Bruto Parcial (kg)"
        data={pesoParData}
        aoMudarData={setPesoParData}
        erroData={erros.pesoParData}
        total={pesoParTotal}
        medio={pesoParMedio}
        aoMudarTotal={setPesoParTotal}
        aoMudarMedio={setPesoParMedio}
        cabecas={qtdCabecas}
        erro={erros.pesoPar}
      />

      <Secao titulo="Composição" />
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} autoCapitalize="sentences" placeholder="Ex.: Garrotes de recria, Vacas paridas" />
      {sexoAtual && (
        <Escolha rotulo="Categoria" opcoes={CATEGORIAS[sexoAtual].map((c) => ({ valor: c, rotulo: c }))} valor={categoria} aoMudar={setCategoria} />
      )}
      <CampoRaca valorId={racaId} aoMudar={setRacaId} />
      <CampoNascimento rotulo={!id && !outrosLotes && Number(quantidade || 0) > 0 ? 'Idade *' : 'Idade'} valor={nasc} aoMudar={setNasc} baseIso={baseIso} erro={erros.nasc} sexo={sexo[0] === 'M' || sexo[0] === 'F' ? sexo[0] : null} />
      <CampoFerro valorId={ferroId} aoMudar={setFerroId} />

      <Secao titulo="Proprietário e local" />
      <Escolha
        rotulo="De quem são os animais"
        opcoes={[
          { valor: 'proprio', rotulo: 'Próprios' },
          { valor: 'terceiro', rotulo: 'De terceiro' },
        ]}
        valor={proprietario}
        aoMudar={setProprietario}
      />
      {proprietario[0] === 'terceiro' && (
        <CampoPessoaBusca rotulo="Proprietário *" valorId={donoId} aoMudar={setDonoId} tipoNovo="parceiro" erro={erros.dono} />
      )}
      <SeletorLista rotulo="Manga onde vai/está" valorId={mangaId} aoMudar={setMangaId} carregar={carregarMangas} permitirLimpar vazio="Nenhuma manga cadastrada. Cadastre em Pecuário › Mangas." />

      <Secao titulo="Outros" />
      {id && (
        <Escolha
          rotulo="Situação"
          opcoes={[
            { valor: 'ativo', rotulo: 'Ativo' },
            { valor: 'encerrado', rotulo: 'Encerrado' },
          ]}
          valor={situacao}
          aoMudar={setSituacao}
        />
      )}
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }} />

      {/* ----- engorda, aluguel e alimentação ----- */}
      {origem[0] === 'parceria' && parceria[0] === 'engorda' && (
        <>
          <Secao titulo="Engorda" />
          <Campo rotulo="% das @ acrescidas" value={engPercArrobas} onChangeText={setEngPercArrobas} keyboardType="decimal-pad" placeholder="Ex.: 50" erro={erros.engArr} />
        </>
      )}

      {origem[0] === 'parceria' && parceria[0] === 'apascentamento' && (
        <>
      <Secao titulo="Aluguel" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Pasto – R$ cab/dia" valor={alugPasto} aoMudar={setAlugPasto} erro={erros.alugPasto} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Suplemento – R$ cab/dia" valor={alugSuplemento} aoMudar={setAlugSuplemento} erro={erros.alugSupl} />
        </View>
      </View>
        </>
      )}

      <Secao titulo="Mineral" />
      <CampoBuscaRapida
        rotulo="Tipo (do estoque)"
        valorId={mineralId}
        aoMudar={setMineralId}
        buscar={buscarMineral}
        lerNome={lerInsumo}
        criar={(t) => criarInsumo('sal_mineral', t)}
        rotuloNovo="novo mineral"
        icone="cube"
        placeholder="Digite para buscar"
        erro={erros.mineral}
      />
      <Campo rotulo="Kg cab/dia" value={mineralKg} onChangeText={setMineralKg} keyboardType="decimal-pad" placeholder="Ex.: 0,100" erro={erros.mineralKg} />

      <Secao titulo="Alimentar" />
      <CampoBuscaRapida
        rotulo="Tipo (do estoque)"
        valorId={alimentarId}
        aoMudar={setAlimentarId}
        buscar={buscarAlimentar}
        lerNome={lerInsumo}
        criar={(t) => criarInsumo('racao', t)}
        rotuloNovo="novo alimento"
        icone="cube"
        placeholder="Digite para buscar"
        erro={erros.alimentar}
      />
      <Campo rotulo="Kg cab/dia" value={alimentarKg} onChangeText={setAlimentarKg} keyboardType="decimal-pad" placeholder="Ex.: 2,5" erro={erros.alimentarKg} />

      <Botao titulo={id ? 'Salvar alterações' : 'Abrir lote'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir lote" tipo="perigo" onPress={excluir} />}
      {id && <Text style={estilos.nota}>Entradas, saídas e trocas de lote ou de manga com histórico: Pecuário › Movimentações.</Text>}
    </Tela>
  );
}

/** Total e Médio lado a lado: digitando um, o outro se calcula pela quantidade de cabeças. */
function PesoTotalMedio(p: {
  titulo: string;
  total: string;
  medio: string;
  aoMudarTotal: (t: string) => void;
  aoMudarMedio: (t: string) => void;
  cabecas: number;
  erro?: string;
  data?: string;
  aoMudarData?: (t: string) => void;
  erroData?: string;
}) {
  const temCab = p.cabecas > 0;
  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.numeroRotulo}>{p.titulo}</Text>
      {p.aoMudarData && <CampoData rotulo="Data" valor={p.data ?? ''} aoMudar={p.aoMudarData} erro={p.erroData} />}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo
            rotulo="Total"
            value={p.total}
            onChangeText={(t) => {
              p.aoMudarTotal(t);
              const n = lerNumero(t);
              if (temCab) p.aoMudarMedio(n != null ? paraCampo(n / p.cabecas) : '');
            }}
            keyboardType="decimal-pad"
            placeholder="kg"
            erro={p.erro}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Campo
            rotulo="Médio"
            value={p.medio}
            onChangeText={(t) => {
              p.aoMudarMedio(t);
              const n = lerNumero(t);
              if (temCab) p.aoMudarTotal(n != null ? paraCampo(n * p.cabecas) : '');
            }}
            keyboardType="decimal-pad"
            placeholder="kg/cab."
          />
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  linhaCab: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center', letterSpacing: 1 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  cab: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.cafe },
  travado: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
  caixa: { gap: 10, padding: 12, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao },
  caixaTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primariaEscura },
});
