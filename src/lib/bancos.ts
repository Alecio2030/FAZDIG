// Bancos: tabela dos números (código de compensação) e o cadastro de banco + agência em Pessoas.
import { supabase } from './supabase';

/** Número do banco (3 dígitos) -> nome usual. Os que não estão aqui são buscados na internet (BrasilAPI, gratuita). */
export const BANCOS: Record<string, string> = {
  '001': 'Banco do Brasil',
  '003': 'Banco da Amazônia',
  '004': 'Banco do Nordeste',
  '007': 'BNDES',
  '021': 'Banestes',
  '033': 'Santander',
  '037': 'Banpará',
  '041': 'Banrisul',
  '047': 'Banese',
  '069': 'Crefisa',
  '070': 'BRB',
  '077': 'Banco Inter',
  '084': 'Uniprime',
  '085': 'Ailos',
  '097': 'Credisis',
  '104': 'Caixa Econômica Federal',
  '121': 'Agibank',
  '133': 'Cresol',
  '136': 'Unicred',
  '197': 'Stone',
  '208': 'BTG Pactual',
  '212': 'Banco Original',
  '217': 'Banco John Deere',
  '218': 'Banco BS2',
  '237': 'Bradesco',
  '246': 'Banco ABC Brasil',
  '254': 'Paraná Banco',
  '260': 'Nubank',
  '290': 'PagBank',
  '318': 'Banco BMG',
  '323': 'Mercado Pago',
  '336': 'C6 Bank',
  '341': 'Itaú',
  '380': 'PicPay',
  '389': 'Mercantil do Brasil',
  '403': 'Cora',
  '422': 'Banco Safra',
  '604': 'Banco Industrial do Brasil',
  '623': 'Banco Pan',
  '633': 'Banco Rendimento',
  '637': 'Banco Sofisa',
  '643': 'Banco Pine',
  '655': 'Banco BV (Votorantim)',
  '707': 'Daycoval',
  '745': 'Citibank',
  '747': 'Rabobank',
  '748': 'Sicredi',
  '752': 'BNP Paribas',
  '756': 'Sicoob',
};

export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const soLetrasNumeros = (t: string) => t.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();

