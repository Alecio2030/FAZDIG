// V166 · Diagnóstico dos laudos: o que está fora do padrão (valores de referência) e as sugestões de correção.
// É conta do sistema, sem IA: as mesmas regras para todos os laudos, sempre iguais.
// Referências:
//  - Solo: CFSEMG (1999), 5ª Aproximação (classes de fertilidade, usadas também no ES); Incaper (Prezotti et al., 2007)
//    e Guarçoni (2017) para a saturação por bases do café; tabela de K do conilon do sistema.
//  - Folha: faixas do conilon (Partelli et al., 2016, Incaper) na pré-florada e na granação; fora disso, a faixa que o
//    próprio laboratório imprimiu no laudo.
//  - Fertilizante orgânico: garantias mínimas usuais do MAPA para composto (IN 61/2020).
//  - Corretivo: exigências do MAPA para calcário (granulometria, PN, PRNT e CaO + MgO).
// TUDO É SUGESTÃO: não substitui a recomendação do engenheiro agrônomo responsável.
import { veCafe, type Calagem, type Valores } from './agronomia';
import { formatarNumero } from './formatos';

export const AVISO_SUGESTAO =
  'Sugestões geradas pelo sistema a partir dos valores de referência. Servem de apoio e NÃO substituem a recomendação do engenheiro agrônomo responsável, que deve conferir antes de comprar e aplicar.';

export type Nivel = 'ok' | 'atencao' | 'fora';
export type Achado = { chave: string; rotulo: string; valor: number; unidade: string; classe: string; nivel: Nivel; faixa: string | null; fonte: string };
export type Sugestao = { titulo: string; texto: string };
export type Diagnostico = { achados: Achado[]; sugestoes: Sugestao[]; observacoes: string[] };

const f = (v: number, casas = 2) => formatarNumero(v, casas);
const tem = (v: Valores, c: string) => v[c] != null && Number.isFinite(v[c]);

// ---------------------------------------------------------------- SOLO
const CLASSES5 = ['muito baixo', 'baixo', 'médio', 'bom', 'muito bom'];
/** limites superiores das 4 primeiras classes (a 5ª é o que passa do último) */
type Tabela5 = [number, number, number, number];
const SOLO_5A: Record<string, { rotulo: string; un: string; lim: Tabela5; casas: number }> = {
  k: { rotulo: 'Potássio (K)', un: 'mg/dm³', lim: [15, 40, 70, 120], casas: 0 },
  ca: { rotulo: 'Cálcio (Ca)', un: 'cmolc/dm³', lim: [0.4, 1.2, 2.4, 4.0], casas: 2 },
  mg: { rotulo: 'Magnésio (Mg)', un: 'cmolc/dm³', lim: [0.15, 0.45, 0.9, 1.5], casas: 2 },
  sb: { rotulo: 'Soma de bases (SB)', un: 'cmolc/dm³', lim: [0.6, 1.8, 3.6, 6.0], casas: 2 },
  t: { rotulo: 'CTC efetiva (t)', un: 'cmolc/dm³', lim: [0.8, 2.3, 4.6, 8.0], casas: 2 },
  ctc: { rotulo: 'CTC a pH 7 (T)', un: 'cmolc/dm³', lim: [1.6, 4.3, 8.6, 15], casas: 2 },
  mo: { rotulo: 'Matéria orgânica', un: 'dag/kg', lim: [0.7, 2.0, 4.0, 7.0], casas: 2 },
  b: { rotulo: 'Boro (B)', un: 'mg/dm³', lim: [0.15, 0.35, 0.6, 0.9], casas: 2 },
  cu: { rotulo: 'Cobre (Cu)', un: 'mg/dm³', lim: [0.3, 0.7, 1.2, 1.8], casas: 2 },
  fe: { rotulo: 'Ferro (Fe)', un: 'mg/dm³', lim: [8, 18, 30, 45], casas: 1 },
  mn: { rotulo: 'Manganês (Mn)', un: 'mg/dm³', lim: [2, 5, 8, 12], casas: 1 },
  zn: { rotulo: 'Zinco (Zn)', un: 'mg/dm³', lim: [0.4, 0.9, 1.5, 2.2], casas: 2 },
};
/** P disponível (Mehlich-1) pelo P remanescente; sem P-rem, pela argila; sem os dois, textura média. */
const P_POR_PREM: { ate: number; lim: Tabela5 }[] = [
  { ate: 4, lim: [3.0, 4.3, 6.0, 9.0] },
  { ate: 10, lim: [4.0, 6.0, 8.3, 12.5] },
  { ate: 19, lim: [6.0, 8.3, 11.4, 17.5] },
  { ate: 30, lim: [8.0, 11.4, 15.8, 24.0] },
  { ate: 44, lim: [11.0, 15.8, 21.8, 33.0] },
  { ate: Infinity, lim: [15.0, 21.8, 30.0, 45.0] },
];
const P_POR_ARGILA: { ate: number; lim: Tabela5 }[] = [
  { ate: 15, lim: [10, 20, 30, 45] },
  { ate: 35, lim: [6.6, 12, 20, 30] },
  { ate: 60, lim: [4.0, 8.0, 12, 18] },
  { ate: Infinity, lim: [2.7, 5.4, 8.0, 12] },
];
const classe5 = (v: number, lim: Tabela5) => {
  const i = lim.findIndex((x) => v <= x);
  return CLASSES5[i < 0 ? 4 : i];
};
const nivel5 = (c: string): Nivel => (c === 'muito baixo' || c === 'baixo' ? 'fora' : c === 'médio' ? 'atencao' : 'ok');
const faixa5 = (lim: Tabela5, casas: number) => `bom de ${f(lim[2], casas)} a ${f(lim[3], casas)}`;

