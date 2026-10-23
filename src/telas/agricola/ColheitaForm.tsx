import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import AbasTela from '../../componentes/AbasTela';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import ConsultaColheitas from './ConsultaColheitas';
import PagamentoColheita from './PagamentoColheita';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarQtd, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { CAPACIDADE_SUGERIDA, FORMAS_SERVICO, ROTULO_CAPACIDADE, TIPOS_COLHEITA, UNIDADES_COLHEITA, r2, textoLitros, textoMedida, um, type TipoColheita } from '../../lib/colheitas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

export type AbaColheita = 'lancar' | 'pagamento' | 'consultar';
type Colhedor = { chave: string; pessoaId: string; nome: string; qtd: string; preco: string };
type Medida = { litros: number; preco: number | null };

let cont = 0;
const chave = () => `c${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);

/** Colheitas: o que foi colhido em cada talhão, por quem (produção por colhedor) e com que máquina. O pagamento fecha por período na aba Pagamento. */
export default function ColheitaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ColheitaForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [aba, setAba] = useState<AbaColheita>(params?.aba ?? 'lancar');
  // catálogos
  const [talhoes, setTalhoes] = useState<{ id: string; nome: string }[]>([]);
  const [safras, setSafras] = useState<any[]>([]);
  const [medidas, setMedidas] = useState<Record<string, Medida>>({});
  const [proximo, setProximo] = useState<number | null>(null);
  const [carregado, setCarregado] = useState(false);
  const medidaInicial = useRef(false);
  // lançamento
  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [safraId, setSafraId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(params?.areaId ?? null);
  const [tipo, setTipo] = useState<TipoColheita | ''>('');
  const [unidade, setUnidade] = useState('');
  const [litros, setLitros] = useState('');
  const [preco, setPreco] = useState('');
  const [colhedores, setColhedores] = useState<Colhedor[]>([]);
  const [quantidade, setQuantidade] = useState('');
  const [maquinaDe, setMaquinaDe] = useState<'propria' | 'terceiro'>('propria');
  const [maquinaId, setMaquinaId] = useState<string | null>(null);
  const [horas, setHoras] = useState('');
  const [operadorId, setOperadorId] = useState<string | null>(null);
  const [prestadorId, setPrestadorId] = useState<string | null>(null);
  const [forma, setForma] = useState('');
  const [sPreco, setSPreco] = useState('');
  const [sValor, setSValor] = useState('');
  const [sVenc, setSVenc] = useState('');
  const [obs, setObs] = useState('');
  // alterar
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Colheita nº ${numero}` : 'Colheitas' });
  }, [navegacao, id, numero]);

  const carregarBase = useCallback(async () => {
    if (!fid) return;
    try {
      const [ar, sf, md, ult] = await Promise.all([
        consulta<any[]>(supabase.from('areas').select('id, nome').eq('fazenda_id', fid).eq('tipo', 'talhao').eq('ativa', true).order('nome')),
        consulta<any[]>(supabase.from('safras').select('id, numero, nome, data_inicio, data_fim, situacao').eq('fazenda_id', fid).order('data_inicio', { ascending: false, nullsFirst: false })),
        consulta<any[]>(supabase.from('colheita_medidas').select('unidade, litros, preco, updated_at').eq('fazenda_id', fid).order('updated_at', { ascending: false })),
        consulta<any[]>(supabase.from('pc_lotes').select('numero').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(1)),
      ]);
      setTalhoes(ar);
      setSafras(sf);
      setMedidas(Object.fromEntries(md.map((m) => [m.unidade, { litros: Number(m.litros), preco: m.preco != null ? Number(m.preco) : null }])));
      setProximo((ult[0]?.numero ?? 0) + 1);
      // primeira vez na tela: a medida da última colheita já vem escolhida
      if (!medidaInicial.current && md[0]) {
        medidaInicial.current = true;
        setUnidade(md[0].unidade);
        setLitros(numeroParaCampo(md[0].litros));
        setPreco(moedaParaCampo(md[0].preco));
      }
      setCarregado(true);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  // ---------- cálculos ----------
  const abertas = safras.filter((s) => s.situacao === 'aberta');
  const dataIso = paraBanco(data);
  // a safra que o banco vai usar se nenhuma for escolhida: a aberta que cobre a data, ou a aberta mais recente
  const safraAuto = abertas.find((s) => dataIso && (!s.data_inicio || s.data_inicio <= dataIso) && (!s.data_fim || s.data_fim >= dataIso)) ?? abertas[0] ?? null;
  const safraUsada = safras.find((s) => s.id === safraId) ?? safraAuto;
  const porProducao = tipo === 'manual' || tipo === 'lona';
  const comMaquina = tipo === 'lona' || tipo === 'automotriz';
  const precoPadrao = n(preco) ?? 0;
  const lpu = unidade === 'litro' ? 1 : n(litros);
  const usaColhedores = porProducao && colhedores.length > 0;
  const qtdTotal = usaColhedores ? colhedores.reduce((s, c) => s + (n(c.qtd) ?? 0), 0) : n(quantidade) ?? 0;
  const valorDe = (c: Colhedor) => r2((n(c.qtd) ?? 0) * (c.preco.trim() ? n(c.preco) ?? 0 : precoPadrao));
  const valorProducao = usaColhedores ? r2(colhedores.reduce((s, c) => s + valorDe(c), 0)) : 0;
  const terceiro = comMaquina && maquinaDe === 'terceiro';
  const valorServico = !terceiro ? 0 : forma === 'hora' ? r2((n(horas) ?? 0) * (n(sPreco) ?? 0)) : forma === 'medida' ? r2(qtdTotal * (n(sPreco) ?? 0)) : forma === 'total' ? n(sValor) ?? 0 : 0;
  const custoTotal = valorProducao + valorServico;
  const nomeUn = unidade || 'medida';

  // ---------- ações ----------
  function escolherUnidade(u: string) {
    setUnidade(u);
    const m = medidas[u];
    setLitros(u === 'litro' ? '1' : m ? numeroParaCampo(m.litros) : CAPACIDADE_SUGERIDA[u] ?? '');
    setPreco(m?.preco != null ? moedaParaCampo(m.preco) : '');
  }

  async function incluirColhedor(pid: string | null) {
    if (!pid) return;
    if (colhedores.some((c) => c.pessoaId === pid)) return setErro('Este colhedor já está na lista: some a quantidade na linha dele.');
    setErro(null);
    const { data: p } = await supabase.from('pessoas').select('id, nome').eq('id', pid).maybeSingle();
    if (p) setColhedores((l) => [...l, { chave: chave(), pessoaId: p.id, nome: p.nome, qtd: '', preco: '' }]);
  }
  const mudarColhedor = (k: string, m: Partial<Colhedor>) => setColhedores((l) => l.map((c) => (c.chave === k ? { ...c, ...m } : c)));

  /** Traz os mesmos colhedores da última colheita (só os nomes; a quantidade é a do dia). */
  async function repetirColhedores() {
    setErro(null);
    try {
      const ult = await consulta<any[]>(
        supabase.from('pc_lotes').select('numero, colhedores:pc_colhedores ( pessoa_id, pessoa:pessoas ( nome ) )').eq('fazenda_id', fid!).order('data_colheita', { ascending: false }).order('numero', { ascending: false }).limit(10),
      );
      const com = ult.find((l) => (l.colhedores ?? []).length > 0);
      if (!com) return setErro('Ainda não há colheita com colhedores para repetir.');
      const novos: Colhedor[] = [];
      for (const c of com.colhedores as any[]) {
        if (!c.pessoa_id || colhedores.some((x) => x.pessoaId === c.pessoa_id) || novos.some((x) => x.pessoaId === c.pessoa_id)) continue;
        novos.push({ chave: chave(), pessoaId: c.pessoa_id, nome: um(c.pessoa)?.nome ?? '', qtd: '', preco: '' });
      }
      setColhedores((l) => [...l, ...novos.sort((a, b) => a.nome.localeCompare(b.nome))]);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  const carregarMaquinas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('imobilizados').select('id, numero, nome, categoria, situacao').eq('fazenda_id', fid!).in('categoria', ['tratores', 'maquinas', 'implementos', 'equipamentos']).order('numero'));
    return d.map((b) => ({ id: b.id, titulo: `${b.nome}`, detalhe: `Bem nº ${b.numero}`, oculto: b.situacao !== 'ativo' }));
  }, [fid]);
  const carregarSafras = useCallback(async (): Promise<ItemLista[]> => safras.map((s) => ({ id: s.id, titulo: s.nome, detalhe: `${doBanco(s.data_inicio)} a ${doBanco(s.data_fim)}`, oculto: s.situacao !== 'aberta' })), [safras]);

  function limpar() {
    setId(null);
    setNumero(null);
    setData(hojeBR());
    setSafraId(null);
    setAreaId(null);
    setTipo('');
    setColhedores([]);
    setQuantidade('');
    setMaquinaDe('propria');
    setMaquinaId(null);
    setHoras('');
    setOperadorId(null);
    setPrestadorId(null);
    setForma('');
    setSPreco('');
    setSValor('');
    setSVenc('');
    setObs('');
    setErros({});
    setErro(null);
    setAlterarAberto(false);
    setAlterarNum('');
    setAlterarErro(null);
  }

  async function abrirPorNumero() {
    setAlterarErro(null);
    if (!alterarNum) return setAlterarErro('Informe o número.');
    return abrirColheita(supabase.from('pc_lotes').select('*').eq('fazenda_id', fid!).eq('numero', Number(alterarNum)).maybeSingle(), `nº ${alterarNum}`, setAlterarErro);
  }

  // V149: veio da ficha da colheita pelo botão "Alterar ou excluir"
  useEffect(() => {
    if (params?.abrirId) abrirColheita(supabase.from('pc_lotes').select('*').eq('id', params.abrirId).maybeSingle(), '', setErro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.abrirId]);

  async function abrirColheita(busca: PromiseLike<{ data: any }>, qual: string, falha: (m: string) => void) {
    medidaInicial.current = true; // a medida que vale é a da colheita aberta, não a sugerida
    try {
      const { data: l } = await busca;
      if (!l) return falha(`Não existe a colheita ${qual} nesta fazenda.`);
      const cs = await consulta<any[]>(supabase.from('pc_colhedores').select('pessoa_id, quantidade, preco, fechamento_id, pessoa:pessoas ( nome )').eq('lote_id', l.id));
      if (cs.some((c) => c.fechamento_id)) return falha('Esta colheita já entrou em fechamento de pagamento: exclua o fechamento antes de alterar.');
      setId(l.id);
      setNumero(l.numero);
      setData(doBanco(l.data_colheita));
      setSafraId(l.safra_id);
      setAreaId(l.area_id);
      setTipo(l.tipo_colheita ?? 'manual');
      setUnidade(l.unidade);
      setLitros(numeroParaCampo(l.litros_por_unidade));
      setPreco(moedaParaCampo(l.preco_medida));
      setColhedores(
        cs
          .map((c) => ({ chave: chave(), pessoaId: c.pessoa_id, nome: um(c.pessoa)?.nome ?? '', qtd: numeroParaCampo(c.quantidade), preco: l.preco_medida != null && Number(c.preco) === Number(l.preco_medida) ? '' : moedaParaCampo(c.preco) }))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
      );
      setQuantidade(cs.length ? '' : numeroParaCampo(l.quantidade_bruta));
      setMaquinaDe(l.maquina_de ?? 'propria');
      setMaquinaId(l.maquina_id);
      setHoras(numeroParaCampo(l.servico_forma === 'hora' ? l.servico_qtd : l.horas_maquina));
      setOperadorId(l.operador_id);
      setPrestadorId(l.prestador_id);
      setForma(l.servico_forma ?? '');
      setSPreco(moedaParaCampo(l.servico_preco));
      setSValor(l.servico_forma === 'total' ? moedaParaCampo(l.servico_valor) : '');
      setSVenc(doBanco(l.servico_vencimento));
      setObs(l.observacoes ?? '');
      setErros({});
      setErro(null);
      setAviso(null);
      setAlterarAberto(false);
    } catch (e) {
      falha(traduzirErro(e));
    }
  }

  // ---------- gravar ----------
  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(data)) e.data = 'Informe a data.';
    else if (paraBanco(data)! > hojeBanco()) e.data = 'A data não pode ser futura.';
    if (!areaId) e.area = 'Escolha o talhão colhido.';
    if (!tipo) e.tipo = 'Escolha como foi a colheita.';
    if (!unidade) e.unidade = 'Escolha a medida.';
    else if (!lpu || lpu <= 0) e.litros = unidade === 'kg' ? 'Informe quantos litros dá 1 kg de café.' : `Informe quantos litros tem o ${unidade}.`;
    if (preco.trim() && n(preco) == null) e.preco = 'Preço inválido.';
    if (usaColhedores) {
      colhedores.forEach((c) => {
        if (!n(c.qtd) || n(c.qtd)! <= 0) e[`q${c.chave}`] = `Informe a quantidade de ${c.nome}.`;
      });
    } else if (tipo && (!n(quantidade) || n(quantidade)! <= 0)) e.quantidade = 'Informe a quantidade colhida.';
    if (comMaquina && horas.trim() && (n(horas) == null || n(horas)! < 0)) e.horas = 'Horas inválidas.';
    if (terceiro) {
      if (!prestadorId) e.prestador = 'Informe o dono da máquina.';
      if (forma === 'hora' && (!n(horas) || !n(sPreco))) e.servico = 'Serviço por hora: informe as horas e o preço da hora.';
      if (forma === 'medida' && !n(sPreco)) e.servico = `Serviço por medida: informe o preço por ${nomeUn}.`;
      if (forma === 'total' && !n(sValor)) e.servico = 'Informe o valor do serviço.';
      if (forma && sVenc && !dataValida(sVenc)) e.venc = 'Vencimento inválido.';
    }
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    const p = {
      id,
      fazenda_id: fid,
      data: paraBanco(data),
      safra_id: safraId ?? '',
      area_id: areaId,
      tipo_colheita: tipo,
      unidade,
      litros_por_unidade: lpu,
      preco: n(preco),
      quantidade: usaColhedores ? null : n(quantidade),
      colhedores: usaColhedores ? colhedores.map((c) => ({ pessoa_id: c.pessoaId, quantidade: n(c.qtd), preco: c.preco.trim() ? n(c.preco) : null })) : [],
      maquina_de: comMaquina ? maquinaDe : '',
      maquina_id: maquinaId ?? '',
      horas_maquina: comMaquina ? n(horas) : null,
      operador_id: operadorId ?? '',
      prestador_id: prestadorId ?? '',
      servico_forma: terceiro ? forma : '',
      servico_qtd: forma === 'hora' ? n(horas) : null,
      servico_preco: n(sPreco),
      servico_valor: n(sValor),
      servico_vencimento: terceiro && forma && dataValida(sVenc) ? paraBanco(sVenc) : '',
      observacoes: obs.trim(),
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_colheita', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; quantidade: number; litros: number; valor: number; servico: number; safra: string };
    const talhao = talhoes.find((t) => t.id === areaId)?.nome ?? '';
    const partes = [`Colheita nº ${res.numero} ${id ? 'alterada' : 'lançada'}: ${textoMedida(res.quantidade, unidade)} (${textoLitros(res.litros)}) em ${talhao}, ${res.safra}`];
    if (res.valor) partes.push(`produção de ${formatarMoeda(res.valor)} para o fechamento dos colhedores`);
    if (res.servico) partes.push(`serviço de máquina de ${formatarMoeda(res.servico)} no Contas a pagar`);
    if (id && voltarDaConsulta(navegacao, params?.abrirId, false)) return;
    limpar();
    setAviso(`${partes.join('; ')}.`);
    carregarBase();
  }

  function excluir() {
    Alert.alert('Excluir colheita', `Excluir a colheita nº ${numero}? A produção dos colhedores e o título do serviço de máquina saem junto.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_colheita', { p_id: id }), 'colheita_id', String(id));
          if (error) return setErro(traduzirErro(error));
          if (voltarDaConsulta(navegacao, params?.abrirId, true)) return;
          const num = numero;
          limpar();
          setAviso(`Colheita nº ${num} excluída.`);
          carregarBase();
        },
      },
    ]);
  }

  // ---------- tela ----------
  const abas = (
    <AbasTela
      opcoes={[
        { valor: 'lancar', rotulo: 'Lançar' },
        { valor: 'pagamento', rotulo: 'Pagamento' },
        { valor: 'consultar', rotulo: 'Consultar' },
      ]}
      valor={[aba]}
      aoMudar={(v) => setAba(v[0] as AbaColheita)}
    />
  );
  if (aba === 'pagamento') {
    return (
      <Tela>
        {abas}
        <PagamentoColheita />
      </Tela>
    );
  }
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaColheitas />
      </Tela>
    );
  }

  return (
    <Tela rodape={<RodapeAcoes titulo={id ? 'Salvar alterações' : 'Lançar colheita'} aoConfirmar={salvar} carregando={salvando} aoDescartar={tipo || areaId ? limpar : undefined} erro={erro} />}>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Colheita nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair desta colheita e lançar uma nova
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar a colheita nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar uma colheita já lançada
        </Text>
      )}

      {/* ---------- onde ---------- */}
      <Secao titulo="Talhão colhido" />
      {carregado && talhoes.length === 0 ? (
        <Text style={estilos.nota}>Nenhum talhão cadastrado nesta fazenda. Cadastre em Agrícola › Talhões.</Text>
      ) : (
        <View style={estilos.chips}>
          {talhoes.map((t) => {
            const marcado = areaId === t.id;
            return (
              <Pressable key={t.id} onPress={() => setAreaId(t.id)} accessibilityRole="radio" accessibilityState={{ checked: marcado }} style={({ pressed }) => [estilos.chip, marcado && estilos.chipMarcado, pressed && { opacity: 0.8 }]}>
                <Text style={[estilos.chipTexto, marcado && { color: '#FFFFFF' }]}>{t.nome}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {erros.area ? <Text style={estilos.erro}>{erros.area}</Text> : null}
      {safras.length > 1 || safraId ? (
        <SeletorLista rotulo="Safra" valorId={safraId ?? safraAuto?.id ?? null} aoMudar={setSafraId} carregar={carregarSafras} vazio="Nenhuma safra aberta." />
      ) : (
        <Text style={estilos.nota}>{safraUsada ? `Safra: ${safraUsada.nome}.` : carregado ? `Nenhuma safra aberta: o sistema abre a "Safra ${(dataIso ?? hojeBanco()).slice(0, 4)}" neste lançamento. Para definir período e previsão, use Agrícola › Safras.` : ''}</Text>
      )}

      {/* ---------- como ---------- */}
      <Secao titulo="Como foi colhido" />
      <Escolha opcoes={TIPOS_COLHEITA} valor={tipo ? [tipo] : []} aoMudar={(v) => setTipo(v[0] as TipoColheita)} erro={erros.tipo} />
      {tipo === 'lona' && <Text style={estilos.nota}>Máquina que arrasta a lona, com os trabalhadores colhendo junto e recebendo por produção.</Text>}
      {tipo === 'automotriz' && <Text style={estilos.nota}>Colhedora automotriz: sem pagamento por produção. Informe o total colhido e a máquina.</Text>}

      {tipo !== '' && (
        <>
          {/* ---------- medida ---------- */}
          <Secao titulo="Medida" />
          <Escolha opcoes={UNIDADES_COLHEITA} valor={unidade ? [unidade] : []} aoMudar={(v) => escolherUnidade(v[0])} erro={erros.unidade} />
          {unidade !== '' && (
            <View style={estilos.linha}>
              {unidade !== 'litro' && (
                <View style={{ flex: 1 }}>
                  <Campo rotulo={ROTULO_CAPACIDADE[unidade]} value={litros} onChangeText={setLitros} keyboardType="decimal-pad" erro={erros.litros} />
                </View>
              )}
              {porProducao && (
                <View style={{ flex: 1 }}>
                  <CampoMoeda rotulo={`Preço por ${nomeUn} (R$)`} valor={preco} aoMudar={setPreco} erro={erros.preco} />
                </View>
              )}
            </View>
          )}
          {unidade !== '' && unidade !== 'litro' && (
            <Text style={estilos.nota}>
              {unidade === 'kg' ? 'Aproximado: o café maduro pesa perto de 0,6 kg por litro (1 kg ≈ 1,6 L). Ajuste para o da sua lavoura. ' : ''}
              Os litros juntam colheitas de medidas diferentes e servem para o rendimento na pilagem. O sistema guarda a capacidade e o preço para a próxima colheita.
            </Text>
          )}

          {/* ---------- colhedores ---------- */}
          {porProducao && unidade !== '' && (
            <>
              <Secao titulo="Colhedores (produção do dia)" />
              {colhedores.map((c) => (
                <View key={c.chave} style={estilos.item}>
                  <View style={estilos.itemTopo}>
                    <Text style={estilos.itemNome}>{c.nome}</Text>
                    <Pressable onPress={() => setColhedores((l) => l.filter((x) => x.chave !== c.chave))} hitSlop={10} accessibilityLabel={`Tirar ${c.nome}`}>
                      <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
                    </Pressable>
                  </View>
                  <View style={estilos.linha}>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo={`Qtde. (${nomeUn}) *`} value={c.qtd} onChangeText={(t) => mudarColhedor(c.chave, { qtd: t })} keyboardType="decimal-pad" erro={erros[`q${c.chave}`] ? ' ' : undefined} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CampoMoeda rotulo="Preço (R$)" valor={c.preco} aoMudar={(t) => mudarColhedor(c.chave, { preco: t })} placeholder={preco || '0,00'} />
                    </View>
                    <View style={estilos.valorLinha}>
                      <Text style={estilos.valorRotulo}>A receber</Text>
                      <Text style={estilos.valorTexto}>{formatarMoeda(valorDe(c))}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <CampoPessoaBusca rotulo={colhedores.length ? 'Mais um colhedor' : 'Colhedor'} valorId={null} aoMudar={incluirColhedor} tipoNovo="funcionario" />
              <Text style={estilos.link} onPress={repetirColhedores}>
                + Trazer os colhedores da última colheita
              </Text>
              <Text style={estilos.nota}>O preço de cada um vem do preço da medida; mude na linha se for diferente. A produção fica em aberto até o fechamento, na aba Pagamento.</Text>
            </>
          )}

          {/* ---------- total ---------- */}
          {unidade !== '' && !usaColhedores && (
            <>
              <Campo rotulo={`Quantidade colhida (${nomeUn}) *`} value={quantidade} onChangeText={setQuantidade} keyboardType="decimal-pad" erro={erros.quantidade} />
              {porProducao && <Text style={estilos.nota}>Sem colhedores na lista (ex.: diaristas ou mensalistas): informe só o total. Não gera pagamento por produção.</Text>}
            </>
          )}

          {/* ---------- máquina ---------- */}
          {comMaquina && (
            <>
              <Secao titulo="Máquina" />
              <Escolha
                opcoes={[
                  { valor: 'propria', rotulo: 'Própria' },
                  { valor: 'terceiro', rotulo: 'De terceiro' },
                ]}
                valor={[maquinaDe]}
                aoMudar={(v) => setMaquinaDe(v[0] as 'propria' | 'terceiro')}
              />
              {maquinaDe === 'propria' ? (
                <>
                  <SeletorLista rotulo="Máquina" valorId={maquinaId} aoMudar={setMaquinaId} carregar={carregarMaquinas} permitirLimpar vazio="Nenhuma máquina no Imobilizado. Cadastre em Mais › Imobilizado." />
                  <Campo rotulo="Horas de máquina" value={horas} onChangeText={setHoras} keyboardType="decimal-pad" erro={erros.horas} />
                  <CampoPessoaBusca rotulo="Operador" valorId={operadorId} aoMudar={setOperadorId} tipoNovo="funcionario" />
                </>
              ) : (
                <>
                  <CampoPessoaBusca rotulo="Dono da máquina (prestador) *" valorId={prestadorId} aoMudar={setPrestadorId} tipoNovo="fornecedor" erro={erros.prestador} />
                  <Escolha rotulo="Como ele cobra" opcoes={[...FORMAS_SERVICO, { valor: '', rotulo: 'Lançar depois' }]} valor={[forma]} aoMudar={(v) => setForma(v[0])} />
                  {forma === 'hora' && (
                    <View style={estilos.linha}>
                      <View style={{ flex: 1 }}>
                        <Campo rotulo="Horas *" value={horas} onChangeText={setHoras} keyboardType="decimal-pad" erro={erros.horas} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <CampoMoeda rotulo="Preço da hora (R$) *" valor={sPreco} aoMudar={setSPreco} />
                      </View>
                    </View>
                  )}
                  {forma === 'medida' && <CampoMoeda rotulo={`Preço por ${nomeUn} (R$) *`} valor={sPreco} aoMudar={setSPreco} />}
                  {forma === 'total' && <CampoMoeda rotulo="Valor do serviço (R$) *" valor={sValor} aoMudar={setSValor} />}
                  {forma !== 'hora' && <Campo rotulo="Horas de máquina" value={horas} onChangeText={setHoras} keyboardType="decimal-pad" erro={erros.horas} />}
                  {erros.servico ? <Text style={estilos.erro}>{erros.servico}</Text> : null}
                  {forma !== '' ? (
                    <>
                      <CampoData rotulo="Vencimento do serviço" valor={sVenc} aoMudar={setSVenc} erro={erros.venc} />
                      <Text style={estilos.nota}>Gera um título no Contas a pagar em nome do prestador, no centro de custo do talhão. Em branco, vence na data da colheita.</Text>
                    </>
                  ) : (
                    <Text style={estilos.nota}>Sem valor agora: o serviço não vai para o Contas a pagar. Se vier nota depois, lance em Mais › Compras como serviço.</Text>
                  )}
                </>
              )}
            </>
          )}

          <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 70, paddingTop: 12 }} />

          {qtdTotal > 0 && unidade !== '' && (
            <View style={estilos.resumo}>
              <Par a="Total colhido" b={`${textoMedida(qtdTotal, unidade)}${lpu && unidade !== 'litro' ? ` · ${textoLitros(qtdTotal * lpu)}` : ''}`} forte />
              {usaColhedores && <Par a={`Produção de ${colhedores.length} ${colhedores.length === 1 ? 'colhedor' : 'colhedores'}`} b={formatarMoeda(valorProducao)} />}
              {valorServico > 0 && <Par a="Serviço de máquina" b={formatarMoeda(valorServico)} />}
              {custoTotal > 0 && <Par a={`Custo por ${nomeUn}`} b={formatarMoeda(custoTotal / qtdTotal)} />}
              {custoTotal > 0 && lpu ? <Par a="Custo por 1.000 L" b={formatarMoeda((custoTotal / (qtdTotal * lpu)) * 1000)} /> : null}
              {usaColhedores && <Text style={estilos.nota}>Média de {formatarQtd(qtdTotal / colhedores.length, 1)} {nomeUn} por colhedor.</Text>}
            </View>
          )}
        </>
      )}

      {id && <Botao titulo="Excluir colheita" tipo="perigo" onPress={excluir} />}
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
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: cores.cafe, backgroundColor: cores.cartao, justifyContent: 'center' },
  chipMarcado: { backgroundColor: cores.cafe },
  chipTexto: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.cafe },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  itemNome: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  valorLinha: { minWidth: 92, alignItems: 'flex-end', gap: 6 },
  valorRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.textoSuave },
  valorTexto: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe, minHeight: tam.alturaToque, textAlignVertical: 'center', paddingTop: 14 },
  resumo: { backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto, textAlign: 'right', flexShrink: 1 },
});
