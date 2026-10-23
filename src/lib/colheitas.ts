// Colheita de café: formas de colher, medidas (caixote, saco, kg, litro) e as contas da produção por colhedor.
import { formatarQtd } from './formatos';

export type TipoColheita = 'manual' | 'lona' | 'automotriz';
type Opcao = { valor: string; rotulo: string };

export const TIPOS_COLHEITA: Opcao[] = [
  { valor: 'manual', rotulo: '🧺 Manual' },
  { valor: 'lona', rotulo: '🚜 Máquina de lona' },
  { valor: 'automotriz', rotulo: '🚜 Automotriz' },
];
export const ROTULO_TIPO_COLHEITA: Record<string, string> = { manual: 'Manual', lona: 'Máquina de lona', automotriz: 'Automotriz' };
export const ICONE_TIPO_COLHEITA: Record<string, string> = { manual: '🧺', lona: '🚜', automotriz: '🚜' };

export const UNIDADES_COLHEITA: Opcao[] = [
  { valor: 'caixote', rotulo: 'Caixote' },
  { valor: 'saco', rotulo: 'Saco' },
  { valor: 'kg', rotulo: 'Quilo (kg)' },
  { valor: 'litro', rotulo: 'Litro' },
];
const PLURAL: Record<string, string> = { caixote: 'caixotes', saco: 'sacos', kg: 'kg', litro: 'litros' };

/** "25 caixotes", "1 saco", "8.000 kg" */
export const textoMedida = (qtd: number | string | null | undefined, unidade: string) => `${formatarQtd(qtd, 2)} ${Number(qtd) === 1 ? unidade : PLURAL[unidade] ?? unidade}`;
/** "1.500 L" */
export const textoLitros = (litros: number | string | null | undefined) => `${formatarQtd(litros, 0)} L`;

/** Pergunta da capacidade de cada medida, para converter tudo em litros de café da roça. */
export const ROTULO_CAPACIDADE: Record<string, string> = {
  caixote: 'Litros do caixote *',
  saco: 'Litros do saco *',
  kg: 'Litros por kg de café *',
};
/** Sugestão quando a medida nunca foi usada na fazenda (o kg é aproximado: o café maduro pesa perto de 0,6 kg por litro). */
export const CAPACIDADE_SUGERIDA: Record<string, string> = { kg: '1,6' };

export const FORMAS_SERVICO: Opcao[] = [
  { valor: 'hora', rotulo: 'Por hora' },
  { valor: 'medida', rotulo: 'Por medida colhida' },
  { valor: 'total', rotulo: 'Valor fechado' },
];

export const r2 = (x: number) => Math.round(x * 100) / 100;
export const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Campos da colheita para as listas. */
export const CAMPOS_COLHEITA =
  'id, numero, data_colheita, tipo_colheita, quantidade_bruta, unidade, litros_por_unidade, litros, valor_colheita, servico_valor, etapa, safra_id, area_id, area:areas ( nome ), safra:safras ( nome )';

/** Custo da colheita: produção dos colhedores mais o serviço de máquina de terceiro. */
export const custoColheita = (c: { valor_colheita: any; servico_valor: any }) => Number(c.valor_colheita ?? 0) + Number(c.servico_valor ?? 0);

/** Soma a produção em aberto por colhedor: { pessoa_id: { nome, valor, linhas } }. */
export function somarPorColhedor(linhas: any[]): { pessoaId: string; nome: string; valor: number; dias: number; ultima: string }[] {
  const m: Record<string, { pessoaId: string; nome: string; valor: number; datas: Set<string> }> = {};
  for (const l of linhas) {
    const k = l.pessoa_id;
    if (!k) continue;
    m[k] ??= { pessoaId: k, nome: um(l.pessoa)?.nome ?? '', valor: 0, datas: new Set() };
    m[k].valor += Number(l.valor);
    const d = um(l.lote)?.data_colheita;
    if (d) m[k].datas.add(d);
  }
  return Object.values(m)
    .map((x) => ({ pessoaId: x.pessoaId, nome: x.nome, valor: r2(x.valor), dias: x.datas.size, ultima: [...x.datas].sort().pop() ?? '' }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
