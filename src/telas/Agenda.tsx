import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../componentes/Tela';
import Campo from '../componentes/Campo';
import CampoData from '../componentes/CampoData';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import Secao from '../componentes/Secao';
import Escolha from '../componentes/Escolha';
import IconesAgendas from '../componentes/IconesAgendas';
import QuadroFinancas from '../componentes/QuadroFinancas';
import { useSessao } from '../contexto/SessaoContext';
import { supabase, traduzirErro } from '../lib/supabase';
import { eDono } from '../lib/acessos';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../lib/datas';
import {
  ROTINAS_PADRAO,
  ROTULO_AUTOR,
  TIPOS_AUTOMATICOS,
  agruparAgenda,
  contarAnotacoes,
  UNIDADES_REPETICAO,
  chaveAgenda,
  enviarTarefa,
  lerAnotacoes,
  lerAutomaticos,
  lerEnviadas,
  lerFinanceiro,
  lerObrigacoes,
  lerRotinas,
  obrigacoesComoItens,
  podeAbrir,
  somarDiasIso,
  textoRepeticao,
  type AgendaRef,
  type ItemAgenda,
  type Obrigacao,
  type Rotinas,
  type TarefaEnviada,
  type UnidadeRepeticao,
} from '../lib/agenda';
import type { NomeIcone } from '../componentes/ItemMenu';
import type { NavPilha, PilhaParams } from '../navegacao/rotas';
import { cores, tam } from '../tema';

const DIAS_A_FRENTE = 60;
/** contas a pagar e a receber: aparecem as que vencem nos próximos dias (as vencidas vêm num aviso só) */
const DIAS_FINANCEIRO = 15;
/** na agenda do Produtor as contas não aparecem uma a uma: ele vê só os totais, no botão Finanças */
const SO_ESCRITORIO = ['pagar', 'receber', 'vencidos_pagar', 'vencidos_receber'];
const ICONE_AGENDA: Record<string, NomeIcone> = { produtor: 'person-outline', admin: 'shield-checkmark-outline', fazenda: 'home-outline', escritorio: 'business-outline' };

/**
 * Agendas: Produtor, uma por Fazenda e Escritório. O produtor cadastra os participantes e marca as agendas que cada um abre.
 * Sem parâmetro mostra a relação (com os participantes); tocando numa, abre só aquela (e só para quem tem autorização).
 */
export default function Agenda() {
  const { params } = useRoute<RouteProp<PilhaParams, 'Agenda'>>();
  return params?.agenda ? <AgendaAberta agenda={params.agenda} fazendaId={params.fazendaId} /> : <ListaAgendas />;
}

