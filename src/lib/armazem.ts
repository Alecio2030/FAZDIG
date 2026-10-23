// Armazém de café: lotes de café beneficiado, classificação e saldo por armazém.
import { formatarQtd } from './formatos';

type Opcao = { valor: string; rotulo: string };

export const ESPECIES_CAFE: Opcao[] = ['Conilon', 'Arábica', 'Robusta'].map((e) => ({ valor: e, rotulo: e }));
/** Tipos mais comuns pela tabela de defeitos (o campo aceita digitar outro). */
export const TIPOS_CAFE = ['6', '6/7', '7', '7/8', '8'];
export const TIPOS_MOVIMENTO: Opcao[] = [
  { valor: 'transferencia', rotulo: 'Transferir' },
  { valor: 'quebra', rotulo: 'Quebra' },
  { valor: 'taxa', rotulo: 'Taxa de armazenagem' },
  { valor: 'ajuste', rotulo: 'Ajuste' },
];
export const ROTULO_MOVIMENTO: Record<string, string> = { entrada: 'Entrada', transferencia: 'Transferência', quebra: 'Quebra', ajuste: 'Ajuste', taxa: 'Taxa de armazenagem', venda: 'Venda' };

export const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
export const r2 = (x: number) => Math.round(x * 100) / 100;

/** "Conilon · tipo 7 · peneira 13 acima · 12,5% de umidade" (só o que estiver informado). */
export function textoClassificacao(l: any): string {
  return [
    l.especie,
    l.tipo ? `tipo ${l.tipo}` : null,
    l.peneira ? `peneira ${l.peneira}` : null,
    l.umidade != null ? `${formatarQtd(l.umidade)}% de umidade` : null,
    l.bebida ? `bebida ${l.bebida}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
/** Rótulo curto do tipo de café, para agrupar o estoque. */
export const rotuloTipo = (l: any) => [l.especie ?? 'Café', l.tipo ? `tipo ${l.tipo}` : 'sem classificação', l.peneira ? `pen. ${l.peneira}` : null].filter(Boolean).join(' · ');

export const ePropio = (local: any) => local?.tipo !== 'armazem_terceiro';
export const nomeLocal = (local: any) => (local ? `${local.nome}${local.tipo === 'armazem_terceiro' ? ' (terceiro)' : ''}` : '');

export type Posicao = { chave: string; loteId: string; localId: string; numero: number; lote: any; local: any; saldo: number };

/** Saldo de cada lote em cada armazém, a partir dos movimentos (com lote e local embutidos). Só o que tem saldo. */
export function posicoes(movs: any[]): Posicao[] {
  const m: Record<string, Posicao> = {};
  for (const x of movs) {
    const k = `${x.lote_id}|${x.local_id}`;
    m[k] ??= { chave: k, loteId: x.lote_id, localId: x.local_id, numero: um(x.lote)?.numero ?? 0, lote: um(x.lote), local: um(x.local), saldo: 0 };
    m[k].saldo += Number(x.sacas);
  }
  return Object.values(m)
    .map((p) => ({ ...p, saldo: r2(p.saldo) }))
    .filter((p) => p.saldo > 0.005)
    .sort((a, b) => (a.local?.nome ?? '').localeCompare(b.local?.nome ?? '') || a.numero - b.numero);
}
export const CAMPOS_POSICAO = 'lote_id, local_id, sacas, lote:cafe_lotes ( numero, especie, tipo, peneira, umidade, bebida, data_entrada ), local:pc_locais ( nome, tipo, pessoa_id )';
