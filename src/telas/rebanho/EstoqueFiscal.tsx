import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarNumero, somenteDigitos } from '../../lib/formatos';
import { perguntar } from '../../lib/perguntar';
import { FAIXAS_IDADE, faixaPorChave, type Sexo } from '../../lib/faixas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

// V178: estoque do gado por sexo e faixa da GTA.
// V189: ESTOQUE DE GADO com dois estoques: o Total e o Com GTA (movimentado pelas GTAs e pela parte com GTA
// de cada lançamento, inclusive o saldo inicial). Diferença = Total − Com GTA.
// V190: nascimento só com fêmeas de 13 meses ou mais no estoque; nascimentos e mortes entram no Total e só vão
// para o Com GTA (estoque do IDAF) pela Comunicação ao IDAF; controle de lançados, comunicados e a comunicar.

// V192: o estoque é separado por dono: Próprio na fazenda, de cada Terceiro na fazenda (parceiro) e o Próprio
// em posse de terceiros (remessa em parceria). Remessa, devolução da parceria e acerto em bezerros mexem em dois
// quadros ao mesmo tempo (dois lançamentos ligados pelo par_id; excluir um apaga o outro).
type Dono = 'proprio' | 'terceiro' | 'remessa';
type Tipo = 'inicial' | 'nascimento' | 'morte' | 'comunicacao' | 'evolucao' | 'ajuste_entrada' | 'ajuste_saida' | 'entrada_parceria' | 'saida_parceria' | 'remessa' | 'retorno' | 'acerto';
type DefTipo = { valor: Tipo; rotulo: string; sinal: 1 | -1 | 0; par?: Dono };
const DONOS: { valor: Dono; rotulo: string }[] = [
  { valor: 'proprio', rotulo: 'Próprio na fazenda' },
  { valor: 'terceiro', rotulo: 'De terceiro na fazenda' },
  { valor: 'remessa', rotulo: 'Nosso em posse de terceiro' },
];
const T = {
  inicial: { valor: 'inicial', rotulo: 'Saldo inicial', sinal: 1 },
  nascimento: { valor: 'nascimento', rotulo: 'Nascimento', sinal: 1 },
  morte: { valor: 'morte', rotulo: 'Morte', sinal: -1 },
  comunicacao: { valor: 'comunicacao', rotulo: 'Comunicação ao IDAF', sinal: 0 },
  evolucao: { valor: 'evolucao', rotulo: 'Mudança de faixa (idade)', sinal: 0 },
  ajuste_entrada: { valor: 'ajuste_entrada', rotulo: 'Outra entrada', sinal: 1 },
  ajuste_saida: { valor: 'ajuste_saida', rotulo: 'Outra saída', sinal: -1 },
} as const satisfies Record<string, DefTipo>;
function tiposDo(d: Dono): DefTipo[] {
  if (d === 'terceiro')
    return [
      T.inicial,
      { valor: 'entrada_parceria', rotulo: 'Entrada em parceria', sinal: 1 },
      { valor: 'saida_parceria', rotulo: 'Devolução ao parceiro', sinal: -1 },
      T.nascimento,
      T.morte,
      T.comunicacao,
      { valor: 'acerto', rotulo: 'Acerto em bezerros (passam para o nosso)', sinal: -1, par: 'proprio' },
      T.evolucao,
      T.ajuste_entrada,
      T.ajuste_saida,
    ];
  if (d === 'remessa')
    return [
      T.inicial,
      { valor: 'retorno', rotulo: 'Devolução da parceria (volta para o nosso)', sinal: -1, par: 'proprio' },
      T.nascimento,
      T.morte,
      { valor: 'acerto', rotulo: 'Acerto em bezerros (passam para o parceiro)', sinal: -1 },
      T.evolucao,
      T.ajuste_entrada,
      T.ajuste_saida,
    ];
  return [T.inicial, T.nascimento, T.morte, T.comunicacao, T.evolucao, { valor: 'remessa', rotulo: 'Remessa em parceria (vai para o parceiro)', sinal: -1, par: 'remessa' }, T.ajuste_entrada, T.ajuste_saida];
}
const ROTULO_TIPO: Record<string, string> = {
  ...Object.fromEntries(Object.values(T).map((x) => [x.valor, x.rotulo])),
  entrada_parceria: 'Entrada em parceria',
  saida_parceria: 'Devolução ao parceiro',
  remessa: 'Remessa em parceria',
  retorno: 'Devolução da parceria',
  acerto: 'Acerto em bezerros',
};
const rotuloTipo = (t: string) => ROTULO_TIPO[t] ?? t;
const nomeQuadro = (d: string, parceiro?: string | null) => (d === 'terceiro' ? `De ${parceiro ?? 'terceiro'}` : d === 'remessa' ? `Nosso com ${parceiro ?? 'terceiro'}` : 'Próprio na fazenda');
/** id para ligar os dois lados de um lançamento */
const novoId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});
const inverte = (q: Record<string, number>) => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, -v]));

/** Linhas do estoque: machos (4 faixas) e depois fêmeas (6 faixas). */
const LINHAS = (['M', 'F'] as Sexo[]).flatMap((sx) =>
  FAIXAS_IDADE[sx].map((f) => ({ chave: `${sx}${f.de}`, sexo: sx, faixa: f.ate === null ? 'Acima de 36' : f.rotulo.replace(' meses', '') })),
);
const rotuloFaixaChave = (k: string) => {
  const f = faixaPorChave(k);
  return f ? (f.ate === null ? 'acima de 36 m' : f.rotulo.replace(' meses', ' m')) : k;
};
const rotuloChave = (k: string) => `${k[0] === 'M' ? 'Macho' : 'Fêmea'} ${rotuloFaixaChave(k)}`;
const faixasDoSexo = (sx: string) => FAIXAS_IDADE[sx === 'F' ? 'F' : 'M'].map((f) => ({ valor: String(f.de), rotulo: f.ate === null ? 'Acima de 36 meses' : f.rotulo }));
const inteiro = (t: string) => somenteDigitos(t).slice(0, 6);
const sinalTexto = (n: number) => (n > 0 ? `+${formatarNumero(n)}` : formatarNumero(n));
const num = (x: unknown) => Number(x) || 0;