export function diagnosticoSolo(v: Valores, cal: Calagem | null, k2oDose?: number | null): Diagnostico {
  const achados: Achado[] = [];
  const fonte5 = '5ª Aproximação (CFSEMG)';
  const add = (a: Achado) => achados.push(a);

  if (tem(v, 'ph')) {
    const ph = v.ph;
    const [classe, nivel]: [string, Nivel] =
      ph < 5.0 ? ['acidez elevada', 'fora'] : ph < 5.5 ? ['acidez média', 'atencao'] : ph <= 6.5 ? ['adequado', 'ok'] : ph <= 7.0 ? ['acidez fraca', 'atencao'] : ['alcalino', 'fora'];
    add({ chave: 'ph', rotulo: 'pH em água', valor: ph, unidade: '', classe, nivel, faixa: 'café: 5,5 a 6,5', fonte: fonte5 });
  }
  if (tem(v, 'p')) {
    const usaPrem = tem(v, 'p_rem');
    const lim = usaPrem ? P_POR_PREM.find((x) => v.p_rem <= x.ate)!.lim : P_POR_ARGILA.find((x) => (tem(v, 'argila') ? v.argila : 25) <= x.ate)!.lim;
    const c = classe5(v.p, lim);
    add({
      chave: 'p', rotulo: 'Fósforo (P)', valor: v.p, unidade: 'mg/dm³', classe: c, nivel: nivel5(c), faixa: faixa5(lim, 1),
      fonte: `${fonte5}, ${usaPrem ? `pelo P-rem ${f(v.p_rem, 1)}` : tem(v, 'argila') ? `pela argila ${f(v.argila, 0)}%` : 'textura média (sem P-rem nem argila no laudo)'}`,
    });
  }
  for (const [ch, d] of Object.entries(SOLO_5A)) {
    if (!tem(v, ch)) continue;
    const c = classe5(v[ch], d.lim);
    // Fe e Mn altos são comuns em solo ácido: não é falta, é sinal de acidez
    const nivel: Nivel = (ch === 'fe' || ch === 'mn') && c === 'muito bom' ? 'atencao' : ch === 'ctc' || ch === 't' || ch === 'sb' ? (c === 'muito baixo' || c === 'baixo' ? 'atencao' : 'ok') : nivel5(c);
    add({ chave: ch, rotulo: d.rotulo, valor: v[ch], unidade: d.un, classe: (ch === 'fe' || ch === 'mn') && c === 'muito bom' ? 'alto' : c, nivel, faixa: faixa5(d.lim, d.casas), fonte: fonte5 });
  }
  if (tem(v, 'al')) {
    const al = v.al;
    const [classe, nivel]: [string, Nivel] = al <= 0.2 ? ['muito baixo', 'ok'] : al <= 0.5 ? ['baixo', 'ok'] : al <= 1.0 ? ['médio', 'atencao'] : ['alto', 'fora'];
    add({ chave: 'al', rotulo: 'Alumínio (Al)', valor: al, unidade: 'cmolc/dm³', classe, nivel, faixa: 'desejável até 0,5', fonte: fonte5 });
  }
  if (tem(v, 'm')) {
    const m = v.m;
    const [classe, nivel]: [string, Nivel] = m <= 15 ? ['muito baixa', 'ok'] : m <= 30 ? ['baixa', 'atencao'] : m <= 50 ? ['média', 'fora'] : ['alta', 'fora'];
    add({ chave: 'm', rotulo: 'Saturação por alumínio (m)', valor: m, unidade: '%', classe, nivel, faixa: 'desejável até 15%', fonte: fonte5 });
  }
  if (tem(v, 'v')) {
    const ve = tem(v, 'ctc') ? veCafe(v.ctc).ve : 60;
    const nivel: Nivel = v.v < ve - 5 ? 'fora' : v.v < ve ? 'atencao' : 'ok';
    add({ chave: 'v', rotulo: 'Saturação por bases (V)', valor: v.v, unidade: '%', classe: nivel === 'ok' ? 'adequada' : 'abaixo da meta', nivel, faixa: `meta para o café: ${ve}%`, fonte: 'Incaper / Guarçoni (2017)' });
  }
  if (tem(v, 's')) {
    const c = v.s < 5 ? 'baixo' : v.s <= 10 ? 'médio' : 'bom';
    add({ chave: 's', rotulo: 'Enxofre (S)', valor: v.s, unidade: 'mg/dm³', classe: c, nivel: nivel5(c), faixa: 'bom acima de 10', fonte: fonte5 });
  }
  const relCaMg = tem(v, 'ca') && v.mg > 0 ? v.ca / v.mg : null;

  // ---- sugestões
  const fora = (ch: string) => achados.find((a) => a.chave === ch && a.nivel === 'fora');
  const baixo = (ch: string) => achados.find((a) => a.chave === ch && a.nivel !== 'ok');
  const sug: Sugestao[] = [];
  const obs: string[] = [];
  const acidez = fora('ph') || fora('v') || fora('al') || fora('m') || (cal?.precisa ?? false);
  const pedeMg = !!(fora('mg') || (relCaMg != null && relCaMg > 5));
  if (acidez) {
    const dose = cal?.precisa ? `${f(cal.dose, 2)} t/ha de calcário PRNT ${f(cal.prnt, 0)}%${cal.cobertura ? ' em cobertura' : ', incorporado'}` : null;
    sug.push({
      titulo: 'Corrigir a acidez (calagem)',
      texto: `${dose ? `A conta do sistema pede ${dose} (método da saturação por bases, meta V ${cal!.ve}%). ` : ''}Use calcário ${pedeMg ? 'DOLOMÍTICO (MgO acima de 12%), porque o magnésio está baixo ou a relação Ca:Mg está alta' : 'dolomítico ou magnesiano'}. Aplique de preferência 60 a 90 dias antes da adubação; doses acima de 2 a 3 t/ha em lavoura formada costumam ser parceladas.`,
    });
    if ((v.m ?? 0) > 30 || (v.al ?? 0) > 0.5 || (v.ca ?? 9) < 0.4) {
      sug.push({ titulo: 'Avaliar gessagem', texto: 'Alumínio alto ou cálcio muito baixo: colete também a camada de 20 a 40 cm. Se lá o Al estiver alto ou o Ca baixo, o gesso agrícola leva cálcio para baixo e tira o alumínio do caminho da raiz.' });
    }
  } else if (pedeMg) {
    sug.push({ titulo: 'Magnésio', texto: 'Mg baixo (ou Ca:Mg alto) sem precisar de calagem: use sulfato de magnésio no solo, ou dolomítico na próxima calagem.' });
  }
  if (baixo('p')) sug.push({ titulo: 'Fósforo', texto: 'P baixo: use fonte fosfatada (superfosfato simples ou triplo, MAP) na adubação; na lavoura formada, na projeção da copa. Matéria orgânica e calagem melhoram o aproveitamento do fósforo.' });
  if (baixo('k')) {
    sug.push({
      titulo: 'Potássio',
      texto: `K ${achados.find((a) => a.chave === 'k')?.classe}: aumente o K₂O (cloreto ou sulfato de potássio), parcelado no período das chuvas.${k2oDose ? ` A tabela do conilon do sistema dá ${f(k2oDose, 0)} kg/ha de K₂O por ano para a produtividade informada.` : ''}`,
    });
  }
  if (baixo('mo')) sug.push({ titulo: 'Matéria orgânica', texto: 'MO baixa: composto, esterco bem curtido, palha de café, adubação verde ou braquiária roçada na entrelinha. Melhora a retenção de água e de nutrientes.' });
  if (fora('s')) sug.push({ titulo: 'Enxofre', texto: 'S baixo: use fontes com enxofre (gesso agrícola, sulfato de amônio, superfosfato simples).' });
  if (fora('b')) sug.push({ titulo: 'Boro', texto: 'B baixo no solo: ácido bórico ou ulexita no solo, ou boro foliar. Confira antes na análise foliar: o excesso de boro é tóxico para a planta.' });
  if (fora('zn')) sug.push({ titulo: 'Zinco', texto: 'Zn baixo: sulfato de zinco no solo ou via folha (0,3 a 0,5%) no período chuvoso.' });
  if (fora('cu')) sug.push({ titulo: 'Cobre', texto: 'Cu baixo: cobre via folha (oxicloreto ou hidróxido de cobre), que também ajuda na proteção contra doenças.' });
  if (fora('mn')) sug.push({ titulo: 'Manganês', texto: 'Mn baixo: sulfato de manganês via folha. Calcário em excesso derruba o manganês disponível.' });
  if (achados.some((a) => (a.chave === 'fe' || a.chave === 'mn') && a.classe === 'alto')) obs.push('Ferro e/ou manganês altos são comuns em solo ácido e caem com a calagem; não precisam de correção própria.');
  if (relCaMg != null) obs.push(`Relação Ca:Mg = ${f(relCaMg, 1)}:1 (para o conilon, o desejável é em torno de 4:1).`);
  return { achados, sugestoes: sug, observacoes: obs };
}

