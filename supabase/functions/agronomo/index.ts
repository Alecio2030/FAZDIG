// Agrônomo virtual do Fazenda Digital.
//  - acao "ler_laudo": lê a foto do laudo de análise de solo ou foliar e devolve os valores em unidades padrão (para a tela de conferência).
//  - acao "parecer": interpreta uma análise já conferida, junto com os dados do talhão e as contas que o app já fez, e devolve um parecer técnico.
// A chave da IA fica só aqui no servidor (secret ANTHROPIC_API_KEY).
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
    const caminho = `analises/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
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

const PROMPT_LAUDO = `Você lê a foto de um laudo de laboratório agrícola: análise química de SOLO ou análise FOLIAR (tecido vegetal). O laudo pode ter várias amostras (linhas ou colunas).
Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem crases, neste formato:
{"legivel": true|false,
 "tipo": "solo"|"foliar",
 "laboratorio": string|null, "numero_laudo": string|null, "data": "aaaa-mm-dd"|null,
 "amostras": [{"identificacao": string|null, "profundidade": string|null, "valores": {...}, "conversoes": [string]}],
 "nao_lido": [string]}
"valores" traz só os parâmetros que estão no laudo, com estas chaves e SEMPRE nestas unidades (converta quando o laudo usar outra):
SOLO:
- "ph": pH em água (se só houver pH em CaCl2, use a chave "ph_cacl2")
- "p": fósforo disponível, mg/dm3 (Mehlich ou resina; ppm = mg/dm3)
- "k": potássio, mg/dm3 (se vier em cmolc/dm3, multiplique por 391; em mmolc/dm3, por 39,1)
- "na": sódio, mg/dm3
- "ca", "mg", "al", "h_al" (H+Al), "sb" (soma de bases), "t" (CTC efetiva), "ctc" (CTC a pH 7, T): cmolc/dm3 (se vier em mmolc/dm3, divida por 10)
- "v": saturação por bases, %; "m": saturação por alumínio, %
- "mo": matéria orgânica, dag/kg (= %; se vier em g/kg ou g/dm3, divida por 10)
- "p_rem": fósforo remanescente, mg/L
- "s", "b", "cu", "fe", "mn", "zn": mg/dm3
- "argila": %
FOLIAR:
- "n", "p", "k", "ca", "mg", "s": g/kg (se vier em dag/kg ou %, multiplique por 10)
- "b", "cu", "fe", "mn", "zn": mg/kg (ppm = mg/kg)
Regras:
- Números com ponto decimal, sem separador de milhar.
- "conversoes": descreva em português cada conversão de unidade que você fez naquela amostra (ex.: "K de 0,15 cmolc/dm3 para 58,7 mg/dm3"); [] se não converteu nada.
- "identificacao": o nome/descrição da amostra como está no laudo (talhão, gleba, número). "profundidade": como está no laudo (ex.: "0-20").
- "data": a data do laudo ou da emissão (não invente).
- Não invente nem complete: valor ilegível ou duvidoso fica fora de "valores" e o nome dele vai em "nao_lido". "<" ou "traços" (abaixo do limite de detecção): use 0 e avise em "conversoes".
- "legivel" é false só se não der para ler quase nada.`;

const PROMPT_PARECER = `Você é um engenheiro agrônomo especialista em fertilidade do solo e nutrição de plantas, com foco em café conilon no Espírito Santo. Vai receber, em JSON, os dados de um talhão, uma análise de solo ou foliar já conferida pelo produtor e as contas que o sistema já fez. Escreva um parecer prático para o produtor.

REFERÊNCIAS QUE O SISTEMA USA (Incaper; Prezotti et al., 2007, Manual de recomendação de calagem e adubação para o ES, 5a aproximação; Guarçoni, 2017; Partelli et al., 2016):
- Calagem pelo método da saturação por bases: NC (t/ha, PRNT 100, incorporado a 20 cm) = T x (Ve - Va) / 100. Ve para café conforme a CTC a pH 7 (T): T < 4,3 cmolc/dm3 -> 80%; 4,3 a 8,6 -> 70%; acima de 8,6 -> 60%. Em cobertura (lavoura formada, sem incorporar) usa-se metade da dose. Corrigir pelo PRNT (x 100/PRNT). Em geral calcário dolomítico (>= 12% de MgO). Doses altas em cobertura costumam ser parceladas.
- Relação Ca:Mg no solo desejável para o conilon: em torno de 4:1.
- Adubação de produção do conilon (kg/ha/ano), por produtividade esperada (sc/ha) -> N; e K2O conforme o K do solo (<60 | 60-120 | 120-200 | >200 mg/dm3): 20-30 sc: N 260; K2O 230|160|90|0. 31-50: 320; 290|220|150|0. 51-70: 380; 350|280|210|80. 71-100: 440; 410|340|270|140. 101-130: 500; 470|400|330|200. 131-170: 560; 530|460|390|260. >170: 620; 600|520|450|320.
- Épocas da adubação de produção: floração (ago/set), chumbinho (nov/dez) e granação (fev/mar); em lavoura irrigada/fertirrigada, parcelar mais, acompanhando a demanda (maior de outubro a março).
- Eficiência de aproveitamento: sequeiro N 40-50%, P2O5 25-30%, K2O 60-70%; aspersão N 60-70%, K2O 70-80%; gotejamento/microaspersão N 75-85%, P2O5 25-40%, K2O 80-90%.
- Faixas de suficiência foliar do conilon de alta produtividade (Norte do ES). Pré-florada: N 23,1-28,7; P 1,01-1,44; K 9,90-14,9; Ca 15,2-26,5; Mg 2,57-4,65; S 1,02-1,71 g/kg; B 50,7-99,2; Cu 4,36-14,5; Fe 67,0-195; Mn 62,4-226; Zn 4,85-8,05 mg/kg. Granação: N 25,2-30,6; P 1,10-1,53; K 13,0-18,8; Ca 13,8-22,6; Mg 2,53-4,11; S 1,05-1,85 g/kg; B 57,6-102; Cu 6,41-19,8; Fe 67,3-145; Mn 50,4-188; Zn 5,36-17,3 mg/kg.

