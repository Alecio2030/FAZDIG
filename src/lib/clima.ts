// Clima e chuva: previsão do tempo e chuva estimada (Open-Meteo, sem custo e sem chave),
// janela de pulverização, alertas, leituras do pluviômetro e balanço de chuva.
import * as Location from 'expo-location';
import { consulta, supabase } from './supabase';
import { hojeBanco } from './datas';
import { doGeoJson } from './pastos';

// ---------- datas (aaaa-mm-dd) ----------
const dois = (n: number) => String(n).padStart(2, '0');

/** Soma dias a uma data aaaa-mm-dd. */
export function somarDias(iso: string, n: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
}
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** "Seg" */
export const diaSemana = (iso: string) => SEMANA[new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))).getUTCDay()];
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
/** Primeiro e último dia do mês "aaaa-mm". */
export function limitesMes(mes: string): { inicio: string; fim: string } {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return { inicio: `${mes}-01`, fim: `${mes}-${dois(new Date(Date.UTC(a, m, 0)).getUTCDate())}` };
}
/** Mês anterior (-1) ou seguinte (+1) de "aaaa-mm". */
export function somarMes(mes: string, n: number): string {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}`;
}

// ---------- local da fazenda ----------
export type LocalClima = { lat: number; lng: number; nome: string };

const UFS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco',
  PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

async function buscarJson(url: string, segundos = 20): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), segundos * 1000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('O serviço do tempo não respondeu. Tente de novo em instantes.');
    return await r.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('O serviço do tempo está demorando a responder. Confira a internet e tente de novo.');
    if (/network request failed|failed to fetch/i.test(String(e?.message))) throw new Error('Sem conexão com a internet. Confira o sinal e tente de novo.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Acha o centro do município (ex.: Colatina, ES). null se não achar. */
export async function localDoMunicipio(municipio: string, uf?: string | null): Promise<LocalClima | null> {
  const nome = municipio.trim();
  if (!nome) return null;
  const j = await buscarJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=20&language=pt&format=json&countryCode=BR`);
  const res = ((j?.results ?? []) as any[]).filter((r) => r.country_code === 'BR');
  if (!res.length) return null;
  const estado = uf ? semAcento(UFS[uf.trim().toUpperCase()] ?? '') : '';
  const exatos = res.filter((r) => semAcento(String(r.name ?? '')) === semAcento(nome));
  const doEstado = (x: any) => semAcento(String(x.admin1 ?? '')) === estado;
  // com a UF no cadastro, só vale um resultado do mesmo estado (há municípios de mesmo nome em estados diferentes)
  const r = estado ? exatos.find(doEstado) ?? res.find(doEstado) ?? null : exatos[0] ?? res[0];
  if (!r) return null;
  return { lat: Number(r.latitude), lng: Number(r.longitude), nome: `${r.name}${uf ? ` – ${uf.trim().toUpperCase()}` : ''} (centro do município)` };
}

/** Posição do aparelho agora (GPS). Lança erro com a explicação se não der. */
export async function localDoGps(): Promise<LocalClima> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('O app não tem permissão para usar a localização. Libere em Ajustes do iPhone › Expo Go › Localização.');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: p.coords.latitude, lng: p.coords.longitude, nome: 'Ponto marcado pelo GPS do celular' };
}

export async function gravarLocal(fazendaId: string, l: LocalClima): Promise<void> {
  const { error } = await supabase.rpc('definir_local_clima', { p_fazenda: fazendaId, p_lat: l.lat, p_lng: l.lng, p_nome: l.nome });
  if (error) throw error;
  memoria = {};
}

/**
 * Local usado para o tempo: o gravado na fazenda; sem ele, o centro das áreas desenhadas no mapa;
 * sem desenho, o centro do município do cadastro da fazenda (e grava, para não procurar de novo). null se não der para saber.
 */
