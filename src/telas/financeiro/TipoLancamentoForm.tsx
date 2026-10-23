import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Interruptor from '../../componentes/Interruptor';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { tiposLancamento, type UsoTipo } from '../../lib/classificacao';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Tipo = { chave: string; nome: string; uso: UsoTipo; conta_id: string; ordem: number; ativo: boolean; padrao: boolean; conta?: any };
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const USOS: { valor: UsoTipo; rotulo: string; explica: string }[] = [
  { valor: 'despesa', rotulo: 'Despesa', explica: 'Aparece em Compras › Despesa e em Contas a pagar.' },
  { valor: 'pagar', rotulo: 'Só Contas a pagar', explica: 'Para o que se paga e não é despesa: financiamento, adiantamento, retirada.' },
  { valor: 'receber', rotulo: 'Contas a receber', explica: 'Para receitas lançadas à mão em Contas a receber.' },
];
const TITULO_USO: Record<string, string> = {
  despesa: 'Despesas (Compras e Contas a pagar)',
  pagar: 'Só em Contas a pagar',
  receber: 'Contas a receber',
  sistema: 'Definidos pelo sistema (pela tela de origem)',
};
/** Tipos de conta do plano que fazem sentido para cada lista. */
const CONTAS_DO_USO: Record<string, string[] | null> = { despesa: ['despesa'], pagar: ['ativo', 'passivo', 'patrimonio_liquido'], receber: ['receita', 'ativo', 'passivo'], sistema: null };
const mesmaLista = (a: string, b: string) => (a === 'receber' ? b === 'receber' : a === 'sistema' ? false : b === 'despesa' || b === 'pagar');

/**
 * Financeiro › Tipos de despesa e receita: a lista em linguagem do dia a dia que aparece nas telas,
 * e a conta do plano que cada tipo usa nos bastidores. Cadastrar | Consultar.
 */
export default function TipoLancamentoForm() {
  const { params } = useRoute<RouteProp<PilhaParams, 'TipoLancamentoForm'>>();
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [editar, setEditar] = useState<string | null>(null);
  return (
    <Tela>
      <AbasCadastro aba={aba} aoMudar={setAba} />
      {aba === 'consultar' ? (
        <Consulta
          aoAlterar={(ch) => {
            setEditar(ch);
            setAba('cadastrar');
          }}
        />
      ) : (
        <Cadastro editar={editar} aoSair={() => setEditar(null)} />
      )}
    </Tela>
  );
}

