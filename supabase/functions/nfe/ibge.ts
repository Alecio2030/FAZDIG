// V157: código IBGE do município (a nota exige), buscado na API pública e gratuita do IBGE pelo nome e pela UF.
const cache = new Map<string, Map<string, { codigo: string; nome: string }>>();

export const normalizar = (s: string) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

async function municipiosDa(uf: string) {
  const u = uf.toUpperCase();
  const pronto = cache.get(u);
  if (pronto) return pronto;
  const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${u}/municipios`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Não foi possível consultar os municípios no IBGE agora. Tente de novo em alguns minutos.');
  const lista = (await r.json()) as { id: number; nome: string }[];
  const mapa = new Map(lista.map((m) => [normalizar(m.nome), { codigo: String(m.id), nome: m.nome }]));
  cache.set(u, mapa);
  return mapa;
}

/** Devolve o código IBGE e o nome oficial; erro claro se o município não existir naquela UF. */
export async function municipio(nome: string | null | undefined, uf: string | null | undefined, quem: string) {
  if (!nome || !uf) throw new Error(`${quem}: falta o município ou a UF.`);
  const m = (await municipiosDa(uf)).get(normalizar(nome));
  if (!m) throw new Error(`${quem}: o município "${nome}" não foi encontrado em ${uf.toUpperCase()} (confira a grafia).`);
  return m;
}
