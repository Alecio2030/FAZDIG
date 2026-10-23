import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { textoSacas } from '../../lib/posColheita';
import { CAMPOS_POSICAO, posicoes } from '../../lib/armazem';
import { cotacaoReferencia, lerCotacoes, type Cotacao } from '../../lib/cotacoes';
import { ROTULO_SITUACAO_CONTRATO, ROTULO_TIPO_CONTRATO, aCompensar, diasParaEntrega, lerContratos, saldoSacas, textoPrazo, textoPreco, type ContratoCafe } from '../../lib/contratosCafe';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/**
 * Contratos de café (aba do Armazém): venda futura e troca por insumos.
 * Mostra o café comprometido x livre, o preço dos contratos contra a cotação do dia e os contratos, com alerta de vencimento.
 */
export default function ContratosCafeAba({ abas }: { abas: React.ReactNode }) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [contratos, setContratos] = useState<ContratoCafe[] | null>(null);
  const [estoque, setEstoque] = useState(0);
  const [cots, setCots] = useState<Cotacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      (async () => {
        try {
          const [cs, movs] = await Promise.all([lerContratos(fid), consulta<any[]>(supabase.from('cafe_movimentos').select(CAMPOS_POSICAO).eq('fazenda_id', fid).limit(10000))]);
          setContratos(cs);
          setEstoque(posicoes(movs).reduce((t, p) => t + p.saldo, 0));
          lerCotacoes().then(setCots).catch(() => setCots([]));
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid]),
  );

  const abertos = (contratos ?? []).filter((c) => c.situacao === 'aberto');
  const outros = (contratos ?? []).filter((c) => c.situacao !== 'aberto');
  const comprometido = abertos.reduce((t, c) => t + saldoSacas(c), 0);
  const livre = estoque - comprometido;
  const vencidos = abertos.filter((c) => diasParaEntrega(c) < 0);
  const proximos = abertos.filter((c) => diasParaEntrega(c) >= 0 && diasParaEntrega(c) <= 15);
  const cot = cotacaoReferencia(cots, null);
  // valor dos contratos de preço fixo x o mesmo café pela cotação de hoje
  const fixos = abertos.filter((c) => c.preco_tipo === 'fixo' && c.preco != null);
  const sacasFixas = fixos.reduce((t, c) => t + saldoSacas(c), 0);
  const valorContrato = fixos.reduce((t, c) => t + saldoSacas(c) * (c.preco ?? 0), 0);
  const valorCotacao = cot ? fixos.reduce((t, c) => t + saldoSacas(c) * (cotacaoReferencia(cots, c.cafe_tipo)?.preco ?? cot.preco), 0) : null;

  const linha = (c: ContratoCafe) => {
    const comp = aCompensar(c);
    return (
      <Linha
        key={c.id}
        titulo={`Nº ${c.numero} · ${c.pessoa_nome}`}
        linhas={[
          `${ROTULO_TIPO_CONTRATO[c.tipo]} · ${textoSacas(c.sacas)} · ${textoPreco(c)}`,
          c.situacao === 'aberto' ? `Faltam ${textoSacas(saldoSacas(c))} · entrega até ${doBanco(c.data_entrega)} (${textoPrazo(c)})` : `${ROTULO_SITUACAO_CONTRATO[c.situacao]} · entregue ${textoSacas(c.entregue)}`,
          c.situacao === 'aberto' && comp > 0 ? (c.tipo === 'troca' ? `Compra nº ${c.compra_numero ?? ''}: ${formatarMoeda(comp)} a quitar em café` : `Adiantamento a compensar: ${formatarMoeda(comp)}`) : null,
        ]}
        onPress={() => navegacao.navigate('ContratoCafeDetalhe', { id: c.id })}
      />
    );
  };

  return (
    <Tela>
      {abas}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {contratos === null ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          {vencidos.length > 0 && (
            <Aviso tipo="erro" texto={`${vencidos.length === 1 ? '1 contrato com a entrega vencida' : `${vencidos.length} contratos com a entrega vencida`}: ${vencidos.map((c) => `nº ${c.numero} (${c.pessoa_nome}, ${textoSacas(saldoSacas(c))})`).join('; ')}.`} />
          )}
          {proximos.length > 0 && (
            <Aviso tipo="info" texto={`Entrega nos próximos 15 dias: ${proximos.map((c) => `nº ${c.numero} até ${doBanco(c.data_entrega)} (${textoSacas(saldoSacas(c))})`).join('; ')}.`} />
          )}

          <View style={estilos.caixa}>
            <Par a="Café em estoque" b={textoSacas(estoque)} />
            <Par a="Comprometido em contratos" b={textoSacas(comprometido)} />
            <Par a={livre >= 0 ? 'Livre para vender' : 'Falta café para cumprir os contratos'} b={textoSacas(Math.abs(livre))} forte erro={livre < 0} />
            {livre < 0 && <Text style={estilos.nota}>O café ainda por colher ou por beneficiar não está no estoque: confira se a safra cobre o que falta.</Text>}
          </View>

          {sacasFixas > 0 && (
            <View style={estilos.caixa}>
              <Par a={`Contratos de preço fixo (${textoSacas(sacasFixas)} a entregar)`} b={formatarMoeda(valorContrato)} />
              {valorCotacao != null && cot ? (
                <>
                  <Par a={`O mesmo café pela cotação de ${doBanco(cot.data)}`} b={formatarMoeda(valorCotacao)} />
                  <Par a={valorContrato >= valorCotacao ? 'Os contratos estão acima da cotação em' : 'Os contratos estão abaixo da cotação em'} b={formatarMoeda(Math.abs(valorContrato - valorCotacao))} forte erro={valorContrato < valorCotacao} />
                </>
              ) : (
                <Text style={estilos.nota}>Sem cotação do dia para comparar. Veja a aba Cotação.</Text>
              )}
            </View>
          )}

          <Botao titulo="+ Novo contrato" onPress={() => navegacao.navigate('ContratoCafeForm', {})} />

          <Secao titulo="Contratos abertos" />
          {abertos.length === 0 ? <Text style={estilos.nota}>Nenhum contrato aberto. Venda futura: o café é entregue depois, a preço fixo ou a fixar. Troca: a compra de insumos é paga em sacas de café.</Text> : <Lista>{abertos.map(linha)}</Lista>}

          {outros.length > 0 &&
            (verTodos ? (
              <>
                <Secao titulo="Concluídos e cancelados" />
                <Lista>{outros.slice(0, 100).map(linha)}</Lista>
              </>
            ) : (
              <Botao titulo={`Ver concluídos e cancelados (${outros.length})`} tipo="texto" onPress={() => setVerTodos(true)} />
            ))}
        </>
      )}
    </Tela>
  );
}

function Par({ a, b, forte, erro }: { a: string; b: string; forte?: boolean; erro?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '700', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: erro ? cores.erro : cores.primariaEscura }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto, textAlign: 'right', flexShrink: 1 },
});
