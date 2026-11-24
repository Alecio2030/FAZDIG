import { consulta, supabase } from './supabase';
import { formatarMoeda, formatarNumero } from './formatos';
import { doBanco } from './datas';
import { faixaDaIdade, type Sexo } from './faixas';
import { mesesEntre } from './rebanho';

/** V208: um item da entrada da parceria (uma movimentação de entrada, com o seu lote ou sem lote). */
export type ItemEntradaParceria = {
  movId: string;
  lote: number | null;
  cabecas: number;
  semLote: number; // animais ainda ativos e sem lote
  pesoKg: number | null;
  sexos: string; // "10 machos, 2 fêmeas"
  idades: string; // faixas de idade na entrada
  racas: string;
  ferros: string;
  /** V209: peso bruto e médio de entrada separados por sexo */
  pesoSexo: string[];
};

export type ResumoParceria = {
  id: string;
  numero: number;
  situacao: 'aberta' | 'encerrada';
  parceiro: string;
  pessoaId: string;
  dataEntrada: string;
  dataPrevista: string | null;
  dataSaida: string | null;
  cabecas: number;
  pesoKg: number | null;
  condicoes: string;
  vendaNumero: number | null;
  itens: ItemEntradaParceria[];
  sexos: string;
  idades: string;
  racas: string;
  ferros: string;
  semLote: number;
  pesoSexo: string[];
};

const um = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const juntar = (l: (string | null | undefined)[]) => [...new Set(l.filter(Boolean) as string[])].join(', ');

function contarSexo(animais: { sexo: string | null }[]) {
  const m = animais.filter((a) => (a.sexo ?? '').trim() === 'M').length;
  const f = animais.filter((a) => (a.sexo ?? '').trim() === 'F').length;
  return [m ? `${formatarNumero(m)} ${m === 1 ? 'macho' : 'machos'}` : '', f ? `${formatarNumero(f)} ${f === 1 ? 'fêmea' : 'fêmeas'}` : ''].filter(Boolean).join(', ');
}

function faixasNaEntrada(animais: { sexo: string | null; data_nascimento: string | null }[], dataIso: string) {
  const cont = new Map<string, number>();
  for (const a of animais) {
    const sx = (a.sexo ?? '').trim() as Sexo;
    if (!a.data_nascimento || (sx !== 'M' && sx !== 'F')) continue;
    const f = faixaDaIdade(sx, Math.max(0, mesesEntre(a.data_nascimento, dataIso)));
    const k = `${f.rotulo}${sx === 'M' ? ' (M)' : ' (F)'}`;
    cont.set(k, (cont.get(k) ?? 0) + 1);
  }
  return [...cont.entries()].map(([k, n]) => `${formatarNumero(n)} de ${k}`).join(', ');
}

/** V209: "Machos: 10 cab. · peso bruto 3.500,0 kg · média 350,00 kg" (uma linha por sexo). */
function pesoPorSexo(its: { peso_kg: number | null; animal: any }[]): string[] {
  const linhas: string[] = [];
  for (const [sx, nome] of [['M', 'Machos'], ['F', 'Fêmeas']] as const) {
    const doSexo = its.filter((i) => (um<any>(i.animal)?.sexo ?? '').trim() === sx);
    if (!doSexo.length) continue;
    const comPeso = doSexo.filter((i) => i.peso_kg != null);
    const kg = comPeso.reduce((s, i) => s + Number(i.peso_kg), 0);
    let l = `${nome}: ${formatarNumero(doSexo.length)} cab.`;
    if (comPeso.length) {
      l += ` · peso bruto ${formatarNumero(kg, 1)} kg · média ${formatarNumero(kg / comPeso.length, 2)} kg`;
      if (comPeso.length < doSexo.length) l += ` (peso de ${formatarNumero(comPeso.length)} cab.)`;
    } else l += ' · peso não informado';
    linhas.push(l);
  }
  return linhas;
}

export function textoCondicoes(p: any): string {
  if (p.modalidade === 'apascentamento') {
    return `Apascentamento: ${formatarMoeda(Number(p.preco_cab_mes ?? 0))} por cabeça por mês${p.data_prevista ? `, saída prevista em ${doBanco(p.data_prevista)}` : ''}`;
  }
  return `Por rendimento: fazenda ${formatarNumero(Number(p.perc_fazenda ?? 0), 2)}% e parceiro ${formatarNumero(Number(p.perc_parceiro ?? 0), 2)}% do ganho, arroba de ${formatarNumero(Number(p.kg_arroba ?? 30), 2)} kg${p.data_prevista ? `, saída prevista em ${doBanco(p.data_prevista)}` : ''}`;
}

