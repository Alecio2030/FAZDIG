import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import AbasTela from '../../componentes/AbasTela';
import RetornoAtividade from './RetornoAtividade';
import EntradaVoz from '../../componentes/EntradaVoz';
import TempoPulverizacao from '../../componentes/TempoPulverizacao';
import ConsultaAtividades from './ConsultaAtividades';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, duracaoHoras, horaDoBanco, horaValida, hojeBR, mascaraHora, paraBanco, textoHoras } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { ROTULO_CATEGORIA_INSUMO, custosDe, saldoDe, textoSaldo } from '../../lib/insumos';
import { plantasPlantadas } from '../../lib/talhoes';
import { semAcento } from '../../lib/codigos';
import {
  DOSE_POR, SUBTIPOS, TIPOS_ATIVIDADE, aceitaProduto, calcularTotal, categoriasPara, exigeProduto, sugestaoDose, textoTotal, unidadeConsumo, unidadesDose, type TipoAtividade,
} from '../../lib/atividades';
import { interpretarVoz, numerar, pegar, type VozAtividade } from '../../lib/voz';
import { custoHoraBem, custoHoraPessoa } from '../../lib/maoObra';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** plantasTotal (V150): plantas EFETIVAMENTE plantadas no talhão (cadastro do talhão), nunca as calculadas pelo espaçamento */
type Local = { id: string; nome: string; tipo: 'talhao' | 'manga'; util: number | null; plantasTotal: number | null; cultura: string | null };
type Sel = { areaId: string; ha: string };
type Prod = { chave: string; insumoId: string | null; dose: string; unidade: string; por: string; baixar: boolean };
/** horas: quanto a pessoa trabalhou (vem da duração até ser mudada à mão); custoHora: do cadastro da pessoa (null se não tiver) */
type Operador = { id: string; nome: string; horas: string; custoHora: number | null; editado: boolean };

