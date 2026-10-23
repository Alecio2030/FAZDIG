import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Interruptor from '../../componentes/Interruptor';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { NIVEL_MAXIMO, ROTULO_TIPO_CONTA, TIPOS_CONTA, erroCodigo, nivelDe, proximoCodigo, type Conta, type TipoConta } from '../../lib/planoContas';
import ConsultaContas from './ConsultaContas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Pai = { id: string; codigo: string; nome: string; tipo: TipoConta };

export default function ContaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ContaForm'>>();
  const id = params?.id;
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');

  const [pai, setPai] = useState<Pai | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<string[]>([]);
  const [analitica, setAnalitica] = useState(false);
  const [ativa, setAtiva] = useState(true);
  const [filhas, setFilhas] = useState(0);
  const [usos, setUsos] = useState(0);

  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? 'Editar conta' : 'Plano de contas' });
  }, [navegacao, id]);

  // ---- editar: carrega a conta, a conta pai, quantas filhas e quantos lançamentos ela tem ----
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const c = await consulta<Conta>(supabase.from('plano_contas').select('*').eq('id', id).single());
        setCodigo(c.codigo);
        setNome(c.nome);
        setTipo([c.tipo]);
        setAnalitica(c.analitica);
        setAtiva(c.ativa);
        if (c.conta_pai_id) {
          const p = await consulta<Pai>(supabase.from('plano_contas').select('id, codigo, nome, tipo').eq('id', c.conta_pai_id).single());
          setPai(p);
        }
        const [f, l] = await Promise.all([
          supabase.from('plano_contas').select('id', { count: 'exact', head: true }).eq('conta_pai_id', id),
          supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('conta_contabil_id', id),
        ]);
        setFilhas(f.count ?? 0);
        setUsos(l.count ?? 0);
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [id]);

  // ---- novo: ao escolher a conta pai, herda o tipo e sugere o próximo código ----
  const sugerir = useCallback(async (p: Pai | null) => {
    let q = supabase.from('plano_contas').select('codigo');
    q = p ? q.eq('conta_pai_id', p.id) : q.is('conta_pai_id', null);
    const irmas = await consulta<{ codigo: string }[]>(q);
    const prox = proximoCodigo(p?.codigo ?? null, irmas.map((i) => i.codigo));
    setCodigo(prox ?? '');
    const nivel = p ? nivelDe(p.codigo) + 1 : 1;
    setAnalitica(nivel === NIVEL_MAXIMO);
    if (p) setTipo([p.tipo]);
  }, []);

  useEffect(() => {
    if (!id) sugerir(null).catch(() => {});
  }, [id, sugerir]);

  async function escolherPai(paiId: string | null) {
    setErros({});
    if (!paiId) {
      setPai(null);
      setTipo([]);
      return sugerir(null).catch((e) => setErro(traduzirErro(e)));
    }
    try {
      const p = await consulta<Pai>(supabase.from('plano_contas').select('id, codigo, nome, tipo').eq('id', paiId).single());
      setPai(p);
      await sugerir(p);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  const carregarTodas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('plano_contas').select('id, codigo, nome, tipo, analitica, ativa').order('codigo'));
    return d.map((c) => ({ id: c.id, titulo: `${c.codigo}  ${c.nome}`, detalhe: `${ROTULO_TIPO_CONTA[c.tipo]} · ${c.analitica ? 'analítica' : 'sintética'}${c.ativa ? '' : ' · inativa'}` }));
  }, []);

  const carregarPais = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(
      supabase.from('plano_contas').select('id, codigo, nome, tipo, ativa').eq('analitica', false).order('codigo'),
    );
    return d
      .filter((c) => nivelDe(c.codigo) < NIVEL_MAXIMO)
      .map((c) => ({ id: c.id, titulo: `${c.codigo}  ${c.nome}`, detalhe: ROTULO_TIPO_CONTA[c.tipo], oculto: !c.ativa }));
  }, []);

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    const cod = codigo.trim();
    if (!nome.trim()) e.nome = 'Informe o nome da conta.';
    const ec = cod ? erroCodigo(cod, pai?.codigo ?? null) : 'Informe o código.';
    if (ec) e.codigo = ec;
    if (!pai && tipo.length === 0) e.tipo = 'Escolha o tipo do grupo.';
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');

    setSalvando(true);
    if (id) {
      const { error } = await supabase.rpc('alterar_conta', {
        p: { id, codigo: cod, nome: nome.trim(), conta_pai_id: pai?.id ?? null, tipo: pai ? pai.tipo : tipo[0], analitica, ativa },
      });
      setSalvando(false);
      if (error) return setErro(traduzirErro(error));
      navegacao.goBack();
      return;
    }

    const { data: igual } = await supabase.from('plano_contas').select('nome').eq('codigo', cod).limit(1);
    if (igual && igual.length) {
      setSalvando(false);
      setErros({ codigo: `Este código já é da conta ${igual[0].nome}.` });
      return setErro('Código repetido.');
    }
    const { error } = await supabase.from('plano_contas').insert({
      codigo: cod,
      nome: nome.trim(),
      tipo: pai ? pai.tipo : tipo[0],
      conta_pai_id: pai?.id ?? null,
      analitica,
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    navegacao.replace('ContaForm', { aviso: `Conta ${cod}  ${nome.trim()} cadastrada. Pode cadastrar a próxima.` });
  }

  function excluir() {
    if (filhas > 0) {
      return setErro(`Esta conta agrupa ${filhas} ${filhas === 1 ? 'conta' : 'contas'}. Exclua ou mude as contas de baixo antes, ou desmarque "Ativa".`);
    }
    Alert.alert('Excluir conta', `Excluir ${codigo}  ${nome}? Se ela já tiver lançamentos, o sistema não deixa: nesse caso, desmarque "Ativa".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('plano_contas').delete().eq('id', id!);
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

  const abas = !id && <AbasCadastro aba={aba} aoMudar={setAba} />;

  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaContas />
      </Tela>
    );
  }

  // Conta de grau 1 (Ativo, Passivo, PL, Receita, Despesa…): fica fixa, só se consulta.
  if (id && !pai) {
    return (
      <Tela>
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Text style={estilos.codigo}>{codigo}</Text>
        <Text style={estilos.nomeFixo}>{nome}</Text>
        <Text style={estilos.nota}>
          {ROTULO_TIPO_CONTA[tipo[0]]}, grupo principal (grau 1).{filhas > 0 ? ` Agrupa ${filhas} ${filhas === 1 ? 'conta' : 'contas'}.` : ''}
        </Text>
        <Aviso tipo="info" texto="As contas de grau 1 não podem ser alteradas nem excluídas. Os nomes das contas de baixo (graus 2 a 4) podem ser alterados. Nas Receitas e nos Custos, o grau 2 é a fazenda (centro de custo), o grau 3 o subcentro e o grau 4 a conta dos valores." />
      </Tela>
    );
  }

  const nivel = codigo ? nivelDe(codigo) : pai ? nivelDe(pai.codigo) + 1 : 1;
  // Nível 1 é sempre grupo; o último grau (4) é sempre analítica. No meio, pode escolher,
  // mas não vira analítica se já tem contas embaixo, nem sintética se já tem lançamentos.
  const podeMudarAnalitica = nivel > 1 && nivel < NIVEL_MAXIMO && (analitica ? usos === 0 : filhas === 0);

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {!id && (
        <SeletorLista
          rotulo="Alterar uma conta já cadastrada"
          valorId={null}
          aoMudar={(cid) => cid && navegacao.navigate('ContaForm', { id: cid })}
          carregar={carregarTodas}
          dicaBusca="Código ou nome"
          vazio="Plano de contas vazio."
        />
      )}
      {id && (
        <>
          <Text style={estilos.codigo}>{codigo}</Text>
          <Text style={estilos.nota}>
            {ROTULO_TIPO_CONTA[tipo[0]]}
            {pai ? `, dentro de ${pai.codigo}  ${pai.nome}` : ', grupo principal'}.
            {filhas > 0 ? ` Agrupa ${filhas} ${filhas === 1 ? 'conta' : 'contas'}.` : ''}
            {usos > 0 ? ` Tem ${usos} ${usos === 1 ? 'lançamento' : 'lançamentos'}.` : ''}
          </Text>
        </>
      )}
      <SeletorLista
        rotulo="Dentro da conta"
        valorId={pai?.id ?? null}
        aoMudar={escolherPai}
        carregar={carregarPais}
        permitirLimpar={!id}
        dicaBusca="Código ou nome"
        vazio="Nenhuma conta sintética cadastrada."
      />
      {!pai && !id && <Escolha rotulo="Tipo do grupo *" opcoes={TIPOS_CONTA} valor={tipo} aoMudar={setTipo} erro={erros.tipo} />}
      {pai && <Text style={estilos.nota}>Tipo: {ROTULO_TIPO_CONTA[pai.tipo]} (vem da conta de cima).</Text>}
      <Campo
        rotulo="Código *"
        value={codigo}
        onChangeText={(t) => setCodigo(t.replace(/[^\d.]/g, ''))}
        keyboardType="numbers-and-punctuation"
        ajuda={id ? (filhas > 0 ? 'Mudando o código ou a conta de cima, as contas de baixo acompanham.' : 'Máscara 9.9.99.999 (4 graus).') : 'Sugerido o próximo número livre. Máscara 9.9.99.99.9999.'}
        erro={erros.codigo}
      />

      <Campo rotulo="Nome da conta *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder="Ex.: Energia Elétrica da Irrigação" erro={erros.nome} />

      {podeMudarAnalitica ? (
        <Interruptor
          rotulo="Analítica"
          descricao={analitica ? 'Recebe lançamentos. Não pode ter contas embaixo.' : 'Sintética: só agrupa as contas de baixo.'}
          valor={analitica}
          aoMudar={setAnalitica}
        />
      ) : (
        <Text style={estilos.nota}>{analitica ? 'Analítica: recebe lançamentos.' : 'Sintética: agrupa as contas de baixo.'}</Text>
      )}

      {id && (
        <Interruptor rotulo="Ativa" descricao="Contas inativas não aparecem para escolher em novos lançamentos." valor={ativa} aoMudar={setAtiva} />
      )}

      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar conta'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir conta" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  codigo: { fontSize: 28, fontWeight: '800', color: cores.primariaEscura, letterSpacing: 1 },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  nomeFixo: { fontSize: tam.subtitulo + 2, fontWeight: '700', color: cores.texto },
});
