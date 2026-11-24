// Plano de contas: 4 graus. Ativo, Passivo e PL: máscara 9.9.99.999. Receitas (3) e Custos (4), desde a V168: 9.99.99.999,
// porque o grau 2 é a fazenda (3.01 e 4.01 = a mesma; 50 = Administração/sede) e há produtor com 10 ou mais fazendas.
// Grau 3 = centro de custo, com o mesmo número dos dois lados (.01 Agrícola, .02 Pecuária, .10 Operacionais, .20 Financeiras,
// .50 Outras; .90 Deduções só nas receitas). Grau 4 = conta onde os valores são alocados, com o MESMO código final em todas as
// fazendas (plano espelho: conta criada numa fazenda é criada nas outras pelo banco). É a estrutura de referência, nos bastidores:
// ninguém escolhe conta nas telas. O sistema classifica pela origem do lançamento (lib/classificacao.ts).
import * as cod from './codigos';

export const MASCARA_CONTAS: cod.Mascara = [1, 1, 2, 3];
/** V168: Receitas (3) e Custos (4) têm o grau 2 com 2 dígitos (a fazenda: 4.01, 4.02 ... 4.50 Administração). */
export const MASCARA_RESULTADO: cod.Mascara = [1, 2, 2, 3];
export const NIVEL_MAXIMO = MASCARA_CONTAS.length;
/** A máscara vale pelo grupo (grau 1) do código. */
export const mascaraDe = (codigo: string | null | undefined): cod.Mascara =>
  /^[34](\.|$)/.test((codigo ?? '').trim()) ? MASCARA_RESULTADO : MASCARA_CONTAS;
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

export const proximoCodigo = (pai: string | null, irmaos: string[]) => cod.proximoCodigo(mascaraDe(pai), pai, irmaos);
export const erroCodigo = (codigo: string, pai: string | null) => cod.erroCodigo(mascaraDe(codigo), codigo, pai);
export const caminho = (c: Conta, porId: Record<string, Conta>) => cod.caminho(c, porId, (x) => x.conta_pai_id);
