// V163: lê a foto ou o PDF de uma e-GTA (Guia de Trânsito Animal emitida no Siapec/IDAF) com a IA
// e devolve os dados em JSON para a tela de conferência da GTA. A chave da IA fica só aqui (secret ANTHROPIC_API_KEY).
// O arquivo é guardado na pasta privada "documentos/gtas" (auditoria) e o caminho volta junto.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Papel de quem chamou (o token já foi validado pelo Supabase): 'authenticated' = usuário logado no app. */
function papel(req: Request): string | null {
  try {
    const t = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.role ?? null;
  } catch {
    return null;
  }
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

async function guardar(b64: string, formato: string): Promise<string | null> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !chave) return null;
    const caminho = `gtas/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[formato] ?? 'jpg'}`;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = await fetch(`${url}/storage/v1/object/documentos/${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, apikey: chave, 'Content-Type': formato, 'x-upsert': 'false' },
      body: bin,
    });
    if (!r.ok) {
      console.error('arquivo', r.status, (await r.text()).slice(0, 300));
      return null;
    }
    return caminho;
  } catch (e) {
    console.error('arquivo', String(e));
    return null;
  }
}

const MODELO = 'claude-sonnet-5-5';
const MODELO_RESERVA = 'claude-haiku-4-5-20251001';

const PROMPT = `Você lê uma Guia de Trânsito Animal eletrônica (e-GTA) emitida no Siapec do IDAF (Espírito Santo) ou de outro estado.
Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem crases, neste formato:
{"legivel": true|false,
 "numero": string|null,
 "situacao": string|null,
 "emissao": "aaaa-mm-dd"|null,
 "validade": "aaaa-mm-dd"|null,
 "finalidade": string|null,
 "transporte": string|null,
 "emitido_por": string|null,
 "autenticidade": string|null,
 "origem": {"doc": string|null, "nome": string|null, "estabelecimento": string|null, "codigo": string|null, "municipio": string|null, "uf": string|null},
 "destino": {"doc": string|null, "nome": string|null, "estabelecimento": string|null, "codigo": string|null, "municipio": string|null, "uf": string|null},
 "especie": string|null,
 "quantidades": {"M0": number, "F0": number, "M13": number, "F13": number, "M25": number, "F25": number, "M37": number, "F37": number},
 "total": number|null,
 "nao_lido": [string]}
Regras:
- "numero" = o campo e-GTA exatamente como está escrito, com os espaços (ex.: "ES 816265 D").
- "situacao" = o Status (ex.: "EM TRÂNSITO", "CANCELADA").
- Datas no formato aaaa-mm-dd (o papel traz dd/mm/aaaa).
- "origem" = quadro Procedência; "destino" = quadro Destino. "doc" = CPF/CNPJ só com os dígitos; "codigo" = Cód. do Estabelecimento só com os dígitos;
  no campo UF vem algo como "ES (3201506-COLATINA)": "uf" = "ES" e "municipio" = "Colatina" (só o nome da cidade, com a primeira letra maiúscula).
- "quantidades": cada linha de Descrição/Quantidade. M = macho, F = fêmea; o número da chave é o início da faixa: 0 = "0 A 12 MESES", 13 = "13 A 24 MESES",
  25 = "25 A 36 MESES", 37 = "ACIMA DE 36 MESES". Linha que não aparece = 0. Copie os números dígito a dígito.
- "total" = o TOTAL do papel. "autenticidade" = o Código de Autenticidade, só os dígitos.
- Se algum campo estiver ilegível, use null e ponha o nome dele em "nao_lido". Nunca invente números.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return resposta({ erro: 'A leitura por foto ainda não está ligada: falta a chave da IA (ANTHROPIC_API_KEY) nos Secrets do Supabase.' }, 503);
  if (papel(req) !== 'authenticated') return resposta({ erro: 'Entre no app para ler a GTA.' }, 401);

  let corpo: { imagem?: string; formato?: string };
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }
  if (!corpo.imagem || corpo.imagem.length < 1000) return resposta({ erro: 'Arquivo não recebido.' }, 400);
  if (corpo.imagem.length > 9_000_000) return resposta({ erro: 'Arquivo grande demais. Tire a foto com o papel ocupando a tela, ou envie o PDF.' }, 413);
  const formato = EXT[corpo.formato ?? ''] ? corpo.formato! : 'image/jpeg';
  const anexo =
    formato === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: corpo.imagem } }
      : { type: 'image', source: { type: 'base64', media_type: formato, data: corpo.imagem } };

  const chamar = (modelo: string) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, max_tokens: 2000, messages: [{ role: 'user', content: [anexo, { type: 'text', text: PROMPT }] }] }),
    });
  const lerComReserva = async () => {
    const r1 = await chamar(MODELO);
    if (r1.ok || !(r1.status === 404 || r1.status === 400)) return r1;
    const t = await r1.clone().text();
    if (r1.status === 400 && !/model/i.test(t)) return r1;
    console.error('modelo principal indisponível, usando o reserva', r1.status, t.slice(0, 200));
    return chamar(MODELO_RESERVA);
  };

  const [r, arquivo] = await Promise.all([lerComReserva(), guardar(corpo.imagem, formato)]);
  if (!r.ok) {
    const t = await r.text();
    console.error('IA', r.status, t.slice(0, 500));
    return resposta(
      {
        erro:
          r.status === 401 ? 'A chave da IA não foi aceita. Confira o secret ANTHROPIC_API_KEY.'
          : r.status === 400 && /credit/i.test(t) ? 'Sem crédito na conta da IA. Compre créditos em platform.claude.com › Billing.'
          : r.status === 429 || r.status === 529 ? 'A IA está ocupada. Tente de novo em instantes.'
          : 'Não foi possível ler a GTA agora.',
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
    return resposta({ dados, arquivo });
  } catch {
    return resposta({ dados: { legivel: false, nao_lido: ['tudo'] }, arquivo });
  }
});
