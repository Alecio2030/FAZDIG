// Página de início (capa) e painel: logos, tempo por fazenda, títulos da semana, saldos e lembretes urgentes.
import { consulta, supabase } from './supabase';
import { hojeBanco } from './datas';
import { CAMPOS_TITULO, saldoTitulo, um, type Titulo } from './titulos';
import { chaveAgenda, lerAutomaticos, somarDiasIso, type AgendaInfo, type ItemAgenda } from './agenda';
import { lerPrevisao, localDaFazenda, tempo, textoMm } from './clima';

// ---------- logos ----------
/** grupo: nome do grupo (ex.: GRUPO CASSANI) ou, sem ele, o nome do produtor — em destaque na página de rosto */
export type Logos = { produtorId: string | null; produtor: string | null; grupo: string | null; fazendas: Record<string, string | null> };

export async function lerLogos(fazendaIds: string[]): Promise<Logos> {
  const lerProdutor = async () => {
    const { data, error } = await supabase.from('produtor').select('id, logo, nome, nome_grupo').order('created_at').limit(1);
    // banco ainda sem o arquivo da V127 (coluna nome_grupo): lê sem ela
    if (error && /nome_grupo/i.test(error.message ?? '')) return consulta<any[]>(supabase.from('produtor').select('id, logo, nome').order('created_at').limit(1));
    if (error) throw error;
    return (data ?? []) as any[];
  };
  const [f, p] = await Promise.all([consulta<any[]>(supabase.from('fazendas').select('id, logo').in('id', fazendaIds)), lerProdutor()]);
  const grupo = (p[0]?.nome_grupo ?? '').trim() || (p[0]?.nome ?? '').trim() || null;
  return { produtorId: p[0]?.id ?? null, produtor: p[0]?.logo ?? null, grupo, fazendas: Object.fromEntries(f.map((x) => [x.id, x.logo ?? null])) };
}

/** Grava (ou tira, com null) a logo do proprietário ou de uma fazenda. A imagem vai como texto (data URI). */
export async function gravarLogo(alvo: { produtorId: string } | { fazendaId: string }, imagem: string | null): Promise<void> {
  const q = 'produtorId' in alvo ? supabase.from('produtor').update({ logo: imagem }).eq('id', alvo.produtorId).select('id') : supabase.from('fazendas').update({ logo: imagem }).eq('id', alvo.fazendaId).select('id');
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) throw new Error('Só o dono (ou quem tem acesso completo à fazenda) pode trocar a logo.');
}

export const LOGO_TAMANHO_MAXIMO = 1_500_000; // caracteres da imagem em texto (cerca de 1 MB)

// ---------- tempo ----------
/** agora: temperatura do momento; ceu: como está o tempo hoje (ex.: "Parcialmente nublado") */
export type TempoFazenda = { max: number | null; min: number | null; chuva: number; prob: number | null; agora: number | null; ceu: string | null; icone: string | null };

/** Máxima, mínima e chuva prevista para hoje no ponto da fazenda. Null se a fazenda não tem local ou não há internet. */
export async function tempoDaFazenda(fazendaId: string, forcar = false): Promise<TempoFazenda | null> {
  try {
    const local = await localDaFazenda(fazendaId);
    if (!local) return null;
    const p = await lerPrevisao(local, forcar);
    const hoje = p.dias.find((d) => d.data === p.hoje);
    if (!hoje) return null;
    const ceu = hoje.codigo != null ? tempo(hoje.codigo) : null;
    return { max: hoje.max, min: hoje.min, chuva: hoje.chuva ?? 0, prob: hoje.prob, agora: p.agora?.temp ?? null, ceu: ceu?.texto ?? null, icone: ceu?.icone ?? null };
  } catch {
    return null;
  }
}

/** "Máx. 31° · Mín. 20° · Chuva: 4 mm previstos" ou "... · Sem chuva prevista" */
export function textoTempo(t: TempoFazenda): string {
  const grau = (v: number | null) => (v == null ? '–' : `${Math.round(v)}°`);
  const chuva = t.chuva >= 0.1 ? `Vai chover: ${textoMm(t.chuva)} mm previstos${t.prob != null ? ` (${Math.round(t.prob)}%)` : ''}` : 'Sem chuva prevista';
  return `Máx. ${grau(t.max)} · Mín. ${grau(t.min)} · ${chuva}`;
}

// ---------- títulos: hoje e próximos 7 dias ----------
export type TituloPainel = Titulo & { fazenda_id: string | null; saldo: number };
/** vencidos: antes de hoje; hoje: vencem hoje; proximos: de amanhã até daqui a 7 dias (sem hoje); total: a soma dos três */
export type ResumoTitulos = {
  vencidos: TituloPainel[];
  hoje: TituloPainel[];
  proximos: TituloPainel[];
  totalVencidos: number;
  totalHoje: number;
  totalProximos: number;
  total: number;
};

