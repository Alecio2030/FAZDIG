import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NomeIcone } from './ItemMenu';
import { cores, tam } from '../tema';

export type OpcaoAba = { valor: string; rotulo: string; icone?: NomeIcone };

/** Símbolo de cada aba, pelo que ela faz (V130). */
const ICONES: Record<string, NomeIcone> = {
  cadastrar: 'add-circle-outline',
  consultar: 'search-outline',
  lancar: 'create-outline',
  pagar: 'cash-outline',
  pagamento: 'wallet-outline',
  previsao: 'partly-sunny-outline',
  chuva: 'rainy-outline',
  irrigacao: 'water-outline',
  secagem: 'flame-outline',
  pilagem: 'cog-outline',
  entrada: 'enter-outline',
  saida: 'exit-outline',
  retorno: 'return-down-back-outline',
  movimentar: 'swap-horizontal-outline',
  contratos: 'document-text-outline',
  cotacao: 'trending-up-outline',
};

type Props = {
  opcoes: OpcaoAba[];
  valor: string[];
  aoMudar: (valor: string[]) => void;
};

/**
 * Abas de cima das telas (Cadastrar | Consultar, Lançar | Pagar | Consultar...): uma faixa só, juntas,
 * cada uma com o seu símbolo. A aba aberta fica cheia de verde.
 */
export default function AbasTela({ opcoes, valor, aoMudar }: Props) {
  return (
    <View style={estilos.faixa} accessibilityRole="tablist">
      {opcoes.map((o, i) => {
        const ativa = valor.includes(o.valor);
        const icone = o.icone ?? ICONES[o.valor] ?? 'ellipse-outline';
        return (
          <Pressable
            key={o.valor}
            onPress={() => aoMudar([o.valor])}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativa }}
            accessibilityLabel={o.rotulo}
            style={({ pressed }) => [estilos.aba, i > 0 && estilos.divisa, ativa && estilos.ativa, pressed && !ativa && { backgroundColor: '#E8EFE7' }]}
          >
            <Ionicons name={(ativa ? icone.replace('-outline', '') : icone) as NomeIcone} size={22} color={ativa ? '#FFFFFF' : cores.primaria} />
            <Text style={[estilos.rotulo, ativa && { color: '#FFFFFF' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {o.rotulo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  faixa: { flexDirection: 'row', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: tam.raio, overflow: 'hidden', backgroundColor: cores.cartao },
  aba: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 7, paddingHorizontal: 4, minHeight: 54 },
  divisa: { borderLeftWidth: 1, borderLeftColor: cores.borda },
  ativa: { backgroundColor: cores.primaria },
  rotulo: { fontSize: tam.pequeno, fontWeight: '700', color: cores.primaria },
});
