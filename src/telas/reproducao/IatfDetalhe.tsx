import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Botao from '../../componentes/Botao';
import { perguntar } from '../../lib/perguntar';
import { rotuloAnimal } from '../../componentes/CampoAnimal';
import { Tabela } from './ConsultaReproducao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { agrupar, classeEcc, somarDias } from '../../lib/reproducao';
import { SELECT_EVENTO, paraEvento } from '../../lib/reproducaoDados';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const ROTULO_SITUACAO: Record<string, string> = { protocolo: 'No protocolo', perdeu_dispositivo: 'Perdeu o dispositivo', saiu: 'Saiu do protocolo' };

/** Um protocolo de IATF na Consulta: agenda, fêmeas, resultados e eficiência. Só mostra. */
export default function IatfDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'IatfDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [i, setI] = useState<any>(null);
  const [femeas, setFemeas] = useState<any[]>([]);
  const [ev, setEv] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: i ? `IATF nº ${i.numero}` : 'IATF' });
  }, [navegacao, i]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const x = await consulta<any>(supabase.from('repro_iatf').select('*, lote:lotes ( numero, descricao )').eq('id', params.id).single());
          const f = await consulta<any[]>(supabase.from('repro_iatf_femeas').select('animal_id, situacao, ecc, animal:animais ( numero_interno, brinco, nome, registro )').eq('iatf_id', params.id));
          const e = await consulta<any[]>(supabase.from('repro_eventos').select(SELECT_EVENTO).eq('iatf_id', params.id).order('data'));
          setI({ ...x, lote: um(x.lote) });
          setFemeas(f.map((y) => ({ ...y, nome: rotuloAnimal(um(y.animal)) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })));
          setEv(e.map(paraEvento));
        } catch (err) {
          setErro(traduzirErro(err));
        }
      })();
    }, [params.id]),
  );

  async function excluir() {
    setFalha(null);
    const { count } = await supabase.from('repro_eventos').select('id', { count: 'exact', head: true }).eq('iatf_id', params.id);
    if (count) return setFalha(`Este protocolo já tem ${count === 1 ? '1 lançamento' : `${count} lançamentos`} (inseminação, diagnóstico...): exclua esses lançamentos em Reprodução antes.`);
    if (!(await perguntar('Excluir IATF', `Excluir o protocolo de IATF nº ${i.numero}? As fêmeas saem do protocolo.`, 'Excluir', 'Voltar'))) return;
    const { error } = await supabase.from('repro_iatf').delete().eq('id', params.id);
    if (error) return setFalha(traduzirErro(error));
    navegacao.goBack();
  }

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!i) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const etapas = i.etapas as { dia: number; acao: string; ia?: boolean; feito?: string | null }[];
  const etIa = etapas.find((x) => x.ia);
  const iaIso = etIa ? somarDias(i.data_d0, etIa.dia) : i.data_d0;
  const servico = (a: string) => ev.find((e) => e.animal_id === a && e.tipo === 'servico');
  const dg = (a: string) => ev.filter((e) => e.animal_id === a && e.tipo === 'dg').pop();

  const noProtocolo = femeas.filter((f) => f.situacao !== 'saiu').length;
  const inseminadas = ev.filter((e) => e.tipo === 'servico').length;
  const comDg = femeas.filter((f) => dg(f.animal_id)).length;
  const prenhes = femeas.filter((f) => dg(f.animal_id)?.subtipo === 'prenhe').length;
  const pct = (a: number, b: number) => (b ? `${formatarNumero((a / b) * 100, 0)}%` : '–');

  return (
    <Tela>
      <View style={estilos.cartao}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={estilos.rotulo}>IATF nº</Text>
            <Text style={estilos.codigo}>{i.numero}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.rotulo}>D0</Text>
            <Text style={estilos.data}>{doBanco(i.data_d0)}</Text>
          </View>
        </View>
        <Text style={estilos.protocolo}>{i.protocolo_nome}</Text>
        {i.lote && <Text style={estilos.nota}>Lote {nomeLote(i.lote, sigla)}</Text>}
        {i.observacoes ? <Text style={estilos.nota}>{i.observacoes}</Text> : null}
      </View>

      <View style={estilos.cards}>
        <Card rotulo="Taxa de serviço" valor={pct(inseminadas, noProtocolo)} detalhe={`${inseminadas} de ${noProtocolo} inseminadas`} />
        <Card rotulo="Taxa de concepção" valor={pct(prenhes, comDg)} detalhe={`${formatarNumero(prenhes)} de ${comDg} com DG`} />
        <Card rotulo="Taxa de prenhez" valor={pct(prenhes, noProtocolo)} detalhe={`${formatarNumero(prenhes)} de ${noProtocolo} no protocolo`} />
        <Card rotulo="Fêmeas" valor={formatarNumero(femeas.length)} detalhe={`${femeas.length - noProtocolo} saíram`} />
      </View>

      <Secao titulo="Agenda" />
      {etapas.map((e, k) => (
        <View key={k} style={estilos.agenda}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={estilos.agendaTitulo}>D{e.dia} · {doBanco(somarDias(i.data_d0, e.dia))}</Text>
            <Text style={estilos.agendaAcao}>{e.acao}</Text>
          </View>
          {!e.ia && <Ionicons name={e.feito ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={e.feito ? cores.primaria : cores.textoSuave} />}
        </View>
      ))}
      <View style={estilos.agenda}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.agendaTitulo}>
            DG 1 · {doBanco(somarDias(iaIso, i.dias_dg1 ?? 30))}
            {i.dias_dg2 ? `   ·   DG 2 · ${doBanco(somarDias(iaIso, i.dias_dg2))}` : ''}
          </Text>
        </View>
      </View>

      <Secao titulo="Fêmeas" />
      <Lista>
        {femeas.map((f) => {
          const s = servico(f.animal_id);
          const d = dg(f.animal_id);
          return (
            <Linha
              key={f.animal_id}
              titulo={f.nome}
              linhas={[
                s ? `IA ${doBanco(s.data)} · ${s.touro ?? 'touro'}${s.inseminador ? ` · ${s.inseminador}` : ''}` : ROTULO_SITUACAO[f.situacao],
                f.ecc != null ? `ECC ${formatarNumero(Number(f.ecc), 2)}` : null,
              ]}
              direita={d ? (d.subtipo === 'prenhe' ? 'Prenhe' : 'Vazia') : s ? 'Aguard. DG' : undefined}
              onPress={() => navegacao.navigate('ReproFemea', { id: f.animal_id })}
            />
          );
        })}
      </Lista>

      <Tabela titulo="Por touro" grupos={agrupar(ev, (s) => s.touro ?? 'Touro não informado')} />
      <Tabela titulo="Por inseminador" grupos={agrupar(ev, (s) => s.inseminador ?? 'Não informado')} />
      <Tabela titulo="Por escore corporal (ECC)" grupos={agrupar(ev, (s) => classeEcc(s.ecc))} />
      {/* V149: excluir protocolo lançado errado (sem inseminação/diagnóstico lançados) */}
      {falha && <Aviso tipo="erro" texto={falha} />}
      <Botao titulo="Excluir este protocolo de IATF" tipo="perigo" onPress={excluir} />
    </Tela>
  );
}

function Card({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.cardRotulo}>{rotulo}</Text>
      <Text style={estilos.cardValor}>{valor}</Text>
      {detalhe ? <Text style={estilos.cardDetalhe}>{detalhe}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  codigo: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura },
  data: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto, marginTop: 6 },
  protocolo: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
  cardDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  agenda: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  agendaTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  agendaAcao: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 20 },
});
