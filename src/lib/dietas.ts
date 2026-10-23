// Cálculos das dietas: consumo estimado, metas de referência, balanço da mistura, alertas e ficha do trato.
// As metas são referências médias e EDITÁVEIS; não substituem o cálculo de exigências do BR-CORTE/NASEM
// nem a avaliação do técnico.

import { formatarMoeda, formatarNumero } from './formatos';

export type Aptidao = 'corte' | 'leite' | 'genetica';
export type TipoGenetica = 'receptoras' | 'doadoras' | 'touros';

export const APTIDOES = [
  { valor: 'corte', rotulo: 'Gado de Corte' },
  { valor: 'leite', rotulo: 'Gado de Leite' },
  { valor: 'genetica', rotulo: 'Genética' },
];
export const ROTULO_APTIDAO: Record<string, string> = { corte: 'Gado de Corte', leite: 'Gado de Leite', genetica: 'Genética' };

export const TIPOS_GENETICA = [
  { valor: 'receptoras', rotulo: 'Receptoras' },
  { valor: 'doadoras', rotulo: 'Doadoras' },
  { valor: 'touros', rotulo: 'Touros' },
];
export const ROTULO_GENETICA: Record<string, string> = { receptoras: 'Receptoras', doadoras: 'Doadoras', touros: 'Touros' };

export const TIPOS_ALIMENTO = [
  { valor: 'volumoso', rotulo: 'Volumoso' },
  { valor: 'concentrado', rotulo: 'Concentrado' },
  { valor: 'mineral', rotulo: 'Mineral' },
  { valor: 'aditivo', rotulo: 'Aditivo' },
];
export const ROTULO_TIPO_ALIMENTO: Record<string, string> = { volumoso: 'Volumoso', concentrado: 'Concentrado', mineral: 'Mineral', aditivo: 'Aditivo' };

export type Item = {
  chave: string;
  alimento_id: string | null;
  nome: string;
  tipo: string;
  kg_mn: number; // kg de matéria natural por cabeça por dia (como vai no cocho)
  ms: number; // % da matéria natural
  pb: number; // % da MS
  ndt: number; // % da MS
  fdn: number; // % da MS
  preco_kg_mn: number | null;
};

export type Metas = { pb: number; ndt: number; fdnMin: number };

/** % do peso vivo usado quando não há equação (corte e genética). */
export function cmsPercPadrao(aptidao: Aptidao): number {
  return aptidao === 'corte' ? 2.3 : 2.0;
}

/**
 * Consumo de matéria seca estimado (kg/cab/dia).
 * Leite: equação do NRC 2001 (vacas em lactação), com a produção corrigida para 4% de gordura
 * e o ajuste pelas semanas de lactação. Corte e Genética: % do peso vivo (editável).
 */
export function cmsEstimado(x: { aptidao: Aptidao; pv: number | null; leite?: number | null; gordura?: number | null; del?: number | null; percPv?: number | null }): number | null {
  if (!x.pv || x.pv <= 0) return null;
  if (x.aptidao === 'leite' && x.leite != null && x.leite > 0) {
    const g = x.gordura ?? 3.5;
    const lcg = 0.4 * x.leite + 15 * x.leite * (g / 100);
    const semanas = (x.del ?? 100) / 7;
    return (0.372 * lcg + 0.0968 * Math.pow(x.pv, 0.75)) * (1 - Math.exp(-0.192 * (semanas + 3.67)));
  }
  const perc = x.percPv ?? cmsPercPadrao(x.aptidao);
  return (x.pv * perc) / 100;
}

