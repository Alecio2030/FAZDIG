// Pragas e doenças: foto da planta analisada pela IA (função diagnostico-planta) e o monitoramento por talhão.
import { supabase } from './supabase';

export type TipoProblema = 'praga' | 'doenca' | 'deficiencia' | 'dano' | 'sadia' | 'indefinido';

export const TIPOS_PROBLEMA: { valor: TipoProblema; rotulo: string }[] = [
  { valor: 'praga', rotulo: 'Praga' },
  { valor: 'doenca', rotulo: 'Doença' },
  { valor: 'deficiencia', rotulo: 'Deficiência' },
  { valor: 'dano', rotulo: 'Dano' },
  { valor: 'sadia', rotulo: 'Planta sadia' },
  { valor: 'indefinido', rotulo: 'A confirmar' },
];
export const ROTULO_TIPO: Record<string, string> = { praga: 'Praga', doenca: 'Doença', deficiencia: 'Deficiência nutricional', dano: 'Dano (clima, herbicida, mecânico)', sadia: 'Planta sadia', indefinido: 'A confirmar' };
export const ICONE_TIPO: Record<string, string> = { praga: '🐛', doenca: '🍂', deficiencia: '🧪', dano: '⚠️', sadia: '✅', indefinido: '❓' };
export const NIVEIS = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'alta', rotulo: 'Alta' },
];
export const ROTULO_NIVEL: Record<string, string> = { baixa: 'baixa', media: 'média', alta: 'alta' };
export const ROTULO_URGENCIA: Record<string, string> = { imediata: 'Agir agora', esta_semana: 'Programar para esta semana', acompanhar: 'Acompanhar' };

/** Problemas mais comuns, para lançar à mão sem foto (o campo aceita digitar outro). */
export const PROBLEMAS_COMUNS: Record<string, string[]> = {
  praga: ['Broca-do-café', 'Cochonilha-da-roseta', 'Ácaro-vermelho', 'Bicho-mineiro', 'Lagarta', 'Nematoide', 'Formiga cortadeira', 'Cigarrinha-das-pastagens'],
  doenca: ['Ferrugem do cafeeiro', 'Cercosporiose (olho-pardo)', 'Mancha-manteigosa', 'Seca-de-ponteiros', 'Fusariose', 'Rizoctoniose'],
  deficiencia: ['Deficiência de nitrogênio', 'Deficiência de potássio', 'Deficiência de magnésio', 'Deficiência de zinco', 'Deficiência de boro', 'Deficiência de ferro'],
  dano: ['Seca', 'Escaldadura (sol)', 'Fitotoxidez de herbicida', 'Vento', 'Granizo'],
};

export type FotoPlanta = { uri: string; base64: string; formato: string };

export type Diagnostico = {
  e_planta: boolean;
  cultura_vista: string | null;
  tipo: TipoProblema;
  problema: string | null;
  nome_cientifico: string | null;
  confianca: 'alta' | 'media' | 'baixa' | null;
  severidade: 'baixa' | 'media' | 'alta' | null;
  parte: string | null;
  sintomas: string;
  outras_hipoteses: { problema: string; porque: string }[];
  o_que_fazer: string[];
  conferir_no_campo: string[];
  urgencia: string | null;
};

const texto = (v: any): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const lista = (v: any): string[] => (Array.isArray(v) ? v.map(texto).filter(Boolean) : []) as string[];
const um = <T extends string>(v: any, validos: T[]): T | null => (validos.includes(v) ? (v as T) : null);

/** Arruma a resposta da IA: só passa o que tem o formato esperado. */
function arrumar(d: any): Diagnostico {
  return {
    e_planta: d?.e_planta !== false,
    cultura_vista: texto(d?.cultura_vista),
    tipo: um<TipoProblema>(d?.tipo, ['praga', 'doenca', 'deficiencia', 'dano', 'sadia', 'indefinido']) ?? 'indefinido',
    problema: texto(d?.problema),
    nome_cientifico: texto(d?.nome_cientifico),
    confianca: um(d?.confianca, ['alta', 'media', 'baixa']),
    severidade: um(d?.severidade, ['baixa', 'media', 'alta']),
    parte: texto(d?.parte),
    sintomas: texto(d?.sintomas) ?? '',
    outras_hipoteses: (Array.isArray(d?.outras_hipoteses) ? d.outras_hipoteses : []).map((h: any) => ({ problema: texto(h?.problema) ?? '', porque: texto(h?.porque) ?? '' })).filter((h: any) => h.problema).slice(0, 3),
    o_que_fazer: lista(d?.o_que_fazer),
    conferir_no_campo: lista(d?.conferir_no_campo),
    urgencia: um(d?.urgencia, ['imediata', 'esta_semana', 'acompanhar']),
  };
}

/** Manda as fotos (até 2) para a IA analisar no servidor. Devolve a hipótese e onde as fotos ficaram guardadas. */
export async function analisarPlanta(fotos: FotoPlanta[], contexto: unknown): Promise<{ dados: Diagnostico; arquivos: string[] } | { erro: string }> {
  const { data: d, error } = await supabase.functions.invoke('diagnostico-planta', { body: { fotos: fotos.slice(0, 2).map((f) => ({ imagem: f.base64, formato: f.formato })), contexto } });
  if (error) {
    let msg = 'Não foi possível analisar a foto agora.';
    try {
      const j = await (error as any).context?.json();
      if (j?.erro) msg = j.erro;
    } catch {
      /* mantém a mensagem padrão */
    }
    return { erro: msg };
  }
  if (!d?.dados) return { erro: d?.erro ?? 'A IA não respondeu. Tente de novo.' };
  return { dados: arrumar(d.dados), arquivos: Array.isArray(d.arquivos) ? d.arquivos : [] };
}

/** "🐛 Broca-do-café" */
export const tituloOcorrencia = (m: { tipo: string; problema: string }) => `${ICONE_TIPO[m.tipo] ?? ''} ${m.problema}`.trim();

/** "severidade média · 12% das plantas" */
export function textoNivel(m: { severidade?: string | null; incidencia_perc?: number | string | null }): string {
  const p: string[] = [];
  if (m.severidade) p.push(`severidade ${ROTULO_NIVEL[m.severidade] ?? m.severidade}`);
  if (m.incidencia_perc != null) p.push(`${String(Number(m.incidencia_perc)).replace('.', ',')}% das plantas`);
  return p.join(' · ');
}
