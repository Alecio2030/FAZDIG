import React, { useCallback } from 'react';
import CampoBuscaRapida, { type ItemRapido } from './CampoBuscaRapida';
import { consulta, supabase } from '../lib/supabase';

type Props = { rotulo?: string; valorId: string | null; aoMudar: (id: string | null) => void; erro?: string | null };

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Raça: digita, consulta as cadastradas ou cadastra na hora. */
export function CampoRaca({ rotulo = 'Raça', valorId, aoMudar, erro }: Props) {
  const buscar = useCallback(async (t: string): Promise<ItemRapido[]> => {
    let q = supabase.from('racas').select('id, nome').order('nome').limit(100);
    if (t) q = q.ilike('nome', `%${t}%`);
    const d = await consulta<any[]>(q);
    return d.map((r) => ({ id: r.id, titulo: r.nome }));
  }, []);
  const lerNome = useCallback(async (id: string) => (await supabase.from('racas').select('nome').eq('id', id).maybeSingle()).data?.nome ?? null, []);
  const criar = useCallback(async (nome: string): Promise<ItemRapido> => {
    const d = await consulta<any>(supabase.from('racas').insert({ nome }).select('id, nome').single());
    return { id: d.id, titulo: d.nome };
  }, []);
  return (
    <CampoBuscaRapida
      rotulo={rotulo}
      valorId={valorId}
      aoMudar={aoMudar}
      buscar={buscar}
      lerNome={lerNome}
      criar={criar}
      rotuloNovo="nova raça"
      placeholder="Ex.: Nelore (digite para buscar ou cadastrar)"
      erro={erro}
    />
  );
}

/** Ferro: digita, consulta os cadastrados ou cadastra na hora (como ferro de terceiro; ajuste depois em Pecuário › Ferros). */
export function CampoFerro({ rotulo = 'Ferro', valorId, aoMudar, erro }: Props) {
  const buscar = useCallback(async (t: string): Promise<ItemRapido[]> => {
    let q = supabase.from('ferros').select('id, descricao, proprio, pessoas ( nome )').order('proprio', { ascending: false }).order('descricao').limit(100);
    if (t) q = q.ilike('descricao', `%${t}%`);
    const d = await consulta<any[]>(q);
    return d.map((x) => ({ id: x.id, titulo: x.descricao, detalhe: x.proprio ? 'Ferro próprio' : um(x.pessoas)?.nome ? `De ${um(x.pessoas).nome}` : 'De terceiro' }));
  }, []);
  const lerNome = useCallback(async (id: string) => (await supabase.from('ferros').select('descricao').eq('id', id).maybeSingle()).data?.descricao ?? null, []);
  const criar = useCallback(async (descricao: string): Promise<ItemRapido> => {
    const d = await consulta<any>(supabase.from('ferros').insert({ descricao, proprio: false }).select('id, descricao').single());
    return { id: d.id, titulo: d.descricao, detalhe: 'De terceiro' };
  }, []);
  return (
    <CampoBuscaRapida
      rotulo={rotulo}
      valorId={valorId}
      aoMudar={aoMudar}
      buscar={buscar}
      lerNome={lerNome}
      criar={criar}
      rotuloNovo="novo ferro (de terceiro)"
      icone="flame"
      placeholder="Descrição do ferro (digite para buscar ou cadastrar)"
      erro={erro}
    />
  );
}
