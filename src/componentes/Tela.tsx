import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { cores, tam } from '../tema';

type Props = {
  children: React.ReactNode;
  /** false nas telas sem barra de título (login, primeiro acesso) */
  comCabecalho?: boolean;
  /** true nas telas que ficam dentro das abas de baixo */
  emAba?: boolean;
  rolar?: boolean;
  atualizando?: boolean;
  aoAtualizar?: () => void;
  /** barra fixa embaixo, sempre visível (ex.: Descartar / Lançar) */
  rodape?: React.ReactNode;
};

export default function Tela({ children, comCabecalho = true, emAba = false, rolar = true, atualizando, aoAtualizar, rodape }: Props) {
  const bordas: Edge[] = [];
  if (!comCabecalho) bordas.push('top');
  if (!emAba) bordas.push('bottom');

  const conteudo = rolar ? (
    <ScrollView
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
      refreshControl={aoAtualizar ? <RefreshControl refreshing={!!atualizando} onRefresh={aoAtualizar} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[estilos.conteudo, { flex: 1 }]}>{children}</View>
  );

  return (
    <SafeAreaView style={estilos.tela} edges={bordas}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {conteudo}
        {rodape ? (
          <View style={estilos.rodape}>
            <View style={estilos.rodapeDentro}>{rodape}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Largura máxima do conteúdo no navegador (PC). */
const LARGURA_PC = 860;

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  // no PC (navegador) o conteúdo fica numa coluna central, para não esticar de ponta a ponta
  conteudo: { padding: tam.espaco, paddingBottom: tam.espaco * 2, gap: tam.espaco, ...(Platform.OS === 'web' ? { width: '100%', maxWidth: LARGURA_PC, alignSelf: 'center' as const } : null) },
  rodape: {
    paddingHorizontal: tam.espaco,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: cores.cartao,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  rodapeDentro: { gap: 8, ...(Platform.OS === 'web' ? { width: '100%', maxWidth: LARGURA_PC - 2 * tam.espaco, alignSelf: 'center' as const } : null) },
});
