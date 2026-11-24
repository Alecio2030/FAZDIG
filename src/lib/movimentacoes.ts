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

/** V205: venda de gado que fica na fazenda: a Entrada por parceria abre preenchida, um grupo por sexo e faixa. */
export type GrupoParceriaVenda = { cab: number; sexo: 'M' | 'F' | ''; faixa: string; racaId: string | null; ferroId: string | null; peso: number };
export type ParceriaDaVenda = { venda: number; pessoaId: string; data: string; grupos: GrupoParceriaVenda[]; parte?: number; partes?: number };

export const ENTRADAS: TipoMov[] = ['nascimento', 'compra', 'entrada_parceria'];
export const SAIDAS: TipoMov[] = ['venda', 'morte', 'saida_parceria'];

/** Quem é a pessoa em cada tipo (e o tipo dado a quem for cadastrado na hora). */
export const PESSOA_MOV: Partial<Record<TipoMov, { rotulo: string; tipoNovo: string }>> = {
  compra: { rotulo: 'Vendedor', tipoNovo: 'fornecedor' },
  venda: { rotulo: 'Cliente', tipoNovo: 'cliente' },
  entrada_parceria: { rotulo: 'Parceiro', tipoNovo: 'parceiro' },
  saida_parceria: { rotulo: 'Parceiro', tipoNovo: 'parceiro' },
};
