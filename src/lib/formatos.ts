// CPF/CNPJ, moeda e números no padrão brasileiro.

export const somenteDigitos = (t: string) => t.replace(/\D/g, '');

/** Máscara automática: até 11 dígitos vira CPF, acima disso CNPJ. */
export function mascaraCpfCnpj(texto: string): string {
  const d = somenteDigitos(texto).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = calc(cpf.slice(0, 9), 10);
  const d2 = calc(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

function cnpjValido(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 13));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** Confere os dígitos verificadores de CPF ou CNPJ. */
export function cpfCnpjValido(texto: string): boolean {
  const d = somenteDigitos(texto);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

/** 1234.5 -> "1.234,50" (casas decimais fixas) */
export function formatarNumero(valor: number | null | undefined, casas = 0): string {
  const n = Number(valor ?? 0);
  const negativo = n < 0;
  const [inteiro, decimal] = Math.abs(n).toFixed(casas).split('.');
  const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${comPontos}${decimal ? ',' + decimal : ''}`;
}

/** 1234.5 -> "R$ 1.234,50" */
export function formatarMoeda(valor: number | null | undefined): string {
  return `R$ ${formatarNumero(valor, 2)}`;
}

/**
 * Máscara de dinheiro enquanto digita (como nos bancos): os dígitos entram pelos centavos.
 * "1" -> "0,01", "123456" -> "1.234,56". Com negativo permitido, um "-" em qualquer lugar deixa o valor negativo.
 */
export function mascaraMoeda(texto: string, negativo = false): string {
  const menos = negativo && texto.includes('-');
  const d = somenteDigitos(texto).replace(/^0+/, '').slice(0, 15);
  if (!d) return menos ? '-' : '';
  const n = Number(d) / 100;
  return `${menos ? '-' : ''}${formatarNumero(n, 2)}`;
}

/** Valor do banco -> texto do campo de dinheiro ("1.234,56"). Vazio se não houver. */
export function moedaParaCampo(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  const n = Number(valor);
  return Number.isFinite(n) ? formatarNumero(n, 2) : '';
}

/** "1.234,56" -> 1234.56 (null se vazio ou inválido) */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** (27) 99999-9999 ou (27) 3721-0000 */
export function mascaraTelefone(texto: string): string {
  const d = somenteDigitos(texto).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 29700-000 */
export function mascaraCep(texto: string): string {
  const d = somenteDigitos(texto).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Número vindo do banco -> texto para editar no campo ("1.234,5"). Vazio se não houver. */
export function numeroParaCampo(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '';
  const [int, dec] = String(Math.abs(n)).split('.');
  return `${n < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? ',' + dec : ''}`;
}

/** Enquanto digita um número com decimais: ponto a cada 3 casas antes da vírgula ("1234567,5" -> "1.234.567,5"). */
export function agruparDigitacao(texto: string): string {
  const menos = texto.trim().startsWith('-');
  const semPontos = texto.replace(/[^\d,]/g, '');
  const i = semPontos.indexOf(',');
  const inteiro = (i >= 0 ? semPontos.slice(0, i) : semPontos).replace(/^0+(?=\d)/, '');
  const decimal = i >= 0 ? ',' + semPontos.slice(i + 1).replace(/,/g, '') : '';
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${menos ? '-' : ''}${agrupado}${decimal}`;
}

/** Número para mostrar, com ponto de milhar e só as casas que existirem (até 3): 1234.5 -> "1.234,5". */
export function formatarQtd(valor: number | string | null | undefined, maxCasas = 3): string {
  const n = Number(valor ?? 0);
  const arred = Math.round(n * 10 ** maxCasas) / 10 ** maxCasas;
  const casas = Number.isInteger(arred) ? 0 : (String(arred).split('.')[1]?.length ?? 0);
  return formatarNumero(arred, Math.min(casas, maxCasas));
}
