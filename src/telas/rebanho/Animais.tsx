import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Busca from '../../componentes/Busca';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Vazio from '../../componentes/Vazio';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { formatarNumero } from '../../lib/formatos';
import { CATEGORIAS, ROTULO_SITUACAO, codigoLote, idadeRotulo, identAnimal, nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const PAGINA = 50;

type AnimalLista = {
  id: string;
  numero_interno: number;
  brinco: string | null;
  nome: string | null;
  sexo: 'M' | 'F' | null;
  categoria: string | null;
  data_nascimento: string | null;
  nascimento_aproximado: boolean;
  situacao: string;
  raca: { nome: string } | null;
  lote: { numero: number } | null;
};

/** O que está sendo listado: um lote, uma categoria, os sem lote, os que saíram, ou uma busca. */
type Filtro =
  | { tipo: 'lote'; loteId: string }
  | { tipo: 'semLote' }
  | { tipo: 'categoria'; categoria: string | null; rotulo: string }
  | { tipo: 'sexo'; sexo: 'M' | 'F'; rotulo: string }
  | { tipo: 'saiu' };

type Resumo = { total: number; femeas: number; machos: number; semLote: number; saiu: number; porCategoria: Record<string, number> };

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const limpar = (t: string) => t.replace(/[,()*%\\]/g, '').trim();

export default function Animais() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'Animais'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);

  const filtroInicial: Filtro | null = params?.loteId ? { tipo: 'lote', loteId: params.loteId } : params?.semLote ? { tipo: 'semLote' } : null;
  const [filtro, setFiltro] = useState<Filtro | null>(filtroInicial);
  const [busca, setBusca] = useState('');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [itens, setItens] = useState<AnimalLista[] | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [lote, setLote] = useState<{ numero: number; descricao: string | null; categoria: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const fixo = !!filtroInicial; // veio de dentro de um lote ou de "sem lote"
  const termo = limpar(busca);
  const listando = !!filtro || termo.length > 0;

  useLayoutEffect(() => {
    const titulo =
      filtro?.tipo === 'lote' ? (lote ? nomeLote(lote, sigla) : 'Animais do lote') : filtro?.tipo === 'semLote' && fixo ? 'Animais sem lote' : 'Animais';
    navegacao.setOptions({ title: titulo });
  }, [navegacao, filtro, lote, sigla, fixo]);

  // ---- resumo (só com as colunas necessárias para contar) ----
  const carregarResumo = useCallback(async () => {
    if (!fid) return;
    try {
      const [ativos, saiu] = await Promise.all([
        consulta<{ sexo: string | null; categoria: string | null; lote_id: string | null }[]>(
          supabase.from('animais').select('sexo, categoria, lote_id').eq('fazenda_id', fid).eq('situacao', 'ativo'),
        ),
        supabase.from('animais').select('id', { count: 'exact', head: true }).eq('fazenda_id', fid).neq('situacao', 'ativo'),
      ]);
      const r: Resumo = { total: ativos.length, femeas: 0, machos: 0, semLote: 0, saiu: saiu.count ?? 0, porCategoria: {} };
      for (const a of ativos) {
        if (a.sexo?.trim() === 'F') r.femeas++;
        if (a.sexo?.trim() === 'M') r.machos++;
        if (!a.lote_id) r.semLote++;
        const c = a.categoria ?? '';
        r.porCategoria[c] = (r.porCategoria[c] ?? 0) + 1;
      }
      setResumo(r);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);

  // ---- lista (no banco, de 50 em 50) ----
  const montarConsulta = useCallback(
    (inicio: number) => {
      let q = supabase
        .from('animais')
        .select(
          'id, numero_interno, brinco, nome, sexo, categoria, data_nascimento, nascimento_aproximado, situacao,' +
            ' raca:racas ( nome ), lote:lotes!animais_lote_id_fkey ( numero )',
        )
        .eq('fazenda_id', fid!);

      if (filtro?.tipo === 'saiu') q = q.neq('situacao', 'ativo');
      else if (!(termo && !filtro)) q = q.eq('situacao', 'ativo'); // busca livre procura em todos

      if (filtro?.tipo === 'lote') q = q.eq('lote_id', filtro.loteId);
      if (filtro?.tipo === 'semLote') q = q.is('lote_id', null);
      if (filtro?.tipo === 'categoria') q = filtro.categoria ? q.eq('categoria', filtro.categoria) : q.is('categoria', null);
      if (filtro?.tipo === 'sexo') q = q.eq('sexo', filtro.sexo);

      if (termo) {
        const partes = [`brinco.ilike.*${termo}*`, `nome.ilike.*${termo}*`];
        if (/^\d+$/.test(termo)) partes.unshift(`numero_interno.eq.${termo}`);
        q = q.or(partes.join(','));
      }
      return q.order('numero_interno').range(inicio, inicio + PAGINA - 1);
    },
    [fid, filtro, termo],
  );

  const carregarLista = useCallback(async () => {
    if (!fid || !listando) return;
    setErro(null);
    try {
      const dados = await consulta<any[]>(montarConsulta(0));
      setItens(dados.map((a) => ({ ...a, raca: um(a.raca), lote: um(a.lote) })));
      setTemMais(dados.length === PAGINA);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid, listando, montarConsulta]);

  async function mostrarMais() {
    if (!itens) return;
    setCarregandoMais(true);
    try {
      const dados = await consulta<any[]>(montarConsulta(itens.length));
      setItens([...itens, ...dados.map((a) => ({ ...a, raca: um(a.raca), lote: um(a.lote) }))]);
      setTemMais(dados.length === PAGINA);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setCarregandoMais(false);
  }

  // Dados do lote (título e categoria, para não repetir na lista).
  useEffect(() => {
    if (filtro?.tipo !== 'lote') return;
    supabase.from('lotes').select('numero, descricao, categoria').eq('id', filtro.loteId).single().then(({ data }) => setLote(data));
  }, [filtro]);

  // Busca espera a pessoa parar de digitar.
  useEffect(() => {
    if (!listando) {
      setItens(null);
      return;
    }
    setItens(null);
    const t = setTimeout(carregarLista, termo ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregarLista, listando, termo]);

  // Ao voltar de um cadastro, relê o resumo e a lista que estava aberta.
  const recarregarRef = useRef<() => void>(() => {});
  recarregarRef.current = () => {
    if (!fixo) carregarResumo();
    if (listando) carregarLista();
  };
  const primeiraVez = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeiraVez.current) {
        primeiraVez.current = false;
        if (!fixo) carregarResumo();
        return;
      }
      recarregarRef.current();
    }, [fixo, carregarResumo]),
  );

  // ---- telas ----
  const linhaDoAnimal = (a: AnimalLista) => {
    const categoriaRepetida = filtro?.tipo === 'lote' && lote?.categoria && a.categoria === lote.categoria;
    const descricao = [
      categoriaRepetida ? null : a.categoria ?? (a.sexo === 'F' ? 'Fêmea' : a.sexo === 'M' ? 'Macho' : null),
      a.raca?.nome,
      idadeRotulo(a.data_nascimento, a.nascimento_aproximado),
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <Linha
        key={a.id}
        titulo={[identAnimal(a), a.nome].filter(Boolean).join('  ')}
        linhas={[
          descricao || null,
          filtro?.tipo !== 'lote' ? (a.lote ? codigoLote(a.lote.numero, sigla) : 'Sem lote') : null,
          a.situacao !== 'ativo' ? ROTULO_SITUACAO[a.situacao] : null,
        ]}
        onPress={() => navegacao.navigate('AnimalForm', { id: a.id })}
      />
    );
  };

  const tituloFiltro =
    filtro?.tipo === 'categoria' || filtro?.tipo === 'sexo'
      ? filtro.rotulo
      : filtro?.tipo === 'semLote'
        ? 'Sem lote'
        : filtro?.tipo === 'saiu'
          ? 'Fora do rebanho'
          : null;

  const ordemCategorias = [...CATEGORIAS.F, ...CATEGORIAS.M];
  const categorias = resumo
    ? (Object.entries(resumo.porCategoria) as [string, number][]).sort(
        ([a], [b]) => (ordemCategorias.indexOf(a) + 100) % 100 - ((ordemCategorias.indexOf(b) + 100) % 100),
      )
    : [];

  return (
    <Tela>
      <Botao titulo="Cadastrar animal" onPress={() => navegacao.navigate('AnimalForm', { loteId: filtro?.tipo === 'lote' ? filtro.loteId : undefined })} />
      <Busca valor={busca} aoMudar={setBusca} dica="Buscar por número, brinco ou nome" />
      {erro && <Aviso tipo="erro" texto={erro} />}

      {tituloFiltro && !fixo && (
        <View style={estilos.filtro}>
          <Text style={estilos.filtroTexto}>Mostrando: {tituloFiltro}</Text>
          <Botao titulo="Voltar ao resumo" tipo="texto" onPress={() => { setFiltro(null); setBusca(''); }} />
        </View>
      )}

      {!listando ? (
        // ---------- RESUMO ----------
        resumo === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 24 }} />
        ) : resumo.total === 0 && resumo.saiu === 0 ? (
          <Vazio icone="paw-outline" texto='Nenhum animal cadastrado ainda. Abra um lote com a quantidade de cabeças ou toque em "Cadastrar animal".' />
        ) : (
          <>
            <View style={estilos.cartao}>
              <Text style={estilos.total}>{formatarNumero(resumo.total)}</Text>
              <Text style={estilos.totalRotulo}>{resumo.total === 1 ? 'animal no rebanho' : 'animais no rebanho'}</Text>
            </View>
            <Lista>
              <Linha titulo="Fêmeas" direita={formatarNumero(resumo.femeas)} onPress={() => setFiltro({ tipo: 'sexo', sexo: 'F', rotulo: 'Fêmeas' })} />
              <Linha titulo="Machos" direita={formatarNumero(resumo.machos)} onPress={() => setFiltro({ tipo: 'sexo', sexo: 'M', rotulo: 'Machos' })} />
            </Lista>
            <Text style={estilos.secao}>Por categoria</Text>
            <Lista>
              {categorias.map(([cat, n]) => (
                <Linha
                  key={cat || 'sem'}
                  titulo={cat || 'Sem categoria'}
                  direita={formatarNumero(n)}
                  onPress={() => setFiltro({ tipo: 'categoria', categoria: cat || null, rotulo: cat || 'Sem categoria' })}
                />
              ))}
            </Lista>
            <Lista>
              <Linha titulo="Por lote" linhas={['Abre a consulta de lotes']} onPress={() => navegacao.navigate('LoteForm', { aba: 'consultar' })} />
              {resumo.semLote > 0 && <Linha titulo="Sem lote" direita={formatarNumero(resumo.semLote)} onPress={() => setFiltro({ tipo: 'semLote' })} />}
              {resumo.saiu > 0 && (
                <Linha titulo="Fora do rebanho" linhas={['Vendidos, mortos, saída de parceria']} direita={formatarNumero(resumo.saiu)} onPress={() => setFiltro({ tipo: 'saiu' })} />
              )}
            </Lista>
          </>
        )
      ) : (
        // ---------- LISTA ----------
        <>
          {itens === null ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 24 }} />
          ) : itens.length === 0 ? (
            <Vazio icone="search-outline" texto={termo ? `Nenhum animal com "${termo}".` : 'Nenhum animal aqui.'} />
          ) : (
            <>
              <Lista>{itens.map(linhaDoAnimal)}</Lista>
              {temMais && <Botao titulo="Mostrar mais" tipo="secundario" onPress={mostrarMais} carregando={carregandoMais} />}
              <Text style={estilos.contagem}>
                Mostrando {formatarNumero(itens.length)}
                {temMais ? '. Use a busca para ir direto a um animal.' : '.'}
              </Text>
            </>
          )}
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, alignItems: 'flex-start' },
  total: { fontSize: 40, fontWeight: '800', color: cores.primariaEscura },
  totalRotulo: { fontSize: tam.texto, color: cores.textoSuave },
  secao: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura, marginTop: 4 },
  filtro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filtroTexto: { fontSize: tam.texto, fontWeight: '600', color: cores.texto, flexShrink: 1 },
  contagem: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
});
