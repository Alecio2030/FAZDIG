import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import Escolha from '../../componentes/Escolha';
import { ADM, TODAS, filtrarUnidade, nomeUnidade, opcoesFiltroUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { ROTULO_CAT_IMOB, ROTULO_METODO, calcular, quotaDoMes, somarMes, textoMes } from '../../lib/imobilizado';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const CAMPOS = '*, rateio:imobilizado_rateios ( percentual, centro:centros_custo ( codigo, nome ) ), alocacoes:imobilizado_alocacoes ( data, de_fazenda_id, para_fazenda_id )';

/** Onde o bem estava no fim de um mês (aaaa-mm), pelo histórico de transferências. */
function fazendaNoMes(b: any, mes: string): string | null {
  const al = ((b.alocacoes as any[]) ?? []).slice().sort((x, y) => (x.data < y.data ? -1 : 1));
  if (!al.length) return b.fazenda_id ?? null;
  const fim = `${mes}-31`;
  const ate = al.filter((x) => x.data <= fim);
  return ate.length ? ate[ate.length - 1].para_fazenda_id ?? null : al[0].de_fazenda_id ?? null;
}
const daUnidade = (faz: string | null, und: string) => und === TODAS || (und === ADM ? !faz : faz === und);
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
type Relacao = 'bens' | 'formacao' | 'mes';

/** Consulta do imobilizado: pelo nome, código ou nº; bens e valor contábil; depreciação/exaustão do mês por centro. Só mostra. */
export default function ConsultaImobilizado() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  // O imobilizado é do Grupo: aparecem todos os bens; o filtro mostra onde cada um está alocado.
  const [unidade, setUnidade] = useState<string[]>([TODAS]);
  const und = unidade[0];
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<any[] | null>(null);
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [bens, setBens] = useState<any[] | null>(null);
  const [mes, setMes] = useState(hojeBanco().slice(0, 7));
  const [erro, setErro] = useState<string | null>(null);
  const termo = limparBusca(busca);
  const hoje = hojeBanco();

  useEffect(() => {
    if (!fid || !termo) return setAchados(null);
    const t = setTimeout(async () => {
      try {
        const partes = [`nome.ilike.*${termo}*`, `codigo_patrimonial.ilike.*${termo}*`, `descricao.ilike.*${termo}*`];
        if (/^\d+$/.test(termo)) partes.unshift(`numero.eq.${termo}`);
        setAchados(await consulta<any[]>(filtrarUnidade(supabase.from('imobilizados').select(CAMPOS).or(partes.join(',')), und).order('numero').limit(30)));
      } catch (e) {
        setErro(traduzirErro(e));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [fid, termo, und]);

  useFocusEffect(
    useCallback(() => {
      if (!fid || !relacao) return;
      consulta<any[]>(supabase.from('imobilizados').select(CAMPOS).order('numero'))
        .then(setBens)
        .catch((e) => setErro(traduzirErro(e)));
    }, [fid, relacao]),
  );

  const linha = (b: any) => {
    if (b.situacao === 'formacao') {
      // V152: bem em formação: o custo vai sendo somado pelo centro de custo dele
      return (
        <Linha
          key={b.id}
          titulo={`Nº ${b.numero} · ${b.nome}`}
          linhas={[
            `${ROTULO_CAT_IMOB[b.categoria] ?? b.categoria}${b.codigo_patrimonial ? ` · ${b.codigo_patrimonial}` : ''}`,
            `EM FORMAÇÃO desde ${doBanco(b.formacao_inicio ?? b.data_ativacao)}`,
            `Alocado em: ${nomeUnidade(b.fazenda_id, fazendas)}`,
          ]}
          direita="em formação"
          onPress={() => navegacao.navigate('ImobilizadoDetalhe', { id: b.id })}
        />
      );
    }
    const c = calcular(b, hoje);
    return (
      <Linha
        key={b.id}
        titulo={`Nº ${b.numero} · ${b.nome}`}
        inativo={b.situacao === 'baixado'}
        linhas={[
          `${ROTULO_CAT_IMOB[b.categoria] ?? b.categoria} · ${ROTULO_METODO[b.metodo]} ${formatarMoeda(c.mensal)}/mês`,
          `Aquisição ${formatarMoeda(c.valor)} · acumulado ${formatarMoeda(c.acumulado)}`,
          b.situacao === 'baixado' ? 'Baixado' : c.encerrado ? 'Totalmente depreciado' : null,
          `Alocado em: ${nomeUnidade(b.fazenda_id, fazendas)}`,
        ]}
        direita={formatarMoeda(c.contabil)}
        onPress={() => navegacao.navigate('ImobilizadoDetalhe', { id: b.id })}
      />
    );
  };

  function PainelMes() {
    if (!bens) return <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;
    // no mês, vale onde o bem estava naquele mês (transferências)
    const itens = bens.filter((b) => daUnidade(fazendaNoMes(b, mes), und)).map((b) => ({ b, q: quotaDoMes(b, mes) })).filter((x) => x.q > 0);
    const total = itens.reduce((s, x) => s + x.q, 0);
    const porCentro: Record<string, number> = {};
    for (const { b, q } of itens) {
      for (const r of b.rateio as any[]) {
        const c = um(r.centro);
        const k = `${c?.codigo ?? ''} ${c?.nome ?? 'Sem centro'}`.trim();
        porCentro[k] = (porCentro[k] ?? 0) + (q * Number(r.percentual)) / 100;
      }
    }
    const dep = itens.filter((x) => x.b.metodo === 'depreciacao').reduce((s, x) => s + x.q, 0);
    return (
      <>
        <View style={estilos.mes}>
          <Pressable onPress={() => setMes(somarMes(mes, -1))} hitSlop={10} accessibilityLabel="Mês anterior">
            <Ionicons name="chevron-back" size={28} color={cores.primaria} />
          </Pressable>
          <Text style={estilos.mesTexto}>{textoMes(mes)}</Text>
          <Pressable onPress={() => setMes(somarMes(mes, 1))} hitSlop={10} accessibilityLabel="Próximo mês">
            <Ionicons name="chevron-forward" size={28} color={cores.primaria} />
          </Pressable>
        </View>
        <View style={estilos.caixa}>
          <Par a="Depreciação" b={formatarMoeda(dep)} />
          <Par a="Exaustão" b={formatarMoeda(total - dep)} />
          <Par a="Total do mês" b={formatarMoeda(total)} forte />
        </View>
        <Secao titulo="Por centro de custo" />
        <View style={estilos.caixa}>
          {Object.keys(porCentro).length === 0 ? <Text style={estilos.dica}>Nada neste mês.</Text> : Object.entries(porCentro).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Par key={k} a={k} b={formatarMoeda(v)} />)}
        </View>
        <Secao titulo="Por bem" />
        <View style={estilos.caixa}>
          {itens.length === 0 ? <Text style={estilos.dica}>Nada neste mês.</Text> : itens.map(({ b, q }) => <Par key={b.id} a={`Nº ${b.numero} ${b.nome}`} b={formatarMoeda(q)} />)}
        </View>
      </>
    );
  }

  const RELACOES: { valor: Relacao; rotulo: string }[] = [
    { valor: 'bens', rotulo: 'Bens e valor contábil' },
    { valor: 'formacao', rotulo: 'Bens em formação (lavouras, obras e benfeitorias)' },
    { valor: 'mes', rotulo: 'Depreciação e exaustão do mês (por centro de custo)' },
  ];

  return (
    <>
      <Escolha rotulo="Onde está alocado" opcoes={opcoesFiltroUnidade(fazendas)} valor={unidade} aoMudar={setUnidade} />
      <Busca valor={busca} aoMudar={(t) => { setBusca(t); if (t) setRelacao(null); }} dica="Nome, código patrimonial ou nº do bem" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {termo ? (
        achados === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        ) : achados.length === 0 ? (
          <Text style={estilos.dica}>Nenhum bem com "{termo}".</Text>
        ) : (
          <Lista>{achados.map(linha)}</Lista>
        )
      ) : relacao ? (
        <>
          <Secao titulo={RELACOES.find((r) => r.valor === relacao)!.rotulo} />
          {relacao === 'mes' ? (
            <PainelMes />
          ) : relacao === 'formacao' ? (
            !bens ? (
              <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
            ) : !bens.some((b) => b.situacao === 'formacao' && daUnidade(b.fazenda_id, und)) ? (
              <Text style={estilos.dica}>Nenhum bem em formação.</Text>
            ) : (
              <Lista>{bens.filter((b) => b.situacao === 'formacao' && daUnidade(b.fazenda_id, und)).map(linha)}</Lista>
            )
          ) : !bens ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
          ) : !bens.some((b) => daUnidade(b.fazenda_id, und)) ? (
            <Text style={estilos.dica}>Nenhum bem {und === TODAS ? 'cadastrado' : 'alocado aqui'}.</Text>
          ) : (
            <>
              <View style={estilos.caixa}>
                <Par a="Valor de aquisição" b={formatarMoeda(bens.filter((b) => b.situacao === 'ativo' && daUnidade(b.fazenda_id, und)).reduce((s, b) => s + Number(b.valor_aquisicao), 0))} />
                <Par a="Valor contábil hoje" b={formatarMoeda(bens.filter((b) => b.situacao === 'ativo' && daUnidade(b.fazenda_id, und)).reduce((s, b) => s + calcular(b, hoje).contabil, 0))} forte />
              </View>
              <Lista>{bens.filter((b) => b.situacao !== 'formacao' && daUnidade(b.fazenda_id, und)).map(linha)}</Lista>
            </>
          )}
          <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />
        </>
      ) : (
        <View style={{ gap: 10 }}>
          {RELACOES.map((r) => (
            <Botao key={r.valor} titulo={r.rotulo} tipo="secundario" onPress={() => setRelacao(r.valor)} />
          ))}
        </View>
      )}
    </>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '800', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
  mes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  mesTexto: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura, minWidth: 120, textAlign: 'center' },
});
