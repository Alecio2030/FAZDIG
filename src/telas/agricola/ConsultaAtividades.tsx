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
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { semAcento } from '../../lib/codigos';
import { somarMes, textoMes } from '../../lib/imobilizado';
import { ICONE_ATIVIDADE, custoAtividade, custoItem, mediosAtuais, tituloAtividade } from '../../lib/atividades';
import { custoOperacao } from '../../lib/maoObra';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const CAMPOS =
  'id, numero, data, tipo, subtipo, alvo, custo_mao_obra, custo_maquina, areas:atividade_areas ( area_ha, area:areas ( nome ) ), itens:atividade_insumos ( insumo_id, quantidade, unidade, quantidade_estoque, custo_unitario, baixou, retornado, insumo:insumos ( nome, unidade ) )';
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
type Relacao = 'ultimas' | 'produtos';

/** Consulta das atividades: pelo nº, talhão, tipo ou produto; relações das últimas e dos produtos aplicados no mês. Só mostra. */
export default function ConsultaAtividades() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [todas, setTodas] = useState<any[] | null>(null);
  const [medios, setMedios] = useState<Record<string, number | null>>({});
  const [busca, setBusca] = useState('');
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [mes, setMes] = useState(hojeBanco().slice(0, 7));
  const [erro, setErro] = useState<string | null>(null);
  const termo = semAcento(limparBusca(busca).toLowerCase());

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      (async () => {
        try {
          const d = await consulta<any[]>(supabase.from('atividades_agricolas').select(CAMPOS).eq('fazenda_id', fid).order('data', { ascending: false }).order('numero', { ascending: false }).limit(500));
          const ids = [...new Set(d.flatMap((a) => (a.itens ?? []).map((i: any) => i.insumo_id)))];
          const movs = ids.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade, valor_unitario, data').eq('fazenda_id', fid).eq('tipo', 'entrada').in('insumo_id', ids)) : [];
          setMedios(mediosAtuais(movs));
          setTodas(d);
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid]),
  );

  const textoBusca = (a: any) =>
    semAcento(
      `${a.numero} ${tituloAtividade(a)} ${a.alvo ?? ''} ${(a.areas ?? []).map((x: any) => um(x.area)?.nome ?? '').join(' ')} ${(a.itens ?? []).map((i: any) => um(i.insumo)?.nome ?? '').join(' ')}`.toLowerCase(),
    );
  const achadas = todas && termo ? todas.filter((a) => (/^\d+$/.test(termo) ? String(a.numero) === termo || textoBusca(a).includes(termo) : textoBusca(a).includes(termo))) : null;

  const linha = (a: any) => {
    const locais = (a.areas ?? []).map((x: any) => um(x.area)?.nome).filter(Boolean);
    const ha = (a.areas ?? []).reduce((s: number, x: any) => s + Number(x.area_ha ?? 0), 0);
    const produtos = (a.itens ?? []).map((i: any) => `${um(i.insumo)?.nome ?? ''} ${formatarQtd(i.quantidade, 2)} ${i.unidade}`);
    const custo = custoAtividade(a.itens ?? [], medios) + custoOperacao(a);
    return (
      <Linha
        key={a.id}
        titulo={`${ICONE_ATIVIDADE[a.tipo] ?? ''} Nº ${a.numero} · ${doBanco(a.data)}`}
        linhas={[tituloAtividade(a), `${locais.join(', ')}${ha ? ` · ${formatarNumero(ha, 2)} ha` : ''}`, produtos.length ? produtos.join(' + ') : null]}
        direita={custo ? formatarMoeda(custo) : undefined}
        onPress={() => navegacao.navigate('AtividadeDetalhe', { id: a.id })}
      />
    );
  };

  // produtos aplicados no mês: soma por produto
  const doMes = (todas ?? []).filter((a) => a.data.slice(0, 7) === mes);
  const porProduto: Record<string, { nome: string; unidade: string; qtd: number; custo: number; vezes: number }> = {};
  for (const a of doMes)
    for (const i of a.itens ?? []) {
      const k = i.insumo_id;
      porProduto[k] ??= { nome: um(i.insumo)?.nome ?? '', unidade: i.unidade, qtd: 0, custo: 0, vezes: 0 };
      porProduto[k].qtd += Number(i.quantidade);
      porProduto[k].vezes += 1;
      if (i.baixou) porProduto[k].custo += custoItem(i, medios[k] ?? null) ?? 0;
    }
  const produtosMes = Object.values(porProduto).sort((a, b) => b.custo - a.custo);
  const totalMes = produtosMes.reduce((s, p) => s + p.custo, 0);

  const RELACOES: { valor: Relacao; rotulo: string }[] = [
    { valor: 'ultimas', rotulo: 'Últimas atividades' },
    { valor: 'produtos', rotulo: 'Produtos aplicados no mês' },
  ];

  return (
    <>
      <Busca
        valor={busca}
        aoMudar={(t) => {
          setBusca(t);
          if (t) setRelacao(null);
        }}
        dica="Nº, talhão, tipo ou produto"
      />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {todas === null ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : termo ? (
        achadas!.length === 0 ? (
          <Text style={estilos.dica}>Nenhuma atividade com "{busca.trim()}".</Text>
        ) : (
          <>
            <Text style={estilos.total}>{achadas!.length === 1 ? '1 atividade' : `${achadas!.length} atividades`}</Text>
            <Lista>{achadas!.slice(0, 100).map(linha)}</Lista>
          </>
        )
      ) : relacao === 'ultimas' ? (
        <>
          <Secao titulo="Últimas atividades" />
          {todas.length === 0 ? <Text style={estilos.dica}>Nenhuma atividade lançada.</Text> : <Lista>{todas.slice(0, 50).map(linha)}</Lista>}
          <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />
        </>
      ) : relacao === 'produtos' ? (
        <>
          <View style={estilos.mes}>
            <Pressable onPress={() => setMes(somarMes(mes, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
              <Ionicons name="chevron-back" size={28} color={cores.primaria} />
            </Pressable>
            <Text style={estilos.mesTexto}>{textoMes(mes)}</Text>
            <Pressable onPress={() => setMes(somarMes(mes, 1))} hitSlop={12} accessibilityLabel="Próximo mês">
              <Ionicons name="chevron-forward" size={28} color={cores.primaria} />
            </Pressable>
          </View>
          {produtosMes.length === 0 ? (
            <Text style={estilos.dica}>Nenhum produto aplicado em {textoMes(mes)}.</Text>
          ) : (
            <>
              <View style={estilos.caixa}>
                {produtosMes.map((p) => (
                  <View key={p.nome} style={estilos.par}>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.parTitulo}>{p.nome}</Text>
                      <Text style={estilos.parDetalhe}>
                        {formatarQtd(p.qtd, 2)} {p.unidade} · {p.vezes === 1 ? '1 aplicação' : `${p.vezes} aplicações`}
                      </Text>
                    </View>
                    <Text style={estilos.parValor}>{formatarMoeda(p.custo)}</Text>
                  </View>
                ))}
                <View style={[estilos.par, { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 8 }]}>
                  <Text style={[estilos.parTitulo, { flex: 1 }]}>Total do mês</Text>
                  <Text style={[estilos.parValor, { color: cores.primariaEscura }]}>{formatarMoeda(totalMes)}</Text>
                </View>
              </View>
              <Text style={estilos.dica2}>{doMes.length === 1 ? '1 atividade no mês.' : `${doMes.length} atividades no mês.`}</Text>
            </>
          )}
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
  dica2: { fontSize: tam.pequeno, color: cores.textoSuave },
  total: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  mes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 4 },
  mesTexto: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura, minWidth: 110, textAlign: 'center' },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  par: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  parTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  parDetalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
  parValor: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
});
