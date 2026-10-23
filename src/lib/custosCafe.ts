// Custo por saca e resultado da safra de café.
// Junta o custo da lavoura (insumos aplicados, serviços das compras e exaustão, como no painel do talhão), a colheita,
// a secagem, a pilagem e a armazenagem, e compara com as vendas de café, pela origem de cada lote (talhão e safra).
import { consulta, supabase } from './supabase';
import { hojeBanco } from './datas';
import { mesesEntre, quotaDoMes, somarMes } from './imobilizado';
import { custoAtividade, mediosAtuais } from './atividades';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const N = (v: any) => Number(v ?? 0);
export const r2 = (x: number) => Math.round(x * 100) / 100;

export type SafraBase = { id: string; fazenda_id: string; data_inicio: string | null; data_fim: string | null };

export type TalhaoSafra = {
  areaId: string;
  nome: string;
  ha: number | null;
  previsto: number | null;
  litros: number;
  /** sacas beneficiadas que ficaram com o produtor (sem as que pagaram secador e pilagem) */
  sacas: number;
  insumos: number;
  /** mão de obra das atividades (horas x valor da hora) */
  maoObra: number;
  /** máquinas nas atividades (horas x combustível e manutenção por hora) */
  maquinas: number;
  servicos: number;
  exaustao: number;
  colheita: number;
  secagemPilagem: number;
  armazenagem: number;
  custo: number;
  porSaca: number | null;
  vendidas: number;
  receita: number;
  estoque: number;
};

export type ResultadoSafra = {
  talhoes: TalhaoSafra[];
  /** café de outra origem lançado nesta safra */
  outros: { sacas: number; custo: number; semCusto: number; vendidas: number; receita: number; estoque: number };
  sacas: number;
  custo: number;
  porSaca: number | null;
  vendidas: number;
  receitaBruta: number;
  receita: number;
  precoMedio: number | null;
  estoque: number;
  perdas: number;
  /** litros colhidos que ainda não viraram saca beneficiada: o custo deles já está na conta, a saca ainda não */
  litrosSemPilar: number;
  vendas: { id: string; numero: number; data: string; sacas: number; receita: number }[];
};

