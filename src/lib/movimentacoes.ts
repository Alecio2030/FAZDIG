// Tipos de movimentação do rebanho e textos usados nas telas.

export type TipoMov =
  | 'nascimento' | 'compra' | 'entrada_parceria'
  | 'venda' | 'morte' | 'saida_parceria'
  | 'transferencia_lote' | 'transferencia_manga';

export const GRUPOS_MOV: { titulo: string; tipos: { valor: TipoMov; rotulo: string }[] }[] = [
  { titulo: 'Entradas', tipos: [
    { valor: 'nascimento', rotulo: 'Nascimento' },
    { valor: 'compra', rotulo: 'Compra' },
    { valor: 'entrada_parceria', rotulo: 'Entrada parceria' },
  ] },
  { titulo: 'Saídas', tipos: [
    { valor: 'venda', rotulo: 'Venda' },
    { valor: 'morte', rotulo: 'Morte' },
    { valor: 'saida_parceria', rotulo: 'Saída parceria' },
  ] },
  { titulo: 'Transferências', tipos: [
    { valor: 'transferencia_lote', rotulo: 'Troca de lote' },
    { valor: 'transferencia_manga', rotulo: 'Troca de manga' },
  ] },
];

export const ROTULO_MOV: Record<string, string> = {
  ...Object.fromEntries(GRUPOS_MOV.flatMap((g) => g.tipos.map((t) => [t.valor, t.rotulo]))),
  // V152: lançadas por Mais › Transferências (gado entre fazendas); desfazem-se por lá
  transferencia_saida: 'Saída p/ outra fazenda',
  transferencia_entrada: 'Entrada de outra fazenda',
};

export const ENTRADAS: TipoMov[] = ['nascimento', 'compra', 'entrada_parceria'];
export const SAIDAS: TipoMov[] = ['venda', 'morte', 'saida_parceria'];

/** Quem é a pessoa em cada tipo (e o tipo dado a quem for cadastrado na hora). */
export const PESSOA_MOV: Partial<Record<TipoMov, { rotulo: string; tipoNovo: string }>> = {
  compra: { rotulo: 'Vendedor', tipoNovo: 'fornecedor' },
  venda: { rotulo: 'Cliente', tipoNovo: 'cliente' },
  entrada_parceria: { rotulo: 'Parceiro', tipoNovo: 'parceiro' },
  saida_parceria: { rotulo: 'Parceiro', tipoNovo: 'parceiro' },
};
