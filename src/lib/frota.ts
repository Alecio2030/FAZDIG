// Frota: veículos, tratores, máquinas e equipamentos. Abastecimento, manutenção, planos (km, horas e meses) e avisos.
import { consulta, supabase } from './supabase';
import { formatarNumero, formatarQtd } from './formatos';
import type { ItemLista } from '../componentes/SeletorLista';
import type { NomeIcone } from '../componentes/ItemMenu';

export type Medidor = 'km' | 'horas' | 'nenhum';
export type Uso = 'agricultura' | 'pecuaria' | 'administrativo' | 'particular';
export type TipoVeiculo = 'carro' | 'caminhonete' | 'caminhao' | 'moto' | 'trator' | 'colhedora' | 'implemento' | 'equipamento' | 'outro';

export const TIPOS_VEICULO: { valor: TipoVeiculo; rotulo: string; medidor: Medidor; icone: NomeIcone }[] = [
  { valor: 'caminhonete', rotulo: 'Caminhonete / utilitário', medidor: 'km', icone: 'car-sport-outline' },
  { valor: 'carro', rotulo: 'Carro', medidor: 'km', icone: 'car-outline' },
  { valor: 'caminhao', rotulo: 'Caminhão', medidor: 'km', icone: 'bus-outline' },
  { valor: 'moto', rotulo: 'Moto / quadriciclo', medidor: 'km', icone: 'bicycle-outline' },
  { valor: 'trator', rotulo: 'Trator', medidor: 'horas', icone: 'cog-outline' },
  { valor: 'colhedora', rotulo: 'Colhedora / automotriz', medidor: 'horas', icone: 'construct-outline' },
  { valor: 'implemento', rotulo: 'Implemento', medidor: 'nenhum', icone: 'hammer-outline' },
  { valor: 'equipamento', rotulo: 'Equipamento (bomba, gerador, motosserra…)', medidor: 'horas', icone: 'flash-outline' },
  { valor: 'outro', rotulo: 'Outro', medidor: 'km', icone: 'ellipse-outline' },
];
export const ROTULO_TIPO_VEICULO: Record<string, string> = Object.fromEntries(TIPOS_VEICULO.map((t) => [t.valor, t.rotulo]));
export const ICONE_TIPO_VEICULO: Record<string, NomeIcone> = Object.fromEntries(TIPOS_VEICULO.map((t) => [t.valor, t.icone]));

export const MEDIDORES: { valor: Medidor; rotulo: string }[] = [
  { valor: 'km', rotulo: 'Hodômetro (km)' },
  { valor: 'horas', rotulo: 'Horímetro (horas)' },
  { valor: 'nenhum', rotulo: 'Não tem' },
];

export const USOS: { valor: Uso; rotulo: string; explica: string }[] = [
  { valor: 'agricultura', rotulo: 'Agricultura', explica: 'Custo da lavoura (combustível e manutenção agrícolas).' },
  { valor: 'pecuaria', rotulo: 'Pecuária', explica: 'Custo da pecuária (combustível e manutenção da pecuária).' },
  { valor: 'administrativo', rotulo: 'Administrativo', explica: 'Despesa da administração (veículos do escritório e da gerência).' },
  { valor: 'particular', rotulo: 'Particular', explica: 'Do proprietário: não é custo da fazenda. O que a fazenda pagar sai como retirada particular (Patrimônio Líquido).' },
];
export const ROTULO_USO: Record<string, string> = Object.fromEntries(USOS.map((u) => [u.valor, u.rotulo]));

export const COMBUSTIVEIS = ['Diesel S10', 'Diesel S500', 'Gasolina', 'Etanol', 'Flex', 'Mistura 2 tempos'].map((c) => ({ valor: c, rotulo: c }));

/** "km" ou "h" */
export const unidadeMedidor = (m: string | null | undefined) => (m === 'horas' ? 'h' : 'km');
/** "45.300 km" / "2.140 h" */
export function textoLeitura(valor: number | null | undefined, medidor: string | null | undefined): string {
  if (valor == null || medidor === 'nenhum') return '—';
  return `${formatarQtd(valor, 1)} ${unidadeMedidor(medidor)}`;
}
export const nomeMedidor = (m: string | null | undefined) => (m === 'horas' ? 'horímetro' : 'hodômetro');

// ---------- planos de manutenção padrão (referências médias; o manual do fabricante manda) ----------
export type ItemPlano = { item: string; intervalo: number | null; meses: number | null };
const P = (item: string, intervalo: number | null, meses: number | null): ItemPlano => ({ item, intervalo, meses });

