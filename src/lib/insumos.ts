// Categorias e unidades dos insumos. A unidade é sugerida pela categoria.

// unidade = sugestão de unidade de COMPRA; consumo = sugestão de unidade de CONSUMO
import { formatarNumero, formatarQtd, numeroParaCampo } from './formatos';
export const CATEGORIAS_INSUMO = [
  { valor: 'fertilizante', rotulo: 'Fertilizante (químico)', unidade: 'sc', consumo: 'kg' },
  { valor: 'adubo', rotulo: 'Adubo orgânico', unidade: 't', consumo: 'kg' },
  { valor: 'defensivo', rotulo: 'Defensivo', unidade: 'L', consumo: 'mL' },
  { valor: 'semente', rotulo: 'Semente ou muda', unidade: 'un', consumo: 'un' },
  { valor: 'vacina', rotulo: 'Vacina', unidade: 'frasco', consumo: 'dose' },
  { valor: 'medicamento', rotulo: 'Medicamento', unidade: 'frasco', consumo: 'mL' },
  { valor: 'sal_mineral', rotulo: 'Sal mineral', unidade: 'sc', consumo: 'kg' },
  { valor: 'racao', rotulo: 'Ração', unidade: 'sc', consumo: 'kg' },
  { valor: 'semen', rotulo: 'Sêmen', unidade: 'palheta', consumo: 'palheta' },
  { valor: 'peca', rotulo: 'Peça / manutenção', unidade: 'un', consumo: 'un' },
  { valor: 'combustivel', rotulo: 'Combustível', unidade: 'L', consumo: 'L' },
  { valor: 'outro', rotulo: 'Outro', unidade: 'un', consumo: 'un' },
];
export const ROTULO_CATEGORIA_INSUMO: Record<string, string> = Object.fromEntries(CATEGORIAS_INSUMO.map((c) => [c.valor, c.rotulo]));

export const UNIDADES = [
  { valor: 'kg', rotulo: 'kg' },
  { valor: 'g', rotulo: 'g' },
  { valor: 't', rotulo: 'tonelada' },
  { valor: 'sc', rotulo: 'saco' },
  { valor: 'L', rotulo: 'litro' },
  { valor: 'mL', rotulo: 'mL' },
  { valor: 'dose', rotulo: 'dose' },
  { valor: 'frasco', rotulo: 'frasco' },
  { valor: 'un', rotulo: 'unidade' },
  { valor: 'cx', rotulo: 'caixa' },
  { valor: 'bigbag', rotulo: 'big bag' },
  { valor: 'galao', rotulo: 'galão' },
  { valor: 'rolo', rotulo: 'rolo' },
  { valor: 'm', rotulo: 'metro' },
  { valor: 'palheta', rotulo: 'palheta' },
];

/** Grupo do produto (como no arquivo de produtos): Sanidade, Nutrição, Genética, Agricultura, Manutenção. */
export const GRUPO_CATEGORIA: Record<string, string> = {
  vacina: 'Sanidade', medicamento: 'Sanidade',
  sal_mineral: 'Nutrição', racao: 'Nutrição',
  semen: 'Genética',
  fertilizante: 'Agricultura', adubo: 'Agricultura', defensivo: 'Agricultura', semente: 'Agricultura',
  peca: 'Manutenção', combustivel: 'Manutenção', outro: 'Outros',
};

/** Custo do produto pelas entradas com valor: último custo e custo médio ponderado (por unidade de compra). */
export function custosDe(movs: { tipo: string; quantidade: any; valor_unitario: any; data: string }[]): { ultimo: number | null; medio: number | null } {
  const ent = movs.filter((m) => m.tipo === 'entrada' && Number(m.valor_unitario) > 0).sort((a, b) => (a.data < b.data ? -1 : 1));
  if (!ent.length) return { ultimo: null, medio: null };
  const q = ent.reduce((s, m) => s + Number(m.quantidade), 0);
  const v = ent.reduce((s, m) => s + Number(m.quantidade) * Number(m.valor_unitario), 0);
  return { ultimo: Number(ent[ent.length - 1].valor_unitario), medio: q ? v / q : null };
}

