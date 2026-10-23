import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Campo from './Campo';
import { cores, tam } from '../tema';

type Props = TextInputProps & { rotulo: string; erro?: string | null; ajuda?: string };

/** Campo de senha com o olho para ver o que foi digitado. */
export default function CampoSenha(props: Props) {
  const [visivel, setVisivel] = useState(false);
  return (
    <View>
      <Campo {...props} secureTextEntry={!visivel} autoCapitalize="none" autoCorrect={false} style={{ paddingRight: 52 }} />
      <Pressable
        onPress={() => setVisivel((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visivel ? 'Esconder a senha' : 'Mostrar a senha'}
        style={[estilos.olho, { top: props.rotulo ? 27 : 0 }]}
      >
        <Ionicons name={visivel ? 'eye-off-outline' : 'eye-outline'} size={24} color={cores.textoSuave} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  olho: { position: 'absolute', right: 0, width: 52, height: tam.alturaToque, alignItems: 'center', justifyContent: 'center' },
});
