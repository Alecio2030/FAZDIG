// V184 – Modo Vaqueiro: dados guardados no celular (para consultar sem sinal) e a fila do que foi lançado no campo.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { guardarDocumento } from '../componentes/FotoAnexo';

export type LoteCampo = {
  id: string; numero: number; descricao: string | null; sexo: string | null; categoria: string | null;
  manga_id: string | null; manga: string | null; raca: string | null; ferro: string | null;
  proprietario: string | null; dono_terceiro: string | null; cabecas: number; machos: number; femeas: number;
};
export type AnimalCampo = {
  id: string; n: number; brinco: string | null; nome: string | null; registro: string | null; sexo: string | null;
  raca: string | null; ferro: string | null; lote_id: string | null; nasc: string | null; nasc_aprox: boolean | null;
  peso: number | null; peso_data: string | null; categoria: string | null;
};
export type MangaCampo = { id: string; nome: string; capim: string | null; area_ha: number | null };
export type MedicamentoCampo = {
  id: string; nome: string; categoria: string; dose: number; dose_por: string | null; cada_kg: number | null;
  unidade_dose: string; unidade: string; conteudo: number | null; via: string | null; serve: string | null;
  carencia_carne: number | null; carencia_leite: number | null; saldo: number;
};
export type SalCampo = { id: string; nome: string; unidade: string; saldo: number };
export type DietaCampo = {
  lote_id: string; dieta_id: string; numero: number; descricao: string | null; tratos_dia: number;
  itens: { alimento_id: string; nome: string; kg_cab: number }[] | null;
  hoje: { id: string; data: string; situacao: string; cabecas: number; leitura: string | null } | null;
};
export type TarefaCampo = { id: string; data: string; titulo: string; obs: string | null; autor: string | null };
export type PacoteCampo = {
  gerado_em: string;
  fazenda: { id: string; nome: string };
  mangas: MangaCampo[];
  lotes: LoteCampo[];
  animais: AnimalCampo[];
  medicamentos?: MedicamentoCampo[];
  sais?: SalCampo[];
  dietas?: DietaCampo[];
  pluviometros?: string[];
  /** V188: raças cadastradas (para a contagem sem lote) */
  racas?: string[];
  tarefas: TarefaCampo[];
  pendentes: number;
};

export type TipoCampo = 'contagem' | 'vistoria' | 'tarefa_feita' | 'sanidade' | 'nascimento' | 'morte' | 'sumido' | 'achado' | 'cio' | 'pesagem' | 'transferencia' | 'trato' | 'chuva';
export type RegistroCampo = {
  id: string;
  fazenda_id: string;
  tipo: TipoCampo;
  dados: Record<string, unknown>;
  fotos: string[];
  /** V185: fotos tiradas sem sinal, guardadas no celular até enviar (chaves do guardador de fotos) */
  fotosLocais?: string[];
  feito_em: string;
  lat?: number | null;
  lng?: number | null;
  /** texto para a pessoa ver na fila */
  resumo: string;
  /** erro que o sistema devolveu (fica na fila para corrigir ou apagar) */
  erro?: string | null;
};

const chavePacote = (fid: string) => `campo_pacote_${fid}`;
const CHAVE_FILA = 'campo_fila';
const CHAVE_ENVIADOS = 'campo_enviados';

/** Identificador feito no próprio celular: enviar duas vezes não duplica no sistema. */
export function novoId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += h[(Math.random() * 4) | 8];
    else s += h[(Math.random() * 16) | 0];
  }
  return s;
}

// ---------- pacote (o que o celular guarda para consultar) ----------
export async function pacoteGuardado(fid: string): Promise<PacoteCampo | null> {
  try {
    const t = await AsyncStorage.getItem(chavePacote(fid));
    return t ? (JSON.parse(t) as PacoteCampo) : null;
  } catch {
    return null;
  }
}

/** Baixa do sistema e guarda no celular. Sem sinal, dá erro (e fica o que estava guardado). */
export async function baixarPacote(fid: string): Promise<PacoteCampo> {
  const { data, error } = await supabase.rpc('campo_pacote', { p_fazenda: fid });
  if (error) throw error;
  const p = data as PacoteCampo;
  await AsyncStorage.setItem(chavePacote(fid), JSON.stringify(p));
  return p;
}

