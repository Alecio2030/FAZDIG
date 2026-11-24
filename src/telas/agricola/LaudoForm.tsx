import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Vazio from '../../componentes/Vazio';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import EntradaDocumento from '../../componentes/EntradaDocumento';
import QuadroDiagnostico from '../../componentes/QuadroDiagnostico';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../../lib/datas';
import { lerNumero, numeroParaCampo } from '../../lib/formatos';
import { abrirFotoDocumento } from '../../lib/documentos';
import { limparBusca } from '../../lib/useBusca';
import { PROFUNDIDADES } from '../../lib/talhoes';
import { EPOCAS_FOLIAR, calagem, classeFoliar, completarSolo, eConilon, parametrosDe } from '../../lib/agronomia';
import { AVISO_SUGESTAO, PARAMETROS_CORRETIVO, PARAMETROS_ORGANICO, diagnosticoCorretivo, diagnosticoFoliar, diagnosticoOrganico, diagnosticoSolo, prntDoLaudo, type Referencias } from '../../lib/diagnostico';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type TipoLaudo = 'solo' | 'foliar' | 'organico' | 'corretivo';
const TIPOS: { valor: TipoLaudo; rotulo: string }[] = [
  { valor: 'solo', rotulo: 'Solo' },
  { valor: 'foliar', rotulo: 'Foliar (folha)' },
  { valor: 'organico', rotulo: 'Adubo orgânico' },
  { valor: 'corretivo', rotulo: 'Calcário (corretivo)' },
];
const ROTULO_TIPO: Record<string, string> = { solo: 'Solo', foliar: 'Foliar', organico: 'Adubo orgânico', corretivo: 'Calcário' };
/** Uma amostra do laudo, já em texto para conferência. */
type AmostraTela = { identificacao: string; prof: string[]; valores: Record<string, string>; referencias: Referencias | null; talhaoId: string | null; gravar: boolean };
type Talhao = { id: string; nome: string; fazenda_id: string; fazenda: string; especie: string | null };

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const paraTexto = (v: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => typeof x === 'number' && Number.isFinite(x)).map(([k, x]) => [k, numeroParaCampo(x as number)]));
const paraNumeros = (v: Record<string, string>) => {
  const r: Record<string, number> = {};
  for (const [k, t] of Object.entries(v)) {
    const n = lerNumero(t);
    if (t.trim() && n != null && n >= 0) r[k] = n;
  }
  return r;
};
/** Época da coleta da folha pelo mês: pré-florada (jun a ago), granação (nov a fev); fora disso, outra. */
const epocaPelaData = (iso: string | null) => {
  const m = iso ? Number(iso.slice(5, 7)) : 0;
  return m >= 6 && m <= 8 ? 'pre_florada' : m >= 11 || (m >= 1 && m <= 2) ? 'granacao' : 'outra';
};

/**
 * V166 · Agrícola › Análises e laudos: foto ou PDF do laudo de solo, folha, adubo orgânico ou calcário.
 * A IA lê, a tela abre para conferência e, ao gravar, o sistema mostra o que está fora do padrão e as sugestões.
 * Solo e folha: cada amostra vai para o talhão escolhido. Adubo e calcário: o laudo fica ligado ao produto do estoque.
 */
