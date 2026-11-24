import { Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/**
 * V183 – Abrir o aplicativo (ou o internet banking) do banco da conta escolhida, para pagar o que o sistema copiou.
 * O sistema não entra no app do banco: só copia o código e abre o app; quem confirma o pagamento é a pessoa, no banco.
 *
 * Android: link do Google Play com launch=true (abre o app se estiver instalado; se não, mostra para instalar).
 * iPhone: página do app na App Store (aparece o botão "Abrir" se estiver instalado).
 * Computador: site do banco (internet banking).
 */
export type AppBanco = {
  chave: string;
  nome: string;
  /** palavras que identificam o banco no campo "Banco" da conta */
  termos: RegExp;
  site: string;
  android?: string;
  /** app de conta empresa (quando o banco separa) */
  androidPJ?: string;
  ios?: string;
};

export const BANCOS_APP: AppBanco[] = [
  { chave: 'bb', nome: 'Banco do Brasil', termos: /\bBB\b|BANCO DO BRASIL|^BRASIL$|\b001\b/, site: 'https://www.bb.com.br', android: 'br.com.bb.android' },
  { chave: 'sicoob', nome: 'Sicoob', termos: /SICOOB|\b756\b/, site: 'https://www.sicoob.com.br', android: 'br.com.sicoobnet', ios: '416696406' },
  { chave: 'sicredi', nome: 'Sicredi', termos: /SICREDI|\b748\b/, site: 'https://www.sicredi.com.br', android: 'br.com.sicredi.app', ios: '1481471046' },
  { chave: 'cresol', nome: 'Cresol', termos: /CRESOL|\b133\b/, site: 'https://www.cresol.com.br', android: 'br.com.confesol.ib.cresol', ios: '1090517754' },
  { chave: 'bradesco', nome: 'Bradesco', termos: /BRADESCO|\b237\b/, site: 'https://www.bradesco.com.br', android: 'com.bradesco', androidPJ: 'br.com.bradesco.netempresa', ios: '336954985' },
  { chave: 'itau', nome: 'Itaú', termos: /ITAU|\b341\b/, site: 'https://www.itau.com.br', android: 'com.itau' },
  { chave: 'santander', nome: 'Santander', termos: /SANTANDER|\b033\b/, site: 'https://www.santander.com.br', android: 'com.santander.app', androidPJ: 'com.santandermovelempresarial.app' },
  { chave: 'caixa', nome: 'Caixa', termos: /CAIXA|\bCEF\b|\b104\b/, site: 'https://www.caixa.gov.br', android: 'br.com.gabba.Caixa' },
  { chave: 'banestes', nome: 'Banestes', termos: /BANESTES|\b021\b/, site: 'https://www.banestes.com.br' },
];

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Acha o banco pelo campo "Banco" (ou pelo nome) da conta bancária. */
export function bancoDaConta(conta: { banco?: string | null; nome?: string | null } | null | undefined): AppBanco | null {
  if (!conta) return null;
  for (const txt of [conta.banco, conta.nome]) {
    if (!txt) continue;
    const t = normalizar(txt);
    const b = BANCOS_APP.find((x) => x.termos.test(t));
    if (b) return b;
  }
  return null;
}

/** Está num celular? (no app ou no navegador do celular) */
export function plataforma(): 'android' | 'ios' | 'pc' {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'pc';
}

/** Abre o app (celular) ou o site (computador) do banco. Devolve o que foi aberto, para a tela avisar. */
export async function abrirBanco(b: AppBanco | null, opcoes: { pj?: boolean; nomeLivre?: string | null } = {}): Promise<'app' | 'loja' | 'site' | 'nada'> {
  const p = plataforma();
  let url: string | null = null;
  let tipo: 'app' | 'loja' | 'site' | 'nada' = 'nada';
  if (p === 'android') {
    const pkg = (opcoes.pj && b?.androidPJ) || b?.android;
    if (pkg) {
      url = `https://play.google.com/store/apps/details?id=${pkg}&launch=true`;
      tipo = 'app';
    } else if (b || opcoes.nomeLivre) {
      url = `https://play.google.com/store/search?q=${encodeURIComponent(b?.nome ?? opcoes.nomeLivre ?? '')}&c=apps`;
      tipo = 'loja';
    }
  } else if (p === 'ios') {
    if (b?.ios) {
      url = `https://apps.apple.com/br/app/id${b.ios}`;
      tipo = 'app';
    } else if (b) {
      url = b.site;
      tipo = 'site';
    }
  } else if (b) {
    url = b.site;
    tipo = 'site';
  }
  if (!url) return 'nada';
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    else await Linking.openURL(url);
    return tipo;
  } catch {
    return 'nada';
  }
}

/** Copia um texto para a área de transferência (navegador ou celular). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
      return false;
    }
    await Clipboard.setStringAsync(texto);
    return true;
  } catch {
    return false;
  }
}
