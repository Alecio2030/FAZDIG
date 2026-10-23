import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NomeIcone } from './ItemMenu';
import { traduzirErro } from '../lib/supabase';
import { cores, tam } from '../tema';

export type ItemRapido = { id: string; titulo: string; detalhe?: string | null };

type Props = {
  rotulo: string;
  valorId: string | null;
  aoMudar: (id: string | null) => void;
  /** busca pelo texto digitado; com texto vazio devolve os cadastrados (para "Ver cadastrados") */
  buscar: (termo: string) => Promise<ItemRapido[]>;
  /** nome do item já escolhido (ao abrir uma tela de edição) */
  lerNome: (id: string) => Promise<string | null>;
  /** cadastra na hora o que foi digitado; sem isso, só escolhe */
  criar?: (texto: string) => Promise<ItemRapido>;
  /** em vez de cadastrar direto, avisa quem usa o campo (que pede mais dados) */
  aoPedirNovo?: (texto: string) => void;
  /** ex.: "nova raça" */
  rotuloNovo?: string;
  icone?: NomeIcone;
  placeholder?: string;
  erro?: string | null;
};

const MAXIMO_LISTA = 40;

/**
 * Campo de cadastro de apoio: digita e aparecem os parecidos; "Ver cadastrados" mostra a lista;
 * se não existir, cadastra na hora com o que foi digitado.
 */
export default function CampoBuscaRapida({ rotulo, valorId, aoMudar, buscar, lerNome, criar, aoPedirNovo, rotuloNovo = 'novo', icone = 'bookmark', placeholder, erro }: Props) {
  const [texto, setTexto] = useState('');
  const [nomeEscolhido, setNomeEscolhido] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemRapido[] | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  useEffect(() => {
    if (!valorId) return setNomeEscolhido(null);
    lerNome(valorId).then(setNomeEscolhido).catch(() => setNomeEscolhido(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorId]);

  const termo = texto.trim().replace(/[%_,()*\\]/g, '');
  const mostrar = !valorId && (termo.length >= 1 || verTodos);

  // Busca depois que a pessoa para de digitar (ou ao pedir a lista).
  useEffect(() => {
    if (!mostrar) return setItens(null);
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        setItens(await buscarRef.current(termo));
        setFalha(null);
      } catch (e) {
        setFalha(traduzirErro(e));
      }
      setBuscando(false);
    }, termo ? 300 : 0);
    return () => clearTimeout(t);
  }, [termo, mostrar]);

  function escolher(i: ItemRapido) {
    setNomeEscolhido(i.titulo);
    setTexto('');
    setVerTodos(false);
    aoMudar(i.id);
  }

  async function cadastrarNovo() {
    if (aoPedirNovo) {
      aoPedirNovo(texto.trim());
      setTexto('');
      setVerTodos(false);
      return;
    }
    if (!criar) return;
    setFalha(null);
    setCriando(true);
    try {
      escolher(await criar(texto.trim()));
    } catch (e) {
      setFalha(traduzirErro(e));
    }
    setCriando(false);
  }

  if (valorId) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        <View style={estilos.escolhido}>
          <Ionicons name={icone} size={20} color={cores.primaria} />
          <Text style={estilos.nome} numberOfLines={2}>{nomeEscolhido ?? 'Carregando…'}</Text>
          <Pressable onPress={() => aoMudar(null)} hitSlop={10} accessibilityRole="button">
            <Text style={estilos.acao}>Trocar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const existeIgual = (itens ?? []).some((i) => i.titulo.toLowerCase() === texto.trim().toLowerCase());

  return (
    <View style={{ gap: 6 }}>
      <View style={estilos.topo}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        <Pressable onPress={() => setVerTodos((v) => !v)} hitSlop={10} accessibilityRole="button">
          <Text style={estilos.acao}>{verTodos && !termo ? 'Fechar lista' : 'Ver cadastrados'}</Text>
        </Pressable>
      </View>
      <TextInput
        value={texto}
        onChangeText={setTexto}
        placeholder={placeholder ?? 'Digite para buscar ou cadastrar'}
        placeholderTextColor={cores.textoSuave}
        autoCapitalize="sentences"
        autoCorrect={false}
        autoComplete="off"
        style={[estilos.entrada, !!erro && { borderColor: cores.erro }]}
      />
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      {falha ? <Text style={estilos.erro}>{falha}</Text> : null}

      {mostrar && (
        <View style={estilos.caixa}>
          {buscando && <ActivityIndicator color={cores.primaria} style={{ padding: 10 }} />}
          {!buscando && itens && itens.length === 0 && !termo && <Text style={estilos.vazio}>Nada cadastrado ainda. Digite acima para cadastrar.</Text>}
          {!buscando &&
            (itens ?? []).slice(0, MAXIMO_LISTA).map((i) => (
              <Pressable key={i.id} onPress={() => escolher(i)} style={({ pressed }) => [estilos.linha, pressed && { backgroundColor: '#F3F6F2' }]}>
                <Text style={estilos.titulo}>{i.titulo}</Text>
                {i.detalhe ? <Text style={estilos.detalhe}>{i.detalhe}</Text> : null}
              </Pressable>
            ))}
          {!buscando && (itens?.length ?? 0) > MAXIMO_LISTA && <Text style={estilos.vazio}>Digite para achar os outros.</Text>}
          {!buscando && (criar || aoPedirNovo) && termo.length >= 1 && !existeIgual && (
            <Pressable onPress={cadastrarNovo} disabled={criando} style={({ pressed }) => [estilos.linha, pressed && { backgroundColor: '#F3F6F2' }]}>
              {criando ? <ActivityIndicator color={cores.primaria} /> : <Text style={estilos.novo}>+ Cadastrar "{texto.trim()}" como {rotuloNovo}</Text>}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  caixa: { borderWidth: 1, borderColor: cores.borda, borderRadius: tam.raio, backgroundColor: cores.cartao, overflow: 'hidden' },
  linha: { paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  titulo: { fontSize: tam.texto, color: cores.texto, fontWeight: '600' },
  detalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
  vazio: { fontSize: tam.pequeno + 1, color: cores.textoSuave, padding: 12 },
  novo: { fontSize: tam.texto, color: cores.primaria, fontWeight: '600' },
  escolhido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: tam.alturaToque,
    borderWidth: 1.5,
    borderColor: cores.primaria,
    borderRadius: tam.raio,
    backgroundColor: cores.cartao,
    paddingHorizontal: 14,
  },
  nome: { flex: 1, fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  acao: { fontSize: tam.texto, color: cores.primaria, fontWeight: '600' },
});