export async function localDaFazenda(fazendaId: string): Promise<LocalClima | null> {
  const f = await consulta<any>(supabase.from('fazendas').select('latitude, longitude, local_clima, municipio, uf').eq('id', fazendaId).single());
  if (f.latitude != null && f.longitude != null) return { lat: Number(f.latitude), lng: Number(f.longitude), nome: f.local_clima || 'Local da fazenda' };
  let achado: LocalClima | null = null;
  const areas = await consulta<any[]>(supabase.from('areas').select('geometria').eq('fazenda_id', fazendaId).eq('ativa', true).not('geometria', 'is', null).limit(500));
  const pontos = areas.flatMap((a) => doGeoJson(a.geometria));
  if (pontos.length >= 3) {
    achado = { lat: pontos.reduce((s, p) => s + p[0], 0) / pontos.length, lng: pontos.reduce((s, p) => s + p[1], 0) / pontos.length, nome: 'Centro das áreas desenhadas no mapa' };
  } else if (f.municipio) {
    achado = await localDoMunicipio(f.municipio, f.uf).catch(() => null);
  }
  if (achado) await gravarLocal(fazendaId, achado).catch(() => undefined);
  return achado;
}

// ---------- locais cadastrados (V130): "Na fazenda X" e "No escritório" ----------
/**
 * Os lugares que o sistema já conhece: cada fazenda (pelo centro dos talhões e mangas desenhados no mapa,
 * ou pelo ponto já gravado nela) e o escritório (marcado uma vez pelo GPS).
 */
export async function locaisCadastrados(fazendas: { id: string; nome: string }[]): Promise<LocalClima[]> {
  const ids = fazendas.map((f) => f.id);
  if (!ids.length) return [];
  const [areas, fz, esc] = await Promise.all([
    consulta<any[]>(supabase.from('areas').select('fazenda_id, geometria').in('fazenda_id', ids).eq('ativa', true).not('geometria', 'is', null).limit(2000)).catch(() => [] as any[]),
    consulta<any[]>(supabase.from('fazendas').select('id, latitude, longitude, local_clima').in('id', ids)).catch(() => [] as any[]),
    lerEscritorio().catch(() => null),
  ]);
  const lista: LocalClima[] = [];
  const naFazenda = (nome: string) => (/^fazenda\b/i.test(nome.trim()) ? `Na ${nome.trim()}` : `Na fazenda ${nome.trim()}`);
  for (const f of fazendas) {
    const pontos = areas.filter((a) => a.fazenda_id === f.id).flatMap((a) => doGeoJson(a.geometria));
    if (pontos.length >= 3) {
      lista.push({ lat: pontos.reduce((s, p) => s + p[0], 0) / pontos.length, lng: pontos.reduce((s, p) => s + p[1], 0) / pontos.length, nome: naFazenda(f.nome) });
      continue;
    }
    // sem desenho no mapa: vale o ponto gravado, se for da fazenda mesmo (GPS ou nome dado), e não o centro do município
    const g = fz.find((x) => x.id === f.id);
    if (g?.latitude != null && g?.longitude != null && !/centro do munic/i.test(g.local_clima ?? '')) {
      lista.push({ lat: Number(g.latitude), lng: Number(g.longitude), nome: naFazenda(f.nome) });
    }
  }
  if (esc) lista.push(esc);
  return lista;
}

/** Ponto do escritório, gravado no cadastro do produtor. null se ainda não foi marcado. */
export async function lerEscritorio(): Promise<LocalClima | null> {
  const { data, error } = await supabase.from('produtor').select('escritorio_lat, escritorio_lng').order('created_at').limit(1);
  if (error) return null; // banco sem o arquivo da V130
  const p = (data ?? [])[0] as any;
  if (p?.escritorio_lat == null || p?.escritorio_lng == null) return null;
  return { lat: Number(p.escritorio_lat), lng: Number(p.escritorio_lng), nome: 'No escritório' };
}

