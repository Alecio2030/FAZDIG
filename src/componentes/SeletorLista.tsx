import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Busca from './Busca';
import Aviso from './Aviso';
import { traduzirErro } from '../lib/supabase';
import { cores, tam } from '../tema';

export type ItemLista = {
  id: string;
  titulo: string;
  detalhe?: string | null;
  /** não aparece para escolher (ex.: inativo), mas mostra o nome se já estiver escolhido */
  oculto?: boolean;
};

type Props = {
  rotulo: string;
  valorId: string | null;
  aoMudar: (id: string | null) => void;
  carregar: () => Promise<ItemLista[]>;
  erro?: string | null;
  vazio?: string;
  dicaBusca?: string;
  /** mostra a opção "Nenhum" para deixar em branco */
  permitirLimpar?: boolean;
};

const MAXIMO = 200;

/** Campo que abre uma lista com busca para escolher um item. */
export default function SeletorLista({ rotulo, valorId, aoMudar, carregar, erro, vazio = 'Nada cadastrado ainda.', dicaBusca = 'Buscar', permitirLimpar = false }: Props) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemLista[] | null>(null);
  const [busca, setBusca] = useState('');
  const [falha, setFalha] = useState<string | null>(null);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  async function buscarItens() {
    setFalha(null);
    try {
      setItens(await carregarRef.current());
    } catch (e) {
      setFalha(traduzirErro(e));
      setItens([]);
    }
  }

  // Ao editar, carrega a lista para mostrar o nome do que já está escolhido.
  useEffect(() => {
    // (recarrega também quando o escolhido é novo e ainda não está na lista, ex.: cadastrado na hora)
    if (valorId && (itens === null || !itens.some((i) => i.id === valorId))) buscarItens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorId]);

  function abrir() {
    setBusca('');
    setAberto(true);
    buscarItens();
  }

  function escolher(id: string | null) {
    aoMudar(id);
    setAberto(false);
  }

  const escolhido = valorId ? itens?.find((i) => i.id === valorId) : undefined;
  const termo = busca.trim().toLowerCase();
  const filtrados = (itens ?? []).filter(
    (i) => !i.oculto && (!termo || i.titulo.toLowerCase().includes(termo) || (i.detalhe ?? '').toLowerCase().includes(termo)),
  );

  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Pressable onPress={abrir} accessibilityRole="button" style={[estilos.campo, !!erro && { borderColor: cores.erro }]}>
        <Text style={[estilos.valor, !escolhido && { color: cores.textoSuave }]} numberOfLines={1}>
          {escolhido ? escolhido.titulo : valorId ? 'Carregando…' : 'Toque para escolher'}
        </Text>
        <Ionicons name="chevron-down" size={20} color={cores.textoSuave} />
      </Pressable>
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

      <Modal visible={aberto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAberto(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundo }}>
          <View style={estilos.topo}>
            <Text style={estilos.titulo}>{rotulo.replace(' *', '')}</Text>
            <Pressable onPress={() => setAberto(false)} hitSlop={12} accessibilityRole="button">
              <Text style={estilos.fechar}>Fechar</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: tam.espaco, gap: 12, flex: 1 }}>
            {(itens?.length ?? 0) > 6 && <Busca valor={busca} aoMudar={setBusca} dica={dicaBusca} />}
            {falha && <Aviso tipo="erro" texto={falha} />}
            {itens === null ? (
              <ActivityIndicator color={cores.primaria} style={{ marginTop: 24 }} />
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
                {permitirLimpar && (
                  <Pressable onPress={() => escolher(null)} style={({ pressed }) => [estilos.opcao, pressed && { opacity: 0.8 }]}>
                    <Text style={[estilos.opcaoTitulo, { color: cores.textoSuave }]}>Nenhum</Text>
                  </Pressable>
                )}
                {filtrados.length === 0 && <Text style={estilos.vazio}>{termo ? 'Nada encontrado com essa busca.' : vazio}</Text>}
                {filtrados.slice(0, MAXIMO).map((i) => {
                  const marcado = i.id === valorId;
                  return (
                    <Pressable
                      key={i.id}
                      onPress={() => escolher(i.id)}
                      style={({ pressed }) => [estilos.opcao, marcado && estilos.opcaoMarcada, pressed && { opacity: 0.8 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.opcaoTitulo}>{i.titulo}</Text>
                        {i.detalhe ? <Text style={estilos.opcaoDetalhe}>{i.detalhe}</Text> : null}
                      </View>
                      {marcado && <Ionicons name="checkmark-circle" size={24} color={cores.primaria} />}
                    </Pressable>
                  );
                })}
                {filtrados.length > MAXIMO && (
                  <Text style={estilos.vazio}>Mostrando {MAXIMO} de {filtrados.length}. Use a busca para achar os outros.</Text>
                )}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  rotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: tam.alturaToque,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: tam.raio,
    backgroundColor: cores.cartao,
    paddingHorizontal: 14,
    gap: 8,
  },
  valor: { flex: 1, fontSize: tam.texto, color: cores.texto },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: tam.espaco },
  titulo: { fontSize: tam.subtitulo + 2, fontWeight: '700', color: cores.texto, flexShrink: 1 },
  fechar: { fontSize: tam.texto, color: cores.primaria, fontWeight: '600' },
  vazio: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', marginTop: 24, lineHeight: 24 },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.cartao,
    borderRadius: tam.raio,
    padding: tam.espaco,
    minHeight: tam.alturaToque + 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  opcaoMarcada: { borderColor: cores.primaria },
  opcaoTitulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  opcaoDetalhe: { fontSize: tam.pequeno, color: cores.textoSuave, marginTop: 2 },
});
