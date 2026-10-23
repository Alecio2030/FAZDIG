// V153: Conciliação bancária.
// O extrato entra por: arquivo OFX do internet banking (lido aqui no app, exato e sem custo),
// foto, PDF ou planilha Excel/CSV (lidos pela IA na função ler-extrato). Cada linha recebe uma
// "impressão digital" (o FITID do OFX ou data+valor+histórico), para o mesmo lançamento nunca entrar duas vezes.
import { supabase } from './supabase';

export type LinhaExtrato = { data: string; valor: number; descricao: string; documento: string | null; id_banco: string };
export type ExtratoLido = {
  origem: 'ofx' | 'foto' | 'pdf' | 'planilha';
  conta: string | null;
  de: string | null;
  ate: string | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
  linhas: LinhaExtrato[];
  arquivo: string | null;
  avisos: string[];
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 -> bytes (sem depender do atob do aparelho). */
function deBase64(b64: string): Uint8Array {
  const limpo = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const saida = new Uint8Array(Math.floor((limpo.length * 3) / 4));
  let j = 0;
  for (let i = 0; i < limpo.length; i += 4) {
    const a = B64.indexOf(limpo[i]), b = B64.indexOf(limpo[i + 1]), c = B64.indexOf(limpo[i + 2] ?? 'A'), d = B64.indexOf(limpo[i + 3] ?? 'A');
    const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    saida[j++] = (n >> 16) & 255;
    if (i + 2 < limpo.length) saida[j++] = (n >> 8) & 255;
    if (i + 3 < limpo.length) saida[j++] = n & 255;
  }
  return saida.slice(0, j);
}

/** Texto do arquivo: tenta UTF-8 e, se não for, Latin-1 (o OFX dos bancos brasileiros costuma vir assim). */
export function textoDeBase64(b64: string): string {
  const bytes = deBase64(b64);
  let latin = '';
  for (let i = 0; i < bytes.length; i++) latin += String.fromCharCode(bytes[i]);
  try {
    return decodeURIComponent(escape(latin));
  } catch {
    return latin;
  }
}

/** Lê o arquivo escolhido (DocumentPicker) e devolve o conteúdo em base64. */
export async function arquivoEmBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return await new Promise<string>((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? '').replace(/^data:[^,]*,/, ''));
    r.onerror = () => erro(new Error('Não foi possível abrir o arquivo.'));
    r.readAsDataURL(blob);
  });
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normal = (t: string) => semAcento(t ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Impressão digital das linhas sem FITID: data|valor|histórico|documento|ordem (lançamentos iguais no mesmo dia ganham 1, 2, 3...). */
export function marcarLinhas(l: Omit<LinhaExtrato, 'id_banco'>[], fitid?: (string | null)[]): LinhaExtrato[] {
  const vistos: Record<string, number> = {};
  return l.map((x, i) => {
    if (fitid?.[i]) return { ...x, id_banco: `ofx:${fitid[i]}` };
    const base = `${x.data}|${x.valor.toFixed(2)}|${normal(x.descricao).slice(0, 60)}|${normal(x.documento ?? '')}`;
    vistos[base] = (vistos[base] ?? 0) + 1;
    return { ...x, id_banco: `h:${base}|${vistos[base]}` };
  });
}

/** OFX (Money) do internet banking: SGML ou XML. */
export function lerOfx(texto: string): ExtratoLido {
  const tag = (bloco: string, nome: string) => {
    const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco);
    return m ? m[1].trim() : null;
  };
  const data = (t: string | null) => (t && /^\d{8}/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null);
  const num = (t: string | null) => {
    if (!t) return null;
    let s = t.replace(/\s/g, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };
  const brutas: Omit<LinhaExtrato, 'id_banco'>[] = [];
  const fitids: (string | null)[] = [];
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  for (const b0 of blocos) {
    const b = b0.split(/<\/STMTTRN>/i)[0];
    const d = data(tag(b, 'DTPOSTED'));
    const v = num(tag(b, 'TRNAMT'));
    if (!d || v == null || v === 0) continue;
    const memo = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' · ');
    brutas.push({ data: d, valor: Math.round(v * 100) / 100, descricao: memo || tag(b, 'TRNTYPE') || 'Lançamento', documento: tag(b, 'CHECKNUM') || tag(b, 'REFNUM') });
    fitids.push(tag(b, 'FITID'));
  }
  // FITID repetido no mesmo arquivo (alguns bancos repetem): vira impressão digital
  const cont: Record<string, number> = {};
  for (const f of fitids) if (f) cont[f] = (cont[f] ?? 0) + 1;
  const fit = fitids.map((f) => (f && cont[f] === 1 ? f : null));
  const bal = texto.split(/<LEDGERBAL>/i)[1] ?? '';
  return {
    origem: 'ofx',
    conta: tag(texto, 'ACCTID'),
    de: data(tag(texto, 'DTSTART')),
    ate: data(tag(texto, 'DTEND')),
    saldo_inicial: null,
    saldo_final: num(tag(bal, 'BALAMT')),
    linhas: marcarLinhas(brutas, fit),
    arquivo: null,
    avisos: blocos.length ? [] : ['O arquivo não tem lançamentos no formato OFX.'],
  };
}

