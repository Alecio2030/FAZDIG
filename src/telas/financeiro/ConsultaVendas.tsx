import React, { useCallback, useEffect, useState } from 'react';
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
import { formatarMoeda, formatarNumero } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { limitesMes, nomeMes, somarMeses } from '../../lib/titulos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const CAMPOS = 'id, numero, data, tipo, numero_documento, cabecas, arrobas, sacas, valor_bruto, valor_total, pessoa:pessoas ( nome )';
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
type Relacao = 'ultimas' | 'mes';
const RELACOES: { valor: Relacao; rotulo: string }[] = [
  { valor: 'ultimas', rotulo: 'Últimas vendas' },
  { valor: 'mes', rotulo: 'Vendas do mês' },
];

/** Consulta de vendas: pelo nº da venda, nº da nota ou comprador; ou as relações. Só mostra. */
export default function ConsultaVendas() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<any[] | null>(null);
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [lista, setLista] = useState<any[] | null>(null);
  const [mes, setMes] = useState(limitesMes(hojeBanco()).inicio);
  const [erro, setErro] = useState<string | null>(null);
  const termo = limparBusca(busca);

  useEffect(() => {
    if (!fid || !termo) return setAchados(null);
    const t = setTimeout(async () => {
      try {
        const pessoas = await consulta<any[]>(supabase.from('pessoas').select('id').ilike('nome', `%${termo}%`).limit(30));
        const partes = [`numero_documento.ilike.*${termo}*`];
        if (/^\d+$/.test(termo)) partes.unshift(`numero.eq.${termo}`);
        if (pessoas.length) partes.push(`pessoa_id.in.(${pessoas.map((p) => p.id).join(',')})`);
        setAchados(await consulta<any[]>(supabase.from('vendas').select(CAMPOS).eq('fazenda_id', fid).or(partes.join(',')).order('data', { ascending: false }).limit(30)));
      } catch (e) {
        setErro(traduzirErro(e));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [fid, termo]);

  useFocusEffect(
    useCallback(() => {
      if (!fid || !relacao) return;
      setLista(null);
      (async () => {
        try {
          let q = supabase.from('vendas').select(CAMPOS).eq('fazenda_id', fid);
          if (relacao === 'mes') {
            const { inicio, fim } = limitesMes(mes);
            q = q.gte('data', inicio).lte('data', fim).order('data').order('numero');
          } else q = q.order('data', { ascending: false }).order('numero', { ascending: false }).limit(50);
          setLista(await consulta<any[]>(q));
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid, relacao, mes]),
  );

  const linha = (v: any) => (
    <Linha
      key={v.id}
      titulo={`Venda nº ${v.numero} · ${doBanco(v.data)}`}
      linhas={[
        um(v.pessoa)?.nome ?? 'Cliente não informado',
        v.tipo === 'animais' ? `${formatarNumero(v.cabecas ?? 0)} cab.${v.arrobas ? ` · ${formatarNumero(Number(v.arrobas), 2)} @` : ''}` : v.tipo === 'cafe' ? `${formatarNumero(Number(v.sacas ?? 0), Number.isInteger(Number(v.sacas ?? 0)) ? 0 : 2)} sacas de café · ${formatarMoeda(Number(v.sacas) ? Number(v.valor_bruto) / Number(v.sacas) : 0)} por saca` : 'Outros produtos e serviços',
        v.numero_documento ? `Nota ${v.numero_documento}` : null,
      ]}
      direita={formatarMoeda(Number(v.valor_total))}
      onPress={() => navegacao.navigate('VendaDetalhe', { id: v.id })}
    />
  );

  return (
    <>
      <Busca valor={busca} aoMudar={(t) => { setBusca(t); if (t) setRelacao(null); }} dica="Nº da venda, nº da nota ou cliente" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {termo ? (
        achados === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        ) : achados.length === 0 ? (
          <Text style={estilos.dica}>Nenhuma venda com "{termo}".</Text>
        ) : (
          <Lista>{achados.map(linha)}</Lista>
        )
      ) : relacao ? (
        <>
          <Secao titulo={RELACOES.find((r) => r.valor === relacao)!.rotulo} />
          {relacao === 'mes' && (
            <View style={estilos.mes}>
              <Pressable onPress={() => setMes((m) => somarMeses(m, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
                <Ionicons name="chevron-back-circle" size={32} color={cores.primaria} />
              </Pressable>
              <Text style={estilos.mesTexto}>{nomeMes(mes)}</Text>
              <Pressable onPress={() => setMes((m) => somarMeses(m, 1))} hitSlop={12} accessibilityLabel="Mês seguinte">
                <Ionicons name="chevron-forward-circle" size={32} color={cores.primaria} />
              </Pressable>
            </View>
          )}
          {lista === null ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
          ) : lista.length === 0 ? (
            <Text style={estilos.dica}>Nenhuma venda.</Text>
          ) : (
            <>
              {relacao === 'mes' && (
                <View style={estilos.resumo}>
                  <Text style={estilos.resumoTexto}>
                    {lista.length} {lista.length === 1 ? 'venda' : 'vendas'}
                    {lista.some((v) => v.cabecas) ? ` · ${formatarNumero(lista.reduce((s, v) => s + (v.cabecas ?? 0), 0))} cab. · ${formatarNumero(lista.reduce((s, v) => s + Number(v.arrobas ?? 0), 0), 2)} @` : ''}
                    {lista.some((v) => Number(v.sacas)) ? ` · ${formatarNumero(lista.reduce((s, v) => s + Number(v.sacas ?? 0), 0), 1)} sc de café` : ''}
                  </Text>
                  <Text style={estilos.resumoValor}>{formatarMoeda(lista.reduce((s, v) => s + Number(v.valor_total), 0))}</Text>
                </View>
              )}
              <Lista>{lista.map(linha)}</Lista>
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
  resumo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  resumoTexto: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  resumoValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  mes: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mesTexto: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto, textTransform: 'capitalize' },
});
