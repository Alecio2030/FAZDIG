/**
 * V162: faixas de idade do gado (em meses), por sexo, como pedem a GTA (IDAF) e a NF-e.
 * O estoque, as entradas, as vendas, a GTA e a nota trabalham com estas faixas.
 * A mesma tabela está no banco (faixas_idade); se mudar aqui, mude lá também.
 */
export type Sexo = 'M' | 'F';
export type FaixaIdade = { sexo: Sexo; de: number; ate: number | null; rotulo: string; ordem: number };

const rot = (de: number, ate: number | null) => (ate === null ? `+ ${de - 1} meses` : `${de} a ${ate} meses`);
const monta = (sexo: Sexo, l: [number, number | null][]): FaixaIdade[] => l.map(([de, ate], i) => ({ sexo, de, ate, rotulo: rot(de, ate), ordem: i + 1 }));

export const FAIXAS_IDADE: Record<Sexo, FaixaIdade[]> = {
  M: monta('M', [[0, 12], [13, 24], [25, 36], [37, null]]),
  F: monta('F', [[0, 2], [3, 8], [9, 12], [13, 24], [25, 36], [37, null]]),
};

/** Chave curta de uma faixa: "M13", "F0"... */
export const chaveFaixa = (f: { sexo: Sexo; de: number }) => `${f.sexo}${f.de}`;

export function faixaPorChave(chave: string | null | undefined): FaixaIdade | null {
  if (!chave) return null;
  const sexo = chave[0] as Sexo;
  return FAIXAS_IDADE[sexo]?.find((f) => chaveFaixa(f) === chave) ?? null;
}

/** Em que faixa cai uma idade (meses) de um sexo. */
export function faixaDaIdade(sexo: Sexo, meses: number): FaixaIdade {
  const l = FAIXAS_IDADE[sexo];
  return l.find((f) => meses >= f.de && (f.ate === null || meses <= f.ate)) ?? l[l.length - 1];
}

/**
 * Idade (meses) usada para gravar um animal que entrou informado só pela faixa:
 * o meio da faixa (na última, 6 meses depois do início). Daí em diante a idade evolui sozinha
 * e o animal muda de faixa no tempo certo.
 */
export function mesesDaFaixa(f: FaixaIdade): number {
  return f.ate === null ? f.de + 6 : Math.round((f.de + f.ate) / 2);
}

export const nomeSexo = (s: Sexo, plural = true) => (s === 'M' ? (plural ? 'Machos' : 'Macho') : plural ? 'Fêmeas' : 'Fêmea');
