import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import AbasTela from '../../componentes/AbasTela';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoSugestao from '../../componentes/CampoSugestao';
import CampoGenitor, { type Genitor } from '../../componentes/CampoGenitor';
import CriadorRapido from '../../componentes/CriadorRapido';
import CampoNascimento, { NASCIMENTO_VAZIO, lerNascimento, nascimentoDoBanco, type ValorNascimento } from '../../componentes/CampoNascimento';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { CampoFerro, CampoRaca } from '../../componentes/CamposApoio';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { CATEGORIAS, OBJETIVOS_ANIMAL, SEXOS, SITUACOES_ANIMAL, idadeTexto, identAnimal, localDoLote, nomeLote } from '../../lib/rebanho';
import DepsAnimal from '../../componentes/DepsAnimal';
import PesosAnimal from '../../componentes/PesosAnimal';
import { gravarDepsAnimal, lerDepsAnimal, validarDeps, type ValoresDep } from '../../lib/deps';
import { BISAVOS, BISAVOS_VAZIOS, CONCEPCOES, montarNome, normalizarRegistro, rotuloAscendente, sugestoesPelagem, tirarAfixo } from '../../lib/genealogia';
import { perguntar, sexoDoLote } from '../../lib/perguntar';
import { criadorPadrao, lerCriador, type Criador } from '../../lib/criadores';
import { useSigla } from '../../lib/useSigla';
import { ConsultaCorpo } from './ConsultaAnimal';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Controle = 'sem' | 'com';

type Form = {
  controle: Controle;
  brinco: string;
  nome: string;
  sexo: string[];
  categoria: string[];
  racaId: string | null;
  grau: string;
  nasc: ValorNascimento; // sem controle: idade em meses ou data
  dataNasc: string; // com controle: data de nascimento (dd/mm/aaaa)
  ferroId: string | null;
  loteId: string | null;
  objetivo: string[]; // sem controle: corte ou reprodução sem controle
  // sem controle: filiação opcional pelo rebanho
  maeId: string | null;
  maeExterna: string;
  paiId: string | null;
  paiExterno: string;
  // com controle
  criadorId: string | null;
  rgn: string;
  tipoRegistro: string[]; // RGN | RGD
  afixo: string[]; // Sufixo/Afixo antes ou depois do nome
  nomeEsc: string; // nome escolhido pelo criador (sem o Sufixo/Afixo)
  concepcao: string[];
  pelagem: string;
  pesoNascer: string;
  ce: string;
  mae: Genitor;
  pai: Genitor;
  avoMaterna: string;
  avoMaterno: string;
  avoPaterna: string;
  avoPaterno: string;
  /** bisavós (V127): chave = caminho (ex.: 'mpm' = mãe do avô materno) */
  bis: Record<string, string>;
  // os dois
  peso: string;
  situacao: string[];
  obs: string;
};

