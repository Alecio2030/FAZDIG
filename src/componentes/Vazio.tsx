import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NomeIcone } from './ItemMenu';
import { cores, tam } from '../tema';

/** Mensagem para quando uma lista ainda não tem nada. */
export default function Vazio({ icone, texto }: { icone: NomeIcone; texto: string }) {
  return (
    <View style={estilos.caixa}>
      <Ionicons name={icone} size={40} color={cores.textoSuave} />
      <Text style={estilos.texto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 16 },
  texto: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24 },
});
