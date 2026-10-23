import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import EntradaDocumento from '../../componentes/EntradaDocumento';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../../lib/datas';
import { lerNumero, numeroParaCampo } from '../../lib/formatos';
import { abrirFotoDocumento } from '../../lib/documentos';
import { PROFUNDIDADES } from '../../lib/talhoes';
import { EPOCAS_FOLIAR, parametrosDe } from '../../lib/agronomia';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Amostra = { identificacao: string | null; profundidade: string | null; valores: Record<string, number>; conversoes?: string[] };

/** Análise de solo ou foliar de um talhão: foto do laudo (a IA lê) ou digitada. Abre para conferência; nada grava sozinho. */
export default function AnaliseForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AnaliseForm'>>();
  const [talhao, setTalhao] = useState<any>(null);
  const [data, setData] = useState(hojeBR());
  const [tipo, setTipo] = useState<string[]>(['solo']);
  const [prof, setProf] = useState<string[]>(['0–20 cm']);
  const [epoca, setEpoca] = useState<string[]>(['pre_florada']);
  const [lab, setLab] = useState('');
  const [laudo, setLaudo] = useState('');
  const [amostra, setAmostra] = useState('');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [amostras, setAmostras] = useState<Amostra[]>([]);
  const [escolhida, setEscolhida] = useState<string[]>([]);
  const [avisoDoc, setAvisoDoc] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(!!params.id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const lista = parametrosDe(tipo[0]);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: params.id ? 'Alterar análise' : 'Nova análise' });
  }, [navegacao, params.id]);

  useEffect(() => {
    (async () => {
      try {
        setTalhao(await consulta<any>(supabase.from('areas').select('id, nome, fazenda_id, especie').eq('id', params.areaId).single()));
        if (params.id) {
          const a = await consulta<any>(supabase.from('talhao_analises').select('*').eq('id', params.id).single());
          setData(doBanco(a.data));
          setTipo([a.tipo]);
          if (a.profundidade) setProf([a.profundidade]);
          if (a.epoca) setEpoca([a.epoca]);
          setLab(a.laboratorio ?? '');
          setLaudo(a.numero_laudo ?? '');
          setAmostra(a.amostra ?? '');
          setObs(a.observacoes ?? '');
          setArquivo(a.arquivo_documento ?? null);
          setValores(Object.fromEntries(Object.entries((a.dados ?? {}) as Record<string, number>).map(([k, v]) => [k, numeroParaCampo(v)])));
        }
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [params.areaId, params.id]);

  function aplicarAmostra(a: Amostra, tipoLaudo: string) {
    setValores(Object.fromEntries(Object.entries(a.valores ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, numeroParaCampo(v)])));
    setAmostra(a.identificacao ?? '');
    if (tipoLaudo === 'solo' && a.profundidade) {
      const p = a.profundidade.replace(/\s|cm/gi, '').replace(/[-a]/, '–');
      const achou = PROFUNDIDADES.find((x) => x.valor.replace(/\s|cm/g, '') === p);
      if (achou) setProf([achou.valor]);
    }
  }

  /** Laudo lido pela IA: preenche a tela para conferência. Com várias amostras, pergunta qual é a deste talhão. */
  function aplicarLaudo(d: any, arq: string | null) {
    setErro(null);
    const ams: Amostra[] = Array.isArray(d.amostras) ? d.amostras : [];
    const tipoLaudo = d.tipo === 'foliar' ? 'foliar' : 'solo';
    setTipo([tipoLaudo]);
    setLab(d.laboratorio ?? '');
    setLaudo(d.numero_laudo ?? '');
    if (d.data && d.data <= hojeBanco()) setData(doBanco(d.data));
    setArquivo(arq);
    setAmostras(ams);
    setEscolhida(ams.length === 1 ? ['0'] : []);
    if (ams.length === 1) aplicarAmostra(ams[0], tipoLaudo);
    else setValores({});
    const partes = [`Laudo lido: análise ${tipoLaudo === 'foliar' ? 'foliar' : 'de solo'}, ${ams.length} ${ams.length === 1 ? 'amostra' : 'amostras'}.`];
    if (d.legivel === false || !ams.length) partes.push('Quase nada pôde ser lido: tire outra foto, mais de perto, ou digite os valores.');
    if (ams.length > 1) partes.push('Escolha abaixo qual amostra é a deste talhão.');
    const conv = ams.flatMap((a) => a.conversoes ?? []);
    if (conv.length) partes.push(`Unidades convertidas: ${[...new Set(conv)].slice(0, 6).join('; ')}.`);
    if ((d.nao_lido ?? []).length) partes.push(`Não veio na leitura: ${[...new Set(d.nao_lido as string[])].join(', ')}.`);
    partes.push('Confira cada valor com o papel antes de gravar.');
    setAvisoDoc(partes.join(' '));
  }

  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    const iso = paraBanco(data);
    if (!iso) e.data = 'Informe a data da análise.';
    else if (iso > hojeBanco()) e.data = 'A data não pode ser futura.';
    const dados: Record<string, number> = {};
    for (const p of lista) {
      const t = (valores[p.chave] ?? '').trim();
      if (!t) continue;
      const n = lerNumero(t);
      if (n == null || n < 0) e[p.chave] = 'Valor inválido.';
      else dados[p.chave] = n;
    }
    if (!Object.keys(dados).length && !Object.keys(e).length) e.valores = 'Informe pelo menos um resultado da análise.';
    setErros(e);
    if (Object.keys(e).length) return setErro(e.valores ?? e.data ?? 'Confira os valores marcados em vermelho.');
    const linha = {
      fazenda_id: talhao.fazenda_id,
      area_id: talhao.id,
      data: iso,
      tipo: tipo[0],
      profundidade: tipo[0] === 'solo' ? prof[0] : null,
      epoca: tipo[0] === 'foliar' ? epoca[0] : null,
      laboratorio: lab.trim() || null,
      numero_laudo: laudo.trim() || null,
      amostra: amostra.trim() || null,
      observacoes: obs.trim() || null,
      arquivo_documento: arquivo,
      dados,
      // as colunas antigas continuam preenchidas (telas que ainda as usam)
      ph: dados.ph ?? null,
      p: dados.p ?? null,
      k: dados.k ?? null,
      ca: dados.ca ?? null,
      mg: dados.mg ?? null,
      mo: dados.mo ?? null,
      v: dados.v ?? null,
      n: dados.n ?? null,
    };
    setSalvando(true);
    const q = params.id
      ? supabase.from('talhao_analises').update({ ...linha, parecer: null, parecer_em: null }).eq('id', params.id).select('id').single()
      : supabase.from('talhao_analises').insert(linha).select('id').single();
    const { data: r, error } = await q;
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    if (params.id) navegacao.goBack(); // volta para o painel da análise, que se atualiza
    else navegacao.replace('AnaliseDetalhe', { id: (r as any).id });
  }

  function excluir() {
    Alert.alert('Excluir análise', `Excluir esta análise de ${data}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('talhao_analises').delete().eq('id', params.id!);
          if (error) return setErro(traduzirErro(error));
          navegacao.navigate('TalhaoDetalhe', { id: params.areaId });
        },
      },
    ]);
  }

  if (carregando || !talhao) return <Tela rolar={false}>{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}</Tela>;

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Text style={estilos.talhao}>Talhão {talhao.nome}</Text>

      {!params.id && (
        <EntradaDocumento
          titulo="Entrada pelo laudo do laboratório"
          tipo="analise"
          rotuloFoto="Foto do laudo"
          instrucao="Enquadre a tabela de resultados inteira, bem reta e com boa luz. Se o laudo tiver duas folhas, fotografe a dos resultados."
          dica="A IA lê os resultados e já converte as unidades para o padrão do sistema. Nada é gravado sem o seu Gravar."
          textoLendo="Lendo o laudo… (uns 15 segundos)"
          aoLer={(d, arq) => aplicarLaudo(d, arq)}
          aoErro={setErro}
        />
      )}
      {avisoDoc && <Aviso tipo="info" texto={avisoDoc} />}
      {arquivo && (
        <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(arquivo)) && setErro('Não foi possível abrir a foto do laudo.')}>
          📷 Ver a foto do laudo
        </Text>
      )}
      {amostras.length > 1 && (
        <Escolha
          rotulo="Qual amostra do laudo é a deste talhão?"
          opcoes={amostras.map((a, k) => ({ valor: String(k), rotulo: [a.identificacao ?? `Amostra ${k + 1}`, a.profundidade].filter(Boolean).join(' · ') }))}
          valor={escolhida}
          aoMudar={(v) => {
            setEscolhida(v);
            aplicarAmostra(amostras[Number(v[0])], tipo[0]);
          }}
        />
      )}

      <CampoData rotulo="Data da análise *" valor={data} aoMudar={setData} erro={erros.data} />
      <Escolha
        rotulo="Tipo"
        opcoes={[
          { valor: 'solo', rotulo: 'Solo' },
          { valor: 'foliar', rotulo: 'Foliar (folha)' },
        ]}
        valor={tipo}
        aoMudar={(v) => {
          setTipo(v);
          if (v[0] !== tipo[0]) setValores({});
        }}
      />
      {tipo[0] === 'solo' ? (
        <Escolha rotulo="Profundidade" opcoes={PROFUNDIDADES} valor={prof} aoMudar={setProf} />
      ) : (
        <Escolha rotulo="Época da coleta" opcoes={EPOCAS_FOLIAR} valor={epoca} aoMudar={setEpoca} />
      )}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Laboratório" value={lab} onChangeText={setLab} autoCapitalize="words" />
        </View>
        <View style={{ width: 130 }}>
          <Campo rotulo="Nº do laudo" value={laudo} onChangeText={setLaudo} autoCapitalize="characters" />
        </View>
      </View>
      <Campo rotulo="Identificação da amostra" value={amostra} onChangeText={setAmostra} autoCapitalize="sentences" placeholder="Como está no laudo" />

      <Secao titulo="Resultados" />
      <Text style={estilos.nota}>
        Digite nas unidades indicadas. {tipo[0] === 'solo' ? 'SB, CTC, V% e m% podem ficar em branco: o sistema calcula.' : 'Macronutrientes em g/kg (dag/kg × 10).'}
      </Text>
      <View style={estilos.grade}>
        {lista.map((p) => (
          <View key={p.chave} style={estilos.celula}>
            <Campo
              rotulo={`${p.rotulo}${p.unidade ? ` (${p.unidade})` : ''}`}
              value={valores[p.chave] ?? ''}
              onChangeText={(t) => setValores((v) => ({ ...v, [p.chave]: t }))}
              keyboardType="decimal-pad"
              erro={erros[p.chave]}
            />
          </View>
        ))}
      </View>
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 60, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={params.id ? 'Salvar alteração' : 'Gravar análise'} onPress={salvar} carregando={salvando} />
      {params.id && <Text style={estilos.nota}>Alterar os valores apaga o parecer que já tinha sido pedido: peça de novo depois.</Text>}
      {params.id && <Botao titulo="Excluir análise" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  talhao: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  celula: { width: '47%', flexGrow: 1 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
});
