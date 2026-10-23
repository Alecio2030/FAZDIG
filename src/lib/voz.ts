// Lançamento por voz: a pessoa dita (microfone do teclado), a IA entende no servidor e a tela abre preenchida para conferência.
// Nunca grava nada: quem grava é o botão da própria tela.
import { supabase } from './supabase';
import { hojeBanco } from './datas';

/** Item de cadastro mandado para a IA: ela devolve só o número (n), nunca inventa um cadastro. */
export type ItemVoz = { n: number; nome: string; extra?: string };

export type ContextoVozAtividade = {
  tipos: { valor: string; rotulo: string; subtipos?: string[] }[];
  locais: ItemVoz[];
  produtos: ItemVoz[];
  maquinas: ItemVoz[];
  implementos: ItemVoz[];
  pessoas: ItemVoz[];
};

/** O que a IA entendeu da fala de uma atividade agrícola. */
export type VozAtividade = {
  entendido?: boolean;
  tipo?: string | null;
  subtipo?: string | null;
  alvo?: string | null;
  lamina_mm?: number | null;
  data?: string | null;
  todos_talhoes?: boolean;
  locais?: { n: number; ha?: number | null }[];
  produtos?: { n?: number | null; falado?: string; dose?: number | null; unidade?: string | null; por?: string | null }[];
  hora_inicio?: string | null;
  hora_fim?: string | null;
  horas_maquina?: number | null;
  maquina?: number | null;
  implemento?: number | null;
  pessoas?: number[];
  observacoes?: string | null;
  nao_achado?: string[];
};

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Numera uma lista para mandar à IA (1, 2, 3...). O item de volta é lista[n - 1]. */
export function numerar<T>(lista: T[], nome: (x: T) => string, extra?: (x: T) => string | undefined): ItemVoz[] {
  return lista.map((x, i) => {
    const e = extra?.(x);
    return e ? { n: i + 1, nome: nome(x), extra: e } : { n: i + 1, nome: nome(x) };
  });
}

/** Item da lista pelo número devolvido pela IA (null se o número não existir). */
export function pegar<T>(lista: T[], n: unknown): T | null {
  const i = Number(n);
  return Number.isInteger(i) && i >= 1 && i <= lista.length ? lista[i - 1] : null;
}

/** Manda a fala para a função interpretar-voz. `tela` diz qual lançamento é (por enquanto, 'atividade'). */
export async function interpretarVoz<T>(tela: 'atividade', texto: string, contexto: unknown): Promise<{ dados: T } | { erro: string }> {
  const { data: d, error } = await supabase.functions.invoke('interpretar-voz', {
    body: { tela, texto, hoje: hojeBanco(), dia_semana: DIAS[new Date().getDay()], contexto },
  });
  if (error) {
    let msg = 'Não foi possível interpretar a fala agora. Confira a internet e tente de novo.';
    try {
      const j = await (error as any).context?.json();
      if (j?.erro) msg = j.erro;
    } catch {
      /* mantém a mensagem padrão */
    }
    return { erro: msg };
  }
  if (!d?.dados) return { erro: d?.erro ?? 'Não entendi a fala. Tente de novo.' };
  return { dados: d.dados as T };
}
