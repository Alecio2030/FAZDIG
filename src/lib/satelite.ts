// Satélite: índice de vigor (NDVI) do talhão pelas imagens do Sentinel-2 (Copernicus), com histórico e alerta de queda.
// As imagens são lidas no servidor (função "satelite"); aqui fica o histórico guardado no banco e a leitura dos números.
import { consulta, supabase } from './supabase';
import { hojeBanco } from './datas';
import { somarDias } from './clima';
import { areaM2, doGeoJson } from './pastos';

export type Indice = { data: string; ndvi: number; ndvi_min: number | null; ndvi_max: number | null; cobertura: number };

/** Cobertura mínima (parte do talhão sem nuvem) para a passagem contar no histórico. */
export const COBERTURA_MINIMA = 0.6;
/** Queda do NDVI, em relação à média das passagens anteriores, que acende o alerta. */
export const QUEDA_ALERTA = 0.08;
const DIAS_HISTORICO = 180;

async function chamar(corpo: object, padrao: string): Promise<{ d: any } | { erro: string }> {
  const { data: d, error } = await supabase.functions.invoke('satelite', { body: corpo });
  if (error) {
    let msg = padrao;
    try {
      const j = await (error as any).context?.json();
      if (j?.erro) msg = j.erro;
    } catch {
      /* mantém a mensagem padrão */
    }
    return { erro: msg };
  }
  return { d };
}

/** Histórico guardado do talhão, da passagem mais nova para a mais antiga (só as com o talhão limpo de nuvem). */
export async function lerIndices(areaId: string, limite = 80): Promise<Indice[]> {
  const r = await consulta<any[]>(supabase.from('satelite_indices').select('data, ndvi, ndvi_min, ndvi_max, cobertura').eq('area_id', areaId).gte('cobertura', COBERTURA_MINIMA).order('data', { ascending: false }).limit(limite));
  return r.map((x) => ({ data: x.data, ndvi: Number(x.ndvi), ndvi_min: x.ndvi_min != null ? Number(x.ndvi_min) : null, ndvi_max: x.ndvi_max != null ? Number(x.ndvi_max) : null, cobertura: Number(x.cobertura) }));
}

/** O satélite passa a cada 5 dias: vale consultar de novo se a última consulta tem mais de 20 horas. */
export const precisaAtualizar = (sateliteEm: string | null | undefined) => !sateliteEm || Date.now() - new Date(sateliteEm).getTime() > 20 * 3600000;

/**
 * Busca no satélite as passagens novas (desde a última guardada; na primeira vez, 180 dias) e guarda no banco.
 * Devolve quantas passagens limpas entraram, ou a mensagem de erro.
 */
export async function atualizarIndices(area: { id: string; fazenda_id: string; geometria: any }): Promise<{ novas: number } | { erro: string }> {
  const pontos = doGeoJson(area.geometria);
  if (pontos.length < 3) return { erro: 'O talhão ainda não tem o contorno desenhado no mapa.' };
  const hoje = hojeBanco();
  const ult = await consulta<any[]>(supabase.from('satelite_indices').select('data').eq('area_id', area.id).order('data', { ascending: false }).limit(1));
  const inicio = ult[0]?.data ? somarDias(ult[0].data, 1) : somarDias(hoje, -DIAS_HISTORICO);
  if (inicio > hoje) return { novas: 0 };
  const r = await chamar({ acao: 'indice', geometria: area.geometria, inicio, fim: hoje }, 'Não foi possível ler o satélite agora.');
  if ('erro' in r) return r;
  // parte do talhão que o satélite viu sem nuvem: pixels limpos ÷ pixels que cabem no contorno (pixel de 0,0001 grau)
  const lat = (pontos.reduce((s, p) => s + p[0], 0) / pontos.length) * (Math.PI / 180);
  const pixelM2 = 0.0001 * 111320 * Math.cos(lat) * (0.0001 * 110540);
  const esperados = Math.max(1, areaM2(pontos) / pixelM2);
  const linhas = ((r.d?.dados ?? []) as any[])
    .filter((x) => x?.data && Number.isFinite(Number(x.ndvi)))
    .map((x) => ({
      fazenda_id: area.fazenda_id,
      area_id: area.id,
      data: x.data,
      ndvi: Math.round(Number(x.ndvi) * 1000) / 1000,
      ndvi_min: Number.isFinite(Number(x.min)) ? Math.round(Number(x.min) * 1000) / 1000 : null,
      ndvi_max: Number.isFinite(Number(x.max)) ? Math.round(Number(x.max) * 1000) / 1000 : null,
      cobertura: Math.round(Math.min(1, Number(x.validos) / esperados) * 100) / 100,
    }));
  if (linhas.length) {
    const { error } = await supabase.from('satelite_indices').upsert(linhas, { onConflict: 'area_id,data' });
    if (error) return { erro: 'O satélite respondeu, mas não foi possível guardar o histórico.' };
  }
  // marca a hora da consulta (quem tem acesso só de lançamento pode não conseguir gravar: não faz mal)
  await supabase.from('areas').update({ satelite_em: new Date().toISOString() }).eq('id', area.id).then(() => undefined, () => undefined);
  return { novas: linhas.filter((l) => l.cobertura >= COBERTURA_MINIMA).length };
}

