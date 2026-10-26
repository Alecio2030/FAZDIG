// V157: emissão da NF-e de venda: prévia para conferência, emissão, consulta, cancelamento, DANFE e XML.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { lerCertificado } from './certificado.ts';
import { decifrar } from './cifra.ts';
import { CODIGO_UF, campo, enviarSoap, urlServico } from './sefaz.ts';
import { municipio } from './ibge.ts';
import { assinar } from './assinatura.ts';
import { montarEnvEvento, montarEvento, montarInfEventoCancelamento } from './eventos.ts';
import { gerarDanfe } from './danfe.ts';
import { NS_NFE, codigoNumerico, montarChave, montarInfNFe, soNumeros, totais, type DadosNota, type ItemNota, type Transporte } from './xml.ts';

// ---------- o que a tela de conferência recebe e devolve ----------
export type NotaConferencia = {
  natureza: string;
  dest: {
    doc: string; nome: string; ie: string; email: string; telefone: string;
    logradouro: string; numero: string; complemento: string; bairro: string; cep: string; municipio: string; uf: string;
  };
  itens: (Omit<ItemNota, 'quantidade' | 'valor_total' | 'quantidade_trib' | 'aliquota_icms' | 'reducao_bc'> & {
    quantidade: number; valor_total: number; quantidade_trib: number; aliquota_icms: number; reducao_bc: number;
  })[];
  transporte: Transporte;
  pagamento: { indicador: 0 | 1; tipo: string; descricao?: string | null };
  gta: { numero: string; serie: string; uf: string } | null;
  info_complementar: string;
};

const um = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const moeda = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Agora, no horário de Brasília, no formato da NF-e. */
export function agoraBrasilia(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 19) + '-03:00';
}
const PAG: Record<string, string> = { dinheiro: '01', especie: '01', cheque: '02', boleto: '15', deposito: '16', pix: '17', transferencia: '18', ted: '18', doc: '18' };

