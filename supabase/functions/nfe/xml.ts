// V157: monta o XML da NF-e 4.00 (modelo 55) do produtor rural, na ordem exata do leiaute.
// O texto sai já na forma canônica (sem espaços entre etiquetas, sem etiqueta vazia), o que a assinatura exige.

export type Endereco = {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigo_municipio: string; // IBGE, 7 números
  municipio: string;
  uf: string;
  cep?: string | null;
  telefone?: string | null;
};

export type Emitente = { doc: string; nome: string; fantasia?: string | null; ie: string; crt: number; endereco: Endereco };

export type Destinatario = { doc: string; nome: string; ie?: string | null; email?: string | null; endereco: Endereco };

export type ItemNota = {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valor_total: number;
  unidade_trib: string;
  quantidade_trib: number;
  cst_icms: string;
  aliquota_icms: number;
  reducao_bc: number;
  cst_pis: string;
  cst_cofins: string;
  info?: string | null;
};

export type Transporte = {
  modalidade: string; // 0 emitente, 1 destinatário, 2 terceiros, 9 sem frete
  transportadora?: { doc?: string | null; nome?: string | null; ie?: string | null; endereco?: string | null; municipio?: string | null; uf?: string | null } | null;
  placa?: string | null;
  uf_placa?: string | null;
  volumes?: { quantidade?: number | null; especie?: string | null; peso_liquido?: number | null; peso_bruto?: number | null } | null;
};

export type Pagamento = { indicador: 0 | 1; tipo: string; descricao?: string | null };

export type DadosNota = {
  ambiente: 1 | 2;
  uf: string; // UF do emitente
  codigo_uf: string;
  serie: number;
  numero: number;
  codigo_numerico: string; // cNF, 8 números
  emissao: string; // AAAA-MM-DDThh:mm:ss-03:00
  natureza: string;
  emitente: Emitente;
  destinatario: Destinatario;
  itens: ItemNota[];
  transporte: Transporte;
  pagamento: Pagamento;
  info_complementar?: string | null;
};

