import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSessao } from '../contexto/SessaoContext';
import { Alert } from '../lib/alerta';
import { cores } from '../tema';

// Barra de cima de todas as telas (V127; V132: embaixo do título vai o nome do Grupo),
// botão Voltar à esquerda e Sair à direita. Letras maiores no PC e barra colorida.

const WEB = Platform.OS === 'web';

/** PC = navegador com tela larga. No celular (mesmo pelo navegador) as medidas são as do celular. */
export function usePC(): boolean {
  const { width } = useWindowDimensions();
  return WEB && width >= 768;
}
export const COR_BARRA = cores.primariaEscura;
export const COR_TEXTO_BARRA = '#FFFFFF';

const NOME_PERFIL: Record<string, string> = { dono: 'Produtor', admin: 'Administrador', escritorio: 'Escritório', gerente: 'Gerente', funcionario: 'Funcionário' };

/**
 * Título da tela e, embaixo, o nome do Grupo (V132).
 * V136: embaixo do Grupo, em letra menor, a fazenda em que se está lançando e quem está usando
 * (Produtor, Administrador, Escritório, Gerente...), sem mostrar o e-mail.
 */
export function TituloCabecalho({ children }: { children?: React.ReactNode }) {
  const { grupo, fazendaAtiva, modoAdm, naUnidade } = useSessao();
  const titulo = typeof children === 'string' ? children : '';
  // a unidade em que se está lançando: a fazenda, o Administrativo ou o Particular (V137)
  // V138: fora do sistema (agendas abertas pela página de rosto) não aparece unidade nenhuma
  const fazenda = !naUnidade ? null : modoAdm ? 'Administrativo' : fazendaAtiva?.nome ?? null;
  // sem o nome do grupo cadastrado (Mais › Produtor), a linha de cima é a fazenda
  const linha2 = grupo ?? fazenda;
  const quem = fazendaAtiva?.perfil ? NOME_PERFIL[fazendaAtiva.perfil] ?? null : null;
  const linha3 = [grupo ? fazenda : null, quem ? `Usuário: ${quem}` : null].filter(Boolean).join('  ·  ');
  const pc = usePC();
  return (
    <View style={[estilos.titulo, { maxWidth: pc ? 560 : 190 }]}>
      <Text style={[estilos.tituloTexto, { fontSize: pc ? 22 : 16, lineHeight: pc ? 27 : 18 }]} numberOfLines={1}>
        {titulo}
      </Text>
      {linha2 ? (
        <Text style={[estilos.fazenda, { fontSize: pc ? 15 : 12, lineHeight: pc ? 19 : 14 }]} numberOfLines={1}>
          {linha2}
        </Text>
      ) : null}
      {linha3 ? (
        <Text style={[estilos.quem, { fontSize: pc ? 13 : 10.5, lineHeight: pc ? 17 : 12 }]} numberOfLines={1}>
          {linha3}
        </Text>
      ) : null}
    </View>
  );
}

/** "‹ Voltar": volta para a página anterior. */
export function BotaoVoltar({ aoTocar }: { aoTocar: () => void }) {
  const pc = usePC();
  return (
    <Pressable onPress={aoTocar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Voltar para a página anterior" style={({ pressed }) => [estilos.botao, { paddingHorizontal: pc ? 12 : 6 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name="chevron-back" size={pc ? 26 : 24} color={COR_TEXTO_BARRA} />
      <Text style={[estilos.botaoTexto, { fontSize: pc ? 18 : 15 }]}>Voltar</Text>
    </Pressable>
  );
}

/** Pergunta antes de sair do sistema. */
export function confirmarSaida(sair: () => Promise<void> | void) {
  Alert.alert('Sair do sistema', 'Deseja sair? Para voltar, entre de novo com e-mail e senha.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Sair', style: 'destructive', onPress: () => sair() },
  ]);
}

/** "Sair": sai do sistema (pergunta antes). */
export function BotaoSair() {
  const { sair } = useSessao();
  const pc = usePC();
  return (
    <Pressable onPress={() => confirmarSaida(sair)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Sair do sistema" style={({ pressed }) => [estilos.botao, { paddingHorizontal: pc ? 12 : 6 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name="log-out-outline" size={pc ? 24 : 22} color={COR_TEXTO_BARRA} />
      <Text style={[estilos.botaoTexto, { fontSize: pc ? 18 : 15 }]}>Sair</Text>
    </Pressable>
  );
}

/** Opções da barra comuns às telas da pilha e às abas de baixo. */
export const opcoesBarra = {
  headerStyle: { backgroundColor: COR_BARRA },
  headerTintColor: COR_TEXTO_BARRA,
  headerTitleAlign: 'center' as const,
  headerTitle: (p: { children?: React.ReactNode }) => <TituloCabecalho {...p} />,
  headerRight: () => <BotaoSair />,
};

const estilos = StyleSheet.create({
  titulo: { alignItems: 'center' },
  tituloTexto: { fontWeight: '800', color: COR_TEXTO_BARRA },
  fazenda: { fontWeight: '700', color: '#CFE3D2', marginTop: 1 },
  quem: { fontWeight: '600', color: '#B9CFBD' },
  botao: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 40 },
  botaoTexto: { fontWeight: '700', color: COR_TEXTO_BARRA },
});
