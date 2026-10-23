// Reprodução: rótulos, situação reprodutiva da fêmea, previsão de parto, parentesco e indicadores.

export const GESTACAO_DIAS = 285; // média bovina; zebuínos costumam passar um pouco disso

export const TIPOS_LANCAMENTO = [
  { valor: 'iatf', rotulo: 'Protocolo IATF' },
  { valor: 'servico', rotulo: 'Cobertura / IA / TE' },
  { valor: 'dg', rotulo: 'Diagnóstico (DG)' },
  { valor: 'parto', rotulo: 'Parto / Aborto' },
  { valor: 'coleta', rotulo: 'Coleta de oócitos' },
];

export const SERVICOS = [
  { valor: 'monta', rotulo: 'Monta natural' },
  { valor: 'ia', rotulo: 'IA' },
  { valor: 'iatf', rotulo: 'IATF' },
  { valor: 'te', rotulo: 'TE' },
  { valor: 'fiv', rotulo: 'FIV' },
];
export const RESULTADOS_DG = [
  { valor: 'prenhe', rotulo: 'Prenhe' },
  { valor: 'vazia', rotulo: 'Vazia' },
];
export const METODOS_DG = [
  { valor: 'ultrassom', rotulo: 'Ultrassom' },
  { valor: 'toque', rotulo: 'Toque' },
];
export const PARTOS = [
  { valor: 'normal', rotulo: 'Normal' },
  { valor: 'assistido', rotulo: 'Assistido' },
  { valor: 'cesarea', rotulo: 'Cesárea' },
  { valor: 'aborto', rotulo: 'Aborto' },
];
export const COLETAS = [
  { valor: 'te', rotulo: 'TE (in vivo)' },
  { valor: 'fiv', rotulo: 'FIV (OPU)' },
];
export const SEMENS = [
  { valor: 'convencional', rotulo: 'Convencional' },
  { valor: 'sexado_femea', rotulo: 'Sexado fêmea' },
  { valor: 'sexado_macho', rotulo: 'Sexado macho' },
];

const mapa = (l: { valor: string; rotulo: string }[]) => Object.fromEntries(l.map((x) => [x.valor, x.rotulo])) as Record<string, string>;
export const ROTULO_SERVICO = mapa(SERVICOS);
export const ROTULO_DG = mapa(RESULTADOS_DG);
export const ROTULO_PARTO = mapa(PARTOS);
export const ROTULO_COLETA = mapa(COLETAS);
export const ROTULO_SEMEN = mapa(SEMENS);
export const ROTULO_METODO = mapa(METODOS_DG);

export function rotuloEvento(e: { tipo: string; subtipo: string }): string {
  if (e.tipo === 'servico') return ROTULO_SERVICO[e.subtipo] ?? 'Serviço';
  if (e.tipo === 'dg') return `DG: ${ROTULO_DG[e.subtipo] ?? e.subtipo}`;
  if (e.tipo === 'parto') return e.subtipo === 'aborto' ? 'Aborto' : `Parto ${ROTULO_PARTO[e.subtipo]?.toLowerCase() ?? ''}`.trim();
  if (e.tipo === 'coleta') return `Coleta de oócitos ${ROTULO_COLETA[e.subtipo] ?? ''}`.trim();
  return e.tipo;
}

