// Códigos hierárquicos com máscara (plano de contas, centros de custo).
// Uma máscara é a quantidade de dígitos de cada nível: [1, 1, 2, 3] = 9.9.99.999.

export type Mascara = number[];

export const nivelDe = (codigo: string) => codigo.split('.').length;

export const textoMascara = (m: Mascara) => m.map((d) => '9'.repeat(d)).join('.');

/** Próximo código livre dentro do código pai (ou no primeiro nível, sem pai). */
export function proximoCodigo(m: Mascara, codigoPai: string | null, codigosIrmaos: string[]): string | null {
  const nivel = codigoPai ? nivelDe(codigoPai) + 1 : 1;
  if (nivel > m.length) return null;
  const largura = m[nivel - 1];
  const usados = new Set(codigosIrmaos.map((c) => Number(c.split('.').pop())));
  for (let n = 1; n < 10 ** largura; n++) {
    if (!usados.has(n)) {
      const parte = String(n).padStart(largura, '0');
      return codigoPai ? `${codigoPai}.${parte}` : parte;
    }
  }
  return null;
}

/** Confere se o código segue a máscara e está debaixo do pai certo. Devolve o erro ou null. */
export function erroCodigo(m: Mascara, codigo: string, codigoPai: string | null): string | null {
  const partes = codigo.split('.');
  const nivel = partes.length;
  const mascara = textoMascara(m);
  if (nivel > m.length) return `No máximo ${m.length} níveis (${mascara}).`;
  for (let i = 0; i < nivel; i++) {
    if (!new RegExp(`^\\d{${m[i]}}$`).test(partes[i])) return `Formato inválido. Siga a máscara ${mascara}.`;
    if (Number(partes[i]) === 0) return 'Use números a partir de 1 em cada nível.';
  }
  const esperadoPai = nivel > 1 ? partes.slice(0, -1).join('.') : null;
  if (esperadoPai !== codigoPai) {
    return codigoPai ? `O código precisa começar com ${codigoPai}.` : `Sem item de cima, o código tem ${m[0]} dígito${m[0] > 1 ? 's' : ''}.`;
  }
  return null;
}

/** Tira acentos e deixa minúsculo, para buscar "manutencao" e achar "Manutenção". */
export const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** "Despesas › Custeio da lavoura › Insumos": nomes dos itens acima, pelo campo que aponta o pai. */
export function caminho<T extends { nome: string }>(item: T, porId: Record<string, T>, pai: (x: T) => string | null): string {
  const nomes: string[] = [];
  let idPai = pai(item);
  while (idPai && porId[idPai]) {
    nomes.unshift(porId[idPai].nome);
    idPai = pai(porId[idPai]);
  }
  return nomes.join(' › ');
}
