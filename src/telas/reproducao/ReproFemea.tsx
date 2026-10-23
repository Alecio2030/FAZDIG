import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { rotuloAnimal } from '../../componentes/CampoAnimal';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { idadeRotulo, nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ROTULO_METODO, ROTULO_SEMEN, diasEntre, indicadoresFemea, rotuloEvento, situacaoFemea } from '../../lib/reproducao';
import { eventosDaFemea } from '../../lib/reproducaoDados';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { BISAVOS } from '../../lib/genealogia';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const VAZIO = '–';

/** Ficha reprodutiva da fêmea (Consulta): situação, indicadores, genealogia e histórico. Só mostra. */
export default function ReproFemea() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ReproFemea'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [a, setA] = useState<any>(null);
  const [ev, setEv] = useState<any[]>([]);
  const [protocolo, setProtocolo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: a ? rotuloAnimal(a) : 'Fêmea' });
  }, [navegacao, a]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const x = await consulta<any>(
            supabase
              .from('animais')
              .select('*, raca:racas ( nome ), lote:lotes!animais_lote_id_fkey ( numero, descricao )')
              .eq('id', params.id)
              .single(),
          );
          const pais = [x.pai_id, x.mae_id].filter(Boolean);
          const p = pais.length ? await consulta<any[]>(supabase.from('animais').select('id, numero_interno, brinco, nome, registro').in('id', pais)) : [];
          const nome = (pid: string | null) => {
            const r = p.find((y) => y.id === pid);
            return r ? rotuloAnimal(r) : null;
          };
          setA({ ...x, raca: um(x.raca), lote: um(x.lote), pai: nome(x.pai_id) ?? x.pai_externo, mae: nome(x.mae_id) ?? x.mae_externa });
          const eventos = await eventosDaFemea(params.id);
          setEv(eventos);
          // Em protocolo de IATF aberto e ainda não inseminada?
          const f = await consulta<any[]>(supabase.from('repro_iatf_femeas').select('situacao, iatf:repro_iatf ( id, numero )').eq('animal_id', params.id).neq('situacao', 'saiu'));
          const aberto = f.map((y) => um(y.iatf)).find((i) => i && !eventos.some((e) => e.iatf_id === i.id && e.tipo === 'servico'));
          setProtocolo(aberto ? `IATF nº ${aberto.numero}` : null);
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!a) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const hoje = hojeBanco();
  const s = situacaoFemea(ev, hoje, protocolo);
  const ind = indicadoresFemea(ev, hoje);
  const primeiroParto = ev.find((e) => e.tipo === 'parto' && e.subtipo !== 'aborto');
  const idade1Parto = primeiroParto && a.data_nascimento ? Math.round(diasEntre(a.data_nascimento, primeiroParto.data) / 30.44) : null;

  return (
    <Tela>
      <View style={estilos.cartao}>
        <Text style={estilos.nome}>{rotuloAnimal(a)}</Text>
        <Text style={estilos.nota}>
          {[a.categoria, a.raca?.nome, idadeRotulo(a.data_nascimento, a.nascimento_aproximado), a.lote ? `Lote ${nomeLote(a.lote, sigla)}` : 'Sem lote'].filter(Boolean).join(' · ')}
        </Text>
        <Text style={estilos.situacao}>{s.texto}</Text>
        {s.previsao && (s.codigo === 'prenhe' || s.codigo === 'servida') ? (
          <Text style={estilos.previsao}>
            {s.codigo === 'prenhe' ? 'Previsão de parto' : 'Se emprenhou, parto previsto para'}: {doBanco(s.previsao)}
          </Text>
        ) : null}
      </View>

      <Secao titulo="Indicadores" />
      <Dado rotulo="Partos" valor={formatarNumero(ind.partos)} />
      <Dado rotulo="Abortos" valor={formatarNumero(ind.abortos)} />
      <Dado rotulo="Idade ao 1º parto" valor={idade1Parto != null ? `${idade1Parto} meses` : null} />
      <Dado rotulo="Intervalo entre partos (média)" valor={ind.iepMedio != null ? `${ind.iepMedio} dias (${formatarNumero(ind.iepMedio / 30.44, 1)} meses)` : null} />
      <Dado rotulo="Dias em aberto (último parto)" valor={ind.diasAberto != null ? `${ind.diasAberto} dias` : null} />
      <Dado rotulo="Serviços por concepção" valor={ind.servicosPorConcepcao != null ? formatarNumero(ind.servicosPorConcepcao, 1) : null} />
      <Dado rotulo="Serviços / concepções" valor={`${ind.servicos} / ${ind.concepcoes}`} />

      <Secao titulo="Genealogia" />
      <Dado rotulo="Pai" valor={a.pai} />
      <Dado rotulo="Mãe" valor={a.mae} />
      <Dado rotulo="Avô paterno" valor={a.avo_paterno} />
      <Dado rotulo="Avó paterna" valor={a.avo_paterna} />
      <Dado rotulo="Avô materno" valor={a.avo_materno} />
      <Dado rotulo="Avó materna" valor={a.avo_materna} />
      {BISAVOS.map((b) => (a[`bisavo_${b.chave}`] ? <Dado key={b.chave} rotulo={b.rotulo} valor={a[`bisavo_${b.chave}`]} /> : null))}

      <Secao titulo="Histórico reprodutivo" />
      {ev.length === 0 ? (
        <Text style={estilos.nota}>Nenhum lançamento reprodutivo.</Text>
      ) : (
        [...ev].reverse().map((e) => (
          <View key={e.id} style={estilos.evento}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={estilos.eventoTitulo}>{rotuloEvento(e)}</Text>
              <Text style={estilos.eventoData}>{doBanco(e.data)}</Text>
            </View>
            {detalhes(e).map((t, i) => (
              <Text key={i} style={estilos.eventoTexto}>{t}</Text>
            ))}
          </View>
        ))
      )}
    </Tela>
  );
}

