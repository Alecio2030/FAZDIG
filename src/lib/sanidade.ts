// Sanidade: tipos, produtos de cada tipo, prazos e datas dos reforços.
import { hojeBanco } from './datas';

export const TIPOS_SANIDADE = [
  { valor: 'vacina', rotulo: 'Vacina' },
  { valor: 'vermifugo', rotulo: 'Vermífugo' },
  { valor: 'tratamento', rotulo: 'Tratamento' },
  { valor: 'outro', rotulo: 'Outro' },
];
export const ROTULO_SANIDADE: Record<string, string> = Object.fromEntries(TIPOS_SANIDADE.map((t) => [t.valor, t.rotulo]));

/** Categorias de insumo que aparecem para escolher em cada tipo. */
export const CATEGORIAS_DO_TIPO: Record<string, string[]> = {
  vacina: ['vacina'],
  vermifugo: ['medicamento'],
  tratamento: ['medicamento'],
  outro: ['vacina', 'medicamento', 'sal_mineral', 'racao', 'outro'],
};

/** Produto cadastrado na hora: categoria e unidade conforme o tipo. */
export const NOVO_PRODUTO: Record<string, { categoria: string; compra: string; consumo: string }> = {
  vacina: { categoria: 'vacina', compra: 'frasco', consumo: 'dose' },
  vermifugo: { categoria: 'medicamento', compra: 'frasco', consumo: 'mL' },
  tratamento: { categoria: 'medicamento', compra: 'frasco', consumo: 'mL' },
  outro: { categoria: 'medicamento', compra: 'frasco', consumo: 'mL' },
};

/** Prazos sugeridos entre doses (dias). */
export const PRAZOS_SUGERIDOS = [3, 7, 14, 21, 30];

export const MAX_MEDICAMENTOS = 4;
export const MAX_REFORCOS = 10;

/** Soma N dias a uma data aaaa-mm-dd. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + dias));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

export const atrasada = (prevista: string) => prevista < hojeBanco();