export const PLANOS_PADRAO: Record<TipoVeiculo, ItemPlano[]> = {
  caminhonete: [
    P('Troca de óleo do motor', 10000, 12), P('Filtro de óleo', 10000, 12), P('Filtro de combustível', 20000, 24), P('Filtro de ar do motor', 20000, 24),
    P('Filtro de ar da cabine', 15000, 12), P('Rodízio e calibragem dos pneus', 10000, null), P('Alinhamento e balanceamento', 10000, 12),
    P('Fluido de freio', null, 24), P('Correia dentada / acessórios', 60000, 48), P('Revisão geral', 20000, 12), P('Licenciamento (CRLV) e IPVA', null, 12),
  ],
  carro: [
    P('Troca de óleo do motor', 10000, 12), P('Filtro de óleo', 10000, 12), P('Filtro de combustível', 20000, 24), P('Filtro de ar do motor', 20000, 24),
    P('Filtro de ar da cabine', 15000, 12), P('Alinhamento e balanceamento', 10000, 12), P('Fluido de freio', null, 24), P('Correia dentada', 60000, 48),
    P('Revisão geral', 20000, 12), P('Licenciamento (CRLV) e IPVA', null, 12),
  ],
  caminhao: [
    P('Troca de óleo do motor', 20000, 12), P('Filtro de óleo', 20000, 12), P('Filtro de combustível e separador de água', 20000, 12), P('Filtro de ar do motor', 40000, 24),
    P('Lubrificação (graxa) do chassi', 5000, 3), P('Óleo da caixa e do diferencial', 80000, 24), P('Freios (lonas e tambores)', 30000, 12),
    P('Revisão geral', 40000, 12), P('Licenciamento (CRLV) e IPVA', null, 12),
  ],
  moto: [
    P('Troca de óleo do motor', 3000, 6), P('Filtro de óleo', 6000, 12), P('Lubrificar e esticar a corrente', 1000, null), P('Filtro de ar', 12000, 12),
    P('Revisão geral', 6000, 12), P('Licenciamento (CRLV) e IPVA', null, 12),
  ],
  trator: [
    P('Troca de óleo do motor', 250, 12), P('Filtro de óleo do motor', 250, 12), P('Filtro de combustível', 500, 12), P('Filtro de ar (limpar ou trocar)', 250, 12),
    P('Lubrificação (graxa) dos pinos e articulações', 50, null), P('Óleo da transmissão e hidráulico', 1000, 24), P('Filtro hidráulico', 500, 12),
    P('Líquido de arrefecimento (radiador)', 2000, 24), P('Revisão geral', 1000, 12),
  ],
  colhedora: [
    P('Troca de óleo do motor', 250, 12), P('Filtro de óleo do motor', 250, 12), P('Filtro de combustível', 500, 12), P('Filtro de ar (limpar ou trocar)', 250, 12),
    P('Lubrificação (graxa)', 50, null), P('Óleo hidráulico e filtro', 1000, 24), P('Correias, correntes e rolamentos', 500, 12), P('Revisão de entressafra', null, 12),
  ],
  equipamento: [
    P('Troca de óleo do motor', 200, 12), P('Filtro de ar', 200, 12), P('Filtro de combustível', 400, 12), P('Vela / bicos injetores', 400, 12), P('Revisão geral', 1000, 12),
  ],
  implemento: [P('Lubrificação (graxa)', null, 1), P('Revisão (rolamentos, discos, lâminas, bicos)', null, 12)],
  outro: [],
};

// ---------- leituras e consumo ----------
export type LeituraAtual = { veiculo_id: string; leitura: number | null; data: string | null; por_dia: number | null };

export async function lerLeiturasAtuais(): Promise<Record<string, LeituraAtual>> {
  const d = await consulta<any[]>(supabase.rpc('frota_leitura_atual'));
  return Object.fromEntries((d ?? []).map((x) => [x.veiculo_id, { veiculo_id: x.veiculo_id, leitura: x.leitura == null ? null : Number(x.leitura), data: x.data, por_dia: x.por_dia == null ? null : Number(x.por_dia) }]));
}

export type Situacao = {
  plano_id: string;
  veiculo_id: string;
  veiculo: string;
  veiculo_numero: number;
  uso: string;
  fazenda_id: string;
  item: string;
  medidor: Medidor;
  intervalo: number | null;
  intervalo_meses: number | null;
  ultima_leitura: number | null;
  ultima_data: string | null;
  leitura_atual: number | null;
  proxima_leitura: number | null;
  faltam: number | null;
  proxima_data: string | null;
  vence_em: string | null;
  situacao: 'vencida' | 'proxima' | 'ok';
};

