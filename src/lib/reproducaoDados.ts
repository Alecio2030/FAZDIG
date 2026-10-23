// Leituras do banco usadas pelas telas de Reprodução.
import { consulta, supabase } from './supabase';
import { rotuloAnimal } from '../componentes/CampoAnimal';
import type { Evento, Genealogia } from './reproducao';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export const SELECT_EVENTO =
  '*, touro:animais!repro_eventos_touro_id_fkey ( numero_interno, brinco, nome, registro ),' +
  ' doadora:animais!repro_eventos_doadora_id_fkey ( numero_interno, brinco, nome, registro ),' +
  ' femea:animais!repro_eventos_animal_id_fkey ( numero_interno, brinco, nome, registro ),' +
  ' inseminador:pessoas ( nome ), iatf:repro_iatf ( numero, protocolo_nome )';

/** Linha do banco -> evento com os nomes prontos. */
export function paraEvento(x: any): Evento & Record<string, any> {
  const touro = um(x.touro);
  const iatf = um(x.iatf);
  return {
    ...x,
    touro: touro ? rotuloAnimal(touro) : x.touro_externo ?? null,
    doadoraNome: um(x.doadora) ? rotuloAnimal(um(x.doadora)) : null,
    femeaNome: um(x.femea) ? rotuloAnimal(um(x.femea)) : null,
    inseminador: um(x.inseminador)?.nome ?? null,
    iatfNumero: iatf?.numero ?? null,
    protocolo: iatf?.protocolo_nome ?? null,
    ecc: x.ecc != null ? Number(x.ecc) : null,
  };
}

export async function eventosDaFemea(animalId: string) {
  const d = await consulta<any[]>(supabase.from('repro_eventos').select(SELECT_EVENTO).eq('animal_id', animalId).order('data').order('created_at'));
  return d.map(paraEvento);
}

export async function eventosDaFazenda(fazendaId: string, desde?: string) {
  let q = supabase.from('repro_eventos').select(SELECT_EVENTO).eq('fazenda_id', fazendaId).order('data');
  if (desde) q = q.gte('data', desde);
  const d = await consulta<any[]>(q.limit(20000));
  return d.map(paraEvento);
}

/** Pai, mãe e avôs (quando estão no cadastro) para conferir parentesco. */
export async function genealogias(ids: string[]): Promise<Record<string, Genealogia>> {
  if (!ids.length) return {};
  const ler = (campos: string) => supabase.from('animais').select(campos).in('id', ids);
  // V127: bisavôs também (banco sem o arquivo da V127: lê sem eles)
  let r = await ler('id, pai_id, mae_id, avo_paterno, avo_materno, bisavo_mmp, bisavo_mpp, bisavo_pmp, bisavo_ppp, registro, brinco');
  if (r.error && /bisavo/i.test(r.error.message ?? '')) r = await ler('id, pai_id, mae_id, avo_paterno, avo_materno, registro, brinco');
  if (r.error) throw r.error;
  const a = (r.data ?? []) as any[];
  const pais = [...new Set(a.flatMap((x) => [x.pai_id, x.mae_id]).filter(Boolean))] as string[];
  const p = pais.length ? await consulta<any[]>(supabase.from('animais').select('id, pai_id').in('id', pais)) : [];
  const paiDe: Record<string, string | null> = Object.fromEntries(p.map((x) => [x.id, x.pai_id]));
  return Object.fromEntries(
    a.map((x) => [x.id, { ...x, paiDoPai: x.pai_id ? paiDe[x.pai_id] ?? null : null, paiDaMae: x.mae_id ? paiDe[x.mae_id] ?? null : null }]),
  );
}