export default function LaudoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'LaudoForm'>>();
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [id, setId] = useState<string | null>(null); // laudo de insumo em alteração
  const [tipo, setTipo] = useState<TipoLaudo[]>([]);
  const [data, setData] = useState(hojeBR());
  const [lab, setLab] = useState('');
  const [laudo, setLaudo] = useState('');
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [epoca, setEpoca] = useState<string[]>(['outra']);
  const [amostras, setAmostras] = useState<AmostraTela[]>([]);
  // adubo e calcário
  const [valores, setValores] = useState<Record<string, string>>({});
  const [base, setBase] = useState<string[]>([]);
  const [fornecedor, setFornecedor] = useState('');
  const [amostraIns, setAmostraIns] = useState('');
  const [insumoId, setInsumoId] = useState<string | null>(null);
  const [levar, setLevar] = useState(true);
  const [obs, setObs] = useState('');

  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [avisoDoc, setAvisoDoc] = useState<string | null>(null);
  const [salvos, setSalvos] = useState<{ id: string; nome: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  // V167: PRNT para a conta da calagem na prévia (último laudo de calcário; sem ele, 85)
  const [prntPrevia, setPrntPrevia] = useState(85);
  // V167: amostras marcadas para gravar sem talhão escolhido (mostra o erro no próprio campo)
  const [semTalhao, setSemTalhao] = useState<number[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);

  const t = tipo[0];
  const ehInsumo = t === 'organico' || t === 'corretivo';

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? 'Alterar laudo' : 'Análises e laudos' });
  }, [navegacao, id]);

  useEffect(() => {
    (async () => {
      try {
        const [ar, fz] = await Promise.all([
          consulta<any[]>(supabase.from('areas').select('id, nome, fazenda_id, especie').eq('tipo', 'talhao').eq('ativa', true).order('nome')),
          consulta<any[]>(supabase.from('fazendas').select('id, nome')),
        ]);
        setTalhoes(ar.map((a) => ({ id: a.id, nome: a.nome, fazenda_id: a.fazenda_id, especie: a.especie ?? null, fazenda: fz.find((f) => f.id === a.fazenda_id)?.nome ?? '' })));
        const { data: lc } = await supabase.from('laudos_insumo').select('dados').eq('tipo', 'corretivo').order('data', { ascending: false }).limit(1);
        const pr = (lc as any[] | null)?.[0] ? prntDoLaudo((lc as any[])[0].dados ?? {}) : null;
        if (pr) setPrntPrevia(Math.round(pr * 10) / 10);
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
  }, []);

  const carregarTalhoes = useCallback(async (): Promise<ItemLista[]> => talhoes.map((x) => ({ id: x.id, titulo: x.nome, detalhe: x.fazenda })), [talhoes]);
  const carregarInsumos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('insumos').select('id, nome, categoria, atributos').in('categoria', ['adubo', 'fertilizante']).eq('ativo', true).order('nome'));
    // orgânico: os adubos orgânicos; calcário: os fertilizantes, com os marcados "Corretivo de solo" primeiro
    const corretivo = (i: any) => /corretivo/i.test(i.atributos?.natureza ?? '') || /calc[aá]rio/i.test(i.nome ?? '');
    return d
      .filter((i) => (t === 'organico' ? i.categoria === 'adubo' : i.categoria === 'fertilizante'))
      .sort((a, b) => Number(corretivo(b)) - Number(corretivo(a)))
      .map((i) => ({ id: i.id, titulo: i.nome, detalhe: i.categoria === 'adubo' ? 'Adubo orgânico' : i.atributos?.natureza ?? 'Fertilizante' }));
  }, [t]);

  function limpar() {
    setId(null);
    setTipo([]);
    setData(hojeBR());
    setLab('');
    setLaudo('');
    setArquivo(null);
    setEpoca(['outra']);
    setAmostras([]);
    setValores({});
    setBase([]);
    setFornecedor('');
    setAmostraIns('');
    setInsumoId(null);
    setLevar(true);
    setObs('');
    setAvisoDoc(null);
  }

  /** Talhão cujo nome aparece na identificação da amostra (ex.: "AMOSTRA - CHAPADA - 0-20" → talhão Chapada). */
  function talhaoPeloNome(ident: string): string | null {
    const i = semAcento(ident);
    const achados = talhoes.filter((x) => x.nome.trim().length >= 3 && i.includes(semAcento(x.nome.trim())));
    return achados.length === 1 ? achados[0].id : null;
  }

  // ---- leitura do laudo: preenche para conferência; nada é gravado aqui
  function aoLer(d: any, arq: string | null) {
    setErro(null);
    setAviso(null);
    setSalvos([]);
    const tp: TipoLaudo = ['solo', 'foliar', 'organico', 'corretivo'].includes(d?.tipo) ? d.tipo : 'solo';
    limpar();
    setTipo([tp]);
    setLab(d?.laboratorio ?? '');
    setLaudo(d?.numero_laudo ?? '');
    const dataOk = d?.data && /^\d{4}-\d{2}-\d{2}$/.test(d.data) && d.data <= hojeBanco() ? d.data : null;
    if (dataOk) setData(doBanco(dataOk));
    setArquivo(arq);
    const ams: any[] = Array.isArray(d?.amostras) ? d.amostras : [];
    const partes = [`Laudo lido: ${ROTULO_TIPO[tp].toLowerCase()}, ${ams.length} ${ams.length === 1 ? 'amostra' : 'amostras'}.`];
    if (d?.legivel === false || !ams.length) partes.push('Quase nada pôde ser lido: tente outra foto, mais de perto, ou digite os valores.');
    if (tp === 'solo' || tp === 'foliar') {
      setEpoca([epocaPelaData(dataOk)]);
      const lista = ams.map((a) => {
        const ident = String(a.identificacao ?? '').trim();
        const p = String(a.profundidade ?? '').replace(/\s|cm/gi, '').replace(/[-a]/, '–');
        const prof = PROFUNDIDADES.find((x) => x.valor.replace(/\s|cm/g, '') === p)?.valor ?? '0–20 cm';
        const talhaoId = talhaoPeloNome(ident);
        // sem talhão achado pelo nome, a amostra vem desmarcada: o diagnóstico aparece e nada trava
        return { identificacao: ident, prof: [prof], valores: paraTexto(a.valores), referencias: a.referencias && Object.keys(a.referencias).length ? a.referencias : null, talhaoId, gravar: !!talhaoId };
      });
      setAmostras(lista);
      partes.push(
        lista.some((x) => x.talhaoId)
          ? 'O sistema achou o talhão de alguma amostra pelo nome: confira.'
          : 'O diagnóstico de cada amostra está logo abaixo dos valores. Para guardar no histórico de um talhão, marque "Gravar no talhão" e escolha o talhão.',
      );
      if (tp === 'foliar') partes.push('Confira a época da coleta: as faixas do conilon valem para a pré-florada e a granação; fora delas, vale a faixa do laboratório.');
    } else {
      const a = ams[0] ?? {};
      setValores(paraTexto(a.valores));
      setAmostraIns(String(a.identificacao ?? '').trim());
      if (d?.base === 'seca' || d?.base === 'umida') setBase([d.base]);
      if (tp === 'organico' && d?.cliente) setFornecedor(String(d.cliente));
      if (ams.length > 1) partes.push(`O laudo tem ${ams.length} amostras: a tela trouxe a primeira; as outras, lance de novo.`);
      partes.push('Escolha o produto do estoque, se ele já estiver cadastrado.');
    }
    const conv = ams.flatMap((a) => a.conversoes ?? []);
    if (conv.length) partes.push(`Unidades convertidas: ${[...new Set(conv)].slice(0, 6).join('; ')}.`);
    if ((d?.nao_lido ?? []).length) partes.push(`Não veio na leitura: ${[...new Set(d.nao_lido as string[])].join(', ')}.`);
    if (d?.propriedade) partes.push(`Propriedade no laudo: ${d.propriedade}.`);
    partes.push('Confira cada valor com o papel antes de gravar.');
    setAvisoDoc(partes.join(' '));
  }

  // ---- alterar um laudo de adubo ou calcário (vem da Consulta)
  useEffect(() => {
    if (!params?.abrirId) return;
    (async () => {
      try {
        const l = await consulta<any>(supabase.from('laudos_insumo').select('*').eq('id', params.abrirId!).single());
        limpar();
        setId(l.id);
        setTipo([l.tipo]);
        setData(doBanco(l.data));
        setLab(l.laboratorio ?? '');
        setLaudo(l.numero_laudo ?? '');
        setAmostraIns(l.amostra ?? '');
        setFornecedor(l.fornecedor ?? '');
        setBase(l.base ? [l.base] : []);
        setValores(paraTexto(l.dados ?? {}));
        setInsumoId(l.insumo_id);
        setLevar(false);
        setArquivo(l.arquivo_documento ?? null);
        setObs(l.observacoes ?? '');
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.abrirId]);

  const mudarAmostra = (k: number, campo: keyof AmostraTela, v: any) => setAmostras((l) => l.map((x, i) => (i === k ? { ...x, [campo]: v } : x)));

  async function gravarTalhoes() {
    const iso = paraBanco(data);
    if (!iso || !dataValida(data) || iso > hojeBanco()) return setErro('Informe a data do laudo (não pode ser futura).');
    const escolhidas = amostras.filter((a) => a.gravar);
    if (!escolhidas.length) {
      // nenhuma marcada: marca todas e abre o campo do talhão em cada uma
      setAmostras((l) => l.map((x) => ({ ...x, gravar: true })));
      setSemTalhao(amostras.map((_, i) => i).filter((i) => !amostras[i].talhaoId));
      return setErro('Escolha o talhão de cada amostra (o campo apareceu em cada uma, acima) e toque em Gravar de novo. A que não quiser gravar, desmarque.');
    }
    const faltam = amostras.map((a, i) => (a.gravar && !a.talhaoId ? i : -1)).filter((i) => i >= 0);
    setSemTalhao(faltam);
    if (faltam.length) return setErro(`Escolha o talhão da amostra ${faltam.map((i) => i + 1).join(' e ')} para gravar, ou desmarque "Gravar no talhão". O diagnóstico de cada amostra já está na tela, mesmo sem gravar.`);
    const lista = parametrosDe(t);
    const linhas = escolhidas.map((a) => {
      const dados: Record<string, number> = {};
      const nums = paraNumeros(a.valores);
      for (const p of lista) if (nums[p.chave] != null) dados[p.chave] = nums[p.chave];
      const ta = talhoes.find((x) => x.id === a.talhaoId)!;
      return {
        fazenda_id: ta.fazenda_id,
        area_id: ta.id,
        data: iso,
        tipo: t,
        profundidade: t === 'solo' ? a.prof[0] : null,
        epoca: t === 'foliar' ? epoca[0] : null,
        laboratorio: lab.trim() || null,
        numero_laudo: laudo.trim() || null,
        amostra: a.identificacao || null,
        arquivo_documento: arquivo,
        referencias: a.referencias,
        dados,
        ph: dados.ph ?? null,
        p: dados.p ?? null,
        k: dados.k ?? null,
        ca: dados.ca ?? null,
        mg: dados.mg ?? null,
        mo: dados.mo ?? null,
        v: dados.v ?? null,
        n: dados.n ?? null,
      };
    });
    if (linhas.some((l) => !Object.keys(l.dados).length)) return setErro('Há amostra sem nenhum valor: confira ou desmarque.');
    setSalvando(true);
    const { data: r, error } = await supabase.from('talhao_analises').insert(linhas).select('id, area_id');
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const gravados = ((r as any[]) ?? []).map((x) => ({ id: x.id, nome: talhoes.find((ta) => ta.id === x.area_id)?.nome ?? 'talhão' }));
    limpar();
    setSalvos(gravados);
    setAviso(`${gravados.length === 1 ? 'Análise gravada' : `${gravados.length} análises gravadas`}.${gravados.length > 1 ? ' Abra cada uma abaixo.' : ''}`);
    // vai direto para o diagnóstico (o da primeira, quando são várias)
    if (gravados[0]) navegacao.navigate('AnaliseDetalhe', { id: gravados[0].id });
  }

  async function gravarInsumo() {
    const iso = paraBanco(data);
    if (!iso || !dataValida(data) || iso > hojeBanco()) return setErro('Informe a data do laudo (não pode ser futura).');
    const dados = paraNumeros(valores);
    if (!Object.keys(dados).length) return setErro('Informe pelo menos um resultado do laudo.');
    const linha = {
      tipo: t,
      insumo_id: insumoId,
      data: iso,
      laboratorio: lab.trim() || null,
      numero_laudo: laudo.trim() || null,
      amostra: amostraIns.trim() || null,
      fornecedor: fornecedor.trim() || null,
      base: t === 'organico' ? base[0] ?? null : null,
      dados,
      arquivo_documento: arquivo,
      observacoes: obs.trim() || null,
    };
    setSalvando(true);
    const { data: r, error } = id
      ? await supabase.from('laudos_insumo').update(linha).eq('id', id).select('id').single()
      : await supabase.from('laudos_insumo').insert(linha).select('id').single();
    if (error) {
      setSalvando(false);
      return setErro(traduzirErro(error));
    }
    // leva os teores para o cadastro do produto (o que o laudo trouxe substitui; o resto fica)
    let avisoProd = '';
    if (insumoId && levar) {
      const { data: ins } = await supabase.from('insumos').select('atributos').eq('id', insumoId).single();
      const atual = ((ins as any)?.atributos ?? {}) as Record<string, string>;
      const txt = (x: number | undefined) => (x == null ? undefined : numeroParaCampo(Math.round(x * 100) / 100));
      const novos: Record<string, string | undefined> =
        t === 'organico'
          ? { mo: txt(dados.mo), c: txt(dados.c), umidade: txt(dados.umidade), cn: txt(dados.cn), n: txt(dados.n), p: txt(dados.p2o5), k: txt(dados.k2o), ca: txt(dados.ca), mg: txt(dados.mg) }
          : { natureza: 'Corretivo de solo', prnt: txt(dados.prnt ?? undefined), cao: txt(dados.cao), mgo: txt(dados.mgo) };
      const junto = { ...atual, ...Object.fromEntries(Object.entries(novos).filter(([, v]) => v != null)) };
      const { error: e2 } = await supabase.from('insumos').update({ atributos: junto }).eq('id', insumoId);
      avisoProd = e2 ? ` Os teores não foram para o produto: ${traduzirErro(e2)}` : ' Os teores foram levados para o cadastro do produto.';
    }
    setSalvando(false);
    const lid = (r as any).id;
    limpar();
    setAviso(`Laudo ${id ? 'alterado' : 'gravado'}.${avisoProd}`);
    navegacao.navigate('LaudoInsumoDetalhe', { id: lid });
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaLaudos />
      </Tela>
    );
  }

  const lista = t === 'organico' ? PARAMETROS_ORGANICO : t === 'corretivo' ? PARAMETROS_CORRETIVO : [];
  const nums = paraNumeros(valores);
  const previa = t === 'organico' ? diagnosticoOrganico(nums, base[0]) : t === 'corretivo' ? diagnosticoCorretivo(nums) : null;

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {salvos.map((s) => (
        <Botao key={s.id} titulo={`Ver o diagnóstico: talhão ${s.nome}`} tipo="secundario" onPress={() => navegacao.navigate('AnaliseDetalhe', { id: s.id })} />
      ))}

      {!id && (
        <EntradaDocumento
          titulo="Laudo do laboratório"
          tipo="analise"
          aceitaArquivo
          rotuloFoto="Foto do laudo"
          instrucao="Enquadre a tabela de resultados inteira, bem reta e com boa luz."
          dica="Solo, folha, adubo orgânico ou calcário: a IA reconhece o tipo, lê os resultados e converte as unidades. Também pelo PDF do laboratório. Nada é gravado sem o seu Gravar."
          textoLendo="Lendo o laudo… (uns 20 segundos)"
          aoLer={(d, arq) => aoLer(d, arq)}
          aoErro={setErro}
        />
      )}
      {avisoDoc && <Aviso tipo="info" texto={avisoDoc} />}
      {arquivo && (
        <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(arquivo)) && setErro('Não foi possível abrir o laudo.')}>
          📄 Ver o laudo
        </Text>
      )}

      <Escolha
        rotulo="Tipo de laudo"
        opcoes={id ? TIPOS.filter((x) => x.valor === t) : TIPOS}
        valor={tipo}
        aoMudar={(v) => {
          if (v[0] === t) return;
          setTipo(v as TipoLaudo[]);
          setValores({});
          if ((v[0] === 'solo' || v[0] === 'foliar') && !amostras.length) {
            setAmostras([{ identificacao: '', prof: ['0–20 cm'], valores: {}, referencias: null, talhaoId: null, gravar: true }]);
          }
        }}
      />
      {!t && <Text style={estilos.nota}>Leia o laudo pela foto ou pelo PDF, ou escolha o tipo para digitar.</Text>}

      {!!t && (
        <>
          <CampoData rotulo="Data do laudo *" valor={data} aoMudar={setData} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Laboratório" value={lab} onChangeText={setLab} autoCapitalize="words" />
            </View>
            <View style={{ width: 130 }}>
              <Campo rotulo="Nº do laudo" value={laudo} onChangeText={setLaudo} autoCapitalize="characters" />
            </View>
          </View>
        </>
      )}

      {(t === 'solo' || t === 'foliar') && (
        <>
          {t === 'foliar' && <Escolha rotulo="Época da coleta das folhas" opcoes={EPOCAS_FOLIAR} valor={epoca} aoMudar={setEpoca} />}
          {amostras.map((a, k) => (
            <View key={k} style={estilos.amostra}>
              <Interruptor rotulo={`Amostra ${k + 1}${a.identificacao ? `: ${a.identificacao}` : ''}`} descricao="Gravar no talhão (o diagnóstico aparece abaixo mesmo sem gravar)" valor={a.gravar} aoMudar={(v) => mudarAmostra(k, 'gravar', v)} />
              {a.gravar && (
                  <SeletorLista
                    rotulo="Talhão desta amostra *"
                    valorId={a.talhaoId}
                    aoMudar={(v) => {
                      mudarAmostra(k, 'talhaoId', v);
                      setSemTalhao((l) => l.filter((i) => i !== k));
                    }}
                    carregar={carregarTalhoes}
                    dicaBusca="Nome do talhão"
                    vazio="Nenhum talhão cadastrado. Cadastre em Agrícola › Talhões, ou desmarque Gravar e veja só o diagnóstico."
                    erro={semTalhao.includes(k) ? 'Escolha o talhão, ou desmarque "Gravar no talhão".' : null}
                  />
              )}
              <>
                  <Campo rotulo="Identificação da amostra" value={a.identificacao} onChangeText={(v) => mudarAmostra(k, 'identificacao', v)} autoCapitalize="sentences" />
                  {t === 'solo' && <Escolha rotulo="Profundidade" opcoes={PROFUNDIDADES} valor={a.prof} aoMudar={(v) => mudarAmostra(k, 'prof', v)} />}
                  <View style={estilos.grade}>
                    {parametrosDe(t).map((p) => (
                      <View key={p.chave} style={estilos.celula}>
                        <Campo
                          rotulo={`${p.rotulo}${p.unidade ? ` (${p.unidade})` : ''}`}
                          value={a.valores[p.chave] ?? ''}
                          onChangeText={(v) => mudarAmostra(k, 'valores', { ...a.valores, [p.chave]: v })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                  </View>
                  {a.referencias && <Text style={estilos.nota}>O laudo trouxe a coluna de valor adequado do laboratório: ela vai junto.</Text>}
                  <PreviaAmostra amostra={a} tipo={t} epoca={epoca[0]} prnt={prntPrevia} especie={talhoes.find((x) => x.id === a.talhaoId)?.especie ?? null} numero={k + 1} />
              </>
            </View>
          ))}
          <Text
            style={estilos.link}
            onPress={() => setAmostras((l) => [...l, { identificacao: '', prof: ['0–20 cm'], valores: {}, referencias: null, talhaoId: null, gravar: true }])}
          >
            + Amostra
          </Text>
          <Text style={estilos.nota}>{t === 'solo' ? 'SB, CTC, V% e m% podem ficar em branco: o sistema calcula.' : 'Macronutrientes em g/kg (dag/kg × 10).'}</Text>
          {erro && <Aviso tipo="erro" texto={erro} />}
          <Botao titulo="Gravar no talhão e abrir o diagnóstico" onPress={gravarTalhoes} carregando={salvando} />
          <Text style={estilos.nota}>Sem gravar, o diagnóstico de cada amostra (acima) vale como consulta.</Text>
        </>
      )}

      {ehInsumo && (
        <>
          <SeletorLista
            rotulo={t === 'organico' ? 'Produto do estoque (adubo orgânico)' : 'Produto do estoque (calcário)'}
            valorId={insumoId}
            aoMudar={setInsumoId}
            carregar={carregarInsumos}
            permitirLimpar
            vazio="Nenhum produto desse tipo no estoque. Pode gravar o laudo sem ligar a um produto."
          />
          {insumoId && <Interruptor rotulo="Levar os teores para o cadastro do produto" descricao={t === 'organico' ? 'MO, carbono, umidade, C/N, N, P₂O₅, K₂O, Ca e Mg.' : 'PRNT, CaO e MgO: a calagem passa a usar este PRNT.'} valor={levar} aoMudar={setLevar} />}
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo={t === 'organico' ? 'Fornecedor / origem' : 'Fornecedor / jazida'} value={fornecedor} onChangeText={setFornecedor} autoCapitalize="words" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Amostra / lote" value={amostraIns} onChangeText={setAmostraIns} autoCapitalize="sentences" />
            </View>
          </View>
          {t === 'organico' && (
            <Escolha
              rotulo="Os teores do laudo estão sobre"
              opcoes={[
                { valor: 'seca', rotulo: 'Matéria seca' },
                { valor: 'umida', rotulo: 'Produto como vem (úmido)' },
              ]}
              valor={base}
              aoMudar={(v) => setBase(base[0] === v[0] ? [] : v)}
            />
          )}
          <Secao titulo="Resultados" />
          <View style={estilos.grade}>
            {lista.map((p) => (
              <View key={p.chave} style={estilos.celula}>
                <Campo rotulo={`${p.rotulo}${p.unidade ? ` (${p.unidade})` : ''}`} value={valores[p.chave] ?? ''} onChangeText={(v) => setValores((x) => ({ ...x, [p.chave]: v }))} keyboardType="decimal-pad" />
              </View>
            ))}
          </View>
          <Campo rotulo="Observação" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 60, paddingTop: 12, textAlignVertical: 'top' }} />
          {previa && previa.achados.length > 0 && <QuadroDiagnostico diagnostico={previa} titulo="O que está fora do padrão" />}
          {erro && <Aviso tipo="erro" texto={erro} />}
          <Botao titulo={id ? 'Salvar alteração' : 'Gravar laudo'} onPress={gravarInsumo} carregando={salvando} />
          {id && <Botao titulo="Cancelar a alteração" tipo="texto" onPress={() => navegacao.goBack()} />}
        </>
      )}

      {!t && <Text style={estilos.avisoRodape}>{AVISO_SUGESTAO}</Text>}
    </Tela>
  );
}

