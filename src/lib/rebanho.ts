// Listas e textos do rebanho usados em várias telas.

export const SEXOS = [
  { valor: 'F', rotulo: 'Fêmea' },
  { valor: 'M', rotulo: 'Macho' },
];

export const CATEGORIAS: Record<'F' | 'M', string[]> = {
  F: ['Bezerra', 'Novilha', 'Vaca'],
  M: ['Bezerro', 'Garrote', 'Boi', 'Touro'],
};

export const SITUACOES_ANIMAL = [
  { valor: 'ativo', rotulo: 'No rebanho' },
  { valor: 'vendido', rotulo: 'Vendido' },
  { valor: 'morto', rotulo: 'Morto' },
  { valor: 'saiu_parceria', rotulo: 'Saiu (parceria)' },
];
export const ROTULO_SITUACAO: Record<string, string> = Object.fromEntries(SITUACOES_ANIMAL.map((s) => [s.valor, s.rotulo]));

/** "Nº 12, brinco 345" */
export function identAnimal(a: { numero_interno?: number | null; brinco?: string | null }): string {
  const partes = [];
  if (a.numero_interno) partes.push(`Nº ${a.numero_interno}`);
  if (a.brinco) partes.push(`brinco ${a.brinco}`);
  return partes.join(', ') || 'Sem número';
}

/** "FC 003" (ou "Lote 003" se a fazenda ainda não tem sigla) */
export function codigoLote(numero: number | null | undefined, sigla?: string | null): string {
  const n = String(numero ?? 0).padStart(3, '0');
  return sigla ? `${sigla} ${n}` : `Lote ${n}`;
}

/** "FC 003 – Vacas paridas" */
export function nomeLote(l: { numero?: number | null; descricao?: string | null } | null | undefined, sigla?: string | null): string {
  if (!l) return '';
  const cod = codigoLote(l.numero, sigla);
  return l.descricao ? `${cod} – ${l.descricao}` : cod;
}

/** Data de referência: primeiro dia do mês que fica N meses antes da data base (aaaa-mm-dd). */
export function mesesAtras(baseIso: string, meses: number): string {
  const [a, m] = baseIso.split('-').map(Number);
  const total = a * 12 + (m - 1) - meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

/** Diferença em meses (só mês e ano) entre duas datas aaaa-mm-dd. */
export function mesesEntre(deIso: string, ateIso: string): number {
  const [a1, m1] = deIso.split('-').map(Number);
  const [a2, m2] = ateIso.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** "10/2025" */
export function mesAno(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[2]}/${m[1]}` : '';
}

/** Idade com "(aprox.)" quando o nascimento é por mês de referência. */
export function idadeRotulo(nascimento?: string | null, aproximado?: boolean): string | null {
  const t = idadeTexto(nascimento);
  if (!t) return null;
  return aproximado ? `${t} (aprox.)` : t;
}

/** "Machos, Garrote, Nelore, 11 meses (aprox.)" */
export function resumoComposicao(x: {
  sexo?: string | null;
  categoria?: string | null;
  raca?: string | null;
  nascimento?: string | null;
  aproximado?: boolean;
}): string {
  return [
    x.sexo === 'M' ? 'Machos' : x.sexo === 'F' ? 'Fêmeas' : null,
    x.categoria,
    x.raca,
    idadeRotulo(x.nascimento, x.aproximado),
  ]
    .filter(Boolean)
    .join(', ');
}

/** Idade a partir da data de nascimento (aaaa-mm-dd): "2 anos e 3 meses", "8 meses", "15 dias". */
export function idadeTexto(nascimento?: string | null): string | null {
  if (!nascimento) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascimento);
  if (!m) return null;
  const nasc = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  if (nasc > hoje) return null;
  let meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
  if (hoje.getDate() < nasc.getDate()) meses -= 1;
  if (meses < 1) {
    const dias = Math.floor((hoje.getTime() - nasc.getTime()) / 86400000);
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const tA = anos === 1 ? '1 ano' : `${anos} anos`;
  const tM = resto === 1 ? '1 mês' : `${resto} meses`;
  if (anos === 0) return tM;
  if (resto === 0) return tA;
  return `${tA} e ${tM}`;
}

/** Objetivo do animal sem controle genealógico. */
export const OBJETIVOS_ANIMAL = [
  { valor: 'corte', rotulo: 'Corte' },
  { valor: 'reproducao', rotulo: 'Reprodução sem controle' },
];
export const ROTULO_OBJETIVO_ANIMAL: Record<string, string> = Object.fromEntries(OBJETIVOS_ANIMAL.map((o) => [o.valor, o.rotulo]));

/** Onde o lote está: "Manga Tanque (Confinamento)". Null se o lote não tem manga informada. */
export function localDoLote(manga: { nome?: string | null; indicacao_uso?: string | null } | null | undefined): string | null {
  if (!manga?.nome) return null;
  const nome = /^manga\b/i.test(manga.nome) ? manga.nome : `Manga ${manga.nome}`;
  return manga.indicacao_uso ? `${nome} (${manga.indicacao_uso})` : nome;
}
