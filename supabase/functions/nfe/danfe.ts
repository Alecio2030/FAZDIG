// V157: DANFE (Documento Auxiliar da NF-e) em PDF, retrato A4, com o código de barras da chave de acesso.
// Gerador de PDF próprio e pequeno (fonte Helvetica padrão do PDF), sem biblioteca de fora.
import { calcularIcms, totais, type DadosNota } from './xml.ts';

export type NotaDanfe = DadosNota & {
  chave: string;
  protocolo?: string | null;
  autorizada_em?: string | null;
  situacao: string; // autorizada, cancelada, ...
};

// ---------------- PDF ----------------
const LARGURAS: Record<'F1' | 'F2', number[]> = {
  F1: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 761, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 761, 611, 761, 761, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 761, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500],
  F2: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 761, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 761, 611, 761, 761, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 761, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556],
};
const CP1252: Record<string, number> = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
function codigo(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c;
  if (CP1252[ch] !== undefined) return CP1252[ch];
  if (c >= 160 && c <= 255) return c;
  return 63; // ?
}
function largura(s: string, fonte: 'F1' | 'F2', tam: number): number {
  let w = 0;
  for (const ch of s) {
    const c = codigo(ch);
    w += LARGURAS[fonte][c - 32] ?? 556;
  }
  return (w * tam) / 1000;
}
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

class Pagina {
  ops: string[] = [];
  /** y medido de cima para baixo (como na tela); o PDF mede de baixo para cima */
  altura = 842;
  y(v: number) {
    return n2(this.altura - v);
  }
  caixa(x: number, y: number, w: number, h: number, espessura = 0.5) {
    this.ops.push(`${espessura} w ${n2(x)} ${this.y(y + h)} ${n2(w)} ${n2(h)} re S`);
  }
  linha(x1: number, y1: number, x2: number, y2: number, espessura = 0.5) {
    this.ops.push(`${espessura} w ${n2(x1)} ${this.y(y1)} m ${n2(x2)} ${this.y(y2)} l S`);
  }
  barra(x: number, y: number, w: number, h: number) {
    this.ops.push(`${n2(x)} ${this.y(y + h)} ${n2(w)} ${n2(h)} re f`);
  }
  texto(s: string, x: number, y: number, tam: number, opc: { negrito?: boolean; alinhar?: 'esq' | 'centro' | 'dir'; cinza?: boolean; largura?: number } = {}) {
    const fonte = opc.negrito ? 'F2' : 'F1';
    let t = String(s ?? '');
    if (opc.largura) while (t.length > 1 && largura(t, fonte, tam) > opc.largura) t = t.slice(0, -1);
    const w = largura(t, fonte, tam);
    const x0 = opc.alinhar === 'centro' ? x - w / 2 : opc.alinhar === 'dir' ? x - w : x;
    const esc = Array.from(t)
      .map((ch) => {
        const c = codigo(ch);
        if (c === 40 || c === 41 || c === 92) return '\\' + String.fromCharCode(c);
        return c < 128 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0');
      })
      .join('');
    const cor = opc.cinza ? '0.45 g' : '0 g';
    this.ops.push(`BT ${cor} /${fonte} ${tam} Tf ${n2(x0)} ${this.y(y)} Td (${esc}) Tj ET 0 g`);
  }
  /** texto quebrado em linhas dentro da largura; devolve o y da última linha */
  paragrafo(s: string, x: number, y: number, w: number, tam: number, maxLinhas = 99): number {
    const palavras = String(s ?? '').split(/\s+/).filter(Boolean);
    let linha = '';
    let n = 0;
    for (const p of palavras) {
      const tentativa = linha ? `${linha} ${p}` : p;
      if (largura(tentativa, 'F1', tam) > w && linha) {
        if (n >= maxLinhas) return y;
        this.texto(linha, x, y + n * (tam + 1.5), tam);
        n++;
        linha = p;
      } else linha = tentativa;
    }
    if (linha && n < maxLinhas) {
      this.texto(linha, x, y + n * (tam + 1.5), tam);
      n++;
    }
    return y + n * (tam + 1.5);
  }
  marcaDagua(s: string) {
    // texto grande, cinza claro, inclinado no meio da página
    // vai por baixo de tudo (primeiro no conteúdo), para não cobrir os dados
    const esc = s.replace(/[()\\]/g, (c) => '\\' + c);
    this.ops.unshift(`q 0.88 g BT /F2 54 Tf 0.866 0.5 -0.5 0.866 110 230 Tm (${esc}) Tj ET Q`);
  }
}

