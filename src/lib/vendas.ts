// Vendas: a conta da venda de animais (a mesma do banco, em salvar_venda) e textos das telas.

export type FormaPreco = 'arroba' | 'kg' | 'cabeca';

/** Arredonda para centavos (ou 2 casas). */
export const r2v = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export const textoFormaPreco = (f: FormaPreco | string | null | undefined) => (f === 'arroba' ? 'arroba' : f === 'kg' ? 'kg vivo' : 'cabeça');

/**
 * Conta da venda de animais:
 * - desconto de barriga: % do peso bruto, ou kg por cabeça;
 * - por arroba: peso (já sem a barriga) ÷ kg da arroba = arrobas (2 casas) × preço;
 *   30 kg = boi em pé a 50% de rendimento (15 kg de carcaça); mais de 30 (ex.: 31,45) já embute desconto;
 * - por kg vivo: peso (já sem a barriga) × preço;
 * - por cabeça: cabeças × preço.
 */
export function calcularVendaAnimais(x: { cabecas: number; pesoBruto: number; forma: FormaPreco; kgArroba: number; barrigaTipo: 'perc' | 'kg_cab' | null; barrigaValor: number; preco: number }) {
  const bruto = x.pesoBruto > 0 ? x.pesoBruto : 0;
  const temBarriga = !!x.barrigaTipo && x.barrigaValor > 0 && bruto > 0;
  const pesoLiquido = !temBarriga ? bruto : x.barrigaTipo === 'perc' ? r2v(bruto * (1 - x.barrigaValor / 100)) : r2v(bruto - x.barrigaValor * x.cabecas);
  const kgArroba = x.kgArroba > 0 ? x.kgArroba : 30;
  const arrobas = pesoLiquido > 0 ? r2v(pesoLiquido / kgArroba) : 0;
  const valor = x.preco > 0 ? (x.forma === 'arroba' ? r2v(arrobas * x.preco) : x.forma === 'kg' ? r2v(Math.max(0, pesoLiquido) * x.preco) : r2v(x.cabecas * x.preco)) : 0;
  return { barrigaKg: temBarriga ? r2v(bruto - pesoLiquido) : 0, pesoLiquido, arrobas, valor };
}
