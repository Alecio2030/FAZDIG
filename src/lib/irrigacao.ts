// Irrigação pelo balanço hídrico de cada talhão: quanta água o solo ainda tem e quanto repor.
// Conta diária simplificada (FAO-56): água no solo = água de ontem + chuva + irrigação − consumo da lavoura (ET0 × Kc),
// limitada à capacidade de água disponível do solo (CAD). Irriga-se quando o solo perde metade da CAD.
import { consulta, supabase } from './supabase';
import { densidadeTalhao } from './talhoes';
import { hojeBanco } from './datas';
import { mesesEntre } from './imobilizado';
import { diarioEstimado, lerChuvas, lerPrevisao, medidaPorDia, somarDias, type DiaEstimado, type LocalClima } from './clima';

/** Dias para trás em que a conta começa (com o solo cheio). */
export const DIAS_BALANCO = 60;
/** Fração da CAD que a lavoura pode gastar antes de irrigar. */
export const FATOR_ESGOTAMENTO = 0.5;

const EFICIENCIA: Record<string, number> = { Gotejamento: 0.9, Microaspersão: 0.85, Aspersão: 0.75, 'Pivô central': 0.85, Outro: 0.8 };

/** Kc (consumo da lavoura em relação à referência) e profundidade das raízes pela idade do café. */
export function kcRaiz(mesesPlantio: number | null): { kc: number; raizCm: number; fase: string } {
  if (mesesPlantio == null) return { kc: 1, raizCm: 50, fase: 'sem data de plantio (lavoura adulta)' };
  if (mesesPlantio < 12) return { kc: 0.6, raizCm: 30, fase: 'até 1 ano' };
  if (mesesPlantio < 30) return { kc: 0.8, raizCm: 40, fase: 'em formação' };
  return { kc: 1, raizCm: 50, fase: 'em produção' };
}

/** Água disponível por cm de solo (mm/cm) pela argila da análise de solo. */
export function aguaPorCm(argila: number | null): { mmCm: number; textura: string } {
  if (argila == null) return { mmCm: 1, textura: 'textura média (sem argila na análise de solo)' };
  if (argila < 15) return { mmCm: 0.6, textura: `arenoso (${Math.round(argila)}% de argila)` };
  if (argila <= 35) return { mmCm: 1, textura: `textura média (${Math.round(argila)}% de argila)` };
  return { mmCm: 1.3, textura: `argiloso (${Math.round(argila)}% de argila)` };
}

export type EntradaAgua = {
  hoje: string;
  cad: number;
  kc: number;
  /** chuva e ET0 por dia (estimadas) */
  estimado: Record<string, DiaEstimado>;
  /** chuva do pluviômetro por dia (vale mais que a estimada) */
  medida: Record<string, number>;
  /** irrigação por dia, em mm sobre o talhão */
  irrigacao: Record<string, number>;
};
export type SaidaAgua = { agua: number; deficit: number; perc: number; precisa: boolean; consumoDia: number; chuva: number; irrigado: number; consumo: number; dias: number; serie: { data: string; agua: number }[] };

/** Balanço dia a dia, do início (solo cheio) até ontem; a irrigação e a leitura do pluviômetro de hoje já entram. */
export function calcularAgua(e: EntradaAgua): SaidaAgua {
  let agua = e.cad;
  let chuva = 0;
  let irrigado = 0;
  let consumo = 0;
  let dias = 0;
  const serie: { data: string; agua: number }[] = [];
  const ultimos: number[] = [];
  const ontem = somarDias(e.hoje, -1);
  for (let d = somarDias(e.hoje, -DIAS_BALANCO); d <= ontem; d = somarDias(d, 1)) {
    const est = e.estimado[d];
    const c = e.medida[d] ?? est?.chuva ?? 0;
    const irr = e.irrigacao[d] ?? 0;
    const etc = (est?.et0 ?? 0) * e.kc;
    if (est || e.medida[d] != null) dias++;
    agua = Math.max(0, Math.min(e.cad, agua + c + irr - etc));
    chuva += c;
    irrigado += irr;
    consumo += etc;
    if (est?.et0 != null) ultimos.push(etc);
    serie.push({ data: d, agua });
  }
  const hojeEntra = (e.medida[e.hoje] ?? 0) + (e.irrigacao[e.hoje] ?? 0);
  if (hojeEntra > 0) {
    agua = Math.min(e.cad, agua + hojeEntra);
    irrigado += e.irrigacao[e.hoje] ?? 0;
    chuva += e.medida[e.hoje] ?? 0;
  }
  const ult7 = ultimos.slice(-7);
  const deficit = e.cad - agua;
  return {
    agua,
    deficit,
    perc: e.cad > 0 ? (agua / e.cad) * 100 : 0,
    precisa: deficit >= e.cad * FATOR_ESGOTAMENTO - 0.05,
    consumoDia: ult7.length ? ult7.reduce((s, v) => s + v, 0) / ult7.length : 0,
    chuva,
    irrigado,
    consumo,
    dias,
    serie: serie.slice(-14),
  };
}

