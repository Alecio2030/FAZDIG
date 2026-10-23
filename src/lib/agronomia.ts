// Agronomia: parâmetros das análises de solo e foliar, valores derivados e as contas de calagem e adubação do café conilon.
// Referências (Incaper): Prezotti et al. (2007), Manual de recomendação de calagem e adubação para o ES, 5ª aproximação;
// Guarçoni (2017), saturação por bases esperada conforme a CTC; Partelli et al. (2016), faixas foliares do conilon.
// São apoio à decisão: a recomendação final é do agrônomo responsável.

export type TipoAnalise = 'solo' | 'foliar';
export type Parametro = { chave: string; rotulo: string; unidade: string; casas: number };

export const PARAMETROS_SOLO: Parametro[] = [
  { chave: 'ph', rotulo: 'pH em água', unidade: '', casas: 2 },
  { chave: 'p', rotulo: 'P', unidade: 'mg/dm³', casas: 2 },
  { chave: 'k', rotulo: 'K', unidade: 'mg/dm³', casas: 1 },
  { chave: 'ca', rotulo: 'Ca', unidade: 'cmolc/dm³', casas: 2 },
  { chave: 'mg', rotulo: 'Mg', unidade: 'cmolc/dm³', casas: 2 },
  { chave: 'al', rotulo: 'Al', unidade: 'cmolc/dm³', casas: 2 },
  { chave: 'h_al', rotulo: 'H+Al', unidade: 'cmolc/dm³', casas: 2 },
  { chave: 'sb', rotulo: 'SB', unidade: 'cmolc/dm³', casas: 2 },
  { chave: 't', rotulo: 'CTC efetiva (t)', unidade: 'cmolc/dm³', casas: 2 },
  { chave: 'ctc', rotulo: 'CTC pH 7 (T)', unidade: 'cmolc/dm³', casas: 2 },
  { chave: 'v', rotulo: 'V', unidade: '%', casas: 1 },
  { chave: 'm', rotulo: 'm', unidade: '%', casas: 1 },
  { chave: 'mo', rotulo: 'MO', unidade: 'dag/kg', casas: 2 },
  { chave: 'p_rem', rotulo: 'P-rem', unidade: 'mg/L', casas: 1 },
  { chave: 's', rotulo: 'S', unidade: 'mg/dm³', casas: 1 },
  { chave: 'b', rotulo: 'B', unidade: 'mg/dm³', casas: 2 },
  { chave: 'cu', rotulo: 'Cu', unidade: 'mg/dm³', casas: 2 },
  { chave: 'fe', rotulo: 'Fe', unidade: 'mg/dm³', casas: 1 },
  { chave: 'mn', rotulo: 'Mn', unidade: 'mg/dm³', casas: 1 },
  { chave: 'zn', rotulo: 'Zn', unidade: 'mg/dm³', casas: 2 },
  { chave: 'na', rotulo: 'Na', unidade: 'mg/dm³', casas: 1 },
  { chave: 'argila', rotulo: 'Argila', unidade: '%', casas: 0 },
];
export const PARAMETROS_FOLIAR: Parametro[] = [
  { chave: 'n', rotulo: 'N', unidade: 'g/kg', casas: 1 },
  { chave: 'p', rotulo: 'P', unidade: 'g/kg', casas: 2 },
  { chave: 'k', rotulo: 'K', unidade: 'g/kg', casas: 1 },
  { chave: 'ca', rotulo: 'Ca', unidade: 'g/kg', casas: 1 },
  { chave: 'mg', rotulo: 'Mg', unidade: 'g/kg', casas: 2 },
  { chave: 's', rotulo: 'S', unidade: 'g/kg', casas: 2 },
  { chave: 'b', rotulo: 'B', unidade: 'mg/kg', casas: 1 },
  { chave: 'cu', rotulo: 'Cu', unidade: 'mg/kg', casas: 1 },
  { chave: 'fe', rotulo: 'Fe', unidade: 'mg/kg', casas: 0 },
  { chave: 'mn', rotulo: 'Mn', unidade: 'mg/kg', casas: 0 },
  { chave: 'zn', rotulo: 'Zn', unidade: 'mg/kg', casas: 1 },
];
export const parametrosDe = (tipo: string) => (tipo === 'foliar' ? PARAMETROS_FOLIAR : PARAMETROS_SOLO);