function Cadastro({ editar, aoSair }: { editar: string | null; aoSair: () => void }) {
  const navegacao = useNavigation<NavPilha>();
  const [todos, setTodos] = useState<Tipo[]>([]);
  const [chave, setChave] = useState<string | null>(null);
  const [uso, setUso] = useState<string[]>(['despesa']);
  const [nome, setNome] = useState('');
  const [contaId, setContaId] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(true);
  const [padrao, setPadrao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const doSistema = uso[0] === 'sistema';

  const carregarTodos = useCallback(async () => {
    const d = await consulta<Tipo[]>(supabase.from('tipos_lancamento').select('chave, nome, uso, conta_id, ordem, ativo, padrao').order('ordem').order('nome'));
    setTodos(d);
    return d;
  }, []);
  useFocusEffect(
    useCallback(() => {
      carregarTodos().catch((e) => setErro(traduzirErro(e)));
    }, [carregarTodos]),
  );

  useEffect(() => {
    if (!editar) return;
    carregarTodos()
      .then((d) => {
        const t = d.find((x) => x.chave === editar);
        if (!t) return setErro('Tipo não encontrado.');
        setChave(t.chave);
        setUso([t.uso]);
        setNome(t.nome);
        setContaId(t.conta_id);
        setAtivo(t.ativo);
        setPadrao(t.padrao);
        setErro(null);
        setAviso(null);
      })
      .catch((e) => setErro(traduzirErro(e)));
  }, [editar, carregarTodos]);

  const carregarContas = useCallback(async (): Promise<ItemLista[]> => {
    const tipos = CONTAS_DO_USO[uso[0]];
    let q = supabase.from('plano_contas').select('id, codigo, nome, tipo').eq('analitica', true).eq('ativa', true).order('codigo');
    if (tipos) q = q.in('tipo', tipos);
    const d = await consulta<any[]>(q);
    return d.map((c) => {
      const dono = todos.find((t) => t.conta_id === c.id && t.ativo && t.chave !== chave && mesmaLista(uso[0], t.uso));
      return { id: c.id, titulo: `${c.codigo} ${c.nome}`, detalhe: dono ? `Já é do tipo "${dono.nome}"` : null };
    });
  }, [uso, todos, chave]);

  // V142: a mesma conta, em cada fazenda (grau 2 do plano). O sistema acha sozinho a conta de mesmo nome.
  const [porUnidade, setPorUnidade] = useState<{ unidade: string; codigo: string; nome: string }[]>([]);
  useEffect(() => {
    if (!contaId) return setPorUnidade([]);
    let vivo = true;
    supabase.rpc('contas_por_unidade', { p_conta: contaId }).then(({ data }) => {
      if (vivo) setPorUnidade(Array.isArray(data) ? (data as any[]) : []);
    });
    return () => {
      vivo = false;
    };
  }, [contaId]);

  function limpar() {
    setChave(null);
    setUso(['despesa']);
    setNome('');
    setContaId(null);
    setAtivo(true);
    setPadrao(false);
    aoSair();
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    if (!nome.trim()) return setErro('Informe o nome do tipo, do jeito que se fala no dia a dia.');
    if (!contaId) return setErro('Escolha a conta do plano que este tipo usa.');
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_tipo_lancamento', { p: { chave, nome, uso: uso[0], conta_id: contaId, ativo } });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    await tiposLancamento(true).catch(() => {}); // as outras telas passam a ver a lista nova
    setAviso(chave ? `Tipo "${(r as any).nome}" alterado. A conta nova vale para os próximos lançamentos.` : `Tipo "${(r as any).nome}" cadastrado: já aparece nas listas.`);
    limpar();
    carregarTodos().catch(() => {});
  }

  function excluir() {
    Alert.alert('Excluir tipo', `Excluir o tipo "${nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_tipo_lancamento', { p_chave: chave });
          if (error) return setErro(traduzirErro(error));
          await tiposLancamento(true).catch(() => {});
          setAviso(`Tipo "${nome}" excluído.`);
          limpar();
          carregarTodos().catch(() => {});
        },
      },
    ]);
  }

  return (
    <>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!chave && <Text style={estilos.nota}>O tipo é o nome que aparece nas telas ("Energia elétrica", "Seguros"). A conta do plano fica nos bastidores: quem lança só escolhe o tipo. Para alterar um tipo, use Consultar e toque nele.</Text>}
      {chave && (
        <Text style={estilos.link} onPress={limpar}>
          Sair deste tipo e cadastrar um novo
        </Text>
      )}

      {chave ? (
        <Text style={estilos.fixo}>{TITULO_USO[uso[0]]}</Text>
      ) : (
        <>
          <Escolha
            rotulo="Onde aparece"
            opcoes={USOS.map((u) => ({ valor: u.valor, rotulo: u.rotulo }))}
            valor={uso}
            aoMudar={(v) => {
              setUso(v);
              setContaId(null);
            }}
          />
          <Text style={estilos.nota}>{USOS.find((u) => u.valor === uso[0])?.explica}</Text>
        </>
      )}
      {doSistema ? (
        <>
          <Text style={estilos.nomeFixo}>{nome}</Text>
          <Aviso tipo="info" texto="Tipo definido pelo sistema, pela tela em que o lançamento nasce. O nome não muda; aqui você só escolhe a conta do plano que ele usa." />
        </>
      ) : (
        <Campo rotulo="Nome do tipo *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder="Ex.: Água, Aluguel de máquina, Análise de solo" />
      )}
      <SeletorLista rotulo="Conta do plano que este tipo usa *" valorId={contaId} aoMudar={setContaId} carregar={carregarContas} dicaBusca="Código ou nome" vazio="Nenhuma conta analítica para esta lista." />
      {porUnidade.length > 0 && (
        <>
          <Text style={estilos.nota}>Em cada fazenda o lançamento cai na conta de mesmo nome do grupo dela (sem conta igual, em Outras despesas / Outras receitas):</Text>
          {porUnidade.map((u) => (
            <Text key={u.unidade} style={estilos.nota}>
              • {u.unidade}: {u.codigo} {u.nome}
            </Text>
          ))}
        </>
      )}
      {!doSistema && <Text style={estilos.nota}>Cada tipo da lista usa uma conta diferente. Se a conta que você quer já é de outro tipo, crie uma nova no plano.</Text>}
      <Text style={estilos.link} onPress={() => navegacao.navigate('ContaForm', {})}>
        Não achou a conta? Criar no Plano de contas
      </Text>
      {!doSistema && chave && <Interruptor rotulo="Ativo" descricao="Desligado, o tipo some das listas. O que já foi lançado continua como está." valor={ativo} aoMudar={setAtivo} />}

      <Botao titulo={chave ? 'Salvar tipo' : 'Cadastrar tipo'} onPress={salvar} carregando={salvando} />
      {chave && !padrao && !doSistema && <Botao titulo="Excluir tipo" tipo="perigo" onPress={excluir} />}
    </>
  );
}

function Consulta({ aoAlterar }: { aoAlterar: (chave: string) => void }) {
  const [lista, setLista] = useState<Tipo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      consulta<Tipo[]>(supabase.from('tipos_lancamento').select('chave, nome, uso, conta_id, ordem, ativo, padrao, conta:plano_contas ( codigo, nome )').order('ordem').order('nome'))
        .then(setLista)
        .catch((e) => setErro(traduzirErro(e)));
    }, []),
  );
  if (erro) return <Aviso tipo="erro" texto={erro} />;
  if (!lista) return <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;
  return (
    <>
      <Text style={estilos.nota}>Toque num tipo para mudar o nome, a conta do plano ou desativar.</Text>
      {(['despesa', 'pagar', 'receber', 'sistema'] as UsoTipo[]).map((u) => {
        const itens = lista.filter((t) => t.uso === u);
        if (!itens.length) return null;
        return (
          <React.Fragment key={u}>
            <Secao titulo={TITULO_USO[u]} />
            <Lista>
              {itens.map((t) => (
                <Linha key={t.chave} titulo={t.nome} inativo={!t.ativo} linhas={[um(t.conta) ? `${um(t.conta).codigo} ${um(t.conta).nome}` : 'Sem conta', !t.padrao ? 'Criado por você' : null]} onPress={() => aoAlterar(t.chave)} />
              ))}
            </Lista>
          </React.Fragment>
        );
      })}
    </>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  fixo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  nomeFixo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto },
});
