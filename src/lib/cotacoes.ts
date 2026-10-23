// Cotação do café conilon (CCCV Vitória e Cooabriel, pelo site Notícias Agrícolas) e a informada à mão.
import { consulta, supabase } from './supabase';
import { hojeBanco } from './datas';

export type Cotacao = { data: string; fonte: string; tipo: string; preco: number; variacao: number | null; origem: 'site' | 'manual'; buscado_em: string };

/** Cotações dos últimos dias, da mais nova para a mais antiga. */
export async function lerCotacoes(dias = 20): Promise<Cotacao[]> {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r = await consulta<any[]>(supabase.from('cafe_cotacoes').select('data, fonte, tipo, preco, variacao, origem, buscado_em').gte('data', desde).order('data', { ascending: false }).order('fonte').order('tipo'));
  return r.map((c) => ({ ...c, preco: Number(c.preco), variacao: c.variacao != null ? Number(c.variacao) : null }));
}

/** A mais recente de cada fonte e tipo. */
export function ultimasCotacoes(cots: Cotacao[]): Cotacao[] {
  const m: Record<string, Cotacao> = {};
  for (const c of cots) {
    const k = `${c.fonte}|${c.tipo}`;
    if (!m[k] || c.data > m[k].data) m[k] = c;
  }
  return Object.values(m).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : peso(a) - peso(b) || a.tipo.localeCompare(b.tipo)));
}
/** Na mesma data: a informada à mão vale mais (é o preço da praça do produtor), depois a Cooabriel, depois a de Vitória. */
const peso = (c: Cotacao) => (c.origem === 'manual' ? 0 : /cooabriel/i.test(c.fonte) ? 1 : 2);

/**
 * Cotação de referência para um tipo de café (6, 7, 7/8, 8...): a mais recente do mesmo tipo;
 * se o tipo não tiver cotação, a do tipo 7; se não houver, a mais recente que existir.
 */
export function cotacaoReferencia(cots: Cotacao[], tipo?: string | null): Cotacao | null {
  const ult = ultimasCotacoes(cots);
  const limpo = (tipo ?? '').trim();
  return ult.find((c) => c.tipo === limpo) ?? ult.find((c) => c.tipo === '7') ?? ult[0] ?? null;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca a cotação no site agora (leva uns 5 segundos). Devolve a data do último fechamento ou a mensagem de erro. */
export async function atualizarCotacoes(): Promise<{ data?: string | null; erro?: string }> {
  const { error } = await supabase.rpc('cafe_cotacao_pedir');
  if (error) return { erro: 'Não foi possível pedir a cotação agora.' };
  for (let i = 0; i < 8; i++) {
    await esperar(i === 0 ? 3500 : 2500);
    const { data: r, error: e } = await supabase.rpc('cafe_cotacao_processar');
    if (e) return { erro: 'Não foi possível ler a cotação agora.' };
    const res = r as { pronto: boolean; erro?: string; data?: string | null };
    if (res.pronto) return res.erro ? { erro: res.erro } : { data: res.data ?? null };
  }
  return { erro: 'O site das cotações está demorando a responder. Tente de novo em instantes.' };
}

/** Vale a pena buscar de novo? Sem nenhuma cotação, ou a última busca tem mais de 3 horas e o último fechamento não é de hoje. */
export function cotacaoVelha(cots: Cotacao[]): boolean {
  const site = cots.filter((c) => c.origem === 'site');
  if (!site.length) return true;
  const ultimaBusca = site.reduce((m, c) => (c.buscado_em > m ? c.buscado_em : m), '');
  const horas = (Date.now() - new Date(ultimaBusca).getTime()) / 3600000;
  return horas > 3 && site[0].data < hojeBanco();
}

/** "+1,06%" / "−0,96%" */
export const textoVariacao = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2).replace('.', ',')}%`);
