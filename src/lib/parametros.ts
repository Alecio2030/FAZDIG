// V174: Parâmetros do sistema. Vêm preenchidos com os valores usuais (valor_padrao);
// o operador muda o que for diferente (valor). Em branco = volta ao usual.
import { consulta, supabase } from './supabase';

export type Parametro = { chave: string; grupo: string; rotulo: string; unidade: string | null; valor_padrao: number; valor: number | null; ordem: number; ajuda: string | null };

let guardados: Record<string, Parametro> | null = null;

export async function carregarParametros(recarregar = false): Promise<Record<string, Parametro>> {
  if (guardados && !recarregar) return guardados;
  try {
    const l = await consulta<Parametro[]>(supabase.from('parametros').select('*').order('ordem'));
    guardados = Object.fromEntries(l.map((p) => [p.chave, { ...p, valor_padrao: Number(p.valor_padrao), valor: p.valor == null ? null : Number(p.valor) }]));
  } catch {
    guardados = {}; // banco sem a V174: as telas usam os valores fixos de antes
  }
  return guardados;
}

/** Valor em uso do parâmetro (o informado ou o usual); null se o banco ainda não tem o parâmetro. */
export function valorParam(chave: string): number | null {
  const p = guardados?.[chave];
  if (!p) return null;
  return p.valor ?? p.valor_padrao;
}

/** Vida útil da categoria do Imobilizado (anos), dos parâmetros; sem eles, o valor fixo de antes. */
export const vidaDaCategoria = (categoria: string, fixo: number) => valorParam(`vida_${categoria}`) ?? fixo;
/** Valor residual (%) usual da categoria; 0 sem parâmetro. */
export const residualDaCategoria = (categoria: string) => valorParam(`resid_${categoria}`) ?? 0;

export async function salvarParametros(lista: { chave: string; valor: number | null }[]): Promise<number> {
  const { data, error } = await supabase.rpc('salvar_parametros', { p: lista });
  if (error) throw error;
  await carregarParametros(true);
  return Number(data ?? 0);
}
