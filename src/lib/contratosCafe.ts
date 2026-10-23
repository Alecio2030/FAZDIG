// Contratos de café: venda futura (preço fixo ou a fixar, com ou sem adiantamento) e troca por insumos (compra paga em sacas).
// A entrega é uma venda de café normal ligada ao contrato; o banco compensa o adiantamento ou a compra sem movimentar dinheiro.
import { supabase, consulta } from './supabase';
import { hojeBanco } from './datas';
import { formatarMoeda } from './formatos';
import { textoSacas } from './posColheita';

export type TipoContrato = 'venda_futura' | 'troca';

export type ContratoCafe = {
  id: string;
  fazenda_id: string;
  numero: number;
  tipo: TipoContrato;
  pessoa_id: string;
  pessoa_nome: string;
  data: string;
  safra_id: string | null;
  safra_nome: string | null;
  sacas: number;
  especie: string | null;
  cafe_tipo: string | null;
  preco_tipo: 'fixo' | 'a_fixar';
  preco: number | null;
  data_entrega: string;
  local_entrega: string | null;
  compra_id: string | null;
  compra_numero: number | null;
  compra_valor: number | null;
  valor_troca: number | null;
  situacao: 'aberto' | 'concluido' | 'cancelado';
  observacoes: string | null;
  /** sacas já entregues */
  entregue: number;
  /** venda futura: adiantamentos recebidos e o quanto já foi abatido nas entregas */
  adiantado: number;
  compensado: number;
  /** troca: o que ainda está em aberto no contas a pagar da compra */
  aberto_compra: number;
  entregas: { id: string; numero: number; data: string; sacas: number; valor_bruto: number; valor_total: number; compensado: number }[];
  adiantamentos: { id: string; numero: number; data: string; valor: number; valor_pago: number; situacao: string }[];
};

export const TIPOS_CONTRATO = [
  { valor: 'venda_futura', rotulo: 'Venda futura' },
  { valor: 'troca', rotulo: 'Troca por insumos' },
];
export const ROTULO_TIPO_CONTRATO: Record<string, string> = { venda_futura: 'Venda futura', troca: 'Troca por insumos' };
export const ROTULO_SITUACAO_CONTRATO: Record<string, string> = { aberto: 'Aberto', concluido: 'Concluído', cancelado: 'Cancelado' };

const N = (v: any) => Number(v ?? 0) || 0;

function arrumar(c: any): ContratoCafe {
  return {
    ...c,
    sacas: N(c.sacas),
    preco: c.preco != null ? N(c.preco) : null,
    valor_troca: c.valor_troca != null ? N(c.valor_troca) : null,
    compra_valor: c.compra_valor != null ? N(c.compra_valor) : null,
    entregue: N(c.entregue),
    adiantado: N(c.adiantado),
    compensado: N(c.compensado),
    aberto_compra: N(c.aberto_compra),
    entregas: ((c.entregas as any[]) ?? []).map((e) => ({ ...e, sacas: N(e.sacas), valor_bruto: N(e.valor_bruto), valor_total: N(e.valor_total), compensado: N(e.compensado) })),
    adiantamentos: ((c.adiantamentos as any[]) ?? []).map((a) => ({ ...a, valor: N(a.valor), valor_pago: N(a.valor_pago) })),
  };
}

/** Contratos da fazenda (abertos primeiro, pela data de entrega). Com `id`, só aquele. */
export async function lerContratos(fazendaId: string, id?: string): Promise<ContratoCafe[]> {
  const d = await consulta<any[]>(supabase.rpc('cafe_contratos_painel', id ? { p_fazenda: fazendaId, p_id: id } : { p_fazenda: fazendaId }));
  return (d ?? []).map(arrumar);
}

/** Sacas que ainda faltam entregar. */
export const saldoSacas = (c: ContratoCafe) => Math.max(0, Math.round((c.sacas - c.entregue) * 1000) / 1000);
/** Valor que a próxima entrega pode compensar sem dinheiro: o adiantamento ainda não abatido, ou a compra em aberto (troca). */
export const aCompensar = (c: ContratoCafe) => Math.max(0, Math.round((c.tipo === 'troca' ? c.aberto_compra : c.adiantado - c.compensado) * 100) / 100);

/** Dias até a data-limite de entrega (negativo = vencido). */
export function diasParaEntrega(c: ContratoCafe): number {
  const [a, m, d] = c.data_entrega.split('-').map(Number);
  const [a2, m2, d2] = hojeBanco().split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(a2, m2 - 1, d2)) / 86400000);
}

/** "vencido há 3 dias" / "vence hoje" / "faltam 12 dias" (só para contrato aberto). */
export function textoPrazo(c: ContratoCafe): string {
  const d = diasParaEntrega(c);
  if (d < 0) return `vencido há ${-d} ${d === -1 ? 'dia' : 'dias'}`;
  if (d === 0) return 'vence hoje';
  return `${d === 1 ? 'falta 1 dia' : `faltam ${d} dias`}`;
}

/** "R$ 1.000,00 por saca" / "preço a fixar (cotação do dia da entrega)" */
export const textoPreco = (c: ContratoCafe) => (c.preco_tipo === 'a_fixar' || c.preco == null ? 'preço a fixar (cotação do dia da entrega)' : `${formatarMoeda(c.preco)} por saca`);

/** "Conilon · tipo 7" (o que estiver informado) */
export const textoCafe = (c: ContratoCafe) => [c.especie, c.cafe_tipo ? `tipo ${c.cafe_tipo}` : null].filter(Boolean).join(' · ');

/** "Nº 3 · Fulano · faltam 60 sacas" */
export const rotuloContrato = (c: ContratoCafe) => `Nº ${c.numero} · ${c.pessoa_nome} · faltam ${textoSacas(saldoSacas(c))}`;