/** Metas de referência (% da MS) conforme a aptidão e o desempenho. Todas podem ser alteradas. */
export function metasPadrao(x: { aptidao: Aptidao; gmd?: number | null; leite?: number | null; genetica?: string | null }): Metas {
  if (x.aptidao === 'leite') {
    const l = x.leite ?? 0;
    if (l >= 25) return { pb: 16, ndt: 70, fdnMin: 28 };
    if (l >= 15) return { pb: 15, ndt: 67, fdnMin: 30 };
    return { pb: 13, ndt: 63, fdnMin: 32 };
  }
  if (x.aptidao === 'genetica') {
    if (x.genetica === 'doadoras') return { pb: 14, ndt: 65, fdnMin: 30 };
    if (x.genetica === 'touros') return { pb: 12, ndt: 65, fdnMin: 30 };
    return { pb: 12, ndt: 62, fdnMin: 30 };
  }
  const g = x.gmd ?? 0;
  if (g >= 1.2) return { pb: 13, ndt: 72, fdnMin: 20 };
  if (g >= 0.5) return { pb: 12, ndt: 65, fdnMin: 28 };
  return { pb: 9, ndt: 55, fdnMin: 35 };
}

export type Balanco = {
  kgMn: number;
  kgMs: number;
  pb: number; // % MS
  ndt: number; // % MS
  fdn: number; // % MS
  volumosoPerc: number; // % da MS
  custoCab: number; // R$/cab/dia
  custoKgMs: number | null;
  semPreco: string[];
  ureiaKg: number;
  temMineral: boolean;
};

const temUreia = (nome: string) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('ureia');

export function balanco(itens: Item[]): Balanco {
  let kgMn = 0, kgMs = 0, pb = 0, ndt = 0, fdn = 0, vol = 0, custo = 0, ureia = 0;
  const semPreco: string[] = [];
  for (const i of itens) {
    const ms = (i.kg_mn * i.ms) / 100;
    kgMn += i.kg_mn;
    kgMs += ms;
    pb += ms * i.pb;
    ndt += ms * i.ndt;
    fdn += ms * i.fdn;
    if (i.tipo === 'volumoso') vol += ms;
    if (i.preco_kg_mn != null) custo += i.kg_mn * i.preco_kg_mn;
    else if (i.kg_mn > 0) semPreco.push(i.nome);
    if (temUreia(i.nome)) ureia += i.kg_mn;
  }
  return {
    kgMn,
    kgMs,
    pb: kgMs ? pb / kgMs : 0,
    ndt: kgMs ? ndt / kgMs : 0,
    fdn: kgMs ? fdn / kgMs : 0,
    volumosoPerc: kgMs ? (vol / kgMs) * 100 : 0,
    custoCab: custo,
    custoKgMs: kgMs ? custo / kgMs : null,
    semPreco,
    ureiaKg: ureia,
    temMineral: itens.some((i) => i.tipo === 'mineral' && i.kg_mn > 0),
  };
}

export type Alerta = { nivel: 'vermelho' | 'amarelo'; texto: string };

