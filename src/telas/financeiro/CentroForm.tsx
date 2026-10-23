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
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { ehCodigoCentroPlano, ehCodigoDivisao, proximaDivisao, type Centro } from '../../lib/centrosCusto';
import { nomeLote } from '../../lib/rebanho';
import { nomeUnidade } from '../../lib/unidades';
import { useSigla } from '../../lib/useSigla';
import ConsultaCentros from './ConsultaCentros';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Vinculo = 'nada' | 'talhao' | 'manga' | 'lote';

const OPCOES_VINCULO = [
  { valor: 'nada', rotulo: 'Nada' },
  { valor: 'talhao', rotulo: 'Talhão' },
  { valor: 'manga', rotulo: 'Manga' },
  { valor: 'lote', rotulo: 'Lote' },
];

/**
 * V144: os centros de custo são as contas de GRAU 3 do grupo 4 do Plano de contas (o sistema cria sozinho).
 * Aqui: (1) digitar o código da conta (ex.: 4.1.01) traz o nome do plano e confere/cria o centro;
 * (2) escolher um centro e criar uma divisão dele (ex.: Viveiro, dentro do 4.1.01).
 * Talhões, mangas e lotes já ganham a sua divisão sozinhos.
 */
export default function CentroForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'CentroForm'>>();
  const id = params?.id;
  const { fazendas } = useSessao();
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');

  const [registro, setRegistro] = useState<Centro | null>(null);
  const [pai, setPai] = useState<Centro | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  /** conta do plano achada pelo código digitado (grau 3 do grupo 4) */
  const [conta, setConta] = useState<{ id: string; codigo: string; nome: string; fazenda_id: string | null } | null>(null);
  const [jaExiste, setJaExiste] = useState<Centro | null>(null);
  const [vinculo, setVinculo] = useState<Vinculo>('nada');
  const [areaId, setAreaId] = useState<string | null>(null);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(true);
  const [filhos, setFilhos] = useState(0);

  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const doPlano = !!registro?.conta_plano_id;
  const fazendaDoCentro = pai ? pai.fazenda_id : registro?.fazenda_id ?? null;
  const { sigla } = useSigla(fazendaDoCentro);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? 'Centro de custo' : 'Centros de custo' });
  }, [navegacao, id]);

  // ---- abrir para consultar/alterar ----
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const c = await consulta<Centro>(supabase.from('centros_custo').select('*').eq('id', id).single());
        setRegistro(c);
        setCodigo(c.codigo);
        setNome(c.nome);
        setAtivo(c.ativo);
        setLoteId(c.lote_id);
        setAreaId(c.area_id);
        if (c.lote_id) setVinculo('lote');
        else if (c.area_id) {
          const a = await consulta<{ tipo: Vinculo }>(supabase.from('areas').select('tipo').eq('id', c.area_id).single());
          setVinculo(a.tipo);
        }
        if (c.centro_pai_id) setPai(await consulta<Centro>(supabase.from('centros_custo').select('*').eq('id', c.centro_pai_id).single()));
        const { count } = await supabase.from('centros_custo').select('id', { count: 'exact', head: true }).eq('centro_pai_id', id);
        setFilhos(count ?? 0);
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [id]);

  // ---- digitou o código de uma conta de grau 3 do grupo 4: o nome vem do plano ----
  useEffect(() => {
    if (id || pai) return;
    const c = codigo.trim();
    setConta(null);
    setJaExiste(null);
    if (!ehCodigoCentroPlano(c)) return;
    let vivo = true;
    (async () => {
      const [{ data: pc }, { data: cc }] = await Promise.all([
        supabase.from('plano_contas').select('id, codigo, nome, fazenda_id').eq('codigo', c).maybeSingle(),
        supabase.from('centros_custo').select('*').eq('codigo', c).maybeSingle(),
      ]);
      if (!vivo) return;
      setConta((pc as any) ?? null);
      setJaExiste((cc as any) ?? null);
      if (pc) setNome((pc as any).nome);
    })();
    return () => {
      vivo = false;
    };
  }, [codigo, id, pai]);

  // ---- divisão: escolheu o centro de cima ----
  async function escolherPai(paiId: string | null) {
    setErros({});
    setErro(null);
    setVinculo('nada');
    setAreaId(null);
    setLoteId(null);
    setConta(null);
    setJaExiste(null);
    try {
      const p = paiId ? await consulta<Centro>(supabase.from('centros_custo').select('*').eq('id', paiId).single()) : null;
      setPai(p);
      if (p) {
        const irmaos = await consulta<{ codigo: string }[]>(supabase.from('centros_custo').select('codigo').eq('centro_pai_id', p.id));
        setCodigo(proximaDivisao(p.codigo, irmaos.map((i) => i.codigo)));
        setNome('');
      } else {
        setCodigo('');
        setNome('');
      }
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  // ---- listas ----
  const carregarCentrosPlano = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id, ativo').not('conta_plano_id', 'is', null).order('codigo'));
    return d.map((c) => ({ id: c.id, titulo: `${c.codigo}  ${c.nome}`, detalhe: nomeUnidade(c.fazenda_id, fazendas), oculto: !c.ativo }));
  }, [fazendas]);

  const carregarAreas = useCallback(
    (tipoArea: 'talhao' | 'manga') => async (): Promise<ItemLista[]> => {
      const d = await consulta<any[]>(
        supabase.from('areas').select('id, nome, capim_cultura, ativa').eq('fazenda_id', fazendaDoCentro!).eq('tipo', tipoArea).order('nome'),
      );
      return d.map((a) => ({ id: a.id, titulo: a.nome, detalhe: a.capim_cultura, oculto: !a.ativa }));
    },
    [fazendaDoCentro],
  );

  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, situacao').eq('fazenda_id', fazendaDoCentro!).order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla), oculto: l.situacao !== 'ativo' }));
  }, [fazendaDoCentro, sigla]);

  async function escolherArea(v: string | null) {
    setAreaId(v);
    if (!v || nome.trim()) return;
    const { data } = await supabase.from('areas').select('nome').eq('id', v).single();
    if (data) setNome(data.nome);
  }
  async function escolherLote(v: string | null) {
    setLoteId(v);
    if (!v || nome.trim()) return;
    const { data } = await supabase.from('lotes').select('numero, descricao').eq('id', v).single();
    if (data) setNome(nomeLote(data, sigla));
  }

  // ---- gravar ----
  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    const cod = codigo.trim();
    const ligacao = {
      area_id: vinculo === 'talhao' || vinculo === 'manga' ? areaId : null,
      lote_id: vinculo === 'lote' ? loteId : null,
    };

    // alteração de uma divisão (nome, ativo, ligação)
    if (id) {
      if (!nome.trim()) e.nome = 'Informe o nome.';
      if ((vinculo === 'talhao' || vinculo === 'manga') && !areaId) e.vinculo = `Escolha ${vinculo === 'talhao' ? 'o talhão' : 'a manga'}.`;
      if (vinculo === 'lote' && !loteId) e.vinculo = 'Escolha o lote.';
      setErros(e);
      if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');
      setSalvando(true);
      const { error } = await supabase.from('centros_custo').update({ nome: nome.trim(), ativo, ...ligacao }).eq('id', id);
      setSalvando(false);
      if (error) return setErro(traduzirErro(error));
      navegacao.goBack();
      return;
    }

    // centro do plano: o código de uma conta de grau 3 do grupo 4
    if (!pai) {
      if (!ehCodigoCentroPlano(cod)) {
        setErros({ codigo: 'O centro de custo é o código de uma conta de grau 3 do grupo 4 do Plano de contas, ex.: 4.1.01.' });
        return setErro('Código inválido.');
      }
      if (!conta) {
        setErros({ codigo: `Não há a conta ${cod} no Plano de contas. Cadastre a conta de grau 3 lá: o centro de custo nasce sozinho.` });
        return setErro('Conta não encontrada no plano.');
      }
      setSalvando(true);
      const { error } = await supabase.rpc('centro_do_grau3', { p_conta: conta.id });
      setSalvando(false);
      if (error) return setErro(traduzirErro(error));
      navegacao.replace('CentroForm', { aviso: `Centro ${conta.codigo}  ${conta.nome} (${nomeUnidade(conta.fazenda_id, fazendas)}) ${jaExiste ? 'conferido com o plano' : 'cadastrado'}.` });
      return;
    }

    // divisão dentro de um centro
    if (!nome.trim()) e.nome = 'Informe o nome da divisão.';
    if (!ehCodigoDivisao(cod, pai.codigo)) e.codigo = `A divisão de ${pai.codigo} tem o código ${pai.codigo}-001, ${pai.codigo}-002...`;
    if ((vinculo === 'talhao' || vinculo === 'manga') && !areaId) e.vinculo = `Escolha ${vinculo === 'talhao' ? 'o talhão' : 'a manga'}.`;
    if (vinculo === 'lote' && !loteId) e.vinculo = 'Escolha o lote.';
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');
    setSalvando(true);
    const { data: igual } = await supabase.from('centros_custo').select('nome').eq('codigo', cod).limit(1);
    if (igual && igual.length) {
      setSalvando(false);
      setErros({ codigo: `Este código já é do centro ${igual[0].nome}.` });
      return setErro('Código repetido.');
    }
    const { error } = await supabase.from('centros_custo').insert({ codigo: cod, nome: nome.trim(), centro_pai_id: pai.id, fazenda_id: pai.fazenda_id, ...ligacao });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    navegacao.replace('CentroForm', { aviso: `Divisão ${cod}  ${nome.trim()} cadastrada dentro de ${pai.codigo} ${pai.nome}.` });
  }

  function excluir() {
    if (filhos > 0) return setErro(`Este centro tem ${filhos} ${filhos === 1 ? 'divisão' : 'divisões'}. Exclua as de baixo antes, ou desmarque "Ativo".`);
    Alert.alert('Excluir divisão', `Excluir ${codigo}  ${nome}? Se já tiver lançamentos, o sistema não deixa: nesse caso, desmarque "Ativo".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('centros_custo').delete().eq('id', id!);
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
        <ConsultaCentros />
      </Tela>
    );
  }

  // ---- consultar/alterar um centro ----
  if (id && registro) {
    const automatica = !!(registro.area_id || registro.lote_id);
    return (
      <Tela>
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Text style={estilos.codigo}>{registro.codigo}</Text>
        <Text style={estilos.nome}>{registro.nome}</Text>
        <Text style={estilos.nota}>
          {nomeUnidade(registro.fazenda_id, fazendas)}
          {pai ? ` · dentro de ${pai.codigo} ${pai.nome}` : ''}
          {filhos > 0 ? ` · ${filhos} ${filhos === 1 ? 'divisão' : 'divisões'}` : ''}
          {registro.ativo ? '' : ' · INATIVO'}
        </Text>
        {doPlano ? (
          <Aviso tipo="info" texto="Este centro é a conta de grau 3 do Plano de contas: o código, o nome e se está ativo vêm de lá. Para mudar, mude a conta no Plano de contas e o centro acompanha sozinho." />
        ) : (
          <>
            {automatica && <Text style={estilos.nota}>Divisão criada pelo sistema para o {registro.lote_id ? 'lote' : 'talhão ou manga'}: o nome acompanha o cadastro dele.</Text>}
            {fazendaDoCentro && (
              <>
                <Escolha
                  rotulo="Ligado a"
                  opcoes={OPCOES_VINCULO}
                  valor={[vinculo]}
                  aoMudar={(v) => {
                    setVinculo(v[0] as Vinculo);
                    setAreaId(null);
                    setLoteId(null);
                  }}
                  erro={erros.vinculo}
                />
                {(vinculo === 'talhao' || vinculo === 'manga') && (
                  <SeletorLista key={vinculo} rotulo={vinculo === 'talhao' ? 'Talhão' : 'Manga'} valorId={areaId} aoMudar={setAreaId} carregar={carregarAreas(vinculo)} />
                )}
                {vinculo === 'lote' && <SeletorLista rotulo="Lote" valorId={loteId} aoMudar={setLoteId} carregar={carregarLotes} />}
              </>
            )}
            <Campo rotulo="Nome *" value={nome} onChangeText={setNome} autoCapitalize="sentences" erro={erros.nome} />
            <Interruptor rotulo="Ativo" descricao="Inativos não aparecem para escolher em novos lançamentos." valor={ativo} aoMudar={setAtivo} />
            <Botao titulo="Salvar alterações" onPress={salvar} carregando={salvando} />
            <Botao titulo="Excluir divisão" tipo="perigo" onPress={excluir} />
          </>
        )}
      </Tela>
    );
  }

  // ---- cadastrar ----
  return (
    <Tela>
      {abas}
      {params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Aviso
        tipo="info"
        texto="Os centros de custo são as contas de grau 3 do grupo 4 do Plano de contas (ex.: 4.1.01 AGRÍCOLA) e o sistema cria todos sozinho. Talhões, mangas e lotes também ganham a sua divisão sozinhos. Aqui você confere um centro pelo código ou cria uma divisão a mais dentro de um centro."
      />

      <SeletorLista
        rotulo="Divisão dentro do centro (opcional)"
        valorId={pai?.id ?? null}
        aoMudar={escolherPai}
        carregar={carregarCentrosPlano}
        permitirLimpar
        dicaBusca="Código ou nome"
        vazio="Nenhum centro ainda. Rode no Supabase o arquivo do banco da V144."
      />
      <Text style={estilos.nota}>Em branco: digite abaixo o código da conta de grau 3 (ex.: 4.1.01) e o nome vem do Plano de contas.</Text>

      <Campo
        rotulo="Código *"
        value={codigo}
        onChangeText={(t) => setCodigo(t.replace(/[^\d.-]/g, ''))}
        keyboardType="numbers-and-punctuation"
        placeholder={pai ? `${pai.codigo}-001` : '4.1.01'}
        ajuda={pai ? `Já vem o próximo número livre dentro de ${pai.codigo}.` : 'Código da conta de grau 3 do grupo 4.'}
        erro={erros.codigo}
      />
      {!pai && conta && (
        <Text style={estilos.achado}>
          {conta.codigo}  {conta.nome} · {nomeUnidade(conta.fazenda_id, fazendas)}
          {jaExiste ? '  (centro já cadastrado)' : ''}
        </Text>
      )}
      {!pai && ehCodigoCentroPlano(codigo) && !conta && <Text style={estilos.nota}>Esta conta não existe no Plano de contas.</Text>}

      {pai && (
        <>
          <Escolha
            rotulo="Ligado a"
            opcoes={OPCOES_VINCULO}
            valor={[vinculo]}
            aoMudar={(v) => {
              setVinculo(v[0] as Vinculo);
              setAreaId(null);
              setLoteId(null);
            }}
            erro={erros.vinculo}
          />
          {(vinculo === 'talhao' || vinculo === 'manga') && (
            <SeletorLista
              key={vinculo}
              rotulo={vinculo === 'talhao' ? 'Talhão' : 'Manga'}
              valorId={areaId}
              aoMudar={escolherArea}
              carregar={carregarAreas(vinculo)}
              vazio={vinculo === 'talhao' ? 'Nenhum talhão nesta fazenda.' : 'Nenhuma manga nesta fazenda.'}
            />
          )}
          {vinculo === 'lote' && <SeletorLista rotulo="Lote" valorId={loteId} aoMudar={escolherLote} carregar={carregarLotes} vazio="Nenhum lote nesta fazenda." />}
          <Campo rotulo="Nome *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder="Ex.: Viveiro de mudas, Recria" erro={erros.nome} />
        </>
      )}

      <Botao titulo={pai ? 'Cadastrar divisão' : 'Conferir / cadastrar centro'} onPress={salvar} carregando={salvando} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  codigo: { fontSize: 28, fontWeight: '800', color: cores.primariaEscura, letterSpacing: 1 },
  nome: { fontSize: tam.texto + 2, fontWeight: '700', color: cores.texto },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  achado: { fontSize: tam.texto, fontWeight: '700', color: cores.primariaEscura },
});
