// Lê a foto de um documento (nota fiscal, conhecimento de transporte, conta de consumo, NF de máquina, comprovante etc.) com a IA e devolve os dados em JSON para a tela de conferência.
// A chave da IA fica só aqui no servidor (secret ANTHROPIC_API_KEY); nunca vai para o app.
// A foto é guardada na pasta privada "documentos" (auditoria) e o caminho volta junto.
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

/** Guarda a foto em documentos/<pasta>/<aaaa-mm>/<id>.jpg. Devolve o caminho (ou null se falhar: a leitura segue). */
async function guardarFoto(b64: string, formato: string, pasta: string): Promise<string | null> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !chave) return null;
    const ext = formato === 'image/png' ? 'png' : formato === 'image/webp' ? 'webp' : 'jpg';
    const caminho = `${pasta}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
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

/** Pasta do Storage por tipo de documento. */
const PASTAS: Record<string, string> = { nota_fiscal: 'notas', bem: 'bens', comprovante: 'comprovantes' };

const PROMPTS: Record<string, string> = {
  nota_fiscal: `Você lê a foto de um documento de compra de uma fazenda: DANFE (nota fiscal eletrônica), DACTE (conhecimento de transporte eletrônico, CT-e: o frete cobrado à parte), conta de energia, água ou telefone, recibo ou boleto.
Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem crases, neste formato:
{"legivel": true|false,
 "tipo_documento": "nfe"|"cte"|"conta_consumo"|"recibo"|"boleto"|"outro",
 "emitente": {"nome": string|null, "cnpj_cpf": string|null},
 "destinatario": {"nome": string|null, "cnpj_cpf": string|null},
 "numero": string|null, "serie": string|null, "chave": string|null,
 "codigo_barras": string|null,
 "data_emissao": "aaaa-mm-dd"|null,
 "itens": [{"codigo": string|null, "descricao": string, "unidade": string|null, "quantidade": number|null, "valor_unitario": number|null, "valor_total": number|null, "valor_icms": number|null, "valor_ipi": number|null, "valor_icms_st": number|null, "lote": string|null, "validade": "aaaa-mm-dd"|null}],
 "frete": number|null, "seguro": number|null, "outras_despesas": number|null, "desconto": number|null, "valor_ipi": number|null, "valor_icms_st": number|null, "valor_total": number|null,
 "duplicatas": [{"vencimento": "aaaa-mm-dd", "valor": number}],
 "notas_transportadas": [{"chave": string|null, "numero": string|null}],
 "multa_perc": number|null, "juros_mes_perc": number|null, "juros_dia_valor": number|null,
 "nao_lido": [string]}
