import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import PainelDieta from '../../componentes/PainelDieta';
import ConsultaDietas from './ConsultaDietas';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import {
  APTIDOES,
  TIPOS_GENETICA,
  cmsEstimado,
  cmsPercPadrao,
  metasPadrao,
  textoComposicao,
  type Aptidao,
  type Item,
} from '../../lib/dietas';
import { formular } from '../../lib/formulacao';
import { carregarParametros, valorParam } from '../../lib/parametros';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

// V175: o operador escolhe os insumos; o sistema faz o formulado (% de cada um na matéria seca)
// e a dieta sai dele (consumo de MS por cabeça x % de cada insumo).
type ItemForm = Item & { pctTexto: string };
const ESCORES = ['1', '2', '3', '4', '5'].map((v) => ({ valor: v, rotulo: v }));
const n = (t: string) => lerNumero(t);
let contador = 0;
const novaChave = () => `i${Date.now()}_${contador++}`;

export default function DietaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'DietaForm'>>();
  const id = params?.id;
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [numero, setNumero] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [aptidao, setAptidao] = useState<string[]>(['corte']);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [cabecas, setCabecas] = useState('');
  const [pv, setPv] = useState('');
  const [ecc, setEcc] = useState<string[]>([]);
  const [gmd, setGmd] = useState('');
  const [leite, setLeite] = useState('');
  const [gordura, setGordura] = useState('3,5');
  const [del, setDel] = useState('');
  const [genTipo, setGenTipo] = useState<string[]>([]);
  const [cmsPerc, setCmsPerc] = useState('');
  const [metaPb, setMetaPb] = useState('');
  const [metaNdt, setMetaNdt] = useState('');
  const [metaFdn, setMetaFdn] = useState('');
  const [metasEditadas, setMetasEditadas] = useState(false);
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [obs, setObs] = useState('');
  // V175: tratos por dia e fornecimento automático (o trato de cada dia baixa o estoque para o lote)
  const [tratos, setTratos] = useState('');
  const [auto, setAuto] = useState<string[]>([]);
  const [desde, setDesde] = useState('');
  const [avisoForm, setAvisoForm] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null);
  const [semEstoque, setSemEstoque] = useState<Record<string, boolean>>({});
  const [paramsOk, setParamsOk] = useState(false);
  /** o técnico mudou algum %: o sistema não reformula sozinho */
  const [ajustado, setAjustado] = useState(false);

  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);

  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const apt = (aptidao[0] ?? 'corte') as Aptidao;
  // V175: valores usuais dos Parâmetros (consumo de MS, GMD, tratos por dia, mineral)
  useEffect(() => {
    carregarParametros().then(() => setParamsOk(true));
  }, []);
  const cmsPad = (a: Aptidao) => (paramsOk ? valorParam(a === 'corte' ? 'cms_pv_corte' : 'cms_pv_outros') : null) ?? cmsPercPadrao(a);
  const tratosPad = (paramsOk ? valorParam('tratos_dia') : null) ?? 3;
  const tratosN = Math.max(1, Math.round(n(tratos) ?? tratosPad));

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? (numero ? `Dieta nº ${numero}` : 'Dieta') : 'Dietas' });
  }, [navegacao, id, numero]);

  // Número que a nova dieta vai receber (o banco confirma ao gravar).
  useEffect(() => {
    if (id || !fid) return;
    supabase
      .from('dietas')
      .select('numero')
      .eq('fazenda_id', fid)
      .order('numero', { ascending: false })
      .limit(1)
      .then(({ data: d }) => setProximo(((d?.[0]?.numero as number) ?? 0) + 1));
  }, [id, fid]);

  // Alteração: carrega a dieta e os itens.
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await consulta<any>(supabase.from('dietas').select('*, itens:dieta_itens ( * )').eq('id', id).single());
        setNumero(d.numero);
        setData(doBanco(d.data));
        setAptidao([d.aptidao]);
        setLoteId(d.lote_id);
        setDescricao(d.descricao ?? '');
        setCabecas(d.cabecas ? String(d.cabecas) : '');
        setPv(numeroParaCampo(d.pv));
        setEcc(d.ecc != null ? [String(d.ecc)] : []);
        setGmd(numeroParaCampo(d.gmd));
        setLeite(numeroParaCampo(d.leite_l));
        setGordura(numeroParaCampo(d.gordura) || '3,5');
        setDel(d.del != null ? String(d.del) : '');
        setGenTipo(d.genetica_tipo ? [d.genetica_tipo] : []);
        setCmsPerc(numeroParaCampo(d.cms_perc_pv));
        setMetaPb(numeroParaCampo(d.meta_pb));
        setMetaNdt(numeroParaCampo(d.meta_ndt));
        setMetaFdn(numeroParaCampo(d.meta_fdn_min));
        setMetasEditadas(true);
        setObs(d.observacoes ?? '');
        setTratos(d.tratos_dia != null ? String(d.tratos_dia) : '');
        setAuto(d.fornecimento_auto ? ['sim'] : []);
        setDesde(d.fornecer_desde ? doBanco(d.fornecer_desde) : '');
        const its = ((d.itens as any[]) ?? []).sort((a, b) => a.ordem - b.ordem);
        setItens(
          its.map((i) => ({
            chave: novaChave(),
            alimento_id: i.alimento_id,
            nome: i.nome,
            tipo: i.tipo,
            kg_mn: Number(i.kg_mn),
            pctTexto: '',
            ms: Number(i.ms),
            pb: Number(i.pb),
            ndt: Number(i.ndt),
            fdn: Number(i.fdn),
            preco_kg_mn: i.preco_kg_mn != null ? Number(i.preco_kg_mn) : null,
          })),
        );
        // % de cada insumo na MS, a partir dos kg gravados
        const msTot = its.reduce((t, i) => t + (Number(i.kg_mn) * Number(i.ms)) / 100, 0);
        setItens((v) => v.map((x) => ({ ...x, pctTexto: msTot > 0 ? numeroParaCampo(Math.round(((x.kg_mn * x.ms) / 100 / msTot) * 10000) / 100) : '' })));
        setAjustado(true);
        const ids = its.map((i) => i.alimento_id).filter(Boolean);
        if (ids.length) {
          const { data: al } = await supabase.from('alimentos').select('id, insumo_id').in('id', ids);
          setSemEstoque(Object.fromEntries(((al as any[]) ?? []).map((x) => [x.id, !x.insumo_id])));
        }
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [id]);

  // Metas de referência acompanham a aptidão e o desempenho, até a pessoa mexer nelas.
  const metasRef = metasPadrao({ aptidao: apt, gmd: n(gmd), leite: n(leite), genetica: genTipo[0] });
  useEffect(() => {
    if (metasEditadas) return;
    setMetaPb(numeroParaCampo(metasRef.pb));
    setMetaNdt(numeroParaCampo(metasRef.ndt));
    setMetaFdn(numeroParaCampo(metasRef.fdnMin));
  }, [metasEditadas, metasRef.pb, metasRef.ndt, metasRef.fdnMin]);

  const usaPerc = !(apt === 'leite' && (n(leite) ?? 0) > 0);
  const cms = cmsEstimado({ aptidao: apt, pv: n(pv), leite: n(leite), gordura: n(gordura), del: n(del), percPv: n(cmsPerc) ?? cmsPad(apt) });
  const metas = { pb: n(metaPb) ?? metasRef.pb, ndt: n(metaNdt) ?? metasRef.ndt, fdnMin: n(metaFdn) ?? metasRef.fdnMin };
  // kg por cabeça de cada insumo = consumo de MS × % na MS ÷ MS do insumo
  const itensCalc: Item[] = useMemo(
    () => itens.map((i) => ({ ...i, kg_mn: cms && i.ms > 0 ? Math.round((((n(i.pctTexto) ?? 0) / 100) * cms * 100) / i.ms * 1000) / 1000 : 0 })),
    [itens, cms],
  );
  const somaPct = itens.reduce((t, i) => t + (n(i.pctTexto) ?? 0), 0);
  const mnTotal = itensCalc.reduce((t, i) => t + i.kg_mn, 0);

  // ---- listas ----
  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, categoria').eq('fazenda_id', fid!).eq('situacao', 'ativo').order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla), detalhe: l.categoria }));
  }, [fid, sigla]);

  const carregarAlimentos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('alimentos').select('*').eq('ativo', true).order('tipo').order('nome'));
    return d.map((a) => ({
      id: a.id,
      titulo: a.nome,
      detalhe: `${textoComposicao(a)}${a.preco_kg_mn != null ? ` · ${formatarMoeda(Number(a.preco_kg_mn))}/kg` : ' · sem preço'}`,
    }));
  }, []);

  async function escolherLote(lid: string | null) {
    setLoteId(lid);
    if (!lid) return;
    const [{ data: l }, { count }] = await Promise.all([
      supabase.from('lotes').select('descricao, ecc, peso_inicial_medio, peso_parcial_medio').eq('id', lid).single(),
      supabase.from('animais').select('id', { count: 'exact', head: true }).eq('lote_id', lid).eq('situacao', 'ativo'),
    ]);
    setCabecas(count ? String(count) : '');
    if (l) {
      const peso = l.peso_parcial_medio ?? l.peso_inicial_medio;
      if (peso != null) setPv(numeroParaCampo(peso));
      if (l.ecc != null) setEcc([String(l.ecc)]);
      if (!descricao && l.descricao) setDescricao(l.descricao);
    }
  }

  async function adicionarAlimento(aid: string | null) {
    if (!aid) return;
    const { data: a, error } = await supabase.from('alimentos').select('*').eq('id', aid).single();
    if (error || !a) return setErro(traduzirErro(error));
    // V175: alimento ligado a um produto do estoque usa o custo médio de lá
    let preco = a.preco_kg_mn != null ? Number(a.preco_kg_mn) : null;
    if (a.insumo_id && fid) {
      const { data: pe } = await supabase.rpc('preco_kg_alimento', { p_alimento: a.id, p_fazenda: fid });
      if (pe != null && Number(pe) > 0) preco = Number(pe);
    }
    setSemEstoque((x) => ({ ...x, [a.id]: !a.insumo_id }));
    setItens((v) => [
      ...v,
      {
        chave: novaChave(),
        alimento_id: a.id,
        nome: a.nome,
        tipo: a.tipo,
        kg_mn: 0,
        pctTexto: '',
        ms: Number(a.ms),
        pb: Number(a.pb),
        ndt: Number(a.ndt),
        fdn: Number(a.fdn),
        preco_kg_mn: preco,
      },
    ]);
  }

  // ---- V175: formulado pelo menor custo ----
  const chavesItens = itens.map((i) => i.chave).join(',');
  function formularDieta(avisar = true) {
    if (!itens.length) return avisar && setAvisoForm({ tipo: 'erro', texto: 'Escolha os insumos que quer usar.' });
    if (!cms) return avisar && setAvisoForm({ tipo: 'erro', texto: 'Informe o peso vivo médio para calcular o consumo de matéria seca.' });
    const r = formular(itensCalc.map((i) => ({ ...i, kg_mn: 0 })), cms, metas, (valorParam('mineral_g_cab') ?? 100) / 1000);
    if (r.erro) return setAvisoForm({ tipo: 'erro', texto: r.erro });
    setItens((v) => v.map((i, k) => ({ ...i, pctTexto: numeroParaCampo(Math.round(((r.kgMn[k] * i.ms) / 100 / cms) * 10000) / 100) })));
    setAjustado(false);
    const partes = ['Formulado pelo menor custo para atingir as metas do ganho desejado.'];
    if (r.faltou.length) partes.push(`Com estes insumos não deu para chegar em: ${r.faltou.join('; ')}. Acrescente um insumo mais forte nesse ponto.`);
    if (r.semPreco.length) partes.push(`Sem preço (entraram como caros): ${r.semPreco.join(', ')}.`);
    if (r.suspeitos.length) partes.push(`Confira o cadastro (Pecuário › Alimentos), os valores não parecem certos: ${r.suspeitos.join(' | ')}.`);
    const cmsP = usaPerc ? n(cmsPerc) ?? cmsPad(apt) : null;
    if (apt === 'corte' && cmsP != null && (cmsP < 1.8 || cmsP > 3)) partes.push(`Consumo de ${formatarNumero(cmsP, 2)}% do peso vivo está fora do usual para corte (2,2 a 2,6%).`);
    setAvisoForm({ tipo: r.faltou.length || r.suspeitos.length ? 'erro' : 'info', texto: partes.join(' ') });
  }
  // reformula sozinho quando muda a lista de insumos, o consumo ou as metas (até o técnico mexer num %)
  useEffect(() => {
    if (ajustado || carregando || !itens.length || !cms) return;
    formularDieta(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavesItens, cms, metas.pb, metas.ndt, metas.fdnMin, ajustado, carregando]);
  // GMD em branco no corte: o usual dos Parâmetros
  useEffect(() => {
    if (id || !paramsOk || apt !== 'corte' || gmd.trim()) return;
    setGmd(numeroParaCampo(valorParam('gmd_confinamento') ?? 1.4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsOk, apt, id]);

  const mudarPct = (chave: string, t: string) => {
    setAjustado(true);
    setItens((v) => v.map((i) => (i.chave === chave ? { ...i, pctTexto: t } : i)));
  };
  const tirarItem = (chave: string) => setItens((v) => v.filter((i) => i.chave !== chave));

  async function abrirParaAlterar() {
    setAlterarErro(null);
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m || !fid) return setAlterarErro('Digite o número da dieta.');
    const { data: d } = await supabase.from('dietas').select('id').eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!d) return setAlterarErro(`Não há dieta nº ${m[1]} nesta fazenda.`);
    setAlterarAberto(false);
    setAlterarNum('');
    navegacao.navigate('DietaForm', { id: d.id });
  }

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    if (!data || !dataValida(data)) e.data = 'Informe a data.';
    if (!n(pv) || (n(pv) ?? 0) <= 0) e.pv = 'Informe o peso vivo médio.';
    const cab = cabecas.trim() ? Number(cabecas) : 0;
    if (!Number.isInteger(cab) || cab < 0) e.cabecas = 'Número inválido.';
    if (apt === 'corte' && gmd.trim() && n(gmd) == null) e.gmd = 'Valor inválido.';
    if (apt === 'leite') {
      if (!n(leite)) e.leite = 'Informe a produção diária.';
      if (gordura.trim() && n(gordura) == null) e.gordura = 'Valor inválido.';
    }
    if (apt === 'genetica' && !genTipo[0]) e.genTipo = 'Escolha: Receptoras, Doadoras ou Touros.';
    if (usaPerc && cmsPerc.trim() && (n(cmsPerc) == null || (n(cmsPerc) ?? 0) <= 0)) e.cmsPerc = 'Valor inválido.';
    if (auto.length && !loteId) e.auto = 'Para o trato sair sozinho todo dia, escolha o lote.';
    if (auto.length && desde.trim() && !dataValida(desde)) e.desde = 'Data inválida.';
    if (itens.length === 0) e.itens = 'Adicione pelo menos um alimento.';
    else if (!cms) e.pv = 'Informe o peso vivo médio para calcular a dieta.';
    else if (itens.some((i) => n(i.pctTexto) == null || (n(i.pctTexto) ?? 0) < 0)) e.itens = 'Confira o % de cada insumo no formulado.';
    else if (Math.abs(somaPct - 100) > 0.5) e.itens = `O formulado soma ${formatarNumero(somaPct, 2)}%: precisa fechar 100%.`;
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    const p = {
      id: id ?? null,
      fazenda_id: fid,
      data: paraBanco(data),
      aptidao: apt,
      lote_id: loteId,
      descricao: descricao.trim(),
      cabecas: cab,
      pv: n(pv),
      ecc: ecc[0] ? Number(ecc[0]) : null,
      gmd: apt === 'corte' ? n(gmd) : null,
      leite_l: apt === 'leite' ? n(leite) : null,
      gordura: apt === 'leite' ? n(gordura) : null,
      del: apt === 'leite' && del.trim() ? Number(del) : null,
      genetica_tipo: apt === 'genetica' ? genTipo[0] : null,
      cms_perc_pv: usaPerc ? n(cmsPerc) ?? cmsPad(apt) : null,
      cms_kg: cms != null ? Math.round(cms * 1000) / 1000 : null,
      meta_pb: metas.pb,
      meta_ndt: metas.ndt,
      meta_fdn_min: metas.fdnMin,
      observacoes: obs.trim(),
      tratos_dia: tratosN,
      fornecimento_auto: auto.length > 0 && !!loteId,
      fornecer_desde: auto.length > 0 && loteId ? paraBanco(desde && dataValida(desde) ? desde : data) : null,
      itens: itensCalc.filter((i) => i.kg_mn > 0).map((i) => ({ alimento_id: i.alimento_id, nome: i.nome, tipo: i.tipo, kg_mn: i.kg_mn, ms: i.ms, pb: i.pb, ndt: i.ndt, fdn: i.fdn, preco_kg_mn: i.preco_kg_mn })),
    };

    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_dieta', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { id: string; numero: number };
    if (!id) {
      navegacao.replace('DietaForm', { aviso: `Dieta nº ${res.numero} gravada. Veja em Consultar.` });
    } else {
      navegacao.goBack();
    }
  }

  function excluir() {
    Alert.alert('Excluir dieta', `Excluir a dieta nº ${numero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('dietas').delete().eq('id', id!);
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

  const abas = !id && <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaDietas />
      </Tela>
    );
  }

  const cabN = cabecas.trim() ? Number(cabecas) || 0 : 0;

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {/* ----- número e data ----- */}
      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Dieta nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero ?? '…' : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {!id &&
        (alterarAberto ? (
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Alterar a dieta nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
            </View>
            <View style={{ width: 110, paddingTop: 26 }}>
              <Botao titulo="Abrir" tipo="secundario" onPress={abrirParaAlterar} />
            </View>
          </View>
        ) : (
          <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
            Alterar uma dieta já cadastrada
          </Text>
        ))}

      {/* ----- 1. o rebanho ----- */}
      <Secao titulo="Rebanho" />
      <Escolha rotulo="Aptidão" opcoes={APTIDOES} valor={aptidao} aoMudar={(v) => setAptidao(v)} />
      <SeletorLista rotulo="Lote" valorId={loteId} aoMudar={escolherLote} carregar={carregarLotes} permitirLimpar vazio="Nenhum lote ativo." />
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} autoCapitalize="sentences" placeholder="Ex.: Terminação confinamento" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Cabeças" value={cabecas} onChangeText={(t) => setCabecas(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" erro={erros.cabecas} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Peso vivo médio (kg) *" value={pv} onChangeText={setPv} keyboardType="decimal-pad" erro={erros.pv} />
        </View>
      </View>
      <Escolha rotulo="Escore de Condição Corporal" opcoes={ESCORES} valor={ecc} aoMudar={(v) => setEcc(ecc[0] === v[0] ? [] : v)} />

      {apt === 'corte' && <Campo rotulo="Ganho de peso desejado (GMD, kg/dia)" value={gmd} onChangeText={setGmd} keyboardType="decimal-pad" placeholder={`Ex.: ${numeroParaCampo((paramsOk ? valorParam('gmd_confinamento') : null) ?? 1.4)}`} erro={erros.gmd} />}
      {apt === 'leite' && (
        <>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Leite (L/dia) *" value={leite} onChangeText={setLeite} keyboardType="decimal-pad" erro={erros.leite} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="% de gordura" value={gordura} onChangeText={setGordura} keyboardType="decimal-pad" erro={erros.gordura} />
            </View>
          </View>
          <Campo rotulo="Dias em lactação (DEL)" value={del} onChangeText={(t) => setDel(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="Ex.: 90" />
        </>
      )}
      {apt === 'genetica' && <Escolha rotulo="Grupo *" opcoes={TIPOS_GENETICA} valor={genTipo} aoMudar={setGenTipo} erro={erros.genTipo} />}

      {/* ----- consumo e metas ----- */}
      <Secao titulo="Consumo e metas" />
      {usaPerc ? (
        <Campo
          rotulo="Consumo de MS (% do peso vivo)"
          value={cmsPerc}
          onChangeText={setCmsPerc}
          keyboardType="decimal-pad"
          placeholder={numeroParaCampo(cmsPad(apt))}
          ajuda={cms != null ? `Consumo estimado: ${formatarNumero(cms, 2)} kg de MS/cab/dia` : 'Informe o peso vivo para estimar.'}
          erro={erros.cmsPerc}
        />
      ) : (
        <Text style={estilos.nota}>
          Consumo estimado (equação NRC 2001 para vacas em lactação): {cms != null ? `${formatarNumero(cms, 2)} kg de MS/cab/dia` : 'informe o peso vivo'}
        </Text>
      )}
      <Text style={estilos.nota}>Metas em % da matéria seca. Vêm de uma referência média e podem ser alteradas pelo técnico.</Text>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="PB %" value={metaPb} onChangeText={(t) => { setMetaPb(t); setMetasEditadas(true); }} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="NDT %" value={metaNdt} onChangeText={(t) => { setMetaNdt(t); setMetasEditadas(true); }} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="FDN mín. %" value={metaFdn} onChangeText={(t) => { setMetaFdn(t); setMetasEditadas(true); }} keyboardType="decimal-pad" />
        </View>
      </View>
      {metasEditadas && (
        <Text style={estilos.link} onPress={() => setMetasEditadas(false)}>
          Voltar às metas de referência ({numeroParaCampo(metasRef.pb)} / {numeroParaCampo(metasRef.ndt)} / {numeroParaCampo(metasRef.fdnMin)})
        </Text>
      )}

      {/* ----- 2. os insumos ----- */}
      <Secao titulo="Insumos que quer usar" />
      {itens.map((i) => (
        <View key={i.chave} style={[estilos.item, { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.itemNome}>{i.nome}</Text>
            <Text style={estilos.itemComp}>{textoComposicao(i)}</Text>
            <Text style={estilos.itemComp}>{i.preco_kg_mn != null ? `${formatarMoeda(i.preco_kg_mn)}/kg` : 'sem preço'}</Text>
          </View>
          <Pressable onPress={() => tirarItem(i.chave)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Tirar ${i.nome}`}>
            <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
          </Pressable>
        </View>
      ))}
      <SeletorLista
        rotulo={itens.length ? 'Adicionar outro insumo' : 'Adicionar insumo'}
        valorId={null}
        aoMudar={adicionarAlimento}
        carregar={carregarAlimentos}
        erro={erros.itens}
        dicaBusca="Nome do alimento"
        vazio="Nenhum alimento cadastrado. Cadastre em Pecuário › Alimentos."
      />
      <Text style={estilos.link} onPress={() => navegacao.push('AlimentoForm', {})}>
        Insumo não está na lista? Cadastrar alimento
      </Text>

      {/* ----- 3. o formulado: % de cada insumo ----- */}
      {itens.length > 0 && (
        <>
          <Secao titulo="Formulado (% de cada insumo)" />
          {!cms && <Aviso tipo="info" texto="Informe o peso vivo médio: o formulado e a dieta saem do consumo de matéria seca." />}
          {avisoForm && <Aviso tipo={avisoForm.tipo} texto={avisoForm.texto} />}
          <View style={estilos.item}>
            <View style={estilos.tabLinha}>
              <Text style={[estilos.tabNome, estilos.tabCab]}>Insumo</Text>
              <Text style={[estilos.tabCol, estilos.tabCab]}>% na MS</Text>
              <Text style={[estilos.tabCol, estilos.tabCab]}>% como vai no cocho</Text>
            </View>
            {itens.map((i, k) => (
              <View key={i.chave} style={estilos.tabLinha}>
                <Text style={estilos.tabNome}>{i.nome}</Text>
                <View style={estilos.tabCol}>
                  <Campo rotulo="" value={i.pctTexto} onChangeText={(t) => mudarPct(i.chave, t)} keyboardType="decimal-pad" placeholder="%" />
                </View>
                <Text style={estilos.tabCol}>{mnTotal > 0 ? `${formatarNumero((itensCalc[k].kg_mn / mnTotal) * 100, 1)}%` : '–'}</Text>
              </View>
            ))}
            <View style={estilos.tabLinha}>
              <Text style={[estilos.tabNome, estilos.tabCab]}>Total</Text>
              <Text style={[estilos.tabCol, estilos.tabCab, Math.abs(somaPct - 100) > 0.5 && { color: cores.erro }]}>{formatarNumero(somaPct, 1)}%</Text>
              <Text style={[estilos.tabCol, estilos.tabCab]}>{mnTotal > 0 ? '100%' : '–'}</Text>
            </View>
          </View>
          {ajustado ? (
            <Botao titulo="⚙️  Voltar ao formulado pelo menor custo" tipo="secundario" onPress={() => formularDieta()} />
          ) : (
            <Text style={estilos.nota}>Formulado pelo sistema. Para seguir a fórmula do técnico, mude o % de qualquer insumo (o total precisa fechar 100%).</Text>
          )}

          {/* ----- 4. a dieta: o que vai no cocho ----- */}
          <Secao titulo="Dieta (por cabeça por dia)" />
          {cms ? (
            <View style={estilos.item}>
              <Text style={estilos.itemCalc}>
                Consumo de matéria seca: {formatarNumero(cms, 2)} kg{usaPerc ? ` (${formatarNumero(n(cmsPerc) ?? cmsPad(apt), 2)}% do peso vivo)` : ''}
              </Text>
              {itensCalc.map((i) => (
                <View key={i.chave} style={estilos.tabLinha}>
                  <Text style={estilos.tabNome}>{i.nome}</Text>
                  <Text style={estilos.tabCol}>{formatarNumero(i.kg_mn, 2)} kg</Text>
                  <Text style={estilos.tabCol}>{i.preco_kg_mn != null ? formatarMoeda(i.kg_mn * i.preco_kg_mn) : '–'}</Text>
                </View>
              ))}
              <View style={estilos.tabLinha}>
                <Text style={[estilos.tabNome, estilos.tabCab]}>Total no cocho</Text>
                <Text style={[estilos.tabCol, estilos.tabCab]}>{formatarNumero(mnTotal, 2)} kg</Text>
                <Text style={[estilos.tabCol, estilos.tabCab]}>{formatarMoeda(itensCalc.reduce((t, i) => t + i.kg_mn * (i.preco_kg_mn ?? 0), 0))}</Text>
              </View>
            </View>
          ) : null}
        </>
      )}

      {/* ----- V175: tratos e fornecimento ----- */}
      <Secao titulo="Tratos e fornecimento" />
      <Campo rotulo="Tratos por dia" value={tratos} onChangeText={(t) => setTratos(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder={String(tratosPad)} />
      {itensCalc.some((i) => i.kg_mn > 0) && (
        <View style={estilos.item}>
          <Text style={estilos.itemNome}>
            Cada trato ({tratosN} por dia){cabN ? ` – lote de ${formatarNumero(cabN)} cabeças` : ' – por cabeça'}
          </Text>
          {itensCalc
            .filter((i) => i.kg_mn > 0)
            .map((i) => (
              <Text key={i.chave} style={estilos.itemCalc}>
                {i.nome}: {formatarNumero((i.kg_mn * (cabN || 1)) / tratosN, cabN ? 1 : 2)} kg
              </Text>
            ))}
          <Text style={estilos.nota}>
            No dia: {formatarNumero(itensCalc.reduce((t, i) => t + i.kg_mn, 0) * (cabN || 1), cabN ? 1 : 2)} kg de matéria natural{cabN ? ' para o lote' : ' por cabeça'}.
          </Text>
        </View>
      )}
      <Escolha
        opcoes={[{ valor: 'sim', rotulo: 'Fornecer sozinho todo dia (baixa o estoque para o lote)' }]}
        valor={auto}
        aoMudar={setAuto}
        multiplo
        erro={erros.auto}
      />
      {auto.length > 0 && (
        <>
          <CampoData rotulo="A partir de" valor={desde} aoMudar={setDesde} erro={erros.desde} />
          <Text style={estilos.nota}>
            Todo dia o sistema lança o trato do lote por esta dieta (cabeças do dia × kg por cabeça) e baixa o estoque pelo custo médio; o custo vai para o centro de custo do lote. Quando o servido for diferente, corrija em Pecuário › Trato do dia. Em branco, começa na data da dieta.
          </Text>
          {itens.some((i) => i.alimento_id && semEstoque[i.alimento_id]) && (
            <Aviso
              tipo="info"
              texto={`Sem ligação com o estoque: ${itens
                .filter((i) => i.alimento_id && semEstoque[i.alimento_id])
                .map((i) => i.nome)
                .join(', ')}. Esses entram no trato, mas não baixam o estoque nem vão ao custo. Ligue o alimento ao produto em Pecuário › Alimentos.`}
            />
          )}
        </>
      )}

      {/* ----- 3. balanço, alertas e ficha ----- */}
      <PainelDieta
        itens={itensCalc}
        metas={metas}
        cms={cms}
        pv={n(pv)}
        aptidao={apt}
        gmd={n(gmd)}
        leite={n(leite)}
        cabecas={cabN}
        tratos={tratosN}
        tituloFicha={`Dieta nº ${id ? numero : proximo ?? ''}${descricao ? ` – ${descricao}` : ''}`}
        data={data}
      />

      <Secao titulo="Outros" />
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={id ? 'Salvar alterações' : 'Gravar dieta'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir dieta" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 20 },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  itemNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemComp: { fontSize: tam.pequeno, color: cores.textoSuave },
  itemCalc: { fontSize: tam.pequeno + 1, color: cores.texto },
  tabLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  tabNome: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto },
  tabCol: { width: 96, fontSize: tam.pequeno + 1, color: cores.texto, textAlign: 'right' },
  tabCab: { fontWeight: '800' },
});
