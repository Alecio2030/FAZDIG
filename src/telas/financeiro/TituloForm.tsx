import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import AbasTela from '../../componentes/AbasTela';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import EntradaDocumento from '../../componentes/EntradaDocumento';
import PagarTitulos from './PagarTitulos';
import ConsultaTitulos from './ConsultaTitulos';
import { useSessao } from '../../contexto/SessaoContext';
import { ADM, centroDaUnidade, ehParticular, idUnidade, nomeUnidade, opcoesUnidade, valorUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo, somenteDigitos } from '../../lib/formatos';
import { chaveNfeValida, codigoBarras, type LeituraNota } from '../../lib/notaFiscal';
import { abrirFotoDocumento, fornecedorPeloDocumento } from '../../lib/documentos';
import { perguntar } from '../../lib/perguntar';
import { listaTiposTitulo } from '../../lib/classificacao';
import { somarDias } from '../../lib/reproducao';
import { r2, textoCompetencia, textosTitulo, type TipoTitulo } from '../../lib/titulos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

export type AbaTitulo = 'lancar' | 'pagar' | 'consultar';
type Rateio = { chave: string; centroId: string | null; perc: string };
type Parcela = { chave: string; venc: string; valor: string };

let cont = 0;
const chave = () => `t${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);

/** Financeiro › Contas a pagar e Contas a receber (param. "tipo"): Lançar (título novo ou alterar) | Pagar (dar baixa) | Consultar (só mostra). */
export default function TituloForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'TituloForm'>>();
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const fid = fazendaAtiva?.id;
  const tipo: TipoTitulo = params?.tipo ?? 'pagar';
  // De quem é a despesa/receita: uma fazenda ou a Administração (sede). O título em si é do Grupo.
  const [unidade, setUnidade] = useState<string>(modoAdm ? ADM : fid ?? ADM);
  // V137: no Particular, cada título diz de qual sócio é (os sócios são os centros de custo do Particular)
  const particular = ehParticular(idUnidade(unidade), fazendas);
  const tx = textosTitulo(tipo);

  const [aba, setAba] = useState<AbaTitulo>(params?.aba ?? 'lancar');
  const [tit, setTit] = useState<any>(null); // título aberto para alterar
  const [proximo, setProximo] = useState<number | null>(null);
  const [emissao, setEmissao] = useState(hojeBR());
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [documento, setDocumento] = useState('');
  const [modo, setModo] = useState<string[]>(['unico']);
  const [valor, setValor] = useState('');
  const [nParc, setNParc] = useState('1');
  const [primeiro, setPrimeiro] = useState('');
  const [intervalo, setIntervalo] = useState('30');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [fim, setFim] = useState('');
  const [contaId, setContaId] = useState<string | null>(null);
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [linha, setLinha] = useState('');
  const [pix, setPix] = useState('');
  const [multa, setMulta] = useState('');
  const [juros, setJuros] = useState('');
  const [agendado, setAgendado] = useState('');
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [avisoDoc, setAvisoDoc] = useState<string | null>(null);

  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const id: string | null = tit?.id ?? null;
  const continua = modo[0] === 'continua';
  /** título de compra, de venda ou já com pagamento: pessoa, valor e classificação não mudam aqui */
  /** título que vem da colheita: serviço de máquina, fechamento dos colhedores ou vale */
  const daColheita = !!tit && (!!tit.colheita_id || !!tit.fech_colheita_id || !!tit.vale_colheita_id || !!tit.cafe_secagem_id || !!tit.cafe_pilagem_id || !!tit.cafe_movimento_id);
  const travado = !!tit && (!!tit.compra_id || !!tit.venda_id || !!tit.financiamento_id || daColheita || Number(tit.valor_pago) > 0);
  const total = n(valor) ?? 0;
  const somaRateio = rateio.reduce((s, x) => s + (n(x.perc) ?? 0), 0);
  const somaParcelas = parcelas.reduce((s, x) => s + (n(x.valor) ?? 0), 0);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Título nº ${tit.numero}` : tx.modulo });
  }, [navegacao, id, tit, tx.modulo]);

  const recarregarTopo = useCallback(async () => {
    if (!fid) return;
    // contas contínuas: garante os títulos até o mês que vem
    await supabase.rpc('gerar_recorrentes', { p_fazenda: fid });
    const { data: u } = await supabase.from('lancamentos').select('numero').eq('tipo', tipo).order('numero', { ascending: false }).limit(1);
    setProximo(((u?.[0]?.numero as number) ?? 0) + 1);
  }, [fid, tipo]);
  useEffect(() => {
    recarregarTopo();
  }, [recarregarTopo]);

  // ---- parcelas: geradas pelo valor, nº, 1º vencimento e intervalo ----
  const manterParcelas = useRef(false); // vencimentos lidos do documento: ficam até a pessoa mexer
  useEffect(() => {
    if (id || continua) return;
    if (manterParcelas.current) {
      manterParcelas.current = false;
      return;
    }
    const q = Math.max(1, Math.min(60, Number(nParc) || 1));
    const base = paraBanco(primeiro);
    if (!base || total <= 0) return setParcelas([]);
    const cada = Math.floor((total / q) * 100) / 100;
    const ultima = r2(total - cada * (q - 1));
    setParcelas(Array.from({ length: q }, (_, i) => ({ chave: chave(), venc: doBanco(somarDias(base, i * (Number(intervalo) || 30))), valor: moedaParaCampo(i === q - 1 ? ultima : cada) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nParc, primeiro, intervalo, total, id, continua]);

  // ---- listas ----
  // O que é este título, em linguagem do dia a dia: a conta do plano vem dos bastidores (lib/classificacao).
  // Título antigo com uma conta fora da lista continua aparecendo, com o nome da conta.
  const carregarContas = useCallback(async (): Promise<ItemLista[]> => {
    const lista = await listaTiposTitulo(tipo);
    if (contaId && !lista.some((x) => x.id === contaId)) {
      const { data: c } = await supabase.from('plano_contas').select('id, nome').eq('id', contaId).maybeSingle();
      if (c) lista.push({ id: c.id, titulo: c.nome, oculto: true });
    }
    return lista;
  }, [tipo, contaId]);
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, idUnidade(unidade), particular)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [unidade, particular]);
  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }));
  }, []);

  // ---- entrada pela foto do documento (boleto, conta de consumo, recibo) ----
  async function aplicarDocumento(d: LeituraNota & { multa_perc?: number | null; juros_mes_perc?: number | null; juros_dia_valor?: number | null }, arq: string | null) {
    if (!fid) return;
    setErro(null);
    setAviso(null);
    const atencao: string[] = [];
    const faltou: string[] = [...(d.nao_lido ?? [])];
    const cb = codigoBarras(d.codigo_barras);
    if (cb) {
      const [{ data: jaT }, { data: jaC }] = await Promise.all([
        supabase.from('lancamentos').select('numero').eq('codigo_barras', cb).limit(1),
        supabase.from('compras').select('numero').eq('codigo_barras', cb).limit(1),
      ]);
      if (jaT?.length) return setErro(`Este boleto/documento (mesmo código de barras) já está no título nº ${jaT[0].numero}.`);
      if (jaC?.length) return setErro(`Este documento já foi lançado na compra nº ${jaC[0].numero}: o título dele já está no contas a pagar.`);
    }
    if (d.tipo_documento === 'cte' || (chaveNfeValida(d.chave) && (d.itens ?? []).length > 0 && d.tipo_documento !== 'conta_consumo')) {
      const seguir = await perguntar(
        d.tipo_documento === 'cte' ? 'Conhecimento de transporte' : 'Nota fiscal de produto',
        'Este documento é lançado em Mais › Compras (entra no estoque e no custo) e o contas a pagar sai de lá. Lançar aqui só como conta a pagar?',
        'Lançar aqui',
        'Voltar',
      );
      if (!seguir) return;
    }
    const forn = await fornecedorPeloDocumento(d.emitente?.nome, d.emitente?.cnpj_cpf);
    if (forn.aviso) atencao.push(forn.aviso);
    const itens = d.itens ?? [];
    const descr =
      d.tipo_documento === 'conta_consumo' ? `Conta de consumo${d.emitente?.nome ? ` – ${d.emitente.nome}` : ''}` : itens.length === 1 ? itens[0].descricao : itens.length > 1 ? `${itens[0].descricao} e outros` : d.emitente?.nome ?? '';
    const dups = (d.duplicatas ?? []).filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.vencimento)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const somaDup = dups.reduce((t, x) => t + (Number(x.valor) || 0), 0);
    const vTotal = d.valor_total ?? (somaDup > 0 ? r2(somaDup) : itens.reduce((t, x) => t + (x.valor_total ?? 0), 0) || null);
    const hoje = paraBanco(hojeBR())!;

    setTit(null);
    setModo(['unico']);
    setPessoaId(forn.id);
    setDescricao(descr.slice(0, 120));
    setDocumento([d.numero, d.serie ? `série ${d.serie}` : null].filter(Boolean).join(' '));
    if (d.data_emissao && d.data_emissao <= hoje) setEmissao(doBanco(d.data_emissao));
    else faltou.push('data de emissão');
    setValor(vTotal ? moedaParaCampo(vTotal) : '');
    if (!vTotal) faltou.push('valor');
    if (dups.length) {
      let valores = dups.map((x) => Number(x.valor) || 0);
      if (vTotal && Math.abs(somaDup - vTotal) >= 0.05) {
        const cada = r2(vTotal / dups.length);
        valores = dups.map((_, i) => (i === dups.length - 1 ? r2(vTotal - cada * (dups.length - 1)) : cada));
        if (dups.length > 1) atencao.push('os valores das parcelas não fecharam com o total: as datas foram mantidas e o valor dividido igualmente, confira');
      }
      manterParcelas.current = true;
      setNParc(String(dups.length));
      setPrimeiro(doBanco(dups[0].vencimento));
      setParcelas(dups.map((x, i) => ({ chave: chave(), venc: doBanco(x.vencimento), valor: moedaParaCampo(valores[i]) })));
    } else {
      setNParc('1');
      setPrimeiro('');
      faltou.push('vencimento');
    }
    setLinha(cb ? somenteDigitos(d.codigo_barras ?? '') : '');
    if (d.codigo_barras && !cb) atencao.push('o código de barras não foi lido inteiro: digite a linha digitável, se quiser guardar');
    setMulta(d.multa_perc ? numeroParaCampo(d.multa_perc) : '');
    const jm = d.juros_mes_perc ?? (d.juros_dia_valor && vTotal ? r2((d.juros_dia_valor / vTotal) * 30 * 100) : null);
    setJuros(jm ? numeroParaCampo(jm) : '');
    setArquivo(arq);

    const partes = ['Documento lido.'];
    if (d.legivel === false) partes.push('Quase nada pôde ser lido: tire outra foto ou digite.');
    if (faltou.length) partes.push(`Não veio na leitura: ${[...new Set(faltou)].join(', ')}.`);
    if (atencao.length) partes.push(`Atenção: ${atencao.join('; ')}.`);
    partes.push('Confira, complete a classificação e grave.');
    setAvisoDoc(partes.join(' '));
  }

  // ---- abrir título para alterar ----
  async function abrir(num: number) {
    if (!fid) return;
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const t = await consulta<any>(
        supabase.from('lancamentos').select('*, rateio:lancamento_rateios ( centro_custo_id, percentual ), compra:compras ( numero ), venda:vendas ( numero )').eq('tipo', tipo).eq('numero', num).maybeSingle(),
      );
      if (!t) {
        setCarregando(false);
        return setAlterarErro(`Não há título nº ${num}.`);
      }
      if (t.situacao === 'pago') {
        setCarregando(false);
        const m = `O título nº ${num} já está ${tx.pago}. Para alterar, estorne o ${tx.pagamento} na aba ${tx.abaBaixa}.`;
        if (params?.numero === num) setErro(m); // veio da Consulta: a caixinha de alterar está fechada
        return setAlterarErro(m);
      }
      setTit(t);
      setUnidade(valorUnidade(t.fazenda_id));
      setEmissao(doBanco(t.data_emissao));
      setPessoaId(t.pessoa_id);
      setDescricao(t.descricao ?? '');
      setDocumento(t.documento ?? '');
      setValor(moedaParaCampo(t.valor));
      setPrimeiro(doBanco(t.data_vencimento));
      setContaId(t.conta_contabil_id);
      setRateio(((t.rateio as any[]) ?? []).map((x) => ({ chave: chave(), centroId: x.centro_custo_id, perc: numeroParaCampo(x.percentual) })));
      setBancoId(t.conta_bancaria_id);
      setLinha(t.linha_digitavel ?? t.codigo_barras ?? '');
      setPix(t.pix_copia_cola ?? '');
      setMulta(t.multa_perc != null ? numeroParaCampo(t.multa_perc) : '');
      setJuros(t.juros_mes_perc != null ? numeroParaCampo(t.juros_mes_perc) : '');
      setAgendado(t.agendado_para ? doBanco(t.agendado_para) : '');
      setObs(t.observacoes ?? '');
      setArquivo(t.arquivo_documento ?? null);
      setAvisoDoc(null);
      setAlterarAberto(false);
      setAlterarNum('');
      setAlterarErro(null);
      setErros({});
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setCarregando(false);
  }
  function abrirPorNumero() {
    setAlterarErro(null);
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m) return setAlterarErro('Digite o número do título.');
    abrir(Number(m[1]));
  }
  useEffect(() => {
    if (params?.numero && fid) abrir(params.numero);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.numero, fid]);

  function limpar() {
    setTit(null);
    setUnidade(modoAdm ? ADM : fid ?? ADM);
    setEmissao(hojeBR());
    setPessoaId(null);
    setDescricao('');
    setDocumento('');
    setModo(['unico']);
    setValor('');
    setNParc('1');
    setPrimeiro('');
    setIntervalo('30');
    setParcelas([]);
    setFim('');
    setContaId(null);
    setRateio([]);
    setBancoId(null);
    setLinha('');
    setPix('');
    setMulta('');
    setJuros('');
    setAgendado('');
    setObs('');
    setArquivo(null);
    setAvisoDoc(null);
    setErros({});
  }

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!descricao.trim()) e.descricao = 'Informe a descrição (o que é a conta).';
    if (!dataValida(emissao)) e.emissao = 'Informe a data de emissão.';
    if (total <= 0) e.valor = 'Informe o valor.';
    if (!dataValida(primeiro)) e.venc = id ? 'Informe o vencimento.' : continua ? 'Informe o primeiro vencimento.' : 'Informe o vencimento (o primeiro, se for parcelado).';
    if (!id && !continua && !e.venc && !e.valor) {
      if (!parcelas.length || parcelas.some((p) => !dataValida(p.venc) || (n(p.valor) ?? 0) <= 0)) e.parcelas = 'Confira o vencimento e o valor de cada parcela.';
      else if (Math.abs(somaParcelas - total) > 0.009) e.parcelas = `As parcelas somam ${formatarMoeda(somaParcelas)} e o valor é ${formatarMoeda(total)}.`;
    }
    if (continua && fim && !dataValida(fim)) e.fim = 'Data inválida.';
    else if (continua && fim && paraBanco(fim)! < paraBanco(primeiro)!) e.fim = 'O último mês não pode ser antes do primeiro vencimento.';
    if (!travado && particular && !rateio.length) e.rateio = 'Diga de qual sócio é (toque em "+ De qual sócio").';
    if (!travado && rateio.length) {
      if (rateio.some((x) => !x.centroId)) e.rateio = particular ? 'Escolha o sócio de cada linha.' : 'Escolha o centro de custo de cada linha do rateio.';
      else if (new Set(rateio.map((x) => x.centroId)).size !== rateio.length) e.rateio = 'Há centro de custo repetido no rateio.';
      else if (Math.abs(somaRateio - 100) > 0.001) e.rateio = `O rateio soma ${formatarNumero(somaRateio, 2)}%: precisa fechar 100%.`;
    }
    const digitos = somenteDigitos(linha);
    const cb = digitos ? codigoBarras(digitos) : null;
    if (digitos && !cb) e.linha = 'Linha digitável incompleta: são 47 números (boleto) ou 48 (conta de consumo).';
    if (multa.trim() && (n(multa) == null || n(multa)! < 0)) e.multa = 'Multa inválida.';
    if (juros.trim() && (n(juros) == null || n(juros)! < 0)) e.juros = 'Juros inválidos.';
    if (agendado && !dataValida(agendado)) e.agendado = 'Data inválida.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    const p: Record<string, unknown> = {
      id,
      tipo,
      // título travado (compra, venda, colheita, financiamento) fica na unidade dele
      fazenda_id: travado ? tit.fazenda_id ?? null : idUnidade(unidade),
      pessoa_id: pessoaId,
      descricao,
      documento,
      conta_contabil_id: contaId,
      conta_bancaria_id: bancoId,
      data_emissao: paraBanco(emissao),
      valor: total,
      data_vencimento: paraBanco(primeiro),
      codigo_barras: cb ?? '',
      linha_digitavel: digitos,
      pix_copia_cola: pix.trim(),
      multa_perc: multa.trim() ? n(multa) : '',
      juros_mes_perc: juros.trim() ? n(juros) : '',
      agendado_para: agendado ? paraBanco(agendado) : '',
      arquivo_documento: arquivo ?? '',
      observacoes: obs,
      rateio: rateio.map((x) => ({ centro_custo_id: x.centroId, percentual: n(x.perc) })),
    };
    if (!id && continua) {
      p.continua = true;
      p.fim = fim ? paraBanco(fim) : '';
    } else if (!id) {
      p.parcelas = parcelas.map((x) => ({ vencimento: paraBanco(x.venc), valor: n(x.valor) }));
    }
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_titulo', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { ids: string[]; numero: number };
    if (id && params?.numero && voltarDaConsulta(navegacao, String(params.numero), false)) return;
    setAviso(
      id
        ? `Título nº ${res.numero} alterado.`
        : continua
          ? `Conta contínua gravada: título nº ${res.numero} e os dos meses seguintes (até o mês que vem) já estão no ${tx.modulo.toLowerCase()}. Todo mês entra o próximo, com o valor previsto.`
          : parcelas.length > 1
            ? `${parcelas.length} parcelas gravadas, a partir do título nº ${res.numero}: ${formatarMoeda(total)}.`
            : `Título nº ${res.numero} gravado: ${formatarMoeda(total)}, vence ${primeiro}.`,
    );
    limpar();
    recarregarTopo();
  }

  function excluir() {
    Alert.alert('Excluir título', `Excluir o título nº ${tit.numero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_titulo', { p_id: id }), 'id', String(id));
          if (error) return setErro(traduzirErro(error));
          if (params?.numero && voltarDaConsulta(navegacao, String(params.numero), true)) return;
          setAviso(`Título nº ${tit.numero} excluído.`);
          limpar();
          recarregarTopo();
        },
      },
    ]);
  }

  async function encerrarContinua() {
    const mes = textoCompetencia(tit.competencia);
    const ok = await perguntar('Encerrar conta contínua', `O último mês desta conta passa a ser ${mes}. Os títulos dos meses seguintes que ainda não têm pagamento são apagados, e não entram novos. Encerrar?`, 'Encerrar', 'Voltar');
    if (!ok) return;
    const { data: q, error } = await supabase.rpc('encerrar_recorrencia', { p_id: tit.recorrencia_id, p_ultimo_mes: `${tit.competencia}-01` });
    if (error) return setErro(traduzirErro(error));
    setAviso(`Conta contínua encerrada em ${mes}.${Number(q) ? ` ${q} ${Number(q) === 1 ? 'título futuro apagado' : 'títulos futuros apagados'}.` : ''}`);
    limpar();
    recarregarTopo();
  }

  const abas = (
    <AbasTela
      opcoes={[
        { valor: 'lancar', rotulo: 'Lançar' },
        { valor: 'pagar', rotulo: tx.abaBaixa },
        { valor: 'consultar', rotulo: 'Consultar' },
      ]}
      valor={[aba]}
      aoMudar={(v) => setAba(v[0] as AbaTitulo)}
    />
  );
  if (aba === 'pagar') {
    return (
      <Tela>
        {abas}
        <PagarTitulos tipo={tipo} />
      </Tela>
    );
  }
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaTitulos tipo={tipo} />
      </Tela>
    );
  }
  if (carregando) {
    return (
      <Tela>
        {abas}
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 24 }} />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Título nº</Text>
          <Text style={estilos.numeroValor}>{id ? tit.numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data de emissão *" valor={emissao} aoMudar={setEmissao} erro={erros.emissao} />
        </View>
      </View>

      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair deste título e lançar um novo
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar o título nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar um título já lançado
        </Text>
      )}

      {!id && !tx.receber && (
        <EntradaDocumento
          titulo="Entrada pelo documento"
          tipo="nota_fiscal"
          rotuloFoto="Foto do boleto ou da conta"
          instrucao="Enquadre o boleto, a conta de luz/água/telefone ou o recibo inteiro, com boa luz."
          dica="A leitura traz fornecedor, valor, vencimento, código de barras, multa e juros. Nada é gravado sem o seu Gravar. Nota de mercadoria é lançada em Compras: o título sai de lá."
          aoLer={(d, arq) => aplicarDocumento(d, arq)}
          aoErro={setErro}
        />
      )}
      {avisoDoc && <Aviso tipo="info" texto={avisoDoc} />}
      {arquivo && (
        <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(arquivo)) && setErro('Não foi possível abrir a foto do documento.')}>
          📷 Ver a foto do documento
        </Text>
      )}

      {id && tit.compra_id && <Aviso tipo="info" texto={`Título da compra nº ${(Array.isArray(tit.compra) ? tit.compra[0] : tit.compra)?.numero ?? ''}: fornecedor, valor e classificação se alteram na compra. Aqui mudam o vencimento, o boleto, os encargos, o agendamento e as observações.`} />}
      {id && tit.venda_id && <Aviso tipo="info" texto={`Título da venda nº ${(Array.isArray(tit.venda) ? tit.venda[0] : tit.venda)?.numero ?? ''}: comprador, valor e classificação vêm da venda (para mudar, exclua a venda e lance de novo). Aqui mudam o vencimento, os encargos e as observações.`} />}
      {id && tit.financiamento_id && <Aviso tipo="info" texto="Título de financiamento: valor, juros e variação monetária se ajustam em Financeiro › Financiamentos › Consultar › toque na parcela. Aqui mudam o boleto, os encargos por atraso, o agendamento e as observações." />}
      {id && daColheita && <Aviso tipo="info" texto={`Título do café (${tit.fech_colheita_id ? 'fechamento do pagamento dos colhedores' : tit.vale_colheita_id ? 'vale da colheita' : tit.cafe_secagem_id ? 'serviço de secagem' : tit.cafe_pilagem_id ? 'serviço de pilagem' : tit.cafe_movimento_id ? 'taxa de armazenagem' : 'serviço de máquina da colheita'}): pessoa, valor e classificação vêm de ${tit.cafe_movimento_id ? 'Agrícola › Armazém de café' : tit.cafe_secagem_id || tit.cafe_pilagem_id ? 'Agrícola › Secagem e pilagem' : 'Agrícola › Colheitas'}. Aqui mudam o vencimento, os encargos, o agendamento e as observações.`} />}
      {id && !tit.compra_id && !tit.venda_id && !tit.financiamento_id && !daColheita && Number(tit.valor_pago) > 0 && <Aviso tipo="info" texto={`Título com ${tx.pagamento} de ${formatarMoeda(Number(tit.valor_pago))}: o valor e a classificação não mudam mais. Aqui mudam o vencimento do saldo, o boleto, os encargos, o agendamento e as observações.`} />}
      {id && tit.previsto && <Aviso tipo="info" texto="Valor previsto da conta contínua. Quando a conta do mês chegar, corrija o valor aqui e salve: o título deixa de ser previsto." />}

      {travado ? (
        <View style={estilos.resumo}>
          <Text style={estilos.resumoTitulo}>{descricao || 'Título'}</Text>
          <Text style={estilos.nota}>
            {[documento ? `Doc. ${documento}` : null, tit.financiamento_id && !tit.fazenda_id ? 'Fazenda da despesa a informar' : nomeUnidade(tit.fazenda_id, fazendas), `Valor ${formatarMoeda(total)}`, Number(tit.valor_pago) > 0 ? `saldo ${formatarMoeda(r2(total - Number(tit.valor_pago)))}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : (
        <>
          <Escolha
            rotulo={tx.receber ? 'De quem é esta receita *' : 'De quem é esta despesa *'}
            opcoes={opcoesUnidade(fazendas)}
            valor={[unidade]}
            aoMudar={(v) => {
              if (v[0] !== unidade) setRateio([]);
              setUnidade(v[0]);
            }}
          />
          <CampoPessoaBusca rotulo={tx.pessoa} valorId={pessoaId} aoMudar={setPessoaId} tipoNovo={tx.tipoPessoa} />
          <Campo rotulo="Descrição *" value={descricao} onChangeText={setDescricao} autoCapitalize="sentences" placeholder={tx.receber ? 'Ex.: Arrendamento de pasto, serviço de trator' : 'Ex.: Energia do poço, mão de obra da colheita'} erro={erros.descricao} />
          <Campo rotulo="Nº do documento" value={documento} onChangeText={setDocumento} autoCapitalize="characters" />
        </>
      )}

      {/* ---------- valor e vencimento ---------- */}
      <Secao titulo="Valor e vencimento" />
      {!id && (
        <Escolha
          rotulo="Como é esta conta"
          opcoes={[
            { valor: 'unico', rotulo: 'Uma vez / parcelada' },
            { valor: 'continua', rotulo: 'Contínua (todo mês)' },
          ]}
          valor={modo}
          aoMudar={setModo}
        />
      )}
      {!id && continua && <Text style={estilos.nota}>Conta que se repete todo mês ({tx.receber ? 'arrendamento, aluguel recebido' : 'energia, internet, salário, aluguel'}): entra um título por mês, no mesmo dia, com o valor previsto. Quando a conta do mês chegar, você corrige o valor.</Text>}
      {!travado && <CampoMoeda rotulo={continua && !id ? 'Valor deste mês (e previsto dos próximos) *' : 'Valor (R$) *'} valor={valor} aoMudar={setValor} erro={erros.valor} />}
      {id ? (
        <>
          <CampoData rotulo={Number(tit.valor_pago) > 0 ? 'Vencimento do saldo *' : 'Vencimento *'} valor={primeiro} aoMudar={setPrimeiro} erro={erros.venc} />
          {tit.vencimento_original && tit.vencimento_original !== paraBanco(primeiro) && <Text style={estilos.nota}>Vencimento original: {doBanco(tit.vencimento_original)}</Text>}
        </>
      ) : continua ? (
        <>
          <CampoData rotulo="Primeiro vencimento * (o dia se repete todo mês)" valor={primeiro} aoMudar={setPrimeiro} erro={erros.venc} />
          <CampoData rotulo="Último mês (em branco = sem data para acabar)" valor={fim} aoMudar={setFim} erro={erros.fim} />
        </>
      ) : (
        <>
          <View style={estilos.linha}>
            <View style={{ width: 86 }}>
              <Campo rotulo="Parcelas" value={nParc} onChangeText={(t) => setNParc(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <CampoData rotulo={Number(nParc) > 1 ? '1º vencimento *' : 'Vencimento *'} valor={primeiro} aoMudar={setPrimeiro} erro={erros.venc} />
            </View>
            {Number(nParc) > 1 && (
              <View style={{ width: 96 }}>
                <Campo rotulo="A cada (dias)" value={intervalo} onChangeText={(t) => setIntervalo(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
              </View>
            )}
          </View>
          {parcelas.length > 1 &&
            parcelas.map((x, k) => (
              <View key={x.chave} style={estilos.linha}>
                <Text style={estilos.parcNum}>{k + 1}ª</Text>
                <View style={{ flex: 1 }}>
                  <CampoData rotulo="Vencimento" valor={x.venc} aoMudar={(t) => setParcelas((l) => l.map((y) => (y.chave === x.chave ? { ...y, venc: t } : y)))} />
                </View>
                <View style={{ flex: 1 }}>
                  <CampoMoeda rotulo="Valor" valor={x.valor} aoMudar={(t) => setParcelas((l) => l.map((y) => (y.chave === x.chave ? { ...y, valor: t } : y)))} />
                </View>
              </View>
            ))}
          {parcelas.length > 1 && <Text style={[estilos.soma, Math.abs(somaParcelas - total) > 0.009 && { color: cores.erro }]}>Parcelas somam {formatarMoeda(somaParcelas)}</Text>}
          {erros.parcelas && <Text style={estilos.erro}>{erros.parcelas}</Text>}
        </>
      )}

      {/* ---------- classificação ---------- */}
      {!travado && (
        <>
          <Secao titulo="Classificação" />
          <SeletorLista rotulo={tx.receber ? 'O que é esta receita' : 'O que é esta conta'} valorId={contaId} aoMudar={setContaId} carregar={carregarContas} permitirLimpar dicaBusca={tx.receber ? 'Ex.: arrendamento, leite' : 'Ex.: energia, seguro, financiamento'} vazio="Nenhum tipo cadastrado." />
          <Text style={estilos.subtitulo}>{particular ? 'De qual sócio é' : 'Rateio por centro de custo'}</Text>
          {particular && <Text style={estilos.nota}>Particular dos sócios: não entra no resultado das fazendas; vai ao Patrimônio Líquido{tx.receber ? ' como receita do sócio' : ' como despesa do sócio'}.</Text>}
          {rateio.map((x) => (
            <View key={x.chave} style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <SeletorLista rotulo={particular ? 'Sócio' : 'Centro de custo'} valorId={x.centroId} aoMudar={(v) => setRateio((l) => l.map((y) => (y.chave === x.chave ? { ...y, centroId: v } : y)))} carregar={carregarCentros} vazio={particular ? 'Nenhum sócio cadastrado neste Particular. Cadastre em Mais › Fazendas › Consultar › toque no Particular.' : 'Nenhum centro de custo. Cadastre em Financeiro › Centros de custo.'} />
              </View>
              <View style={{ width: 80 }}>
                <Campo rotulo="%" value={x.perc} onChangeText={(t) => setRateio((l) => l.map((y) => (y.chave === x.chave ? { ...y, perc: t } : y)))} keyboardType="decimal-pad" />
              </View>
              <Pressable onPress={() => setRateio((l) => l.filter((y) => y.chave !== x.chave))} hitSlop={8} style={{ paddingTop: 26 }} accessibilityLabel="Tirar centro">
                <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
              </Pressable>
            </View>
          ))}
          <View style={estilos.linhaEntre}>
            <Text style={estilos.link} onPress={() => setRateio((l) => [...l, { chave: chave(), centroId: null, perc: numeroParaCampo(r2(Math.max(0, 100 - somaRateio))) }])}>
              + {particular ? (rateio.length ? 'Dividir com outro sócio' : 'De qual sócio') : 'Centro de custo'}
            </Text>
            {rateio.length > 0 && <Text style={[estilos.soma, Math.abs(somaRateio - 100) > 0.001 && { color: cores.erro }]}>Soma {formatarNumero(somaRateio, 2)}%</Text>}
          </View>
          {erros.rateio && <Text style={estilos.erro}>{erros.rateio}</Text>}
        </>
      )}

      {/* ---------- pagamento ---------- */}
      <Secao titulo={`Para ${tx.pagar}`} />
      <SeletorLista rotulo="Conta bancária / caixa prevista" valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} permitirLimpar vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />
      {!tx.receber && (
        <>
          <Campo rotulo="Linha digitável do boleto" value={linha} onChangeText={(t) => setLinha(t.replace(/[^\d .]/g, ''))} keyboardType="number-pad" erro={erros.linha} placeholder="47 ou 48 números" />
          <Campo rotulo="Pix copia e cola" value={pix} onChangeText={setPix} autoCapitalize="none" autoCorrect={false} />
        </>
      )}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Multa por atraso (%)" value={multa} onChangeText={setMulta} keyboardType="decimal-pad" erro={erros.multa} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Juros (% ao mês)" value={juros} onChangeText={setJuros} keyboardType="decimal-pad" erro={erros.juros} />
        </View>
      </View>
      {!tx.receber && <CampoData rotulo="Agendado no banco para (se já agendou)" valor={agendado} aoMudar={setAgendado} erro={erros.agendado} />}
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={id ? 'Salvar alteração' : continua ? 'Gravar conta contínua' : 'Gravar título'} onPress={salvar} carregando={salvando} />
      {id && tit.recorrencia_id && <Botao titulo={`Encerrar esta conta contínua em ${textoCompetencia(tit.competencia)}`} tipo="secundario" onPress={encerrarContinua} />}
      {id && !tit.compra_id && !tit.venda_id && !daColheita && <Botao titulo="Excluir título" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linhaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  subtitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  soma: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  parcNum: { width: 28, paddingTop: 36, fontSize: tam.texto, fontWeight: '800', color: cores.textoSuave },
  resumo: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 4 },
  resumoTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
});
