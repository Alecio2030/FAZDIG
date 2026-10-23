import React, { useCallback, useLayoutEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { um } from '../../lib/colheitas';
import { ROTULO_SITUACAO } from '../../lib/titulos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** Fechamento do pagamento da colheita: o que cada colhedor produziu, os vales descontados e o título gerado. */
export default function FechamentoColheita() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'FechamentoColheita'>>();
  const [d, setD] = useState<{ f: any; itens: any[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? `Fechamento nº ${d.f.numero}` : 'Fechamento' });
  }, [navegacao, d]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [f, itens] = await Promise.all([
            consulta<any>(supabase.from('colheita_fechamentos').select('*').eq('id', params.id).single()),
            consulta<any[]>(
              supabase.from('colheita_fechamento_itens').select('id, producao, vales, liquido, saldo_devedor, pessoa:pessoas ( nome ), titulo:lancamentos ( id, numero, situacao )').eq('fechamento_id', params.id),
            ),
          ]);
          setD({ f, itens: itens.sort((a, b) => (um(a.pessoa)?.nome ?? '').localeCompare(um(b.pessoa)?.nome ?? '')) });
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  function excluir() {
    Alert.alert('Excluir fechamento', `Excluir o fechamento nº ${d!.f.numero}? Os títulos dele saem do Contas a pagar e a produção e os vales voltam a ficar em aberto.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_fechamento_colheita', { p_id: params.id }), 'fech_colheita_id', String(params.id));
          if (error) return setErro(traduzirErro(error));
          navegacao.goBack();
        },
      },
    ]);
  }

  if (!d) return <Tela rolar={!!erro}>{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}</Tela>;
  const { f, itens } = d;

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Fechamento nº {f.numero}</Text>
        <Text style={estilos.sub}>
          Produção até {doBanco(f.data_fim)} · pagamento em {doBanco(f.vencimento)}
        </Text>
        <View style={estilos.cards}>
          <Card rotulo="Produção" valor={formatarMoeda(Number(f.total_producao))} />
          <Card rotulo="Vales descontados" valor={formatarMoeda(Number(f.total_vales))} />
          <Card rotulo="A pagar" valor={formatarMoeda(Number(f.total_liquido))} />
          <Card rotulo="Colhedores" valor={String(itens.length)} />
        </View>
      </View>

      <Secao titulo="Colhedores" />
      <Lista>
        {itens.map((i) => {
          const t = um(i.titulo);
          return (
            <Linha
              key={i.id}
              titulo={um(i.pessoa)?.nome ?? ''}
              linhas={[
                `Produção ${formatarMoeda(Number(i.producao))}${Number(i.vales) ? ` · vales ${formatarMoeda(Number(i.vales))}` : ''}`,
                t ? `Título nº ${t.numero} · ${ROTULO_SITUACAO[t.situacao] ?? t.situacao}` : Number(i.saldo_devedor) ? `Sem título: ficou devendo ${formatarMoeda(Number(i.saldo_devedor))} para o próximo fechamento` : 'Sem valor a pagar',
              ]}
              direita={formatarMoeda(Number(i.liquido))}
              onPress={() => (t ? navegacao.navigate('TituloDetalhe', { id: t.id }) : undefined)}
            />
          );
        })}
      </Lista>
      <Text style={estilos.nota}>Toque no colhedor para ver o título. O pagamento (baixa) é feito em Financeiro › Contas a pagar.</Text>
      {f.observacoes ? <Text style={estilos.nota}>{f.observacoes}</Text> : null}

      <Botao titulo="Excluir fechamento" tipo="perigo" onPress={excluir} />
    </Tela>
  );
}

function Card({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.cardRotulo}>{rotulo}</Text>
      <Text style={estilos.cardValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 8 },
  titulo: { fontSize: tam.subtitulo + 3, fontWeight: '800', color: cores.primariaEscura },
  sub: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
});
