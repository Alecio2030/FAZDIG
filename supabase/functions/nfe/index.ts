// V156: NF-e de produtor rural, etapa 1.
//  - "certificado": recebe o certificado A1 (.pfx) e a senha, confere, e guarda cifrado para a fazenda.
//  - "testar": consulta o Status do Serviço na Sefaz com o certificado da fazenda (prova que a comunicação funciona).
// Só o Produtor e o Administrador usam. O certificado nunca volta para o app.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { lerCertificado } from './certificado.ts';
import { cifrar, decifrar } from './cifra.ts';
import { CODIGO_UF, campo, enviarSoap, urlServico } from './sefaz.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const URL_PROJETO = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_PROJETO, SERVICO, { auth: { persistSession: false } });

const soNumeros = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const deB64 = (s: string) => Uint8Array.from(atob(s.replace(/^data:[^,]*,/, '')), (c) => c.charCodeAt(0));

async function fazendaDa(fazendaId: string) {
  const { data, error } = await admin.from('fazendas').select('id, nome, uf, cpf_cnpj, inscricao_estadual, tipo, ativa').eq('id', fazendaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.tipo === 'particular') throw new Error('Fazenda não encontrada.');
  return data;
}

async function enviarCertificado(fazendaId: string, pfxB64: string, senha: string, userId: string) {
  if (!pfxB64) throw new Error('Escolha o arquivo do certificado (.pfx ou .p12).');
  if (!senha) throw new Error('Informe a senha do certificado.');
  const faz = await fazendaDa(fazendaId);
  const pfx = deB64(pfxB64);
  if (pfx.length > 60000) throw new Error('Arquivo grande demais para um certificado A1. Confira se escolheu o arquivo certo.');
  const cert = lerCertificado(pfx, senha);
  const agora = new Date();
  if (cert.validoAte <= agora) throw new Error(`Este certificado venceu em ${cert.validoAte.toLocaleDateString('pt-BR')}. Renove o certificado A1 e envie o novo.`);
  if (cert.validoDe > agora) throw new Error(`Este certificado só passa a valer em ${cert.validoDe.toLocaleDateString('pt-BR')}.`);

  const { error: e1 } = await admin.from('nfe_certificados').upsert({
    fazenda_id: fazendaId,
    pfx_cifrado: await cifrar(pfx),
    senha_cifrada: await cifrar(new TextEncoder().encode(senha)),
    updated_at: agora.toISOString(),
  });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await admin.from('nfe_config').upsert({
    fazenda_id: fazendaId,
    cert_titular: cert.titular,
    cert_documento: cert.documento,
    cert_validade: cert.validoAte.toISOString(),
    cert_carregado_em: agora.toISOString(),
    cert_carregado_por: userId,
    updated_at: agora.toISOString(),
  });
  if (e2) throw new Error(e2.message);

  const avisos: string[] = [];
  const docFazenda = soNumeros(faz.cpf_cnpj);
  if (!docFazenda) avisos.push('A fazenda está sem CPF/CNPJ no cadastro: preencha em Mais › Fazendas.');
  else if (cert.documento && cert.documento !== docFazenda) {
    avisos.push(`O certificado é do documento ${cert.documento}, mas a fazenda está cadastrada com ${docFazenda}. A Sefaz só aceita a nota se forem o mesmo.`);
  }
  if (!soNumeros(faz.inscricao_estadual)) avisos.push('A fazenda está sem Inscrição Estadual no cadastro: preencha em Mais › Fazendas.');
  const dias = Math.floor((cert.validoAte.getTime() - agora.getTime()) / 86400000);
  if (dias <= 30) avisos.push(`O certificado vence em ${dias} dia(s). Providencie a renovação.`);

  return { titular: cert.titular, documento: cert.documento, validade: cert.validoAte.toISOString(), avisos };
}

async function testar(fazendaId: string) {
  const faz = await fazendaDa(fazendaId);
  const { data: cfg } = await admin.from('nfe_config').select('ambiente').eq('fazenda_id', fazendaId).maybeSingle();
  const { data: guardado } = await admin.from('nfe_certificados').select('pfx_cifrado, senha_cifrada').eq('fazenda_id', fazendaId).maybeSingle();
  if (!guardado) throw new Error('Envie primeiro o certificado A1 desta fazenda.');
  const ambiente = (cfg?.ambiente === 1 ? 1 : 2) as 1 | 2;
  const uf = (faz.uf ?? '').toUpperCase();
  const cUF = CODIGO_UF[uf];
  if (!cUF) throw new Error('A fazenda está sem o estado (UF) no cadastro.');

  const cert = lerCertificado(await decifrar(guardado.pfx_cifrado), new TextDecoder().decode(await decifrar(guardado.senha_cifrada)));
  const corpo = `<consStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${ambiente}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;
  const xml = await enviarSoap(urlServico(uf, ambiente, 'status'), 'status', corpo, cert.certPem, cert.chavePem);
  const cStat = campo(xml, 'cStat');
  const xMotivo = campo(xml, 'xMotivo') ?? 'Resposta da Sefaz sem motivo.';
  await admin.from('nfe_config').upsert({
    fazenda_id: fazendaId,
    ultimo_teste_em: new Date().toISOString(),
    ultimo_teste_cstat: cStat,
    ultimo_teste_motivo: xMotivo,
    updated_at: new Date().toISOString(),
  });
  return { ok: cStat === '107', cStat, motivo: xMotivo, ambiente };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const autorizacao = req.headers.get('Authorization') ?? '';
  const usuario = createClient(URL_PROJETO, ANON, { global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false } });
  const { data: quem } = await usuario.auth.getUser();
  if (!quem?.user) return resposta({ erro: 'Entre no app para configurar a nota fiscal.' }, 401);
  const { data: pode } = await usuario.rpc('nfe_pode_configurar');
  if (pode !== true) return resposta({ erro: 'Só o Produtor ou o Administrador configuram a nota fiscal.' }, 403);

  let corpo: { acao?: string; fazenda_id?: string; pfx?: string; senha?: string };
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }
  if (!corpo.fazenda_id) return resposta({ erro: 'Escolha a fazenda.' }, 400);

  try {
    if (corpo.acao === 'certificado') return resposta(await enviarCertificado(corpo.fazenda_id, corpo.pfx ?? '', corpo.senha ?? '', quem.user.id));
    if (corpo.acao === 'testar') return resposta(await testar(corpo.fazenda_id));
    return resposta({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return resposta({ erro: String((e as Error)?.message ?? e) }, 422);
  }
});
