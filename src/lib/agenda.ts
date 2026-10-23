// Agenda: anotações (Produtor, Fazendas e Escritório) e obrigações automáticas tiradas dos lançamentos da fazenda.
import { consulta, supabase } from './supabase';
import { hojeBanco } from './datas';
import type { NomeIcone } from '../componentes/ItemMenu';
import type { PilhaParams } from '../navegacao/rotas';

/** Produtor, Administrador (V127), Fazenda (a do gerente de cada fazenda) e Escritório. */
export type TipoAgenda = 'produtor' | 'admin' | 'fazenda' | 'escritorio';
export type AgendaRef = { agenda: TipoAgenda; fazendaId?: string };

/** Uma agenda da relação: de quem é (participantes) e se o usuário pode abri-la. Quem abre o quê é o produtor que define. */
export type AgendaInfo = AgendaRef & { nome: string; participantes: string | null; podeAbrir: boolean };

/** 'produtor', 'escritorio' ou o id da fazenda */
export const chaveAgenda = (a: AgendaRef): string => (a.agenda === 'fazenda' ? a.fazendaId ?? '' : a.agenda);

/** A relação de todas as agendas, com os participantes de cada uma. Vazia para quem não participa de nenhuma. */
export async function lerRelacaoAgendas(): Promise<AgendaInfo[]> {
  const { data, error } = await supabase.rpc('agenda_relacao');
  if (error) throw error;
  return ((data ?? []) as any[]).map((x) => ({ agenda: x.agenda, fazendaId: x.fazenda_id ?? undefined, nome: x.nome, participantes: x.participantes, podeAbrir: !!x.pode_abrir }));
}

/** O produtor abre todas; os demais, só as que o produtor marcou no cadastro deles (Mais › Usuários e acessos). */
export function podeAbrir(agendas: AgendaInfo[], a: AgendaRef): boolean {
  const k = chaveAgenda(a);
  return agendas.some((x) => x.podeAbrir && chaveAgenda(x) === k);
}

export const ROTULO_AUTOR: Record<string, string> = { produtor: 'Anotação do produtor', escritorio: 'Anotação do escritório', gerente: 'Anotação do gerente' };

export type ItemAgenda = {
  chave: string;
  data: string; // aaaa-mm-dd
  titulo: string;
  detalhe: string | null;
  /** anotação feita por alguém, ou obrigação automática do sistema */
  origem: 'anotacao' | 'automatico';
  // anotação
  id?: string;
  feitoEm?: string | null;
  doProdutor?: boolean;
  autor?: string | null;
  /** nome de quem escreveu ou mandou a tarefa */
  autorNome?: string | null;
  criadoPor?: string | null;
  // automático
  tipo?: string;
  ref?: string | null;
};

type InfoTipo = { icone: NomeIcone; rotulo: string; abrir: (ref: string | null) => { rota: keyof PilhaParams; params?: object } };