function montarPdf(paginas: Pagina[]): Uint8Array {
  const objs: string[] = [];
  const fontes = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  // 1 catálogo, 2 páginas, 3 e 4 fontes, depois (página, conteúdo) para cada página
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = fontes[0];
  objs[4] = fontes[1];
  const kids: string[] = [];
  paginas.forEach((p, i) => {
    const pag = 5 + i * 2;
    const cont = pag + 1;
    kids.push(`${pag} 0 R`);
    const stream = p.ops.join('\n');
    objs[pag] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cont} 0 R >>`;
    objs[cont] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${paginas.length} >>`;

  // tudo em Latin-1 (os textos já foram escapados em octal acima de 127)
  let saida = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = saida.length;
    saida += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = saida.length;
  saida += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) saida += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  saida += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(saida.length);
  for (let i = 0; i < saida.length; i++) bytes[i] = saida.charCodeAt(i) & 0xff;
  return bytes;
}

// ---------------- código de barras (Code 128, conjunto C) ----------------
const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');

function codigoBarras(p: Pagina, digitos: string, x: number, y: number, w: number, h: number) {
  const valores = [105];
  for (let i = 0; i < digitos.length; i += 2) valores.push(Number(digitos.slice(i, i + 2)));
  let soma = 105;
  for (let i = 1; i < valores.length; i++) soma += valores[i] * i;
  valores.push(soma % 103, 106);
  const padrao = valores.map((v) => C128[v]).join('');
  const modulos = Array.from(padrao).reduce((t, c) => t + Number(c), 0);
  const m = w / modulos;
  let cx = x;
  Array.from(padrao).forEach((c, i) => {
    const largura = Number(c) * m;
    if (i % 2 === 0) p.barra(cx, y, largura, h);
    cx += largura;
  });
}

