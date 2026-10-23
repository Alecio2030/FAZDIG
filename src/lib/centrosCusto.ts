// V144: Centros de custo = contas de GRAU 3 do grupo 4 (Custos e despesas) do Plano de contas.
// Mesmo código e mesmo nome da conta (ex.: 4.1.01 AGRÍCOLA da Fazenda 3 Irmãos). O sistema cria sozinho
// (banco: centro_do_grau3, gatilho no plano). Dentro de cada centro ficam as DIVISÕES, também criadas
// sozinhas para talhões (no 4.N.01), mangas e lotes (no 4.N.02): código do centro + "-" + nº (4.1.01-001).
// Os centros do Particular (sócios) seguem o formato antigo (01, 01.01): não são do grupo 4.

export type Centro = {
  id: string;
  codigo: string;
  nome: string;
  centro_pai_id: string | null;
  fazenda_id: string | null;
  area_id: string | null;
  lote_id: string | null;
  conta_plano_id?: string | null;
  ativo: boolean;
};

/** Código de conta de grau 3 do grupo 4 (o código de um centro de custo): 4.1.01 */
export const ehCodigoCentroPlano = (c: string) => /^4\.\d+\.\d{2}$/.test(c.trim());

/** Divisão de um centro: 4.1.01-001 */
export const ehCodigoDivisao = (c: string, pai: string) => new RegExp(`^${pai.replace(/\./g, '\\.')}-\\d{3}$`).test(c.trim());

/** Próximo código livre de divisão dentro do centro. */
export function proximaDivisao(pai: string, irmaos: string[]): string {
  const usados = irmaos.map((c) => Number(c.split('-')[1])).filter((n) => Number.isFinite(n));
  const n = (usados.length ? Math.max(...usados) : 0) + 1;
  return `${pai}-${String(n).padStart(3, '0')}`;
}

/** "4.1.01 AGRÍCOLA › Talhão 3" */
export function caminhoCentro(c: Centro, porId: Record<string, Centro>): string {
  const pai = c.centro_pai_id ? porId[c.centro_pai_id] : null;
  return pai ? `Dentro de ${pai.codigo} ${pai.nome}` : '';
}
