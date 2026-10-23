// V143: as 3 últimas compras de cada produto (Consulta do estoque) e os 3 últimos fornecimentos
// de cada fornecedor (Consulta de Pessoas). Os dados vêm das funções do banco
// ultimas_compras_insumos e ultimos_fornecimentos, que respeitam os acessos de quem consulta.
import { supabase } from './supabase';
import { doBanco } from './datas';
import { formatarMoeda, formatarQtd } from './formatos';
import { nomeUnidade as nomeUnidadeMedida } from './insumos';

export type CompraDoProduto = {
  insumo_id: string;
  compra_id: string;
  numero: number | null;
  data: string;
  fazenda_id: string | null;
  fornecedor: string;
  quantidade: number | null;
  unidade: string | null;
  conteudo_embalagem: number | null;
  valor_unitario: number | null;
  custo_unitario: number | null;
  prazo: string | null;
  situacao: string;
};

export type ItemFornecido = {
  produto: string;
  codigo: number | null;
  quantidade: number | null;
  unidade: string | null;
  conteudo_embalagem: number | null;
  conteudo_medida: string | null;
  valor_unitario: number | null;
  custo_unitario: number | null;
};

export type Fornecimento = {
  pessoa_id: string;
  compra_id: string;
  numero: number | null;
  data: string;
  fazenda_id: string | null;
  numero_documento: string | null;
  valor_total: number | null;
  prazo: string | null;
  itens: ItemFornecido[];
};

const agrupar = <T extends Record<string, any>>(l: T[], chave: keyof T) =>
  l.reduce<Record<string, T[]>>((m, x) => {
    const k = String(x[chave]);
    (m[k] = m[k] ?? []).push(x);
    return m;
  }, {});

/** insumo_id -> até 3 compras, da mais nova para a mais antiga. Se falhar, a consulta segue sem elas. */
export async function ultimasComprasDosProdutos(ids: string[]): Promise<Record<string, CompraDoProduto[]>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc('ultimas_compras_insumos', { p_insumos: ids, p_qtd: 3 });
  if (error || !data) return {};
  return agrupar(data as CompraDoProduto[], 'insumo_id');
}

/** pessoa_id -> até 3 compras feitas a ele, da mais nova para a mais antiga, com os itens. */
export async function ultimosFornecimentos(ids: string[]): Promise<Record<string, Fornecimento[]>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc('ultimos_fornecimentos', { p_pessoas: ids, p_qtd: 3 });
  if (error || !data) return {};
  return agrupar(data as Fornecimento[], 'pessoa_id');
}

/** "10 Sacos (25 kg)" */
export function textoQuantidade(qtd: number | null, unidade: string | null, conteudo?: number | null, medida?: string | null): string {
  if (qtd == null) return 'qtde. não informada';
  const u = nomeUnidadeMedida(unidade);
  const emb = conteudo ? ` (${formatarQtd(conteudo)}${medida ? ` ${medida}` : ''} cada)` : '';
  return `${formatarQtd(qtd)}${u ? ` ${u}` : ''}${emb}`;
}

/** "R$ 100,00 por Saco" e, se o custo (com frete, despesas e créditos) for diferente, "· custo R$ 104,50" */
export function textoPreco(valor: number | null, custo: number | null, unidade: string | null): string {
  if (valor == null) return 'preço a completar';
  const u = nomeUnidadeMedida(unidade);
  const base = `${formatarMoeda(Number(valor))}${u ? ` por ${u}` : ''}`;
  const v = Number(valor);
  const c = custo == null ? null : Number(custo);
  return c != null && v > 0 && Math.abs(c - v) / v > 0.005 ? `${base} · custo ${formatarMoeda(c)}` : base;
}

/** Uma linha de "últimas compras" do produto. */
export function linhaCompraDoProduto(c: CompraDoProduto, medida: string | null, unidadeDaCompra?: string): string {
  return [
    `• ${doBanco(c.data)}`,
    textoQuantidade(c.quantidade, c.unidade, c.conteudo_embalagem, medida),
    textoPreco(c.valor_unitario, c.custo_unitario, c.unidade),
    c.fornecedor,
    c.prazo ? `Prazo: ${c.prazo}` : c.situacao === 'a_completar' ? 'Prazo a completar' : 'Prazo não informado',
    unidadeDaCompra,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Linhas de um fornecimento: cabeçalho da compra e um item por linha. */
export function linhasFornecimento(f: Fornecimento, unidadeDaCompra?: string): string[] {
  const cab = [
    `• ${doBanco(f.data)}`,
    f.numero ? `Compra nº ${f.numero}` : null,
    f.numero_documento ? `Nota ${f.numero_documento}` : null,
    f.prazo ? `Prazo: ${f.prazo}` : 'Prazo não informado',
    unidadeDaCompra,
  ]
    .filter(Boolean)
    .join(' · ');
  const itens = (f.itens ?? []).map(
    (i) =>
      `    ${i.codigo != null ? `[${i.codigo}] ` : ''}${i.produto} · ${textoQuantidade(i.quantidade, i.unidade, i.conteudo_embalagem, i.conteudo_medida)} · ${textoPreco(i.valor_unitario, i.custo_unitario, i.unidade)}`,
  );
  return [cab, ...(itens.length ? itens : ['    (sem itens)'])];
}
