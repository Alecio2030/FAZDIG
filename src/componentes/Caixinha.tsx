import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cores, tam } from '../tema';

type Props = {
  rotulo: string;
  /** explicação curta embaixo do rótulo */
  detalhe?: string | null;
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
  desabilitado?: boolean;
};

/** Caixinha para marcar com X, com o texto ao lado (V127: acessos por pessoa). */
export default function Caixinha({ rotulo, detalhe, marcado, aoMudar, desabilitado = false }: Props) {
  return (
    <Pressable
      onPress={() => !desabilitado && aoMudar(!marcado)}
      disabled={desabilitado}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcado, disabled: desabilitado }}
      accessibilityLabel={rotulo}
      style={({ pressed }) => [estilos.linha, pressed && { opacity: 0.7 }, desabilitado && { opacity: 0.5 }]}
    >
      <View style={[estilos.caixa, marcado && estilos.caixaMarcada]}>{marcado ? <Ionicons name="close" size={22} color="#FFFFFF" /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        {detalhe ? <Text style={estilos.detalhe}>{detalhe}</Text> : null}
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 4 },
  caixa: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: cores.primaria, backgroundColor: cores.cartao, alignItems: 'center', justifyContent: 'center' },
  caixaMarcada: { backgroundColor: cores.primaria },
  rotulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  detalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
});
