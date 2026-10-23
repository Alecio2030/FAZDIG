// Apoio à entrada por foto de documento (usado em Compras, Imobilizado e, nas próximas etapas, Talhão, Genética e Sanidade).
import { Linking } from 'react-native';
import { consulta, supabase } from './supabase';
import { mascaraCpfCnpj, somenteDigitos } from './formatos';

/** Documento em que o produtor recebe notas (CPF do produtor, filial) e os créditos fiscais que aproveita. */
export type DocComprador = {
  id: string;
  cpf_cnpj: string;
  nome: string;
  lanca: boolean;
  credito_icms: boolean;
  credito_ipi: boolean;
  credito_pis_cofins: boolean;
  perc_pis: number;
  perc_cofins: number;
  principal: boolean;
};

export async function listaCompradores(): Promise<DocComprador[]> {
  const { data } = await supabase.from('documentos_comprador').select('*').order('principal', { ascending: false }).order('nome');
  return ((data as any[]) ?? []).map((d) => ({ ...d, perc_pis: Number(d.perc_pis), perc_cofins: Number(d.perc_cofins) }));
}

/** Só os números dos documentos do comprador: na nota eles são o DESTINATÁRIO, nunca o fornecedor. */
export async function documentosComprador(): Promise<string[]> {
  const [lista, prod] = await Promise.all([listaCompradores(), supabase.from('produtor').select('cpf_cnpj').maybeSingle()]);
  return [...lista.map((d) => d.cpf_cnpj), (prod.data as any)?.cpf_cnpj]
    .map((x) => somenteDigitos(x ?? ''))
    .filter((x) => x.length === 11 || x.length === 14);
}

/** Manda a foto para a função ler-documento (a IA lê no servidor). Vai junto o CPF/CNPJ do comprador, para a IA não confundir. */
export async function lerFotoDocumento(tipo: string, base64: string, formato: string): Promise<{ dados: any; arquivo: string | null } | { erro: string }> {
  const comprador = (await documentosComprador().catch(() => [] as string[])).map(mascaraCpfCnpj);
  // laudo de análise de solo/foliar: quem lê é o agrônomo virtual (função própria)
  const { data: d, error } =
    tipo === 'analise'
      ? await supabase.functions.invoke('agronomo', { body: { acao: 'ler_laudo', imagem: base64, formato } })
      : tipo === 'classificacao_cafe'
        ? await supabase.functions.invoke('ler-classificacao', { body: { imagem: base64, formato } })
        : await supabase.functions.invoke('ler-documento', { body: { tipo, imagem: base64, formato, comprador } });
  if (error) {
    let msg = 'Não foi possível ler a foto agora.';
    try {
      const j = await (error as any).context?.json();
      if (j?.erro) msg = j.erro;
    } catch {
      /* mantém a mensagem padrão */
    }
    return { erro: msg };
  }
  return { dados: d?.dados ?? {}, arquivo: d?.arquivo ?? null };
}