export function alertas(b: Balanco, x: { metas: Metas; cms: number | null; pv: number | null; aptidao: Aptidao }): Alerta[] {
  const a: Alerta[] = [];
  if (b.kgMs <= 0) return a;
  if (b.fdn < x.metas.fdnMin) a.push({ nivel: 'vermelho', texto: `FDN de ${formatarNumero(b.fdn, 1)}% abaixo do mínimo (${formatarNumero(x.metas.fdnMin, 0)}%). Risco de acidose ruminal.` });
  const ureiaPercMs = (b.ureiaKg / b.kgMs) * 100;
  if (ureiaPercMs > 1) a.push({ nivel: 'vermelho', texto: `Ureia com ${formatarNumero(ureiaPercMs, 2)}% da MS: acima de 1%. Risco de intoxicação.` });
  if (x.pv && b.ureiaKg > 0) {
    const g100 = (b.ureiaKg * 1000) / (x.pv / 100);
    if (g100 > 40) a.push({ nivel: 'vermelho', texto: `Ureia com ${formatarNumero(g100, 0)} g por 100 kg de peso vivo: acima de 40 g.` });
  }
  if (b.pb < x.metas.pb * 0.9) a.push({ nivel: 'vermelho', texto: `Proteína (PB) de ${formatarNumero(b.pb, 1)}%, bem abaixo da meta (${formatarNumero(x.metas.pb, 1)}%).` });
  else if (b.pb < x.metas.pb * 0.97) a.push({ nivel: 'amarelo', texto: `Proteína (PB) um pouco abaixo da meta.` });
  else if (b.pb > x.metas.pb * 1.25) a.push({ nivel: 'amarelo', texto: `Proteína (PB) muito acima da meta: custo sem retorno.` });
  if (b.ndt < x.metas.ndt * 0.93) a.push({ nivel: 'vermelho', texto: `Energia (NDT) de ${formatarNumero(b.ndt, 1)}%, bem abaixo da meta (${formatarNumero(x.metas.ndt, 1)}%).` });
  else if (b.ndt < x.metas.ndt * 0.98) a.push({ nivel: 'amarelo', texto: `Energia (NDT) um pouco abaixo da meta.` });
  if (x.cms) {
    const r = b.kgMs / x.cms;
    if (r < 0.9) a.push({ nivel: 'amarelo', texto: `Oferta de ${formatarNumero(b.kgMs, 2)} kg MS: abaixo do consumo estimado (${formatarNumero(x.cms, 2)} kg).` });
    else if (r > 1.1) a.push({ nivel: 'amarelo', texto: `Oferta de ${formatarNumero(b.kgMs, 2)} kg MS: acima do consumo estimado (${formatarNumero(x.cms, 2)} kg). Pode sobrar no cocho.` });
  }
  if (!b.temMineral) a.push({ nivel: 'amarelo', texto: 'Nenhum mineral na dieta.' });
  if (b.semPreco.length) a.push({ nivel: 'amarelo', texto: `Sem preço: ${b.semPreco.join(', ')}. O custo está incompleto.` });
  return a;
}

/** kg de ganho (corte) ou litros (leite) por kg de MS consumida. */
export function eficiencia(b: Balanco, x: { aptidao: Aptidao; gmd?: number | null; leite?: number | null }): string | null {
  if (!b.kgMs) return null;
  if (x.aptidao === 'leite' && x.leite) return `${formatarNumero(x.leite / b.kgMs, 2)} L de leite por kg de MS`;
  if (x.aptidao === 'corte' && x.gmd) return `${formatarNumero(x.gmd / b.kgMs, 3)} kg de ganho por kg de MS`;
  return null;
}

/** Texto da ficha do trato para mandar ao tratador (WhatsApp etc.). */
export function textoFicha(x: { titulo: string; data: string; cabecas: number; itens: Item[]; b: Balanco }): string {
  const cab = Math.max(x.cabecas, 0);
  const linhas = x.itens
    .filter((i) => i.kg_mn > 0)
    .map((i) => `• ${i.nome}: ${formatarNumero(i.kg_mn, 2)} kg/cab${cab ? ` → ${formatarNumero(i.kg_mn * cab, 1)} kg no total` : ''}`);
  return [
    `FICHA DO TRATO – ${x.titulo}`,
    `Data: ${x.data}${cab ? ` · ${formatarNumero(cab)} cabeças` : ''}`,
    '',
    ...linhas,
    '',
    `Total: ${formatarNumero(x.b.kgMn, 2)} kg/cab${cab ? ` · ${formatarNumero(x.b.kgMn * cab, 1)} kg por dia` : ''} (matéria natural)`,
    x.b.custoCab ? `Custo: ${formatarMoeda(x.b.custoCab)}/cab/dia${cab ? ` · ${formatarMoeda(x.b.custoCab * cab)}/dia no lote` : ''}` : '',
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')
    .trim();
}

/** Linha de composição de um alimento: "MS 32% · PB 7,5% · NDT 64% · FDN 52%" */
export function textoComposicao(a: { ms: any; pb: any; ndt: any; fdn: any }): string {
  const f = (v: any) => formatarNumero(Number(v), Number.isInteger(Number(v)) ? 0 : 1);
  return `MS ${f(a.ms)}% · PB ${f(a.pb)}% · NDT ${f(a.ndt)}% · FDN ${f(a.fdn)}%`;
}
