export const TIPOS_PESSOA = [
  { valor: 'cliente', rotulo: 'Cliente' },
  { valor: 'fornecedor', rotulo: 'Fornecedor' },
  { valor: 'funcionario', rotulo: 'Funcionário' },
  { valor: 'parceiro', rotulo: 'Parceiro' },
  { valor: 'criador', rotulo: 'Criador' },
  { valor: 'banco', rotulo: 'Banco' },
];
export const ROTULO_TIPO_PESSOA: Record<string, string> = Object.fromEntries(TIPOS_PESSOA.map((t) => [t.valor, t.rotulo]));
