import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Botao from '../../componentes/Botao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, duracaoHoras, horaDoBanco, textoHoras } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { ICONE_ATIVIDADE, custoItem, mediosAtuais, textoDoseAplicada, tituloAtividade } from '../../lib/atividades';
import { custoOperacao } from '../../lib/maoObra';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const VAZIO = '–';
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Ficha da atividade (Consulta): tudo o que foi lançado, com o custo por local. Só mostra. */
export default function AtividadeDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AtividadeDetalhe'>>();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? `Atividade nº ${d.a.numero}` : 'Atividade' });
  }, [navegacao, d]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const a = await consulta<any>(
            supabase
              .from('atividades_agricolas')
              .select('*, maquina:imobilizados!atividades_agricolas_maquina_id_fkey ( numero, nome ), implemento:imobilizados!atividades_agricolas_implemento_id_fkey ( numero, nome )')
              .eq('id', params.id)
              .single(),
          );
          const [areas, itens, ops] = await Promise.all([
            consulta<any[]>(supabase.from('atividade_areas').select('area_ha, plantas, percentual, area:areas ( id, nome, tipo ), centro:centros_custo ( codigo, nome )').eq('atividade_id', params.id)),
            consulta<any[]>(supabase.from('atividade_insumos').select('*, insumo:insumos ( nome, unidade, categoria )').eq('atividade_id', params.id).order('ordem')),
            consulta<any[]>(supabase.from('atividade_operadores').select('horas, custo_hora, custo, pessoa:pessoas ( nome )').eq('atividade_id', params.id)),
          ]);
          const semCusto = itens.filter((i) => i.custo_unitario == null).map((i) => i.insumo_id);
          const movs = semCusto.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade, valor_unitario, data').eq('fazenda_id', a.fazenda_id).eq('tipo', 'entrada').in('insumo_id', semCusto)) : [];
          setD({ a, areas, itens, ops, medios: mediosAtuais(movs) });
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!d) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const { a, areas, itens, ops, medios } = d;
  const ha = areas.reduce((s: number, x: any) => s + Number(x.area_ha ?? 0), 0);
  const plantas = areas.reduce((s: number, x: any) => s + Number(x.plantas ?? 0), 0);
  const custos = itens.map((i: any) => (i.baixou ? custoItem(i, medios[i.insumo_id] ?? null) : null));
  const custoProd = custos.reduce((s: number, c: number | null) => s + (c ?? 0), 0);
  const custoMO = Number(a.custo_mao_obra ?? 0);
  const custoMaq = Number(a.custo_maquina ?? 0);
  const custo = custoProd + custoOperacao(a);
  const estimado = itens.some((i: any) => i.baixou && i.custo_unitario == null);
  const dur = duracaoHoras(horaDoBanco(a.hora_inicio), horaDoBanco(a.hora_fim));
  const maq = um(a.maquina);
  const imp = um(a.implemento);

  return (
    <Tela>
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>
          {ICONE_ATIVIDADE[a.tipo]} {tituloAtividade(a)}
        </Text>
        <Text style={estilos.sub}>
          Nº {a.numero} · {doBanco(a.data)}
          {a.alvo ? ` · alvo: ${a.alvo}` : ''}
        </Text>
        <View style={estilos.cards}>
          <Card rotulo="Área" valor={ha ? `${formatarNumero(ha, 2)} ha` : VAZIO} detalhe={areas.length > 1 ? `${areas.length} locais` : undefined} />
          <Card rotulo="Custo da atividade" valor={formatarMoeda(custo)} detalhe={ha && custo ? `${formatarMoeda(custo / ha)}/ha` : undefined} />
          {dur != null && <Card rotulo="Duração" valor={textoHoras(dur)} detalhe={ha ? `${formatarNumero(ha / dur, 2)} ha/h` : undefined} />}
          {plantas > 0 && <Card rotulo="Plantas" valor={formatarNumero(plantas)} />}
        </View>
        {(custoMO > 0 || custoMaq > 0) && (
          <Text style={estilos.nota}>
            {[custoProd ? `Produtos ${formatarMoeda(custoProd)}` : null, custoMO ? `mão de obra ${formatarMoeda(custoMO)}` : null, custoMaq ? `máquinas ${formatarMoeda(custoMaq)}` : null].filter(Boolean).join(' · ')}
          </Text>
        )}
        {estimado && <Text style={estilos.nota}>Algum produto não tinha valor de compra na data: o custo usa o custo médio de hoje.</Text>}
      </View>

      <Secao titulo="Onde" />
      {areas.map((x: any) => {
        const ar = um(x.area);
        const cc = um(x.centro);
        return (
          <View key={ar?.id} style={estilos.item}>
            <View style={estilos.itemLinha}>
              <Text style={estilos.itemTitulo}>{ar?.nome}</Text>
              <Text style={estilos.itemValor}>{formatarMoeda((custo * Number(x.percentual)) / 100)}</Text>
            </View>
            <Text style={estilos.nota}>
              {[ar?.tipo === 'manga' ? 'Manga' : 'Talhão', x.area_ha ? `${formatarNumero(Number(x.area_ha), 2)} ha` : null, x.plantas ? `${formatarNumero(x.plantas)} plantas` : null, `${formatarQtd(x.percentual, 2)}% do custo`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={estilos.nota}>{cc ? `Centro de custo ${cc.codigo} ${cc.nome}` : 'Sem centro de custo vinculado a este local'}</Text>
          </View>
        );
      })}

      {itens.length > 0 && (
        <>
          <Secao titulo="Produtos aplicados" />
          {itens.map((i: any, k: number) => {
            const ins = um(i.insumo);
            return (
              <View key={i.id} style={estilos.item}>
                <View style={estilos.itemLinha}>
                  <Text style={estilos.itemTitulo}>{ins?.nome}</Text>
                  <Text style={estilos.itemValor}>{custos[k] != null ? formatarMoeda(custos[k]) : i.baixou ? 'sem custo' : 'não baixou'}</Text>
                </View>
                <Text style={estilos.nota}>
                  {textoDoseAplicada(Number(i.dose), i.dose_unidade, i.dose_por)}
                  {i.dose_por === 'bomba' && a.bombas ? ` × ${formatarQtd(a.bombas)} bombas${a.bomba_litros ? ` de ${formatarQtd(a.bomba_litros)} L` : ''}` : ''}
                </Text>
                <Text style={estilos.nota}>
                  Total {formatarQtd(i.quantidade, 2)} {i.unidade}
                  {ins && i.unidade !== ins.unidade ? ` (${formatarQtd(i.quantidade_estoque, 3)} ${ins.unidade})` : ''}
                  {i.baixou ? ' · baixado do estoque' : ' · não mexeu no estoque'}
                  {i.custo_unitario != null ? ` · ${formatarMoeda(i.custo_unitario)}/${ins?.unidade}` : ''}
                </Text>
                {Number(i.retornado) > 0 && (
                  <Text style={[estilos.nota, { color: cores.primariaEscura, fontWeight: '700' }]}>
                    Voltou ao estoque {formatarQtd(i.retornado, 3)} {ins?.unidade} · consumo líquido {formatarQtd(Number(i.quantidade_estoque) - Number(i.retornado), 3)} {ins?.unidade}
                    {ha ? ` (${formatarQtd((Number(i.quantidade_estoque) - Number(i.retornado)) / ha, 2)} ${ins?.unidade}/ha)` : ''}
                  </Text>
                )}
              </View>
            );
          })}
          {itens.some((i: any) => i.baixou && Number(i.quantidade_estoque) - Number(i.retornado ?? 0) > 0.00001) && (
            <Botao titulo="↩  Retorno ao estoque (o que sobrou)" tipo="secundario" onPress={() => navegacao.push('AtividadeForm', { aba: 'retorno', numeroRetorno: a.numero })} />
          )}
        </>
      )}

      <Secao titulo="Execução" />
      <Dado rotulo="Horário" valor={a.hora_inicio ? `${horaDoBanco(a.hora_inicio)} às ${horaDoBanco(a.hora_fim) || '?'}` : null} />
      <Dado rotulo="Máquina" valor={maq ? `${maq.nome} (bem nº ${maq.numero})` : null} />
      <Dado rotulo="Implemento" valor={imp ? `${imp.nome} (bem nº ${imp.numero})` : null} />
      <Dado rotulo="Horas de máquina" valor={a.horas_maquina != null ? textoHoras(Number(a.horas_maquina)) : null} />
      <Dado
        rotulo="Custo das máquinas"
        valor={
          custoMaq
            ? `${formatarMoeda(custoMaq)} (${[a.custo_hora_maquina != null ? `máquina ${formatarMoeda(a.custo_hora_maquina)}/h` : null, a.custo_hora_implemento != null ? `implemento ${formatarMoeda(a.custo_hora_implemento)}/h` : null].filter(Boolean).join(' + ')})`
            : null
        }
      />
      {a.tipo === 'irrigacao' && <Dado rotulo="Lâmina" valor={a.lamina_mm != null ? `${formatarQtd(a.lamina_mm)} mm${ha ? ` (≈ ${formatarNumero(Number(a.lamina_mm) * ha * 10)} m³ de água)` : ''}` : null} />}
      <Dado
        rotulo="Quem fez"
        valor={ops
          .map((o: any) => {
            const nome = um(o.pessoa)?.nome;
            if (!nome) return null;
            const det = [o.horas != null ? textoHoras(Number(o.horas)) : null, o.custo != null ? formatarMoeda(o.custo) : null].filter(Boolean).join(' · ');
            return det ? `${nome} (${det})` : nome;
          })
          .filter(Boolean)
          .join(', ')}
      />
      <Dado rotulo="Custo da mão de obra" valor={custoMO ? formatarMoeda(custoMO) : null} />
      {a.observacoes ? <Text style={estilos.obs}>{a.observacoes}</Text> : null}
      <Botao titulo="✏️  Alterar ou excluir esta atividade" tipo="secundario" onPress={() => navegacao.push('AtividadeForm', { abrirId: a.id })} />
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
