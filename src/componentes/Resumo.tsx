import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, tam } from '../tema';

/** Linha discreta de totais no alto da consulta, ex.: "3 mangas  |  42,5 ha". */
export default function Resumo({ esquerda, direita }: { esquerda: string; direita?: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.texto}>{esquerda}</Text>
      {direita ? <Text style={estilos.texto}>{direita}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  texto: { fontSize: tam.pequeno, color: cores.textoSuave },
});