export async function lerTitulosSemana(fazendaIds: string[], tipo: 'pagar' | 'receber'): Promise<ResumoTitulos> {
  const hoje = hojeBanco();
  const d = await consulta<any[]>(
    supabase
      .from('lancamentos')
      .select(`${CAMPOS_TITULO}, fazenda_id`)
      // as contas são do Grupo: as das fazendas liberadas e as da Administração (sem fazenda)
      .or(`fazenda_id.in.(${fazendaIds.join(',')}),fazenda_id.is.null`)
      .eq('tipo', tipo)
      .in('situacao', ['aberto', 'parcial'])
      .lte('data_vencimento', somarDiasIso(hoje, 7))
      .order('data_vencimento')
      .limit(2000),
  );
  const todos: TituloPainel[] = d.map((t) => ({ ...t, pessoa: um(t.pessoa), saldo: saldoTitulo(t) }));
  const vencidos = todos.filter((t) => t.data_vencimento < hoje);
  const deHoje = todos.filter((t) => t.data_vencimento === hoje);
  const proximos = todos.filter((t) => t.data_vencimento > hoje);
  const soma = (l: TituloPainel[]) => Math.round(l.reduce((s, t) => s + t.saldo, 0) * 100) / 100;
  return { vencidos, hoje: deHoje, proximos, totalVencidos: soma(vencidos), totalHoje: soma(deHoje), totalProximos: soma(proximos), total: soma(todos) };
}

// ---------- saldos ----------
export type Saldos = { caixa: number; banco: number; aplicacao: number; contas: { id: string; nome: string; tipo: string; saldo: number }[] };

/** Saldos calculados pelo sistema: saldo inicial mais recebimentos menos pagamentos de cada conta. */
export async function lerSaldos(): Promise<Saldos> {
  const { data, error } = await supabase.rpc('saldos_painel');
  if (error) throw error;
  const contas = ((data ?? []) as any[]).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo: Number(c.saldo) }));
  const soma = (t: string) => Math.round(contas.filter((c) => c.tipo === t).reduce((s, c) => s + c.saldo, 0) * 100) / 100;
  return { caixa: soma('caixa'), banco: soma('banco'), aplicacao: soma('aplicacao'), contas };
}

// ---------- lembretes mais urgentes ----------
/** agendaChave: 'produtor', 'escritorio' ou o id da fazenda */
export type Lembrete = ItemAgenda & { onde: string; agendaChave: string };
export type Urgentes = { itens: Lembrete[]; total: number; paraHoje: Record<string, number> };

/** Os lembretes em aberto das agendas que o usuário abre (as que o produtor liberou), do mais urgente para o menos. */
export async function lerUrgentes(agendas: AgendaInfo[], quantos = 5): Promise<Urgentes> {
  const hoje = hojeBanco();
  const minhas = agendas.filter((a) => a.podeAbrir);
  const nomes = Object.fromEntries(minhas.map((a) => [chaveAgenda(a), a.nome]));
  const comAgenda = minhas.filter((a) => a.agenda === 'fazenda' && a.fazendaId);
  const [autos, anot] = await Promise.all([
    Promise.all(comAgenda.map((f) => lerAutomaticos(f.fazendaId!, somarDiasIso(hoje, 30)).then((l) => l.map((i) => ({ ...i, onde: f.nome, agendaChave: f.fazendaId! }))).catch(() => [] as Lembrete[]))),
    consulta<any[]>(supabase.from('agenda_itens').select('id, agenda, fazenda_id, data, titulo, observacao, autor').is('feito_em', null).lte('data', somarDiasIso(hoje, 30)).order('data').limit(300)).catch(() => []),
  ]);
  // o banco devolve também as tarefas que o usuário mandou para agendas que ele não abre: essas ficam de fora
  const anotacoes: Lembrete[] = anot
    .map((x) => ({ chave: x.id, id: x.id, data: x.data, titulo: x.titulo, detalhe: x.observacao, origem: 'anotacao' as const, autor: x.autor, agendaChave: (x.agenda === 'fazenda' ? x.fazenda_id : x.agenda) as string, onde: '' }))
    .filter((x) => nomes[x.agendaChave])
    .map((x) => ({ ...x, onde: nomes[x.agendaChave] }));
  const todos = [...autos.flat(), ...anotacoes].sort((a, b) => (a.data === b.data ? a.titulo.localeCompare(b.titulo) : a.data < b.data ? -1 : 1));
  // por agenda: quantos estão atrasados ou são para hoje (o número que aparece no ícone)
  const paraHoje: Record<string, number> = {};
  for (const i of todos) if (i.data <= hoje) paraHoje[i.agendaChave] = (paraHoje[i.agendaChave] ?? 0) + 1;
  return { itens: todos.slice(0, quantos), total: todos.length, paraHoje };
}