Regras:
- Números com ponto decimal (1234.56), sem separador de milhar.
- Boleto ou fatura: "multa_perc" = multa por atraso em % (ex.: "multa de 2%" → 2); "juros_mes_perc" = juros/mora em % ao mês (ex.: "juros de 1% a.m." → 1; "0,033% ao dia" → 1); "juros_dia_valor" = mora em R$ por dia, quando vier assim (ex.: "mora diária R$ 4,12" → 4.12). Ficam null se não estiverem escritos.
- "chave": a chave de acesso de 44 dígitos (NF-e, CT-e, ou NF3e na conta de energia), só os dígitos, e só se estiver inteira e legível.
- "codigo_barras": a linha digitável ou os números do código de barras do pagamento (47 ou 48 dígitos), só os dígitos, e só se estiver inteira e legível.
- Conta de consumo (energia, água, telefone): "numero" = número da fatura/nota; "data_emissao" = data de emissão (ou a leitura atual); os itens são as linhas cobradas (consumo, iluminação pública, multas etc.) com seus valores; "duplicatas" = o vencimento com o valor total a pagar.
- Não invente: o que não conseguir ler fica null e o nome do campo vai em "nao_lido" (em português: "fornecedor", "CNPJ", "número da nota", "data", "itens", "valor total", "vencimentos"). Nunca complete números cortados.
- Lote e validade costumam estar em "informações adicionais" do produto.
- "emitente": quem VENDEU (quadro do alto do DANFE, ao lado do logotipo), nunca o destinatário nem a transportadora. Copie o nome como está escrito e o CNPJ/CPF dígito a dígito; se algum dígito estiver borrado ou duvidoso, "cnpj_cpf" fica null.
- "data_emissao": o campo "DATA DA EMISSÃO" (não a data de saída nem a de vencimento).
- "duplicatas": no DANFE, o quadro "FATURA / DUPLICATA(S)" (cada duplicata com vencimento e valor). Se não houver esse quadro, procure vencimento em "dados adicionais", no boleto ou na fatura. Conta de consumo: a data de vencimento da fatura. NUNCA use a data de emissão como vencimento; sem vencimento escrito, "duplicatas" fica [] e "vencimentos" vai em "nao_lido".
- "numero": o campo "Nº" do quadro do alto do DANFE, com os zeros à esquerda como estão impressos.
- "chave": fica embaixo do código de barras, em 11 grupos de 4 números ("CHAVE DE ACESSO"). Leia com cuidado: é o dado mais importante da nota.
- Itens: cada linha da tabela de produtos é UM item (não repita linhas). "valor_unitario" = coluna V. UNIT./VALOR UNITÁRIO; "valor_total" = coluna V. TOTAL/VALOR TOTAL da linha (não o unitário). Confira: quantidade × valor_unitario ≈ valor_total.
- "destinatario": o quadro DESTINATÁRIO/REMETENTE (quem comprou): nome e CPF/CNPJ dígito a dígito.
- Impostos por item, das colunas da tabela de produtos: "valor_icms" = V. ICMS, "valor_ipi" = V. IPI, "valor_icms_st" = ICMS ST da linha (null se a coluna não existir ou estiver vazia).
- Quadro Cálculo do Imposto: "frete" = VALOR DO FRETE, "seguro" = VALOR DO SEGURO, "desconto" = DESCONTO, "outras_despesas" = OUTRAS DESPESAS ACESSÓRIAS, "valor_ipi" = VALOR DO IPI, "valor_icms_st" = VALOR DO ICMS SUBSTITUIÇÃO.
- "valor_total" da nota = "V. TOTAL DA NOTA" (quadro Cálculo do Imposto). Confira: soma dos itens + frete + seguro + outras despesas + IPI + ICMS-ST − desconto ≈ valor total da nota; se não bater, releia os itens.
- DACTE (o papel traz "DACTE" ou "Documento Auxiliar do Conhecimento de Transporte Eletrônico"): "tipo_documento" = "cte". "emitente" = a TRANSPORTADORA (quadro do alto, ao lado do logotipo). "destinatario" = o TOMADOR DO SERVIÇO (quem paga o frete); se o quadro do tomador não existir, o DESTINATÁRIO. "numero" e "serie" = os do CT-e. "chave" = a chave de acesso do CT-e (embaixo do código de barras). "itens" = UM item só: "descricao": "Frete", "quantidade": 1, "valor_unitario" e "valor_total" = VALOR TOTAL DO SERVIÇO (ou VALOR TOTAL DA PRESTAÇÃO), "valor_icms" = VALOR DO ICMS do quadro de impostos (null se isento ou vazio); os componentes do frete (frete peso, pedágio, etc.) NÃO viram itens. "frete", "seguro", "outras_despesas" e "desconto" ficam null. "valor_total" = VALOR A RECEBER (ou o valor total do serviço). "notas_transportadas" = cada linha do quadro DOCUMENTOS ORIGINÁRIOS: "chave" = a chave de 44 dígitos da NF-e transportada, só os dígitos e só se inteira e legível (senão null); "numero" = o número da nota, se estiver escrito (senão null). Nunca invente chave.
- Em qualquer documento que não seja DACTE, "notas_transportadas" fica [].
- "legivel" é false só se não der para ler quase nada.`,

  comprovante: `Você lê a foto (ou print) de um comprovante de pagamento: boleto pago, Pix, TED/DOC, débito em conta ou recibo.
Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem crases, neste formato:
{"legivel": true|false,
 "tipo": "boleto"|"pix"|"ted"|"debito"|"recibo"|"outro",
 "data_pagamento": "aaaa-mm-dd"|null,
 "valor_pago": number|null,
 "valor_documento": number|null, "juros": number|null, "multa": number|null, "desconto": number|null,
 "beneficiario": {"nome": string|null, "cnpj_cpf": string|null},
 "codigo_barras": string|null,
 "vencimento": "aaaa-mm-dd"|null,
 "autenticacao": string|null,
 "banco": string|null,
 "nao_lido": [string]}
Regras:
- Números com ponto decimal (1234.56), sem separador de milhar.
- "data_pagamento": a data em que o pagamento foi efetivado (não a do vencimento nem a do agendamento).
- "valor_pago": o valor total debitado. "valor_documento", "juros", "multa", "desconto": como aparecem no comprovante de boleto.
- "beneficiario": quem RECEBEU o pagamento (favorecido/cedente/beneficiário), nunca o pagador.
- "codigo_barras": a linha digitável do boleto pago, só os dígitos, se estiver inteira.
- "autenticacao": código de autenticação, ID da transação Pix (E2E) ou número do documento do banco.
- Não invente: o que não conseguir ler fica null e vai em "nao_lido".`,

  bem: `Você lê a foto da nota fiscal (DANFE) da compra de um bem durável de uma fazenda: trator, máquina agrícola, implemento, veículo, equipamento, material de construção de benfeitoria etc.
Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem crases, neste formato:
{"legivel": true|false,
 "emitente": {"nome": string|null, "cnpj_cpf": string|null},
 "numero": string|null, "serie": string|null, "chave": string|null,
 "data_emissao": "aaaa-mm-dd"|null,
 "itens": [{"descricao": string, "quantidade": number|null, "valor_total": number|null,
   "nome_sugerido": string|null, "marca": string|null, "modelo": string|null,
   "ano_fabricacao": string|null, "ano_modelo": string|null,
   "numero_serie": string|null, "chassi": string|null, "placa": string|null, "renavam": string|null,
   "categoria": "tratores"|"maquinas"|"implementos"|"veiculos"|"benfeitorias"|"cercas"|"equipamentos"|"outros"|null}],
 "frete": number|null, "outras_despesas": number|null, "desconto": number|null, "valor_total": number|null,
 "nao_lido": [string]}
