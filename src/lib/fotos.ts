// Foto pela câmera ou pela galeria, igual no celular (Expo Go) e no navegador (PC e celular pelo site).
// No navegador a foto vem do tamanho que a câmera fez (vários MB): aqui ela é reduzida antes de seguir.
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type Foto = { uri: string; base64: string; mimeType: string };

type Opcoes = {
  quality?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  /** maior lado da imagem no navegador, em pontos (padrão 2000: dá para ler nota fiscal) */
  ladoWeb?: number;
};

/** { negado: true } = sem permissão; { foto: null } = a pessoa desistiu. */
export async function escolherImagem(camera: boolean, opcoes: Opcoes = {}): Promise<{ negado: true } | { foto: Foto | null }> {
  const { ladoWeb = 2000, ...resto } = opcoes;
  const web = Platform.OS === 'web';
  if (!web) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { negado: true };
  }
  const pedido = { base64: true, ...resto };
  const r = camera ? await ImagePicker.launchCameraAsync(pedido) : await ImagePicker.launchImageLibraryAsync(pedido);
  const a = r.canceled ? null : r.assets?.[0];
  if (!a) return { foto: null };
  if (web) {
    const reduzida = await reduzirNoNavegador(a.uri, ladoWeb, Math.max(0.6, opcoes.quality ?? 0.7));
    if (reduzida) return { foto: reduzida };
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(a.uri);
    if (m) return { foto: { uri: a.uri, base64: m[2], mimeType: m[1] } };
  }
  if (!a.base64) return { foto: null };
  return { foto: { uri: a.uri, base64: a.base64, mimeType: a.mimeType ?? 'image/jpeg' } };
}

/** Desenha a imagem num quadro menor e devolve em JPEG. Null se o navegador não conseguir. */
async function reduzirNoNavegador(uri: string, lado: number, qualidade: number): Promise<Foto | null> {
  try {
    const w = globalThis as any;
    const img: any = await new Promise((ok, falha) => {
      const i = new w.Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('imagem'));
      i.src = uri;
    });
    const maior = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    if (!maior) return null;
    const escala = Math.min(1, lado / maior);
    const largura = Math.round((img.naturalWidth || img.width) * escala);
    const altura = Math.round((img.naturalHeight || img.height) * escala);
    const tela = w.document.createElement('canvas');
    tela.width = largura;
    tela.height = altura;
    const ctx = tela.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff'; // fundo branco: imagem com transparência não fica preta
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);
    const dados: string = tela.toDataURL('image/jpeg', qualidade);
    const base64 = dados.slice(dados.indexOf(',') + 1);
    if (!base64) return null;
    return { uri: dados, base64, mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}