/**
 * V167 · Diagnóstico de uma amostra de solo ou folha direto na tela de conferência, antes de gravar
 * (e mesmo sem talhão). Muda na hora se um valor for corrigido.
 */
function PreviaAmostra({ amostra, tipo, epoca, prnt, especie, numero }: { amostra: AmostraTela; tipo: string; epoca: string; prnt: number; especie: string | null; numero: number }) {
  const [aberto, setAberto] = useState(true);
  const nums = paraNumeros(amostra.valores);
  if (!Object.keys(nums).length) return null;
  let diag;
  let nota: string | null = null;
  if (tipo === 'solo') {
    const { valores } = completarSolo(nums);
    const cal = calagem(valores, prnt, true);
    diag = diagnosticoSolo(valores, cal, null);
    if (cal?.precisa) nota = `Calagem calculada com PRNT ${numeroParaCampo(prnt)}% e aplicação em cobertura (lavoura formada). Depois de gravar no talhão, a conta usa os dados do talhão e dá a dose por planta.`;
  } else {
    // conilon: faixa do Incaper; sem talhão escolhido, vale a faixa do laboratório (se o laudo trouxer) e, sem ela, a do conilon
    const usaConilon = especie ? eConilon(especie) : !amostra.referencias;
    diag = diagnosticoFoliar(nums, (ch) => (usaConilon ? classeFoliar(ch, 0, epoca)?.faixa ?? null : null), amostra.referencias);
  }
  return (
    <View style={{ gap: 8 }}>
      <Botao titulo={aberto ? `Esconder o diagnóstico da amostra ${numero}` : `Ver o diagnóstico da amostra ${numero}`} tipo="secundario" onPress={() => setAberto(!aberto)} />
      {aberto && (
        <>
          <QuadroDiagnostico diagnostico={diag} titulo={`Amostra ${numero}: o que está fora do padrão`} />
          {nota && <Text style={estilos.nota}>{nota}</Text>}
        </>
      )}
    </View>
  );
}

