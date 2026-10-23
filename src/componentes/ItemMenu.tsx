import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cores, tam } from '../tema';

export type NomeIcone = React.ComponentProps<typeof Ionicons>['name'];

type Props = { icone: NomeIcone; titulo: string; descricao?: string; onPress: () => void; perigo?: boolean };

export default function ItemMenu({ icone, titulo, descricao, onPress, perigo = false }: Props) {
  const cor = perigo ? cores.erro : cores.primaria;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [estilos.item, pressed && { backgroundColor: '#F3F6F2' }]}
    >
      <Ionicons name={icone} size={26} color={cor} />
      <View style={{ flex: 1 }}>
        <Text style={[estilos.titulo, perigo && { color: cores.erro }]}>{titulo}</Text>
        {descricao ? <Text style={estilos.descricao}>{descricao}</Text> : null}
      </View>
      {!perigo && <Ionicons name="chevron-forward" size={20} color={cores.textoSuave} />}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: tam.alturaToque + 12,
    paddingHorizontal: tam.espaco,
    paddingVertical: 10,
    backgroundColor: cores.cartao,
  },
  titulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  descricao: { fontSize: tam.pequeno, color: cores.textoSuave, marginTop: 2 },
});
