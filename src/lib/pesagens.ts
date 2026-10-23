// Pesagem: objetivo, origem, destino, arroba bruta e ganho médio diário (GMD).

import { formatarNumero, numeroParaCampo } from './formatos';
export const ARROBA_PADRAO = 30;

export const OBJETIVOS = [
  { valor: 'compra', rotulo: 'Compra' },
  { valor: 'venda', rotulo: 'Venda' },
  { valor: 'parceria', rotulo: 'Parceria' },
  { valor: 'transferencia', rotulo: 'Transferência' },
  { valor: 'controle', rotulo: 'Controle' },
  { valor: 'outros', rotulo: 'Outras' },
];
export const ROTULO_OBJETIVO: Record<string, string> = Object.fromEntries(OBJETIVOS.map((o) => [o.valor, o.rotulo]));

export const TIPOS_ORIGEM = [
  { valor: 'propria', rotulo: 'Fazenda própria' },
  { valor: 'fornecedor', rotulo: 'Fornecedor' },
  { valor: 'parceiro', rotulo: 'Parceiro' },
  { valor: 'outros', rotulo: 'Outros' },
];
export const TIPOS_DESTINO = [
  { valor: 'propria', rotulo: 'Fazenda própria' },
  { valor: 'cliente', rotulo: 'Cliente' },
  { valor: 'parceiro', rotulo: 'Parceiro' },
  { valor: 'outros', rotulo: 'Outros' },
];

/** Origem e destino mais comuns para cada objetivo (dá para trocar). */
export const PADRAO_OBJETIVO: Record<string, { origem: string; destino: string }> = {
  compra: { origem: 'fornecedor', destino: 'propria' },
  venda: { origem: 'propria', destino: 'cliente' },
  parceria: { origem: 'parceiro', destino: 'propria' },
  transferencia: { origem: 'propria', destino: 'propria' },
  controle: { origem: 'propria', destino: 'propria' },
  outros: { origem: 'propria', destino: 'outros' },
};

/** Tipo de pessoa dado a quem for cadastrado na hora, em cada papel. */
export const TIPO_PESSOA_NOVA: Record<string, string> = { fornecedor: 'fornecedor', cliente: 'cliente', parceiro: 'parceiro' };

/** Dias entre duas datas aaaa-mm-dd. */
export function diasEntre(deIso: string, ateIso: string): number {
  const [a1, m1, d1] = deIso.split('-').map(Number);
  const [a2, m2, d2] = ateIso.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** Ganho médio diário em kg/dia, ou null se não der para calcular. */
export function gmd(pesoAntes: number, dataAntes: string, pesoAgora: number, dataAgora: string): number | null {
  const dias = diasEntre(dataAntes, dataAgora);
  if (dias <= 0) return null;
  return (pesoAgora - pesoAntes) / dias;
}

/** "+0,85 kg/dia" */
export function textoGmd(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  const sinal = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sinal}${formatarNumero(Math.abs(v), 2)} kg/dia`;
}

/** Quantidade de arrobas: peso bruto ÷ peso da arroba bruta. */
export const arrobas = (kg: number, pesoArroba = ARROBA_PADRAO) => (pesoArroba > 0 ? kg / pesoArroba : 0);

/** "Fornecedor: Fulano", "Fazenda própria: Constantino", "Outros: leilão X" */
export function textoLado(tipo: string | null, rotulos: { valor: string; rotulo: string }[], nomeFazenda?: string | null, nomePessoa?: string | null, texto?: string | null): string | null {
  if (!tipo) return null;
  const r = rotulos.find((x) => x.valor === tipo)?.rotulo ?? tipo;
  const quem = tipo === 'propria' ? nomeFazenda : tipo === 'outros' ? texto : [nomePessoa, texto ? `fazenda ${texto}` : null].filter(Boolean).join(', ');
  return quem ? `${r}: ${quem}` : r;
}