// ---------- leitura do banco ----------
async function lerVenda(admin: SupabaseClient, vendaId: string) {
  const { data, error } = await admin
    .from('vendas')
    .select(
      'id, numero, tipo, data, fazenda_id, valor_bruto, funrural_valor, cabecas, peso_bruto_kg, peso_liquido_kg, forma_pagamento, numero_documento, pessoa_faturamento_id,' +
        ' pessoa:pessoas ( nome, tipo_pessoa, cpf_cnpj, rg_ie, email, telefone, celular, logradouro, numero, complemento, bairro, cep, municipio, uf ),' +
        ' faturamento:pessoas_faturamento ( nome_fazenda, inscricao_estadual, logradouro, numero, complemento, bairro, cep, municipio, uf ),' +
        ' itens:venda_itens ( tipo_item, descricao, quantidade, unidade, valor_total, cafe:cafe_lotes ( numero, especie, tipo, peneira ), insumo:insumos ( nome, codigo ) ),' +
        ' parcelas:lancamentos ( data_vencimento )',
    )
    .eq('id', vendaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Venda não encontrada.');
  return data as any;
}

async function lerConfig(admin: SupabaseClient, fazendaId: string) {
  const { data: cfg } = await admin.from('nfe_config').select('*').eq('fazenda_id', fazendaId).maybeSingle();
  if (!cfg?.cert_validade) throw new Error('Esta fazenda ainda não tem o certificado A1: configure em Mais › Nota fiscal (NF-e).');
  if (new Date(cfg.cert_validade) < new Date()) throw new Error('O certificado A1 desta fazenda venceu: envie o novo em Mais › Nota fiscal (NF-e).');
  return cfg;
}

async function lerCertificadoDa(admin: SupabaseClient, fazendaId: string) {
  const { data } = await admin.from('nfe_certificados').select('pfx_cifrado, senha_cifrada').eq('fazenda_id', fazendaId).maybeSingle();
  if (!data) throw new Error('Esta fazenda ainda não tem o certificado A1.');
  return lerCertificado(await decifrar(data.pfx_cifrado), new TextDecoder().decode(await decifrar(data.senha_cifrada)));
}

/** Emitente (a fazenda), com o código IBGE do município. Endereço rural em branco vira "Zona Rural". */
async function emitenteDa(admin: SupabaseClient, fazendaId: string, crt: number) {
  const { data: f } = await admin
    .from('fazendas')
    .select('nome, razao_social, cpf_cnpj, inscricao_estadual, logradouro, numero, complemento, bairro, cep, municipio, uf')
    .eq('id', fazendaId)
    .maybeSingle();
  if (!f) throw new Error('Fazenda não encontrada.');
  const falta = [!soNumeros(f.cpf_cnpj) && 'CPF/CNPJ', !soNumeros(f.inscricao_estadual) && 'Inscrição Estadual', !f.municipio && 'município', !f.uf && 'UF', soNumeros(f.cep).length !== 8 && 'CEP (8 números; na zona rural, o CEP geral do município)'].filter(Boolean);
  if (falta.length) throw new Error(`Falta no cadastro da fazenda (Mais › Fazendas): ${falta.join(', ')}.`);
  const m = await municipio(f.municipio, f.uf, 'Fazenda');
  return {
    doc: soNumeros(f.cpf_cnpj),
    nome: f.razao_social || f.nome,
    fantasia: f.razao_social ? f.nome : null,
    ie: soNumeros(f.inscricao_estadual),
    crt,
    endereco: {
      logradouro: f.logradouro || f.nome,
      numero: f.numero || 'SN',
      complemento: f.complemento,
      bairro: f.bairro || 'Zona Rural',
      codigo_municipio: m.codigo,
      municipio: m.nome,
      uf: String(f.uf).toUpperCase(),
      cep: f.cep,
    },
  };
}

// ---------- prévia para conferência ----------
export async function previa(admin: SupabaseClient, vendaId: string) {
  const v = await lerVenda(admin, vendaId);
  const { data: notas } = await admin
    .from('nfe_notas')
    .select('id, numero, serie, ambiente, situacao, chave, motivo, created_at, dados')
    .eq('venda_id', vendaId)
    .order('created_at', { ascending: false });
  const cfg = await lerConfig(admin, v.fazenda_id);
  const { data: faz } = await admin.from('fazendas').select('uf').eq('id', v.fazenda_id).maybeSingle();
  const ufEmit = String(faz?.uf ?? '').toUpperCase();

  // se já houve tentativa rejeitada, volta com o que foi conferido da última vez
  const ultima = (notas ?? []).find((n: any) => n.situacao === 'rejeitada' && n.ambiente === cfg.ambiente);
  if (ultima?.dados?.conferencia) return { nota: ultima.dados.conferencia as NotaConferencia, notas: notas ?? [], ambiente: cfg.ambiente, crt: cfg.crt, ultimo_erro: ultima.motivo };

  const p = um(v.pessoa) ?? {};
  const fat = um(v.faturamento);
  const end = fat ?? p;
  const ufDest = String(end.uf ?? '').toUpperCase();
  const destino = ufDest && ufEmit && ufDest !== ufEmit ? 'interestadual' : 'interna';
  const produto = v.tipo === 'cafe' ? 'cafe' : v.tipo === 'animais' ? 'bovinos' : 'outros';
  const { data: regra } = await admin.from('nfe_regras').select('*').eq('produto', produto).eq('destino', destino).maybeSingle();
  if (!regra) throw new Error('Falta a tributação padrão (rode o banco da V157).');
  const base = {
    ncm: regra.ncm === '00000000' ? '' : regra.ncm,
    cfop: regra.cfop,
    cst_icms: cfg.crt === 1 ? '102' : regra.cst_icms,
    aliquota_icms: Number(regra.aliquota_icms) || 0,
    reducao_bc: Number(regra.reducao_bc) || 0,
    cst_pis: regra.cst_pis,
    cst_cofins: regra.cst_cofins,
  };

  const itens: NotaConferencia['itens'] = [];
  let volumes: Transporte['volumes'] = null;
  if (v.tipo === 'animais') {
    const cab = Number(v.cabecas) || 0;
    itens.push({ ...base, codigo: 'BOV', descricao: `Bovinos - ${cab} ${cab === 1 ? 'cabeça' : 'cabeças'}`, unidade: 'CAB', quantidade: cab, valor_total: r2(v.valor_bruto), unidade_trib: 'UN', quantidade_trib: cab, info: v.peso_bruto_kg ? `Peso bruto ${Number(v.peso_bruto_kg).toLocaleString('pt-BR')} kg` : null });
    volumes = { quantidade: cab, especie: 'Cabeças', peso_bruto: Number(v.peso_bruto_kg) || null, peso_liquido: Number(v.peso_liquido_kg ?? v.peso_bruto_kg) || null };
  } else {
    let sacas = 0;
    for (const it of v.itens ?? []) {
      const cafe = um(it.cafe);
      const ins = um(it.insumo);
      if (it.tipo_item === 'cafe') {
        const q = Number(it.quantidade) || 0;
        sacas += q;
        const desc = ['Café', cafe?.especie, 'cru em grão', cafe?.tipo ? `tipo ${cafe.tipo}` : '', cafe?.peneira ? `peneira ${cafe.peneira}` : ''].filter(Boolean).join(' ');
        itens.push({ ...base, codigo: 'CAFE', descricao: desc, unidade: 'SC', quantidade: q, valor_total: r2(it.valor_total), unidade_trib: 'KG', quantidade_trib: r2(q * 60), info: cafe?.numero ? `Lote ${cafe.numero} - sacas de 60 kg` : 'Sacas de 60 kg' });
      } else {
        const q = Number(it.quantidade) || 1;
        const un = String(it.unidade || 'UN').toUpperCase().slice(0, 6);
        itens.push({ ...base, codigo: ins?.codigo ? String(ins.codigo) : 'PROD', descricao: it.descricao || ins?.nome || 'Produto', unidade: un, quantidade: q, valor_total: r2(it.valor_total), unidade_trib: un, quantidade_trib: q, info: null });
      }
    }
    if (sacas > 0) volumes = { quantidade: sacas, especie: 'Sacas', peso_liquido: r2(sacas * 60), peso_bruto: r2(sacas * 60) };
  }

  const aPrazo = (v.parcelas ?? []).some((x: any) => x.data_vencimento && x.data_vencimento > v.data) || (v.parcelas ?? []).length > 1;
  const textos = [regra.texto_legal, Number(v.funrural_valor) > 0 ? `FUNRURAL retido pelo adquirente: R$ ${moeda(v.funrural_valor)}.` : '', `Venda nº ${v.numero}.`].filter(Boolean);

  const nota: NotaConferencia = {
    natureza: regra.natureza,
    dest: {
      doc: soNumeros(p.cpf_cnpj),
      nome: p.nome ?? '',
      ie: fat?.inscricao_estadual || (p.tipo_pessoa === 'J' ? p.rg_ie ?? '' : ''),
      email: p.email ?? '',
      telefone: p.celular || p.telefone || '',
      logradouro: end.logradouro ?? '',
      numero: end.numero ?? '',
      complemento: end.complemento ?? '',
      bairro: end.bairro ?? '',
      cep: end.cep ?? '',
      municipio: end.municipio ?? '',
      uf: ufDest,
    },
    itens,
    transporte: { modalidade: '9', transportadora: null, placa: '', uf_placa: '', volumes },
    pagamento: { indicador: aPrazo ? 1 : 0, tipo: PAG[String(v.forma_pagamento ?? '').toLowerCase()] ?? '99', descricao: null },
    gta: v.tipo === 'animais' ? { numero: '', serie: '', uf: ufEmit } : null,
    info_complementar: textos.join(' '),
  };
  return { nota, notas: notas ?? [], ambiente: cfg.ambiente, crt: cfg.crt, ultimo_erro: null };
}

// ---------- conferência dos dados antes de enviar ----------
function validar(n: NotaConferencia, crt: number, produtoGado: boolean, ufEmitente: string): string[] {
  const e: string[] = [];
  const doc = soNumeros(n.dest.doc);
  if (doc.length !== 11 && doc.length !== 14) e.push('CPF ou CNPJ do comprador inválido.');
  if (!n.dest.nome?.trim()) e.push('Nome do comprador.');
  if (!n.dest.logradouro?.trim()) e.push('Endereço do comprador.');
  if (!n.dest.bairro?.trim()) e.push('Bairro do comprador (no campo, use "Zona Rural").');
  if (!n.dest.municipio?.trim() || !n.dest.uf?.trim()) e.push('Município e UF do comprador.');
  if (!n.natureza?.trim()) e.push('Natureza da operação.');
  if (!n.itens.length) e.push('A nota precisa de pelo menos um item.');
  n.itens.forEach((it, i) => {
    const k = `Item ${i + 1}`;
    if (!/^\d{8}$/.test(soNumeros(it.ncm)) || soNumeros(it.ncm) === '00000000') e.push(`${k}: NCM (8 números).`);
    if (!/^[1-7]\d{3}$/.test(soNumeros(it.cfop))) e.push(`${k}: CFOP (4 números).`);
    if (!(it.quantidade > 0) || !(it.quantidade_trib > 0)) e.push(`${k}: quantidade.`);
    if (!(it.valor_total > 0)) e.push(`${k}: valor.`);
    if (!it.descricao?.trim()) e.push(`${k}: descrição.`);
    const simples = ['102', '300', '400'].includes(it.cst_icms);
    if (crt === 1 && !simples) e.push(`${k}: no Simples Nacional use CSOSN 102, 300 ou 400.`);
    if (crt !== 1 && simples) e.push(`${k}: no regime normal use o CST (00, 20, 40, 41, 51 ou 90).`);
    if (['00', '20'].includes(it.cst_icms) && !(it.aliquota_icms > 0)) e.push(`${k}: alíquota do ICMS.`);
  });
  if (produtoGado && !n.gta?.numero?.trim()) e.push('Número da GTA (a nota de gado leva a GTA).');
  // dentro do estado o CFOP começa com 5; para outro estado, com 6
  const interestadual = !!ufEmitente && n.dest.uf?.toUpperCase() !== ufEmitente;
  n.itens.forEach((it, i) => {
    const d = soNumeros(it.cfop)[0];
    if (interestadual && d === '5') e.push(`Item ${i + 1}: comprador de outro estado, o CFOP começa com 6.`);
    if (!interestadual && d === '6') e.push(`Item ${i + 1}: comprador do mesmo estado, o CFOP começa com 5.`);
  });
  const ie = String(n.dest.ie ?? '').trim();
  if (interestadual && !ie) e.push('Venda para outro estado a quem não tem Inscrição Estadual (consumidor final) exige o ICMS do estado de destino (DIFAL), que o sistema ainda não calcula. Informe a IE do comprador ou "ISENTO", se for o caso.');
  return e;
}

function infCompleta(n: NotaConferencia): string {
  const gta = n.gta?.numero?.trim() ? `GTA nº ${n.gta.numero.trim()}${n.gta.serie?.trim() ? ` série ${n.gta.serie.trim()}` : ''}${n.gta.uf ? `/${n.gta.uf}` : ''}.` : '';
  return [gta, n.info_complementar?.trim()].filter(Boolean).join(' ');
}

// ---------- emissão ----------
export async function emitir(admin: SupabaseClient, vendaId: string, conf: NotaConferencia, userId: string) {
  const v = await lerVenda(admin, vendaId);
  const cfg = await lerConfig(admin, v.fazenda_id);
  const ambiente = (cfg.ambiente === 1 ? 1 : 2) as 1 | 2;
  const { data: fz } = await admin.from('fazendas').select('uf').eq('id', v.fazenda_id).maybeSingle();
  const erros = validar(conf, cfg.crt, v.tipo === 'animais' && ambiente === 1, String(fz?.uf ?? '').toUpperCase());
  if (erros.length) throw new Error(`Confira antes de emitir: ${erros.join(' ')}`);

  const { data: anteriores } = await admin.from('nfe_notas').select('*').eq('venda_id', vendaId).order('created_at', { ascending: false });
  if ((anteriores ?? []).some((n: any) => n.situacao === 'autorizada' && n.ambiente === ambiente)) throw new Error('Esta venda já tem NF-e autorizada.');
  const pendente = (anteriores ?? []).find((n: any) => n.situacao === 'enviando' && n.ambiente === ambiente);
  if (pendente) {
    // uma tentativa ficou sem resposta: primeiro pergunta à Sefaz como ela ficou
    const r = await consultar(admin, pendente.id);
    if (r.situacao === 'autorizada') return r;
    if (r.situacao === 'denegada') throw new Error(`A Sefaz denegou a nota nº ${pendente.numero}: ${r.motivo}`);
    pendente.situacao = r.situacao;
  }
  const reaproveitar = (anteriores ?? []).find((n: any) => ['rejeitada', 'rascunho', 'enviando'].includes(n.situacao) && n.ambiente === ambiente && n.serie === cfg.serie);

  const emitente = await emitenteDa(admin, v.fazenda_id, cfg.crt);
  const mDest = await municipio(conf.dest.municipio, conf.dest.uf, 'Comprador');
  const cert = await lerCertificadoDa(admin, v.fazenda_id);

  let numero: number;
  let notaId: string;
  if (reaproveitar) {
    numero = reaproveitar.numero;
    notaId = reaproveitar.id;
  } else {
    const { data: res, error } = await admin.rpc('nfe_reservar_numero', { p_fazenda: v.fazenda_id });
    if (error || !res?.[0]) throw new Error('Não foi possível reservar o número da nota.');
    numero = res[0].numero;
    const { data: nova, error: e2 } = await admin
      .from('nfe_notas')
      .insert({ fazenda_id: v.fazenda_id, venda_id: vendaId, ambiente, serie: cfg.serie, numero, situacao: 'rascunho', created_by: userId })
      .select('id')
      .single();
    if (e2) throw new Error(e2.message);
    notaId = nova.id;
  }

  const dados: DadosNota = {
    ambiente,
    uf: emitente.endereco.uf,
    codigo_uf: CODIGO_UF[emitente.endereco.uf],
    serie: cfg.serie,
    numero,
    codigo_numerico: codigoNumerico(numero),
    emissao: agoraBrasilia(),
    natureza: conf.natureza,
    emitente,
    destinatario: {
      doc: soNumeros(conf.dest.doc),
      nome: conf.dest.nome,
      ie: conf.dest.ie,
      email: conf.dest.email || null,
      endereco: {
        logradouro: conf.dest.logradouro,
        numero: conf.dest.numero || 'SN',
        complemento: conf.dest.complemento || null,
        bairro: conf.dest.bairro,
        codigo_municipio: mDest.codigo,
        municipio: mDest.nome,
        uf: conf.dest.uf.toUpperCase(),
        cep: conf.dest.cep,
        telefone: conf.dest.telefone,
      },
    },
    itens: conf.itens.map((it) => ({ ...it, ncm: soNumeros(it.ncm), cfop: soNumeros(it.cfop) })),
    transporte: conf.transporte,
    pagamento: conf.pagamento,
    info_complementar: infCompleta(conf),
  };
  if (!dados.codigo_uf) throw new Error('UF da fazenda inválida.');
  const chave = montarChave(dados);
  const inf = montarInfNFe(dados, chave);
  const nfe = `<NFe xmlns="${NS_NFE}">${inf}${await assinar(inf, cert.certPem, cert.chavePem)}</NFe>`;
  const s = totais(dados.itens);

  await admin
    .from('nfe_notas')
    .update({
      situacao: 'enviando', chave, valor: s.vNF, dest_nome: conf.dest.nome, dest_doc: soNumeros(conf.dest.doc),
      dados: { ...dados, conferencia: conf }, xml: nfe, cstat: null, motivo: null, updated_at: new Date().toISOString(),
    })
    .eq('id', notaId);

  const lote = `<enviNFe xmlns="${NS_NFE}" versao="4.00"><idLote>${Date.now()}</idLote><indSinc>1</indSinc>${nfe}</enviNFe>`;
  let resp: string;
  try {
    resp = await enviarSoap(urlServico(dados.uf, ambiente, 'autorizacao'), 'autorizacao', lote, cert.certPem, cert.chavePem);
  } catch (e) {
    // sem resposta: a nota fica "enviando" e a próxima tentativa consulta antes de mandar de novo
    throw new Error(`${(e as Error).message} A nota nº ${numero} ficou pendente: toque em Emitir de novo ou em Consultar na Sefaz.`);
  }
  return await registrarRetorno(admin, notaId, nfe, resp, vendaId);
}

/** Lê a resposta da autorização (ou da consulta) e grava a situação da nota. */
async function registrarRetorno(admin: SupabaseClient, notaId: string, nfe: string, resp: string, vendaId?: string | null) {
  const prot = resp.match(/<protNFe[\s\S]*?<\/protNFe>/)?.[0] ?? null;
  const fonte = prot ?? resp;
  const cStat = campo(fonte, 'cStat') ?? '';
  const motivo = campo(fonte, 'xMotivo') ?? 'Sem resposta da Sefaz.';
  const agora = new Date().toISOString();
  if (prot && ['100', '150'].includes(cStat)) {
    const protocolo = campo(prot, 'nProt');
    const dh = campo(prot, 'dhRecbto');
    const nfeProc = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NS_NFE}" versao="4.00">${nfe}${prot.replace(/^<protNFe(?![^>]*xmlns=)/, `<protNFe xmlns="${NS_NFE}"`)}</nfeProc>`;
    const { data: n } = await admin
      .from('nfe_notas')
      .update({ situacao: 'autorizada', cstat: cStat, motivo, protocolo, autorizada_em: dh ? new Date(dh).toISOString() : agora, xml: nfeProc, updated_at: agora })
      .eq('id', notaId)
      .select('id, numero, serie, chave, protocolo, venda_id')
      .single();
    const venda = vendaId ?? n?.venda_id;
    if (venda) {
      // o número da nota passa a ser o documento da venda, se ela ainda não tinha
      await admin.from('vendas').update({ numero_documento: `NF-e ${n?.numero}` }).eq('id', venda).is('numero_documento', null);
    }
    return { situacao: 'autorizada', id: notaId, numero: n?.numero, chave: n?.chave, protocolo, motivo };
  }
  const denegada = ['110', '301', '302', '303', '304', '305', '306'].includes(cStat);
  await admin
    .from('nfe_notas')
    .update({ situacao: denegada ? 'denegada' : 'rejeitada', cstat: cStat, motivo, updated_at: agora })
    .eq('id', notaId);
  return { situacao: denegada ? 'denegada' : 'rejeitada', id: notaId, cStat, motivo };
}

