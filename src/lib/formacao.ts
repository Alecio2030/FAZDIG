// V152: Imobilizado EM FORMAÇÃO (lavoura, curral, barragem, estrada, casa, galpão...).
// O bem nasce com o código patrimonial e um centro de custo próprio (ex.: 4.1.08-001), dentro do grupo
// "IMOBILIZADO EM FORMAÇÃO" da fazenda. Tudo o que se lança nesse centro é o custo de formação:
// insumos, mão de obra e máquinas das Atividades, serviços e despesas das Compras e Contas a pagar,
// combustível dos Abastecimentos (tanque), produtos transferidos de outra fazenda e a depreciação
// de outros bens rateada para ele. Na data de início da operação o bem é ativado com esse total.
import { consulta, supabase } from './supabase';
import { hojeBanco } from './datas';
import { custoAtividade, mediosAtuais } from './atividades';
import { mesesEntre, quotaDoMes, somarMes } from './imobilizado';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const N = (v: any) => Number(v ?? 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

export type CustoFormacao = {
  anterior: number;
  insumos: number;
  maoObra: number;
  maquinas: number;
  servicos: number;
  combustivel: number;
  transferencias: number;
  depreciacao: number;
  total: number;
  /** nº de lançamentos que entraram (para dizer de onde veio) */
  atividades: number;
  compras: number;
  titulos: number;
  ate: string;
};

export const PARTES_FORMACAO: { chave: keyof CustoFormacao; rotulo: string }[] = [
  { chave: 'anterior', rotulo: 'Gastos anteriores ao sistema' },
  { chave: 'insumos', rotulo: 'Insumos aplicados (Atividades)' },
  { chave: 'maoObra', rotulo: 'Mão de obra (Atividades)' },
  { chave: 'maquinas', rotulo: 'Máquinas (Atividades)' },
  { chave: 'servicos', rotulo: 'Serviços, materiais e despesas (Compras e Contas a pagar)' },
  { chave: 'combustivel', rotulo: 'Combustível do tanque (Abastecimentos)' },
  { chave: 'transferencias', rotulo: 'Produtos recebidos de outra fazenda' },
  { chave: 'depreciacao', rotulo: 'Depreciação de outros bens rateada' },
];

type BemFormacao = { formacao_centro_id: string | null; formacao_inicio?: string | null; data_ativacao: string; operacao_inicio?: string | null; formacao_valor_anterior?: any; fazenda_id: string | null };

/** Custo acumulado da formação até a data (padrão: hoje, ou o início da operação se já concluída). */
export async function custoFormacao(b: BemFormacao, ateData?: string): Promise<CustoFormacao> {
  const inicio = b.formacao_inicio ?? b.data_ativacao;
  const ate = ateData ?? b.operacao_inicio ?? hojeBanco();
  const r: CustoFormacao = { anterior: N(b.formacao_valor_anterior), insumos: 0, maoObra: 0, maquinas: 0, servicos: 0, combustivel: 0, transferencias: 0, depreciacao: 0, total: 0, atividades: 0, compras: 0, titulos: 0, ate };
  const c = b.formacao_centro_id;
  if (!c) {
    r.total = r.anterior;
    return r;
  }
  const [ats, rat, tits, ratTits, abs, trs, deps] = await Promise.all([
    consulta<any[]>(
      supabase
        .from('atividade_areas')
        .select('percentual, atividade:atividades_agricolas ( id, fazenda_id, data, custo_mao_obra, custo_maquina, itens:atividade_insumos ( insumo_id, quantidade_estoque, custo_unitario, baixou, retornado ) )')
        .eq('centro_custo_id', c),
    ),
    consulta<any[]>(supabase.from('compra_rateios').select('percentual, compra:compras ( id, data, valor_total, situacao, itens:compra_itens ( tipo_item, valor_total, frete_aparte ) )').eq('centro_custo_id', c)),
    consulta<any[]>(
      supabase.from('lancamentos').select('id, valor, data_emissao, situacao').eq('centro_custo_id', c).eq('tipo', 'pagar').is('compra_id', null).is('venda_id', null).is('financiamento_id', null),
    ),
    consulta<any[]>(supabase.from('lancamento_rateios').select('percentual, lanc:lancamentos ( id, valor, data_emissao, situacao, tipo, compra_id, financiamento_id )').eq('centro_custo_id', c)),
    consulta<any[]>(supabase.from('frota_abastecimento_rateios').select('percentual, ab:frota_abastecimentos ( data, origem, valor_total )').eq('centro_custo_id', c)),
    consulta<any[]>(supabase.from('transferencias').select('data, valor').eq('centro_custo_id', c).eq('tipo', 'estoque')),
    consulta<any[]>(supabase.from('imobilizado_rateios').select('percentual, bem:imobilizados ( * )').eq('centro_custo_id', c)),
  ]);
  const dentro = (d: string | null | undefined) => !!d && d >= inicio && d <= ate;

  // insumos, mão de obra e máquinas das atividades
  const lista = ats.filter((x) => dentro(um(x.atividade)?.data));
  const ids = [...new Set(lista.flatMap((x) => (um(x.atividade)?.itens ?? []).map((i: any) => i.insumo_id)))];
  const faz = [...new Set(lista.map((x) => um(x.atividade)?.fazenda_id).filter(Boolean))] as string[];
  const movs = ids.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade, valor_unitario, data').in('fazenda_id', faz).eq('tipo', 'entrada').in('insumo_id', ids)) : [];
  const medios = mediosAtuais(movs);
  for (const x of lista) {
    const at = um(x.atividade);
    const p = N(x.percentual) / 100;
    r.insumos += custoAtividade(at.itens ?? [], medios) * p;
    r.maoObra += N(at.custo_mao_obra) * p;
    r.maquinas += N(at.custo_maquina) * p;
    r.atividades++;
  }

  // compras e despesas rateadas ao centro: só a parte de serviços e despesas (produto de estoque só é custo quando aplicado)
  for (const x of rat) {
    const cp = um(x.compra);
    if (!cp || cp.situacao === 'a_completar' || !dentro(cp.data)) continue;
    const itens = (cp.itens ?? []) as any[];
    const soma = itens.reduce((t, i) => t + N(i.valor_total), 0);
    const serv = itens.filter((i) => i.tipo_item !== 'insumo').reduce((t, i) => t + N(i.valor_total), 0);
    const parte = itens.length && soma > 0 ? serv / soma : itens.length ? 0 : 1;
    const frete = itens.filter((i) => i.tipo_item !== 'insumo').reduce((t, i) => t + N(i.frete_aparte), 0);
    const v = ((N(cp.valor_total) * parte + frete) * N(x.percentual)) / 100;
    if (v > 0) {
      r.servicos += v;
      r.compras++;
    }
  }
  // títulos avulsos do contas a pagar (sem compra) apontados para o centro
  for (const l of tits) {
    if (l.situacao === 'cancelado' || !dentro(l.data_emissao)) continue;
    r.servicos += N(l.valor);
    r.titulos++;
  }
  for (const x of ratTits) {
    const l = um(x.lanc);
    if (!l || l.tipo !== 'pagar' || l.compra_id || l.financiamento_id || l.situacao === 'cancelado' || !dentro(l.data_emissao)) continue;
    r.servicos += (N(l.valor) * N(x.percentual)) / 100;
    r.titulos++;
  }
  // combustível do tanque (o do posto já entrou pela compra)
  for (const x of abs) {
    const a = um(x.ab);
    if (!a || a.origem !== 'tanque' || !dentro(a.data)) continue;
    r.combustivel += (N(a.valor_total) * N(x.percentual)) / 100;
  }
  // produtos de outra fazenda aplicados direto no centro
  for (const t of trs) if (dentro(t.data)) r.transferencias += N(t.valor);
  // depreciação de outros bens rateada para a formação, mês a mês
  for (const x of deps) {
    const bem = um(x.bem);
    if (!bem || bem.situacao === 'formacao') continue;
    for (let i = 0; i <= mesesEntre(inicio, ate); i++) r.depreciacao += (quotaDoMes(bem, somarMes(inicio.slice(0, 7), i)) * N(x.percentual)) / 100;
  }

  for (const k of ['insumos', 'maoObra', 'maquinas', 'servicos', 'combustivel', 'transferencias', 'depreciacao'] as const) r[k] = r2(r[k]);
  r.total = r2(r.anterior + r.insumos + r.maoObra + r.maquinas + r.servicos + r.combustivel + r.transferencias + r.depreciacao);
  return r;
}

/** Categorias que podem ficar em formação. */
export const CATEGORIAS_FORMACAO = ['cafe', 'perene', 'pastagem', 'benfeitorias', 'cercas', 'barragens', 'estradas', 'outros'];
