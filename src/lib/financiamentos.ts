// Financiamentos: taxas (anual -> mensal e diária), tabela de parcelas (Price, SAC, pagamento único) e carência.
import { diasEntre, somarDias } from './reproducao';

export type Sistema = 'price' | 'sac' | 'unico';
export type Periodicidade = 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'dias';
export type JurosTipo = 'simples' | 'composto';

export const SISTEMAS: { valor: Sistema; rotulo: string; explica: string }[] = [
  { valor: 'price', rotulo: 'SPC · Parcelas iguais', explica: 'SPC, Sistema de Prestação Constante (tabela Price): parcelas fixas iguais, com principal e juros juntos.' },
  { valor: 'sac', rotulo: 'SAC · Principal fixo + juros', explica: 'SAC, Sistema de Amortização Constante: principal igual em todas as parcelas, mais os juros do saldo devedor; a parcela vai diminuindo.' },
  { valor: 'unico', rotulo: 'Pagamento único', explica: 'Saldo devedor mais os juros, pagos de uma vez no vencimento.' },
];
export const PERIODICIDADES: { valor: Periodicidade; rotulo: string; meses: number }[] = [
  { valor: 'mensal', rotulo: 'Mensal', meses: 1 },
  { valor: 'bimestral', rotulo: 'Bimestral', meses: 2 },
  { valor: 'trimestral', rotulo: 'Trimestral', meses: 3 },
  { valor: 'semestral', rotulo: 'Semestral', meses: 6 },
  { valor: 'anual', rotulo: 'Anual', meses: 12 },
  { valor: 'dias', rotulo: 'Outro (dias)', meses: 0 },
];
export const FINALIDADES = [
  { valor: 'custeio', rotulo: 'Custeio' },
  { valor: 'investimento', rotulo: 'Investimento' },
  { valor: 'comercializacao', rotulo: 'Comercialização' },
  { valor: 'outro', rotulo: 'Outro' },
];
export const ROTULO_FINALIDADE: Record<string, string> = Object.fromEntries(FINALIDADES.map((f) => [f.valor, f.rotulo]));
export const ROTULO_SISTEMA: Record<string, string> = Object.fromEntries(SISTEMAS.map((s) => [s.valor, s.rotulo]));

export const r2 = (x: number) => Math.round(x * 100) / 100;

/** Mesma data, n meses à frente (ou atrás); dia 31 num mês de 30 vira o último dia do mês. */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Taxa (fração, não %) de um período de "dias", a partir da taxa anual em %. */
export function taxaPeriodo(anualPerc: number, dias: number, tipo: JurosTipo, base: number): number {
  const a = anualPerc / 100;
  if (dias <= 0 || a <= 0) return 0;
  return tipo === 'composto' ? Math.pow(1 + a, dias / base) - 1 : (a * dias) / base;
}
/**
 * Taxa mensal do contrato (fração). O banco contrata a taxa ao mês com 2 casas (5,79% a.m.) e a anual sai dela (96,49% a.a.);
 * quando a mensal arredondada refaz a anual informada, é ela que vale. Senão, vale a mensal exata.
 */
export function taxaMensalContrato(anualPerc: number, tipo: JurosTipo): number {
  const a = anualPerc / 100;
  if (!(a > 0)) return 0;
  if (tipo !== 'composto') return a / 12;
  const exata = Math.pow(1 + a, 1 / 12) - 1;
  const arred = Math.round(exata * 10000) / 10000;
  return arred > 0 && Math.abs((Math.pow(1 + arred, 12) - 1) * 100 - anualPerc) < 0.005 ? arred : exata;
}
/** Taxa mensal em %, a partir da anual. */
export const taxaMensal = (anualPerc: number, tipo: JurosTipo) => taxaMensalContrato(anualPerc, tipo) * 100;
/** Taxa diária em %, a partir da anual e da base de dias do ano (360 ou 365). */
export const taxaDiaria = (anualPerc: number, tipo: JurosTipo, base: number) => taxaPeriodo(anualPerc, 1, tipo, base) * 100;

