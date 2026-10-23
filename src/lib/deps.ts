// DEPs oficiais: programas de avaliação genética e leitura/gravação das DEPs do animal.
import { consulta, supabase } from './supabase';

export const PROGRAMAS_DEP = [
  { valor: 'PMGZ', rotulo: 'PMGZ (ABCZ)' },
  { valor: 'ANCP', rotulo: 'ANCP' },
  { valor: 'Geneplus', rotulo: 'Geneplus (Embrapa)' },
];

/** Como cada programa classifica o animal: DECA (1 a 10) no PMGZ, TOP % nos outros. */
export const rotuloClasse = (programa: string | null) => (programa === 'PMGZ' ? 'DECA' : 'TOP %');

export type Caracteristica = { id: string; programa: string; sigla: string; nome: string; unidade: string | null; indice: boolean };
export type ValorDep = { dep: string; ac: string; classe: string };
export type ValoresDep = Record<string, ValorDep>;

export async function caracteristicasDep(programa: string): Promise<Caracteristica[]> {
  return consulta<Caracteristica[]>(
    supabase.from('dep_caracteristicas').select('id, programa, sigla, nome, unidade, indice').eq('programa', programa).eq('ativo', true).order('ordem'),
  );
}

/** "-1,25" ou "−1.25" -> -1.25 (DEP pode ser negativa). Vazio ou inválido -> null. */
export function lerDep(texto: string): number | null {
  const t = texto.trim().replace('−', '-').replace(/\./g, ',').replace(',', '.').replace(/,/g, '');
  if (!t || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const paraCampo = (v: number | string | null | undefined) => (v == null ? '' : String(Number(v)).replace('.', ','));

export async function lerDepsAnimal(animalId: string): Promise<ValoresDep> {
  const d = await consulta<any[]>(supabase.from('animal_deps').select('caracteristica_id, dep, acuracia, classe').eq('animal_id', animalId));
  return Object.fromEntries(d.map((x) => [x.caracteristica_id, { dep: paraCampo(x.dep), ac: paraCampo(x.acuracia), classe: paraCampo(x.classe) }]));
}

/** Grava as DEPs informadas (só as do programa escolhido; linha vazia não é gravada). */
export async function gravarDepsAnimal(animalId: string, programa: string | null, valores: ValoresDep): Promise<string | null> {
  const { error: e1 } = await supabase.from('animal_deps').delete().eq('animal_id', animalId);
  if (e1) return e1.message;
  if (!programa) return null;
  const doPrograma = new Set((await caracteristicasDep(programa)).map((c) => c.id));
  const linhas = Object.entries(valores)
    .filter(([id]) => doPrograma.has(id))
    .map(([id, v]) => ({ animal_id: animalId, caracteristica_id: id, dep: lerDep(v.dep), acuracia: lerDep(v.ac), classe: lerDep(v.classe) }))
    .filter((l) => l.dep != null || l.acuracia != null || l.classe != null);
  if (!linhas.length) return null;
  const { error } = await supabase.from('animal_deps').insert(linhas);
  return error ? error.message : null;
}

/** Confere o que foi digitado; devolve o texto do erro ou null. */
export function validarDeps(valores: ValoresDep): string | null {
  for (const v of Object.values(valores)) {
    if (v.dep.trim() && lerDep(v.dep) == null) return 'há DEP com número inválido';
    const ac = v.ac.trim() ? lerDep(v.ac) : null;
    if (v.ac.trim() && (ac == null || ac < 0 || ac > 100)) return 'a acurácia (AC) vai de 0 a 100';
    if (v.classe.trim() && lerDep(v.classe) == null) return 'há DECA/TOP com número inválido';
  }
  return null;
}
