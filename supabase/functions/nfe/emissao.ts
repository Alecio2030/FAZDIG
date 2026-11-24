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
      'id, numero, tipo, data, fazenda_id, pessoa_id, valor_bruto, funrural_valor, cabecas, peso_bruto_kg, peso_liquido_kg, forma_pagamento, numero_documento, pessoa_faturamento_id, gta_numero, gta_serie, gta_uf,' +
        ' pessoa:pessoas ( nome, tipo_pessoa, cpf_cnpj, rg_ie, email, telefone, celular, logradouro, numero, complemento, bairro, cep, municipio, uf ),' +
        ' faturamento:pessoas_faturamento ( nome_fazenda, inscricao_estadual, logradouro, numero, complemento, bairro, cep, municipio, uf ),' +
        ' itens:venda_itens ( tipo_item, descricao, quantidade, unidade, valor_total, ordem, cabecas, sexo, idade_de, idade_ate, peso_kg, movimentacao_id, raca:racas ( nome ), cafe:cafe_lotes ( numero, especie, tipo, peneira ), insumo:insumos ( nome, codigo ) ),' +
        ' parcelas:lancamentos ( data_vencimento )',
    )
    .eq('id', vendaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Venda não encontrada.');
  return data as any;
}

/** V203: uma NF-e pode juntar várias vendas: mesma fazenda, mesmo cliente, mesma fazenda do cliente (IE) e mesmo tipo. */
async function lerVendas(admin: SupabaseClient, ids: string[]) {
  const unicos = [...new Set((ids ?? []).filter(Boolean))];
  if (!unicos.length) throw new Error('Escolha a venda.');
  const vs: any[] = [];
  for (const id of unicos) vs.push(await lerVenda(admin, id));
  const a = vs[0];
  for (const v of vs.slice(1)) {
    if (v.fazenda_id !== a.fazenda_id) throw new Error(`A venda nº ${v.numero} é de outra fazenda.`);
    if (v.pessoa_id !== a.pessoa_id) throw new Error(`A venda nº ${v.numero} é de outro cliente: a NF-e junta só vendas do mesmo cliente.`);
    if ((v.pessoa_faturamento_id ?? null) !== (a.pessoa_faturamento_id ?? null)) throw new Error(`A venda nº ${v.numero} é para outra fazenda do cliente (outra Inscrição Estadual).`);
    if (v.tipo !== a.tipo) throw new Error(`A venda nº ${v.numero} é de outro tipo (gado, café ou outros): faça notas separadas.`);
  }
  return vs;
}

/** Notas ligadas a qualquer uma das vendas (pela venda principal ou pela junção). */
async function notasDasVendas(admin: SupabaseClient, ids: string[], campos = '*') {
  const { data: lig } = await admin.from('nfe_nota_vendas').select('nota_id').in('venda_id', ids);
  const notaIds = [...new Set(((lig ?? []) as any[]).map((x) => x.nota_id))];
  let q = admin.from('nfe_notas').select(campos).order('created_at', { ascending: false });
  q = notaIds.length ? q.or(`venda_id.in.(${ids.join(',')}),id.in.(${notaIds.join(',')})`) : q.in('venda_id', ids);
  const { data } = await q;
  return (data ?? []) as any[];
}

const mesmoConjunto = (a: string[] | undefined, b: string[]) => !!a && a.length === b.length && a.every((x) => b.includes(x));

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

// ---------- V162: gado da venda por sexo e faixa de idade (como pedem a GTA e a NF-e) ----------
type FaixaVenda = { sexo: 'M' | 'F'; de: number; rotulo: string; ordem: number; cabecas: number; peso: number };