// ---------- fila do que foi lançado ----------
export async function lerFila(): Promise<RegistroCampo[]> {
  try {
    const t = await AsyncStorage.getItem(CHAVE_FILA);
    return t ? (JSON.parse(t) as RegistroCampo[]) : [];
  } catch {
    return [];
  }
}
async function gravarFila(l: RegistroCampo[]) {
  await AsyncStorage.setItem(CHAVE_FILA, JSON.stringify(l));
}

/** O que já foi enviado (os últimos 50), para a pessoa ver o histórico do dia. */
export async function lerEnviados(): Promise<RegistroCampo[]> {
  try {
    const t = await AsyncStorage.getItem(CHAVE_ENVIADOS);
    return t ? (JSON.parse(t) as RegistroCampo[]) : [];
  } catch {
    return [];
  }
}

/** Posição do celular, se a pessoa deixou (no máximo 5 segundos; sem posição também lança). */
export async function posicao(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    const ok = perm.granted || (perm.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
    if (!ok) return null;
    const ultima = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }).catch(() => null);
    if (ultima) return { lat: ultima.coords.latitude, lng: ultima.coords.longitude };
    const atual = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]);
    return atual ? { lat: atual.coords.latitude, lng: atual.coords.longitude } : null;
  } catch {
    return null;
  }
}

// ---------- V185: fotos guardadas no celular até ter sinal ----------
// No navegador ficam no IndexedDB (cabe bem mais que o armazenamento comum); no app, no armazenamento do app.
export type FotoLocal = { base64: string; mimeType: string };
const BANCO_FOTOS = 'fazenda-digital-fotos';

