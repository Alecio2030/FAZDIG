import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../lib/alerta';
import { escolherImagem } from '../lib/fotos';
import * as DocumentPicker from 'expo-document-picker';
import Botao from './Botao';
import { lerFotoDocumento } from '../lib/documentos';
import { cores, tam } from '../tema';

type Props = {
  /** título do quadro, ex.: "Entrada pela nota fiscal" */
  titulo: string;
  /** tipo de leitura na função ler-documento (nota_fiscal, bem...) */
  tipo: string;
  /** texto do botão da câmera, ex.: "Foto da nota" */
  rotuloFoto?: string;
  /** orientação mostrada antes de tirar a foto */
  instrucao?: string;
  /** texto pequeno embaixo dos botões */
  dica?: string;
  /** mensagem enquanto a IA lê */
  textoLendo?: string;
  /** recebe os dados lidos (a tela preenche o formulário para conferência) */
  aoLer: (dados: any, arquivo: string | null, origem: 'foto' | 'xml') => void | Promise<void>;
  /** recebe o texto do XML (só aparece o botão do XML se for passado) */
  aoXml?: (texto: string) => void | Promise<void>;
  aoErro: (msg: string) => void;
};

/**
 * Quadro "entrada por foto de documento": câmera ou galeria, a IA lê e a tela abre preenchida para conferência.
 * Nunca grava nada: quem grava é o botão da própria tela.
 */
export default function EntradaDocumento({ titulo, tipo, rotuloFoto = 'Foto do documento', instrucao = 'Enquadre o papel inteiro, com boa luz.', dica, textoLendo = 'Lendo o documento… (uns 10 segundos)', aoLer, aoXml, aoErro }: Props) {
  const [lendo, setLendo] = useState<string | null>(null);

  function escolherFoto() {
    Alert.alert(rotuloFoto, instrucao, [
      { text: 'Tirar foto', onPress: () => lerFoto(true) },
      { text: 'Escolher da galeria', onPress: () => lerFoto(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function lerFoto(camera: boolean) {
    try {
      const r = await escolherImagem(camera, { quality: 0.7 });
      if ('negado' in r) return aoErro(camera ? 'Sem permissão para usar a câmera. Libere nos Ajustes do celular.' : 'Sem permissão para abrir as fotos. Libere nos Ajustes do celular.');
      if (!r.foto) return;
      const a = r.foto;
      setLendo(textoLendo);
      const res = await lerFotoDocumento(tipo, a.base64, a.mimeType);
      if ('erro' in res) aoErro(`${res.erro} Você pode tentar de novo ou digitar.`);
      else await aoLer(res.dados, res.arquivo, 'foto');
    } catch (e: any) {
      aoErro(String(e?.message ?? e));
    }
    setLendo(null);
  }

  async function lerXml() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['text/xml', 'application/xml', '*/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      setLendo('Lendo o XML…');
      const texto = await (await fetch(r.assets[0].uri)).text();
      await aoXml?.(texto);
    } catch (e: any) {
      aoErro(String(e?.message ?? e));
    }
    setLendo(null);
  }

  return (
    <View style={estilos.quadro}>
      <Text style={estilos.titulo}>{titulo}</Text>
      {lendo ? (
        <View style={estilos.linhaCentro}>
          <ActivityIndicator color={cores.primaria} />
          <Text style={estilos.texto}>{lendo}</Text>
        </View>
      ) : (
        <>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Botao titulo={`📷  ${rotuloFoto}`} tipo="secundario" onPress={escolherFoto} />
            </View>
            {aoXml && (
              <View style={{ flex: 1 }}>
                <Botao titulo="📄  XML da NF-e" tipo="secundario" onPress={lerXml} />
              </View>
            )}
          </View>
          {dica ? <Text style={estilos.texto}>{dica}</Text> : null}
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 8 },
  titulo: { fontSize: tam.texto, fontWeight: '800', color: cores.info },
  texto: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19, flexShrink: 1 },
  linha: { flexDirection: 'row', gap: 10 },
  linhaCentro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