type Saldo = { dono: Dono; parceiro_id: string | null; parceiro: string | null; chave: string; sexo: string; faixa: number; saldo: number; entradas: number; saidas: number; saldo_gta: number; diferenca: number };
type Mov = { id: string; origem: 'lanc' | 'gta'; tipo?: string; data: string; titulo: string; q: Record<string, number>; qg: Record<string, number>; detalhe: (string | null)[]; mov?: boolean; par?: boolean };
type GtaSaida = { id: string; numero: string | null; data: string; destino: string | null; finalidade: string | null; cabecas: number };

const somaQ = (q: Record<string, number>) => Object.values(q).reduce((a, v) => a + v, 0);
function textoQtd(q: Record<string, number>) {
  return LINHAS.filter((l) => num(q[l.chave])).map((l) => `${rotuloChave(l.chave)} ${sinalTexto(num(q[l.chave]))}`).join(' · ');
}
const MSG_BANCO = 'Falta atualizar o banco do estoque de gado (V192).';

/** Nascimentos e mortes: lançados, comunicados ao IDAF e a comunicar, por sexo. */
type PorSexo = { M: number; F: number };
type Controle = { nasc: PorSexo; nascCom: PorSexo; morte: PorSexo; morteCom: PorSexo };
const zero = (): PorSexo => ({ M: 0, F: 0 });
async function lerControle(fid: string, ate: string, quadro?: { dono: Dono; parceiro: string | null }): Promise<Controle> {
  // sem quadro: o que está na fazenda (próprio e terceiros), que é o que se comunica ao IDAF
  let qr = supabase.from('estoque_fiscal_lanc').select('tipo, quantidades, comunicado').eq('fazenda_id', fid).in('tipo', ['nascimento', 'morte', 'comunicacao']).lte('data', ate);
  if (!quadro) qr = qr.in('dono', ['proprio', 'terceiro']);
  else {
    qr = qr.eq('dono', quadro.dono);
    qr = quadro.parceiro ? qr.eq('parceiro_id', quadro.parceiro) : qr.is('parceiro_id', null);
  }
  const l = await consulta<any[]>(qr);
  const c: Controle = { nasc: zero(), nascCom: zero(), morte: zero(), morteCom: zero() };
  const soma = (alvo: PorSexo, o: any, sinal = 1) => Object.entries(o ?? {}).forEach(([k, v]) => { if (k[0] === 'M' || k[0] === 'F') alvo[k[0] as Sexo] += sinal * num(v); });
  for (const x of l) {
    if (x.tipo === 'nascimento') soma(c.nasc, x.quantidades);
    else if (x.tipo === 'morte') soma(c.morte, x.quantidades, -1);
    else {
      soma(c.nascCom, x.comunicado?.nasc);
      soma(c.morteCom, x.comunicado?.morte);
    }
  }
  return c;
}
const aComunicar = (c: Controle) => ({ nasc: { M: c.nasc.M - c.nascCom.M, F: c.nasc.F - c.nascCom.F }, morte: { M: c.morte.M - c.morteCom.M, F: c.morte.F - c.morteCom.F } });
function textoComunicado(o: any) {
  const n = o?.nasc ?? {};
  const m = Object.entries(o?.morte ?? {}).reduce((a, [k, v]) => ({ ...a, [k[0]]: (a as any)[k[0]] + num(v) }), zero()) as PorSexo;
  return [num(n.M0) || num(n.F0) ? `Nascimentos: ${formatarNumero(num(n.M0))} M · ${formatarNumero(num(n.F0))} F` : null, m.M || m.F ? `Mortes: ${formatarNumero(m.M)} M · ${formatarNumero(m.F)} F` : null].filter(Boolean).join(' · ');
}