/** Custo da lavoura de cada talhão no período: insumos, mão de obra e máquinas das atividades, serviços e despesas das compras rateadas e exaustão. */
export async function custoLavoura(fazendaId: string, areaIds: string[], inicio: string, fim: string): Promise<Record<string, { insumos: number; maoObra: number; maquinas: number; servicos: number; exaustao: number }>> {
  const r: Record<string, { insumos: number; maoObra: number; maquinas: number; servicos: number; exaustao: number }> = Object.fromEntries(areaIds.map((a) => [a, { insumos: 0, maoObra: 0, maquinas: 0, servicos: 0, exaustao: 0 }]));
  if (!areaIds.length) return r;
  const [centros, ats, imobs, formacoes] = await Promise.all([
    consulta<any[]>(supabase.from('centros_custo').select('id, area_id').in('area_id', areaIds)),
    consulta<any[]>(
      supabase
        .from('atividade_areas')
        .select('area_id, centro_custo_id, percentual, atividade:atividades_agricolas ( id, data, custo_mao_obra, custo_maquina, itens:atividade_insumos ( insumo_id, quantidade_estoque, custo_unitario, baixou, retornado ) )')
        .in('area_id', areaIds),
    ),
    consulta<any[]>(supabase.from('imobilizados').select('*').in('area_id', areaIds).eq('metodo', 'exaustao')),
    // V152: o que foi para a lavoura EM FORMAÇÃO é investimento (custo do bem), não custo da safra
    consulta<any[]>(supabase.from('centros_custo').select('id').not('imobilizado_id', 'is', null)),
  ]);
  const deFormacao = new Set(formacoes.map((x) => x.id));

  // insumos aplicados
  const ids = [...new Set(ats.flatMap((x) => (um(x.atividade)?.itens ?? []).map((i: any) => i.insumo_id)))];
  const movs = ids.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade, valor_unitario, data').eq('fazenda_id', fazendaId).eq('tipo', 'entrada').in('insumo_id', ids)) : [];
  const medios = mediosAtuais(movs);
  for (const x of ats) {
    const at = um(x.atividade);
    if (!at || at.data < inicio || at.data > fim || !r[x.area_id] || deFormacao.has(x.centro_custo_id)) continue;
    r[x.area_id].insumos += (custoAtividade(at.itens ?? [], medios) * N(x.percentual)) / 100;
    r[x.area_id].maoObra += (N(at.custo_mao_obra) * N(x.percentual)) / 100;
    r[x.area_id].maquinas += (N(at.custo_maquina) * N(x.percentual)) / 100;
  }

  // serviços e despesas das compras rateadas ao centro de custo do talhão (produto de estoque só é custo quando aplicado)
  const areaDoCentro: Record<string, string> = Object.fromEntries(centros.map((c) => [c.id, c.area_id]));
  if (centros.length) {
    const [rat, fretes] = await Promise.all([
      consulta<any[]>(
        supabase.from('compra_rateios').select('centro_custo_id, percentual, compra:compras ( id, data, valor_total, situacao, itens:compra_itens ( tipo_item, valor_total, frete_aparte ) )').in('centro_custo_id', centros.map((c) => c.id)),
      ),
      consulta<any[]>(supabase.from('compra_fretes').select('frete_compra_id, valor_rateado')),
    ]);
    const notasFrete = new Set(fretes.filter((x) => N(x.valor_rateado) > 0).map((x) => x.frete_compra_id));
    for (const x of rat) {
      const c = um(x.compra);
      const area = areaDoCentro[x.centro_custo_id];
      if (!c || !area || c.situacao === 'a_completar' || c.data < inicio || c.data > fim || notasFrete.has(c.id)) continue;
      const itens = (c.itens ?? []) as any[];
      const soma = itens.reduce((t, i) => t + N(i.valor_total), 0);
      const servicos = itens.filter((i) => i.tipo_item !== 'insumo').reduce((t, i) => t + N(i.valor_total), 0);
      const parteDireta = itens.length && soma > 0 ? servicos / soma : itens.length ? 0 : 1;
      const freteServicos = itens.filter((i) => i.tipo_item !== 'insumo').reduce((t, i) => t + N(i.frete_aparte), 0);
      r[area].servicos += ((N(c.valor_total) * parteDireta + freteServicos) * N(x.percentual)) / 100;
    }
  }

  // exaustão da lavoura: quotas dos meses do período (até hoje)
  const ate = fim < hojeBanco() ? fim : hojeBanco();
  for (const b of imobs) {
    if (!r[b.area_id]) continue;
    for (let i = 0; i <= mesesEntre(inicio, ate); i++) r[b.area_id].exaustao += quotaDoMes(b, somarMes(inicio.slice(0, 7), i));
  }
  return r;
}

