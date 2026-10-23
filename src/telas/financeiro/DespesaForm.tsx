import React, { useCallback, useEffect, useRef, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
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
import { useSessao } from '../../contexto/SessaoContext';
import { ADM, NOME_ADM, centroDaUnidade, ehParticular, filtrarUnidade, idUnidade, nomeUnidade, opcoesUnidade, valorUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo, somenteDigitos } from '../../lib/formatos';
import { codigoBarras, type LeituraNota } from '../../lib/notaFiscal';
import { abrirFotoDocumento, fornecedorPeloDocumento } from '../../lib/documentos';
import { listaTiposDespesa, tiposLancamento } from '../../lib/classificacao';
import { perguntar } from '../../lib/perguntar';
import { somarDias } from '../../lib/reproducao';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Rateio = { chave: string; centroId: string | null; perc: string };
type Parcela = { chave: string; venc: string; valor: string };

let cont = 0;
const chave = () => `d${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);
const r2 = (x: number) => Math.round(x * 100) / 100;

type Props = {
  /** compra (tipo despesa) a abrir para alterar */
  abrirId?: string | null;
  /** avisa a tela de Compras que a despesa aberta foi fechada (gravada, excluída ou abandonada) */
  /** motivo (V149): 'gravou' ou 'excluiu', para quem abriu pela Consulta saber para onde voltar */
  aoFechar?: (motivo?: 'gravou' | 'excluiu' | 'saiu') => void;
};

/**
 * Compras › Despesa: aquisição SEM estoque (energia, serviço, manutenção, contador, seguro...).
 * Vai direto para a despesa e para o contas a pagar; se já foi paga, sai na hora do caixa ou do banco.
 * Ninguém escolhe conta do plano: escolhe o tipo da despesa, e a conta vem dos bastidores.
 */
export default function DespesaForm({ abrirId, aoFechar }: Props) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const fid = fazendaAtiva?.id;
  // De quem é a despesa: uma fazenda, o Administrativo ou o Particular. O contas a pagar e o pagamento são do Grupo.
  const [unidade, setUnidade] = useState<string>(modoAdm ? ADM : fid ?? ADM);
  // V137: no Particular, cada despesa diz de qual sócio é (os sócios são os centros de custo do Particular)
  const particular = ehParticular(idUnidade(unidade), fazendas);

  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [tipoDesp, setTipoDesp] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [documento, setDocumento] = useState('');
  const [valor, setValor] = useState('');
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [pagto, setPagto] = useState<string[]>(['pago']);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [nParc, setNParc] = useState('1');
  const [primeiro, setPrimeiro] = useState('');
  const [intervalo, setIntervalo] = useState('30');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [linha, setLinha] = useState('');
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [obs, setObs] = useState('');

  const [sugestao, setSugestao] = useState<string | null>(null);
  const [avisoDoc, setAvisoDoc] = useState<string | null>(null);
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const pago = pagto[0] === 'pago';
  const total = n(valor) ?? 0;
  const somaRateio = rateio.reduce((s, x) => s + (n(x.perc) ?? 0), 0);
  const somaParcelas = parcelas.reduce((s, x) => s + (n(x.valor) ?? 0), 0);

  const recarregarTopo = useCallback(async () => {
    if (!fid) return;
    const { data: u } = await supabase.from('compras').select('numero').order('numero', { ascending: false }).limit(1);
    setProximo(((u?.[0]?.numero as number) ?? 0) + 1);
  }, [fid]);
  useEffect(() => {
    recarregarTopo();
  }, [recarregarTopo]);

  // ---- parcelas (a pagar): geradas pelo valor, nº, 1º vencimento e intervalo ----
  const manterParcelas = useRef(false); // vencimentos lidos do documento ou da despesa aberta: ficam até a pessoa mexer
  useEffect(() => {
    if (pago || carregando) return;
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
  }, [nParc, primeiro, intervalo, total, pago, carregando]);

  // ---- listas ----
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, idUnidade(unidade), particular)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [unidade, particular]);
  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }));
  }, []);

  // ---- memória por fornecedor: a última despesa dele sugere o tipo, o centro de custo e o pagamento ----
  const semMemoria = useRef(false); // despesa aberta para alterar: não sugere por cima do que está gravado
  /** "como está a tela": por padrão o que a pessoa já preencheu; depois da foto, o que a leitura trouxe */
  async function escolherFornecedor(pid: string | null, tela?: { tipo: string | null; descricao: string; temRateio: boolean; banco: string | null; pagtoDefinido: boolean }) {
    const t0 = tela ?? { tipo: tipoDesp, descricao, temRateio: rateio.length > 0, banco: bancoId, pagtoDefinido: parcelas.length > 0 };
    setPessoaId(pid);
    setSugestao(null);
    if (!pid || !fid || id || semMemoria.current) return;
    try {
      const { data: ult } = await filtrarUnidade(
        supabase
          .from('compras')
          .select('tipo_despesa, conta_bancaria_id, pago_na_hora, itens:compra_itens ( descricao ), rateio:compra_rateios ( centro_custo_id, percentual )'),
        unidade,
      )
        .eq('tipo', 'despesa')
        .eq('pessoa_id', pid)
        .order('created_at', { ascending: false })
        .limit(1);
      const u = ult?.[0] as any;
      if (!u?.tipo_despesa) return;
      const nomeTipo = (await tiposLancamento()).find((t) => t.chave === u.tipo_despesa)?.nome;
      if (!nomeTipo) return;
      const usou: string[] = [];
      if (!t0.tipo) {
        setTipoDesp(u.tipo_despesa);
        usou.push(nomeTipo);
      }
      const descAnt = (u.itens as any[])?.[0]?.descricao as string | undefined;
      if (!t0.descricao.trim() && descAnt && descAnt !== nomeTipo) setDescricao(descAnt);
      if (!t0.temRateio && (u.rateio as any[])?.length) {
        setRateio((u.rateio as any[]).map((x) => ({ chave: chave(), centroId: x.centro_custo_id, perc: numeroParaCampo(x.percentual) })));
        usou.push('centro de custo');
      }
      if (!t0.banco && u.conta_bancaria_id) {
        setBancoId(u.conta_bancaria_id);
        usou.push('conta de pagamento');
      }
      if (!t0.pagtoDefinido) setPagto([u.pago_na_hora ? 'pago' : 'prazo']);
      if (usou.length) setSugestao(`Sugerido pela última despesa deste fornecedor: ${usou.join(', ')}. Mude o que for diferente.`);
    } catch {
      /* sem sugestão: a tela segue em branco */
    }
  }

  // ---- entrada pela foto do documento (conta de luz, boleto, recibo, nota de serviço) ----
  async function aplicarDocumento(d: LeituraNota, arq: string | null) {
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
      if (jaC?.length) return setErro(`Este documento (mesmo código de barras) já foi lançado na compra nº ${jaC[0].numero}.`);
      if (jaT?.length) return setErro(`Este boleto/documento já está no título nº ${jaT[0].numero} do contas a pagar.`);
    }
    if (d.tipo_documento === 'cte') {
      const seguir = await perguntar('Conhecimento de transporte', 'Frete de mercadoria comprada é lançado em Produtos (ele entra no custo do produto). Lançar aqui só como despesa?', 'Lançar como despesa', 'Voltar');
      if (!seguir) return;
    }
    const forn = await fornecedorPeloDocumento(d.emitente?.nome, d.emitente?.cnpj_cpf);
    if (forn.aviso) atencao.push(forn.aviso);
    const itens = d.itens ?? [];
    const descr = d.tipo_documento === 'conta_consumo' ? '' : itens.length === 1 ? itens[0].descricao : itens.length > 1 ? `${itens[0].descricao} e outros` : '';
    const dups = (d.duplicatas ?? []).filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.vencimento)).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const somaDup = dups.reduce((t, x) => t + (Number(x.valor) || 0), 0);
    const vTotal = d.valor_total ?? (somaDup > 0 ? r2(somaDup) : itens.reduce((t, x) => t + (x.valor_total ?? 0), 0) || null);
    const hoje = paraBanco(hojeBR())!;

    limpar();
    if (d.data_emissao && d.data_emissao <= hoje) setData(doBanco(d.data_emissao));
    else faltou.push('data');
    setDescricao(descr.slice(0, 120));
    setDocumento([d.numero, d.serie ? `série ${d.serie}` : null].filter(Boolean).join(' '));
    setValor(vTotal ? moedaParaCampo(vTotal) : '');
    if (!vTotal) faltou.push('valor');
    const aVencer = dups.filter((x) => x.vencimento > hoje);
    if (dups.length && aVencer.length) {
      let valores = dups.map((x) => Number(x.valor) || 0);
      if (vTotal && Math.abs(somaDup - vTotal) >= 0.05) {
        const cada = r2(vTotal / dups.length);
        valores = dups.map((_, i) => (i === dups.length - 1 ? r2(vTotal - cada * (dups.length - 1)) : cada));
        if (dups.length > 1) atencao.push('os valores das parcelas não fecharam com o total: as datas foram mantidas e o valor dividido igualmente, confira');
      }
      manterParcelas.current = true;
      setPagto(['prazo']);
      setNParc(String(dups.length));
      setPrimeiro(doBanco(dups[0].vencimento));
      setParcelas(dups.map((x, i) => ({ chave: chave(), venc: doBanco(x.vencimento), valor: moedaParaCampo(valores[i]) })));
      atencao.push(`o documento vence ${doBanco(dups[0].vencimento)}: ficou "A pagar". Se já pagou, marque "Já paguei"`);
    } else {
      atencao.push('sem vencimento futuro no documento: ficou "Já paguei". Se ainda vai pagar, marque "A pagar" e informe o vencimento');
    }
    setLinha(cb ? somenteDigitos(d.codigo_barras ?? '') : '');
    setArquivo(arq);
    // o fornecedor por último: a memória dele sugere o tipo de despesa e o centro de custo
    await escolherFornecedor(forn.id, { tipo: null, descricao: descr, temRateio: false, banco: null, pagtoDefinido: true });

    const partes = ['Documento lido.'];
    if (d.legivel === false) partes.push('Quase nada pôde ser lido: tire outra foto ou digite.');
    if (faltou.length) partes.push(`Não veio na leitura: ${[...new Set(faltou)].join(', ')}.`);
    if (atencao.length) partes.push(`Atenção: ${atencao.join('; ')}.`);
    partes.push('Confira o tipo da despesa e grave. Nada é gravado sem o seu Gravar.');
    setAvisoDoc(partes.join(' '));
  }

  // ---- abrir despesa para alterar ----
  async function abrir(cid: string) {
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const c = await consulta<any>(
        supabase
          .from('compras')
          .select('*, itens:compra_itens ( descricao ), rateio:compra_rateios ( centro_custo_id, percentual ), parcelas:lancamentos ( valor, data_vencimento, parcela, linha_digitavel )')
          .eq('id', cid)
          .single(),
      );
      if (c.tipo !== 'despesa') {
        setCarregando(false);
        return setErro(`A compra nº ${c.numero} é de produtos: toque em "Produtos (estoque)" para alterar.`);
      }
      semMemoria.current = true;
      const tipoNome = (await tiposLancamento()).find((t) => t.chave === c.tipo_despesa)?.nome;
      const desc = (c.itens as any[])?.[0]?.descricao ?? '';
      setId(c.id);
      setUnidade(valorUnidade(c.fazenda_id));
      setNumero(c.numero);
      setData(doBanco(c.data));
      setPessoaId(c.pessoa_id);
      setTipoDesp(c.tipo_despesa);
      setDescricao(desc === tipoNome ? '' : desc);
      setDocumento(c.numero_documento ?? '');
      setValor(moedaParaCampo(c.valor_total));
      setRateio(((c.rateio as any[]) ?? []).map((x) => ({ chave: chave(), centroId: x.centro_custo_id, perc: numeroParaCampo(x.percentual) })));
      setBancoId(c.conta_bancaria_id);
      const ps = ((c.parcelas as any[]) ?? []).sort((a, b) => a.parcela - b.parcela);
      setPagto([c.pago_na_hora ? 'pago' : 'prazo']);
      if (!c.pago_na_hora && ps.length) {
        manterParcelas.current = true;
        setNParc(String(ps.length));
        setPrimeiro(doBanco(ps[0].data_vencimento));
        setParcelas(ps.map((x) => ({ chave: chave(), venc: doBanco(x.data_vencimento), valor: moedaParaCampo(x.valor) })));
      } else {
        setNParc('1');
        setPrimeiro('');
        setParcelas([]);
      }
      setLinha(ps[0]?.linha_digitavel ?? '');
      setArquivo(c.arquivo_documento ?? null);
      setObs(c.observacoes ?? '');
      setSugestao(null);
      setAvisoDoc(null);
      setErros({});
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setCarregando(false);
  }
  useEffect(() => {
    if (abrirId) abrir(abrirId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirId]);

  async function abrirPorNumero() {
    setAlterarErro(null);
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m || !fid) return setAlterarErro('Digite o número da compra.');
    const { data: c } = await supabase.from('compras').select('id, tipo').eq('numero', Number(m[1])).maybeSingle();
    if (!c) return setAlterarErro(`Não há compra nº ${m[1]}.`);
    if (c.tipo !== 'despesa') return setAlterarErro(`A compra nº ${m[1]} é de ${c.tipo === 'animais' ? 'animais' : 'produtos'}: não se altera aqui.`);
    setAlterarAberto(false);
    setAlterarNum('');
    abrir(c.id);
  }

  function limpar() {
    setUnidade(modoAdm ? ADM : fid ?? ADM);
    semMemoria.current = false;
    manterParcelas.current = false;
    setId(null);
    setNumero(null);
    setData(hojeBR());
    setPessoaId(null);
    setTipoDesp(null);
    setDescricao('');
    setDocumento('');
    setValor('');
    setRateio([]);
    setPagto(['pago']);
    setBancoId(null);
    setNParc('1');
    setPrimeiro('');
    setIntervalo('30');
    setParcelas([]);
    setLinha('');
    setArquivo(null);
    setObs('');
    setSugestao(null);
    setAvisoDoc(null);
    setErros({});
  }
  function sair() {
    limpar();
    aoFechar?.('saiu');
  }

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!data || !dataValida(data)) e.data = 'Informe a data da despesa.';
    if (!tipoDesp) e.tipo = 'Escolha o que é esta despesa.';
    if (total <= 0) e.valor = 'Informe o valor.';
    if (particular && !rateio.length) e.rateio = 'Diga de qual sócio é esta despesa (toque em "+ De qual sócio").';
    if (rateio.length) {
      if (rateio.some((x) => !x.centroId)) e.rateio = particular ? 'Escolha o sócio de cada linha.' : 'Escolha o centro de custo de cada linha.';
      else if (new Set(rateio.map((x) => x.centroId)).size !== rateio.length) e.rateio = 'Há centro de custo repetido.';
      else if (Math.abs(somaRateio - 100) > 0.001) e.rateio = `A divisão soma ${formatarNumero(somaRateio, 2)}%: precisa fechar 100%.`;
    }
    if (pago) {
      if (!bancoId) e.banco = 'Escolha o caixa ou o banco de onde saiu o dinheiro.';
    } else if (!dataValida(primeiro)) e.venc = Number(nParc) > 1 ? 'Informe o primeiro vencimento.' : 'Informe o vencimento.';
    else if (!e.valor) {
      if (!parcelas.length || parcelas.some((p) => !dataValida(p.venc) || (n(p.valor) ?? 0) <= 0)) e.parcelas = 'Confira o vencimento e o valor de cada parcela.';
      else if (Math.abs(somaParcelas - total) > 0.009) e.parcelas = `As parcelas somam ${formatarMoeda(somaParcelas)} e o valor é ${formatarMoeda(total)}.`;
    }
    const digitos = somenteDigitos(linha);
    const cb = digitos ? codigoBarras(digitos) : null;
    if (digitos && !cb) e.linha = 'Linha digitável incompleta: são 47 números (boleto) ou 48 (conta de consumo).';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    // despesa nova parecida com uma já gravada: pergunta antes
    if (!id && fid && pessoaId) {
      const doc = documento.trim();
      const [porDoc, porValor] = await Promise.all([
        doc ? supabase.from('compras').select('numero').eq('pessoa_id', pessoaId).eq('numero_documento', doc).limit(1) : Promise.resolve({ data: [] as any[] }),
        supabase.from('compras').select('numero').eq('pessoa_id', pessoaId).eq('data', paraBanco(data)).eq('valor_total', total).limit(1),
      ]);
      const igual = porDoc.data?.[0] ?? porValor.data?.[0];
      if (igual) {
        const motivo = porDoc.data?.length ? `com o documento ${doc} deste fornecedor` : `deste fornecedor, em ${data}, no valor de ${formatarMoeda(total)}`;
        const ok = await perguntar('Despesa repetida?', `Já existe a compra nº ${igual.numero} ${motivo}. Gravar mesmo assim?`, 'Gravar mesmo assim', 'Voltar');
        if (!ok) return;
      }
    }

    const p = {
      id,
      fazenda_id: idUnidade(unidade),
      data: paraBanco(data),
      pessoa_id: pessoaId,
      tipo_despesa: tipoDesp,
      descricao,
      numero_documento: documento,
      valor: total,
      pago,
      conta_bancaria_id: bancoId,
      rateio: rateio.map((x) => ({ centro_custo_id: x.centroId, percentual: n(x.perc) })),
      parcelas: pago ? [] : parcelas.map((x) => ({ vencimento: paraBanco(x.venc), valor: n(x.valor) })),
      codigo_barras: cb ?? '',
      linha_digitavel: digitos,
      arquivo_documento: arquivo ?? '',
      observacoes: obs,
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_despesa', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { id: string; numero: number; total: number; pago: boolean; baixa: string | null; parcelas: number };
    const destino = res.pago
      ? res.baixa === 'pendente'
        ? 'O pagamento ficou aguardando a confirmação do dono, em Contas a pagar.'
        : 'Já saiu do caixa/banco escolhido.'
      : res.parcelas > 1
        ? `${res.parcelas} parcelas lançadas no contas a pagar.`
        : `Lançada no contas a pagar, vence ${primeiro}.`;
    setAviso(`Despesa gravada na compra nº ${res.numero}: ${formatarMoeda(res.total)}. ${destino}`);
    limpar();
    aoFechar?.('gravou');
    recarregarTopo();
  }

  function excluir() {
    Alert.alert('Excluir despesa', `Excluir a compra nº ${numero}? Sai da despesa, do contas a pagar${pago ? ' e o pagamento volta para o caixa/banco' : ''}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_compra', { p_id: id }), 'compra_id', String(id));
          if (error) return setErro(traduzirErro(error));
          setAviso(`Compra nº ${numero} excluída.`);
          limpar();
          aoFechar?.('excluiu');
          recarregarTopo();
        },
      },
    ]);
  }

  if (carregando) return <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 24 }} />;

  return (
    <>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Compra nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>

      {id ? (
        <Text style={estilos.link} onPress={sair}>
          Sair desta despesa e lançar uma nova
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar a compra nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar uma despesa já lançada
        </Text>
      )}

      {!id && (
        <EntradaDocumento
          titulo="Entrada pelo documento"
          tipo="nota_fiscal"
          rotuloFoto="Foto da conta, boleto ou recibo"
          instrucao="Enquadre a conta de luz, o boleto, o recibo ou a nota de serviço inteira, com boa luz."
          dica="A leitura traz fornecedor, valor, data e vencimento, e o sistema sugere o tipo pela última despesa do fornecedor. Nada é gravado sem o seu Gravar."
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

      <CampoPessoaBusca rotulo="De quem (fornecedor)" valorId={pessoaId} aoMudar={(v) => escolherFornecedor(v)} tipoNovo="fornecedor" />
      {sugestao && <Text style={estilos.sugestao}>{sugestao}</Text>}
      <SeletorLista rotulo="O que é *" valorId={tipoDesp} aoMudar={setTipoDesp} carregar={listaTiposDespesa} erro={erros.tipo} dicaBusca="Ex.: energia, seguro, manutenção" vazio="Nenhum tipo de despesa cadastrado." />
      <Campo rotulo="Detalhe (opcional)" value={descricao} onChangeText={setDescricao} autoCapitalize="sentences" placeholder="Ex.: Conta de luz do poço, troca de pneu do trator" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoMoeda rotulo="Valor (R$) *" valor={valor} aoMudar={setValor} erro={erros.valor} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Nº do documento" value={documento} onChangeText={setDocumento} autoCapitalize="characters" />
        </View>
      </View>

      {/* ---------- para onde vai ---------- */}
      <Secao titulo="Para onde vai" />
      <Escolha
        rotulo="De quem é esta despesa *"
        opcoes={opcoesUnidade(fazendas)}
        valor={[unidade]}
        aoMudar={(v) => {
          if (v[0] !== unidade) setRateio([]);
          setUnidade(v[0]);
        }}
      />
      {rateio.length === 0 && !particular && <Text style={estilos.nota}>Sem escolher nada, fica como despesa geral {unidade === ADM ? `do ${NOME_ADM}` : `da ${nomeUnidade(idUnidade(unidade), fazendas)}`}. Para apontar um talhão, um lote ou dividir entre vários, adicione o centro de custo.</Text>}
      {particular && <Text style={estilos.nota}>Despesa particular: não entra no resultado das fazendas; vai ao Patrimônio Líquido como despesa do sócio. Diga de qual sócio é (ou divida entre eles).</Text>}
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
          + {particular ? (rateio.length ? 'Dividir com outro sócio' : 'De qual sócio') : rateio.length ? 'Dividir com outro centro de custo' : 'Talhão, lote ou outro centro de custo'}
        </Text>
        {rateio.length > 1 && <Text style={[estilos.soma, Math.abs(somaRateio - 100) > 0.001 && { color: cores.erro }]}>Soma {formatarNumero(somaRateio, 2)}%</Text>}
      </View>
      {erros.rateio && <Text style={estilos.erro}>{erros.rateio}</Text>}

      {/* ---------- pagamento ---------- */}
      <Secao titulo="Pagamento" />
      <Escolha
        opcoes={[
          { valor: 'pago', rotulo: 'Já paguei' },
          { valor: 'prazo', rotulo: 'A pagar' },
        ]}
        valor={pagto}
        aoMudar={setPagto}
      />
      {pago ? (
        <>
          <SeletorLista rotulo="De onde saiu o dinheiro *" valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} erro={erros.banco} vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />
          <Text style={estilos.nota}>Sai do caixa ou do banco na data da despesa. Não fica nada em aberto no contas a pagar.</Text>
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
          <SeletorLista rotulo="Conta bancária / caixa prevista" valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} permitirLimpar vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />
          <Campo rotulo="Linha digitável do boleto (opcional)" value={linha} onChangeText={(t) => setLinha(t.replace(/[^\d. ]/g, ''))} keyboardType="number-pad" erro={erros.linha} />
          <Text style={estilos.nota}>Fica em aberto em Financeiro › Contas a pagar. O pagamento (baixa) é dado lá.</Text>
        </>
      )}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />

      {!id && (
        <View style={estilos.dicas}>
          <Text style={estilos.nota}>
            Trator, implemento ou benfeitoria não é despesa do mês: é um bem.{' '}
            <Text style={estilos.linkLinha} onPress={() => navegacao.navigate('ImobilizadoForm', {})}>
              Lançar em Imobilizado
            </Text>
          </Text>
          <Text style={estilos.nota}>
            Conta que se repete todo mês (energia, internet, salário) pode entrar sozinha:{' '}
            <Text style={estilos.linkLinha} onPress={() => navegacao.navigate('TituloForm', {})}>
              Contas a pagar › Contínua
            </Text>
          </Text>
        </View>
      )}

      <Botao titulo={id ? 'Salvar despesa' : 'Gravar despesa'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir despesa" tipo="perigo" onPress={excluir} />}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linhaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  linkLinha: { color: cores.primaria, fontWeight: '700' },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  sugestao: { fontSize: tam.pequeno, color: cores.cafe, fontWeight: '600', lineHeight: 19 },
  soma: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  parcNum: { width: 28, paddingTop: 36, fontSize: tam.texto, fontWeight: '800', color: cores.textoSuave },
  dicas: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 8 },
});
