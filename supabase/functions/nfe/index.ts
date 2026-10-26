// NF-e de produtor rural.
// V156 (etapa 1): "certificado" (envia o A1 da fazenda) e "testar" (Status do Serviço na Sefaz) — Produtor/Administrador.
// V157 (etapa 2): "previa" (dados da venda para conferir), "emitir", "consultar", "cancelar", "danfe" e "xml".
// O certificado nunca volta para o app.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { lerCertificado } from './certificado.ts';
import { cifrar, decifrar } from './cifra.ts';
import { CODIGO_UF, campo, enviarSoap, urlServico } from './sefaz.ts';
import { cancelar, consultar, danfe, emitir, previa, xmlDa, type NotaConferencia } from './emissao.ts';

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

type Corpo = { acao?: string; fazenda_id?: string; pfx?: string; senha?: string; venda_id?: string; nota_id?: string; nota?: NotaConferencia; justificativa?: string };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const autorizacao = req.headers.get('Authorization') ?? '';
  const usuario = createClient(URL_PROJETO, ANON, { global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false } });
  const { data: quem } = await usuario.auth.getUser();
  if (!quem?.user) return resposta({ erro: 'Entre no app para usar a nota fiscal.' }, 401);

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }

  // de qual fazenda é o pedido (pela venda ou pela nota), para conferir o acesso de quem pediu
  async function fazendaDoPedido(): Promise<string> {
    if (corpo.fazenda_id) return corpo.fazenda_id;
    if (corpo.venda_id) {
      const { data } = await admin.from('vendas').select('fazenda_id').eq('id', corpo.venda_id).maybeSingle();
      if (data?.fazenda_id) return data.fazenda_id;
      throw new Error('Venda não encontrada.');
    }
    if (corpo.nota_id) {
      const { data } = await admin.from('nfe_notas').select('fazenda_id').eq('id', corpo.nota_id).maybeSingle();
      if (data?.fazenda_id) return data.fazenda_id;
      throw new Error('Nota não encontrada.');
    }
    throw new Error('Escolha a fazenda.');
  }
  const chefe = async () => (await usuario.rpc('nfe_pode_configurar')).data === true;

  try {
    const fid = await fazendaDoPedido();
    const acao = corpo.acao ?? '';
    if (acao === 'certificado' || acao === 'testar') {
      if (!(await chefe())) return resposta({ erro: 'Só o Produtor ou o Administrador configuram a nota fiscal.' }, 403);
      if (acao === 'certificado') return resposta(await enviarCertificado(fid, corpo.pfx ?? '', corpo.senha ?? '', quem.user.id));
      return resposta(await testar(fid));
    }
    // emitir, consultar, DANFE e XML: quem tem acesso à fazenda
    const { data: temAcesso } = await usuario.rpc('acesso_fazenda', { fid });
    if (temAcesso !== true) return resposta({ erro: 'Sem acesso a esta fazenda.' }, 403);
    if (acao === 'previa') return resposta(await previa(admin, corpo.venda_id!));
    if (acao === 'emitir') {
      if (!corpo.venda_id || !corpo.nota) return resposta({ erro: 'Pedido incompleto.' }, 400);
      return resposta(await emitir(admin, corpo.venda_id, corpo.nota, quem.user.id));
    }
    if (acao === 'consultar') return resposta(await consultar(admin, corpo.nota_id!));
    if (acao === 'danfe') return resposta(await danfe(admin, corpo.nota_id!));
    if (acao === 'xml') return resposta(await xmlDa(admin, corpo.nota_id!));
    if (acao === 'cancelar') {
      // cancelar: o Produtor, o Administrador ou quem tem acesso completo à fazenda
      const { data: completo } = await usuario.rpc('acesso_completo', { fid });
      if (!(await chefe()) && completo !== true) return resposta({ erro: 'Só o Produtor, o Administrador ou quem tem acesso completo cancela a nota.' }, 403);
      return resposta(await cancelar(admin, corpo.nota_id!, corpo.justificativa ?? ''));
    }
    return resposta({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return resposta({ erro: String((e as Error)?.message ?? e) }, 422);
  }
});