// ---------------------------------------------------------------- FOLHA
const ROTULO_FOLIAR: Record<string, [string, string, number]> = {
  n: ['Nitrogênio (N)', 'g/kg', 2], p: ['Fósforo (P)', 'g/kg', 2], k: ['Potássio (K)', 'g/kg', 2], ca: ['Cálcio (Ca)', 'g/kg', 2],
  mg: ['Magnésio (Mg)', 'g/kg', 2], s: ['Enxofre (S)', 'g/kg', 2], b: ['Boro (B)', 'mg/kg', 0], cu: ['Cobre (Cu)', 'mg/kg', 0],
  fe: ['Ferro (Fe)', 'mg/kg', 0], mn: ['Manganês (Mn)', 'mg/kg', 0], zn: ['Zinco (Zn)', 'mg/kg', 0],
};
export type Referencias = Record<string, { min: number | null; max: number | null }>;
const SUG_FOLIAR: Record<string, { baixo?: string; alto?: string }> = {
  n: { baixo: 'Reveja a dose e o parcelamento do nitrogênio no solo (perdas por chuva ou seca reduzem o aproveitamento).', alto: 'Não aumente o nitrogênio; corrija o potássio para equilibrar a relação N/K.' },
  p: { baixo: 'Fósforo vai pelo solo (fonte fosfatada); o foliar pouco resolve.' },
  k: { baixo: 'Aumente o K₂O no solo (cloreto ou sulfato de potássio), parcelado nas chuvas; o potássio foliar só complementa.', alto: 'Potássio alto pode atrapalhar a absorção de cálcio e magnésio: não aumente a dose.' },
  ca: { baixo: 'Cálcio vai pelo solo: calagem e, se for o caso, gesso.' },
  mg: { baixo: 'Use calcário dolomítico na calagem e/ou sulfato de magnésio no solo; via folha (sulfato de magnésio a 1%) só como reforço.' },
  s: { baixo: 'Use fontes com enxofre (sulfato de amônio, gesso, superfosfato simples).' },
  b: { baixo: 'Boro via folha (ácido bórico a 0,3%) ou no solo, no período chuvoso.', alto: 'Suspenda as aplicações de boro (folha e solo) nesta safra e reavalie na próxima análise.' },
  zn: { baixo: 'Sulfato de zinco via folha (0,3 a 0,5%), em 2 a 3 aplicações no período chuvoso.' },
  cu: { baixo: 'Cobre via folha (oxicloreto ou hidróxido de cobre), que também protege contra ferrugem e phoma.', alto: 'Reduza as aplicações de fungicida à base de cobre.' },
  mn: { baixo: 'Sulfato de manganês via folha. Calcário em excesso derruba o manganês.', alto: 'Manganês alto costuma ser solo ácido: a calagem resolve.' },
  fe: { alto: 'Ferro alto costuma ser poeira na folha (lavar bem a amostra) ou solo ácido (calagem).' },
};

