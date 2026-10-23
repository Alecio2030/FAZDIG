// O GRUPO (produtor) é o tronco; cada fazenda é uma filial; o ADMINISTRATIVO (antes "Administração (sede)") é a unidade
// das despesas e receitas que não são de nenhuma fazenda (no banco: fazenda_id em branco).
// V137: o PARTICULAR (um ou mais) guarda as despesas e receitas dos sócios; cada sócio é um centro de custo dele.
// O Particular não entra no resultado: vai ao Patrimônio Líquido.
// Caixa, bancos, contas a pagar e a receber, financiamentos e imobilizado são do Grupo:
// as telas desses mostram tudo junto e marcam de qual unidade veio cada registro.
import type { Opcao } from '../componentes/Escolha';

/** Valor usado nas escolhas para a Administração (sede). */
export const ADM = 'adm';
/** Valor usado nas escolhas para "todas as unidades" (o Grupo inteiro). */
export const TODAS = 'todas';
export const NOME_ADM = 'Administrativo';

type Faz = { id: string; nome: string; tipo?: string };

/** A unidade é um Particular dos sócios? */
export const ehParticular = (fazendaId: string | null | undefined, fazendas: Faz[]): boolean => !!fazendaId && fazendas.some((f) => f.id === fazendaId && f.tipo === 'particular');

/** id da escolha -> fazenda_id do banco (Administração = null). */
export const idUnidade = (v: string | null | undefined): string | null => (!v || v === ADM || v === TODAS ? null : v);
/** fazenda_id do banco -> valor da escolha. */
export const valorUnidade = (fazendaId: string | null | undefined): string => fazendaId ?? ADM;

/** Nome da unidade de um registro. */
export function nomeUnidade(fazendaId: string | null | undefined, fazendas: Faz[]): string {
  if (!fazendaId) return NOME_ADM;
  return fazendas.find((f) => f.id === fazendaId)?.nome ?? 'Outra fazenda';
}

/** Opções: as fazendas, o Administrativo e o Particular (para dizer de quem é a despesa ou a receita). */
export function opcoesUnidade(fazendas: Faz[], comAdm = true): Opcao[] {
  const faz = fazendas.filter((f) => f.tipo !== 'particular');
  const part = fazendas.filter((f) => f.tipo === 'particular');
  return [...faz.map((f) => ({ valor: f.id, rotulo: f.nome })), ...(comAdm ? [{ valor: ADM, rotulo: NOME_ADM }] : []), ...part.map((f) => ({ valor: f.id, rotulo: f.nome }))];
}

/** Opções do filtro das consultas do Grupo: Todas + fazendas + Administração. */
export function opcoesFiltroUnidade(fazendas: Faz[]): Opcao[] {
  return [{ valor: TODAS, rotulo: 'Todas (Grupo)' }, ...opcoesUnidade(fazendas)];
}

/** Aplica o filtro de unidade numa consulta do supabase (Todas = sem filtro). */
export function filtrarUnidade<Q>(q: Q, valor: string): Q {
  const x = q as any;
  if (!valor || valor === TODAS) return q;
  if (valor === ADM) return x.is('fazenda_id', null);
  return x.eq('fazenda_id', valor);
}
/** O centro de custo serve para a unidade? (centro geral serve para todas; no Particular, só os sócios dele) */
// V144: os centros de custo são as contas de grau 3 do grupo 4 de cada unidade (e as divisões delas):
// cada unidade vê só os seus (o Administrativo, os de fazenda em branco = 4.9).
export const centroDaUnidade = (c: { fazenda_id: string | null }, unidade: string | null | undefined, _particular = false) =>
  (c.fazenda_id ?? null) === (unidade ?? null);

/** Código que os relatórios do banco entendem como "a Administração (sede)" na lista de fazendas. */
export const CODIGO_ADM = '00000000-0000-0000-0000-000000000000';

/** Lista de ids para os relatórios (resultado, exportação) conforme a escolha: uma fazenda, a Administração ou o Grupo. */
export function idsRelatorio(valor: string, fazendas: Faz[]): string[] {
  if (valor === TODAS) return [...fazendas.map((f) => f.id), CODIGO_ADM];
  if (valor === ADM) return [CODIGO_ADM];
  return [valor];
}

/** Opções dos relatórios: o Grupo (tudo), cada fazenda e a Administração. */
export function opcoesRelatorio(fazendas: Faz[]): Opcao[] {
  return [{ valor: TODAS, rotulo: 'Grupo (tudo)' }, ...opcoesUnidade(fazendas)];
}

/** Título do relatório conforme a escolha. */
export const rotuloRelatorio = (valor: string, fazendas: Faz[]) => (valor === TODAS ? 'Grupo: todas as fazendas, o Administrativo e o Particular' : nomeUnidade(idUnidade(valor), fazendas));
