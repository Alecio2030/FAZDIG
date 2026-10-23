// Plano de contas: máscara 9.9.99.999 (4 graus, V142). Grau 2 nas Receitas e Custos = fazenda (3.1 e 4.1 = a mesma),
// grau 3 = centro de custo, com o mesmo número dos dois lados (V143: .01 Agrícola, .02 Pecuária (uma só), .05 operacionais, .07 financeiras), grau 4 = conta onde os valores são alocados. É a estrutura de referência, nos bastidores:
// ninguém escolhe conta nas telas. O sistema classifica pela origem do lançamento (lib/classificacao.ts).
import * as cod from './codigos';

export const MASCARA_CONTAS: cod.Mascara = [1, 1, 2, 3];
export const NIVEL_MAXIMO = MASCARA_CONTAS.length;
export { nivelDe, semAcento } from './codigos';

export type TipoConta = 'ativo' | 'passivo' | 'patrimonio_liquido' | 'receita' | 'despesa';

export const TIPOS_CONTA: { valor: TipoConta; rotulo: string }[] = [
  { valor: 'ativo', rotulo: 'Ativo' },
  { valor: 'passivo', rotulo: 'Passivo' },
  { valor: 'patrimonio_liquido', rotulo: 'Patrimônio líquido' },
  { valor: 'receita', rotulo: 'Receita' },
  { valor: 'despesa', rotulo: 'Despesa' },
];
export const ROTULO_TIPO_CONTA: Record<string, string> = Object.fromEntries(TIPOS_CONTA.map((t) => [t.valor, t.rotulo]));

export type Conta = {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoConta;
  conta_pai_id: string | null;
  analitica: boolean;
  ativa: boolean;
};

export const proximoCodigo = (pai: string | null, irmaos: string[]) => cod.proximoCodigo(MASCARA_CONTAS, pai, irmaos);
export const erroCodigo = (codigo: string, pai: string | null) => cod.erroCodigo(MASCARA_CONTAS, codigo, pai);
export const caminho = (c: Conta, porId: Record<string, Conta>) => cod.caminho(c, porId, (x) => x.conta_pai_id);
