// Satélite: índice de vigor (NDVI) do talhão pelas imagens do Sentinel-2, no Copernicus Data Space (Sentinel Hub).
// As chaves ficam só aqui no servidor (secrets COPERNICUS_CLIENT_ID e COPERNICUS_CLIENT_SECRET).
// Ações: "indice" (média do NDVI do talhão em cada passagem do satélite) e "imagem" (mapa colorido do NDVI num dia).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function papel(req: Request): string | null {
  try {
    const t = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.role ?? null;
  } catch {
    return null;
  }
}

const URL_TOKEN = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const URL_SH = 'https://sh.dataspace.copernicus.eu/api/v1';
const CRS = 'http://www.opengis.net/def/crs/EPSG/0/4326';

let guardado: { token: string; ate: number } | null = null;

async function pegarToken(id: string, segredo: string): Promise<{ token?: string; erro?: string }> {
  if (guardado && Date.now() < guardado.ate) return { token: guardado.token };
  const r = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: segredo }),
  });
  if (!r.ok) {
    console.error('token', r.status, (await r.text()).slice(0, 300));
    return { erro: r.status === 401 || r.status === 400 ? 'As chaves do Copernicus não foram aceitas. Confira os secrets COPERNICUS_CLIENT_ID e COPERNICUS_CLIENT_SECRET no Supabase.' : 'O Copernicus não respondeu ao pedido de acesso. Tente de novo em instantes.' };
  }
  const j = await r.json();
  guardado = { token: j.access_token, ate: Date.now() + (Number(j.expires_in ?? 300) - 60) * 1000 };
  return { token: guardado.token };
}

// Só entram os pixels limpos (classificação da cena do Sentinel-2): sem nuvem, sombra de nuvem, cirrus ou neve.
const LIMPO = '[2,4,5,6,7].includes(s.SCL)';

const EVAL_INDICE = `//VERSION=3
function setup(){return{input:[{bands:["B04","B08","SCL","dataMask"]}],output:[{id:"ndvi",bands:1,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]}}
function evaluatePixel(s){var ok=(s.dataMask==1&&${LIMPO})?1:0;var d=s.B08+s.B04;return{ndvi:[d>0?(s.B08-s.B04)/d:0],dataMask:[ok]}}`;

const EVAL_IMAGEM = `//VERSION=3
function setup(){return{input:[{bands:["B04","B08","SCL","dataMask"]}],output:{bands:4}}}
var R=[[0.2,[0.65,0.25,0.15]],[0.35,[0.90,0.45,0.15]],[0.5,[0.98,0.80,0.25]],[0.6,[0.80,0.88,0.35]],[0.7,[0.50,0.78,0.30]],[0.8,[0.20,0.62,0.25]],[2,[0.05,0.40,0.15]]];
function evaluatePixel(s){if(s.dataMask==0)return[0,0,0,0];if(!(${LIMPO}))return[0.75,0.75,0.75,1];var d=s.B08+s.B04;var v=d>0?(s.B08-s.B04)/d:0;for(var i=0;i<R.length;i++){if(v<R[i][0])return[R[i][1][0],R[i][1][1],R[i][1][2],1]}return[0.05,0.40,0.15,1]}`;

type Corpo = { acao?: string; geometria?: any; inicio?: string; fim?: string; data?: string };
const eData = (t?: string) => !!t && /^\d{4}-\d{2}-\d{2}$/.test(t);

/** Confere o contorno (polígono em graus, pequeno) e devolve a caixa em volta. */
function caixa(g: any): { minLng: number; maxLng: number; minLat: number; maxLat: number } | null {
  const anel = g?.type === 'Polygon' ? g.coordinates?.[0] : null;
  if (!Array.isArray(anel) || anel.length < 4 || anel.length > 2000) return null;
  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
  for (const p of anel) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
    minLng = Math.min(minLng, p[0]); maxLng = Math.max(maxLng, p[0]);
    minLat = Math.min(minLat, p[1]); maxLat = Math.max(maxLat, p[1]);
  }
  // talhão: no máximo uns 20 km de lado
  if (maxLng - minLng > 0.2 || maxLat - minLat > 0.2 || maxLng - minLng <= 0 || maxLat - minLat <= 0) return null;
  return { minLng, maxLng, minLat, maxLat };
}

