// V163: GTA (Guia de Trânsito Animal). A e-GTA é emitida no Siapec (IDAF) com o login do produtor;
// aqui o app prepara a ficha com os dados que o Siapec pede e guarda a GTA emitida.
import { consulta, supabase } from './supabase';
import { mascaraCpfCnpj, somenteDigitos } from './formatos';
import { FAIXAS_IDADE, faixaDaIdade, type Sexo } from './faixas';

/** Portal do Siapec (IDAF-ES), onde o produtor emite a e-GTA. */
export const URL_SIAPEC = 'https://siapec3.idaf.es.gov.br/siapec3/login.wsp';

/** Faixas da GTA: as mesmas para machos e fêmeas (no estoque do IDAF as fêmeas têm 0–2, 3–8 e 9–12, que somam em 0–12). */
export const FAIXAS_GTA = [
  { de: 0, ate: 12, rotulo: '0 a 12 meses' },
  { de: 13, ate: 24, rotulo: '13 a 24 meses' },
  { de: 25, ate: 36, rotulo: '25 a 36 meses' },
  { de: 37, ate: null as number | null, rotulo: 'Acima de 36 meses' },
];
export const faixaGta = (meses: number) => FAIXAS_GTA.find((f) => f.ate === null || meses <= f.ate)!;
/**
 * V181: linhas da grade do gado (GTA, estoque fiscal e movimentação): as faixas da GTA e, nas fêmeas,
 * as do estoque do IDAF (0 a 2, 3 a 8 e 9 a 12, que somam a linha "0 a 12" do papel da GTA).
 * Ordem: por faixa e, dentro dela, macho e fêmea.
 */
export const LINHAS_GTA: { chave: string; sexo: Sexo; rotulo: string }[] = [...FAIXAS_IDADE.M, ...FAIXAS_IDADE.F]
  .sort((a, b) => a.de - b.de || (a.sexo === 'M' ? -1 : 1))
  .map((f) => ({ chave: `${f.sexo}${f.de}`, sexo: f.sexo, rotulo: `Bovino, ${f.sexo === 'M' ? 'macho' : 'fêmea'}, ${f.ate === null ? 'acima de 36 meses' : f.rotulo}` }));

/** Fêmeas de 0 a 12 meses, como vão no papel da GTA (Siapec): soma das faixas 0 a 2, 3 a 8 e 9 a 12. */
export const femeas0a12 = (q: Record<string, number | string | undefined>) => ['F0', 'F3', 'F9'].reduce((t, k) => t + (Number(q[k]) || 0), 0);

export const FINALIDADES_GTA = [
  'Abate',
  'Engorda',
  'Recria',
  'Reprodução',
  'Apascentamento',
  'Retorno de apascentamento',
  'Exposição',
  'Leilão',
  'Transferência entre propriedades',
  'Outra',
];
export const TRANSPORTES_GTA = ['Rodoviário', 'A pé', 'Outro'];

export type Parte = { doc: string; nome: string; estabelecimento: string; codigo: string; municipio: string; uf: string };
export const PARTE_VAZIA: Parte = { doc: '', nome: '', estabelecimento: '', codigo: '', municipio: '', uf: '' };
export type Quantidades = Record<string, number>;

/** Código do Estabelecimento no órgão de defesa (IDAF): 00 000 000 000. */
export function mascaraEstabelecimento(t: string): string {
  const d = somenteDigitos(t).slice(0, 11);
  const p = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 11)].filter(Boolean);
  return p.join(' ');
}

/** "ES 816265 D" → partes (UF, número, série). */
export function partesNumeroGta(numero: string): { uf: string; numero: string; serie: string } | null {
  const m = /^([A-Z]{2})\s*(\d+)\s*([A-Z0-9]*)$/.exec(numero.trim().toUpperCase());
  return m ? { uf: m[1], numero: m[2], serie: m[3] } : null;
}

export const totalSexo = (q: Quantidades, sexo: Sexo) => LINHAS_GTA.filter((l) => l.sexo === sexo).reduce((t, l) => t + (Number(q[l.chave]) || 0), 0);