export default function EstoqueFiscal() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'EstoqueFiscal'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'consultar');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: 'Estoque de gado' });
  }, [navegacao]);

  // ---------- lançar ----------
  const [dono, setDono] = useState<Dono[]>(['proprio']);
  const [parceiroId, setParceiroId] = useState<string | null>(null);
  const parceiroQuadro = dono[0] === 'proprio' ? null : parceiroId;
  const [tipo, setTipo] = useState<string[]>(['inicial']);
  const [data, setData] = useState(hojeBR());
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [qtdG, setQtdG] = useState<Record<string, string>>({});
  const [sexoEv, setSexoEv] = useState<string[]>(['M']);
  const [deEv, setDeEv] = useState<string[]>(['0']);
  const [paraEv, setParaEv] = useState<string[]>(['13']);
  const [qtdEv, setQtdEv] = useState('');
  const [qtdEvG, setQtdEvG] = useState('');
  const [nf, setNf] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [saldosHoje, setSaldosHoje] = useState<Saldo[]>([]);
  const saldoAtual = useMemo(
    () => Object.fromEntries(saldosHoje.filter((x) => x.dono === dono[0] && (x.parceiro_id ?? null) === parceiroQuadro).map((x) => [x.chave, { t: x.saldo, g: x.saldo_gta }])) as Record<string, { t: number; g: number }>,
    [saldosHoje, dono, parceiroQuadro],
  );
  const [controle, setControle] = useState<Controle | null>(null);
  const [comN, setComN] = useState<Record<string, string>>({});
  const [comM, setComM] = useState<Record<string, string>>({});
  const [protocolo, setProtocolo] = useState('');
  /** saldo inicial já lançado nesta fazenda (abre para alterar) */
  const [inicialId, setInicialId] = useState<string | null>(null);

  const tipos = tiposDo(dono[0]);
  const t = tipos.find((x) => x.valor === tipo[0]) ?? tipos[0];
  const linhasLanc = t.valor === 'nascimento' ? LINHAS.filter((l) => l.chave === 'M0' || l.chave === 'F0') : LINHAS;
  /** nascimento e morte na fazenda: só a quantidade (vão para o Com GTA quando comunicados ao IDAF);
   *  no gado nosso em posse de terceiro informa-se também o com GTA */
  const soTotal = (t.valor === 'nascimento' || t.valor === 'morte') && dono[0] !== 'remessa';
  const femeasAptas = ['F13', 'F25', 'F37'].reduce((a, k) => a + (saldoAtual[k]?.t ?? 0), 0);

  const erroBanco = (e: unknown) => {
    const m = traduzirErro(e);
    return /estoque_fiscal|quantidades_gta|does not exist|schema cache/i.test(m) ? MSG_BANCO : m;
  };

  const carregarSaldoAtual = useCallback(async () => {
    if (!fid) return;
    try {
      setSaldosHoje(await consulta<Saldo[]>(supabase.rpc('estoque_gado_donos', { p_fazenda: fid, p_data: hojeBanco() })));
      setControle(dono[0] !== 'proprio' && !parceiroQuadro ? null : await lerControle(fid, hojeBanco(), { dono: dono[0], parceiro: parceiroQuadro }));
    } catch (e) {
      setErro(erroBanco(e));
    }
  }, [fid, dono, parceiroQuadro]);

  /** Saldo inicial já lançado: traz os números para conferir e alterar. */
  const carregarInicial = useCallback(async () => {
    if (!fid) return;
    try {
      if (dono[0] !== 'proprio' && !parceiroQuadro) {
        setInicialId(null);
        return;
      }
      let qr = supabase.from('estoque_fiscal_lanc').select('id, data, quantidades, quantidades_gta').eq('fazenda_id', fid).eq('tipo', 'inicial').eq('dono', dono[0]);
      qr = parceiroQuadro ? qr.eq('parceiro_id', parceiroQuadro) : qr.is('parceiro_id', null);
      const l = await consulta<any[]>(qr.order('created_at').limit(1));
      const x = l[0];
      setInicialId(x?.id ?? null);
      if (x) {
        setData(doBanco(x.data));
        setQtd(Object.fromEntries(Object.entries(x.quantidades ?? {}).map(([k, v]) => [k, num(v) ? String(num(v)) : ''])));
        setQtdG(Object.fromEntries(Object.entries(x.quantidades_gta ?? {}).map(([k, v]) => [k, num(v) ? String(num(v)) : ''])));
      } else {
        setQtd({});
        setQtdG({});
      }
    } catch (e) {
      setErro(erroBanco(e));
    }
  }, [fid, dono, parceiroQuadro]);

  useFocusEffect(
    useCallback(() => {
      carregarSaldoAtual();
    }, [carregarSaldoAtual]),
  );
  useEffect(() => {
    if (aba === 'cadastrar' && tipo[0] === 'inicial') carregarInicial();
  }, [aba, tipo, carregarInicial]);

  function limpar() {
    setQtd({});
    setQtdG({});
    setQtdEv('');
    setQtdEvG('');
    setNf('');
    setComN({});
    setComM({});
    setProtocolo('');
  }

  const totLanc = linhasLanc.reduce((a, l) => a + num(qtd[l.chave]), 0);
  const totLancG = linhasLanc.reduce((a, l) => a + num(qtdG[l.chave]), 0);

  async function gravar() {
    setErro(null);
    setOk(null);
    if (!fid) return;
    if (!dataValida(data)) return setErro('Informe a data.');
    if (dono[0] !== 'proprio' && !parceiroId) return setErro('Informe o parceiro.');
    if (t.valor === 'acerto' && !nf.trim()) return setErro('O acerto em bezerros vai com a NF (e a GTA) de venda do dono das vacas: informe o nº da NF.');
    let q: Record<string, number> = {};
    let qg: Record<string, number> = {};
    let comunicado: { nasc: Record<string, number>; morte: Record<string, number> } | null = null;
    if (t.valor === 'comunicacao') {
      const ac = controle ? aComunicar(controle) : { nasc: zero(), morte: zero() };
      const nasc: Record<string, number> = {};
      const morte: Record<string, number> = {};
      const erros: string[] = [];
      (['M', 'F'] as Sexo[]).forEach((sx) => {
        const n = num(comN[sx]);
        if (n > ac.nasc[sx]) erros.push(`Nascimentos ${sx === 'M' ? 'machos' : 'fêmeas'}: a comunicar ${formatarNumero(ac.nasc[sx])}, informado ${formatarNumero(n)}`);
        if (n > 0) nasc[`${sx}0`] = n;
        const ls = LINHAS.filter((l) => l.sexo === sx);
        const m = ls.reduce((a, l) => a + num(comM[l.chave]), 0);
        if (m > ac.morte[sx]) erros.push(`Mortes ${sx === 'M' ? 'machos' : 'fêmeas'}: a comunicar ${formatarNumero(ac.morte[sx])}, informado ${formatarNumero(m)}`);
        ls.forEach((l) => num(comM[l.chave]) > 0 && (morte[l.chave] = num(comM[l.chave])));
      });
      if (erros.length) return setErro(`Mais do que há para comunicar:\n• ${erros.join('\n• ')}`);
      if (!Object.keys(nasc).length && !Object.keys(morte).length) return setErro('Informe os nascimentos e/ou as mortes comunicados.');
      Object.entries(nasc).forEach(([k, v]) => (qg[k] = (qg[k] ?? 0) + v));
      Object.entries(morte).forEach(([k, v]) => (qg[k] = (qg[k] ?? 0) - v));
      const neg = Object.entries(qg).filter(([k, v]) => v < 0 && (saldoAtual[k]?.g ?? 0) + v < 0).map(([k]) => `${rotuloChave(k)}: com GTA ${formatarNumero(saldoAtual[k]?.g ?? 0)}`);
      if (neg.length) return setErro(`O estoque com GTA ficaria negativo:\n• ${neg.join('\n• ')}`);
      comunicado = { nasc, morte };
    } else if (t.valor === 'evolucao') {
      const n = num(qtdEv);
      const g = num(qtdEvG);
      if (n <= 0) return setErro('Informe quantos animais mudaram de faixa.');
      if (g > n) return setErro('Os com GTA não podem passar do total.');
      if (deEv[0] === paraEv[0]) return setErro('A faixa de destino tem de ser diferente da de origem.');
      const s = sexoEv[0];
      q = { [`${s}${deEv[0]}`]: -n, [`${s}${paraEv[0]}`]: n };
      qg = g ? { [`${s}${deEv[0]}`]: -g, [`${s}${paraEv[0]}`]: g } : {};
    } else {
      const acima: string[] = [];
      for (const l of linhasLanc) {
        const n = num(qtd[l.chave]);
        const g = num(qtdG[l.chave]);
        if (g > n) acima.push(rotuloChave(l.chave));
        if (n > 0) q[l.chave] = n * t.sinal;
        if (g > 0) qg[l.chave] = g * t.sinal;
      }
      if (soTotal) qg = {};
      else if (acima.length) return setErro(`Os com GTA não podem passar do total:\n• ${acima.join('\n• ')}`);
      if (!Object.keys(q).length) return setErro(soTotal ? 'Informe a quantidade de pelo menos uma linha.' : 'Informe o total de pelo menos uma linha.');
      if (t.valor === 'nascimento') {
        const n = somaQ(q);
        if (femeasAptas <= 0) return setErro('Não há fêmeas de 13 meses ou mais no estoque: não dá para lançar nascimento.');
        if (n > femeasAptas) return setErro(`Nascimentos (${formatarNumero(n)}) acima das fêmeas de 13 meses ou mais no estoque (${formatarNumero(femeasAptas)}).`);
      }
    }
    // não deixa o estoque ficar negativo (nem o total, nem o com GTA)
    if (t.valor !== 'inicial') {
      const negativos = [
        ...Object.entries(q).filter(([k, v]) => v < 0 && (saldoAtual[k]?.t ?? 0) + v < 0).map(([k, v]) => `${rotuloChave(k)}: total ${formatarNumero(saldoAtual[k]?.t ?? 0)}, saindo ${formatarNumero(-v)}`),
        ...Object.entries(qg).filter(([k, v]) => v < 0 && (saldoAtual[k]?.g ?? 0) + v < 0).map(([k, v]) => `${rotuloChave(k)}: com GTA ${formatarNumero(saldoAtual[k]?.g ?? 0)}, saindo ${formatarNumero(-v)}`),
      ];
      if (negativos.length) return setErro(`O estoque ficaria negativo:\n• ${negativos.join('\n• ')}`);
    }
    setSalvando(true);
    const reg = {
      data: paraBanco(data), quantidades: q, quantidades_gta: qg, nf_numero: nf.trim() || null,
      dono: dono[0], parceiro_id: parceiroQuadro,
      ...(comunicado ? { comunicado, protocolo: protocolo.trim() || null } : {}),
    };
    // remessa, devolução da parceria e acerto em bezerros: sai de um quadro e entra no outro
    const parId = t.par ? novoId() : null;
    const linhas: any[] = [{ ...reg, fazenda_id: fid, tipo: t.valor, observacoes: null, par_id: parId }];
    if (t.par)
      linhas.push({ ...reg, fazenda_id: fid, tipo: t.valor, observacoes: null, par_id: parId, dono: t.par, parceiro_id: t.par === 'proprio' ? null : parceiroId, quantidades: inverte(q), quantidades_gta: inverte(qg) });
    const { error } =
      t.valor === 'inicial' && inicialId
        ? await supabase.from('estoque_fiscal_lanc').update(reg).eq('id', inicialId)
        : await supabase.from('estoque_fiscal_lanc').insert(linhas);
    setSalvando(false);
    if (error) return setErro(erroBanco(error));
    const tq = Math.abs(somaQ(q)) || Math.abs(num(qtdEv));
    const tg = Math.abs(somaQ(qg)) || Math.abs(num(qtdEvG));
    setOk(
      comunicado
        ? `Comunicação ao IDAF lançada: ${textoComunicado(comunicado)}.`
        : soTotal
          ? `${t.rotulo} lançado: ${formatarNumero(tq)} (a comunicar ao IDAF).`
          : `${t.rotulo} ${t.valor === 'inicial' && inicialId ? 'alterado' : 'lançado'} (${DONOS.find((d) => d.valor === dono[0])?.rotulo}): total ${formatarNumero(tq)}, com GTA ${formatarNumero(tg)}, diferença ${formatarNumero(tq - tg)}.`,
    );
    if (t.valor === 'inicial') carregarInicial();
    else limpar();
    carregarSaldoAtual();
  }

  // ---------- consultar ----------
  const [posicao, setPosicao] = useState(hojeBR());
  const [saldos, setSaldos] = useState<Saldo[] | null>(null);
  const [movs, setMovs] = useState<Mov[] | null>(null);
  const [gtasSaida, setGtasSaida] = useState<GtaSaida[]>([]);
  const [controleCons, setControleCons] = useState<Controle | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (aba !== 'consultar' || !fid || !dataValida(posicao)) return;
    const ate = paraBanco(posicao)!;
    setSaldos(null);
    setMovs(null);
    (async () => {
      try {
        lerControle(fid, ate).then(setControleCons).catch(() => setControleCons(null));
        const [s, ls, gs] = await Promise.all([
          consulta<Saldo[]>(supabase.rpc('estoque_gado_donos', { p_fazenda: fid, p_data: ate })),
          consulta<any[]>(supabase.from('estoque_fiscal_lanc').select('id, data, tipo, quantidades, quantidades_gta, nf_numero, gta_numero, movimentacao_id, comunicado, protocolo, dono, par_id, parceiro:parceiro_id ( nome )').eq('fazenda_id', fid).lte('data', ate).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(150)),
          consulta<any[]>(supabase.from('gtas').select('id, direcao, numero, emissao, created_at, finalidade, quantidades, origem, destino, nf_numero, dono, parceiro:parceiro_id ( nome )').eq('fazenda_id', fid).eq('situacao', 'emitida').order('created_at', { ascending: false }).limit(300)),
        ]);
        setSaldos(s);
        const nomeP = (x: any) => (Array.isArray(x) ? x[0] : x)?.nome ?? null;
        const doQuadro = (d: string | null | undefined, x: any) => (d && d !== 'proprio' ? ` · ${nomeQuadro(d, nomeP(x))}` : '');
        const qDe = (o: any, sinal = 1) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, sinal * num(v)]));
        const gtas = gs.map((g) => ({ g, d: (g.emissao ?? g.created_at ?? '').slice(0, 10) })).filter(({ d }) => d && d <= ate);
        const lista: Mov[] = [
          ...ls.map((l) => {
            const q = qDe(l.quantidades);
            return {
              id: l.id,
              origem: 'lanc' as const,
              data: l.data,
              titulo: (l.tipo === 'movimentacao' ? 'Movimentação do rebanho' : rotuloTipo(l.tipo)) + doQuadro(l.dono, l.parceiro),
              mov: !!l.movimentacao_id,
              par: !!l.par_id,
              q,
              qg: l.quantidades_gta ? qDe(l.quantidades_gta) : l.gta_numero ? q : {},
              tipo: l.tipo,
              detalhe: l.tipo === 'comunicacao'
                ? [textoComunicado(l.comunicado), l.protocolo ? `Protocolo ${l.protocolo}` : null]
                : [l.nf_numero ? `NF ${l.nf_numero}` : null, l.gta_numero ? `GTA ${l.gta_numero}` : null],
            };
          }),
          ...gtas.map(({ g, d }) => {
            const q = qDe(g.quantidades, g.direcao === 'entrada' ? 1 : -1);
            return {
              id: g.id,
              origem: 'gta' as const,
              data: d,
              titulo: `GTA ${g.numero ?? ''} · ${g.direcao === 'entrada' ? 'entrada' : 'saída'}${doQuadro(g.dono, g.parceiro)}`,
              q,
              qg: q,
              detalhe: [g.finalidade, g.direcao === 'entrada' ? g.origem?.nome && `De ${g.origem.nome}` : g.destino?.nome && `Para ${g.destino.nome}`, g.nf_numero ? `NF ${g.nf_numero}` : null],
            };
          }),
        ].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
        setMovs(lista.slice(0, 150));
        setGtasSaida(
          gtas
            .filter(({ g }) => g.direcao !== 'entrada')
            .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
            .slice(0, 5)
            .map(({ g, d }) => ({
              id: g.id,
              numero: g.numero,
              data: d,
              destino: g.destino?.nome ?? null,
              finalidade: g.finalidade ?? null,
              cabecas: Object.values(g.quantidades ?? {}).reduce((a: number, v) => a + num(v), 0),
            })),
        );
      } catch (e) {
        setErro(erroBanco(e));
        setSaldos([]);
        setMovs([]);
        setGtasSaida([]);
      }
    })();
  }, [aba, fid, posicao, recarga]);

  async function excluir(m: Mov) {
    if (m.origem === 'gta') return navegacao.push('GtaForm', { aba: 'consultar' });
    if (m.mov) return setErro('Este lançamento veio de uma movimentação do rebanho: altera-se ou exclui-se pela movimentação (Pecuário › Movimentações).');
    if ((m.tipo === 'nascimento' || m.tipo === 'morte') && controleCons) {
      const ac = aComunicar(controleCons);
      const k = m.tipo === 'nascimento' ? 'nasc' : 'morte';
      const sinal = m.tipo === 'nascimento' ? 1 : -1;
      const fura = (['M', 'F'] as Sexo[]).some((sx) => ac[k][sx] - sinal * Object.entries(m.q).filter(([c]) => c[0] === sx).reduce((x, [, v]) => x + v, 0) < 0);
      if (fura) return setErro('Este lançamento já foi comunicado ao IDAF: exclua antes a comunicação.');
    }
    const sim = await perguntar('Excluir lançamento', `${m.titulo} de ${doBanco(m.data)}\n${textoQtd(m.q)}\n\nExcluir este lançamento do estoque de gado?${m.par ? ' O outro lado (o outro quadro) sai junto.' : ''}`, 'Excluir', 'Voltar');
    if (!sim) return;
    const { error } = await supabase.from('estoque_fiscal_lanc').delete().eq('id', m.id);
    if (error) return setErro(traduzirErro(error));
    setOk('Lançamento excluído.');
    setRecarga((r) => r + 1);
    carregarSaldoAtual();
  }

  function tabela(saldos: Saldo[]) {
    const de = (k: string) => saldos.find((s) => s.chave === k);
    const soma = (f: (s: Saldo) => boolean) => {
      const l = saldos.filter(f);
      return { t: l.reduce((a, s) => a + s.saldo, 0), g: l.reduce((a, s) => a + s.saldo_gta, 0) };
    };
    const linhaTotal = (rot: string, x: { t: number; g: number }, forte = false) => (
      <View key={rot} style={[estilos.linhaTab, estilos.sub, forte && estilos.rodape]}>
        <Text style={[estilos.cel1, { fontWeight: '800' }]}>{rot}</Text>
        <Text style={[estilos.cel, { fontWeight: '800' }]}>{formatarNumero(x.t)}</Text>
        <Text style={[estilos.cel, { fontWeight: '800' }]}>{formatarNumero(x.g)}</Text>
        <Text style={[estilos.cel, { fontWeight: '800' }, x.t - x.g !== 0 && { color: cores.cafe }]}>{formatarNumero(x.t - x.g)}</Text>
      </View>
    );
    return (
      <View style={estilos.tabela}>
        <View style={[estilos.linhaTab, estilos.cab]}>
          <Text style={[estilos.cel1, estilos.cabTexto]}>Faixa (meses)</Text>
          <Text style={[estilos.cel, estilos.cabTexto]}>Total</Text>
          <Text style={[estilos.cel, estilos.cabTexto]}>Com GTA</Text>
          <Text style={[estilos.cel, estilos.cabTexto]}>Diferença</Text>
        </View>
        {(['M', 'F'] as Sexo[]).map((sx) => (
          <React.Fragment key={sx}>
            <View style={[estilos.linhaTab, estilos.grupo]}>
              <Text style={estilos.grupoTexto}>{sx === 'M' ? 'Machos' : 'Fêmeas'}</Text>
            </View>
            {LINHAS.filter((l) => l.sexo === sx).map((l) => {
              const s = de(l.chave);
              const tt = s?.saldo ?? 0;
              const g = s?.saldo_gta ?? 0;
              return (
                <View key={l.chave} style={estilos.linhaTab}>
                  <Text style={estilos.cel1}>{l.faixa}</Text>
                  <Text style={[estilos.cel, tt < 0 && { color: cores.erro }]}>{formatarNumero(tt)}</Text>
                  <Text style={[estilos.cel, g < 0 && { color: cores.erro }]}>{formatarNumero(g)}</Text>
                  <Text style={[estilos.cel, tt - g !== 0 && { color: cores.cafe, fontWeight: '700' }]}>{formatarNumero(tt - g)}</Text>
                </View>
              );
            })}
            {linhaTotal(sx === 'M' ? 'Total machos' : 'Total fêmeas', soma((s) => s.sexo === sx))}
          </React.Fragment>
        ))}
        {linhaTotal('Total geral', soma(() => true), true)}
      </View>
    );
  }

  /** V192: um quadro por dono (próprio, cada terceiro, cada remessa) e o resumo com os totais */
  function quadros(todos: Saldo[]) {
    const grupos: { chave: string; dono: Dono; nome: string | null; linhas: Saldo[] }[] = [];
    for (const s of todos) {
      const k = `${s.dono}|${s.parceiro_id ?? ''}`;
      let g = grupos.find((x) => x.chave === k);
      if (!g) grupos.push((g = { chave: k, dono: s.dono, nome: s.parceiro, linhas: [] }));
      g.linhas.push(s);
    }
    const tem = (g: { dono: Dono; linhas: Saldo[] }) => g.dono === 'proprio' || g.linhas.some((s) => s.saldo || s.saldo_gta);
    const visiveis = grupos.filter(tem);
    const tot = (l: Saldo[]) => ({ t: l.reduce((a, s) => a + s.saldo, 0), g: l.reduce((a, s) => a + s.saldo_gta, 0) });
    const de = (d: Dono) => visiveis.filter((g) => g.dono === d);
    const proprio = tot(de('proprio').flatMap((g) => g.linhas));
    const remessa = tot(de('remessa').flatMap((g) => g.linhas));
    const terceiros = tot(de('terceiro').flatMap((g) => g.linhas));
    const soma = (a: { t: number; g: number }, b: { t: number; g: number }) => ({ t: a.t + b.t, g: a.g + b.g });
    const linha = (rot: string, x: { t: number; g: number }, estilo?: object) => (
      <View key={rot} style={[estilos.linhaTab, estilo]}>
        <Text style={[estilos.cel1, estilo && { fontWeight: '800' }]}>{rot}</Text>
        <Text style={[estilos.cel, estilo && { fontWeight: '800' }]}>{formatarNumero(x.t)}</Text>
        <Text style={[estilos.cel, estilo && { fontWeight: '800' }]}>{formatarNumero(x.g)}</Text>
        <Text style={[estilos.cel, x.t - x.g !== 0 && { color: cores.cafe, fontWeight: '700' }]}>{formatarNumero(x.t - x.g)}</Text>
      </View>
    );
    return (
      <>
        {visiveis.length > 1 && (
          <>
            <Secao titulo="Resumo" />
            <View style={estilos.tabela}>
              <View style={[estilos.linhaTab, estilos.cab]}>
                <Text style={[estilos.cel1, estilos.cabTexto]}></Text>
                <Text style={[estilos.cel, estilos.cabTexto]}>Total</Text>
                <Text style={[estilos.cel, estilos.cabTexto]}>Com GTA</Text>
                <Text style={[estilos.cel, estilos.cabTexto]}>Diferença</Text>
              </View>
              <View style={[estilos.linhaTab, estilos.grupo]}><Text style={estilos.grupoTexto}>Próprio</Text></View>
              {linha('Na fazenda', proprio)}
              {de('remessa').map((g) => linha(`Com ${g.nome ?? 'terceiro'}`, tot(g.linhas)))}
              {linha('Próprio total', soma(proprio, remessa), estilos.sub)}
              {de('terceiro').length > 0 && <View style={[estilos.linhaTab, estilos.grupo]}><Text style={estilos.grupoTexto}>De terceiros na fazenda</Text></View>}
              {de('terceiro').map((g) => linha(g.nome ?? 'Terceiro', tot(g.linhas)))}
              {de('terceiro').length > 0 && linha('Total de terceiros', terceiros, estilos.sub)}
              {linha('Total na fazenda', soma(proprio, terceiros), estilos.sub)}
              {linha('Total geral', soma(soma(proprio, remessa), terceiros), estilos.rodape)}
            </View>
          </>
        )}
        {visiveis.map((g) => (
          <React.Fragment key={g.chave}>
            {visiveis.length > 1 && <Secao titulo={nomeQuadro(g.dono, g.nome)} />}
            {tabela(g.linhas)}
          </React.Fragment>
        ))}
      </>
    );
  }

  const entrada = (valor: string | undefined, aoMudar: (x: string) => void) => (
    <TextInput style={estilos.entrada} value={valor ?? ''} onChangeText={(x) => aoMudar(inteiro(x))} keyboardType="number-pad" selectTextOnFocus autoComplete="off" placeholder="0" placeholderTextColor={cores.textoSuave} />
  );

  return (
    <Tela>
      <AbasCadastro aba={aba} aoMudar={(a) => { setAba(a); setErro(null); setOk(null); }} rotuloCadastrar="Lançar" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {ok && <Aviso tipo="sucesso" texto={ok} />}

      {aba === 'cadastrar' ? (
        <>
          <Escolha
            rotulo="De quem é o gado"
            opcoes={DONOS}
            valor={dono}
            aoMudar={(v) => {
              if (!v.length) return;
              setDono(v as Dono[]);
              setTipo(['inicial']);
              limpar();
              setOk(null);
            }}
          />
          {dono[0] !== 'proprio' && <CampoPessoaBusca rotulo="Parceiro *" valorId={parceiroId} aoMudar={setParceiroId} tipoNovo="parceiro" />}
          <Escolha rotulo="O que está lançando" opcoes={tipos.map((x) => ({ valor: x.valor, rotulo: x.rotulo }))} valor={[t.valor]} aoMudar={(v) => { if (!v.length) return; setTipo(v); setQtd({}); setQtdG({}); setOk(null); if (v[0] !== 'inicial') setData(hojeBR()); }} />
          <CampoData rotulo="Data" valor={data} aoMudar={setData} />

          {t.valor === 'evolucao' ? (
            <>
              <Escolha
                rotulo="Sexo"
                opcoes={[{ valor: 'M', rotulo: 'Machos' }, { valor: 'F', rotulo: 'Fêmeas' }]}
                valor={sexoEv}
                aoMudar={(v) => {
                  if (!v.length) return;
                  setSexoEv(v);
                  const l = faixasDoSexo(v[0]);
                  setDeEv([l[0].valor]);
                  setParaEv([l[1].valor]);
                }}
              />
              <Escolha
                rotulo="Saem da faixa"
                opcoes={faixasDoSexo(sexoEv[0])}
                valor={deEv}
                aoMudar={(v) => {
                  if (!v.length) return;
                  setDeEv(v);
                  const l = faixasDoSexo(sexoEv[0]);
                  const i = l.findIndex((f) => f.valor === v[0]);
                  if (l[i + 1]) setParaEv([l[i + 1].valor]);
                }}
              />
              <Escolha rotulo="Entram na faixa" opcoes={faixasDoSexo(sexoEv[0])} valor={paraEv} aoMudar={(v) => v.length && setParaEv(v)} />
              <View style={estilos.par}>
                <View style={{ flex: 1 }}>
                  <Campo rotulo={`Total (tem ${formatarNumero(saldoAtual[`${sexoEv[0]}${deEv[0]}`]?.t ?? 0)})`} value={qtdEv} onChangeText={(x) => setQtdEv(inteiro(x))} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo rotulo={`Com GTA (tem ${formatarNumero(saldoAtual[`${sexoEv[0]}${deEv[0]}`]?.g ?? 0)})`} value={qtdEvG} onChangeText={(x) => setQtdEvG(inteiro(x))} keyboardType="number-pad" />
                </View>
              </View>
              <Text style={estilos.totalLanc}>Diferença: {formatarNumero(num(qtdEv) - num(qtdEvG))}</Text>
            </>
          ) : t.valor === 'comunicacao' ? (
            (() => {
              const ac = controle ? aComunicar(controle) : { nasc: zero(), morte: zero() };
              return (
                <>
                  <Campo rotulo="Nº do protocolo / comunicação (opcional)" value={protocolo} onChangeText={setProtocolo} />
                  <View style={estilos.tabela}>
                    <View style={[estilos.linhaTab, estilos.cab]}>
                      <Text style={[estilos.cel1, estilos.cabTexto]}>Nascimentos</Text>
                      <Text style={[estilos.cel, estilos.cabTexto]}>A comunicar</Text>
                      <Text style={[estilos.cel, estilos.cabTexto]}>Comunicados</Text>
                    </View>
                    {(['M', 'F'] as Sexo[]).map((sx) => (
                      <View key={sx} style={[estilos.linhaTab, { alignItems: 'center' }]}>
                        <Text style={estilos.cel1}>{sx === 'M' ? 'Machos' : 'Fêmeas'}</Text>
                        <Text style={estilos.cel}>{formatarNumero(ac.nasc[sx])}</Text>
                        <View style={estilos.celEntrada}>{entrada(comN[sx], (x) => setComN((q) => ({ ...q, [sx]: x })))}</View>
                      </View>
                    ))}
                  </View>
                  <View style={estilos.tabela}>
                    <View style={[estilos.linhaTab, estilos.cab]}>
                      <Text style={[estilos.cel1, estilos.cabTexto]}>Mortes (meses)</Text>
                      <Text style={[estilos.cel, estilos.cabTexto]}>Com GTA</Text>
                      <Text style={[estilos.cel, estilos.cabTexto]}>Comunicadas</Text>
                    </View>
                    {(['M', 'F'] as Sexo[]).map((sx) => (
                      <React.Fragment key={sx}>
                        <View style={[estilos.linhaTab, estilos.grupo]}>
                          <Text style={estilos.grupoTexto}>{sx === 'M' ? 'Machos' : 'Fêmeas'} · a comunicar {formatarNumero(ac.morte[sx])}</Text>
                        </View>
                        {LINHAS.filter((l) => l.sexo === sx).map((l) => (
                          <View key={l.chave} style={[estilos.linhaTab, { alignItems: 'center' }]}>
                            <Text style={estilos.cel1}>{l.faixa}</Text>
                            <Text style={estilos.cel}>{formatarNumero(saldoAtual[l.chave]?.g ?? 0)}</Text>
                            <View style={estilos.celEntrada}>{entrada(comM[l.chave], (x) => setComM((q) => ({ ...q, [l.chave]: x })))}</View>
                          </View>
                        ))}
                      </React.Fragment>
                    ))}
                  </View>
                </>
              );
            })()
          ) : (
            <View style={estilos.tabela}>
              <View style={[estilos.linhaTab, estilos.cab]}>
                <Text style={[estilos.cel1, estilos.cabTexto]}>Faixa (meses)</Text>
                {soTotal ? (
                  <Text style={[estilos.cel, estilos.cabTexto]}>Quantidade</Text>
                ) : (
                  <>
                    <Text style={[estilos.cel, estilos.cabTexto]}>Total</Text>
                    <Text style={[estilos.cel, estilos.cabTexto]}>Com GTA</Text>
                    <Text style={[estilos.cel, estilos.cabTexto]}>Diferença</Text>
                  </>
                )}
              </View>
              {(['M', 'F'] as Sexo[]).map((sx) => {
                const ls = linhasLanc.filter((l) => l.sexo === sx);
                if (!ls.length) return null;
                return (
                  <React.Fragment key={sx}>
                    <View style={[estilos.linhaTab, estilos.grupo]}>
                      <Text style={estilos.grupoTexto}>{sx === 'M' ? 'Machos' : 'Fêmeas'}</Text>
                    </View>
                    {ls.map((l) => {
                      const dif = num(qtd[l.chave]) - num(qtdG[l.chave]);
                      return (
                        <View key={l.chave} style={[estilos.linhaTab, { alignItems: 'center' }]}>
                          <Text style={estilos.cel1}>{t.valor === 'nascimento' ? 'Bezerros' : l.faixa}</Text>
                          <View style={estilos.celEntrada}>{entrada(qtd[l.chave], (x) => setQtd((q) => ({ ...q, [l.chave]: x })))}</View>
                          {!soTotal && (
                            <>
                              <View style={estilos.celEntrada}>{entrada(qtdG[l.chave], (x) => setQtdG((q) => ({ ...q, [l.chave]: x })))}</View>
                              <Text style={[estilos.cel, dif < 0 ? { color: cores.erro, fontWeight: '700' } : dif > 0 && { color: cores.cafe, fontWeight: '700' }]}>{formatarNumero(dif)}</Text>
                            </>
                          )}
                        </View>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              <View style={[estilos.linhaTab, estilos.rodape]}>
                <Text style={[estilos.cel1, { fontWeight: '800' }]}>Total de reses</Text>
                <Text style={[estilos.cel, estilos.totalNum]}>{formatarNumero(totLanc)}</Text>
                {!soTotal && (
                  <>
                    <Text style={[estilos.cel, estilos.totalNum]}>{formatarNumero(totLancG)}</Text>
                    <Text style={[estilos.cel, estilos.totalNum]}>{formatarNumero(totLanc - totLancG)}</Text>
                  </>
                )}
              </View>
              {t.valor === 'nascimento' && (
                <View style={[estilos.linhaTab, { borderBottomWidth: 0 }]}>
                  <Text style={[estilos.cel1, femeasAptas <= 0 && { color: cores.erro, fontWeight: '700' }]}>Fêmeas de 13 meses ou mais</Text>
                  <Text style={[estilos.cel, { fontWeight: '800' }, femeasAptas <= 0 && { color: cores.erro }]}>{formatarNumero(femeasAptas)}</Text>
                </View>
              )}
            </View>
          )}

          {t.valor !== 'inicial' && t.valor !== 'comunicacao' && <Campo rotulo={t.valor === 'acerto' ? 'Nº da NF de venda do dono das vacas *' : 'Nº da NF (opcional)'} value={nf} onChangeText={setNf} />}
          <Botao titulo={salvando ? 'Gravando…' : t.valor === 'inicial' && inicialId ? 'Alterar o saldo inicial' : t.valor === 'comunicacao' ? 'Lançar a comunicação' : 'Lançar no estoque de gado'} onPress={gravar} desabilitado={salvando} />
        </>
      ) : (
        <>
          <CampoData rotulo="Posição em" valor={posicao} aoMudar={setPosicao} />
          {!saldos ? <ActivityIndicator color={cores.primaria} style={{ marginTop: 12 }} /> : quadros(saldos)}
          {controleCons && (() => {
            const ac = aComunicar(controleCons);
            const linha = (rot: string, l: number, c: number, x: number) => (
              <View key={rot} style={estilos.linhaTab}>
                <Text style={estilos.cel1}>{rot}</Text>
                <Text style={estilos.cel}>{formatarNumero(l)}</Text>
                <Text style={estilos.cel}>{formatarNumero(c)}</Text>
                <Text style={[estilos.cel, x > 0 && { color: cores.erro, fontWeight: '800' }]}>{formatarNumero(x)}</Text>
              </View>
            );
            return (
              <>
                <Secao titulo="Nascimentos e mortes · IDAF" />
                <View style={estilos.tabela}>
                  <View style={[estilos.linhaTab, estilos.cab]}>
                    <Text style={[estilos.cel1, estilos.cabTexto]}></Text>
                    <Text style={[estilos.cel, estilos.cabTexto]}>Lançados</Text>
                    <Text style={[estilos.cel, estilos.cabTexto]}>Comunicados</Text>
                    <Text style={[estilos.cel, estilos.cabTexto]}>A comunicar</Text>
                  </View>
                  <View style={[estilos.linhaTab, estilos.grupo]}><Text style={estilos.grupoTexto}>Nascimentos</Text></View>
                  {linha('Machos', controleCons.nasc.M, controleCons.nascCom.M, ac.nasc.M)}
                  {linha('Fêmeas', controleCons.nasc.F, controleCons.nascCom.F, ac.nasc.F)}
                  <View style={[estilos.linhaTab, estilos.grupo]}><Text style={estilos.grupoTexto}>Mortes</Text></View>
                  {linha('Machos', controleCons.morte.M, controleCons.morteCom.M, ac.morte.M)}
                  {linha('Fêmeas', controleCons.morte.F, controleCons.morteCom.F, ac.morte.F)}
                </View>
              </>
            );
          })()}
          <Secao titulo="Movimentações" />
          {movs === null ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 12 }} />
          ) : movs.length === 0 ? (
            <Text style={estilos.dica}>Nenhuma movimentação até esta data.</Text>
          ) : (
            <Lista>
              {movs.map((m) => {
                const total = somaQ(m.q);
                const g = somaQ(m.qg);
                return (
                  <Linha
                    key={`${m.origem}${m.id}`}
                    titulo={`${doBanco(m.data)} · ${m.titulo}`}
                    linhas={
                      m.tipo === 'comunicacao'
                        ? m.detalhe
                        : [textoQtd(m.q), m.titulo.startsWith('Mudança') || m.tipo === 'nascimento' || m.tipo === 'morte' ? null : `Com GTA ${formatarNumero(Math.abs(g))} · Diferença ${formatarNumero(Math.abs(total) - Math.abs(g))}`, ...m.detalhe]
                    }
                    direita={m.tipo === 'comunicacao' ? 'IDAF' : m.titulo.startsWith('Mudança') ? '±' : sinalTexto(total)}
                    onPress={() => excluir(m)}
                  />
                );
              })}
            </Lista>
          )}
          <Secao titulo="Últimas 5 GTAs de saída emitidas" />
          {movs === null ? null : gtasSaida.length === 0 ? (
            <Text style={estilos.dica}>Nenhuma GTA de saída emitida.</Text>
          ) : (
            <Lista>
              {gtasSaida.map((g) => (
                <Linha
                  key={g.id}
                  titulo={`GTA ${g.numero ?? ''} · ${doBanco(g.data)}`}
                  linhas={[g.destino ? `Para ${g.destino}` : null, g.finalidade]}
                  direita={`${formatarNumero(g.cabecas)} cab.`}
                  onPress={() => navegacao.push('GtaForm', { aba: 'consultar' })}
                />
              ))}
            </Lista>
          )}
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  tabela: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, overflow: 'hidden' },
  linhaTab: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: cores.borda, gap: 6 },
  cab: { backgroundColor: cores.primaria },
  cabTexto: { color: '#FFFFFF', fontWeight: '800' },
  grupo: { backgroundColor: '#EEF3EC', paddingVertical: 6 },
  grupoTexto: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  sub: { backgroundColor: '#F7F9F6' },
  rodape: { borderBottomWidth: 0, backgroundColor: '#E6EEE3' },
  cel1: { flex: 1.3, fontSize: tam.texto, color: cores.texto },
  cel: { flex: 1, fontSize: tam.texto, color: cores.texto, textAlign: 'right' },
  celEntrada: { flex: 1 },
  entrada: { borderWidth: 1, borderColor: cores.borda, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: tam.texto, color: cores.texto, textAlign: 'right', backgroundColor: '#FFFFFF' },
  totalNum: { fontWeight: '800', color: cores.primariaEscura },
  totalLanc: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura, textAlign: 'right' },
  par: { flexDirection: 'row', gap: 10 },
});
