import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { useAvisoTemporario } from '../../lib/useAvisoTemporario';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { agruparDigitacao, formatarNumero, lerNumero } from '../../lib/formatos';
import { SEXOS, identAnimal, nomeLote, resumoComposicao } from '../../lib/rebanho';
import { limparBusca } from '../../lib/useBusca';
import { useSigla } from '../../lib/useSigla';
import { ARROBA_PADRAO, OBJETIVOS, PADRAO_OBJETIVO, TIPOS_DESTINO, TIPOS_ORIGEM, TIPO_PESSOA_NOVA, arrobas } from '../../lib/pesagens';
import ConsultaPesagens from './ConsultaPesagens';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Pesada = { brinco: string; qtd: string; peso: string };
type Lado = { tipo: string[]; fazendaId: string | null; pessoaId: string | null; texto: string };

const PESADA_VAZIA: Pesada = { brinco: '', qtd: '1', peso: '' };
const doisDigitos = (n: number) => String(n).padStart(2, '0');

export default function PesagemForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'PesagemForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id ?? null;
  const { sigla } = useSigla(fid);
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const avisoAnterior = useAvisoTemporario(params?.aviso);

  const [proximoNumero, setProximoNumero] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [objetivo, setObjetivo] = useState<string[]>(['controle']);
  const [objetivoOutro, setObjetivoOutro] = useState('');
  const [origem, setOrigem] = useState<Lado>({ tipo: ['propria'], fazendaId: fid, pessoaId: null, texto: '' });
  const [destino, setDestino] = useState<Lado>({ tipo: ['propria'], fazendaId: fid, pessoaId: null, texto: '' });
  const [loteId, setLoteId] = useState<string | null>(null);
  const [sexo, setSexo] = useState<string[]>([]);
  const [racaId, setRacaId] = useState<string | null>(null);
  const [ferroId, setFerroId] = useState<string | null>(null);
  const [nasc, setNasc] = useState<ValorNascimento>(NASCIMENTO_VAZIO);
  const [pesoArroba, setPesoArroba] = useState(String(ARROBA_PADRAO));
  const [pesadas, setPesadas] = useState<Pesada[]>([{ ...PESADA_VAZIA }]);
  const [obs, setObs] = useState('');
  const [infoLote, setInfoLote] = useState<string | null>(null);
  const [cadastrados, setCadastrados] = useState<Record<string, { numero_interno: number; brinco: string | null }>>({});

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const baseIso = paraBanco(data) ?? hojeBanco();

  // Número que esta pesagem vai receber (o banco confirma ao gravar).
  useEffect(() => {
    if (!fid) return;
    supabase
      .from('pesagens')
      .select('numero')
      .eq('fazenda_id', fid)
      .order('numero', { ascending: false })
      .limit(1)
      .then(({ data: d }) => setProximoNumero(((d?.[0]?.numero as number) ?? 0) + 1));
  }, [fid]);

  // O objetivo sugere origem e destino.
  function mudarObjetivo(v: string[]) {
    setObjetivo(v);
    const p = PADRAO_OBJETIVO[v[0]];
    if (!p) return;
    setOrigem({ tipo: [p.origem], fazendaId: p.origem === 'propria' ? fid : null, pessoaId: null, texto: '' });
    setDestino({ tipo: [p.destino], fazendaId: p.destino === 'propria' ? fid : null, pessoaId: null, texto: '' });
  }

  // ---- listas ----
  const carregarFazendas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('fazendas').select('id, nome, ativa').order('nome'));
    return d.map((x) => ({ id: x.id, titulo: x.nome, oculto: !x.ativa }));
  }, []);
  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao').eq('fazenda_id', fid!).eq('situacao', 'ativo').order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla) }));
  }, [fid, sigla]);
  const carregarRacas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('racas').select('id, nome').order('nome'));
    return d.map((r) => ({ id: r.id, titulo: r.nome }));
  }, []);
  const carregarFerros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('ferros').select('id, descricao, proprio').order('proprio', { ascending: false }).order('descricao'));
    return d.map((x) => ({ id: x.id, titulo: x.descricao, detalhe: x.proprio ? 'Ferro próprio' : 'De terceiro' }));
  }, []);

  // O lote preenche sexo, raça, ferro e idade (dá para mudar).
  // Com lote, sexo, raça, idade e ferro são os do lote (só informação; a pesagem não mexe nos animais).
  async function escolherLote(id: string | null) {
    setLoteId(id);
    setInfoLote(null);
    if (!id) return;
    const { data: l } = await supabase
      .from('lotes')
      .select('sexo, categoria, raca_id, ferro_id, nascimento_ref, nascimento_aproximado, raca:racas!lotes_raca_id_fkey ( nome ), ferro:ferros!lotes_ferro_id_fkey ( descricao )')
      .eq('id', id)
      .single();
    if (!l) return;
    const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
    if (l.sexo?.trim()) setSexo([l.sexo.trim()]);
    if (l.raca_id) setRacaId(l.raca_id);
    if (l.ferro_id) setFerroId(l.ferro_id);
    if (l.nascimento_ref) setNasc(nascimentoDoBanco(l.nascimento_ref, l.nascimento_aproximado, baseIso));
    const comp = resumoComposicao({ sexo: l.sexo?.trim(), categoria: l.categoria, raca: um(l.raca)?.nome, nascimento: l.nascimento_ref, aproximado: l.nascimento_aproximado });
    const ferro = um(l.ferro)?.descricao;
    setInfoLote([comp || 'Composição não informada no lote', ferro ? `ferro ${ferro}` : null].filter(Boolean).join(', '));
  }

  // Brinco digitado: procura o animal já cadastrado (só para ligar o peso ao histórico dele).
  const listaBrincos = pesadas.map((p) => limparBusca(p.brinco).toUpperCase()).filter(Boolean);
  const chaveBrincos = listaBrincos.join('|');
  useEffect(() => {
    if (!fid || !listaBrincos.length) return setCadastrados({});
    const t = setTimeout(async () => {
      const { data: d } = await supabase
        .from('animais')
        .select('numero_interno, brinco')
        .eq('fazenda_id', fid)
        .eq('situacao', 'ativo')
        .or(listaBrincos.map((b) => `brinco.ilike.${b}`).join(','));
      const mapa: Record<string, { numero_interno: number; brinco: string | null }> = {};
      for (const a of (d ?? []) as any[]) mapa[(a.brinco ?? '').toUpperCase()] = a;
      setCadastrados(mapa);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, chaveBrincos]);

  // ---- pesadas ----
  function mudarPesada(i: number, campo: keyof Pesada, valor: string) {
    setPesadas((ps) => {
      const novas = ps.map((p, j) => {
        if (j !== i) return p;
        const n = { ...p, [campo]: valor };
        if (campo === 'brinco' && valor.trim()) n.qtd = '1'; // com brinco é sempre 1 cabeça
        return n;
      });
      // Preencheu o peso da última: já abre a próxima linha.
      const ultima = novas[novas.length - 1];
      if (ultima.peso.trim()) novas.push({ ...PESADA_VAZIA });
      return novas;
    });
  }
  const removerPesada = (i: number) => setPesadas((ps) => (ps.length === 1 ? [{ ...PESADA_VAZIA }] : ps.filter((_, j) => j !== i)));

  const arroba = lerNumero(pesoArroba) ?? 0;
  const validas = pesadas
    .map((p, i) => ({ i, brinco: p.brinco.trim().toUpperCase(), qtd: Number(p.qtd || 0), kg: lerNumero(p.peso) }))
    .filter((p) => p.kg !== null && (p.kg as number) > 0) as { i: number; brinco: string; qtd: number; kg: number }[];
  const quantidade = validas.reduce((s, p) => s + p.qtd, 0);
  const pesoBruto = validas.reduce((s, p) => s + p.kg, 0);
  const qtdArrobas = arrobas(pesoBruto, arroba);
  const arrobasMedia = quantidade ? qtdArrobas / quantidade : 0;

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    const iso = paraBanco(data);
    const lido = lerNascimento(nasc, baseIso);
    if (!dataValida(data) || !iso) e.data = 'Data inválida.';
    else if (iso > hojeBanco()) e.data = 'A data não pode ser futura.';
    if (objetivo[0] === 'outros' && !objetivoOutro.trim()) e.objetivo = 'Escreva qual é o objetivo.';
    if (objetivo[0] === 'controle' && !loteId) e.lote = 'Na pesagem de controle, escolha o lote.';
    if (!arroba || arroba <= 0) e.arroba = 'Informe o peso da arroba bruta.';
    if (lido.erro) e.nasc = lido.erro;
    if (validas.length === 0) e.pesadas = 'Lance pelo menos uma pesada (peso maior que zero).';
    if (validas.some((p) => p.qtd < 1)) e.pesadas = 'Informe a quantidade de cabeças de cada pesada.';
    if (validas.some((p) => p.kg / Math.max(p.qtd, 1) > 2000)) e.pesadas = 'Há pesada com mais de 2.000 kg por cabeça. Confira.';
    const brincos = validas.filter((p) => p.brinco).map((p) => p.brinco);
    if (new Set(brincos).size !== brincos.length) e.pesadas = 'Há brinco repetido nas pesadas.';
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');

    const lado = (l: Lado) => ({
      tipo: l.tipo[0],
      fazenda: l.tipo[0] === 'propria' ? l.fazendaId : null,
      pessoa: ['fornecedor', 'cliente', 'parceiro'].includes(l.tipo[0]) ? l.pessoaId : null,
      texto: l.tipo[0] === 'propria' ? null : l.texto,
    });
    const o = lado(origem);
    const d = lado(destino);

    setSalvando(true);
    const { data: r, error } = await supabase.rpc('lancar_pesagem', {
      p: {
        fazenda: fid,
        data: iso,
        objetivo: objetivo[0],
        objetivo_outro: objetivoOutro,
        origem_tipo: o.tipo,
        origem_fazenda: o.fazenda,
        origem_pessoa: o.pessoa,
        origem_texto: o.texto,
        destino_tipo: d.tipo,
        destino_fazenda: d.fazenda,
        destino_pessoa: d.pessoa,
        destino_texto: d.texto,
        lote: loteId,
        sexo: sexo[0] ?? null,
        raca: racaId,
        ferro: ferroId,
        nascimento: lido.iso,
        nasc_aprox: lido.aprox,
        peso_arroba: arroba,
        obs,
        itens: validas.map((p) => ({ brinco: p.brinco || null, quantidade: p.qtd, peso: p.kg })),
      },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; cabecas: number; peso: number; arrobas: number };
    navegacao.replace('PesagemForm', {
      aviso: `Pesagem nº ${res.numero} lançada: ${formatarNumero(res.cabecas)} cab., ${formatarNumero(res.peso, 1)} kg, ${formatarNumero(res.arrobas, 2)} arrobas. Na movimentação, informe o nº ${res.numero} para puxar estes dados.`,
    });
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Lançar" />;

  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaPesagens />
      </Tela>
    );
  }

  return (
    <Tela
      rodape={
        <RodapeAcoes
          titulo="Lançar pesagem"
          aoConfirmar={salvar}
          carregando={salvando}
          aoDescartar={() => navegacao.replace('PesagemForm')}
          erro={erro ? `${erro}${Object.values(erros).filter(Boolean).length ? ' ' + Object.values(erros).filter(Boolean)[0] : ''}` : null}
        />
      }
    >
      {abas}
      {avisoAnterior && <Aviso tipo="sucesso" texto={avisoAnterior} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {/* ----- cabeçalho ----- */}
      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Pesagem nº</Text>
          <Text style={estilos.numeroValor}>{proximoNumero ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      <Escolha rotulo="Objetivo" opcoes={OBJETIVOS} valor={objetivo} aoMudar={mudarObjetivo} />
      {objetivo[0] === 'outros' && <Campo rotulo="Qual objetivo? *" value={objetivoOutro} onChangeText={setObjetivoOutro} autoCapitalize="sentences" erro={erros.objetivo} />}

      <LadoPesagem titulo="Origem" opcoes={TIPOS_ORIGEM} valor={origem} aoMudar={setOrigem} carregarFazendas={carregarFazendas} />
      <LadoPesagem titulo="Destino" opcoes={TIPOS_DESTINO} valor={destino} aoMudar={setDestino} carregarFazendas={carregarFazendas} />

      {/* ----- animais ----- */}
      <Secao titulo="Animais" />
      <SeletorLista rotulo={objetivo[0] === 'controle' ? 'Lote *' : 'Lote'} valorId={loteId} aoMudar={escolherLote} carregar={carregarLotes} permitirLimpar erro={erros.lote} vazio="Nenhum lote ativo." />
      <Text style={estilos.nota}>{loteId ? 'Vieram do lote; pode mudar.' : 'Dados dos animais desta pesagem.'} A pesagem não cria nem altera cadastro de animal.</Text>
      <Escolha rotulo="Sexo" opcoes={SEXOS} valor={sexo} aoMudar={setSexo} />
      <CampoRaca valorId={racaId} aoMudar={setRacaId} />
      <CampoNascimento rotulo="Idade" valor={nasc} aoMudar={setNasc} baseIso={baseIso} erro={erros.nasc} />
      <CampoFerro valorId={ferroId} aoMudar={setFerroId} />
      <Campo
        rotulo="Peso da arroba bruta (kg)"
        value={pesoArroba}
        onChangeText={(t) => setPesoArroba(t.replace(/[^\d.,]/g, ''))}
        keyboardType="decimal-pad"
        ajuda="Padrão 30 kg. Arrobas = peso bruto ÷ peso da arroba bruta."
        erro={erros.arroba}
      />

      {/* ----- pesadas ----- */}
      <Secao titulo="Pesadas" />
      <View style={estilos.tabela}>
        <View style={[estilos.linhaTabela, estilos.cabecalho]}>
          <Text style={[estilos.cOrd, estilos.th]}>Ord.</Text>
          <Text style={[estilos.cBrinco, estilos.th]}>Brinco</Text>
          <Text style={[estilos.cQtd, estilos.th]}>Qtde.</Text>
          <Text style={[estilos.cPeso, estilos.th]}>Peso bruto</Text>
        </View>
        {pesadas.map((p, i) => {
          const kg = lerNumero(p.peso);
          const arr = kg && arroba ? arrobas(kg, arroba) : null;
          const temBrinco = !!p.brinco.trim();
          return (
            <View key={i} style={[estilos.blocoPesada, i > 0 && estilos.divisor]}>
              <View style={estilos.linhaTabela}>
                <Text style={[estilos.cOrd, estilos.ord]}>{doisDigitos(i + 1)}</Text>
                <TextInput
                  value={p.brinco}
                  onChangeText={(v) => mudarPesada(i, 'brinco', v.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="—"
                  placeholderTextColor={cores.textoSuave}
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  style={[estilos.entrada, estilos.cBrinco]}
                  accessibilityLabel={`Brinco da pesada ${i + 1}`}
                />
                <TextInput
                  value={p.qtd}
                  onChangeText={(v) => mudarPesada(i, 'qtd', v.replace(/\D/g, '').slice(0, 4))}
                  editable={!temBrinco}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  style={[estilos.entrada, estilos.cQtd, temBrinco && estilos.travado]}
                  accessibilityLabel={`Quantidade da pesada ${i + 1}`}
                />
                <TextInput
                  value={p.peso}
                  onChangeText={(v) => mudarPesada(i, 'peso', agruparDigitacao(v))}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder="kg"
                  placeholderTextColor={cores.textoSuave}
                  autoComplete="off"
                  textContentType="none"
                  spellCheck={false}
                  style={[estilos.entrada, estilos.cPeso]}
                  accessibilityLabel={`Peso bruto da pesada ${i + 1}`}
                />
              </View>
              <View style={estilos.rodapePesada}>
                <Text style={estilos.arrobas}>
                  {arr !== null ? `${formatarNumero(arr, 2)} arrobas` : ' '}
                  {temBrinco ? (cadastrados[p.brinco.trim().toUpperCase()] ? `   Animal ${identAnimal(cadastrados[p.brinco.trim().toUpperCase()])}` : '   Brinco sem cadastro') : ''}
                </Text>
                {(p.peso || p.brinco || pesadas.length > 1) && (
                  <Pressable onPress={() => removerPesada(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remover pesada ${i + 1}`}>
                    <Text style={estilos.remover}>Remover</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </View>
      <Text style={estilos.nota}>
        Com brinco, a pesada é de 1 cabeça e o peso entra no histórico do animal cadastrado com esse brinco. Sem brinco, informe quantas subiram juntas. Ao preencher o peso, abre a próxima linha.
      </Text>
      {erros.pesadas && <Text style={estilos.erro}>{erros.pesadas}</Text>}

      {/* ----- totais ----- */}
      <View style={estilos.totais}>
        <Total rotulo="Quantidade" valor={`${formatarNumero(quantidade)} cab.`} />
        <Total rotulo="Peso bruto" valor={`${formatarNumero(pesoBruto, 1)} kg`} />
        <Total rotulo="Qtde. de arrobas" valor={formatarNumero(qtdArrobas, 2)} />
        <Total rotulo="Arrobas média" valor={formatarNumero(arrobasMedia, 2)} />
      </View>
      {quantidade > 0 && <Text style={estilos.nota}>Média de {formatarNumero(pesoBruto / quantidade, 1)} kg por cabeça.</Text>}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />
    </Tela>
  );
}

/** Origem ou destino: tipo e, conforme o tipo, a fazenda, a pessoa ou um texto livre. */
function LadoPesagem({
  titulo,
  opcoes,
  valor,
  aoMudar,
  carregarFazendas,
}: {
  titulo: string;
  opcoes: { valor: string; rotulo: string }[];
  valor: Lado;
  aoMudar: (l: Lado) => void;
  carregarFazendas: () => Promise<ItemLista[]>;
}) {
  const t = valor.tipo[0];
  return (
    <View style={{ gap: 10 }}>
      <Escolha rotulo={titulo} opcoes={opcoes} valor={valor.tipo} aoMudar={(v) => aoMudar({ ...valor, tipo: v, pessoaId: null, texto: '' })} />
      {t === 'propria' && <SeletorLista rotulo="Fazenda" valorId={valor.fazendaId} aoMudar={(id) => aoMudar({ ...valor, fazendaId: id })} carregar={carregarFazendas} />}
      {TIPO_PESSOA_NOVA[t] && (
        <CampoPessoaBusca
          key={t}
          rotulo={opcoes.find((o) => o.valor === t)?.rotulo ?? 'Pessoa'}
          valorId={valor.pessoaId}
          aoMudar={(id) => aoMudar({ ...valor, pessoaId: id })}
          tipoNovo={TIPO_PESSOA_NOVA[t]}
        />
      )}
      {TIPO_PESSOA_NOVA[t] && (
        <Campo
          rotulo={`Fazenda do ${t === 'fornecedor' ? 'fornecedor' : t === 'cliente' ? 'cliente' : 'parceiro'}`}
          value={valor.texto}
          onChangeText={(x) => aoMudar({ ...valor, texto: x })}
          autoCapitalize="words"
          placeholder="Nome da fazenda (opcional)"
        />
      )}
      {t === 'outros' && <Campo rotulo={`${titulo}: qual?`} value={valor.texto} onChangeText={(x) => aoMudar({ ...valor, texto: x })} autoCapitalize="sentences" />}
    </View>
  );
}

function Total({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.total}>
      <Text style={estilos.totalRotulo}>{rotulo}</Text>
      <Text style={estilos.totalValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  numero: { width: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  erro: { fontSize: tam.pequeno, color: cores.erro },

  tabela: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, overflow: 'hidden' },
  cabecalho: { backgroundColor: cores.fundo, paddingVertical: 8 },
  th: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  linhaTabela: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  blocoPesada: { paddingTop: 8, paddingBottom: 4 },
  divisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  cOrd: { width: 30 },
  cBrinco: { flex: 1.1 },
  cQtd: { width: 56 },
  cPeso: { flex: 1.2 },
  ord: { fontSize: tam.texto, fontWeight: '700', color: cores.textoSuave },
  entrada: {
    minHeight: 46,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: tam.raio,
    paddingHorizontal: 8,
    fontSize: tam.texto,
    color: cores.texto,
    textAlign: 'center',
  },
  travado: { backgroundColor: cores.fundo, color: cores.textoSuave },
  rodapePesada: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 44, paddingRight: 10, paddingTop: 2 },
  arrobas: { fontSize: tam.pequeno, color: cores.cafe, fontWeight: '600' },
  remover: { fontSize: tam.pequeno, color: cores.erro, fontWeight: '600' },

  totais: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  total: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: cores.sucessoFundo,
    borderRadius: tam.raio,
    padding: 10,
    gap: 2,
  },
  totalRotulo: { fontSize: tam.pequeno, color: cores.primariaEscura },
  totalValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
});
