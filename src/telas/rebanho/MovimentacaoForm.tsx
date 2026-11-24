import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoNascimento, { NASCIMENTO_FAIXA, NASCIMENTO_VAZIO, lerNascimento, nascimentoDoBanco, type ValorNascimento } from '../../componentes/CampoNascimento';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import Botao from '../../componentes/Botao';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import FotoAnexo from '../../componentes/FotoAnexo';
import { CampoFerro, CampoRaca } from '../../componentes/CamposApoio';
import SeletorAnimais from '../../componentes/SeletorAnimais';
import ValorCompraAnimais, { type ValorCompraRef } from '../../componentes/ValorCompraAnimais';
import { AcertoParceria, CondicoesParceria, type AcertoParceriaRef, type CondicoesParceriaRef, type Parceria } from '../../componentes/ParceriaMov';
import Interruptor from '../../componentes/Interruptor';
import { brincoRegistro, lerCriador, type Criador } from '../../lib/criadores';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { useAvisoTemporario } from '../../lib/useAvisoTemporario';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarNumero, lerNumero, numeroParaCampo, formatarMoeda } from '../../lib/formatos';
import { CATEGORIAS, SEXOS, codigoLote, identAnimal, nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ENTRADAS, GRUPOS_MOV, PESSOA_MOV, ROTULO_MOV, SAIDAS, type TipoMov } from '../../lib/movimentacoes';
import ConsultaMovimentacoes from './ConsultaMovimentacoes';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type InfoLote = { id: string; numero: number; descricao: string | null; sexo: string | null; manga_id: string | null; cabecas: number };

