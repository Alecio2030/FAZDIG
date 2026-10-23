// Contas a pagar: apoio às telas de títulos (situação, prazo, encargos por atraso).
import { doBanco, hojeBanco } from './datas';
import { formatarMoeda } from './formatos';
import { diasEntre } from './reproducao';

export const CAMPOS_TITULO =
  'id, numero, tipo, descricao, documento, valor, valor_pago, situacao, data_emissao, data_vencimento, vencimento_original, previsto, agendado_para, parcela, total_parcelas, compra_id, venda_id, colheita_id, fech_colheita_id, vale_colheita_id, cafe_secagem_id, cafe_pilagem_id, cafe_movimento_id, recorrencia_id, competencia, abertura, fazenda_id, pessoa:pessoas ( nome )';

export type Titulo = {
  id: string;
  numero: number;
  descricao: string | null;
  documento: string | null;
  valor: number | string;
  valor_pago: number | string | null;
  situacao: 'aberto' | 'parcial' | 'pago' | 'cancelado';
  data_emissao: string;
  data_vencimento: string;
  vencimento_original: string | null;
  previsto: boolean;
  /** operação anterior ao início do sistema: contrapartida no Patrimônio Líquido */
  abertura?: boolean;
  agendado_para: string | null;
  parcela: number;
  total_parcelas: number;
  compra_id: string | null;
  venda_id?: string | null;
  colheita_id?: string | null;
  fech_colheita_id?: string | null;
  vale_colheita_id?: string | null;
  cafe_secagem_id?: string | null;
  cafe_pilagem_id?: string | null;
  cafe_movimento_id?: string | null;
  recorrencia_id: string | null;
  competencia: string | null;
  pessoa?: any;
  /** unidade de origem: a fazenda ou, em branco, a Administração (sede) */
  fazenda_id?: string | null;
};

export const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
export const r2 = (x: number) => Math.round(x * 100) / 100;

/** O que falta pagar do título. */
export const saldoTitulo = (t: { valor: any; valor_pago: any }) => r2(Number(t.valor) - Number(t.valor_pago ?? 0));

export const ROTULO_SITUACAO: Record<string, string> = { aberto: 'Em aberto', parcial: 'Pago em parte', pago: 'Pago', cancelado: 'Cancelado' };
export const ROTULO_SITUACAO_RECEBER: Record<string, string> = { aberto: 'Em aberto', parcial: 'Recebido em parte', pago: 'Recebido', cancelado: 'Cancelado' };

export type TipoTitulo = 'pagar' | 'receber';
/** Palavras que mudam entre o contas a pagar e o contas a receber (as telas são as mesmas). */
export function textosTitulo(tipo: TipoTitulo) {
  const r = tipo === 'receber';
  return {
    receber: r,
    modulo: r ? 'Contas a receber' : 'Contas a pagar',
    abaBaixa: r ? 'Receber' : 'Pagar',
    pessoa: r ? 'Cliente / devedor' : 'Fornecedor / credor',
    tipoPessoa: r ? 'cliente' : 'fornecedor',
    pagamento: r ? 'recebimento' : 'pagamento',
    Pagamento: r ? 'Recebimento' : 'Pagamento',
    pagamentos: r ? 'recebimentos' : 'pagamentos',
    Pagamentos: r ? 'Recebimentos' : 'Pagamentos',
    pago: r ? 'recebido' : 'pago',
    Pago: r ? 'Recebido' : 'Pago',
    pagar: r ? 'receber' : 'pagar',
    situacao: r ? ROTULO_SITUACAO_RECEBER : ROTULO_SITUACAO,
  };
}
export const ROTULO_BAIXA: Record<string, string> = {
  pendente: 'Aguardando confirmação do Master',
  confirmada: 'Confirmado',
  rejeitada: 'Rejeitado pelo Master',
  estornada: 'Estornado',
};

/** Dias de atraso (positivo = vencido) em relação a uma data (padrão: hoje). */
export const diasAtraso = (vencimento: string, ate: string = hojeBanco()) => diasEntre(vencimento, ate);

/** "Vencido há 3 dias", "Vence hoje", "Vence em 5 dias" ou a situação, se já pago. */
export function textoPrazo(t: { situacao: string; data_vencimento: string; tipo?: string }): string {
  if (t.situacao === 'pago' || t.situacao === 'cancelado') return (t.tipo === 'receber' ? ROTULO_SITUACAO_RECEBER : ROTULO_SITUACAO)[t.situacao];
  const d = diasAtraso(t.data_vencimento);
  if (d > 0) return d === 1 ? 'Vencido ontem' : `Vencido há ${d} dias`;
  if (d === 0) return 'Vence hoje';
  return d === -1 ? 'Vence amanhã' : `Vence em ${-d} dias`;
}

/** Linhas de detalhe de um título numa lista. */
export function linhasTitulo(t: Titulo): (string | null)[] {
  return [
    [um(t.pessoa)?.nome, t.documento ? `Doc. ${t.documento}` : null].filter(Boolean).join(' · ') || null,
    `${doBanco(t.data_vencimento)} · ${textoPrazo(t)}${t.total_parcelas > 1 ? ` · parcela ${t.parcela}/${t.total_parcelas}` : ''}`,
    [
      t.abertura ? 'Saldo de abertura (Patrimônio Líquido)' : null,
      t.previsto ? 'Valor previsto (conta contínua)' : null,
      t.situacao === 'parcial' ? `Já ${(t as any).tipo === 'receber' ? 'recebido' : 'pago'} ${formatarMoeda(Number(t.valor_pago))}` : null,
      t.agendado_para ? `Agendado para ${doBanco(t.agendado_para)}` : null,
      t.compra_id ? 'De compra' : null,
      t.venda_id ? 'De venda' : null,
      t.fech_colheita_id ? 'Fechamento da colheita' : t.vale_colheita_id ? 'Vale da colheita' : t.colheita_id ? 'Da colheita' : null,
      t.cafe_secagem_id ? 'Da secagem' : t.cafe_pilagem_id ? 'Da pilagem' : t.cafe_movimento_id ? 'Armazenagem de café' : null,
    ]
      .filter(Boolean)
      .join(' · ') || null,
  ];
}

/**
 * Encargos por atraso sobre o valor que está sendo pago: multa (% uma vez) e juros (% ao mês, proporcional aos dias).
 * Sem atraso ou sem percentuais no título, dá zero.
 */
export function encargosAtraso(principal: number, vencimento: string, pagamento: string, multaPerc: number | null | undefined, jurosMesPerc: number | null | undefined) {
  const dias = Math.max(0, diasEntre(vencimento, pagamento));
  if (!dias || principal <= 0) return { dias, multa: 0, juros: 0 };
  return {
    dias,
    multa: r2((principal * Number(multaPerc ?? 0)) / 100),
    juros: r2((principal * Number(jurosMesPerc ?? 0) * dias) / 100 / 30),
  };
}

/** "2026-10" -> "10/2026" */
export const textoCompetencia = (c: string | null | undefined) => (c && /^\d{4}-\d{2}$/.test(c) ? `${c.slice(5)}/${c.slice(0, 4)}` : '');

/** Primeiro e último dia do mês de uma data aaaa-mm-dd. */
export function limitesMes(iso: string): { inicio: string; fim: string } {
  const [a, m] = iso.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { inicio: `${a}-${mm}-01`, fim: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` };
}
/** Anda meses a partir de um dia 1º (aaaa-mm-01). */
export function somarMeses(iso: string, n: number): string {
  const [a, m] = iso.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
