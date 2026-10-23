// Custo por hora da mão de obra (cadastro da pessoa) e das máquinas (cadastro do bem), usado nas Atividades agrícolas.
// As mesmas contas estão no banco (custo_hora_pessoa e custo_hora_bem): quem grava o custo é o banco, no lançamento.
import { formatarMoeda } from './formatos';

/** Uma diária vale 8 horas; um mês, 220 horas (jornada de 44 h por semana). */
export const HORAS_DIARIA = 8;
export const HORAS_MES = 220;

export const BASES_MO = [
  { valor: 'hora', rotulo: 'Por hora' },
  { valor: 'dia', rotulo: 'Por diária' },
  { valor: 'mes', rotulo: 'Por mês' },
];

const N = (v: any) => (v == null || v === '' ? 0 : Number(v) || 0);

/** Custo de uma hora de trabalho da pessoa (null se não tiver valor no cadastro). */
export function custoHoraPessoa(base: string | null | undefined, valor: any): number | null {
  const v = N(valor);
  if (v <= 0) return null;
  if (base === 'hora') return v;
  if (base === 'dia') return v / HORAS_DIARIA;
  if (base === 'mes') return v / HORAS_MES;
  return null;
}

/** Custo de uma hora de uso do bem: combustível (litros por hora x preço do litro) + manutenção por hora. null se nada foi informado. */
export function custoHoraBem(b: { consumo_l_hora?: any; preco_litro?: any; manutencao_hora?: any } | null | undefined): number | null {
  if (!b) return null;
  const c = N(b.consumo_l_hora) * N(b.preco_litro) + N(b.manutencao_hora);
  return c > 0 ? c : null;
}

/** "R$ 15,00/h (diária de R$ 120,00)" */
export function textoCustoPessoa(base: string | null | undefined, valor: any): string | null {
  const ch = custoHoraPessoa(base, valor);
  if (ch == null) return null;
  if (base === 'hora') return `${formatarMoeda(ch)} por hora`;
  return `${formatarMoeda(ch)} por hora (${base === 'dia' ? `diária de ${HORAS_DIARIA} h` : `mês de ${HORAS_MES} h`})`;
}

/** Mão de obra + máquinas de uma atividade (o que o banco gravou no lançamento). */
export const custoOperacao = (at: { custo_mao_obra?: any; custo_maquina?: any } | null | undefined) => N(at?.custo_mao_obra) + N(at?.custo_maquina);
