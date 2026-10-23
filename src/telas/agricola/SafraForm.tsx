import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { perguntar } from '../../lib/perguntar';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarNumero, formatarQtd, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { anoSafra } from '../../lib/talhoes';
import { semAcento } from '../../lib/codigos';
import { limparBusca } from '../../lib/useBusca';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

// V142: a previsão é informada em sacas por hectare; o sistema calcula as sacas do talhão pela área útil
type Talhao = { id: string; nome: string; util: number | null; previsaoCadastro: number | null };
const porHa = (sacas: any, util: number | null) => (sacas != null && util ? Math.round((Number(sacas) / util) * 100) / 100 : null);
const sacasDe = (ha: number | null, util: number | null) => (ha != null && util ? Math.round(ha * util * 10) / 10 : null);
const n = (t: string) => lerNumero(t);

/** Safras: abertura (nome, período e previsão por talhão), encerramento e consulta com o previsto x colhido. */
export default function SafraForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'SafraForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const padrao = anoSafra(hojeBanco());

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [safras, setSafras] = useState<any[] | null>(null);
  const [busca, setBusca] = useState('');

  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [situacao, setSituacao] = useState('aberta');
  const [nome, setNome] = useState('');
  const [cultura, setCultura] = useState('Café');
  const [inicio, setInicio] = useState(doBanco(padrao.inicio));
  const [fim, setFim] = useState(doBanco(padrao.fim));
  const [prev, setPrev] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Safra nº ${numero}` : 'Safras' });
  }, [navegacao, id, numero]);

  const carregar = useCallback(async () => {
    if (!fid) return;
    try {
      const [ar, sf] = await Promise.all([
        consulta<any[]>(supabase.from('areas').select('id, nome, area_ha, area_util_ha, previsao_sacas, previsao_sc_ha').eq('fazenda_id', fid).eq('tipo', 'talhao').eq('ativa', true).order('nome')),
        consulta<any[]>(supabase.from('safras').select('*').eq('fazenda_id', fid).order('data_inicio', { ascending: false, nullsFirst: false }).order('numero', { ascending: false })),
      ]);
      setTalhoes(ar.map((a) => { const util = Number(a.area_util_ha ?? a.area_ha) || null; return { id: a.id, nome: a.nome, util, previsaoCadastro: a.previsao_sc_ha != null ? Number(a.previsao_sc_ha) : porHa(a.previsao_sacas, util) }; }));
      setSafras(sf);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  // safra nova: a previsão de cada talhão vem do cadastro do talhão
  useEffect(() => {
    if (id) return;
    setPrev((atual) => {
      const novo = { ...atual };
      for (const t of talhoes) if (novo[t.id] === undefined) novo[t.id] = numeroParaCampo(t.previsaoCadastro);
      return novo;
    });
  }, [talhoes, id]);

  function limpar() {
    setId(null);
    setNumero(null);
    setSituacao('aberta');
    setNome('');
    setCultura('Café');
    setInicio(doBanco(padrao.inicio));
    setFim(doBanco(padrao.fim));
    setPrev(Object.fromEntries(talhoes.map((t) => [t.id, numeroParaCampo(t.previsaoCadastro)])));
    setObs('');
    setErros({});
    setErro(null);
    setAlterarErro(null);
  }

  // V127: a safra a alterar, encerrar ou excluir é escolhida na relação das cadastradas
  const carregarSafras = useCallback(async (): Promise<ItemLista[]> => {
    const sf = await consulta<any[]>(supabase.from('safras').select('id, numero, nome, cultura, situacao, data_inicio, data_fim').eq('fazenda_id', fid!).order('numero', { ascending: false }));
    return sf.map((s) => ({ id: s.id, titulo: `Nº ${s.numero} · ${s.nome}`, detalhe: `${doBanco(s.data_inicio)} a ${doBanco(s.data_fim)}${s.cultura ? ` · ${s.cultura}` : ''} · ${s.situacao === 'aberta' ? 'aberta' : 'encerrada'}` }));
  }, [fid]);

  async function abrirSafra(safraId: string) {
    setAlterarErro(null);
    let s = (safras ?? []).find((x) => x.id === safraId);
    if (!s) s = await consulta<any>(supabase.from('safras').select('*').eq('id', safraId).maybeSingle()).catch(() => null);
    if (!s) return setAlterarErro('Safra não encontrada nesta fazenda.');
    try {
      const st = await consulta<any[]>(supabase.from('safra_talhoes').select('area_id, previsao_sacas, previsao_sc_ha').eq('safra_id', s.id));
      setId(s.id);
      setNumero(s.numero);
      setSituacao(s.situacao);
      setNome(s.nome);
      setCultura(s.cultura ?? '');
      setInicio(doBanco(s.data_inicio));
      setFim(doBanco(s.data_fim));
      setPrev(Object.fromEntries(talhoes.map((t) => { const x = st.find((y) => y.area_id === t.id); return [t.id, numeroParaCampo(x?.previsao_sc_ha != null ? Number(x.previsao_sc_ha) : porHa(x?.previsao_sacas, t.util))]; })));
      setObs(s.observacoes ?? '');
      setErros({});
      setAviso(null);
    } catch (e) {
      setAlterarErro(traduzirErro(e));
    }
  }

  // veio do painel da safra: abre ela para alterar, encerrar ou excluir
  const abertaPeloPainel = React.useRef(false);
  useEffect(() => {
    if (!params?.id || abertaPeloPainel.current || safras === null || !talhoes) return;
    abertaPeloPainel.current = true;
    abrirSafra(params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id, safras, talhoes]);

  const somaPrev = talhoes.reduce((s, t) => s + (sacasDe(n(prev[t.id] ?? ''), t.util) ?? 0), 0);
  const somaHa = talhoes.filter((t) => sacasDe(n(prev[t.id] ?? ''), t.util)).reduce((s, t) => s + (t.util ?? 0), 0);

  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!nome.trim()) e.nome = 'Dê um nome à safra (ex.: Safra 2027).';
    if (!dataValida(inicio)) e.inicio = 'Informe o início.';
    if (!dataValida(fim)) e.fim = 'Informe o fim previsto.';
    if (dataValida(inicio) && dataValida(fim) && paraBanco(fim)! <= paraBanco(inicio)!) e.fim = 'O fim precisa ser depois do início.';
    for (const t of talhoes) {
      const v = prev[t.id] ?? '';
      if (v.trim() && (n(v) == null || n(v)! < 0)) e.prev = `Previsão inválida em ${t.nome}.`;
    }
    if (!id && (safras ?? []).some((s) => semAcento(s.nome) === semAcento(nome.trim()))) e.nome = 'Já existe uma safra com este nome.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;
    setSalvando(true);
    try {
      const dados = { nome: nome.trim(), cultura: cultura.trim() || null, data_inicio: paraBanco(inicio), data_fim: paraBanco(fim), ano_agricola: paraBanco(fim)!.slice(0, 4), observacoes: obs.trim() || null };
      let sid = id;
      let num = numero;
      if (id) await consulta(supabase.from('safras').update(dados).eq('id', id).select('id').single());
      else {
        const s = await consulta<any>(supabase.from('safras').insert({ ...dados, fazenda_id: fid, situacao: 'aberta' }).select('id, numero').single());
        sid = s.id;
        num = s.numero;
      }
      await consulta(supabase.from('safra_talhoes').delete().eq('safra_id', sid!));
      const linhas = talhoes.filter((t) => n(prev[t.id] ?? '') != null).map((t) => ({ safra_id: sid, area_id: t.id, previsao_sc_ha: n(prev[t.id]), previsao_sacas: sacasDe(n(prev[t.id]), t.util) }));
      if (linhas.length) await consulta(supabase.from('safra_talhoes').insert(linhas));
      const era = !!id;
      limpar();
      setAviso(`Safra nº ${num} ${era ? 'alterada' : 'aberta'}.`);
      carregar();
    } catch (x) {
      setErro(traduzirErro(x));
    } finally {
      setSalvando(false);
    }
  }

  function mudarSituacao(nova: 'aberta' | 'encerrada') {
    const encerrar = nova === 'encerrada';
    Alert.alert(
      encerrar ? 'Encerrar safra' : 'Reabrir safra',
      encerrar ? `Encerrar a safra nº ${numero}? Ela deixa de receber colheitas. Dá para reabrir depois.` : `Reabrir a safra nº ${numero}? Ela volta a receber colheitas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: encerrar ? 'Encerrar' : 'Reabrir',
          onPress: async () => {
            const { error } = await supabase.from('safras').update({ situacao: nova, encerrada_em: encerrar ? hojeBanco() : null }).eq('id', id!);
            if (error) return setErro(traduzirErro(error));
            const num = numero;
            limpar();
            setAviso(`Safra nº ${num} ${encerrar ? 'encerrada' : 'reaberta'}.`);
            carregar();
          },
        },
      ],
    );
  }

  // V127: só exclui a safra sem movimento; mesmo assim pergunta antes
  async function excluir() {
    if (!id) return;
    setErro(null);
    setAviso(null);
    try {
      const movimento = await movimentosDaSafra(id);
      if (movimento.length) {
        return setErro(`A safra nº ${numero} tem movimento e não pode ser excluída: ${movimento.join(', ')}. Se ela já terminou, use "Encerrar safra".`);
      }
    } catch (e) {
      return setErro(traduzirErro(e));
    }
    const ok = await perguntar('Excluir safra', `A safra nº ${numero} (${nome}) não tem movimento. Quer mesmo excluir? A previsão dos talhões dela também sai. Não dá para desfazer.`, 'Excluir', 'Voltar');
    if (!ok) return;
    const { error } = await supabase.from('safras').delete().eq('id', id);
    if (error) return setErro(/foreign key/i.test(error.message) ? 'Esta safra já tem movimento (colheitas, atividades ou café): não pode ser excluída. Encerre a safra.' : traduzirErro(error));
    const num = numero;
    limpar();
    setAviso(`Safra nº ${num} excluída.`);
    carregar();
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Abrir safra" />;

  // ---------- consultar ----------
  if (aba === 'consultar') {
    const termo = semAcento(limparBusca(busca));
    // V127: a relação das safras aparece logo; a busca filtra
    const achadas = safras ? (termo ? safras.filter((s) => String(s.numero) === termo || semAcento(`${s.nome} ${s.cultura ?? ''}`).includes(termo)) : safras) : null;
    const linha = (s: any) => (
      <Linha
        key={s.id}
        titulo={`Nº ${s.numero} · ${s.nome}`}
        linhas={[`${doBanco(s.data_inicio)} a ${doBanco(s.data_fim)}${s.cultura ? ` · ${s.cultura}` : ''}`, s.situacao === 'aberta' ? 'Aberta' : `Encerrada${s.encerrada_em ? ` em ${doBanco(s.encerrada_em)}` : ''}`]}
        onPress={() => navegacao.navigate('SafraDetalhe', { id: s.id })}
      />
    );
    return (
      <Tela>
        {abas}
        <Busca valor={busca} aoMudar={setBusca} dica="Nº ou nome da safra" />
        {erro && <Aviso tipo="erro" texto={erro} />}
        {safras === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        ) : safras.length === 0 ? (
          <Text style={estilos.dica}>Nenhuma safra aberta ainda.</Text>
        ) : achadas!.length === 0 ? (
          <Text style={estilos.dica}>Nenhuma safra com "{busca.trim()}".</Text>
        ) : (
          <>
            {!termo && <Secao titulo={`Safras da fazenda (${safras.length})`} />}
            <Lista>{achadas!.map(linha)}</Lista>
            <Text style={estilos.nota}>Toque na safra para ver o previsto x colhido. Para alterar, encerrar ou excluir, use a aba Abrir safra.</Text>
          </>
        )}
      </Tela>
    );
  }

  // ---------- abrir / alterar ----------
  const proximo = safras ? Math.max(0, ...safras.map((s) => s.numero ?? 0)) + 1 : null;
  return (
    <Tela rodape={<RodapeAcoes titulo={id ? 'Salvar alterações' : 'Abrir safra'} aoConfirmar={salvar} carregando={salvando} aoDescartar={id || nome ? limpar : undefined} erro={erro} />}>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Safra nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Nome *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder={`Ex.: Safra ${padrao.fim.slice(0, 4)}`} erro={erros.nome} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair desta safra e abrir uma nova
        </Text>
      ) : (
        <SeletorLista
          rotulo="Alterar, encerrar ou excluir uma safra"
          valorId={null}
          aoMudar={(v) => v && abrirSafra(v)}
          carregar={carregarSafras}
          dicaBusca="Nº ou nome da safra"
          vazio="Nenhuma safra cadastrada."
          erro={alterarErro}
        />
      )}
      {id && situacao === 'encerrada' && <Aviso tipo="info" texto="Safra encerrada: não recebe colheitas. Reabra para lançar de novo." />}

      <Campo rotulo="Cultura" value={cultura} onChangeText={setCultura} autoCapitalize="sentences" placeholder="Ex.: Café" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Início *" valor={inicio} aoMudar={setInicio} erro={erros.inicio} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Fim previsto *" valor={fim} aoMudar={setFim} erro={erros.fim} />
        </View>
      </View>
      <Text style={estilos.nota}>O período é o do custeio da safra: dos tratos até o fim da colheita. Vem de 1º de setembro a 31 de agosto, para não cortar a colheita no meio; pode mudar. O painel do talhão usa o período da safra aberta.</Text>

      <Secao titulo="Previsão por talhão (sacas beneficiadas por hectare)" />
      {talhoes.length === 0 ? (
        <Text style={estilos.nota}>Nenhum talhão cadastrado nesta fazenda. Cadastre em Agrícola › Talhões.</Text>
      ) : (
        <View style={estilos.caixa}>
          {talhoes.map((t) => {
            const v = n(prev[t.id] ?? '');
            return (
              <View key={t.id} style={estilos.talhao}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.talhaoNome}>{t.nome}</Text>
                  <Text style={estilos.nota}>
                    {t.util ? `${formatarNumero(t.util, 2)} ha` : 'Sem área: informe a área no cadastro do talhão'}
                    {v != null && t.util ? ` · calculado: ${formatarQtd(sacasDe(v, t.util))} sc` : ''}
                  </Text>
                </View>
                <View style={{ width: 120 }}>
                  <Campo rotulo="" value={prev[t.id] ?? ''} onChangeText={(x) => setPrev((p) => ({ ...p, [t.id]: x }))} keyboardType="decimal-pad" placeholder="sc/ha" />
                </View>
              </View>
            );
          })}
          <Text style={estilos.total}>
            Total previsto: {formatarQtd(somaPrev)} sacas{somaHa ? ` · ${formatarNumero(somaPrev / somaHa, 1)} sc/ha` : ''}
          </Text>
          {erros.prev ? <Text style={estilos.erro}>{erros.prev}</Text> : null}
          <Text style={estilos.nota}>Informe as sacas estimadas por hectare: o sistema calcula as sacas de cada talhão pela área útil. Vem da estimativa do cadastro de cada talhão. Talhão em branco fica fora da previsão.</Text>
        </View>
      )}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 70, paddingTop: 12 }} />

      {id && situacao === 'aberta' && <Botao titulo="Encerrar safra" tipo="secundario" onPress={() => mudarSituacao('encerrada')} />}
      {id && situacao === 'encerrada' && <Botao titulo="Reabrir safra" tipo="secundario" onPress={() => mudarSituacao('aberta')} />}
      {id && <Botao titulo="Excluir safra" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

/** O que a safra já tem lançado (se tiver, não pode ser excluída). */
async function movimentosDaSafra(safraId: string): Promise<string[]> {
  const tabelas: [string, string][] = [
    ['colheitas', 'colheitas'],
    ['atividades_agricolas', 'atividades'],
    ['cafe_lotes', 'lotes de café no armazém'],
    ['cafe_contratos', 'contratos de café'],
    ['pc_lotes', 'secagem e pilagem'],
    ['producao_movimentos', 'movimentos da produção'],
    ['vendas_producao', 'vendas da produção'],
  ];
  const r = await Promise.all(tabelas.map(([t]) => supabase.from(t).select('id', { count: 'exact', head: true }).eq('safra_id', safraId)));
  const achados: string[] = [];
  r.forEach((x, i) => {
    if (x.error) throw x.error;
    if ((x.count ?? 0) > 0) achados.push(`${x.count} ${tabelas[i][1]}`);
  });
  return achados;
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { minWidth: 96, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  talhao: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  talhaoNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  total: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.primariaEscura },
});
