import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { cores, tam } from '../tema';

/** Título de um grupo de campos dentro de um formulário. */
export default function Secao({ titulo }: { titulo: string }) {
  return <Text style={estilos.titulo}>{titulo}</Text>;
}

const estilos = StyleSheet.create({
  titulo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura, marginTop: 12 },
});
