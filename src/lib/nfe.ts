// V157: chamadas à função "nfe" do servidor (emissão, consulta, cancelamento, DANFE e XML) e textos da nota.
import { supabase } from './supabase';

export type SituacaoNota = 'rascunho' | 'enviando' | 'autorizada' | 'rejeitada' | 'denegada' | 'cancelada';

export const TEXTO_SITUACAO: Record<SituacaoNota, string> = {
  rascunho: 'Não enviada',
  enviando: 'Pendente (sem resposta da Sefaz)',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada pela Sefaz',
  denegada: 'Denegada',
  cancelada: 'Cancelada',
};

export const FRETE = [
  { valor: '9', rotulo: 'Sem frete' },
  { valor: '0', rotulo: 'Por conta de quem vende' },
  { valor: '1', rotulo: 'Por conta de quem compra' },
  { valor: '2', rotulo: 'Por conta de terceiros' },
];

export const PAGAMENTO = [
  { valor: '17', rotulo: 'Pix' },
  { valor: '18', rotulo: 'Transferência' },
  { valor: '15', rotulo: 'Boleto' },
  { valor: '01', rotulo: 'Dinheiro' },
  { valor: '02', rotulo: 'Cheque' },
  { valor: '99', rotulo: 'Outros' },
];

export const CST_ICMS = [
  { valor: '51', rotulo: '51 Diferimento' },
  { valor: '00', rotulo: '00 Tributada' },
  { valor: '20', rotulo: '20 Com redução da base' },
  { valor: '40', rotulo: '40 Isenta' },
  { valor: '41', rotulo: '41 Não tributada' },
  { valor: '90', rotulo: '90 Outras' },
];
export const CSOSN = [
  { valor: '102', rotulo: '102 Sem crédito' },
  { valor: '300', rotulo: '300 Imune' },
  { valor: '400', rotulo: '400 Não tributada' },
];

/** Chama a função "nfe" e devolve os dados, ou { erro } com a mensagem que o servidor mandou. */
export async function chamarNfe<T = any>(corpo: Record<string, unknown>): Promise<(T & { erro?: undefined }) | { erro: string }> {
  const { data, error } = await supabase.functions.invoke('nfe', { body: corpo });
  if (error) {
    let msg = 'Não foi possível falar com o servidor agora. Tente de novo.';
    try {
      const j = await (error as any).context?.json();
      if (j?.erro) msg = j.erro;
    } catch {
      /* mantém a mensagem padrão */
    }
    return { erro: msg };
  }
  return data as T & { erro?: undefined };
}

/** Chave de acesso em grupos de 4 números, como no DANFE. */
export const chaveFormatada = (c?: string | null) => (c ?? '').replace(/(\d{4})/g, '$1 ').trim();
