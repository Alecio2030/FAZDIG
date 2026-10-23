// Secagem e pilagem do café: formas de cobrança de terceiros e as contas de rendimento.
import { formatarQtd } from './formatos';

type Opcao = { valor: string; rotulo: string };

export const ONDE: Opcao[] = [
  { valor: 'proprio', rotulo: 'Própria' },
  { valor: 'terceiro', rotulo: 'De terceiro' },
];
export const COBRANCA_SECAGEM: Opcao[] = [
  { valor: 'saco_cereja', rotulo: 'R$ por saco de cereja' },
  { valor: 'percentual', rotulo: '% das sacas secas' },
  { valor: '', rotulo: 'Lançar depois' },
];
export const COBRANCA_PILAGEM: Opcao[] = [
  { valor: 'saca', rotulo: 'R$ por saca beneficiada' },
  { valor: 'percentual', rotulo: '% das sacas' },
  { valor: '', rotulo: 'Lançar depois' },
];

/** "12,5 sacas", "1 saca" */
export const textoSacas = (q: number | string | null | undefined, casas = 2) => `${formatarQtd(q, casas)} ${Number(q) === 1 ? 'saca' : 'sacas'}`;

/** Sacas secas que ficam com o produtor (tira as que pagaram o secador). */
export const sacasLiquidas = (s: { sacas_secas: any; sacas_pagas: any }) => Number(s.sacas_secas ?? 0) - Number(s.sacas_pagas ?? 0);

/** Custo de uma secagem ou pilagem: serviço de terceiro (em dinheiro ou em sacas valorizadas) mais o custo próprio informado. */
export const custoEtapa = (x: { valor_servico: any; custo_proprio: any }) => Number(x.valor_servico ?? 0) + Number(x.custo_proprio ?? 0);

/** Como a secagem ou a pilagem de terceiro foi cobrada, em texto. */
export function textoCobranca(x: any, moeda: (v: number) => string): string {
  if (x.onde !== 'terceiro') return 'Própria';
  if (x.cobranca === 'saco_cereja') return `${formatarQtd(x.sacos_cereja)} sacos de cereja × ${moeda(Number(x.preco))} = ${moeda(Number(x.valor_servico))}`;
  if (x.cobranca === 'saca') return `${moeda(Number(x.preco))} por saca beneficiada = ${moeda(Number(x.valor_servico))}`;
  if (x.cobranca === 'percentual')
    return `${formatarQtd(x.percentual)}% das sacas${Number(x.sacas_pagas) ? ` = ${textoSacas(x.sacas_pagas)} pagas em café${Number(x.valor_servico) ? ` (${moeda(Number(x.valor_servico))})` : ''}` : ''}`;
  return 'Sem valor lançado';
}

export const r2 = (x: number) => Math.round(x * 100) / 100;
export const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
