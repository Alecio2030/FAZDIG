import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cores, tam } from '../tema';

type Opcao = { valor: string; rotulo: string; detalhe?: string };
type Props = {
  rotulo: string;
  valor: string;
  opcoes: Opcao[];
  aoMudar: (v: string) => void;
  /** texto fixo (ex.: "do lote"): a caixa não abre */
  fixo?: string | null;
  vazio?: string;
  erro?: boolean;
  largura?: number;
};

/** V203: caixinha pequena de escolha (abre a lista por cima), para as grades de itens. */
export default function CaixaEscolha({ rotulo, valor, opcoes, aoMudar, fixo, vazio = 'Escolher', erro, largura = 120 }: Props) {
  const [aberta, setAberta] = useState(false);
  const atual = opcoes.find((o) => o.valor === valor);
  return (
    <View style={{ width: largura, gap: 6 }}>
      <Text style={estilos.rotulo} numberOfLines={1}>
        {rotulo}
      </Text>
      <Pressable
        onPress={() => !fixo && setAberta(true)}
        style={[estilos.caixa, !!erro && { borderColor: cores.erro }, !!fixo && { backgroundColor: cores.fundo }]}
        accessibilityRole="button"
        accessibilityLabel={`${rotulo}: ${fixo ?? atual?.rotulo ?? vazio}`}
      >
        <Text style={[estilos.valor, !atual && !fixo && { color: cores.textoSuave }]} numberOfLines={1}>
          {fixo ?? atual?.rotulo ?? vazio}
        </Text>
        {!fixo && <Ionicons name="chevron-down" size={16} color={cores.textoSuave} />}
      </Pressable>
      <Modal visible={aberta} transparent animationType="fade" onRequestClose={() => setAberta(false)}>
        <Pressable style={estilos.fundo} onPress={() => setAberta(false)}>
          <View style={estilos.lista}>
            <Text style={estilos.titulo}>{rotulo}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {opcoes.map((o) => (
                <Pressable
                  key={o.valor}
                  onPress={() => {
                    aoMudar(o.valor);
                    setAberta(false);
                  }}
                  style={[estilos.opcao, o.valor === valor && { backgroundColor: cores.sucessoFundo }]}
                >
                  <Text style={estilos.opcaoTexto}>{o.rotulo}</Text>
                  {o.detalhe ? <Text style={estilos.detalhe}>{o.detalhe}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  rotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  caixa: {
    minHeight: tam.alturaToque,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: tam.raio,
    backgroundColor: cores.cartao,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  valor: { fontSize: tam.texto, color: cores.texto, flexShrink: 1 },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  lista: { backgroundColor: cores.cartao, borderRadius: tam.raio, padding: 12, width: '100%', maxWidth: 380, gap: 6 },
  titulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura, marginBottom: 4 },
  opcao: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  opcaoTexto: { fontSize: tam.texto, color: cores.texto },
  detalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
});