/** Saldo de estoque: entradas menos saídas, mais ajustes (o ajuste já vem com sinal). */
export function saldoDe(movs: { tipo: string; quantidade: number | string }[]): number {
  return movs.reduce((s, m) => {
    const q = Number(m.quantidade);
    return m.tipo === 'saida' ? s - q : s + q;
  }, 0);
}

// ===== Dados de uso veterinário (vacinas e medicamentos) =====

export const CATEGORIAS_VETERINARIAS = ['vacina', 'medicamento'];

export const VIAS_APLICACAO = [
  { valor: 'subcutanea', rotulo: 'Subcutânea' },
  { valor: 'intramuscular', rotulo: 'Intramuscular' },
  { valor: 'oral', rotulo: 'Oral' },
  { valor: 'pour_on', rotulo: 'Pour-on' },
  { valor: 'intravenosa', rotulo: 'Intravenosa' },
  { valor: 'outra', rotulo: 'Outra' },
];
const ROTULO_VIA: Record<string, string> = Object.fromEntries(VIAS_APLICACAO.map((v) => [v.valor, v.rotulo]));
export const MAX_VIAS = 2;
/** Vias gravadas juntas no banco: "subcutanea,intramuscular". */
const viasDoBanco = (t: string | null | undefined) => (t ? t.split(',').filter(Boolean) : []);
/** "via subcutânea ou intramuscular" */
export const textoVias = (t: string | null | undefined) => {
  const v = viasDoBanco(t).map((x) => ROTULO_VIA[x]?.toLowerCase() ?? x);
  return v.length ? `via ${v.join(' ou ')}` : null;
};

export type UsoVet = {
  principio: string;
  indicacoes: string;
  via: string[];
  dose: string;
  dosePor: string[]; // 'cabeca' | 'kg'
  cadaKg: string;
  esquema: string[]; // 'unica' | 'reforco'
  reforcosQtd: string;
  reforcoDias: string;
  doseReforco: string;
  carenciaCarne: string;
  carenciaLeite: string;
};

export const USO_VAZIO: UsoVet = {
  principio: '', indicacoes: '', via: [], dose: '', dosePor: ['cabeca'], cadaKg: '', esquema: ['unica'],
  reforcosQtd: '', reforcoDias: '', doseReforco: '', carenciaCarne: '', carenciaLeite: '',
};

const txt = (n: number | null | undefined) => numeroParaCampo(n);
const numOuNulo = (t: string) => {
  const v = t.trim() ? Number(t.replace(/\./g, '').replace(',', '.')) : NaN;
  return Number.isFinite(v) ? v : null;
};

export function usoDoBanco(i: any): UsoVet {
  return {
    principio: i.principio_ativo ?? '',
    indicacoes: i.indicacoes ?? '',
    via: viasDoBanco(i.via_aplicacao).slice(0, MAX_VIAS),
    dose: txt(i.dose_recomendada),
    dosePor: [i.dose_por ?? 'cabeca'],
    cadaKg: txt(i.dose_cada_kg),
    esquema: [(i.reforcos_qtd ?? 0) > 0 ? 'reforco' : 'unica'],
    reforcosQtd: i.reforcos_qtd ? String(i.reforcos_qtd) : '',
    reforcoDias: i.reforco_dias ? String(i.reforco_dias) : '',
    doseReforco: txt(i.dose_reforco),
    carenciaCarne: i.carencia_carne_dias !== null && i.carencia_carne_dias !== undefined ? String(i.carencia_carne_dias) : '',
    carenciaLeite: i.carencia_leite_dias !== null && i.carencia_leite_dias !== undefined ? String(i.carencia_leite_dias) : '',
  };
}

