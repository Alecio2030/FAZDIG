// Mangas: dados de manejo do pasto, estruturas (bebedouro, cochos, cerca) e histórico.
import { consulta, supabase } from './supabase';
import { doBanco } from './datas';
import { formatarNumero } from './formatos';

export type Categoria = 'bebedouro' | 'cocho_sal' | 'cocho_alimentacao' | 'cerca';
export type TipoManejo = 'limpeza' | 'abastecimento' | 'manutencao';

type Info = {
  rotulo: string;
  /** manejo que se registra com data para esta estrutura */
  manejo: TipoManejo;
  rotuloManejo: string; // "Limpeza", "Abastecimento"...
  tiposPadrao: string[];
  /** rótulo do produto colocado no cocho (só cochos) */
  rotuloProduto?: string;
  produtosPadrao?: string[];
};

export const CATEGORIAS: Record<Categoria, Info> = {
  bebedouro: {
    rotulo: 'Bebedouro',
    manejo: 'limpeza',
    rotuloManejo: 'Limpeza',
    tiposPadrao: ['Natural', 'Cimento', 'Aço', 'Plástico', 'Fibra'],
  },
  cocho_sal: {
    rotulo: 'Cocho de sal',
    manejo: 'abastecimento',
    rotuloManejo: 'Abastecimento',
    tiposPadrao: ['Cimento', 'Madeira', 'Plástico', 'Borrachão'],
    rotuloProduto: 'Insumo',
    produtosPadrao: ['Sal mineral Fos 80', 'Proteinado Fos Cria', 'Proteico energético'],
  },
  cocho_alimentacao: {
    rotulo: 'Cocho de alimentação',
    manejo: 'abastecimento',
    rotuloManejo: 'Abastecimento',
    tiposPadrao: ['Borrachão', 'Cimento', 'Madeira', 'Plástico'],
    rotuloProduto: 'Alimento',
    produtosPadrao: ['Silagem de milho', 'Ração'],
  },
  cerca: {
    rotulo: 'Cerca',
    manejo: 'manutencao',
    rotuloManejo: 'Manutenção',
    tiposPadrao: ['Arame farpado', 'Arame liso', 'Elétrica', 'Tela', 'Madeira'],
  },
};

export const ORDEM_CATEGORIAS: Categoria[] = ['bebedouro', 'cocho_sal', 'cocho_alimentacao', 'cerca'];

export const ROTULO_MANEJO: Record<TipoManejo, string> = {
  limpeza: 'Limpeza',
  abastecimento: 'Abastecimento',
  manutencao: 'Manutenção',
};

export const USOS_PADRAO = ['Corte', 'Leite', 'Cria', 'Recria', 'Engorda', 'Maternidade', 'Reserva'];

export const TOPOGRAFIAS = ['Plana', 'Suave ondulada', 'Ondulada', 'Forte ondulada', 'Montanhosa'];

/** "Bebedouro – Cimento (perto da porteira)" */
export function nomeEstrutura(e: { categoria: Categoria; tipo?: string | null; descricao?: string | null }): string {
  const base = CATEGORIAS[e.categoria]?.rotulo ?? 'Estrutura';
  return `${base}${e.tipo ? ` – ${e.tipo}` : ''}${e.descricao ? ` (${e.descricao})` : ''}`;
}

/** Texto de um manejo: "20/09/2026 – Sal mineral Fos 80, 30 kg" */
export function textoManejo(m: { data: string; produto?: string | null; quantidade_kg?: number | null; servico?: string | null }): string {
  const partes = [m.produto, m.quantidade_kg != null ? `${formatarNumero(m.quantidade_kg, 1)} kg` : null, m.servico].filter(Boolean);
  return `${doBanco(m.data)}${partes.length ? ` – ${partes.join(', ')}` : ''}`;
}

/** Junta sugestões: primeiro as já usadas (mais recentes), depois as padrão; sem repetir. */
function juntar(usados: (string | null)[], padrao: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const v of [...usados, ...padrao]) {
    const t = (v ?? '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(t);
  }
  return saida;
}

/** Indicações de uso já digitadas + as padrão. */
export async function sugestoesUso(): Promise<string[]> {
  const d = await consulta<any[]>(
    supabase.from('areas').select('indicacao_uso').eq('tipo', 'manga').not('indicacao_uso', 'is', null).order('created_at', { ascending: false }).limit(300),
  );
  return juntar(d.map((x) => x.indicacao_uso), USOS_PADRAO);
}

/** Tipos de estrutura já digitados para a categoria + os padrão. */
export async function sugestoesTipo(c: Categoria): Promise<string[]> {
  const d = await consulta<any[]>(
    supabase.from('manga_estruturas').select('tipo').eq('categoria', c).not('tipo', 'is', null).order('created_at', { ascending: false }).limit(300),
  );
  return juntar(d.map((x) => x.tipo), CATEGORIAS[c].tiposPadrao);
}

/** Insumos/alimentos já colocados nesse tipo de cocho + os padrão. */
export async function sugestoesProduto(c: Categoria): Promise<string[]> {
  const d = await consulta<any[]>(
    supabase.from('manga_manejos').select('produto').eq('categoria', c).not('produto', 'is', null).order('data', { ascending: false }).limit(500),
  );
  return juntar(d.map((x) => x.produto), CATEGORIAS[c].produtosPadrao ?? []);
}

/** Serviços de cerca já lançados. */
export async function sugestoesServico(): Promise<string[]> {
  const d = await consulta<any[]>(
    supabase.from('manga_manejos').select('servico').eq('categoria', 'cerca').not('servico', 'is', null).order('data', { ascending: false }).limit(300),
  );
  return juntar(d.map((x) => x.servico), ['Troca de arame', 'Troca de mourões', 'Esticar arame', 'Roçada da linha da cerca']);
}
