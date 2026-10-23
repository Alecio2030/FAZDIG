import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSessao } from '../contexto/SessaoContext';
import { cores, tam } from '../tema';

/** V132: em destaque o Grupo (o tronco); embaixo, a fazenda em uso nos lançamentos. Com mais de uma fazenda, toque para trocar. */
export default function SeletorFazenda() {
  const { fazendas, fazendaAtiva, trocarFazenda, grupo } = useSessao();
  const [aberto, setAberto] = useState(false);
  const podeTrocar = fazendas.length > 1;
  if (!fazendaAtiva) return null;

  const local = [fazendaAtiva.municipio, fazendaAtiva.uf].filter(Boolean).join(' / ');

  return (
    <>
      <Pressable
        disabled={!podeTrocar}
        onPress={() => setAberto(true)}
        accessibilityRole={podeTrocar ? 'button' : undefined}
        accessibilityHint={podeTrocar ? 'Toque para trocar de fazenda' : undefined}
        style={({ pressed }) => [estilos.caixa, pressed && { opacity: 0.8 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={estilos.nome} numberOfLines={2}>{grupo ?? fazendaAtiva.nome}</Text>
          {grupo ? (
            <Text style={estilos.emUso} numberOfLines={2}>
              Lançando em: {fazendaAtiva.nome}
              {local ? ` (${local})` : ''}
            </Text>
          ) : local ? (
            <Text style={estilos.local}>{local}</Text>
          ) : null}
        </View>
        {podeTrocar && (
          <View style={estilos.trocar}>
            <Ionicons name="swap-horizontal" size={18} color="#FFFFFF" />
            <Text style={estilos.trocarTexto}>Trocar</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={aberto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAberto(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundo }}>
          <View style={estilos.topoModal}>
            <Text style={estilos.tituloModal}>Escolha a fazenda</Text>
            <Pressable onPress={() => setAberto(false)} hitSlop={12} accessibilityRole="button">
              <Text style={estilos.fechar}>Fechar</Text>
            </Pressable>
          </View>
          {fazendas.map((f) => {
            const ativa = f.id === fazendaAtiva.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  trocarFazenda(f.id);
                  setAberto(false);
                }}
                style={({ pressed }) => [estilos.opcao, pressed && { opacity: 0.8 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[estilos.opcaoNome, ativa && { color: cores.primaria }]}>{f.nome}</Text>
                  <Text style={estilos.localOpcao}>{[f.municipio, f.uf].filter(Boolean).join(' / ')}</Text>
                </View>
                {ativa && <Ionicons name="checkmark-circle" size={26} color={cores.primaria} />}
              </Pressable>
            );
          })}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const estilos = StyleSheet.create({
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: cores.primariaEscura,
    borderRadius: tam.raio,
    padding: tam.espaco,
  },
  nome: { fontSize: tam.titulo - 4, fontWeight: '700', color: '#FFFFFF' },
  emUso: { fontSize: tam.pequeno + 1, color: '#E3EFE4', fontWeight: '600', marginTop: 3 },
  local: { fontSize: tam.pequeno, color: '#C9DCCB', marginTop: 2 },
  trocar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  trocarTexto: { color: '#FFFFFF', fontWeight: '600', fontSize: tam.pequeno + 1 },
  topoModal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: tam.espaco },
  tituloModal: { fontSize: tam.subtitulo + 2, fontWeight: '700', color: cores.texto },
  fechar: { fontSize: tam.texto, color: cores.primaria, fontWeight: '600' },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.cartao,
    marginHorizontal: tam.espaco,
    marginBottom: 8,
    borderRadius: tam.raio,
    padding: tam.espaco,
    minHeight: tam.alturaToque + 16,
  },
  localOpcao: { fontSize: tam.pequeno, color: cores.textoSuave, marginTop: 2 },
  opcaoNome: { fontSize: tam.texto + 1, fontWeight: '600', color: cores.texto },
});
