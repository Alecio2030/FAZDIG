import React, { useEffect, useLayoutEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarNumero, formatarMoeda } from '../../lib/formatos';
import { codigoLote, identAnimal } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ENTRADAS, ROTULO_MOV } from '../../lib/movimentacoes';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const MOSTRAR = 100;

/** Uma movimentação: dados, animais envolvidos e o botão de desfazer. */
export default function MovimentacaoDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'MovimentacaoDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [m, setM] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    consulta<any>(
      supabase
        .from('movimentacoes')
        .select(
          '*, origem:lotes!movimentacoes_lote_origem_id_fkey ( numero, descricao ), destino:lotes!movimentacoes_lote_destino_id_fkey ( numero, descricao ),' +
            ' manga_origem:areas!movimentacoes_manga_origem_id_fkey ( nome ), manga_destino:areas!movimentacoes_manga_destino_id_fkey ( nome ),' +
            ' pessoa:pessoas ( nome ), pesagem:pesagens ( id, numero ), compra:compras ( id, numero, valor_total ), venda:vendas ( id, numero, valor_total ), itens:movimentacao_itens ( id, peso_kg, animal:animais ( id, numero_interno, brinco, nome, categoria, situacao ) )',
        )
        .eq('id', params.id)
        .single(),
    )
      .then(setM)
      .catch((e) => setErro(traduzirErro(e)));
  }, [params.id]);

  useLayoutEffect(() => {
    if (m) navegacao.setOptions({ title: ROTULO_MOV[m.tipo] ?? 'Movimentação' });
  }, [navegacao, m]);

  function excluir() {
    const entrada = ENTRADAS.includes(m.tipo);
    Alert.alert(
      'Excluir e desfazer',
      entrada
        ? 'Os animais criados por este lançamento serão apagados. Só é possível se eles ainda não tiveram outros lançamentos (pesagem, vacina, saída...).' +
          (m.compra_id ? ' A compra e o contas a pagar dela também são apagados.' : '')
        : m.tipo === 'transferencia_manga'
          ? 'O lote volta para a manga de antes.'
          : m.tipo === 'transferencia_lote'
            ? 'Os animais voltam para o lote de origem.'
            : 'Os animais voltam para o rebanho, no mesmo lote.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setErro(null);
            setExcluindo(true);
            const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_movimentacao', { p_id: m.id }), 'movimentacao', String(m.id));
            setExcluindo(false);
            if (error) setErro(traduzirErro(error));
            else navegacao.goBack();
          },
        },
      ],
    );
  }

  if (!m) {
    return (
      <Tela rolar={false}>
        {erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}
      </Tela>
    );
  }

  const o = um(m.origem);
  const d = um(m.destino);
  const itens = (m.itens ?? []).map((i: any) => ({ ...i, animal: um(i.animal) })).sort((a: any, b: any) => (a.animal?.numero_interno ?? 0) - (b.animal?.numero_interno ?? 0));
  const pesoTotal = itens.reduce((s: number, i: any) => s + Number(i.peso_kg ?? 0), 0);
  const linhas: [string, string | null][] = [
    ['Data', doBanco(m.data)],
    ['Lote de origem', o ? codigoLote(o.numero, sigla) + (o.descricao ? ` – ${o.descricao}` : '') : null],
    ['Lote de destino', d ? codigoLote(d.numero, sigla) + (d.descricao ? ` – ${d.descricao}` : '') : null],
    ['Manga', m.tipo === 'transferencia_manga' ? `${um(m.manga_origem)?.nome ?? 'sem manga'} → ${um(m.manga_destino)?.nome ?? ''}` : null],
    ['Cabeças', itens.length ? formatarNumero(itens.length) : null],
    ['Peso total', pesoTotal > 0 ? `${formatarNumero(pesoTotal, 2)} kg (média ${formatarNumero(pesoTotal / itens.length, 1)} kg)` : null],
    ['Pesagem', um(m.pesagem) ? `nº ${um(m.pesagem).numero}` : null],
    ['Pessoa', um(m.pessoa)?.nome ?? null],
    ['Documento', m.documento],
    ['Observações', m.observacoes],
  ];

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        {linhas
          .filter(([, v]) => v)
          .map(([r, v]) => (
            <View key={r} style={estilos.par}>
              <Text style={estilos.rotulo}>{r}</Text>
              <Text style={estilos.valor}>{v}</Text>
            </View>
          ))}
      </View>

      {itens.length > 0 && (
        <>
          <Secao titulo="Animais" />
          <Lista>
            {itens.slice(0, MOSTRAR).map((i: any) => (
              <Linha
                key={i.id}
                titulo={[identAnimal(i.animal ?? {}), i.animal?.nome].filter(Boolean).join('  ')}
                linhas={[i.animal?.categoria, i.peso_kg ? `${formatarNumero(i.peso_kg, 1)} kg` : null]}
                onPress={() => i.animal && navegacao.navigate('AnimalForm', { id: i.animal.id })}
              />
            ))}
          </Lista>
          {itens.length > MOSTRAR && <Text style={estilos.nota}>Mostrando {MOSTRAR} de {itens.length} animais.</Text>}
        </>
      )}

      {um(m.compra) && (
        <Botao titulo={`Ver a compra nº ${um(m.compra).numero} (${formatarMoeda(Number(um(m.compra).valor_total))})`} tipo="secundario" onPress={() => navegacao.navigate('CompraDetalhe', { id: um(m.compra).id })} />
      )}
      {um(m.venda) && (
        <>
          <Botao titulo={`Ver a venda nº ${um(m.venda).numero} (${formatarMoeda(Number(um(m.venda).valor_total))})`} tipo="secundario" onPress={() => navegacao.navigate('VendaDetalhe', { id: um(m.venda).id })} />
          <Text style={estilos.nota}>Esta saída veio de uma venda: para desfazer, exclua a venda em Mais › Vendas.</Text>
        </>
      )}
      {um(m.pesagem) && (
        <Botao titulo={`Abrir pesagem nº ${um(m.pesagem).numero}`} tipo="secundario" onPress={() => navegacao.navigate('PesagemDetalhe', { id: um(m.pesagem).id })} />
      )}
      <Botao titulo="Excluir e desfazer" tipo="perigo" onPress={excluir} carregando={excluindo} />
      <Text style={estilos.nota}>Só dá para desfazer se os animais não tiveram movimentação depois desta. Se tiveram, desfaça primeiro as mais recentes.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 10 },
  par: { gap: 2 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  valor: { fontSize: tam.texto, color: cores.texto, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
});