// ---------- consulta na Sefaz ----------
export async function consultar(admin: SupabaseClient, notaId: string) {
  const { data: n } = await admin.from('nfe_notas').select('*').eq('id', notaId).maybeSingle();
  if (!n?.chave) throw new Error('Nota sem chave de acesso (não chegou a ser montada).');
  const cert = await lerCertificadoDa(admin, n.fazenda_id);
  const uf = n.dados?.uf ?? 'ES';
  const corpo = `<consSitNFe xmlns="${NS_NFE}" versao="4.00"><tpAmb>${n.ambiente}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${n.chave}</chNFe></consSitNFe>`;
  const resp = await enviarSoap(urlServico(uf, n.ambiente, 'consulta'), 'consulta', corpo, cert.certPem, cert.chavePem);
  const cStat = campo(resp, 'cStat') ?? '';
  if (n.situacao === 'autorizada' || n.situacao === 'cancelada') {
    return { situacao: n.situacao, id: n.id, cStat, motivo: campo(resp, 'xMotivo') };
  }
  if (cStat === '217') {
    // a Sefaz não conhece a chave: a tentativa não chegou lá; pode emitir de novo
    await admin.from('nfe_notas').update({ situacao: 'rejeitada', cstat: cStat, motivo: 'A Sefaz não recebeu esta nota. Pode emitir de novo.', updated_at: new Date().toISOString() }).eq('id', n.id);
    return { situacao: 'rejeitada', id: n.id, cStat, motivo: 'A Sefaz não recebeu esta nota. Pode emitir de novo.' };
  }
  const nfe = String(n.xml ?? '').match(/<NFe[\s\S]*<\/NFe>/)?.[0] ?? '';
  return await registrarRetorno(admin, n.id, nfe, resp, n.venda_id);
}

