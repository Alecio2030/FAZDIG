import { supabase, traduzirErro } from './supabase';
import { perguntar } from './perguntar';

/**
 * V149 – Excluir na implantação.
 * Quando o lançamento já tem pagamento/recebimento, o banco pede para estornar antes.
 * Aqui o sistema oferece fazer as duas coisas de uma vez ("Estornar e excluir"): só o Produtor e o
 * Administrador conseguem (o banco confere); os outros recebem a explicação.
 *
 * campo: onde o título guarda a origem (compra_id, venda_id, financiamento_id, frete_id, colheita_id,
 * fech_colheita_id, vale_colheita_id, cafe_secagem_id, cafe_pilagem_id, cafe_movimento_id),
 * 'id' para o próprio título, ou 'movimentacao' para a entrada de animais comprados.
 */
export type CampoOrigem =
  | 'id'
  | 'compra_id'
  | 'venda_id'
  | 'financiamento_id'
  | 'frete_id'
  | 'colheita_id'
  | 'fech_colheita_id'
  | 'vale_colheita_id'
  | 'cafe_secagem_id'
  | 'cafe_pilagem_id'
  | 'cafe_movimento_id'
  | 'movimentacao';

/** A mensagem do banco é do tipo "já tem pagamento: estorne ... antes de excluir"? */
export function pedeEstorno(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('estorne') && (m.includes('pagamento') || m.includes('recebimento'));
}

type Resultado<T> = { data: T | null; erro: string | null };

/**
 * Roda a exclusão; se o banco recusar por causa de pagamento, pergunta se estorna e exclui.
 * Devolve erro = null quando excluiu.
 */
export async function excluirComEstorno<T = unknown>(
  excluir: () => PromiseLike<{ data: T | null; error: unknown }>,
  campo: CampoOrigem,
  id: string,
): Promise<Resultado<T>> {
  const r1 = await excluir();
  if (!r1.error) return { data: r1.data, erro: null };
  const msg = traduzirErro(r1.error);
  if (!pedeEstorno(msg)) return { data: null, erro: msg };

  const ok = await perguntar(
    'Já tem pagamento',
    `${msg}\n\nPosso estornar o pagamento e excluir tudo agora (o valor volta para o caixa/banco). Só o Produtor e o Administrador podem fazer isso.`,
    'Estornar e excluir',
    'Voltar',
  );
  if (!ok) return { data: null, erro: msg };

  const { error: e2 } = await supabase.rpc('estornar_pagamentos', { p_campo: campo, p_id: id });
  if (e2) return { data: null, erro: traduzirErro(e2) };
  const r2 = await excluir();
  if (r2.error) return { data: null, erro: traduzirErro(r2.error) };
  return { data: r2.data, erro: null };
}
