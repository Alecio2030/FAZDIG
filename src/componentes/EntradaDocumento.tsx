import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../lib/alerta';
import { escolherImagem, reduzirImagemArquivo } from '../lib/fotos';
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
  /** V166: botão para escolher um arquivo (PDF ou imagem) do computador ou do celular */
  aceitaArquivo?: boolean;
};

/**
 * Quadro "entrada por foto de documento": câmera ou galeria, a IA lê e a tela abre preenchida para conferência.
 * Nunca grava nada: quem grava é o botão da própria tela.
 */
export default function EntradaDocumento({ titulo, tipo, rotuloFoto = 'Foto do documento', instrucao = 'Enquadre o papel inteiro, com boa luz.', dica, textoLendo = 'Lendo o documento… (uns 10 segundos)', aoLer, aoXml, aoErro, aceitaArquivo }: Props) {
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

  /** V166: PDF ou imagem escolhidos de um arquivo (o mesmo leitor da foto) */
  async function lerArquivo() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const nome = (a.name ?? '').toLowerCase();
      const formato = a.mimeType || (nome.endsWith('.pdf') ? 'application/pdf' : nome.endsWith('.png') ? 'image/png' : 'image/jpeg');
      if (formato !== 'application/pdf' && !formato.startsWith('image/')) return aoErro('Escolha um PDF ou uma imagem (JPG ou PNG).');
      if ((a.size ?? 0) > 20 * 1024 * 1024) return aoErro('Arquivo grande demais (até 20 MB).');
      setLendo(textoLendo);
      // imagem de arquivo vem do tamanho original (vários MB): reduz como a da câmera
      const reduzida = formato.startsWith('image/') ? await reduzirImagemArquivo(a.uri) : null;
      const base64 = reduzida ? reduzida.base64 : await arquivoParaBase64(a.uri);
      const res = await lerFotoDocumento(tipo, base64, reduzida ? reduzida.mimeType : formato);
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
            {aceitaArquivo && (
              <View style={{ flex: 1 }}>
                <Botao titulo="📄  Arquivo (PDF)" tipo="secundario" onPress={lerArquivo} />
              </View>
            )}
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

/** Lê o arquivo escolhido e devolve o conteúdo em base64 (funciona no celular e no navegador). */
async function arquivoParaBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return await new Promise<string>((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result).replace(/^data:[^,]*,/, ''));
    leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(blob);
  });
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 8 },
  titulo: { fontSize: tam.texto, fontWeight: '800', color: cores.info },
  texto: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19, flexShrink: 1 },
  linha: { flexDirection: 'row', gap: 10 },
  linhaCentro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
