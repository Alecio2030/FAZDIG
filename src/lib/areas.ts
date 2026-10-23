import type { TipoArea } from '../navegacao/rotas';

export const NOMES_AREA: Record<TipoArea, { plural: string; singular: string; cultura: string; artigo: string }> = {
  manga: { plural: 'Mangas', singular: 'manga', cultura: 'Capim', artigo: 'a' },
  talhao: { plural: 'Talhões', singular: 'talhão', cultura: 'Cultura', artigo: 'o' },
};