/**
 * Folha: com faixa do conilon (pré-florada ou granação) quando ela existe; senão, a faixa impressa no laudo pelo laboratório.
 * faixasConilon: a função classeFoliar da agronomia (passada de fora para não repetir a tabela).
 */
export function diagnosticoFoliar(
  v: Valores,
  faixaConilon: (chave: string) => [number, number] | null,
  referencias: Referencias | null | undefined,
): Diagnostico {
  const achados: Achado[] = [];
  const sug: Sugestao[] = [];
  for (const [ch, [rotulo, un, casas]] of Object.entries(ROTULO_FOLIAR)) {
    if (!tem(v, ch)) continue;
    const propria = faixaConilon(ch);
    const lab = referencias?.[ch];
    const faixa: [number | null, number | null] | null = propria ?? (lab && (lab.min != null || lab.max != null) ? [lab.min, lab.max] : null);
    const fonte = propria ? 'Conilon (Incaper, Partelli et al. 2016)' : faixa ? 'Referência do laboratório' : 'sem faixa de referência';
    let classe = 'sem referência';
    let nivel: Nivel = 'ok';
    if (faixa) {
      const [mi, ma] = faixa;
      if (mi != null && v[ch] < mi) [classe, nivel] = ['baixo', 'fora'];
      else if (ma != null && v[ch] > ma) [classe, nivel] = ['alto', 'fora'];
      else classe = 'adequado';
    }
    achados.push({
      chave: ch, rotulo, valor: v[ch], unidade: un, classe, nivel, fonte,
      faixa: faixa ? `${faixa[0] != null ? f(faixa[0], casas) : '–'} a ${faixa[1] != null ? f(faixa[1], casas) : '–'}` : null,
    });
    const s = SUG_FOLIAR[ch];
    if (nivel === 'fora' && s) {
      const t = classe === 'baixo' ? s.baixo : s.alto;
      if (t) sug.push({ titulo: `${rotulo} ${classe}`, texto: t });
    }
  }
  const obs: string[] = [];
  // a faixa do laboratório (em geral de café arábica) pode discordar da faixa do conilon: avisa em vez de esconder
  const divergem = achados
    .filter((a) => faixaConilon(a.chave) && referencias?.[a.chave])
    .filter((a) => {
      const r = referencias![a.chave];
      const lab = r.min != null && a.valor < r.min ? 'baixo' : r.max != null && a.valor > r.max ? 'alto' : 'adequado';
      return lab !== a.classe;
    })
    .map((a) => a.rotulo.replace(/ \(.*\)$/, ''));
  if (divergem.length) {
    obs.push(`Para ${divergem.join(', ')}, a faixa impressa pelo laboratório daria outra classificação. O sistema usou a faixa do conilon do Incaper para esta época; confirme com o agrônomo qual referência seguir.`);
  }
  if (tem(v, 'n') && v.k > 0) obs.push(`Relação N/K = ${f(v.n / v.k, 2)}.`);
  if (tem(v, 'ca') && v.mg > 0) obs.push(`Relação Ca/Mg na folha = ${f(v.ca / v.mg, 1)}.`);
  if (achados.length && achados.every((a) => a.classe === 'sem referência')) obs.push('Sem faixa de referência para esta época ou cultura, e o laudo não trouxe a coluna de valor adequado: peça o parecer do agrônomo virtual.');
  return { achados, sugestoes: sug, observacoes: obs };
}