// ---------- datas (aaaa-mm-dd) ----------
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}
export function diasEntre(de: string, ate: string): number {
  const f = (s: string) => {
    const [a, m, d] = s.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((f(ate) - f(de)) / 86400000);
}

/** Previsão de parto: pelo DG com dias de gestação ou pela data do serviço. */
export function previsaoParto(x: { dataServico?: string | null; dataDg?: string | null; diasGestacao?: number | null }): string | null {
  if (x.dataDg && x.diasGestacao) return somarDias(x.dataDg, GESTACAO_DIAS - x.diasGestacao);
  if (x.dataServico) return somarDias(x.dataServico, GESTACAO_DIAS);
  return null;
}

// ---------- situação reprodutiva ----------
export type Evento = {
  id: string;
  data: string;
  tipo: string;
  subtipo: string;
  previsao_parto?: string | null;
  touro?: string | null;
  inseminador?: string | null;
  iatf_id?: string | null;
  protocolo?: string | null;
  ecc?: number | null;
  animal_id?: string;
};

export type Situacao = { codigo: 'sem_registro' | 'parida' | 'servida' | 'prenhe' | 'vazia'; texto: string; previsao?: string | null; desde?: string };

const ordenar = (ev: Evento[]) => [...ev].sort((a, b) => (a.data === b.data ? ordemTipo(a.tipo) - ordemTipo(b.tipo) : a.data < b.data ? -1 : 1));
const ordemTipo = (t: string) => ({ parto: 0, servico: 1, dg: 2, coleta: 3 } as Record<string, number>)[t] ?? 9;

export function situacaoFemea(eventos: Evento[], hojeIso: string, emProtocolo?: string | null): Situacao {
  let s: Situacao = { codigo: 'sem_registro', texto: 'Sem registro reprodutivo' };
  let ultimoServico: Evento | null = null;
  for (const e of ordenar(eventos)) {
    if (e.tipo === 'parto') {
      ultimoServico = null;
      s = e.subtipo === 'aborto' ? { codigo: 'vazia', texto: 'Vazia (aborto)', desde: e.data } : { codigo: 'parida', texto: 'Parida', desde: e.data };
    } else if (e.tipo === 'servico') {
      ultimoServico = e;
      s = { codigo: 'servida', texto: `${ROTULO_SERVICO[e.subtipo] ?? 'Servida'}: aguardando DG`, desde: e.data, previsao: previsaoParto({ dataServico: e.data }) };
    } else if (e.tipo === 'dg') {
      if (e.subtipo === 'prenhe') s = { codigo: 'prenhe', texto: 'Prenhe', desde: e.data, previsao: e.previsao_parto ?? previsaoParto({ dataServico: ultimoServico?.data }) };
      else s = { codigo: 'vazia', texto: 'Vazia', desde: e.data };
    }
  }
  if (s.codigo === 'parida' && s.desde) s.texto = `Parida há ${diasEntre(s.desde, hojeIso)} dias`;
  if (emProtocolo && (s.codigo === 'vazia' || s.codigo === 'parida' || s.codigo === 'sem_registro')) s = { ...s, texto: `${s.texto} · em protocolo ${emProtocolo}` };
  return s;
}

/** Indicadores da fêmea: partos, IEP médio, dias em aberto, serviços por concepção. */
export function indicadoresFemea(eventos: Evento[], hojeIso: string) {
  const ev = ordenar(eventos);
  const partos = ev.filter((e) => e.tipo === 'parto' && e.subtipo !== 'aborto');
  const abortos = ev.filter((e) => e.tipo === 'parto' && e.subtipo === 'aborto').length;
  const ieps: number[] = [];
  for (let i = 1; i < partos.length; i++) ieps.push(diasEntre(partos[i - 1].data, partos[i].data));
  const res = resultadosServicos(ev);
  const servicos = res.length;
  const concepcoes = res.filter((r) => r.resultado === 'prenhe').length;
  // Dias em aberto: do último parto até o serviço que emprenhou (ou até hoje, se ainda não emprenhou).
  let diasAberto: number | null = null;
  const ultParto = partos[partos.length - 1];
  if (ultParto) {
    const concep = res.find((r) => r.resultado === 'prenhe' && r.servico.data > ultParto.data);
    diasAberto = diasEntre(ultParto.data, concep ? concep.servico.data : hojeIso);
  }
  return {
    partos: partos.length,
    abortos,
    iepMedio: ieps.length ? Math.round(ieps.reduce((s, x) => s + x, 0) / ieps.length) : null,
    diasAberto,
    servicosPorConcepcao: concepcoes ? servicos / concepcoes : null,
    servicos,
    concepcoes,
  };
}

/** Cada serviço com o resultado do DG seguinte (antes de outro serviço ou parto). */
export function resultadosServicos(eventos: Evento[]): { servico: Evento; resultado: 'prenhe' | 'vazia' | 'pendente' }[] {
  const ev = ordenar(eventos);
  const saida: { servico: Evento; resultado: 'prenhe' | 'vazia' | 'pendente' }[] = [];
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].tipo !== 'servico') continue;
    let r: 'prenhe' | 'vazia' | 'pendente' = 'pendente';
    for (let j = i + 1; j < ev.length; j++) {
      if (ev[j].tipo === 'dg') {
        r = ev[j].subtipo === 'prenhe' ? 'prenhe' : 'vazia';
        break;
      }
      if (ev[j].tipo === 'servico' || ev[j].tipo === 'parto') {
        // novo serviço sem DG: o anterior não emprenhou; parto confirma a prenhez
        r = ev[j].tipo === 'parto' && ev[j].subtipo !== 'aborto' ? 'prenhe' : 'vazia';
        break;
      }
    }
    saida.push({ servico: ev[i], resultado: r });
  }
  return saida;
}

