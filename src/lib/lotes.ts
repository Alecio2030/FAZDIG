// V200 · Lote: finalidade, origem "De outro lote" e controle individual.

export const FINALIDADES = [
  { valor: 'cria', rotulo: 'Cria' },
  { valor: 'recria', rotulo: 'Recria' },
  { valor: 'engorda_pasto', rotulo: 'Engorda a pasto' },
  { valor: 'semiconfinamento', rotulo: 'Semiconfinamento' },
  { valor: 'confinamento', rotulo: 'Confinamento' },
  { valor: 'reproducao', rotulo: 'Reprodução' },
  { valor: 'descarte', rotulo: 'Descarte' },
  { valor: 'outra', rotulo: 'Outra' },
];
export const ROTULO_FINALIDADE: Record<string, string> = Object.fromEntries(FINALIDADES.map((f) => [f.valor, f.rotulo]));

export function textoFinalidade(finalidade?: string | null, outra?: string | null): string | null {
  if (!finalidade) return null;
  if (finalidade === 'outra') return outra ? `Outra: ${outra}` : 'Outra';
  return ROTULO_FINALIDADE[finalidade] ?? finalidade;
}

/** Na lista de origens, o rebanho individual (animais sem lote) usa este id. */
export const SEM_LOTE = '__sem_lote__';

/** Linha da grade individual: brinco, ferro e peso (kg, texto do campo). */
export type LinhaIndividual = { brinco: string; ferroId: string | null; peso: string };
export const LINHA_VAZIA: LinhaIndividual = { brinco: '', ferroId: null, peso: '' };

/** Máximo de linhas na grade individual (acima disso, identifique depois, pelo lote). */
export const MAX_INDIVIDUAL = 500;