// ---------------- DANFE ----------------
const moeda = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const docFmt = (d: string) => {
  const s = (d ?? '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return s;
};
const cepFmt = (c?: string | null) => ((c ?? '').replace(/\D/g, '').length === 8 ? (c ?? '').replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2') : '');
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const horaBr = (iso: string) => iso.slice(11, 19);
const FRETE: Record<string, string> = { '0': '0-Por conta do Remetente', '1': '1-Por conta do Destinatário', '2': '2-Por conta de Terceiros', '3': '3-Próprio Remetente', '4': '4-Próprio Destinatário', '9': '9-Sem Frete' };

/** Campo do DANFE: caixa com o rótulo pequeno em cima e o valor embaixo. */
function campo(p: Pagina, x: number, y: number, w: number, h: number, rotulo: string, valor: string, opc: { alinhar?: 'esq' | 'dir' | 'centro'; tam?: number; negrito?: boolean } = {}) {
  p.caixa(x, y, w, h);
  p.texto(rotulo.toUpperCase(), x + 2, y + 6, 5);
  const tam = opc.tam ?? 8;
  const xv = opc.alinhar === 'dir' ? x + w - 2 : opc.alinhar === 'centro' ? x + w / 2 : x + 2;
  p.texto(valor ?? '', xv, y + h - 3, tam, { alinhar: opc.alinhar, negrito: opc.negrito, largura: w - 4 });
}

const titulo = (p: Pagina, s: string, y: number) => p.texto(s, 20, y, 6.5, { negrito: true });

export function gerarDanfe(n: NotaDanfe): Uint8Array {
  const M = 20; // margem
  const W = 595 - 2 * M;
  const s = totais(n.itens);
  const homolog = n.ambiente === 2;
  const paginas: Pagina[] = [];
  const p = new Pagina();
  paginas.push(p);
  const emit = n.emitente;
  const dest = n.destinatario;
  const destNome = homolog ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : dest.nome;
  const numFmt = String(n.numero).padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
  const chaveFmt = n.chave.replace(/(\d{4})/g, '$1 ').trim();

  // --- canhoto ---
  let y = 15;
  p.caixa(M, y, W - 110, 18);
  p.paragrafo(`RECEBEMOS DE ${emit.nome.toUpperCase()} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO`, M + 2, y + 7, W - 115, 5.5, 2);
  p.caixa(M, y + 18, 110, 22);
  p.texto('DATA DE RECEBIMENTO', M + 2, y + 24, 5);
  p.caixa(M + 110, y + 18, W - 220, 22);
  p.texto('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', M + 112, y + 24, 5);
  p.caixa(M + W - 110, y, 110, 40);
  p.texto('NF-e', M + W - 55, y + 12, 10, { negrito: true, alinhar: 'centro' });
  p.texto(`Nº ${numFmt}`, M + W - 55, y + 24, 8, { negrito: true, alinhar: 'centro' });
  p.texto(`SÉRIE ${String(n.serie).padStart(3, '0')}`, M + W - 55, y + 34, 8, { negrito: true, alinhar: 'centro' });
  y += 44;
  p.linha(M, y, M + W, y, 0.3);
  y += 4;

  // --- cabeçalho: emitente | DANFE | código de barras ---
  const hCab = 92;
  const wEmit = 230;
  const wDanfe = 95;
  p.caixa(M, y, wEmit, hCab);
  p.texto('IDENTIFICAÇÃO DO EMITENTE', M + 2, y + 7, 5);
  let ye = p.paragrafo(emit.nome.toUpperCase(), M + 6, y + 22, wEmit - 12, 9, 2);
  const e = emit.endereco;
  ye = p.paragrafo(`${e.logradouro}, ${e.numero || 'SN'}${e.complemento ? ' ' + e.complemento : ''}`, M + 6, ye + 6, wEmit - 12, 7, 2);
  ye = p.paragrafo(`${e.bairro} - ${cepFmt(e.cep)}`, M + 6, ye + 1, wEmit - 12, 7, 1);
  p.paragrafo(`${e.municipio} - ${e.uf}${e.telefone ? '  Fone: ' + e.telefone : ''}`, M + 6, ye + 1, wEmit - 12, 7, 1);

  const xd = M + wEmit;
  p.caixa(xd, y, wDanfe, hCab);
  p.texto('DANFE', xd + wDanfe / 2, y + 14, 12, { negrito: true, alinhar: 'centro' });
  p.texto('Documento Auxiliar da', xd + wDanfe / 2, y + 24, 6.5, { alinhar: 'centro' });
  p.texto('Nota Fiscal Eletrônica', xd + wDanfe / 2, y + 32, 6.5, { alinhar: 'centro' });
  p.texto('0 - ENTRADA', xd + 8, y + 45, 6.5);
  p.texto('1 - SAÍDA', xd + 8, y + 54, 6.5);
  p.caixa(xd + wDanfe - 24, y + 41, 14, 14);
  p.texto('1', xd + wDanfe - 17, y + 52, 10, { negrito: true, alinhar: 'centro' });
  p.texto(`Nº ${numFmt}`, xd + wDanfe / 2, y + 68, 8, { negrito: true, alinhar: 'centro' });
  p.texto(`SÉRIE ${String(n.serie).padStart(3, '0')}`, xd + wDanfe / 2, y + 78, 8, { negrito: true, alinhar: 'centro' });
  p.texto('FOLHA 1/1', xd + wDanfe / 2, y + 87, 6.5, { alinhar: 'centro' });

  const xb = xd + wDanfe;
  const wb = W - wEmit - wDanfe;
  p.caixa(xb, y, wb, 40);
  codigoBarras(p, n.chave, xb + 6, y + 5, wb - 12, 30);
  p.caixa(xb, y + 40, wb, 22);
  p.texto('CHAVE DE ACESSO', xb + 2, y + 46, 5);
  p.texto(chaveFmt, xb + wb / 2, y + 57, 7.5, { negrito: true, alinhar: 'centro' });
  p.caixa(xb, y + 62, wb, hCab - 62);
  p.paragrafo('Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora', xb + 6, y + 71, wb - 12, 6.5, 3);
  y += hCab;

  // --- natureza / protocolo ---
  const prot = n.protocolo ? `${n.protocolo} - ${n.autorizada_em ? dataBr(n.autorizada_em) + ' ' + horaBr(n.autorizada_em) : ''}` : '';
  campo(p, M, y, wEmit + wDanfe, 20, 'Natureza da operação', n.natureza);
  campo(p, M + wEmit + wDanfe, y, wb, 20, 'Protocolo de autorização de uso', prot, { alinhar: 'centro' });
  y += 20;
  campo(p, M, y, wEmit, 20, 'Inscrição estadual', emit.ie);
  campo(p, M + wEmit, y, wDanfe + 40, 20, 'Insc. estadual do subst. trib.', '');
  campo(p, M + wEmit + wDanfe + 40, y, wb - 40, 20, 'CPF/CNPJ', docFmt(emit.doc));
  y += 26;

  // --- destinatário ---
  titulo(p, 'DESTINATÁRIO / REMETENTE', y);
  y += 3;
  const d = dest.endereco;
  campo(p, M, y, 330, 20, 'Nome / Razão social', destNome);
  campo(p, M + 330, y, 140, 20, 'CNPJ / CPF', docFmt(dest.doc));
  campo(p, M + 470, y, W - 470, 20, 'Data da emissão', dataBr(n.emissao), { alinhar: 'centro' });
  y += 20;
  campo(p, M, y, 260, 20, 'Endereço', `${d.logradouro}, ${d.numero || 'SN'}${d.complemento ? ' ' + d.complemento : ''}`);
  campo(p, M + 260, y, 140, 20, 'Bairro / Distrito', d.bairro);
  campo(p, M + 400, y, 70, 20, 'CEP', cepFmt(d.cep));
  campo(p, M + 470, y, W - 470, 20, 'Data da saída', dataBr(n.emissao), { alinhar: 'centro' });
  y += 20;
  campo(p, M, y, 220, 20, 'Município', d.municipio);
  campo(p, M + 220, y, 100, 20, 'Fone / Fax', d.telefone ?? '');
  campo(p, M + 320, y, 30, 20, 'UF', d.uf, { alinhar: 'centro' });
  campo(p, M + 350, y, 120, 20, 'Inscrição estadual', (dest.ie ?? '').toUpperCase());
  campo(p, M + 470, y, W - 470, 20, 'Hora da saída', horaBr(n.emissao), { alinhar: 'centro' });
  y += 26;

  // --- cálculo do imposto ---
  titulo(p, 'CÁLCULO DO IMPOSTO', y);
  y += 3;
  const c = W / 6;
  const imp1 = [['Base de cálculo do ICMS', s.vBC], ['Valor do ICMS', s.vICMS], ['Base de cálc. ICMS S.T.', 0], ['Valor do ICMS subst.', 0], ['Valor total dos tributos', 0], ['Valor total dos produtos', s.vProd]] as const;
  imp1.forEach(([r, v], i) => campo(p, M + i * c, y, c, 20, r, moeda(v), { alinhar: 'dir' }));
  y += 20;
  const imp2 = [['Valor do frete', 0], ['Valor do seguro', 0], ['Desconto', 0], ['Outras despesas', 0], ['Valor total do IPI', 0], ['Valor total da nota', s.vNF]] as const;
  imp2.forEach(([r, v], i) => campo(p, M + i * c, y, c, 20, r, moeda(v), { alinhar: 'dir', negrito: i === 5 }));
  y += 26;

  // --- transportador ---
  titulo(p, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS', y);
  y += 3;
  const tr = n.transporte;
  const tp = tr.transportadora ?? {};
  campo(p, M, y, 200, 20, 'Nome / Razão social', tp.nome ?? '');
  campo(p, M + 200, y, 100, 20, 'Frete por conta', FRETE[tr.modalidade] ?? tr.modalidade, { tam: 7 });
  campo(p, M + 300, y, 60, 20, 'Código ANTT', '');
  campo(p, M + 360, y, 60, 20, 'Placa do veículo', (tr.placa ?? '').toUpperCase());
  campo(p, M + 420, y, 25, 20, 'UF', (tr.uf_placa ?? '').toUpperCase(), { alinhar: 'centro' });
  campo(p, M + 445, y, W - 445, 20, 'CNPJ / CPF', docFmt(tp.doc ?? ''));
  y += 20;
  campo(p, M, y, 260, 20, 'Endereço', tp.endereco ?? '');
  campo(p, M + 260, y, 160, 20, 'Município', tp.municipio ?? '');
  campo(p, M + 420, y, 25, 20, 'UF', (tp.uf ?? '').toUpperCase(), { alinhar: 'centro' });
  campo(p, M + 445, y, W - 445, 20, 'Inscrição estadual', tp.ie ?? '');
  y += 20;
  const v = tr.volumes ?? {};
  const kg = (x?: number | null) => (x ? (Number(x) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '');
  campo(p, M, y, 70, 20, 'Quantidade', v.quantidade ? qtd(v.quantidade) : '', { alinhar: 'dir' });
  campo(p, M + 70, y, 120, 20, 'Espécie', v.especie ?? '');
  campo(p, M + 190, y, 90, 20, 'Marca', '');
  campo(p, M + 280, y, 90, 20, 'Numeração', '');
  campo(p, M + 370, y, 90, 20, 'Peso bruto', kg(v.peso_bruto), { alinhar: 'dir' });
  campo(p, M + 460, y, W - 460, 20, 'Peso líquido', kg(v.peso_liquido), { alinhar: 'dir' });
  y += 26;

  // --- produtos ---
  titulo(p, 'DADOS DOS PRODUTOS / SERVIÇOS', y);
  y += 3;
  const cols: [string, number, 'esq' | 'dir' | 'centro'][] = [
    ['Código', 40, 'esq'], ['Descrição do produto / serviço', 150, 'esq'], ['NCM', 40, 'centro'], ['CST', 22, 'centro'], ['CFOP', 26, 'centro'], ['Unid.', 24, 'centro'],
    ['Quant.', 45, 'dir'], ['Valor unit.', 50, 'dir'], ['Valor total', 55, 'dir'], ['B. cálc. ICMS', 50, 'dir'], ['Valor ICMS', 30, 'dir'], ['Alíq.', 23, 'dir'],
  ];
  const cabecalho = (pg: Pagina, yy: number) => {
    let x = M;
    for (const [r, w, al] of cols) {
      pg.caixa(x, yy, w, 12);
      pg.texto(r.toUpperCase(), al === 'dir' ? x + w - 2 : al === 'centro' ? x + w / 2 : x + 2, yy + 8, 4.8, { alinhar: al, largura: w - 3 });
      x += w;
    }
    return yy + 12;
  };
  y = cabecalho(p, y);
  const yFimProdutos = 842 - 20 - 110; // espaço dos dados adicionais
  let pagAtual = p;
  let yy = y;
  const fecharColunas = (pg: Pagina, de: number, ate: number) => {
    let x = M;
    for (const [, w] of cols) {
      pg.caixa(x, de, w, ate - de, 0.3);
      x += w;
    }
  };
  let inicioTabela = y;
  n.itens.forEach((it) => {
    const icm = calcularIcms(it);
    const linhasDesc = Math.max(1, Math.ceil(largura(it.descricao, 'F1', 6.5) / (150 - 4)));
    const hLinha = 4 + Math.min(linhasDesc, 4) * 8;
    const limite = pagAtual === p ? yFimProdutos : 842 - 30;
    if (yy + hLinha > limite) {
      fecharColunas(pagAtual, inicioTabela, yy);
      pagAtual = new Pagina();
      paginas.push(pagAtual);
      pagAtual.texto(`DANFE - NF-e Nº ${numFmt} SÉRIE ${String(n.serie).padStart(3, '0')} - continuação dos produtos`, M, 30, 8, { negrito: true });
      yy = cabecalho(pagAtual, 40);
      inicioTabela = yy;
    }
    const vals: string[] = [
      it.codigo, '', it.ncm, `0${it.cst_icms}`, it.cfop, it.unidade,
      qtd(it.quantidade), (it.valor_total / it.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }), moeda(it.valor_total),
      moeda(icm.vBC), moeda(icm.vICMS), it.aliquota_icms ? qtd(it.aliquota_icms) : '0',
    ];
    let x = M;
    cols.forEach(([, w, al], i) => {
      if (i === 1) pagAtual.paragrafo(it.descricao + (it.info ? ` - ${it.info}` : ''), x + 2, yy + 8, w - 4, 6.5, 4);
      else pagAtual.texto(vals[i], al === 'dir' ? x + w - 2 : al === 'centro' ? x + w / 2 : x + 2, yy + 8, 6.5, { alinhar: al, largura: w - 3 });
      x += w;
    });
    yy += hLinha;
  });
  if (pagAtual === p) yy = Math.max(yy, yFimProdutos);
  fecharColunas(pagAtual, inicioTabela, yy);

  // --- dados adicionais (sempre na primeira página) ---
  const ya = yFimProdutos + 6;
  titulo(p, 'DADOS ADICIONAIS', ya);
  p.caixa(M, ya + 3, 360, 100);
  p.texto('INFORMAÇÕES COMPLEMENTARES', M + 2, ya + 9, 5);
  p.paragrafo(n.info_complementar ?? '', M + 3, ya + 18, 354, 6.5, 12);
  p.caixa(M + 360, ya + 3, W - 360, 100);
  p.texto('RESERVADO AO FISCO', M + 362, ya + 9, 5);

  if (paginas.length > 1) {
    paginas.forEach((pg, i) => pg.texto(`FOLHA ${i + 1}/${paginas.length}`, M + W, 842 - 10, 6.5, { alinhar: 'dir' }));
  }
  const marca = n.situacao === 'cancelada' ? 'NF-e CANCELADA' : homolog ? 'SEM VALOR FISCAL' : n.situacao !== 'autorizada' ? 'NÃO AUTORIZADA' : '';
  if (marca) paginas.forEach((pg) => pg.marcaDagua(marca));
  return montarPdf(paginas);
}