// ---------------------------------------------------------------- ADUBO ORGÂNICO
export const PARAMETROS_ORGANICO: { chave: string; rotulo: string; unidade: string; casas: number }[] = [
  { chave: 'umidade', rotulo: 'Umidade', unidade: '%', casas: 2 },
  { chave: 'ph', rotulo: 'pH', unidade: '', casas: 2 },
  { chave: 'mo', rotulo: 'Matéria orgânica', unidade: '%', casas: 2 },
  { chave: 'c', rotulo: 'Carbono orgânico', unidade: '%', casas: 2 },
  { chave: 'cn', rotulo: 'Relação C/N', unidade: '', casas: 1 },
  { chave: 'n', rotulo: 'N total', unidade: '%', casas: 2 },
  { chave: 'p2o5', rotulo: 'P₂O₅', unidade: '%', casas: 2 },
  { chave: 'k2o', rotulo: 'K₂O', unidade: '%', casas: 2 },
  { chave: 'ca', rotulo: 'Ca', unidade: '%', casas: 2 },
  { chave: 'mg', rotulo: 'Mg', unidade: '%', casas: 2 },
  { chave: 's', rotulo: 'S', unidade: '%', casas: 2 },
  { chave: 'fe', rotulo: 'Fe', unidade: '%', casas: 3 },
  { chave: 'zn', rotulo: 'Zn', unidade: '%', casas: 3 },
  { chave: 'cu', rotulo: 'Cu', unidade: '%', casas: 3 },
  { chave: 'mn', rotulo: 'Mn', unidade: '%', casas: 3 },
  { chave: 'b', rotulo: 'B', unidade: '%', casas: 3 },
];
/** kg de nutriente por tonelada do produto como ele chega (úmido). */
export function entregaOrganico(v: Valores, base: string | null | undefined): { chave: string; rotulo: string; kg: number }[] {
  const fator = base === 'umida' ? 1 : tem(v, 'umidade') ? (100 - v.umidade) / 100 : 1;
  return (['n', 'p2o5', 'k2o', 'ca', 'mg', 's'] as const)
    .filter((c) => tem(v, c))
    .map((c) => ({ chave: c, rotulo: PARAMETROS_ORGANICO.find((p) => p.chave === c)!.rotulo, kg: v[c] * 10 * fator }));
}
export function diagnosticoOrganico(v: Valores, base: string | null | undefined): Diagnostico {
  const achados: Achado[] = [];
  const fonte = 'MAPA – composto (IN 61/2020)';
  const regra = (ch: string, rotulo: string, un: string, ok: boolean, faixa: string, classeRuim: string, nivelRuim: Nivel = 'fora') => {
    if (!tem(v, ch)) return;
    achados.push({ chave: ch, rotulo, valor: v[ch], unidade: un, classe: ok ? 'atende' : classeRuim, nivel: ok ? 'ok' : nivelRuim, faixa, fonte });
  };
  regra('umidade', 'Umidade', '%', (v.umidade ?? 0) <= 50, 'máximo 50%', 'acima', 'atencao');
  if (tem(v, 'ph')) {
    const ph = v.ph;
    achados.push({ chave: 'ph', rotulo: 'pH', valor: ph, unidade: '', classe: ph < 6 ? 'abaixo' : ph > 8.5 ? 'muito alcalino' : 'atende', nivel: ph < 6 ? 'fora' : ph > 8.5 ? 'atencao' : 'ok', faixa: 'mínimo 6,0', fonte });
  }
  regra('c', 'Carbono orgânico', '%', (v.c ?? 99) >= 15, 'mínimo 15%', 'abaixo');
  regra('cn', 'Relação C/N', '', (v.cn ?? 0) <= 20, 'máximo 20', 'acima (material pouco curtido)');
  regra('n', 'N total', '%', (v.n ?? 99) >= 0.5, 'mínimo 0,5%', 'abaixo');
  for (const p of PARAMETROS_ORGANICO) {
    if (achados.some((a) => a.chave === p.chave) || !tem(v, p.chave)) continue;
    achados.push({ chave: p.chave, rotulo: p.rotulo, valor: v[p.chave], unidade: p.unidade, classe: 'informativo', nivel: 'ok', faixa: null, fonte: 'laudo' });
  }
  const sug: Sugestao[] = [];
  const fora = (ch: string) => achados.find((a) => a.chave === ch && a.nivel !== 'ok');
  if (fora('cn')) sug.push({ titulo: 'Material pouco curtido (C/N alta)', texto: 'No começo ele PRENDE o nitrogênio do solo. Aplique com 30 a 60 dias de antecedência, longe do colo da planta, ou some uma dose extra de nitrogênio mineral. Melhor ainda: pedir ao fornecedor material bem compostado.' });
  if (fora('ph') && (v.ph ?? 0) > 8.5) sug.push({ titulo: 'pH muito alcalino', texto: 'Não misture nem aplique junto com ureia ou adubos amoniacais: perde nitrogênio no ar (volatilização). Espalhe e, se possível, incorpore ou cubra.' });
  if (fora('ph') && (v.ph ?? 7) < 6) sug.push({ titulo: 'pH ácido', texto: 'Abaixo do mínimo para composto: material mal curtido ou fermentando. Peça um lote mais estabilizado.' });
  if (fora('umidade')) sug.push({ titulo: 'Umidade alta', texto: 'Acima de 50% você paga água no frete e no peso. Compare o preço pela matéria seca.' });
  if (fora('n')) sug.push({ titulo: 'Pouco nitrogênio', texto: 'Serve mais como fonte de matéria orgânica, fósforo e cálcio do que de nitrogênio.' });
  sug.push({ titulo: 'Na compra', texto: 'Peça o laudo do lote que vai comprar (cada lote varia) e compare o preço por kg de nutriente entregue, mostrado abaixo.' });
  const obs = [
    base === 'umida' ? 'Teores sobre o produto como vem (base úmida).' : base === 'seca' ? 'Teores sobre a matéria seca: a entrega por tonelada já desconta a umidade.' : 'O laudo não diz se os teores são em base seca ou úmida: o sistema considerou base seca (o mais comum), descontando a umidade.',
    'No primeiro ano, só parte do N e do P do orgânico fica disponível (o resto vai liberando com o tempo); o K fica disponível quase todo.',
  ];
  return { achados, sugestoes: sug, observacoes: obs };
}