/** Marca o ponto onde a pessoa está agora como o escritório (só o dono). */
export async function gravarEscritorio(l: LocalClima): Promise<void> {
  const { data: p } = await supabase.from('produtor').select('id').order('created_at').limit(1);
  const id = (p ?? [])[0]?.id;
  if (!id) throw new Error('Cadastre primeiro os dados do produtor.');
  const { data, error } = await supabase.from('produtor').update({ escritorio_lat: l.lat, escritorio_lng: l.lng }).eq('id', id).select('id');
  if (error) throw new Error(/escritorio/i.test(error.message) ? 'Falta rodar o arquivo do banco da V130 no Supabase.' : error.message);
  if (!data?.length) throw new Error('Só o dono marca o local do escritório.');
}

// ---------- previsão ----------
export type Dia = { data: string; codigo: number | null; max: number | null; min: number | null; chuva: number; prob: number | null; vento: number | null; rajada: number | null; et0: number | null };
export type Hora = { hora: string; temp: number | null; umid: number | null; chuva: number; prob: number | null; vento: number | null };
export type Agora = { hora: string; temp: number | null; umid: number | null; chuva: number; codigo: number | null; vento: number | null; rajada: number | null };
export type Previsao = { agora: Agora | null; hoje: string; dias: Dia[]; horas: Hora[]; buscadoEm: number };

const num = (v: any): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const FUSO = 'timezone=America%2FSao_Paulo';
const CAMPOS_DIA = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,et0_fao_evapotranspiration';

function lerDias(d: any): Dia[] {
  const t: string[] = d?.time ?? [];
  return t.map((data, i) => ({
    data,
    codigo: num(d.weather_code?.[i]),
    max: num(d.temperature_2m_max?.[i]),
    min: num(d.temperature_2m_min?.[i]),
    chuva: num(d.precipitation_sum?.[i]) ?? 0,
    prob: num(d.precipitation_probability_max?.[i]),
    vento: num(d.wind_speed_10m_max?.[i]),
    rajada: num(d.wind_gusts_10m_max?.[i]),
    et0: num(d.et0_fao_evapotranspiration?.[i]),
  }));
}

let memoria: Record<string, Previsao> = {};

