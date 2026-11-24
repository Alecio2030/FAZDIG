import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Secao from './Secao';
import { AVISO_SUGESTAO, type Diagnostico } from '../lib/diagnostico';
import { formatarNumero } from '../lib/formatos';
import { cores, tam } from '../tema';

/**
 * V166 · Quadro do diagnóstico de um laudo: o aviso de que é sugestão, o que está fora do padrão (vermelho),
 * o que pede atenção (amarelo), as sugestões de correção e as observações.
 */
export default function QuadroDiagnostico({ diagnostico, titulo = 'O que está fora do padrão' }: { diagnostico: Diagnostico; titulo?: string }) {
  const fora = diagnostico.achados.filter((a) => a.nivel === 'fora');
  const atencao = diagnostico.achados.filter((a) => a.nivel === 'atencao');
  const casas = (v: number) => (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
  const linha = (a: (typeof fora)[number], cor: string) => (
    <View key={a.chave} style={estilos.item}>
      <View style={[estilos.bolinha, { backgroundColor: cor }]} />
      <Text style={estilos.itemTexto}>
        <Text style={estilos.forte}>{a.rotulo}</Text>: {formatarNumero(a.valor, casas(a.valor))}
        {a.unidade ? ` ${a.unidade}` : ''} · <Text style={{ color: cor, fontWeight: '700' }}>{a.classe}</Text>
        {a.faixa ? <Text style={estilos.suave}> ({a.faixa})</Text> : null}
      </Text>
    </View>
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={estilos.aviso}>
        <Ionicons name="alert-circle-outline" size={20} color={cores.cafe} />
        <Text style={estilos.avisoTexto}>{AVISO_SUGESTAO}</Text>
      </View>

      <Secao titulo={titulo} />
      {fora.length === 0 && atencao.length === 0 ? (
        <Text style={[estilos.itemTexto, { color: cores.sucesso, fontWeight: '700' }]}>Tudo dentro dos valores de referência.</Text>
      ) : (
        <View style={estilos.quadro}>
          {fora.length > 0 && <Text style={[estilos.grupo, { color: cores.erro }]}>Fora do padrão ({fora.length})</Text>}
          {fora.map((a) => linha(a, cores.erro))}
          {atencao.length > 0 && <Text style={[estilos.grupo, { color: cores.cafe }]}>Atenção ({atencao.length})</Text>}
          {atencao.map((a) => linha(a, cores.cafe))}
        </View>
      )}

      {diagnostico.sugestoes.length > 0 && (
        <>
          <Secao titulo="Sugestões para correção" />
          <View style={estilos.quadro}>
            {diagnostico.sugestoes.map((s, k) => (
              <View key={k} style={{ gap: 2 }}>
                <Text style={estilos.sugTitulo}>{s.titulo}</Text>
                <Text style={estilos.itemTexto}>{s.texto}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      {diagnostico.observacoes.map((o, k) => (
        <Text key={k} style={estilos.suave}>
          • {o}
        </Text>
      ))}
      {diagnostico.achados.length > 0 && <Text style={estilos.suave}>Referências: {[...new Set(diagnostico.achados.map((a) => a.fonte).filter((x) => x !== 'laudo'))].join('; ')}.</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  aviso: { flexDirection: 'row', gap: 8, backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 10, borderLeftWidth: 4, borderLeftColor: cores.cafe },
  avisoTexto: { flex: 1, fontSize: tam.pequeno, color: cores.texto, lineHeight: 19, fontWeight: '600' },
  quadro: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  grupo: { fontSize: tam.pequeno + 1, fontWeight: '800' },
  item: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bolinha: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  itemTexto: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 21 },
  forte: { fontWeight: '700' },
  suave: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  sugTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.primariaEscura },
});
