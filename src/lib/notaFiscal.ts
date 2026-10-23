// Nota fiscal na compra: leitura do XML da NF-e, conferência da chave de acesso e o "vínculo aprendido"
// (item da nota do fornecedor -> produto do nosso estoque).
import { somenteDigitos } from './formatos';

export type ItemNota = {
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  lote: string | null;
  validade: string | null; // aaaa-mm-dd
  /** impostos destacados no item */
  valor_icms?: number | null;
  valor_ipi?: number | null;
  valor_icms_st?: number | null;
  /** só em nota de veículo (XML): chassi e anos */
  chassi?: string | null;
  ano_fabricacao?: string | null;
  ano_modelo?: string | null;
};
export type LeituraNota = {
  legivel: boolean;
  tipo_documento?: string | null;
  codigo_barras?: string | null;
  emitente: { nome: string | null; cnpj_cpf: string | null };
  destinatario?: { nome: string | null; cnpj_cpf: string | null };
  seguro?: number | null;
  valor_ipi?: number | null;
  valor_icms_st?: number | null;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  data_emissao: string | null; // aaaa-mm-dd
  itens: ItemNota[];
  frete: number | null;
  outras_despesas: number | null;
  desconto: number | null;
  valor_total: number | null;
  duplicatas: { vencimento: string; valor: number }[];
  nao_lido: string[];
  /** só no CT-e / DACTE (frete à parte): as notas das mercadorias transportadas */
  notas_transportadas?: { chave: string | null; numero: string | null }[];
};

/** Chave de acesso da NF-e: 44 dígitos com o dígito verificador certo (módulo 11). */
export function chaveNfeValida(ch: string | null | undefined): boolean {
  const d = somenteDigitos(ch ?? '');
  if (d.length !== 44) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(d[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(d[43]);
}

/** O que a chave de acesso (NF-e ou CT-e) diz do documento: CNPJ do emitente, modelo (55 NF-e, 57 CT-e) e nº, sem zeros à esquerda. */
export function dadosDaChave(ch: string | null | undefined): { cnpj: string; modelo: string; numero: string } | null {
  const d = somenteDigitos(ch ?? '');
  if (d.length !== 44) return null;
  return { cnpj: d.slice(6, 20), modelo: d.slice(20, 22), numero: String(Number(d.slice(25, 34))) };
}

/** Nº da nota para comparar: o primeiro grupo de números, sem zeros à esquerda ("000123 série 1" = "123"). */
export const numeroBase = (t: string | null | undefined): string | null => {
  const m = /\d+/.exec(t ?? '');
  return m ? String(Number(m[0])) : null;
};

/**
 * Código de barras do pagamento, sempre no formato de 44 dígitos (o mesmo documento dá o mesmo código,
 * venha a linha digitável de 47/48 dígitos ou o código de barras). null se não for um código válido.
 */
export function codigoBarras(t: string | null | undefined): string | null {
  const d = somenteDigitos(t ?? '');
  if (d.length === 44) return d;
  if (d.length === 48 && d[0] === '8') return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47); // contas de consumo
  if (d.length === 47) return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31); // boleto bancário
  return null;
}

/** Texto para comparar descrições: maiúsculas, sem acento e sem espaços repetidos. */
export const normalizarDescricao = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9%,./-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Como o item é reconhecido na próxima nota do mesmo fornecedor: pelo código dele, ou pela descrição. */
export const chaveItemNota = (it: { codigo: string | null; descricao: string }) =>
  it.codigo && it.codigo.trim() ? `C:${it.codigo.trim().toUpperCase()}` : `D:${normalizarDescricao(it.descricao)}`;

// ===== XML da NF-e =====

const entidades = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
/** Conteúdo da primeira tag (aceita prefixo de namespace, ex.: <nfe:xProd>). */
function tag(xml: string, nome: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(xml);
  return m ? entidades(m[1]) : null;
}
function blocos(xml: string, nome: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}
const num = (t: string | null) => (t != null && t !== '' && Number.isFinite(Number(t)) ? Number(t) : null);
const soData = (t: string | null) => (t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null);

