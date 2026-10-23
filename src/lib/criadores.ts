import { consulta, supabase } from './supabase';
import type { ItemLista } from '../componentes/SeletorLista';

export type Criador = { id: string; nome: string; sui: string; sufixo: string | null; rgn_ultimo: number };

/** Criadores (pessoas com SUI) para escolher. */
export async function carregarCriadores(): Promise<ItemLista[]> {
  const d = await consulta<any[]>(supabase.from('pessoas').select('id, nome, sui, sufixo, rgn_ultimo, ativo').not('sui', 'is', null).order('nome'));
  return d.map((c) => ({ id: c.id, titulo: `${c.nome} (${c.sui})`, detalhe: `Próximo ${c.sui}${c.rgn_ultimo + 1}${c.sufixo ? ` • ${c.sufixo}` : ''}`, oculto: !c.ativo }));
}

export async function lerCriador(id: string): Promise<Criador | null> {
  const { data } = await supabase.from('pessoas').select('id, nome, sui, sufixo, rgn_ultimo').eq('id', id).maybeSingle();
  return (data as Criador) ?? null;
}

/** "CSC0001" */
/** "ABCD57": SUI + RGN, sem zeros à esquerda. */
export const brincoRegistro = (sui: string, rgn: number) => `${sui}${rgn}`;

/** Séries para escolher no animal: mostra o número completo que o próximo animal recebe (ex.: SCS1). */
export async function carregarSeries(): Promise<ItemLista[]> {
  const d = await consulta<any[]>(supabase.from('pessoas').select('id, nome, sui, sufixo, rgn_ultimo, ativo').not('sui', 'is', null).order('sui'));
  return d.map((c) => ({ id: c.id, titulo: `${c.sui}${c.rgn_ultimo + 1}`, detalhe: [`Série ${c.sui}`, c.sufixo].filter(Boolean).join(' • '), oculto: !c.ativo }));
}

/** Criador padrão para registrar: o da fazenda; se ela não tiver, o do produtor. */
export async function criadorPadrao(fazendaId?: string | null): Promise<string | null> {
  if (fazendaId) {
    const { data } = await supabase.from('fazendas').select('criador_id').eq('id', fazendaId).maybeSingle();
    if (data?.criador_id) return data.criador_id;
  }
  const { data: p } = await supabase.from('produtor').select('criador_id').maybeSingle();
  return (p as any)?.criador_id ?? null;
}
