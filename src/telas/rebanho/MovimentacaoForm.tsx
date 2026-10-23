import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoNascimento, { NASCIMENTO_VAZIO, lerNascimento, nascimentoDoBanco, type ValorNascimento } from '../../componentes/CampoNascimento';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import Botao from '../../componentes/Botao';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { CampoFerro, CampoRaca } from '../../componentes/CamposApoio';
import SeletorAnimais from '../../componentes/SeletorAnimais';
import ValorCompraAnimais, { type ValorCompraRef } from '../../componentes/ValorCompraAnimais';
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
  const [nasc, setNasc] = useState<ValorNascimento>(NASCIMENTO_VAZIO);
  const [maeId, setMaeId] = useState<string | null>(null);
  const [peso, setPeso] = useState('');
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [documento, setDocumento] = useState('');
  const [obs, setObs] = useState('');
  const [numPesagem, setNumPesagem] = useState('');
  const [pesagem, setPesagem] = useState<{ id: string; numero: number; texto: string; porBrinco: boolean } | null>(null);
  const [puxando, setPuxando] = useState(false);
  const [criadorFazenda, setCriadorFazenda] = useState<Criador | null>(null);
  const [registrar, setRegistrar] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

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
    setNasc(NASCIMENTO_VAZIO);
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

    if (entrada) {
      if (!destino) e.destino = 'Escolha o lote de destino.';
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
      if (tipo === 'transferencia_lote' && !destino) e.destino = 'Escolha o lote de destino.';
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

    const pedido = {
      tipo,
      fazenda: fid,
      data: baseIso,
      lote_origem: origem?.id ?? null,
      lote_destino: destino?.id ?? null,
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
      documento: documento.trim() || null,
      obs: obs.trim() || null,
      pesagem: pesagem?.id ?? null,
      registrar: tipo === 'nascimento' && !!criadorFazenda && registrar,
    };

    setSalvando(true);
    const { data: r, error } = valor?.dados
      ? await supabase.rpc('lancar_compra_animais', { p: { mov: pedido, compra: valor.dados } })
      : await supabase.rpc('lancar_movimentacao', { p: pedido });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));

    const res = r as { cabecas: number; de?: number; ate?: number; compra?: number; valor?: number };
    const cab = `${formatarNumero(res.cabecas)} ${res.cabecas === 1 ? 'cabeça' : 'cabeças'}`;
    const lo = origem ? codigoLote(origem.numero, sigla) : '';
    const ld = destino ? codigoLote(destino.numero, sigla) : '';
    let aviso: string;
    if (entrada) aviso = `Lançado: ${ROTULO_MOV[tipo].toLowerCase()} de ${cab} no lote ${ld}, ${res.de === res.ate ? `número ${res.de}` : `números ${res.de} a ${res.ate}`}.`;
    else if (saida) aviso = `Lançado: ${ROTULO_MOV[tipo].toLowerCase()} de ${cab} do lote ${lo}. ${res.cabecas === 1 ? 'Saiu' : 'Saíram'} do rebanho.`;
    else if (tipo === 'transferencia_lote') aviso = `${cab} passaram do lote ${lo} para o ${ld}.`;
    else aviso = `Lote ${lo} (${cab}) mudou de manga.`;
    if (res.compra) aviso += ` Compra nº ${res.compra}, de ${formatarMoeda(Number(res.valor))}, lançada no contas a pagar.`;
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
      {avisoAnterior && !tipo && <Aviso tipo="sucesso" texto={avisoAnterior} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {GRUPOS_MOV.map((g) => (
        <Escolha key={g.titulo} rotulo={g.titulo} opcoes={g.tipos.filter((t) => t.valor !== 'venda')} valor={tipo ? [tipo] : []} aoMudar={(v) => escolherTipo(v[0] as TipoMov)} />
      ))}
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

          {/* ----- lote de destino ----- */}
          {(entrada || tipo === 'transferencia_lote') && (
            <SeletorLista
              rotulo="Lote de destino *"
              valorId={destino?.id ?? null}
              aoMudar={escolherDestino}
              carregar={carregarLotes}
              erro={erros.destino}
              vazio="Nenhum lote ativo. Abra em Pecuário › Lotes."
            />
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
              {tipo !== 'nascimento' && <CampoNascimento rotulo="Idade *" valor={nasc} aoMudar={setNasc} baseIso={baseIso} erro={erros.nasc} />}
              <CampoFerro valorId={ferroId} aoMudar={setFerroId} />
            </>
          )}

          {/* ----- negócio ----- */}
          {pessoa && <CampoPessoaBusca rotulo={pessoa.rotulo} valorId={pessoaId} aoMudar={setPessoaId} tipoNovo={pessoa.tipoNovo} />}
          {(pessoa || tipo === 'morte') && tipo !== 'nascimento' && (
            <View style={estilos.linha}>
              {tipo !== 'morte' && (
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Peso total (kg)"
                    value={peso}
                    onChangeText={(t) => setPeso(t.replace(/[^\d.,]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder={tipo === 'compra' ? 'Para preço por @ ou kg' : 'Opcional'}
                    erro={erros.peso}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Campo rotulo={tipo === 'morte' ? 'Laudo / documento' : 'GTA / nota'} value={documento} onChangeText={setDocumento} autoCapitalize="characters" />
              </View>
            </View>
          )}
          <Campo
            rotulo={tipo === 'morte' ? 'Causa / observações' : 'Observações'}
            value={obs}
            onChangeText={setObs}
            multiline
            style={{ minHeight: 80, paddingTop: 12, textAlignVertical: 'top' }}
          />
          {tipo === 'compra' && <ValorCompraAnimais ref={valorCompra} fazendaId={fid} cabecas={Number(quantidade || 0)} pesoBruto={lerNumero(peso) ?? 0} data={data} />}

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
});
