import React from 'react';
import { StyleSheet, View } from 'react-native';
import { cores, tam } from '../tema';

/** Moldura de lista com divisórias entre os itens. */
export default function Lista({ children }: { children: React.ReactNode }) {
  const itens = React.Children.toArray(children);
  return (
    <View style={estilos.lista}>
      {itens.map((filho, i) => (
        <View key={i} style={i > 0 ? estilos.divisor : undefined}>
          {filho}
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  lista: { borderRadius: tam.raio, overflow: 'hidden', borderWidth: 1, borderColor: cores.borda },
  divisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
});
