import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Botao from '../../componentes/Botao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { abrirFotoDocumento } from '../../lib/documentos';
import { textoSacas } from '../../lib/posColheita';
import { ROTULO_MOVIMENTO, nomeLocal, r2, um } from '../../lib/armazem';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const VAZIO = '–';

/** Ficha do lote de café (Consulta): classificação, onde está, origem e o extrato das movimentações. Só mostra. */
export default function LoteCafeDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'LoteCafeDetalhe'>>();
  const [d, setD] = useState<{ l: any; movs: any[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? `Lote de café nº ${d.l.numero}` : 'Lote de café' });
  }, [navegacao, d]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [l, movs] = await Promise.all([
            consulta<any>(supabase.from('cafe_lotes').select('*, pilagem:cafe_pilagens ( id, numero, data ), safra:safras ( nome )').eq('id', params.id).single()),
            consulta<any[]>(supabase.from('cafe_movimentos').select('id, data, tipo, sacas, valor, par_id, venda_id, observacoes, created_at, local_id, local:pc_locais ( nome, tipo )').eq('lote_id', params.id).order('data').order('created_at')),
          ]);
          setD({ l, movs });
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  if (!d) return <Tela rolar={!!erro}>{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}</Tela>;
  const { l, movs } = d;
  const porLocal: Record<string, { local: any; saldo: number }> = {};
  for (const m of movs) {
    porLocal[m.local_id] ??= { local: um(m.local), saldo: 0 };
    porLocal[m.local_id].saldo += Number(m.sacas);
  }
  const locais = Object.values(porLocal).map((x) => ({ ...x, saldo: r2(x.saldo) })).filter((x) => x.saldo > 0.005);
  const saldo = r2(locais.reduce((t, x) => t + x.saldo, 0));
  const pil = um(l.pilagem);
  const perc = (v: any) => (v != null ? `${formatarQtd(v)}%` : null);

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>
          ☕ {l.especie ?? 'Café'}
          {l.tipo ? ` · tipo ${l.tipo}` : ''}
        </Text>
        <Text style={estilos.sub}>
          Lote nº {l.numero} · entrou em {doBanco(l.data_entrada)}
        </Text>
        <View style={estilos.cards}>
          <Card rotulo="Em estoque" valor={textoSacas(saldo)} detalhe={`${formatarNumero(saldo * 60)} kg`} />
          <Card rotulo="Entraram" valor={textoSacas(l.sacas)} detalhe={saldo < Number(l.sacas) - 0.005 ? `${textoSacas(r2(Number(l.sacas) - saldo))} já saíram` : undefined} />
        </View>
        {!l.tipo && <Text style={[estilos.nota, { color: cores.cafe, fontWeight: '700' }]}>Lote sem classificação: complete em Armazém de café › Entrada › "Alterar ou classificar um lote já lançado".</Text>}
      </View>

      <Secao titulo="Onde está" />
      {locais.length === 0 ? <Text style={estilos.nota}>Sem saldo: todo o café deste lote já saiu.</Text> : locais.map((x) => <Dado key={x.local?.nome} rotulo={nomeLocal(x.local)} valor={textoSacas(x.saldo)} />)}

      <Secao titulo="Classificação" />
      <Dado rotulo="Espécie" valor={l.especie} />
      <Dado rotulo="Tipo (pelos defeitos)" valor={l.tipo} />
      <Dado rotulo="Peneira" valor={l.peneira} />
      <Dado rotulo="Umidade" valor={perc(l.umidade)} />
      <Dado rotulo="Defeitos" valor={l.defeitos != null ? formatarQtd(l.defeitos) : null} />
      <Dado rotulo="Impurezas" valor={perc(l.impurezas)} />
      <Dado rotulo="Broca" valor={perc(l.broca)} />
      {l.bebida ? <Dado rotulo="Bebida" valor={l.bebida} /> : null}
      <Dado rotulo="Romaneio / recibo" valor={l.documento} />
      {l.arquivo_laudo ? <Botao titulo="📷 Ver a foto do laudo" tipo="secundario" onPress={async () => !(await abrirFotoDocumento(l.arquivo_laudo)) && setErro('Não foi possível abrir a foto do laudo.')} /> : null}

      <Secao titulo="Origem" />
      {pil ? (
        <>
          <Dado rotulo="Pilagem" valor={`Nº ${pil.numero} · ${doBanco(pil.data)}`} />
          <Botao titulo="Ver a pilagem e os talhões de origem" tipo="secundario" onPress={() => navegacao.navigate('PosColheitaDetalhe', { tipo: 'pilagem', id: pil.id })} />
        </>
      ) : (
        <>
          <Dado rotulo="Café de outra origem" valor={l.origem_descricao} />
          <Dado rotulo="Safra" valor={um(l.safra)?.nome} />
          <Dado rotulo="Custo por saca" valor={l.custo_saca != null ? `${formatarMoeda(Number(l.custo_saca))} (lote: ${formatarMoeda(Number(l.custo_saca) * Number(l.sacas))})` : null} />
        </>
      )}

      <Secao titulo="Movimentações" />
      {movs.map((m) => (
        <Pressable key={m.id} style={estilos.mov} disabled={!m.venda_id} onPress={() => navegacao.navigate('VendaDetalhe', { id: m.venda_id })} accessibilityRole={m.venda_id ? 'button' : undefined}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.movTitulo}>
              {doBanco(m.data)} · {ROTULO_MOVIMENTO[m.tipo] ?? m.tipo}
            </Text>
            <Text style={estilos.nota}>
              {um(m.local)?.nome}
              {m.valor ? ` · ${formatarMoeda(Number(m.valor))}` : ''}
              {m.observacoes ? ` · ${m.observacoes}` : ''}
              {m.venda_id ? ' ›' : ''}
            </Text>
          </View>
          {Number(m.sacas) !== 0 && (
            <Text style={[estilos.movValor, Number(m.sacas) < 0 && { color: cores.erro }]}>
              {Number(m.sacas) > 0 ? '+' : '−'}
              {formatarQtd(Math.abs(Number(m.sacas)), 2)}
            </Text>
          )}
        </Pressable>
      ))}
      {l.observacoes ? <Text style={estilos.obs}>{l.observacoes}</Text> : null}
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
function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || VAZIO}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 8 },
  titulo: { fontSize: tam.subtitulo + 3, fontWeight: '800', color: cores.primariaEscura },
  sub: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  obs: { fontSize: tam.texto, color: cores.texto, lineHeight: 24, marginTop: 6 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  cardDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
  mov: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  movTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  movValor: { fontSize: tam.texto, fontWeight: '800', color: cores.primaria },
});