// ---------- cancelamento ----------
export async function cancelar(admin: SupabaseClient, notaId: string, justificativa: string) {
  const j = String(justificativa ?? '').replace(/\s+/g, ' ').trim();
  if (j.length < 15) throw new Error('Escreva o motivo do cancelamento com pelo menos 15 letras.');
  const { data: n } = await admin.from('nfe_notas').select('*').eq('id', notaId).maybeSingle();
  if (!n) throw new Error('Nota não encontrada.');
  if (n.situacao !== 'autorizada') throw new Error('Só se cancela nota autorizada.');
  const cert = await lerCertificadoDa(admin, n.fazenda_id);
  const uf = n.dados?.uf ?? 'ES';
  const inf = montarInfEventoCancelamento({
    codigoUf: CODIGO_UF[uf],
    ambiente: n.ambiente,
    docEmitente: n.dados?.emitente?.doc ?? '',
    chave: n.chave,
    protocolo: n.protocolo,
    justificativa: j,
    quando: agoraBrasilia(),
  });
  const evento = montarEvento(inf + (await assinar(inf, cert.certPem, cert.chavePem)));
  const resp = await enviarSoap(urlServico(uf, n.ambiente, 'evento'), 'evento', montarEnvEvento(String(Date.now()), evento), cert.certPem, cert.chavePem);
  const ret = resp.match(/<retEvento[\s\S]*?<\/retEvento>/)?.[0] ?? resp;
  const cStat = campo(ret, 'cStat') ?? '';
  const motivo = campo(ret, 'xMotivo') ?? 'Sem resposta da Sefaz.';
  if (!['135', '155'].includes(cStat)) throw new Error(`A Sefaz não cancelou (${cStat}): ${motivo}`);
  const proc = `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="${NS_NFE}" versao="1.00">${evento}${ret.replace(/^<retEvento(?![^>]*xmlns=)/, `<retEvento xmlns="${NS_NFE}"`)}</procEventoNFe>`;
  await admin
    .from('nfe_notas')
    .update({ situacao: 'cancelada', cancelada_em: new Date().toISOString(), motivo_cancelamento: j, xml_cancelamento: proc, cstat: cStat, motivo, updated_at: new Date().toISOString() })
    .eq('id', n.id);
  return { situacao: 'cancelada', id: n.id, cStat, motivo };
}