export type DadosCalculo = {
  /** principal que falta pagar (valor liberado menos o principal já pago) */
  saldo: number;
  sistema: Sistema;
  parcelas: number;
  periodicidade: Periodicidade;
  periodicidadeDias: number;
  /** primeiro vencimento (aaaa-mm-dd) */
  primeiro: string;
  /** de quando os juros começam a contar (a liberação; em contrato já em andamento, um período antes do próximo vencimento) */
  inicio: string;
  taxaAnual: number;
  jurosTipo: JurosTipo;
  baseDias: number;
  /** juros do tempo de carência: somam ao saldo; são pagos a cada período, em parcelas só de juros; ou vêm todos na primeira parcela */
  jurosCarencia: 'capitalizados' | 'pagos' | 'primeira' | 'fixos';
  /** 'fixos': juros da carência que o banco somou ao saldo e dividiu em cotas iguais; é o valor da cota de cada parcela */
  carenciaCota?: number;
  /** hoje (aaaa-mm-dd): pagamentos só de juros da carência anteriores a esta data não são criados */
  hoje?: string;
  /** Parcelas iguais: valor da parcela que está no contrato. Informado, a parcela é essa e o sistema só divide principal e juros. */
  parcelaFixa?: number;
};
export type ParcelaCalc = { numero: number; vencimento: string; principal: number; juros: number; valor: number; saldo: number; soJuros: boolean };

/** Data do vencimento k (0 = o primeiro; negativo = períodos antes dele). */
function dataDoPeriodo(d: DadosCalculo, k: number): string {
  const meses = PERIODICIDADES.find((p) => p.valor === d.periodicidade)?.meses ?? 0;
  return meses > 0 ? somarMeses(d.primeiro, k * meses) : somarDias(d.primeiro, k * Math.max(1, d.periodicidadeDias));
}

/** Um período antes do primeiro vencimento: de onde contam os juros da primeira parcela quando não há carência. */
export function umPeriodoAntes(primeiro: string, periodicidade: Periodicidade, periodicidadeDias: number): string {
  return dataDoPeriodo({ primeiro, periodicidade, periodicidadeDias } as DadosCalculo, -1);
}

/** Taxa de um período de parcelas. Nas periodicidades em meses vale a taxa do mês cheio (30/360), como os bancos calculam, e não os dias corridos. */
export function taxaDaParcela(d: Pick<DadosCalculo, 'periodicidade' | 'periodicidadeDias' | 'taxaAnual' | 'jurosTipo' | 'baseDias'>): number {
  const meses = PERIODICIDADES.find((p) => p.valor === d.periodicidade)?.meses ?? 0;
  const a = d.taxaAnual / 100;
  if (a <= 0) return 0;
  if (meses > 0) return d.jurosTipo === 'composto' ? Math.pow(1 + taxaMensalContrato(d.taxaAnual, d.jurosTipo), meses) - 1 : (a * meses) / 12;
  return taxaPeriodo(d.taxaAnual, Math.max(1, d.periodicidadeDias), d.jurosTipo, d.baseDias);
}

/** Quanto de saldo uma parcela de 1,00 paga em n períodos à taxa i. */
const fatorPrice = (i: number, n: number) => (i > 0 ? (1 - Math.pow(1 + i, -n)) / i : n);

/** Taxa por período que faz n parcelas de valor P quitarem o saldo. */
function taxaQueFecha(saldo: number, P: number, n: number): number {
  if (P * n <= saldo) return 0;
  let baixo = 0;
  let alto = 1;
  for (let k = 0; k < 100; k++) {
    const meio = (baixo + alto) / 2;
    if (P * fatorPrice(meio, n) > saldo) baixo = meio;
    else alto = meio;
  }
  return (baixo + alto) / 2;
}

/** Há carência quando entre o início dos juros e o primeiro vencimento cabe mais de um período (com 5 dias de folga). */
export function temCarencia(d: Pick<DadosCalculo, 'sistema' | 'periodicidade' | 'periodicidadeDias' | 'primeiro' | 'inicio'>): boolean {
  if (d.sistema === 'unico' || !d.primeiro || !d.inicio) return false;
  const umAntes = dataDoPeriodo(d as DadosCalculo, -1);
  return diasEntre(d.inicio, umAntes) > 5;
}

/** Fração de ano entre duas datas pelo ano civil: os dias que caem em cada ano, divididos por 365 ou 366 (como o banco conta). */
export function fracaoAnoCivil(de: string, ate: string): number {
  let t = 0;
  let cur = de;
  let ano = Number(de.slice(0, 4));
  while (cur < ate) {
    const fimDoAno = `${ano}-12-31`; // o dia inicial não conta e o final conta: 31/12 fecha o ano
    const lim = fimDoAno < ate ? fimDoAno : ate;
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    t += diasEntre(cur, lim) / (bissexto ? 366 : 365);
    cur = lim;
    ano += 1;
  }
  return t;
}

