// V176: o plano de contas passa de 1.000 contas (o banco entrega no máximo 1.000 por vez):
// lê em páginas, sempre em ordem numérica do código (1 Ativo, 2 Passivo e PL, 3 Receitas, 4 Custos e despesas).
import { supabase } from './supabase';

export async function planoCompleto<T = any>(colunas: string, filtro?: (q: any) => any): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    let q: any = supabase.from('plano_contas').select(colunas);
    if (filtro) q = filtro(q);
    const { data, error } = await q.order('codigo').range(de, de + 999);
    if (error) throw error;
    todas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return todas;
}