export function usoParaBanco(u: UsoVet) {
  const reforco = u.esquema[0] === 'reforco';
  return {
    principio_ativo: u.principio.trim() || null,
    indicacoes: u.indicacoes.trim() || null,
    via_aplicacao: u.via.length ? u.via.slice(0, MAX_VIAS).join(',') : null,
    dose_recomendada: numOuNulo(u.dose),
    dose_por: u.dosePor[0] ?? 'cabeca',
    dose_cada_kg: u.dosePor[0] === 'kg' ? numOuNulo(u.cadaKg) : null,
    reforcos_qtd: reforco ? Number(u.reforcosQtd || 0) : 0,
    reforco_dias: reforco ? Number(u.reforcoDias || 0) || null : null,
    dose_reforco: reforco ? numOuNulo(u.doseReforco) : null,
    carencia_carne_dias: u.carenciaCarne.trim() ? Number(u.carenciaCarne) : null,
    carencia_leite_dias: u.carenciaLeite.trim() ? Number(u.carenciaLeite) : null,
  };
}

/**
 * Confere os dados de uso campo a campo: { dose, reforco } com a mensagem de cada problema.
 * obrigatoria = true exige a dose recomendada (vacina e medicamento sempre têm).
 */
export function errosUso(u: UsoVet, obrigatoria = true): Record<string, string> {
  const e: Record<string, string> = {};
  const dose = numOuNulo(u.dose);
  if (u.dose.trim() && !dose) e.dose = 'Dose recomendada inválida.';
  else if (obrigatoria && !dose) e.dose = 'Informe a dose recomendada (sem ela o produto não pode ser aplicado).';
  if (!e.dose && u.dosePor[0] === 'kg' && (dose || u.cadaKg.trim()) && !numOuNulo(u.cadaKg)) e.dose = 'Dose por peso: informe para cada quantos kg (ex.: 1 mL para cada 100 kg).';
  if (u.esquema[0] === 'reforco') {
    const q = Number(u.reforcosQtd || 0);
    if (q < 1 || q > 10) e.reforco = 'Com reforço: informe quantos reforços (1 a 10), ou marque "Dose única".';
    else if (!Number(u.reforcoDias)) e.reforco = 'Com reforço: informe a cada quantos dias.';
    else if (u.doseReforco.trim() && !numOuNulo(u.doseReforco)) e.reforco = 'Dose do reforço inválida.';
  }
  return e;
}

/** Primeiro problema dos dados de uso (sem exigir a dose) ou null. */
export function erroUso(u: UsoVet): string | null {
  return Object.values(errosUso(u, false))[0] ?? null;
}

/** Vacina e medicamento sempre com dose recomendada (sem ela não se aplica na Sanidade). */
export function erroDoseObrigatoria(u: UsoVet): string | null {
  if (!numOuNulo(u.dose)) return 'Informe a dose recomendada: sem ela o produto não pode ser aplicado.';
  if (u.dosePor[0] === 'kg' && !numOuNulo(u.cadaKg)) return 'Dose por peso: informe para cada quantos kg.';
  return null;
}

/** Só a dose: "1 mL para cada 100 kg de peso vivo" ou "5 mL por cabeça". */
export function textoDose(i: any, unidadeEstoque: string): string | null {
  const unidade = i.unidade_dose || unidadeEstoque;
  if (!i.dose_recomendada) return null;
  return i.dose_por === 'kg' && i.dose_cada_kg
    ? `${txt(i.dose_recomendada)} ${unidade} para cada ${txt(i.dose_cada_kg)} kg de peso vivo`
    : `${txt(i.dose_recomendada)} ${unidade} por cabeça`;
}

/** O resto da recomendação: esquema, via e carência. */
export function textoOutrosUso(i: any, unidadeEstoque: string): string | null {
  const unidade = i.unidade_dose || unidadeEstoque;
  const partes: string[] = [];
  if ((i.reforcos_qtd ?? 0) > 0) partes.push(`${i.reforcos_qtd} ${i.reforcos_qtd === 1 ? 'reforço' : 'reforços'} a cada ${i.reforco_dias} dias${i.dose_reforco ? ` (${txt(i.dose_reforco)} ${unidade})` : ''}`);
  else partes.push('dose única');
  if (i.via_aplicacao) partes.push(textoVias(i.via_aplicacao)!);
  if (i.carencia_carne_dias != null) partes.push(`carência para abate ${i.carencia_carne_dias} dias`);
  if (i.carencia_leite_dias != null) partes.push(`leite ${i.carencia_leite_dias} dias`);
  return partes.join('; ');
}

