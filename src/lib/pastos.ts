// Visão do Pasto: situação de cada manga (ocupada, em descanso, vedada), carga animal e geometria do mapa.
import { consulta, supabase } from './supabase';
import { diasEntre } from './reproducao';

export const UA_KG = 450; // 1 Unidade Animal = 450 kg de peso vivo
export const OCUPACAO_MAX_PADRAO = 10; // dias no mesmo pasto antes do alerta

export type StatusPasto = 'ocupado' | 'descanso' | 'vedado';

export const COR_STATUS: Record<StatusPasto, string> = {
  ocupado: '#C62828',
  descanso: '#2E7D32',
  vedado: '#E0A800',
};
export const ROTULO_STATUS: Record<StatusPasto, string> = {
  ocupado: 'Ocupado',
  descanso: 'Em descanso',
  vedado: 'Vedado',
};

export type LoteNoPasto = {
  id: string;
  numero: number;
  descricao: string | null;
  cabecas: number;
  pesoMedio: number | null;
  entrada: string | null; // aaaa-mm-dd
};

export type Pasto = {
  id: string;
  nome: string;
  area_ha: number | null;
  capim: string | null;
  destinacao: 'pecuaria' | 'agricultura';
  vedada_desde: string | null;
  descanso_meta: number | null;
  ocupacao_max: number;
  geometria: any | null;
  lotes: LoteNoPasto[];
  cabecas: number;
  ua: number | null;
  uaHa: number | null;
  status: StatusPasto;
  diasOcupado: number | null;
  diasDescanso: number | null;
  ultimaSaida: string | null;
};

/** Monta a situação de todas as mangas ativas da fazenda. */
export async function carregarPastos(fazendaId: string, hoje: string): Promise<Pasto[]> {
  const [areas, lotes, movs] = await Promise.all([
    consulta<any[]>(supabase.from('areas').select('*').eq('fazenda_id', fazendaId).eq('tipo', 'manga').eq('ativa', true).order('nome')),
    consulta<any[]>(
      supabase
        .from('lotes')
        .select('id, numero, descricao, manga_id, data_abertura, peso_parcial_medio, peso_inicial_medio')
        .eq('fazenda_id', fazendaId)
        .eq('situacao', 'ativo')
        .not('manga_id', 'is', null),
    ),
    consulta<any[]>(
      supabase
        .from('movimentacoes')
        .select('data, lote_origem_id, manga_origem_id, manga_destino_id')
        .eq('fazenda_id', fazendaId)
        .eq('tipo', 'transferencia_manga')
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5000),
    ),
  ]);

  const animais = lotes.length
    ? await consulta<any[]>(supabase.from('animais').select('lote_id, peso_atual_kg').eq('situacao', 'ativo').in('lote_id', lotes.map((l) => l.id)))
    : [];
  const porLote: Record<string, { n: number; soma: number; comPeso: number }> = {};
  for (const a of animais) {
    const x = (porLote[a.lote_id] ??= { n: 0, soma: 0, comPeso: 0 });
    x.n++;
    if (a.peso_atual_kg != null) {
      x.soma += Number(a.peso_atual_kg);
      x.comPeso++;
    }
  }

  return areas.map((a) => {
    const dele: LoteNoPasto[] = lotes
      .filter((l) => l.manga_id === a.id)
      .map((l) => {
        const c = porLote[l.id] ?? { n: 0, soma: 0, comPeso: 0 };
        const pesoLote = l.peso_parcial_medio ?? l.peso_inicial_medio;
        const mov = movs.find((m) => m.lote_origem_id === l.id && m.manga_destino_id === a.id);
        return {
          id: l.id,
          numero: l.numero,
          descricao: l.descricao,
          cabecas: c.n,
          pesoMedio: pesoLote != null ? Number(pesoLote) : c.comPeso ? c.soma / c.comPeso : null,
          entrada: mov?.data ?? l.data_abertura ?? null,
        };
      })
      .filter((l) => l.cabecas > 0);

    const cabecas = dele.reduce((s, l) => s + l.cabecas, 0);
    const semPeso = dele.some((l) => l.pesoMedio == null);
    const ua = cabecas ? (semPeso ? null : dele.reduce((s, l) => s + (l.cabecas * (l.pesoMedio ?? 0)) / UA_KG, 0)) : 0;
    const area = a.area_ha != null ? Number(a.area_ha) : null;
    const entradas = dele.map((l) => l.entrada).filter(Boolean) as string[];
    const entrada = entradas.length ? entradas.sort()[0] : null;
    const saida = movs.find((m) => m.manga_origem_id === a.id)?.data ?? null;
    const status: StatusPasto = cabecas > 0 ? 'ocupado' : a.vedada_desde || a.destinacao === 'agricultura' ? 'vedado' : 'descanso';

    return {
      id: a.id,
      nome: a.nome,
      area_ha: area,
      capim: a.capim_cultura,
      destinacao: a.destinacao ?? 'pecuaria',
      vedada_desde: a.vedada_desde,
      descanso_meta: a.descanso_dias,
      ocupacao_max: a.ocupacao_max_dias ?? OCUPACAO_MAX_PADRAO,
      geometria: a.geometria,
      lotes: dele,
      cabecas,
      ua,
      uaHa: ua != null && area ? ua / area : null,
      status,
      diasOcupado: status === 'ocupado' && entrada ? Math.max(diasEntre(entrada, hoje), 0) : null,
      diasDescanso: status === 'descanso' && saida ? Math.max(diasEntre(saida, hoje), 0) : null,
      ultimaSaida: saida,
    };
  });
}

