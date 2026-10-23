import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { formatarMoeda, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { perguntar } from '../../lib/perguntar';
import { ROTULO_TIPO_ALIMENTO, TIPOS_ALIMENTO, textoComposicao } from '../../lib/dietas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const FONTES = [
  { valor: 'tabela', rotulo: 'Valor de tabela' },
  { valor: 'analise', rotulo: 'Análise própria' },
];
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Banco de alimentos das dietas: composição (MS, PB, NDT, FDN) e preço. */
export default function AlimentoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AlimentoForm'>>();
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<string[]>(['concentrado']);
  const [fonte, setFonte] = useState<string[]>(['tabela']);
  const [ms, setMs] = useState('');
  const [pb, setPb] = useState('');
  const [ndt, setNdt] = useState('');
  const [fdn, setFdn] = useState('');
  const [preco, setPreco] = useState('');
  const [ativo, setAtivo] = useState<string[]>(['sim']);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const carregarTodos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('alimentos').select('*').order('nome'));
    return d.map((a) => ({ id: a.id, titulo: a.nome + (a.ativo ? '' : ' (inativo)'), detalhe: textoComposicao(a) }));
  }, []);

  function limpar() {
    setEditId(null);
    setNome('');
    setTipo(['concentrado']);
    setFonte(['tabela']);
    setMs(''); setPb(''); setNdt(''); setFdn(''); setPreco('');
    setAtivo(['sim']);
    setErros({});
  }

  async function escolherParaAlterar(aid: string | null) {
    setAviso(null);
    setErro(null);
    if (!aid) return limpar();
    const { data: a, error } = await supabase.from('alimentos').select('*').eq('id', aid).single();
    if (error || !a) return setErro(traduzirErro(error));
    setEditId(a.id);
    setNome(a.nome);
    setTipo([a.tipo]);
    setFonte([a.fonte]);
    setMs(numeroParaCampo(a.ms)); setPb(numeroParaCampo(a.pb)); setNdt(numeroParaCampo(a.ndt)); setFdn(numeroParaCampo(a.fdn));
    setPreco(moedaParaCampo(a.preco_kg_mn));
    setAtivo([a.ativo ? 'sim' : 'nao']);
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    const v = { ms: lerNumero(ms), pb: lerNumero(pb), ndt: lerNumero(ndt), fdn: lerNumero(fdn), preco: lerNumero(preco) };
    if (!nome.trim()) e.nome = 'Informe o nome.';
    if (v.ms == null || v.ms <= 0 || v.ms > 100) e.ms = 'De 0 a 100%.';
    if (v.pb == null || v.pb < 0 || v.pb > 300) e.pb = 'Informe a PB.';
    if (v.ndt == null || v.ndt < 0 || v.ndt > 100) e.ndt = 'De 0 a 100%.';
    if (v.fdn == null || v.fdn < 0 || v.fdn > 100) e.fdn = 'De 0 a 100%.';
    if (preco.trim() && (v.preco == null || v.preco < 0)) e.preco = 'Valor inválido.';
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');
    const registro = { nome: nome.trim(), tipo: tipo[0], fonte: fonte[0], ms: v.ms, pb: v.pb, ndt: v.ndt, fdn: v.fdn, preco_kg_mn: v.preco, ativo: ativo[0] === 'sim' };
    setSalvando(true);
    const { error } = editId ? await supabase.from('alimentos').update(registro).eq('id', editId) : await supabase.from('alimentos').insert(registro);
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setAviso(`${registro.nome} ${editId ? 'alterado' : 'cadastrado'}.`);
    limpar();
  }

  // V149: excluir alimento cadastrado errado (se já estiver em alguma dieta, o sistema não deixa)
  async function excluir() {
    if (!editId) return;
    setErro(null);
    setAviso(null);
    const { count } = await supabase.from('dieta_itens').select('id', { count: 'exact', head: true }).eq('alimento_id', editId);
    if (count) return setErro(`${nome} está em ${count === 1 ? '1 dieta' : `${count} dietas`}: tire das dietas antes de excluir, ou marque como inativo.`);
    if (!(await perguntar('Excluir alimento', `Excluir ${nome}?`, 'Excluir', 'Cancelar'))) return;
    const { error } = await supabase.from('alimentos').delete().eq('id', editId);
    if (error) return setErro(traduzirErro(error));
    setAviso(`${nome} excluído.`);
    limpar();
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaAlimentos />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <SeletorLista rotulo="Alterar um alimento já cadastrado" valorId={editId} aoMudar={escolherParaAlterar} carregar={carregarTodos} permitirLimpar dicaBusca="Nome do alimento" />

      <Secao titulo={editId ? 'Alterar alimento' : 'Novo alimento'} />
      <Campo rotulo="Nome *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder="Ex.: Silagem de milho" erro={erros.nome} />
      <Escolha rotulo="Tipo" opcoes={TIPOS_ALIMENTO} valor={tipo} aoMudar={setTipo} />
      <Escolha rotulo="Origem dos valores" opcoes={FONTES} valor={fonte} aoMudar={setFonte} />

      <Secao titulo="Composição" />
      <Text style={estilos.nota}>MS em % do alimento como vai no cocho. PB, NDT e FDN em % da matéria seca.</Text>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}><Campo rotulo="MS % *" value={ms} onChangeText={setMs} keyboardType="decimal-pad" erro={erros.ms} /></View>
        <View style={{ flex: 1 }}><Campo rotulo="PB % *" value={pb} onChangeText={setPb} keyboardType="decimal-pad" erro={erros.pb} /></View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}><Campo rotulo="NDT % *" value={ndt} onChangeText={setNdt} keyboardType="decimal-pad" erro={erros.ndt} /></View>
        <View style={{ flex: 1 }}><Campo rotulo="FDN % *" value={fdn} onChangeText={setFdn} keyboardType="decimal-pad" erro={erros.fdn} /></View>
      </View>

      <Secao titulo="Preço" />
      <CampoMoeda rotulo="R$ por kg (como vai no cocho)" valor={preco} aoMudar={setPreco} erro={erros.preco} />

      {editId && <Escolha rotulo="Situação" opcoes={[{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }]} valor={ativo} aoMudar={setAtivo} />}

      <Botao titulo={editId ? 'Salvar alterações' : 'Cadastrar alimento'} onPress={salvar} carregando={salvando} />
      {editId && <Botao titulo="Cancelar alteração" tipo="secundario" onPress={limpar} />}
      {editId && <Botao titulo="Excluir alimento" tipo="perigo" onPress={excluir} />}
      {params?.id === undefined && navegacao.canGoBack() && <Text style={estilos.nota}>Depois de cadastrar, volte para a dieta: o alimento já aparece na lista.</Text>}
    </Tela>
  );
}

