import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { limparBusca } from '../../lib/useBusca';
import { semAcento } from '../../lib/codigos';
import { ROTULO_TIPO, textoNivel, tituloOcorrencia } from '../../lib/monitoramento';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
type Relacao = 'abertas' | 'ultimas' | 'talhoes';

/** Consulta das ocorrências de pragas e doenças: pelo nº, talhão ou problema; relações das abertas, das últimas e por talhão. Só mostra. */
export default function ConsultaMonitoramentos() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [todas, setTodas] = useState<any[] | null>(null);
  const [busca, setBusca] = useState('');
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const termo = semAcento(limparBusca(busca));

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      consulta<any[]>(
        supabase.from('monitoramentos').select('id, numero, data, tipo, problema, severidade, incidencia_perc, situacao, origem, area:areas ( id, nome )').eq('fazenda_id', fid).order('data', { ascending: false }).order('numero', { ascending: false }).limit(500),
      ).then(setTodas, (e) => setErro(traduzirErro(e)));
    }, [fid]),
  );

  const textoBusca = (m: any) => semAcento(`${m.numero} ${m.problema} ${ROTULO_TIPO[m.tipo] ?? ''} ${um(m.area)?.nome ?? ''}`);
  const achadas = todas && termo ? todas.filter((m) => (/^\d+$/.test(termo) ? String(m.numero) === termo : textoBusca(m).includes(termo))) : null;
  const abertas = (todas ?? []).filter((m) => m.situacao === 'aberta');

  const linha = (m: any) => (
    <Linha
      key={m.id}
      titulo={`Nº ${m.numero} · ${doBanco(m.data)}`}
      linhas={[tituloOcorrencia(m), [um(m.area)?.nome, textoNivel(m)].filter(Boolean).join(' · ')]}
      direita={m.tipo === 'sadia' ? undefined : m.situacao === 'aberta' ? 'aberta' : 'controlada'}
      inativo={false}
      onPress={() => navegacao.navigate('MonitoramentoDetalhe', { id: m.id })}
    />
  );

  // abertas por talhão
  const porTalhao: Record<string, { nome: string; itens: any[] }> = {};
  for (const m of abertas) {
    const a = um(m.area);
    if (!a) continue;
    (porTalhao[a.id] ??= { nome: a.nome, itens: [] }).itens.push(m);
  }
  const talhoes = Object.values(porTalhao).sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, 'pt-BR'));

  const RELACOES: { valor: Relacao; rotulo: string }[] = [
    { valor: 'abertas', rotulo: `Ocorrências em aberto${todas ? ` (${abertas.length})` : ''}` },
    { valor: 'talhoes', rotulo: 'Em aberto por talhão' },
    { valor: 'ultimas', rotulo: 'Últimas ocorrências' },
  ];

  return (
    <>
      <Busca
        valor={busca}
        aoMudar={(t) => {
          setBusca(t);
          if (t) setRelacao(null);
        }}
        dica="Nº, talhão ou problema"
      />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {todas === null ? (
        !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : termo ? (
        achadas!.length === 0 ? (
          <Text style={estilos.dica}>Nenhuma ocorrência com "{busca.trim()}".</Text>
        ) : (
          <>
            <Text style={estilos.total}>{achadas!.length === 1 ? '1 ocorrência' : `${achadas!.length} ocorrências`}</Text>
            <Lista>{achadas!.slice(0, 100).map(linha)}</Lista>
          </>
        )
      ) : relacao === 'abertas' ? (
        <>
          <Secao titulo="Ocorrências em aberto" />
          {abertas.length === 0 ? <Text style={estilos.dica}>Nenhuma ocorrência em aberto.</Text> : <Lista>{abertas.slice(0, 100).map(linha)}</Lista>}
          <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />
        </>
      ) : relacao === 'talhoes' ? (
        <>
          <Secao titulo="Em aberto por talhão" />
          {talhoes.length === 0 ? (
            <Text style={estilos.dica}>Nenhuma ocorrência em aberto.</Text>
          ) : (
            talhoes.map((t) => (
              <View key={t.nome} style={{ gap: 8 }}>
                <Text style={estilos.talhao}>
                  {t.nome} · {t.itens.length === 1 ? '1 em aberto' : `${t.itens.length} em aberto`}
                </Text>
                <Lista>{t.itens.map(linha)}</Lista>
              </View>
            ))
          )}
          <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />
        </>
      ) : relacao === 'ultimas' ? (
        <>
          <Secao titulo="Últimas ocorrências" />
          {todas.length === 0 ? <Text style={estilos.dica}>Nenhuma ocorrência lançada.</Text> : <Lista>{todas.slice(0, 50).map(linha)}</Lista>}
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

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  total: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  talhao: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
});
