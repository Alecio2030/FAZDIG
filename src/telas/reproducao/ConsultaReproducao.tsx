import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { rotuloAnimal } from '../../componentes/CampoAnimal';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { normalizarRegistro } from '../../lib/genealogia';
import { ROTULO_SERVICO, agrupar, classeEcc, situacaoFemea, somarDias, taxa, type Evento, type Grupo } from '../../lib/reproducao';
import { eventosDaFazenda } from '../../lib/reproducaoDados';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Relacao = 'iatf' | 'prenhes' | 'aguardando' | 'vazias' | 'indicadores';
const RELACOES: { valor: Relacao; rotulo: string }[] = [
  { valor: 'prenhes', rotulo: 'Prenhes e previsão de parto' },
  { valor: 'aguardando', rotulo: 'Servidas aguardando DG' },
  { valor: 'vazias', rotulo: 'Vazias e paridas (a servir)' },
  { valor: 'iatf', rotulo: 'Protocolos de IATF' },
  { valor: 'indicadores', rotulo: 'Indicadores reprodutivos' },
];

/** Consulta da Reprodução: informar a fêmea ou ver as relações. Só mostra; não inclui nem altera nada. */
export default function ConsultaReproducao() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<any[] | null>(null);
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const termo = limparBusca(busca);

  useEffect(() => {
    if (!fid || !termo) return setAchados(null);
    const t = setTimeout(async () => {
      try {
        const partes = [`brinco.ilike.*${termo}*`, `nome.ilike.*${termo}*`, `registro.ilike.*${termo}*`];
        const norm = normalizarRegistro(termo);
        if (norm && norm !== termo.toUpperCase()) partes.push(`registro.ilike.*${norm}*`);
        if (/^\d+$/.test(termo)) partes.unshift(`numero_interno.eq.${termo}`);
        const d = await consulta<any[]>(
          supabase.from('animais').select('id, numero_interno, brinco, nome, registro, categoria, situacao').eq('fazenda_id', fid).eq('sexo', 'F').or(partes.join(',')).order('numero_interno').limit(20),
        );
        setAchados(d);
      } catch (e) {
        setErro(traduzirErro(e));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [fid, termo]);

  return (
    <>
      <Busca
        valor={busca}
        aoMudar={(t) => {
          setBusca(t);
          if (t) setRelacao(null);
        }}
        dica="Fêmea: nº, brinco, nome ou registro"
      />
      {erro && <Aviso tipo="erro" texto={erro} />}

      {termo ? (
        achados === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        ) : achados.length === 0 ? (
          <Text style={estilos.dica}>Nenhuma fêmea com "{termo}".</Text>
        ) : (
          <Lista>
            {achados.map((a) => (
              <Linha key={a.id} titulo={rotuloAnimal(a)} linhas={[a.categoria, a.situacao !== 'ativo' ? a.situacao : null]} onPress={() => navegacao.navigate('ReproFemea', { id: a.id })} />
            ))}
          </Lista>
        )
      ) : relacao ? (
        <>
          <Secao titulo={RELACOES.find((r) => r.valor === relacao)!.rotulo} />
          {relacao === 'iatf' ? <RelacaoIatf /> : relacao === 'indicadores' ? <Indicadores /> : <RelacaoFemeas tipo={relacao} />}
          <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />
        </>
      ) : (
        <View style={{ gap: 10 }}>
          {RELACOES.map((r) => (
            <Botao key={r.valor} titulo={r.rotulo} tipo="secundario" onPress={() => setRelacao(r.valor)} />
          ))}
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------
function RelacaoFemeas({ tipo }: { tipo: 'prenhes' | 'aguardando' | 'vazias' }) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      (async () => {
        try {
          const [femeas, eventos] = await Promise.all([
            consulta<any[]>(supabase.from('animais').select('id, numero_interno, brinco, nome, registro, categoria').eq('fazenda_id', fid).eq('sexo', 'F').eq('situacao', 'ativo')),
            eventosDaFazenda(fid),
          ]);
          const por: Record<string, Evento[]> = {};
          for (const e of eventos) (por[e.animal_id!] ??= []).push(e);
          const hoje = hojeBanco();
          const saida = femeas
            .map((f) => ({ ...f, s: situacaoFemea(por[f.id] ?? [], hoje) }))
            .filter((f) => (tipo === 'prenhes' ? f.s.codigo === 'prenhe' : tipo === 'aguardando' ? f.s.codigo === 'servida' : f.s.codigo === 'vazia' || f.s.codigo === 'parida'));
          saida.sort((a, b) => ((a.s.previsao ?? a.s.desde ?? '') < (b.s.previsao ?? b.s.desde ?? '') ? -1 : 1));
          setLista(saida);
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid, tipo]),
  );

  if (erro) return <Aviso tipo="erro" texto={erro} />;
  if (!lista) return <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;
  if (!lista.length) return <Text style={estilos.dica}>Nenhuma fêmea nesta situação.</Text>;
  return (
    <>
      <Text style={estilos.total}>{formatarNumero(lista.length)} {lista.length === 1 ? 'fêmea' : 'fêmeas'}</Text>
      <Lista>
        {lista.map((f) => (
          <Linha
            key={f.id}
            titulo={rotuloAnimal(f)}
            linhas={[
              f.s.texto,
              tipo === 'aguardando' && f.s.desde ? `Serviço em ${doBanco(f.s.desde)} · DG a partir de ${doBanco(somarDias(f.s.desde, 30))}` : f.s.desde ? `Desde ${doBanco(f.s.desde)}` : null,
            ]}
            direita={tipo === 'prenhes' && f.s.previsao ? `Parto ${doBanco(f.s.previsao)}` : undefined}
            onPress={() => navegacao.navigate('ReproFemea', { id: f.id })}
          />
        ))}
      </Lista>
    </>
  );
}

// ---------------------------------------------------------------
function RelacaoIatf() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      (async () => {
        try {
          const i = await consulta<any[]>(
            supabase.from('repro_iatf').select('id, numero, data_d0, protocolo_nome, femeas:repro_iatf_femeas ( situacao )').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(100),
          );
          const ev = i.length ? await consulta<any[]>(supabase.from('repro_eventos').select('iatf_id, tipo, subtipo').in('iatf_id', i.map((x) => x.id))) : [];
          setLista(
            i.map((x) => ({
              ...x,
              femeas: (x.femeas as any[]).filter((f) => f.situacao !== 'saiu').length,
              ia: ev.filter((e) => e.iatf_id === x.id && e.tipo === 'servico').length,
              prenhes: ev.filter((e) => e.iatf_id === x.id && e.tipo === 'dg' && e.subtipo === 'prenhe').length,
            })),
          );
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid]),
  );

  if (erro) return <Aviso tipo="erro" texto={erro} />;
  if (!lista) return <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;
  if (!lista.length) return <Text style={estilos.dica}>Nenhum protocolo de IATF.</Text>;
  return (
    <Lista>
      {lista.map((x) => (
        <Linha
          key={x.id}
          titulo={`IATF nº ${x.numero} · D0 ${doBanco(x.data_d0)}`}
          linhas={[x.protocolo_nome, `${formatarNumero(x.femeas)} fêmeas · ${formatarNumero(x.ia)} inseminadas · ${formatarNumero(x.prenhes)} prenhes`]}
          direita={x.femeas ? `${formatarNumero((x.prenhes / x.femeas) * 100, 0)}%` : undefined}
          onPress={() => navegacao.navigate('IatfDetalhe', { id: x.id })}
        />
      ))}
    </Lista>
  );
}

// ---------------------------------------------------------------
const PERIODOS = [
  { dias: 365, rotulo: '12 meses' },
  { dias: 730, rotulo: '24 meses' },
];

function Indicadores() {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [dias, setDias] = useState(365);
  const [ev, setEv] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      setEv(null);
      eventosDaFazenda(fid, somarDias(hojeBanco(), -dias))
        .then(setEv)
        .catch((e) => setErro(traduzirErro(e)));
    }, [fid, dias]),
  );

  if (erro) return <Aviso tipo="erro" texto={erro} />;

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PERIODOS.map((p) => (
          <View key={p.dias} style={{ flex: 1 }}>
            <Botao titulo={p.rotulo} tipo={dias === p.dias ? 'primario' : 'secundario'} onPress={() => setDias(p.dias)} />
          </View>
        ))}
      </View>
      {!ev ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <PainelIndicadores ev={ev} />
      )}
    </>
  );
}

