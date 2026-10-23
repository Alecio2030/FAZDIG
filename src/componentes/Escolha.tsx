import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, tam } from '../tema';

export type Opcao = { valor: string; rotulo: string };

type Props = {
  rotulo?: string;
  opcoes: Opcao[];
  valor: string[];
  aoMudar: (valor: string[]) => void;
  /** permite marcar várias opções */
  multiplo?: boolean;
  erro?: string | null;
};

/** Botões de escolha lado a lado (uma ou várias opções). */
export default function Escolha({ rotulo, opcoes, valor, aoMudar, multiplo = false, erro }: Props) {
  function tocar(v: string) {
    if (!multiplo) return aoMudar([v]);
    aoMudar(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v]);
  }
  return (
    <View style={{ gap: 6 }}>
      {rotulo ? <Text style={estilos.rotulo}>{rotulo}</Text> : null}
      <View style={estilos.linha}>
        {opcoes.map((o) => {
          const marcado = valor.includes(o.valor);
          return (
            <Pressable
              key={o.valor}
              onPress={() => tocar(o.valor)}
              accessibilityRole={multiplo ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: marcado }}
              style={({ pressed }) => [estilos.chip, marcado && estilos.chipMarcado, pressed && { opacity: 0.8 }]}
            >
              <Text style={[estilos.chipTexto, marcado && { color: '#FFFFFF' }]}>{o.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  rotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: cores.primaria,
    backgroundColor: cores.cartao,
    justifyContent: 'center',
  },
  chipMarcado: { backgroundColor: cores.primaria },
  chipTexto: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.primaria },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
