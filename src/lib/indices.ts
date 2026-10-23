// Indexadores de correção monetária: busca automática no Banco Central (SGS, dados abertos e gratuitos)
// e a conta da atualização de um contrato até uma data (só informação, nada é gravado).
import { diasEntre } from './reproducao';
import { r2, taxaEntreDatas, umPeriodoAntes, type JurosTipo, type Periodicidade } from './financiamentos';

export type CodigoIndice = 'ipca' | 'inpc' | 'igpm' | 'tr' | 'cdi' | 'selic' | 'outro';
export type OrdemCm = 'corrigido' | 'separado';

/** tipo: mensal = índice de preço do mês; diario = taxa por dia útil; tr = taxa de um mês a partir de cada dia. */
export const INDICES: { valor: CodigoIndice; rotulo: string; serie: number | null; tipo: 'mensal' | 'diario' | 'tr' | 'manual' }[] = [
  { valor: 'ipca', rotulo: 'IPCA', serie: 433, tipo: 'mensal' },
  { valor: 'inpc', rotulo: 'INPC', serie: 188, tipo: 'mensal' },
  { valor: 'igpm', rotulo: 'IGP-M', serie: 189, tipo: 'mensal' },
  { valor: 'tr', rotulo: 'TR', serie: 226, tipo: 'tr' },
  { valor: 'cdi', rotulo: 'CDI', serie: 12, tipo: 'diario' },
  { valor: 'selic', rotulo: 'Selic', serie: 11, tipo: 'diario' },
  { valor: 'outro', rotulo: 'Outro', serie: null, tipo: 'manual' },
];
export const ROTULO_INDICE: Record<string, string> = Object.fromEntries(INDICES.map((i) => [i.valor, i.rotulo]));
export const OPCOES_ORDEM = [
  { valor: 'corrigido', rotulo: 'Juros sobre o saldo corrigido' },
  { valor: 'separado', rotulo: 'Correção e juros separados' },
];
/** CDI e Selic são taxa flutuante, paga junto com os juros; os outros corrigem o saldo desde a liberação. */
export const indiceFlutuante = (c: string | null | undefined) => c === 'cdi' || c === 'selic';

const brDeIso = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const isoDeBr = (br: string) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;
const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type Ponto = { data: string; fim: string | null; valor: number };