// ======================================================================
function ListaAgendas() {
  const navegacao = useNavigation<NavPilha>();
  const { agendas, recarregarAgendas, sessao, fazendas } = useSessao();
  const souDono = fazendas.some((f) => eDono(f.perfil));
  const userId = sessao?.user.id ?? '';
  const [abertas, setAbertas] = useState<Record<string, number>>({});
  const [enviadas, setEnviadas] = useState<TarefaEnviada[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // enviar tarefa
  const [enviando, setEnviando] = useState(false);
  const [data, setData] = useState(hojeBR());
  const [titulo, setTitulo] = useState('');
  const [obs, setObs] = useState('');
  const [paraQuem, setParaQuem] = useState<string[]>([]);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const lerEnvios = useCallback(() => {
    if (userId) lerEnviadas(userId, agendas, hojeBanco()).then(setEnviadas).catch(() => setEnviadas([]));
  }, [userId, agendas]);

  useFocusEffect(
    useCallback(() => {
      recarregarAgendas();
      contarAnotacoes().then(setAbertas).catch(() => setAbertas({}));
    }, [recarregarAgendas]),
  );
  useEffect(lerEnvios, [lerEnvios]);

  const nomeDe = (chave: string) => agendas.find((a) => chaveAgenda(a) === chave)?.nome ?? 'Agenda';

  async function enviar() {
    setErro(null);
    setSucesso(null);
    if (!data || !dataValida(data)) return setErro('Informe a data.');
    if (!titulo.trim()) return setErro('Escreva o que precisa ser feito.');
    if (!paraQuem.length) return setErro('Escolha: enviar para todas as agendas ou escolher para quem.');
    const destinos = paraQuem[0] === 'todas' ? agendas : agendas.filter((a) => escolhidas.includes(chaveAgenda(a)));
    if (!destinos.length) return setErro('Marque pelo menos uma agenda para receber a tarefa.');
    setSalvando(true);
    try {
      const n = await enviarTarefa(destinos, paraBanco(data)!, titulo.trim(), obs.trim());
      setSucesso(n === 1 ? `Tarefa enviada para a agenda ${destinos[0].nome}.` : `Tarefa enviada para ${n} agendas: ${destinos.map((d) => d.nome).join(', ')}.`);
      setTitulo('');
      setObs('');
      setParaQuem([]);
      setEscolhidas([]);
      setEnviando(false);
      contarAnotacoes().then(setAbertas).catch(() => {});
      lerEnvios();
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setSalvando(false);
  }

  async function excluirEnviada(t: TarefaEnviada) {
    const { error } = await supabase.from('agenda_itens').delete().eq('id', t.id);
    if (error) return setErro(traduzirErro(error));
    lerEnvios();
  }

  if (!agendas.length) {
    return (
      <Tela>
        <Aviso tipo="info" texto="Você ainda não participa de nenhuma agenda. É o produtor quem cadastra os participantes e marca as agendas de cada um, em Mais › Usuários e acessos." />
      </Tela>
    );
  }

  return (
    <Tela>
      <Text style={estilos.nota}>Toque na agenda que quer abrir. Embaixo do nome aparecem os participantes de cada uma.</Text>
      {aviso && <Aviso tipo="info" texto={aviso} />}
      {sucesso && <Aviso tipo="sucesso" texto={sucesso} />}
      <View style={estilos.lista}>
        {agendas.map((l, i) => {
          const chave = chaveAgenda(l);
          const n = l.podeAbrir ? abertas[chave] ?? 0 : 0;
          return (
            <Pressable
              key={chave}
              onPress={() => {
                setAviso(null);
                if (!l.podeAbrir) return setAviso(`Você não tem autorização para abrir a agenda "${l.nome}". Para mandar uma tarefa para ela, use "Enviar tarefa".`);
                navegacao.push('Agenda', { agenda: l.agenda, fazendaId: l.fazendaId });
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !l.podeAbrir }}
              style={({ pressed }) => [estilos.agenda, i > 0 && estilos.divisa, pressed && { backgroundColor: '#F3F6F2' }]}
            >
              <Ionicons name={ICONE_AGENDA[l.agenda]} size={26} color={l.podeAbrir ? cores.primaria : cores.textoSuave} />
              <View style={{ flex: 1 }}>
                <Text style={[estilos.agendaNome, !l.podeAbrir && { color: cores.textoSuave }]}>{l.nome}</Text>
                <Text style={estilos.itemDetalhe}>{l.participantes ? l.participantes : 'Sem participante cadastrado'}</Text>
                {n > 0 && <Text style={estilos.itemData}>{n === 1 ? '1 anotação em aberto' : `${n} anotações em aberto`}</Text>}
              </View>
              <Ionicons name={l.podeAbrir ? 'chevron-forward' : 'lock-closed'} size={20} color={cores.textoSuave} />
            </Pressable>
          );
        })}
      </View>

      {erro && <Aviso tipo="erro" texto={erro} />}
      {enviando ? (
        <View style={estilos.cartao}>
          <Text style={estilos.agendaNome}>Enviar tarefa</Text>
          <CampoData rotulo="Prazo para cumprir *" valor={data} aoMudar={setData} />
          <Campo rotulo="O que fazer *" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Mandar a relação do gado vacinado" />
          <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />
          <Escolha
            rotulo="Para quem? *"
            opcoes={[
              { valor: 'todas', rotulo: 'Enviar para todas' },
              { valor: 'escolher', rotulo: 'Escolher para quem' },
            ]}
            valor={paraQuem}
            aoMudar={setParaQuem}
          />
          {paraQuem[0] === 'todas' && <Text style={estilos.nota}>Vai para as {agendas.length} agendas: {agendas.map((a) => a.nome).join(', ')}.</Text>}
          {paraQuem[0] === 'escolher' && (
            <View style={estilos.lista}>
              {agendas.map((a, i) => {
                const chave = chaveAgenda(a);
                const marcada = escolhidas.includes(chave);
                return (
                  <Pressable
                    key={chave}
                    onPress={() => setEscolhidas(marcada ? escolhidas.filter((x) => x !== chave) : [...escolhidas, chave])}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: marcada }}
                    style={({ pressed }) => [estilos.agenda, i > 0 && estilos.divisa, pressed && { backgroundColor: '#F3F6F2' }]}
                  >
                    <Ionicons name={marcada ? 'checkbox' : 'square-outline'} size={26} color={marcada ? cores.primaria : cores.textoSuave} />
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.itemTitulo}>{a.nome}</Text>
                      <Text style={estilos.itemDetalhe}>{a.participantes ? a.participantes : 'Sem participante cadastrado'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Botao titulo="Enviar" onPress={enviar} carregando={salvando} />
          <Botao titulo="Cancelar" tipo="texto" onPress={() => { setEnviando(false); setErro(null); }} />
        </View>
      ) : (
        <Botao titulo="Enviar tarefa" onPress={() => { setSucesso(null); setAviso(null); setEnviando(true); }} />
      )}

      {enviadas.length > 0 && (
        <>
          <Secao titulo="Tarefas que enviei" />
          <Text style={estilos.nota}>O que você mandou para agendas que não abre: em aberto, ou feitas nos últimos 30 dias.</Text>
          {enviadas.map((t) => (
            <View key={t.id} style={estilos.item}>
              <Ionicons name={t.feitoEm ? 'checkmark-circle' : 'time-outline'} size={26} color={t.feitoEm ? cores.primaria : cores.cafe} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[estilos.itemTitulo, !!t.feitoEm && estilos.riscado]}>{t.titulo}</Text>
                <Text style={estilos.itemData}>
                  {doBanco(t.data)} · {nomeDe(t.chave)} · {t.feitoEm ? `feita em ${doBanco(t.feitoEm)}` : 'em aberto'}
                </Text>
              </View>
              {!t.feitoEm && (
                <Pressable onPress={() => excluirEnviada(t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Cancelar a tarefa ${t.titulo}`}>
                  <Ionicons name="trash-outline" size={22} color={cores.erro} />
                </Pressable>
              )}
            </View>
          ))}
        </>
      )}

      {souDono ? (
        <>
          <Secao titulo="Participantes" />
          <Text style={estilos.nota}>Só o produtor cadastra participante e marca as agendas que cada um pode abrir.</Text>
          <Botao titulo="Cadastrar ou alterar participantes" tipo="secundario" onPress={() => navegacao.navigate('UsuarioForm', {})} />
        </>
      ) : (
        <Text style={estilos.nota}>Quem participa de cada agenda é o produtor que define. Qualquer participante pode enviar tarefa para as outras agendas.</Text>
      )}
    </Tela>
  );
}

// ======================================================================
function AgendaAberta({ agenda, fazendaId }: AgendaRef) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendas, fazendaAtiva, trocarFazenda, agendas, sessao } = useSessao();
  const souDono = fazendas.some((f) => eDono(f.perfil));
  const userId = sessao?.user.id ?? null;
  const daFazenda = agenda === 'fazenda';
  const info = agendas.find((a) => chaveAgenda(a) === chaveAgenda({ agenda, fazendaId })) ?? null;
  // fazenda a que o usuário também tem acesso no sistema (para as telas das obrigações abrirem no lugar certo)
  const fazenda = daFazenda ? fazendas.find((f) => f.id === fazendaId) ?? null : null;
  const fid = daFazenda && info ? fazendaId ?? null : null;
  const autorizado = podeAbrir(agendas, { agenda, fazendaId });
  const nome = agenda === 'produtor' ? 'Produtor' : agenda === 'admin' ? 'Administrador' : agenda === 'escritorio' ? 'Escritório' : info?.nome ?? fazenda?.nome ?? 'Fazenda';

  const [itens, setItens] = useState<ItemAgenda[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [verFeitos, setVerFeitos] = useState(false);
  const [verFinancas, setVerFinancas] = useState(false);
  const doProdutor = agenda === 'produtor';
  // V130: o Escritório fica igual ao Produtor: recados e lembretes; as contas só nos totais do botão Finanças
  const comFinancas = agenda === 'produtor' || agenda === 'escritorio';
  const verFinanceiro = fazendas.some((f) => f.financeiro);
  // nova anotação
  const [nova, setNova] = useState(false);
  const [data, setData] = useState(hojeBR());
  const [titulo, setTitulo] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  // rotinas automáticas
  const [rotinasAbertas, setRotinasAbertas] = useState(false);
  const [rotinas, setRotinas] = useState<Rotinas>(ROTINAS_PADRAO);
  const podeAjustar = daFazenda && (souDono || fazenda?.nivel === 'completo');
  // obrigações que se repetem, cadastradas nesta agenda
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([]);
  const [acoesDe, setAcoesDe] = useState<string | null>(null);
  const [novaObr, setNovaObr] = useState(false);
  const [obrTitulo, setObrTitulo] = useState('');
  const [obrObs, setObrObs] = useState('');
  const [obrCada, setObrCada] = useState('1');
  const [obrUnidade, setObrUnidade] = useState<string[]>(['meses']);
  const [obrData, setObrData] = useState(hojeBR());

  useLayoutEffect(() => {
    navegacao.setOptions({ title: `Agenda: ${nome}` });
  }, [navegacao, nome]);

  // Agenda de fazenda: ela passa a ser a fazenda ativa, para as telas das obrigações abrirem no lugar certo.
  useEffect(() => {
    if (fazenda && fazenda.id !== fazendaAtiva?.id) trocarFazenda(fazenda.id);
  }, [fazenda, fazendaAtiva?.id, trocarFazenda]);

  const carregar = useCallback(async () => {
    if (!autorizado) return;
    setErro(null);
    const hoje = hojeBanco();
    try {
      const [anot, auto, fin, obr] = await Promise.all([
        lerAnotacoes({ agenda, fazendaId }, hoje),
        fid ? lerAutomaticos(fid, somarDiasIso(hoje, DIAS_A_FRENTE)) : Promise.resolve([]),
        // Escritório: contas a pagar e a receber uma a uma. Produtor: só ITR e veículos particulares (as contas ficam nos totais do botão Finanças).
        fid || agenda === 'admin'
          ? Promise.resolve([])
          : lerFinanceiro(somarDiasIso(hoje, DIAS_FINANCEIRO))
              .then((l) => (agenda === 'produtor' || agenda === 'escritorio' ? l.filter((i) => !SO_ESCRITORIO.includes(i.tipo ?? '')) : l))
              .catch(() => []),
        lerObrigacoes({ agenda, fazendaId }).catch(() => [] as Obrigacao[]),
      ]);
      setObrigacoes(obr);
      setItens([...anot, ...auto, ...fin, ...obrigacoesComoItens(obr, somarDiasIso(hoje, DIAS_A_FRENTE))]);
      if (fid) setRotinas({ ...ROTINAS_PADRAO, ...(await lerRotinas(fid)) });
    } catch (e) {
      setErro(traduzirErro(e));
      setItens([]);
    }
  }, [autorizado, agenda, fazendaId, fid]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  if (!autorizado) {
    return (
      <Tela>
        <Aviso tipo="info" texto={`Você não tem autorização para abrir a agenda "${nome}".`} />
      </Tela>
    );
  }

  async function puxar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  async function anotar() {
    setErro(null);
    setAviso(null);
    if (!data || !dataValida(data)) return setErro('Informe a data.');
    if (!titulo.trim()) return setErro('Escreva o que precisa ser feito.');
    setSalvando(true);
    const { error } = await supabase.from('agenda_itens').insert({ fazenda_id: fid, agenda, data: paraBanco(data), titulo: titulo.trim(), observacao: obs.trim() || null });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setTitulo('');
    setObs('');
    setNova(false);
    setAviso(`Anotado na agenda ${nome}.`);
    carregar();
  }

  async function marcar(i: ItemAgenda) {
    const { error } = await supabase.from('agenda_itens').update({ feito_em: i.feitoEm ? null : hojeBanco() }).eq('id', i.id!);
    if (error) return setErro(traduzirErro(error));
    carregar();
  }

  function excluir(i: ItemAgenda) {
    Alert.alert('Excluir anotação', `Excluir "${i.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { data: apagados, error } = await supabase.from('agenda_itens').delete().eq('id', i.id!).select('id');
          if (error) return setErro(traduzirErro(error));
          if (!apagados?.length) return setErro('Só quem fez a anotação (ou o produtor) exclui. Você pode marcar como feita.');
          carregar();
        },
      },
    ]);
  }

  function abrirAutomatico(i: ItemAgenda) {
    // obrigação que se repete: não abre tela, mostra os botões Feita e Excluir
    if (i.tipo === 'propria') return setAcoesDe(acoesDe === i.ref ? null : i.ref ?? null);
    const tipo = TIPOS_AUTOMATICOS[i.tipo ?? ''];
    if (!tipo) return;
    if (!i.ref && !(i.tipo ?? '').startsWith('vencidos')) return;
    const destino = tipo.abrir(i.ref ?? null);
    (navegacao.push as (rota: string, params?: object) => void)(destino.rota, destino.params);
  }

  async function obrigacaoFeita(id: string) {
    setErro(null);
    const { data: proxima, error } = await supabase.rpc('agenda_obrigacao_feita', { p_id: id });
    if (error) return setErro(traduzirErro(error));
    setAcoesDe(null);
    setAviso(`Feita. Volta a aparecer em ${doBanco(proxima as string)}.`);
    carregar();
  }

  async function excluirObrigacao(id: string) {
    setErro(null);
    const { error } = await supabase.from('agenda_obrigacoes').delete().eq('id', id);
    if (error) return setErro(traduzirErro(error));
    setAcoesDe(null);
    carregar();
  }

  async function cadastrarObrigacao() {
    setErro(null);
    setAviso(null);
    const n = parseInt(obrCada, 10);
    if (!obrTitulo.trim()) return setErro('Escreva o que precisa ser feito.');
    if (!n || n < 1 || n > 999) return setErro('Informe de quanto em quanto tempo se repete (de 1 a 999).');
    if (!obrData || !dataValida(obrData)) return setErro('Informe a primeira data.');
    setSalvando(true);
    const { error } = await supabase.from('agenda_obrigacoes').insert({ agenda, fazenda_id: fid, titulo: obrTitulo.trim(), observacao: obrObs.trim() || null, intervalo: n, unidade: obrUnidade[0] as UnidadeRepeticao, proxima: paraBanco(obrData) });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setObrTitulo('');
    setObrObs('');
    setNovaObr(false);
    setAviso('Obrigação cadastrada. Ela entra sozinha na agenda a cada vencimento.');
    carregar();
  }

  async function salvarRotinas(novas: Rotinas) {
    setRotinas(novas);
    if (!fid) return;
    const { error } = await supabase.from('agenda_rotinas').upsert({ fazenda_id: fid, ...novas });
    if (error) return setErro(traduzirErro(error));
    carregar();
  }

  const hoje = hojeBanco();
  const grupos = itens ? agruparAgenda(itens, hoje) : [];
  const feitos = (itens ?? []).filter((i) => i.feitoEm).sort((a, b) => (a.feitoEm! < b.feitoEm! ? 1 : -1));
  // de quem é a agenda: anotação feita por outra pessoa aparece com o nome de quem fez
  const autorDaCasa = agenda === 'produtor' || agenda === 'admin' ? 'produtor' : agenda === 'escritorio' ? 'escritorio' : 'gerente';

  return (
    <Tela atualizando={atualizando} aoAtualizar={puxar}>
      <Text style={estilos.nomeAgenda}>{daFazenda ? `Agenda da fazenda ${nome}` : `Agenda do ${nome}`}</Text>
      {info?.participantes ? <Text style={estilos.nota}>Participantes: {info.participantes}</Text> : null}

      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {!itens && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />}
      {itens && grupos.length === 0 && <Text style={estilos.vazio}>{daFazenda ? `Nada em aberto para os próximos ${DIAS_A_FRENTE} dias.` : 'Nada em aberto nesta agenda.'}</Text>}

      {grupos.map((g) => (
        <View key={g.titulo} style={{ gap: 8 }}>
          <Text style={[estilos.grupo, g.atrasado && { color: cores.erro }]}>
            {g.titulo} ({g.itens.length})
          </Text>
          {g.itens.map((i) => (
            <React.Fragment key={i.chave}>
              <Item item={i} atrasado={!!g.atrasado} autorDaCasa={autorDaCasa} userId={userId} aoMarcar={() => marcar(i)} aoExcluir={() => excluir(i)} aoAbrir={() => abrirAutomatico(i)} />
              {i.tipo === 'propria' && acoesDe === i.ref && (
                <View style={estilos.acoes}>
                  <View style={{ flex: 1 }}><Botao titulo="Feita" onPress={() => obrigacaoFeita(i.ref!)} /></View>
                  <View style={{ flex: 1 }}><Botao titulo="Excluir" tipo="perigo" onPress={() => excluirObrigacao(i.ref!)} /></View>
                </View>
              )}
            </React.Fragment>
          ))}
        </View>
      ))}

      {nova ? (
        <View style={estilos.cartao}>
          <CampoData rotulo="Prazo para cumprir *" valor={data} aoMudar={setData} />
          <Campo rotulo="O que fazer *" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Conferir a cerca da divisa" />
          <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />
          <Botao titulo={daFazenda ? `Pôr na agenda da ${nome}` : 'Anotar'} onPress={anotar} carregando={salvando} />
          <Botao titulo="Cancelar" tipo="texto" onPress={() => setNova(false)} />
        </View>
      ) : (
        <Botao titulo="Nova tarefa" onPress={() => { setAviso(null); setNova(true); }} />
      )}

      {feitos.length > 0 && (
        <>
          <Text style={estilos.link} onPress={() => setVerFeitos(!verFeitos)}>
            {verFeitos ? 'Esconder as anotações feitas' : `Ver as anotações feitas nos últimos 30 dias (${feitos.length})`}
          </Text>
          {verFeitos && feitos.map((i) => <Item key={i.chave} item={i} atrasado={false} autorDaCasa={autorDaCasa} userId={userId} aoMarcar={() => marcar(i)} aoExcluir={() => excluir(i)} aoAbrir={() => {}} />)}
        </>
      )}

      {comFinancas && verFinanceiro && (
        <>
          <Botao titulo={verFinancas ? 'Esconder as finanças' : 'Finanças'} tipo="secundario" onPress={() => setVerFinancas(!verFinancas)} />
          {verFinancas && <QuadroFinancas />}
        </>
      )}

      {agendas.filter((a) => a.podeAbrir).length > 1 && (
        <>
          <Secao titulo={doProdutor ? 'Agendas das fazendas' : 'Outras agendas'} />
          <Text style={estilos.nota}>Toque para abrir. Para mandar tarefa para uma agenda que você não abre, use "Enviar tarefa" na relação das agendas.</Text>
          <IconesAgendas menos={{ agenda, fazendaId }} />
        </>
      )}

      {/* V138: o sistema abre pelas caixinhas da página de rosto (Administrativo, Particular ou a fazenda) */}
      <Botao titulo="Voltar à página de rosto" tipo="texto" onPress={() => navegacao.navigate('Capa')} />

      <Secao titulo="Obrigações que se repetem" />
      <Text style={estilos.nota}>Cadastre aqui o que volta sempre (ex.: conferir as cercas todo mês, revisar o trator a cada 6 meses). Entra sozinha na agenda a cada vencimento; ao tocar em "Feita", passa para a próxima data.</Text>
      {novaObr ? (
        <View style={estilos.cartao}>
          <Campo rotulo="O que fazer *" value={obrTitulo} onChangeText={setObrTitulo} placeholder="Ex.: Conferir as cercas da divisa" />
          <Campo rotulo="Observação" value={obrObs} onChangeText={setObrObs} />
          <Campo rotulo="Repete a cada *" value={obrCada} onChangeText={(t) => setObrCada(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
          <Escolha opcoes={UNIDADES_REPETICAO} valor={obrUnidade} aoMudar={setObrUnidade} />
          <CampoData rotulo="Primeira data *" valor={obrData} aoMudar={setObrData} />
          <Botao titulo="Cadastrar obrigação" onPress={cadastrarObrigacao} carregando={salvando} />
          <Botao titulo="Cancelar" tipo="texto" onPress={() => setNovaObr(false)} />
        </View>
      ) : (
        <Botao titulo="Cadastrar obrigação que se repete" tipo="secundario" onPress={() => { setAviso(null); setNovaObr(true); }} />
      )}
      {obrigacoes.map((o) => (
        <View key={o.id} style={estilos.item}>
          <Ionicons name="repeat-outline" size={24} color={cores.cafe} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={estilos.itemTitulo}>{o.titulo}</Text>
            <Text style={estilos.itemData}>Próxima em {doBanco(o.proxima)} · {textoRepeticao(o)}</Text>
          </View>
          <Pressable onPress={() => excluirObrigacao(o.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Excluir a obrigação ${o.titulo}`}>
            <Ionicons name="trash-outline" size={22} color={cores.erro} />
          </Pressable>
        </View>
      ))}

      {doProdutor && (
        <>
          <Secao titulo="Obrigações automáticas" />
          <Text style={estilos.nota}>
            Entram sozinhas: em agosto e setembro, a declaração do ITR das fazendas com nº de ITR no cadastro, e a manutenção e o seguro dos veículos particulares. As contas a pagar e a receber não aparecem uma a uma: os totais ficam no botão Finanças.
          </Text>
        </>
      )}

      {agenda === 'escritorio' && (
        <>
          <Secao titulo="Obrigações automáticas" />
          <Text style={estilos.nota}>
            Entram sozinhas: em agosto e setembro, a declaração do ITR das fazendas com nº de ITR no cadastro, e a manutenção e o seguro dos veículos particulares. As contas a pagar e a receber não aparecem uma a uma: os totais e a equação dos saldos ficam no botão Finanças; as contas, em Financeiro › Contas a pagar e Contas a receber.
          </Text>
        </>
      )}

      {daFazenda && (
        <>
          <Secao titulo="Obrigações automáticas" />
          <Text style={estilos.nota}>
            Entram sozinhas, pelos lançamentos da fazenda: reforços de vacinas e medicamentos, manejos de IATF e diagnósticos, pré-parto e partos previstos, troca de manga, cochos de sal, bebedouros, adubações programadas, produto abaixo do estoque mínimo, produto com a validade chegando, entrega de café dos contratos e lote há muito tempo sem pesar. Saem da agenda quando o lançamento é feito.
          </Text>
          {podeAjustar && (
            <Text style={estilos.link} onPress={() => setRotinasAbertas(!rotinasAbertas)}>
              {rotinasAbertas ? 'Fechar os ajustes' : 'Ajustar os prazos das rotinas'}
            </Text>
          )}
          {podeAjustar && rotinasAbertas && (
            <View style={estilos.cartao}>
              <Prazo rotulo="Abastecer o cocho de sal a cada" unidade="dias" valor={rotinas.sal_dias} aoMudar={(n) => salvarRotinas({ ...rotinas, sal_dias: n })} />
              <Prazo rotulo="Limpar o bebedouro a cada" unidade="dias" valor={rotinas.agua_dias} aoMudar={(n) => salvarRotinas({ ...rotinas, agua_dias: n })} />
              <Prazo rotulo="Levar para o pré-parto" unidade="dias antes do parto" valor={rotinas.pre_parto_dias} maximo={120} aoMudar={(n) => salvarRotinas({ ...rotinas, pre_parto_dias: n })} />
              <Prazo rotulo="Pesar cada lote a cada" unidade="dias" valor={rotinas.pesagem_dias} maximo={365} passo={5} aoMudar={(n) => salvarRotinas({ ...rotinas, pesagem_dias: n })} />
              <Text style={estilos.nota}>Zero desliga o aviso. O aviso de estoque usa o "estoque mínimo" do cadastro de cada produto; o de validade, a validade informada na entrada do produto. O prazo de troca de manga é o "máximo de dias de ocupação" do cadastro de cada manga (10 dias quando não informado). Sal e bebedouro contam a partir do último registro feito na manga.</Text>
            </View>
          )}
        </>
      )}
    </Tela>
  );
}

function Item({ item, atrasado, autorDaCasa, userId, aoMarcar, aoExcluir, aoAbrir }: { item: ItemAgenda; atrasado: boolean; autorDaCasa: string; userId: string | null; aoMarcar: () => void; aoExcluir: () => void; aoAbrir: () => void }) {
  // tarefa que outra pessoa mandou: aparece o nome de quem mandou
  const deOutro = !!item.criadoPor && item.criadoPor !== userId;
  const quem = deOutro && item.autorNome ? ` · Tarefa de ${item.autorNome}` : item.autor && item.autor !== autorDaCasa && ROTULO_AUTOR[item.autor] ? ` · ${ROTULO_AUTOR[item.autor]}` : '';
  const auto = item.origem === 'automatico';
  const info = auto ? TIPOS_AUTOMATICOS[item.tipo ?? ''] : null;
  const feito = !!item.feitoEm;
  return (
    <Pressable
      onPress={auto ? aoAbrir : aoMarcar}
      onLongPress={auto ? undefined : aoExcluir}
      accessibilityRole="button"
      accessibilityHint={auto ? (item.tipo === 'propria' ? 'Mostra os botões Feita e Excluir' : 'Abre a tela onde se resolve') : 'Toque para marcar como feito; segure para excluir'}
      style={({ pressed }) => [estilos.item, atrasado && estilos.itemAtrasado, pressed && { backgroundColor: '#F3F6F2' }]}
    >
      <Ionicons name={auto ? info?.icone ?? 'alert-circle-outline' : feito ? 'checkmark-circle' : 'ellipse-outline'} size={auto ? 26 : 30} color={auto ? cores.cafe : feito ? cores.primaria : cores.textoSuave} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[estilos.itemTitulo, feito && estilos.riscado]}>{item.titulo}</Text>
        {item.detalhe ? <Text style={estilos.itemDetalhe}>{item.detalhe}</Text> : null}
        <Text style={[estilos.itemData, atrasado && { color: cores.erro }]}>
          {doBanco(item.data)}
          {auto ? (item.tipo === 'propria' ? ' · Obrigação que se repete' : ` · Automático${info ? ` · ${info.rotulo}` : ''}`) : quem}
          {feito ? ` · feito em ${doBanco(item.feitoEm)}` : ''}
        </Text>
      </View>
      {auto && <Ionicons name="chevron-forward" size={20} color={cores.textoSuave} />}
    </Pressable>
  );
}

/** Prazo em dias com − e + (grava ao tocar). */
function Prazo({ rotulo, unidade, valor, aoMudar, maximo = 90, passo = 1 }: { rotulo: string; unidade: string; valor: number; aoMudar: (n: number) => void; maximo?: number; passo?: number }) {
  return (
    <View style={estilos.prazo}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.itemTitulo}>{rotulo}</Text>
        <Text style={estilos.itemDetalhe}>{valor === 0 ? 'Desligado' : `${valor} ${unidade}`}</Text>
      </View>
      <Pressable onPress={() => aoMudar(Math.max(0, valor - passo))} hitSlop={8} accessibilityLabel={`Diminuir: ${rotulo}`}>
        <Ionicons name="remove-circle-outline" size={34} color={cores.primaria} />
      </Pressable>
      <Text style={estilos.prazoValor}>{valor}</Text>
      <Pressable onPress={() => aoMudar(Math.min(maximo, valor + passo))} hitSlop={8} accessibilityLabel={`Aumentar: ${rotulo}`}>
        <Ionicons name="add-circle-outline" size={34} color={cores.primaria} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  lista: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, overflow: 'hidden' },
  agenda: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: tam.espaco, paddingVertical: 14, minHeight: tam.alturaToque + 12 },
  divisa: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  agendaNome: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto },
  nomeAgenda: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 20 },
  vazio: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', marginTop: 12 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 12 },
  grupo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura, marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, minHeight: tam.alturaToque + 8 },
  itemAtrasado: { borderColor: cores.erro, borderLeftWidth: 4 },
  itemTitulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  itemDetalhe: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  itemData: { fontSize: tam.pequeno, color: cores.cafe, fontWeight: '600' },
  riscado: { textDecorationLine: 'line-through', color: cores.textoSuave },
  prazo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  acoes: { flexDirection: 'row', gap: 10 },
  prazoValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto, minWidth: 34, textAlign: 'center' },
});