// ---------- indicadores do rebanho ----------
export type Grupo = { chave: string; servicos: number; prenhes: number; vazias: number; pendentes: number };

export function classeEcc(ecc: number | null | undefined): string {
  if (ecc == null) return 'ECC não informado';
  if (ecc < 2.5) return 'ECC abaixo de 2,5';
  if (ecc < 3) return 'ECC 2,5 a 2,9';
  if (ecc < 3.5) return 'ECC 3,0 a 3,4';
  return 'ECC 3,5 ou mais';
}

/** Taxa de concepção agrupada (por touro, inseminador, protocolo, ECC). Eventos de várias fêmeas. */
export function agrupar(eventos: Evento[], chave: (s: Evento) => string | null): Grupo[] {
  const porAnimal: Record<string, Evento[]> = {};
  for (const e of eventos) (porAnimal[e.animal_id ?? ''] ??= []).push(e);
  const g: Record<string, Grupo> = {};
  for (const lista of Object.values(porAnimal)) {
    for (const r of resultadosServicos(lista)) {
      const k = chave(r.servico);
      if (!k) continue;
      const x = (g[k] ??= { chave: k, servicos: 0, prenhes: 0, vazias: 0, pendentes: 0 });
      x.servicos++;
      if (r.resultado === 'prenhe') x.prenhes++;
      else if (r.resultado === 'vazia') x.vazias++;
      else x.pendentes++;
    }
  }
  return Object.values(g).sort((a, b) => taxa(b) - taxa(a));
}
export const taxa = (g: { prenhes: number; vazias: number }) => (g.prenhes + g.vazias ? (g.prenhes / (g.prenhes + g.vazias)) * 100 : -1);

// ---------- parentesco ----------
export type Genealogia = {
  id: string;
  pai_id: string | null;
  mae_id: string | null;
  avo_paterno?: string | null;
  avo_materno?: string | null;
  /** bisavôs (V127) */
  bisavo_mmp?: string | null;
  bisavo_mpp?: string | null;
  bisavo_pmp?: string | null;
  bisavo_ppp?: string | null;
  registro?: string | null;
  brinco?: string | null;
  paiDoPai?: string | null;
  paiDaMae?: string | null;
};

/** Consanguinidade esperada da cria (coeficiente de endogamia) quando há parentesco próximo. */
export function parentesco(femea: Genealogia, touro: Genealogia): { perc: number; motivo: string } | null {
  const achados: { perc: number; motivo: string }[] = [];
  if (femea.pai_id && femea.pai_id === touro.id) achados.push({ perc: 25, motivo: 'o touro é o pai da fêmea' });
  if (touro.mae_id && touro.mae_id === femea.id) achados.push({ perc: 25, motivo: 'a fêmea é a mãe do touro' });
  const mesmoPai = !!femea.pai_id && femea.pai_id === touro.pai_id;
  const mesmaMae = !!femea.mae_id && femea.mae_id === touro.mae_id;
  if (mesmoPai && mesmaMae) achados.push({ perc: 25, motivo: 'são irmãos (mesmo pai e mesma mãe)' });
  else if (mesmoPai) achados.push({ perc: 12.5, motivo: 'são meio-irmãos (mesmo pai)' });
  else if (mesmaMae) achados.push({ perc: 12.5, motivo: 'são meio-irmãos (mesma mãe)' });
  if (femea.paiDoPai && femea.paiDoPai === touro.id) achados.push({ perc: 12.5, motivo: 'o touro é avô paterno da fêmea' });
  if (femea.paiDaMae && femea.paiDaMae === touro.id) achados.push({ perc: 12.5, motivo: 'o touro é avô materno da fêmea' });
  const reg = (touro.registro || touro.brinco || '').toUpperCase().replace(/\s/g, '');
  if (reg) {
    const igual = (t?: string | null) => !!t && t.toUpperCase().replace(/\s/g, '').startsWith(reg);
    if (igual(femea.avo_paterno) || igual(femea.avo_materno)) achados.push({ perc: 12.5, motivo: 'o touro aparece como avô da fêmea' });
    if ([femea.bisavo_mmp, femea.bisavo_mpp, femea.bisavo_pmp, femea.bisavo_ppp].some(igual)) achados.push({ perc: 6.25, motivo: 'o touro aparece como bisavô da fêmea' });
  }
  if (!achados.length) return null;
  return achados.sort((a, b) => b.perc - a.perc)[0];
}
export const LIMITE_CONSANGUINIDADE = 6.25;
