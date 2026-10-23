import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Interruptor from '../../componentes/Interruptor';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoSugestao from '../../componentes/CampoSugestao';
import CampoBanco from '../../componentes/CampoBanco';
import Busca from '../../componentes/Busca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { centroDaUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { diasEntre, somarDias } from '../../lib/reproducao';
import { acharBanco, carregarBancos, resolverBanco, rotuloBanco, semAcento, type BancoCadastrado, type BancoDigitado } from '../../lib/bancos';
import {
  FINALIDADES,
  PERIODICIDADES,
  ROTULO_FINALIDADE,
  ROTULO_SISTEMA,
  SISTEMAS,
  gerarParcelas,
  r2,
  taxaDiaria,
  taxaMensal,
  temCarencia,
  umPeriodoAntes,
  type JurosTipo,
  type Periodicidade,
  type Sistema,
} from '../../lib/financiamentos';
import { INDICES, OPCOES_ORDEM, ROTULO_INDICE } from '../../lib/indices';
import AtualizacaoContrato from './AtualizacaoContrato';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const n = (t: string) => lerNumero(t);
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const soLetrasNumeros = (t: string) => t.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
const BANCO_VAZIO: BancoDigitado = { numero: '', nome: '', agencia: '', local: '' };
const r4 = (x: number) => Math.round(x * 10000) / 10000;
/** Valores diferentes já usados, os mais usados primeiro (para sugerir ao digitar). */
function maisUsados(valores: (string | null | undefined)[]): string[] {
  const conta = new Map<string, { texto: string; vezes: number }>();
  for (const v of valores) {
    const t = (v ?? '').trim();
    if (!t) continue;
    const k = semAcento(t);
    const a = conta.get(k);
    if (a) a.vezes += 1;
    else conta.set(k, { texto: t, vezes: 1 });
  }
  return [...conta.values()].sort((a, b) => b.vezes - a.vezes).map((x) => x.texto);
}

/** Financeiro › Financiamentos: Cadastrar (contrato e tabela de parcelas) | Consultar (saldo devedor, parcelas e ajustes). */
export default function FinanciamentoForm() {
  const { params } = useRoute<RouteProp<PilhaParams, 'FinanciamentoForm'>>();
  // V149: aberto pelo título do contas a pagar ("Ver o financiamento"): vai direto à ficha do contrato
  const [aba, setAba] = useState<Aba>(params?.abrirId ? 'consultar' : params?.aba ?? 'cadastrar');
  const [editarId, setEditarId] = useState<string | null>(null);
  return (
    <Tela>
      <AbasCadastro aba={aba} aoMudar={setAba} />
      {aba === 'consultar' ? (
        <Consulta
          abrirId={params?.abrirId}
          aoAlterar={(id) => {
            setEditarId(id);
            setAba('cadastrar');
          }}
        />
      ) : (
        <Cadastro editarId={editarId} aoSair={() => setEditarId(null)} />
      )}
    </Tela>
  );
}

