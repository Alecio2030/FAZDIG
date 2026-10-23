import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Botao from './Botao';
import { cores, tam } from '../tema';

type Props = {
  /** título do quadro, ex.: "Lançar por voz" */
  titulo?: string;
  /** frase de exemplo mostrada embaixo do campo */
  exemplo: string;
  /**
   * Recebe o texto ditado; a tela interpreta e se preenche para conferência.
   * Devolve a mensagem de erro, ou null se deu certo (aí o quadro fecha).
   */
  aoInterpretar: (texto: string) => Promise<string | null>;
};

/**
 * Quadro "lançar por voz": a pessoa toca no microfone do teclado do celular e fala; a IA entende e a tela abre preenchida.
 * Nunca grava nada: quem grava é o botão da própria tela, depois de conferido.
 */
export default function EntradaVoz({ titulo = 'Lançar por voz', exemplo, aoInterpretar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function interpretar() {
    const t = texto.trim();
    if (t.length < 5) return setErro('Toque no microfone do teclado e fale o que foi feito.');
    setErro(null);
    setOcupado(true);
    let msg: string | null;
    try {
      msg = await aoInterpretar(t);
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }
    setOcupado(false);
    if (msg) return setErro(msg);
    setTexto('');
    setAberto(false);
  }

  if (!aberto) {
    return (
      <View style={estilos.quadro}>
        <Botao titulo={`🎙️  ${titulo}`} tipo="secundario" onPress={() => setAberto(true)} />
        <Text style={estilos.texto}>Fale o que foi feito; a tela se preenche e você só confere.</Text>
      </View>
    );
  }

  return (
    <View style={estilos.quadro}>
      <Text style={estilos.titulo}>🎙️ {titulo}</Text>
      <Text style={estilos.texto}>Toque no microfone do teclado (ao lado da barra de espaço) e fale. Pode falar tudo de uma vez.</Text>
      <TextInput
        value={texto}
        onChangeText={(t) => {
          setTexto(t);
          if (erro) setErro(null);
        }}
        multiline
        autoFocus
        editable={!ocupado}
        autoCapitalize="sentences"
        placeholder="O que foi feito, onde, com qual produto e dose, a que horas, com que máquina e quem fez"
        placeholderTextColor={cores.textoSuave}
        style={[estilos.entrada, !!erro && { borderColor: cores.erro }]}
        accessibilityLabel="Texto falado"
      />
      {erro ? <Text style={estilos.erro}>{erro}</Text> : <Text style={estilos.texto}>Ex.: “{exemplo}”</Text>}
      {ocupado ? (
        <View style={estilos.linhaCentro}>
          <ActivityIndicator color={cores.primaria} />
          <Text style={estilos.texto}>Entendendo o que você falou… (uns 3 segundos)</Text>
        </View>
      ) : (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Botao
              titulo="Fechar"
              tipo="texto"
              onPress={() => {
                setAberto(false);
                setErro(null);
              }}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Botao titulo="Preencher a tela" onPress={interpretar} />
          </View>
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 8 },
  titulo: { fontSize: tam.texto, fontWeight: '800', color: cores.info },
  texto: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19, flexShrink: 1 },
  erro: { fontSize: tam.pequeno, color: cores.erro, lineHeight: 19 },
  entrada: {
    minHeight: 110,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: tam.raio,
    backgroundColor: cores.cartao,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: tam.texto,
    color: cores.texto,
    textAlignVertical: 'top',
  },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  linhaCentro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
