// Atividades agrícolas: tipos, tipos de cada atividade, produtos aceitos e o cálculo da dose.
import { TIPOS_PODA } from './talhoes';
import { formatarNumero, formatarQtd } from './formatos';
import { custosDe } from './insumos';

export type TipoAtividade = 'adubacao' | 'pulverizacao' | 'capina' | 'poda' | 'irrigacao' | 'plantio' | 'outro';
type Opcao = { valor: string; rotulo: string };
const op = (l: string[]): Opcao[] => l.map((v) => ({ valor: v, rotulo: v }));

export const TIPOS_ATIVIDADE: { valor: TipoAtividade; rotulo: string; icone: string }[] = [
  { valor: 'adubacao', rotulo: 'Adubação', icone: '🌱' },
  { valor: 'pulverizacao', rotulo: 'Pulverização', icone: '💧' },
  { valor: 'capina', rotulo: 'Capina', icone: '🌿' },
  { valor: 'poda', rotulo: 'Poda', icone: '✂️' },
  { valor: 'irrigacao', rotulo: 'Irrigação', icone: '🚿' },
  { valor: 'plantio', rotulo: 'Plantio / replantio', icone: '🌳' },
  { valor: 'outro', rotulo: 'Outra', icone: '🛠️' },
];
export const ROTULO_ATIVIDADE: Record<string, string> = Object.fromEntries(TIPOS_ATIVIDADE.map((t) => [t.valor, t.rotulo]));
export const ICONE_ATIVIDADE: Record<string, string> = Object.fromEntries(TIPOS_ATIVIDADE.map((t) => [t.valor, t.icone]));

/** Tipos de cada atividade (a primeira opção vem marcada). Irrigação e Outra não têm lista. */
export const SUBTIPOS: Partial<Record<TipoAtividade, Opcao[]>> = {
  adubacao: op(['Via solo', 'Foliar', 'Fertirrigação', 'Correção do solo']),
  pulverizacao: op(['Fungicida', 'Inseticida', 'Herbicida', 'Nutricional', 'Outro']),
  capina: op(['Manual / roçada', 'Mecânica', 'Química']),
  poda: TIPOS_PODA,
  plantio: op(['Plantio', 'Replantio']),
};

/** A atividade exige produto do estoque? */
export const exigeProduto = (tipo: string, sub: string) => ['adubacao', 'pulverizacao', 'plantio'].includes(tipo) || (tipo === 'capina' && sub === 'Química');
/** A atividade aceita produto (mesmo sem exigir)? */
export const aceitaProduto = (tipo: string, sub: string) => exigeProduto(tipo, sub) || tipo === 'outro' || tipo === 'irrigacao';

/** Categorias de produto que aparecem para cada atividade (as primeiras vêm antes na lista). */
export function categoriasPara(tipo: string, sub: string): string[] {
  if (tipo === 'adubacao') return ['fertilizante', 'adubo', 'outro'];
  if (tipo === 'pulverizacao') return sub === 'Nutricional' ? ['fertilizante', 'adubo', 'defensivo', 'outro'] : ['defensivo', 'fertilizante', 'adubo', 'outro'];
  if (tipo === 'capina') return ['defensivo', 'outro'];
  if (tipo === 'plantio') return ['semente', 'fertilizante', 'adubo', 'outro'];
  if (tipo === 'irrigacao') return ['fertilizante', 'adubo', 'defensivo', 'outro'];
  return ['fertilizante', 'adubo', 'defensivo', 'semente', 'combustivel', 'outro'];
}

// ===== unidades da dose =====
const FATOR: Record<string, { grupo: string; fator: number }> = {
  g: { grupo: 'massa', fator: 1 }, kg: { grupo: 'massa', fator: 1000 }, t: { grupo: 'massa', fator: 1e6 },
  mL: { grupo: 'volume', fator: 1 }, L: { grupo: 'volume', fator: 1000 },
};

/** Unidade em que o produto é consumido (a de dose, se houver; senão a de compra). */
export const unidadeConsumo = (i: any): string => i?.unidade_dose || i?.unidade || 'un';

/** Unidades possíveis para a dose, conforme a unidade de consumo do produto. */
export function unidadesDose(i: any): string[] {
  const c = unidadeConsumo(i);
  const g = FATOR[c]?.grupo;
  if (g === 'massa') return ['g', 'kg', 't'];
  if (g === 'volume') return ['mL', 'L'];
  return [c];
}

export const DOSE_POR: Opcao[] = [
  { valor: 'planta', rotulo: 'por planta' },
  { valor: 'ha', rotulo: 'por hectare' },
  { valor: 'bomba', rotulo: 'por bomba' },
  { valor: 'total', rotulo: 'total aplicado' },
];

