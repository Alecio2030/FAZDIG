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
import { formatarNumero } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { semAcento } from '../../lib/codigos';
import { textoSacas } from '../../lib/posColheita';
import { cotacaoReferencia, lerCotacoes, type Cotacao } from '../../lib/cotacoes';
import { formatarMoeda } from '../../lib/formatos';
import { CAMPOS_POSICAO, nomeLocal, posicoes, rotuloTipo, textoClassificacao, um, type Posicao } from '../../lib/armazem';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Relacao = 'armazens' | 'tipos' | 'lotes';

/** Consulta do armazém: estoque de café por armazém e por tipo, e os lotes (pelo nº, armazém, romaneio ou tipo). Só mostra. */
export default function ConsultaArmazem() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [d, setD] = useState<{ lotes: any[]; pos: Posicao[] } | null>(null);
  const [cots, setCots] = useState<Cotacao[]>([]);
  const [busca, setBusca] = useState('');
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const termo = semAcento(limparBusca(busca));

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      (async () => {
        try {
          const [lotes, movs] = await Promise.all([
            consulta<any[]>(supabase.from('cafe_lotes').select('*, local:pc_locais ( nome, tipo ), pilagem:cafe_pilagens ( numero )').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(1000)),
            consulta<any[]>(supabase.from('cafe_movimentos').select(CAMPOS_POSICAO).eq('fazenda_id', fid).limit(10000)),
          ]);
          setD({ lotes, pos: posicoes(movs) });
          lerCotacoes().then(setCots).catch(() => setCots([]));
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid]),
  );

  if (!d) return erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;

  const saldoLote = (id: string) => d.pos.filter((p) => p.loteId === id).reduce((t, p) => t + p.saldo, 0);
  const ondeLote = (id: string) => d.pos.filter((p) => p.loteId === id).map((p) => p.local?.nome).join(', ');
  const linha = (l: any) => {
    const saldo = saldoLote(l.id);
    return (
      <Linha
        key={l.id}
        titulo={`Lote nº ${l.numero} · ${doBanco(l.data_entrada)}`}
        linhas={[textoClassificacao(l) || 'Sem classificação', `${saldo > 0.005 ? ondeLote(l.id) : 'Sem saldo'}${um(l.pilagem) ? ` · pilagem nº ${um(l.pilagem).numero}` : l.origem_descricao ? ` · ${l.origem_descricao}` : ' · outra origem'}${l.documento ? ` · doc. ${l.documento}` : ''}`]}
        direita={textoSacas(saldo)}
        onPress={() => navegacao.navigate('LoteCafeDetalhe', { id: l.id })}
      />
    );
  };
  const achados = termo ? d.lotes.filter((l) => String(l.numero) === termo || semAcento(`${um(l.local)?.nome ?? ''} ${ondeLote(l.id)} ${l.documento ?? ''} ${l.origem_descricao ?? ''} ${textoClassificacao(l)}`).includes(termo)) : [];

  const total = d.pos.reduce((t, p) => t + p.saldo, 0);
  const valorHoje = d.pos.reduce((t, p) => t + p.saldo * (cotacaoReferencia(cots, p.lote?.tipo)?.preco ?? 0), 0);
  const diaCotacao = cotacaoReferencia(cots)?.data ?? null;
  const agrupar = (chave: (p: Posicao) => string) => {
    const m: Record<string, { nome: string; sacas: number; itens: Posicao[] }> = {};
    for (const p of d.pos) {
      const k = chave(p);
      m[k] ??= { nome: k, sacas: 0, itens: [] };
      m[k].sacas += p.saldo;
      m[k].itens.push(p);
    }
    return Object.values(m).sort((a, b) => b.sacas - a.sacas);
  };
  const porArmazem = agrupar((p) => nomeLocal(p.local));
  const porTipo = agrupar((p) => rotuloTipo(p.lote ?? {}));
  const semClass = d.lotes.filter((l) => !l.tipo && saldoLote(l.id) > 0.005).length;

  const RELACOES: { valor: Relacao; rotulo: string }[] = [
    { valor: 'armazens', rotulo: 'Estoque por armazém' },
    { valor: 'tipos', rotulo: 'Estoque por tipo de café' },
    { valor: 'lotes', rotulo: 'Últimos lotes' },
  ];
  const fechar = <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />;
  const grupo = (g: { nome: string; sacas: number; itens: Posicao[] }, detalhe: (p: Posicao) => string) => (
    <View key={g.nome} style={estilos.caixa}>
      <View style={estilos.par}>
        <Text style={[estilos.grupoNome, { flex: 1 }]}>{g.nome}</Text>
        <Text style={estilos.grupoValor}>{textoSacas(g.sacas)}</Text>
      </View>
      {g.itens.map((p) => (
        <View key={p.chave} style={estilos.par}>
          <Text style={[estilos.nota, { flex: 1 }]} onPress={() => navegacao.navigate('LoteCafeDetalhe', { id: p.loteId })}>
            Lote nº {p.numero} · {detalhe(p)} ›
          </Text>
          <Text style={estilos.itemValor}>{textoSacas(p.saldo)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <>
      <Busca
        valor={busca}
        aoMudar={(t) => {
          setBusca(t);
          if (t) setRelacao(null);
        }}
        dica="Nº do lote, armazém, romaneio ou tipo"
      />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {termo ? (
        achados.length === 0 ? <Text style={estilos.dica}>Nenhum lote com "{busca.trim()}".</Text> : <Lista>{achados.slice(0, 100).map(linha)}</Lista>
      ) : relacao === 'armazens' || relacao === 'tipos' ? (
        <>
          <Secao titulo={relacao === 'armazens' ? 'Estoque por armazém' : 'Estoque por tipo de café'} />
          <View style={estilos.totalCaixa}>
            <Text style={estilos.totalRotulo}>Café em estoque</Text>
            <Text style={estilos.totalValor}>{textoSacas(total)}</Text>
            <Text style={estilos.nota}>
              {formatarNumero(total * 60)} kg{semClass ? ` · ${semClass} ${semClass === 1 ? 'lote' : 'lotes'} sem classificação` : ''}
            </Text>
            {valorHoje > 0 && diaCotacao ? (
              <Text style={[estilos.nota, { fontWeight: '700', color: cores.cafe }]}>
                Vale {formatarMoeda(valorHoje)} pela cotação de {doBanco(diaCotacao)} ({formatarMoeda(valorHoje / total)} por saca). Detalhe na aba Cotação.
              </Text>
            ) : null}
          </View>
          {d.pos.length === 0 ? (
            <Text style={estilos.dica}>Nenhum café em estoque.</Text>
          ) : relacao === 'armazens' ? (
            porArmazem.map((g) => grupo(g, (p) => rotuloTipo(p.lote ?? {})))
          ) : (
            porTipo.map((g) => grupo(g, (p) => nomeLocal(p.local)))
          )}
          {fechar}
        </>
      ) : relacao === 'lotes' ? (
        <>
          <Secao titulo="Últimos lotes" />
          {d.lotes.length === 0 ? <Text style={estilos.dica}>Nenhum lote de café lançado.</Text> : <Lista>{d.lotes.slice(0, 50).map(linha)}</Lista>}
          {fechar}
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
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  par: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grupoNome: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  grupoValor: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  itemValor: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.cafe },
  totalCaixa: { backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 12, gap: 2 },
  totalRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.textoSuave },
  totalValor: { fontSize: tam.titulo, fontWeight: '800', color: cores.primariaEscura },
});
