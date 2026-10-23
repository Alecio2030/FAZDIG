import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { semAcento } from '../../lib/codigos';
import { somarMes, textoMes } from '../../lib/imobilizado';
import { CAMPOS_COLHEITA, ICONE_TIPO_COLHEITA, ROTULO_TIPO_COLHEITA, custoColheita, textoLitros, textoMedida, um } from '../../lib/colheitas';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const CAMPOS = `${CAMPOS_COLHEITA}, colhedores:pc_colhedores ( pessoa_id, quantidade, valor, fechamento_id, pessoa:pessoas ( nome ) )`;
type Relacao = 'ultimas' | 'colhedores' | 'talhoes';

/** Consulta das colheitas: pelo nº, talhão ou colhedor; relações das últimas, da produção por colhedor e do colhido por talhão no mês. Só mostra. */
export default function ConsultaColheitas() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [todas, setTodas] = useState<any[] | null>(null);
  const [busca, setBusca] = useState('');
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [mes, setMes] = useState(hojeBanco().slice(0, 7));
  const [erro, setErro] = useState<string | null>(null);
  const termo = semAcento(limparBusca(busca));

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      (async () => {
        try {
          setTodas(await consulta<any[]>(supabase.from('pc_lotes').select(CAMPOS).eq('fazenda_id', fid).order('data_colheita', { ascending: false }).order('numero', { ascending: false }).limit(500)));
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid]),
  );

  const textoBusca = (c: any) =>
    semAcento(`${c.numero} ${um(c.area)?.nome ?? ''} ${um(c.safra)?.nome ?? ''} ${ROTULO_TIPO_COLHEITA[c.tipo_colheita] ?? ''} ${(c.colhedores ?? []).map((x: any) => um(x.pessoa)?.nome ?? '').join(' ')}`);
  const achadas = todas && termo ? todas.filter((c) => (/^\d+$/.test(termo) ? String(c.numero) === termo || textoBusca(c).includes(termo) : textoBusca(c).includes(termo))) : null;

  const linha = (c: any) => {
    const nc = (c.colhedores ?? []).length;
    return (
      <Linha
        key={c.id}
        titulo={`${ICONE_TIPO_COLHEITA[c.tipo_colheita] ?? ''} Nº ${c.numero} · ${doBanco(c.data_colheita)}`}
        linhas={[`${um(c.area)?.nome ?? ''} · ${ROTULO_TIPO_COLHEITA[c.tipo_colheita] ?? ''}`, `${textoMedida(c.quantidade_bruta, c.unidade)} · ${textoLitros(c.litros)}${nc ? ` · ${nc} ${nc === 1 ? 'colhedor' : 'colhedores'}` : ''}`]}
        direita={custoColheita(c) ? formatarMoeda(custoColheita(c)) : undefined}
        onPress={() => navegacao.navigate('ColheitaDetalhe', { id: c.id })}
      />
    );
  };

  // ---- relações do mês ----
  const doMes = (todas ?? []).filter((c) => c.data_colheita.slice(0, 7) === mes);
  const porColhedor: Record<string, { nome: string; medidas: Record<string, number>; valor: number; aberto: number; dias: Set<string> }> = {};
  for (const c of doMes)
    for (const x of c.colhedores ?? []) {
      const k = x.pessoa_id ?? '?';
      porColhedor[k] ??= { nome: um(x.pessoa)?.nome ?? '', medidas: {}, valor: 0, aberto: 0, dias: new Set() };
      porColhedor[k].medidas[c.unidade] = (porColhedor[k].medidas[c.unidade] ?? 0) + Number(x.quantidade);
      porColhedor[k].valor += Number(x.valor);
      if (!x.fechamento_id) porColhedor[k].aberto += Number(x.valor);
      porColhedor[k].dias.add(c.data_colheita);
    }
  const colhedoresMes = Object.values(porColhedor).sort((a, b) => b.valor - a.valor);
  const totalColhedores = colhedoresMes.reduce((s, p) => s + p.valor, 0);

  const porTalhao: Record<string, { nome: string; litros: number; custo: number; n: number }> = {};
  for (const c of doMes) {
    porTalhao[c.area_id] ??= { nome: um(c.area)?.nome ?? '', litros: 0, custo: 0, n: 0 };
    porTalhao[c.area_id].litros += Number(c.litros ?? 0);
    porTalhao[c.area_id].custo += custoColheita(c);
    porTalhao[c.area_id].n += 1;
  }
  const talhoesMes = Object.values(porTalhao).sort((a, b) => b.litros - a.litros);
  const litrosMes = talhoesMes.reduce((s, t) => s + t.litros, 0);
  const custoMes = talhoesMes.reduce((s, t) => s + t.custo, 0);

  const RELACOES: { valor: Relacao; rotulo: string }[] = [
    { valor: 'ultimas', rotulo: 'Últimas colheitas' },
    { valor: 'colhedores', rotulo: 'Produção por colhedor no mês' },
    { valor: 'talhoes', rotulo: 'Colhido por talhão no mês' },
  ];
  const seletorMes = (
    <View style={estilos.mes}>
      <Pressable onPress={() => setMes(somarMes(mes, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
        <Ionicons name="chevron-back" size={28} color={cores.primaria} />
      </Pressable>
      <Text style={estilos.mesTexto}>{textoMes(mes)}</Text>
      <Pressable onPress={() => setMes(somarMes(mes, 1))} hitSlop={12} accessibilityLabel="Próximo mês">
        <Ionicons name="chevron-forward" size={28} color={cores.primaria} />
      </Pressable>
    </View>
  );
  const fecharRelacao = <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />;

  return (
    <>
      <Busca
        valor={busca}
        aoMudar={(t) => {
          setBusca(t);
          if (t) setRelacao(null);
        }}
        dica="Nº, talhão ou colhedor"
      />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {todas === null ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : termo ? (
        achadas!.length === 0 ? (
          <Text style={estilos.dica}>Nenhuma colheita com "{busca.trim()}".</Text>
        ) : (
          <>
            <Text style={estilos.total}>{achadas!.length === 1 ? '1 colheita' : `${achadas!.length} colheitas`}</Text>
            <Lista>{achadas!.slice(0, 100).map(linha)}</Lista>
          </>
        )
      ) : relacao === 'ultimas' ? (
        <>
          <Secao titulo="Últimas colheitas" />
          {todas.length === 0 ? <Text style={estilos.dica}>Nenhuma colheita lançada.</Text> : <Lista>{todas.slice(0, 50).map(linha)}</Lista>}
          {fecharRelacao}
        </>
      ) : relacao === 'colhedores' ? (
        <>
          {seletorMes}
          {colhedoresMes.length === 0 ? (
            <Text style={estilos.dica}>Nenhuma produção de colhedor em {textoMes(mes)}.</Text>
          ) : (
            <View style={estilos.caixa}>
              {colhedoresMes.map((p) => (
                <View key={p.nome} style={estilos.par}>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.parTitulo}>{p.nome}</Text>
                    <Text style={estilos.parDetalhe}>
                      {Object.entries(p.medidas).map(([u, q]) => textoMedida(q, u)).join(' + ')} · {p.dias.size} {p.dias.size === 1 ? 'dia' : 'dias'}
                      {p.aberto > 0.004 ? ` · ${formatarMoeda(p.aberto)} em aberto` : ' · fechado'}
                    </Text>
                  </View>
                  <Text style={estilos.parValor}>{formatarMoeda(p.valor)}</Text>
                </View>
              ))}
              <View style={[estilos.par, estilos.totalLinha]}>
                <Text style={[estilos.parTitulo, { flex: 1 }]}>Total do mês</Text>
                <Text style={[estilos.parValor, { color: cores.primariaEscura }]}>{formatarMoeda(totalColhedores)}</Text>
              </View>
            </View>
          )}
          {fecharRelacao}
        </>
      ) : relacao === 'talhoes' ? (
        <>
          {seletorMes}
          {talhoesMes.length === 0 ? (
            <Text style={estilos.dica}>Nenhuma colheita em {textoMes(mes)}.</Text>
          ) : (
            <View style={estilos.caixa}>
              {talhoesMes.map((t) => (
                <View key={t.nome} style={estilos.par}>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.parTitulo}>{t.nome}</Text>
                    <Text style={estilos.parDetalhe}>
                      {t.n} {t.n === 1 ? 'colheita' : 'colheitas'}
                      {t.custo ? ` · custo ${formatarMoeda(t.custo)}` : ''}
                    </Text>
                  </View>
                  <Text style={estilos.parValor}>{textoLitros(t.litros)}</Text>
                </View>
              ))}
              <View style={[estilos.par, estilos.totalLinha]}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.parTitulo}>Total do mês</Text>
                  <Text style={estilos.parDetalhe}>Custo da colheita {formatarMoeda(custoMes)}</Text>
                </View>
                <Text style={[estilos.parValor, { color: cores.primariaEscura }]}>{textoLitros(litrosMes)}</Text>
              </View>
            </View>
          )}
          {fecharRelacao}
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
  mes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 4 },
  mesTexto: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura, minWidth: 110, textAlign: 'center' },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  par: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totalLinha: { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 8 },
  parTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  parDetalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
  parValor: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
});
