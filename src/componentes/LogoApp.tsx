import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { cores } from '../tema';

/** Logo do aplicativo com o slogan FAZENDA DIGITAL logo abaixo. */
export default function LogoApp({ tamanho = 104, slogan = true }: { tamanho?: number; slogan?: boolean }) {
  return (
    <View style={estilos.bloco}>
      <Image source={require('../imagens/logo.png')} style={{ width: tamanho, height: tamanho, borderRadius: tamanho * 0.22 }} accessibilityLabel="Logo do Fazenda Digital" />
      {slogan && <Text style={estilos.slogan}>FAZENDA DIGITAL</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { alignItems: 'center', gap: 10 },
  slogan: { fontSize: 18, fontWeight: '800', letterSpacing: 4, color: cores.primariaEscura },
});
