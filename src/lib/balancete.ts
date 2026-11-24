// V173: Balancete e soma dos centros de custo (contas de grau 3) nas abas.
// Regime de competência, pelo banco (balancete_resultado e movimentos_resultado):
// títulos pela data de emissão, Atividades, abastecimentos e sanidade pela data do consumo,
// juros, multas e descontos pela data da baixa. Só Receitas (3) e Custos e despesas (4).
import { supabase, traduzirErro } from './supabase';
import { hojeBanco } from './datas';
import { somarMeses } from './financiamentos';
import { ADM, CODIGO_ADM, idsRelatorio } from './unidades';
import type { Opcao } from '../componentes/Escolha';

export type ContaBalancete = { codigo: string; nome: string; grau: number; analitica: boolean; valor: number; qtde: number };
export type Movimento = {
  data: string;
  conta_id: string;
  conta_codigo: string;
  valor: number;
  origem: string;
  origem_id: string | null;
  documento: string | null;
  historico: string | null;
  pessoa: string | null;
  centro: string | null;
};

export const r2 = (x: number) => Math.round(x * 100) / 100;

const ultimoDia = (am: string) => {
  const [a, m] = am.split('-').map(Number);
  return `${am}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

export const OPCOES_PERIODO: Opcao[] = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'anterior', rotulo: 'Mês passado' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: '12meses', rotulo: '12 meses' },
  { valor: 'tudo', rotulo: 'Desde o início' },
  { valor: 'outro', rotulo: 'Outro' },
];

/** Datas do período escolhido (formato do banco). "outro" fica por conta da tela. */
export function periodoDe(p: string): { de: string; ate: string } {
  const hoje = hojeBanco();
  const mes = hoje.slice(0, 7);
  if (p === 'anterior') {
    const ant = somarMeses(`${mes}-01`, -1).slice(0, 7);
    return { de: `${ant}-01`, ate: ultimoDia(ant) };
  }
  if (p === 'ano') return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
  if (p === '12meses') return { de: somarMeses(`${mes}-01`, -11), ate: hoje };
  if (p === 'tudo') return { de: '2000-01-01', ate: '2100-12-31' };
  return { de: `${mes}-01`, ate: ultimoDia(mes) };
}

/** Ids que o banco entende para a unidade em uso (o Administrativo vai pelo código da sede). */
export const idsDaUnidade = (fazendaId: string | null | undefined, modoAdm: boolean): string[] => (modoAdm || !fazendaId ? [CODIGO_ADM] : [fazendaId]);

/** Saldos das contas de resultado até o grau pedido (3 = sintético, 4 = analítico). */
export async function carregarBalancete(ids: string[], de: string, ate: string, grau: 3 | 4): Promise<ContaBalancete[]> {
  const { data, error } = await supabase.rpc('balancete_resultado', { p_fazendas: ids, p_de: de, p_ate: ate, p_grau: grau });
  if (error) {
    if (/balancete_resultado/i.test(error.message ?? '')) throw new Error('O banco ainda não tem a atualização da V173 (balancete). Me avise.');
    throw new Error(traduzirErro(error));
  }
  return ((data ?? []) as any[]).map((c) => ({ ...c, valor: Number(c.valor), qtde: Number(c.qtde), grau: Number(c.grau) }));
}

/** V176: saldos das contas patrimoniais (Ativo, Passivo e PL) do Grupo na data. */
export async function carregarPatrimonial(ate: string): Promise<ContaBalancete[]> {
  const { data, error } = await supabase.rpc('balancete_patrimonial', { p_ate: ate });
  if (error) {
    if (/balancete_patrimonial/i.test(error.message ?? '')) throw new Error('O banco ainda não tem a atualização da V176 (contas patrimoniais). Me avise.');
    throw new Error(traduzirErro(error));
  }
  return ((data ?? []) as any[]).map((c) => ({ codigo: c.codigo, nome: c.nome, grau: Number(c.grau), analitica: Number(c.grau) >= 4, valor: Number(c.valor), qtde: 0 }));
}

/** Lançamentos de uma conta (e das que estão dentro dela) no período. */
export async function carregarMovimentos(codigo: string, de: string, ate: string): Promise<Movimento[]> {
  const { data, error } = await supabase.rpc('movimentos_resultado', { p_prefixos: [codigo.slice(0, 1)], p_de: de, p_ate: ate, p_conta: codigo });
  if (error) throw new Error(traduzirErro(error));
  return ((data ?? []) as any[]).map((m) => ({ ...m, valor: Number(m.valor) }));
}

/** V177: linha da razão de uma conta patrimonial. valor: débito positivo, crédito negativo. */
export type LinhaRazao = {
  anterior: boolean;
  data: string;
  conta_codigo: string;
  valor: number;
  origem: string | null;
  origem_id: string | null;
  documento: string | null;
  historico: string | null;
  pessoa: string | null;
};

/** Ativo é de natureza devedora; Passivo e PL, credora (o saldo aparece positivo como no balancete). */
export const natureza = (codigo: string): 'D' | 'C' => (codigo.startsWith('1') ? 'D' : 'C');

/** V177: razão de uma conta patrimonial (e das que estão dentro dela): saldo anterior + lançamentos do período. */
export async function carregarRazaoPatrimonial(codigo: string, de: string, ate: string): Promise<LinhaRazao[]> {
  const { data, error } = await supabase.rpc('razao_patrimonial', { p_conta: codigo, p_de: de, p_ate: ate });
  if (error) {
    if (/razao_patrimonial/i.test(error.message ?? '')) throw new Error('O banco ainda não tem a atualização da V177 (razão das contas patrimoniais). Me avise.');
    throw new Error(traduzirErro(error));
  }
  return ((data ?? []) as any[]).map((m) => ({ ...m, valor: Number(m.valor) }));
}

/** V177: tela que abre a origem de uma linha da razão (quando há uma). */
export function destinoDaRazao(l: LinhaRazao): { rota: string; params: Record<string, string> } | null {
  if (!l.origem_id || !l.origem) return null;
  const origem = l.origem.startsWith('resultado:') ? l.origem.slice(10) : l.origem;
  if (origem === 'compra') return { rota: 'CompraDetalhe', params: { id: l.origem_id } };
  if (origem === 'venda') return { rota: 'VendaDetalhe', params: { id: l.origem_id } };
  if (origem === 'imobilizado') return { rota: 'ImobilizadoDetalhe', params: { id: l.origem_id } };
  if (origem === 'financiamento') return { rota: 'FinanciamentoForm', params: { abrirId: l.origem_id } };
  const r = rotaDaOrigem({ origem, origem_id: l.origem_id } as Movimento);
  return r ? { rota: r.rota, params: { id: r.id } } : null;
}

/** Escolha "De quem" do Balancete -> ids do banco. */
export const idsEscolha = (valor: string, fazendas: { id: string; nome: string; tipo?: string }[]) =>
  valor === ADM ? [CODIGO_ADM] : idsRelatorio(valor, fazendas.filter((f) => f.tipo !== 'particular'));

/** Grupo de grau 3 que cada aba mostra (pelo final do código: 4.01.01 = Agrícola, 4.01.02 = Pecuária). */
export const GRAU3_DA_ABA: Record<string, string[] | null> = {
  agricola: ['01'],
  pecuario: ['02'],
  financeiro: null, // todos os grupos de grau 3 da unidade
};

/** Tela que abre o lançamento de origem (quando há uma). */
export function rotaDaOrigem(m: Movimento): { rota: 'TituloDetalhe' | 'AtividadeDetalhe' | 'SanidadeDetalhe' | 'ImobilizadoDetalhe' | 'TratoDia'; id: string } | null {
  if (!m.origem_id) return null;
  if (m.origem === 'titulo') return { rota: 'TituloDetalhe', id: m.origem_id };
  if (m.origem === 'atividade') return { rota: 'AtividadeDetalhe', id: m.origem_id };
  if (m.origem === 'sanidade') return { rota: 'SanidadeDetalhe', id: m.origem_id };
  // V174: depreciação e exaustão do mês abrem o bem
  if (m.origem === 'depreciacao') return { rota: 'ImobilizadoDetalhe', id: m.origem_id };
  // V175: trato do lote abre o dia do trato
  if (m.origem === 'fornecimento') return { rota: 'TratoDia', id: m.origem_id };
  return null;
}
