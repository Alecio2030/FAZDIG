// Classificação automática dos lançamentos.
// O plano de contas fica nos bastidores: quem opera escolhe, no máximo, o TIPO do lançamento,
// em linguagem do dia a dia (Energia elétrica, Seguros, Arrendamento...). A conta do plano vem
// da tabela tipos_lancamento. O que nasce de uma tela própria (compra de produto, venda, colheita,
// secagem...) é classificado pelo banco, sozinho, pela origem.
import { consulta, supabase } from './supabase';
import type { ItemLista } from '../componentes/SeletorLista';

/** despesa: Compras › Despesa e Contas a pagar · pagar: só Contas a pagar · receber: Contas a receber · sistema: definido pela tela de origem */
export type UsoTipo = 'despesa' | 'pagar' | 'receber' | 'sistema';
export type TipoLancamento = { chave: string; nome: string; uso: UsoTipo; conta_id: string; ordem: number };

let guardados: TipoLancamento[] | null = null;

/** Todos os tipos ativos (lidos uma vez por sessão do app). */
export async function tiposLancamento(recarregar = false): Promise<TipoLancamento[]> {
  if (guardados && !recarregar) return guardados;
  guardados = await consulta<TipoLancamento[]>(supabase.from('tipos_lancamento').select('chave, nome, uso, conta_id, ordem').eq('ativo', true).order('ordem').order('nome'));
  return guardados;
}

/** Lista de tipos para escolher em Compras › Despesa (o id é a chave do tipo). */
export async function listaTiposDespesa(): Promise<ItemLista[]> {
  return (await tiposLancamento()).filter((t) => t.uso === 'despesa').map((t) => ({ id: t.chave, titulo: t.nome }));
}

/**
 * Lista de tipos para um título lançado à mão em Contas a pagar ou a receber.
 * O id é a CONTA do plano (é ela que o título guarda): a pessoa só vê o nome do tipo.
 */
export async function listaTiposTitulo(tipo: 'pagar' | 'receber'): Promise<ItemLista[]> {
  const usos: UsoTipo[] = tipo === 'receber' ? ['receber'] : ['despesa', 'pagar'];
  const vistos = new Set<string>();
  return (await tiposLancamento())
    .filter((t) => usos.includes(t.uso))
    .filter((t) => (vistos.has(t.conta_id) ? false : (vistos.add(t.conta_id), true)))
    .map((t) => ({ id: t.conta_id, titulo: t.nome, detalhe: t.uso === 'pagar' ? 'Não é despesa: financiamento, adiantamento ou retirada' : null }));
}

/** Nome do tipo (dia a dia) de uma conta do plano; sem tipo, devolve null e a tela mostra o nome da conta. */
export async function nomeDoTipo(contaId: string | null | undefined, preferir: UsoTipo[] = ['despesa', 'pagar', 'receber', 'sistema']): Promise<string | null> {
  if (!contaId) return null;
  const ts = (await tiposLancamento()).filter((t) => t.conta_id === contaId);
  for (const u of preferir) {
    const t = ts.find((x) => x.uso === u);
    if (t) return t.nome;
  }
  return null;
}
