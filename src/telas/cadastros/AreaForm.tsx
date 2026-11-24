import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoSugestao from '../../componentes/CampoSugestao';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import EstruturaManga, { type EstruturaEd } from '../../componentes/EstruturaManga';
import { MANEJO_VAZIO, conferirManejo, manejoPreenchido, registroManejo } from '../../componentes/CamposManejo';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { dataValida, doBanco, paraBanco } from '../../lib/datas';
import { CATEGORIAS, ORDEM_CATEGORIAS, TOPOGRAFIAS, sugestoesUso, type Categoria } from '../../lib/mangas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';
import { NOMES_AREA } from '../../lib/areas';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaAreas from './ConsultaAreas';
import ItemMenu from '../../componentes/ItemMenu';

let contador = 0;
const novaChave = () => `e${Date.now()}_${contador++}`;

function novaEstrutura(categoria: Categoria): EstruturaEd {
  return { chave: novaChave(), categoria, tipo: '', descricao: '', cobertura: null, capKg: '', capAnimais: '', manejo: { ...MANEJO_VAZIO } };
}

export default function AreaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AreaForm'>>();
  const { tipo, id } = params;
  const nomes = NOMES_AREA[tipo];
  const manga = tipo === 'manga';
  const { fazendaAtiva } = useSessao();

  const [aba, setAba] = useState<Aba>(params.aba ?? 'cadastrar');
  const [nome, setNome] = useState('');
  const [areaHa, setAreaHa] = useState('');
  const [perimetro, setPerimetro] = useState('');
  const [cultura, setCultura] = useState('');
  const [medidas, setMedidas] = useState('');
  const [ativa, setAtiva] = useState(true);
  // Manga: uso e produção
  const [uso, setUso] = useState('');
  const [gmd, setGmd] = useState('');
  const [biomassa, setBiomassa] = useState('');
  const [dataSolo, setDataSolo] = useState('');
  const [capAguas, setCapAguas] = useState('');
  const [capSeca, setCapSeca] = useState('');
  // Manga: manejo do pasto
  const [altEntrada, setAltEntrada] = useState('');
  const [altSaida, setAltSaida] = useState('');
  const [descanso, setDescanso] = useState('');
  const [topografia, setTopografia] = useState('');
  // V198: risco de inundação (nenhum, total ou parcial com %) e grau (baixo, médio, alto)
  const [inundTipo, setInundTipo] = useState('nenhum');
  const [inundPerc, setInundPerc] = useState('');
  const [inundRisco, setInundRisco] = useState('');
  // V195: capim da tabela (para a estimativa das águas e da seca) e fertilidade do solo
  const [capimId, setCapimId] = useState<string | null>(null);
  const [fertilidade, setFertilidade] = useState('media');
  const [capins, setCapins] = useState<any[]>([]);
  const [parPasto, setParPasto] = useState<any>(null);
  useEffect(() => {
    supabase.from('capins').select('*').eq('ativo', true).order('nome').then(({ data }) => setCapins((data ?? []) as any[]));
    supabase.from('pastagem_parametros').select('*').eq('id', 1).maybeSingle().then(({ data }) => setParPasto(data ?? null));
  }, []);
  // V195: o capim digitado é reconhecido pelo nome quando não foi escolhido na tabela
  const capimCalc = (() => {
    if (capimId) return capins.find((c) => c.id === capimId) ?? null;
    const t = cultura.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!t) return null;
    return [...capins].sort((a, b) => a.prioridade - b.prioridade).find((c) => (c.palavras ?? []).some((w: string) => t.includes(w))) ?? null;
  })();
  /** cálculo da manga nas águas e na seca, refeito enquanto se digita */
  const calc = (() => {
    const area = lerNumero(areaHa);
    if (!capimCalc || !parPasto || !area || area <= 0) return null;
    const ini = Number(parPasto.mes_aguas_ini), fim = Number(parPasto.mes_aguas_fim);
    const nasAguas = (m: number) => (ini <= fim ? m >= ini && m <= fim : m >= ini || m <= fim);
    let diasAguas = 0;
    for (let m = 1; m <= 12; m++) if (nasAguas(m)) diasAguas += new Date(2025, m, 0).getDate();
    const fator = Number(fertilidade === 'fraca' ? parPasto.fator_fraca : fertilidade === 'boa' ? parPasto.fator_boa : parPasto.fator_media);
    const consumo = (Number(parPasto.ua_kg) * Number(parPasto.consumo_perc_pv)) / 100;
    const est = (aguas: boolean) => {
      const dias = aguas ? diasAguas : 365 - diasAguas;
      const perc = aguas ? Number(capimCalc.perc_aguas) : 100 - Number(capimCalc.perc_aguas);
      const bio = (Number(capimCalc.ms_ano_t) * 1000 * fator * perc) / 100;
      const uaHa = Math.round(((bio * Number(parPasto.eficiencia_perc)) / 100 / (consumo * dias)) * 100) / 100;
      const ua = uaHa * area;
      const cab = Object.fromEntries(Object.entries(parPasto.pesos ?? {}).map(([k, kg]) => [k, Math.floor(ua / (Number(kg) / Number(parPasto.ua_kg)))]));
      return {
        bio: Math.round(bio), uaHa, ua, cab,
        gmd: aguas ? capimCalc.gmd_aguas : capimCalc.gmd_seca,
        descanso: aguas ? capimCalc.descanso_aguas : capimCalc.descanso_seca,
      };
    };
    return { aguas: est(true), seca: est(false), entrada: capimCalc.altura_entrada_cm, saida: capimCalc.altura_saida_cm, capim: capimCalc.nome };
  })();
  // os campos de valores já vêm com o calculado; o que a pessoa digitar por cima fica
  const autoRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!calc) return;
    const novos: [string, string, (v: string) => void, string][] = [
      ['gmd', numeroParaCampo(calc.aguas.gmd), setGmd, gmd],
      ['bio', numeroParaCampo(calc.aguas.bio), setBiomassa, biomassa],
      ['aguas', numeroParaCampo(calc.aguas.uaHa), setCapAguas, capAguas],
      ['seca', numeroParaCampo(calc.seca.uaHa), setCapSeca, capSeca],
      ['ent', numeroParaCampo(calc.entrada), setAltEntrada, altEntrada],
      ['sai', numeroParaCampo(calc.saida), setAltSaida, altSaida],
      ['desc', calc.aguas.descanso != null ? String(calc.aguas.descanso) : '', setDescanso, descanso],
    ];
    for (const [k, v, set, atual] of novos) {
      if (atual === '' || atual === autoRef.current[k]) {
        set(v);
        autoRef.current[k] = v;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc?.capim, calc?.aguas.uaHa, calc?.seca.uaHa, calc?.aguas.gmd, calc?.aguas.bio, calc?.entrada, calc?.saida, calc?.aguas.descanso]);
  // Manga: estruturas
  const [estruturas, setEstruturas] = useState<EstruturaEd[]>([]);
  const removidas = useRef<string[]>([]);

  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Editar ${nomes.singular}` : nomes.plural });
  }, [navegacao, id, nomes]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const data = await consulta<any>(supabase.from('areas').select('*').eq('id', id).single());
        setNome(data.nome ?? '');
        setAreaHa(numeroParaCampo(data.area_ha));
        setPerimetro(numeroParaCampo(data.perimetro_m));
        setCultura(data.capim_cultura ?? '');
        setMedidas(data.medidas ?? '');
        setAtiva(data.ativa !== false);
        setUso(data.indicacao_uso ?? '');
        setGmd(numeroParaCampo(data.gmd_potencial));
        setBiomassa(numeroParaCampo(data.biomassa));
        setDataSolo(doBanco(data.data_analise_solo));
        setCapAguas(numeroParaCampo(data.capacidade_aguas));
        setCapSeca(numeroParaCampo(data.capacidade_seca));
        setAltEntrada(numeroParaCampo(data.altura_entrada_cm));
        setAltSaida(numeroParaCampo(data.altura_saida_cm));
        setDescanso(data.descanso_dias != null ? String(data.descanso_dias) : '');
        setTopografia(data.topografia ?? '');
        setInundTipo(data.inundacao_tipo ?? 'nenhum');
        setInundPerc(data.inundacao_perc != null ? numeroParaCampo(data.inundacao_perc) : '');
        setInundRisco(data.inundacao_risco ?? '');
        setCapimId(data.capim_id ?? null);
        setFertilidade(data.fertilidade ?? 'media');
        if (data.tipo === 'manga') {
          const est = await consulta<any[]>(supabase.from('manga_estruturas').select('*').eq('area_id', id).order('created_at'));
          const man = est.length
            ? await consulta<any[]>(
                supabase.from('manga_manejos').select('estrutura_id, data, produto, quantidade_kg, servico').eq('area_id', id).order('data', { ascending: false }).order('created_at', { ascending: false }),
              )
            : [];
          setEstruturas(
            est.map((e) => ({
              chave: novaChave(),
              id: e.id,
              categoria: e.categoria,
              tipo: e.tipo ?? '',
              descricao: e.descricao ?? '',
              cobertura: e.com_cobertura ?? null,
              capKg: numeroParaCampo(e.capacidade_kg),
              capAnimais: e.capacidade_animais != null ? String(e.capacidade_animais) : '',
              manejo: { ...MANEJO_VAZIO },
              ultimo: man.find((m) => m.estrutura_id === e.id) ?? null,
            })),
          );
        }
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [id]);

  function mudarEstrutura(chave: string, v: EstruturaEd) {
    setEstruturas((l) => l.map((e) => (e.chave === chave ? v : e)));
  }

  function removerEstrutura(e: EstruturaEd) {
    const tirar = () => {
      if (e.id) removidas.current.push(e.id);
      setEstruturas((l) => l.filter((x) => x.chave !== e.chave));
    };
    if (!e.id) return tirar();
    Alert.alert(`Remover ${CATEGORIAS[e.categoria].rotulo.toLowerCase()}`, 'O histórico dele (limpezas, abastecimentos, manutenções) também será apagado ao salvar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: tirar },
    ]);
  }

  async function salvar() {
    setErro(null);
    setErroNome(null);
    const erros: Record<string, string> = {};
    const lista: string[] = [];
    const falha = (campo: string, rotulo: string, msg: string) => {
      erros[campo] = msg;
      lista.push(`${rotulo}: ${msg}`);
    };
    // número decimal opcional, não negativo
    const num = (texto: string, campo: string, rotulo: string): number | null => {
      if (!texto.trim()) return null;
      const n = lerNumero(texto);
      if (n === null || n < 0) {
        falha(campo, rotulo, 'número inválido (use vírgula para decimais, ex.: 12,5)');
        return null;
      }
      return n;
    };

    if (!nome.trim()) {
      setErroNome('Informe o nome.');
      lista.push('Nome: informe o nome');
    }
    const ha = num(areaHa, 'area', 'Área');
    const per = num(perimetro, 'perimetro', 'Perímetro');
    const vGmd = manga ? num(gmd, 'gmd', 'GMD potencial') : null;
    const vBio = manga ? num(biomassa, 'biomassa', 'Biomassa') : null;
    const vAguas = manga ? num(capAguas, 'aguas', 'Capacidade nas águas') : null;
    const vSeca = manga ? num(capSeca, 'seca', 'Capacidade na seca') : null;
    const vEnt = manga ? num(altEntrada, 'entrada', 'Altura de entrada') : null;
    const vSai = manga ? num(altSaida, 'saida', 'Altura de saída') : null;
    if (manga && dataSolo.trim() && !dataValida(dataSolo)) falha('solo', 'Data da análise do solo', 'data inválida (use dd/mm/aaaa)');
    let vInundPerc: number | null = null;
    if (manga && inundTipo === 'parcial') {
      vInundPerc = num(inundPerc, 'inundPerc', 'Área sujeita a inundação');
      if (vInundPerc === null && !erros.inundPerc) falha('inundPerc', 'Área sujeita a inundação', 'informe o percentual da área');
      else if (vInundPerc !== null && (vInundPerc <= 0 || vInundPerc >= 100)) falha('inundPerc', 'Área sujeita a inundação', 'entre 1 e 99% (100% é Total)');
    }
    if (manga && inundTipo !== 'nenhum' && !inundRisco) falha('inundRisco', 'Risco de inundação', 'escolha Baixo, Médio ou Alto');
    if (manga && vEnt !== null && vSai !== null && vSai >= vEnt) falha('saida', 'Altura de saída', 'deve ser menor que a de entrada');
    const errosEst: Record<string, string> = {};
    if (manga) {
      estruturas.forEach((e) => {
        const nomeE = CATEGORIAS[e.categoria].rotulo;
        const p = conferirManejo(e.manejo);
        if (p) {
          errosEst[e.chave] = p;
          lista.push(`${nomeE}: ${p}`);
        }
        if (e.capKg.trim() && (lerNumero(e.capKg) === null || lerNumero(e.capKg)! < 0)) {
          errosEst[e.chave] = errosEst[e.chave] ?? 'Capacidade inválida.';
          lista.push(`${nomeE}: capacidade inválida`);
        }
      });
    }
    setErrosCampo({ ...erros, ...Object.fromEntries(Object.entries(errosEst).map(([k, v]) => [`est_${k}`, v])) });
    setProblemas(lista);
    if (lista.length || !fazendaAtiva) return;

    setSalvando(true);
    try {
      // Evita dois nomes iguais na mesma fazenda.
      let q = supabase.from('areas').select('id').eq('fazenda_id', fazendaAtiva.id).eq('tipo', tipo).ilike('nome', nome.trim());
      if (id) q = q.neq('id', id);
      const iguais = await consulta<any[]>(q.limit(1));
      if (iguais.length) {
        setSalvando(false);
        setErroNome(`Já existe ${nomes.artigo} ${nomes.singular} com esse nome nesta fazenda.`);
        setProblemas([`Nome: já existe ${nomes.artigo} ${nomes.singular} com esse nome`]);
        return;
      }

      const registro = {
        nome: nome.trim(),
        area_ha: ha,
        perimetro_m: per,
        capim_cultura: cultura.trim() || null,
        medidas: medidas.trim() || null,
        ativa,
        indicacao_uso: manga ? uso.trim() || null : null,
        gmd_potencial: vGmd,
        biomassa: vBio,
        data_analise_solo: manga ? paraBanco(dataSolo) : null,
        capacidade_aguas: vAguas,
        capacidade_seca: vSeca,
        altura_entrada_cm: vEnt,
        altura_saida_cm: vSai,
        descanso_dias: manga && descanso ? Number(descanso) : null,
        topografia: manga ? topografia || null : null,
        ...(manga
          ? {
              capim_id: capimId,
              fertilidade,
              inundacao_tipo: inundTipo,
              inundacao_perc: inundTipo === 'total' ? 100 : inundTipo === 'parcial' ? vInundPerc : null,
              inundacao_risco: inundTipo === 'nenhum' ? null : inundRisco || null,
            }
          : {}),
      };
      const areaId = id
        ? (await consulta<any>(supabase.from('areas').update(registro).eq('id', id).select('id').single())).id
        : (await consulta<any>(supabase.from('areas').insert({ ...registro, fazenda_id: fazendaAtiva.id, tipo }).select('id').single())).id;

      if (manga) {
        if (removidas.current.length) {
          await consulta(supabase.from('manga_estruturas').delete().in('id', removidas.current));
          removidas.current = [];
        }
        for (const e of estruturas) {
          const dados = {
            categoria: e.categoria,
            tipo: e.tipo.trim() || null,
            descricao: e.descricao.trim() || null,
            com_cobertura: e.categoria === 'cocho_sal' ? e.cobertura : null,
            capacidade_kg: e.categoria === 'cocho_sal' ? lerNumero(e.capKg) : null,
            capacidade_animais: e.categoria === 'cocho_alimentacao' && e.capAnimais ? Number(e.capAnimais) : null,
          };
          const estId = e.id
            ? (await consulta<any>(supabase.from('manga_estruturas').update(dados).eq('id', e.id).select('id').single())).id
            : (await consulta<any>(supabase.from('manga_estruturas').insert({ ...dados, area_id: areaId, fazenda_id: fazendaAtiva.id }).select('id').single())).id;
          if (manejoPreenchido(e.manejo)) {
            await consulta(
              supabase.from('manga_manejos').insert({ ...registroManejo(e.manejo, e.categoria), estrutura_id: estId, area_id: areaId, fazenda_id: fazendaAtiva.id }),
            );
          }
        }
      }
    } catch (e) {
      setSalvando(false);
      return setErro(traduzirErro(e));
    }
    setSalvando(false);
    if (id) navegacao.goBack();
    else
      navegacao.replace('AreaForm', {
        tipo,
        aviso: `${nomes.singular.charAt(0).toUpperCase()}${nomes.singular.slice(1)} "${nome.trim()}" cadastrad${nomes.artigo}. Pode cadastrar ${nomes.artigo === 'a' ? 'a próxima' : 'o próximo'}.`,
      });
  }

  function excluir() {
    Alert.alert(`Excluir ${nomes.singular}`, `Excluir ${nome}? Se já tiver lotes, pesagens ou lançamentos ligados, o sistema não deixa: nesse caso, desmarque "Ativ${nomes.artigo}".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          // V149: o centro de custo que nasceu com a área sai junto; se tiver lançamentos, diz quais
          const { error } = await supabase.rpc('excluir_area', { p_id: id! });
          if (error) setErro(traduzirErro(error));
          else {
            // Se veio da ficha da manga, volta direto para a lista (a ficha não existe mais).
            const rotas = navegacao.getState().routes;
            navegacao.pop(rotas[rotas.length - 2]?.name === 'MangaDetalhe' ? 2 : 1);
          }
        },
      },
    ]);
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  const abas = !id && (
    <>
      <AbasCadastro aba={aba} aoMudar={setAba} />
      {tipo === 'manga' && (
        <View style={{ borderRadius: tam.raio, overflow: 'hidden', borderWidth: 1, borderColor: cores.borda }}>
          <ItemMenu icone="navigate-circle-outline" titulo="Visão do Pasto" descricao="Mapa das mangas e ocupação: ocupado, descanso e vedado" onPress={() => navegacao.navigate('VisaoPasto')} />
        </View>
      )}
    </>
  );

  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaAreas tipo={tipo} />
      </Tela>
    );
  }

  const dupla = (a: React.ReactNode, b: React.ReactNode) => (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1 }}>{a}</View>
      <View style={{ flex: 1 }}>{b}</View>
    </View>
  );

  const FAIXAS_CAB: [string, string][] = [
    ['M0', 'Machos 0 a 12 meses'], ['M13', 'Machos 13 a 24'], ['M25', 'Machos 25 a 36'], ['M37', 'Machos + 36'],
    ['F0', 'Fêmeas 0 a 2 meses'], ['F3', 'Fêmeas 3 a 8'], ['F9', 'Fêmeas 9 a 12'], ['F13', 'Fêmeas 13 a 24'], ['F25', 'Fêmeas 25 a 36'], ['F37', 'Fêmeas + 36'],
  ];
  function calculo() {
    if (!calc) return <Text style={{ fontSize: tam.pequeno + 1, color: cores.textoSuave }}>Informe a área e o capim para o sistema calcular a capacidade nas águas e na seca.</Text>;
    const n = (v: any, c = 0) => (v != null && v !== '' ? formatarNumero(Number(v), c) : '–');
    const linha = (rot: string, a: string, b: string, cab = false) => (
      <View key={rot} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: cores.borda }}>
        <Text style={{ flex: 2, fontSize: tam.pequeno + 1, color: cab ? cores.cafe : cores.texto, fontWeight: cab ? '700' : '400' }}>{rot}</Text>
        <Text style={{ flex: 1, textAlign: 'right', fontSize: tam.pequeno + 1, color: cab ? cores.cafe : cores.texto, fontWeight: cab ? '700' : '600' }}>{a}</Text>
        <Text style={{ flex: 1, textAlign: 'right', fontSize: tam.pequeno + 1, color: cab ? cores.cafe : cores.texto, fontWeight: cab ? '700' : '600' }}>{b}</Text>
      </View>
    );
    const { aguas: ag, seca: se } = calc;
    return (
      <View style={{ backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco }}>
        {linha(`Calculado · ${calc.capim}`, 'Águas', 'Seca', true)}
        {linha('MS (kg/ha)', n(ag.bio), n(se.bio))}
        {linha('Capacidade (UA/ha)', n(ag.uaHa, 2), n(se.uaHa, 2))}
        {linha('Capacidade na manga (UA)', n(ag.ua, 1), n(se.ua, 1))}
        {linha('GMD estimado (kg/dia)', n(ag.gmd, 2), n(se.gmd, 2))}
        {linha('Período de descanso (dias)', n(ag.descanso), n(se.descanso))}
        {linha('Altura entrada / saída (cm)', `${n(calc.entrada)} / ${n(calc.saida)}`, `${n(calc.entrada)} / ${n(calc.saida)}`)}
        {linha('Capacidade em cabeças', 'Águas', 'Seca', true)}
        {FAIXAS_CAB.map(([k, r]) => linha(r, n(ag.cab[k]), n(se.cab[k])))}
      </View>
    );
  }

  return (
    <Tela>
      {abas}
      {!id && params.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!id && fazendaAtiva && !params.aviso && <Aviso tipo="info" texto={`Será cadastrad${nomes.artigo} na fazenda ${fazendaAtiva.nome}.`} />}

      <Campo
        rotulo="Nome *"
        value={nome}
        onChangeText={setNome}
        autoCapitalize="sentences"
        placeholder={manga ? 'Ex.: Manga do Açude' : 'Ex.: Talhão 3 – Baixada'}
        erro={erroNome}
      />
      {dupla(
        <Campo rotulo="Área (ha)" value={areaHa} onChangeText={setAreaHa} keyboardType="decimal-pad" placeholder="0,00" erro={errosCampo.area} />,
        <Campo rotulo="Perímetro (m)" value={perimetro} onChangeText={setPerimetro} keyboardType="decimal-pad" placeholder="0" erro={errosCampo.perimetro} />,
      )}
      {!manga && (
        <Campo rotulo={nomes.cultura} value={cultura} onChangeText={setCultura} autoCapitalize="sentences" placeholder="Ex.: Café conilon" />
      )}
      {manga && capins.length > 0 && (
        <Escolha
          rotulo="Capim para a estimativa"
          opcoes={capins.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          valor={capimId ? [capimId] : []}
          aoMudar={(v) => {
            const novo = v[0] === capimId ? null : v[0] ?? null;
            setCapimId(novo);
            const nomeCapim = capins.find((c) => c.id === novo)?.nome;
            if (nomeCapim && !cultura.trim()) setCultura(nomeCapim);
          }}
        />
      )}
      {manga && (
        <Escolha
          rotulo="Fertilidade do solo"
          opcoes={[
            { valor: 'fraca', rotulo: 'Fraca' },
            { valor: 'media', rotulo: 'Média' },
            { valor: 'boa', rotulo: 'Boa' },
          ]}
          valor={[fertilidade]}
          aoMudar={(v) => v.length && setFertilidade(v[0])}
        />
      )}
      {manga && calculo()}
      {manga && (
        <Campo rotulo={nomes.cultura} value={cultura} onChangeText={setCultura} autoCapitalize="sentences" placeholder="Ex.: Braquiária, Mombaça" />
      )}
      {manga && <ItemMenu icone="leaf-outline" titulo="Tabela de capins" descricao="Produção, GMD, descanso e alturas usados na estimativa" onPress={() => navegacao.navigate('Capins')} />}

      {manga && (
        <>
          <Secao titulo="Uso e produção" />
          <CampoSugestao rotulo="Indicação de uso" valor={uso} aoMudar={setUso} carregar={sugestoesUso} placeholder="Ex.: Recria" />
          {dupla(
            <Campo rotulo="GMD águas (kg/dia)" value={gmd} onChangeText={setGmd} keyboardType="decimal-pad" placeholder="0,000" erro={errosCampo.gmd} />,
            <Campo rotulo="MS águas (kg/ha)" value={biomassa} onChangeText={setBiomassa} keyboardType="decimal-pad" placeholder="0" erro={errosCampo.biomassa} />,
          )}
          <CampoData rotulo="Data da análise do solo" valor={dataSolo} aoMudar={setDataSolo} erro={errosCampo.solo} />
          {dupla(
            <Campo rotulo="Capacidade águas (UA/ha)" value={capAguas} onChangeText={setCapAguas} keyboardType="decimal-pad" placeholder="0,00" erro={errosCampo.aguas} />,
            <Campo rotulo="Capacidade seca (UA/ha)" value={capSeca} onChangeText={setCapSeca} keyboardType="decimal-pad" placeholder="0,00" erro={errosCampo.seca} />,
          )}

          <Secao titulo="Manejo do pasto" />
          {dupla(
            <Campo rotulo="Altura de entrada (cm)" value={altEntrada} onChangeText={setAltEntrada} keyboardType="decimal-pad" placeholder="0" erro={errosCampo.entrada} />,
            <Campo rotulo="Altura de saída (cm)" value={altSaida} onChangeText={setAltSaida} keyboardType="decimal-pad" placeholder="0" erro={errosCampo.saida} />,
          )}
          <Campo
            rotulo="Período de descanso águas (dias)"
            value={descanso}
            onChangeText={(t) => setDescanso(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="0"
          />
          <Escolha
            rotulo="Topografia"
            opcoes={TOPOGRAFIAS.map((t) => ({ valor: t, rotulo: t }))}
            valor={topografia ? [topografia] : []}
            aoMudar={(v) => setTopografia(v[0] === topografia ? '' : v[0])}
          />
          <Escolha
            rotulo="Risco de inundação"
            opcoes={[
              { valor: 'nenhum', rotulo: 'Não tem' },
              { valor: 'total', rotulo: 'Total' },
              { valor: 'parcial', rotulo: 'Parcial' },
            ]}
            valor={[inundTipo]}
            aoMudar={(v) => v.length && setInundTipo(v[0])}
          />
          {inundTipo === 'parcial' && (
            <Campo
              rotulo="Área sujeita a inundação (%) *"
              value={inundPerc}
              onChangeText={(t) => setInundPerc(t.replace(/[^\d,]/g, '').slice(0, 5))}
              keyboardType="decimal-pad"
              placeholder="Ex.: 30"
              erro={errosCampo.inundPerc}
              ajuda={(() => {
                const p = lerNumero(inundPerc), h = lerNumero(areaHa);
                return p && h ? `${formatarNumero((h * p) / 100, 2)} ha de ${formatarNumero(h, 2)} ha` : undefined;
              })()}
            />
          )}
          {inundTipo !== 'nenhum' && (
            <>
              <Escolha
                rotulo="Grau do risco *"
                opcoes={[
                  { valor: 'baixo', rotulo: 'Baixo' },
                  { valor: 'medio', rotulo: 'Médio' },
                  { valor: 'alto', rotulo: 'Alto' },
                ]}
                valor={inundRisco ? [inundRisco] : []}
                aoMudar={(v) => setInundRisco(v[0] === inundRisco ? '' : v[0] ?? '')}
              />
              {errosCampo.inundRisco && <Text style={{ fontSize: tam.pequeno, color: cores.erro }}>{errosCampo.inundRisco}</Text>}
            </>
          )}

          <Secao titulo="Bebedouros, cochos e cercas" />
          {estruturas.length === 0 && <Text style={{ fontSize: tam.pequeno + 1, color: cores.textoSuave }}>Nenhum cadastrado. Toque abaixo para incluir; pode ter mais de um de cada.</Text>}
          {estruturas.map((e) => (
            <EstruturaManga
              key={e.chave}
              valor={e}
              aoMudar={(v) => mudarEstrutura(e.chave, v)}
              aoRemover={() => removerEstrutura(e)}
              erroManejo={errosCampo[`est_${e.chave}`]}
            />
          ))}
          <Escolha
            rotulo="Incluir"
            opcoes={ORDEM_CATEGORIAS.map((c) => ({ valor: c, rotulo: `+ ${CATEGORIAS[c].rotulo}` }))}
            valor={[]}
            aoMudar={(v) => setEstruturas((l) => [...l, novaEstrutura(v[0] as Categoria)])}
          />
        </>
      )}

      <Campo
        rotulo="Medidas e observações"
        value={medidas}
        onChangeText={setMedidas}
        multiline
        placeholder="Limites, divisas, aguadas…"
        style={{ minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }}
      />
      {id && <Interruptor rotulo={`Ativ${nomes.artigo}`} descricao="Inativas não aparecem para escolher em novos lançamentos." valor={ativa} aoMudar={setAtiva} />}

      {problemas.length > 0 && <Aviso tipo="erro" texto={`Falta corrigir:\n• ${problemas.join('\n• ')}`} />}
      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo={`Excluir ${nomes.singular}`} tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}