/** Tempo de agora, 30 dias para trás e 7 para a frente (por dia) e as próximas 72 horas (por hora). Guarda por 30 minutos. */
export async function lerPrevisao(l: LocalClima, forcar = false): Promise<Previsao> {
  const chave = `${l.lat.toFixed(3)},${l.lng.toFixed(3)}`;
  const m = memoria[chave];
  if (!forcar && m && Date.now() - m.buscadoEm < 30 * 60000) return m;
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${l.lat.toFixed(4)}&longitude=${l.lng.toFixed(4)}&${FUSO}`;
  const [a, b] = await Promise.all([
    buscarJson(`${base}&past_days=30&forecast_days=8&daily=${CAMPOS_DIA}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m`),
    buscarJson(`${base}&forecast_days=3&hourly=temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m`),
  ]);
  const c = a?.current;
  const h = b?.hourly;
  const horas: Hora[] = ((h?.time ?? []) as string[]).map((hora, i) => ({
    hora,
    temp: num(h.temperature_2m?.[i]),
    umid: num(h.relative_humidity_2m?.[i]),
    chuva: num(h.precipitation?.[i]) ?? 0,
    prob: num(h.precipitation_probability?.[i]),
    vento: num(h.wind_speed_10m?.[i]),
  }));
  const agora: Agora | null = c
    ? { hora: String(c.time), temp: num(c.temperature_2m), umid: num(c.relative_humidity_2m), chuva: num(c.precipitation) ?? 0, codigo: num(c.weather_code), vento: num(c.wind_speed_10m), rajada: num(c.wind_gusts_10m) }
    : null;
  const p: Previsao = { agora, hoje: agora ? agora.hora.slice(0, 10) : hojeBanco(), dias: lerDias(a?.daily), horas, buscadoEm: Date.now() };
  memoria[chave] = p;
  return p;
}

/** Descrição e ícone do tempo pelo código internacional (WMO). */
export function tempo(codigo: number | null | undefined): { texto: string; icone: string } {
  const c = codigo ?? -1;
  if (c === 0) return { texto: 'Céu limpo', icone: 'sunny-outline' };
  if (c === 1) return { texto: 'Poucas nuvens', icone: 'partly-sunny-outline' };
  if (c === 2) return { texto: 'Parcialmente nublado', icone: 'partly-sunny-outline' };
  if (c === 3) return { texto: 'Nublado', icone: 'cloudy-outline' };
  if (c === 45 || c === 48) return { texto: 'Nevoeiro', icone: 'cloud-outline' };
  if (c >= 51 && c <= 57) return { texto: 'Garoa', icone: 'rainy-outline' };
  if (c === 61 || c === 66) return { texto: 'Chuva fraca', icone: 'rainy-outline' };
  if (c === 63) return { texto: 'Chuva moderada', icone: 'rainy-outline' };
  if (c === 65 || c === 67) return { texto: 'Chuva forte', icone: 'rainy-outline' };
  if (c >= 71 && c <= 77) return { texto: 'Neve', icone: 'snow-outline' };
  if (c === 80) return { texto: 'Pancadas de chuva fracas', icone: 'rainy-outline' };
  if (c === 81) return { texto: 'Pancadas de chuva', icone: 'rainy-outline' };
  if (c === 82) return { texto: 'Pancadas de chuva fortes', icone: 'rainy-outline' };
  if (c === 95) return { texto: 'Trovoada', icone: 'thunderstorm-outline' };
  if (c === 96 || c === 99) return { texto: 'Trovoada com granizo', icone: 'thunderstorm-outline' };
  return { texto: 'Sem informação', icone: 'cloud-outline' };
}

// ---------- pulverização ----------
// Condições de referência para aplicar defensivo: vento de 3 a 10 km/h, até 30 °C, umidade do ar de 55% para cima e sem chuva nas 2 horas seguintes.
export const REGRA_PULVERIZACAO = 'vento de 3 a 10 km/h, até 30 °C, umidade do ar de 55% para cima e sem chuva na hora e nas 2 horas seguintes';

/** Por que a hora não serve para pulverizar (vazio = serve). */
export function motivosHora(horas: Hora[], i: number): string[] {
  const h = horas[i];
  const m: string[] = [];
  if (h.vento != null && h.vento > 10) m.push(`vento de ${Math.round(h.vento)} km/h (deriva)`);
  if (h.vento != null && h.vento < 3) m.push('ar parado (o produto fica suspenso)');
  if (h.temp != null && h.temp > 30) m.push(`${Math.round(h.temp)} °C (evapora)`);
  if (h.umid != null && h.umid < 55) m.push(`umidade do ar em ${Math.round(h.umid)}%`);
  const chove = (x?: Hora) => !!x && (x.chuva >= 0.2 || (x.prob ?? 0) >= 50);
  if (chove(h)) m.push('chuva');
  else if (chove(horas[i + 1]) || chove(horas[i + 2])) m.push('chuva logo depois (lava o produto)');
  return m;
}

export type Janela = { data: string; inicio: string; fim: string };

/** Janelas boas para pulverizar, de agora até o fim de amanhã, entre 5 h e 20 h. */
export function janelasPulverizacao(p: Previsao): { agora: { boa: boolean; motivos: string[] } | null; janelas: Janela[] } {
  const marca = p.agora ? p.agora.hora.slice(0, 13) : `${p.hoje}T00`;
  const limite = somarDias(p.hoje, 1);
  const janelas: Janela[] = [];
  let agora: { boa: boolean; motivos: string[] } | null = null;
  let aberta: Janela | null = null;
  p.horas.forEach((h, i) => {
    const chave = h.hora.slice(0, 13);
    const dia = h.hora.slice(0, 10);
    const hh = Number(h.hora.slice(11, 13));
    if (chave < marca || dia > limite) return;
    const motivos = motivosHora(p.horas, i);
    if (chave === marca) agora = { boa: motivos.length === 0, motivos };
    const boa = motivos.length === 0 && hh >= 5 && hh < 20;
    if (boa) {
      if (aberta && aberta.data === dia && aberta.fim === `${dois(hh)}:00`) aberta.fim = `${dois(hh + 1)}:00`;
      else {
        aberta = { data: dia, inicio: `${dois(hh)}:00`, fim: `${dois(hh + 1)}:00` };
        janelas.push(aberta);
      }
    } else aberta = null;
  });
  return { agora, janelas };
}

// ---------- alertas ----------
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const mm = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

export function alertas(p: Previsao): { tipo: 'erro' | 'info'; texto: string }[] {
  const r: { tipo: 'erro' | 'info'; texto: string }[] = [];
  const frente = p.dias.filter((d) => d.data >= p.hoje).slice(0, 7);
  const tras = p.dias.filter((d) => d.data < p.hoje);
  const forte = frente.filter((d) => d.chuva >= 30);
  if (forte.length) r.push({ tipo: 'erro', texto: `Chuva forte prevista: ${forte.map((d) => `${diaSemana(d.data)} ${dm(d.data)} (${mm(d.chuva)} mm)`).join(', ')}. Adie adubação de cobertura e pulverização; confira carreadores e terreiro.` });
  const vento = frente.filter((d) => (d.rajada ?? 0) >= 50);
  if (vento.length) r.push({ tipo: 'erro', texto: `Vento forte previsto: rajadas de até ${Math.round(Math.max(...vento.map((d) => d.rajada ?? 0)))} km/h em ${vento.map((d) => dm(d.data)).join(', ')}.` });
  const calor = frente.filter((d) => (d.max ?? 0) >= 34);
  if (calor.length) r.push({ tipo: 'info', texto: `Calor forte: até ${Math.round(Math.max(...calor.map((d) => d.max ?? 0)))} °C em ${calor.map((d) => dm(d.data)).join(', ')}. Na florada e no chumbinho, o calor com falta de água derruba flor e fruto: atenção à irrigação.` });
  const ult15 = tras.slice(-15).reduce((s, d) => s + d.chuva, 0);
  const prox7 = frente.reduce((s, d) => s + d.chuva, 0);
  if (tras.length >= 15 && ult15 < 10 && prox7 < 5) r.push({ tipo: 'info', texto: `Tempo seco: ${mm(ult15)} mm nos últimos 15 dias e ${mm(prox7)} mm previstos para os próximos 7. Atenção à irrigação.` });
  return r;
}

// ---------- chuva estimada (histórico) ----------
export type DiaEstimado = { chuva: number; et0: number | null };

/**
 * Chuva e evapotranspiração estimadas por dia no ponto da fazenda, de "inicio" a "fim" (no máximo até hoje).
 * Até uns 85 dias para trás vem do modelo da previsão; antes disso, do arquivo histórico (que fecha com uns 5 dias de atraso).
 */
export async function diarioEstimado(l: LocalClima, inicio: string, fim: string): Promise<Record<string, DiaEstimado>> {
  const hoje = hojeBanco();
  const ate = fim > hoje ? hoje : fim;
  const r: Record<string, DiaEstimado> = {};
  if (inicio > ate) return r;
  const corte = somarDias(hoje, -85);
  const pos = `latitude=${l.lat.toFixed(4)}&longitude=${l.lng.toFixed(4)}&${FUSO}&daily=precipitation_sum,et0_fao_evapotranspiration`;
  const pedidos: Promise<any>[] = [];
  if (inicio < corte) pedidos.push(buscarJson(`https://archive-api.open-meteo.com/v1/archive?${pos}&start_date=${inicio}&end_date=${ate < corte ? ate : somarDias(corte, -1)}`, 30));
  if (ate >= corte) pedidos.push(buscarJson(`https://api.open-meteo.com/v1/forecast?${pos}&start_date=${inicio > corte ? inicio : corte}&end_date=${ate}`));
  for (const j of await Promise.all(pedidos)) {
    const d = j?.daily;
    ((d?.time ?? []) as string[]).forEach((data, i) => {
      const c = num(d.precipitation_sum?.[i]);
      if (c != null) r[data] = { chuva: c, et0: num(d.et0_fao_evapotranspiration?.[i]) };
    });
  }
  return r;
}

