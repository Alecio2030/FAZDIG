import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import CampoNascimento, { NASCIMENTO_VAZIO, lerNascimento, nascimentoDoBanco, type ValorNascimento } from '../../componentes/CampoNascimento';
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
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const ORIGENS = [
  { valor: 'compra', rotulo: 'Compra' },
  { valor: 'parceria', rotulo: 'Parceria' },
  { valor: 'cria', rotulo: 'Cria' },
  { valor: 'outra', rotulo: 'Outra' },
];
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
  const [nasc, setNasc] = useState<ValorNascimento>(NASCIMENTO_VAZIO);
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
    if (!id && (!Number.isInteger(n) || n < 0 || n > 5000)) e.quantidade = 'Informe um número de 0 a 5.000.';
    if (lido.erro) e.nasc = lido.erro;
    else if (!id && n > 0 && !lido.iso) e.nasc = 'Informe a idade: cada cabeça vira um animal, e animal não entra sem idade.';
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
    };

    setSalvando(true);

    if (!id) {
      const { data, error } = await supabase.rpc('abrir_lote', {
        p_fazenda: fid,
        p_sexo: sexo[0],
        p_quantidade: n,
        p_descricao: descricao.trim() || null,
        p_categoria: categoria[0] ?? null,
        p_raca: racaId,
        p_ferro: ferroId,
        p_nascimento: lido.iso,
        p_nasc_aprox: lido.aprox,
        p_manga: mangaId,
        p_proprietario: proprietario[0],
        p_dono: terceiro ? donoId : null,
        p_abertura: baseIso,
        p_obs: obs.trim() || null,
      });
      if (error) {
        setSalvando(false);
        return setErro(traduzirErro(error));
      }
      const r = data as { id: string; numero: number; cabecas: number };
      const { error: eExtra } = await supabase.from('lotes').update(extras).eq('id', r.id);
      setSalvando(false);
      if (eExtra) return setErro(`Lote ${codigoLote(r.numero, sigla)} aberto, mas a origem e os pesos não foram gravados: ${traduzirErro(eExtra)} Abra o lote pela Consulta e salve de novo.`);
      navegacao.replace('LoteForm', {
        aviso:
          `Lote ${codigoLote(r.numero, sigla)} aberto com ${formatarNumero(r.cabecas)} ${r.cabecas === 1 ? 'cabeça' : 'cabeças'}.` +
          (r.cabecas > 0 ? ' Cada uma recebeu um número interno; o brinco pode ser posto depois em cada animal.' : ''),
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
  const qtdCabecas = id ? cabecas : Number(quantidade || 0);

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

      {/* ----- origem ----- */}
      <Escolha rotulo="Origem" opcoes={ORIGENS} valor={origem} aoMudar={setOrigem} />
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

      {/* ----- pesos e condição ----- */}
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
      {sexoTravado ? (
        <Text style={estilos.travado}>
          Sexo: {sexoAtual === 'M' ? 'machos' : 'fêmeas'}. Não pode mudar com animais no lote.
        </Text>
      ) : (
        <Escolha rotulo="Sexo *" opcoes={SEXOS.map((s) => ({ valor: s.valor, rotulo: s.valor === 'M' ? 'Machos' : 'Fêmeas' }))} valor={sexo} aoMudar={(v) => { setSexo(v); setCategoria([]); }} erro={erros.sexo} />
      )}
      {sexoAtual && (
        <Escolha rotulo="Categoria" opcoes={CATEGORIAS[sexoAtual].map((c) => ({ valor: c, rotulo: c }))} valor={categoria} aoMudar={setCategoria} />
      )}
      {!id && (
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
      <CampoRaca valorId={racaId} aoMudar={setRacaId} />
      <CampoNascimento rotulo={!id && Number(quantidade || 0) > 0 ? 'Idade *' : 'Idade'} valor={nasc} aoMudar={setNasc} baseIso={baseIso} erro={erros.nasc} />
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
});