REGRAS:
- Os números em "calculo" (calagem, N, K2O, classes foliares) foram calculados pelo sistema com as tabelas acima: NÃO os recalcule com outro critério nem os contradiga; explique-os e diga como aplicar (dose por planta, parcelamento, cuidado).
- Para o que não está nas tabelas acima (fósforo, enxofre, micronutrientes no solo, gessagem, matéria orgânica, pH, alumínio, lavoura em formação, outras culturas), use o seu conhecimento das recomendações oficiais brasileiras (5a aproximação do ES e de MG, Embrapa) e deixe claro, em "confianca", que esses pontos são orientação geral a confirmar.
- Classifique cada parâmetro da análise (muito baixo, baixo, médio, adequado, alto ou muito alto) com um comentário curto de uma linha.
- Linguagem simples e direta, de técnico para produtor. Doses em kg/ha e, quando houver plantas por hectare, também em gramas por planta. Sem marcas comerciais.
- Não receite defensivos. Não invente dados que não recebeu; se faltar algo importante (ex.: P-rem, argila, análise de 20-40 cm, produtividade), diga em "proximos_passos".
- Se a cultura não for café conilon, avise que as tabelas do sistema são do conilon e dê a orientação geral para a cultura informada.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem crases, neste formato:
{"resumo": string (3 a 5 frases: como está o solo ou a planta e o que mais limita a produção),
 "parametros": [{"nome": string, "valor": string, "classe": "muito baixo"|"baixo"|"médio"|"adequado"|"alto"|"muito alto", "comentario": string}],
 "calagem": string|null,
 "gessagem": string|null,
 "adubacao": {"nitrogenio": string|null, "fosforo": string|null, "potassio": string|null, "outros": string|null},
 "micronutrientes": string|null,
 "parcelamento": string|null,
 "alertas": [string],
 "proximos_passos": [string],
 "confianca": string}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);
  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return resposta({ erro: 'A IA ainda não está ligada: falta cadastrar a chave (ANTHROPIC_API_KEY) nos Secrets do Supabase.' }, 503);
  if (papel(req) !== 'authenticated') return resposta({ erro: 'Entre no app para usar o agrônomo virtual.' }, 401);

  let corpo: { acao?: string; imagem?: string; formato?: string; contexto?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }

  let conteudo: unknown[];
  let arquivo: Promise<string | null> = Promise.resolve(null);
  let maximo = 4000;
  if (corpo.acao === 'ler_laudo') {
    if (!corpo.imagem || corpo.imagem.length < 1000) return resposta({ erro: 'Foto não recebida.' }, 400);
    if (corpo.imagem.length > 6_500_000) return resposta({ erro: 'Foto grande demais. Tire de novo, com o papel ocupando a tela.' }, 413);
    const formato = ['image/jpeg', 'image/png', 'image/webp'].includes(corpo.formato ?? '') ? corpo.formato! : 'image/jpeg';
    conteudo = [
      { type: 'image', source: { type: 'base64', media_type: formato, data: corpo.imagem } },
      { type: 'text', text: PROMPT_LAUDO },
    ];
    arquivo = guardarFoto(corpo.imagem, formato);
  } else if (corpo.acao === 'parecer') {
    const ctx = JSON.stringify(corpo.contexto ?? {});
    if (ctx.length < 20 || ctx.length > 20000) return resposta({ erro: 'Dados da análise inválidos.' }, 400);
    conteudo = [{ type: 'text', text: `${PROMPT_PARECER}\n\nDADOS:\n${ctx}` }];
    maximo = 3500;
  } else {
    return resposta({ erro: 'Ação não suportada.' }, 400);
  }

  const chamar = (modelo: string) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, max_tokens: maximo, messages: [{ role: 'user', content: conteudo }] }),
    });
  const comReserva = async () => {
    const r1 = await chamar(MODELO);
    if (r1.ok || !(r1.status === 404 || r1.status === 400)) return r1;
    const t = await r1.clone().text();
    if (r1.status === 400 && !/model/i.test(t)) return r1;
    console.error('modelo principal indisponível, usando o reserva', r1.status, t.slice(0, 200));
    return chamar(MODELO_RESERVA);
  };

  const [r, caminho] = await Promise.all([comReserva(), arquivo]);
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
          : 'Não foi possível consultar a IA agora.',
        arquivo: caminho,
      },
      502,
    );
  }
  const d = await r.json();
  const texto = (d.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
  const limpo = texto.replace(/```json|```/g, '').trim();
  try {
    const dados = JSON.parse(limpo.slice(limpo.indexOf('{'), limpo.lastIndexOf('}') + 1));
    return resposta({ dados, arquivo: caminho, uso: d.usage ?? null, modelo: d.model ?? null });
  } catch {
    if (corpo.acao === 'ler_laudo') return resposta({ dados: { legivel: false, amostras: [], nao_lido: ['tudo'] }, arquivo: caminho });
    return resposta({ erro: 'A IA respondeu fora do formato. Tente de novo.' }, 502);
  }
});