/** Lê as parcerias (de uma fazenda, ou só uma pelo id) com o que entrou em cada item. */
export async function lerParcerias(fid: string, filtro: { id?: string; situacao?: 'aberta' | 'encerrada' } = {}): Promise<ResumoParceria[]> {
  let q = supabase
    .from('parcerias')
    .select('id, numero, situacao, pessoa_id, data_entrada, data_prevista, data_saida, cabecas_entrada, peso_entrada_kg, modalidade, preco_cab_mes, perc_fazenda, perc_parceiro, kg_arroba, mov_entrada_id, pessoa:pessoas ( nome ), venda:vendas ( numero )')
    .eq('fazenda_id', fid)
    .order('numero', { ascending: false })
    .limit(200);
  if (filtro.id) q = q.eq('id', filtro.id);
  if (filtro.situacao) q = q.eq('situacao', filtro.situacao);
  const ps = await consulta<any[]>(q);
  if (!ps.length) return [];
  const ids = ps.map((p) => p.id);
  const movs = await consulta<any[]>(
    supabase
      .from('movimentacoes')
      .select('id, parceria_id, data, created_at, lote:lotes!movimentacoes_lote_destino_id_fkey ( numero ),' +
        ' itens:movimentacao_itens ( peso_kg, animal:animais ( sexo, data_nascimento, lote_id, situacao, raca:racas ( nome ), ferro:ferros ( descricao ) ) )')
      .eq('tipo', 'entrada_parceria')
      .in('parceria_id', ids)
      .order('created_at'),
  );
  // entradas antigas (antes da V207) sem parceria_id na movimentação: pelo mov_entrada_id
  const faltam = ps.filter((p) => p.mov_entrada_id && !movs.some((m) => m.id === p.mov_entrada_id)).map((p) => p.mov_entrada_id);
  if (faltam.length) {
    const extra = await consulta<any[]>(
      supabase
        .from('movimentacoes')
        .select('id, parceria_id, data, created_at, lote:lotes!movimentacoes_lote_destino_id_fkey ( numero ),' +
          ' itens:movimentacao_itens ( peso_kg, animal:animais ( sexo, data_nascimento, lote_id, situacao, raca:racas ( nome ), ferro:ferros ( descricao ) ) )')
        .in('id', faltam),
    );
    for (const m of extra) m.parceria_id = ps.find((p) => p.mov_entrada_id === m.id)?.id;
    movs.push(...extra);
  }

  return ps.map((p) => {
    const ms = movs.filter((m) => m.parceria_id === p.id);
    const itens: ItemEntradaParceria[] = ms.map((m) => {
      const its = (m.itens ?? []) as any[];
      const an = its.map((i) => um(i.animal)).filter(Boolean) as any[];
      const pesos = its.map((i) => i.peso_kg).filter((x) => x != null).map(Number);
      return {
        movId: m.id,
        lote: um<any>(m.lote)?.numero ?? null,
        cabecas: its.length,
        semLote: an.filter((a) => a.situacao === 'ativo' && !a.lote_id).length,
        pesoKg: pesos.length === its.length && pesos.length ? Math.round(pesos.reduce((s, x) => s + x, 0) * 100) / 100 : null,
        sexos: contarSexo(an),
        idades: faixasNaEntrada(an, p.data_entrada),
        racas: juntar(an.map((a) => um<any>(a.raca)?.nome)),
        ferros: juntar(an.map((a) => um<any>(a.ferro)?.descricao)),
        pesoSexo: pesoPorSexo(its),
      };
    });
    const todos = ms.flatMap((m) => ((m.itens ?? []) as any[]).map((i) => um<any>(i.animal)).filter(Boolean)) as any[];
    return {
      id: p.id,
      numero: p.numero,
      situacao: p.situacao,
      parceiro: um<any>(p.pessoa)?.nome ?? '—',
      pessoaId: p.pessoa_id,
      dataEntrada: p.data_entrada,
      dataPrevista: p.data_prevista,
      dataSaida: p.data_saida,
      cabecas: p.cabecas_entrada,
      pesoKg: p.peso_entrada_kg != null ? Number(p.peso_entrada_kg) : null,
      condicoes: textoCondicoes(p),
      vendaNumero: um<any>(p.venda)?.numero ?? null,
      itens,
      sexos: contarSexo(todos),
      idades: faixasNaEntrada(todos, p.data_entrada),
      racas: juntar(todos.map((a) => um<any>(a.raca)?.nome)),
      ferros: juntar(todos.map((a) => um<any>(a.ferro)?.descricao)),
      semLote: itens.reduce((s, i) => s + i.semLote, 0),
      pesoSexo: pesoPorSexo(ms.flatMap((m) => (m.itens ?? []) as any[])),
    };
  });
}
