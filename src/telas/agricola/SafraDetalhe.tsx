import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Botao from '../../componentes/Botao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { resultadoSafra, type ResultadoSafra } from '../../lib/custosCafe';
import { cotacaoReferencia, lerCotacoes, type Cotacao } from '../../lib/cotacoes';
import { textoSacas } from '../../lib/posColheita';
import { CAMPOS_COLHEITA, ICONE_TIPO_COLHEITA, ROTULO_TIPO_COLHEITA, custoColheita, textoLitros, textoMedida, um } from '../../lib/colheitas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const VAZIO = '–';

/** Painel da safra (Consulta): previsão, o que já foi colhido por talhão e por forma de colheita, e o custo da colheita. Só mostra. */
export default function SafraDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'SafraDetalhe'>>();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? d.s.nome : 'Safra' });
  }, [navegacao, d]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [s, st, col] = await Promise.all([
            consulta<any>(supabase.from('safras').select('*').eq('id', params.id).single()),
            consulta<any[]>(supabase.from('safra_talhoes').select('area_id, previsao_sacas, area:areas ( nome, area_ha, area_util_ha )').eq('safra_id', params.id)),
            consulta<any[]>(supabase.from('pc_lotes').select(CAMPOS_COLHEITA).eq('safra_id', params.id).order('data_colheita', { ascending: false }).order('numero', { ascending: false })),
          ]);
          // do colhido ao beneficiado, por talhão (secagem e pilagem rateadas pela origem do café)
          const res = await consulta<any[]>(supabase.rpc('cafe_resumo_talhoes', { p_fazenda: s.fazenda_id, p_safra: params.id }));
          setD({ s, st, col, res, rs: await resultadoSafra(s), cot: cotacaoReferencia(await lerCotacoes().catch(() => [] as Cotacao[])) });
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!d) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const { s, st, col, res, rs, cot } = d as { s: any; st: any[]; col: any[]; res: any[]; rs: ResultadoSafra; cot: Cotacao | null };
  const lavoura = rs.talhoes.reduce((t, x) => t + x.insumos + x.maoObra + x.maquinas + x.servicos + x.exaustao, 0);
  const margem = rs.porSaca != null && rs.precoMedio != null ? rs.precoMedio - rs.porSaca : null;
  const benef = res.reduce((t, r) => t + Number(r.sacas_beneficiadas), 0);
  const litrosPilados = res.reduce((t, r) => t + (Number(r.sacas_coco) > 0 ? (Number(r.litros_secos) * Number(r.sacas_coco_piladas)) / Number(r.sacas_coco) : 0), 0);
  const custoPos = res.reduce((t, r) => t + Number(r.custo_secagem) + Number(r.custo_pilagem), 0);
  const previsto = st.reduce((t, x) => t + Number(x.previsao_sacas ?? 0), 0);
  const litros = col.reduce((t, c) => t + Number(c.litros ?? 0), 0);
  const custo = col.reduce((t, c) => t + custoColheita(c), 0);
  const dias = new Set(col.map((c) => c.data_colheita)).size;

  // por talhão: os da previsão e os que tiveram colheita
  const porTalhao: Record<string, { nome: string; ha: number | null; previsto: number | null; litros: number; custo: number; n: number; benef?: number; pos?: number }> = {};
  for (const x of st) {
    const a = um(x.area);
    porTalhao[x.area_id] = { nome: a?.nome ?? '', ha: Number(a?.area_util_ha ?? a?.area_ha) || null, previsto: x.previsao_sacas != null ? Number(x.previsao_sacas) : null, litros: 0, custo: 0, n: 0 };
  }
  for (const c of col) {
    porTalhao[c.area_id] ??= { nome: um(c.area)?.nome ?? '', ha: null, previsto: null, litros: 0, custo: 0, n: 0 };
    porTalhao[c.area_id].litros += Number(c.litros ?? 0);
    porTalhao[c.area_id].custo += custoColheita(c);
    porTalhao[c.area_id].n += 1;
  }
  for (const r of res) if (porTalhao[r.area_id]) Object.assign(porTalhao[r.area_id], { benef: Number(r.sacas_beneficiadas), pos: Number(r.custo_secagem) + Number(r.custo_pilagem) });
  const talhoes = Object.values(porTalhao).sort((a, b) => a.nome.localeCompare(b.nome));

  const porTipo: Record<string, { litros: number; custo: number; n: number }> = {};
  for (const c of col) {
    const k = c.tipo_colheita ?? 'manual';
    porTipo[k] ??= { litros: 0, custo: 0, n: 0 };
    porTipo[k].litros += Number(c.litros ?? 0);
    porTipo[k].custo += custoColheita(c);
    porTipo[k].n += 1;
  }

  return (
    <Tela>
      <Botao titulo="Alterar, encerrar ou excluir esta safra" tipo="secundario" onPress={() => navegacao.push('SafraForm', { id: params.id })} />
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>{s.nome}</Text>
        <Text style={estilos.sub}>
          Nº {s.numero} · {doBanco(s.data_inicio)} a {doBanco(s.data_fim)}
        </Text>
        <Text style={[estilos.nota, s.situacao === 'aberta' ? { color: cores.primaria, fontWeight: '700' } : { color: cores.cafe, fontWeight: '700' }]}>
          {s.situacao === 'aberta' ? 'Safra aberta' : `Encerrada${s.encerrada_em ? ` em ${doBanco(s.encerrada_em)}` : ''}`}
          {s.cultura ? ` · ${s.cultura}` : ''}
        </Text>
        <View style={estilos.cards}>
          <Card rotulo="Previsão" valor={previsto ? `${formatarQtd(previsto)} sc` : VAZIO} detalhe="sacas beneficiadas" />
          <Card rotulo="Colhido" valor={litros ? textoLitros(litros) : VAZIO} detalhe="café da roça" />
          <Card rotulo="Custo da colheita" valor={formatarMoeda(custo)} detalhe={litros ? `${formatarMoeda((custo / litros) * 1000)} por 1.000 L` : undefined} />
          <Card rotulo="Colheitas" valor={formatarNumero(col.length)} detalhe={dias ? `${dias} ${dias === 1 ? 'dia' : 'dias'} de colheita` : undefined} />
          <Card rotulo="Beneficiado" valor={benef ? `${formatarQtd(benef, 1)} sc` : VAZIO} detalhe={benef && previsto ? `${formatarNumero((benef / previsto) * 100)}% da previsão` : 'suas sacas de 60 kg'} />
          <Card rotulo="Rendimento" valor={benef && litrosPilados ? `${formatarNumero(litrosPilados / benef)} L` : VAZIO} detalhe="café da roça por saca" />
          <Card rotulo="Secagem e pilagem" valor={formatarMoeda(custoPos)} detalhe={benef && custoPos ? `${formatarMoeda(custoPos / benef)} por saca` : undefined} />
        </View>
        {s.observacoes ? <Text style={estilos.nota}>{s.observacoes}</Text> : null}
      </View>
      <Text style={estilos.nota}>O beneficiado são as suas sacas (sem as que pagaram secador e pilagem), rateadas pelos talhões de onde veio o café.</Text>

      <Secao titulo="Custo por saca e resultado" />
      <View style={estilos.caixa}>
        <Par a="Sacas beneficiadas (suas)" b={rs.sacas ? textoSacas(rs.sacas) : VAZIO} forte />
        <Par a="Lavoura: insumos aplicados" b={formatarMoeda(rs.talhoes.reduce((t, x) => t + x.insumos, 0))} />
        <Par a="Lavoura: mão de obra das atividades" b={formatarMoeda(rs.talhoes.reduce((t, x) => t + x.maoObra, 0))} />
        <Par a="Lavoura: máquinas (combustível e manutenção)" b={formatarMoeda(rs.talhoes.reduce((t, x) => t + x.maquinas, 0))} />
        <Par a="Lavoura: serviços e despesas das compras" b={formatarMoeda(rs.talhoes.reduce((t, x) => t + x.servicos, 0))} />
        <Par a="Lavoura: exaustão" b={formatarMoeda(rs.talhoes.reduce((t, x) => t + x.exaustao, 0))} />
        <Par a="Colheita" b={formatarMoeda(rs.talhoes.reduce((t, x) => t + x.colheita, 0))} />
        <Par a="Secagem e pilagem" b={formatarMoeda(rs.talhoes.reduce((t, x) => t + x.secagemPilagem, 0))} />
        <Par a="Armazenagem" b={formatarMoeda(rs.talhoes.reduce((t, x) => t + x.armazenagem, 0))} />
        {rs.outros.sacas > 0 && <Par a={`Café de outra origem (${textoSacas(rs.outros.sacas)})`} b={formatarMoeda(rs.outros.custo)} />}
        <Par a="Custo total da safra" b={formatarMoeda(rs.custo)} forte />
        <Par a="Custo por saca" b={rs.porSaca != null ? formatarMoeda(rs.porSaca) : VAZIO} forte />
        <View style={estilos.divisor} />
        <Par a="Sacas vendidas" b={rs.vendidas ? `${textoSacas(rs.vendidas)}${rs.sacas ? ` (${formatarNumero((rs.vendidas / rs.sacas) * 100)}%)` : ''}` : 'Nenhuma'} />
        <Par a="Receita (valor das notas)" b={formatarMoeda(rs.receitaBruta)} />
        <Par a="Receita líquida (sem Funrural, comissão e frete)" b={formatarMoeda(rs.receita)} />
        <Par a="Preço médio líquido por saca" b={rs.precoMedio != null ? formatarMoeda(rs.precoMedio) : VAZIO} />
        <Par a="Margem por saca" b={margem != null ? `${formatarMoeda(margem)}${rs.precoMedio ? ` (${formatarNumero((margem / rs.precoMedio) * 100)}%)` : ''}` : VAZIO} forte />
        <Par a="Resultado das sacas vendidas" b={margem != null ? formatarMoeda(margem * rs.vendidas) : VAZIO} forte />
        <View style={estilos.divisor} />
        <Par a="Em estoque" b={rs.estoque > 0.005 ? `${textoSacas(rs.estoque)}${rs.porSaca != null ? ` · ${formatarMoeda(rs.estoque * rs.porSaca)} ao custo` : ''}` : 'Sem estoque'} />
        {rs.estoque > 0.005 && cot && <Par a={`Estoque pela cotação de ${doBanco(cot.data)} (${formatarMoeda(cot.preco)})`} b={formatarMoeda(rs.estoque * cot.preco)} />}
        {cot && rs.porSaca != null && <Par a="Margem por saca se vender hoje (antes dos descontos)" b={`${formatarMoeda(cot.preco - rs.porSaca)} (${formatarNumero(((cot.preco - rs.porSaca) / cot.preco) * 100)}%)`} forte />}
        {rs.perdas > 0.005 && <Par a="Quebras e taxas em sacas" b={textoSacas(rs.perdas)} />}
      </View>
      <Text style={estilos.nota}>
        O custo da lavoura é o do período da safra ({doBanco(s.data_inicio)} a {doBanco(s.data_fim)}), como no painel do talhão: insumos, mão de obra e máquinas das atividades, serviços das compras rateadas ao centro de custo do talhão e a exaustão.{' '}
        {lavoura === 0 ? 'Ainda não há custo de lavoura lançado neste período. ' : ''}
        {rs.litrosSemPilar > 0 ? `Há ${textoLitros(rs.litrosSemPilar)} colhidos que ainda não viraram saca beneficiada: o custo deles já está na conta, por isso o custo por saca aparece maior até a pilagem. ` : ''}
        {rs.outros.semCusto > 0 ? `${textoSacas(rs.outros.semCusto)} de outra origem estão sem custo informado no lote e entram a custo zero. ` : ''}
        Mão de obra fixa, despesas gerais e juros que não estão em centro de custo de talhão não entram.
      </Text>

      {rs.talhoes.some((x) => x.sacas > 0) && (
        <>
          <Secao titulo="Custo por saca de cada talhão" />
          {rs.talhoes
            .filter((x) => x.sacas > 0 || x.custo > 0)
            .map((x) => {
              const preco = x.vendidas > 0 ? x.receita / x.vendidas : null;
              return (
                <View key={x.areaId} style={estilos.item}>
                  <View style={estilos.itemLinha}>
                    <Text style={estilos.itemTitulo}>{x.nome}</Text>
                    <Text style={estilos.itemValor}>{x.porSaca != null ? `${formatarMoeda(x.porSaca)}/sc` : VAZIO}</Text>
                  </View>
                  <Text style={estilos.nota}>
                    {[
                      `${textoSacas(x.sacas)}${x.ha ? ` (${formatarNumero(x.sacas / x.ha, 1)} sc/ha)` : ''}`,
                      `custo ${formatarMoeda(x.custo)}${x.ha ? ` (${formatarMoeda(x.custo / x.ha)}/ha)` : ''}`,
                    ].join(' · ')}
                  </Text>
                  <Text style={estilos.nota}>
                    Lavoura {formatarMoeda(x.insumos + x.maoObra + x.maquinas + x.servicos + x.exaustao)} · colheita {formatarMoeda(x.colheita)} · secagem e pilagem {formatarMoeda(x.secagemPilagem)}
                    {x.armazenagem ? ` · armazenagem ${formatarMoeda(x.armazenagem)}` : ''}
                  </Text>
                  {x.vendidas > 0.005 && preco != null && (
                    <Text style={[estilos.nota, { color: cores.primaria, fontWeight: '700' }]}>
                      Vendidas {textoSacas(x.vendidas)} a {formatarMoeda(preco)} líquidos{x.porSaca != null ? ` · margem ${formatarMoeda(preco - x.porSaca)} por saca` : ''}
                    </Text>
                  )}
                </View>
              );
            })}
        </>
      )}

      {rs.vendas.length > 0 && (
        <>
          <Secao titulo="Vendas do café desta safra" />
          <Lista>
            {rs.vendas.map((v) => (
              <Linha key={v.id} titulo={`Venda nº ${v.numero} · ${doBanco(v.data)}`} linhas={[`${textoSacas(v.sacas)} desta safra · ${formatarMoeda(v.sacas ? v.receita / v.sacas : 0)} líquidos por saca`]} direita={formatarMoeda(v.receita)} onPress={() => navegacao.navigate('VendaDetalhe', { id: v.id })} />
            ))}
          </Lista>
        </>
      )}

      <Secao titulo="Por talhão" />
      {talhoes.length === 0 ? (
        <Text style={estilos.nota}>Sem previsão nem colheita nesta safra.</Text>
      ) : (
        talhoes.map((t) => (
          <View key={t.nome} style={estilos.item}>
            <View style={estilos.itemLinha}>
              <Text style={estilos.itemTitulo}>{t.nome}</Text>
              <Text style={estilos.itemValor}>{t.litros ? textoLitros(t.litros) : 'Sem colheita'}</Text>
            </View>
            <Text style={estilos.nota}>
              {[
                t.previsto != null ? `Previsto ${formatarQtd(t.previsto)} sc${t.ha ? ` (${formatarNumero(t.previsto / t.ha, 1)} sc/ha)` : ''}` : 'Sem previsão',
                t.n ? `${t.n} ${t.n === 1 ? 'colheita' : 'colheitas'}` : null,
                t.benef ? `beneficiado ${formatarQtd(t.benef, 1)} sc${t.ha ? ` (${formatarNumero(t.benef / t.ha, 1)} sc/ha)` : ''}` : null,
                t.custo ? `colheita ${formatarMoeda(t.custo)}` : null,
                t.pos ? `secagem e pilagem ${formatarMoeda(t.pos)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ))
      )}

      {Object.keys(porTipo).length > 0 && (
        <>
          <Secao titulo="Por forma de colheita" />
          <View style={estilos.caixa}>
            {Object.entries(porTipo).map(([k, v]) => (
              <View key={k} style={estilos.itemLinha}>
                <Text style={estilos.parA}>
                  {ICONE_TIPO_COLHEITA[k]} {ROTULO_TIPO_COLHEITA[k] ?? k} · {v.n} {v.n === 1 ? 'colheita' : 'colheitas'}
                </Text>
                <Text style={estilos.parB}>
                  {textoLitros(v.litros)}
                  {litros ? ` (${formatarNumero((v.litros / litros) * 100)}%)` : ''}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Secao titulo="Colheitas da safra" />
      {col.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma colheita lançada nesta safra.</Text>
      ) : (
        <Lista>
          {col.slice(0, 30).map((c) => (
            <Linha
              key={c.id}
              titulo={`${ICONE_TIPO_COLHEITA[c.tipo_colheita] ?? ''} Nº ${c.numero} · ${doBanco(c.data_colheita)}`}
              linhas={[um(c.area)?.nome, `${textoMedida(c.quantidade_bruta, c.unidade)} · ${textoLitros(c.litros)}`]}
              direita={custoColheita(c) ? formatarMoeda(custoColheita(c)) : undefined}
              onPress={() => navegacao.navigate('ColheitaDetalhe', { id: c.id })}
            />
          ))}
        </Lista>
      )}
      {col.length > 30 && <Text style={estilos.nota}>Mostrando as 30 mais recentes de {col.length}. As outras estão em Agrícola › Colheitas › Consultar.</Text>}
    </Tela>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={estilos.itemLinha}>
      <Text style={[estilos.parA, forte && { fontWeight: '800', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }]}>{b}</Text>
    </View>
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

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 8 },
  titulo: { fontSize: tam.subtitulo + 3, fontWeight: '800', color: cores.primariaEscura },
  sub: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  cardDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 3 },
  itemLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  itemTitulo: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemValor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
});