// ---------- pluviômetro ----------
export type Chuva = { id: string; data: string; mm: number; local: string; observacoes: string | null };

export async function lerChuvas(fazendaId: string, inicio: string, fim: string): Promise<Chuva[]> {
  const r = await consulta<any[]>(supabase.from('chuvas').select('id, data, mm, local, observacoes').eq('fazenda_id', fazendaId).gte('data', inicio).lte('data', fim).order('data', { ascending: false }).order('local').limit(5000));
  return r.map((c) => ({ ...c, mm: Number(c.mm) }));
}

/** Chuva medida por dia: com mais de um pluviômetro no dia, a média deles. */
export function medidaPorDia(chuvas: Chuva[]): Record<string, number> {
  const g: Record<string, number[]> = {};
  for (const c of chuvas) (g[c.data] ??= []).push(c.mm);
  const r: Record<string, number> = {};
  for (const d of Object.keys(g)) r[d] = g[d].reduce((s, v) => s + v, 0) / g[d].length;
  return r;
}

/**
 * Balanço de chuva de um período: chuva (a medida no pluviômetro quando há leitura do dia; senão, a estimada)
 * menos a evapotranspiração de referência (a água que a lavoura e o solo perdem).
 */
export function balanco(estimado: Record<string, DiaEstimado>, medida: Record<string, number>, inicio: string, fim: string) {
  let chuva = 0;
  let et0 = 0;
  let dias = 0;
  let medidos = 0;
  let semChuva = 0; // dias seguidos sem chuva (menos de 1 mm), contando do fim para trás
  let contando = true;
  for (let d = fim; d >= inicio; d = somarDias(d, -1)) {
    const e = estimado[d];
    const temMedida = medida[d] != null;
    if (!e && !temMedida) continue;
    const c = temMedida ? medida[d] : e!.chuva;
    dias++;
    if (temMedida) medidos++;
    chuva += c;
    et0 += e?.et0 ?? 0;
    if (contando && c < 1) semChuva++;
    else contando = false;
  }
  return { chuva, et0, saldo: chuva - et0, dias, medidos, semChuva };
}

