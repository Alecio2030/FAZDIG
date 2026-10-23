import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, tam } from '../tema';

type Props = { texto: string; tipo?: 'erro' | 'sucesso' | 'info' };

export default function Aviso({ texto, tipo = 'info' }: Props) {
  const mapa = {
    erro: { fundo: cores.erroFundo, cor: cores.erro },
    sucesso: { fundo: cores.sucessoFundo, cor: cores.sucesso },
    info: { fundo: cores.infoFundo, cor: cores.info },
  }[tipo];
  return (
    <View style={[estilos.caixa, { backgroundColor: mapa.fundo, borderLeftColor: mapa.cor }]} accessibilityRole="alert">
      <Text style={[estilos.texto, { color: mapa.cor }]}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { borderLeftWidth: 4, borderRadius: 6, padding: 12 },
  texto: { fontSize: tam.pequeno + 1, lineHeight: 21 },
});