// ---------- DANFE e XML ----------
const paraB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function danfe(admin: SupabaseClient, notaId: string) {
  const { data: n } = await admin.from('nfe_notas').select('*').eq('id', notaId).maybeSingle();
  if (!n?.dados || !n.chave) throw new Error('Nota sem dados para o DANFE.');
  const pdf = gerarDanfe({ ...(n.dados as DadosNota), chave: n.chave, protocolo: n.protocolo, autorizada_em: n.autorizada_em ? new Date(new Date(n.autorizada_em).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19) : null, situacao: n.situacao });
  return { nome: `DANFE NF-e ${n.numero} serie ${n.serie}.pdf`, pdf: paraB64(pdf) };
}

export async function xmlDa(admin: SupabaseClient, notaId: string) {
  const { data: n } = await admin.from('nfe_notas').select('numero, serie, chave, situacao, xml, xml_cancelamento').eq('id', notaId).maybeSingle();
  if (!n?.xml) throw new Error('Nota sem XML.');
  if (!['autorizada', 'cancelada'].includes(n.situacao)) throw new Error('O XML só vale depois de autorizado.');
  return { nome: `${n.chave}-nfe.xml`, xml: n.xml, nome_cancelamento: n.xml_cancelamento ? `${n.chave}-cancelamento.xml` : null, xml_cancelamento: n.xml_cancelamento };
}
