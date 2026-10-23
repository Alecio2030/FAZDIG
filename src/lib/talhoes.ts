// Talhões: cultura, idade e fase da lavoura, estande (plantas/ha), podas e análises.
import { mesesEntre } from './imobilizado';

export const ESPECIES = [
  { valor: 'Café Conilon', rotulo: 'Café Conilon' },
  { valor: 'Café Arábica', rotulo: 'Café Arábica' },
  { valor: 'outra', rotulo: 'Outra cultura' },
];
export const FACES = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO', 'plano'].map((f) => ({ valor: f, rotulo: f === 'plano' ? 'Plano' : f }));
export const NOME_FACE: Record<string, string> = { N: 'Norte', NE: 'Nordeste', L: 'Leste', SE: 'Sudeste', S: 'Sul', SO: 'Sudoeste', O: 'Oeste', NO: 'Noroeste', plano: 'Plano' };
export const METODOS_IRRIGACAO = ['Gotejamento', 'Microaspersão', 'Aspersão', 'Pivô central', 'Outro'].map((m) => ({ valor: m, rotulo: m }));
export const TIPOS_PODA = ['Recepa', 'Esqueletamento', 'Decote', 'Desbrota', 'Poda programada de ciclo', 'Outra'].map((m) => ({ valor: m, rotulo: m }));
export const PROFUNDIDADES = ['0–20 cm', '20–40 cm', '40–60 cm'].map((m) => ({ valor: m, rotulo: m }));

/** Plantas por hectare pelo espaçamento (m entre linhas × m entre plantas). */
export function plantasHa(linhas: number | null | undefined, plantas: number | null | undefined): number | null {
  if (!linhas || !plantas || linhas <= 0 || plantas <= 0) return null;
  return Math.round(10000 / (linhas * plantas));
}

/**
 * Estande (plantas/ha) que vale para os cálculos do talhão: SÓ a efetivamente plantada
 * (total plantado ÷ área útil). V151: não usa mais o cálculo pelo espaçamento – sem o total plantado
 * no cadastro, devolve null (a tela avisa para completar o talhão).
 */
export function densidadeTalhao(a: { plantas_total?: any; plantas_ha_real?: any; area_util_ha?: any; area_ha?: any } | null | undefined): number | null {
  if (!a) return null;
  const total = Number(a.plantas_total);
  const util = Number(a.area_util_ha ?? a.area_ha);
  if (a.plantas_total != null && total > 0 && util > 0) return total / util;
  const real = Number(a.plantas_ha_real);
  if (a.plantas_ha_real != null && real > 0) return real;
  return null;
}

/**
 * V150: total de plantas EFETIVAMENTE plantadas no talhão (o que vale nas Atividades: dose por planta).
 * Não usa o cálculo pelo espaçamento. Cadastro antigo (só com plantas/ha efetivas) → plantas/ha × área útil.
 */
export function plantasPlantadas(a: { plantas_total?: any; plantas_ha_real?: any; area_util_ha?: any; area_ha?: any } | null | undefined): number | null {
  if (!a) return null;
  const total = Number(a.plantas_total);
  if (a.plantas_total != null && total > 0) return Math.round(total);
  const real = Number(a.plantas_ha_real);
  const util = Number(a.area_util_ha ?? a.area_ha);
  if (a.plantas_ha_real != null && real > 0 && util > 0) return Math.round(real * util);
  return null;
}

/** Idade em meses e fase da lavoura (formação até ~30 meses; decadente depois da vida produtiva). */
export function idadeFase(plantio: string | null | undefined, hoje: string, vidaAnos = 15): { meses: number; texto: string; fase: string } | null {
  if (!plantio) return null;
  const meses = Math.max(0, mesesEntre(plantio, hoje));
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const texto = anos ? `${anos} ${anos === 1 ? 'ano' : 'anos'}${resto ? ` e ${resto} ${resto === 1 ? 'mês' : 'meses'}` : ''}` : `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const fase = meses < 30 ? 'Formação' : meses < 30 + vidaAnos * 12 ? 'Produção plena' : 'Lavoura velha / decadente';
  return { meses, texto, fase };
}

/** Ano-safra padrão (1º de setembro a 31 de agosto: não corta a colheita do conilon) que contém a data. */
export function anoSafra(hoje: string): { inicio: string; fim: string; rotulo: string } {
  const a = Number(hoje.slice(0, 4));
  const m = Number(hoje.slice(5, 7));
  const ini = m >= 9 ? a : a - 1;
  return { inicio: `${ini}-09-01`, fim: `${ini + 1}-08-31`, rotulo: `${ini}/${String(ini + 1).slice(2)}` };
}