/** Consulta dos alimentos: pelo nome ou a relação toda. Mostra todos os dados; não altera nada. */
function ConsultaAlimentos() {
  const [busca, setBusca] = useState('');
  const [todos, setTodos] = useState<any[] | null>(null);
  const [verLista, setVerLista] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const termo = semAcento(limparBusca(busca));

  useFocusEffect(
    useCallback(() => {
      consulta<any[]>(supabase.from('alimentos').select('*').order('tipo').order('nome'))
        .then(setTodos)
        .catch((e) => setErro(traduzirErro(e)));
    }, []),
  );

  const mostrados = todos ? (termo ? todos.filter((a) => semAcento(a.nome).includes(termo)) : verLista ? todos : []) : null;

  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Nome do alimento" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {mostrados === null ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : termo && mostrados.length === 0 ? (
        <Text style={estilos.dica}>Nada encontrado com "{busca.trim()}".</Text>
      ) : mostrados.length > 0 ? (
        <Lista>
          {mostrados.map((a) => (
            <Linha
              key={a.id}
              titulo={a.nome}
              inativo={!a.ativo}
              linhas={[
                `${ROTULO_TIPO_ALIMENTO[a.tipo] ?? a.tipo} · ${a.fonte === 'analise' ? 'análise própria' : 'valor de tabela'}`,
                textoComposicao(a),
              ]}
              direita={a.preco_kg_mn != null ? `${formatarMoeda(a.preco_kg_mn)}/kg` : 'sem preço'}
              onPress={() => {}}
            />
          ))}
        </Lista>
      ) : null}
      {!termo && (
        <Botao titulo={verLista ? 'Fechar a relação' : 'Relação dos alimentos'} tipo="secundario" onPress={() => setVerLista(!verLista)} />
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 20 },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
