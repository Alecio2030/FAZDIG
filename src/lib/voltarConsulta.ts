import type { NavPilha } from '../navegacao/rotas';

/**
 * V149 – Alterar ou excluir pela Consulta.
 * A ficha da Consulta abre o Cadastrar já carregado (parâmetro abrirId). Ao terminar:
 *  - alterou: volta para a ficha (que se atualiza sozinha);
 *  - excluiu: a ficha não existe mais, então volta direto para a Consulta.
 * Devolve true quando voltou (a tela que chamou não precisa fazer mais nada).
 */
export function voltarDaConsulta(navegacao: NavPilha, abrirId: string | undefined, excluiu: boolean): boolean {
  if (!abrirId) return false;
  const rotas = navegacao.getState()?.routes ?? [];
  const anterior = rotas[rotas.length - 2]?.name ?? '';
  if (excluiu && /Detalhe$/.test(anterior) && rotas.length >= 3) navegacao.pop(2);
  else if (navegacao.canGoBack()) navegacao.goBack();
  else return false;
  return true;
}