/** Idade em meses completos, igual ao idade_meses() do banco. */
function mesesCompletos(nascIso: string, emIso: string): number {
  const [a1, m1, d1] = nascIso.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = emIso.slice(0, 10).split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Faixas da GTA (as mesmas para machos e fêmeas): a NF-e do gado acompanha a GTA. */
const FAIXAS_NOTA = [
  { de: 0, ate: 12, rotulo: '0 a 12 meses', ordem: 1 },
  { de: 13, ate: 24, rotulo: '13 a 24 meses', ordem: 2 },
  { de: 25, ate: 36, rotulo: '25 a 36 meses', ordem: 3 },
  { de: 37, ate: null as number | null, rotulo: 'acima de 36 meses', ordem: 4 },
];

/** Agrupa os animais que saíram na venda pelas faixas da GTA (idade na data da saída). null se não der para agrupar. */
async function faixasDaVenda(admin: SupabaseClient, vendaId: string, movId?: string | null): Promise<FaixaVenda[] | null> {
  let q = admin.from('movimentacoes').select('data, itens:movimentacao_itens ( sexo, peso_kg, animal:animais ( sexo, data_nascimento ) )');
  q = movId ? q.eq('id', movId) : q.eq('venda_id', vendaId);
  const { data: movs, error } = await q;
  if (error || !movs?.length) return null;
  const grupos = new Map<string, FaixaVenda>();
  for (const m of movs as any[]) {
    for (const it of m.itens ?? []) {
      const a = um<any>(it.animal);
      const sexo = String(it.sexo ?? a?.sexo ?? '').trim() as 'M' | 'F';
      if (!a?.data_nascimento || (sexo !== 'M' && sexo !== 'F')) return null; // animal sem idade ou sem sexo: não agrupa
      const meses = mesesCompletos(a.data_nascimento, m.data);
      const f = FAIXAS_NOTA.find((x) => x.ate === null || meses <= x.ate)!;
      const k = `${sexo}${f.de}`;
      const g = grupos.get(k) ?? { sexo, de: f.de, rotulo: f.rotulo, ordem: f.ordem, cabecas: 0, peso: 0 };
      g.cabecas += 1;
      g.peso += Number(it.peso_kg) || 0;
      grupos.set(k, g);
    }
  }
  return [...grupos.values()].sort((a, b) => (a.ordem === b.ordem ? (a.sexo === 'M' ? -1 : 1) : a.ordem - b.ordem));
}

// ---------- prévia para conferência ----------
/** V203: faixas internas (as do estoque) para o item informado por sexo e faixa */
const FAIXAS_ESTOQUE: Record<string, [number, number | null][]> = {
  M: [[0, 12], [13, 24], [25, 36], [37, null]],
  F: [[0, 2], [3, 8], [9, 12], [13, 24], [25, 36], [37, null]],
};
const rotuloFaixa = (sexo: string, de: number, ate: number | null) => {
  const f = FAIXAS_ESTOQUE[sexo]?.find((x) => x[0] === de);
  const fim = ate ?? f?.[1] ?? null;
  return fim === null ? `acima de ${de - 1} meses` : `${de} a ${fim} meses`;
};
const textoCab = (n: number) => `${n} ${n === 1 ? 'cabeça' : 'cabeças'}`;
const sexoTxt = (s: string) => (s === 'M' ? 'machos' : 'fêmeas');

/** Itens da NF-e de uma venda de gado: um por item da venda (e, se o item tiver idades diferentes, um por faixa). */
async function itensGado(admin: SupabaseClient, v: any, base: Record<string, unknown>): Promise<NotaConferencia['itens']> {
  const out: NotaConferencia['itens'] = [];
  const cab = Number(v.cabecas) || 0;
  const animais = ((v.itens ?? []) as any[]).filter((i) => i.tipo_item === 'animal').sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const novo = (codigo: string, descricao: string, n: number, valor: number, peso: number | null) =>
    out.push({ ...(base as any), codigo, descricao, unidade: 'CAB', quantidade: n, valor_total: r2(valor), unidade_trib: 'UN', quantidade_trib: n, info: peso && peso > 0 ? `Peso bruto ${r2(peso).toLocaleString('pt-BR')} kg` : null });
  /** reparte o valor de um item pelas faixas dos animais (pelo peso, ou pelas cabeças) */
  const repartir = (faixas: FaixaVenda[], valorTotal: number, raca: string) => {
    const porPeso = faixas.every((f) => f.peso > 0);
    const base_rateio = faixas.reduce((t, f) => t + (porPeso ? f.peso : f.cabecas), 0);
    let resto = r2(valorTotal);
    faixas.forEach((f, i) => {
      const valor = i === faixas.length - 1 ? r2(resto) : r2((valorTotal * (porPeso ? f.peso : f.cabecas)) / base_rateio);
      resto = r2(resto - valor);
      novo(`BOV-${f.sexo}${f.de}`, `Bovinos ${sexoTxt(f.sexo)} de ${f.rotulo}${raca} - ${textoCab(f.cabecas)}`, f.cabecas, valor, f.peso);
    });
  };

  if (animais.length <= 1 && !(animais[0]?.sexo && animais[0]?.idade_de != null)) {
    // venda de um item (ou lançada antes da V203): pelas faixas de todos os animais que saíram
    const faixas = await faixasDaVenda(admin, v.id);
    const raca = um<any>(animais[0]?.raca)?.nome ? ` ${um<any>(animais[0]?.raca).nome}` : '';
    if (faixas && faixas.length && faixas.reduce((t, f) => t + f.cabecas, 0) === cab) repartir(faixas, Number(v.valor_bruto), raca);
    else novo('BOV', `Bovinos${raca} - ${textoCab(cab)}`, cab, Number(v.valor_bruto), Number(v.peso_bruto_kg) || null);
    return out;
  }
  for (const it of animais) {
    const n = Number(it.cabecas) || 0;
    const raca = um<any>(it.raca)?.nome ? ` ${um<any>(it.raca).nome}` : '';
    if (it.sexo && it.idade_de != null) {
      novo(`BOV-${it.sexo}${it.idade_de}`, `Bovinos ${sexoTxt(it.sexo)} de ${rotuloFaixa(it.sexo, it.idade_de, it.idade_ate)}${raca} - ${textoCab(n)}`, n, Number(it.valor_total), Number(it.peso_kg) || null);
      continue;
    }
    const faixas = it.movimentacao_id ? await faixasDaVenda(admin, v.id, it.movimentacao_id) : null;
    if (faixas && faixas.length && faixas.reduce((t, f) => t + f.cabecas, 0) === n) repartir(faixas, Number(it.valor_total), raca);
    else novo('BOV', `Bovinos${it.sexo ? ` ${sexoTxt(it.sexo)}` : ''}${raca} - ${textoCab(n)}`, n, Number(it.valor_total), Number(it.peso_kg) || null);
  }
  return out;
}

// ---------- prévia para conferência ----------
export async function previa(admin: SupabaseClient, vendaIds: string[]) {
  const vendas = await lerVendas(admin, vendaIds);
  const ids = vendas.map((x) => x.id as string);
  const v = vendas[0];
  const notas = await notasDasVendas(admin, ids, 'id, numero, serie, ambiente, situacao, chave, motivo, created_at, dados');
  const cfg = await lerConfig(admin, v.fazenda_id);
  const { data: faz } = await admin.from('fazendas').select('uf').eq('id', v.fazenda_id).maybeSingle();
  const ufEmit = String(faz?.uf ?? '').toUpperCase();

  // se já houve tentativa rejeitada destas mesmas vendas, volta com o que foi conferido da última vez
  const ultima = notas.find((n: any) => n.situacao === 'rejeitada' && n.ambiente === cfg.ambiente);
  const conferenciaAntigaDoGado = v.tipo === 'animais' && (ultima?.dados?.conferencia?.itens ?? []).some((i: any) => i.codigo === 'BOV');
  const mesmasVendas = mesmoConjunto(ultima?.dados?.vendas ?? (ultima ? [v.id] : undefined), ids);
  if (ultima?.dados?.conferencia && !conferenciaAntigaDoGado && mesmasVendas) return { nota: ultima.dados.conferencia as NotaConferencia, notas, ambiente: cfg.ambiente, crt: cfg.crt, ultimo_erro: ultima.motivo, vendas: vendas.map((x) => x.numero) };

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
    let cab = 0, pb = 0, pl = 0;
    for (const vd of vendas) {
      itens.push(...(await itensGado(admin, vd, base)));
      cab += Number(vd.cabecas) || 0;
      pb += Number(vd.peso_bruto_kg) || 0;
      pl += Number(vd.peso_liquido_kg ?? vd.peso_bruto_kg) || 0;
    }
    volumes = { quantidade: cab, especie: 'Cabeças', peso_bruto: pb || null, peso_liquido: pl || null };
  } else {
    let sacas = 0;
    for (const vd of vendas) for (const it of vd.itens ?? []) {
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

  const aPrazo = vendas.some((vd) => (vd.parcelas ?? []).some((x: any) => x.data_vencimento && x.data_vencimento > vd.data) || (vd.parcelas ?? []).length > 1);
  const funrural = vendas.reduce((t, vd) => t + (Number(vd.funrural_valor) || 0), 0);
  const numeros = vendas.map((vd) => vd.numero);
  const textos = [regra.texto_legal, funrural > 0 ? `FUNRURAL retido pelo adquirente: R$ ${moeda(funrural)}.` : '', numeros.length > 1 ? `Vendas nº ${numeros.join(', ')}.` : `Venda nº ${v.numero}.`].filter(Boolean);
  const gv = vendas.find((vd) => vd.gta_numero) ?? v;

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
    gta: v.tipo === 'animais' ? { numero: gv.gta_numero ?? '', serie: gv.gta_serie ?? '', uf: gv.gta_uf ?? ufEmit } : null,
    info_complementar: textos.join(' '),
  };
  return { nota, notas, ambiente: cfg.ambiente, crt: cfg.crt, ultimo_erro: null, vendas: numeros };
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
export async function emitir(admin: SupabaseClient, vendaIds: string[], conf: NotaConferencia, userId: string) {
  const vendas = await lerVendas(admin, vendaIds);
  const ids = vendas.map((x) => x.id as string);
  const v = vendas[0];
  const vendaId = v.id as string;
  const cfg = await lerConfig(admin, v.fazenda_id);
  const ambiente = (cfg.ambiente === 1 ? 1 : 2) as 1 | 2;
  const { data: fz } = await admin.from('fazendas').select('uf').eq('id', v.fazenda_id).maybeSingle();
  const erros = validar(conf, cfg.crt, v.tipo === 'animais' && ambiente === 1, String(fz?.uf ?? '').toUpperCase());
  if (erros.length) throw new Error(`Confira antes de emitir: ${erros.join(' ')}`);

  const anteriores = await notasDasVendas(admin, ids);
  const jaTem = anteriores.find((n: any) => n.situacao === 'autorizada' && n.ambiente === ambiente);
  if (jaTem) throw new Error(ids.length > 1 ? `Uma destas vendas já tem a NF-e nº ${jaTem.numero} autorizada.` : 'Esta venda já tem NF-e autorizada.');
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
  // V203: as vendas que esta nota cobre
  await admin.from('nfe_notas').update({ venda_id: vendaId }).eq('id', notaId);
  await admin.from('nfe_nota_vendas').delete().eq('nota_id', notaId);
  const { error: eLig } = await admin.from('nfe_nota_vendas').insert(ids.map((id) => ({ nota_id: notaId, venda_id: id })));
  if (eLig) throw new Error(eLig.message);

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
      dados: { ...dados, conferencia: conf, vendas: ids }, xml: nfe, cstat: null, motivo: null, updated_at: new Date().toISOString(),
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
    const { data: lig } = await admin.from('nfe_nota_vendas').select('venda_id').eq('nota_id', notaId);
    const todas = [...new Set([venda, ...((lig ?? []) as any[]).map((x) => x.venda_id)].filter(Boolean))] as string[];
    if (todas.length) {
      // o número da nota passa a ser o documento das vendas, se ainda não tinham
      await admin.from('vendas').update({ numero_documento: `NF-e ${n?.numero}` }).in('id', todas).is('numero_documento', null);
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