/** "5 mL por cabeça" ou "1 mL a cada 50 kg de peso vivo"; mais esquema e carência. */
export function textoRecomendacao(i: any, unidadeEstoque: string): string | null {
  const partes: string[] = [];
  const unidade = i.unidade_dose || unidadeEstoque;
  if (i.dose_recomendada) {
    partes.push(
      i.dose_por === 'kg' && i.dose_cada_kg
        ? `${txt(i.dose_recomendada)} ${unidade} para cada ${txt(i.dose_cada_kg)} kg de peso vivo`
        : `${txt(i.dose_recomendada)} ${unidade} por cabeça`,
    );
  }
  if ((i.reforcos_qtd ?? 0) > 0) {
    partes.push(`${i.reforcos_qtd} ${i.reforcos_qtd === 1 ? 'reforço' : 'reforços'} a cada ${i.reforco_dias} dias${i.dose_reforco ? ` (${txt(i.dose_reforco)} ${unidade})` : ''}`);
  } else if (i.dose_recomendada) partes.push('dose única');
  if (i.via_aplicacao) partes.push(textoVias(i.via_aplicacao)!);
  if (i.carencia_carne_dias != null) partes.push(`carência para abate ${i.carencia_carne_dias} dias`);
  if (i.carencia_leite_dias != null) partes.push(`leite ${i.carencia_leite_dias} dias`);
  return partes.length ? partes.join('; ') : null;
}

/** Unidade em que se aplica e quanto dela há em 1 unidade de estoque (1 se for a mesma). */
export function unidadeDeDose(i: any): { unidade: string; fator: number } {
  const outra = i.unidade_dose && i.unidade_dose !== i.unidade;
  return { unidade: outra ? i.unidade_dose : i.unidade, fator: outra ? Number(i.conteudo_por_unidade) || 1 : 1 };
}

/**
 * Dose recomendada por cabeça para o peso informado.
 * Por peso vivo: peso ÷ peso base × dose (ex.: 450 ÷ 100 × 1 mL = 4,5 mL). Por cabeça: a própria dose.
 * reforco = true usa a dose do reforço (se o cadastro tiver uma diferente).
 */
export function doseRecomendada(i: any, peso: number | null, reforco = false): number | null {
  const base = reforco && i.dose_reforco ? Number(i.dose_reforco) : Number(i.dose_recomendada);
  if (!base) return null;
  if (i.dose_por !== 'kg') return base;
  const cada = Number(i.dose_cada_kg);
  if (!cada || !peso) return null;
  return Math.round(((peso / cada) * base) * 100) / 100;
}

// ===== Unidade de compra e unidade de consumo =====
// O estoque é contado na unidade de COMPRA (ex.: saco); o consumo é lançado na de CONSUMO (ex.: kg).
// Na unidade de compra informa-se quanto ela tem (ex.: Saco: 50 kg); a conversão para a unidade de
// consumo sai sozinha (1 saco = 50 kg, ou 50.000 g se o consumo for em g).

/** Nome por extenso da unidade ("sc" -> "saco"). */
export const ROTULO_UNIDADE: Record<string, string> = Object.fromEntries(UNIDADES.map((u) => [u.valor, u.rotulo]));
export const nomeUnidade = (u: string | null | undefined) => (u ? ROTULO_UNIDADE[u] ?? u : '');

/** Unidades de compra que são embalagem: precisam dizer quanto têm dentro. */
const EMBALAGENS = ['sc', 'frasco', 'cx', 'bigbag', 'galao', 'rolo', 'un', 'palheta'];
export const ehEmbalagem = (u: string | null | undefined) => !!u && EMBALAGENS.includes(u);

/** Medidas do conteúdo da embalagem. */
export const MEDIDAS = [
  { valor: 'kg', rotulo: 'kg' },
  { valor: 'g', rotulo: 'g' },
  { valor: 't', rotulo: 'tonelada' },
  { valor: 'L', rotulo: 'litro' },
  { valor: 'mL', rotulo: 'mL' },
  { valor: 'dose', rotulo: 'dose' },
  { valor: 'm', rotulo: 'metro' },
  { valor: 'un', rotulo: 'unidade' },
];
/** Medida sugerida para cada embalagem. */
const MEDIDA_PADRAO: Record<string, string> = { sc: 'kg', bigbag: 'kg', frasco: 'mL', galao: 'L', rolo: 'm', cx: 'un', palheta: 'dose' };