/** Cada obrigação automática: ícone, nome e a tela onde se resolve. */
export const TIPOS_AUTOMATICOS: Record<string, InfoTipo> = {
  reforco: { icone: 'medkit-outline', rotulo: 'Sanidade', abrir: (ref) => ({ rota: 'SanidadeDetalhe', params: { id: ref } }) },
  iatf: { icone: 'git-branch-outline', rotulo: 'Reprodução', abrir: (ref) => ({ rota: 'ReproducaoForm', params: { tipo: 'iatf', iatfId: ref } }) },
  pre_parto: { icone: 'heart-outline', rotulo: 'Pré-parto', abrir: (ref) => ({ rota: 'ReproFemea', params: { id: ref } }) },
  parto: { icone: 'heart-outline', rotulo: 'Parto', abrir: (ref) => ({ rota: 'ReproFemea', params: { id: ref } }) },
  troca_manga: { icone: 'swap-horizontal-outline', rotulo: 'Pasto', abrir: () => ({ rota: 'MovimentacaoForm', params: {} }) },
  sal: { icone: 'cube-outline', rotulo: 'Cocho de sal', abrir: (ref) => ({ rota: 'MangaDetalhe', params: { id: ref } }) },
  agua: { icone: 'water-outline', rotulo: 'Bebedouro', abrir: (ref) => ({ rota: 'MangaDetalhe', params: { id: ref } }) },
  adubacao: { icone: 'leaf-outline', rotulo: 'Adubação', abrir: (ref) => ({ rota: 'PlanoAdubacao', params: { id: ref } }) },
  // V117: tiradas do estoque, dos contratos de café e das pesagens
  estoque_baixo: { icone: 'file-tray-outline', rotulo: 'Estoque', abrir: (ref) => ({ rota: 'InsumoForm', params: { id: ref } }) },
  validade: { icone: 'hourglass-outline', rotulo: 'Validade', abrir: (ref) => ({ rota: 'InsumoForm', params: { id: ref } }) },
  entrega_cafe: { icone: 'cafe-outline', rotulo: 'Contrato de café', abrir: (ref) => ({ rota: 'ContratoCafeDetalhe', params: { id: ref } }) },
  pesagem: { icone: 'scale-outline', rotulo: 'Pesagem', abrir: (ref) => ({ rota: 'LoteDetalhe', params: { id: ref } }) },
  // V117: financeiro (agendas do Produtor e do Escritório)
  pagar: { icone: 'arrow-up-circle-outline', rotulo: 'A pagar', abrir: (ref) => ({ rota: 'TituloDetalhe', params: { id: ref } }) },
  receber: { icone: 'arrow-down-circle-outline', rotulo: 'A receber', abrir: (ref) => ({ rota: 'TituloDetalhe', params: { id: ref } }) },
  vencidos_pagar: { icone: 'alert-circle-outline', rotulo: 'A pagar', abrir: () => ({ rota: 'TitulosSemana', params: { tipo: 'pagar' } }) },
  vencidos_receber: { icone: 'alert-circle-outline', rotulo: 'A receber', abrir: () => ({ rota: 'TitulosSemana', params: { tipo: 'receber' } }) },
  itr: { icone: 'document-text-outline', rotulo: 'ITR', abrir: (ref) => ({ rota: 'FazendaForm', params: { id: ref } }) },
  // V119: frota (manutenção pelo plano, seguro)
  frota: { icone: 'car-sport-outline', rotulo: 'Frota', abrir: (ref) => ({ rota: 'VeiculoDetalhe', params: { id: ref } }) },
  // V117: obrigação que se repete, cadastrada na própria agenda (não abre tela: marca-se como feita)
  propria: { icone: 'repeat-outline', rotulo: 'Repete', abrir: () => ({ rota: 'Agenda' }) },
};

