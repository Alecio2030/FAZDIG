import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { escolherImagem } from '../../lib/fotos';
import Tela from '../../componentes/Tela';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import ConsultaMonitoramentos from './ConsultaMonitoramentos';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { lerNumero } from '../../lib/formatos';
import { useAvisoTemporario } from '../../lib/useAvisoTemporario';
import { NIVEIS, PROBLEMAS_COMUNS, ROTULO_NIVEL, ROTULO_TIPO, ROTULO_URGENCIA, TIPOS_PROBLEMA, analisarPlanta, type Diagnostico, type FotoPlanta, type TipoProblema } from '../../lib/monitoramento';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Area = { id: string; nome: string; tipo: string; especie: string | null; capim_cultura: string | null; variedade: string | null; data_plantio: string | null; irrigacao: string | null; metodo_irrigacao: string | null };

/**
 * Pragas e doenças: abas Lançar | Consultar.
 * Lançar: foto da planta (a IA aponta a hipótese e a tela abre preenchida para conferência; nada grava sozinho) ou à mão.
 */
export default function MonitoramentoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'MonitoramentoForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const avisoAnterior = useAvisoTemporario(params?.aviso);

  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState<string | null>(params?.areaId ?? null);
  const [data, setData] = useState(hojeBR());
  // foto e análise
  const [fotos, setFotos] = useState<FotoPlanta[]>([]);
  const [relato, setRelato] = useState('');
  const [analisando, setAnalisando] = useState(false);
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [arquivos, setArquivos] = useState<string[]>([]);
  // ocorrência (para conferência)
  const [tipo, setTipo] = useState<TipoProblema | null>(null);
  const [problema, setProblema] = useState('');
  const [severidade, setSeveridade] = useState<string | null>(null);
  const [incidencia, setIncidencia] = useState('');
  const [parte, setParte] = useState('');
  const [sintomas, setSintomas] = useState('');
  const [oQueFazer, setOQueFazer] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!fid) return;
    consulta<Area[]>(supabase.from('areas').select('id, nome, tipo, especie, capim_cultura, variedade, data_plantio, irrigacao, metodo_irrigacao').eq('fazenda_id', fid).eq('ativa', true).order('tipo', { ascending: false }).order('nome')).then(setAreas, (e) => setErro(traduzirErro(e)));
  }, [fid]);

  const carregarAreas = useCallback(
    async (): Promise<ItemLista[]> => areas.map((a) => ({ id: a.id, titulo: a.nome, detalhe: a.tipo === 'talhao' ? `Talhão${a.especie ? ` · ${a.especie}` : ''}` : `Manga${a.capim_cultura ? ` · ${a.capim_cultura}` : ''}` })),
    [areas],
  );

  function limpar() {
    setFotos([]);
    setRelato('');
    setDiag(null);
    setArquivos([]);
    setTipo(null);
    setProblema('');
    setSeveridade(null);
    setIncidencia('');
    setParte('');
    setSintomas('');
    setOQueFazer('');
    setObs('');
    setErro(null);
    setErroFoto(null);
    setData(hojeBR());
  }

  function escolherFoto() {
    Alert.alert('Foto da planta', 'Chegue perto da parte com o problema (folha, ramo, fruto), com boa luz e sem tremer. Uma segunda foto da planta inteira ajuda.', [
      { text: 'Tirar foto', onPress: () => pegarFoto(true) },
      { text: 'Escolher da galeria', onPress: () => pegarFoto(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function pegarFoto(camera: boolean) {
    setErroFoto(null);
    try {
      const r = await escolherImagem(camera, { quality: 0.5, ladoWeb: 1600 });
      if ('negado' in r) return setErroFoto(camera ? 'Sem permissão para usar a câmera. Libere nos Ajustes do celular.' : 'Sem permissão para abrir as fotos. Libere nos Ajustes do celular.');
      if (!r.foto) return;
      const a = r.foto;
      setFotos((atual) => [...atual, { uri: a.uri, base64: a.base64, formato: a.mimeType }].slice(0, 2));
      // foto nova: a análise anterior deixa de valer
      setDiag(null);
      setArquivos([]);
    } catch (e: any) {
      setErroFoto(String(e?.message ?? e));
    }
  }

  async function analisar() {
    if (!fotos.length) return;
    setErroFoto(null);
    setAnalisando(true);
    const a = areas.find((x) => x.id === areaId);
    const contexto = {
      data: paraBanco(data) ?? hojeBanco(),
      municipio: fazendaAtiva?.municipio ?? null,
      uf: fazendaAtiva?.uf ?? null,
      local: a ? (a.tipo === 'talhao' ? 'talhão de lavoura' : 'manga de pasto') : null,
      cultura: a ? a.especie ?? a.capim_cultura : null,
      variedade: a?.variedade ?? null,
      plantio: a?.data_plantio ?? null,
      irrigacao: a?.irrigacao ? `${a.irrigacao}${a.metodo_irrigacao ? ` (${a.metodo_irrigacao})` : ''}` : null,
      relato_do_produtor: relato.trim() || null,
    };
    const res = await analisarPlanta(fotos, contexto);
    setAnalisando(false);
    if ('erro' in res) return setErroFoto(`${res.erro} Você pode tentar de novo ou lançar à mão.`);
    const d = res.dados;
    setDiag(d);
    setArquivos(res.arquivos);
    if (!d.e_planta) return;
    // a tela abre preenchida para conferência
    setTipo(d.tipo);
    setProblema(d.problema ?? (d.tipo === 'sadia' ? 'Planta sadia' : ''));
    setSeveridade(d.severidade);
    setParte(d.parte ?? '');
    setSintomas(d.sintomas);
    setOQueFazer(d.o_que_fazer.map((p, i) => `${i + 1}. ${p}`).join('\n'));
  }

  async function gravar() {
    setErro(null);
    if (!fid) return;
    const d = paraBanco(data);
    const inc = incidencia.trim() ? lerNumero(incidencia) : null;
    const faltas: string[] = [];
    if (!dataValida(data) || !d || d > hojeBanco()) faltas.push('a data (não pode ser futura)');
    if (!areaId) faltas.push('o talhão ou a manga');
    if (!tipo) faltas.push('o que é (praga, doença...)');
    if (!problema.trim()) faltas.push('o nome do problema');
    if (incidencia.trim() && (inc == null || inc < 0 || inc > 100)) faltas.push('a incidência entre 0 e 100%');
    if (faltas.length) return setErro(`Falta informar: ${faltas.join('; ')}.`);
    setSalvando(true);
    const daFoto = !!diag && diag.e_planta;
    const { data: novo, error } = await supabase
      .from('monitoramentos')
      .insert({
        fazenda_id: fid,
        data: d,
        area_id: areaId,
        origem: daFoto ? 'foto' : 'manual',
        tipo,
        problema: problema.trim(),
        nome_cientifico: daFoto && diag!.problema === problema.trim() ? diag!.nome_cientifico : null,
        confianca: daFoto ? diag!.confianca : null,
        severidade: tipo === 'sadia' ? null : severidade,
        incidencia_perc: inc,
        parte: parte.trim() || null,
        sintomas: sintomas.trim() || null,
        o_que_fazer: oQueFazer.trim() || null,
        conferir: daFoto && diag!.conferir_no_campo.length ? diag!.conferir_no_campo.join('\n') : null,
        outras_hipoteses: daFoto && diag!.outras_hipoteses.length ? diag!.outras_hipoteses : null,
        arquivos,
        observacoes: [relato.trim(), obs.trim()].filter(Boolean).join(' · ') || null,
        situacao: tipo === 'sadia' ? 'controlada' : 'aberta',
        data_controle: tipo === 'sadia' ? d : null,
      })
      .select('numero')
      .single();
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const nome = areas.find((x) => x.id === areaId)?.nome ?? '';
    navegacao.replace('MonitoramentoForm', { aviso: `Ocorrência nº ${novo.numero} gravada: ${problema.trim()} em ${nome}.` });
  }

  if (aba === 'consultar')
    return (
      <Tela>
        <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Lançar" />
        <ConsultaMonitoramentos />
      </Tela>
    );

  const sugestoes = tipo ? PROBLEMAS_COMUNS[tipo] ?? [] : [];
  const corConfianca = diag?.confianca === 'alta' ? cores.primaria : diag?.confianca === 'media' ? cores.cafe : cores.erro;

  return (
    <Tela rodape={<RodapeAcoes titulo="Gravar ocorrência" aoConfirmar={gravar} carregando={salvando} aoDescartar={limpar} erro={erro} />}>
      <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Lançar" />
      {avisoAnterior && <Aviso tipo="sucesso" texto={avisoAnterior} />}

      <View style={estilos.campos}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} />
        </View>
        <View style={{ flex: 1.4 }}>
          <SeletorLista rotulo="Talhão ou manga *" valorId={areaId} aoMudar={setAreaId} carregar={carregarAreas} vazio="Nenhum talhão ou manga cadastrado." />
        </View>
      </View>

      {/* ---------- foto ---------- */}
      <View style={estilos.quadro}>
        <Text style={estilos.quadroTitulo}>Foto da planta</Text>
        {fotos.length > 0 && (
          <View style={estilos.fotos}>
            {fotos.map((f, i) => (
              <View key={f.uri}>
                <Image source={{ uri: f.uri }} style={estilos.foto} />
                <Pressable
                  onPress={() => {
                    setFotos(fotos.filter((_, j) => j !== i));
                    setDiag(null);
                    setArquivos([]);
                  }}
                  hitSlop={8}
                  style={estilos.tirar}
                  accessibilityRole="button"
                  accessibilityLabel="Tirar esta foto"
                >
                  <Ionicons name="close-circle" size={26} color={cores.erro} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {analisando ? (
          <View style={estilos.linhaCentro}>
            <ActivityIndicator color={cores.primaria} />
            <Text style={estilos.nota}>Analisando a foto… (uns 15 segundos)</Text>
          </View>
        ) : (
          <>
            {fotos.length < 2 && <Botao titulo={fotos.length ? '📷  Mais uma foto (planta inteira)' : '📷  Foto da planta'} tipo="secundario" onPress={escolherFoto} />}
            {fotos.length > 0 && (
              <>
                <Campo rotulo="O que você percebeu (ajuda a IA)" value={relato} onChangeText={setRelato} placeholder="Ex.: começou há 10 dias, nas folhas de baixo, em reboleira" multiline style={estilos.multilinha} />
                <Botao titulo={diag ? 'Analisar de novo' : 'Analisar com a IA'} onPress={analisar} />
              </>
            )}
            {fotos.length === 0 && <Text style={estilos.nota}>Até 2 fotos: a parte com o problema bem de perto e, se quiser, a planta inteira. A IA aponta a hipótese e a tela abre preenchida para você conferir; nada é gravado sozinho. Sem foto, é só preencher abaixo.</Text>}
          </>
        )}
        {erroFoto && <Aviso tipo="erro" texto={erroFoto} />}
      </View>

      {/* ---------- o que a IA viu ---------- */}
      {diag && !diag.e_planta && <Aviso tipo="erro" texto={`A IA não conseguiu analisar: ${diag.sintomas || 'a foto não mostra a planta com clareza.'} Tire outra foto, mais de perto e com boa luz.`} />}
      {diag && diag.e_planta && (
        <View style={estilos.caixa}>
          <Text style={estilos.hipotese}>{diag.tipo === 'indefinido' ? 'A foto não permite dizer o que é' : diag.problema ?? ROTULO_TIPO[diag.tipo]}</Text>
          <Text style={estilos.nota}>
            {ROTULO_TIPO[diag.tipo]}
            {diag.nome_cientifico ? ` · ${diag.nome_cientifico}` : ''}
          </Text>
          {diag.confianca && <Text style={[estilos.forte, { color: corConfianca }]}>Confiança da IA: {ROTULO_NIVEL[diag.confianca]}{diag.confianca !== 'alta' ? ' – confira no campo antes de agir' : ''}</Text>}
          {diag.urgencia && diag.tipo !== 'sadia' && <Text style={estilos.forte}>{ROTULO_URGENCIA[diag.urgencia]}</Text>}
          {diag.conferir_no_campo.length > 0 && (
            <>
              <Text style={estilos.sub}>Para confirmar no campo</Text>
              {diag.conferir_no_campo.map((c, i) => (
                <Text key={i} style={estilos.item}>• {c}</Text>
              ))}
            </>
          )}
          {diag.outras_hipoteses.length > 0 && (
            <>
              <Text style={estilos.sub}>Também pode ser</Text>
              {diag.outras_hipoteses.map((h, i) => (
                <Text key={i} style={estilos.item}>
                  • {h.problema}
                  {h.porque ? `: ${h.porque}` : ''}
                </Text>
              ))}
            </>
          )}
          <Text style={estilos.nota}>É apoio à decisão: foto dá indício, não laudo. A IA pode errar. Defensivo só com receituário agronômico; confirme com o agrônomo responsável.</Text>
        </View>
      )}

      {/* ---------- ocorrência ---------- */}
      <Secao titulo={diag?.e_planta ? 'Confira e complete' : 'Ocorrência'} />
      <Escolha rotulo="O que é *" opcoes={TIPOS_PROBLEMA} valor={tipo ? [tipo] : []} aoMudar={(v) => setTipo(v[0] as TipoProblema)} />
      <Campo rotulo="Problema *" value={problema} onChangeText={setProblema} placeholder="Ex.: Ferrugem do cafeeiro" autoCapitalize="sentences" />
      {sugestoes.length > 0 && !problema.trim() && <Escolha opcoes={sugestoes.map((s) => ({ valor: s, rotulo: s }))} valor={[]} aoMudar={(v) => setProblema(v[0])} />}
      {tipo !== 'sadia' && (
        <>
          <Escolha rotulo="Severidade (o quanto a planta está atacada)" opcoes={NIVEIS} valor={severidade ? [severidade] : []} aoMudar={(v) => setSeveridade(v[0] === severidade ? null : v[0])} />
          <Campo rotulo="Incidência (% das plantas olhadas com o problema)" value={incidencia} onChangeText={setIncidencia} keyboardType="decimal-pad" placeholder="Ex.: 10" ajuda="Olhe umas 20 plantas em zigue-zague no talhão e conte as atacadas: 2 em 20 = 10%. A foto não mostra isso." />
          <Campo rotulo="Parte da planta" value={parte} onChangeText={setParte} placeholder="Ex.: folhas velhas, roseta, fruto" />
        </>
      )}
      <Campo rotulo="O que foi visto" value={sintomas} onChangeText={setSintomas} multiline style={estilos.multilinha} />
      {tipo !== 'sadia' && <Campo rotulo="O que fazer" value={oQueFazer} onChangeText={setOQueFazer} multiline style={[estilos.multilinha, { minHeight: 110 }]} />}
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19, flexShrink: 1 },
  campos: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 10 },
  quadroTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.info },
  fotos: { flexDirection: 'row', gap: 12 },
  foto: { width: 120, height: 120, borderRadius: tam.raio, backgroundColor: cores.borda },
  tirar: { position: 'absolute', top: -8, right: -8, backgroundColor: cores.cartao, borderRadius: 13 },
  linhaCentro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  multilinha: { minHeight: 80, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  hipotese: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
  forte: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  sub: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto, marginTop: 6 },
  item: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 21 },
});