/** CPF (11) ou CNPJ (14) com os dígitos verificadores certos. A IA às vezes troca um número: assim não passa. */
export function cpfCnpjValido(t: string | null | undefined): boolean {
  const d = somenteDigitos(t ?? '').split('').map(Number);
  if (d.length !== 11 && d.length !== 14) return false;
  if (d.every((x) => x === d[0])) return false;
  const dv = (n: number, pesos: number[]) => {
    const s = pesos.reduce((t, p, i) => t + p * d[i], 0);
    return d.length === 11 ? ((s * 10) % 11) % 10 : s % 11 < 2 ? 0 : 11 - (s % 11);
  };
  if (d.length === 11) return dv(9, [10, 9, 8, 7, 6, 5, 4, 3, 2]) === d[9] && dv(10, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === d[10];
  return dv(12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === d[12] && dv(13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === d[13];
}

/** Nome para comparar: sem acento, sem LTDA/ME/EIRELI/S.A., só letras e números. */
function nomeBase(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(LTDA|ME|EPP|EIRELI|S\/?A|SA|CIA|MEI)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, '');
}
/** Parecença de 0 a 1 entre dois textos (distância de edição). */
function parecenca(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let ant = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const at = [i];
    for (let j = 1; j <= n; j++) at[j] = Math.min(ant[j] + 1, at[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = at;
  }
  return 1 - ant[n] / Math.max(m, n);
}

/**
 * Fornecedor do documento lido.
 * - CNPJ/CPF válido: acha pelo número; se não existir, cadastra na hora.
 * - CNPJ/CPF ilegível ou com dígito errado: NÃO cadastra (seria um fornecedor falso); tenta achar pelo nome parecido.
 * Devolve também um aviso para a tela de conferência.
 */
export async function fornecedorPeloDocumento(nome: string | null | undefined, cnpjCpf: string | null | undefined): Promise<{ id: string | null; aviso: string | null }> {
  const lido = somenteDigitos(cnpjCpf ?? '');
  const meus = await documentosComprador();
  const eMeu = meus.includes(lido);
  const doc = eMeu ? '' : lido;
  const ps = await consulta<any[]>(supabase.from('pessoas').select('id, nome, cpf_cnpj'));
  if (cpfCnpjValido(doc)) {
    const achado = ps.find((x) => somenteDigitos(x.cpf_cnpj ?? '') === doc)?.id ?? null;
    if (achado) return { id: achado, aviso: null };
    if (!nome?.trim()) return { id: null, aviso: 'o nome do fornecedor não foi lido: escolha ou cadastre o fornecedor' };
    const nova = await consulta<any>(supabase.from('pessoas').insert({ nome: nome.trim(), cpf_cnpj: mascaraCpfCnpj(doc), tipos: ['fornecedor'] }).select('id').single());
    return { id: nova.id, aviso: `fornecedor novo cadastrado: ${nome.trim()}` };
  }
  // CNPJ não confiável: procura pelo nome
  const base = nomeBase(nome ?? '');
  let melhor: { id: string; nome: string; nota: number } | null = null;
  for (const x of ps) {
    if (meus.includes(somenteDigitos(x.cpf_cnpj ?? ''))) continue; // nunca o próprio comprador
    const nota = parecenca(base, nomeBase(x.nome ?? ''));
    if (nota >= 0.85 && (!melhor || nota > melhor.nota)) melhor = { id: x.id, nome: x.nome, nota };
  }
  const motivo = eMeu ? 'o CNPJ lido é o seu (comprador), não o do fornecedor' : doc ? 'o CNPJ do fornecedor saiu com número errado na leitura' : 'o CNPJ do fornecedor não foi lido';
  if (melhor) return { id: melhor.id, aviso: `${motivo}; o fornecedor foi achado pelo nome (${melhor.nome}): confira` };
  return { id: null, aviso: `${motivo}: escolha ou cadastre o fornecedor` };
}

/** Abre a foto guardada (link temporário de 10 minutos). Devolve false se não conseguiu. */
export async function abrirFotoDocumento(caminho: string): Promise<boolean> {
  const { data: u, error } = await supabase.storage.from('documentos').createSignedUrl(caminho, 600);
  if (error || !u?.signedUrl) return false;
  Linking.openURL(u.signedUrl);
  return true;
}

/** Parecer do agrônomo virtual (IA) sobre uma análise já conferida. O contexto leva o talhão, a análise e as contas do app. */
export async function pedirParecer(contexto: unknown): Promise<{ dados: any } | { erro: string }> {
  const { data: d, error } = await supabase.functions.invoke('agronomo', { body: { acao: 'parecer', contexto } });
  if (error) {
    let msg = 'Não foi possível consultar o agrônomo virtual agora.';
    try {
      const j = await (error as any).context?.json();
      if (j?.erro) msg = j.erro;
    } catch {
      /* mantém a mensagem padrão */
    }
    return { erro: msg };
  }
  if (!d?.dados) return { erro: d?.erro ?? 'O agrônomo virtual não respondeu. Tente de novo.' };
  return { dados: d.dados };
}
