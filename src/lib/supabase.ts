import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { SUPABASE_URL, SUPABASE_CHAVE } from '../config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renova o login só com o app aberto na tela.
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

// Traduz as mensagens de erro do Supabase para português claro.
/** Nomes das tabelas do banco como aparecem para quem usa (mensagens de "está sendo usado em ..."). */
const NOMES_TABELAS: Record<string, string> = {
  compras: 'compras', compra_itens: 'compras', compra_rateios: 'rateio de compras', vendas: 'vendas', venda_itens: 'vendas', venda_rateios: 'rateio de vendas',
  lancamentos: 'contas a pagar/receber', lancamento_rateios: 'rateio de contas a pagar/receber', baixas: 'pagamentos/recebimentos',
  financiamentos: 'financiamentos', financiamento_parcelas: 'financiamentos', estoque_movimentos: 'movimentos de estoque',
  imobilizados: 'imobilizado', imobilizado_rateios: 'rateio do imobilizado', animais: 'animais', lotes: 'lotes',
  movimentacoes: 'movimentações do rebanho', movimentacao_itens: 'movimentações do rebanho', pesagens: 'pesagens', pesagem_itens: 'pesagens',
  sanidade: 'sanidade', sanidade_itens: 'sanidade', reproducao: 'reprodução', repro_eventos: 'reprodução', dietas: 'dietas', dieta_itens: 'dietas',
  safras: 'safras', safra_talhoes: 'safras', atividades_agricolas: 'atividades', atividade_areas: 'atividades', atividade_insumos: 'atividades',
  atividade_operadores: 'atividades (pessoas)', colheitas: 'colheitas', pc_lotes: 'colheitas', pc_colhedores: 'colheitas (colhedores)',
  colheita_vales: 'vales da colheita', colheita_fechamento_itens: 'fechamentos da colheita', cafe_secagens: 'secagens', cafe_pilagens: 'pilagens',
  cafe_lotes: 'armazém de café', cafe_movimentos: 'armazém de café', cafe_contratos: 'contratos de café', adubacao_planos: 'planos de adubação',
  adubacao_parcelas: 'planos de adubação', monitoramentos: 'monitoramentos', frota_veiculos: 'frota', frota_abastecimentos: 'abastecimentos',
  frota_manutencoes: 'manutenções', frota_fretes: 'fretes', centros_custo: 'centros de custo', contas_bancarias: 'contas bancárias',
  fazendas: 'fazendas', produtor: 'cadastro do produtor', ferros: 'ferros', recorrencias: 'contas contínuas', tipos_lancamento: 'tipos de despesa e receita',
  plano_contas: 'plano de contas', pc_locais: 'locais de secagem/armazém',
};

export function traduzirErro(erro: unknown): string {
  const msg =
    typeof erro === 'string'
      ? erro
      : erro && typeof erro === 'object' && 'message' in erro
        ? String((erro as { message: unknown }).message)
        : '';
  const m = msg.toLowerCase();

  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed'))
    return 'Este e-mail ainda não foi confirmado. Abra o e-mail de confirmação e toque no link, depois tente entrar de novo.';
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Já existe uma conta com este e-mail. Volte e use "Entrar".';
  if (m.includes('password should be at least') || m.includes('weak password'))
    return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid email') || (m.includes('email address') && m.includes('invalid')))
    return 'E-mail inválido. Confira se digitou certo.';
  if (m.includes('not authorized') && m.includes('email'))
    return 'O envio de e-mail ainda não está liberado para este endereço. Falta configurar o envio de e-mails no Supabase (veja o LEIA-ME, V106).';
  if (m.includes('error sending') && m.includes('email'))
    return 'Não foi possível enviar o e-mail agora. Confira a configuração de envio de e-mails no Supabase (LEIA-ME, V106) e tente de novo.';
  if (m.includes('token has expired') || m.includes('otp_expired') || m.includes('invalid otp') || (m.includes('token') && m.includes('invalid')))
    return 'Código incorreto ou vencido. Confira os números ou peça um código novo.';
  if (m.includes('for security purposes') && m.includes('seconds'))
    return 'Você acabou de pedir um código. Aguarde 1 minuto e peça de novo.';
  if (m.includes('should be different from the old password')) return 'A senha nova é igual à anterior. Escolha outra.';
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.';
  if (m.includes('network request failed') || m.includes('fetch failed') || m.includes('failed to fetch'))
    return 'Sem conexão com a internet. Confira o sinal e tente de novo.';
  if (m.includes('violates foreign key constraint')) {
    // V149: diz ONDE está sendo usado (a última tabela citada na mensagem do banco)
    const tabs = [...msg.matchAll(/on table "([^"]+)"/g)].map((x) => x[1]);
    const onde = tabs.length > 1 ? NOMES_TABELAS[tabs[tabs.length - 1]] ?? tabs[tabs.length - 1].replace(/_/g, ' ') : null;
    return `Este cadastro já está sendo usado${onde ? ` em ${onde}` : ' em outros registros'} e não pode ser excluído. Exclua ou corrija esses lançamentos antes; se não for mais usar, marque como inativo.`;
  }
  if (m.includes('duplicate key value') || m.includes('unique constraint'))
    return 'Já existe um cadastro com esse nome.';
  if (m.includes('jwt expired')) return 'Sua sessão expirou. Saia e entre de novo.';
  if (m.includes('row-level security') || m.includes('permission denied'))
    return 'Você não tem permissão para fazer isso nesta fazenda.';
  if (msg) return msg; // mensagens do nosso banco já vêm em português
  return 'Algo deu errado. Tente de novo.';
}

/** Executa uma consulta e devolve os dados; se der erro, lança o erro. */
export async function consulta<T = any>(pedido: PromiseLike<{ data: any; error: any }>): Promise<T> {
  const { data, error } = await pedido;
  if (error) throw error;
  return data as T;
}
