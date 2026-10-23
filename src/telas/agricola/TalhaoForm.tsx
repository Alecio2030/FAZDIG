import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaTalhoes from './ConsultaTalhoes';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { centroDaUnidade } from '../../lib/unidades';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { calcular, textoMes } from '../../lib/imobilizado';
import { ESPECIES, FACES, METODOS_IRRIGACAO, PROFUNDIDADES, TIPOS_PODA, idadeFase, plantasHa } from '../../lib/talhoes';
import { doGeoJson } from '../../lib/pastos';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Poda = { chave: string; id?: string; data: string; tipo: string; obs: string };
type Analise = { chave: string; id?: string; data: string; tipo: string; prof: string; lab: string; ph: string; p: string; k: string; ca: string; mg: string; mo: string; v: string; n: string; obs: string };
let cont = 0;
const chave = () => `t${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);
const analiseVazia = (): Analise => ({ chave: chave(), data: '', tipo: 'solo', prof: '0–20 cm', lab: '', ph: '', p: '', k: '', ca: '', mg: '', mo: '', v: '', n: '', obs: '' });

/** Talhões: localização, cultura, estande, manejo, podas, análises, ativo biológico (exaustão) e previsão de safra. */
export default function TalhaoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'TalhaoForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [id, setId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [areaTotal, setAreaTotal] = useState('');
  const [areaUtil, setAreaUtil] = useState('');
  const [perimetro, setPerimetro] = useState('');
  const [altitude, setAltitude] = useState('');
  const [face, setFace] = useState<string[]>([]);
  const [temDesenho, setTemDesenho] = useState(false);
  const [especie, setEspecie] = useState<string[]>(['Café Conilon']);
  const [outraCultura, setOutraCultura] = useState('');
  const [variedade, setVariedade] = useState('');
  const [plantio, setPlantio] = useState('');
  const [espLinhas, setEspLinhas] = useState('');
  const [espPlantas, setEspPlantas] = useState('');
  // V145: total de plantas efetivamente plantadas no talhão; as plantas por ha saem dele ÷ área
  const [plantasTotal, setPlantasTotal] = useState('');
  const [haAntigo, setHaAntigo] = useState<number | null>(null);
  const [irrigacao, setIrrigacao] = useState<string[]>(['sequeiro']);
  const [metodo, setMetodo] = useState<string[]>([]);
  const [previsao, setPrevisao] = useState('');
  const [ativa, setAtiva] = useState(true);
  const [podas, setPodas] = useState<Poda[]>([]);
  const [novaPoda, setNovaPoda] = useState<Poda | null>(null);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [novaAnalise, setNovaAnalise] = useState<Analise | null>(null);
  // ativo biológico
  const [imob, setImob] = useState<any>(null);
  const [custo, setCusto] = useState('');
  const [inicioExaustao, setInicioExaustao] = useState('');
  const [periodo, setPeriodo] = useState('15');
  const [centroId, setCentroId] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? nome || 'Talhão' : 'Talhões' });
  }, [navegacao, id, nome]);

  const carregarTalhoes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('areas').select('id, nome, capim_cultura, area_ha, ativa').eq('fazenda_id', fid!).eq('tipo', 'talhao').order('nome'));
    return d.map((a) => ({ id: a.id, titulo: a.nome + (a.ativa ? '' : ' (inativo)'), detalhe: [a.capim_cultura, a.area_ha != null ? `${formatarNumero(Number(a.area_ha), 2)} ha` : null].filter(Boolean).join(' · ') }));
  }, [fid]);
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, fid)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [fid]);

  const abrir = useCallback(async (aid: string) => {
    setErro(null);
    try {
      const a = await consulta<any>(supabase.from('areas').select('*').eq('id', aid).single());
      const [pd, an, im, cc] = await Promise.all([
        consulta<any[]>(supabase.from('talhao_podas').select('*').eq('area_id', aid).order('data', { ascending: false })),
        consulta<any[]>(supabase.from('talhao_analises').select('*').eq('area_id', aid).order('data', { ascending: false })),
        consulta<any[]>(supabase.from('imobilizados').select('*, rateio:imobilizado_rateios ( centro_custo_id, percentual )').eq('area_id', aid).eq('metodo', 'exaustao').order('created_at').limit(1)),
        consulta<any[]>(supabase.from('centros_custo').select('id').eq('area_id', aid).eq('ativo', true).limit(1)),
      ]);
      setId(a.id);
      setNome(a.nome);
      setAreaTotal(numeroParaCampo(a.area_ha));
      setAreaUtil(numeroParaCampo(a.area_util_ha));
      setPerimetro(numeroParaCampo(a.perimetro_m));
      setAltitude(numeroParaCampo(a.altitude_m));
      setFace(a.face_exposicao ? [a.face_exposicao] : []);
      setTemDesenho(doGeoJson(a.geometria).length >= 3);
      const esp = ESPECIES.some((e) => e.valor === a.especie) ? a.especie : a.especie || a.capim_cultura ? 'outra' : 'Café Conilon';
      setEspecie([esp]);
      setOutraCultura(esp === 'outra' ? a.especie ?? a.capim_cultura ?? '' : '');
      setVariedade(a.variedade ?? '');
      setPlantio(a.data_plantio ? doBanco(a.data_plantio) : '');
      setEspLinhas(numeroParaCampo(a.espacamento_linhas_m));
      setEspPlantas(numeroParaCampo(a.espacamento_plantas_m));
      setPlantasTotal(a.plantas_total != null ? formatarNumero(Number(a.plantas_total)) : '');
      setHaAntigo(a.plantas_total == null && a.plantas_ha_real != null ? Number(a.plantas_ha_real) : null);
      setIrrigacao([a.irrigacao ?? 'sequeiro']);
      setMetodo(a.metodo_irrigacao ? [a.metodo_irrigacao] : []);
      {
        // V142: a previsão é informada em sacas por hectare; o total é calculado pela área
        const u = Number(a.area_util_ha ?? a.area_ha) || null;
        const ha = a.previsao_sc_ha != null ? Number(a.previsao_sc_ha) : a.previsao_sacas != null && u ? Math.round((Number(a.previsao_sacas) / u) * 100) / 100 : null;
        setPrevisao(numeroParaCampo(ha));
      }
      setAtiva(a.ativa !== false);
      setPodas(pd.map((x) => ({ chave: chave(), id: x.id, data: doBanco(x.data), tipo: x.tipo, obs: x.observacoes ?? '' })));
      setAnalises(
        an.map((x) => ({
          chave: chave(), id: x.id, data: doBanco(x.data), tipo: x.tipo, prof: x.profundidade ?? '', lab: x.laboratorio ?? '',
          ph: numeroParaCampo(x.ph), p: numeroParaCampo(x.p), k: numeroParaCampo(x.k), ca: numeroParaCampo(x.ca), mg: numeroParaCampo(x.mg),
          mo: numeroParaCampo(x.mo), v: numeroParaCampo(x.v), n: numeroParaCampo(x.n), obs: x.observacoes ?? '',
        })),
      );
      const b = im[0] ?? null;
      setImob(b);
      setCusto(b ? moedaParaCampo(b.valor_aquisicao) : '');
      setInicioExaustao(b ? doBanco(b.data_ativacao) : '');
      setPeriodo(b ? numeroParaCampo(b.vida_util) : '15');
      setCentroId(b?.rateio?.[0]?.centro_custo_id ?? cc[0]?.id ?? null);
      setNovaPoda(null);
      setNovaAnalise(null);
      setErros({});
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, []);

  // Voltando do mapa: relê a área e o perímetro desenhados.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      supabase
        .from('areas')
        .select('area_ha, perimetro_m, geometria')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (!data) return;
          setTemDesenho(doGeoJson(data.geometria).length >= 3);
          setAreaTotal(numeroParaCampo(data.area_ha));
          setPerimetro(numeroParaCampo(data.perimetro_m));
        });
    }, [id]),
  );

  // V149: excluir talhão cadastrado errado (o centro de custo e o ativo biológico dele saem junto)
  function excluirTalhao() {
    Alert.alert('Excluir talhão', `Excluir o talhão ${nome}? Se já tiver atividades, colheitas, safras ou lançamentos, o sistema não deixa e diz onde está sendo usado.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_area', { p_id: id! });
          if (error) return setErro(traduzirErro(error));
          if (voltarDaConsulta(navegacao, params?.abrirId, true)) return;
          const n = nome;
          limpar();
          setAviso(`Talhão ${n} excluído.`);
        },
      },
    ]);
  }

  // V149: veio da Consulta pelo botão "Alterar ou excluir": abre o talhão já carregado
  useEffect(() => {
    if (params?.abrirId) abrir(params.abrirId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.abrirId]);

  function limpar() {
    setId(null);
    setNome('');
    setAreaTotal('');
    setAreaUtil('');
    setPerimetro('');
    setAltitude('');
    setFace([]);
    setTemDesenho(false);
    setEspecie(['Café Conilon']);
    setOutraCultura('');
    setVariedade('');
    setPlantio('');
    setEspLinhas('');
    setEspPlantas('');
    setPlantasTotal('');
    setHaAntigo(null);
    setIrrigacao(['sequeiro']);
    setMetodo([]);
    setPrevisao('');
    setAtiva(true);
    setPodas([]);
    setNovaPoda(null);
    setAnalises([]);
    setNovaAnalise(null);
    setImob(null);
    setCusto('');
    setInicioExaustao('');
    setPeriodo('15');
    setCentroId(null);
    setErros({});
  }

  // ---- cálculos na tela ----
  const hoje = hojeBanco();
  const util = n(areaUtil) ?? n(areaTotal);
  const densCalc = plantasHa(n(espLinhas), n(espPlantas));
  const totalPlantas = n(plantasTotal) && n(plantasTotal)! > 0 ? Math.round(n(plantasTotal)!) : null;
  // V145: plantas por ha efetivamente plantadas = total do talhão ÷ área útil (ou total)
  const densReal = totalPlantas && util ? Math.round(totalPlantas / util) : null;
  const previsaoHa = n(previsao);
  const previsaoTotal = previsaoHa != null && util ? Math.round(previsaoHa * util * 10) / 10 : null;
  const idade = idadeFase(paraBanco(plantio), hoje, n(periodo) ?? 15);
  const calcExaustao =
    n(custo) && n(periodo) && paraBanco(inicioExaustao)
      ? calcular({ valor_aquisicao: n(custo), data_ativacao: paraBanco(inicioExaustao)!, vida_util: n(periodo), residual_perc: imob?.residual_perc ?? 0 }, hoje)
      : null;
  const ultimaRecepa = podas.find((p) => p.tipo === 'Recepa' && paraBanco(p.data) && paraBanco(p.data)! >= `${Number(hoje.slice(0, 4)) - 1}${hoje.slice(4)}`);
  const cultura = especie[0] === 'outra' ? outraCultura.trim() : especie[0];

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!nome.trim()) e.nome = 'Informe o nome do talhão.';
    const nums: [string, string, string][] = [
      [areaTotal, 'areaTotal', 'Área total'], [areaUtil, 'areaUtil', 'Área útil'], [perimetro, 'perimetro', 'Perímetro'], [altitude, 'altitude', 'Altitude'],
      [espLinhas, 'espLinhas', 'Espaçamento entre linhas'], [espPlantas, 'espPlantas', 'Espaçamento entre plantas'], [plantasTotal, 'plantasTotal', 'Total de plantas efetivamente plantadas'], [previsao, 'previsao', 'Sacas estimadas por ha'],
    ];
    for (const [v, k, r] of nums) if (v.trim() && (n(v) == null || n(v)! < 0)) e[k] = `${r}: número inválido.`;
    if (n(areaUtil) != null && n(areaTotal) != null && n(areaUtil)! > n(areaTotal)!) e.areaUtil = 'A área útil não pode ser maior que a total.';
    if (especie[0] === 'outra' && !outraCultura.trim()) e.cultura = 'Informe a cultura.';
    if (plantio && !dataValida(plantio)) e.plantio = 'Data do plantio inválida.';
    if (irrigacao[0] === 'irrigada' && !metodo[0]) e.metodo = 'Escolha o método de irrigação.';
    // V152: lavoura em formação: a exaustão começa quando concluir a formação no Imobilizado
    const querExaustao = imob?.situacao !== 'formacao' && !!(custo.trim() || imob);
    if (querExaustao) {
      if (!n(custo) || n(custo)! <= 0) e.custo = 'Informe o custo de formação.';
      if (!inicioExaustao || !dataValida(inicioExaustao)) e.inicio = 'Informe o início da exaustão (1ª safra comercial).';
      if (!n(periodo) || n(periodo)! <= 0) e.periodo = 'Informe o período de exaustão (safras).';
      // V144: o centro do talhão é criado sozinho (4.N.01 AGRÍCOLA › talhão); não precisa escolher
    }
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    setSalvando(true);
    try {
      let q = supabase.from('areas').select('id').eq('fazenda_id', fid).eq('tipo', 'talhao').ilike('nome', nome.trim());
      if (id) q = q.neq('id', id);
      if ((await consulta<any[]>(q.limit(1))).length) {
        setSalvando(false);
        setErros({ nome: 'Já existe um talhão com esse nome nesta fazenda.' });
        return setErro('Já existe um talhão com esse nome nesta fazenda.');
      }
      const registro = {
        nome: nome.trim(),
        area_ha: n(areaTotal),
        area_util_ha: n(areaUtil),
        perimetro_m: n(perimetro),
        altitude_m: n(altitude),
        face_exposicao: face[0] ?? null,
        especie: cultura || null,
        capim_cultura: [cultura, variedade.trim()].filter(Boolean).join(' – ') || null,
        variedade: variedade.trim() || null,
        data_plantio: plantio ? paraBanco(plantio) : null,
        espacamento_linhas_m: n(espLinhas),
        espacamento_plantas_m: n(espPlantas),
        irrigacao: irrigacao[0],
        metodo_irrigacao: irrigacao[0] === 'irrigada' ? metodo[0] ?? null : null,
        plantas_total: totalPlantas,
        plantas_ha_real: densReal,
        previsao_sc_ha: previsaoHa,
        previsao_sacas: previsaoTotal,
        ativa,
      };
      const aid = id
        ? (await consulta<any>(supabase.from('areas').update(registro).eq('id', id).select('id').single())).id
        : (await consulta<any>(supabase.from('areas').insert({ ...registro, fazenda_id: fid, tipo: 'talhao' }).select('id').single())).id;

      const novasPodas = podas.filter((p) => !p.id);
      if (novasPodas.length)
        await consulta(supabase.from('talhao_podas').insert(novasPodas.map((p) => ({ fazenda_id: fid, area_id: aid, data: paraBanco(p.data), tipo: p.tipo, observacoes: p.obs.trim() || null }))));
      const novasAnalises = analises.filter((a) => !a.id);
      if (novasAnalises.length)
        await consulta(
          supabase.from('talhao_analises').insert(
            novasAnalises.map((a) => ({
              fazenda_id: fid, area_id: aid, data: paraBanco(a.data), tipo: a.tipo, profundidade: a.tipo === 'solo' ? a.prof || null : null, laboratorio: a.lab.trim() || null,
              ph: n(a.ph), p: n(a.p), k: n(a.k), ca: n(a.ca), mg: n(a.mg), mo: n(a.mo), v: n(a.v), n: n(a.n), observacoes: a.obs.trim() || null,
            })),
          ),
        );

      if (querExaustao) {
        // V144: sem centro escolhido, vale o do próprio talhão (criado pelo sistema ao gravar o talhão)
        const centroTalhao =
          centroId ?? ((await supabase.from('centros_custo').select('id').eq('area_id', aid).eq('ativo', true).order('codigo').limit(1)).data as any[] | null)?.[0]?.id ?? null;
        if (!centroTalhao) throw new Error('O centro de custo do talhão não foi criado. Rode no Supabase o arquivo do banco da V144 e grave de novo.');
        const { error } = await supabase.rpc('salvar_imobilizado', {
          p: {
            id: imob?.id ?? null,
            fazenda_id: fid,
            codigo_patrimonial: imob?.codigo_patrimonial ?? null,
            nome: imob?.nome ?? `Lavoura – ${nome.trim()}`,
            descricao: [cultura, variedade.trim()].filter(Boolean).join(' – ') || null,
            metodo: 'exaustao',
            categoria: cultura.startsWith('Café') ? 'cafe' : 'perene',
            valor_aquisicao: n(custo),
            data_ativacao: paraBanco(inicioExaustao),
            vida_util: n(periodo),
            vida_unidade: 'safras',
            residual_perc: imob?.residual_perc ?? 0,
            pessoa_id: imob?.pessoa_id ?? null,
            documento: imob?.documento ?? null,
            compra_id: imob?.compra_id ?? null,
            area_id: aid,
            situacao: imob?.situacao ?? 'ativo',
            data_baixa: imob?.data_baixa ?? null,
            motivo_baixa: imob?.motivo_baixa ?? null,
            observacoes: imob?.observacoes ?? null,
            rateio: [{ centro_custo_id: centroTalhao, percentual: 100 }],
          },
        });
        if (error) throw error;
      }
      setSalvando(false);
      if (id && voltarDaConsulta(navegacao, params?.abrirId, false)) return;
      if (id) {
        setAviso(`Talhão ${nome.trim()} alterado.`);
        limpar();
      } else {
        await abrir(aid);
        setAviso(`Talhão ${nome.trim()} cadastrado. Agora pode desenhar o contorno no mapa.`);
      }
    } catch (err) {
      setSalvando(false);
      setErro(traduzirErro(err));
    }
  }

  function apagar(tabela: 'talhao_podas' | 'talhao_analises', item: { id?: string; chave: string }, texto: string) {
    const tirar = () => (tabela === 'talhao_podas' ? setPodas((l) => l.filter((x) => x.chave !== item.chave)) : setAnalises((l) => l.filter((x) => x.chave !== item.chave)));
    if (!item.id) return tirar();
    Alert.alert('Excluir', `Excluir ${texto}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from(tabela).delete().eq('id', item.id!);
          if (error) return setErro(traduzirErro(error));
          tirar();
        },
      },
    ]);
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaTalhoes />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair deste talhão e cadastrar outro
        </Text>
      ) : (
        <SeletorLista rotulo="Alterar um talhão já cadastrado" valorId={null} aoMudar={(v) => v && abrir(v)} carregar={carregarTalhoes} dicaBusca="Nome do talhão" vazio="Nenhum talhão cadastrado." />
      )}

      {/* ---------- 1. identificação e localização ---------- */}
      <Secao titulo="Identificação e localização" />
      <Campo rotulo="Nome / número do talhão *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder="Ex.: Talhão 02 – Encosta" erro={erros.nome} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Área total (ha)" value={areaTotal} onChangeText={setAreaTotal} keyboardType="decimal-pad" erro={erros.areaTotal} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Área útil plantada (ha)" value={areaUtil} onChangeText={setAreaUtil} keyboardType="decimal-pad" erro={erros.areaUtil} />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Perímetro (m)" value={perimetro} onChangeText={setPerimetro} keyboardType="decimal-pad" erro={erros.perimetro} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Altitude (m)" value={altitude} onChangeText={setAltitude} keyboardType="decimal-pad" erro={erros.altitude} />
        </View>
      </View>
      <Escolha rotulo="Face de exposição ao sol" opcoes={FACES} valor={face} aoMudar={(v) => setFace(face[0] === v[0] ? [] : v)} />
      {id ? (
        <Botao
          titulo={temDesenho ? '🗺️  Redesenhar o contorno no mapa' : '🗺️  Desenhar o contorno no mapa'}
          tipo="secundario"
          onPress={() => navegacao.navigate('DesenharArea', { id })}
        />
      ) : (
        <Text style={estilos.nota}>Depois de gravar, aparece o botão para desenhar o contorno no mapa (a área total e o perímetro saem do desenho).</Text>
      )}
      {id && temDesenho && <Text style={estilos.nota}>Contorno desenhado no mapa.</Text>}

      {/* ---------- 2. cultura ---------- */}
      <Secao titulo="Cultura e genética" />
      <Escolha rotulo="Espécie" opcoes={ESPECIES} valor={especie} aoMudar={setEspecie} />
      {especie[0] === 'outra' && <Campo rotulo="Cultura *" value={outraCultura} onChangeText={setOutraCultura} autoCapitalize="sentences" placeholder="Ex.: Pimenta-do-reino" erro={erros.cultura} />}
      <Campo rotulo="Variedade / clone" value={variedade} onChangeText={setVariedade} autoCapitalize="sentences" placeholder={especie[0] === 'Café Arábica' ? 'Ex.: Catuaí Vermelho IAC 144' : 'Ex.: Vitória Incaper 8142'} />
      <CampoData rotulo="Data do plantio" valor={plantio} aoMudar={setPlantio} erro={erros.plantio} />
      {idade && (
        <Text style={estilos.destaque}>
          {idade.texto} ({idade.meses} meses) · {idade.fase}
        </Text>
      )}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Entre linhas (m)" value={espLinhas} onChangeText={setEspLinhas} keyboardType="decimal-pad" placeholder="Ex.: 3,5" erro={erros.espLinhas} />
        </View>
        <Text style={estilos.vezes}>×</Text>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Entre plantas (m)" value={espPlantas} onChangeText={setEspPlantas} keyboardType="decimal-pad" placeholder="Ex.: 1,0" erro={erros.espPlantas} />
        </View>
      </View>
      <Campo
        rotulo="Total de plantas efetivamente plantadas (no talhão)"
        value={plantasTotal}
        onChangeText={setPlantasTotal}
        keyboardType="number-pad"
        placeholder="Ex.: 45.000"
        erro={erros.plantasTotal}
      />
      {haAntigo != null && !plantasTotal.trim() ? (
        <Text style={estilos.nota}>Antes estava informado {formatarNumero(haAntigo)} plantas por ha. Agora informe o total de plantas do talhão; as plantas por ha são calculadas.</Text>
      ) : null}
      {!!(densCalc || totalPlantas) && (
        <View style={estilos.calc}>
          {totalPlantas != null && <Par a="Total de plantas efetivamente PLANTADAS" b={formatarNumero(totalPlantas)} forte />}
          <Par a="Total de plantas CALCULADAS (espaçamento × área)" b={densCalc && util ? formatarNumero(Math.round(densCalc * util)) : densCalc ? 'informe a área' : 'informe o espaçamento'} forte />
          <Par a="Plantas por ha calculadas (espaçamento)" b={densCalc ? formatarNumero(densCalc) : 'informe o espaçamento'} />
          {totalPlantas != null && (
            <Par
              a={`Plantas por ha efetivamente plantadas${util ? ` (÷ ${formatarNumero(util, 2)} ha ${n(areaUtil) != null ? 'úteis' : 'totais'})` : ''}`}
              b={densReal != null ? formatarNumero(densReal) : 'informe a área'}
            />
          )}
          {densReal != null && densCalc ? (
            <Par a="Diferença (falhas ou adensamento)" b={`${densReal - densCalc > 0 ? '+' : ''}${formatarNumero(densReal - densCalc)} por ha (${formatarNumero(((densReal - densCalc) / densCalc) * 100, 1)}%)`} />
          ) : null}
        </View>
      )}

      {/* ---------- 3. manejo ---------- */}
      <Secao titulo="Manejo técnico" />
      <Escolha
        rotulo="Sistema de condução"
        opcoes={[
          { valor: 'sequeiro', rotulo: 'Sequeiro' },
          { valor: 'irrigada', rotulo: 'Irrigada' },
        ]}
        valor={irrigacao}
        aoMudar={setIrrigacao}
      />
      {irrigacao[0] === 'irrigada' && <Escolha rotulo="Método de irrigação *" opcoes={METODOS_IRRIGACAO} valor={metodo} aoMudar={setMetodo} erro={erros.metodo} />}

      <Text style={estilos.subtitulo}>Podas, recepas e decotes</Text>
      {podas.map((p) => (
        <View key={p.chave} style={estilos.item}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.itemTitulo}>
              {p.tipo} · {p.data}
              {!p.id ? '  (grava ao salvar)' : ''}
            </Text>
            {p.obs ? <Text style={estilos.nota}>{p.obs}</Text> : null}
          </View>
          <Pressable onPress={() => apagar('talhao_podas', p, `${p.tipo} de ${p.data}`)} hitSlop={8} accessibilityLabel="Excluir poda">
            <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
          </Pressable>
        </View>
      ))}
      {ultimaRecepa && <Text style={[estilos.nota, { color: cores.cafe, fontWeight: '700' }]}>Recepa em {ultimaRecepa.data}: a previsão da próxima safra deste talhão fica zerada ou reduzida.</Text>}
      {novaPoda ? (
        <View style={estilos.caixa}>
          <CampoData rotulo="Data *" valor={novaPoda.data} aoMudar={(t) => setNovaPoda({ ...novaPoda, data: t })} />
          <Escolha rotulo="Tipo" opcoes={TIPOS_PODA} valor={[novaPoda.tipo]} aoMudar={(v) => setNovaPoda({ ...novaPoda, tipo: v[0] })} />
          <Campo rotulo="Observação" value={novaPoda.obs} onChangeText={(t) => setNovaPoda({ ...novaPoda, obs: t })} autoCapitalize="sentences" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Botao titulo="Cancelar" tipo="secundario" onPress={() => setNovaPoda(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Botao
                titulo="Incluir"
                onPress={() => {
                  if (!novaPoda.data || !dataValida(novaPoda.data)) return setErro('Informe a data da poda.');
                  setErro(null);
                  setPodas((l) => [novaPoda, ...l]);
                  setNovaPoda(null);
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setNovaPoda({ chave: chave(), data: '', tipo: 'Recepa', obs: '' })}>
          + Registrar poda
        </Text>
      )}

      <Text style={estilos.subtitulo}>Análises de solo e foliar</Text>
      {analises.map((a) => (
        <View key={a.chave} style={estilos.item}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.itemTitulo}>
              {a.tipo === 'solo' ? `Solo ${a.prof}` : 'Foliar'} · {a.data}
              {!a.id ? '  (grava ao salvar)' : ''}
            </Text>
            <Text style={estilos.nota}>
              {[a.ph && `pH ${a.ph}`, a.n && `N ${a.n}`, a.p && `P ${a.p}`, a.k && `K ${a.k}`, a.ca && `Ca ${a.ca}`, a.mg && `Mg ${a.mg}`, a.mo && `MO ${a.mo}`, a.v && `V% ${a.v}`].filter(Boolean).join(' · ') || 'Sem valores'}
              {a.lab ? ` · ${a.lab}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => apagar('talhao_analises', a, `a análise de ${a.data}`)} hitSlop={8} accessibilityLabel="Excluir análise">
            <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
          </Pressable>
        </View>
      ))}
      {novaAnalise ? (
        <View style={estilos.caixa}>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Data *" valor={novaAnalise.data} aoMudar={(t) => setNovaAnalise({ ...novaAnalise, data: t })} />
            </View>
          </View>
          <Escolha
            rotulo="Tipo"
            opcoes={[
              { valor: 'solo', rotulo: 'Solo' },
              { valor: 'foliar', rotulo: 'Foliar' },
            ]}
            valor={[novaAnalise.tipo]}
            aoMudar={(v) => setNovaAnalise({ ...novaAnalise, tipo: v[0] })}
          />
          {novaAnalise.tipo === 'solo' && <Escolha rotulo="Profundidade" opcoes={PROFUNDIDADES} valor={[novaAnalise.prof]} aoMudar={(v) => setNovaAnalise({ ...novaAnalise, prof: v[0] })} />}
          <Campo rotulo="Laboratório" value={novaAnalise.lab} onChangeText={(t) => setNovaAnalise({ ...novaAnalise, lab: t })} autoCapitalize="words" />
          <View style={estilos.linha}>
            {(novaAnalise.tipo === 'solo' ? (['ph', 'p', 'k'] as const) : (['n', 'p', 'k'] as const)).map((c) => (
              <View key={c} style={{ flex: 1 }}>
                <Campo rotulo={c === 'ph' ? 'pH' : c.toUpperCase()} value={novaAnalise[c]} onChangeText={(t) => setNovaAnalise({ ...novaAnalise, [c]: t })} keyboardType="decimal-pad" />
              </View>
            ))}
          </View>
          <View style={estilos.linha}>
            {(novaAnalise.tipo === 'solo' ? (['ca', 'mg', 'mo', 'v'] as const) : (['ca', 'mg'] as const)).map((c) => (
              <View key={c} style={{ flex: 1 }}>
                <Campo rotulo={c === 'mo' ? 'MO' : c === 'v' ? 'V%' : c === 'ca' ? 'Ca' : 'Mg'} value={novaAnalise[c]} onChangeText={(t) => setNovaAnalise({ ...novaAnalise, [c]: t })} keyboardType="decimal-pad" />
              </View>
            ))}
          </View>
          <Campo rotulo="Observação" value={novaAnalise.obs} onChangeText={(t) => setNovaAnalise({ ...novaAnalise, obs: t })} autoCapitalize="sentences" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Botao titulo="Cancelar" tipo="secundario" onPress={() => setNovaAnalise(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Botao
                titulo="Incluir"
                onPress={() => {
                  if (!novaAnalise.data || !dataValida(novaAnalise.data)) return setErro('Informe a data da análise.');
                  setErro(null);
                  setAnalises((l) => [novaAnalise, ...l]);
                  setNovaAnalise(null);
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setNovaAnalise(analiseVazia())}>
          + Registrar análise
        </Text>
      )}

      {/* ---------- 4. ativo biológico ---------- */}
      <Secao titulo="Ativo biológico e exaustão" />
      {imob?.situacao === 'formacao' && (
        <Aviso
          tipo="info"
          texto={`Lavoura EM FORMAÇÃO (bem nº ${imob.numero}${imob.codigo_patrimonial ? `, ${imob.codigo_patrimonial}` : ''}): as Atividades deste talhão vão para o custo da formação. Para começar a exaustão, informe a data de início da operação em Mais › Imobilizado (abrir o bem › Concluir a formação). Os campos abaixo ficam sem efeito até lá.`}
        />
      )}
      <Text style={estilos.nota}>
        Custo de formação: tudo o que se gastou do plantio até a 1ª safra comercial. Vira o valor do ativo e é exaurido por mês no centro de custo do talhão
        {imob ? ` (bem nº ${imob.numero} do Imobilizado)` : ' (cria o bem no Imobilizado ao salvar)'}.
      </Text>
      <CampoMoeda rotulo="Custo de formação acumulado (R$)" valor={custo} aoMudar={setCusto} erro={erros.custo} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Início da exaustão (1ª safra)" valor={inicioExaustao} aoMudar={setInicioExaustao} erro={erros.inicio} />
        </View>
        <View style={{ width: 120 }}>
          <Campo rotulo="Período (safras)" value={periodo} onChangeText={setPeriodo} keyboardType="decimal-pad" erro={erros.periodo} />
        </View>
      </View>
      <SeletorLista rotulo="Centro de custo do talhão" valorId={centroId} aoMudar={setCentroId} carregar={carregarCentros} permitirLimpar erro={erros.centro} vazio="O centro do talhão é criado sozinho ao gravar." />
      <Text style={estilos.nota}>Em branco, vale o centro do próprio talhão, criado pelo sistema dentro do AGRÍCOLA da fazenda (ex.: 4.1.01-001).</Text>
      {calcExaustao && (
        <View style={estilos.calc}>
          <Par a="Exaustão mensal" b={formatarMoeda(calcExaustao.mensal)} forte />
          <Par a={`Acumulada até hoje (${calcExaustao.decorridos} de ${calcExaustao.meses} meses)`} b={formatarMoeda(calcExaustao.acumulado)} />
          <Par a="Valor contábil do ativo hoje" b={formatarMoeda(calcExaustao.contabil)} />
          <Par a="Termina em" b={textoMes(calcExaustao.fim)} />
        </View>
      )}

      {/* ---------- previsão ---------- */}
      <Secao titulo="Previsão da Produção" />
      <Campo rotulo="Sacas estimadas por hectare (próxima colheita)" value={previsao} onChangeText={setPrevisao} keyboardType="decimal-pad" placeholder="Ex.: 60" erro={erros.previsao} />
      {previsaoHa != null && (
        <View style={estilos.calc}>
          <Par
            a={`Sacas calculadas no talhão${util ? ` (${formatarNumero(util, 2)} ha ${n(areaUtil) != null ? 'úteis' : 'totais'})` : ''}`}
            b={previsaoTotal != null ? `${formatarQtd(previsaoTotal)} sc` : 'informe a área'}
            forte
          />
          {previsaoTotal != null && totalPlantas ? <Par a="Por planta" b={`${formatarNumero((previsaoTotal * 60) / totalPlantas, 2)} kg beneficiado`} /> : null}
        </View>
      )}

      {id && <Interruptor rotulo="Ativo" descricao="Talhão inativo (erradicado, vendido) não aparece para escolher em novos lançamentos." valor={ativa} aoMudar={setAtiva} />}
      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar talhão'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir talhão" tipo="perigo" onPress={excluirTalhao} />}
    </Tela>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '700', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  vezes: { paddingTop: 38, fontSize: tam.subtitulo, color: cores.textoSuave },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  destaque: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  subtitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto, marginTop: 4 },
  calc: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.primaria, padding: 12, gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10 },
  itemTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
});