// ---------- formatação ----------
/** Texto seguro para o XML: sem caracteres de controle, espaços simples, e &, < e > trocados. */
export function texto(v: unknown, max = 60): string {
  const s = String(v ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export const soNumeros = (s: unknown) => String(s ?? '').replace(/\D/g, '');
export const dec = (v: number, casas: number) => {
  const x = Math.round((Number(v) || 0) * 10 ** casas) / 10 ** casas;
  return (x === 0 ? 0 : x).toFixed(casas);
};
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
/** <tag>valor</tag>; se o valor vier vazio, não escreve nada (o leiaute não aceita etiqueta vazia). */
const t = (tag: string, valor: string | number | null | undefined) => (valor === null || valor === undefined || valor === '' ? '' : `<${tag}>${valor}</${tag}>`);

// ---------- chave de acesso ----------
export function digitoChave(chave43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

export function montarChave(d: DadosNota): string {
  const aamm = d.emissao.slice(2, 4) + d.emissao.slice(5, 7);
  const doc = soNumeros(d.emitente.doc).padStart(14, '0'); // pessoa física: CPF com zeros à esquerda
  const base = d.codigo_uf + aamm + doc + '55' + String(d.serie).padStart(3, '0') + String(d.numero).padStart(9, '0') + '1' + d.codigo_numerico;
  return base + digitoChave(base);
}

/** cNF: 8 números aleatórios, diferente do número da nota. */
export function codigoNumerico(numero: number): string {
  for (;;) {
    const n = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000000).padStart(8, '0');
    if (Number(n) !== numero && n !== '00000000') return n;
  }
}

// ---------- partes ----------
function docTag(doc: string): string {
  const d = soNumeros(doc);
  return d.length === 14 ? t('CNPJ', d) : t('CPF', d);
}

function endereco(tag: 'enderEmit' | 'enderDest', e: Endereco): string {
  return (
    `<${tag}>` +
    t('xLgr', texto(e.logradouro, 60)) +
    t('nro', texto(e.numero || 'SN', 60)) +
    t('xCpl', texto(e.complemento, 60)) +
    t('xBairro', texto(e.bairro, 60)) +
    t('cMun', e.codigo_municipio) +
    t('xMun', texto(e.municipio, 60)) +
    t('UF', e.uf.toUpperCase()) +
    t('CEP', soNumeros(e.cep).length === 8 ? soNumeros(e.cep) : '') +
    t('cPais', '1058') +
    t('xPais', 'BRASIL') +
    t('fone', soNumeros(e.telefone).length >= 6 ? soNumeros(e.telefone).slice(0, 14) : '') +
    `</${tag}>`
  );
}

export type Calculo = { vBC: number; vICMS: number };

export function calcularIcms(it: ItemNota): Calculo {
  if (it.cst_icms === '00') {
    const vBC = r2(it.valor_total);
    return { vBC, vICMS: r2((vBC * it.aliquota_icms) / 100) };
  }
  if (it.cst_icms === '20') {
    const vBC = r2(it.valor_total * (1 - it.reducao_bc / 100));
    return { vBC, vICMS: r2((vBC * it.aliquota_icms) / 100) };
  }
  return { vBC: 0, vICMS: 0 };
}

function icms(it: ItemNota): string {
  const c = calcularIcms(it);
  const o = '<orig>0</orig>';
  switch (it.cst_icms) {
    case '00':
      return `<ICMS><ICMS00>${o}<CST>00</CST><modBC>3</modBC><vBC>${dec(c.vBC, 2)}</vBC><pICMS>${dec(it.aliquota_icms, 4)}</pICMS><vICMS>${dec(c.vICMS, 2)}</vICMS></ICMS00></ICMS>`;
    case '20':
      return `<ICMS><ICMS20>${o}<CST>20</CST><modBC>3</modBC><pRedBC>${dec(it.reducao_bc, 4)}</pRedBC><vBC>${dec(c.vBC, 2)}</vBC><pICMS>${dec(it.aliquota_icms, 4)}</pICMS><vICMS>${dec(c.vICMS, 2)}</vICMS></ICMS20></ICMS>`;
    case '40':
    case '41':
      return `<ICMS><ICMS40>${o}<CST>${it.cst_icms}</CST></ICMS40></ICMS>`;
    case '51':
      return `<ICMS><ICMS51>${o}<CST>51</CST></ICMS51></ICMS>`;
    case '90':
      return `<ICMS><ICMS90>${o}<CST>90</CST></ICMS90></ICMS>`;
    case '102':
    case '300':
    case '400':
      return `<ICMS><ICMSSN102>${o}<CSOSN>${it.cst_icms}</CSOSN></ICMSSN102></ICMS>`;
    default:
      throw new Error(`CST do ICMS ${it.cst_icms} não suportado.`);
  }
}

const NT_PIS = ['04', '05', '06', '07', '08', '09'];
function pisCofins(it: ItemNota): string {
  const pis = NT_PIS.includes(it.cst_pis)
    ? `<PIS><PISNT><CST>${it.cst_pis}</CST></PISNT></PIS>`
    : `<PIS><PISOutr><CST>${it.cst_pis}</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>`;
  const cofins = NT_PIS.includes(it.cst_cofins)
    ? `<COFINS><COFINSNT><CST>${it.cst_cofins}</CST></COFINSNT></COFINS>`
    : `<COFINS><COFINSOutr><CST>${it.cst_cofins}</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>`;
  return pis + cofins;
}

function det(it: ItemNota, n: number): string {
  const vProd = r2(it.valor_total);
  return (
    `<det nItem="${n}"><prod>` +
    t('cProd', texto(it.codigo, 60)) +
    '<cEAN>SEM GTIN</cEAN>' +
    t('xProd', texto(it.descricao, 120)) +
    t('NCM', soNumeros(it.ncm)) +
    t('CFOP', soNumeros(it.cfop)) +
    t('uCom', texto(it.unidade, 6)) +
    t('qCom', dec(it.quantidade, 4)) +
    t('vUnCom', dec(vProd / it.quantidade, 10)) +
    t('vProd', dec(vProd, 2)) +
    '<cEANTrib>SEM GTIN</cEANTrib>' +
    t('uTrib', texto(it.unidade_trib, 6)) +
    t('qTrib', dec(it.quantidade_trib, 4)) +
    t('vUnTrib', dec(vProd / it.quantidade_trib, 10)) +
    '<indTot>1</indTot>' +
    '</prod><imposto>' +
    icms(it) +
    pisCofins(it) +
    '</imposto>' +
    t('infAdProd', texto(it.info, 500)) +
    '</det>'
  );
}

export function totais(itens: ItemNota[]) {
  let vBC = 0;
  let vICMS = 0;
  let vProd = 0;
  for (const it of itens) {
    const c = calcularIcms(it);
    vBC += c.vBC;
    vICMS += c.vICMS;
    vProd += r2(it.valor_total);
  }
  return { vBC: r2(vBC), vICMS: r2(vICMS), vProd: r2(vProd), vNF: r2(vProd) };
}

function total(itens: ItemNota[]): string {
  const s = totais(itens);
  const z = '0.00';
  return (
    '<total><ICMSTot>' +
    `<vBC>${dec(s.vBC, 2)}</vBC><vICMS>${dec(s.vICMS, 2)}</vICMS><vICMSDeson>${z}</vICMSDeson><vFCP>${z}</vFCP>` +
    `<vBCST>${z}</vBCST><vST>${z}</vST><vFCPST>${z}</vFCPST><vFCPSTRet>${z}</vFCPSTRet>` +
    `<vProd>${dec(s.vProd, 2)}</vProd><vFrete>${z}</vFrete><vSeg>${z}</vSeg><vDesc>${z}</vDesc><vII>${z}</vII><vIPI>${z}</vIPI><vIPIDevol>${z}</vIPIDevol>` +
    `<vPIS>${z}</vPIS><vCOFINS>${z}</vCOFINS><vOutro>${z}</vOutro><vNF>${dec(s.vNF, 2)}</vNF>` +
    '</ICMSTot></total>'
  );
}

function transp(tr: Transporte, interestadual: boolean): string {
  let x = `<transp><modFrete>${tr.modalidade}</modFrete>`;
  const tp = tr.transportadora;
  if (tp && (soNumeros(tp.doc) || tp.nome)) {
    x +=
      '<transporta>' +
      (soNumeros(tp.doc) ? docTag(tp.doc!) : '') +
      t('xNome', texto(tp.nome, 60)) +
      t('IE', soNumeros(tp.ie) || (String(tp.ie ?? '').toUpperCase() === 'ISENTO' ? 'ISENTO' : '')) +
      t('xEnder', texto(tp.endereco, 60)) +
      t('xMun', texto(tp.municipio, 60)) +
      t('UF', (tp.uf ?? '').toUpperCase()) +
      '</transporta>';
  }
  const placa = String(tr.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (placa && !interestadual) x += `<veicTransp><placa>${placa}</placa>${t('UF', (tr.uf_placa ?? '').toUpperCase())}</veicTransp>`;
  const v = tr.volumes;
  if (v && (v.quantidade || v.peso_bruto || v.peso_liquido)) {
    x +=
      '<vol>' +
      t('qVol', v.quantidade ? String(Math.round(v.quantidade)) : '') +
      t('esp', texto(v.especie, 60)) +
      t('pesoL', v.peso_liquido ? dec(v.peso_liquido, 3) : '') +
      t('pesoB', v.peso_bruto ? dec(v.peso_bruto, 3) : '') +
      '</vol>';
  }
  return x + '</transp>';
}

function pag(p: Pagamento, vNF: number): string {
  const desc = p.tipo === '99' ? texto(p.descricao || 'Conforme combinado', 60) : '';
  return `<pag><detPag><indPag>${p.indicador}</indPag><tPag>${p.tipo}</tPag>${t('xPag', desc)}<vPag>${dec(vNF, 2)}</vPag></detPag></pag>`;
}

/** O elemento <infNFe> (o que é assinado). */
export function montarInfNFe(d: DadosNota, chave: string): string {
  const interestadual = d.destinatario.endereco.uf.toUpperCase() !== d.uf.toUpperCase();
  const ie = String(d.destinatario.ie ?? '').trim().toUpperCase();
  const ieDest = ie === 'ISENTO' ? '' : soNumeros(ie);
  const indIEDest = ie === 'ISENTO' ? 2 : ieDest ? 1 : 9;
  const indFinal = indIEDest === 9 ? 1 : 0;
  const homolog = d.ambiente === 2;
  const destNome = homolog ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : texto(d.destinatario.nome, 60);
  const s = totais(d.itens);

  const ide =
    '<ide>' +
    t('cUF', d.codigo_uf) +
    t('cNF', d.codigo_numerico) +
    t('natOp', texto(d.natureza, 60)) +
    '<mod>55</mod>' +
    t('serie', String(d.serie)) +
    t('nNF', String(d.numero)) +
    t('dhEmi', d.emissao) +
    t('dhSaiEnt', d.emissao) +
    '<tpNF>1</tpNF>' +
    t('idDest', interestadual ? '2' : '1') +
    t('cMunFG', d.emitente.endereco.codigo_municipio) +
    '<tpImp>1</tpImp><tpEmis>1</tpEmis>' +
    t('cDV', chave.slice(-1)) +
    t('tpAmb', String(d.ambiente)) +
    '<finNFe>1</finNFe>' +
    t('indFinal', String(indFinal)) +
    '<indPres>1</indPres><procEmi>0</procEmi><verProc>FazendaDigital</verProc>' +
    '</ide>';

  const emit =
    '<emit>' +
    docTag(d.emitente.doc) +
    t('xNome', texto(d.emitente.nome, 60)) +
    t('xFant', texto(d.emitente.fantasia, 60)) +
    endereco('enderEmit', d.emitente.endereco) +
    t('IE', soNumeros(d.emitente.ie)) +
    t('CRT', String(d.emitente.crt)) +
    '</emit>';

  const dest =
    '<dest>' +
    docTag(d.destinatario.doc) +
    t('xNome', destNome) +
    endereco('enderDest', d.destinatario.endereco) +
    t('indIEDest', String(indIEDest)) +
    t('IE', indIEDest === 1 ? ieDest : '') +
    t('email', texto(d.destinatario.email, 60)) +
    '</dest>';

  return (
    `<infNFe Id="NFe${chave}" versao="4.00">` +
    ide +
    emit +
    dest +
    d.itens.map((it, i) => det(it, i + 1)).join('') +
    total(d.itens) +
    transp(d.transporte, interestadual) +
    pag(d.pagamento, s.vNF) +
    (d.info_complementar ? `<infAdic>${t('infCpl', texto(d.info_complementar, 5000))}</infAdic>` : '') +
    '</infNFe>'
  );
}

export const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