export async function lerSituacao(fazendaId?: string | null): Promise<Situacao[]> {
  const d = await consulta<any[]>(supabase.rpc('frota_situacao', { p_fazenda: fazendaId ?? null }));
  const N = (v: any) => (v == null ? null : Number(v));
  return (d ?? []).map((x) => ({
    ...x,
    intervalo: N(x.intervalo),
    ultima_leitura: N(x.ultima_leitura),
    leitura_atual: N(x.leitura_atual),
    proxima_leitura: N(x.proxima_leitura),
    faltam: N(x.faltam),
  }));
}

/** "Faltam 120 h (aos 2.400 h) · até 10/05/2027" ou "Venceu: passou 30 h" */
export function textoSituacao(s: Situacao, doBanco: (v?: string | null) => string): string {
  const u = unidadeMedidor(s.medidor);
  if (s.situacao === 'vencida') {
    if (s.proxima_leitura != null && (s.faltam ?? 0) <= 0) return `Venceu: passou ${formatarQtd(-(s.faltam ?? 0), 1)} ${u} (era aos ${formatarQtd(s.proxima_leitura, 1)} ${u})`;
    return `Venceu em ${doBanco(s.proxima_data)}`;
  }
  const partes: string[] = [];
  if (s.proxima_leitura != null) partes.push(`Faltam ${formatarQtd(s.faltam, 1)} ${u} (aos ${formatarQtd(s.proxima_leitura, 1)} ${u})`);
  if (s.proxima_data) partes.push(`até ${doBanco(s.proxima_data)}`);
  if (s.vence_em && s.vence_em !== s.proxima_data) partes.push(`previsão ${doBanco(s.vence_em)}`);
  return partes.join(' · ');
}

export type Abastecimento = { data: string; leitura: number | null; litros: number; tanque_cheio: boolean; valor_total: number | null };

/**
 * Consumo pelo método tanque cheio a tanque cheio: entre dois abastecimentos de tanque cheio,
 * a distância (ou as horas) dividida pelos litros colocados depois do primeiro.
 * km: km/L · horas: L/h. Devolve a média do conjunto e o último trecho.
 */
export function calcularConsumo(lista: Abastecimento[], medidor: string): { media: number | null; ultimo: number | null; trechos: number } {
  if (medidor === 'nenhum') return { media: null, ultimo: null, trechos: 0 };
  const ord = [...lista].filter((a) => a.leitura != null).sort((a, b) => (a.data === b.data ? Number(a.leitura) - Number(b.leitura) : a.data < b.data ? -1 : 1));
  let base: Abastecimento | null = null;
  let litros = 0;
  let somaDist = 0;
  let somaLitros = 0;
  let ultimo: number | null = null;
  let trechos = 0;
  for (const a of ord) {
    if (base) litros += Number(a.litros);
    if (a.tanque_cheio) {
      if (base && litros > 0) {
        const dist = Number(a.leitura) - Number(base.leitura);
        if (dist > 0) {
          somaDist += dist;
          somaLitros += litros;
          ultimo = medidor === 'horas' ? litros / dist : dist / litros;
          trechos++;
        }
      }
      base = a;
      litros = 0;
    }
  }
  const media = somaLitros > 0 && somaDist > 0 ? (medidor === 'horas' ? somaLitros / somaDist : somaDist / somaLitros) : null;
  return { media, ultimo, trechos };
}

export const unidadeConsumo = (medidor: string) => (medidor === 'horas' ? 'L/h' : 'km/L');
export const textoConsumo = (v: number | null, medidor: string) => (v == null ? '—' : `${formatarNumero(v, medidor === 'horas' ? 1 : 2)} ${unidadeConsumo(medidor)}`);

// ---------- listas para os seletores ----------
export type Veiculo = {
  id: string;
  fazenda_id: string;
  numero: number;
  nome: string;
  tipo: TipoVeiculo;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  placa: string | null;
  medidor: Medidor;
  combustivel: string | null;
  tanque_litros: number | null;
  uso: Uso;
  centro_custo_id: string | null;
  proprietario: string | null;
  imobilizado_id: string | null;
  ativo: boolean;
};

const CAMPOS_VEICULO = 'id, fazenda_id, numero, nome, tipo, marca, modelo, ano, placa, medidor, combustivel, tanque_litros, uso, centro_custo_id, proprietario, imobilizado_id, ativo';

