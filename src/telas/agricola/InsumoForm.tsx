import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Interruptor from '../../componentes/Interruptor';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import UnidadesInsumo from '../../componentes/UnidadesInsumo';
import DadosUsoVeterinario from '../../componentes/DadosUsoVeterinario';
import EntradaParcial, { erroParcial, parcialDoCadastro, parcialParaBanco, parcialVazio, type Parcial } from '../../componentes/EntradaParcial';
import Secao from '../../componentes/Secao';
import EstoqueInicial from '../../componentes/EstoqueInicial';
import AtributosProduto, { DEFS, type Atributos } from '../../componentes/AtributosProduto';
import { formatarMoeda, lerNumero, numeroParaCampo } from '../../lib/formatos';
import ConsultaInsumos from './ConsultaInsumos';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase, traduzirErro } from '../../lib/supabase';
import {
  CATEGORIAS_INSUMO, CATEGORIAS_VETERINARIAS, USO_VAZIO, custosDe, erroUnidades, errosUso, nomeUnidade, saldoDe, textoDose, textoSaldo, textoUnidades,
  unidadesDoBanco, unidadesNovas, unidadesParaBanco, usoDoBanco, usoParaBanco, type Unidades, type UsoVet,
} from '../../lib/insumos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const ROTULO_CAT: Record<string, string> = Object.fromEntries(CATEGORIAS_INSUMO.map((c) => [c.valor, c.rotulo]));
const igualNome = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Cadastro de insumos (e de Medicamentos e vacinas).
 * - Digitou o nome de um produto já cadastrado: carrega todos os dados e o estoque; completa ou altera e confirma.
 * - Vacina e medicamento: "Completo" ou "Entrada parcial" (comprado às pressas).
 * - Todo problema aparece em vermelho no próprio campo e, por extenso, junto do botão.
 */
