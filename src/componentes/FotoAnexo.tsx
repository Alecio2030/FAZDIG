import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from '../lib/alerta';
import { escolherImagem, reduzirImagemArquivo } from '../lib/fotos';
import { abrirFotoDocumento } from '../lib/documentos';
import { supabase } from '../lib/supabase';
import { cores, tam } from '../tema';

type Props = {
  /** o que é a foto, ex.: "da NF" */
  rotulo: string;
  /** pasta no bucket documentos, ex.: "gado" */
  pasta: string;
  /** caminho já guardado (ou null) */
  valor: string | null;
  aoMudar: (caminho: string | null) => void;
  aoErro: (msg: string) => void;
};

/** base64 → bytes (sem depender de atob, que nem todo celular tem) */
function bytesDoBase64(b64: string): Uint8Array {
  const tab = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const limpo = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((limpo.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < limpo.length; i += 4) {
    const a = tab.indexOf(limpo[i]);
    const b = tab.indexOf(limpo[i + 1]);
    const c = i + 2 < limpo.length ? tab.indexOf(limpo[i + 2]) : -1;
    const d = i + 3 < limpo.length ? tab.indexOf(limpo[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, o);
}

async function arquivoParaBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return await new Promise<string>((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result).replace(/^data:[^,]*,/, ''));
    leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(blob);
  });
}

/** Guarda a foto ou o PDF no bucket "documentos" e devolve o caminho. */
export async function guardarDocumento(pasta: string, base64: string, formato: string): Promise<string> {
  const ext = formato === 'application/pdf' ? 'pdf' : formato === 'image/png' ? 'png' : 'jpg';
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('documentos').upload(caminho, bytesDoBase64(base64), { contentType: formato, upsert: false });
  if (error) throw new Error(`Não foi possível guardar o documento: ${error.message}`);
  return caminho;
}

/**
 * V181: botão 📷 para fotografar (ou escolher arquivo) e guardar o documento junto do registro.
 * Só guarda a imagem: não lê nada. Com a foto guardada, mostra "Ver" e "Trocar/Tirar".
 */
export default function FotoAnexo({ rotulo, pasta, valor, aoMudar, aoErro }: Props) {
  const [enviando, setEnviando] = useState(false);

  async function deFoto(camera: boolean) {
    try {
      const r = await escolherImagem(camera, { quality: 0.6 });
      if ('negado' in r) return aoErro(camera ? 'Sem permissão para usar a câmera. Libere nos Ajustes do celular.' : 'Sem permissão para abrir as fotos. Libere nos Ajustes do celular.');
      if (!r.foto) return;
      setEnviando(true);
      aoMudar(await guardarDocumento(pasta, r.foto.base64, r.foto.mimeType || 'image/jpeg'));
    } catch (e: any) {
      aoErro(String(e?.message ?? e));
    }
    setEnviando(false);
  }

  async function deArquivo() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const nome = (a.name ?? '').toLowerCase();
      const formato = a.mimeType || (nome.endsWith('.pdf') ? 'application/pdf' : nome.endsWith('.png') ? 'image/png' : 'image/jpeg');
      if (formato !== 'application/pdf' && !formato.startsWith('image/')) return aoErro('Escolha um PDF ou uma imagem (JPG ou PNG).');
      if ((a.size ?? 0) > 15 * 1024 * 1024) return aoErro('Arquivo grande demais (até 15 MB).');
      setEnviando(true);
      const reduzida = formato.startsWith('image/') ? await reduzirImagemArquivo(a.uri) : null;
      const b64 = reduzida ? reduzida.base64 : await arquivoParaBase64(a.uri);
      aoMudar(await guardarDocumento(pasta, b64, reduzida ? reduzida.mimeType : formato));
    } catch (e: any) {
      aoErro(String(e?.message ?? e));
    }
    setEnviando(false);
  }

  function escolher() {
    Alert.alert(`Foto ${rotulo}`, 'Enquadre o papel inteiro, com boa luz.', [
      // no Android a caixa mostra no máximo 3 botões
      { text: 'Tirar foto', onPress: () => deFoto(true) },
      { text: 'Foto ou PDF guardado', onPress: deArquivo },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  if (enviando) {
    return (
      <View style={estilos.linha}>
        <ActivityIndicator color={cores.primaria} />
        <Text style={estilos.nota}>Guardando…</Text>
      </View>
    );
  }
  if (!valor) {
    return (
      <Text style={estilos.link} onPress={escolher}>
        📷 Foto {rotulo}
      </Text>
    );
  }
  return (
    <View style={estilos.linha}>
      <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(valor)) && aoErro('Não foi possível abrir o documento.')}>
        ✅ Ver a foto {rotulo}
      </Text>
      <Text style={estilos.linkSuave} onPress={escolher}>
        Trocar
      </Text>
      <Text style={estilos.linkSuave} onPress={() => aoMudar(null)}>
        Tirar
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  linkSuave: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
});