/** Consulta: todos os laudos (talhões, adubos e calcários), do mais novo para o mais velho; a busca filtra. */
function ConsultaLaudos() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendas } = useSessao();
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const termo = semAcento(limparBusca(busca));

  useEffect(() => {
    (async () => {
      try {
        const [an, li] = await Promise.all([
          consulta<any[]>(supabase.from('talhao_analises').select('id, data, tipo, amostra, laboratorio, numero_laudo, fazenda_id, area:areas ( nome )').order('data', { ascending: false }).limit(150)),
          consulta<any[]>(supabase.from('laudos_insumo').select('id, data, tipo, amostra, laboratorio, numero_laudo, fornecedor, insumo:insumos ( nome )').order('data', { ascending: false }).limit(150)),
        ]);
        const um = (x: any) => (Array.isArray(x) ? x[0] : x);
        setItens(
          [
            ...an.map((a) => ({ ...a, origem: 'talhao', nome: `Talhão ${um(a.area)?.nome ?? ''}`, faz: fazendas.find((f) => f.id === a.fazenda_id)?.nome })),
            ...li.map((l) => ({ ...l, origem: 'insumo', nome: um(l.insumo)?.nome ?? l.fornecedor ?? 'Produto não ligado' })),
          ].sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : 0)),
        );
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
  }, [fazendas]);

  const filtrados = (itens ?? []).filter((x) => !termo || semAcento([x.nome, x.amostra, x.laboratorio, x.numero_laudo, x.fornecedor, ROTULO_TIPO[x.tipo], x.faz].filter(Boolean).join(' ')).includes(termo));
  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Busca valor={busca} aoMudar={setBusca} dica="Talhão, produto, laboratório, nº do laudo ou tipo" />
      {itens && filtrados.length === 0 && <Vazio icone="flask-outline" texto={termo ? 'Nenhum laudo com esse texto.' : 'Nenhum laudo lançado ainda.'} />}
      {filtrados.length > 0 && (
        <Lista>
          {filtrados.slice(0, 60).map((x) => (
            <Linha
              key={`${x.origem}${x.id}`}
              titulo={`${ROTULO_TIPO[x.tipo] ?? x.tipo} · ${x.nome}`}
              linhas={[[doBanco(x.data), x.amostra, x.laboratorio, x.numero_laudo ? `laudo ${x.numero_laudo}` : null].filter(Boolean).join(' · '), x.faz ?? null]}
              onPress={() => (x.origem === 'talhao' ? navegacao.navigate('AnaliseDetalhe', { id: x.id }) : navegacao.navigate('LaudoInsumoDetalhe', { id: x.id }))}
            />
          ))}
        </Lista>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  celula: { width: '47%', flexGrow: 1 },
  amostra: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 10 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  avisoRodape: { fontSize: tam.pequeno, color: cores.cafe, lineHeight: 19, fontWeight: '600' },
});