/** Mapa colorido do NDVI do talhão num dia (PNG em base64). */
export async function imagemNdvi(geometria: any, data: string): Promise<{ uri: string; largura: number; altura: number } | { erro: string }> {
  const r = await chamar({ acao: 'imagem', geometria, data }, 'Não foi possível buscar a imagem agora.');
  if ('erro' in r) return r;
  if (!r.d?.imagem) return { erro: r.d?.erro ?? 'O satélite não devolveu a imagem.' };
  return { uri: `data:image/png;base64,${r.d.imagem}`, largura: Number(r.d.largura) || 1, altura: Number(r.d.altura) || 1 };
}

/** Faixas do NDVI (as mesmas cores da imagem). Em café adulto bem enfolhado o normal é de 0,7 para cima. */
export const FAIXAS: { ate: number; cor: string; rotulo: string }[] = [
  { ate: 0.2, cor: '#A64026', rotulo: 'solo exposto' },
  { ate: 0.35, cor: '#E67326', rotulo: 'muito baixo' },
  { ate: 0.5, cor: '#FACC40', rotulo: 'baixo' },
  { ate: 0.6, cor: '#CCE059', rotulo: 'médio' },
  { ate: 0.7, cor: '#80C74D', rotulo: 'bom' },
  { ate: 0.8, cor: '#339E40', rotulo: 'alto' },
  { ate: 2, cor: '#0D6626', rotulo: 'muito alto' },
];
export const faixaDe = (ndvi: number) => FAIXAS.find((f) => ndvi < f.ate) ?? FAIXAS[FAIXAS.length - 1];

export type Leitura = {
  ultimo: Indice;
  anterior: Indice | null;
  /** diferença para a passagem anterior */
  variacao: number | null;
  /** média das até 3 passagens anteriores e a diferença para ela */
  base: number | null;
  diferencaBase: number | null;
  queda: boolean;
  /** dias desde a última imagem limpa */
  diasSemImagem: number;
};

/** Lê o histórico (do mais novo para o mais antigo): último valor, variação e se há queda de vigor. */
export function lerHistorico(indices: Indice[], hoje = hojeBanco()): Leitura | null {
  if (!indices.length) return null;
  const [ultimo, ...resto] = indices;
  const tres = resto.slice(0, 3);
  const base = tres.length ? tres.reduce((s, x) => s + x.ndvi, 0) / tres.length : null;
  const diferencaBase = base != null ? ultimo.ndvi - base : null;
  return {
    ultimo,
    anterior: resto[0] ?? null,
    variacao: resto[0] ? ultimo.ndvi - resto[0].ndvi : null,
    base,
    diferencaBase,
    queda: diferencaBase != null && diferencaBase <= -QUEDA_ALERTA,
    diasSemImagem: Math.round((Date.parse(hoje) - Date.parse(ultimo.data)) / 86400000),
  };
}

/** 0,734 -> "0,73" */
export const textoNdvi = (v: number) => v.toFixed(2).replace('.', ',');
/** +0,05 / −0,08 */
export const textoVariacaoNdvi = (v: number) => `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${Math.abs(v).toFixed(2).replace('.', ',')}`;
