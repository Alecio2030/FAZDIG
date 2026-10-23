import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cores, tam } from '../tema';

type Props = { titulo: string; linhas?: (string | null | undefined)[]; direita?: string; inativo?: boolean; onPress: () => void };

/** Um item de lista de cadastro: nome em cima, detalhes embaixo, valor à direita. */
export default function Linha({ titulo, linhas = [], direita, inativo = false, onPress }: Props) {
  const detalhes = linhas.filter(Boolean) as string[];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [estilos.item, pressed && { backgroundColor: '#F3F6F2' }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[estilos.titulo, inativo && { color: cores.textoSuave }]}>
          {titulo}
          {inativo ? '  (inativo)' : ''}
        </Text>
        {detalhes.map((d, i) => (
          <Text key={i} style={estilos.detalhe}>{d}</Text>
        ))}
      </View>
      {direita ? <Text style={estilos.direita}>{direita}</Text> : null}
      <Ionicons name="chevron-forward" size={20} color={cores.textoSuave} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: tam.alturaToque + 12,
    paddingHorizontal: tam.espaco,
    paddingVertical: 10,
    backgroundColor: cores.cartao,
  },
  titulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  detalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
  direita: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
});