const NOVO: Form = {
  controle: 'sem', brinco: '', nome: '', sexo: [], categoria: [], racaId: null, grau: '', nasc: NASCIMENTO_VAZIO, dataNasc: '',
  ferroId: null, loteId: null, objetivo: [], maeId: null, maeExterna: '', paiId: null, paiExterno: '',
  criadorId: null, rgn: '', tipoRegistro: ['RGN'], afixo: ['depois'], nomeEsc: '', concepcao: [], pelagem: '', pesoNascer: '', ce: '',
  mae: { texto: '', id: null }, pai: { texto: '', id: null }, avoMaterna: '', avoMaterno: '', avoPaterna: '', avoPaterno: '', bis: BISAVOS_VAZIOS,
  peso: '', situacao: ['ativo'], obs: '',
};

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default function AnimalForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AnimalForm'>>();
  const id = params?.id;
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [loteSexo, setLoteSexo] = useState<'M' | 'F' | null>(null);
  const [criador, setCriador] = useState<Criador | null>(null);
  const [registroAtual, setRegistroAtual] = useState<string | null>(null);
  const [aba, setAba] = useState<string[]>([params?.aba ?? 'cadastrar']);
  // RGN/RGD: por padrão o sistema cria; só se informa em animal comprado já registrado.
  // Registro: 'sistema' = número da sequência da Série; 'comprado' = animal comprado de outro produtor, já registrado.
  // Registro digitado (ex.: SCS1). Da Série do produtor, o número vem do sistema;
  // de outro criatório (outra Série), informa-se o número do registro dele.
  const [serieProdutor, setSerieProdutor] = useState<Criador | null>(null);
  const [regTexto, setRegTexto] = useState('');
  const [regEditado, setRegEditado] = useState(false);
  const [serieInfo, setSerieInfo] = useState<Criador | null>(null);
  const [buscandoSerie, setBuscandoSerie] = useState(false);
  // Sufixo/Afixo do animal: null = o da Série; texto = informado à mão (animal com outro Sufixo/Afixo).
  const [afixoEd, setAfixoEd] = useState<string | null>(null);
  const [afixoGravado, setAfixoGravado] = useState<string | null>(null);
  // Nome completo: null = montado (nome escolhido + Sufixo/Afixo); texto = informado à mão.
  const [nomeCompletoEd, setNomeCompletoEd] = useState<string | null>(null);
  const [novoCriador, setNovoCriador] = useState(false);

  const [f, setF] = useState<Form>({ ...NOVO, loteId: params?.loteId ?? null });
  const [numero, setNumero] = useState<number | null>(null);
  const [pesoOriginal, setPesoOriginal] = useState<{ kg: number | null; data: string | null }>({ kg: null, data: null });
  // DEPs oficiais (com controle genealógico)
  const [depPrograma, setDepPrograma] = useState<string | null>(null);
  const [depSumario, setDepSumario] = useState('');
  const [depValores, setDepValores] = useState<ValoresDep>({});
  // Onde o animal está hoje (lote e manga), mostrado na ficha aberta pela Consulta.
  const [onde, setOnde] = useState<{ lote: string | null; local: string | null } | null>(null);
  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState<'nao' | 'sair' | 'outro'>('nao');
  const [erro, setErro] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});

  const muda = <K extends keyof Form>(campo: K, valor: Form[K]) => setF((atual) => ({ ...atual, [campo]: valor }));
  const com = f.controle === 'com';

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? (registroAtual ? registroAtual.split(' ')[0] : numero ? `Animal nº ${numero}` : 'Animal') : 'Animais' });
  }, [navegacao, id, numero, registroAtual]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('animais')
      .select('*, mae:mae_id ( brinco, nome ), pai:pai_id ( brinco, nome )')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setErro(traduzirErro(error));
        else if (data) {
          const d = data as any;
          const genealogico = !!d.controle_genealogico || !!d.criador_id;
          setNumero(d.numero_interno);
          setPesoOriginal({ kg: d.peso_atual_kg ?? null, data: d.peso_atual_data ?? null });
          setF({
            controle: genealogico ? 'com' : 'sem',
            brinco: d.brinco ?? '',
            nome: d.nome ?? '',
            sexo: d.sexo ? [d.sexo.trim()] : [],
            categoria: d.categoria ? [d.categoria] : [],
            racaId: d.raca_id,
            grau: d.grau_sangue ?? '',
            nasc: nascimentoDoBanco(d.data_nascimento, d.nascimento_aproximado, hojeBanco()),
            dataNasc: d.nascimento_aproximado ? '' : doBanco(d.data_nascimento),
            ferroId: d.ferro_id,
            loteId: d.lote_id,
            objetivo: d.objetivo ? [d.objetivo] : [],
            maeId: d.mae_id,
            maeExterna: d.mae_externa ?? '',
            paiId: d.pai_id,
            paiExterno: d.pai_externo ?? '',
            criadorId: d.criador_id ?? null,
            rgn: d.rgn ? String(d.rgn) : '',
            tipoRegistro: [d.tipo_registro ?? 'RGN'],
            afixo: [d.afixo_posicao ?? 'depois'],
            nomeEsc: d.nome_escolhido ?? d.nome ?? '',
            concepcao: d.concepcao ? [d.concepcao] : [],
            pelagem: d.pelagem ?? '',
            pesoNascer: numeroParaCampo(d.peso_nascer_kg),
            ce: numeroParaCampo(d.ce_cm),
            mae: { texto: rotuloAscendente(um(d.mae), d.mae_externa), id: d.mae_id },
            pai: { texto: rotuloAscendente(um(d.pai), d.pai_externo), id: d.pai_id },
            avoMaterna: d.avo_materna ?? '',
            avoMaterno: d.avo_materno ?? '',
            avoPaterna: d.avo_paterna ?? '',
            avoPaterno: d.avo_paterno ?? '',
            bis: Object.fromEntries(BISAVOS.map((b) => [b.chave, d[`bisavo_${b.chave}`] ?? ''])),
            peso: numeroParaCampo(d.peso_atual_kg),
            situacao: [d.situacao],
            obs: d.observacoes ?? '',
          });
          setRegistroAtual(d.registro ?? null);
          setDepPrograma(d.dep_programa ?? null);
          setDepSumario(d.dep_sumario ?? '');
          if (genealogico) lerDepsAnimal(d.id).then(setDepValores).catch(() => {});
          setAfixoGravado(d.sufixo_afixo ?? null);
          // Aberto pela Consulta: o nome do animal é o nome completo do cadastro.
          if (d.controle_genealogico || d.criador_id) {
            // Nome completo do cadastro; se faltar, tenta o nome escolhido + Sufixo/Afixo, ou o que vem depois da Série no registro.
            const doRegistro = d.registro && d.brinco && d.registro.startsWith(d.brinco) ? d.registro.slice(d.brinco.length).trim() : '';
            const doEscolhido = d.nome_escolhido ? montarNome(d.nome_escolhido, d.sufixo_afixo, d.afixo_posicao ?? 'depois') : '';
            setNomeCompletoEd((d.nome ?? '').trim() || doEscolhido || doRegistro);
          }
        }
        setCarregando(false);
      });
  }, [id]);

  // Série do produtor (ou da fazenda): de onde sai a sequência automática do RGN/RGD.
  const carregarSerieProdutor = useCallback(async () => {
    const c = await criadorPadrao(fid);
    setSerieProdutor(c ? await lerCriador(c) : null);
  }, [fid]);
  useEffect(() => {
    if (!id && f.controle === 'com') carregarSerieProdutor();
  }, [id, f.controle, carregarSerieProdutor]);

  // Enquanto não for alterado, o registro mostra o próximo da Série do produtor (ex.: SCS1).
  useEffect(() => {
    if (!regEditado && serieProdutor) setRegTexto(`${serieProdutor.sui}${serieProdutor.rgn_ultimo + 1}`);
  }, [serieProdutor, regEditado]);

  // Série digitada: procura no cadastro (para trazer o Sufixo/Afixo).
  const regNorm = normalizarRegistro(regTexto);
  const regSerie = /^([A-Z]{2,5})/.exec(regNorm)?.[1] ?? '';
  const regNumero = /^[A-Z]{2,5}(\d+)$/.exec(regNorm)?.[1] ?? '';
  const seriePropria = !!serieProdutor && regSerie === serieProdutor.sui;

  // Sufixo/Afixo e nome completo que valem para este animal.
  const afixoDaSerie = (registroAtual ? afixoGravado ?? criador?.sufixo : serieInfo?.sufixo) ?? '';
  const afixoUsado = afixoEd ?? afixoDaSerie;
  const nomeAuto = montarNome(tirarAfixo(f.nomeEsc, afixoUsado), afixoUsado, f.afixo[0] as 'antes' | 'depois');
  const nomeFinal = (nomeCompletoEd ?? nomeAuto).trim().replace(/\s+/g, ' ');
  useEffect(() => {
    if (id || f.controle !== 'com' || regSerie.length < 2) return setSerieInfo(null);
    if (serieProdutor && regSerie === serieProdutor.sui) return setSerieInfo(serieProdutor);
    setBuscandoSerie(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('pessoas').select('id, nome, sui, sufixo, rgn_ultimo').eq('sui', regSerie).maybeSingle();
      setSerieInfo((data as Criador) ?? null);
      setBuscandoSerie(false);
    }, 400);
    return () => clearTimeout(t);
  }, [id, f.controle, regSerie, serieProdutor]);

  // Criador escolhido: Série Alfabética (SUI), sufixo/afixo e próximo RGN.
  useEffect(() => {
    if (!f.criadorId) return setCriador(null);
    lerCriador(f.criadorId).then(setCriador);
  }, [f.criadorId]);

  // Cadastrar: digitou o registro (ou o brinco) de um animal que já existe -> pergunta se quer alterar o cadastro dele.
  const jaPerguntado = useRef<string>('');
  const chaveExistente = id ? '' : com ? (regEditado ? regNorm : '') : f.brinco.trim().toUpperCase();
  useEffect(() => {
    if (!chaveExistente || chaveExistente.length < 2 || !fid) return;
    if (com && !/^[A-Z]{2,5}\d+$/.test(chaveExistente)) return;
    const t = setTimeout(async () => {
      if (jaPerguntado.current === chaveExistente) return;
      let q = supabase.from('animais').select('id, numero_interno, brinco, registro, nome').ilike('brinco', chaveExistente);
      if (!com) q = q.eq('fazenda_id', fid);
      const { data } = await q.limit(1);
      const a = (data ?? [])[0] as any;
      if (!a) return;
      jaPerguntado.current = chaveExistente;
      const quem = a.registro ?? [`Nº ${a.numero_interno}`, a.brinco ? `brinco ${a.brinco}` : null, a.nome].filter(Boolean).join(', ');
      const alterar = await perguntar('Animal já cadastrado', `${quem} já está cadastrado${a.nome ? '' : ' (sem nome)'}. Quer alterar o cadastro dele?`, 'Alterar cadastro', 'Não');
      if (alterar) navegacao.replace('AnimalForm', { id: a.id });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveExistente, com, fid]);

  // ---- listas para escolher ----
  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, situacao, sexo').eq('fazenda_id', fid!).order('numero'));
    return d.map((l) => ({
      id: l.id,
      titulo: nomeLote(l, sigla),
      detalhe: l.sexo === 'M' ? 'Lote de machos' : l.sexo === 'F' ? 'Lote de fêmeas' : null,
      oculto: l.situacao !== 'ativo',
    }));
  }, [fid, sigla]);

  // Ao escolher o lote: o sexo segue o lote; num animal novo, raça, ferro, categoria e idade vêm do lote.
  const escolherLote = useCallback(async (loteId: string | null, preencher: boolean) => {
    setF((a) => ({ ...a, loteId }));
    if (!loteId) return setLoteSexo(null);
    const { data: l } = await supabase
      .from('lotes')
      .select('sexo, categoria, raca_id, ferro_id, nascimento_ref, nascimento_aproximado, data_abertura')
      .eq('id', loteId)
      .single();
    if (!l) return;
    const sx = (l.sexo?.trim() || null) as 'M' | 'F' | null;
    setLoteSexo(sx);
    setF((a) => {
      const novo = { ...a };
      if (sx && a.sexo[0] !== sx) {
        novo.sexo = [sx];
        novo.categoria = [];
      }
      if (preencher) {
        if (!a.racaId && l.raca_id) novo.racaId = l.raca_id;
        if (!a.ferroId && l.ferro_id) novo.ferroId = l.ferro_id;
        if (novo.categoria.length === 0 && l.categoria) novo.categoria = [l.categoria];
        const semNasc = a.nasc.modo === 'exata' ? !a.nasc.data : !a.nasc.meses;
        if (a.controle === 'sem' && semNasc && l.nascimento_ref) novo.nasc = nascimentoDoBanco(l.nascimento_ref, l.nascimento_aproximado, hojeBanco());
      }
      return novo;
    });
  }, []);

  // Veio de dentro de um lote: já puxa os dados dele.
  useEffect(() => {
    if (!id && params?.loteId) escolherLote(params.loteId, true);
  }, [id, params?.loteId, escolherLote]);

  // Editando: descobre o sexo do lote atual.
  useEffect(() => {
    if (!id || !f.loteId || loteSexo) return;
    supabase.from('lotes').select('sexo').eq('id', f.loteId).single().then(({ data }) => setLoteSexo((data?.sexo?.trim() || null) as any));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, f.loteId]);

  // Ficha aberta: em qual lote está e onde o lote está (manga, confinamento...).
  useEffect(() => {
    if (!id) return;
    if (!f.loteId) return setOnde({ lote: null, local: null });
    supabase
      .from('lotes')
      .select('numero, descricao, manga:areas!lotes_manga_id_fkey ( nome, indicacao_uso )')
      .eq('id', f.loteId)
      .single()
      .then(({ data }) => setOnde(data ? { lote: nomeLote(data as any, sigla), local: localDoLote(um((data as any).manga)) } : null));
  }, [id, f.loteId, sigla]);

  const carregarPais = useCallback(
    (sexoPai: 'M' | 'F') => async (): Promise<ItemLista[]> => {
      let q = supabase.from('animais').select('id, numero_interno, brinco, nome, situacao').eq('fazenda_id', fid!).eq('sexo', sexoPai).order('numero_interno');
      if (id) q = q.neq('id', id);
      const d = await consulta<any[]>(q);
      return d.map((a) => ({
        id: a.id,
        titulo: [identAnimal(a), a.nome].filter(Boolean).join('  '),
        detalhe: a.situacao !== 'ativo' ? 'Fora do rebanho' : null,
      }));
    },
    [fid, id],
  );

  // ---- salvar ----
  function validar(): boolean {
    const e: Partial<Record<keyof Form, string>> = {};
    const lista: string[] = [];
    const falha = (campo: keyof Form, rotulo: string, msg: string) => {
      e[campo] = msg;
      lista.push(`${rotulo}: ${msg}`);
    };
    const numOk = (texto: string) => !texto.trim() || ((lerNumero(texto) ?? -1) > 0);

    if (f.sexo.length === 0) falha('sexo', 'Sexo', 'escolha o sexo');
    if (com) {
      if (!registroAtual) {
        if (!regSerie) falha('rgn', 'Série Alfabética e RGN/RGD', 'digite a Série (letras), ex.: SCS');
        else if (!regNumero || Number(regNumero) < 1)
          falha('rgn', 'Série Alfabética e RGN/RGD', seriePropria ? 'falta o número' : `animal de outro criatório: informe o número do registro (ex.: ${regSerie}123)`);
      }
      if (registroAtual) {
        if (!nomeFinal) falha('nomeEsc', 'Nome do animal', 'informe o nome completo');
      } else if (!f.nomeEsc.trim()) falha('nomeEsc', 'Nome escolhido pelo criador', 'informe o nome');
      else if (!nomeFinal) falha('nomeEsc', 'Nome do animal', 'informe o nome completo');
      if (!f.dataNasc.trim()) falha('dataNasc', 'Data de nascimento', 'informe a data');
      else if (!dataValida(f.dataNasc)) falha('dataNasc', 'Data de nascimento', 'data inválida');
      else if (paraBanco(f.dataNasc)! > hojeBanco()) falha('dataNasc', 'Data de nascimento', 'não pode ser no futuro');
      if (!numOk(f.pesoNascer)) falha('pesoNascer', 'Peso ao nascer', 'número inválido');
      if (f.sexo[0] === 'M' && !numOk(f.ce)) falha('ce', 'CE', 'número inválido');
    } else {
      const lido = lerNascimento(f.nasc, hojeBanco());
      if (lido.erro) falha('nasc', 'Idade', lido.erro);
      else if (!lido.iso) falha('nasc', 'Idade', 'informe a idade em meses ou a data de nascimento');
    }
    if (!numOk(f.peso)) falha('peso', com ? 'Peso atual' : 'Peso', 'número inválido');
    if (com && depPrograma) {
      const problema = validarDeps(depValores);
      if (problema) lista.push(`DEPs: ${problema}`);
    }
    setErros(e);
    setProblemas(lista);
    return lista.length === 0;
  }

  async function salvar(modo: 'sair' | 'outro') {
    setErro(null);
    setSucesso(null);
    if (!validar() || !fid) return;
    if (id) {
      const quem = registroAtual ? (com ? `${registroAtual.split(' ')[0]} ${nomeFinal}`.trim() : registroAtual) : `o animal nº ${numero}`;
      const ok = await perguntar('Confirmar', `Confirmar a alteração do cadastro de ${quem}?`, 'Confirmar', 'Voltar');
      if (!ok) return;
    }

    // Sexo diferente do lote: pergunta antes (Alterar ou Confirmar).
    let sexoDiferente = false;
    if (f.loteId) {
      const l = await sexoDoLote(supabase, f.loteId, id);
      if (l.sexo && l.sexo !== f.sexo[0]) {
        const ok = await perguntar(
          `Lote de ${l.sexo === 'M' ? 'machos' : 'fêmeas'}`,
          `O lote ${l.numero ?? ''} é de ${l.sexo === 'M' ? 'machos' : 'fêmeas'} e este animal é ${f.sexo[0] === 'M' ? 'macho' : 'fêmea'}. Quer incluir assim mesmo?`,
        );
        if (!ok) return;
        sexoDiferente = true;
      }
    }
    setSalvando(modo);

    const parar = (campo: keyof Form, msg: string) => {
      setSalvando('nao');
      setErros({ [campo]: msg });
      setProblemas([msg]);
    };

    // Série e número: da Série do produtor, o próximo da sequência vai em branco (o banco numera);
    // de outro criatório, usa o número informado. Série nova é cadastrada sozinha.
    let criadorUsar = f.criadorId;
    let rgnUsar: number | null = f.rgn ? Number(f.rgn) : null;
    if (com && !registroAtual) {
      const num = Number(regNumero);
      const existe = serieInfo && serieInfo.sui === regSerie ? serieInfo : ((await supabase.from('pessoas').select('id, nome, sui, sufixo, rgn_ultimo').eq('sui', regSerie).maybeSingle()).data as Criador | null);
      if (existe) {
        criadorUsar = existe.id;
        rgnUsar = seriePropria && num === existe.rgn_ultimo + 1 ? null : num;
      } else {
        const { data: nova, error: e1 } = await supabase
          .from('pessoas')
          .insert({ nome: `Criatório ${regSerie}`, tipos: ['criador'], sui: regSerie, sufixo: (afixoEd ?? '').trim() || null, rgn_ultimo: 0 })
          .select('id')
          .single();
        if (e1) {
          setSalvando('nao');
          return setErro(traduzirErro(e1));
        }
        criadorUsar = (nova as any).id;
        rgnUsar = num;
      }
    }

    // Registrado: o mesmo RGN/RGD não pode existir duas vezes na mesma Série.
    if (com && criadorUsar && rgnUsar) {
      let q = supabase.from('animais').select('numero_interno').eq('criador_id', criadorUsar).eq('rgn', rgnUsar);
      if (id) q = q.neq('id', id);
      const { data: mesmo } = await q.limit(1);
      if (mesmo && mesmo.length) return parar('rgn', `Série e RGN/RGD: o animal nº ${mesmo[0].numero_interno} já tem este registro.`);
    }

    // Brinco já usado nesta fazenda (qualquer situação). O do registrado vem da Série + RGN.
    if (!com && f.brinco.trim()) {
      let q = supabase.from('animais').select('numero_interno, situacao').eq('fazenda_id', fid).ilike('brinco', f.brinco.trim());
      if (id) q = q.neq('id', id);
      const { data: iguais } = await q.limit(1);
      if (iguais && iguais.length)
        return parar('brinco', `Brinco: já usado pelo animal nº ${iguais[0].numero_interno}${iguais[0].situacao !== 'ativo' ? ' (fora do rebanho)' : ''}.`);
    }

    const afixoAtual = afixoUsado;
    const pesoKg = lerNumero(f.peso);
    const pesoMudou = pesoKg !== (pesoOriginal.kg != null ? Number(pesoOriginal.kg) : null);
    const lidoNasc = lerNascimento(f.nasc, hojeBanco());

    const registro = {
      controle_genealogico: com,
      brinco: com ? undefined : f.brinco.trim() || null,
      nome: (com ? nomeFinal : f.nome.trim()) || null,
      nome_escolhido: com ? (registroAtual ? tirarAfixo(nomeFinal, afixoAtual) : tirarAfixo(f.nomeEsc, afixoAtual)) || null : null,
      sufixo_afixo: com ? afixoAtual.trim() : null,
      sexo: f.sexo[0],
      categoria: f.categoria[0] ?? null,
      raca_id: f.racaId,
      grau_sangue: f.grau.trim() || null,
      data_nascimento: com ? paraBanco(f.dataNasc) : lidoNasc.iso,
      nascimento_aproximado: com ? false : lidoNasc.aprox,
      ferro_id: f.ferroId,
      lote_id: f.loteId,
      objetivo: com ? null : f.objetivo[0] ?? null,
      dep_programa: com ? depPrograma : null,
      dep_sumario: com && depPrograma ? depSumario.trim() || null : null,
      mae_id: com ? f.mae.id : f.maeId,
      mae_externa: com ? (f.mae.id ? null : f.mae.texto.trim() || null) : f.maeId ? null : f.maeExterna.trim() || null,
      pai_id: com ? f.pai.id : f.paiId,
      pai_externo: com ? (f.pai.id ? null : f.pai.texto.trim() || null) : f.paiId ? null : f.paiExterno.trim() || null,
      avo_materna: com ? f.avoMaterna.trim() || null : null,
      avo_materno: com ? f.avoMaterno.trim() || null : null,
      avo_paterna: com ? f.avoPaterna.trim() || null : null,
      avo_paterno: com ? f.avoPaterno.trim() || null : null,
      ...Object.fromEntries(BISAVOS.map((b) => [`bisavo_${b.chave}`, com ? (f.bis[b.chave] ?? '').trim() || null : null])),
      criador_id: com ? criadorUsar : null,
      rgn: com ? rgnUsar : null,
      tipo_registro: com ? f.tipoRegistro[0] ?? 'RGN' : null,
      afixo_posicao: com ? f.afixo[0] ?? 'depois' : 'depois',
      concepcao: com ? f.concepcao[0] ?? null : null,
      pelagem: com ? f.pelagem.trim() || null : null,
      peso_nascer_kg: com ? lerNumero(f.pesoNascer) : null,
      ce_cm: com && f.sexo[0] === 'M' ? lerNumero(f.ce) : null,
      peso_atual_kg: pesoKg,
      peso_atual_data: pesoKg == null ? null : pesoMudou ? hojeBanco() : pesoOriginal.data ?? hojeBanco(),
      situacao: f.situacao[0],
      observacoes: f.obs.trim() || null,
      sexo_diferente_lote: sexoDiferente,
      // brinco e registro do registrado são formados pelo banco (Série + RGN)
    };

    if (id) {
      // Peso sem mudança (ou apagado): não mexe no peso gravado; o histórico de pesos fica como está.
      const alteracao: Record<string, any> = { ...registro };
      if (!pesoMudou || pesoKg == null) {
        delete alteracao.peso_atual_kg;
        delete alteracao.peso_atual_data;
      }
      let { error } = await supabase.from('animais').update(alteracao).eq('id', id);
      // banco ainda sem o arquivo da V127 (colunas dos bisavós): grava o resto
      if (error && /bisavo/i.test(error.message ?? '')) {
        for (const b of BISAVOS) delete alteracao[`bisavo_${b.chave}`];
        ({ error } = await supabase.from('animais').update(alteracao).eq('id', id));
        if (!error && BISAVOS.some((b) => (f.bis[b.chave] ?? '').trim())) Alert.alert('Bisavós não gravados', 'O cadastro foi salvo, mas os bisavós precisam do arquivo do banco da V127 (Supabase › SQL Editor).');
      }
      const falhaDeps = !error && com ? await gravarDepsAnimal(id, depPrograma, depValores) : null;
      setSalvando('nao');
      if (error) return setErro(traduzirErro(error));
      if (falhaDeps) return setErro(`Cadastro salvo, mas as DEPs não foram gravadas: ${falhaDeps}`);
      navegacao.goBack();
      return;
    }

    let { data, error } = await supabase.from('animais').insert({ ...registro, fazenda_id: fid }).select('id, numero_interno, registro').single();
    // banco ainda sem o arquivo da V127 (colunas dos bisavós): cadastra sem eles
    if (error && /bisavo/i.test(error.message ?? '')) {
      const semBis: Record<string, any> = { ...registro, fazenda_id: fid };
      for (const b of BISAVOS) delete semBis[`bisavo_${b.chave}`];
      ({ data, error } = await supabase.from('animais').insert(semBis).select('id, numero_interno, registro').single());
      if (!error && BISAVOS.some((b) => (f.bis[b.chave] ?? '').trim())) Alert.alert('Bisavós não gravados', 'O animal foi cadastrado, mas os bisavós precisam do arquivo do banco da V127 (Supabase › SQL Editor).');
    }
    const falhaDeps = !error && data && com && depPrograma ? await gravarDepsAnimal(data.id, depPrograma, depValores) : null;
    setSalvando('nao');
    if (error) return setErro(traduzirErro(error));
    if (falhaDeps) setErro(`Animal cadastrado, mas as DEPs não foram gravadas: ${falhaDeps}. Abra o animal pela Consulta e informe de novo.`);
    const quem = data?.registro ? `${data.registro} (nº ${data.numero_interno})` : `nº ${data?.numero_interno}`;
    if (modo === 'sair') {
      Alert.alert('Animal cadastrado', com ? `Registrado como ${quem}.` : `Recebeu o número ${data?.numero_interno}.`);
      navegacao.goBack();
    } else {
      // Mantém o que costuma se repetir; limpa o resto.
      setF((a) => ({
        ...NOVO,
        controle: a.controle,
        sexo: a.sexo,
        categoria: a.categoria,
        racaId: a.racaId,
        grau: a.grau,
        nasc: a.nasc,
        ferroId: a.ferroId,
        loteId: a.loteId,
        objetivo: a.objetivo,
        criadorId: a.criadorId,
        tipoRegistro: a.tipoRegistro,
        afixo: a.afixo,
        concepcao: a.concepcao,
      }));
      setErros({});
      setProblemas([]);
      setRegEditado(false);
      setAfixoEd(null);
      setNomeCompletoEd(null);
      setDepValores({});
      setSucesso(`Animal ${quem} cadastrado. Pode lançar o próximo.`);
      carregarSerieProdutor();
    }
  }

  function excluir() {
    Alert.alert(
      'Excluir animal',
      `Excluir o animal nº ${numero}? Use só para corrigir cadastro feito por engano. O número dele não será usado de novo. Se ele foi vendido ou morreu, mude a situação em vez de excluir.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('animais').delete().eq('id', id!);
            if (error) setErro(traduzirErro(error));
            else navegacao.goBack();
          },
        },
      ],
    );
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  const sexoAtual = f.sexo[0] as 'M' | 'F' | undefined;
  const dupla = (a: React.ReactNode, b: React.ReactNode) => (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1 }}>{a}</View>
      <View style={{ flex: 1 }}>{b}</View>
    </View>
  );
  // Bisavós (V127): os pais de cada avó/avô, dois a dois, num quadro mais claro
  const campoBis = (k: string) => {
    const r = BISAVOS.find((x) => x.chave === k)!;
    return <Campo rotulo={r.rotulo} value={f.bis[k] ?? ''} onChangeText={(t) => setF((x) => ({ ...x, bis: { ...x.bis, [k]: t } }))} autoCapitalize="characters" placeholder="Série + RGN ou nome" />;
  };
  const camposBisavos = (ks: string[]) => (
    <View style={estilos.bisavos}>
      <Text style={estilos.bisavosTitulo}>Bisavós</Text>
      {dupla(campoBis(ks[0]), campoBis(ks[1]))}
      {dupla(campoBis(ks[2]), campoBis(ks[3]))}
    </View>
  );

  const abas = !id && (
    <AbasTela
      opcoes={[
        { valor: 'cadastrar', rotulo: 'Cadastrar' },
        { valor: 'consultar', rotulo: 'Consultar' },
      ]}
      valor={aba}
      aoMudar={setAba}
    />
  );

  if (!id && aba[0] === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaCorpo />
      </Tela>
    );
  }

  const blocoSexo = (
    <>
      <Escolha rotulo="Sexo *" opcoes={SEXOS} valor={f.sexo} aoMudar={(v) => setF((a) => ({ ...a, sexo: v, categoria: [] }))} erro={erros.sexo} />
      {loteSexo && <Text style={estilos.travado}>Lote de {loteSexo === 'M' ? 'machos' : 'fêmeas'}. Se o sexo for outro, o sistema pergunta antes de salvar.</Text>}
      {sexoAtual && (
        <Escolha rotulo="Categoria" opcoes={CATEGORIAS[sexoAtual].map((c) => ({ valor: c, rotulo: c }))} valor={f.categoria} aoMudar={(v) => muda('categoria', v)} />
      )}
    </>
  );

  const pesoTexto = id
    ? pesoOriginal.kg != null && pesoOriginal.data
      ? `Último peso, de ${doBanco(pesoOriginal.data)}. Se mudar aqui, o novo peso entra no histórico com a data de hoje.`
      : 'Informe o peso de hoje: ele entra no histórico do animal.'
    : 'Peso no dia do cadastro. Todos os pesos do animal ficam guardados.';
  const rotuloLote = id ? 'Lote' : 'Lote (só se for juntar-se a um lote existente)';
  const fichaOnde = id && onde && (
    <View style={estilos.cartao}>
      <Text style={estilos.ondeRotulo}>Onde está</Text>
      <Text style={estilos.ondeValor}>{f.situacao[0] !== 'ativo' ? 'Fora do rebanho' : onde.lote ? `Lote ${onde.lote}` : 'Sem lote'}</Text>
      {f.situacao[0] === 'ativo' && onde.lote && <Text style={estilos.ondeLocal}>{onde.local ?? 'Local não informado (o lote está sem manga)'}</Text>}
      {pesoOriginal.kg != null && (
        <Text style={estilos.ondeLocal}>
          Último peso: {formatarNumero(Number(pesoOriginal.kg), 1)} kg{pesoOriginal.data ? `, em ${doBanco(pesoOriginal.data)}` : ''}
        </Text>
      )}
    </View>
  );
  const blocoPesos = id && (
    <>
      <Secao titulo="Pesos do animal" />
      <PesosAnimal animalId={id} />
    </>
  );

  return (
    <Tela>
      {abas}
      {sucesso && <Aviso tipo="sucesso" texto={sucesso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {!registroAtual ? (
        <Escolha
          rotulo="Tipo de animal"
          opcoes={[
            { valor: 'sem', rotulo: 'Sem controle genealógico' },
            { valor: 'com', rotulo: 'Com controle genealógico' },
          ]}
          valor={[f.controle]}
          aoMudar={(v) => {
            setErros({});
            setProblemas([]);
            muda('controle', v[0] as Controle);
          }}
        />
      ) : (
        <Text style={estilos.travado}>Animal com controle genealógico (registrado).</Text>
      )}

      {fichaOnde}

      {!com ? (
        <>
          {/* ---------- SEM CONTROLE GENEALÓGICO ---------- */}
          <Secao titulo="Identificação" />
          <Text style={estilos.numero}>{numero ? `Número: ${numero}` : 'Número: dado pelo sistema ao salvar (sequência da fazenda; nunca se repete)'}</Text>
          <Campo rotulo="Nome" value={f.nome} onChangeText={(t) => muda('nome', t)} autoCapitalize="words" placeholder="Opcional" />
          <Campo rotulo="Brinco" value={f.brinco} onChangeText={(t) => muda('brinco', t)} autoCapitalize="characters" autoCorrect={false} placeholder="Se não tiver, fica pelo número" erro={erros.brinco} />
          <CampoFerro valorId={f.ferroId} aoMudar={(v) => muda('ferroId', v)} />
          <CampoNascimento rotulo="Idade *" rotuloMeses="Idade hoje, em meses" valor={f.nasc} aoMudar={(v) => muda('nasc', v)} baseIso={hojeBanco()} erro={erros.nasc} />
          {blocoSexo}
          <CampoRaca valorId={f.racaId} aoMudar={(v) => muda('racaId', v)} />
          <Campo rotulo="Grau de sangue" value={f.grau} onChangeText={(t) => muda('grau', t)} placeholder="Ex.: 1/2 Gir, 3/4 Holandês" />
          <Escolha rotulo="Objetivo" opcoes={OBJETIVOS_ANIMAL} valor={f.objetivo} aoMudar={(v) => muda('objetivo', v[0] === f.objetivo[0] ? [] : v)} />
          <Campo rotulo={id ? 'Peso (kg)' : 'Peso no dia do cadastro (kg)'} value={f.peso} onChangeText={(t) => muda('peso', t)} keyboardType="decimal-pad" placeholder="0" erro={erros.peso} ajuda={pesoTexto} />
          <SeletorLista rotulo={rotuloLote} valorId={f.loteId} aoMudar={(v) => escolherLote(v, !id)} carregar={carregarLotes} permitirLimpar vazio="Nenhum lote ativo. Abra em Pecuário › Lotes." />

          <Secao titulo="Filiação (opcional)" />
          <SeletorLista rotulo="Mãe (do rebanho)" valorId={f.maeId} aoMudar={(v) => muda('maeId', v)} carregar={carregarPais('F')} permitirLimpar dicaBusca="Número, brinco ou nome" vazio="Nenhuma fêmea cadastrada." />
          {!f.maeId && <Campo rotulo="ou mãe de fora" value={f.maeExterna} onChangeText={(t) => muda('maeExterna', t)} placeholder="Nome ou identificação" />}
          <SeletorLista rotulo="Pai (do rebanho)" valorId={f.paiId} aoMudar={(v) => muda('paiId', v)} carregar={carregarPais('M')} permitirLimpar dicaBusca="Número, brinco ou nome" vazio="Nenhum macho cadastrado." />
          {!f.paiId && <Campo rotulo="ou pai de fora" value={f.paiExterno} onChangeText={(t) => muda('paiExterno', t)} placeholder="Nome, identificação ou sêmen" />}
          {blocoPesos}
        </>
      ) : (
        <>
          {/* ---------- COM CONTROLE GENEALÓGICO ---------- */}
          <Secao titulo="Registro" />
          {registroAtual ? (
            <View style={estilos.cartao}>
              <Text style={estilos.registro}>{registroAtual}</Text>
            </View>
          ) : (
            <>
              <Campo
                rotulo="Série Alfabética e RGN/RGD *"
                value={regTexto}
                onChangeText={(t) => {
                  setRegEditado(true);
                  setRegTexto(t.toUpperCase().replace(/[^A-Z0-9 ]/g, ''));
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={serieProdutor ? `${serieProdutor.sui}${serieProdutor.rgn_ultimo + 1}` : 'Ex.: SCS1'}
                erro={erros.rgn}
                ajuda={
                  !regSerie
                    ? undefined
                    : seriePropria
                      ? regEditado && Number(regNumero) !== serieProdutor!.rgn_ultimo + 1
                        ? `Número fora da sequência (o próximo é ${serieProdutor!.sui}${serieProdutor!.rgn_ultimo + 1}).`
                        : 'Sua Série: número criado pelo sistema.'
                      : buscandoSerie
                        ? 'Procurando a Série…'
                        : serieInfo
                          ? `Outro criatório (Série ${regSerie} cadastrada): confira o número do registro.`
                          : `Outro criatório: Série ${regSerie} nova, será cadastrada ao salvar.`
                }
              />
              {regEditado && serieProdutor && (
                <Botao
                  titulo={`Voltar para ${serieProdutor.sui}${serieProdutor.rgn_ultimo + 1} (número do sistema)`}
                  tipo="texto"
                  onPress={() => {
                    setRegEditado(false);
                    setAfixoEd(null);
                    setNomeCompletoEd(null);
                  }}
                />
              )}
              {!serieProdutor &&
                !regEditado &&
                (novoCriador ? (
                  <CriadorRapido
                    aoCriar={() => {
                      setNovoCriador(false);
                      carregarSerieProdutor();
                    }}
                    aoCancelar={() => setNovoCriador(false)}
                  />
                ) : (
                  <Botao titulo="Cadastrar a minha Série Alfabética" tipo="secundario" onPress={() => setNovoCriador(true)} />
                ))}
            </>
          )}
          {!registroAtual && (
            <>
              <Campo
                rotulo="Sufixo/Afixo"
                value={afixoUsado}
                onChangeText={(t) => {
                  setAfixoEd(t);
                  setNomeCompletoEd(null);
                }}
                autoCapitalize="words"
                placeholder="Ex.: da Constantino"
                ajuda={afixoEd !== null && afixoEd !== afixoDaSerie ? (afixoDaSerie ? `Diferente do da Série (${afixoDaSerie}).` : undefined) : undefined}
              />
              {afixoEd !== null && afixoDaSerie && afixoEd !== afixoDaSerie && (
                <Botao
                  titulo={`Usar o da Série: ${afixoDaSerie}`}
                  tipo="texto"
                  onPress={() => {
                    setAfixoEd(null);
                    setNomeCompletoEd(null);
                  }}
                />
              )}
              <Escolha
                rotulo="Sufixo/Afixo antes ou depois do nome?"
                opcoes={[
                  { valor: 'antes', rotulo: 'Antes do nome' },
                  { valor: 'depois', rotulo: 'Depois do nome' },
                ]}
                valor={f.afixo}
                aoMudar={(v) => {
                  setNomeCompletoEd(null);
                  muda('afixo', v);
                }}
              />
            </>
          )}
          {!registroAtual && (
            <Campo
              rotulo="Nome escolhido pelo criador *"
              value={f.nomeEsc}
              onChangeText={(t) => {
                setNomeCompletoEd(null);
                muda('nomeEsc', t);
              }}
              autoCapitalize="words"
              placeholder="Ex.: Maria"
              erro={erros.nomeEsc}
            />
          )}
          <Campo
            rotulo={registroAtual ? 'Nome do animal *' : 'Nome do animal'}
            value={nomeCompletoEd ?? nomeAuto}
            onChangeText={setNomeCompletoEd}
            autoCapitalize="words"
            placeholder={registroAtual ? 'Nome completo, ex.: Maria da Constantino' : 'Nome escolhido + Sufixo/Afixo'}
            erro={registroAtual ? erros.nomeEsc : undefined}
            ajuda={registroAtual && !(nomeCompletoEd ?? '').trim() ? 'Este animal foi gravado sem nome no cadastro. Informe o nome completo e salve.' : undefined}
          />
          {nomeCompletoEd !== null && nomeCompletoEd.trim() !== nomeAuto && !registroAtual && (
            <Botao titulo={`Voltar para: ${nomeAuto}`} tipo="texto" onPress={() => setNomeCompletoEd(null)} />
          )}
          <Secao titulo="Dados do animal" />
          <CampoData rotulo="Data de nascimento *" valor={f.dataNasc} aoMudar={(v) => muda('dataNasc', v)} erro={erros.dataNasc} />
          {dataValida(f.dataNasc) && idadeTexto(paraBanco(f.dataNasc)) && <Text style={estilos.idade}>Idade hoje: {idadeTexto(paraBanco(f.dataNasc))}.</Text>}
          {blocoSexo}
          <CampoRaca valorId={f.racaId} aoMudar={(v) => muda('racaId', v)} />
          <Campo rotulo="Grau de sangue" value={f.grau} onChangeText={(t) => muda('grau', t)} placeholder="Ex.: PO, PC, 3/4" />
          <Escolha rotulo="Concepção" opcoes={CONCEPCOES.map((c) => ({ valor: c, rotulo: c }))} valor={f.concepcao} aoMudar={(v) => muda('concepcao', v[0] === f.concepcao[0] ? [] : v)} />
          <CampoSugestao rotulo="Pelagem" valor={f.pelagem} aoMudar={(v) => muda('pelagem', v)} carregar={sugestoesPelagem} placeholder="Ex.: Branca" />
          {dupla(
            <Campo rotulo="Peso ao nascer (kg)" value={f.pesoNascer} onChangeText={(t) => muda('pesoNascer', t)} keyboardType="decimal-pad" placeholder="0" erro={erros.pesoNascer} />,
            <Campo rotulo="Peso atual (kg)" value={f.peso} onChangeText={(t) => muda('peso', t)} keyboardType="decimal-pad" placeholder="0" erro={erros.peso} />,
          )}
          <Text style={estilos.nota}>{pesoTexto}</Text>
          {sexoAtual === 'M' && <Campo rotulo="CE – circunferência escrotal (cm)" value={f.ce} onChangeText={(t) => muda('ce', t)} keyboardType="decimal-pad" placeholder="0" erro={erros.ce} />}

          <Secao titulo="Genealogia" />
          <CampoGenitor
            rotulo="Mãe"
            sexo="F"
            valor={f.mae}
            aoMudar={(v) => muda('mae', v)}
            aoAchar={(a) => setF((x) => ({ ...x, avoMaterna: a.mae, avoMaterno: a.pai, bis: { ...x.bis, mmm: a.avoMaterna, mmp: a.avoMaterno, mpm: a.avoPaterna, mpp: a.avoPaterno } }))}
            ignorarId={id}
          />
          {dupla(
            <Campo rotulo="Avó materna" value={f.avoMaterna} onChangeText={(t) => muda('avoMaterna', t)} autoCapitalize="characters" placeholder="Série + RGN" />,
            <Campo rotulo="Avô materno" value={f.avoMaterno} onChangeText={(t) => muda('avoMaterno', t)} autoCapitalize="characters" placeholder="Série + RGN" />,
          )}
          {camposBisavos(['mmm', 'mmp', 'mpm', 'mpp'])}
          <CampoGenitor
            rotulo="Pai"
            sexo="M"
            valor={f.pai}
            aoMudar={(v) => muda('pai', v)}
            aoAchar={(a) => setF((x) => ({ ...x, avoPaterna: a.mae, avoPaterno: a.pai, bis: { ...x.bis, pmm: a.avoMaterna, pmp: a.avoMaterno, ppm: a.avoPaterna, ppp: a.avoPaterno } }))}
            ignorarId={id}
          />
          {dupla(
            <Campo rotulo="Avó paterna" value={f.avoPaterna} onChangeText={(t) => muda('avoPaterna', t)} autoCapitalize="characters" placeholder="Série + RGN" />,
            <Campo rotulo="Avô paterno" value={f.avoPaterno} onChangeText={(t) => muda('avoPaterno', t)} autoCapitalize="characters" placeholder="Série + RGN" />,
          )}
          {camposBisavos(['pmm', 'pmp', 'ppm', 'ppp'])}

          <Secao titulo="DEPs oficiais" />
          <DepsAnimal programa={depPrograma} aoMudarPrograma={setDepPrograma} sumario={depSumario} aoMudarSumario={setDepSumario} valores={depValores} aoMudarValores={setDepValores} />

          {blocoPesos}

          <Secao titulo="Rebanho" />
          <SeletorLista rotulo={rotuloLote} valorId={f.loteId} aoMudar={(v) => escolherLote(v, !id)} carregar={carregarLotes} permitirLimpar vazio="Nenhum lote ativo. Abra em Pecuário › Lotes." />
          <CampoFerro valorId={f.ferroId} aoMudar={(v) => muda('ferroId', v)} />
        </>
      )}

      <Secao titulo="Outros" />
      {id && (
        <>
          <Escolha rotulo="Situação" opcoes={SITUACOES_ANIMAL} valor={f.situacao} aoMudar={(v) => muda('situacao', v)} />
          <Text style={estilos.nota}>Venda, morte e saída de parceria lançadas em Pecuário › Movimentações mudam a situação sozinhas. Mude aqui só para corrigir.</Text>
        </>
      )}
      <Campo rotulo="Observações" value={f.obs} onChangeText={(t) => muda('obs', t)} multiline style={{ minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }} />

      {problemas.length > 0 && <Aviso tipo="erro" texto={`Falta corrigir:\n• ${problemas.join('\n• ')}`} />}
      {id ? (
        <>
          <Botao titulo="Salvar alterações" onPress={() => salvar('sair')} carregando={salvando === 'sair'} desabilitado={salvando !== 'nao'} />
          <Botao titulo="Excluir animal" tipo="perigo" onPress={excluir} />
        </>
      ) : (
        <>
          <Botao titulo="Salvar e cadastrar outro" onPress={() => salvar('outro')} carregando={salvando === 'outro'} desabilitado={salvando !== 'nao'} />
          <Botao titulo="Salvar e voltar" tipo="secundario" onPress={() => salvar('sair')} carregando={salvando === 'sair'} desabilitado={salvando !== 'nao'} />
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  bisavos: { backgroundColor: '#F4F7F3', borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 8 },
  bisavosTitulo: { fontSize: tam.pequeno, fontWeight: '800', color: cores.textoSuave },
  travado: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  numero: { fontSize: tam.texto, color: cores.cafe, fontWeight: '700' },
  idade: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '600' },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 6 },
  registro: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura },
  ondeRotulo: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  ondeValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  ondeLocal: { fontSize: tam.texto, color: cores.texto },
});
