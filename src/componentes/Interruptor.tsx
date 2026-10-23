import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { cores, tam } from '../tema';

type Props = { rotulo: string; descricao?: string; valor: boolean; aoMudar: (v: boolean) => void };

export default function Interruptor({ rotulo, descricao, valor, aoMudar }: Props) {
  return (
    <View style={estilos.linha}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        {descricao ? <Text style={estilos.descricao}>{descricao}</Text> : null}
      </View>
      <Switch value={valor} onValueChange={aoMudar} trackColor={{ true: cores.primaria, false: cores.borda }} />
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: tam.alturaToque,
    backgroundColor: cores.cartao,
    borderRadius: tam.raio,
    borderWidth: 1.5,
    borderColor: cores.borda,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rotulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  descricao: { fontSize: tam.pequeno, color: cores.textoSuave, marginTop: 2 },
});