export default function MovimentacaoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'MovimentacaoForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const avisoAnterior = useAvisoTemporario(params?.aviso);

  const [tipo, setTipo] = useState<TipoMov | null>(null);
  /** compra: quadro de valor e pagamento (gera a compra e o contas a pagar) */
  const valorCompra = useRef<ValorCompraRef>(null);
  /** V182: parceria – condições na entrada e acerto na saída */
  const condParceria = useRef<CondicoesParceriaRef>(null);
  const acertoParceria = useRef<AcertoParceriaRef>(null);
  const [parceria, setParceria] = useState<Parceria | null>(null);
  const [buscandoParceria, setBuscandoParceria] = useState(false);
  const [data, setData] = useState(hojeBR());
  const [origem, setOrigem] = useState<InfoLote | null>(null);
  const [destino, setDestino] = useState<InfoLote | null>(null);
  const [mangaDestino, setMangaDestino] = useState<string | null>(null);
  const [modo, setModo] = useState<string[]>(['quantidade']);
  const [quantidade, setQuantidade] = useState('');
  const [animais, setAnimais] = useState<string[]>([]);
  const [sexo, setSexo] = useState<string[]>([]);
  const [categoria, setCategoria] = useState<string[]>([]);
  const [racaId, setRacaId] = useState<string | null>(null);
  const [ferroId, setFerroId] = useState<string | null>(null);
  const [nasc, setNasc] = useState<ValorNascimento>(NASCIMENTO_FAIXA);
  const [maeId, setMaeId] = useState<string | null>(null);
  const [peso, setPeso] = useState('');
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  // V181: documentos separados; o fiscal só conta com NF e/ou GTA
  const [nf, setNf] = useState('');
  const [gta, setGta] = useState('');
  const [outro, setOutro] = useState('');
  const [fotoNf, setFotoNf] = useState<string | null>(null);
  const [fotoGta, setFotoGta] = useState<string | null>(null);
  const [fotoOutro, setFotoOutro] = useState<string | null>(null);
  // V181: lote de destino pelo número digitado (se não existir, é cadastrado ao lançar)
  const [numDestino, setNumDestino] = useState('');
  const [verLotes, setVerLotes] = useState(false);
  const [buscandoLote, setBuscandoLote] = useState(false);
  const [obs, setObs] = useState('');
  const [numPesagem, setNumPesagem] = useState('');
  const [pesagem, setPesagem] = useState<{ id: string; numero: number; texto: string; porBrinco: boolean } | null>(null);
  const [puxando, setPuxando] = useState(false);
  const [criadorFazenda, setCriadorFazenda] = useState<Criador | null>(null);
  const [registrar, setRegistrar] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  // V205: venda com "o gado fica na fazenda": já abre a Entrada por parceria com os dados da venda (um grupo por vez)
  const pv = params?.parceriaVenda;
  const grupoPv = pv?.grupos[0];
  useEffect(() => {
    if (!pv || !grupoPv) return;
    escolherTipo('entrada_parceria');
    setData(pv.data);
    setPessoaId(pv.pessoaId);
    setQuantidade(String(grupoPv.cab));
    if (grupoPv.sexo) setSexo([grupoPv.sexo]);
    setRacaId(grupoPv.racaId);
    setFerroId(grupoPv.ferroId);
    if (grupoPv.faixa) setNasc({ ...NASCIMENTO_FAIXA, faixa: grupoPv.faixa });
    setPeso(grupoPv.peso > 0 ? numeroParaCampo(grupoPv.peso) : '');
    setObs(`Gado da venda nº ${pv.venda} que ficou na fazenda (parceria).`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entrada = !!tipo && ENTRADAS.includes(tipo);
  const saida = !!tipo && SAIDAS.includes(tipo);
  const baseIso = paraBanco(data) ?? hojeBanco();

  // Trocar de tipo limpa o que depende dele.
  function escolherTipo(t: TipoMov) {
    setTipo(t);
    setErro(null);
    setErros({});
    setOrigem(null);
    setDestino(null);
    setMangaDestino(null);
    setAnimais([]);
    setModo(['quantidade']);
    setQuantidade(t === 'nascimento' ? '1' : '');
    setSexo([]);
    setCategoria([]);
    setMaeId(null);
    setPessoaId(null);
    setPesagem(null);
    setNumPesagem('');
    setPeso('');
    setNumDestino('');
    setVerLotes(false);
    setParceria(null);
    // V182: nascimento e morte não têm NF nem GTA
    if (t === 'nascimento' || t === 'morte') {
      setNf('');
      setGta('');
      setFotoNf(null);
      setFotoGta(null);
    }
  }

  // Criador desta fazenda: nascimentos podem já sair registrados (SUI + próximo RGN).
  useEffect(() => {
    if (!fid || tipo !== 'nascimento') return;
    supabase
      .from('fazendas')
      .select('criador_id')
      .eq('id', fid)
      .single()
      .then(async ({ data: fz }) => setCriadorFazenda(fz?.criador_id ? await lerCriador(fz.criador_id) : null));
  }, [fid, tipo]);

  // ---- lotes ----
  const lerLote = useCallback(async (id: string): Promise<InfoLote> => {
    const [l, c] = await Promise.all([
      consulta<any>(supabase.from('lotes').select('id, numero, descricao, sexo, manga_id, categoria, raca_id, ferro_id, nascimento_ref, nascimento_aproximado').eq('id', id).single()),
      supabase.from('animais').select('id', { count: 'exact', head: true }).eq('lote_id', id).eq('situacao', 'ativo'),
    ]);
    return { ...l, sexo: l.sexo?.trim() || null, cabecas: c.count ?? 0 };
  }, []);

  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, sexo').eq('fazenda_id', fid!).eq('situacao', 'ativo').order('numero'));
    return d.map((l) => ({
      id: l.id,
      titulo: nomeLote(l, sigla),
      detalhe: l.sexo === 'M' ? 'Lote de machos' : l.sexo === 'F' ? 'Lote de fêmeas' : 'Sexo não definido',
      oculto: origem?.id === l.id && tipo === 'transferencia_lote' ? true : undefined,
    }));
  }, [fid, sigla, origem, tipo]);

  async function escolherOrigem(id: string | null) {
    setAnimais([]);
    setOrigem(id ? await lerLote(id).catch(() => null) : null);
  }

  async function escolherDestino(id: string | null) {
    if (!id) return setDestino(null);
    try {
      const l: any = await lerLote(id);
      setDestino(l);
      setNumDestino(String(l.numero));
      // Nas entradas, o lote já sugere sexo, categoria, raça, ferro e idade.
      if (entrada) {
        if (l.sexo) setSexo([l.sexo]);
        if (tipo !== 'nascimento') {
          if (l.categoria) setCategoria([l.categoria]);
          if (l.raca_id) setRacaId(l.raca_id);
          if (l.ferro_id) setFerroId(l.ferro_id);
          if (l.nascimento_ref) setNasc(nascimentoDoBanco(l.nascimento_ref, l.nascimento_aproximado, baseIso));
        } else {
          if (l.raca_id && !racaId) setRacaId(l.raca_id);
          if (l.ferro_id && !ferroId) setFerroId(l.ferro_id);
        }
      }
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  // V181: digitou o nº do lote de destino: acha o lote ativo com esse número; se não existir, ele é cadastrado ao lançar
  useEffect(() => {
    const n = Number(numDestino);
    setBuscandoLote(false);
    if (!fid || !Number.isInteger(n) || n < 1) return;
    if (destino && destino.numero === n) return;
    let vivo = true;
    setBuscandoLote(true);
    const t = setTimeout(async () => {
      const { data: l } = await supabase.from('lotes').select('id').eq('fazenda_id', fid).eq('numero', n).eq('situacao', 'ativo').limit(1);
      if (!vivo) return;
      setBuscandoLote(false);
      if (l?.[0]) escolherDestino(l[0].id);
      else setDestino(null);
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numDestino, fid]);

  // Trocou ou corrigiu o nº da pesagem: tira da tela tudo o que veio da pesagem anterior.
  function limparPuxados() {
    setPesagem(null);
    setQuantidade(tipo === 'nascimento' ? '1' : '');
    setPeso('');
    setPessoaId(null);
    setOrigem(null);
    setDestino(null);
    setAnimais([]);
    setModo(['quantidade']);
    setSexo([]);
    setCategoria([]);
    setRacaId(null);
    setFerroId(null);
    setNasc(NASCIMENTO_FAIXA);
    setData(hojeBR());
  }

  // ---- puxar os dados de uma pesagem pelo número ----
  async function puxarPesagem() {
    if (pesagem) limparPuxados();
    setErros((e) => ({ ...e, pesagem: '' }));
    const n = Number(numPesagem);
    if (!Number.isInteger(n) || n < 1) return setErros((e) => ({ ...e, pesagem: 'Informe o número da pesagem.' }));
    setPuxando(true);
    try {
      const lista = await consulta<any[]>(
        supabase
          .from('pesagens')
          .select('id, numero, data, lote_id, sexo, raca_id, ferro_id, nascimento_ref, nascimento_aproximado, origem_pessoa_id, destino_pessoa_id, peso_arroba, itens:pesagem_itens ( quantidade, peso_bruto_kg, brinco ), mov:movimentacoes ( id )')
          .eq('fazenda_id', fid!)
          .eq('numero', n)
          .limit(1),
      );
      const x = lista[0];
      if (!x) return setErros((e) => ({ ...e, pesagem: `Pesagem nº ${n} não encontrada nesta fazenda.` }));
      if ((Array.isArray(x.mov) ? x.mov : x.mov ? [x.mov] : []).length) {
        return setErros((e) => ({ ...e, pesagem: `A pesagem nº ${n} já foi usada em outra movimentação.` }));
      }
      const itens = x.itens as { quantidade: number; peso_bruto_kg: number; brinco: string | null }[];
      const cab = itens.reduce((s, i) => s + i.quantidade, 0);
      const kg = itens.reduce((s, i) => s + Number(i.peso_bruto_kg), 0);
      const porBrinco = itens.length > 0 && itens.every((i) => i.brinco && i.quantidade === 1);

      setData(doBanco(x.data));
      setQuantidade(String(cab));
      setPeso(numeroParaCampo(kg));
      setModo(['quantidade']);
      // Entrada: sexo, raça, idade e ferro digitados na pesagem vêm para esta tela (confira antes de lançar).
      // Saída e troca de lote: os animais já têm os seus dados; a pesagem só traz quantidade, peso, data, lote e pessoa.
      if (entrada) {
        if (x.lote_id) await escolherDestino(x.lote_id);
        if (x.sexo?.trim()) setSexo([x.sexo.trim()]);
        if (x.raca_id) setRacaId(x.raca_id);
        if (x.ferro_id) setFerroId(x.ferro_id);
        if (x.nascimento_ref) setNasc(nascimentoDoBanco(x.nascimento_ref, x.nascimento_aproximado, x.data));
        if (x.origem_pessoa_id) setPessoaId(x.origem_pessoa_id);
      } else {
        if (x.lote_id) await escolherOrigem(x.lote_id);
        if (x.destino_pessoa_id && (tipo === 'venda' || tipo === 'saida_parceria')) setPessoaId(x.destino_pessoa_id);
      }
      setPesagem({
        id: x.id,
        numero: x.numero,
        porBrinco,
        texto: `${formatarNumero(cab)} cab., ${formatarNumero(kg, 1)} kg, ${formatarNumero(kg / (Number(x.peso_arroba) || 30), 2)} arrobas, em ${doBanco(x.data)}.`,
      });
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setPuxando(false);
    }
  }

  // ---- morte: escolhe o animal (de qualquer lote); o lote de origem vem dele ----
  const carregarAnimaisVivos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(
      supabase
        .from('animais')
        .select('id, numero_interno, brinco, nome, categoria, lote:lotes!animais_lote_id_fkey ( numero )')
        .eq('fazenda_id', fid!)
        .eq('situacao', 'ativo')
        .not('lote_id', 'is', null)
        .order('numero_interno'),
    );
    return d.map((a) => {
      const l = Array.isArray(a.lote) ? a.lote[0] : a.lote;
      return { id: a.id, titulo: [identAnimal(a), a.nome].filter(Boolean).join('  '), detalhe: [a.categoria, l ? `Lote ${codigoLote(l.numero, sigla)}` : null].filter(Boolean).join(', ') };
    });
  }, [fid, sigla]);

  async function escolherAnimalMorto(id: string | null) {
    setAnimais(id ? [id] : []);
    setOrigem(null);
    if (!id) return;
    const { data: a } = await supabase.from('animais').select('lote_id').eq('id', id).single();
    if (a?.lote_id) setOrigem(await lerLote(a.lote_id).catch(() => null));
  }

  // V182: saída da parceria – acha a parceria aberta do lote de origem e já traz o parceiro
  useEffect(() => {
    if (tipo !== 'saida_parceria' || !origem?.id) {
      setParceria(null);
      return;
    }
    let vivo = true;
    setBuscandoParceria(true);
    supabase
      .from('parcerias')
      .select('id, numero, modalidade, data_entrada, data_prevista, preco_cab_mes, cabecas_entrada, peso_entrada_kg, kg_arroba, perc_fazenda, perc_parceiro, pessoa_id, pessoa:pessoas ( nome )')
      .eq('lote_id', origem.id)
      .eq('situacao', 'aberta')
      .order('data_entrada', { ascending: false })
      .limit(1)
      .then(async ({ data: l }) => {
        const x: any = l?.[0] ?? null;
        let cab: number | undefined;
        if (x) {
          const { data: c } = await supabase.rpc('parceria_cab_em', { p_id: x.id, p_data: hojeBanco() });
          cab = typeof c === 'number' ? c : undefined;
        }
        if (!vivo) return;
        setBuscandoParceria(false);
        setParceria(x ? { ...x, pessoa: Array.isArray(x.pessoa) ? x.pessoa[0] ?? null : x.pessoa, cab_abertas: cab } : null);
        if (x?.pessoa_id) setPessoaId(x.pessoa_id);
      });
    return () => {
      vivo = false;
    };
  }, [tipo, origem?.id]);

  // ---- outras listas ----
  const carregarMangas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('areas').select('id, nome, capim_cultura, ativa').eq('fazenda_id', fid!).eq('tipo', 'manga').order('nome'));
    return d.map((a) => ({ id: a.id, titulo: a.nome, detalhe: a.capim_cultura, oculto: !a.ativa || a.id === origem?.manga_id }));
  }, [fid, origem]);
  const carregarRacas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('racas').select('id, nome').order('nome'));
    return d.map((r) => ({ id: r.id, titulo: r.nome }));
  }, []);
  const carregarFerros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('ferros').select('id, descricao, proprio').order('proprio', { ascending: false }).order('descricao'));
    return d.map((x) => ({ id: x.id, titulo: x.descricao, detalhe: x.proprio ? 'Ferro próprio' : 'De terceiro' }));
  }, []);
  const carregarMaes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(
      supabase.from('animais').select('id, numero_interno, brinco, nome, lote:lotes!animais_lote_id_fkey ( numero )').eq('fazenda_id', fid!).eq('sexo', 'F').eq('situacao', 'ativo').order('numero_interno'),
    );
    return d.map((a) => {
      const l = Array.isArray(a.lote) ? a.lote[0] : a.lote;
      return { id: a.id, titulo: [identAnimal(a), a.nome].filter(Boolean).join('  '), detalhe: l ? codigoLote(l.numero, sigla) : 'Sem lote' };
    });
  }, [fid, sigla]);

  // Nascimento com mãe: raça e ferro vêm dela, se ainda estiverem em branco.
  useEffect(() => {
    if (!maeId) return;
    setQuantidade('1');
    supabase.from('animais').select('raca_id, ferro_id').eq('id', maeId).single().then(({ data: m }) => {
      if (m?.raca_id && !racaId) setRacaId(m.raca_id);
      if (m?.ferro_id && !ferroId) setFerroId(m.ferro_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maeId]);

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    if (!tipo || !fid) return;
    const e: Record<string, string> = {};
    const qtd = Number(quantidade || 0);
    const escolhendo = modo[0] === 'escolher' || tipo === 'morte';
    const pesoNum = peso.trim() ? lerNumero(peso) : null;
    const lido = lerNascimento(nasc, baseIso);

    if (!dataValida(data)) e.data = 'Data inválida.';
    else if (baseIso > hojeBanco()) e.data = 'A data não pode ser futura.';
    if (peso.trim() && (pesoNum === null || pesoNum <= 0)) e.peso = 'Peso inválido. Ex.: 1.250,5';

    const numLote = Number(numDestino);
    const loteNovo = !destino && Number.isInteger(numLote) && numLote > 0;
    if (entrada) {
      if (!destino && !loteNovo) e.destino = 'Informe o nº do lote de destino.';
      if (!(destino?.sexo ?? sexo[0])) e.sexo = 'Escolha o sexo.';
      if (!Number.isInteger(qtd) || qtd < 1 || qtd > 5000) e.quantidade = 'Informe de 1 a 5.000 cabeças.';
      if (tipo !== 'nascimento') {
        if (lido.erro) e.nasc = lido.erro;
        else if (!lido.iso) e.nasc = 'Informe a idade: animal não entra sem idade.';
      }
    } else if (tipo === 'transferencia_manga') {
      if (!origem) e.origem = 'Escolha o lote.';
      if (!mangaDestino) e.manga = 'Escolha a manga de destino.';
    } else {
      if (!origem) e.origem = 'Escolha o lote de origem.';
      // Na troca de lote, o banco confere o sexo de cada animal com o lote de destino.
      if (tipo === 'transferencia_lote' && !destino && !loteNovo) e.destino = 'Informe o nº do lote de destino.';
      if (tipo === 'transferencia_lote' && loteNovo && !origem?.sexo) e.destino = 'O lote de origem não tem sexo definido: use um lote de destino que já exista.';
      if (escolhendo && animais.length === 0) e.animais = tipo === 'morte' ? 'Escolha o animal.' : 'Marque pelo menos um animal.';
      if (!escolhendo) {
        if (!Number.isInteger(qtd) || qtd < 1) e.quantidade = 'Informe a quantidade de cabeças.';
        else if (origem && qtd > origem.cabecas) e.quantidade = `O lote só tem ${formatarNumero(origem.cabecas)} cabeças.`;
      }
    }
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');
    // compra com preço informado: lança junto a compra e o contas a pagar
    const valor = tipo === 'compra' ? valorCompra.current?.obter() : undefined;
    if (valor?.erro) return setErro(valor.erro);
    if (valor?.dados && !pessoaId) return setErro('Informe o vendedor, para lançar o contas a pagar da compra.');
    // V182: condições da parceria (entrada) e acerto (saída)
    const cond = tipo === 'entrada_parceria' ? condParceria.current?.obter() : undefined;
    if (cond?.erro) return setErro(cond.erro);
    if (cond?.dados && !pessoaId) return setErro('Informe o parceiro (dono dos animais).');
    const acerto = tipo === 'saida_parceria' && parceria ? acertoParceria.current?.obter() : undefined;
    if (acerto?.erro) return setErro(acerto.erro);
    let loteAcerto: string | null = null;
    if (acerto?.loteNumero) {
      if (acerto.loteNumero === origem?.numero) loteAcerto = null;
      else {
        setSalvando(true);
        const { data: la, error: ela } = await supabase.rpc('lote_pelo_numero', {
          p_fazenda: fid,
          p_numero: acerto.loteNumero,
          p_sexo: origem?.sexo ?? null,
          p_categoria: null,
          p_raca: null,
          p_ferro: null,
          p_nascimento: null,
          p_nasc_aprox: false,
          p_data: baseIso,
        });
        setSalvando(false);
        if (ela) return setErro(traduzirErro(ela));
        loteAcerto = (la as { id: string }).id;
      }
    }

    // V181: lote digitado que não existe: cadastra agora, com os dados desta movimentação
    let destinoId = destino?.id ?? null;
    let loteCriado: number | null = null;
    if (!destinoId && loteNovo && (entrada || tipo === 'transferencia_lote')) {
      setSalvando(true);
      const { data: lr, error: el } = await supabase.rpc('lote_pelo_numero', {
        p_fazenda: fid,
        p_numero: numLote,
        p_sexo: entrada ? sexo[0] ?? null : origem?.sexo ?? null,
        p_categoria: entrada ? categoria[0] ?? null : null,
        p_raca: entrada ? racaId : null,
        p_ferro: entrada ? ferroId : null,
        p_nascimento: entrada && tipo !== 'nascimento' ? lido.iso : null,
        p_nasc_aprox: entrada && tipo !== 'nascimento' ? lido.aprox : false,
        p_data: baseIso,
      });
      setSalvando(false);
      if (el) return setErro(traduzirErro(el));
      const r0 = lr as { id: string; numero: number; novo: boolean };
      destinoId = r0.id;
      if (r0.novo) loteCriado = r0.numero;
    }

    const docTexto = [nf.trim() && `NF ${nf.trim()}`, gta.trim() && `GTA ${gta.trim()}`, outro.trim()].filter(Boolean).join(' · ');
    const pedido = {
      tipo,
      fazenda: fid,
      data: baseIso,
      lote_origem: origem?.id ?? null,
      lote_destino: destinoId,
      manga_destino: mangaDestino,
      quantidade: saida || tipo === 'transferencia_lote' ? (escolhendo ? 0 : qtd) : qtd,
      animais: (saida || tipo === 'transferencia_lote') && escolhendo ? animais : [],
      peso_total: pesoNum,
      sexo: entrada ? destino?.sexo ?? sexo[0] : null,
      categoria: entrada ? categoria[0] ?? (tipo === 'nascimento' ? ((destino?.sexo ?? sexo[0]) === 'F' ? 'Bezerra' : 'Bezerro') : null) : null,
      raca: entrada ? racaId : null,
      ferro: entrada ? ferroId : null,
      nascimento: entrada && tipo !== 'nascimento' ? lido.iso : null,
      nasc_aprox: entrada && tipo !== 'nascimento' ? lido.aprox : false,
      mae: tipo === 'nascimento' ? maeId : null,
      pessoa: PESSOA_MOV[tipo] ? pessoaId : null,
      documento: docTexto || null,
      obs: obs.trim() || null,
      pesagem: pesagem?.id ?? null,
      registrar: tipo === 'nascimento' && !!criadorFazenda && registrar,
    };

    setSalvando(true);
    const { data: r, error } = valor?.dados
      ? await supabase.rpc('lancar_compra_animais', { p: { mov: pedido, compra: valor.dados } })
      : cond?.dados
        ? await supabase.rpc('lancar_entrada_parceria', { p: { mov: pedido, parceria: cond.dados } })
        : acerto && parceria
          ? await supabase.rpc('lancar_saida_parceria', { p: { mov: pedido, parceria: parceria.id, acerto: { ...(acerto.acerto ?? {}), lote_destino: loteAcerto ?? '' } } })
          : await supabase.rpc('lancar_movimentacao', { p: pedido });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error) + (loteCriado ? ` (O lote nº ${loteCriado} já foi cadastrado.)` : ''));

    const res = r as {
      id?: string; cabecas: number; de?: number; ate?: number; compra?: number; valor?: number;
      parceria?: number; titulos?: number; total?: number; restam?: number; forma?: string; cab_fazenda?: number; diferenca?: number;
    };
    // V181: documentos e fotos; com NF ou GTA, o estoque fiscal é lançado junto
    let avisoDoc = '';
    if (res.id && (nf.trim() || gta.trim() || outro.trim() || fotoNf || fotoGta || fotoOutro)) {
      const { data: dr, error: ed } = await supabase.rpc('movimentacao_documentos', {
        p_mov: res.id,
        p: { nf: nf.trim(), gta: gta.trim(), outro: outro.trim(), foto_nf: fotoNf ?? '', foto_gta: fotoGta ?? '', foto_outro: fotoOutro ?? '' },
      });
      if (ed) avisoDoc = ` ATENÇÃO: a movimentação foi lançada, mas os documentos não foram gravados (${traduzirErro(ed)}).`;
      else {
        const x = dr as { fiscal: boolean; gta_ja_lancada: boolean };
        if (x.fiscal) avisoDoc = ' Estoque de gado atualizado (NF/GTA).';
        else if (x.gta_ja_lancada) avisoDoc = ' A GTA já estava em Mais › GTA: o estoque de gado já a contou.';
      }
    }
    const cab = `${formatarNumero(res.cabecas)} ${res.cabecas === 1 ? 'cabeça' : 'cabeças'}`;
    const lo = origem ? codigoLote(origem.numero, sigla) : '';
    const ld = destino ? codigoLote(destino.numero, sigla) : '';
    let aviso: string;
    const ldx = ld || (loteCriado ? codigoLote(loteCriado, sigla) : '');
    if (entrada) aviso = `Lançado: ${ROTULO_MOV[tipo].toLowerCase()} de ${cab} no lote ${ldx}, ${res.de === res.ate ? `número ${res.de}` : `números ${res.de} a ${res.ate}`}.`;
    else if (saida) aviso = `Lançado: ${ROTULO_MOV[tipo].toLowerCase()} de ${cab} do lote ${lo}. ${res.cabecas === 1 ? 'Saiu' : 'Saíram'} do rebanho.`;
    else if (tipo === 'transferencia_lote') aviso = `${cab} passaram do lote ${lo} para o ${ldx}.`;
    else aviso = `Lote ${lo} (${cab}) mudou de manga.`;
    if (res.compra && tipo === 'compra') aviso += ` Compra nº ${res.compra}, de ${formatarMoeda(Number(res.valor))}, lançada no contas a pagar.`;
    // V182: parceria
    if (tipo === 'entrada_parceria' && res.parceria) {
      aviso += ` Parceria nº ${res.parceria} gravada.`;
      if (res.titulos) aviso += ` ${res.titulos} ${res.titulos === 1 ? 'título lançado' : 'títulos mensais lançados'} no contas a receber (${formatarMoeda(Number(res.total))}).`;
    }
    if (tipo === 'saida_parceria' && res.parceria) {
      if (res.forma === 'cabecas' && res.cab_fazenda) {
        aviso = `Lançado: saída de ${cab} da parceria nº ${res.parceria}; ${res.cab_fazenda} ${res.cab_fazenda === 1 ? 'cabeça ficou' : 'cabeças ficaram'} para a fazenda pelo rendimento (${formatarMoeda(Number(res.valor))}), no estoque pela compra nº ${res.compra}.`;
        if (Math.abs(Number(res.diferenca)) > 0.009) aviso += ` Diferença de ${formatarMoeda(Math.abs(Number(res.diferenca)))} lançada no contas a ${Number(res.diferenca) > 0 ? 'receber' : 'pagar'}.`;
      } else if (Number(res.valor) > 0) aviso += ` Rendimento da parceria nº ${res.parceria}: ${formatarMoeda(Number(res.valor))} lançado no contas a receber.`;
      else if (res.forma && parceria?.modalidade === 'rendimento') aviso += ' Sem ganho de peso: nenhum valor de rendimento.';
      aviso += res.restam ? ` Restam ${formatarNumero(res.restam)} cab. na parceria.` : ` Parceria nº ${res.parceria} encerrada.`;
      if (parceria?.modalidade === 'apascentamento') aviso += ` Contas a receber do apascentamento recalculado (${formatarMoeda(Number(res.total ?? 0))} no total).`;
    }
    if (loteCriado) aviso += ` Lote nº ${loteCriado} cadastrado (manga e outros dados completam-se em Pecuário › Lotes).`;
    aviso += avisoDoc;
    // V205: venda com sexos/faixas diferentes: abre a próxima parte da parceria
    if (pv && pv.grupos.length > 1) {
      const parte = (pv.parte ?? 1) + 1;
      return navegacao.replace('MovimentacaoForm', { aviso: `${aviso} Agora a parte ${parte} de ${pv.partes ?? pv.grupos.length}.`, parceriaVenda: { ...pv, grupos: pv.grupos.slice(1), parte } });
    }
    navegacao.replace('MovimentacaoForm', { aviso });
  }

  // ---- tela ----
  const abas = <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Lançar" />;

  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaMovimentacoes />
      </Tela>
    );
  }

  const pessoa = tipo ? PESSOA_MOV[tipo] : undefined;
  const sexoTravado = entrada && destino?.sexo;
  const sexoAtual = (destino?.sexo ?? sexo[0]) as 'M' | 'F' | undefined;
  const usaAnimais = saida || tipo === 'transferencia_lote';
  // V205: na parceria aberta pela venda, NF e GTA ficam na venda (o estoque de terceiros já foi lançado por ela)
  const comNfGta = tipo !== 'nascimento' && tipo !== 'morte' && !pv;
  // V182: escolhido o tipo, só o grupo dele fica na tela (ex.: no Nascimento e na Compra somem Saídas e Transferências)
  const grupos = tipo ? GRUPOS_MOV.filter((g) => g.tipos.some((t) => t.valor === tipo)) : GRUPOS_MOV;

  return (
    <Tela
      rodape={
        tipo ? (
          <RodapeAcoes
            titulo={`Lançar ${ROTULO_MOV[tipo].toLowerCase()}`}
            aoConfirmar={salvar}
            carregando={salvando}
            aoDescartar={() => navegacao.replace('MovimentacaoForm')}
            erro={erro ? `${erro}${Object.values(erros).filter(Boolean).length ? ' ' + Object.values(erros).filter(Boolean)[0] : ''}` : null}
          />
        ) : undefined
      }
    >
      {abas}
      {avisoAnterior && (!tipo || !!pv) && <Aviso tipo="sucesso" texto={avisoAnterior} />}
      {pv && grupoPv && tipo === 'entrada_parceria' && (
        <Aviso
          tipo="info"
          texto={`Venda nº ${pv.venda}: o gado ficou na fazenda. Registre a parceria${(pv.partes ?? pv.grupos.length) > 1 ? ` (parte ${pv.parte ?? 1} de ${pv.partes ?? pv.grupos.length}: um lançamento para cada sexo e faixa de idade)` : ''}: confira os dados, informe o nº do lote e as condições (apascentamento ou rendimento). A NF e a GTA ficam na venda, e o estoque de terceiros do comprador já foi lançado por ela.`}
        />
      )}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {grupos.map((g) => (
        <Escolha key={g.titulo} rotulo={g.titulo} opcoes={g.tipos.filter((t) => t.valor !== 'venda')} valor={tipo ? [tipo] : []} aoMudar={(v) => v[0] && escolherTipo(v[0] as TipoMov)} />
      ))}
      {tipo && (
        <Text style={estilos.trocar} onPress={() => navegacao.replace('MovimentacaoForm')}>
          Outro tipo de movimentação
        </Text>
      )}
      {!tipo && (
        <Text style={estilos.nota} onPress={() => navegacao.navigate('VendaForm')}>
          Venda de animais: é lançada em Mais › Vendas, que tira os animais do rebanho e gera o contas a receber. <Text style={{ color: cores.primaria, fontWeight: '700' }}>Abrir Vendas</Text>
        </Text>
      )}

      {!tipo && <Text style={estilos.dica}>Escolha acima o tipo de movimentação.</Text>}

      {tipo && (
        <>
          <Secao titulo={ROTULO_MOV[tipo]} />
          {tipo !== 'nascimento' && tipo !== 'transferencia_manga' && tipo !== 'morte' && (
            <>
              <View style={[estilos.linha, { alignItems: 'flex-end' }]}>
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Nº da pesagem"
                    value={numPesagem}
                    onChangeText={(t) => {
                      setNumPesagem(t.replace(/\D/g, '').slice(0, 6));
                      if (pesagem) limparPuxados();
                    }}
                    autoComplete="off"
                    textContentType="none"
                    keyboardType="number-pad"
                    placeholder="Opcional"
                  />
                </View>
                <View style={{ width: 130 }}>
                  <Botao titulo="Puxar dados" tipo="secundario" onPress={puxarPesagem} carregando={puxando} />
                </View>
              </View>
              {erros.pesagem ? <Text style={estilos.erroTexto}>{erros.pesagem}</Text> : null}
              {pesagem && (
                <Aviso
                  tipo="info"
                  texto={
                    `Pesagem nº ${pesagem.numero}: ${pesagem.texto} Os dados foram preenchidos abaixo.` +
                    (pesagem.porBrinco && !entrada ? ' Como todas as pesadas têm brinco de animais do lote, saem exatamente esses.' : '') +
                    (entrada ? ' Sexo, raça, idade e ferro vieram da pesagem: confira abaixo. Os animais entram sem brinco; a identificação é feita no cadastro de cada animal.' : '')
                  }
                />
              )}
            </>
          )}
          <CampoData rotulo={tipo === 'nascimento' ? 'Data do nascimento *' : 'Data *'} valor={data} aoMudar={setData} erro={erros.data} />

          {/* ----- lote de origem ----- */}
          {tipo === 'morte' && (
            <>
              <SeletorLista
                rotulo="Animal *"
                valorId={animais[0] ?? null}
                aoMudar={escolherAnimalMorto}
                carregar={carregarAnimaisVivos}
                dicaBusca="Número, brinco ou nome"
                erro={erros.animais}
                vazio="Nenhum animal no rebanho."
              />
              {origem && <Text style={estilos.nota}>Está no lote {codigoLote(origem.numero, sigla)}.</Text>}
            </>
          )}

          {!entrada && tipo !== 'morte' && (
            <>
              <SeletorLista
                rotulo={tipo === 'transferencia_manga' ? 'Lote *' : 'Lote de origem *'}
                valorId={origem?.id ?? null}
                aoMudar={escolherOrigem}
                carregar={carregarLotes}
                erro={erros.origem}
                vazio="Nenhum lote ativo. Abra em Pecuário › Lotes."
              />
              {origem && <Text style={estilos.nota}>{formatarNumero(origem.cabecas)} {origem.cabecas === 1 ? 'cabeça' : 'cabeças'} no lote agora.</Text>}
            </>
          )}

          {/* ----- lote de destino (V181: digita o nº; se não existir, é cadastrado ao lançar) ----- */}
          {(entrada || tipo === 'transferencia_lote') && (
            <>
              <View style={[estilos.linha, { alignItems: 'flex-end' }]}>
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Nº do lote de destino *"
                    value={numDestino}
                    onChangeText={(t) => {
                      const v = t.replace(/\D/g, '').slice(0, 6);
                      setNumDestino(v);
                      if (destino && String(destino.numero) !== v) setDestino(null);
                    }}
                    keyboardType="number-pad"
                    autoComplete="off"
                    textContentType="none"
                    erro={erros.destino}
                  />
                </View>
                <View style={{ width: 150 }}>
                  <Botao titulo={verLotes ? 'Fechar lista' : 'Consultar lotes'} tipo="secundario" onPress={() => setVerLotes((v) => !v)} />
                </View>
              </View>
              {verLotes && (
                <SeletorLista
                  rotulo="Lotes ativos"
                  valorId={destino?.id ?? null}
                  aoMudar={(id) => {
                    setVerLotes(false);
                    escolherDestino(id);
                  }}
                  carregar={carregarLotes}
                  vazio="Nenhum lote ativo: digite um número acima e ele é cadastrado ao lançar."
                />
              )}
              {buscandoLote ? (
                <Text style={estilos.nota}>Procurando o lote…</Text>
              ) : destino ? (
                <Text style={estilos.nota}>
                  Lote {codigoLote(destino.numero, sigla)}
                  {destino.descricao ? ` – ${destino.descricao}` : ''} · {formatarNumero(destino.cabecas)} {destino.cabecas === 1 ? 'cabeça' : 'cabeças'} ·{' '}
                  {destino.sexo === 'M' ? 'machos' : destino.sexo === 'F' ? 'fêmeas' : 'sexo não definido'}
                </Text>
              ) : Number(numDestino) > 0 ? (
                <Text style={[estilos.nota, { color: cores.primariaEscura, fontWeight: '700' }]}>
                  O lote nº {numDestino} não existe: será cadastrado ao lançar
                  {entrada ? ' (com o sexo, a raça, o ferro e a idade abaixo)' : origem?.sexo ? ` (${origem.sexo === 'M' ? 'machos' : 'fêmeas'}, como o lote de origem)` : ''}.
                </Text>
              ) : null}
            </>
          )}

          {tipo === 'transferencia_manga' && (
            <SeletorLista rotulo="Manga de destino *" valorId={mangaDestino} aoMudar={setMangaDestino} carregar={carregarMangas} erro={erros.manga} vazio="Nenhuma outra manga cadastrada." />
          )}

          {/* ----- quais animais (saídas e troca de lote) ----- */}
          {usaAnimais && origem && tipo !== 'morte' && (
            <>
              <Escolha
                rotulo="Quais animais"
                opcoes={[
                  { valor: 'quantidade', rotulo: 'Por quantidade' },
                  { valor: 'escolher', rotulo: 'Escolher os animais' },
                ]}
                valor={modo}
                aoMudar={setModo}
              />
              {modo[0] === 'quantidade' ? (
                <Campo
                  rotulo="Quantidade de cabeças *"
                  value={quantidade}
                  onChangeText={(t) => setQuantidade(t.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  ajuda="O sistema escolhe primeiro os sem brinco e, entre eles, os de número mais alto."
                  erro={erros.quantidade}
                />
              ) : (
                <SeletorAnimais loteId={origem.id} valor={animais} aoMudar={setAnimais} erro={erros.animais} />
              )}
            </>
          )}

          {/* ----- dados dos animais que entram ----- */}
          {entrada && (
            <>
              {tipo === 'nascimento' && criadorFazenda && (
                <Interruptor
                  rotulo="Registrar (gado registrado)"
                  descricao={
                    registrar
                      ? `Cada bezerro recebe o próximo RGN de ${criadorFazenda.sui}: começa em ${brincoRegistro(criadorFazenda.sui, criadorFazenda.rgn_ultimo + 1)}. Esse é o brinco dele para sempre.`
                      : 'Sem registro: os bezerros entram só com o número interno.'
                  }
                  valor={registrar}
                  aoMudar={setRegistrar}
                />
              )}
              {tipo === 'nascimento' && (
                <SeletorLista rotulo="Mãe" valorId={maeId} aoMudar={setMaeId} carregar={carregarMaes} permitirLimpar dicaBusca="Número, brinco ou nome" vazio="Nenhuma fêmea no rebanho." />
              )}
              {!(tipo === 'nascimento' && maeId) && (
                <Campo
                  rotulo="Quantidade de cabeças *"
                  value={quantidade}
                  onChangeText={(t) => setQuantidade(t.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  ajuda="Cada cabeça recebe um número interno."
                  erro={erros.quantidade}
                />
              )}
              {sexoTravado ? (
                <Text style={estilos.nota}>Sexo: {destino!.sexo === 'M' ? 'machos' : 'fêmeas'} (definido pelo lote).</Text>
              ) : (
                <Escolha rotulo="Sexo *" opcoes={SEXOS} valor={sexo} aoMudar={(v) => { setSexo(v); setCategoria([]); }} erro={erros.sexo} />
              )}
              {sexoAtual && tipo !== 'nascimento' && (
                <Escolha rotulo="Categoria" opcoes={CATEGORIAS[sexoAtual].map((c) => ({ valor: c, rotulo: c }))} valor={categoria} aoMudar={setCategoria} />
              )}
              <CampoRaca valorId={racaId} aoMudar={setRacaId} />
              {tipo !== 'nascimento' && <CampoNascimento rotulo="Idade *" valor={nasc} aoMudar={setNasc} baseIso={baseIso} erro={erros.nasc} sexo={sexoAtual ?? null} />}
              <CampoFerro valorId={ferroId} aoMudar={setFerroId} />
            </>
          )}

          {/* ----- negócio ----- */}
          {pessoa && <CampoPessoaBusca rotulo={pessoa.rotulo} valorId={pessoaId} aoMudar={setPessoaId} tipoNovo={pessoa.tipoNovo} />}
          {(pessoa || tipo === 'morte') && tipo !== 'nascimento' && tipo !== 'morte' && (
            <Campo
              rotulo={
                tipo === 'entrada_parceria' ? 'Peso total de entrada (kg)' : tipo === 'saida_parceria' ? 'Peso total de saída (kg)' : 'Peso total (kg)'
              }
              value={peso}
              onChangeText={(t) => setPeso(t.replace(/[^\d.,]/g, ''))}
              keyboardType="decimal-pad"
              placeholder={tipo === 'compra' ? 'Para preço por @ ou kg' : tipo === 'entrada_parceria' || (tipo === 'saida_parceria' && parceria?.modalidade === 'rendimento') ? 'Obrigatório na parceria por rendimento' : 'Opcional'}
              erro={erros.peso}
            />
          )}

          {/* ----- V181: documentos (NF, GTA, outro) com foto; V182: nascimento e morte só com outro documento ----- */}
          {tipo !== 'transferencia_lote' && tipo !== 'transferencia_manga' && (
            <>
              <Secao titulo="Documentos" />
              {comNfGta && (
                <>
                  <View style={estilos.doc}>
                    <Campo rotulo="Nº da nota fiscal" value={nf} onChangeText={setNf} autoCapitalize="characters" autoComplete="off" textContentType="none" />
                    <FotoAnexo rotulo="da NF" pasta="gado" valor={fotoNf} aoMudar={setFotoNf} aoErro={setErro} />
                  </View>
                  <View style={estilos.doc}>
                    <Campo rotulo="Nº da GTA" value={gta} onChangeText={setGta} autoCapitalize="characters" autoComplete="off" textContentType="none" placeholder="Ex.: ES 816265 D" />
                    <FotoAnexo rotulo="da GTA" pasta="gado" valor={fotoGta} aoMudar={setFotoGta} aoErro={setErro} />
                  </View>
                </>
              )}
              <View style={estilos.doc}>
                <Campo
                  rotulo={tipo === 'morte' ? 'Documento (laudo, declaração…)' : tipo === 'nascimento' ? 'Documento (declaração, comunicado…)' : 'Outro documento (recibo, declaração…)'}
                  value={outro}
                  onChangeText={setOutro}
                  autoComplete="off"
                  textContentType="none"
                />
                <FotoAnexo rotulo="do documento" pasta="gado" valor={fotoOutro} aoMudar={setFotoOutro} aoErro={setErro} />
              </View>
              {comNfGta && <Text style={estilos.nota}>
                {nf.trim() || gta.trim()
                  ? saida
                    ? 'Com NF ou GTA, entra também no Estoque de gado. Se a GTA desta saída já estiver em Mais › GTA, ela não conta duas vezes.'
                    : 'Com NF ou GTA, entra também no Estoque de gado (pelo sexo e pela idade de cada animal).'
                  : 'Sem NF nem GTA: não entra no Estoque de gado (só no rebanho do sistema).'}
              </Text>}
              {saida && <Text style={estilos.nota}>Saídas com GTA (vendas, parcerias, transferências): a GTA é emitida em Mais › GTA.</Text>}
            </>
          )}
          <Campo
            rotulo={tipo === 'morte' ? 'Causa / observações' : 'Observações'}
            value={obs}
            onChangeText={setObs}
            multiline
            style={{ minHeight: 80, paddingTop: 12, textAlignVertical: 'top' }}
          />
          {tipo === 'compra' && <ValorCompraAnimais ref={valorCompra} fazendaId={fid} cabecas={Number(quantidade || 0)} pesoBruto={lerNumero(peso) ?? 0} data={data} />}
          {tipo === 'entrada_parceria' && <CondicoesParceria ref={condParceria} data={data} cabecas={Number(quantidade || 0)} pesoBruto={lerNumero(peso) ?? 0} />}
          {tipo === 'saida_parceria' && origem && buscandoParceria && <Text style={estilos.nota}>Procurando a parceria do lote…</Text>}
          {tipo === 'saida_parceria' && origem && !buscandoParceria && !parceria && (
            <Text style={estilos.nota}>Este lote não tem parceria aberta lançada pela Entrada por parceria: a saída é lançada sem acerto financeiro.</Text>
          )}
          {tipo === 'saida_parceria' && parceria && (
            <AcertoParceria
              ref={acertoParceria}
              parceria={parceria}
              cabecas={modo[0] === 'escolher' ? animais.length : Number(quantidade || 0)}
              pesoBruto={lerNumero(peso) ?? 0}
              data={data}
            />
          )}

        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12 },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', marginTop: 8 },
  erroTexto: { fontSize: tam.pequeno, color: cores.erro },
  trocar: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  doc: { gap: 6, padding: 10, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao },
});