function erroSH(status: number, texto: string): string {
  if (status === 401 || status === 403) return 'O Copernicus recusou o acesso. Confira as chaves nos secrets do Supabase.';
  if (status === 429) return /quota|exceed|processing units/i.test(texto) ? 'A cota gratuita do mês no Copernicus acabou. Volta no início do próximo mês.' : 'O Copernicus está ocupado. Tente de novo em instantes.';
  return 'Não foi possível ler o satélite agora. Tente de novo em instantes.';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const id = Deno.env.get('COPERNICUS_CLIENT_ID');
  const segredo = Deno.env.get('COPERNICUS_CLIENT_SECRET');
  if (!id || !segredo) return resposta({ erro: 'O satélite ainda não está ligado: falta cadastrar as chaves do Copernicus (COPERNICUS_CLIENT_ID e COPERNICUS_CLIENT_SECRET) nos Secrets do Supabase.' }, 503);
  if (papel(req) !== 'authenticated') return resposta({ erro: 'Entre no app para usar o satélite.' }, 401);

  let c: Corpo;
  try {
    c = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }
  const cx = caixa(c.geometria);
  if (!cx) return resposta({ erro: 'O contorno do talhão não serve para o satélite. Redesenhe o talhão no mapa.' }, 400);
  const limites = { geometry: { type: 'Polygon', coordinates: c.geometria.coordinates }, properties: { crs: CRS } };

  const t = await pegarToken(id, segredo.trim());
  if (!t.token) return resposta({ erro: t.erro }, 502);
  const cab = { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' };

  // ---------- média do NDVI por passagem ----------
  if (c.acao === 'indice') {
    if (!eData(c.inicio) || !eData(c.fim) || c.inicio! > c.fim!) return resposta({ erro: 'Período inválido.' }, 400);
    const dias = (Date.parse(c.fim!) - Date.parse(c.inicio!)) / 86400000;
    if (dias > 400) return resposta({ erro: 'Período grande demais.' }, 400);
    const r = await fetch(`${URL_SH}/statistics`, {
      method: 'POST',
      headers: { ...cab, Accept: 'application/json' },
      body: JSON.stringify({
        input: { bounds: limites, data: [{ type: 'sentinel-2-l2a', dataFilter: { mosaickingOrder: 'leastCC' } }] },
        aggregation: {
          timeRange: { from: `${c.inicio}T00:00:00Z`, to: `${c.fim}T23:59:59Z` },
          aggregationInterval: { of: 'P1D' },
          evalscript: EVAL_INDICE,
          resx: 0.0001,
          resy: 0.0001,
        },
        calculations: { default: {} },
      }),
    });
    if (!r.ok) {
      const tx = await r.text();
      console.error('statistics', r.status, tx.slice(0, 500));
      return resposta({ erro: erroSH(r.status, tx) }, 502);
    }
    const j = await r.json();
    const dados: { data: string; ndvi: number; min: number; max: number; validos: number }[] = [];
    for (const d of (j.data ?? []) as any[]) {
      const s = d?.outputs?.ndvi?.bands?.B0?.stats;
      const validos = s ? Number(s.sampleCount ?? 0) - Number(s.noDataCount ?? 0) : 0;
      if (!s || !(validos > 0) || !Number.isFinite(Number(s.mean))) continue;
      dados.push({ data: String(d.interval?.from ?? '').slice(0, 10), ndvi: Number(s.mean), min: Number(s.min), max: Number(s.max), validos });
    }
    return resposta({ dados });
  }

  // ---------- mapa colorido do NDVI num dia ----------
  if (c.acao === 'imagem') {
    if (!eData(c.data)) return resposta({ erro: 'Data inválida.' }, 400);
    const latMedia = ((cx.minLat + cx.maxLat) / 2) * (Math.PI / 180);
    const larguraM = (cx.maxLng - cx.minLng) * 111320 * Math.cos(latMedia);
    const alturaM = (cx.maxLat - cx.minLat) * 110540;
    const escala = 512 / Math.max(larguraM, alturaM);
    const width = Math.max(16, Math.round(larguraM * escala));
    const height = Math.max(16, Math.round(alturaM * escala));
    const r = await fetch(`${URL_SH}/process`, {
      method: 'POST',
      headers: { ...cab, Accept: 'image/png' },
      body: JSON.stringify({
        input: { bounds: limites, data: [{ type: 'sentinel-2-l2a', dataFilter: { timeRange: { from: `${c.data}T00:00:00Z`, to: `${c.data}T23:59:59Z` }, mosaickingOrder: 'leastCC' } }] },
        output: { width, height, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
        evalscript: EVAL_IMAGEM,
      }),
    });
    if (!r.ok) {
      const tx = await r.text();
      console.error('process', r.status, tx.slice(0, 500));
      return resposta({ erro: erroSH(r.status, tx) }, 502);
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return resposta({ imagem: btoa(bin), largura: width, altura: height });
  }

  return resposta({ erro: 'Ação desconhecida.' }, 400);
});
