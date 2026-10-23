import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cores, tam } from '../tema';

type Props = { valor: string; aoMudar: (t: string) => void; dica?: string };

export default function Busca({ valor, aoMudar, dica = 'Buscar' }: Props) {
  return (
    <View style={estilos.caixa}>
      <Ionicons name="search" size={20} color={cores.textoSuave} />
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        placeholder={dica}
        placeholderTextColor={cores.textoSuave}
        style={estilos.entrada}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: tam.alturaToque,
    backgroundColor: cores.cartao,
    borderRadius: tam.raio,
    borderWidth: 1.5,
    borderColor: cores.borda,
    paddingHorizontal: 12,
  },
  entrada: { flex: 1, fontSize: tam.texto, color: cores.texto, minHeight: tam.alturaToque },
});