let cont = 0;
const chave = () => `p${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);
const prodVazio = (): Prod => ({ chave: chave(), insumoId: null, dose: '', unidade: '', por: 'ha', baixar: true });
const TIPOS_OPCOES = TIPOS_ATIVIDADE.map((t) => ({ valor: t.valor, rotulo: `${t.icone} ${t.rotulo}` }));

/** Atividades agrícolas: o que foi feito, onde, com quais produtos (baixa o estoque e vai para o custo do talhão), quando, com que máquina e quem fez. */
export default function AtividadeForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AtividadeForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  // V148: Lançar | Retorno (o que sobrou volta ao estoque pelo nº da atividade) | Consultar
  const [aba, setAba] = useState<'cadastrar' | 'retorno' | 'consultar'>(params?.aba ?? 'cadastrar');
  // catálogos
  const [locais, setLocais] = useState<Local[]>([]);
  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [proximo, setProximo] = useState<number | null>(null);
  // lançamento
  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [tipo, setTipo] = useState<TipoAtividade | ''>('');
  const [sub, setSub] = useState('');
  const [alvo, setAlvo] = useState('');
  const [lamina, setLamina] = useState('');
  const [sel, setSel] = useState<Sel[]>([]);
  const [verMangas, setVerMangas] = useState(false);
  const [prods, setProds] = useState<Prod[]>([]);
  // V147: dose por bomba (calda): nº de bombas aplicadas e capacidade da bomba/tanque
  const [bombas, setBombas] = useState('');
  const [bombaL, setBombaL] = useState('20');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [maquinaId, setMaquinaId] = useState<string | null>(null);
  const [implementoId, setImplementoId] = useState<string | null>(null);
  const [horasMaq, setHorasMaq] = useState('');
  const [horasEditadas, setHorasEditadas] = useState(false);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  // custo por hora (combustível + manutenção) da máquina e do implemento escolhidos
  const [chMaq, setChMaq] = useState<number | null>(null);
  const [chImp, setChImp] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  // alterar
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});
  // lançamento por voz: o que foi falado e o que ficou para conferir
  const [vozAviso, setVozAviso] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Atividade nº ${numero}` : 'Atividades' });
  }, [navegacao, id, numero]);

  const carregarBase = useCallback(async () => {
    if (!fid) return;
    try {
      const [ar, ins, ult] = await Promise.all([
        consulta<any[]>(supabase.from('areas').select('id, nome, tipo, area_ha, area_util_ha, plantas_total, plantas_ha_real, capim_cultura').eq('fazenda_id', fid).eq('ativa', true).in('tipo', ['talhao', 'manga']).order('nome')),
        consulta<any[]>(supabase.from('insumos').select('*').eq('ativo', true).order('nome')),
        consulta<any[]>(supabase.from('atividades_agricolas').select('numero').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(1)),
      ]);
      const movs = ins.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade, valor_unitario, data').eq('fazenda_id', fid).in('insumo_id', ins.map((i) => i.id))) : [];
      setLocais(
        ar.map((a) => ({
          id: a.id, nome: a.nome, tipo: a.tipo, cultura: a.capim_cultura,
          util: Number(a.area_util_ha ?? a.area_ha) || null,
          plantasTotal: a.tipo === 'talhao' ? plantasPlantadas(a) : null,
        })),
      );
      setCatalogo(
        ins.map((i) => {
          const m = movs.filter((x) => x.insumo_id === i.id);
          return { ...i, saldo: saldoDe(m), medio: custosDe(m).medio };
        }),
      );
      setProximo((ult[0]?.numero ?? 0) + 1);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  // Aberta pelo painel do talhão: já vem com o talhão marcado.
  const [preSel, setPreSel] = useState<string | null>(params?.areaId ?? null);
  // aplicação programada do plano de adubação: produtos e doses já vêm; ao lançar, a aplicação fica marcada como feita
  const [pre, setPre] = useState(params?.pre ?? null);
  const [parcelaIds, setParcelaIds] = useState<string[]>(params?.pre?.parcelaIds ?? []);
  useEffect(() => {
    if (!pre || !catalogo.length) return;
    setTipo('adubacao');
    setSub(pre.sub);
    setProds(pre.produtos.filter((x) => catalogo.some((i) => i.id === x.insumoId)).map((x) => ({ chave: chave(), insumoId: x.insumoId, dose: numeroParaCampo(x.dose), unidade: x.unidade, por: x.por, baixar: true })));
    if (pre.obs) setObs(pre.obs);
    setPre(null);
  }, [pre, catalogo]);
  // aberta pelo balanço hídrico: já vem como Irrigação, com a lâmina a repor
  useEffect(() => {
    if (!params?.irrigar) return;
    setTipo('irrigacao');
    setSub('');
    if (params.irrigar.lamina > 0) setLamina(numeroParaCampo(params.irrigar.lamina));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!preSel || !locais.length) return;
    const l = locais.find((x) => x.id === preSel);
    if (l) setSel([{ areaId: l.id, ha: l.util ? numeroParaCampo(l.util) : '' }]);
    setPreSel(null);
  }, [locais, preSel]);

  // ---------- cálculos ----------
  const talhoes = locais.filter((l) => l.tipo === 'talhao');
  const mangas = locais.filter((l) => l.tipo === 'manga');
  const escolhidos = sel
    .map((s) => {
      const l = locais.find((x) => x.id === s.areaId);
      if (!l) return null;
      const ha = n(s.ha);
      // V150: plantas efetivamente plantadas; se a atividade pegou só parte do talhão, a parte proporcional à área
      return { ...l, ha, plantas: l.plantasTotal && ha ? Math.round(l.util && ha < l.util ? (l.plantasTotal * ha) / l.util : l.plantasTotal) : null };
    })
    .filter(Boolean) as (Local & { ha: number | null; plantas: number | null })[];
  const somaHa = escolhidos.reduce((s, l) => s + (l.ha ?? 0), 0);
  const somaPlantas = escolhidos.reduce((s, l) => s + (l.plantas ?? 0), 0);
  const semPlantas = escolhidos.filter((l) => !l.plantas);
  const semHa = escolhidos.filter((l) => !l.ha);
  const temPlantas = escolhidos.length > 0 && semPlantas.length === 0;
  const duracao = duracaoHoras(inicio, fim);
  const usaProduto = !!tipo && aceitaProduto(tipo, sub);
  const usaBomba = usaProduto && prods.some((p) => p.insumoId && p.por === 'bomba');
  const caldaTotal = usaBomba && n(bombas) && n(bombaL) ? n(bombas)! * n(bombaL)! : null;

  const calc = useMemo(
    () =>
      prods.map((p) => {
        const ins = catalogo.find((i) => i.id === p.insumoId);
        const dose = n(p.dose);
        if (!ins || !dose || !p.unidade) return { ins, total: null, custo: null };
        const total = calcularTotal(ins, dose, p.unidade, p.por, { ha: somaHa, plantas: somaPlantas, bombas: n(bombas) ?? 0 });
        return { ins, total, custo: total && ins.medio != null ? total.estoque * ins.medio : null };
      }),
    [prods, catalogo, somaHa, somaPlantas, bombas],
  );
  const custoProdutos = calc.reduce((s, c) => s + (c.custo ?? 0), 0);
  const produtoSemCusto = calc.some((c) => c.ins && c.total && c.custo == null);

  // horas de máquina acompanham o horário até a pessoa mudar à mão
  useEffect(() => {
    if (!horasEditadas) setHorasMaq(duracao != null && maquinaId ? numeroParaCampo(duracao) : '');
  }, [duracao, maquinaId, horasEditadas]);

  // horas de cada pessoa acompanham o horário até serem mudadas à mão
  useEffect(() => {
    setOperadores((l) => (l.some((o) => !o.editado) ? l.map((o) => (o.editado ? o : { ...o, horas: duracao != null ? numeroParaCampo(duracao) : '' })) : l));
  }, [duracao]);

  // custo por hora da máquina e do implemento (cadastro do bem)
  useEffect(() => {
    let vivo = true;
    (async () => {
      const ids = [maquinaId, implementoId].filter(Boolean) as string[];
      if (!ids.length) {
        setChMaq(null);
        setChImp(null);
        return;
      }
      const { data: bens } = await supabase.from('imobilizados').select('id, consumo_l_hora, preco_litro, manutencao_hora').in('id', ids);
      if (!vivo) return;
      const de = (bid: string | null) => custoHoraBem(((bens as any[]) ?? []).find((b) => b.id === bid));
      setChMaq(maquinaId ? de(maquinaId) : null);
      setChImp(implementoId ? de(implementoId) : null);
    })();
    return () => {
      vivo = false;
    };
  }, [maquinaId, implementoId]);

  const custoMaoObra = operadores.reduce((t, o) => t + (o.custoHora != null ? (n(o.horas) ?? 0) * o.custoHora : 0), 0);
  const custoMaquinas = (maquinaId || implementoId) && (chMaq != null || chImp != null) ? (n(horasMaq) ?? 0) * ((chMaq ?? 0) + (chImp ?? 0)) : 0;
  const custoTotal = custoProdutos + custoMaoObra + custoMaquinas;

  // ---------- ações ----------
  function escolherTipo(t: TipoAtividade) {
    setTipo(t);
    const s = SUBTIPOS[t]?.[0]?.valor ?? '';
    setSub(s);
    if (!aceitaProduto(t, s)) setProds([]);
    else if (exigeProduto(t, s) && prods.length === 0) setProds([prodVazio()]);
    setErros({});
  }
  function escolherSub(s: string) {
    setSub(s);
    if (tipo && !aceitaProduto(tipo, s)) setProds([]);
    else if (tipo && exigeProduto(tipo, s) && prods.length === 0) setProds([prodVazio()]);
  }

  function alternarLocal(l: Local) {
    setSel((atual) => (atual.some((s) => s.areaId === l.id) ? atual.filter((s) => s.areaId !== l.id) : [...atual, { areaId: l.id, ha: l.util ? numeroParaCampo(l.util) : '' }]));
  }
  function todosTalhoes() {
    const todos = talhoes.every((t) => sel.some((s) => s.areaId === t.id));
    setSel((atual) => (todos ? atual.filter((s) => !talhoes.some((t) => t.id === s.areaId)) : [...atual.filter((s) => !talhoes.some((t) => t.id === s.areaId)), ...talhoes.map((t) => ({ areaId: t.id, ha: t.util ? numeroParaCampo(t.util) : '' }))]));
  }

  const mudarProd = (k: string, m: Partial<Prod>) => setProds((l) => l.map((p) => (p.chave === k ? { ...p, ...m } : p)));

  /** Última dose usada do produto no mesmo tipo de atividade (null se nunca foi usado). */
  async function ultimaDose(insumoId: string, tipoAtv: string): Promise<{ dose: any; dose_unidade: string; dose_por: string } | null> {
    try {
      const usos = await consulta<any[]>(
        supabase.from('atividade_insumos').select('dose, dose_unidade, dose_por, atividade:atividades_agricolas ( numero, tipo )').eq('fazenda_id', fid!).eq('insumo_id', insumoId).limit(50),
      );
      const um = (v: any) => (Array.isArray(v) ? v[0] : v);
      return usos.filter((u) => um(u.atividade)?.tipo === tipoAtv).sort((a, b) => (um(b.atividade)?.numero ?? 0) - (um(a.atividade)?.numero ?? 0))[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Ao escolher o produto: repete a última dose usada dele; se nunca foi usado, sugere pela atividade. */
  async function escolherProduto(k: string, insumoId: string | null) {
    if (!insumoId) return mudarProd(k, { insumoId: null, dose: '', unidade: '' });
    const ins = catalogo.find((i) => i.id === insumoId);
    const sug = sugestaoDose(ins, tipo, sub, temPlantas);
    mudarProd(k, { insumoId, unidade: sug.unidade, por: sug.por, dose: '' });
    const ultimo = await ultimaDose(insumoId, tipo);
    if (ultimo && unidadesDose(ins).includes(ultimo.dose_unidade) && (ultimo.dose_por !== 'planta' || temPlantas || !escolhidos.length)) {
      mudarProd(k, { dose: numeroParaCampo(ultimo.dose), unidade: ultimo.dose_unidade, por: ultimo.dose_por });
    }
  }

  const buscarProduto = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      const cats = tipo ? categoriasPara(tipo, sub) : [];
      const termo = semAcento(t.trim().toLowerCase());
      return catalogo
        .filter((i) => cats.includes(i.categoria) && (!termo || semAcento(`${i.nome} ${i.principio_ativo ?? ''} ${i.fabricante ?? ''}`.toLowerCase()).includes(termo)))
        .sort((a, b) => cats.indexOf(a.categoria) - cats.indexOf(b.categoria) || Number(b.saldo > 0) - Number(a.saldo > 0) || a.nome.localeCompare(b.nome))
        .map((i) => ({ id: i.id, titulo: i.nome, detalhe: `${ROTULO_CATEGORIA_INSUMO[i.categoria] ?? i.categoria} · estoque ${textoSaldo(i.saldo, i)}${i.medio != null ? ` · ${formatarMoeda(i.medio)}/${i.unidade}` : ''}` }));
    },
    [catalogo, tipo, sub],
  );
  const lerNomeProduto = useCallback(async (iid: string) => catalogo.find((i) => i.id === iid)?.nome ?? null, [catalogo]);

  const carregarMaquinas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('imobilizados').select('id, numero, nome, categoria, situacao').eq('fazenda_id', fid!).in('categoria', ['tratores', 'maquinas', 'veiculos']).order('numero'));
    return d.map((b) => ({ id: b.id, titulo: `${b.nome}`, detalhe: `Bem nº ${b.numero}`, oculto: b.situacao !== 'ativo' }));
  }, [fid]);
  const carregarImplementos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('imobilizados').select('id, numero, nome, categoria, situacao').eq('fazenda_id', fid!).in('categoria', ['implementos', 'equipamentos']).order('numero'));
    return d.map((b) => ({ id: b.id, titulo: `${b.nome}`, detalhe: `Bem nº ${b.numero}`, oculto: b.situacao !== 'ativo' }));
  }, [fid]);

  async function incluirOperador(pid: string | null) {
    if (!pid || operadores.some((o) => o.id === pid)) return;
    const { data: p } = await supabase.from('pessoas').select('id, nome, mo_base, mo_valor').eq('id', pid).maybeSingle();
    if (p) setOperadores((l) => (l.some((o) => o.id === p.id) ? l : [...l, { id: p.id, nome: p.nome, horas: duracao != null ? numeroParaCampo(duracao) : '', custoHora: custoHoraPessoa(p.mo_base, p.mo_valor), editado: false }]));
  }

  function limpar() {
    setId(null);
    setNumero(null);
    setData(hojeBR());
    setTipo('');
    setSub('');
    setAlvo('');
    setLamina('');
    setSel([]);
    setVerMangas(false);
    setProds([]);
    setBombas('');
    setInicio('');
    setFim('');
    setMaquinaId(null);
    setImplementoId(null);
    setHorasMaq('');
    setHorasEditadas(false);
    setOperadores([]);
    setObs('');
    setParcelaIds([]);
    setVozAviso(null);
    setErros({});
    setErro(null);
    setAlterarAberto(false);
    setAlterarNum('');
    setAlterarErro(null);
  }

  async function abrir(aid: string) {
    setErro(null);
    setAviso(null);
    setVozAviso(null);
    try {
      const a = await consulta<any>(supabase.from('atividades_agricolas').select('*').eq('id', aid).single());
      const [ar, ins, ops] = await Promise.all([
        consulta<any[]>(supabase.from('atividade_areas').select('area_id, area_ha').eq('atividade_id', aid)),
        consulta<any[]>(supabase.from('atividade_insumos').select('*').eq('atividade_id', aid).order('ordem')),
        consulta<any[]>(supabase.from('atividade_operadores').select('horas, pessoa:pessoas ( id, nome, mo_base, mo_valor )').eq('atividade_id', aid)),
      ]);
      await carregarBase();
      setId(a.id);
      setNumero(a.numero);
      setData(doBanco(a.data));
      setTipo(a.tipo);
      setSub(a.subtipo ?? '');
      setAlvo(a.alvo ?? '');
      setLamina(numeroParaCampo(a.lamina_mm));
      setSel(ar.map((x) => ({ areaId: x.area_id, ha: numeroParaCampo(x.area_ha) })));
      setVerMangas(false);
      setProds(ins.map((x) => ({ chave: chave(), insumoId: x.insumo_id, dose: numeroParaCampo(x.dose), unidade: x.dose_unidade, por: x.dose_por, baixar: x.baixou })));
      setBombas(numeroParaCampo(a.bombas));
      setBombaL(a.bomba_litros != null ? numeroParaCampo(a.bomba_litros) : '20');
      setInicio(horaDoBanco(a.hora_inicio));
      setFim(horaDoBanco(a.hora_fim));
      setMaquinaId(a.maquina_id);
      setImplementoId(a.implemento_id);
      setHorasMaq(numeroParaCampo(a.horas_maquina));
      setHorasEditadas(true);
      setOperadores(
        ops
          .map((o) => {
            const pes = Array.isArray(o.pessoa) ? o.pessoa[0] : o.pessoa;
            return pes ? { id: pes.id, nome: pes.nome, horas: numeroParaCampo(o.horas), custoHora: custoHoraPessoa(pes.mo_base, pes.mo_valor), editado: true } : null;
          })
          .filter(Boolean) as Operador[],
      );
      setObs(a.observacoes ?? '');
      setErros({});
      setAlterarAberto(false);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  // V149: veio da Consulta pelo botão "Alterar ou excluir": abre a atividade já carregada
  useEffect(() => {
    if (params?.abrirId) abrir(params.abrirId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.abrirId]);

  async function abrirPorNumero() {
    setAlterarErro(null);
    if (!alterarNum) return setAlterarErro('Informe o número.');
    const { data: a } = await supabase.from('atividades_agricolas').select('id').eq('fazenda_id', fid!).eq('numero', Number(alterarNum)).maybeSingle();
    if (!a) return setAlterarErro(`Não existe a atividade nº ${alterarNum} nesta fazenda.`);
    abrir(a.id);
  }

  // ---------- lançamento por voz ----------
  /** Recebe a fala, pede para a IA entender e preenche a tela para conferência. Não grava nada. Devolve o erro ou null. */
  async function interpretarFala(texto: string): Promise<string | null> {
    if (!fid) return 'Escolha a fazenda.';
    let maqs: any[];
    let pes: any[];
    try {
      [maqs, pes] = await Promise.all([
        consulta<any[]>(supabase.from('imobilizados').select('id, numero, nome, categoria').eq('fazenda_id', fid).eq('situacao', 'ativo').in('categoria', ['tratores', 'maquinas', 'veiculos', 'implementos', 'equipamentos']).order('numero')),
        consulta<any[]>(supabase.from('pessoas').select('id, nome, tipos, mo_base, mo_valor').eq('ativo', true).order('nome').limit(300)),
      ]);
    } catch (e) {
      return traduzirErro(e);
    }
    const maquinas = maqs.filter((b) => ['tratores', 'maquinas', 'veiculos'].includes(b.categoria));
    const implementos = maqs.filter((b) => ['implementos', 'equipamentos'].includes(b.categoria));
    const r = await interpretarVoz<VozAtividade>('atividade', texto, {
      tipos: TIPOS_ATIVIDADE.map((t) => ({ valor: t.valor, rotulo: t.rotulo, subtipos: SUBTIPOS[t.valor]?.map((o) => o.valor) })),
      locais: numerar<Local>(locais, (l) => l.nome, (l) => (l.tipo === 'talhao' ? 'talhão' : 'manga de pasto')),
      produtos: numerar<any>(catalogo, (i) => `${i.nome}${i.principio_ativo ? ` [${i.principio_ativo}]` : ''}`, (i) => unidadesDose(i).join(', ')),
      maquinas: numerar<any>(maquinas, (b) => b.nome),
      implementos: numerar<any>(implementos, (b) => b.nome),
      pessoas: numerar<any>(pes, (x) => x.nome),
    });
    if ('erro' in r) return r.erro;
    const d = r.dados;
    const t = TIPOS_ATIVIDADE.find((x) => x.valor === d.tipo)?.valor;
    if (d.entendido === false || !t) return 'Não entendi qual atividade foi feita. Comece dizendo o que foi: adubação, pulverização, capina, poda, irrigação, plantio…';

    const conferir: string[] = [];
    const naoAchado = new Set<string>((d.nao_achado ?? []).map((x) => String(x).trim()).filter(Boolean));
    const igual = (a: string, b: string) => semAcento(a.trim()) === semAcento(b.trim());

    // o que foi feito
    const opcoes = SUBTIPOS[t];
    let s = '';
    if (t === 'outro') s = (d.subtipo ?? '').trim();
    else if (opcoes) {
      const achado = opcoes.find((o) => igual(o.valor, d.subtipo ?? ''));
      s = (achado ?? opcoes[0]).valor;
      if (!achado) conferir.push(`o tipo ficou "${s}" (não foi falado)`);
    }

    // data
    let novaData = hojeBR();
    if (d.data && dataValida(doBanco(d.data))) {
      if (d.data > paraBanco(hojeBR())!) conferir.push('a data falada é futura: ficou a de hoje');
      else novaData = doBanco(d.data);
    }

    // onde
    const marcados: { l: Local; ha: number | null }[] = [];
    if (d.todos_talhoes) for (const l of (locais as Local[]).filter((x) => x.tipo === 'talhao')) marcados.push({ l, ha: l.util });
    for (const x of d.locais ?? []) {
      const l = pegar<Local>(locais, x.n);
      if (!l || marcados.some((m) => m.l.id === l.id)) continue;
      marcados.push({ l, ha: x.ha && x.ha > 0 ? x.ha : l.util });
    }
    if (!marcados.length) conferir.push('escolha onde foi feito');
    const comPlantas = marcados.length > 0 && marcados.every((m) => m.l.plantasTotal && m.ha);

    // produtos
    const novos: Prod[] = [];
    const semDose: { chave: string; ins: any }[] = [];
    if (aceitaProduto(t, s)) {
      for (const x of (d.produtos ?? []).slice(0, 6)) {
        const ins = pegar<any>(catalogo, x.n);
        if (!ins) {
          if (x.falado) naoAchado.add(`produto: ${x.falado}`);
          continue;
        }
        if (novos.some((p) => p.insumoId === ins.id)) continue;
        const sug = sugestaoDose(ins, t, s, comPlantas);
        const unidade = unidadesDose(ins).find((u) => u.toLowerCase() === String(x.unidade ?? '').toLowerCase()) ?? null;
        const dose = x.dose && x.dose > 0 ? x.dose : null;
        const por = DOSE_POR.some((o) => o.valor === x.por) ? (x.por as string) : null;
        const k = chave();
        if (dose && unidade) {
          novos.push({ chave: k, insumoId: ins.id, dose: numeroParaCampo(dose), unidade, por: por ?? sug.por, baixar: true });
          if (!por) conferir.push(`${ins.nome}: confira se a dose é por planta, por hectare ou total`);
        } else {
          novos.push({ chave: k, insumoId: ins.id, dose: '', unidade: sug.unidade, por: sug.por, baixar: true });
          semDose.push({ chave: k, ins });
          conferir.push(dose ? `${ins.nome}: a unidade da dose não foi entendida` : `${ins.nome}: a dose não foi falada (veio a da última aplicação, se houver)`);
        }
      }
      if (!novos.length && exigeProduto(t, s)) {
        novos.push(prodVazio());
        conferir.push('informe o produto aplicado');
      }
    } else if (d.produtos?.length) conferir.push('esta atividade não leva produto: o que foi falado de produto ficou de fora');

    // execução
    const hora = (h?: string | null) => (h && horaValida(h) ? h : '');
    const durFalada = duracaoHoras(hora(d.hora_inicio), hora(d.hora_fim));
    const maq = pegar<any>(maquinas, d.maquina);
    const imp = pegar<any>(implementos, d.implemento);
    const ops: Operador[] = [];
    for (const nPes of d.pessoas ?? []) {
      const x = pegar<any>(pes, nPes);
      if (x && !ops.some((o) => o.id === x.id)) ops.push({ id: x.id, nome: x.nome, horas: durFalada != null ? numeroParaCampo(durFalada) : '', custoHora: custoHoraPessoa(x.mo_base, x.mo_valor), editado: false });
    }
    const horas = d.horas_maquina && d.horas_maquina > 0 && (maq || imp) ? d.horas_maquina : null;
    if (ops.length && durFalada == null) conferir.push('informe as horas de quem fez (o horário não foi falado)');

    // preenche a tela (por cima de um lançamento em branco)
    limpar();
    setAviso(null);
    setData(novaData);
    setTipo(t);
    setSub(s);
    setAlvo(t === 'pulverizacao' || t === 'capina' ? (d.alvo ?? '').trim() : '');
    setLamina(t === 'irrigacao' && d.lamina_mm && d.lamina_mm > 0 ? numeroParaCampo(d.lamina_mm) : '');
    setSel(marcados.map((m) => ({ areaId: m.l.id, ha: m.ha ? numeroParaCampo(m.ha) : '' })));
    setVerMangas(marcados.some((m) => m.l.tipo === 'manga'));
    setProds(novos);
    setInicio(hora(d.hora_inicio));
    setFim(hora(d.hora_fim));
    setMaquinaId(maq?.id ?? null);
    setImplementoId(imp?.id ?? null);
    if (horas) {
      setHorasMaq(numeroParaCampo(horas));
      setHorasEditadas(true);
    }
    setOperadores(ops);
    setObs((d.observacoes ?? '').trim());

    const partes = [`Lançamento por voz: nada foi gravado ainda. Confira a tela e toque em "Lançar atividade".`, `Você disse: “${texto}”`];
    if (naoAchado.size) partes.push(`Não achei no cadastro: ${[...naoAchado].join('; ')}.`);
    if (conferir.length) partes.push(`Confira: ${conferir.join('; ')}.`);
    setVozAviso(partes.join('\n'));

    // produto sem dose falada: repete a da última aplicação, como na escolha à mão
    for (const x of semDose) {
      const ultimo = await ultimaDose(x.ins.id, t);
      if (ultimo && unidadesDose(x.ins).includes(ultimo.dose_unidade) && (ultimo.dose_por !== 'planta' || comPlantas)) {
        mudarProd(x.chave, { dose: numeroParaCampo(ultimo.dose), unidade: ultimo.dose_unidade, por: ultimo.dose_por });
      }
    }
    return null;
  }

  // ---------- gravar ----------
  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(data)) e.data = 'Informe a data.';
    else if (paraBanco(data)! > paraBanco(hojeBR())!) e.data = 'A data não pode ser futura.';
    if (!tipo) e.tipo = 'Escolha o que foi feito.';
    if (tipo === 'outro' && !sub.trim()) e.sub = 'Diga qual atividade foi feita.';
    if (!sel.length) e.locais = 'Escolha onde foi feito (talhão ou manga).';
    for (const s of sel) if (s.ha.trim() && (n(s.ha) == null || n(s.ha)! <= 0)) e.locais = 'Área trabalhada inválida.';
    if (tipo && exigeProduto(tipo, sub) && !prods.some((p) => p.insumoId)) e.produtos = 'Informe o produto aplicado.';
    prods.forEach((p, k) => {
      if (!p.insumoId) return;
      const nome = calc[k].ins?.nome ?? `produto ${k + 1}`;
      if (!n(p.dose) || n(p.dose)! <= 0) e[`dose${p.chave}`] = `Informe a dose de ${nome}.`;
      else if (p.por === 'ha' && semHa.length) e[`dose${p.chave}`] = `Dose por hectare: informe a área trabalhada de ${semHa.map((l) => l.nome).join(', ')}.`;
      else if (p.por === 'bomba' && (!n(bombas) || n(bombas)! <= 0)) e[`dose${p.chave}`] = 'Dose por bomba: informe quantas bombas de calda foram aplicadas.';
      else if (p.por === 'planta' && !somaPlantas) e[`dose${p.chave}`] = 'Dose por planta: falta no cadastro do talhão o total de plantas efetivamente plantadas.';
      else if (!calc[k].total) e[`dose${p.chave}`] = `A unidade da dose não combina com a de ${nome}.`;
    });
    if (inicio && !horaValida(inicio)) e.inicio = 'Hora inválida.';
    if (fim && !horaValida(fim)) e.fim = 'Hora inválida.';
    if (horasMaq.trim() && (n(horasMaq) == null || n(horasMaq)! < 0)) e.horas = 'Horas inválidas.';
    for (const o of operadores) if (o.horas.trim() && (n(o.horas) == null || n(o.horas)! < 0 || n(o.horas)! > 24)) e.operadores = `Horas de ${o.nome} inválidas.`;
    if (lamina.trim() && (n(lamina) == null || n(lamina)! < 0)) e.lamina = 'Lâmina inválida.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    const p = {
      id,
      fazenda: fid,
      data: paraBanco(data),
      tipo,
      subtipo: sub.trim(),
      alvo: ['pulverizacao', 'capina'].includes(tipo) ? alvo.trim() : '',
      lamina_mm: tipo === 'irrigacao' && lamina.trim() ? n(lamina) : null,
      hora_inicio: horaValida(inicio) ? inicio : '',
      hora_fim: horaValida(fim) ? fim : '',
      maquina: maquinaId ?? '',
      implemento: implementoId ?? '',
      horas_maquina: maquinaId || implementoId ? n(horasMaq) : null,
      obs: obs.trim(),
      areas: escolhidos.map((l) => ({ area: l.id, area_ha: l.ha, plantas: l.plantas })),
      insumos: usaProduto ? prods.filter((x) => x.insumoId).map((x) => ({ insumo: x.insumoId, dose: n(x.dose), unidade: x.unidade, por: x.por, baixar: x.baixar })) : [],
      bombas: usaBomba ? n(bombas) : null,
      bomba_litros: usaBomba ? n(bombaL) : null,
      operadores: operadores.map((o) => ({ pessoa: o.id, horas: n(o.horas) })),
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_atividade', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { id: string; numero: number; custo: number; baixas: number; custo_mao_obra?: number; custo_maquina?: number };
    const partes = [`Atividade nº ${res.numero} ${id ? 'alterada' : 'lançada'}`];
    if (parcelaIds.length && !id) {
      const { error: em } = await supabase.rpc('marcar_parcelas_adubacao', { p_ids: parcelaIds, p_atividade: res.id });
      partes.push(em ? 'não foi possível marcar a aplicação do plano como feita' : 'aplicação do plano de adubação marcada como feita');
    }
    if (res.baixas) partes.push(`${res.baixas === 1 ? '1 produto baixado' : `${res.baixas} produtos baixados`} do estoque (se sobrar, volta pela aba Retorno com o nº ${res.numero})`);
    const custoGravado = Number(res.custo ?? 0) + Number(res.custo_mao_obra ?? 0) + Number(res.custo_maquina ?? 0);
    if (custoGravado) {
      const det = [res.custo ? `produtos ${formatarMoeda(res.custo)}` : null, res.custo_mao_obra ? `mão de obra ${formatarMoeda(res.custo_mao_obra)}` : null, res.custo_maquina ? `máquinas ${formatarMoeda(res.custo_maquina)}` : null].filter(Boolean);
      partes.push(`custo de ${formatarMoeda(custoGravado)} no talhão${det.length > 1 ? ` (${det.join(', ')})` : ''}`);
    }
    if (id && voltarDaConsulta(navegacao, params?.abrirId, false)) return;
    limpar();
    setAviso(`${partes.join(', ')}.`);
    carregarBase();
  }

  function excluir() {
    Alert.alert('Excluir atividade', `Excluir a atividade nº ${numero}? Os produtos voltam para o estoque e o custo sai do talhão.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_atividade', { p_id: id });
          if (error) return setErro(traduzirErro(error));
          if (voltarDaConsulta(navegacao, params?.abrirId, true)) return;
          const num = numero;
          limpar();
          setAviso(`Atividade nº ${num} excluída.`);
          carregarBase();
        },
      },
    ]);
  }

  // ---------- tela ----------
  const abas = (
    <AbasTela
      opcoes={[
        { valor: 'cadastrar', rotulo: 'Lançar' },
        { valor: 'retorno', rotulo: 'Retorno' },
        { valor: 'consultar', rotulo: 'Consultar' },
      ]}
      valor={[aba]}
      aoMudar={(v) => setAba(v[0] as 'cadastrar' | 'retorno' | 'consultar')}
    />
  );
  if (aba === 'retorno') {
    return (
      <Tela>
        {abas}
        {fid ? <RetornoAtividade fid={fid} numeroInicial={params?.numeroRetorno} /> : null}
      </Tela>
    );
  }
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaAtividades />
      </Tela>
    );
  }

  const chipsLocais = (lista: Local[]) => (
    <View style={estilos.chips}>
      {lista.map((l) => {
        const marcado = sel.some((s) => s.areaId === l.id);
        return (
          <Pressable key={l.id} onPress={() => alternarLocal(l)} accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} style={({ pressed }) => [estilos.chip, marcado && estilos.chipMarcado, pressed && { opacity: 0.8 }]}>
            <Text style={[estilos.chipTexto, marcado && { color: '#FFFFFF' }]}>{l.nome}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Tela
      rodape={<RodapeAcoes titulo={id ? 'Salvar alterações' : 'Lançar atividade'} aoConfirmar={salvar} carregando={salvando} aoDescartar={tipo || sel.length ? limpar : undefined} erro={erro} />}
    >
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {!id && parcelaIds.length === 0 && (
        <EntradaVoz exemplo="Adubação ontem no talhão 1, 200 gramas por planta de 20-00-20, com o trator, das 7 às 11, quem fez foi o João" aoInterpretar={interpretarFala} />
      )}
      {vozAviso && <Aviso tipo="info" texto={vozAviso} />}
      {parcelaIds.length > 0 && !id && <Aviso tipo="info" texto="Aplicação do plano de adubação: o talhão, os produtos e a dose já vieram. Confira, ajuste o que foi aplicado diferente e lance." />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Atividade nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair desta atividade e lançar uma nova
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar a atividade nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar uma atividade já lançada
        </Text>
      )}

      {/* ---------- o que ---------- */}
      <Secao titulo="O que foi feito" />
      <Escolha opcoes={TIPOS_OPCOES} valor={tipo ? [tipo] : []} aoMudar={(v) => escolherTipo(v[0] as TipoAtividade)} erro={erros.tipo} />
      {tipo && SUBTIPOS[tipo] && <Escolha rotulo="Tipo" opcoes={SUBTIPOS[tipo]!} valor={[sub]} aoMudar={(v) => escolherSub(v[0])} />}
      {tipo === 'outro' && <Campo rotulo="Qual atividade *" value={sub} onChangeText={setSub} autoCapitalize="sentences" placeholder="Ex.: Arruação, esparramação de palha" erro={erros.sub} />}
      {(tipo === 'pulverizacao' || (tipo === 'capina' && sub === 'Química')) && (
        <Campo rotulo="Alvo" value={alvo} onChangeText={setAlvo} autoCapitalize="sentences" placeholder={tipo === 'capina' ? 'Ex.: Braquiária, capim-colchão' : 'Ex.: Ferrugem, broca, bicho-mineiro'} />
      )}
      {(tipo === 'pulverizacao' || (tipo === 'capina' && sub === 'Química')) && !id && <TempoPulverizacao data={data} inicio={inicio} />}
      {tipo === 'irrigacao' && <Campo rotulo="Lâmina aplicada (mm)" value={lamina} onChangeText={setLamina} keyboardType="decimal-pad" erro={erros.lamina} ajuda="É a lâmina que entra no balanço hídrico do talhão (Agrícola › Clima e chuva › Irrigação)." />}

      {/* ---------- onde ---------- */}
      {tipo !== '' && (
        <>
          <Secao titulo="Onde" />
          {talhoes.length === 0 && mangas.length === 0 && <Text style={estilos.nota}>Nenhum talhão ou manga cadastrado nesta fazenda.</Text>}
          {talhoes.length > 0 && (
            <>
              <View style={estilos.linhaTopo}>
                <Text style={estilos.rotulo}>Talhões</Text>
                {talhoes.length > 1 && (
                  <Text style={estilos.link} onPress={todosTalhoes}>
                    {talhoes.every((t) => sel.some((s) => s.areaId === t.id)) ? 'Desmarcar todos' : 'Marcar todos'}
                  </Text>
                )}
              </View>
              {chipsLocais(talhoes)}
            </>
          )}
          {mangas.length > 0 &&
            (verMangas || sel.some((s) => mangas.some((m) => m.id === s.areaId)) ? (
              <>
                <Text style={estilos.rotulo}>Mangas (pasto)</Text>
                {chipsLocais(mangas)}
              </>
            ) : (
              <Text style={estilos.link} onPress={() => setVerMangas(true)}>
                + Foi numa manga (pasto)
              </Text>
            ))}
          {erros.locais ? <Text style={estilos.erro}>{erros.locais}</Text> : null}

          {escolhidos.length > 0 && (
            <View style={estilos.caixa}>
              {escolhidos.map((l) => (
                <View key={l.id} style={estilos.localLinha}>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.localNome}>{l.nome}</Text>
                    <Text style={estilos.nota}>{l.plantas ? `${formatarNumero(l.plantas)} plantas` : l.tipo === 'talhao' ? 'Sem o total de plantas plantadas no cadastro' : 'Manga'}</Text>
                  </View>
                  <View style={{ width: 118 }}>
                    <Campo
                      rotulo=""
                      value={sel.find((s) => s.areaId === l.id)?.ha ?? ''}
                      onChangeText={(t) => setSel((a) => a.map((s) => (s.areaId === l.id ? { ...s, ha: t } : s)))}
                      keyboardType="decimal-pad"
                      placeholder="ha"
                    />
                  </View>
                  <Text style={estilos.unid}>ha</Text>
                </View>
              ))}
              <Text style={estilos.total}>
                {escolhidos.length === 1 ? '1 local' : `${escolhidos.length} locais`}
                {somaHa ? ` · ${formatarNumero(somaHa, 2)} ha` : ''}
                {somaPlantas ? ` · ${formatarNumero(somaPlantas)} plantas` : ''}
              </Text>
              <Text style={estilos.nota}>A área vem do cadastro (área útil). Se trabalhou só uma parte, corrija: a dose e o custo acompanham.</Text>
            </View>
          )}
        </>
      )}

      {/* ---------- produtos ---------- */}
      {usaProduto && (
        <>
          <Secao titulo={exigeProduto(tipo as string, sub) ? 'Produtos aplicados' : 'Produtos aplicados (se houver)'} />
          <Text style={estilos.nota}>Os produtos vêm do estoque da fazenda (entram pelas Compras). A dose da última aplicação do mesmo produto já vem preenchida.</Text>
          {erros.produtos ? <Text style={estilos.erro}>{erros.produtos}</Text> : null}
          {prods.map((p, k) => {
            const c = calc[k];
            const ins = c.ins;
            const falta = c.total && ins ? c.total.estoque - ins.saldo : 0;
            return (
              <View key={p.chave} style={estilos.item}>
                <View style={estilos.itemTopo}>
                  <Text style={estilos.itemNum}>Produto {k + 1}</Text>
                  <Pressable onPress={() => setProds((l) => l.filter((x) => x.chave !== p.chave))} hitSlop={10} accessibilityLabel={`Tirar produto ${k + 1}`}>
                    <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
                  </Pressable>
                </View>
                <CampoBuscaRapida
                  rotulo="Produto *"
                  valorId={p.insumoId}
                  aoMudar={(v) => escolherProduto(p.chave, v)}
                  buscar={buscarProduto}
                  lerNome={lerNomeProduto}
                  icone="cube"
                  placeholder="Nome, princípio ativo ou fabricante"
                />
                {ins && (
                  <>
                    <View style={estilos.linha}>
                      <View style={{ width: 130 }}>
                        <Campo rotulo="Dose *" value={p.dose} onChangeText={(t) => mudarProd(p.chave, { dose: t })} keyboardType="decimal-pad" erro={erros[`dose${p.chave}`] ? ' ' : undefined} />
                      </View>
                      <View style={{ flex: 1, paddingTop: 26 }}>
                        <Escolha opcoes={unidadesDose(ins).map((u) => ({ valor: u, rotulo: u }))} valor={[p.unidade]} aoMudar={(v) => mudarProd(p.chave, { unidade: v[0] })} />
                      </View>
                    </View>
                    <Escolha opcoes={DOSE_POR.filter((d) => d.valor !== 'planta' || somaPlantas > 0 || p.por === 'planta')} valor={[p.por]} aoMudar={(v) => mudarProd(p.chave, { por: v[0] })} />
                    {erros[`dose${p.chave}`] ? <Text style={estilos.erro}>{erros[`dose${p.chave}`]}</Text> : null}
                    {c.total ? (
                      <View style={estilos.calc}>
                        <Par a="Total aplicado" b={textoTotal(ins, c.total)} forte />
                        {p.por !== 'total' && somaHa > 0 && <Par a="Por hectare" b={`${formatarQtd(c.total.consumo / somaHa, 2)} ${unidadeConsumo(ins)}/ha`} />}
                        {p.por === 'bomba' && n(bombaL) ? <Par a="Concentração na calda" b={`${formatarQtd((n(p.dose)! / n(bombaL)!) * 100, 2)} ${p.unidade} por 100 L`} /> : null}
                        <Par a="Custo" b={c.custo != null ? formatarMoeda(c.custo) : 'sem custo de compra'} />
                        <Par a="Estoque agora" b={textoSaldo(ins.saldo, ins)} />
                        {p.baixar && falta > 0.00001 && (
                          <Text style={[estilos.nota, { color: cores.cafe, fontWeight: '700' }]}>
                            Faltam {formatarQtd(falta, 2)} {ins.unidade} no estoque: lança mesmo assim e o saldo fica negativo até a compra ser lançada.
                          </Text>
                        )}
                      </View>
                    ) : null}
                    <Interruptor
                      rotulo="Baixar do estoque"
                      descricao={p.baixar ? 'Tira do estoque da fazenda ao custo médio.' : 'Desligado: não mexe no estoque nem lança custo (ex.: produto de terceiros).'}
                      valor={p.baixar}
                      aoMudar={(v) => mudarProd(p.chave, { baixar: v })}
                    />
                  </>
                )}
              </View>
            );
          })}
          {usaBomba && (
            <View style={estilos.calc}>
              <Text style={estilos.subtitulo}>Calda (dose por bomba)</Text>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Campo rotulo="Bombas aplicadas *" value={bombas} onChangeText={setBombas} keyboardType="decimal-pad" placeholder="Ex.: 30" />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo rotulo="Litros por bomba" value={bombaL} onChangeText={setBombaL} keyboardType="decimal-pad" placeholder="Ex.: 20" />
                </View>
              </View>
              {caldaTotal ? <Par a="Calda aplicada" b={`${formatarQtd(caldaTotal, 0)} L${somaHa > 0 ? ` (${formatarQtd(caldaTotal / somaHa, 0)} L/ha)` : ''}`} forte /> : null}
              <Text style={estilos.nota}>Bomba costal de 20 L, tanque do pulverizador de 400 L ou 2.000 L: informe a capacidade e quantas foram aplicadas. O total de cada produto = dose por bomba × bombas.</Text>
            </View>
          )}
          {prods.length < 6 && (
            <Text style={estilos.link} onPress={() => setProds((l) => [...l, prodVazio()])}>
              + {prods.length ? 'Outro produto na mesma aplicação' : 'Incluir produto'}
            </Text>
          )}
        </>
      )}

      {/* ---------- execução ---------- */}
      {tipo !== '' && (
        <>
          <Secao titulo="Execução" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Início" value={inicio} onChangeText={(t) => setInicio(mascaraHora(t))} keyboardType="number-pad" maxLength={5} placeholder="hh:mm" erro={erros.inicio} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Fim" value={fim} onChangeText={(t) => setFim(mascaraHora(t))} keyboardType="number-pad" maxLength={5} placeholder="hh:mm" erro={erros.fim} />
            </View>
          </View>
          {duracao != null && (
            <Text style={estilos.destaque}>
              {textoHoras(duracao)}
              {somaHa ? ` · rendimento ${formatarNumero(somaHa / duracao, 2)} ha/h` : ''}
            </Text>
          )}
          <SeletorLista rotulo="Máquina (trator, veículo)" valorId={maquinaId} aoMudar={setMaquinaId} carregar={carregarMaquinas} permitirLimpar vazio="Nenhuma máquina no Imobilizado. Cadastre em Mais › Imobilizado." />
          <SeletorLista rotulo="Implemento" valorId={implementoId} aoMudar={setImplementoId} carregar={carregarImplementos} permitirLimpar vazio="Nenhum implemento no Imobilizado. Cadastre em Mais › Imobilizado." />
          {(maquinaId || implementoId) && (
            <Campo
              rotulo="Horas de máquina"
              value={horasMaq}
              onChangeText={(t) => {
                setHorasEditadas(true);
                setHorasMaq(t);
              }}
              keyboardType="decimal-pad"
              ajuda={duracao != null && !horasEditadas ? 'Pelo horário. Pode corrigir pelo horímetro.' : undefined}
              erro={erros.horas}
            />
          )}
          {(maquinaId || implementoId) &&
            (chMaq != null || chImp != null ? (
              <Text style={estilos.nota}>
                Custo por hora: {[chMaq != null ? `máquina ${formatarMoeda(chMaq)}` : null, chImp != null ? `implemento ${formatarMoeda(chImp)}` : null].filter(Boolean).join(' + ')}
                {custoMaquinas ? ` · custo ${formatarMoeda(custoMaquinas)}` : ' · informe as horas de máquina'}
              </Text>
            ) : (
              <Text style={estilos.nota}>Sem custo por hora no cadastro do bem: informe o combustível e a manutenção em Mais › Imobilizado para a máquina entrar no custo.</Text>
            ))}

          <Text style={estilos.rotulo}>Quem fez</Text>
          {operadores.map((o) => {
            const h = n(o.horas);
            return (
              <View key={o.id} style={estilos.opLinha}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.localNome}>{o.nome}</Text>
                  <Text style={estilos.nota}>
                    {o.custoHora != null ? `${formatarMoeda(o.custoHora)}/h${h ? ` · ${formatarMoeda(h * o.custoHora)}` : ' · informe as horas'}` : 'Sem valor de mão de obra no cadastro: não entra no custo'}
                  </Text>
                </View>
                <View style={{ width: 92 }}>
                  <Campo
                    rotulo=""
                    value={o.horas}
                    onChangeText={(t) => setOperadores((l) => l.map((x) => (x.id === o.id ? { ...x, horas: t, editado: true } : x)))}
                    keyboardType="decimal-pad"
                    placeholder="horas"
                    accessibilityLabel={`Horas de ${o.nome}`}
                  />
                </View>
                <Text style={estilos.unid}>h</Text>
                <Pressable onPress={() => setOperadores((l) => l.filter((x) => x.id !== o.id))} hitSlop={10} accessibilityLabel={`Tirar ${o.nome}`}>
                  <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
                </Pressable>
              </View>
            );
          })}
          {erros.operadores ? <Text style={estilos.erro}>{erros.operadores}</Text> : null}
          {operadores.length > 0 && <Text style={estilos.nota}>As horas vêm do horário (início e fim). Se alguém trabalhou menos ou mais, corrija. 8 h = 1 diária.</Text>}
          <CampoPessoaBusca rotulo={operadores.length ? 'Mais alguém' : 'Operador / trabalhador'} valorId={null} aoMudar={incluirOperador} tipoNovo="funcionario" />

          <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 70, paddingTop: 12 }} />

          {(custoTotal > 0 || produtoSemCusto) && (
            <View style={estilos.resumo}>
              {custoProdutos > 0 && <Par a="Produtos" b={formatarMoeda(custoProdutos)} />}
              {custoMaoObra > 0 && <Par a="Mão de obra" b={formatarMoeda(custoMaoObra)} />}
              {custoMaquinas > 0 && <Par a="Máquinas (combustível e manutenção)" b={formatarMoeda(custoMaquinas)} />}
              <Par a="Custo da atividade" b={formatarMoeda(custoTotal)} forte />
              {somaHa > 0 && <Par a="Por hectare" b={formatarMoeda(custoTotal / somaHa)} />}
              {escolhidos.length > 1 && <Text style={estilos.nota}>Dividido entre os locais pela área trabalhada.</Text>}
              {produtoSemCusto && <Text style={estilos.nota}>Produto sem valor de compra: o custo entra no talhão assim que a compra tiver valor.</Text>}
            </View>
          )}
        </>
      )}

      {id && <Botao titulo="Excluir atividade" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '700', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  rotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  destaque: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: cores.cafe, backgroundColor: cores.cartao, justifyContent: 'center' },
  chipMarcado: { backgroundColor: cores.cafe },
  chipTexto: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.cafe },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  localLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  localNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  unid: { fontSize: tam.pequeno + 1, color: cores.textoSuave, width: 22 },
  total: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.primariaEscura },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.primaria, padding: 12, gap: 10 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemNum: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.primariaEscura },
  calc: { backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 5 },
  subtitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  resumo: { backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  operador: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: cores.sucessoFundo },
  operadorTexto: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.primariaEscura },
  opLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto, textAlign: 'right', flexShrink: 1 },
});