Regras:
- Números com ponto decimal (1234.56), sem separador de milhar.
- "chave": a chave de acesso de 44 dígitos, só os dígitos, e só se estiver inteira e legível.
- "nome_sugerido": nome curto do bem para o cadastro, com tipo, marca e modelo (ex.: "Trator John Deere 6100J", "Pulverizador Jacto Condor 800").
- "emitente": quem VENDEU (quadro do alto do DANFE), nunca o destinatário nem a transportadora; CNPJ/CPF dígito a dígito, e null se algum dígito estiver duvidoso.
- "data_emissao": o campo "DATA DA EMISSÃO".
- "chave": embaixo do código de barras, em 11 grupos de 4 números. Leia com cuidado.
- Cada linha da tabela de produtos é um item; "valor_total" = coluna V. TOTAL da linha. Confira: soma dos itens + frete + outras − desconto ≈ "V. TOTAL DA NOTA".
- Série, chassi, placa, renavam e anos costumam estar na descrição do produto ou em "informações adicionais"; copie exatamente, sem completar.
- "categoria": tratores; maquinas (colhedoras, pulverizadores autopropelidos, secadores); implementos (grades, arados, plantadeiras, roçadeiras, carretas, pulverizadores de arrasto); veiculos (carros, caminhonetes, caminhões, motos); benfeitorias (construções); cercas (cercas e currais); equipamentos (bombas, motores, geradores, balanças, ordenhadeiras, irrigação); outros.
- Não invente: o que não conseguir ler fica null e o nome do campo vai em "nao_lido" (em português: "fornecedor", "CNPJ", "número da nota", "data", "itens", "valor total"). Nunca complete números cortados.
- "legivel" é false só se não der para ler quase nada.`,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return resposta({ erro: 'A leitura por foto ainda não está ligada: falta cadastrar a chave da IA (ANTHROPIC_API_KEY) nos Secrets do Supabase.' }, 503);

  let corpo: { tipo?: string; imagem?: string; formato?: string; comprador?: string[] };
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }

  // Teste da chave: só lista os modelos (não gasta crédito).
  if (corpo.tipo === 'teste') {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01' } });
    return resposta({ chave_ok: r.ok, status: r.status });
  }

  // Leitura de verdade: só para usuário logado no app.
  if (papel(req) !== 'authenticated') return resposta({ erro: 'Entre no app para usar a leitura por foto.' }, 401);

  const tipo = corpo.tipo ?? 'nota_fiscal';
  const prompt = PROMPTS[tipo];
  if (!prompt) return resposta({ erro: 'Tipo de documento não suportado.' }, 400);
  if (!corpo.imagem || corpo.imagem.length < 1000) return resposta({ erro: 'Foto não recebida.' }, 400);
  if (corpo.imagem.length > 6_500_000) return resposta({ erro: 'Foto grande demais. Tire de novo, com o papel ocupando a tela.' }, 413);
  const formato = ['image/jpeg', 'image/png', 'image/webp'].includes(corpo.formato ?? '') ? corpo.formato! : 'image/jpeg';
  const comprador = (corpo.comprador ?? []).filter((x) => typeof x === 'string' && /^[\d./-]{11,18}$/.test(x)).slice(0, 10);
  const textoPrompt = comprador.length
    ? `${prompt}\n- O COMPRADOR/PAGADOR (destinatário da nota, tomador do frete, pagador do boleto) é o produtor: CPF/CNPJ ${comprador.join(', ')}. Esses números NUNCA são do emitente nem do beneficiário; se só encontrar esses, deixe o CPF/CNPJ do emitente/beneficiário null.`
    : prompt;

  // Modelo mais preciso para números; se não estiver disponível na conta, volta para o Haiku.
  const chamar = (modelo: string) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: formato, data: corpo.imagem } },
              { type: 'text', text: textoPrompt },
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

  const [r, arquivo] = await Promise.all([lerComFallback(), guardarFoto(corpo.imagem, formato, PASTAS[tipo] ?? tipo)]);
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
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  try {
    const dados = JSON.parse(limpo.slice(ini, fim + 1));
    return resposta({ dados, arquivo, uso: d.usage ?? null, modelo: d.model ?? null });
  } catch {
    return resposta({ dados: { legivel: false, itens: [], nao_lido: ['tudo'] }, arquivo, uso: d.usage ?? null });
  }
});