// =====================================================================================================
// CADASTRAR
// =====================================================================================================
function Cadastro({ editarId, aoSair }: { editarId: string | null; aoSair: () => void }) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  // O financiamento é do Grupo; a fazenda aqui é só a da DESPESA (juros, IOF). '' = a informar depois.
  const [fazDespesa, setFazDespesa] = useState<string>(fid ?? '');

  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [contrato, setContrato] = useState('');
  const [titular, setTitular] = useState('');
  // banco e agência do contrato: digitados ou escolhidos; o que for novo é cadastrado ao gravar
  const [banco, setBanco] = useState<BancoDigitado>(BANCO_VAZIO);
  const [bancos, setBancos] = useState<BancoCadastrado[]>([]);
  const [finalidade, setFinalidade] = useState<string[]>(['custeio']);
  const [objeto, setObjeto] = useState('');
  // liberação
  const [liberacao, setLiberacao] = useState('');
  const [valor, setValor] = useState('');
  const [iofPerc, setIofPerc] = useState('');
  const [iofValor, setIofValor] = useState('');
  const [despesas, setDespesas] = useState('');
  const [encargos, setEncargos] = useState<string[]>(['descontados']);
  const [lancar, setLancar] = useState(true);
  // início do sistema (Dados do produtor): contrato liberado antes dele é saldo de abertura e não entra no banco
  const [inicioSistema, setInicioSistema] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc('inicio_sistema').then(({ data }) => setInicioSistema((data as string | null) ?? null), () => undefined);
  }, []);
  const [bancoId, setBancoId] = useState<string | null>(null);
  // conta em que o dinheiro entrou: digita agência e conta (acha a cadastrada ou cadastra ao gravar)
  const [contas, setContas] = useState<any[]>([]);
  const [contaAg, setContaAg] = useState('');
  const [contaNum, setContaNum] = useState('');
  const [contaBanco, setContaBanco] = useState('');
  // contrato com nº repetido: avisa ao digitar e pede confirmação ao gravar
  const [repetidos, setRepetidos] = useState<any[]>([]);
  const [confirmarRepetido, setConfirmarRepetido] = useState<string | null>(null);
  // sugestões de titular e objeto (o que já foi usado nos outros contratos)
  const [versaoSug, setVersaoSug] = useState(0);
  // juros
  const [taxa, setTaxa] = useState('');
  const [jurosTipo, setJurosTipo] = useState<string[]>(['composto']);
  const [baseDias, setBaseDias] = useState<string[]>(['360']);
  const [indexador, setIndexador] = useState('');
  // indexador da correção monetária: código (busca automática no Banco Central), percentual dele e forma de cálculo
  const [indiceCod, setIndiceCod] = useState<string[]>(['nenhum']);
  const [indicePerc, setIndicePerc] = useState('100');
  const [cmOrdem, setCmOrdem] = useState<string[]>(['corrigido']);
  // parcelas
  const [sistema, setSistema] = useState<string[]>(['price']);
  const [qtd, setQtd] = useState('');
  const [period, setPeriod] = useState<string[]>(['mensal']);
  const [periodDias, setPeriodDias] = useState('30');
  const [primeiro, setPrimeiro] = useState('');
  const [jurosCarencia, setJurosCarencia] = useState<string[]>(['pagos']);
  // parcelas iguais: valor da parcela que está no contrato (opcional)
  const [parcelaFixa, setParcelaFixa] = useState('');
  // SAC: juros da carência divididos nas parcelas (valor da cota, copiado do contrato)
  const [carenciaCota, setCarenciaCota] = useState('');
  // já pago antes de entrar no sistema
  const [antigo, setAntigo] = useState(false);
  const [pagoPrincipal, setPagoPrincipal] = useState('');
  const [pagoJuros, setPagoJuros] = useState('');
  const [pagoVm, setPagoVm] = useState('');
  const [centroId, setCentroId] = useState<string | null>(null);
  const [obs, setObs] = useState('');

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [verTodas, setVerTodas] = useState(false);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Financiamento nº ${numero}` : 'Financiamentos' });
  }, [navegacao, id, numero]);

  const recarregarTopo = useCallback(async () => {
    if (!fid) return;
    const { data: u } = await supabase.from('financiamentos').select('numero').order('numero', { ascending: false }).limit(1);
    setProximo(((u?.[0]?.numero as number) ?? 0) + 1);
  }, [fid]);
  useEffect(() => {
    recarregarTopo();
  }, [recarregarTopo]);

  // IOF nos dois sentidos: digitou o percentual, sai o valor; digitou o valor, sai o percentual (sobre o valor liberado).
  function mudarIofPerc(t: string) {
    setIofPerc(t);
    const v = n(valor);
    const p = n(t);
    if (!t.trim()) setIofValor('');
    else if (v != null && v > 0 && p != null) setIofValor(moedaParaCampo(r2((v * p) / 100)));
  }
  function mudarIofValor(t: string) {
    setIofValor(t);
    const v = n(valor);
    const iv = n(t);
    if (!t.trim()) setIofPerc('');
    else if (v != null && v > 0 && iv != null) setIofPerc(numeroParaCampo(r4((iv / v) * 100)));
  }
  function mudarValor(t: string) {
    setValor(t);
    const v = n(t);
    const p = n(iofPerc);
    const iv = n(iofValor);
    if (v == null || !(v > 0)) return;
    // mudou o valor liberado: o percentual informado manda; se só havia o valor do IOF, sai o percentual
    if (iofPerc.trim() && p != null) setIofValor(moedaParaCampo(r2((v * p) / 100)));
    else if (iofValor.trim() && iv != null) setIofPerc(numeroParaCampo(r4((iv / v) * 100)));
  }

  // ---- cálculo ----
  const vLiberado = n(valor) ?? 0;
  const jaPrincipal = antigo ? n(pagoPrincipal) ?? 0 : 0;
  const emAndamento = antigo; // ligada a chave, os juros da próxima parcela contam de um período antes dela
  const saldo = r2(vLiberado - jaPrincipal);
  const taxaAnual = n(taxa) ?? 0;
  const tipoJ = jurosTipo[0] as JurosTipo;
  const base = Number(baseDias[0]);
  const sis = sistema[0] as Sistema;
  const per = period[0] as Periodicidade;
  const primeiroIso = dataValida(primeiro) ? paraBanco(primeiro) : null;
  const liberacaoIso = dataValida(liberacao) ? paraBanco(liberacao) : null;
  const contratoAntigo = !!inicioSistema && !!liberacaoIso && liberacaoIso < inicioSistema;
  // contrato antigo nunca lança a liberação no banco, mesmo que o interruptor estivesse ligado
  const lancarEf = lancar && !contratoAntigo;
  const mesesPer = PERIODICIDADES.find((p) => p.valor === per)?.meses ?? 0;
  const diasPer = per === 'dias' ? Math.max(1, Number(periodDias) || 30) : mesesPer * 30;
  // contrato já em andamento: os juros da próxima parcela contam de um período antes dela
  const inicioIso = useMemo(() => {
    if (!primeiroIso || !liberacaoIso) return null;
    if (!emAndamento) return liberacaoIso;
    return umPeriodoAntes(primeiroIso, per, diasPer); // pelo calendário (um ano antes, um mês antes...), como o banco conta
  }, [primeiroIso, liberacaoIso, emAndamento, per, diasPer]);
  const fixaInformada = sis === 'price' ? n(parcelaFixa) ?? 0 : 0;
  const modoCarencia = sis === 'sac' ? jurosCarencia[0] : sis === 'price' ? 'capitalizados' : 'pagos';
  const cotaInformada = modoCarencia === 'fixos' ? n(carenciaCota) ?? 0 : 0;
  const dadosCalc = useMemo(
    () => ({ saldo, sistema: sis, parcelas: Number(qtd) || 0, periodicidade: per, periodicidadeDias: diasPer, primeiro: primeiroIso ?? '', inicio: inicioIso ?? '', taxaAnual, jurosTipo: tipoJ, baseDias: base, jurosCarencia: jurosCarencia[0] as 'capitalizados' | 'pagos' | 'primeira' | 'fixos', carenciaCota: cotaInformada, parcelaFixa: fixaInformada, hoje: paraBanco(hojeBR()) ?? undefined }),
    [saldo, sis, qtd, per, diasPer, primeiroIso, inicioIso, taxaAnual, tipoJ, base, jurosCarencia, fixaInformada, cotaInformada],
  );
  // a parcela que o sistema calcularia sozinho, para comparar com a do contrato
  const parcelaDoSistema = useMemo(() => (sis === 'price' ? gerarParcelas({ ...dadosCalc, parcelaFixa: undefined }).find((x) => !x.soJuros)?.valor ?? null : null), [dadosCalc, sis]);
  const carencia = !!primeiroIso && !!inicioIso && temCarencia(dadosCalc);
  // parcelas iguais: sem o valor da parcela do contrato não há tabela
  const tabela = useMemo(() => (sis === 'price' && !(fixaInformada > 0) ? [] : gerarParcelas(dadosCalc)), [dadosCalc, sis, fixaInformada]);
  const soJurosCarencia = tabela.filter((p) => p.soJuros);
  const totJuros = r2(tabela.reduce((t, p) => t + p.juros, 0));
  const totGeral = r2(tabela.reduce((t, p) => t + p.valor, 0));
  const encargosTotal = r2((n(iofValor) ?? 0) + (n(despesas) ?? 0));
  const prazo = tabela.length && liberacaoIso ? diasEntre(liberacaoIso, tabela[tabela.length - 1].vencimento) : null;

  // ---- listas ----
  const carregarContas = useCallback(async () => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, agencia, conta, tipo, fazenda_id').eq('ativa', true).order('nome'));
    const lista = d.filter((c) => c.tipo !== 'caixa');
    setContas(lista);
    return lista;
  }, []);
  // recarrega ao voltar para a tela (ex.: depois de cadastrar a conta em Bancos e caixa): a conta digitada já é achada
  const contaDigitada = useRef({ ag: '', num: '' });
  contaDigitada.current = { ag: contaAg, num: contaNum };
  useFocusEffect(
    useCallback(() => {
      carregarContas()
        .then((lista) => {
          const { ag, num } = contaDigitada.current;
          const numero = soLetrasNumeros(num);
          if (!numero) return;
          const agencia = soLetrasNumeros(ag);
          const achada = lista.find((c) => soLetrasNumeros(c.conta ?? '') === numero && (!agencia || !soLetrasNumeros(c.agencia ?? '') || soLetrasNumeros(c.agencia ?? '') === agencia));
          if (achada) {
            setBancoId(achada.id);
            setContaBanco(achada.banco ?? '');
            setErros((e) => ({ ...e, banco: '' }));
          }
        })
        .catch(() => undefined);
      carregarBancos().then(setBancos).catch(() => undefined);
    }, [carregarContas]),
  );
  const contaEscolhida = contas.find((c) => c.id === bancoId) ?? null;
  /** Conta cadastrada com esse número (e essa agência, se informada). */
  function acharConta(ag: string, num: string) {
    const numero = soLetrasNumeros(num);
    if (!numero) return null;
    const agencia = soLetrasNumeros(ag);
    return contas.find((c) => soLetrasNumeros(c.conta ?? '') === numero && (!agencia || !soLetrasNumeros(c.agencia ?? '') || soLetrasNumeros(c.agencia ?? '') === agencia)) ?? null;
  }
  function digitarConta(ag: string, num: string) {
    setContaAg(ag);
    setContaNum(num);
    setBancoId(acharConta(ag, num)?.id ?? null);
  }
  function tocarConta(c: any) {
    setBancoId(c.id);
    setContaAg(c.agencia ?? '');
    setContaNum(c.conta ?? '');
    setContaBanco(c.banco ?? '');
  }
  /** Conta digitada que não existe: leva ao cadastro de Bancos e caixa, já com o que foi digitado. Ao voltar, ela é achada. */
  function cadastrarConta() {
    navegacao.navigate('ContaBancariaForm', { nova: { banco: contaBanco.trim() || banco.nome.trim(), agencia: contaAg.trim(), conta: contaNum.trim() } });
  }
  // contas da relação: enquanto digita banco, agência ou conta, ficam só as parecidas
  const contasFiltradas = contas.filter((c) => {
    const kb = semAcento(contaBanco);
    const ka = soLetrasNumeros(contaAg);
    const kc = soLetrasNumeros(contaNum);
    return (!kb || semAcento(`${c.banco ?? ''} ${c.nome ?? ''}`).includes(kb)) && (!ka || soLetrasNumeros(c.agencia ?? '').includes(ka)) && (!kc || soLetrasNumeros(c.conta ?? '').includes(kc));
  });
  const bancoCadastrado = acharBanco(bancos, banco);

  // nº do contrato repetido: procura enquanto digita (em todas as fazendas a que o usuário tem acesso)
  const buscarRepetidos = useCallback(
    async (texto: string): Promise<any[]> => {
      const c = texto.trim();
      if (c.length < 2) return [];
      let q = supabase.from('financiamentos').select('id, numero, contrato, titular, credor:pessoas ( nome ), fazenda:fazendas ( nome )').ilike('contrato', c.replace(/[\\%_]/g, '\\$&')).limit(5);
      if (id) q = q.neq('id', id);
      const { data } = await q;
      return data ?? [];
    },
    [id],
  );
  useEffect(() => {
    setConfirmarRepetido(null);
    if (contrato.trim().length < 2) return setRepetidos([]);
    let vivo = true;
    const t = setTimeout(() => {
      buscarRepetidos(contrato).then((d) => vivo && setRepetidos(d)).catch(() => undefined);
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [contrato, buscarRepetidos]);
  const textoRepetidos = (lista: any[]) =>
    lista.map((x) => `nº ${x.numero} (${[um(x.credor)?.nome, x.titular ? `titular ${x.titular}` : null, um(x.fazenda)?.nome].filter(Boolean).join(' · ')})`).join(', ');

  // sugestões: titulares e objetos já usados (aparecem ao digitar 2 letras)
  const sugerirTitular = useCallback(async () => {
    const [{ data: fs }, { data: pr }] = await Promise.all([supabase.from('financiamentos').select('titular'), supabase.from('produtor').select('nome').limit(1)]);
    return maisUsados([...(fs ?? []).map((x: any) => x.titular), ...(pr ?? []).map((x: any) => x.nome)]);
  }, []);
  const sugerirObjeto = useCallback(async () => {
    const { data } = await supabase.from('financiamentos').select('objeto');
    return maisUsados((data ?? []).map((x: any) => x.objeto));
  }, []);
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, fazDespesa || null)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [fazDespesa]);

  // ---- abrir para alterar ----
  useEffect(() => {
    if (!editarId) return;
    (async () => {
      setErro(null);
      setAviso(null);
      setCarregando(true);
      try {
        const f = await consulta<any>(supabase.from('financiamentos').select('*').eq('id', editarId).single());
        setId(f.id);
        setNumero(f.numero);
        setFazDespesa(f.fazenda_id ?? '');
        setContrato(f.contrato ?? '');
        setTitular(f.titular ?? '');
        {
          // banco e agência: vêm do cadastro do banco; contrato antigo só tinha a agência escrita no contrato
          const { data: pb } = f.credor_id ? await supabase.from('pessoas').select('nome, banco_numero, agencia, agencia_local').eq('id', f.credor_id).maybeSingle() : { data: null as any };
          const escrita = String(f.agencia ?? '').trim();
          const soNumero = /^[\d.\-\/ ]+$/.test(escrita);
          setBanco({
            numero: pb?.banco_numero ?? '',
            nome: pb?.nome ?? '',
            agencia: pb?.agencia ?? (soNumero ? escrita : ''),
            local: pb?.agencia_local ?? (pb?.agencia || soNumero ? '' : escrita),
          });
        }
        setFinalidade([f.finalidade]);
        setObjeto(f.objeto ?? '');
        setLiberacao(doBanco(f.data_liberacao));
        setValor(moedaParaCampo(f.valor_liberado));
        setIofPerc(Number(f.iof_perc) ? numeroParaCampo(f.iof_perc) : '');
        setIofValor(Number(f.iof_valor) ? moedaParaCampo(f.iof_valor) : '');
        setDespesas(Number(f.despesas_contratacao) ? moedaParaCampo(f.despesas_contratacao) : '');
        setEncargos([f.encargos_descontados ? 'descontados' : 'aparte']);
        setLancar(!!f.lancar_liberacao);
        setBancoId(f.conta_bancaria_id);
        setContaAg('');
        setContaNum('');
        setContaBanco('');
        if (f.conta_bancaria_id) {
          const { data: cb } = await supabase.from('contas_bancarias').select('banco, agencia, conta').eq('id', f.conta_bancaria_id).maybeSingle();
          setContaAg(cb?.agencia ?? '');
          setContaNum(cb?.conta ?? '');
          setContaBanco(cb?.banco ?? '');
        }
        setTaxa(numeroParaCampo(f.taxa_anual));
        setJurosTipo([f.juros_tipo]);
        setBaseDias([String(f.base_dias)]);
        setIndexador(f.indexador ?? '');
        setIndiceCod([f.indexador_codigo ?? (String(f.indexador ?? '').trim() ? 'outro' : 'nenhum')]);
        setIndicePerc(numeroParaCampo(f.indexador_perc ?? 100) || '100');
        setCmOrdem([f.cm_ordem ?? 'corrigido']);
        setSistema([f.sistema]);
        setQtd(String(f.parcelas_qtd));
        setPeriod([f.periodicidade]);
        setPeriodDias(String(f.periodicidade_dias));
        setPrimeiro(doBanco(f.primeiro_vencimento));
        setJurosCarencia([f.juros_carencia]);
        setParcelaFixa(Number(f.parcela_fixa) ? moedaParaCampo(f.parcela_fixa) : '');
        setCarenciaCota(Number(f.carencia_cota) ? moedaParaCampo(f.carencia_cota) : '');
        const tinha = Number(f.pago_principal) > 0 || Number(f.pago_juros) > 0 || Number(f.pago_vm) > 0;
        setAntigo(tinha);
        setPagoPrincipal(Number(f.pago_principal) ? moedaParaCampo(f.pago_principal) : '');
        setPagoJuros(Number(f.pago_juros) ? moedaParaCampo(f.pago_juros) : '');
        setPagoVm(Number(f.pago_vm) ? moedaParaCampo(f.pago_vm) : '');
        setCentroId(f.centro_custo_id);
        setObs(f.observacoes ?? '');
        setErros({});
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [editarId]);

  function limpar() {
    setId(null);
    setNumero(null);
    setFazDespesa(fid ?? '');
    setContrato('');
    setTitular('');
    setBanco(BANCO_VAZIO);
    setRepetidos([]);
    setConfirmarRepetido(null);
    setFinalidade(['custeio']);
    setObjeto('');
    setLiberacao('');
    setValor('');
    setIofPerc('');
    setIofValor('');
    setDespesas('');
    setEncargos(['descontados']);
    setLancar(true);
    setBancoId(null);
    setContaAg('');
    setContaNum('');
    setContaBanco('');
    setTaxa('');
    setJurosTipo(['composto']);
    setBaseDias(['360']);
    setIndexador('');
    setIndiceCod(['nenhum']);
    setIndicePerc('100');
    setCmOrdem(['corrigido']);
    setSistema(['price']);
    setQtd('');
    setPeriod(['mensal']);
    setPeriodDias('30');
    setPrimeiro('');
    setJurosCarencia(['pagos']);
    setParcelaFixa('');
    setCarenciaCota('');
    setAntigo(false);
    setPagoPrincipal('');
    setPagoJuros('');
    setPagoVm('');
    setCentroId(null);
    setObs('');
    setErros({});
    setVerTodas(false);
    aoSair();
  }

  async function salvar(mesmoRepetido = false) {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!banco.nome.trim()) e.credor = 'Informe o nome do banco (ou de quem financiou).';
    if (!liberacaoIso) e.liberacao = 'Informe a data da liberação.';
    if (vLiberado <= 0) e.valor = 'Informe o valor liberado.';
    if (!taxa.trim() || n(taxa) == null || taxaAnual < 0) e.taxa = 'Informe os juros anuais (0 se não houver).';
    if (!primeiroIso) e.primeiro = sis === 'unico' ? 'Informe o vencimento.' : 'Informe o vencimento da primeira parcela.';
    else if (liberacaoIso && primeiroIso <= liberacaoIso) e.primeiro = 'O vencimento precisa ser depois da liberação.';
    if (sis !== 'unico' && !(Number(qtd) >= 1)) e.qtd = 'Informe a quantidade de parcelas.';
    if (per === 'dias' && !(Number(periodDias) >= 1)) e.period = 'Informe de quantos em quantos dias vence.';
    if (antigo && jaPrincipal >= vLiberado && vLiberado > 0) e.pago = 'O principal já pago não pode ser igual ou maior que o valor liberado.';
    if (lancarEf && !bancoId && !contaNum.trim()) e.banco = 'Informe a conta em que o dinheiro entrou (toque numa da relação ou digite).';
    if (indiceCod[0] !== 'nenhum' && !((n(indicePerc) ?? 0) > 0)) e.indice = 'Informe o percentual do indexador (100 = o índice cheio).';
    if (modoCarencia === 'fixos' && !(cotaInformada > 0)) e.cota = 'Informe o valor dos juros da carência de cada parcela, como está na tabela do banco.';
    if (sis === 'price' && !(fixaInformada > 0)) e.fixa = 'Informe o valor da parcela do contrato.';
    else if (fixaInformada > 0 && fixaInformada * (Number(qtd) || 1) < saldo) e.fixa = 'Com esse valor de parcela não se paga nem o principal. Confira o valor e a quantidade de parcelas.';
    if (!Object.keys(e).length && !tabela.length) e.tabela = 'Não foi possível calcular as parcelas: confira valor, datas e quantidade.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    // conta digitada: precisa estar cadastrada em Bancos e caixa (o botão "Cadastrar esta conta" leva até lá)
    let contaId = bancoId;
    if (lancarEf && !contaId) {
      const numero = soLetrasNumeros(contaNum);
      const agDig = soLetrasNumeros(contaAg);
      const achada = (await carregarContas().catch(() => contas)).find((c) => soLetrasNumeros(c.conta ?? '') === numero && (!agDig || !soLetrasNumeros(c.agencia ?? '') || soLetrasNumeros(c.agencia ?? '') === agDig));
      if (!achada) {
        setErros({ banco: 'Conta ainda não cadastrada.' });
        return setErro('A conta em que o dinheiro entrou ainda não está cadastrada. Toque em "Cadastrar esta conta" (logo abaixo dos campos da conta) ou escolha uma da relação.');
      }
      contaId = achada.id;
      setBancoId(contaId);
    }

    // nº de contrato repetido: avisa e só grava se confirmar (pode coincidir em bancos diferentes)
    if (!mesmoRepetido && contrato.trim()) {
      const iguais = await buscarRepetidos(contrato).catch(() => [] as any[]);
      if (iguais.length) {
        setRepetidos(iguais);
        return setConfirmarRepetido(`Já existe contrato com o nº ${contrato.trim()}: financiamento ${textoRepetidos(iguais)}. Se for outro contrato (de outro banco, por exemplo), confirme abaixo.`);
      }
    }
    setConfirmarRepetido(null);

    // banco + agência: usa o cadastrado ou cadastra agora (Pessoas › Banco)
    setSalvando(true);
    let credorId: string;
    let bancoNovo = false;
    try {
      const lista = await carregarBancos().catch(() => bancos);
      const rb = await resolverBanco(lista, banco);
      credorId = rb.id;
      bancoNovo = rb.novo;
    } catch (ex) {
      setSalvando(false);
      return setErro(traduzirErro(ex));
    }

    const p = {
      id,
      fazenda_id: fazDespesa || null,
      contrato,
      titular,
      credor_id: credorId,
      agencia: [banco.agencia.trim(), banco.local.trim()].filter(Boolean).join(' '),
      finalidade: finalidade[0],
      objeto,
      sistema: sis,
      parcelas_qtd: sis === 'unico' ? 1 : Number(qtd),
      periodicidade: per,
      periodicidade_dias: diasPer,
      primeiro_vencimento: primeiroIso,
      juros_carencia: modoCarencia,
      parcela_fixa: fixaInformada > 0 ? fixaInformada : null,
      carencia_cota: cotaInformada > 0 ? cotaInformada : null,
      juros_tipo: tipoJ,
      taxa_anual: taxaAnual,
      base_dias: base,
      indexador: indiceCod[0] === 'nenhum' ? '' : indiceCod[0] === 'outro' ? indexador.trim() || 'Outro' : ROTULO_INDICE[indiceCod[0]],
      indexador_codigo: indiceCod[0] === 'nenhum' ? '' : indiceCod[0],
      indexador_perc: indiceCod[0] === 'nenhum' ? 100 : n(indicePerc) ?? 100,
      cm_ordem: cmOrdem[0],
      data_liberacao: liberacaoIso,
      valor_liberado: vLiberado,
      iof_perc: n(iofPerc) ?? 0,
      iof_valor: n(iofValor) ?? 0,
      despesas_contratacao: n(despesas) ?? 0,
      encargos_descontados: encargos[0] === 'descontados',
      conta_bancaria_id: contaId,
      lancar_liberacao: lancarEf,
      pago_principal: jaPrincipal,
      pago_juros: antigo ? n(pagoJuros) ?? 0 : 0,
      pago_vm: antigo ? n(pagoVm) ?? 0 : 0,
      centro_custo_id: centroId,
      observacoes: obs,
      parcelas: tabela.map((x) => ({ vencimento: x.vencimento, principal: x.principal, juros: x.juros })),
    };
    const { data: r, error } = await supabase.rpc('salvar_financiamento', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; parcelas: number };
    const partes = [`Financiamento nº ${res.numero} gravado: ${res.parcelas} ${res.parcelas === 1 ? 'parcela lançada' : 'parcelas lançadas'} no contas a pagar.`];
    if (bancoNovo) partes.push(`${rotuloBanco({ nome: banco.nome.trim(), agencia: banco.agencia.trim(), agencia_local: banco.local.trim() })} foi cadastrado em Pessoas › Banco.`);
    if (lancarEf) partes.push(liberacaoIso! <= paraBanco(hojeBR())! ? `${formatarMoeda(vLiberado)} entraram na conta bancária.` : 'A liberação ficou em Contas a receber, para dar baixa quando o dinheiro entrar.');
    if (contratoAntigo) partes.push('Contrato anterior ao início do sistema: entrou como saldo de abertura, com a contrapartida no Patrimônio Líquido.');
    if (lancarEf && encargosTotal > 0) partes.push(encargos[0] === 'descontados' ? `IOF e despesas (${formatarMoeda(encargosTotal)}) já saíram da conta.` : `IOF e despesas (${formatarMoeda(encargosTotal)}) ficaram em Contas a pagar.`);
    setAviso(partes.join(' '));
    limpar();
    recarregarTopo();
    setVersaoSug((v) => v + 1);
    carregarContas().catch(() => undefined);
    carregarBancos().then(setBancos).catch(() => undefined);
  }

  if (carregando) return <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 24 }} />;

  const mostradas = verTodas || tabela.length <= 6 ? tabela : [...tabela.slice(0, 3), ...tabela.slice(-2)];
  return (
    <>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Financiamento nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Nº do contrato (do banco)" value={contrato} onChangeText={setContrato} autoCapitalize="characters" />
        </View>
      </View>
      <Escolha
        rotulo="Fazenda da despesa (juros, IOF e despesas)"
        opcoes={[...fazendas.map((x) => ({ valor: x.id, rotulo: x.nome })), { valor: '', rotulo: 'A informar depois' }]}
        valor={[fazDespesa]}
        aoMudar={(v) => {
          if (v[0] !== fazDespesa) setCentroId(null);
          setFazDespesa(v[0]);
        }}
      />
      <Text style={estilos.nota}>O financiamento (a dívida, as parcelas e o banco) é do Grupo. A fazenda escolhida aqui recebe a despesa: os juros, a variação monetária, o IOF e as despesas de contratação.</Text>
      {repetidos.length > 0 && <Text style={estilos.erro}>Atenção: já existe contrato com este nº: financiamento {textoRepetidos(repetidos)}. Ao gravar, o sistema pede para confirmar.</Text>}
      <CampoSugestao
        rotulo="Titular do contrato (opcional)"
        valor={titular}
        aoMudar={setTitular}
        carregar={sugerirTitular}
        minimo={2}
        versao={versaoSug}
        autoCapitalize="words"
        placeholder="Em branco = o produtor"
        ajuda="Preencha quando o contrato está no nome de outra pessoa (filho, cônjuge, sócio...). Digitando 2 letras, aparecem os nomes já usados."
      />
      {id && (
        <Text style={estilos.link} onPress={limpar}>
          Sair deste financiamento e cadastrar um novo
        </Text>
      )}

      <CampoBanco valor={banco} aoMudar={setBanco} cadastrados={bancos} erro={erros.credor} />
      <Escolha rotulo="Finalidade" opcoes={FINALIDADES} valor={finalidade} aoMudar={setFinalidade} />
      <CampoSugestao rotulo="Objeto financiado" valor={objeto} aoMudar={setObjeto} carregar={sugerirObjeto} minimo={2} versao={versaoSug} placeholder="Ex.: Custeio da safra 2026/27, trator, secador" />

      {/* ---------- liberação ---------- */}
      <Secao titulo="Liberação" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data da liberação *" valor={liberacao} aoMudar={setLiberacao} erro={erros.liberacao} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Valor liberado (R$) *" valor={valor} aoMudar={mudarValor} erro={erros.valor} />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ width: 90 }}>
          <Campo rotulo="IOF (%)" value={iofPerc} onChangeText={mudarIofPerc} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="IOF (R$)" valor={iofValor} aoMudar={mudarIofValor} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Despesas de contratação" valor={despesas} aoMudar={setDespesas} />
        </View>
      </View>
      <Text style={estilos.nota}>IOF: informe o percentual ou o valor; o outro é calculado sobre o valor liberado.</Text>
      {encargosTotal > 0 && (
        <>
          <Escolha
            rotulo="IOF e despesas"
            opcoes={[
              { valor: 'descontados', rotulo: 'Descontados do valor liberado' },
              { valor: 'aparte', rotulo: 'Pagos à parte' },
            ]}
            valor={encargos}
            aoMudar={setEncargos}
          />
          <Text style={estilos.nota}>
            {encargos[0] === 'descontados' ? `Entra na conta: ${formatarMoeda(r2(vLiberado - encargosTotal))} (o liberado menos ${formatarMoeda(encargosTotal)}).` : `Entra na conta o valor liberado inteiro; os ${formatarMoeda(encargosTotal)} ficam em Contas a pagar.`} IOF e despesas vão para despesa financeira.
          </Text>
        </>
      )}
      {contratoAntigo ? (
        <Aviso tipo="info" texto={`Contrato liberado antes do início do sistema (${doBanco(inicioSistema)}): entra como saldo de abertura. A dívida fica com a contrapartida no Patrimônio Líquido e a liberação não passa pelo banco. As parcelas vão para o Contas a pagar normalmente.`} />
      ) : (
        <Interruptor rotulo="Lançar a liberação no banco" descricao="Desligue para contrato antigo, cujo dinheiro entrou antes de você começar a usar o sistema." valor={lancar} aoMudar={setLancar} />
      )}
      {lancarEf && (
        <>
          <Text style={estilos.numeroRotulo}>Conta em que o dinheiro entrou *</Text>
          <Campo rotulo="Banco" value={contaBanco} onChangeText={(t) => { setContaBanco(t); setBancoId(null); }} autoCapitalize="words" autoCorrect={false} placeholder={banco.nome.trim() || 'Ex.: Cresol'} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Nº da agência" value={contaAg} onChangeText={(t) => digitarConta(t, contaNum)} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1.3 }}>
              <Campo rotulo="Nº da conta *" value={contaNum} onChangeText={(t) => digitarConta(contaAg, t)} keyboardType="numbers-and-punctuation" erro={erros.banco} />
            </View>
          </View>
          {contaEscolhida ? (
            <Text style={estilos.calculo}>
              Conta cadastrada: {[contaEscolhida.nome, contaEscolhida.banco].filter(Boolean).join(' · ')}{'  '}
              <Text style={estilos.link} onPress={() => { setBancoId(null); setContaAg(''); setContaNum(''); setContaBanco(''); }}>Trocar</Text>
            </Text>
          ) : contaNum.trim() ? (
            <>
              <Text style={estilos.nota}>Esta conta ainda não está cadastrada.</Text>
              <Botao titulo="Cadastrar esta conta" tipo="secundario" onPress={cadastrarConta} />
            </>
          ) : null}
          {!contaEscolhida && contas.length > 0 && (
            <View style={estilos.contas}>
              <Text style={estilos.nota}>{contasFiltradas.length ? 'Contas cadastradas (toque para usar):' : 'Nenhuma conta cadastrada parecida com o que foi digitado.'}</Text>
              {contasFiltradas.map((c) => (
                <Text key={c.id} style={estilos.link} onPress={() => tocarConta(c)}>
                  {[c.banco && !semAcento(c.nome ?? '').includes(semAcento(c.banco)) ? c.banco : null, c.nome, c.agencia ? `ag. ${c.agencia}` : null, c.conta ? `conta ${c.conta}` : null].filter(Boolean).join(' · ')}
                </Text>
              ))}
            </View>
          )}
        </>
      )}

      {/* ---------- juros ---------- */}
      <Secao titulo="Juros" />
      <Escolha rotulo="Sistema de cálculo dos juros e das parcelas" opcoes={SISTEMAS.map((s) => ({ valor: s.valor, rotulo: s.rotulo }))} valor={sistema} aoMudar={setSistema} />
      <Text style={estilos.nota}>{SISTEMAS.find((s) => s.valor === sis)?.explica}</Text>
      <View style={estilos.linha}>
        <View style={{ width: 130 }}>
          <Campo rotulo="Juros anuais (%) *" value={taxa} onChangeText={setTaxa} keyboardType="decimal-pad" erro={erros.taxa} />
        </View>
        <View style={{ flex: 1 }}>
          <Escolha
            rotulo="Tipo"
            opcoes={[
              { valor: 'composto', rotulo: 'Compostos' },
              { valor: 'simples', rotulo: 'Simples' },
            ]}
            valor={jurosTipo}
            aoMudar={setJurosTipo}
          />
        </View>
      </View>
      <Escolha
        rotulo="Base de dias do ano (juros diários)"
        opcoes={[
          { valor: '360', rotulo: '360 dias' },
          { valor: '365', rotulo: 'Ano civil (365/366)' },
        ]}
        valor={baseDias}
        aoMudar={setBaseDias}
      />
      {taxaAnual > 0 && (
        <Text style={estilos.calculo}>
          Juros mensais: {formatarNumero(taxaMensal(taxaAnual, tipoJ), 4)}% · Juros diários: {formatarNumero(taxaDiaria(taxaAnual, tipoJ, base), 6)}%
        </Text>
      )}
      <Escolha
        rotulo="Correção monetária (indexador)"
        opcoes={[{ valor: 'nenhum', rotulo: 'Sem correção' }, ...INDICES.map((i) => ({ valor: i.valor, rotulo: i.rotulo }))]}
        valor={indiceCod}
        aoMudar={setIndiceCod}
      />
      {indiceCod[0] !== 'nenhum' && (
        <>
          <View style={estilos.linha}>
            <View style={{ width: 140 }}>
              <Campo rotulo="% do indexador *" value={indicePerc} onChangeText={setIndicePerc} keyboardType="decimal-pad" erro={erros.indice} />
            </View>
            {indiceCod[0] === 'outro' && (
              <View style={{ flex: 1 }}>
                <Campo rotulo="Qual indexador" value={indexador} onChangeText={setIndexador} autoCapitalize="characters" autoCorrect={false} placeholder="Ex.: TJLP, TLP" />
              </View>
            )}
          </View>
          <Text style={estilos.nota}>100 = o índice cheio (ex.: 100% do CDI); 120 = 120% do índice.</Text>
          <Escolha rotulo="Correção e juros" opcoes={OPCOES_ORDEM} valor={cmOrdem} aoMudar={setCmOrdem} />
          <Text style={estilos.nota}>
            {cmOrdem[0] === 'corrigido' ? 'Primeiro corrige o saldo; os juros são calculados sobre o saldo já corrigido (o usual nos bancos).' : 'Correção e juros calculados, cada um, sobre o saldo original.'} Vale para o botão "Atualizar o contrato até uma data", na consulta{indiceCod[0] === 'outro' ? '' : `, que busca o ${ROTULO_INDICE[indiceCod[0]]} no Banco Central`}. A variação monetária cobrada pelo banco em cada parcela continua sendo informada na parcela.
          </Text>
        </>
      )}

      {/* ---------- parcelas ---------- */}
      <Secao titulo="Parcelas" />
      <Interruptor rotulo="Contrato já em andamento" descricao="Para financiamento que já tinha parcelas pagas antes de entrar no sistema." valor={antigo} aoMudar={setAntigo} />
      {antigo && (
        <>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Já pago: principal" valor={pagoPrincipal} aoMudar={setPagoPrincipal} erro={erros.pago} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Já pago: juros" valor={pagoJuros} aoMudar={setPagoJuros} />
            </View>
          </View>
          <CampoMoeda rotulo="Já pago: variação monetária" valor={pagoVm} aoMudar={setPagoVm} />
          <Text style={estilos.nota}>As parcelas são calculadas sobre o que falta do principal ({formatarMoeda(Math.max(0, saldo))}). Informe abaixo só as parcelas que faltam e o vencimento da próxima a pagar (não o da primeira do contrato).</Text>
        </>
      )}
      {sis !== 'unico' && (
        <>
          <Escolha rotulo="Periodicidade" opcoes={PERIODICIDADES.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))} valor={period} aoMudar={setPeriod} erro={erros.period} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo={antigo ? 'Parcelas que faltam *' : 'Quantidade de parcelas *'} value={qtd} onChangeText={(t) => setQtd(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" erro={erros.qtd} />
            </View>
            {per === 'dias' && (
              <View style={{ flex: 1 }}>
                <Campo rotulo="A cada (dias) *" value={periodDias} onChangeText={(t) => setPeriodDias(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" />
              </View>
            )}
          </View>
        </>
      )}
      <CampoData rotulo={sis === 'unico' ? 'Vencimento *' : antigo ? 'Vencimento da próxima parcela a pagar *' : 'Vencimento da primeira parcela *'} valor={primeiro} aoMudar={setPrimeiro} erro={erros.primeiro} />
      {antigo && primeiroIso && primeiroIso < paraBanco(hojeBR())! && <Text style={estilos.erro}>Essa data já passou. Em contrato em andamento, informe o vencimento da próxima parcela a pagar, e não o da primeira parcela do contrato.</Text>}
      {sis === 'price' && (
        <CampoMoeda
          rotulo="Valor da parcela do contrato *"
          valor={parcelaFixa}
          aoMudar={setParcelaFixa}
          erro={erros.fixa}
          ajuda={`Obrigatório. Copie do contrato o valor fixo da parcela: o sistema usa esse valor e calcula quanto é principal e quanto é juros em cada uma.${parcelaDoSistema != null && !(fixaInformada > 0) ? ` Pelo cálculo do sistema ficaria perto de ${formatarMoeda(parcelaDoSistema)}.` : ''}`}
        />
      )}
      {(carencia || antigo) && sis === 'sac' && (
        <>
          <Escolha
            rotulo="Juros do tempo de carência"
            opcoes={[
              { valor: 'pagos', rotulo: 'Pagos a cada período' },
              { valor: 'primeira', rotulo: 'Pagos na 1ª parcela' },
              { valor: 'capitalizados', rotulo: 'Somam ao saldo' },
              { valor: 'fixos', rotulo: 'Divididos nas parcelas' },
            ]}
            valor={jurosCarencia}
            aoMudar={setJurosCarencia}
          />
          <Text style={estilos.nota}>
            {jurosCarencia[0] === 'fixos'
              ? 'O banco já calculou os juros da carência e dividiu em cotas iguais, uma em cada parcela. Os juros das parcelas contam de um período antes do 1º vencimento, sobre o saldo com essas cotas.'
              : jurosCarencia[0] === 'capitalizados'
              ? 'Os juros da carência entram no saldo e são pagos dentro das parcelas (juros sobre juros: é a opção mais cara).'
              : jurosCarencia[0] === 'primeira'
                ? 'A primeira parcela traz os juros de todos os dias desde a liberação.'
                : soJurosCarencia.length
                  ? `Os juros são pagos a cada período: cada parcela traz só os juros do seu período. Além das ${Number(qtd) || 0} parcelas, ${soJurosCarencia.length === 1 ? 'entra 1 pagamento só de juros da carência que ainda vai vencer' : `entram ${soJurosCarencia.length} pagamentos só de juros da carência que ainda vão vencer`} (${soJurosCarencia.map((x) => doBanco(x.vencimento)).join(', ')}).`
                  : 'Os juros são pagos a cada período: cada parcela traz só os juros do seu período. Os juros da carência que já venceram não entram.'}
          </Text>
          {jurosCarencia[0] === 'fixos' && (
            <CampoMoeda
              rotulo="Juros da carência em cada parcela (R$) *"
              valor={carenciaCota}
              aoMudar={setCarenciaCota}
              erro={erros.cota}
              ajuda={`Copie da tabela do banco o valor da coluna "Carência/Juros" de uma parcela.${cotaInformada > 0 && Number(qtd) > 0 ? ` Total da carência: ${formatarMoeda(r2(cotaInformada * Number(qtd)))}, em ${Number(qtd)} cotas.` : ''}`}
            />
          )}
        </>
      )}

      {/* ---------- tabela calculada ---------- */}
      {tabela.length > 0 && (
        <View style={estilos.tabela}>
          <Text style={estilos.tabelaTitulo}>Tabela calculada: confira com a do banco</Text>
          {sis === 'price' && !tabela.some((p) => p.soJuros) && <Text style={estilos.calculo}>Valor das parcelas fixas: {formatarMoeda(tabela[tabela.length - 1].valor)}{fixaInformada > 0 ? ' (informado do contrato)' : ''}</Text>}
          {fixaInformada > 0 && parcelaDoSistema != null && Math.abs(parcelaDoSistema - fixaInformada) > 0.005 && (
            <Text style={estilos.nota}>
              Pelo cálculo do sistema a parcela seria {formatarMoeda(parcelaDoSistema)}. Vale a do contrato; o sistema só divide principal e juros.
              {Math.abs(parcelaDoSistema - fixaInformada) > Math.max(1, fixaInformada * 0.01) ? ' A diferença é grande: confira a taxa, as datas e o valor.' : ''}
            </Text>
          )}
          <View style={estilos.cab}>
            <Text style={[estilos.cel, estilos.celNum, estilos.celCab]}>Nº</Text>
            <Text style={[estilos.cel, estilos.celData, estilos.celCab]}>Vence</Text>
            <Text style={[estilos.cel, estilos.celCab]}>Principal</Text>
            <Text style={[estilos.cel, estilos.celCab]}>Juros</Text>
            <Text style={[estilos.cel, estilos.celCab]}>Parcela</Text>
          </View>
          {mostradas.map((p, k) => (
            <React.Fragment key={p.numero}>
              {!verTodas && tabela.length > 6 && k === 3 && <Text style={estilos.pulo}>… {tabela.length - 5} parcelas no meio …</Text>}
              <View style={estilos.lin}>
                <Text style={[estilos.cel, estilos.celNum]}>{p.soJuros ? 'J' : p.numero - soJurosCarencia.length}</Text>
                <Text style={[estilos.cel, estilos.celData]}>{doBanco(p.vencimento)}</Text>
                <Text style={estilos.cel}>{formatarNumero(p.principal, 2)}</Text>
                <Text style={estilos.cel}>{formatarNumero(p.juros, 2)}</Text>
                <Text style={[estilos.cel, { fontWeight: '700' }]}>{formatarNumero(p.valor, 2)}</Text>
              </View>
            </React.Fragment>
          ))}
          {tabela.length > 6 && (
            <Text style={estilos.link} onPress={() => setVerTodas(!verTodas)}>
              {verTodas ? 'Mostrar só o começo e o fim' : `Ver as ${tabela.length} parcelas`}
            </Text>
          )}
          <Text style={estilos.calculo}>
            Total de juros: {formatarMoeda(totJuros)} · Total a pagar: {formatarMoeda(totGeral)}
            {prazo != null ? ` · Prazo: ${formatarNumero(prazo)} dias` : ''}
          </Text>
          <Text style={estilos.nota}>Variação monetária ou acerto de uma parcela só: depois de gravar, Consultar › toque na parcela.</Text>
        </View>
      )}
      {erros.tabela && <Text style={estilos.erro}>{erros.tabela}</Text>}

      <SeletorLista rotulo="Centro de custo (opcional)" valorId={centroId} aoMudar={setCentroId} carregar={carregarCentros} permitirLimpar vazio="Nenhum centro de custo cadastrado ainda. Feche e toque em 'Cadastrar centros de custo', logo abaixo do campo." />
      <Text style={estilos.link} onPress={() => navegacao.navigate('CentroForm', {})}>
        Cadastrar centros de custo
      </Text>
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />

      {confirmarRepetido && (
        <>
          <Aviso tipo="erro" texto={confirmarRepetido} />
          <Botao titulo="É outro contrato: gravar mesmo assim" tipo="secundario" onPress={() => salvar(true)} carregando={salvando} />
        </>
      )}
      <Botao titulo={id ? 'Salvar financiamento' : 'Gravar financiamento'} onPress={() => salvar()} carregando={salvando} />
    </>
  );
}

// =====================================================================================================
// CONSULTAR
// =====================================================================================================
const paga = (p: any) => um(p.titulo)?.situacao === 'pago';

/** Totais de um financiamento, a partir das parcelas e dos títulos delas. */
function resumoDe(f: any) {
  const ps = ((f.parcelas as any[]) ?? []).slice().sort((a, b) => a.numero - b.numero);
  const hojeMais12 = somarDias(paraBanco(hojeBR())!, 365);
  const pagas = ps.filter(paga);
  const abertas = ps.filter((p) => !paga(p));
  const pagoPrincipal = r2(Number(f.pago_principal ?? 0) + pagas.reduce((t, p) => t + Number(p.principal), 0));
  const pagoJuros = r2(Number(f.pago_juros ?? 0) + pagas.reduce((t, p) => t + Number(p.juros), 0));
  const pagoVm = r2(Number(f.pago_vm ?? 0) + pagas.reduce((t, p) => t + Number(p.vm ?? 0), 0));
  const saldo = r2(Number(f.valor_liberado) - pagoPrincipal);
  const curto = r2(abertas.filter((p) => p.vencimento <= hojeMais12).reduce((t, p) => t + Number(p.principal), 0));
  const proxima = abertas[0] ?? null;
  return { ps, pagas, abertas, pagoPrincipal, pagoJuros, pagoVm, saldo, curto, longo: r2(saldo - curto), proxima };
}

function Consulta({ aoAlterar, abrirId }: { aoAlterar: (id: string) => void; abrirId?: string }) {
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  const [lista, setLista] = useState<any[] | null>(null);
  const [verId, setVerId] = useState<string | null>(abrirId ?? null);
  const [erro, setErro] = useState<string | null>(null);
  // como consultar: os contratos (com busca) ou, por credor, só os títulos em aberto dele
  const [modo, setModo] = useState<string[]>(['contratos']);
  const [busca, setBusca] = useState('');
  const [credorSel, setCredorSel] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!fid) return;
    consulta<any[]>(
      supabase
        .from('financiamentos')
        .select('id, fazenda_id, numero, contrato, titular, objeto, finalidade, agencia, valor_liberado, pago_principal, pago_juros, pago_vm, credor_id, credor:pessoas ( nome, agencia, agencia_local ), parcelas:financiamento_parcelas ( numero, vencimento, principal, juros, vm, titulo:lancamentos ( numero, situacao, valor, valor_pago, data_vencimento ) )')
        .order('numero', { ascending: false }),
    )
      .then(setLista)
      .catch((e) => setErro(traduzirErro(e)));
  }, [fid]);
  useFocusEffect(carregar);

  if (verId) {
    return (
      <Detalhe
        id={verId}
        aoVoltar={() => {
          setVerId(null);
          carregar();
        }}
        aoAlterar={aoAlterar}
      />
    );
  }
  if (erro) return <Aviso tipo="erro" texto={erro} />;
  if (lista === null) return <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;
  if (!lista.length) return <Text style={estilos.vazio}>Nenhum financiamento cadastrado no Grupo.</Text>;

  const res = lista.map((f) => ({ f, r: resumoDe(f) }));
  const todosAtivos = res.filter((x) => x.r.saldo > 0.005);
  const cartao = (
    <View style={estilos.cartao}>
      <Text style={estilos.rotuloCartao}>Saldo devedor (principal) dos financiamentos do Grupo</Text>
      <Text style={estilos.totalCartao}>{formatarMoeda(todosAtivos.reduce((t, x) => t + x.r.saldo, 0))}</Text>
      <Text style={estilos.nota}>
        Vence em até 12 meses: {formatarMoeda(todosAtivos.reduce((t, x) => t + x.r.curto, 0))} · Depois: {formatarMoeda(todosAtivos.reduce((t, x) => t + x.r.longo, 0))}
      </Text>
      {todosAtivos.some((x) => !x.f.fazenda_id) && (
        <Text style={[estilos.nota, { color: cores.erro }]}>
          {todosAtivos.filter((x) => !x.f.fazenda_id).length} em andamento sem a fazenda da despesa: toque no contrato e informe a fazenda que paga os juros.
        </Text>
      )}
    </View>
  );
  const seletor = (
    <Escolha
      rotulo="Consultar"
      opcoes={[
        { valor: 'contratos', rotulo: 'Contratos' },
        { valor: 'credor', rotulo: 'Por credor (títulos em aberto)' },
      ]}
      valor={modo}
      aoMudar={setModo}
    />
  );

  // ---------- por credor: só os títulos em aberto dele ----------
  if (modo[0] === 'credor') {
    const hoje = paraBanco(hojeBR())!;
    // credores que têm título em aberto, com o total de cada um
    const titulos = res.flatMap(({ f, r }) =>
      r.abertas.map((p) => {
        const t = um(p.titulo);
        const valor = Number(t?.valor ?? Number(p.principal) + Number(p.juros) + Number(p.vm ?? 0));
        const pago = Number(t?.valor_pago ?? 0);
        return { f, p, total: r.ps.length, vencimento: (t?.data_vencimento ?? p.vencimento) as string, valor, pago, falta: r2(valor - pago), tituloNumero: t?.numero as number | undefined };
      }),
    );
    const credores = [...new Map<string, { id: string; nome: string; ag: string }>(titulos.map((x): [string, { id: string; nome: string; ag: string }] => [x.f.credor_id ?? '', { id: (x.f.credor_id ?? '') as string, nome: (um(x.f.credor)?.nome ?? 'Banco não informado') as string, ag: [um(x.f.credor)?.agencia, um(x.f.credor)?.agencia_local].filter(Boolean).join(' ') }])).values()]
      .map((c) => ({ ...c, total: r2(titulos.filter((x) => (x.f.credor_id ?? '') === c.id).reduce((t, x) => t + x.falta, 0)), qtd: titulos.filter((x) => (x.f.credor_id ?? '') === c.id).length }))
      .sort((a, b) => b.total - a.total);
    const sel = credores.find((c) => c.id === credorSel) ?? (credores.length === 1 ? credores[0] : null);
    const doCredor = sel ? titulos.filter((x) => (x.f.credor_id ?? '') === sel.id).sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : a.f.numero - b.f.numero)) : [];
    const vencidos = doCredor.filter((x) => x.vencimento < hoje);
    return (
      <>
        {cartao}
        {seletor}
        {!credores.length && <Text style={estilos.vazio}>Nenhum título de financiamento em aberto.</Text>}
        {credores.length > 0 && (
          <Lista>
            {credores.map((c) => (
              <Linha
                key={c.id || 'sem'}
                titulo={`${sel?.id === c.id ? '● ' : ''}${c.nome}${c.ag ? ` · ag. ${c.ag}` : ''}`}
                linhas={[`${c.qtd} ${c.qtd === 1 ? 'título em aberto' : 'títulos em aberto'}`]}
                direita={formatarMoeda(c.total)}
                onPress={() => setCredorSel(c.id)}
              />
            ))}
          </Lista>
        )}
        {credores.length > 1 && !sel && <Text style={estilos.nota}>Toque no credor para ver os títulos em aberto dele.</Text>}
        {sel && (
          <>
            <Secao titulo={`Em aberto com ${sel.nome}`} />
            <View style={estilos.cartao}>
              <Text style={estilos.rotuloCartao}>
                {doCredor.length} {doCredor.length === 1 ? 'título em aberto' : 'títulos em aberto'}
              </Text>
              <Text style={estilos.totalCartao}>{formatarMoeda(sel.total)}</Text>
              <Text style={estilos.nota}>
                {vencidos.length ? `Vencidos: ${formatarMoeda(r2(vencidos.reduce((t, x) => t + x.falta, 0)))} (${vencidos.length}) · ` : ''}Principal {formatarMoeda(r2(doCredor.reduce((t, x) => t + Number(x.p.principal), 0)))} · Juros {formatarMoeda(r2(doCredor.reduce((t, x) => t + Number(x.p.juros), 0)))}
                {doCredor.some((x) => Number(x.p.vm)) ? ` · V. monetária ${formatarMoeda(r2(doCredor.reduce((t, x) => t + Number(x.p.vm ?? 0), 0)))}` : ''}
              </Text>
            </View>
            <Lista>
              {doCredor.map((x) => (
                <Linha
                  key={`${x.f.id}-${x.p.numero}`}
                  titulo={`${doBanco(x.vencimento)}${x.vencimento < hoje ? ' · vencido' : ''}`}
                  linhas={[
                    [`Nº ${x.f.numero}`, x.f.contrato ? `contrato ${x.f.contrato}` : null, `parcela ${x.p.numero}/${x.total}`, x.tituloNumero ? `título nº ${x.tituloNumero}` : null].filter(Boolean).join(' · '),
                    [x.f.titular ? `Titular ${x.f.titular}` : null, x.f.objeto, x.pago > 0 ? `pago em parte: ${formatarMoeda(x.pago)}` : null].filter(Boolean).join(' · ') || null,
                  ]}
                  direita={formatarMoeda(x.falta)}
                  onPress={() => setVerId(x.f.id)}
                />
              ))}
            </Lista>
            <Text style={estilos.nota}>Tocando no título, abre o contrato. O pagamento (baixa) é dado em Financeiro › Contas a pagar.</Text>
          </>
        )}
      </>
    );
  }

  // ---------- contratos, com busca ----------
  const termo = semAcento(busca);
  const filtrados = !termo
    ? res
    : res.filter(({ f }) => semAcento([`nº ${f.numero}`, f.contrato, f.titular, f.objeto, um(f.credor)?.nome, f.agencia, ROTULO_FINALIDADE[f.finalidade]].filter(Boolean).join(' ')).includes(termo) || String(f.numero) === termo);
  const ativos = filtrados.filter((x) => x.r.saldo > 0.005);
  const quitados = filtrados.filter((x) => x.r.saldo <= 0.005);
  const linha = ({ f, r }: { f: any; r: ReturnType<typeof resumoDe> }) => (
    <Linha
      key={f.id}
      titulo={`Nº ${f.numero} · ${um(f.credor)?.nome ?? 'Banco não informado'}`}
      linhas={[
        [ROTULO_FINALIDADE[f.finalidade], f.objeto, f.contrato ? `contrato ${f.contrato}` : null, f.titular ? `titular ${f.titular}` : null].filter(Boolean).join(' · '),
        f.fazenda_id ? `Despesa: ${fazendas.find((x) => x.id === f.fazenda_id)?.nome ?? 'outra fazenda'}` : 'Fazenda da despesa: a informar',
        r.proxima ? `Próxima: ${doBanco(r.proxima.vencimento)} · ${formatarMoeda(Number(um(r.proxima.titulo)?.valor ?? Number(r.proxima.principal) + Number(r.proxima.juros)))}` : 'Quitado',
      ]}
      direita={formatarMoeda(Math.max(0, r.saldo))}
      onPress={() => setVerId(f.id)}
    />
  );
  return (
    <>
      {cartao}
      {seletor}
      <Busca valor={busca} aoMudar={setBusca} dica="Banco, titular, nº do contrato ou objeto" />
      {termo && !filtrados.length ? <Text style={estilos.vazio}>Nenhum contrato encontrado com essa busca.</Text> : null}
      {termo && filtrados.length > 0 ? (
        <Text style={estilos.nota}>
          {filtrados.length} {filtrados.length === 1 ? 'contrato' : 'contratos'} · saldo devedor {formatarMoeda(ativos.reduce((t, x) => t + x.r.saldo, 0))}
        </Text>
      ) : null}
      {ativos.length > 0 && <Lista>{ativos.map(linha)}</Lista>}
      {quitados.length > 0 && (
        <>
          <Secao titulo="Quitados" />
          <Lista>{quitados.map(linha)}</Lista>
        </>
      )}
    </>
  );
}

function Detalhe({ id, aoVoltar, aoAlterar }: { id: string; aoVoltar: () => void; aoAlterar: (id: string) => void }) {
  const { fazendas } = useSessao();
  const [f, setF] = useState<any>(null);
  // fazenda da despesa (juros): informar ou trocar sem refazer o contrato
  const [trocarFaz, setTrocarFaz] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // ajuste de uma parcela em aberto
  const [parcId, setParcId] = useState<string | null>(null);
  const [aVenc, setAVenc] = useState('');
  const [aJuros, setAJuros] = useState('');
  const [aVm, setAVm] = useState('');
  const [salvando, setSalvando] = useState(false);
  // recálculo das parcelas em aberto pelo valor fixo da parcela
  const [recalc, setRecalc] = useState(false);
  const [rValor, setRValor] = useState('');
  // atualização do contrato até uma data (só informação)
  const [atualizar, setAtualizar] = useState(false);

  const carregar = useCallback(() => {
    consulta<any>(
      supabase
        .from('financiamentos')
        .select('*, credor:pessoas ( nome ), banco:contas_bancarias ( nome ), centro:centros_custo ( codigo, nome ), parcelas:financiamento_parcelas ( *, titulo:lancamentos ( numero, situacao, valor, valor_pago, data_vencimento, data_pagamento ) )')
        .eq('id', id)
        .single(),
    )
      .then(setF)
      .catch((e) => setErro(traduzirErro(e)));
  }, [id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  if (erro && !f) return <Aviso tipo="erro" texto={erro} />;
  if (!f) return <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;
  const r = resumoDe(f);
  const temPagamento = r.ps.some((p) => Number(um(p.titulo)?.valor_pago ?? 0) > 0);

  // Parcelas iguais: refaz principal e juros das parcelas ainda não pagas, pelo valor fixo da parcela do contrato.
  const emAberto = r.abertas.filter((p) => !(Number(um(p.titulo)?.valor_pago ?? 0) > 0));
  const pagaEmParte = r.abertas.length - emAberto.length;
  const podeRecalcular = f.sistema === 'price' && emAberto.length > 0;
  const previa = (() => {
    const valorP = n(rValor) ?? 0;
    if (!recalc || !podeRecalcular || !(valorP > 0)) return [];
    const primeiro = emAberto[0].vencimento as string;
    // contrato inteiro em aberto: os juros da carência contam da liberação, como no cadastro
    const inteiro = emAberto.length === r.ps.length && !(Number(f.pago_principal) > 0) && !(Number(f.pago_juros) > 0) && f.data_liberacao < primeiro;
    const novas = gerarParcelas({
      saldo: r2(emAberto.reduce((t, p) => t + Number(p.principal), 0)),
      sistema: 'price',
      parcelas: emAberto.length,
      periodicidade: f.periodicidade,
      periodicidadeDias: Number(f.periodicidade_dias) || 30,
      primeiro,
      inicio: inteiro ? f.data_liberacao : umPeriodoAntes(primeiro, f.periodicidade, Number(f.periodicidade_dias) || 30),
      taxaAnual: Number(f.taxa_anual),
      jurosTipo: f.juros_tipo,
      baseDias: Number(f.base_dias),
      jurosCarencia: 'capitalizados',
      parcelaFixa: valorP,
    });
    return novas.length === emAberto.length ? novas.map((x, k) => ({ id: emAberto[k].id as string, numero: emAberto[k].numero as number, principal: x.principal, juros: x.juros })) : [];
  })();

  function abrirRecalculo() {
    setErro(null);
    setAviso(null);
    setParcId(null);
    setRValor(Number(f.parcela_fixa) ? moedaParaCampo(f.parcela_fixa) : '');
    setRecalc(true);
  }
  async function salvarRecalculo() {
    setErro(null);
    const valorP = n(rValor) ?? 0;
    if (!(valorP > 0)) return setErro('Informe o valor fixo da parcela, como está no contrato.');
    if (!previa.length) return setErro('Com esse valor de parcela não se paga o principal que falta. Confira o valor.');
    setSalvando(true);
    const { data: res, error } = await supabase.rpc('recalcular_parcelas_financiamento', { p: { id, parcela_fixa: valorP, parcelas: previa.map((x) => ({ id: x.id, principal: x.principal, juros: x.juros })) } });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setAviso(`${(res as any)?.parcelas ?? previa.length} parcelas em aberto recalculadas para ${formatarMoeda(valorP)}. Os títulos no contas a pagar já estão com o valor novo.`);
    setRecalc(false);
    carregar();
  }

  function abrirAjuste(p: any) {
    setErro(null);
    setAviso(null);
    setParcId(p.id);
    setAVenc(doBanco(um(p.titulo)?.data_vencimento ?? p.vencimento));
    setAJuros(moedaParaCampo(p.juros));
    setAVm(Number(p.vm) ? moedaParaCampo(p.vm) : '');
  }
  async function salvarAjuste() {
    if (!dataValida(aVenc)) return setErro('Vencimento inválido.');
    setSalvando(true);
    const { data: res, error } = await supabase.rpc('ajustar_parcela_financiamento', { p: { id: parcId, vencimento: paraBanco(aVenc), juros: n(aJuros) ?? 0, vm: n(aVm) ?? 0 } });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setAviso(`Parcela ajustada: ${formatarMoeda(Number((res as any)?.valor ?? 0))}. O título no contas a pagar já está com o valor novo.`);
    setParcId(null);
    carregar();
  }
  function excluir() {
    Alert.alert('Excluir financiamento', `Excluir o financiamento nº ${f.numero}? Saem as parcelas do contas a pagar e a liberação do banco.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_financiamento', { p_id: id }), 'financiamento_id', String(id));
          if (error) return setErro(traduzirErro(error));
          aoVoltar();
        },
      },
    ]);
  }

  return (
    <>
      <Text style={estilos.link} onPress={aoVoltar}>
        ‹ Voltar à relação
      </Text>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <Text style={estilos.rotuloCartao}>
          Financiamento nº {f.numero} · {um(f.credor)?.nome ?? 'Banco não informado'}
        </Text>
        <Text style={estilos.totalCartao}>{formatarMoeda(Math.max(0, r.saldo))}</Text>
        <Text style={estilos.nota}>Saldo devedor (principal){r.saldo <= 0.005 ? ' · quitado' : ''}</Text>
        {r.saldo > 0.005 && (
          <Text style={estilos.nota}>
            Vence em até 12 meses: {formatarMoeda(r.curto)} · Depois: {formatarMoeda(r.longo)}
          </Text>
        )}
      </View>

      <Dado rotulo="Contrato" valor={[f.contrato, f.agencia ? `ag. ${f.agencia}` : null].filter(Boolean).join(' · ')} />
      <Dado rotulo="Titular do contrato" valor={f.titular || 'O produtor'} />
      <Dado rotulo="Fazenda da despesa (juros)" valor={f.fazenda_id ? fazendas.find((x) => x.id === f.fazenda_id)?.nome ?? 'Outra fazenda' : 'A informar'} />
      {trocarFaz === null ? (
        <Text style={estilos.link} onPress={() => setTrocarFaz([f.fazenda_id ?? ''])}>
          {f.fazenda_id ? 'Trocar a fazenda da despesa' : 'Informar a fazenda da despesa'}
        </Text>
      ) : (
        <View style={estilos.ajuste}>
          <Escolha rotulo="Qual fazenda paga os juros deste contrato" opcoes={[...fazendas.map((x) => ({ valor: x.id, rotulo: x.nome })), { valor: '', rotulo: 'A informar depois' }]} valor={trocarFaz} aoMudar={setTrocarFaz} />
          <Text style={estilos.nota}>Vale para o contrato inteiro: as parcelas (pagas e em aberto), a liberação e o IOF passam para essa fazenda nos relatórios.</Text>
          <Botao
            titulo="Gravar"
            carregando={salvando}
            onPress={async () => {
              setErro(null);
              setSalvando(true);
              const { error } = await supabase.rpc('definir_fazenda_financiamento', { p_id: id, p_fazenda: trocarFaz[0] || null });
              setSalvando(false);
              if (error) return setErro(traduzirErro(error));
              setAviso('Fazenda da despesa gravada.');
              setTrocarFaz(null);
              carregar();
            }}
          />
          <Botao titulo="Cancelar" tipo="texto" onPress={() => setTrocarFaz(null)} />
        </View>
      )}
      <Dado rotulo="Finalidade" valor={[ROTULO_FINALIDADE[f.finalidade], f.objeto].filter(Boolean).join(' · ')} />
      <Dado rotulo="Liberação" valor={`${doBanco(f.data_liberacao)} · ${formatarMoeda(Number(f.valor_liberado))}`} />
      <Dado rotulo="IOF e despesas" valor={Number(f.iof_valor) + Number(f.despesas_contratacao) > 0 ? `${formatarMoeda(Number(f.iof_valor))}${Number(f.iof_perc) ? ` (${formatarNumero(Number(f.iof_perc), 4)}%)` : ''} + ${formatarMoeda(Number(f.despesas_contratacao))} · ${f.encargos_descontados ? 'descontados do liberado' : 'pagos à parte'}` : null} />
      <Dado rotulo="Conta bancária" valor={f.lancar_liberacao ? um(f.banco)?.nome : 'Liberação não lançada (contrato antigo)'} />
      <Dado rotulo="Juros" valor={`${formatarNumero(Number(f.taxa_anual), 4)}% ao ano, ${f.juros_tipo === 'composto' ? 'compostos' : 'simples'} · ${formatarNumero(taxaMensal(Number(f.taxa_anual), f.juros_tipo), 4)}% ao mês · ano de ${f.base_dias} dias`} />
      <Dado rotulo="Juros da carência" valor={f.juros_carencia === 'fixos' && Number(f.carencia_cota) ? `${formatarMoeda(Number(f.carencia_cota))} em cada parcela` : null} />
      <Dado rotulo="Indexador" valor={f.indexador ? `${f.indexador}${Number(f.indexador_perc ?? 100) !== 100 ? ` · ${formatarNumero(Number(f.indexador_perc), Number.isInteger(Number(f.indexador_perc)) ? 0 : 2)}% do índice` : ''} · ${f.cm_ordem === 'separado' ? 'correção e juros separados' : 'juros sobre o saldo corrigido'}` : null} />
      <Dado rotulo="Parcela do contrato" valor={Number(f.parcela_fixa) ? `${formatarMoeda(Number(f.parcela_fixa))} (valor fixo informado)` : null} />
      <Dado rotulo="Sistema de cálculo" valor={`${ROTULO_SISTEMA[f.sistema]}${f.sistema === 'unico' ? '' : ` · ${f.parcelas_qtd} parcelas · ${PERIODICIDADES.find((p) => p.valor === f.periodicidade)?.rotulo.toLowerCase() ?? ''}${f.periodicidade === 'dias' ? `: ${f.periodicidade_dias} dias` : ''}`}`} />
      <Dado rotulo="Prazo" valor={f.prazo_dias != null ? `${formatarNumero(Number(f.prazo_dias))} dias` : null} />
      <Dado rotulo="Centro de custo" valor={um(f.centro) ? `${um(f.centro).codigo ?? ''} ${um(f.centro).nome}`.trim() : null} />

      {r.saldo > 0.005 &&
        (atualizar ? (
          <AtualizacaoContrato
            f={f}
            principal={Math.max(0, r.saldo)}
            ultimaPaga={r.pagas.length ? (r.pagas.map((p) => (um(p.titulo)?.data_vencimento ?? p.vencimento) as string).sort().pop() ?? null) : null}
            primeiraAberta={r.abertas.length ? (r.abertas.map((p) => (um(p.titulo)?.data_vencimento ?? p.vencimento) as string).sort()[0] ?? null) : null}
            abertas={r.abertas.length}
            aoFechar={() => setAtualizar(false)}
            aoGuardar={carregar}
          />
        ) : (
          <Botao titulo="Atualizar o contrato até uma data" tipo="secundario" onPress={() => setAtualizar(true)} />
        ))}

      <Secao titulo="Já pago" />
      <Dado rotulo="Principal" valor={formatarMoeda(r.pagoPrincipal)} />
      <Dado rotulo="Juros" valor={formatarMoeda(r.pagoJuros)} />
      <Dado rotulo="Variação monetária" valor={formatarMoeda(r.pagoVm)} />

      <Secao titulo="Parcelas" />
      <Text style={estilos.nota}>O pagamento (baixa) é dado em Financeiro › Contas a pagar. Toque numa parcela em aberto para ajustar juros, variação monetária ou vencimento.</Text>
      {podeRecalcular && !recalc && <Botao titulo="Recalcular as parcelas em aberto" tipo="secundario" onPress={abrirRecalculo} />}
      {podeRecalcular && recalc && (
        <View style={estilos.ajuste}>
          <CampoMoeda rotulo="Valor fixo da parcela (do contrato)" valor={rValor} aoMudar={setRValor} ajuda={`Vale para as ${emAberto.length} parcelas em aberto. As já pagas não mudam.`} />
          {pagaEmParte > 0 && <Text style={estilos.nota}>{pagaEmParte === 1 ? 'Uma parcela paga em parte fica' : `${pagaEmParte} parcelas pagas em parte ficam`} de fora do recálculo.</Text>}
          {previa.length > 0 && (
            <Text style={estilos.calculo}>
              {previa[0].numero}ª: principal {formatarMoeda(previa[0].principal)} + juros {formatarMoeda(previa[0].juros)}
              {previa.length > 1 ? `\n${previa[previa.length - 1].numero}ª: principal ${formatarMoeda(previa[previa.length - 1].principal)} + juros ${formatarMoeda(previa[previa.length - 1].juros)}` : ''}
              {`\nTotal de juros a pagar: ${formatarMoeda(r2(previa.reduce((t, x) => t + x.juros, 0)))}`}
            </Text>
          )}
          <Text style={estilos.nota}>Variação monetária e vencimentos já ajustados são mantidos.</Text>
          <Botao titulo="Recalcular e gravar" onPress={salvarRecalculo} carregando={salvando} />
          <Botao titulo="Cancelar" tipo="texto" onPress={() => setRecalc(false)} />
        </View>
      )}
      {r.ps.map((p) => {
        const t = um(p.titulo);
        const ePaga = paga(p);
        const emParte = !ePaga && Number(t?.valor_pago ?? 0) > 0;
        const valorP = Number(t?.valor ?? Number(p.principal) + Number(p.juros) + Number(p.vm ?? 0));
        return (
          <View key={p.id}>
            <Pressable onPress={() => (ePaga || emParte ? undefined : parcId === p.id ? setParcId(null) : abrirAjuste(p))} style={[estilos.parcela, ePaga && { opacity: 0.6 }]} accessibilityRole="button">
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={estilos.parcTitulo}>
                  {p.numero}ª · {doBanco(t?.data_vencimento ?? p.vencimento)}
                  {t?.numero ? ` · título nº ${t.numero}` : ''}
                </Text>
                <Text style={estilos.nota}>
                  Principal {formatarMoeda(Number(p.principal))} · Juros {formatarMoeda(Number(p.juros))}
                  {Number(p.vm) ? ` · V. monetária ${formatarMoeda(Number(p.vm))}` : ''}
                </Text>
                <Text style={[estilos.nota, ePaga && { color: cores.primaria, fontWeight: '700' }]}>{ePaga ? `Paga em ${doBanco(t.data_pagamento)}` : emParte ? `Paga em parte: ${formatarMoeda(Number(t.valor_pago))}` : 'Em aberto'}</Text>
              </View>
              <Text style={estilos.parcValor}>{formatarMoeda(valorP)}</Text>
            </Pressable>
            {parcId === p.id && (
              <View style={estilos.ajuste}>
                <CampoData rotulo="Vencimento" valor={aVenc} aoMudar={setAVenc} />
                <View style={estilos.linha}>
                  <View style={{ flex: 1 }}>
                    <CampoMoeda rotulo="Juros" valor={aJuros} aoMudar={setAJuros} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CampoMoeda rotulo="Variação monetária" valor={aVm} aoMudar={setAVm} />
                  </View>
                </View>
                <Text style={estilos.calculo}>Parcela: {formatarMoeda(r2(Number(p.principal) + (n(aJuros) ?? 0) + (n(aVm) ?? 0)))} (principal {formatarMoeda(Number(p.principal))}, que não muda)</Text>
                <Botao titulo="Salvar o ajuste" onPress={salvarAjuste} carregando={salvando} />
              </View>
            )}
          </View>
        );
      })}

      <Dado rotulo="Observações" valor={f.observacoes} />
      {!temPagamento && <Botao titulo="Alterar o contrato (refaz as parcelas)" tipo="secundario" onPress={() => aoAlterar(id)} />}
      <Botao titulo="Excluir financiamento" tipo="perigo" onPress={excluir} />
    </>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || '—'}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { minWidth: 130, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  contas: { gap: 8 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  calculo: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '700', lineHeight: 20 },
  vazio: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  tabela: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  tabelaTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  cab: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: cores.borda, paddingBottom: 4 },
  lin: { flexDirection: 'row', paddingVertical: 3 },
  cel: { flex: 1, fontSize: tam.pequeno, color: cores.texto, textAlign: 'right' },
  celCab: { fontWeight: '700', color: cores.textoSuave },
  celNum: { flex: 0, width: 26, textAlign: 'left' },
  celData: { flex: 0, width: 82, textAlign: 'left' },
  pulo: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center', paddingVertical: 2 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  rotuloCartao: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  totalCartao: { fontSize: tam.subtitulo + 4, fontWeight: '800', color: cores.cafe },
  parcela: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  parcTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  parcValor: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  ajuste: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 10, marginTop: 6 },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1.4, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
