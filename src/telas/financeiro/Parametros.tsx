import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import RateioCentros, { rateioDoBanco, rateioInicial, validarRateio, type LinhaRateio } from '../../componentes/RateioCentros';
import { useSessao } from '../../contexto/SessaoContext';
import { carregarParametros, salvarParametros, type Parametro } from '../../lib/parametros';
import { CHAVE_DEPRECIACAO, CHAVE_GERAL, guardarRateioPadrao, padroesDaUnidade } from '../../lib/rateioPadrao';
import { listaTiposDespesa } from '../../lib/classificacao';
import { ADM, NOME_ADM, centroDaUnidade, idUnidade, nomeUnidade, opcoesUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { cores, tam } from '../../tema';

type Edicao = Record<string, string>;
type Bloco = { chave: string; titulo: string; linhas: LinhaRateio[]; guardado: boolean };

const TITULO_CHAVE: Record<string, string> = {
  [CHAVE_GERAL]: 'Geral: qualquer despesa sem centro específico',
  [CHAVE_DEPRECIACAO]: 'Depreciação de bens sem rateio próprio',
};

/**
 * V174: Financeiro › Parâmetros. Os valores usuais já vêm preenchidos; o operador muda só o que for diferente.
 * - Imobilizado: vida útil e valor residual de cada categoria (sugeridos ao cadastrar o bem).
 * - Rateio padrão da unidade: os centros e % que as despesas sem centro específico já trazem prontos.
 */
export default function Parametros() {
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const podeMudar = !!fazendaAtiva && ['dono', 'admin', 'escritorio'].includes(fazendaAtiva.perfil);
  const naoParticular = fazendas.filter((f) => f.tipo !== 'particular');

  // ---------- parâmetros numéricos ----------
  const [params, setParams] = useState<Parametro[] | null>(null);
  const [ed, setEd] = useState<Edicao>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const m = await carregarParametros(true);
    const l = Object.values(m).sort((a, b) => a.ordem - b.ordem);
    setParams(l);
    setEd(Object.fromEntries(l.map((p) => [p.chave, p.valor == null ? '' : numeroParaCampo(p.valor)])));
  }, []);
  useEffect(() => {
    carregar().catch((e) => setErro(traduzirErro(e)));
  }, [carregar]);

  // Imobilizado: uma linha por categoria, com vida útil e residual lado a lado
  const categorias = useMemo(() => {
    const l = (params ?? []).filter((p) => p.grupo === 'Imobilizado' && p.chave.startsWith('vida_'));
    return l.map((v) => ({ cat: v.chave.slice(5), rotulo: v.rotulo, vida: v, resid: (params ?? []).find((p) => p.chave === `resid_${v.chave.slice(5)}`) }));
  }, [params]);

  // V175: os outros grupos (Pecuária...), um campo por parâmetro
  const outros = useMemo(() => {
    const m = new Map<string, Parametro[]>();
    for (const x of params ?? []) if (x.grupo !== 'Imobilizado') m.set(x.grupo, [...(m.get(x.grupo) ?? []), x]);
    return [...m.entries()];
  }, [params]);

  async function gravarParametros() {
    if (!params) return;
    setErro(null);
    setAviso(null);
    const mudou = params
      .map((p) => ({ chave: p.chave, valor: ed[p.chave]?.trim() ? lerNumero(ed[p.chave]) : null, antes: p.valor }))
      .filter((x) => x.valor !== x.antes);
    if (mudou.some((x) => x.valor != null && (Number.isNaN(x.valor) || x.valor < 0))) return setErro('Há valor inválido.');
    if (!mudou.length) return setAviso('Nada mudou.');
    setSalvando(true);
    try {
      const n = await salvarParametros(mudou.map(({ chave, valor }) => ({ chave, valor })));
      await carregar();
      setAviso(`${n} ${n === 1 ? 'parâmetro gravado' : 'parâmetros gravados'}. Vale para os próximos cadastros.`);
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setSalvando(false);
    }
  }

  // ---------- rateio padrão ----------
  const [unidade, setUnidade] = useState<string>(modoAdm ? ADM : fazendaAtiva && fazendaAtiva.tipo !== 'particular' ? fazendaAtiva.id : ADM);
  const [blocos, setBlocos] = useState<Bloco[] | null>(null);
  const [nomesTipo, setNomesTipo] = useState<Record<string, string>>({});
  const [novoTipo, setNovoTipo] = useState<string | null>(null);
  const [erroR, setErroR] = useState<string | null>(null);
  const [avisoR, setAvisoR] = useState<string | null>(null);
  const [gravandoR, setGravandoR] = useState<string | null>(null);

  const carregarRateios = useCallback(async () => {
    setBlocos(null);
    const [m, tipos] = await Promise.all([padroesDaUnidade(idUnidade(unidade)), listaTiposDespesa().catch(() => [] as ItemLista[])]);
    const nomes = Object.fromEntries(tipos.map((t) => [t.id, t.titulo]));
    setNomesTipo(nomes);
    const chaves = [CHAVE_GERAL, CHAVE_DEPRECIACAO, ...Object.keys(m).filter((k) => k !== CHAVE_GERAL && k !== CHAVE_DEPRECIACAO).sort((a, b) => (nomes[a] ?? a).localeCompare(nomes[b] ?? b))];
    setBlocos(
      chaves.map((k) => ({
        chave: k,
        titulo: TITULO_CHAVE[k] ?? nomes[k] ?? k,
        linhas: m[k]?.length ? rateioDoBanco(m[k]) : rateioInicial(),
        guardado: !!m[k]?.length,
      })),
    );
  }, [unidade]);
  useEffect(() => {
    carregarRateios().catch((e) => setErroR(traduzirErro(e)));
  }, [carregarRateios]);

  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, idUnidade(unidade))).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [unidade]);

  async function gravarBloco(b: Bloco, apagar = false) {
    setErroR(null);
    setAvisoR(null);
    const v = validarRateio(b.linhas, !apagar);
    if (!apagar && v.erro) return setErroR(`${b.titulo}: ${v.erro}`);
    setGravandoR(b.chave);
    try {
      await guardarRateioPadrao(idUnidade(unidade), b.chave, apagar ? [] : v.rateio);
      setAvisoR(apagar ? `Padrão "${b.titulo}" apagado.` : `Padrão "${b.titulo}" gravado.`);
      await carregarRateios();
    } catch (e) {
      setErroR(traduzirErro(e));
    } finally {
      setGravandoR(null);
    }
  }

  function incluirTipo(t: string | null) {
    setNovoTipo(null);
    if (!t || !blocos || blocos.some((b) => b.chave === t)) return;
    setBlocos([...blocos, { chave: t, titulo: nomesTipo[t] ?? t, linhas: rateioInicial(), guardado: false }]);
  }

  const nomeU = unidade === ADM ? NOME_ADM : nomeUnidade(idUnidade(unidade), fazendas);

  return (
    <Tela>
      {!podeMudar && <Aviso tipo="info" texto="Só o Produtor, o Administrador ou o Escritório mudam os parâmetros. Aqui você só vê os valores em uso." />}

      <Secao titulo="Rateio padrão" />
      <Text style={estilos.nota}>
        Quando uma despesa não tem centro de custo específico, a tela já abre com estes centros e %. Na primeira vez que uma despesa é lançada, o rateio informado fica guardado aqui sozinho. O de "Depreciação" vale para os bens do Imobilizado que não têm rateio próprio.
      </Text>
      <Escolha rotulo="Unidade" opcoes={opcoesUnidade(naoParticular)} valor={[unidade]} aoMudar={(v) => setUnidade(v[0])} />
      {erroR && <Aviso tipo="erro" texto={erroR} />}
      {avisoR && <Aviso tipo="sucesso" texto={avisoR} />}
      {!blocos ? (
        <ActivityIndicator color={cores.primaria} />
      ) : (
        <>
          {blocos.map((b) => (
            <View key={b.chave} style={estilos.cartao}>
              <Text style={estilos.cartaoTitulo}>{b.titulo}</Text>
              {!b.guardado && <Text style={estilos.nota}>Ainda sem padrão em {nomeU}.</Text>}
              <RateioCentros
                linhas={b.linhas}
                aoMudar={(l) => setBlocos((x) => (x ?? []).map((y) => (y.chave === b.chave ? { ...y, linhas: l } : y)))}
                carregar={carregarCentros}
                vazio="Nenhum centro de custo nesta unidade."
              />
              {podeMudar && (
                <View style={estilos.botoes}>
                  <View style={{ flex: 1 }}>
                    <Botao titulo="Gravar" tipo="secundario" carregando={gravandoR === b.chave} onPress={() => gravarBloco(b)} />
                  </View>
                  {b.guardado && (
                    <View style={{ flex: 1 }}>
                      <Botao titulo="Apagar" tipo="perigo" onPress={() => gravarBloco(b, true)} />
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
          {podeMudar && (
            <SeletorLista rotulo="+ Padrão para um tipo de despesa" valorId={novoTipo} aoMudar={incluirTipo} carregar={listaTiposDespesa} dicaBusca="Ex.: energia, salários" />
          )}
        </>
      )}

      <Secao titulo="Imobilizado: vida útil e valor residual usuais" />
      <Text style={estilos.nota}>Sugeridos ao cadastrar um bem (cada bem pode ter os seus). Em branco, vale o usual, mostrado no campo. Não muda os bens já cadastrados.</Text>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {!params ? (
        <ActivityIndicator color={cores.primaria} />
      ) : !categorias.length ? (
        <Aviso tipo="erro" texto="O banco ainda não tem os parâmetros da V174. Me avise." />
      ) : (
        <>
          {categorias.map((c) => (
            <View key={c.cat} style={estilos.linhaCat}>
              <Text style={estilos.cat}>{c.rotulo}</Text>
              <View style={{ width: 92 }}>
                <Campo
                  rotulo="Vida (anos)"
                  value={ed[c.vida.chave] ?? ''}
                  onChangeText={(t) => setEd((x) => ({ ...x, [c.vida.chave]: t }))}
                  placeholder={formatarNumero(c.vida.valor_padrao, 1)}
                  keyboardType="decimal-pad"
                  editable={podeMudar}
                />
              </View>
              {c.resid && (
                <View style={{ width: 92 }}>
                  <Campo
                    rotulo="Residual %"
                    value={ed[c.resid.chave] ?? ''}
                    onChangeText={(t) => setEd((x) => ({ ...x, [c.resid!.chave]: t }))}
                    placeholder={formatarNumero(c.resid.valor_padrao, 1)}
                    keyboardType="decimal-pad"
                    editable={podeMudar}
                  />
                </View>
              )}
            </View>
          ))}
          {outros.map(([grupo, lista]) => (
            <View key={grupo} style={{ gap: 8 }}>
              <Secao titulo={grupo} />
              {lista.map((p) => (
                <Campo
                  key={p.chave}
                  rotulo={`${p.rotulo}${p.unidade ? ` (${p.unidade})` : ''}`}
                  value={ed[p.chave] ?? ''}
                  onChangeText={(t) => setEd((x) => ({ ...x, [p.chave]: t }))}
                  placeholder={formatarNumero(p.valor_padrao, 2)}
                  keyboardType="decimal-pad"
                  editable={podeMudar}
                  ajuda={p.ajuda ?? undefined}
                />
              ))}
            </View>
          ))}
          {podeMudar && <Botao titulo="Gravar os parâmetros" carregando={salvando} onPress={gravarParametros} />}
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  cartaoTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  botoes: { flexDirection: 'row', gap: 10 },
  linhaCat: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cores.borda, paddingBottom: 6 },
  cat: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, paddingBottom: 14 },
});
