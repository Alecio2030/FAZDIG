import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { cores, tam } from '../tema';

type Props = {
  titulo: string;
  onPress: () => void;
  tipo?: 'primario' | 'secundario' | 'texto' | 'perigo';
  carregando?: boolean;
  desabilitado?: boolean;
};

export default function Botao({ titulo, onPress, tipo = 'primario', carregando = false, desabilitado = false }: Props) {
  const inativo = desabilitado || carregando;
  const corTexto = tipo === 'primario' ? '#FFFFFF' : tipo === 'perigo' ? cores.erro : cores.primaria;
  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo, busy: carregando }}
      style={({ pressed }) => [
        estilos.base,
        tipo === 'primario' && estilos.primario,
        tipo === 'secundario' && estilos.secundario,
        (tipo === 'texto' || tipo === 'perigo') && estilos.texto,
        pressed && { opacity: 0.75 },
        inativo && { opacity: 0.5 },
      ]}
    >
      {carregando ? <ActivityIndicator color={corTexto} /> : <Text style={[estilos.rotulo, { color: corTexto }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {titulo}
        </Text>}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    minHeight: tam.alturaToque,
    borderRadius: tam.raio,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primario: { backgroundColor: cores.primaria },
  secundario: { backgroundColor: cores.cartao, borderWidth: 2, borderColor: cores.primaria },
  texto: { backgroundColor: 'transparent' },
  rotulo: { fontSize: tam.texto, fontWeight: '600' },
});