/** Sugestão de dose para quem não tem dose anterior: adubo via solo e plantio por planta; o resto por hectare. */
export function sugestaoDose(i: any, tipo: string, sub: string, temPlantas: boolean): { por: string; unidade: string } {
  const us = unidadesDose(i);
  const massa = us.includes('kg');
  const volume = us.includes('L');
  if (temPlantas && ((tipo === 'adubacao' && sub === 'Via solo') || tipo === 'plantio')) return { por: 'planta', unidade: massa ? 'g' : volume ? 'mL' : us[0] };
  if (tipo === 'adubacao' && sub === 'Correção do solo') return { por: 'ha', unidade: massa ? 't' : us[0] };
  return { por: 'ha', unidade: massa ? 'kg' : volume ? 'L' : us[0] };
}

/** Total na unidade de consumo e na de estoque (mesma conta do banco). null se as unidades não combinam. */
export function calcularTotal(i: any, dose: number, unidade: string, por: string, base: { ha: number; plantas: number; bombas?: number }): { consumo: number; estoque: number } | null {
  // V147: "por bomba" = dose em cada bomba (tanque) de calda × nº de bombas aplicadas
  const b = por === 'ha' ? base.ha : por === 'planta' ? base.plantas : por === 'bomba' ? base.bombas ?? 0 : 1;
  const c = unidadeConsumo(i);
  let qtd: number;
  if (unidade === c) qtd = dose * b;
  else {
    const d = FATOR[unidade];
    const k = FATOR[c];
    if (!d || !k || d.grupo !== k.grupo) return null;
    qtd = (dose * b * d.fator) / k.fator;
  }
  const fatorEstoque = i.unidade_dose && i.unidade_dose !== i.unidade ? Number(i.conteudo_por_unidade) || 1 : 1;
  return { consumo: Math.round(qtd * 10000) / 10000, estoque: Math.round((qtd / fatorEstoque) * 10000) / 10000 };
}

/** "1.500 kg (30 sc)" – o total na unidade de consumo, com o equivalente no estoque quando for outra. */
export function textoTotal(i: any, t: { consumo: number; estoque: number }): string {
  const c = unidadeConsumo(i);
  const base = `${formatarQtd(t.consumo, 2)} ${c}`;
  return c === i.unidade ? base : `${base} (${formatarQtd(t.estoque, 2)} ${i.unidade})`;
}

/** "200 g por planta" */
export function textoDoseAplicada(dose: number, unidade: string, por: string): string {
  return `${formatarQtd(dose)} ${unidade} ${por === 'planta' ? 'por planta' : por === 'ha' ? 'por hectare' : por === 'bomba' ? 'por bomba' : 'no total'}`;
}

/** Custo de um produto aplicado: pelo custo gravado na data; se ainda não tinha, pelo custo médio de hoje.
 *  V148: o que voltou ao estoque pelo Retorno sai do custo (consumo = saída − retorno). */
export function custoItem(it: { quantidade_estoque: any; custo_unitario: any; retornado?: any }, medioAtual: number | null): number | null {
  const cu = it.custo_unitario != null ? Number(it.custo_unitario) : medioAtual;
  return cu != null ? (Number(it.quantidade_estoque) - Number(it.retornado ?? 0)) * cu : null;
}

/** "Adubação · Via solo" */
export const tituloAtividade = (a: { tipo: string; subtipo?: string | null }) => `${ROTULO_ATIVIDADE[a.tipo] ?? a.tipo}${a.subtipo ? ` · ${a.subtipo}` : ''}`;

export const haTexto = (v: number | null | undefined) => (v ? `${formatarNumero(v, 2)} ha` : '');

/** Custo médio de hoje de cada produto (pelas entradas com valor): { insumo_id: custo por unidade de estoque }. */
export function mediosAtuais(movs: { insumo_id: string; tipo: string; quantidade: any; valor_unitario: any; data: string }[]): Record<string, number | null> {
  const grupos: Record<string, typeof movs> = {};
  for (const m of movs) (grupos[m.insumo_id] ??= []).push(m);
  const r: Record<string, number | null> = {};
  for (const k of Object.keys(grupos)) r[k] = custosDe(grupos[k]).medio;
  return r;
}

/** Custo dos produtos de uma atividade (só os que baixaram do estoque). */
export function custoAtividade(itens: any[], medios: Record<string, number | null>): number {
  return itens.filter((i) => i.baixou).reduce((s, i) => s + (custoItem(i, medios[i.insumo_id] ?? null) ?? 0), 0);
}