/** "1" ou "01" -> "001" (o número do banco tem 3 dígitos). Vazio se não houver dígito. */
export function numeroBanco(t: string | null | undefined): string {
  const d = (t ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d ? d.padStart(3, '0') : '';
}

/** Nome do banco pelo número, na tabela do sistema. */
export const nomeDoNumero = (numero: string) => BANCOS[numeroBanco(numero)] ?? null;

/** Número do banco pelo nome (igual, sem ligar para acento e maiúscula). */
export function numeroDoNome(nome: string): string | null {
  const k = semAcento(nome);
  if (!k) return null;
  const achado = Object.entries(BANCOS).find(([, n]) => semAcento(n) === k || semAcento(n).replace(/^banco (do |da )?/, '') === k);
  return achado ? achado[0] : null;
}

/** Bancos da tabela parecidos com o texto digitado (número ou parte do nome). */
export function sugerirBancos(texto: string, maximo = 6): { numero: string; nome: string }[] {
  const k = semAcento(texto);
  if (k.length < 2) return [];
  return Object.entries(BANCOS)
    .filter(([num, nome]) => semAcento(nome).includes(k) || num.includes(k))
    .sort((a, b) => Number(semAcento(b[1]).startsWith(k)) - Number(semAcento(a[1]).startsWith(k)) || a[1].localeCompare(b[1]))
    .slice(0, maximo)
    .map(([numero, nome]) => ({ numero, nome }));
}

/** Banco que não está na tabela: busca o nome pelo número na BrasilAPI (dados do Banco Central). null se não achar ou sem internet. */
export async function buscarBancoNaInternet(numero: string): Promise<string | null> {
  const num = numeroBanco(numero);
  if (!num) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`https://brasilapi.com.br/api/banks/v1/${Number(num)}`, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const nome = String(j?.name ?? j?.fullName ?? '').trim();
    return nome || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- banco + agência cadastrados (Pessoas › Banco) ----------
export type BancoCadastrado = { id: string; nome: string; banco_numero: string | null; agencia: string | null; agencia_local: string | null };
export type BancoDigitado = { numero: string; nome: string; agencia: string; local: string };

export async function carregarBancos(): Promise<BancoCadastrado[]> {
  const { data, error } = await supabase.from('pessoas').select('id, nome, banco_numero, agencia, agencia_local').contains('tipos', ['banco']).eq('ativo', true).order('nome');
  if (error) throw error;
  return (data ?? []) as BancoCadastrado[];
}

/** "Cresol · ag. 1040 Marilândia" */
export function rotuloBanco(b: { nome: string; banco_numero?: string | null; agencia?: string | null; agencia_local?: string | null }): string {
  const ag = [b.agencia, b.agencia_local].filter(Boolean).join(' ');
  return [b.banco_numero ? `${numeroBanco(b.banco_numero)} ${b.nome}` : b.nome, ag ? `ag. ${ag}` : null].filter(Boolean).join(' · ');
}

const mesmoBanco = (b: BancoCadastrado, d: BancoDigitado) => {
  const num = numeroBanco(d.numero);
  if (num && b.banco_numero && numeroBanco(b.banco_numero) === num) return true;
  return !!semAcento(d.nome) && semAcento(b.nome) === semAcento(d.nome);
};
const semAgencia = (b: BancoCadastrado) => !b.agencia?.trim() && !b.agencia_local?.trim();

/**
 * Acha o cadastro do banco + agência digitados.
 * - mesma agência (pelo número ou pelo nome/local): é esse;
 * - o banco está cadastrado sem agência nenhuma: é esse, e a agência digitada completa o cadastro;
 * - senão, é um banco/agência novo (null).
 */
export function acharBanco(lista: BancoCadastrado[], d: BancoDigitado): BancoCadastrado | null {
  if (!numeroBanco(d.numero) && !semAcento(d.nome)) return null;
  const doBanco = lista.filter((b) => mesmoBanco(b, d));
  if (!doBanco.length) return null;
  const ag = soLetrasNumeros(d.agencia);
  const local = semAcento(d.local);
  if (!ag && !local) return doBanco.find(semAgencia) ?? (doBanco.length === 1 ? doBanco[0] : null);
  const igual = doBanco.find((b) => {
    const bAg = soLetrasNumeros(b.agencia ?? '');
    const bLocal = semAcento(b.agencia_local ?? '');
    const comparaAg = !!ag && !!bAg;
    const comparaLocal = !!local && !!bLocal;
    if (!comparaAg && !comparaLocal) return false;
    return (!comparaAg || ag === bAg) && (!comparaLocal || local === bLocal);
  });
  return igual ?? doBanco.find(semAgencia) ?? null;
}

/** Agências já cadastradas do banco digitado. */
export const agenciasDoBanco = (lista: BancoCadastrado[], d: BancoDigitado) => lista.filter((b) => mesmoBanco(b, d) && !semAgencia(b));

/**
 * Ao gravar: devolve o id do banco + agência. Cadastra em Pessoas › Banco se for novo;
 * se já existe, completa o que estava em branco (número do banco, agência, local).
 */
export async function resolverBanco(lista: BancoCadastrado[], d: BancoDigitado): Promise<{ id: string; novo: boolean }> {
  const dados = {
    banco_numero: numeroBanco(d.numero) || null,
    agencia: d.agencia.trim() || null,
    agencia_local: d.local.trim() || null,
  };
  const existente = acharBanco(lista, d);
  if (existente) {
    const falta: Record<string, string> = {};
    if (!existente.banco_numero && dados.banco_numero) falta.banco_numero = dados.banco_numero;
    if (!existente.agencia?.trim() && dados.agencia) falta.agencia = dados.agencia;
    if (!existente.agencia_local?.trim() && dados.agencia_local) falta.agencia_local = dados.agencia_local;
    // completar é um extra: se não der (permissão), o contrato é gravado do mesmo jeito
    if (Object.keys(falta).length) await supabase.from('pessoas').update(falta).eq('id', existente.id);
    return { id: existente.id, novo: false };
  }
  const { data, error } = await supabase.from('pessoas').insert({ nome: d.nome.trim(), tipos: ['banco'], ...dados }).select('id').single();
  if (error) throw error;
  return { id: (data as any).id, novo: true };
}