function abrirBancoFotos(): Promise<any> | null {
  const idb = Platform.OS === 'web' ? (globalThis as any).indexedDB : null;
  if (!idb) return null;
  return new Promise((ok, falha) => {
    const req = idb.open(BANCO_FOTOS, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('fotos');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}
async function noBancoFotos<T>(modo: 'readonly' | 'readwrite', acao: (st: any) => any): Promise<T> {
  const db = await abrirBancoFotos()!;
  return new Promise<T>((ok, falha) => {
    const tx = db.transaction('fotos', modo);
    const req = acao(tx.objectStore('fotos'));
    tx.oncomplete = () => ok(req?.result as T);
    tx.onerror = () => falha(tx.error);
  });
}
export async function guardarFotoLocal(f: FotoLocal): Promise<string> {
  const chave = `foto_${novoId()}`;
  if (abrirBancoFotos()) await noBancoFotos('readwrite', (st) => st.put(f, chave));
  else await AsyncStorage.setItem(chave, JSON.stringify(f));
  return chave;
}
async function lerFotoLocal(chave: string): Promise<FotoLocal | null> {
  try {
    if (abrirBancoFotos()) return (await noBancoFotos<FotoLocal | undefined>('readonly', (st) => st.get(chave))) ?? null;
    const t = await AsyncStorage.getItem(chave);
    return t ? (JSON.parse(t) as FotoLocal) : null;
  } catch {
    return null;
  }
}
async function apagarFotoLocal(chave: string) {
  try {
    if (abrirBancoFotos()) await noBancoFotos('readwrite', (st) => st.delete(chave));
    else await AsyncStorage.removeItem(chave);
  } catch {
    // fica sobrando no celular; não atrapalha
  }
}

/** Antes de enviar: sobe as fotos guardadas e troca as chaves pelos caminhos no sistema. */
async function subirFotos(r: RegistroCampo): Promise<RegistroCampo> {
  if (!r.fotosLocais?.length) return r;
  const fotos = [...r.fotos];
  const restam: string[] = [];
  for (const k of r.fotosLocais) {
    const f = await lerFotoLocal(k);
    if (!f) continue; // perdeu a foto: segue sem ela
    try {
      fotos.push(await guardarDocumento('campo', f.base64, f.mimeType || 'image/jpeg'));
      await apagarFotoLocal(k);
    } catch {
      restam.push(k);
    }
  }
  return { ...r, fotos, fotosLocais: restam };
}

/** Guarda o lançamento no celular (na hora) e tenta enviar. As fotos ficam no celular até subir. */
export async function lancar(r: Omit<RegistroCampo, 'id' | 'feito_em' | 'lat' | 'lng' | 'fotosLocais'>, fotosNovas: FotoLocal[] = []): Promise<{ enviado: boolean }> {
  const pos = await posicao();
  const chaves: string[] = [];
  for (const f of fotosNovas) chaves.push(await guardarFotoLocal(f));
  const reg: RegistroCampo = { ...r, fotosLocais: chaves, id: novoId(), feito_em: new Date().toISOString(), lat: pos?.lat ?? null, lng: pos?.lng ?? null };
  await gravarFila([...(await lerFila()), reg]);
  const res = await enviarFila().catch(() => null);
  return { enviado: !!res && !(await lerFila()).some((x) => x.id === reg.id) };
}

export async function apagarDaFila(id: string) {
  const fila = await lerFila();
  for (const k of fila.find((x) => x.id === id)?.fotosLocais ?? []) await apagarFotoLocal(k);
  await gravarFila(fila.filter((x) => x.id !== id));
}

let enviando: Promise<{ enviados: number; erros: number }> | null = null;

/** Manda a fila para o sistema. Os aceitos saem da fila; os recusados ficam com o motivo. Sem sinal, não faz nada. */
export function enviarFila(): Promise<{ enviados: number; erros: number }> {
  if (enviando) return enviando;
  enviando = (async () => {
    let fila = await lerFila();
    if (!fila.length) return { enviados: 0, erros: 0 };
    // sobe as fotos primeiro (uma por vez); a que não subir segue na fila para a próxima vez
    const comFotos: RegistroCampo[] = [];
    for (const x of fila) comFotos.push(await subirFotos(x));
    if (comFotos.some((x, i) => x !== fila[i])) {
      const mapa = new Map(comFotos.map((x) => [x.id, x]));
      await gravarFila((await lerFila()).map((x) => mapa.get(x.id) ?? x));
    }
    fila = comFotos.filter((x) => !x.fotosLocais?.length);
    if (!fila.length) return { enviados: 0, erros: 0 };
    const { data, error } = await supabase.rpc('campo_enviar', {
      p: { registros: fila.map((x) => ({ id: x.id, fazenda_id: x.fazenda_id, tipo: x.tipo, dados: x.dados, fotos: x.fotos, feito_em: x.feito_em, lat: x.lat, lng: x.lng })) },
    });
    if (error) throw error;
    const aceitos = new Set<string>(((data as any)?.aceitos ?? []) as string[]);
    const erros = new Map<string, string>((((data as any)?.erros ?? []) as any[]).map((e) => [String(e.id), String(e.erro)]));
    // a fila pode ter ganhado itens enquanto enviava: relê antes de gravar
    const agora = await lerFila();
    const ficam = agora.filter((x) => !aceitos.has(x.id)).map((x) => (erros.has(x.id) ? { ...x, erro: erros.get(x.id) } : x));
    await gravarFila(ficam);
    const foram = fila.filter((x) => aceitos.has(x.id));
    if (foram.length) {
      const hist = [...foram, ...(await lerEnviados())].slice(0, 50);
      await AsyncStorage.setItem(CHAVE_ENVIADOS, JSON.stringify(hist));
    }
    return { enviados: foram.length, erros: erros.size };
  })().finally(() => {
    enviando = null;
  });
  return enviando;
}

// ---------- textos ----------
export const NOTAS = [
  { valor: 'bom', rotulo: 'Bom' },
  { valor: 'regular', rotulo: 'Regular' },
  { valor: 'ruim', rotulo: 'Ruim' },
];

/** Idade em meses a partir do nascimento (aaaa-mm-dd). */
export function idadeMeses(nasc: string | null): number | null {
  if (!nasc) return null;
  const [a, m, d] = nasc.split('-').map(Number);
  const h = new Date();
  let meses = (h.getFullYear() - a) * 12 + (h.getMonth() + 1 - m);
  if (h.getDate() < d) meses -= 1;
  return Math.max(0, meses);
}

export function textoIdade(nasc: string | null, aprox?: boolean | null): string {
  const m = idadeMeses(nasc);
  if (m == null) return 'idade não informada';
  const t = m < 24 ? `${m} ${m === 1 ? 'mês' : 'meses'}` : `${Math.floor(m / 12)} anos${m % 12 ? ` e ${m % 12} ${m % 12 === 1 ? 'mês' : 'meses'}` : ''}`;
  return aprox ? `cerca de ${t}` : t;
}

export function quandoFoi(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}
