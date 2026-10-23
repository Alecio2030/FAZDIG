// Lê a foto do laudo/romaneio de classificação de café (cooperativa, armazém ou comprador) com a IA e devolve os dados em JSON para conferência.
// A chave da IA fica só aqui no servidor (secret ANTHROPIC_API_KEY). A foto é guardada na pasta privada "documentos/classificacoes".
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

async function guardarFoto(b64: string, formato: string): Promise<string | null> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !chave) return null;
    const ext = formato === 'image/png' ? 'png' : formato === 'image/webp' ? 'webp' : 'jpg';
    const caminho = `classificacoes/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = await fetch(`${url}/storage/v1/object/documentos/${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, apikey: chave, 'Content-Type': formato, 'x-upsert': 'false' },
      body: bin,
    });
    if (!r.ok) {
      console.error('foto', r.status, (await r.text()).slice(0, 300));
      return null;
    }
    return caminho;
  } catch (e) {
    console.error('foto', String(e));
    return null;
  }
}

const MODELO = 'claude-sonnet-5-5';
const MODELO_RESERVA = 'claude-haiku-4-5-20251001';

const PROMPT = `Você lê a foto de um laudo de classificação, romaneio de entrada ou recibo de depósito de café (conilon, robusta ou arábica) emitido por cooperativa, armazém ou comprador no Brasil.
Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem crases, neste formato:
{"legivel": true|false,
 "emitente": string|null,
 "documento": string|null,
 "data": "aaaa-mm-dd"|null,
 "especie": "Conilon"|"Arábica"|"Robusta"|null,
 "sacas": number|null,
 "peso_kg": number|null,
 "tipo": string|null,
 "peneira": string|null,
 "umidade": number|null,
 "defeitos": number|null,
 "impurezas": number|null,
 "broca": number|null,
 "bebida": string|null,
 "nao_lido": [string]}
Regras:
- Números com ponto decimal (12.5), sem separador de milhar e sem o sinal de %.
- "emitente": nome da cooperativa, armazém ou empresa que emitiu o papel. "documento": número do laudo, romaneio ou recibo de depósito.
- "sacas": quantidade de sacas de 60 kg; "peso_kg": peso líquido total em kg. Se só um dos dois estiver escrito, o outro fica null (não calcule).
- "tipo": o tipo pela tabela de defeitos (COB), como está escrito: "6", "7", "7/8", "8" etc.
- "peneira": como está escrito (ex.: "13 acima", "15/16", "moca 10").
- "umidade", "impurezas" e "broca": em porcentagem. "defeitos": número de defeitos (ou a porcentagem de catação/PVA, se for só isso que o laudo traz).
- "bebida": só se estiver escrita (arábica: mole, dura, riada, rio; conilon: neutra, suave etc.).
- Não invente: o que não conseguir ler ou não existir no papel fica null; o que existir mas estiver ilegível vai em "nao_lido" (em português: "sacas", "tipo", "peneira", "umidade", "defeitos"). Nunca complete números cortados.
- "legivel" é false só se não der para ler quase nada.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return resposta({ erro: 'A leitura por foto ainda não está ligada: falta cadastrar a chave da IA (ANTHROPIC_API_KEY) nos Secrets do Supabase.' }, 503);
  if (papel(req) !== 'authenticated') return resposta({ erro: 'Entre no app para usar a leitura por foto.' }, 401);

  let corpo: { imagem?: string; formato?: string };
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }
  if (!corpo.imagem || corpo.imagem.length < 1000) return resposta({ erro: 'Foto não recebida.' }, 400);
  if (corpo.imagem.length > 6_500_000) return resposta({ erro: 'Foto grande demais. Tire de novo, com o papel ocupando a tela.' }, 413);
  const formato = ['image/jpeg', 'image/png', 'image/webp'].includes(corpo.formato ?? '') ? corpo.formato! : 'image/jpeg';

  const chamar = (modelo: string) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: formato, data: corpo.imagem } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });
  const lerComFallback = async () => {
    const r1 = await chamar(MODELO);
    if (r1.ok || !(r1.status === 404 || r1.status === 400)) return r1;
    const t = await r1.clone().text();
    if (r1.status === 400 && !/model/i.test(t)) return r1;
    console.error('modelo principal indisponível, usando o reserva', r1.status, t.slice(0, 200));
    return chamar(MODELO_RESERVA);
  };

  const [r, arquivo] = await Promise.all([lerComFallback(), guardarFoto(corpo.imagem, formato)]);
  if (!r.ok) {
    const t = await r.text();
    console.error('IA', r.status, t.slice(0, 500));
    return resposta(
      {
        erro:
          r.status === 401 ? 'A chave da IA não foi aceita. Confira o secret ANTHROPIC_API_KEY.'
          : r.status === 400 && /credit/i.test(t) ? 'Sem crédito na conta da IA. Compre créditos em platform.claude.com › Billing.'
          : r.status === 413 || (r.status === 400 && /image/i.test(t)) ? 'Foto grande demais para a leitura. Tire de novo, com o papel ocupando a tela.'
          : r.status === 429 || r.status === 529 ? 'A IA está ocupada. Tente de novo em instantes.'
          : 'Não foi possível ler a foto agora.',
        arquivo,
      },
      502,
    );
  }
  const d = await r.json();
  const texto = (d.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  const limpo = texto.replace(/```json|```/g, '').trim();
  try {
    const dados = JSON.parse(limpo.slice(limpo.indexOf('{'), limpo.lastIndexOf('}') + 1));
    return resposta({ dados, arquivo, uso: d.usage ?? null, modelo: d.model ?? null });
  } catch {
    return resposta({ dados: { legivel: false, nao_lido: ['tudo'] }, arquivo, uso: d.usage ?? null });
  }
});
