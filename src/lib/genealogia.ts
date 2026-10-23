// Gado com controle genealógico: identificação por Série Alfabética + RGN/RGD.
import { supabase } from './supabase';

export const CONCEPCOES = ['Monta natural', 'IA', 'IATF', 'TE (embrião)', 'FIV'];
export const PELAGENS_PADRAO = ['Branca', 'Cinza', 'Vermelha', 'Preta', 'Amarela', 'Chitada', 'Malhada'];

/** "csc 123" -> "CSC123": tira espaços, pontos e traços e põe em maiúsculas. */
export function normalizarRegistro(t: string): string {
  return t.toUpperCase().replace(/[\s.\-/]/g, '').replace(/[%_,()*\\]/g, '');
}

/** Como mostrar um ascendente: Série+RGN; se não tiver, o nome; se não, o que foi informado. */
export function rotuloAscendente(a: { brinco?: string | null; nome?: string | null } | null | undefined, externo?: string | null): string {
  if (a) return a.brinco || a.nome || '';
  return externo ?? '';
}

export type Achado = {
  id: string;
  brinco: string | null;
  registro: string | null;
  nome: string | null;
  sexo: string | null;
  /** avó e avô vindos do cadastro desse animal */
  mae: string;
  pai: string;
  /** os avós desse animal (viram os bisavós de quem está sendo cadastrado) */
  avoMaterna: string;
  avoMaterno: string;
  avoPaterna: string;
  avoPaterno: string;
};

/**
 * Bisavós (V127), pelo caminho: 1ª letra = lado (m = mãe, p = pai), 2ª = avó ou avô, 3ª = bisavó ou bisavô.
 * Ex.: 'mpm' = mãe do avô materno. A coluna no banco é bisavo_<caminho>.
 */
export const BISAVOS: { chave: string; rotulo: string }[] = [
  { chave: 'mmm', rotulo: 'Mãe da avó materna' },
  { chave: 'mmp', rotulo: 'Pai da avó materna' },
  { chave: 'mpm', rotulo: 'Mãe do avô materno' },
  { chave: 'mpp', rotulo: 'Pai do avô materno' },
  { chave: 'pmm', rotulo: 'Mãe da avó paterna' },
  { chave: 'pmp', rotulo: 'Pai da avó paterna' },
  { chave: 'ppm', rotulo: 'Mãe do avô paterno' },
  { chave: 'ppp', rotulo: 'Pai do avô paterno' },
];
export const BISAVOS_VAZIOS: Record<string, string> = Object.fromEntries(BISAVOS.map((b) => [b.chave, '']));

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Procura no cadastro um animal pela Série + RGN/RGD (o brinco do registrado). */
export async function buscarPorRegistro(texto: string, ignorarId?: string | null): Promise<Achado | null> {
  const chave = normalizarRegistro(texto);
  if (chave.length < 4) return null;
  let q = supabase
    .from('animais')
    .select('id, brinco, registro, nome, sexo, mae_externa, pai_externo, avo_materna, avo_materno, avo_paterna, avo_paterno, mae:mae_id ( brinco, nome ), pai:pai_id ( brinco, nome )')
    .ilike('brinco', chave);
  if (ignorarId) q = q.neq('id', ignorarId);
  const { data } = await q.limit(1);
  const a = data?.[0] as any;
  if (!a) return null;
  return {
    id: a.id,
    brinco: a.brinco,
    registro: a.registro,
    nome: a.nome,
    sexo: a.sexo?.trim() ?? null,
    mae: rotuloAscendente(um(a.mae), a.mae_externa),
    pai: rotuloAscendente(um(a.pai), a.pai_externo),
    avoMaterna: a.avo_materna ?? '',
    avoMaterno: a.avo_materno ?? '',
    avoPaterna: a.avo_paterna ?? '',
    avoPaterno: a.avo_paterno ?? '',
  };
}

/** Pelagens já usadas + as padrão, sem repetir. */
export async function sugestoesPelagem(): Promise<string[]> {
  const { data } = await supabase.from('animais').select('pelagem').not('pelagem', 'is', null).order('created_at', { ascending: false }).limit(300);
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const v of [...((data ?? []) as any[]).map((x) => x.pelagem as string), ...PELAGENS_PADRAO]) {
    const t = (v ?? '').trim();
    if (!t || vistos.has(t.toLowerCase())) continue;
    vistos.add(t.toLowerCase());
    saida.push(t);
  }
  return saida;
}

/** "SCS1 Maria da Constantino": Série + RGN/RGD, nome e sufixo/afixo (sem repetir o sufixo se já estiver no nome). */
export function montarRegistro(serieRgn: string, nome: string, sufixo?: string | null): string {
  const n = nome.trim().replace(/\s+/g, ' ');
  const suf = (sufixo ?? '').trim();
  const repetido = suf && n.toLowerCase().endsWith(suf.toLowerCase());
  return [serieRgn, n, repetido ? '' : suf].filter(Boolean).join(' ');
}

/** "Maria" + "da Constantino" -> "Maria da Constantino" (ou "da Constantino Maria" se for antes); não repete se já estiver no nome. */
export function montarNome(nome: string, sufixo?: string | null, posicao: 'antes' | 'depois' = 'depois'): string {
  const n = nome.trim().replace(/\s+/g, ' ');
  const suf = (sufixo ?? '').trim();
  if (!suf) return n;
  if (!n) return '';
  const nl = n.toLowerCase();
  const sl = suf.toLowerCase();
  if (nl.startsWith(sl) || nl.endsWith(sl)) return n;
  return posicao === 'antes' ? `${suf} ${n}` : `${n} ${suf}`;
}

/** Tira o Sufixo/Afixo do começo ou do fim do nome ("Maria da Constantino" -> "Maria"). */
export function tirarAfixo(nome: string, afixo?: string | null): string {
  const n = nome.trim().replace(/\s+/g, ' ');
  const a = (afixo ?? '').trim();
  if (!a) return n;
  const nl = n.toLowerCase();
  const al = a.toLowerCase();
  if (nl.endsWith(' ' + al)) return n.slice(0, n.length - a.length).trim();
  if (nl.startsWith(al + ' ')) return n.slice(a.length).trim();
  return n;
}