export type AguaTalhao = SaidaAgua & {
  id: string;
  nome: string;
  irrigado_sistema: boolean;
  metodo: string | null;
  cad: number;
  kc: number;
  fase: string;
  raizCm: number;
  textura: string;
  eficiencia: number;
  /** lâmina a repor no solo (mm) e a bruta, já com a perda do sistema */
  laminaLiquida: number;
  laminaBruta: number;
  litrosPlanta: number | null;
  m3: number | null;
  /** chuva prevista para hoje e os 2 dias seguintes */
  chuvaPrevista: number;
  /** dias até chegar ao ponto de irrigar, pelo consumo previsto (null se já chegou ou sem previsão) */
  diasAteIrrigar: number | null;
  ultimaIrrigacao: { data: string; mm: number } | null;
};

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Balanço hídrico dos talhões ativos da fazenda (ou de um só). Lança erro se não der para ler o tempo. */
export async function aguaDosTalhoes(fazendaId: string, local: LocalClima, areaId?: string): Promise<AguaTalhao[]> {
  const hoje = hojeBanco();
  const inicio = somarDias(hoje, -DIAS_BALANCO);
  let qa = supabase.from('areas').select('id, nome, area_ha, area_util_ha, data_plantio, plantas_total, plantas_ha_real, irrigacao, metodo_irrigacao').eq('fazenda_id', fazendaId).eq('tipo', 'talhao').eq('ativa', true).order('nome');
  if (areaId) qa = qa.eq('id', areaId);
  const areas = await consulta<any[]>(qa);
  if (!areas.length) return [];
  const ids = areas.map((a) => a.id);
  const [estimado, chuvas, prev, analises, irrigs] = await Promise.all([
    diarioEstimado(local, inicio, hoje),
    lerChuvas(fazendaId, inicio, hoje),
    lerPrevisao(local),
    consulta<any[]>(supabase.from('talhao_analises').select('area_id, data, dados').eq('tipo', 'solo').in('area_id', ids).order('data', { ascending: false })),
    consulta<any[]>(supabase.from('atividade_areas').select('area_id, area_ha, atividade:atividades_agricolas!inner ( data, tipo, lamina_mm )').in('area_id', ids).eq('atividade.tipo', 'irrigacao').gte('atividade.data', inicio)),
  ]);
  const medida = medidaPorDia(chuvas);
  const frente = prev.dias.filter((d) => d.data >= prev.hoje);
  const chuvaPrevista = frente.slice(0, 3).reduce((s, d) => s + d.chuva, 0);
  const et0Previsto = frente.slice(0, 5).map((d) => d.et0).filter((v): v is number => v != null);

  return areas.map((a) => {
    const util = Number(a.area_util_ha ?? a.area_ha ?? 0) || null;
    const meses = a.data_plantio ? Math.max(0, mesesEntre(a.data_plantio, hoje)) : null;
    const { kc, raizCm, fase } = kcRaiz(meses);
    const argilas = analises.filter((x) => x.area_id === a.id).map((x) => Number(x.dados?.argila)).filter((v) => Number.isFinite(v) && v > 0);
    const { mmCm, textura } = aguaPorCm(argilas.length ? argilas[0] : null);
    const cad = Math.round(mmCm * raizCm);
    // irrigações lançadas nas Atividades: a lâmina vale para a parte do talhão que foi irrigada
    const irrigacao: Record<string, number> = {};
    let ultimaIrrigacao: { data: string; mm: number } | null = null;
    for (const x of irrigs) {
      const at = um(x.atividade);
      if (x.area_id !== a.id || !at || !(Number(at.lamina_mm) > 0)) continue;
      const parte = util && Number(x.area_ha) > 0 ? Math.min(1, Number(x.area_ha) / util) : 1;
      const mm = Number(at.lamina_mm) * parte;
      irrigacao[at.data] = (irrigacao[at.data] ?? 0) + mm;
      if (!ultimaIrrigacao || at.data > ultimaIrrigacao.data) ultimaIrrigacao = { data: at.data, mm: Number(at.lamina_mm) };
    }
    const s = calcularAgua({ hoje, cad, kc, estimado, medida, irrigacao });
    const metodo = (a.metodo_irrigacao as string | null) ?? null;
    const eficiencia = EFICIENCIA[metodo ?? ''] ?? 0.8;
    const laminaLiquida = Math.round(s.deficit * 10) / 10;
    const laminaBruta = Math.round((s.deficit / eficiencia) * 10) / 10;
    const densReal = densidadeTalhao(a);
    const m2Planta = densReal ? 10000 / densReal : null; // V151: só a efetivamente plantada
    const consumoPrevisto = et0Previsto.length ? (et0Previsto.reduce((t, v) => t + v, 0) / et0Previsto.length) * kc : s.consumoDia;
    const folga = s.agua - cad * (1 - FATOR_ESGOTAMENTO);
    return {
      ...s,
      id: a.id,
      nome: a.nome,
      irrigado_sistema: a.irrigacao === 'irrigada',
      metodo,
      cad,
      kc,
      fase,
      raizCm,
      textura,
      eficiencia,
      laminaLiquida,
      laminaBruta,
      litrosPlanta: m2Planta ? Math.round(laminaBruta * m2Planta * 10) / 10 : null,
      m3: util ? Math.round(laminaBruta * util * 10) : null,
      chuvaPrevista,
      diasAteIrrigar: !s.precisa && consumoPrevisto > 0.1 ? Math.max(1, Math.floor(folga / consumoPrevisto)) : null,
      ultimaIrrigacao,
    };
  });
}