function detalhes(e: any): string[] {
  const l: string[] = [`Lançamento nº ${e.numero}${e.iatfNumero ? ` · IATF nº ${e.iatfNumero}` : ''}`];
  if (e.tipo === 'servico' || e.tipo === 'coleta') {
    if (e.touro) l.push(`Touro: ${e.touro}`);
    if (e.semen_tipo) l.push(`Sêmen ${ROTULO_SEMEN[e.semen_tipo]?.toLowerCase()}`);
    if (e.doadoraNome) l.push(`Doadora do embrião: ${e.doadoraNome}`);
    if (e.inseminador) l.push(`${e.tipo === 'coleta' ? 'Técnico' : 'Inseminador'}: ${e.inseminador}`);
    if (e.estruturas != null) l.push(`${e.subtipo === 'fiv' ? 'Oócitos' : 'Estruturas'}: ${e.estruturas}`);
    if (e.embrioes != null) l.push(`Embriões viáveis: ${e.embrioes}`);
  }
  if (e.tipo === 'dg') {
    const partes = [e.metodo_dg ? ROTULO_METODO[e.metodo_dg] : null, e.dias_gestacao ? `${e.dias_gestacao} dias de gestação` : null, e.sexo_feto ? `feto ${e.sexo_feto === 'F' ? 'fêmea' : 'macho'}` : null].filter(Boolean);
    if (partes.length) l.push(partes.join(' · '));
    if (e.previsao_parto) l.push(`Previsão de parto: ${doBanco(e.previsao_parto)}`);
    if (e.inseminador) l.push(`Veterinário: ${e.inseminador}`);
  }
  if (e.tipo === 'parto' && e.crias) l.push(e.crias > 1 ? 'Gêmeos' : '1 cria');
  if (e.ecc != null) l.push(`ECC ${formatarNumero(e.ecc, 2)}`);
  if (e.observacoes) l.push(e.observacoes);
  return l;
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || VAZIO}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 6 },
  nome: { fontSize: tam.titulo - 2, fontWeight: '800', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave, lineHeight: 20 },
  situacao: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.cafe },
  previsao: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
  evento: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 3 },
  eventoTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  eventoData: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  eventoTexto: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 20 },
});