/** Lê o XML da NF-e (nfeProc ou NFe). Devolve null se o arquivo não for uma NF-e. */
export function lerXmlNfe(xml: string): LeituraNota | null {
  if (!/<(?:\w+:)?infNFe/.test(xml)) return null;
  const emit = tag(xml, 'emit') ?? '';
  const ide = tag(xml, 'ide') ?? '';
  const tot = tag(xml, 'ICMSTot') ?? '';
  const chave = /Id="NFe(\d{44})"/.exec(xml)?.[1] ?? tag(xml, 'chNFe');
  const itens: ItemNota[] = blocos(xml, 'det').map((det) => {
    const prod = tag(det, 'prod') ?? det;
    const rastro = tag(prod, 'rastro');
    const veic = tag(prod, 'veicProd');
    const imp = tag(det, 'imposto') ?? '';
    const icmsBloco = tag(imp, 'ICMS') ?? '';
    const ipiBloco = tag(imp, 'IPI') ?? '';
    const adic = tag(det, 'infAdProd') ?? '';
    const loteAdic = /lote[:\s.]*([A-Z0-9][A-Z0-9/-]{1,})/i.exec(adic)?.[1] ?? null;
    const valAdic = /val(?:idade)?[:\s.]*(\d{2})\/(\d{2})\/(\d{2,4})/i.exec(adic);
    return {
      codigo: tag(prod, 'cProd'),
      descricao: tag(prod, 'xProd') ?? 'Item sem descrição',
      unidade: tag(prod, 'uCom'),
      quantidade: num(tag(prod, 'qCom')),
      valor_unitario: num(tag(prod, 'vUnCom')),
      valor_total: num(tag(prod, 'vProd')),
      lote: (rastro && tag(rastro, 'nLote')) || loteAdic,
      validade: soData(rastro ? tag(rastro, 'dVal') : null) ?? (valAdic ? `${valAdic[3].length === 2 ? '20' + valAdic[3] : valAdic[3]}-${valAdic[2]}-${valAdic[1]}` : null),
      valor_icms: num(tag(icmsBloco, 'vICMS')),
      valor_ipi: num(tag(ipiBloco, 'vIPI')),
      valor_icms_st: num(tag(icmsBloco, 'vICMSST')),
      chassi: veic ? tag(veic, 'chassi') : null,
      ano_fabricacao: veic ? tag(veic, 'anoFab') : null,
      ano_modelo: veic ? tag(veic, 'anoMod') : null,
    };
  });
  const outras = num(tag(tot, 'vOutro')) ?? 0;
  const dest = tag(xml, 'dest') ?? '';
  return {
    legivel: true,
    emitente: { nome: tag(emit, 'xNome'), cnpj_cpf: tag(emit, 'CNPJ') ?? tag(emit, 'CPF') },
    destinatario: { nome: tag(dest, 'xNome'), cnpj_cpf: tag(dest, 'CNPJ') ?? tag(dest, 'CPF') },
    seguro: num(tag(tot, 'vSeg')),
    valor_ipi: num(tag(tot, 'vIPI')),
    valor_icms_st: num(tag(tot, 'vST')),
    numero: tag(ide, 'nNF'),
    serie: tag(ide, 'serie'),
    chave: chave ?? null,
    data_emissao: soData(tag(ide, 'dhEmi') ?? tag(ide, 'dEmi')),
    itens,
    frete: num(tag(tot, 'vFrete')),
    outras_despesas: outras || null,
    desconto: num(tag(tot, 'vDesc')),
    valor_total: num(tag(tot, 'vNF')),
    duplicatas: blocos(xml, 'dup')
      .map((d) => ({ vencimento: soData(tag(d, 'dVenc')) ?? '', valor: num(tag(d, 'vDup')) ?? 0 }))
      .filter((d) => d.vencimento && d.valor > 0),
    nao_lido: [],
  };
}

// ===== XML do CT-e (conhecimento de transporte: frete cobrado à parte) =====

/** Lê o XML do CT-e (cteProc ou CTe). Devolve null se o arquivo não for um CT-e. */
export function lerXmlCte(xml: string): LeituraNota | null {
  if (!/<(?:\w+:)?infCte[\s>]/.test(xml)) return null;
  const emit = tag(xml, 'emit') ?? '';
  const ide = tag(xml, 'ide') ?? '';
  const prest = tag(xml, 'vPrest') ?? '';
  const imp = tag(xml, 'imp') ?? '';
  const chave = /Id="CTe(\d{44})"/.exec(xml)?.[1] ?? tag(xml, 'chCTe');
  // quem paga o frete (tomador): 0 remetente, 1 expedidor, 2 recebedor, 3 destinatário; ou outro (toma4)
  const toma4 = tag(ide, 'toma4');
  const papel = ({ '0': 'rem', '1': 'exped', '2': 'receb', '3': 'dest' } as Record<string, string>)[tag(ide, 'toma') ?? ''];
  const tomador = toma4 ?? (papel ? tag(xml, papel) : null) ?? tag(xml, 'dest') ?? '';
  const total = num(tag(prest, 'vTPrest'));
  const receber = num(tag(prest, 'vRec'));
  const numero = tag(ide, 'nCT');
  const notas = [
    ...blocos(xml, 'infNFe').map((b) => tag(b, 'chave')).filter((c): c is string => !!c && somenteDigitos(c).length === 44).map((c) => ({ chave: somenteDigitos(c), numero: dadosDaChave(c)?.numero ?? null })),
    ...blocos(xml, 'infNF').map((b) => tag(b, 'nDoc')).filter((x): x is string => !!x).map((x) => ({ chave: null, numero: x })),
  ];
  return {
    legivel: true,
    tipo_documento: 'cte',
    emitente: { nome: tag(emit, 'xNome'), cnpj_cpf: tag(emit, 'CNPJ') ?? tag(emit, 'CPF') },
    destinatario: { nome: tag(tomador, 'xNome'), cnpj_cpf: tag(tomador, 'CNPJ') ?? tag(tomador, 'CPF') },
    numero,
    serie: tag(ide, 'serie'),
    chave: chave ?? null,
    data_emissao: soData(tag(ide, 'dhEmi')),
    itens: [
      {
        codigo: null,
        descricao: `Frete${numero ? ` (CT-e nº ${numero})` : ''}`,
        unidade: null,
        quantidade: 1,
        valor_unitario: total ?? receber,
        valor_total: total ?? receber,
        lote: null,
        validade: null,
        valor_icms: num(tag(imp, 'vICMS')) ?? num(tag(imp, 'vICMSOutraUF')),
        valor_ipi: null,
        valor_icms_st: null,
      },
    ],
    frete: null,
    outras_despesas: null,
    desconto: null,
    valor_total: receber ?? total,
    duplicatas: blocos(xml, 'dup')
      .map((d) => ({ vencimento: soData(tag(d, 'dVenc')) ?? '', valor: num(tag(d, 'vDup')) ?? 0 }))
      .filter((d) => d.vencimento && d.valor > 0),
    nao_lido: [],
    notas_transportadas: notas,
  };
}