export default function InsumoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'InsumoForm'>>();
  const { fazendaAtiva } = useSessao();
  const grupo = params?.grupo;
  const veioDaConsulta = !!params?.id;
  const opcoesCategoria = grupo === 'veterinario' ? CATEGORIAS_INSUMO.filter((c) => CATEGORIAS_VETERINARIAS.includes(c.valor)) : CATEGORIAS_INSUMO;

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<string[]>(grupo === 'veterinario' ? ['medicamento'] : []);
  const [un, setUn] = useState<Unidades>(() => {
    const c = CATEGORIAS_INSUMO.find((x) => x.valor === (grupo === 'veterinario' ? 'medicamento' : ''));
    return unidadesNovas(c?.unidade, c?.consumo);
  });
  const [unidadeMexida, setUnidadeMexida] = useState(false);
  const [uso, setUso] = useState<UsoVet>(USO_VAZIO);
  const [ativo, setAtivo] = useState(true);
  const [modo, setModo] = useState<string[]>(['completo']);
  const [par, setPar] = useState<Parcial>(parcialVazio('medicamento'));
  const [fabricante, setFabricante] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [minimo, setMinimo] = useState('');
  const [atributos, setAtributos] = useState<Atributos>({});
  const [custos, setCustos] = useState<{ ultimo: number | null; medio: number | null }>({ ultimo: null, medio: null });

  // Produto carregado (pela consulta ou achado pelo nome)
  const [registro, setRegistro] = useState<any>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [sugestoes, setSugestoes] = useState<any[]>([]);

  const [carregando, setCarregando] = useState(veioDaConsulta);
  const [salvando, setSalvando] = useState(false);
  const [falhas, setFalhas] = useState<string[]>([]); // mensagens por extenso junto do botão
  const [erros, setErros] = useState<Record<string, string>>({}); // vermelho em cada campo

  const id: string | undefined = registro?.id;
  const veterinario = CATEGORIAS_VETERINARIAS.includes(categoria[0]);
  const parcial = !veioDaConsulta && veterinario && modo[0] === 'parcial';
  const incompleto = !!registro && (registro.cadastro_completo === false || (veterinario && !registro.dose_recomendada));

  useLayoutEffect(() => {
    navegacao.setOptions({ title: veioDaConsulta ? 'Editar insumo' : grupo === 'veterinario' ? 'Medicamentos e vacinas' : 'Insumos' });
  }, [navegacao, veioDaConsulta, grupo]);

  // ---- carregar um produto (todos os campos + estoque da fazenda ativa) ----
  async function carregar(insumoId: string) {
    const { data, error } = await supabase.from('insumos').select('*').eq('id', insumoId).single();
    if (error || !data) {
      setFalhas([error ? traduzirErro(error) : 'Produto não encontrado.']);
      return null;
    }
    setRegistro(data);
    setNome(data.nome ?? '');
    setCategoria([data.categoria]);
    setUn(unidadesDoBanco(data));
    setUnidadeMexida(true);
    setUso(usoDoBanco(data));
    setAtivo(data.ativo !== false);
    setFabricante(data.fabricante ?? '');
    setCodigoBarras(data.codigo_barras ?? '');
    setMinimo(numeroParaCampo(data.estoque_minimo));
    setAtributos(data.atributos ?? {});
    setErros({});
    setFalhas([]);
    setSaldo(null);
    if (fazendaAtiva) {
      const { data: movs } = await supabase.from('estoque_movimentos').select('tipo, quantidade, valor_unitario, data').eq('insumo_id', insumoId).eq('fazenda_id', fazendaAtiva.id);
      setSaldo(saldoDe((movs ?? []) as any[]));
      setCustos(custosDe((movs ?? []) as any[]));
    }
    return data;
  }

  // V149: depois de mexer no estoque inicial, só o saldo e os custos mudam (o que está digitado fica)
  async function atualizarSaldo(insumoId: string) {
    if (!fazendaAtiva) return;
    const { data: movs } = await supabase.from('estoque_movimentos').select('tipo, quantidade, valor_unitario, data').eq('insumo_id', insumoId).eq('fazenda_id', fazendaAtiva.id);
    setSaldo(saldoDe((movs ?? []) as any[]));
    setCustos(custosDe((movs ?? []) as any[]));
  }

  // Volta a ser cadastro novo (mantém o nome e a categoria digitados).
  function soltar() {
    setRegistro(null);
    setSaldo(null);
    setUso(USO_VAZIO);
    setAtivo(true);
    setFabricante('');
    setCodigoBarras('');
    setMinimo('');
    setAtributos({});
    setCustos({ ultimo: null, medio: null });
    setUnidadeMexida(false);
    setPar(parcialVazio(categoria[0] ?? 'medicamento'));
  }

  useEffect(() => {
    if (params?.id) carregar(params.id).finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  // ---- nome digitado: procura no cadastro ----
  useEffect(() => {
    if (veioDaConsulta) return;
    const t = nome.trim();
    if (registro && !igualNome(registro.nome, t)) soltar();
    if (t.length < 2) return setSugestoes([]);
    const tempo = setTimeout(async () => {
      let q = supabase.from('insumos').select('id, nome, categoria, dose_recomendada, cadastro_completo').ilike('nome', `%${t}%`).order('nome').limit(8);
      if (grupo === 'veterinario') q = q.in('categoria', CATEGORIAS_VETERINARIAS);
      const { data } = await q;
      const lista = data ?? [];
      const igual = lista.find((x) => igualNome(x.nome, t));
      if (igual && registro?.id !== igual.id) {
        const d = await carregar(igual.id);
        if (d && parcial) setPar((x) => parcialDoCadastro(x, d));
      }
      setSugestoes(lista.filter((x) => x !== igual));
    }, 400);
    return () => clearTimeout(tempo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome]);

  async function escolherSugestao(i: any) {
    setSugestoes([]);
    const d = await carregar(i.id);
    if (d && parcial) setPar((x) => parcialDoCadastro(x, d));
  }

  // A unidade é sugerida pela categoria, até a pessoa escolher outra.
  function mudarCategoria(v: string[]) {
    setCategoria(v);
    if (!registro) setPar((x) => ({ ...x, dosePor: [v[0] === 'vacina' ? 'cabeca' : 'kg'] }));
    if (!unidadeMexida) {
      const c = CATEGORIAS_INSUMO.find((x) => x.valor === v[0]);
      if (c) setUn((u) => ({ ...unidadesNovas(c.unidade, c.consumo), qtd: u.qtd }));
    }
  }

  function mudarModo(v: string[]) {
    setModo(v);
    setErros({});
    setFalhas([]);
    if (v[0] === 'parcial' && registro) setPar((x) => parcialDoCadastro(x, registro));
  }

  // ---- conferir ----
  function conferir(): { e: Record<string, string>; lista: string[] } {
    const e: Record<string, string> = {};
    if (!nome.trim()) e.nome = 'Informe o nome.';
    if (categoria.length === 0) e.categoria = 'Escolha a categoria.';
    if (parcial) {
      if (!fazendaAtiva) e.parcial = 'Escolha a fazenda ativa (o estoque é por fazenda).';
      const p = erroParcial(par, categoria[0] === 'vacina' ? 'dose' : 'mL');
      if (p) e.parcial = p;
    } else {
      const u = erroUnidades(un);
      if (u) e.unidade = u;
      if (veterinario) Object.assign(e, errosUso(uso, true));
      if (minimo.trim() && (lerNumero(minimo) == null || lerNumero(minimo)! < 0)) e.minimo = 'Estoque mínimo inválido.';
    }
    return { e, lista: Object.values(e) };
  }

  async function salvar() {
    const { e, lista } = conferir();
    setErros(e);
    setFalhas(lista);
    if (lista.length) return;

    setSalvando(true);
    try {
      if (parcial) {
        const { error } = await supabase.rpc('entrada_rapida', { p: parcialParaBanco(par, fazendaAtiva!.id, nome.trim(), categoria[0], id ?? null) });
        if (error) throw error;
        return navegacao.replace('InsumoForm', { grupo, aviso: `${nome.trim()}: entrada parcial feita, os frascos já estão no estoque. Complete a compra em Compras.` });
      }

      // Nome repetido (outro produto com o mesmo nome)
      let q = supabase.from('insumos').select('id').ilike('nome', nome.trim());
      if (id) q = q.neq('id', id);
      const { data: iguais } = await q.limit(1);
      if (iguais && iguais.length) {
        setErros({ nome: 'Já existe outro produto com este nome.' });
        return setFalhas([`Já existe outro produto chamado "${nome.trim()}". Mude o nome.`]);
      }

      const campos = DEFS[categoria[0]]?.campos.map((c) => c.chave) ?? [];
      const attrs = Object.fromEntries(Object.entries(atributos).filter(([k, v]) => campos.includes(k) && String(v).trim()).map(([k, v]) => [k, String(v).trim()]));
      const dados = {
        nome: nome.trim(),
        categoria: categoria[0],
        ativo,
        cadastro_completo: true,
        ...unidadesParaBanco(un),
        ...(veterinario ? usoParaBanco(uso) : {}),
        fabricante: fabricante.trim() || null,
        codigo_barras: codigoBarras.trim() || null,
        estoque_minimo: minimo.trim() ? lerNumero(minimo) : null,
        atributos: attrs,
      };
      // .select() devolve o que ficou gravado: confere que o banco gravou mesmo.
      const { data: gravado, error } = id
        ? await supabase.from('insumos').update(dados).eq('id', id).select('*')
        : await supabase.from('insumos').insert(dados).select('*');
      if (error) throw error;
      if (!gravado || gravado.length === 0) return setFalhas(['Não gravou: seu acesso não permite alterar cadastros (peça acesso completo ao dono).']);
      const g = gravado[0];
      if (veterinario && Number(g.dose_recomendada) !== Number(dados.dose_recomendada)) return setFalhas(['O banco não gravou a dose recomendada. Tente de novo; se repetir, me avise.']);

      const acao = id ? (incompleto ? 'completado' : 'alterado') : 'cadastrado';
      if (veioDaConsulta) navegacao.goBack();
      else navegacao.replace('InsumoForm', { grupo, aviso: `${g.nome} ${acao}. Pode cadastrar o próximo.` });
    } catch (err) {
      setFalhas([traduzirErro(err)]);
    } finally {
      setSalvando(false);
    }
  }

  function excluir() {
    Alert.alert('Excluir', `Excluir ${nome}? O estoque inicial dele sai junto. Se ele já tiver compras, aplicações ou outros lançamentos, o sistema não deixa e diz onde está sendo usado.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_insumo', { p_id: id! }); // V149: sai junto o estoque inicial
          if (error) setFalhas([traduzirErro(error)]);
          else if (veioDaConsulta) navegacao.goBack();
          else navegacao.replace('InsumoForm', { grupo, aviso: `${nome} excluído.` });
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

  const abas = !veioDaConsulta && <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (!veioDaConsulta && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaInsumos grupo={grupo} />
      </Tela>
    );
  }

  const tituloBotao = parcial ? 'Dar entrada' : !registro || incompleto ? 'Confirmar cadastro' : 'Confirmar alteração';

  return (
    <Tela>
      {abas}
      {!veioDaConsulta && params?.aviso && falhas.length === 0 && <Aviso tipo="sucesso" texto={params.aviso} />}

      {registro?.codigo != null && <Text style={estilos.nota}>Código do produto: {registro.codigo} (criado pelo sistema)</Text>}
      <Campo rotulo="Nome *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder={grupo === 'veterinario' ? 'Digite o nome: se já existir, os dados aparecem' : 'Ex.: Adubo 20-05-20, Glifosato'} erro={erros.nome} />
      {!veioDaConsulta && sugestoes.length > 0 && (
        <View style={estilos.sugestoes}>
          <Text style={estilos.sugTitulo}>Parecidos já cadastrados (toque para abrir):</Text>
          {sugestoes.map((i) => (
            <Pressable key={i.id} onPress={() => escolherSugestao(i)} style={({ pressed }) => [estilos.sugItem, pressed && { opacity: 0.6 }]} accessibilityRole="button">
              <Text style={estilos.sugNome}>{i.nome}</Text>
              <Text style={estilos.nota}>
                {ROTULO_CAT[i.categoria] ?? i.categoria}
                {CATEGORIAS_VETERINARIAS.includes(i.categoria) && !i.dose_recomendada ? ' — sem dose recomendada' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {registro && (
        <View style={estilos.quadroProduto}>
          <Text style={estilos.quadroTitulo}>{veioDaConsulta ? registro.nome : `${registro.nome} já está cadastrado`}</Text>
          <Text style={estilos.quadroEstoque}>
            Estoque{fazendaAtiva ? ` em ${fazendaAtiva.nome}` : ''}: {saldo === null ? '...' : textoSaldo(saldo, registro)}
          </Text>
          <Text style={estilos.nota}>{textoUnidades(registro)}</Text>
          {veterinario && <Text style={estilos.nota}>Dose recomendada: {textoDose(registro, registro.unidade) ?? 'NÃO INFORMADA'}</Text>}
          {custos.medio != null && (
            <Text style={estilos.nota}>
              Custo médio {formatarMoeda(custos.medio)} por {registro.unidade} · último {formatarMoeda(custos.ultimo)}
            </Text>
          )}
          {registro.estoque_minimo != null && saldo != null && saldo <= Number(registro.estoque_minimo) && (
            <Text style={[estilos.nota, { color: cores.erro, fontWeight: '700' }]}>Abaixo do estoque mínimo ({registro.estoque_minimo} {registro.unidade}): repor.</Text>
          )}
          {!parcial && <Text style={estilos.nota}>{incompleto ? 'Cadastro incompleto: complete o que falta abaixo e confirme o cadastro.' : 'Os dados abaixo vieram do cadastro. Se mudar algo, confirme a alteração.'}</Text>}
        </View>
      )}

      <Escolha rotulo="Categoria *" opcoes={opcoesCategoria} valor={categoria} aoMudar={mudarCategoria} erro={erros.categoria} />

      {!veioDaConsulta && veterinario && (
        <Escolha
          rotulo="Como cadastrar"
          opcoes={[
            { valor: 'completo', rotulo: 'Completo' },
            { valor: 'parcial', rotulo: 'Entrada parcial' },
          ]}
          valor={modo}
          aoMudar={mudarModo}
        />
      )}

      {parcial ? (
        <>
          {registro && <Text style={estilos.nota}>Produto já cadastrado: aqui só entram os frascos. Volume e dose vêm do cadastro (o que faltar lá é completado).</Text>}
          <EntradaParcial valor={par} aoMudar={setPar} categoria={categoria[0]} />
          {erros.parcial ? <Text style={estilos.erro}>{erros.parcial}</Text> : null}
        </>
      ) : (
        <>
          <UnidadesInsumo
            valor={un}
            aoMudar={(u) => {
              setUnidadeMexida(true);
              setUn(u);
            }}
            erro={erros.unidade}
          />
          {veterinario && (
            <>
              <Secao titulo="Uso veterinário" />
              <DadosUsoVeterinario valor={uso} aoMudar={setUso} unidade={un.consumo[0] ?? un.compra[0] ?? ''} erros={erros} />
              <Text style={estilos.nota}>Na Sanidade, a dose, os reforços e os medicamentos indicados para o diagnóstico vêm deste cadastro.</Text>
            </>
          )}
          <Secao titulo="Identificação" />
          <Campo rotulo="Fabricante / marca" value={fabricante} onChangeText={setFabricante} autoCapitalize="words" />
          <Campo rotulo="Código de barras / GTIN" value={codigoBarras} onChangeText={(t) => setCodigoBarras(t.replace(/[^\dA-Za-z]/g, ''))} keyboardType="number-pad" />
          {DEFS[categoria[0]] && <AtributosProduto categoria={categoria[0]} valor={atributos} aoMudar={setAtributos} />}
          <Secao titulo="Estoque" />
          <Campo
            rotulo={`Estoque mínimo${un.compra[0] ? ` (${nomeUnidade(un.compra[0])})` : ''} – alerta de reposição`}
            value={minimo}
            onChangeText={setMinimo}
            keyboardType="decimal-pad"
            placeholder="Opcional"
            erro={erros.minimo}
          />
          {registro && <Interruptor rotulo="Ativo" descricao="Inativos não aparecem para escolher em novas compras e aplicações." valor={ativo} aoMudar={setAtivo} />}
          {registro && fazendaAtiva && (
            <EstoqueInicial insumoId={registro.id} fazendaId={fazendaAtiva.id} fazendaNome={fazendaAtiva.nome} unidade={registro.unidade} aoMudar={() => atualizarSaldo(registro.id)} />
          )}
        </>
      )}

      {falhas.length > 0 && <Aviso tipo="erro" texto={falhas.length === 1 ? falhas[0] : `Falta corrigir:\n• ${falhas.join('\n• ')}`} />}
      <Botao titulo={tituloBotao} onPress={salvar} carregando={salvando} />
      {registro && !parcial && <Botao titulo="Excluir" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  erro: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.erro },
  sugestoes: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 6, marginTop: -4 },
  sugTitulo: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  sugItem: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: cores.borda },
  sugNome: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  quadroProduto: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 4 },
  quadroTitulo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura },
  quadroEstoque: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
});