/** Foto, PDF ou planilha: a IA lê no servidor (função ler-extrato). */
export async function lerExtratoIA(base64: string, formato: string, nome: string, origem: 'foto' | 'pdf' | 'planilha'): Promise<ExtratoLido | { erro: string }> {
  const { data: d, error } = await supabase.functions.invoke('ler-extrato', { body: { conteudo: base64, formato, nome } });
  if (error) {
    let msg = 'Não foi possível ler o extrato agora.';
    try {
      const j = await (error as any).context?.json();
      if (j?.erro) msg = j.erro;
    } catch {
      /* mantém a mensagem padrão */
    }
    return { erro: msg };
  }
  const x = d?.dados ?? {};
  const avisos: string[] = [];
  if (x.legivel === false) avisos.push('Quase nada pôde ser lido.');
  if (d?.cortado) avisos.push('O extrato é longo: pode ter ficado parte de fora. Confira o saldo final.');
  if ((x.nao_lido ?? []).length) avisos.push(`Não veio na leitura: ${(x.nao_lido as string[]).join(', ')}.`);
  const iso = (t: any) => (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null);
  const brutas = ((x.lancamentos ?? []) as any[])
    .map((l) => ({ data: iso(l.data), valor: Math.round(Number(l.valor) * 100) / 100, descricao: String(l.descricao ?? '').trim() || 'Lançamento', documento: l.documento ? String(l.documento) : null }))
    .filter((l) => l.data && Number.isFinite(l.valor) && l.valor !== 0) as Omit<LinhaExtrato, 'id_banco'>[];
  const soma = brutas.reduce((t, l) => t + l.valor, 0);
  if (x.saldo_inicial != null && x.saldo_final != null && Math.abs(Number(x.saldo_inicial) + soma - Number(x.saldo_final)) > 0.05) {
    avisos.push(`Atenção: saldo anterior + lançamentos (${(Number(x.saldo_inicial) + soma).toFixed(2)}) não bate com o saldo final lido (${Number(x.saldo_final).toFixed(2)}). Confira a leitura.`);
  }
  return {
    origem,
    conta: x.conta ?? null,
    de: iso(x.periodo_de) ?? (brutas.length ? brutas.map((l) => l.data).sort()[0] : null),
    ate: iso(x.periodo_ate) ?? (brutas.length ? brutas.map((l) => l.data).sort().slice(-1)[0] : null),
    saldo_inicial: x.saldo_inicial != null ? Number(x.saldo_inicial) : null,
    saldo_final: x.saldo_final != null ? Number(x.saldo_final) : null,
    linhas: marcarLinhas(brutas),
    arquivo: d?.arquivo ?? null,
    avisos,
  };
}

/** Tipo de despesa/receita sugerido pelo histórico do banco (a pessoa confere). */
export function sugerirTipo(descricao: string, entrada: boolean): string | null {
  const t = normal(descricao);
  if (entrada) {
    if (/\bREND|RENDIMENTO|JUROS|REMUNERACAO|RESGATE/.test(t)) return 'rendimentos';
    if (/ARRENDAMENTO|ALUGUEL/.test(t)) return 'arrendamento';
    if (/LEITE|LATICINIO/.test(t)) return 'venda_leite';
    return null;
  }
  if (/TARIFA|\bTAR\b|CESTA|PACOTE|MANUT CONTA|ANUIDADE|TAXA/.test(t)) return 'tarifas';
  if (/\bIOF\b|JUROS|ENCARGO|CHEQUE ESPECIAL|LIMITE/.test(t)) return 'juros';
  if (/ENERGIA|CEMIG|ENEL|EDP|COPEL|ELEKTRO|ENERGISA|CELESC|NEOENERGIA|COELBA|LIGHT/.test(t)) return 'energia';
  if (/SEGURO|SEGURADORA|MAPFRE|PORTO SEGURO|BRADESCO SEG/.test(t)) return 'seguros';
  if (/\bINSS\b|FGTS|\bGPS\b|ESOCIAL|DAE\b/.test(t)) return 'encargos';
  if (/DARF|\bITR\b|IPVA|LICENCIAMENTO|DETRAN|SEFAZ|PREFEITURA/.test(t)) return 'impostos';
  if (/VIVO|CLARO|\bTIM\b|\bOI\b|INTERNET|STARLINK|TELEFON/.test(t)) return 'internet';
  if (/POSTO|COMBUST|DIESEL|SHELL|IPIRANGA|PETROBRAS/.test(t)) return 'combustivel';
  return null;
}