const GRANDEZA: Record<string, { grupo: string; fator: number }> = {
  g: { grupo: 'massa', fator: 1 }, kg: { grupo: 'massa', fator: 1000 }, t: { grupo: 'massa', fator: 1e6 },
  mL: { grupo: 'volume', fator: 1 }, L: { grupo: 'volume', fator: 1000 },
};
/** Quantos "para" há em 1 "de" (kg -> g = 1000). null se não dá para converter (kg -> dose). */
export function fatorEntre(de: string | null | undefined, para: string | null | undefined): number | null {
  if (!de || !para) return null;
  if (de === para) return 1;
  const a = GRANDEZA[de];
  const b = GRANDEZA[para];
  return a && b && a.grupo === b.grupo ? a.fator / b.fator : null;
}

/**
 * compra/consumo: as unidades; qtd + medida: quanto tem em 1 unidade de compra (Saco: 50 kg);
 * conteudo: só quando a conversão não sai sozinha (ex.: frasco de 50 mL aplicado em dose).
 */
export type Unidades = { compra: string[]; qtd: string; medida: string[]; consumo: string[]; conteudo: string };

/** Medida sugerida para a embalagem: a do consumo, se servir; senão a padrão da embalagem. */
export function medidaSugerida(compra: string | undefined, consumo: string | undefined): string[] {
  if (!ehEmbalagem(compra)) return [];
  if (consumo && consumo !== compra && MEDIDAS.some((m) => m.valor === consumo)) return [consumo];
  const m = MEDIDA_PADRAO[compra!];
  return m ? [m] : [];
}

/** Unidades de um cadastro novo. */
export const unidadesNovas = (compra?: string, consumo?: string): Unidades => ({
  compra: compra ? [compra] : [],
  qtd: '',
  medida: medidaSugerida(compra, consumo),
  consumo: consumo ? [consumo] : [],
  conteudo: '',
});

const arred = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Conversão da unidade de compra para a de consumo.
 * fator = quanto da unidade de consumo há em 1 de compra (null enquanto falta dado);
 * automatica = saiu sozinha das medidas; falta = o que ainda precisa ser informado.
 */
export function conversaoDe(u: Unidades): { fator: number | null; automatica: boolean; falta: 'conteudo' | 'manual' | null } {
  const c = u.compra[0];
  const k = u.consumo[0];
  if (!c || !k) return { fator: null, automatica: false, falta: null };
  if (c === k) return { fator: 1, automatica: true, falta: null };
  const manual = numOuNulo(u.conteudo);
  if (!ehEmbalagem(c)) {
    const f = fatorEntre(c, k);
    if (f !== null) return { fator: f, automatica: true, falta: null };
    return { fator: manual && manual > 0 ? manual : null, automatica: false, falta: manual && manual > 0 ? null : 'manual' };
  }
  const q = numOuNulo(u.qtd);
  const m = u.medida[0];
  if (!q || q <= 0 || !m) return { fator: null, automatica: false, falta: 'conteudo' };
  const f = fatorEntre(m, k);
  if (f !== null) return { fator: arred(q * f), automatica: true, falta: null };
  return { fator: manual && manual > 0 ? manual : null, automatica: false, falta: manual && manual > 0 ? null : 'manual' };
}

export function unidadesDoBanco(i: any): Unidades {
  const compra = i.unidade as string | undefined;
  const consumo = (i.unidade_dose || i.unidade) as string | undefined;
  const fator = Number(i.conteudo_por_unidade) || null;
  let qtd = '';
  let medida: string[] = [];
  if (ehEmbalagem(compra)) {
    if (i.conteudo_qtd && i.conteudo_medida) {
      qtd = txt(i.conteudo_qtd);
      medida = [i.conteudo_medida];
    } else if (fator && i.unidade_dose && i.unidade_dose !== compra) {
      // cadastro anterior a esta versão: o conteúdo estava na unidade de consumo
      qtd = txt(fator);
      medida = [i.unidade_dose];
    } else medida = medidaSugerida(compra, consumo);
  }
  const u: Unidades = { compra: compra ? [compra] : [], qtd, medida, consumo: consumo ? [consumo] : [], conteudo: '' };
  // conversão que não sai sozinha: mantém a que estava gravada
  if (!conversaoDe(u).automatica && fator) u.conteudo = txt(fator);
  return u;
}

