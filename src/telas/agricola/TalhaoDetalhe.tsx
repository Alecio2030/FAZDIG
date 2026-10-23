import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { calcular, mesesEntre, quotaDoMes, somarMes } from '../../lib/imobilizado';
import { NOME_FACE, anoSafra, idadeFase, plantasHa } from '../../lib/talhoes';
import { doGeoJson } from '../../lib/pastos';
import { textoNivel, tituloOcorrencia } from '../../lib/monitoramento';
import { faixaDe, lerHistorico, lerIndices, textoNdvi, textoVariacaoNdvi } from '../../lib/satelite';
import QuadroAgua from '../../componentes/QuadroAgua';
import { localDaFazenda } from '../../lib/clima';
import { aguaDosTalhoes, type AguaTalhao } from '../../lib/irrigacao';
import { ICONE_ATIVIDADE, custoAtividade, mediosAtuais, tituloAtividade } from '../../lib/atividades';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const VAZIO = '–';
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Painel do talhão (Consulta): cultura, estande, idade, financeiro da safra, podas e análises. Só mostra. */
export default function TalhaoDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'TalhaoDetalhe'>>();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const hoje = hojeBanco();

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? d.a.nome : 'Talhão' });
  }, [navegacao, d]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const a = await consulta<any>(supabase.from('areas').select('*').eq('id', params.id).single());
          // Período do financeiro: o da safra aberta em Agrícola › Safras que cobre hoje; sem ela, o ano-safra padrão.
          const abertas = await consulta<any[]>(
            supabase.from('safras').select('nome, data_inicio, data_fim').eq('fazenda_id', a.fazenda_id).eq('situacao', 'aberta').lte('data_inicio', hoje).gte('data_fim', hoje).order('data_inicio', { ascending: false }).limit(1),
          );
          const padrao = anoSafra(hoje);
          const safra = abertas[0] ? { inicio: abertas[0].data_inicio as string, fim: abertas[0].data_fim as string, rotulo: abertas[0].nome as string, cadastrada: true } : { ...padrao, rotulo: `safra ${padrao.rotulo}`, cadastrada: false };
          const [podas, analises, imob, centros] = await Promise.all([
            consulta<any[]>(supabase.from('talhao_podas').select('*').eq('area_id', params.id).order('data', { ascending: false })),
            consulta<any[]>(supabase.from('talhao_analises').select('*').eq('area_id', params.id).order('data', { ascending: false })),
            consulta<any[]>(supabase.from('imobilizados').select('*').eq('area_id', params.id).eq('metodo', 'exaustao').limit(1)),
            consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome').eq('area_id', params.id)),
          ]);
          // Compras rateadas ao talhão: só a parte de serviços e despesas. Produto de estoque não é custo na compra:
          // vira custo quando é aplicado (Atividades), pelo custo médio.
          // Frete à parte (CT-e): o custo dele já foi para os itens das compras transportadas; a nota de frete não conta de novo.
          const rat = centros.length
            ? await consulta<any[]>(
                supabase.from('compra_rateios').select('percentual, compra:compras ( id, data, valor_total, situacao, itens:compra_itens ( tipo_item, valor_total, frete_aparte ) )').in('centro_custo_id', centros.map((c) => c.id)),
              )
            : [];
          const notasFrete = new Set(rat.length ? (await consulta<any[]>(supabase.from('compra_fretes').select('frete_compra_id, valor_rateado'))).filter((x) => Number(x.valor_rateado) > 0).map((x) => x.frete_compra_id) : []);
          const custoSafra = rat.reduce((s, r) => {
            const c = um(r.compra);
            if (!c || c.situacao === 'a_completar' || c.data < safra.inicio || c.data > safra.fim) return s;
            if (notasFrete.has(c.id)) return s;
            const itens = (c.itens ?? []) as any[];
            const soma = itens.reduce((t, i) => t + Number(i.valor_total), 0);
            const servicos = itens.filter((i) => i.tipo_item !== 'insumo').reduce((t, i) => t + Number(i.valor_total), 0);
            const parteDireta = itens.length && soma > 0 ? servicos / soma : itens.length ? 0 : 1;
            // frete à parte que caiu nos itens de serviço desta compra também é custo direto
            const freteServicos = itens.filter((i) => i.tipo_item !== 'insumo').reduce((t, i) => t + Number(i.frete_aparte ?? 0), 0);
            return s + ((Number(c.valor_total) * parteDireta + freteServicos) * Number(r.percentual)) / 100;
          }, 0);
          // Atividades feitas no talhão (a parte do talhão no custo de cada uma).
          const ats = await consulta<any[]>(
            supabase
              .from('atividade_areas')
              .select('percentual, area_ha, atividade:atividades_agricolas ( id, numero, data, tipo, subtipo, custo_mao_obra, custo_maquina, itens:atividade_insumos ( insumo_id, quantidade, unidade, quantidade_estoque, custo_unitario, baixou, retornado, insumo:insumos ( nome ) ) )')
              .eq('area_id', params.id),
          );
          const ids = [...new Set(ats.flatMap((x) => (um(x.atividade)?.itens ?? []).map((i: any) => i.insumo_id)))];
          const movs = ids.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade, valor_unitario, data').eq('fazenda_id', a.fazenda_id).eq('tipo', 'entrada').in('insumo_id', ids)) : [];
          const medios = mediosAtuais(movs);
          const atividades = ats
            .map((x) => {
              const at = um(x.atividade);
              if (!at) return null;
              const parteInsumos = (custoAtividade(at.itens ?? [], medios) * Number(x.percentual)) / 100;
              const parteMO = (Number(at.custo_mao_obra ?? 0) * Number(x.percentual)) / 100;
              const parteMaq = (Number(at.custo_maquina ?? 0) * Number(x.percentual)) / 100;
              return { ...at, parteInsumos, parteMO, parteMaq, parte: parteInsumos + parteMO + parteMaq, area_ha: x.area_ha };
            })
            .filter(Boolean)
            .sort((p: any, q: any) => (p.data < q.data ? 1 : p.data > q.data ? -1 : q.numero - p.numero)) as any[];
          const daSafra = atividades.filter((at) => at.data >= safra.inicio && at.data <= safra.fim);
          const insumosSafra = daSafra.reduce((t, at) => t + at.parteInsumos, 0);
          const maoObraSafra = daSafra.reduce((t, at) => t + at.parteMO, 0);
          const maquinasSafra = daSafra.reduce((t, at) => t + at.parteMaq, 0);
          // Colheita do talhão no ano-safra: produção dos colhedores e serviço de máquina de terceiro.
          const colh = await consulta<any[]>(supabase.from('pc_lotes').select('litros, valor_colheita, servico_valor').eq('area_id', params.id).gte('data_colheita', safra.inicio).lte('data_colheita', safra.fim));
          const colheitaSafra = colh.reduce((t, c) => t + Number(c.valor_colheita ?? 0) + Number(c.servico_valor ?? 0), 0);
          const litrosSafra = colh.reduce((t, c) => t + Number(c.litros ?? 0), 0);
          setD({ a, podas, analises, imob: imob[0] ?? null, centros, custoSafra, atividades, insumosSafra, maoObraSafra, maquinasSafra, colheitaSafra, litrosSafra, safra, vigor: lerHistorico(await lerIndices(params.id, 4).catch(() => [])), pragas: await consulta<any[]>(supabase.from('monitoramentos').select('id, numero, data, tipo, problema, severidade, incidencia_perc').eq('area_id', params.id).eq('situacao', 'aberta').order('data', { ascending: false }).limit(10)), planos: await consulta<any[]>(supabase.from('adubacao_planos').select('id, numero, data, parcelas:adubacao_parcelas ( data_prevista, tipo, atividade_id )').eq('area_id', params.id).order('numero', { ascending: false }).limit(3)) });
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id, hoje]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!d) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const { a, podas, analises, imob, centros, custoSafra, atividades, insumosSafra, maoObraSafra, maquinasSafra, colheitaSafra, litrosSafra, safra, planos, pragas, vigor } = d;
  const util = Number(a.area_util_ha ?? a.area_ha ?? 0) || null;
  // V145: total efetivamente plantado (informado) e total calculado (espaçamento × área)
  const densCalc = plantasHa(Number(a.espacamento_linhas_m), Number(a.espacamento_plantas_m));
  const totalPlantado = a.plantas_total != null ? Number(a.plantas_total) : null;
  const totalCalculado = densCalc && util ? Math.round(densCalc * util) : null;
  const densReal = totalPlantado && util ? Math.round(totalPlantado / util) : null;
  const idade = idadeFase(a.data_plantio, hoje, imob ? Number(imob.vida_util) : 15);
  const ex = imob ? calcular(imob, hoje) : null;
  // exaustão já lançada no ano-safra (meses do início da safra até hoje)
  let mesesSafra = 0;
  let exSafra = 0;
  if (imob) {
    for (let i = 0; i <= mesesEntre(safra.inicio, hoje); i++) {
      const q = quotaDoMes(imob, somarMes(safra.inicio.slice(0, 7), i));
      if (q > 0) {
        mesesSafra++;
        exSafra += q;
      }
    }
  }
  const custoTotalSafra = custoSafra + insumosSafra + maoObraSafra + maquinasSafra + exSafra + colheitaSafra;
  const previsao = a.previsao_sacas != null ? Number(a.previsao_sacas) : null;
  const recepa = podas.find((p: any) => p.tipo === 'Recepa' && mesesEntre(p.data, hoje) < 12);

  return (
    <Tela>
      <View style={estilos.cartao}>
        <Text style={estilos.nome}>{a.nome}</Text>
        <Text style={estilos.cultura}>{a.capim_cultura ?? 'Cultura não informada'}</Text>
        <View style={estilos.cards}>
          <Card rotulo="Plantas efetivamente PLANTADAS" valor={totalPlantado != null ? formatarNumero(totalPlantado) : VAZIO} detalhe={densReal ? `${formatarNumero(densReal)}/ha` : 'informe no cadastro'} />
          <Card rotulo="Plantas CALCULADAS (espaçamento)" valor={totalCalculado != null ? formatarNumero(totalCalculado) : VAZIO} detalhe={densCalc ? `${formatarNumero(densCalc)}/ha` : 'informe o espaçamento'} />
          <Card rotulo="Área útil" valor={util ? `${formatarNumero(util, 2)} ha` : VAZIO} />
          <Card rotulo="Idade" valor={idade ? `${idade.meses} meses` : VAZIO} detalhe={idade?.fase} />
          <Card rotulo="Previsão da Produção" valor={previsao != null ? `${formatarQtd(previsao)} sc` : VAZIO} detalhe={previsao != null && util ? `${formatarNumero(previsao / util, 1)} sc/ha` : undefined} />
        </View>
        {totalPlantado != null && totalCalculado ? (
          <Text style={estilos.nota}>
            Diferença plantadas × calculadas: {totalPlantado - totalCalculado > 0 ? '+' : ''}
            {formatarNumero(totalPlantado - totalCalculado)} plantas ({formatarNumero(((totalPlantado - totalCalculado) / totalCalculado) * 100, 1)}%)
          </Text>
        ) : null}
        {a.ativa === false && <Text style={[estilos.nota, { color: cores.erro }]}>Talhão inativo.</Text>}
        {recepa && <Text style={[estilos.nota, { color: cores.cafe, fontWeight: '700' }]}>Recepa em {doBanco(recepa.data)}: previsão reduzida para a próxima safra.</Text>}
      </View>


      {/* V145: dados do cadastro na mesma ordem e com os mesmos títulos da folha do cadastro */}
      <Secao titulo="Identificação e localização" />
      <Dado rotulo="Área total" valor={a.area_ha != null ? `${formatarNumero(Number(a.area_ha), 2)} ha` : null} />
      <Dado rotulo="Área útil plantada" valor={a.area_util_ha != null ? `${formatarNumero(Number(a.area_util_ha), 2)} ha` : null} />
      <Dado rotulo="Perímetro" valor={a.perimetro_m != null ? `${formatarNumero(Number(a.perimetro_m))} m` : null} />
      <Dado rotulo="Altitude" valor={a.altitude_m != null ? `${formatarNumero(Number(a.altitude_m))} m` : null} />
      <Dado rotulo="Face de exposição ao sol" valor={a.face_exposicao ? NOME_FACE[a.face_exposicao] : null} />
      <Dado rotulo="Contorno no mapa" valor={doGeoJson(a.geometria).length >= 3 ? 'Desenhado' : 'Não desenhado'} />

      <Secao titulo="Cultura e genética" />
      <Dado rotulo="Espécie" valor={a.especie} />
      <Dado rotulo="Variedade / clone" valor={a.variedade} />
      <Dado rotulo="Data do plantio" valor={a.data_plantio ? `${doBanco(a.data_plantio)}${idade ? ` (${idade.texto})` : ''}` : null} />
      <Dado rotulo="Espaçamento (entre linhas × entre plantas)" valor={a.espacamento_linhas_m && a.espacamento_plantas_m ? `${formatarQtd(a.espacamento_linhas_m)} × ${formatarQtd(a.espacamento_plantas_m)} m` : null} />
      <Dado rotulo="Total de plantas efetivamente plantadas" valor={totalPlantado != null ? formatarNumero(totalPlantado) : null} />
      <Dado rotulo="Total de plantas calculadas (espaçamento)" valor={totalCalculado != null ? formatarNumero(totalCalculado) : null} />
      <Dado rotulo="Plantas por ha efetivamente plantadas" valor={densReal != null ? formatarNumero(densReal) : null} />
      <Dado rotulo="Plantas por ha calculadas (espaçamento)" valor={densCalc ? formatarNumero(densCalc) : null} />

      <Secao titulo="Manejo técnico" />
      <Dado rotulo="Sistema de condução" valor={a.irrigacao === 'irrigada' ? `Irrigada – ${a.metodo_irrigacao ?? ''}` : a.irrigacao === 'sequeiro' ? 'Sequeiro' : null} />
      <Text style={estilos.subtitulo}>Podas, recepas e decotes</Text>
      {podas.length === 0 ? <Text style={estilos.nota}>Nenhuma poda registrada.</Text> : podas.map((p: any) => <Dado key={p.id} rotulo={doBanco(p.data)} valor={`${p.tipo}${p.observacoes ? ` · ${p.observacoes}` : ''}`} />)}

      <Secao titulo="Ativo biológico e exaustão" />
      <Dado rotulo="Custo de formação" valor={ex ? formatarMoeda(ex.valor) : null} />
      <Dado rotulo="Início da exaustão / período" valor={imob ? `${doBanco(imob.data_ativacao)} · ${formatarQtd(imob.vida_util)} safras (bem nº ${imob.numero})` : null} />

      <Secao titulo="Previsão da Produção" />
      <Dado rotulo="Sacas estimadas por hectare" valor={a.previsao_sc_ha != null ? `${formatarNumero(Number(a.previsao_sc_ha), 1)} sc/ha` : null} />
      <Dado rotulo="Sacas calculadas no talhão" valor={previsao != null ? `${formatarQtd(previsao)} sc` : null} />
      <Dado rotulo="Por planta" valor={previsao != null && totalPlantado ? `${formatarNumero((previsao * 60) / totalPlantado, 2)} kg beneficiado` : null} />
      <Botao titulo="🌦  Clima e chuva da fazenda" tipo="secundario" onPress={() => navegacao.navigate('ClimaForm')} />

      <Secao titulo={`Financeiro · ${safra.rotulo}`} />
      <View style={estilos.caixa}>
        <Par a="Custo de formação (valor do ativo)" b={ex ? formatarMoeda(ex.valor) : VAZIO} />
        <Par a="Exaustão mensal alocada" b={ex ? formatarMoeda(ex.mensal) : VAZIO} />
        <Par a="Valor contábil do ativo hoje" b={ex ? formatarMoeda(ex.contabil) : VAZIO} />
        <Par a="Insumos aplicados (atividades, menos os retornos)" b={formatarMoeda(insumosSafra)} />
        <Par a="Mão de obra (atividades)" b={formatarMoeda(maoObraSafra)} />
        <Par a="Máquinas: combustível e manutenção (atividades)" b={formatarMoeda(maquinasSafra)} />
        <Par a="Serviços e despesas das compras" b={formatarMoeda(custoSafra)} />
        <Par a={`Colheita${litrosSafra ? ` (${formatarNumero(litrosSafra)} L colhidos)` : ''}`} b={formatarMoeda(colheitaSafra)} />
        <Par a={`Exaustão na safra (${mesesSafra} ${mesesSafra === 1 ? 'mês' : 'meses'})`} b={formatarMoeda(exSafra)} />
        <Par a="Custo acumulado da safra" b={formatarMoeda(custoTotalSafra)} forte />
        <Par a="Custo por hectare" b={util ? formatarMoeda(custoTotalSafra / util) : VAZIO} />
        <Par a="Custo por saca prevista" b={previsao ? formatarMoeda(custoTotalSafra / previsao) : VAZIO} />
      </View>
      <Text style={estilos.nota}>
        {centros.length ? `Centro de custo: ${centros.map((c: any) => `${c.codigo ?? ''} ${c.nome}`.trim()).join(', ')}.` : 'Nenhum centro de custo vinculado a este talhão: os serviços das compras não são somados aqui.'} Produtos comprados para o estoque entram no custo quando são aplicados. Mão de obra e máquinas entram pelas horas lançadas nas atividades: salário, diesel e oficina pagos não devem ser rateados de novo ao centro de custo do talhão. Período: {doBanco(safra.inicio)} a {doBanco(safra.fim)}{safra.cadastrada ? '' : ' (padrão; abra a safra em Agrícola › Safras para definir o seu)'}.
      </Text>

      <Secao titulo="Atividades" />
      {atividades.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma atividade lançada neste talhão.</Text>
      ) : (
        <Lista>
          {atividades.slice(0, 15).map((at: any) => (
            <Linha
              key={at.id}
              titulo={`${ICONE_ATIVIDADE[at.tipo] ?? ''} ${doBanco(at.data)} · ${tituloAtividade(at)}`}
              linhas={[`Nº ${at.numero}${at.area_ha ? ` · ${formatarNumero(Number(at.area_ha), 2)} ha` : ''}`, (at.itens ?? []).map((i: any) => `${um(i.insumo)?.nome ?? ''} ${formatarQtd(i.quantidade, 2)} ${i.unidade}`).join(' + ') || null]}
              direita={at.parte ? formatarMoeda(at.parte) : undefined}
              onPress={() => navegacao.navigate('AtividadeDetalhe', { id: at.id })}
            />
          ))}
        </Lista>
      )}
      {atividades.length > 15 && <Text style={estilos.nota}>Mostrando as 15 mais recentes de {atividades.length}. As outras estão em Agrícola › Atividades › Consultar.</Text>}
      {a.ativa !== false && <Botao titulo="Lançar atividade neste talhão" tipo="secundario" onPress={() => navegacao.navigate('AtividadeForm', { areaId: a.id })} />}
      {a.ativa !== false && <Botao titulo="Lançar colheita neste talhão" tipo="secundario" onPress={() => navegacao.navigate('ColheitaForm', { areaId: a.id })} />}

      {(planos as any[]).length > 0 && (
        <>
          <Secao titulo="Plano de adubação" />
          {(planos as any[]).map((pl) => {
            const pend = [...new Set(((pl.parcelas ?? []) as any[]).filter((x) => !x.atividade_id).map((x) => x.data_prevista as string))].sort();
            const total = new Set(((pl.parcelas ?? []) as any[]).map((x) => `${x.data_prevista}|${x.tipo}`)).size;
            return (
              <Pressable key={pl.id} style={({ pressed }) => [estilos.item, pressed && { opacity: 0.8 }]} onPress={() => navegacao.navigate('PlanoAdubacao', { id: pl.id })} accessibilityRole="button">
                <Text style={estilos.itemTitulo}>
                  Plano nº {pl.numero} · {doBanco(pl.data)} · {total} {total === 1 ? 'aplicação' : 'aplicações'}
                </Text>
                <Text style={[estilos.nota, pend.length && pend[0] <= hoje ? { color: cores.erro, fontWeight: '700' } : null]}>
                  {pend.length ? `Próxima aplicação: ${doBanco(pend[0])}${pend[0] < hoje ? ' (atrasada)' : pend[0] === hoje ? ' (hoje)' : ''} · faltam ${pend.length}` : 'Todas as aplicações feitas'}
                </Text>
                <Text style={[estilos.nota, { color: cores.primaria, fontWeight: '700' }]}>Ver o plano e lançar as aplicações ›</Text>
              </Pressable>
            );
          })}
        </>
      )}

      <Secao titulo="Vigor por satélite" />
      {vigor ? (
        <Pressable style={({ pressed }) => [estilos.item, { borderLeftWidth: 8, borderLeftColor: faixaDe(vigor.ultimo.ndvi).cor }, pressed && { opacity: 0.8 }]} onPress={() => navegacao.navigate('SateliteTalhao', { id: a.id })} accessibilityRole="button">
          <Text style={estilos.itemTitulo}>
            NDVI {textoNdvi(vigor.ultimo.ndvi)} ({faixaDe(vigor.ultimo.ndvi).rotulo}) em {doBanco(vigor.ultimo.data)}
            {vigor.variacao != null ? ` · ${textoVariacaoNdvi(vigor.variacao)}` : ''}
          </Text>
          {vigor.queda && <Text style={[estilos.nota, { color: cores.erro, fontWeight: '700' }]}>Queda de vigor em relação às imagens anteriores: vale olhar o talhão.</Text>}
          <Text style={[estilos.nota, { color: cores.primaria, fontWeight: '700' }]}>Ver a imagem e o histórico ›</Text>
        </Pressable>
      ) : (
        <Botao titulo="🛰  Vigor da lavoura por satélite" tipo="secundario" onPress={() => navegacao.navigate('SateliteTalhao', { id: a.id })} />
      )}

      <AguaDoTalhao areaId={a.id} fazendaId={a.fazenda_id} aoLancar={(lamina) => navegacao.push('AtividadeForm', { areaId: a.id, irrigar: { lamina } })} />

      <Secao titulo="Pragas e doenças" />
      <Botao titulo="📷  Foto da planta (praga, doença ou deficiência)" tipo="secundario" onPress={() => navegacao.navigate('MonitoramentoForm', { areaId: a.id })} />
      {pragas.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma ocorrência em aberto neste talhão.</Text>
      ) : (
        pragas.map((m: any) => (
          <Pressable key={m.id} style={({ pressed }) => [estilos.item, pressed && { opacity: 0.8 }]} onPress={() => navegacao.navigate('MonitoramentoDetalhe', { id: m.id })} accessibilityRole="button">
            <Text style={estilos.itemTitulo}>{tituloOcorrencia(m)}</Text>
            <Text style={estilos.nota}>
              Nº {m.numero} · {doBanco(m.data)}
              {textoNivel(m) ? ` · ${textoNivel(m)}` : ''} · em aberto
            </Text>
          </Pressable>
        ))
      )}

      <Secao titulo="Análises de solo e foliar" />
      <Botao titulo="📷  Nova análise (foto do laudo ou digitar)" tipo="secundario" onPress={() => navegacao.navigate('AnaliseForm', { areaId: a.id })} />
      {analises.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma análise registrada. Com a análise, o sistema calcula a calagem e a adubação e a IA dá o parecer.</Text>
      ) : (
        analises.map((x: any) => (
          <Pressable key={x.id} style={({ pressed }) => [estilos.item, pressed && { opacity: 0.8 }]} onPress={() => navegacao.navigate('AnaliseDetalhe', { id: x.id })} accessibilityRole="button">
            <Text style={estilos.itemTitulo}>
              {x.tipo === 'solo' ? `Solo ${x.profundidade ?? ''}` : 'Foliar'} · {doBanco(x.data)}
              {x.laboratorio ? ` · ${x.laboratorio}` : ''}
            </Text>
            <Text style={estilos.nota}>
              {[
                x.ph != null && `pH ${formatarQtd(x.ph, 2)}`,
                x.n != null && `N ${formatarQtd(x.n)}`,
                x.p != null && `P ${formatarQtd(x.p)}`,
                x.k != null && `K ${formatarQtd(x.k)}`,
                x.ca != null && `Ca ${formatarQtd(x.ca)}`,
                x.mg != null && `Mg ${formatarQtd(x.mg)}`,
                x.mo != null && `MO ${formatarQtd(x.mo)}`,
                x.v != null && `V% ${formatarQtd(x.v)}`,
              ]
                .filter(Boolean)
                .join(' · ') || 'Sem valores'}
            </Text>
            {x.observacoes ? <Text style={estilos.nota}>{x.observacoes}</Text> : null}
            <Text style={[estilos.nota, { color: cores.primaria, fontWeight: '700' }]}>{x.parecer ? 'Ver as contas e o parecer ›' : 'Ver a calagem, a adubação e pedir o parecer ›'}</Text>
          </Pressable>
        ))
      )}
      <Botao titulo="✏️  Alterar ou excluir este talhão" tipo="secundario" onPress={() => navegacao.push('TalhaoForm', { abrirId: a.id })} />
    </Tela>
  );
}

/** Água no solo do talhão pelo balanço hídrico. Carrega à parte e some se não der para ler o tempo (não atrapalha o painel). */
function AguaDoTalhao({ areaId, fazendaId, aoLancar }: { areaId: string; fazendaId: string; aoLancar: (lamina: number) => void }) {
  const [t, setT] = useState<AguaTalhao | null>(null);
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      localDaFazenda(fazendaId)
        .then((l) => (l ? aguaDosTalhoes(fazendaId, l, areaId) : []))
        .then(
          (r) => vivo && setT(r[0] ?? null),
          () => undefined,
        );
      return () => {
        vivo = false;
      };
    }, [areaId, fazendaId]),
  );
  if (!t) return null;
  return (
    <>
      <Secao titulo="Água no solo" />
      <QuadroAgua t={t} comNome={false} aoLancar={aoLancar} />
    </>
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
function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '800', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }]}>{b}</Text>
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
  nome: { fontSize: tam.subtitulo + 3, fontWeight: '800', color: cores.primariaEscura },
  cultura: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  cardDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
  subtitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto, marginTop: 4 },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 3 },
  itemTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
});