export const EPOCAS_FOLIAR = [
  { valor: 'pre_florada', rotulo: 'Pré-florada' },
  { valor: 'granacao', rotulo: 'Granação' },
  { valor: 'outra', rotulo: 'Outra época' },
];

export type Valores = Record<string, number>;
const r = (x: number, casas = 2) => Math.round(x * 10 ** casas) / 10 ** casas;
const tem = (v: Valores, ...chaves: string[]) => chaves.every((c) => v[c] != null && Number.isFinite(v[c]));

/**
 * Completa o que o laudo não trouxe, quando dá para calcular: SB, t, T, V e m.
 * K em mg/dm³ vira cmolc/dm³ dividindo por 391 (Na por 230). Devolve os valores completos e a lista do que foi calculado.
 */
export function completarSolo(v: Valores): { valores: Valores; calculados: string[] } {
  const x: Valores = { ...v };
  const calculados: string[] = [];
  if (!tem(x, 'sb') && tem(x, 'ca', 'mg', 'k')) {
    x.sb = r(x.ca + x.mg + x.k / 391 + (tem(x, 'na') ? x.na / 230 : 0));
    calculados.push('sb');
  }
  if (!tem(x, 't') && tem(x, 'sb', 'al')) {
    x.t = r(x.sb + x.al);
    calculados.push('t');
  }
  if (!tem(x, 'ctc') && tem(x, 'sb', 'h_al')) {
    x.ctc = r(x.sb + x.h_al);
    calculados.push('ctc');
  }
  if (!tem(x, 'v') && tem(x, 'sb', 'ctc') && x.ctc > 0) {
    x.v = r((100 * x.sb) / x.ctc, 1);
    calculados.push('v');
  }
  if (!tem(x, 'm') && tem(x, 'al', 't') && x.t > 0) {
    x.m = r((100 * x.al) / x.t, 1);
    calculados.push('m');
  }
  return { valores: x, calculados };
}

/** Saturação por bases esperada (Ve) para o café, conforme a CTC a pH 7 (Guarçoni, 2017). */
export function veCafe(T: number): { ve: number; classe: string } {
  if (T < 4.3) return { ve: 80, classe: 'CTC baixa (menos de 4,3)' };
  if (T <= 8.6) return { ve: 70, classe: 'CTC média (4,3 a 8,6)' };
  return { ve: 60, classe: 'CTC boa (acima de 8,6)' };
}

export type Calagem = { ve: number; classeT: string; nc: number; dose: number; cobertura: boolean; prnt: number; precisa: boolean };
/**
 * Calagem pelo método da saturação por bases: NC = T × (Ve − V) / 100 (t/ha, PRNT 100, incorporado a 20 cm).
 * Em cobertura (lavoura formada) vale a metade; a dose é corrigida pelo PRNT do calcário.
 */
export function calagem(v: Valores, prnt: number, cobertura: boolean): Calagem | null {
  if (!tem(v, 'ctc', 'v') || v.ctc <= 0) return null;
  const { ve, classe } = veCafe(v.ctc);
  const nc = Math.max(0, r((v.ctc * (ve - v.v)) / 100));
  const p = prnt > 0 ? prnt : 100;
  return { ve, classeT: classe, nc, dose: r(nc * (cobertura ? 0.5 : 1) * (100 / p)), cobertura, prnt: p, precisa: nc > 0.05 };
}

