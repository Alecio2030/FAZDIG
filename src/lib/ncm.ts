// V160: NCM sugerido para os produtos da fazenda mais comuns (a tela da nota mostra para conferir).
const TABELA: [RegExp, string][] = [
  [/mam[aã]o|papaia/i, '08072000'],
  [/banana(?!.*terra)/i, '08039000'],
  [/banana.*terra|pl[aá]tano/i, '08031000'],
  [/milho/i, '10059010'],
  [/soja/i, '12019000'],
  [/pimenta.*reino/i, '09041100'],
  [/cacau/i, '18010000'],
  [/coco/i, '08011900'],
  [/abacate/i, '08044000'],
  [/laranja/i, '08051000'],
  [/lim[aã]o/i, '08055000'],
  [/maracuj[aá]/i, '08109000'],
  [/tomate/i, '07020000'],
];

/** NCM provável pela descrição do produto, ou '' se não reconhecer. */
export function palpiteNcm(descricao: string): string {
  for (const [re, ncm] of TABELA) if (re.test(descricao)) return ncm;
  return '';
}
