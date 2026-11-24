// V174: Rateio padrão por unidade. Quando a despesa não tem um centro de custo específico, a tela já abre
// com os centros e os % guardados. O que o operador informar na primeira vez fica guardado como padrão
// (do tipo da despesa e, se ainda não houver, como padrão geral da unidade).
// Chaves: tipo da despesa (ex.: 'energia'), 'geral' (qualquer despesa) e 'depreciacao' (bem sem rateio próprio).
import { supabase } from './supabase';
import { numeroParaCampo } from './formatos';

export type ItemRateio = { centro_custo_id: string; percentual: number };
export const CHAVE_GERAL = 'geral';
export const CHAVE_DEPRECIACAO = 'depreciacao';

/** Todos os padrões da unidade, por chave. */
export async function padroesDaUnidade(fazendaId: string | null): Promise<Record<string, ItemRateio[]>> {
  const q = supabase.from('rateios_padrao').select('chave, centro_custo_id, percentual, centro:centros_custo ( ativo )');
  const { data, error } = await (fazendaId ? q.eq('fazenda_id', fazendaId) : q.is('fazenda_id', null));
  if (error) return {}; // banco sem a V174
  const m: Record<string, ItemRateio[]> = {};
  for (const r of (data ?? []) as any[]) {
    const ativo = Array.isArray(r.centro) ? r.centro[0]?.ativo : r.centro?.ativo;
    if (ativo === false) continue;
    (m[r.chave] ??= []).push({ centro_custo_id: r.centro_custo_id, percentual: Number(r.percentual) });
  }
  return m;
}

/** Padrão para a despesa: o do tipo; sem ele, o geral da unidade. */
export async function rateioPadrao(fazendaId: string | null, tipo: string | null): Promise<{ origem: 'tipo' | 'geral' | null; rateio: ItemRateio[] }> {
  const m = await padroesDaUnidade(fazendaId);
  if (tipo && m[tipo]?.length) return { origem: 'tipo', rateio: m[tipo] };
  if (m[CHAVE_GERAL]?.length) return { origem: 'geral', rateio: m[CHAVE_GERAL] };
  return { origem: null, rateio: [] };
}

export async function guardarRateioPadrao(fazendaId: string | null, chave: string, rateio: ItemRateio[]) {
  const { error } = await supabase.rpc('salvar_rateio_padrao', { p_fazenda: fazendaId, p_chave: chave, p_rateio: rateio });
  if (error) throw error;
}

/**
 * Depois de gravar a despesa: guarda o rateio usado como padrão do tipo (se ainda não havia) e como geral
 * (se a unidade ainda não tem nenhum). "forcar" grava por cima do padrão do tipo (caixinha marcada).
 */
export async function aprenderRateio(fazendaId: string | null, tipo: string | null, rateio: ItemRateio[], forcar = false): Promise<string | null> {
  if (!rateio.length) return null;
  try {
    const m = await padroesDaUnidade(fazendaId);
    const feitos: string[] = [];
    if (tipo && (forcar || !m[tipo]?.length)) {
      await guardarRateioPadrao(fazendaId, tipo, rateio);
      feitos.push('deste tipo de despesa');
    }
    if (!m[CHAVE_GERAL]?.length) {
      await guardarRateioPadrao(fazendaId, CHAVE_GERAL, rateio);
      feitos.push('geral da unidade');
    }
    return feitos.length ? `O rateio ficou guardado como padrão ${feitos.join(' e ')} (Financeiro › Parâmetros).` : null;
  } catch {
    return null; // não guardar o padrão não impede a despesa
  }
}

/** Os dois rateios são iguais (mesmos centros e %)? */
export function mesmoRateio(a: ItemRateio[], b: ItemRateio[]): boolean {
  if (a.length !== b.length) return false;
  const k = (l: ItemRateio[]) => l.map((x) => `${x.centro_custo_id}:${Number(x.percentual).toFixed(2)}`).sort().join('|');
  return k(a) === k(b);
}

/** Padrão -> linhas das telas de Despesa e Título ({ chave, centroId, perc }). */
export const linhasDoPadrao = (l: ItemRateio[], chave: () => string) => l.map((x) => ({ chave: chave(), centroId: x.centro_custo_id, perc: numeroParaCampo(x.percentual) }));
