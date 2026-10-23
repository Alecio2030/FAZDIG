import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Botao from './Botao';
import { perguntar } from '../lib/perguntar';
import { cores, tam } from '../tema';

type Props = {
  /** texto do botão principal, ex.: "Lançar pesagem" */
  titulo: string;
  aoConfirmar: () => void;
  carregando?: boolean;
  /** limpa a tela; pergunta antes */
  aoDescartar?: () => void;
  /** aviso de erro mostrado logo acima dos botões (onde a pessoa está olhando) */
  erro?: string | null;
};

/** Barra fixa de fim de lançamento: Descartar e Lançar, com o aviso de erro junto. */
export default function RodapeAcoes({ titulo, aoConfirmar, carregando, aoDescartar, erro }: Props) {
  async function descartar() {
    if (!aoDescartar) return;
    const ok = await perguntar('Descartar', 'Apagar tudo o que foi digitado nesta tela?', 'Descartar', 'Voltar');
    if (ok) aoDescartar();
  }
  return (
    <>
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      <View style={estilos.linha}>
        {aoDescartar && (
          <View style={{ flex: 1, minWidth: 120 }}>
            <Botao titulo="Descartar" tipo="secundario" onPress={descartar} />
          </View>
        )}
        <View style={{ flex: 1.6 }}>
          <Botao titulo={titulo} onPress={aoConfirmar} carregando={carregando} />
        </View>
      </View>
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10 },
  erro: { fontSize: tam.pequeno + 1, color: cores.erro, fontWeight: '600' },
});