/** aaaa-mm-dd + dias */
export function somarDiasIso(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Anotações em aberto (todas) e as feitas nos últimos 30 dias, de uma agenda. */
export async function lerAnotacoes(ref: AgendaRef, hoje: string): Promise<ItemAgenda[]> {
  let q = supabase.from('agenda_itens').select('id, data, titulo, observacao, feito_em, do_produtor, autor, autor_nome, criado_por').eq('agenda', ref.agenda).order('data').limit(500);
  if (ref.agenda === 'fazenda') q = q.eq('fazenda_id', ref.fazendaId!);
  q = q.or(`feito_em.is.null,feito_em.gte.${somarDiasIso(hoje, -30)}`);
  const d = await consulta<any[]>(q);
  return d.map((x) => ({ chave: x.id, id: x.id, data: x.data, titulo: x.titulo, detalhe: x.observacao, origem: 'anotacao', feitoEm: x.feito_em, doProdutor: x.do_produtor, autor: x.autor, autorNome: x.autor_nome, criadoPor: x.criado_por }));
}

/** Quantas anotações em aberto há em cada agenda (chave: 'produtor', 'escritorio' ou o id da fazenda). */
export async function contarAnotacoes(): Promise<Record<string, number>> {
  const d = await consulta<any[]>(supabase.from('agenda_itens').select('agenda, fazenda_id').is('feito_em', null).limit(2000));
  const n: Record<string, number> = {};
  for (const x of d) {
    const k = x.agenda === 'fazenda' ? x.fazenda_id : x.agenda;
    n[k] = (n[k] ?? 0) + 1;
  }
  return n;
}

const deRpc = (data: any[] | null): ItemAgenda[] =>
  (data ?? []).map((x, i) => ({ chave: `${x.tipo}-${x.ref}-${x.data}-${i}`, data: x.data, titulo: x.titulo, detalhe: x.detalhe, origem: 'automatico', tipo: x.tipo, ref: x.ref }));

/** Obrigações automáticas da fazenda até a data limite (as atrasadas vêm junto): manejo, sanidade, reprodução, pasto, adubação, estoque, café e pesagens. */
export async function lerAutomaticos(fazendaId: string, ate: string): Promise<ItemAgenda[]> {
  const [base, extra, frota] = await Promise.all([
    supabase.rpc('agenda_automatica', { p_fazenda: fazendaId, p_ate: ate }),
    supabase.rpc('agenda_automatica_extra', { p_fazenda: fazendaId, p_ate: ate }),
    supabase.rpc('agenda_frota', { p_fazenda: fazendaId, p_ate: ate }),
  ]);
  if (base.error) throw base.error;
  return [...deRpc(base.data as any[]), ...(extra.error ? [] : deRpc(extra.data as any[])), ...(frota.error ? [] : deRpc(frota.data as any[]))];
}

/** Obrigações financeiras (agendas do Produtor e do Escritório): contas vencidas (num aviso só), as que vencem até a data e o ITR. */
export async function lerFinanceiro(ate: string): Promise<ItemAgenda[]> {
  const [fin, frota] = await Promise.all([
    supabase.rpc('agenda_financeira', { p_ate: ate }),
    supabase.rpc('agenda_frota_particular', { p_ate: ate }),
  ]);
  if (fin.error) throw fin.error;
  // veículos particulares dos proprietários: manutenção e seguro nas agendas do Produtor e do Escritório
  return [...deRpc(fin.data as any[]), ...(frota.error ? [] : deRpc(frota.data as any[]))];
}

// ---------- obrigações que se repetem, cadastradas na agenda ----------
export type UnidadeRepeticao = 'dias' | 'meses' | 'anos';
export type Obrigacao = { id: string; titulo: string; observacao: string | null; intervalo: number; unidade: UnidadeRepeticao; proxima: string };
export const UNIDADES_REPETICAO = [
  { valor: 'dias', rotulo: 'Dias' },
  { valor: 'meses', rotulo: 'Meses' },
  { valor: 'anos', rotulo: 'Anos' },
];

export function textoRepeticao(o: { intervalo: number; unidade: string }): string {
  const um: Record<string, string> = { dias: 'todo dia', meses: 'todo mês', anos: 'todo ano' };
  return o.intervalo === 1 ? `Repete ${um[o.unidade] ?? ''}` : `Repete a cada ${o.intervalo} ${o.unidade}`;
}

export async function lerObrigacoes(ref: AgendaRef): Promise<Obrigacao[]> {
  let q = supabase.from('agenda_obrigacoes').select('id, titulo, observacao, intervalo, unidade, proxima').eq('agenda', ref.agenda).eq('ativo', true).order('proxima').limit(300);
  if (ref.agenda === 'fazenda') q = q.eq('fazenda_id', ref.fazendaId!);
  return consulta<Obrigacao[]>(q);
}

/** As obrigações próprias que vencem até a data viram itens da agenda (as outras aparecem só na relação, no fim da tela). */
export function obrigacoesComoItens(lista: Obrigacao[], ate: string): ItemAgenda[] {
  return lista
    .filter((o) => o.proxima <= ate)
    .map((o) => ({ chave: `propria-${o.id}`, data: o.proxima, titulo: o.titulo, detalhe: [o.observacao, textoRepeticao(o)].filter(Boolean).join(' · '), origem: 'automatico', tipo: 'propria', ref: o.id }));
}

// ---------- tarefas enviadas para outras agendas ----------
/** Envia a mesma tarefa para as agendas escolhidas. Devolve para quantas foi. */
export async function enviarTarefa(destinos: AgendaRef[], data: string, titulo: string, observacao: string): Promise<number> {
  const { data: n, error } = await supabase.rpc('agenda_enviar', {
    p: { data, titulo, observacao, destinos: destinos.map((d) => ({ agenda: d.agenda, fazenda_id: d.fazendaId ?? null })) },
  });
  if (error) throw error;
  return (n as number) ?? destinos.length;
}

export type TarefaEnviada = { id: string; chave: string; data: string; titulo: string; feitoEm: string | null };

/** O que o usuário mandou para agendas que ele não abre: em aberto, ou feitas nos últimos 30 dias. */
export async function lerEnviadas(userId: string, agendas: AgendaInfo[], hoje: string): Promise<TarefaEnviada[]> {
  const d = await consulta<any[]>(
    supabase.from('agenda_itens').select('id, agenda, fazenda_id, data, titulo, feito_em').eq('criado_por', userId).or(`feito_em.is.null,feito_em.gte.${somarDiasIso(hoje, -30)}`).order('data', { ascending: false }).limit(200),
  );
  return d
    .map((x) => ({ id: x.id, chave: x.agenda === 'fazenda' ? x.fazenda_id : x.agenda, data: x.data, titulo: x.titulo, feitoEm: x.feito_em }))
    .filter((x) => !agendas.some((a) => a.podeAbrir && chaveAgenda(a) === x.chave));
}

export type GrupoAgenda = { titulo: string; atrasado?: boolean; itens: ItemAgenda[] };

/** Separa em Atrasados, Hoje, Próximos 7 dias e Depois (só o que está em aberto). */
export function agruparAgenda(itens: ItemAgenda[], hoje: string): GrupoAgenda[] {
  const abertos = itens.filter((i) => !i.feitoEm).sort((a, b) => (a.data === b.data ? a.titulo.localeCompare(b.titulo) : a.data < b.data ? -1 : 1));
  const em7 = somarDiasIso(hoje, 7);
  const grupos: GrupoAgenda[] = [
    { titulo: 'Atrasados', atrasado: true, itens: abertos.filter((i) => i.data < hoje) },
    { titulo: 'Hoje', itens: abertos.filter((i) => i.data === hoje) },
    { titulo: 'Próximos 7 dias', itens: abertos.filter((i) => i.data > hoje && i.data <= em7) },
    { titulo: 'Depois', itens: abertos.filter((i) => i.data > em7) },
  ];
  return grupos.filter((g) => g.itens.length > 0);
}

export type Rotinas = { sal_dias: number; agua_dias: number; pre_parto_dias: number; pesagem_dias: number };
export const ROTINAS_PADRAO: Rotinas = { sal_dias: 7, agua_dias: 15, pre_parto_dias: 30, pesagem_dias: 90 };

export async function lerRotinas(fazendaId: string): Promise<Rotinas> {
  const { data } = await supabase.from('agenda_rotinas').select('sal_dias, agua_dias, pre_parto_dias, pesagem_dias').eq('fazenda_id', fazendaId).maybeSingle();
  return (data as Rotinas) ?? ROTINAS_PADRAO;
}

// ---------- V134: quadro das anotações na página de rosto ----------
/** Quantos dias a tarefa cumprida fica à vista antes de o banco apagá-la sozinho. */
export const DIAS_CUMPRIDAS = 3;

export type AnotacaoCapa = { id: string; agendaChave: string; onde: string; prazo: string; titulo: string; observacao: string | null; autorNome: string | null; feitoEm: string | null };

/**
 * Anotações de todas as agendas que a pessoa abre: as em aberto (com o prazo) e as cumpridas nos últimos 3 dias.
 * O que a pessoa mandou para agendas que ela não abre fica de fora (isso aparece na tela da Agenda).
 */
export async function lerAnotacoesCapa(agendas: AgendaInfo[], hoje: string): Promise<{ abertas: AnotacaoCapa[]; cumpridas: AnotacaoCapa[] }> {
  const nomes = Object.fromEntries(agendas.filter((a) => a.podeAbrir).map((a) => [chaveAgenda(a), a.nome]));
  if (!Object.keys(nomes).length) return { abertas: [], cumpridas: [] };
  const d = await consulta<any[]>(
    supabase
      .from('agenda_itens')
      .select('id, agenda, fazenda_id, data, titulo, observacao, autor_nome, feito_em')
      .or(`feito_em.is.null,feito_em.gte.${somarDiasIso(hoje, -DIAS_CUMPRIDAS)}`)
      .order('data')
      .limit(500),
  );
  const lista: AnotacaoCapa[] = d
    .map((x) => {
      const k = (x.agenda === 'fazenda' ? x.fazenda_id : x.agenda) as string;
      return { id: x.id, agendaChave: k, onde: nomes[k], prazo: x.data, titulo: x.titulo, observacao: x.observacao, autorNome: x.autor_nome, feitoEm: x.feito_em };
    })
    .filter((x) => !!x.onde);
  return {
    abertas: lista.filter((x) => !x.feitoEm),
    cumpridas: lista.filter((x) => !!x.feitoEm).sort((a, b) => (a.feitoEm! < b.feitoEm! ? 1 : -1)),
  };
}

/** Marca como cumprida (hoje) ou desfaz. */
export async function marcarCumprida(id: string, cumprida: boolean): Promise<void> {
  const { error } = await supabase.from('agenda_itens').update({ feito_em: cumprida ? hojeBanco() : null }).eq('id', id);
  if (error) throw error;
}