/** Resultado de uma safra: produção, custo por talhão e por saca, vendas, estoque e margem. */
export async function resultadoSafra(s: SafraBase): Promise<ResultadoSafra> {
  const inicio = s.data_inicio ?? '1900-01-01';
  const fim = s.data_fim ?? '2999-12-31';
  const [st, col, res, origens, lotes, movs, itensVenda] = await Promise.all([
    consulta<any[]>(supabase.from('safra_talhoes').select('area_id, previsao_sacas, area:areas ( nome, area_ha, area_util_ha )').eq('safra_id', s.id)),
    consulta<any[]>(supabase.from('pc_lotes').select('area_id, litros, valor_colheita, servico_valor, area:areas ( nome, area_ha, area_util_ha )').eq('safra_id', s.id)),
    consulta<any[]>(supabase.rpc('cafe_resumo_talhoes', { p_fazenda: s.fazenda_id, p_safra: s.id })),
    consulta<any[]>(supabase.rpc('cafe_lote_origens', { p_fazenda: s.fazenda_id })),
    consulta<any[]>(supabase.from('cafe_lotes').select('id, sacas, custo_saca, pilagem_id, safra_id').eq('fazenda_id', s.fazenda_id)),
    consulta<any[]>(supabase.from('cafe_movimentos').select('lote_id, tipo, sacas, valor').eq('fazenda_id', s.fazenda_id).limit(20000)),
    consulta<any[]>(supabase.from('venda_itens').select('cafe_lote_id, quantidade, valor_total, venda:vendas ( id, numero, data, valor_bruto, valor_total )').eq('fazenda_id', s.fazenda_id).eq('tipo_item', 'cafe').limit(20000)),
  ]);

  const novo = (areaId: string, a: any): TalhaoSafra => ({
    areaId, nome: a?.nome ?? '', ha: N(a?.area_util_ha ?? a?.area_ha) || null, previsto: null, litros: 0, sacas: 0,
    insumos: 0, maoObra: 0, maquinas: 0, servicos: 0, exaustao: 0, colheita: 0, secagemPilagem: 0, armazenagem: 0, custo: 0, porSaca: null, vendidas: 0, receita: 0, estoque: 0,
  });
  const t: Record<string, TalhaoSafra> = {};
  for (const x of st) {
    t[x.area_id] = novo(x.area_id, um(x.area));
    t[x.area_id].previsto = x.previsao_sacas != null ? N(x.previsao_sacas) : null;
  }
  for (const c of col) {
    t[c.area_id] ??= novo(c.area_id, um(c.area));
    t[c.area_id].litros += N(c.litros);
    t[c.area_id].colheita += N(c.valor_colheita) + N(c.servico_valor);
  }
  let litrosSemPilar = 0;
  for (const x of res) {
    if (!t[x.area_id]) continue;
    t[x.area_id].sacas = N(x.sacas_beneficiadas);
    t[x.area_id].secagemPilagem = N(x.custo_secagem) + N(x.custo_pilagem);
    // litros ainda sem secar, mais a parte seca que ainda não foi pilada
    const secos = N(x.litros_secos);
    const pilados = N(x.sacas_coco) > 0 ? (secos * N(x.sacas_coco_piladas)) / N(x.sacas_coco) : 0;
    litrosSemPilar += Math.max(0, N(x.litros_colhidos) - pilados);
  }
  const lav = await custoLavoura(s.fazenda_id, Object.keys(t), inicio, fim);
  for (const a of Object.keys(t)) Object.assign(t[a], lav[a]);

  // pelo lote de café: armazenagem, vendas, perdas e estoque, na fração de cada talhão desta safra
  const saldo: Record<string, number> = {};
  const taxa: Record<string, number> = {};
  const perda: Record<string, number> = {};
  for (const m of movs) {
    saldo[m.lote_id] = (saldo[m.lote_id] ?? 0) + N(m.sacas);
    if (m.tipo === 'taxa') taxa[m.lote_id] = (taxa[m.lote_id] ?? 0) + N(m.valor);
    if (m.tipo === 'quebra' || m.tipo === 'taxa' || m.tipo === 'ajuste') perda[m.lote_id] = (perda[m.lote_id] ?? 0) - N(m.sacas);
  }
  const vend: Record<string, { sacas: number; bruto: number; liquido: number }> = {};
  const vendas: Record<string, { id: string; numero: number; data: string; sacas: number; receita: number }> = {};
  const fracaoSafra: Record<string, number> = {};
  for (const o of origens) if (o.safra_id === s.id) fracaoSafra[o.cafe_lote_id] = (fracaoSafra[o.cafe_lote_id] ?? 0) + N(o.fracao);
  for (const i of itensVenda) {
    const v = um(i.venda);
    if (!i.cafe_lote_id || !v) continue;
    const liq = N(v.valor_bruto) > 0 ? (N(i.valor_total) * N(v.valor_total)) / N(v.valor_bruto) : N(i.valor_total);
    vend[i.cafe_lote_id] ??= { sacas: 0, bruto: 0, liquido: 0 };
    vend[i.cafe_lote_id].sacas += N(i.quantidade);
    vend[i.cafe_lote_id].bruto += N(i.valor_total);
    vend[i.cafe_lote_id].liquido += liq;
    const f = fracaoSafra[i.cafe_lote_id] ?? 0;
    if (f > 0) {
      vendas[v.id] ??= { id: v.id, numero: v.numero, data: v.data, sacas: 0, receita: 0 };
      vendas[v.id].sacas += N(i.quantidade) * f;
      vendas[v.id].receita += liq * f;
    }
  }

  const outros = { sacas: 0, custo: 0, semCusto: 0, vendidas: 0, receita: 0, estoque: 0 };
  let receitaBruta = 0;
  let perdas = 0;
  for (const o of origens) {
    if (o.safra_id !== s.id) continue;
    const f = N(o.fracao);
    const v = vend[o.cafe_lote_id];
    receitaBruta += (v?.bruto ?? 0) * f;
    perdas += (perda[o.cafe_lote_id] ?? 0) * f;
    if (o.area_id && t[o.area_id]) {
      const x = t[o.area_id];
      x.armazenagem += (taxa[o.cafe_lote_id] ?? 0) * f;
      x.vendidas += (v?.sacas ?? 0) * f;
      x.receita += (v?.liquido ?? 0) * f;
      x.estoque += (saldo[o.cafe_lote_id] ?? 0) * f;
    } else if (!o.area_id) {
      const l = lotes.find((y) => y.id === o.cafe_lote_id);
      outros.sacas += N(l?.sacas);
      if (l?.custo_saca != null) outros.custo += N(l.custo_saca) * N(l.sacas);
      else outros.semCusto += N(l?.sacas);
      outros.custo += taxa[o.cafe_lote_id] ?? 0;
      outros.vendidas += v?.sacas ?? 0;
      outros.receita += v?.liquido ?? 0;
      outros.estoque += saldo[o.cafe_lote_id] ?? 0;
    }
  }

  const talhoes = Object.values(t)
    .map((x) => {
      const custo = x.insumos + x.maoObra + x.maquinas + x.servicos + x.exaustao + x.colheita + x.secagemPilagem + x.armazenagem;
      return { ...x, custo: r2(custo), porSaca: x.sacas > 0 ? custo / x.sacas : null };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const sacas = talhoes.reduce((a, x) => a + x.sacas, 0) + outros.sacas;
  const custo = talhoes.reduce((a, x) => a + x.custo, 0) + outros.custo;
  const vendidas = talhoes.reduce((a, x) => a + x.vendidas, 0) + outros.vendidas;
  const receita = talhoes.reduce((a, x) => a + x.receita, 0) + outros.receita;
  return {
    talhoes,
    outros,
    sacas: r2(sacas),
    custo: r2(custo),
    porSaca: sacas > 0 ? custo / sacas : null,
    vendidas: r2(vendidas),
    receitaBruta: r2(receitaBruta),
    receita: r2(receita),
    precoMedio: vendidas > 0 ? receita / vendidas : null,
    estoque: r2(talhoes.reduce((a, x) => a + x.estoque, 0) + outros.estoque),
    perdas: r2(perdas),
    litrosSemPilar: Math.round(litrosSemPilar),
    vendas: Object.values(vendas).map((v) => ({ ...v, sacas: r2(v.sacas), receita: r2(v.receita) })).sort((a, b) => (a.data < b.data ? 1 : -1)),
  };
}

/**
 * Custo por saca de cada lote de café: pela origem (talhão e safra) nos lotes que vieram de pilagem;
 * o custo informado no lote, no café de outra origem. null quando não dá para saber.
 */
export async function custoPorSacaLotes(fazendaId: string, loteIds: string[]): Promise<Record<string, number | null>> {
  const r: Record<string, number | null> = {};
  if (!loteIds.length) return r;
  const [origens, lotes] = await Promise.all([
    consulta<any[]>(supabase.rpc('cafe_lote_origens', { p_fazenda: fazendaId })),
    consulta<any[]>(supabase.from('cafe_lotes').select('id, custo_saca, pilagem_id').in('id', loteIds)),
  ]);
  const meus = origens.filter((o) => loteIds.includes(o.cafe_lote_id));
  const safraIds = [...new Set(meus.filter((o) => o.area_id && o.safra_id).map((o) => o.safra_id as string))];
  const safras = safraIds.length ? await consulta<any[]>(supabase.from('safras').select('id, fazenda_id, data_inicio, data_fim').in('id', safraIds)) : [];
  const porTalhao: Record<string, number | null> = {};
  for (const s of safras) {
    const res = await resultadoSafra(s);
    for (const x of res.talhoes) porTalhao[`${s.id}|${x.areaId}`] = x.porSaca;
  }
  for (const l of lotes) {
    if (!l.pilagem_id) {
      r[l.id] = l.custo_saca != null ? N(l.custo_saca) : null;
      continue;
    }
    let custo = 0;
    let ok = true;
    for (const o of meus.filter((x) => x.cafe_lote_id === l.id)) {
      const c = porTalhao[`${o.safra_id}|${o.area_id}`];
      if (c == null) ok = false;
      else custo += c * N(o.fracao);
    }
    r[l.id] = ok && custo > 0 ? custo : null;
  }
  return r;
}
