// Plano de adubação: da necessidade de N, P2O5 e K2O (kg/ha por ano) para os adubos do estoque, pela garantia de cada um,
// e o parcelamento em aplicações. É apoio à decisão: a recomendação final é do agrônomo responsável.
import { lerNumero } from './formatos';

export type Nutriente = 'n' | 'p' | 'k';
export type Garantia = Record<Nutriente, number>;
export type Necessidade = Record<Nutriente, number | null>;
export const ROTULO_NUTRIENTE: Record<Nutriente, string> = { n: 'N', p: 'P₂O₅', k: 'K₂O' };
const NUTRIENTES: Nutriente[] = ['n', 'p', 'k'];

/** Garantia do adubo (% de N, P2O5 e K2O), do cadastro do produto. */
export function garantiaDe(insumo: any): Garantia {
  const a = insumo?.atributos ?? {};
  const v = (x: any) => Math.max(0, lerNumero(String(x ?? '')) ?? 0);
  return { n: v(a.n), p: v(a.p), k: v(a.k) };
}
/** "20-00-20" */
export const formulaDe = (g: Garantia) => NUTRIENTES.map((x) => String(Math.round(g[x])).padStart(2, '0')).join('-');
export const temGarantia = (g: Garantia) => g.n + g.p + g.k > 0;

export type Dosagem = {
  /** kg por hectare por ano de cada produto */
  doses: Record<string, number>;
  entregue: Garantia;
  avisos: string[];
};

/**
 * Quanto de cada produto para atender a necessidade (kg/ha/ano).
 * Primeiro os formulados (mais de um nutriente), até o nutriente que fecha primeiro, para não passar de nenhum;
 * depois os adubos simples completam o que faltou. Nutriente sem necessidade definida (null) não limita.
 */
export function dosar(nec: Necessidade, produtos: { id: string; nome: string; g: Garantia }[]): Dosagem {
  const falta: Record<Nutriente, number> = { n: nec.n ?? 0, p: nec.p ?? 0, k: nec.k ?? 0 };
  const entregue: Garantia = { n: 0, p: 0, k: 0 };
  const doses: Record<string, number> = {};
  const avisos: string[] = [];
  const ordem = [...produtos].sort((a, b) => NUTRIENTES.filter((x) => b.g[x] > 0).length - NUTRIENTES.filter((x) => a.g[x] > 0).length);
  for (const p of ordem) {
    const presentes = NUTRIENTES.filter((x) => p.g[x] > 0);
    const limitam = presentes.filter((x) => nec[x] != null);
    if (!limitam.length) {
      doses[p.id] = 0;
      avisos.push(`${p.nome} não tem nutriente que este plano pede.`);
      continue;
    }
    const dose = Math.max(0, Math.min(...limitam.map((x) => falta[x] / (p.g[x] / 100))));
    doses[p.id] = Math.round(dose * 10) / 10;
    if (dose <= 0.05) {
      const zerado = limitam.find((x) => falta[x] <= 0.05)!;
      avisos.push(`${p.nome} ficou de fora: o plano não precisa (ou não precisa mais) de ${ROTULO_NUTRIENTE[zerado]}.`);
      doses[p.id] = 0;
      continue;
    }
    for (const x of presentes) {
      const kg = (doses[p.id] * p.g[x]) / 100;
      entregue[x] += kg;
      falta[x] -= kg;
    }
  }
  for (const x of NUTRIENTES) {
    if (nec[x] != null && nec[x]! > 0 && falta[x] > Math.max(1, nec[x]! * 0.02)) avisos.push(`Faltam ${Math.round(falta[x])} kg/ha de ${ROTULO_NUTRIENTE[x]}: escolha também um adubo que tenha ${ROTULO_NUTRIENTE[x]}.`);
    if (nec[x] == null && entregue[x] > 0.5) avisos.push(`Os produtos levam ${Math.round(entregue[x])} kg/ha de ${ROTULO_NUTRIENTE[x]}, que este plano não calcula: confira com o agrônomo.`);
  }
  return { doses, entregue: { n: Math.round(entregue.n * 10) / 10, p: Math.round(entregue.p * 10) / 10, k: Math.round(entregue.k * 10) / 10 }, avisos };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Datas e percentuais de partida do parcelamento: do começo de setembro (floração) ao começo de março (granação),
 * em partes iguais. Datas que já passaram viram hoje. São só a sugestão: a tela deixa mudar.
 */
export function parcelasPadrao(n: number, hoje: string): { data: string; perc: number }[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const inicio = new Date(mes >= 4 ? ano : ano - 1, 8, 1); // 1º de setembro da safra em curso
  const fim = new Date(inicio.getFullYear() + 1, 2, 1); // 1º de março
  const passo = n > 1 ? (fim.getTime() - inicio.getTime()) / (n - 1) : 0;
  const base = Math.floor((100 / n) * 10) / 10;
  return Array.from({ length: n }, (_, i) => {
    const d = iso(new Date(inicio.getTime() + passo * i));
    return { data: d < hoje ? hoje : d, perc: i === n - 1 ? Math.round((100 - base * (n - 1)) * 10) / 10 : base };
  });
}
