import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { cores, tam } from '../tema';
import { agruparDigitacao } from '../lib/formatos';

type Props = TextInputProps & {
  rotulo: string;
  erro?: string | null;
  ajuda?: string;
};

const NUMERICOS = ['number-pad', 'decimal-pad', 'numeric', 'numbers-and-punctuation', 'phone-pad'];

export default function Campo({ rotulo, erro, ajuda, style, ...resto }: Props) {
  // Número com decimais: ponto a cada 3 casas antes da vírgula enquanto digita (padrão 1.234.567,89).
  if (resto.keyboardType === 'decimal-pad' && resto.onChangeText) {
    const original = resto.onChangeText;
    resto.onChangeText = (t: string) => original(agruparDigitacao(t));
  }
  // Campo de número: ao tocar, seleciona o que está escrito; o que digitar substitui (não junta).
  const numerico = NUMERICOS.includes(String(resto.keyboardType ?? ''));
  return (
    <View style={estilos.bloco}>
      {rotulo ? <Text style={estilos.rotulo}>{rotulo}</Text> : null}
      <TextInput
        placeholderTextColor={cores.textoSuave}
        selectTextOnFocus={numerico}
        // sem preenchimento automático do navegador ou do teclado: o campo só mostra o que foi digitado aqui
        autoComplete="off"
        style={[estilos.entrada, !!erro && { borderColor: cores.erro }, style]}
        {...resto}
      />
      {erro ? <Text style={estilos.erro}>{erro}</Text> : ajuda ? <Text style={estilos.ajuda}>{ajuda}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 6 },
  rotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  entrada: {
    minHeight: tam.alturaToque,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: tam.raio,
    backgroundColor: cores.cartao,
    paddingHorizontal: 14,
    fontSize: tam.texto,
    color: cores.texto,
  },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  ajuda: { fontSize: tam.pequeno, color: cores.textoSuave },
});
