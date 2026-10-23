// Apoio ao uso pelo navegador (PC e celular pelo site): compartilhar texto, baixar arquivo e ícone na tela de início.
import { Platform, Share } from 'react-native';

export const NO_NAVEGADOR = Platform.OS === 'web';

/**
 * Compartilha um texto. No celular abre a folha de compartilhar; no PC, onde ela não existe, copia o texto.
 * Devolve o que aconteceu, para a tela avisar.
 */
export async function compartilharTexto(texto: string): Promise<'enviado' | 'copiado' | 'falhou'> {
  const w = globalThis as any;
  if (!NO_NAVEGADOR || typeof w.navigator?.share === 'function') {
    try {
      await Share.share({ message: texto });
      return 'enviado';
    } catch {
      if (!NO_NAVEGADOR) return 'falhou';
    }
  }
  try {
    await w.navigator.clipboard.writeText(texto);
    return 'copiado';
  } catch {
    return 'falhou';
  }
}

/** Baixa um texto como arquivo (só no navegador). Devolve false se não deu. */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'application/json'): boolean {
  if (!NO_NAVEGADOR) return false;
  try {
    const w = globalThis as any;
    let url: string;
    let liberar = false;
    try {
      url = w.URL.createObjectURL(new w.Blob([conteudo], { type: tipo }));
      liberar = true;
    } catch {
      // navegador sem "createObjectURL": o arquivo vai embutido no próprio link
      url = `data:${tipo};charset=utf-8,${encodeURIComponent(conteudo)}`;
    }
    const a = w.document.createElement('a');
    a.href = url;
    a.download = nome;
    w.document.body.appendChild(a);
    a.click();
    a.remove();
    if (liberar) setTimeout(() => w.URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * No navegador: nome, cor e ícone do app para o "Adicionar à tela de início" do celular.
 * Os arquivos ficam na pasta public do projeto (vão junto na publicação).
 */
export function prepararPaginaWeb() {
  if (!NO_NAVEGADOR) return;
  ouvirInstalacao();
  try {
    const d = (globalThis as any).document;
    if (!d || d.getElementById('fd-manifest')) return;
    d.title = 'Fazenda Digital';
    d.documentElement.lang = 'pt-BR';
    const por = (tag: string, attrs: Record<string, string>) => {
      const e = d.createElement(tag);
      for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
      d.head.appendChild(e);
    };
    por('link', { id: 'fd-manifest', rel: 'manifest', href: '/manifest.json' });
    por('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });
    por('link', { rel: 'icon', type: 'image/png', href: '/icone-192.png' });
    por('meta', { name: 'theme-color', content: '#2F5D3A' });
    por('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    por('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    por('meta', { name: 'apple-mobile-web-app-title', content: 'Fazenda Digital' });
    por('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
  } catch {
    // sem isso o app funciona igual; só não ganha o ícone próprio
  }
}

// ---------- atalho na área de trabalho do PC e na tela de início do celular ----------
// Chrome e Edge (PC e Android) avisam que o site pode virar um app com ícone próprio; o aviso fica guardado
// para o botão "Criar atalho" usar quando a pessoa tocar. iPhone (Safari) não tem esse aviso: lá é pelo Compartilhar.
let pedidoInstalacao: any = null;
let ouvindo = false;
const avisar = new Set<() => void>();

function ouvirInstalacao() {
  if (ouvindo) return;
  ouvindo = true;
  try {
    const w = globalThis as any;
    w.addEventListener?.('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      pedidoInstalacao = e;
      avisar.forEach((f) => f());
    });
    w.addEventListener?.('appinstalled', () => {
      pedidoInstalacao = null;
      avisar.forEach((f) => f());
    });
  } catch {
    // sem atalho automático: a tela mostra o caminho pelo menu do navegador
  }
}

/** Avisa a tela quando o navegador libera (ou some) a opção de criar o atalho. Devolve a função para parar de ouvir. */
export function aoMudarInstalacao(f: () => void): () => void {
  avisar.add(f);
  return () => avisar.delete(f);
}

/** O navegador já ofereceu criar o atalho com um toque (Chrome e Edge). */
export const podeInstalar = () => !!pedidoInstalacao;

/** Já está aberto pelo atalho (como app), sem a barra do navegador. */
export function abertoComoApp(): boolean {
  if (!NO_NAVEGADOR) return true;
  try {
    const w = globalThis as any;
    return !!w.navigator?.standalone || !!w.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** Abre a janela do navegador para criar o atalho. Devolve true se a pessoa aceitou. */
export async function instalarApp(): Promise<boolean> {
  const p = pedidoInstalacao;
  if (!p) return false;
  try {
    await p.prompt();
    const r = await p.userChoice;
    pedidoInstalacao = null;
    avisar.forEach((f) => f());
    return r?.outcome === 'accepted';
  } catch {
    return false;
  }
}

/** Qual aparelho e navegador: para mostrar o caminho certo quando não dá para criar o atalho com um toque. */
export function aparelho(): 'iphone' | 'android' | 'pc' {
  try {
    const ua = String((globalThis as any).navigator?.userAgent ?? '').toLowerCase();
    if (/iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && (globalThis as any).navigator?.maxTouchPoints > 1)) return 'iphone';
    if (ua.includes('android')) return 'android';
  } catch {
    // segue como PC
  }
  return 'pc';
}

// ---------- link do e-mail "Reset password" ----------
export type RetornoEmail = { tipo: 'recuperacao'; access_token: string; refresh_token: string } | { tipo: 'erro'; mensagem: string };

/**
 * O link do e-mail de troca de senha abre o site com os dados do login no fim do endereço (#access_token=...&type=recovery).
 * Lê esses dados uma vez e limpa o endereço. Fora do navegador, ou sem link, devolve null.
 */
export function lerRetornoDoEmail(): RetornoEmail | null {
  if (!NO_NAVEGADOR) return null;
  try {
    const w = globalThis as any;
    const hash = String(w.location?.hash ?? '').replace(/^#/, '');
    const busca = String(w.location?.search ?? '').replace(/^\?/, '');
    const p = new w.URLSearchParams(hash || busca);
    const limpar = () => w.history?.replaceState?.(null, '', w.location.pathname);
    if (p.get('error') || p.get('error_code')) {
      limpar();
      const venceu = /expired|invalid/i.test(`${p.get('error_code')} ${p.get('error_description')}`);
      return { tipo: 'erro', mensagem: venceu ? 'Este link já foi usado ou venceu. Peça outro e-mail em "Esqueci minha senha" e use o link do e-mail mais recente.' : 'Não foi possível abrir o link do e-mail. Peça outro em "Esqueci minha senha".' };
    }
    const at = p.get('access_token');
    const rt = p.get('refresh_token');
    if (at && rt && p.get('type') === 'recovery') {
      limpar();
      return { tipo: 'recuperacao', access_token: at, refresh_token: rt };
    }
  } catch {
    // sem link: segue normal
  }
  return null;
}

/** Endereço do site (para o link do e-mail voltar para cá). */
export function enderecoDoSite(): string | undefined {
  if (!NO_NAVEGADOR) return undefined;
  try {
    return (globalThis as any).location?.origin;
  } catch {
    return undefined;
  }
}