/** Ordem padrão do painel: primeiro os prontos para uso (mais dias de descanso), depois os ocupados, depois os vedados. */
export function ordemPadrao(a: Pasto, b: Pasto): number {
  const peso = (p: Pasto) => (p.status === 'descanso' ? 0 : p.status === 'ocupado' ? 1 : 2);
  if (peso(a) !== peso(b)) return peso(a) - peso(b);
  if (a.status === 'descanso') return (b.diasDescanso ?? -1) - (a.diasDescanso ?? -1);
  if (a.status === 'ocupado') return (b.diasOcupado ?? 0) - (a.diasOcupado ?? 0);
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

// ---------- geometria ----------
export type Ponto = [number, number]; // [lat, lng]
const R = 6378137;
const rad = (g: number) => (g * Math.PI) / 180;

/** Área de um polígono sobre a Terra (m²), pelo método esférico. */
export function areaM2(pontos: Ponto[]): number {
  if (pontos.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pontos.length; i++) {
    const [la1, lo1] = pontos[i];
    const [la2, lo2] = pontos[(i + 1) % pontos.length];
    s += rad(lo2 - lo1) * (2 + Math.sin(rad(la1)) + Math.sin(rad(la2)));
  }
  return Math.abs((s * R * R) / 2);
}

/** Perímetro (m), com o fechamento do polígono. */
export function perimetroM(pontos: Ponto[]): number {
  if (pontos.length < 2) return 0;
  let p = 0;
  const n = pontos.length >= 3 ? pontos.length : pontos.length - 1;
  for (let i = 0; i < n; i++) {
    const [la1, lo1] = pontos[i];
    const [la2, lo2] = pontos[(i + 1) % pontos.length];
    const dla = rad(la2 - la1);
    const dlo = rad(lo2 - lo1);
    const h = Math.sin(dla / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dlo / 2) ** 2;
    p += 2 * R * Math.asin(Math.sqrt(h));
  }
  return p;
}

/** Pontos -> GeoJSON Polygon (lng, lat, fechado). */
export function paraGeoJson(pontos: Ponto[]) {
  const anel = pontos.map(([la, lo]) => [lo, la]);
  anel.push([...anel[0]]);
  return { type: 'Polygon', coordinates: [anel] };
}

/** GeoJSON Polygon -> pontos (sem repetir o primeiro no fim). */
export function doGeoJson(g: any): Ponto[] {
  const anel: number[][] | undefined = g?.type === 'Polygon' ? g.coordinates?.[0] : undefined;
  if (!anel || anel.length < 4) return [];
  return anel.slice(0, -1).map(([lo, la]) => [la, lo] as Ponto);
}
