import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Secao from '../../componentes/Secao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarQtd } from '../../lib/formatos';
import { abrirFotoDocumento } from '../../lib/documentos';
import { perguntar } from '../../lib/perguntar';
import { ROTULO_NIVEL, ROTULO_TIPO, tituloOcorrencia } from '../../lib/monitoramento';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Ficha da ocorrência de praga, doença ou deficiência: o que foi visto, o que fazer, as fotos e a situação (aberta ou controlada). */
export default function MonitoramentoDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'MonitoramentoDetalhe'>>();
  const [m, setM] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: m ? `Ocorrência nº ${m.numero}` : 'Ocorrência' });
  }, [navegacao, m]);

  const carregar = useCallback(async () => {
    try {
      setM(await consulta<any>(supabase.from('monitoramentos').select('*, area:areas ( id, nome, tipo )').eq('id', params.id).single()));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [params.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function mudarSituacao(controlada: boolean) {
    setErro(null);
    setOcupado(true);
    const { error } = await supabase.from('monitoramentos').update({ situacao: controlada ? 'controlada' : 'aberta', data_controle: controlada ? hojeBanco() : null }).eq('id', params.id);
    setOcupado(false);
    if (error) return setErro(traduzirErro(error));
    carregar();
  }

  async function excluir() {
    const ok = await perguntar('Excluir ocorrência', `Excluir a ocorrência nº ${m.numero}? Isso não pode ser desfeito.`, 'Excluir', 'Voltar');
    if (!ok) return;
    setErro(null);
    setOcupado(true);
    const { data, error } = await supabase.from('monitoramentos').delete().eq('id', params.id).select('id');
    setOcupado(false);
    if (error) return setErro(traduzirErro(error));
    if (!data?.length) return setErro('Só quem tem acesso completo pode excluir uma ocorrência.');
    navegacao.goBack();
  }

  async function verFoto(caminho: string) {
    setErro(null);
    if (!(await abrirFotoDocumento(caminho))) setErro('Não foi possível abrir a foto agora.');
  }

  if (!m) return <Tela rolar={!!erro}>{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}</Tela>;

  const area = um(m.area);
  const aberta = m.situacao === 'aberta';
  const hipoteses = (Array.isArray(m.outras_hipoteses) ? m.outras_hipoteses : []) as { problema: string; porque?: string }[];
  const fotos = (m.arquivos ?? []) as string[];

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <Text style={estilos.nome}>{tituloOcorrencia(m)}</Text>
        <Text style={estilos.nota}>
          {ROTULO_TIPO[m.tipo] ?? m.tipo}
          {m.nome_cientifico ? ` · ${m.nome_cientifico}` : ''}
        </Text>
        {m.tipo !== 'sadia' && (
          <Text style={[estilos.situacao, { color: aberta ? cores.erro : cores.primaria }]}>{aberta ? 'Em aberto' : `Controlada${m.data_controle ? ` em ${doBanco(m.data_controle)}` : ''}`}</Text>
        )}
      </View>

      <Dado rotulo="Data" valor={doBanco(m.data)} />
      <Dado rotulo={area?.tipo === 'manga' ? 'Manga' : 'Talhão'} valor={area?.nome} />
      <Dado rotulo="Como foi lançada" valor={m.origem === 'foto' ? `Foto analisada pela IA${m.confianca ? ` (confiança ${ROTULO_NIVEL[m.confianca] ?? m.confianca})` : ''}` : 'À mão'} />
      {m.tipo !== 'sadia' && (
        <>
          <Dado rotulo="Severidade" valor={m.severidade ? ROTULO_NIVEL[m.severidade] : null} />
          <Dado rotulo="Incidência" valor={m.incidencia_perc != null ? `${formatarQtd(m.incidencia_perc, 1)}% das plantas olhadas` : null} />
          <Dado rotulo="Parte da planta" valor={m.parte} />
        </>
      )}

      {m.sintomas ? (
        <>
          <Secao titulo="O que foi visto" />
          <Text style={estilos.texto}>{m.sintomas}</Text>
        </>
      ) : null}
      {m.conferir ? (
        <>
          <Secao titulo="Para confirmar no campo" />
          <Text style={estilos.texto}>{m.conferir.split('\n').map((c: string) => `• ${c}`).join('\n')}</Text>
        </>
      ) : null}
      {hipoteses.length > 0 && (
        <>
          <Secao titulo="Também pode ser" />
          <Text style={estilos.texto}>{hipoteses.map((h) => `• ${h.problema}${h.porque ? `: ${h.porque}` : ''}`).join('\n')}</Text>
        </>
      )}
      {m.o_que_fazer ? (
        <>
          <Secao titulo="O que fazer" />
          <Text style={estilos.texto}>{m.o_que_fazer}</Text>
        </>
      ) : null}
      {m.observacoes ? (
        <>
          <Secao titulo="Observações" />
          <Text style={estilos.texto}>{m.observacoes}</Text>
        </>
      ) : null}
      {m.origem === 'foto' && <Text style={estilos.nota}>É apoio à decisão: foto dá indício, não laudo. Defensivo só com receituário agronômico; confirme com o agrônomo responsável.</Text>}

      {fotos.map((f, i) => (
        <Botao key={f} titulo={fotos.length > 1 ? `📷  Ver a foto ${i + 1}` : '📷  Ver a foto'} tipo="secundario" onPress={() => verFoto(f)} />
      ))}

      {m.tipo !== 'sadia' && area && <Botao titulo={`Lançar atividade em ${area.nome}`} tipo="secundario" onPress={() => navegacao.navigate('AtividadeForm', { areaId: area.id })} />}
      {m.tipo !== 'sadia' && (aberta ? <Botao titulo="Marcar como controlada" onPress={() => mudarSituacao(true)} carregando={ocupado} /> : <Botao titulo="Reabrir a ocorrência" tipo="secundario" onPress={() => mudarSituacao(false)} carregando={ocupado} />)}
      <Botao titulo="Excluir ocorrência" tipo="perigo" onPress={excluir} desabilitado={ocupado} />
    </Tela>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || '–'}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  nome: { fontSize: tam.subtitulo + 3, fontWeight: '800', color: cores.primariaEscura },
  situacao: { fontSize: tam.texto, fontWeight: '800' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  texto: { fontSize: tam.pequeno + 2, color: cores.texto, lineHeight: 23 },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
