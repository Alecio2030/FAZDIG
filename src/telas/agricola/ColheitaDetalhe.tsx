import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Botao from '../../componentes/Botao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, textoHoras } from '../../lib/datas';
import { formatarMoeda, formatarQtd } from '../../lib/formatos';
import { FORMAS_SERVICO, ICONE_TIPO_COLHEITA, ROTULO_TIPO_COLHEITA, custoColheita, textoLitros, textoMedida, um } from '../../lib/colheitas';
import { ROTULO_SITUACAO } from '../../lib/titulos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const VAZIO = '–';

/** Ficha da colheita (Consulta): o que foi colhido, por quem, com que máquina e quanto custou. Só mostra. */
export default function ColheitaDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ColheitaDetalhe'>>();
  const [d, setD] = useState<{ c: any; colhedores: any[]; titulos: any[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? `Colheita nº ${d.c.numero}` : 'Colheita' });
  }, [navegacao, d]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [c, colhedores, titulos] = await Promise.all([
            consulta<any>(
              supabase
                .from('pc_lotes')
                .select(
                  '*, area:areas ( nome, centros_custo ( codigo, nome, ativo ) ), safra:safras ( nome ), maquina:imobilizados ( numero, nome ), operador:pessoas!pc_lotes_operador_id_fkey ( nome ), prestador:pessoas!pc_lotes_prestador_id_fkey ( nome )',
                )
                .eq('id', params.id)
                .single(),
            ),
            consulta<any[]>(supabase.from('pc_colhedores').select('id, quantidade, preco, valor, pessoa:pessoas ( nome ), fechamento:colheita_fechamentos ( id, numero )').eq('lote_id', params.id)),
            consulta<any[]>(supabase.from('lancamentos').select('id, numero, valor, situacao, data_vencimento').eq('colheita_id', params.id)),
          ]);
          setD({ c, colhedores: colhedores.sort((a, b) => (um(a.pessoa)?.nome ?? '').localeCompare(um(b.pessoa)?.nome ?? '')), titulos });
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!d) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const { c, colhedores, titulos } = d;
  const custo = custoColheita(c);
  const qtd = Number(c.quantidade_bruta);
  const litros = Number(c.litros ?? 0);
  const maq = um(c.maquina);
  const cc = ((um(c.area)?.centros_custo ?? []) as any[]).filter((x) => x.ativo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))[0];
  const forma = FORMAS_SERVICO.find((f) => f.valor === c.servico_forma)?.rotulo;
  const tit = titulos[0];

  return (
    <Tela>
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>
          {ICONE_TIPO_COLHEITA[c.tipo_colheita]} {um(c.area)?.nome}
        </Text>
        <Text style={estilos.sub}>
          Nº {c.numero} · {doBanco(c.data_colheita)} · {ROTULO_TIPO_COLHEITA[c.tipo_colheita] ?? ''}
        </Text>
        <View style={estilos.cards}>
          <Card rotulo="Colhido" valor={textoMedida(qtd, c.unidade)} detalhe={c.unidade !== 'litro' ? `${textoLitros(litros)} (${formatarQtd(c.litros_por_unidade)} L por ${c.unidade})` : undefined} />
          <Card rotulo="Custo da colheita" valor={formatarMoeda(custo)} detalhe={custo && qtd ? `${formatarMoeda(custo / qtd)} por ${c.unidade}` : undefined} />
          {colhedores.length > 0 && <Card rotulo="Colhedores" valor={String(colhedores.length)} detalhe={`média ${formatarQtd(qtd / colhedores.length, 1)} ${c.unidade}`} />}
          {custo > 0 && litros > 0 && <Card rotulo="Por 1.000 L" valor={formatarMoeda((custo / litros) * 1000)} />}
        </View>
        <Text style={estilos.nota}>
          {um(c.safra)?.nome ?? ''}
          {cc ? ` · centro de custo ${cc.codigo} ${cc.nome}` : ' · talhão sem centro de custo'}
        </Text>
      </View>

      {colhedores.length > 0 && (
        <>
          <Secao titulo="Colhedores" />
          {colhedores.map((x) => {
            const f = um(x.fechamento);
            return (
              <View key={x.id} style={estilos.item}>
                <View style={estilos.itemLinha}>
                  <Text style={estilos.itemTitulo}>{um(x.pessoa)?.nome}</Text>
                  <Text style={estilos.itemValor}>{formatarMoeda(Number(x.valor))}</Text>
                </View>
                <Text style={estilos.nota}>
                  {textoMedida(x.quantidade, c.unidade)} × {formatarMoeda(Number(x.preco))} · {f ? `fechamento nº ${f.numero}` : 'em aberto para o fechamento'}
                </Text>
              </View>
            );
          })}
        </>
      )}

      {c.maquina_de && (
        <>
          <Secao titulo="Máquina" />
          <Dado rotulo="De quem" valor={c.maquina_de === 'propria' ? 'Própria' : `De terceiro: ${um(c.prestador)?.nome ?? ''}`} />
          {c.maquina_de === 'propria' && <Dado rotulo="Máquina" valor={maq ? `${maq.nome} (bem nº ${maq.numero})` : null} />}
          {c.maquina_de === 'propria' && <Dado rotulo="Operador" valor={um(c.operador)?.nome} />}
          <Dado rotulo="Horas de máquina" valor={c.horas_maquina != null ? textoHoras(Number(c.horas_maquina)) : null} />
          {c.maquina_de === 'terceiro' && (
            <Dado
              rotulo="Serviço"
              valor={
                forma
                  ? `${forma}${c.servico_forma === 'hora' ? `: ${formatarQtd(c.servico_qtd)} h × ${formatarMoeda(Number(c.servico_preco))}` : c.servico_forma === 'medida' ? `: ${formatarMoeda(Number(c.servico_preco))} por ${c.unidade}` : ''} = ${formatarMoeda(Number(c.servico_valor))}`
                  : 'Sem valor lançado'
              }
            />
          )}
          {tit && <Botao titulo={`Ver o título nº ${tit.numero} (${ROTULO_SITUACAO[tit.situacao] ?? tit.situacao})`} tipo="secundario" onPress={() => navegacao.navigate('TituloDetalhe', { id: tit.id })} />}
        </>
      )}

      {c.observacoes ? <Text style={estilos.obs}>{c.observacoes}</Text> : null}
      <Botao titulo="✏️  Alterar ou excluir esta colheita" tipo="secundario" onPress={() => navegacao.push('ColheitaForm', { abrirId: params.id })} />
    </Tela>
  );
}

function Card({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.cardRotulo}>{rotulo}</Text>
      <Text style={estilos.cardValor}>{valor}</Text>
      {detalhe ? <Text style={estilos.cardDetalhe}>{detalhe}</Text> : null}
    </View>
  );
}
function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || VAZIO}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 8 },
  titulo: { fontSize: tam.subtitulo + 3, fontWeight: '800', color: cores.primariaEscura },
  sub: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  obs: { fontSize: tam.texto, color: cores.texto, lineHeight: 24, marginTop: 6 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  cardDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 3 },
  itemLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  itemTitulo: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemValor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
