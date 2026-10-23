// Padrão de datas do sistema: na tela sempre dd/mm/aaaa; no banco sempre aaaa-mm-dd.

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const dois = (n: number) => String(n).padStart(2, '0');

/** Data de hoje em dd/mm/aaaa (horário do aparelho). */
export function hojeBR(): string {
  const d = new Date();
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Data de hoje em aaaa-mm-dd, para gravar no banco. */
export function hojeBanco(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Ex.: "Terça-feira, 22/09/2026" */
export function hojeExtenso(): string {
  const dia = DIAS[new Date().getDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${hojeBR()}`;
}

/** Vai colocando as barras enquanto a pessoa digita: 22092026 -> 22/09/2026 */
export function mascaraData(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Confere se é uma data real no formato dd/mm/aaaa (inclui ano bissexto). */
export function dataValida(br: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return false;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  if (ano < 1900 || ano > 2100 || mes < 1 || mes > 12 || dia < 1) return false;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return dia <= ultimoDia;
}

/** dd/mm/aaaa -> aaaa-mm-dd (ou null se vazia ou inválida). */
export function paraBanco(br: string): string | null {
  if (!dataValida(br)) return null;
  const [dia, mes, ano] = br.split('/');
  return `${ano}-${mes}-${dia}`;
}

/** aaaa-mm-dd (ou data com hora) -> dd/mm/aaaa. Vazio se não houver data. */
export function doBanco(valor?: string | null): string {
  if (!valor) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// ===== Horas (hh:mm) =====

/** Vai colocando os dois-pontos enquanto digita: 2230 -> 22:30 */
export function mascaraHora(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Confere hh:mm (00:00 a 23:59). */
export function horaValida(h: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(h);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/** Horas entre início e fim (passa da meia-noite: 22:00 às 02:00 = 4 h). null se faltar ou for inválida. */
export function duracaoHoras(inicio: string, fim: string): number | null {
  if (!horaValida(inicio) || !horaValida(fim)) return null;
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  let d = min(fim) - min(inicio);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 100) / 100;
}

/** "08:30:00" (do banco) -> "08:30" */
export const horaDoBanco = (h?: string | null) => (h ? h.slice(0, 5) : '');

/** 3.5 -> "3 h 30 min" */
export function textoHoras(h: number | null | undefined): string {
  if (h == null) return '';
  const tot = Math.round(h * 60);
  const hh = Math.floor(tot / 60);
  const mm = tot % 60;
  return hh && mm ? `${hh} h ${mm} min` : hh ? `${hh} h` : `${mm} min`;
}
