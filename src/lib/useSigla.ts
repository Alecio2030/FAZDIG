import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Sigla de 2 letras da fazenda, usada no código dos lotes (ex.: FC 001).
const cache: Record<string, string | null> = {};
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((o) => o());

export function useSigla(fazendaId?: string | null) {
  const [, forcar] = useState(0);

  useEffect(() => {
    const ouvir = () => forcar((x) => x + 1);
    ouvintes.add(ouvir);
    return () => {
      ouvintes.delete(ouvir);
    };
  }, []);

  useEffect(() => {
    if (!fazendaId || fazendaId in cache) return;
    supabase
      .from('fazendas')
      .select('sigla')
      .eq('id', fazendaId)
      .single()
      .then(({ data }) => {
        cache[fazendaId] = data?.sigla ?? null;
        avisar();
      });
  }, [fazendaId]);

  return {
    sigla: fazendaId ? cache[fazendaId] ?? null : null,
    carregada: !!fazendaId && fazendaId in cache,
  };
}

export async function salvarSigla(fazendaId: string, sigla: string) {
  const { error } = await supabase.from('fazendas').update({ sigla }).eq('id', fazendaId);
  if (error) throw error;
  cache[fazendaId] = sigla;
  avisar();
}

/** Sugestão pelas iniciais: "Fazenda Cachoeira" -> "FC" */
export function sugerirSigla(nome: string): string {
  const palavras = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(p));
  if (palavras.length >= 2) return palavras[0][0] + palavras[1][0];
  return (palavras[0] ?? 'FZ').slice(0, 2).padEnd(2, 'X');
}

/** Atualiza a sigla guardada no aparelho depois de salvar a fazenda por outra tela. */
export function lembrarSigla(fazendaId: string, sigla: string | null) {
  cache[fazendaId] = sigla;
  avisar();
}