/**
 * Tabela de parcelas. O principal das parcelas sempre fecha com o saldo informado;
 * juros de carência que somam ao saldo aparecem como juros, distribuídos nas parcelas.
 */
export function gerarParcelas(d: DadosCalculo): ParcelaCalc[] {
  if (!(d.saldo > 0) || !d.primeiro || !d.inicio || d.primeiro <= d.inicio) return [];
  // sem quantidade de parcelas informada não há tabela (o campo abre zerado)
  if (d.sistema !== 'unico' && !(Math.floor(d.parcelas) >= 1)) return [];
  const n = d.sistema === 'unico' ? 1 : Math.max(1, Math.min(480, Math.floor(d.parcelas)));
  // Parcelas iguais: o valor da parcela vem do contrato e os vencimentos seguem a data informada da 1ª parcela.
  // Por isso a carência (juros extras na 1ª parcela ou parcelas só de juros desde a liberação) não se aplica.
  const carenciaModo = d.sistema === 'price' ? 'capitalizados' : d.jurosCarencia;
  // 'pagos': os juros da carência são pagos a cada período, então cada parcela só traz os juros do seu período.
  // Pagamentos só de juros que já venceram não entram (já foram pagos); só entram os que ainda vão vencer.
  const hoje = d.hoje ?? new Date().toISOString().slice(0, 10);
  const taxa = (dias: number) => taxaPeriodo(d.taxaAnual, dias, d.jurosTipo, d.baseDias);
  // Juros entre duas datas. Base "ano civil" (365): um ano cheio rende exatamente a taxa anual, com ano bissexto e tudo.
  const taxaEntre = (de: string, ate: string) => {
    if (d.baseDias !== 365) return taxa(diasEntre(de, ate));
    const a = d.taxaAnual / 100;
    const t = fracaoAnoCivil(de, ate);
    if (!(a > 0) || !(t > 0)) return 0;
    return d.jurosTipo === 'composto' ? Math.pow(1 + a, t) - 1 : a * t;
  };
  const lista: ParcelaCalc[] = [];
  let principalFalta = r2(d.saldo); // o que falta do principal de verdade
  let base = d.saldo; // saldo sobre o qual os juros correm (pode incluir juros de carência capitalizados)
  let anterior = d.inicio;

  // juros da carência cobrados todos na primeira parcela (só nas parcelas iguais; nos outros sistemas a 1ª já conta os dias desde a liberação)
  let jurosNaPrimeira = 0;
  if (carenciaModo === 'fixos') {
    // O banco já somou os juros da carência ao saldo e dividiu em cotas iguais, uma por parcela (valor copiado do contrato).
    // Os juros das parcelas correm sobre o saldo com essas cotas, a partir de um período antes do 1º vencimento.
    base = d.saldo + n * Math.max(0, d.carenciaCota ?? 0);
    const umAntes = dataDoPeriodo(d, -1);
    if (umAntes > anterior) anterior = umAntes;
  } else if (temCarencia(d) && carenciaModo === 'primeira') {
    if (d.sistema === 'price') jurosNaPrimeira = r2(base * taxa(diasEntre(d.inicio, dataDoPeriodo(d, -1))));
  } else if (temCarencia(d)) {
    if (carenciaModo === 'pagos') {
      const datas: string[] = [];
      for (let k = 1; k < 600; k++) {
        const dt = dataDoPeriodo(d, -k);
        if (diasEntre(d.inicio, dt) <= 5) break;
        datas.unshift(dt);
      }
      for (const dt of datas) {
        if (dt < hoje) {
          anterior = dt;
          continue;
        }
        const j = r2(base * taxaEntre(anterior, dt));
        lista.push({ numero: 0, vencimento: dt, principal: 0, juros: j, valor: j, saldo: principalFalta, soJuros: true });
        anterior = dt;
      }
    } else {
      const dt = dataDoPeriodo(d, -1);
      base = base * (1 + taxaEntre(d.inicio, dt));
      anterior = dt;
    }
  }

  if (d.sistema === 'price') {
    // Parcelas iguais. A parcela é a do contrato (se informada) ou a calculada sobre o saldo já com os juros da carência.
    // Divisão igual à dos bancos: amortização da tabela Price menos uma cota igual, por parcela, dos juros da carência;
    // assim o principal das parcelas fecha com o valor financiado e todo o resto da parcela é juros.
    let i = taxaDaParcela(d);
    const fixa = d.parcelaFixa && d.parcelaFixa > 0 ? r2(d.parcelaFixa) : 0;
    // Saldo no começo do 1º período, já com os juros da carência (da liberação até um período antes do 1º vencimento),
    // contados como o banco conta: taxa diária com 6 casas, capitalizada dia a dia.
    const diasCar = Math.max(0, diasEntre(d.inicio, dataDoPeriodo(d, -1)));
    const im = taxaMensalContrato(d.taxaAnual, d.jurosTipo);
    const composto = d.jurosTipo === 'composto';
    const aoDia = composto ? Math.round((d.baseDias === 365 ? Math.pow(1 + d.taxaAnual / 100, 1 / 365) - 1 : Math.pow(1 + im, 1 / 30) - 1) * 1e6) / 1e6 : d.taxaAnual / 100 / d.baseDias;
    const saldoBanco = composto ? d.saldo * Math.pow(1 + aoDia, diasCar) : d.saldo * (1 + aoDia * diasCar);
    const P = fixa || r2(saldoBanco / fatorPrice(i, n));
    if (P * n < d.saldo - 0.005) return []; // a parcela informada não paga nem o principal
    // Divisão igual à do banco: amortização da tabela Price menos uma cota igual, por parcela, dos juros da carência;
    // o principal das parcelas fecha com o valor financiado (a última leva a sobra dos centavos) e o resto da parcela é juros.
    let saldoPrice = P * fatorPrice(i, n); // saldo que essa parcela paga, à taxa do contrato
    if (Math.abs(saldoPrice - saldoBanco) <= saldoBanco * 0.0005) saldoPrice = saldoBanco; // a parcela confere com o contrato: vale o saldo exato
    let cota = (saldoPrice - d.saldo) / n;
    let amort1 = P - saldoPrice * i;
    if (cota < -0.000001 || amort1 - cota < 0) {
      // a parcela informada não combina com a taxa do contrato: usa a taxa que fecha a conta
      i = taxaQueFecha(d.saldo, P, n);
      saldoPrice = P * fatorPrice(i, n);
      cota = (saldoPrice - d.saldo) / n;
      amort1 = P - saldoPrice * i;
    }
    for (let k = 0; k < n; k++) {
      const amort = amort1 * Math.pow(1 + i, k);
      const principal = k === n - 1 ? principalFalta : Math.min(principalFalta, Math.max(0, r2(amort - cota)));
      const juros = r2((i > 0 ? Math.max(0, r2(P - principal)) : 0) + (k === 0 ? jurosNaPrimeira : 0));
      principalFalta = r2(principalFalta - principal);
      lista.push({ numero: 0, vencimento: dataDoPeriodo(d, k), principal, juros, valor: r2(principal + juros), saldo: Math.max(0, principalFalta), soJuros: false });
    }
    return lista.map((p, k) => ({ ...p, numero: k + 1 }));
  }

  const fator = d.saldo / base; // parte de cada amortização que é principal de verdade
  let saldoCalc = base;
  for (let k = 0; k < n; k++) {
    const venc = dataDoPeriodo(d, k);
    const ultima = k === n - 1;
    const jurosK = saldoCalc * taxaEntre(anterior, venc);
    const amort = ultima ? saldoCalc : base / n;
    const principal = ultima ? principalFalta : Math.min(principalFalta, r2(amort * fator));
    const total = r2(amort + jurosK);
    const juros = Math.max(0, r2(total - principal));
    saldoCalc -= amort;
    principalFalta = r2(principalFalta - principal);
    lista.push({ numero: 0, vencimento: venc, principal, juros, valor: r2(principal + juros), saldo: Math.max(0, principalFalta), soJuros: false });
    anterior = venc;
  }
  return lista.map((p, i) => ({ ...p, numero: i + 1 }));
}

/** Taxa de juros (fração) entre duas datas, pela regra do contrato: 360 dias corridos ou ano civil (365/366). */
export function taxaEntreDatas(taxaAnual: number, tipo: JurosTipo, baseDias: number, de: string, ate: string): number {
  if (!de || !ate || ate <= de) return 0;
  if (baseDias !== 365) return taxaPeriodo(taxaAnual, diasEntre(de, ate), tipo, baseDias);
  const a = taxaAnual / 100;
  const t = fracaoAnoCivil(de, ate);
  if (!(a > 0) || !(t > 0)) return 0;
  return tipo === 'composto' ? Math.pow(1 + a, t) - 1 : a * t;
}
