import React, { useCallback } from 'react';
import CampoBuscaRapida, { type ItemRapido } from './CampoBuscaRapida';
import { useSessao } from '../contexto/SessaoContext';
import { consulta, supabase } from '../lib/supabase';
import { identAnimal } from '../lib/rebanho';
import { normalizarRegistro } from '../lib/genealogia';

type Props = {
  rotulo: string;
  valorId: string | null;
  aoMudar: (id: string | null) => void;
  sexo?: 'M' | 'F';
  erro?: string | null;
};

/** Nome do animal para mostrar: registro ou nº/brinco, e o nome. */
export function rotuloAnimal(a: { registro?: string | null; numero_interno?: number | null; brinco?: string | null; nome?: string | null } | null | undefined): string {
  if (!a) return '';
  const id = a.registro || identAnimal(a);
  return a.nome ? `${id} – ${a.nome}` : id;
}

/** Escolher um animal do rebanho ativo pelo número, brinco, nome ou registro. */
export default function CampoAnimal({ rotulo, valorId, aoMudar, sexo, erro }: Props) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const buscar = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      let q = supabase.from('animais').select('id, numero_interno, brinco, nome, registro, categoria').eq('fazenda_id', fid!).eq('situacao', 'ativo').order('numero_interno').limit(60);
      if (sexo) q = q.eq('sexo', sexo);
      if (t) {
        const partes = [`brinco.ilike.*${t}*`, `nome.ilike.*${t}*`, `registro.ilike.*${t}*`];
        const norm = normalizarRegistro(t);
        if (norm && norm !== t.toUpperCase()) partes.push(`registro.ilike.*${norm}*`, `brinco.ilike.*${norm}*`);
        if (/^\d+$/.test(t)) partes.unshift(`numero_interno.eq.${t}`);
        q = q.or(partes.join(','));
      }
      const d = await consulta<any[]>(q);
      return d.map((a) => ({ id: a.id, titulo: rotuloAnimal(a), detalhe: a.categoria }));
    },
    [fid, sexo],
  );
  const lerNome = useCallback(async (id: string) => {
    const { data } = await supabase.from('animais').select('numero_interno, brinco, nome, registro').eq('id', id).maybeSingle();
    return data ? rotuloAnimal(data) : null;
  }, []);

  return <CampoBuscaRapida rotulo={rotulo} valorId={valorId} aoMudar={aoMudar} buscar={buscar} lerNome={lerNome} icone="paw" placeholder="Nº, brinco, nome ou registro" erro={erro} />;
}