// Adubação de produção do conilon (kg/ha/ano): N pela produtividade; K2O pela produtividade e pelo K do solo.
const TABELA_NK: { ate: number; faixa: string; n: number; k2o: [number, number, number, number] }[] = [
  { ate: 30, faixa: '20 a 30', n: 260, k2o: [230, 160, 90, 0] },
  { ate: 50, faixa: '31 a 50', n: 320, k2o: [290, 220, 150, 0] },
  { ate: 70, faixa: '51 a 70', n: 380, k2o: [350, 280, 210, 80] },
  { ate: 100, faixa: '71 a 100', n: 440, k2o: [410, 340, 270, 140] },
  { ate: 130, faixa: '101 a 130', n: 500, k2o: [470, 400, 330, 200] },
  { ate: 170, faixa: '131 a 170', n: 560, k2o: [530, 460, 390, 260] },
  { ate: Infinity, faixa: 'mais de 170', n: 620, k2o: [600, 520, 450, 320] },
];
export type AdubacaoNK = { faixa: string; n: number; k2o: number | null; classeK: string | null; nPlanta: number | null; k2oPlanta: number | null };
/** N e K2O (kg/ha/ano) para a produtividade esperada (sacas beneficiadas por hectare) e o K do solo (mg/dm³). */
export function adubacaoNK(produtividade: number, kSolo: number | null | undefined, plantasHa?: number | null): AdubacaoNK | null {
  if (!(produtividade > 0)) return null;
  const linha = TABELA_NK.find((l) => produtividade <= l.ate)!;
  const iK = kSolo == null ? null : kSolo < 60 ? 0 : kSolo <= 120 ? 1 : kSolo <= 200 ? 2 : 3;
  const k2o = iK == null ? null : linha.k2o[iK];
  return {
    faixa: linha.faixa,
    n: linha.n,
    k2o,
    classeK: iK == null ? null : ['K baixo (menos de 60)', 'K médio (60 a 120)', 'K bom (120 a 200)', 'K alto (mais de 200)'][iK],
    nPlanta: plantasHa ? r((linha.n * 1000) / plantasHa, 0) : null,
    k2oPlanta: plantasHa && k2o != null ? r((k2o * 1000) / plantasHa, 0) : null,
  };
}

// Faixas de suficiência foliar do conilon de alta produtividade (Norte do ES). g/kg para macros; mg/kg para micros.
const FAIXAS_FOLIAR: Record<string, Record<string, [number, number]>> = {
  pre_florada: { n: [23.1, 28.7], p: [1.01, 1.44], k: [9.9, 14.9], ca: [15.2, 26.5], mg: [2.57, 4.65], s: [1.02, 1.71], b: [50.7, 99.2], cu: [4.36, 14.5], fe: [67.0, 195], mn: [62.4, 226], zn: [4.85, 8.05] },
  granacao: { n: [25.2, 30.6], p: [1.1, 1.53], k: [13.0, 18.8], ca: [13.8, 22.6], mg: [2.53, 4.11], s: [1.05, 1.85], b: [57.6, 102], cu: [6.41, 19.8], fe: [67.3, 145], mn: [50.4, 188], zn: [5.36, 17.3] },
};
export type ClasseFoliar = { classe: 'baixo' | 'adequado' | 'alto'; faixa: [number, number] };
/** Classe do nutriente na folha (só para o conilon, nas épocas que têm faixa de referência). */
export function classeFoliar(chave: string, valor: number, epoca: string | null | undefined): ClasseFoliar | null {
  const faixa = FAIXAS_FOLIAR[epoca ?? '']?.[chave];
  if (!faixa || !Number.isFinite(valor)) return null;
  return { classe: valor < faixa[0] ? 'baixo' : valor > faixa[1] ? 'alto' : 'adequado', faixa };
}

export const eConilon = (especie: string | null | undefined) => /conilon|robusta|canephora/i.test(especie ?? '');