async function buscarSerie(serie: number, de: string, ate: string): Promise<Ponto[]> {
  const pontos: Ponto[] = [];
  // o Banco Central limita as séries diárias a janelas de 10 anos: busca em pedaços de 9
  let ini = de;
  while (ini <= ate) {
    const limite = `${Number(ini.slice(0, 4)) + 9}${ini.slice(4)}`;
    const fim = limite < ate ? limite : ate;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${brDeIso(ini)}&dataFinal=${brDeIso(fim)}`, { signal: ctl.signal });
      // sem dados no período o Banco Central responde 404
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) {
          for (const x of j) {
            const v = Number(String(x?.valor ?? '').replace(',', '.'));
            if (x?.data && Number.isFinite(v)) pontos.push({ data: isoDeBr(String(x.data)), fim: x.datafim ? isoDeBr(String(x.datafim)) : null, valor: v });
          }
        }
      } else if (r.status !== 404) throw new Error('O Banco Central não respondeu. Tente de novo em instantes ou informe a variação do índice à mão.');
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('O Banco Central está demorando a responder. Tente de novo ou informe a variação do índice à mão.');
      if (/network request failed|failed to fetch|load failed/i.test(String(e?.message))) throw new Error('Não foi possível buscar o índice no Banco Central (sem internet ou acesso bloqueado). Informe a variação do índice à mão.');
      throw e;
    } finally {
      clearTimeout(t);
    }
    if (fim >= ate) break;
    ini = fim;
  }
  return pontos;
}

export type Acumulado = {
  /** fator de correção do período (1,0321 = 3,21%) */
  fator: number;
  /** o que entrou na conta, para mostrar: "03/2026 a 08/2026 (6 meses)" */
  descricao: string;
  /** aviso quando o índice ainda não saiu até a data pedida */
  aviso: string | null;
};

/** Índice acumulado entre duas datas, com o percentual do indexador contratado (100 = o índice cheio). */
export async function indiceAcumulado(codigo: CodigoIndice, de: string, ate: string, perc = 100): Promise<Acumulado> {
  const info = INDICES.find((i) => i.valor === codigo);
  if (!info || !info.serie) throw new Error('Este indexador não tem busca automática: informe a variação à mão.');
  if (!(ate > de)) return { fator: 1, descricao: 'sem período a corrigir', aviso: null };
  const k = perc / 100;

  if (info.tipo === 'mensal') {
    // índices de preço: valem os meses cheios, do mês da data inicial ao mês anterior ao da data final
    const mesIni = `${de.slice(0, 7)}-01`;
    const mesFim = `${ate.slice(0, 7)}-01`;
    if (mesIni >= mesFim) return { fator: 1, descricao: 'período dentro do mesmo mês: sem índice a aplicar', aviso: null };
    const pontos = (await buscarSerie(info.serie, mesIni, ate)).filter((p) => p.data >= mesIni && p.data < mesFim).sort((a, b) => (a.data < b.data ? -1 : 1));
    if (!pontos.length) return { fator: 1, descricao: 'nenhum índice publicado para o período', aviso: `O ${info.rotulo} dos meses pedidos ainda não foi publicado.` };
    const fator = pontos.reduce((f, p) => f * (1 + (p.valor / 100) * k), 1);
    const ultimo = pontos[pontos.length - 1].data;
    const esperado = (Number(mesFim.slice(0, 4)) - Number(mesIni.slice(0, 4))) * 12 + Number(mesFim.slice(5, 7)) - Number(mesIni.slice(5, 7));
    return {
      fator,
      descricao: `${mesAno(pontos[0].data)} a ${mesAno(ultimo)} (${pontos.length} ${pontos.length === 1 ? 'mês' : 'meses'})`,
      aviso: pontos.length < esperado ? `O ${info.rotulo} só está publicado até ${mesAno(ultimo)}: os meses seguintes ficaram de fora.` : null,
    };
  }

  if (info.tipo === 'diario') {
    // taxa de cada dia útil, da data inicial até a véspera da data final
    const pontos = (await buscarSerie(info.serie, de, ate)).filter((p) => p.data >= de && p.data < ate).sort((a, b) => (a.data < b.data ? -1 : 1));
    if (!pontos.length) return { fator: 1, descricao: 'nenhuma taxa publicada para o período', aviso: `O ${info.rotulo} do período ainda não foi publicado.` };
    const fator = pontos.reduce((f, p) => f * (1 + (p.valor / 100) * k), 1);
    const ultimo = pontos[pontos.length - 1].data;
    return {
      fator,
      descricao: `${brDeIso(pontos[0].data)} a ${brDeIso(ultimo)} (${pontos.length} dias úteis)`,
      aviso: diasEntre(ultimo, ate) > 5 ? `O ${info.rotulo} só está publicado até ${brDeIso(ultimo)}: os dias seguintes ficaram de fora.` : null,
    };
  }

  // TR: cada dia traz a taxa de um mês a partir dele; encadeia os meses inteiros desde a data inicial
  const pontos = await buscarSerie(info.serie, de, ate);
  const porData = new Map(pontos.map((p) => [p.data, p]));
  let fator = 1;
  let meses = 0;
  let cur = de;
  for (let i = 0; i < 1200; i++) {
    const p = porData.get(cur);
    const fim = p ? p.fim ?? somarUmMes(cur) : null;
    if (!p || !fim || fim > ate || fim <= cur) break;
    fator *= 1 + (p.valor / 100) * k;
    meses += 1;
    cur = fim;
  }
  const faltou = diasEntre(cur, ate) >= 31;
  return {
    fator,
    descricao: meses ? `${brDeIso(de)} a ${brDeIso(cur)} (${meses} ${meses === 1 ? 'mês' : 'meses'})` : 'menos de um mês: sem TR a aplicar',
    aviso: faltou ? `A TR só está publicada até ${brDeIso(cur)}: o período seguinte ficou de fora.` : null,
  };
}

function somarUmMes(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

// ---------- atualização do contrato até uma data ----------
export type DadosAtualizacao = {
  /** principal em aberto */
  principal: number;
  /** juros da carência já somados pelo banco e ainda não pagos (contratos com a carência dividida nas parcelas) */
  cotas: number;
  taxaAnual: number;
  jurosTipo: JurosTipo;
  baseDias: number;
  jurosDesde: string;
  ate: string;
  /** fator de correção do período (1 = sem correção) */
  fatorCm: number;
  ordem: OrdemCm;
};
export type Atualizacao = { cm: number; juros: number; total: number; dias: number; taxaPeriodo: number };

export function atualizarSaldo(d: DadosAtualizacao): Atualizacao {
  const base = d.principal + d.cotas;
  const cm = r2(base * (d.fatorCm - 1));
  const taxa = taxaEntreDatas(d.taxaAnual, d.jurosTipo, d.baseDias, d.jurosDesde, d.ate);
  // corrigido: primeiro a correção, depois os juros sobre o saldo corrigido (o usual nos bancos); separado: os dois sobre o saldo original
  const juros = r2((d.ordem === 'corrigido' ? base * d.fatorCm : base) * taxa);
  return { cm, juros, total: r2(base + cm + juros), dias: d.ate > d.jurosDesde ? diasEntre(d.jurosDesde, d.ate) : 0, taxaPeriodo: taxa };
}

/**
 * De quando contam os juros ainda não pagos:
 * - do vencimento da última parcela paga;
 * - sem parcela paga, em contrato já em andamento ou com juros pagos a cada período: do último vencimento de período antes da data;
 * - com a carência dividida nas parcelas: de um período antes da primeira parcela em aberto (antes disso os juros estão nas cotas);
 * - nos demais: da liberação.
 */
export function jurosDesdePadrao(x: {
  liberacao: string;
  ate: string;
  ultimaPaga: string | null;
  primeiraAberta: string | null;
  emAndamento: boolean;
  jurosCarencia: string;
  sistema: string;
  periodicidade: Periodicidade;
  periodicidadeDias: number;
}): string {
  if (x.ultimaPaga) return x.ultimaPaga;
  if (!x.primeiraAberta || x.sistema === 'unico') return x.liberacao;
  if (x.jurosCarencia === 'fixos' && x.sistema === 'sac') {
    const umAntes = umPeriodoAntes(x.primeiraAberta, x.periodicidade, x.periodicidadeDias);
    const desde = umAntes < x.liberacao ? x.liberacao : umAntes;
    return desde < x.ate ? desde : x.ate;
  }
  if (x.emAndamento || (x.jurosCarencia === 'pagos' && x.sistema === 'sac')) {
    // os juros da primeira parcela em aberto contam de um período antes dela; com carência, do último período já vencido
    let b = umPeriodoAntes(x.primeiraAberta, x.periodicidade, x.periodicidadeDias);
    for (let i = 0; i < 600 && b >= x.ate && b > x.liberacao; i++) b = umPeriodoAntes(b, x.periodicidade, x.periodicidadeDias);
    return b < x.liberacao ? x.liberacao : b;
  }
  return x.liberacao;
}
