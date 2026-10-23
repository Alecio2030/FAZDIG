// Exportação para a contabilidade: monta um arquivo CSV (abre no Excel) com os títulos lançados e os pagamentos e
// recebimentos do período, já com a conta do plano, a fazenda e o centro de custo. Guarda o arquivo e devolve um link temporário.
// Os dados são lidos com o acesso de quem pediu (as regras do banco valem); só a gravação do arquivo usa a chave do servidor.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const eData = (t?: string) => !!t && /^\d{4}-\d{2}-\d{2}$/.test(t);
const eUuid = (t: unknown) => typeof t === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
const dataBR = (t: string | null) => (t && eData(t) ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : '');
const numeroBR = (v: unknown) => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
const campo = (v: unknown) => {
  const s = v == null ? '' : String(v).replace(/\r?\n/g, ' ').trim();
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const TIPO_CONTA: Record<string, string> = { ativo: 'Ativo', passivo: 'Passivo', patrimonio_liquido: 'Patrimônio líquido', receita: 'Receita', despesa: 'Despesa' };

const COLUNAS: [string, (l: any) => string][] = [
  ['Registro', (l) => campo(l.registro)],
  ['Data', (l) => dataBR(l.data)],
  ['Vencimento', (l) => dataBR(l.vencimento)],
  ['Natureza', (l) => campo(l.natureza)],
  ['Valor', (l) => numeroBR(l.valor)],
  ['Código da conta', (l) => campo(l.conta_codigo)],
  ['Conta', (l) => campo(l.conta_nome ?? 'Sem classificação')],
  ['Tipo da conta', (l) => campo(TIPO_CONTA[l.conta_tipo] ?? '')],
  ['Caixa ou banco', (l) => campo(l.banco_caixa)],
  ['Pessoa', (l) => campo(l.pessoa)],
  ['CPF/CNPJ', (l) => campo(l.cpf_cnpj)],
  ['Documento', (l) => campo(l.documento)],
  ['Título nº', (l) => campo(l.titulo)],
  ['Parcela', (l) => campo(l.parcela)],
  ['Histórico', (l) => campo(l.historico)],
  ['Origem', (l) => campo(l.origem)],
  ['Fazenda', (l) => campo(l.fazenda)],
  ['Centro de custo', (l) => campo(l.centro_custo)],
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);
  const autorizacao = req.headers.get('authorization') ?? '';
  if (!autorizacao) return resposta({ erro: 'Entre no app para exportar.' }, 401);

  let c: { fazendas?: unknown[]; de?: string; ate?: string };
  try {
    c = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }
  const fazendas = (Array.isArray(c.fazendas) ? c.fazendas : []).filter(eUuid) as string[];
  if (!fazendas.length) return resposta({ erro: 'Escolha a fazenda.' }, 400);
  if (!eData(c.de) || !eData(c.ate) || c.de! > c.ate!) return resposta({ erro: 'Período inválido.' }, 400);
  if ((Date.parse(c.ate!) - Date.parse(c.de!)) / 86400000 > 1100) return resposta({ erro: 'Período grande demais: exporte até 3 anos de cada vez.' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  // leitura com o acesso do usuário
  const doUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: autorizacao } } });
  const { data: quem, error: eQuem } = await doUsuario.auth.getUser();
  if (eQuem || !quem?.user) return resposta({ erro: 'Entre no app para exportar.' }, 401);

  const { data: linhas, error } = await doUsuario.rpc('exportar_contabilidade', { p_fazendas: fazendas, p_de: c.de, p_ate: c.ate });
  if (error) {
    console.error('rpc', error.message);
    return resposta({ erro: 'Não foi possível ler os lançamentos agora. Tente de novo.' }, 502);
  }
  const lista = (linhas as any[]) ?? [];
  if (!lista.length) return resposta({ linhas: 0 });

  const texto = '﻿' + [COLUNAS.map((x) => x[0]).join(';'), ...lista.map((l) => COLUNAS.map((x) => x[1](l)).join(';'))].join('\r\n') + '\r\n';
  const nome = `contabilidade_${c.de}_a_${c.ate}.csv`;
  const caminho = `exportacoes/${quem.user.id}/${crypto.randomUUID()}/${nome}`;

  const servidor = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error: eUp } = await servidor.storage.from('documentos').upload(caminho, new Blob([texto], { type: 'text/csv; charset=utf-8' }), { contentType: 'text/csv; charset=utf-8' });
  if (eUp) {
    console.error('upload', eUp.message);
    return resposta({ erro: 'Não foi possível guardar o arquivo. Tente de novo.' }, 502);
  }
  const { data: link, error: eLink } = await servidor.storage.from('documentos').createSignedUrl(caminho, 3600, { download: nome });
  if (eLink || !link?.signedUrl) return resposta({ erro: 'Arquivo gerado, mas o link não pôde ser criado. Tente de novo.' }, 502);

  const conta = (r: string) => lista.filter((l) => l.registro === r).length;
  return resposta({ linhas: lista.length, lancados: conta('Lançado'), pagos: conta('Pago'), recebidos: conta('Recebido'), sem_conta: lista.filter((l) => !l.conta_codigo).length, arquivo: nome, link: link.signedUrl });
});
