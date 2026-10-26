// V156: cifra o certificado A1 e a senha antes de guardar no banco (AES-GCM).
// A chave vem do secret NFE_CHAVE, se existir; senão, é derivada da chave de serviço do projeto,
// que só o servidor conhece. Se a chave de serviço for trocada, basta enviar o certificado de novo.

let chaveEmCache: CryptoKey | null = null;

async function chave(): Promise<CryptoKey> {
  if (chaveEmCache) return chaveEmCache;
  const segredo = Deno.env.get('NFE_CHAVE') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!segredo) throw new Error('O servidor está sem a chave para guardar o certificado.');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), 'HKDF', false, ['deriveKey']);
  chaveEmCache = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('fazdig-nfe-certificado'), info: new TextEncoder().encode('v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return chaveEmCache;
}

const paraB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function cifrar(dados: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(), dados as BufferSource));
  return `v1.${paraB64(iv)}.${paraB64(ct)}`;
}

export async function decifrar(texto: string): Promise<Uint8Array> {
  const [versao, iv, ct] = texto.split('.');
  if (versao !== 'v1' || !iv || !ct) throw new Error('Certificado guardado em formato desconhecido. Envie o certificado de novo.');
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) as BufferSource }, await chave(), deB64(ct) as BufferSource));
  } catch {
    throw new Error('Não foi possível abrir o certificado guardado (a chave do servidor mudou). Envie o certificado de novo.');
  }
}