/** Veículos em uso (de todas as fazendas que o usuário vê): os da fazenda ativa primeiro. */
export async function carregarVeiculos(fazendaAtivaId?: string | null, incluirInativos = false): Promise<Veiculo[]> {
  let q = supabase.from('frota_veiculos').select(CAMPOS_VEICULO).order('nome');
  if (!incluirInativos) q = q.eq('ativo', true);
  const d = await consulta<Veiculo[]>(q);
  return [...d].sort((a, b) => Number(b.fazenda_id === fazendaAtivaId) - Number(a.fazenda_id === fazendaAtivaId));
}

export function itemVeiculo(v: Veiculo, leitura?: LeituraAtual | null): ItemLista {
  const partes = [ROTULO_TIPO_VEICULO[v.tipo] ?? v.tipo, v.placa, ROTULO_USO[v.uso]];
  if (leitura?.leitura != null && v.medidor !== 'nenhum') partes.push(textoLeitura(leitura.leitura, v.medidor));
  return { id: v.id, titulo: `Nº ${v.numero} · ${v.nome}`, detalhe: partes.filter(Boolean).join(' · ') };
}

/** Produtos do estoque (com o saldo na fazenda): combustível do tanque, ou óleo, filtros e peças. */
export async function carregarProdutosEstoque(fazendaId: string, categorias: string[]): Promise<ItemLista[]> {
  const [ins, movs] = await Promise.all([
    consulta<any[]>(supabase.from('insumos').select('id, nome, categoria, unidade').eq('ativo', true).in('categoria', categorias).order('nome')),
    consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade').eq('fazenda_id', fazendaId)),
  ]);
  const saldo: Record<string, number> = {};
  for (const m of movs) saldo[m.insumo_id] = (saldo[m.insumo_id] ?? 0) + (m.tipo === 'saida' ? -Number(m.quantidade) : Number(m.quantidade));
  return ins.map((i) => ({ id: i.id, titulo: i.nome, detalhe: `Estoque: ${formatarQtd(saldo[i.id] ?? 0, 2)} ${i.unidade ?? ''}` }));
}

// ---------- fretes ----------
export const COBRANCAS = [
  { valor: 'fechado', rotulo: 'Valor fechado' },
  { valor: 'km', rotulo: 'Por km rodado' },
  { valor: 'tonelada', rotulo: 'Por tonelada' },
  { valor: 'unidade', rotulo: 'Por unidade (saca, cabeça…)' },
];
export const CARGAS_COMUNS = ['Café', 'Gado', 'Adubo', 'Calcário', 'Grãos', 'Ração', 'Madeira', 'Mudança', 'Outro'];
export const UNIDADES_CARGA = ['sacas', 'cabeças', 't', 'kg', 'm³', 'unidades'].map((u) => ({ valor: u, rotulo: u }));

/**
 * Combustível da viagem: os abastecimentos do veículo entre a saída e a chegada.
 * Sem abastecimento no período, estima pelos km × consumo médio × último preço do litro.
 */
export async function combustivelDaViagem(
  veiculoId: string,
  medidor: string,
  de: string,
  ate: string,
  km: number | null,
  naViagem: { valor: number; litros: number } = { valor: 0, litros: 0 },
): Promise<{ valor: number | null; litros: number | null; estimado: boolean }> {
  const todos = await consulta<any[]>(supabase.from('frota_abastecimentos').select('data, leitura, litros, tanque_cheio, valor_total, arla_valor, frete_id').eq('veiculo_id', veiculoId).order('data').limit(500));
  // os da estrada vêm da tela do frete (naViagem); aqui só os avulsos do período (ex.: tanque da fazenda antes de sair)
  const noPeriodo = todos.filter((a) => !a.frete_id && a.data >= de && a.data <= ate);
  if (noPeriodo.length || naViagem.litros > 0) {
    return {
      valor: noPeriodo.reduce((s, a) => s + Number(a.valor_total ?? 0) + Number(a.arla_valor ?? 0), 0) + naViagem.valor,
      litros: noPeriodo.reduce((s, a) => s + Number(a.litros), 0) + naViagem.litros,
      estimado: false,
    };
  }
  if (!km || medidor !== 'km') return { valor: null, litros: null, estimado: true };
  const c = calcularConsumo(todos.map((a) => ({ data: a.data, leitura: a.leitura == null ? null : Number(a.leitura), litros: Number(a.litros), tanque_cheio: a.tanque_cheio, valor_total: a.valor_total })), medidor);
  const ult = [...todos].reverse().find((a) => Number(a.valor_total) > 0 && Number(a.litros) > 0);
  if (!c.media || !ult) return { valor: null, litros: null, estimado: true };
  const litros = km / c.media;
  return { valor: Math.round(litros * (Number(ult.valor_total) / Number(ult.litros)) * 100) / 100, litros, estimado: true };
}
