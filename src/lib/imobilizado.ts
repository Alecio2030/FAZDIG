// Imobilizado: depreciação (máquinas, benfeitorias) e exaustão (lavouras perenes), linear por mês.

export type Metodo = 'depreciacao' | 'exaustao';

export const CATEGORIAS_IMOB: { valor: string; rotulo: string; metodo: Metodo; vida: number }[] = [
  { valor: 'tratores', rotulo: 'Tratores', metodo: 'depreciacao', vida: 10 },
  { valor: 'maquinas', rotulo: 'Máquinas agrícolas', metodo: 'depreciacao', vida: 10 },
  { valor: 'implementos', rotulo: 'Implementos', metodo: 'depreciacao', vida: 10 },
  { valor: 'veiculos', rotulo: 'Veículos', metodo: 'depreciacao', vida: 5 },
  { valor: 'benfeitorias', rotulo: 'Benfeitorias e construções', metodo: 'depreciacao', vida: 25 },
  { valor: 'cercas', rotulo: 'Cercas e currais', metodo: 'depreciacao', vida: 10 },
  { valor: 'barragens', rotulo: 'Barragens, represas e açudes', metodo: 'depreciacao', vida: 25 },
  { valor: 'estradas', rotulo: 'Estradas, terraplanagem e drenagem', metodo: 'depreciacao', vida: 10 },
  { valor: 'equipamentos', rotulo: 'Equipamentos', metodo: 'depreciacao', vida: 10 },
  { valor: 'outros', rotulo: 'Outros bens', metodo: 'depreciacao', vida: 10 },
  { valor: 'cafe', rotulo: 'Lavoura de café', metodo: 'exaustao', vida: 15 },
  { valor: 'perene', rotulo: 'Outra cultura perene / pomar', metodo: 'exaustao', vida: 15 },
  { valor: 'pastagem', rotulo: 'Pastagem plurianual (formação)', metodo: 'exaustao', vida: 8 },
];
export const ROTULO_CAT_IMOB: Record<string, string> = Object.fromEntries(CATEGORIAS_IMOB.map((c) => [c.valor, c.rotulo]));
export const ROTULO_METODO: Record<string, string> = { depreciacao: 'Depreciação', exaustao: 'Exaustão' };
export const ROTULO_SITUACAO_IMOB: Record<string, string> = { ativo: 'Em uso', baixado: 'Baixado', formacao: 'Em formação' };

type Bem = { valor_aquisicao: any; data_ativacao: string; vida_util: any; residual_perc: any; situacao?: string; data_baixa?: string | null };

/** Nº de meses de aaaa-mm-dd até aaaa-mm-dd (só pelo mês). */
export function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** Cálculo do bem: a quota começa no mês seguinte ao da ativação (1 safra = 12 meses). */
export function calcular(b: Bem, ateIso: string) {
  const valor = Number(b.valor_aquisicao) || 0;
  const residual = (valor * (Number(b.residual_perc) || 0)) / 100;
  const base = valor - residual;
  const meses = Math.round((Number(b.vida_util) || 0) * 12);
  const mensal = meses > 0 ? base / meses : 0;
  const limite = b.situacao === 'baixado' && b.data_baixa && b.data_baixa < ateIso ? b.data_baixa : ateIso;
  const decorridos = Math.max(0, Math.min(meses, mesesEntre(b.data_ativacao, limite)));
  const acumulado = Math.min(base, mensal * decorridos);
  const [a, m] = b.data_ativacao.split('-').map(Number);
  const fim = new Date(Date.UTC(a, m - 1 + meses, 1)).toISOString().slice(0, 7);
  return { valor, residual, base, meses, mensal, decorridos, acumulado, contabil: valor - acumulado, fim, encerrado: decorridos >= meses };
}

/** Quota de um mês (aaaa-mm). */
export function quotaDoMes(b: Bem, mes: string): number {
  const c = calcular(b, `${mes}-28`);
  const idx = mesesEntre(b.data_ativacao, `${mes}-01`);
  if (idx < 1 || idx > c.meses) return 0;
  if (b.situacao === 'baixado' && b.data_baixa && b.data_baixa.slice(0, 7) < mes) return 0;
  return c.mensal;
}

/** Tabela por ano: quota do ano, acumulado e valor contábil no fim do ano. */
export function tabelaAnual(b: Bem): { ano: number; quota: number; acumulado: number; contabil: number }[] {
  const c = calcular(b, '9999-12-31');
  if (!c.meses) return [];
  const a0 = Number(b.data_ativacao.slice(0, 4));
  const a1 = Number(c.fim.slice(0, 4));
  const saida = [];
  let ant = 0;
  for (let a = a0; a <= a1; a++) {
    const x = calcular(b, `${a}-12-31`);
    saida.push({ ano: a, quota: x.acumulado - ant, acumulado: x.acumulado, contabil: x.contabil });
    ant = x.acumulado;
  }
  return saida.filter((l) => l.quota > 0.004 || l.ano === a0);
}

export const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const textoMes = (mes: string) => `${NOMES_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}
