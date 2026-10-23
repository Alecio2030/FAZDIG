import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, paraBanco } from '../../lib/datas';
import { formatarNumero, lerNumero } from '../../lib/formatos';
import ConsultaContasBancarias from './ConsultaContasBancarias';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Form = {
  tipo: string[];
  nome: string;
  banco: string;
  agencia: string;
  conta: string;
  fazendaId: string | null;
  saldo: string;
  dataSaldo: string;
  ativa: boolean;
};

const VAZIO: Form = { tipo: ['banco'], nome: '', banco: '', agencia: '', conta: '', fazendaId: null, saldo: '', dataSaldo: '', ativa: true };
const texto = (v: string) => (v.trim() ? v.trim() : null);

export default function ContaBancariaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ContaBancariaForm'>>();
  const id = params?.id;
  // veio de outra tela com a conta digitada (ex.: Financiamentos): já abre preenchida e, ao cadastrar, volta para lá
  const nova = !id ? params?.nova : undefined;
  const { fazendaAtiva } = useSessao();
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [f, setF] = useState<Form>(() =>
    nova
      ? { ...VAZIO, banco: nova.banco ?? '', agencia: nova.agencia ?? '', conta: nova.conta ?? '', nome: [nova.banco, nova.conta ? `conta ${nova.conta}` : null].filter(Boolean).join(' '), fazendaId: null }
      : VAZIO,
  );
  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});

  const muda = <K extends keyof Form>(campo: K, valor: Form[K]) => setF((a) => ({ ...a, [campo]: valor }));

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? 'Editar conta' : 'Bancos e caixa' });
  }, [navegacao, id]);

  useEffect(() => {
    if (!id) return;
    supabase.from('contas_bancarias').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) setErro(traduzirErro(error));
      else if (data) {
        setF({
          tipo: [data.tipo],
          nome: data.nome ?? '',
          banco: data.banco ?? '',
          agencia: data.agencia ?? '',
          conta: data.conta ?? '',
          fazendaId: data.fazenda_id,
          saldo: data.saldo_inicial != null && Number(data.saldo_inicial) !== 0 ? formatarNumero(data.saldo_inicial, 2) : '',
          dataSaldo: doBanco(data.data_saldo_inicial),
          ativa: data.ativa !== false,
        });
      }
      setCarregando(false);
    });
  }, [id]);

  const carregarFazendas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('fazendas').select('id, nome, ativa').order('nome'));
    return d.map((x) => ({ id: x.id, titulo: x.nome, oculto: !x.ativa }));
  }, []);

  async function salvar() {
    setErro(null);
    const e: Partial<Record<keyof Form, string>> = {};
    const saldo = f.saldo.trim() ? lerNumero(f.saldo) : 0;
    if (!f.nome.trim()) e.nome = 'Dê um nome, ex.: Sicoob conta corrente.';
    if (saldo === null) e.saldo = 'Valor inválido. Ex.: 1.500,00 ou -200,00';
    if (f.dataSaldo && !dataValida(f.dataSaldo)) e.dataSaldo = 'Data inválida.';
    if (saldo && !f.dataSaldo) e.dataSaldo = 'Informe a data desse saldo.';
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');

    const banco = f.tipo[0] !== 'caixa';
    const registro = {
      tipo: f.tipo[0],
      nome: f.nome.trim(),
      banco: banco ? texto(f.banco) : null,
      agencia: banco ? texto(f.agencia) : null,
      conta: banco ? texto(f.conta) : null,
      fazenda_id: null, // do Grupo
      saldo_inicial: saldo ?? 0,
      data_saldo_inicial: f.dataSaldo ? paraBanco(f.dataSaldo) : null,
      ativa: f.ativa,
    };

    setSalvando(true);
    let q = supabase.from('contas_bancarias').select('id').ilike('nome', registro.nome);
    if (id) q = q.neq('id', id);
    const { data: iguais } = await q.limit(1);
    if (iguais && iguais.length) {
      setSalvando(false);
      setErros({ nome: 'Já existe uma conta com esse nome.' });
      return setErro('Nome repetido.');
    }

    const { error } = id
      ? await supabase.from('contas_bancarias').update(registro).eq('id', id)
      : await supabase.from('contas_bancarias').insert(registro);
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    if (id || nova) navegacao.goBack();
    else navegacao.replace('ContaBancariaForm', { aviso: `${registro.nome} cadastrada. Pode cadastrar a próxima.` });
  }

  function excluir() {
    Alert.alert('Excluir conta', `Excluir ${f.nome}? Se ela já tiver lançamentos, o sistema não deixa: nesse caso, desmarque "Ativa".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('contas_bancarias').delete().eq('id', id!);
          if (error) setErro(traduzirErro(error));
          else navegacao.goBack();
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

  const abas = !id && !nova && <AbasCadastro aba={aba} aoMudar={setAba} />;

  if (!id && !nova && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaContasBancarias />
      </Tela>
    );
  }

  const banco = f.tipo[0] !== 'caixa';
  const aplicacao = f.tipo[0] === 'aplicacao';

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {nova && <Aviso tipo="info" texto="Conta nova: confira os dados e toque em Cadastrar. Você volta para a tela em que estava, com a conta já escolhida." />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <Escolha
        rotulo="Tipo"
        opcoes={[
          { valor: 'banco', rotulo: 'Conta bancária' },
          { valor: 'caixa', rotulo: 'Caixa (dinheiro)' },
          { valor: 'aplicacao', rotulo: 'Aplicação (liquidez imediata)' },
        ]}
        valor={f.tipo}
        aoMudar={(v) => muda('tipo', v)}
      />
      <Campo
        rotulo="Nome *"
        value={f.nome}
        onChangeText={(t) => muda('nome', t)}
        autoCapitalize="sentences"
        placeholder={aplicacao ? 'Ex.: Sicoob RDC resgate automático' : banco ? 'Ex.: Sicoob conta corrente' : 'Ex.: Caixa da fazenda'}
        ajuda="É o nome que aparece para escolher nos lançamentos."
        erro={erros.nome}
      />
      {banco && (
        <>
          <Campo rotulo="Banco" value={f.banco} onChangeText={(t) => muda('banco', t)} autoCapitalize="words" placeholder="Ex.: Sicoob, Banestes, Banco do Brasil" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Agência" value={f.agencia} onChangeText={(t) => muda('agencia', t)} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1.4 }}>
              <Campo rotulo="Conta" value={f.conta} onChangeText={(t) => muda('conta', t)} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
        </>
      )}
      <Text style={estilos.nota}>Caixa, bancos e aplicações são do Grupo: a conta paga e recebe pelas fazendas, pelo Administrativo e pelo Particular.</Text>

      <Secao titulo="Saldo de abertura" />
      <View style={estilos.linha}>
        <View style={{ flex: 1.2 }}>
          <CampoMoeda rotulo="Saldo inicial (R$)" valor={f.saldo} aoMudar={(t) => muda('saldo', t)} negativo erro={erros.saldo} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Na data" valor={f.dataSaldo} aoMudar={(v) => muda('dataSaldo', v)} erro={erros.dataSaldo} />
        </View>
      </View>
      <Text style={estilos.nota}>O saldo de cada dia será calculado a partir deste valor, somando recebimentos e tirando pagamentos. Negativo com sinal de menos, ex.: -200,00.</Text>

      {id && <Interruptor rotulo="Ativa" descricao="Contas inativas não aparecem para escolher em novos lançamentos." valor={f.ativa} aoMudar={(v) => muda('ativa', v)} />}

      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir conta" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
});