export function unidadesParaBanco(u: Unidades) {
  const c = u.compra[0];
  const outra = !!u.consumo[0] && u.consumo[0] !== c;
  const q = ehEmbalagem(c) ? numOuNulo(u.qtd) : null;
  const m = q && q > 0 ? u.medida[0] ?? null : null;
  return {
    unidade: c,
    unidade_dose: outra ? u.consumo[0] : null,
    conteudo_por_unidade: outra ? conversaoDe(u).fator : null,
    conteudo_qtd: m ? q : null,
    conteudo_medida: m,
  };
}

export function erroUnidades(u: Unidades): string | null {
  const c = u.compra[0];
  const k = u.consumo[0];
  if (!c) return 'Escolha a unidade de compra.';
  if (ehEmbalagem(c) && u.qtd.trim()) {
    const q = numOuNulo(u.qtd);
    if (!q || q <= 0) return `Quantidade de 1 ${nomeUnidade(c)} inválida.`;
    if (!u.medida[0]) return `Escolha a medida do conteúdo de 1 ${nomeUnidade(c)} (kg, litro...).`;
  }
  if (!k) return 'Escolha a unidade de consumo.';
  const conv = conversaoDe(u);
  if (conv.falta === 'conteudo') return `Informe quanto tem em 1 ${nomeUnidade(c)} (ex.: ${nomeUnidade(c)}: 50 ${u.medida[0] ?? 'kg'}).`;
  if (conv.falta === 'manual') return `Informe quanto 1 ${nomeUnidade(c)} tem em ${k}.`;
  return null;
}

/** "1 saco = 50 kg" (a conversão para a unidade de consumo); null se não há ou falta dado. */
export function textoConversao(u: Unidades): string | null {
  const c = u.compra[0];
  const k = u.consumo[0];
  const f = conversaoDe(u).fator;
  if (!c || !k || c === k || !f) return null;
  return `1 ${nomeUnidade(c)} = ${formatarQtd(f, 4)} ${k}`;
}

/** Como o produto é comprado e consumido: "compra em saco de 50 kg · consumo em g (1 saco = 50.000 g)". */
export function textoUnidades(i: any): string {
  const u = unidadesDoBanco(i);
  const c = u.compra[0];
  const k = u.consumo[0];
  let t = `compra em ${nomeUnidade(c)}`;
  if (u.qtd && u.medida[0]) t += ` de ${u.qtd} ${u.medida[0]}`;
  if (k && k !== c) {
    t += ` · consumo em ${k}`;
    const conv = textoConversao(u);
    if (conv && !(u.medida[0] === k && u.qtd)) t += ` (${conv})`;
  }
  return t;
}

/** Embalagem do cadastro: quanto tem 1 unidade de compra ("saco de 50 kg" -> { qtd: 50, medida: 'kg' }). null se não é embalagem ou não tem. */
export function embalagemDe(i: any): { qtd: number; medida: string } | null {
  if (!i || !ehEmbalagem(i.unidade)) return null;
  const u = unidadesDoBanco(i);
  const q = numOuNulo(u.qtd);
  return q && q > 0 && u.medida[0] ? { qtd: q, medida: u.medida[0] } : null;
}

/** Saldo na unidade de compra, com o equivalente na de consumo: "2,55 frasco (255 mL)". */
export function textoSaldo(saldo: number, i: any): string {
  const casas = Number.isInteger(saldo) ? 0 : 2;
  const base = `${formatarNumero(saldo, casas)} ${i.unidade}`;
  const u = unidadeDeDose(i);
  if (u.fator === 1) return base;
  const eq = saldo * u.fator;
  return `${base} (${formatarNumero(eq, Number.isInteger(eq) ? 0 : 1)} ${u.unidade})`;
}