/** "12,5" */
export const textoMm = mm;

/**
 * Pulverização num dia escolhido (hoje, amanhã ou depois de amanhã, que é até onde vai a previsão por hora):
 * a condição na hora informada ("hh:mm") e as janelas boas do dia, entre 5 h e 20 h (hoje, só de agora em diante).
 */
export function pulverizacaoNoDia(p: Previsao, data: string, hora?: string | null): { temPrevisao: boolean; naHora: { boa: boolean; motivos: string[] } | null; janelas: Janela[] } {
  const marca = p.agora && data === p.hoje ? p.agora.hora.slice(0, 13) : `${data}T00`;
  const janelas: Janela[] = [];
  let naHora: { boa: boolean; motivos: string[] } | null = null;
  let aberta: Janela | null = null;
  let temPrevisao = false;
  p.horas.forEach((h, i) => {
    if (h.hora.slice(0, 10) !== data) return;
    temPrevisao = true;
    const hh = Number(h.hora.slice(11, 13));
    const motivos = motivosHora(p.horas, i);
    if (hora && Number(hora.slice(0, 2)) === hh) naHora = { boa: motivos.length === 0, motivos };
    const boa = motivos.length === 0 && hh >= 5 && hh < 20 && h.hora.slice(0, 13) >= marca;
    if (boa) {
      if (aberta && aberta.fim === `${dois(hh)}:00`) aberta.fim = `${dois(hh + 1)}:00`;
      else {
        aberta = { data, inicio: `${dois(hh)}:00`, fim: `${dois(hh + 1)}:00` };
        janelas.push(aberta);
      }
    } else aberta = null;
  });
  return { temPrevisao, naHora, janelas };
}