/** Idade em meses completos na data (igual ao idade_meses() do banco). */
function meses(nasc: string, em: string): number {
  const [a1, m1, d1] = nasc.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = em.slice(0, 10).split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Procedência pela fazenda do grupo (dados fiscais próprios ou, sem eles, os do produtor). */
export async function parteDaFazenda(fazendaId: string): Promise<Parte> {
  const [f, p] = await Promise.all([
    consulta<any>(supabase.from('fazendas').select('nome, razao_social, cpf_cnpj, inscricao_defesa, municipio, uf').eq('id', fazendaId).single()),
    supabase.from('produtor').select('nome, cpf_cnpj').order('created_at').limit(1).maybeSingle(),
  ]);
  const prod = (p.data as any) ?? {};
  return {
    doc: mascaraCpfCnpj(f.cpf_cnpj ?? prod.cpf_cnpj ?? ''),
    nome: f.razao_social ?? prod.nome ?? '',
    estabelecimento: f.nome ?? '',
    codigo: mascaraEstabelecimento(f.inscricao_defesa ?? ''),
    municipio: f.municipio ?? '',
    uf: (f.uf ?? '').trim(),
  };
}

/** Destino/procedência por uma pessoa e, se tiver, uma das fazendas dela (com o Código do Estabelecimento). */
export async function parteDaPessoa(pessoaId: string, faturamentoId?: string | null): Promise<{ parte: Parte; fazendas: { id: string; nome: string }[] }> {
  const [p, fz] = await Promise.all([
    consulta<any>(supabase.from('pessoas').select('nome, cpf_cnpj, municipio, uf').eq('id', pessoaId).single()),
    consulta<any[]>(supabase.from('pessoas_faturamento').select('id, nome_fazenda, inscricao_sanitaria, municipio, uf').eq('pessoa_id', pessoaId).order('created_at')),
  ]);
  const escolhida = fz.find((x) => x.id === faturamentoId) ?? (fz.length === 1 ? fz[0] : null);
  return {
    parte: {
      doc: mascaraCpfCnpj(p.cpf_cnpj ?? ''),
      nome: p.nome ?? '',
      estabelecimento: escolhida?.nome_fazenda ?? '',
      codigo: mascaraEstabelecimento(escolhida?.inscricao_sanitaria ?? ''),
      municipio: escolhida?.municipio ?? p.municipio ?? '',
      uf: (escolhida?.uf ?? p.uf ?? '').trim(),
    },
    fazendas: fz.map((x) => ({ id: x.id, nome: x.nome_fazenda ?? 'Fazenda sem nome' })),
  };
}

/** O que um movimento já lançado dá para a GTA: quantidades por sexo e faixa (V181: fêmeas 0-2, 3-8, 9-12) (idade na data do movimento), pessoa e venda. */
export async function dadosDoMovimento(movId: string): Promise<{
  data: string;
  tipo: string;
  pessoaId: string | null;
  vendaId: string | null;
  faturamentoId: string | null;
  quantidades: Quantidades;
  semIdade: number;
}> {
  const m = await consulta<any>(
    supabase
      .from('movimentacoes')
      .select('data, tipo, pessoa_id, venda_id, venda:vendas ( pessoa_faturamento_id ), itens:movimentacao_itens ( sexo, animal:animais ( sexo, data_nascimento ) )')
      .eq('id', movId)
      .single(),
  );
  // V164: venda de vários lotes: soma as saídas de todos os lotes da mesma venda
  let itens: any[] = (m.itens ?? []).map((it: any) => ({ ...it, data: m.data, movId }));
  if (m.venda_id) {
    const outros = await consulta<any[]>(
      supabase.from('movimentacoes').select('id, data, itens:movimentacao_itens ( sexo, animal:animais ( sexo, data_nascimento ) )').eq('venda_id', m.venda_id).neq('id', movId),
    );
    for (const o of outros) itens = itens.concat((o.itens ?? []).map((it: any) => ({ ...it, data: o.data, movId: o.id })));
  }
  const q: Quantidades = {};
  let semIdade = 0;
  // V191: venda só pela quantidade (fazenda sem os animais no rebanho): as faixas vêm do Estoque de gado
  const movIds = [movId];
  if (m.venda_id) {
    const ms = await consulta<any[]>(supabase.from('movimentacoes').select('id').eq('venda_id', m.venda_id));
    for (const x of ms) if (!movIds.includes(x.id)) movIds.push(x.id);
  }
  const lancs = await consulta<any[]>(supabase.from('estoque_fiscal_lanc').select('movimentacao_id, quantidades').in('movimentacao_id', movIds));
  const porQtde = new Set<string>();
  for (const l of lancs) {
    porQtde.add(l.movimentacao_id);
    for (const [k, v] of Object.entries(l.quantidades ?? {})) q[k] = (q[k] ?? 0) + Math.abs(Number(v) || 0);
  }
  for (const it of itens) {
    if (porQtde.has(it.movId)) continue;
    const a = Array.isArray(it.animal) ? it.animal[0] : it.animal;
    const sexo = String(it.sexo ?? a?.sexo ?? '').trim();
    if (!a?.data_nascimento || (sexo !== 'M' && sexo !== 'F')) {
      semIdade++;
      continue;
    }
    const k = `${sexo}${faixaDaIdade(sexo as Sexo, Math.max(meses(a.data_nascimento, it.data), 0)).de}`;
    q[k] = (q[k] ?? 0) + 1;
  }
  const venda = Array.isArray(m.venda) ? m.venda[0] : m.venda;
  return { data: m.data, tipo: m.tipo, pessoaId: m.pessoa_id, vendaId: m.venda_id, faturamentoId: venda?.pessoa_faturamento_id ?? null, quantidades: q, semIdade };
}

/** Lê a foto ou o PDF da e-GTA (a IA lê no servidor, função ler-gta). */
export async function lerGta(base64: string, formato: string): Promise<{ dados: any; arquivo: string | null } | { erro: string }> {
  const { data: d, error } = await supabase.functions.invoke('ler-gta', { body: { imagem: base64, formato } });
  if (error) {
    let msg = 'Não foi possível ler a GTA agora.';
    try {
      const j = await (error as any).context?.json();
      if (j?.erro) msg = j.erro;
    } catch {
      /* mantém a mensagem padrão */
    }
    return { erro: msg };
  }
  return { dados: d?.dados ?? {}, arquivo: d?.arquivo ?? null };
}