// ---------------------------------------------------------------- CORRETIVO (calcário)
export const PARAMETROS_CORRETIVO: { chave: string; rotulo: string; unidade: string; casas: number }[] = [
  { chave: 'umidade', rotulo: 'Umidade', unidade: '%', casas: 2 },
  { chave: 'peneira10', rotulo: 'Passa peneira 10 (2 mm)', unidade: '%', casas: 2 },
  { chave: 'peneira20', rotulo: 'Passa peneira 20 (0,84 mm)', unidade: '%', casas: 2 },
  { chave: 'peneira50', rotulo: 'Passa peneira 50 (0,30 mm)', unidade: '%', casas: 2 },
  { chave: 'pn', rotulo: 'Poder de neutralização (PN)', unidade: '%', casas: 2 },
  { chave: 're', rotulo: 'Reatividade (RE)', unidade: '%', casas: 2 },
  { chave: 'prnt', rotulo: 'PRNT', unidade: '%', casas: 2 },
  { chave: 'cao', rotulo: 'CaO', unidade: '%', casas: 2 },
  { chave: 'mgo', rotulo: 'MgO', unidade: '%', casas: 2 },
  { chave: 'soma_oxidos', rotulo: 'CaO + MgO', unidade: '%', casas: 2 },
];
/** Reatividade pelas peneiras: (P10 − P20) × 0,2 + (P20 − P50) × 0,6 + P50 × 1,0 (percentual que passa). */
export function reatividade(v: Valores): number | null {
  if (!tem(v, 'peneira10') || !tem(v, 'peneira20') || !tem(v, 'peneira50')) return null;
  return (v.peneira10 - v.peneira20) * 0.2 + (v.peneira20 - v.peneira50) * 0.6 + v.peneira50;
}
export function tipoCalcario(mgo: number | null | undefined): string | null {
  if (mgo == null) return null;
  return mgo < 5 ? 'calcítico (MgO abaixo de 5%)' : mgo <= 12 ? 'magnesiano (MgO de 5 a 12%)' : 'dolomítico (MgO acima de 12%)';
}
/** PRNT do laudo; sem ele, calculado por PN × RE / 100. */
export function prntDoLaudo(v: Valores): number | null {
  if (tem(v, 'prnt')) return v.prnt;
  const re = tem(v, 're') ? v.re : reatividade(v);
  return re != null && tem(v, 'pn') ? (v.pn * re) / 100 : null;
}
export function diagnosticoCorretivo(v: Valores): Diagnostico {
  const achados: Achado[] = [];
  const fonte = 'MAPA – calcário agrícola';
  const min = (ch: string, rotulo: string, limite: number, faixa: string) => {
    if (!tem(v, ch)) return;
    const ok = v[ch] >= limite;
    achados.push({ chave: ch, rotulo, valor: v[ch], unidade: '%', classe: ok ? 'atende' : 'abaixo do mínimo', nivel: ok ? 'ok' : 'fora', faixa, fonte });
  };
  min('peneira10', 'Passa peneira 10 (2 mm)', 95, 'mínimo 95%');
  min('peneira20', 'Passa peneira 20 (0,84 mm)', 70, 'mínimo 70%');
  min('peneira50', 'Passa peneira 50 (0,30 mm)', 50, 'mínimo 50%');
  min('pn', 'Poder de neutralização (PN)', 67, 'mínimo 67%');
  const re = tem(v, 're') ? v.re : reatividade(v);
  const prnt = prntDoLaudo(v);
  if (re != null) achados.push({ chave: 're', rotulo: `Reatividade (RE)${tem(v, 're') ? '' : ' – calculada'}`, valor: re, unidade: '%', classe: 'informativo', nivel: 'ok', faixa: null, fonte: 'peneiras do laudo' });
  if (prnt != null) {
    const nivel: Nivel = prnt < 45 ? 'fora' : prnt < 70 ? 'atencao' : 'ok';
    achados.push({ chave: 'prnt', rotulo: `PRNT${tem(v, 'prnt') ? '' : ' – calculado'}`, valor: prnt, unidade: '%', classe: nivel === 'fora' ? 'abaixo do mínimo' : nivel === 'atencao' ? 'baixo (reação lenta)' : 'bom', nivel, faixa: 'mínimo 45%; bom acima de 70%', fonte });
  }
  const soma = tem(v, 'soma_oxidos') ? v.soma_oxidos : tem(v, 'cao') && tem(v, 'mgo') ? v.cao + v.mgo : null;
  if (tem(v, 'cao')) achados.push({ chave: 'cao', rotulo: 'CaO', valor: v.cao, unidade: '%', classe: v.cao > 56 ? 'acima do possível em calcário' : 'informativo', nivel: v.cao > 56 ? 'atencao' : 'ok', faixa: null, fonte: 'laudo' });
  if (tem(v, 'mgo')) achados.push({ chave: 'mgo', rotulo: 'MgO', valor: v.mgo, unidade: '%', classe: tipoCalcario(v.mgo) ?? '', nivel: 'ok', faixa: 'dolomítico: acima de 12%', fonte });
  if (soma != null) achados.push({ chave: 'soma_oxidos', rotulo: 'CaO + MgO', valor: soma, unidade: '%', classe: soma >= 38 ? 'atende' : 'abaixo do mínimo', nivel: soma >= 38 ? 'ok' : 'fora', faixa: 'mínimo 38%', fonte });

  const sug: Sugestao[] = [];
  const obs: string[] = [];
  if (achados.some((a) => a.chave.startsWith('peneira') && a.nivel === 'fora')) sug.push({ titulo: 'Granulometria grossa', texto: 'Fora do mínimo nas peneiras: o calcário reage devagar (parte dele só age depois de anos). Exija do fornecedor o calcário dentro da norma.' });
  if (prnt != null && prnt < 70) {
    sug.push({
      titulo: 'PRNT baixo',
      texto: `Com PRNT ${f(prnt, 0)}% é preciso ${f(90 / prnt, 1)} vezes a quantidade de um calcário de PRNT 90 para o mesmo efeito. Compare pelo custo efetivo: preço da tonelada ÷ PRNT × 100 (ex.: R$ 200/t com PRNT ${f(prnt, 0)} sai a R$ ${f((200 / prnt) * 100, 2)} por tonelada efetiva).`,
    });
  }
  if (tem(v, 'mgo') && v.mgo <= 12) sug.push({ titulo: 'Pouco magnésio', texto: 'Este calcário não é dolomítico. Se o solo ou a folha estiverem com magnésio baixo, prefira o dolomítico (MgO acima de 12%).' });
  if (tem(v, 'cao') && tem(v, 'pn')) {
    const pnTeorico = v.cao * 1.785 + (v.mgo ?? 0) * 2.48;
    if (v.cao > 56 || pnTeorico > v.pn + 15) {
      sug.push({ titulo: 'Laudo para conferir', texto: `Pelos óxidos (CaO ${f(v.cao, 1)}% e MgO ${f(v.mgo ?? 0, 1)}%) o PN deveria ficar perto de ${f(pnTeorico, 0)}%, mas o laudo deu ${f(v.pn, 1)}%${v.cao > 56 ? ', e CaO acima de 56% não existe em calcário puro' : ''}. Pergunte ao laboratório ou ao fornecedor antes de usar esses números.` });
    }
  }
  if (prnt != null) obs.push(`Na conta da calagem, use PRNT ${f(prnt, 0)}% para este calcário.`);
  return { achados, sugestoes: sug, observacoes: obs };
}
