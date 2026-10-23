// V153: lê o EXTRATO BANCÁRIO (foto, PDF ou planilha Excel/CSV) com a IA e devolve os lançamentos em JSON
// para a Conciliação bancária. O arquivo OFX não passa por aqui: o app lê sozinho (é exato e não gasta a IA).
// A chave da IA fica só no servidor (secret ANTHROPIC_API_KEY). Foto e PDF ficam guardados em documentos/extratos.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import * as XLSX from 'npm:xlsx@0.18.5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function papel(req: Request): string | null {
  try {
    const t = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.role ?? null;
  } catch {
    return null;
  }
}

async function guardar(b64: string, formato: string): Promise<string | null> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !chave) return null;
    const ext = formato === 'application/pdf' ? 'pdf' : formato === 'image/png' ? 'png' : formato === 'image/webp' ? 'webp' : 'jpg';
    const caminho = `extratos/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = await fetch(`${url}/storage/v1/object/documentos/${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, apikey: chave, 'Content-Type': formato, 'x-upsert': 'false' },
      body: bin,
    });
    return r.ok ? caminho : null;
  } catch {
    return null;
  }
}

const MODELO = 'claude-sonnet-5-5';
const MODELO_RESERVA = 'claude-haiku-4-5-20251001';

const PROMPT = `Você lê o EXTRATO de uma conta bancária (de um produtor rural) e devolve TODOS os lançamentos.
Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem crases, neste formato:
{"legivel": true|false,
 "banco": string|null, "agencia": string|null, "conta": string|null,
 "periodo_de": "aaaa-mm-dd"|null, "periodo_ate": "aaaa-mm-dd"|null,
 "saldo_inicial": number|null, "saldo_final": number|null,
 "lancamentos": [{"data": "aaaa-mm-dd", "descricao": string, "documento": string|null, "valor": number}],
 "nao_lido": [string]}
Regras:
- "valor": POSITIVO quando entrou dinheiro na conta (crédito, C, depósito, Pix recebido, TED recebida, resgate, rendimento)
  e NEGATIVO quando saiu (débito, D, pagamento, Pix enviado, tarifa, saque, IOF, aplicação). Ponto decimal (1234.56), sem separador de milhar.
- Uma linha do extrato = um lançamento. NÃO inclua linhas de saldo (SALDO ANTERIOR, SALDO DO DIA, SALDO FINAL, saldo bloqueado/disponível), totais nem limites.
- "data": a data do lançamento. Se o extrato só mostra dia/mês, use o ano do período do extrato.
- "descricao": o histórico como está escrito, mais o complemento (nome de quem pagou/recebeu), em uma linha só.
- "documento": o nº do documento/controle, se houver.
- "saldo_inicial": o SALDO ANTERIOR do período; "saldo_final": o último saldo do período.
- Confira: saldo_inicial + soma dos valores ≈ saldo_final. Se não bater, releia os sinais e os valores.
- Não invente: o que não conseguir ler fica null e o nome do campo vai em "nao_lido". Nunca complete números cortados.
- "legivel" é false só se não der para ler quase nada.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);
  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return resposta({ erro: 'A leitura pela IA ainda não está ligada: falta a chave ANTHROPIC_API_KEY nos Secrets do Supabase.' }, 503);
  if (papel(req) !== 'authenticated') return resposta({ erro: 'Entre no app para ler o extrato.' }, 401);

  let corpo: { conteudo?: string; formato?: string; nome?: string };
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }
  const b64 = corpo.conteudo ?? '';
  const formato = (corpo.formato ?? '').toLowerCase();
  const nome = (corpo.nome ?? '').toLowerCase();
  if (b64.length < 50) return resposta({ erro: 'Arquivo não recebido.' }, 400);
  if (b64.length > 14_000_000) return resposta({ erro: 'Arquivo grande demais (máx. ~10 MB). Exporte só o período que quer conciliar.' }, 413);

  // monta o que vai para a IA: imagem, PDF ou o texto da planilha
  let conteudo: unknown[];
  let arquivo: string | null = null;
  const ehPlanilha = /\.(xlsx|xls|ods|csv|txt)$/.test(nome) || /sheet|excel|csv|opendocument\.spreadsheet|text\/plain/.test(formato);
  if (formato === 'application/pdf' || nome.endsWith('.pdf')) {
    conteudo = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }];
    arquivo = await guardar(b64, 'application/pdf');
  } else if (ehPlanilha) {
    let texto = '';
    try {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const wb = XLSX.read(bin, { type: 'array', cellDates: true, codepage: 1252 });
      for (const n of wb.SheetNames.slice(0, 5)) texto += `### Planilha ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ';', blankrows: false, dateNF: 'yyyy-mm-dd' })}\n`;
    } catch {
      return resposta({ erro: 'Não consegui abrir a planilha. Salve como .xlsx ou .csv e tente de novo.' }, 400);
    }
    if (texto.length > 400_000) texto = texto.slice(0, 400_000);
    conteudo = [{ type: 'text', text: `Conteúdo da planilha do extrato (colunas separadas por ";"):\n${texto}` }];
  } else {
    const img = ['image/jpeg', 'image/png', 'image/webp'].includes(formato) ? formato : 'image/jpeg';
    conteudo = [{ type: 'image', source: { type: 'base64', media_type: img, data: b64 } }];
    arquivo = await guardar(b64, img);
  }

  const chamar = (modelo: string) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, max_tokens: 16000, messages: [{ role: 'user', content: [...conteudo, { type: 'text', text: PROMPT }] }] }),
    });
  let r = await chamar(MODELO);
  if (!r.ok && (r.status === 404 || (r.status === 400 && /model/i.test(await r.clone().text())))) r = await chamar(MODELO_RESERVA);
  if (!r.ok) {
    const t = await r.text();
    console.error('IA', r.status, t.slice(0, 500));
    return resposta(
      {
        erro:
          r.status === 401 ? 'A chave da IA não foi aceita. Confira o secret ANTHROPIC_API_KEY.'
          : r.status === 400 && /credit/i.test(t) ? 'Sem crédito na conta da IA. Compre créditos em platform.claude.com › Billing.'
          : r.status === 429 || r.status === 529 ? 'A IA está ocupada. Tente de novo em instantes.'
          : 'Não foi possível ler o extrato agora.',
      },
      502,
    );
  }
  const d = await r.json();
  const texto = (d.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  const limpo = texto.replace(/```json|```/g, '').trim();
  try {
    const dados = JSON.parse(limpo.slice(limpo.indexOf('{'), limpo.lastIndexOf('}') + 1));
    return resposta({ dados, arquivo, cortado: d.stop_reason === 'max_tokens' });
  } catch {
    return resposta({ erro: d.stop_reason === 'max_tokens' ? 'O extrato é longo demais para uma leitura só: exporte um período menor (ex.: 15 dias).' : 'Não consegui entender o extrato. Tente o PDF ou o arquivo OFX.' }, 502);
  }
});