function PainelIndicadores({ ev }: { ev: Evento[] }) {
  const geral = agrupar(ev, () => 'Todos')[0];
  const partos = ev.filter((e) => e.tipo === 'parto' && e.subtipo !== 'aborto').length;
  const abortos = ev.filter((e) => e.tipo === 'parto' && e.subtipo === 'aborto').length;
  const coletas = ev.filter((e) => e.tipo === 'coleta');
  const embrioes = coletas.reduce((s, e: any) => s + (e.embrioes ?? 0), 0);

  if (!geral) return <Text style={estilos.dica}>Sem serviços no período.</Text>;
  return (
    <>
      <View style={estilos.cards}>
        <Card rotulo="Taxa de concepção" valor={taxa(geral) >= 0 ? `${formatarNumero(taxa(geral), 0)}%` : '–'} detalhe={`${formatarNumero(geral.prenhes)} de ${geral.prenhes + geral.vazias} com DG`} />
        <Card rotulo="Serviços" valor={formatarNumero(geral.servicos)} detalhe={`${formatarNumero(geral.pendentes)} aguardando DG`} />
        <Card rotulo="Partos" valor={formatarNumero(partos)} detalhe={`${abortos} ${abortos === 1 ? 'aborto' : 'abortos'}`} />
        <Card rotulo="Coletas de oócitos" valor={formatarNumero(coletas.length)} detalhe={`${formatarNumero(embrioes)} embriões viáveis`} />
      </View>
      <Tabela titulo="Por touro" grupos={agrupar(ev, (s) => s.touro ?? 'Touro não informado')} />
      <Tabela titulo="Por inseminador" grupos={agrupar(ev, (s) => (s.subtipo === 'monta' ? null : s.inseminador ?? 'Não informado'))} />
      <Tabela titulo="Por protocolo / tipo de serviço" grupos={agrupar(ev, (s) => s.protocolo ?? ROTULO_SERVICO[s.subtipo] ?? s.subtipo)} />
      <Tabela titulo="Por escore corporal (ECC)" grupos={agrupar(ev, (s) => classeEcc(s.ecc))} />
    </>
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

/** Tabela de eficiência: prenhes / com DG e a taxa, com barra (melhor em cima). */
export function Tabela({ titulo, grupos }: { titulo: string; grupos: Grupo[] }) {
  if (!grupos.length) return null;
  return (
    <View style={estilos.caixa}>
      <Text style={estilos.caixaTitulo}>{titulo}</Text>
      {grupos.map((g) => {
        const t = taxa(g);
        const cor = t < 0 ? cores.textoSuave : t >= 50 ? '#2F7D3A' : t >= 35 ? '#C08A00' : cores.erro;
        return (
          <View key={g.chave} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={estilos.grupoNome} numberOfLines={2}>{g.chave}</Text>
              <Text style={[estilos.grupoTaxa, { color: cor }]}>{t >= 0 ? `${formatarNumero(t, 0)}%` : '–'}</Text>
            </View>
            <View style={estilos.trilho}>
              <View style={[estilos.barra, { width: `${Math.max(t, 0)}%`, backgroundColor: cor }]} />
            </View>
            <Text style={estilos.grupoDetalhe}>
              {g.prenhes} prenhes de {g.prenhes + g.vazias} com DG · {g.servicos} serviços{g.pendentes ? ` · ${formatarNumero(g.pendentes)} aguardando` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  total: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
  cardDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 12 },
  caixaTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  grupoNome: { flex: 1, fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  grupoTaxa: { fontSize: tam.texto, fontWeight: '800' },
  grupoDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  trilho: { height: 10, borderRadius: 5, backgroundColor: cores.fundo, overflow: 'hidden' },
  barra: { height: 10, borderRadius: 5 },
});
