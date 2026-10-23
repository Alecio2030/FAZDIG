import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Secao from '../../componentes/Secao';
import Botao from '../../componentes/Botao';
import { Alert } from '../../lib/alerta';
import { excluirComEstorno } from '../../lib/excluir';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { codigoLote, identAnimal } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { textoFormaPreco } from '../../lib/vendas';
import { custoPorSacaLotes } from '../../lib/custosCafe';
import { textoSacas } from '../../lib/posColheita';
import { rotuloTipo } from '../../lib/armazem';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const VAZIO = '–';

/** Uma venda na Consulta: todos os dados, a conta, os animais e o contas a receber. Só mostra. */
export default function VendaDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'VendaDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [v, setV] = useState<any>(null);
  const [custos, setCustos] = useState<Record<string, number | null> | null>(null);
  const [animais, setAnimais] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: v ? `Venda nº ${v.numero}` : 'Venda' });
  }, [navegacao, v]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const venda = await consulta<any>(
            supabase
              .from('vendas')
              .select(
                '*, fazenda:fazendas ( nome, razao_social, cpf_cnpj ), pessoa:pessoas ( nome ), conta:plano_contas ( nome ), banco:contas_bancarias ( nome ), lote:lotes ( numero, descricao ), pesagem:pesagens ( numero ), contrato:cafe_contratos ( id, numero, tipo ),' +
                  ' itens:venda_itens ( id, tipo_item, descricao, quantidade, unidade, valor_unitario, valor_total, cafe_lote_id, insumo:insumos ( nome ), cafe:cafe_lotes ( numero, especie, tipo, peneira ), armazem:pc_locais ( nome ) ),' +
                  ' rateio:venda_rateios ( percentual, centro:centros_custo ( codigo, nome ) ),' +
                  ' parcelas:lancamentos ( id, numero, parcela, valor, valor_pago, data_vencimento, situacao, data_pagamento )',
              )
              .eq('id', params.id)
              .single(),
          );
          setV(venda);
          if (venda.tipo === 'cafe') {
            // custo por saca de cada lote vendido (pela origem: talhão e safra); se não der para calcular, a ficha mostra só a venda
            custoPorSacaLotes(venda.fazenda_id, ((venda.itens as any[]) ?? []).map((i) => i.cafe_lote_id).filter(Boolean)).then(setCustos).catch(() => setCustos({}));
          }
          if (venda.tipo === 'animais') {
            const movs = await consulta<any[]>(supabase.from('movimentacoes').select('id').eq('venda_id', params.id));
            const its = movs.length ? await consulta<any[]>(supabase.from('movimentacao_itens').select('peso_kg, animal:animais ( numero_interno, brinco, nome, categoria )').in('movimentacao_id', movs.map((m) => m.id))) : [];
            setAnimais(its.map((i) => ({ ...um(i.animal), peso_kg: i.peso_kg })).filter((a) => a.numero_interno != null).sort((a, b) => a.numero_interno - b.numero_interno));
          }
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  function excluir() {
    Alert.alert(
      'Excluir venda',
      `Excluir a venda nº ${v.numero}?` +
        (v.tipo === 'animais' ? ' Os animais voltam para o rebanho.' : v.tipo === 'cafe' ? ' O café volta para o armazém.' : ' Produto de estoque vendido volta para o estoque.') +
        ' O contas a receber dela é apagado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setFalha(null);
            setExcluindo(true);
            const { erro: e } = await excluirComEstorno(() => supabase.rpc('excluir_venda', { p_id: v.id }), 'venda_id', String(v.id));
            setExcluindo(false);
            if (e) return setFalha(e);
            navegacao.goBack();
          },
        },
      ],
    );
  }

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!v) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const itens = (v.itens as any[]) ?? [];
  const rateio = (v.rateio as any[]) ?? [];
  const parcelas = ((v.parcelas as any[]) ?? []).sort((a, b) => a.parcela - b.parcela);
  const descontos = Number(v.funrural_valor) + Number(v.comissao) + Number(v.frete) + Number(v.outros_descontos);
  const cab = Number(v.cabecas ?? 0);
  const fatorLiquido = Number(v.valor_bruto) > 0 ? Number(v.valor_total) / Number(v.valor_bruto) : 1;
  const itensCafe = itens.filter((i) => i.tipo_item === 'cafe');
  const custoCafe = v.tipo === 'cafe' && custos && itensCafe.length && itensCafe.every((i) => custos[i.cafe_lote_id] != null) ? itensCafe.reduce((t, i) => t + Number(i.quantidade) * custos[i.cafe_lote_id]!, 0) : null;

  return (
    <Tela>
      <View style={estilos.cartao}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={estilos.rotulo}>Venda nº</Text>
            <Text style={estilos.codigo}>{v.numero}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.rotulo}>Data</Text>
            <Text style={estilos.data}>{doBanco(v.data)}</Text>
          </View>
        </View>
        <Text style={estilos.total}>{formatarMoeda(Number(v.valor_total))}</Text>
        <Text style={estilos.nota}>{v.tipo === 'animais' ? `Venda de animais · ${formatarNumero(cab)} ${cab === 1 ? 'cabeça' : 'cabeças'}` : v.tipo === 'cafe' ? `Venda de café · ${textoSacas(v.sacas)}` : 'Outros produtos e serviços'}</Text>
      </View>

      <Dado rotulo="Cliente" valor={um(v.pessoa)?.nome} />
      {um(v.fazenda)?.cpf_cnpj ? <Dado rotulo="Faturado por" valor={`${um(v.fazenda).razao_social ?? um(v.fazenda).nome} · ${um(v.fazenda).cpf_cnpj}`} /> : null}
      {um(v.contrato) ? (
        <Text style={{ fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' }} onPress={() => navegacao.navigate('ContratoCafeDetalhe', { id: um(v.contrato).id })}>
          Entrega do contrato de café nº {um(v.contrato).numero} ({um(v.contrato).tipo === 'troca' ? 'troca por insumos' : 'venda futura'}) ›
        </Text>
      ) : null}
      <Dado rotulo={v.tipo === 'animais' ? 'Nº da nota / GTA' : 'Nº da nota / documento'} valor={v.numero_documento} />

      {v.tipo === 'animais' ? (
        <>
          <Secao titulo="Conta da venda" />
          <Dado rotulo="Lote de origem" valor={um(v.lote) ? `${codigoLote(um(v.lote).numero, sigla)}${um(v.lote).descricao ? ` · ${um(v.lote).descricao}` : ''}` : null} />
          {um(v.pesagem) ? <Dado rotulo="Pesagem" valor={`nº ${um(v.pesagem).numero}`} /> : null}
          <Dado rotulo="Cabeças" valor={formatarNumero(cab)} />
          {v.peso_bruto_kg != null ? <Dado rotulo="Peso bruto" valor={`${formatarNumero(Number(v.peso_bruto_kg), 2)} kg${cab ? ` · ${formatarNumero(Number(v.peso_bruto_kg) / cab, 1)} kg por cabeça` : ''}`} /> : null}
          {v.barriga_tipo ? (
            <Dado
              rotulo="Desconto de barriga"
              valor={`${v.barriga_tipo === 'perc' ? `${formatarNumero(Number(v.barriga_valor), 2)}%` : `${formatarNumero(Number(v.barriga_valor), 2)} kg por cabeça`} · ${formatarNumero(Number(v.peso_bruto_kg) - Number(v.peso_liquido_kg), 2)} kg`}
            />
          ) : null}
          {v.barriga_tipo ? <Dado rotulo="Peso para a conta" valor={`${formatarNumero(Number(v.peso_liquido_kg), 2)} kg`} /> : null}
          {v.arrobas != null ? <Dado rotulo={`Arrobas (de ${formatarNumero(Number(v.kg_arroba), 2)} kg)`} valor={`${formatarNumero(Number(v.arrobas), 2)} @${cab ? ` · ${formatarNumero(Number(v.arrobas) / cab, 2)} @ por cabeça` : ''}`} /> : null}
          <Dado rotulo={`Preço por ${textoFormaPreco(v.forma_preco)}`} valor={formatarMoeda(Number(v.preco))} />
          <Dado rotulo="Valor da venda" valor={`${formatarMoeda(Number(v.valor_bruto))}${cab ? ` · ${formatarMoeda(Number(v.valor_bruto) / cab)} por cabeça` : ''}`} />
          {v.forma_preco !== 'arroba' && Number(v.arrobas) > 0 ? <Dado rotulo="Equivale a" valor={`${formatarMoeda(Number(v.valor_bruto) / Number(v.arrobas))} por @`} /> : null}
        </>
      ) : (
        <>
          <Secao titulo="Itens" />
          {itens.map((i) => (
            <View key={i.id} style={estilos.item}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={estilos.itemNome}>{i.tipo_item === 'insumo' ? um(i.insumo)?.nome ?? i.descricao ?? 'Produto' : i.tipo_item === 'cafe' ? `Café ${um(i.cafe)?.especie ?? ''}${um(i.cafe)?.tipo ? ` tipo ${um(i.cafe).tipo}` : ''}` : i.descricao ?? 'Item'}</Text>
                <Text style={estilos.itemValor}>{formatarMoeda(Number(i.valor_total))}</Text>
              </View>
              {i.tipo_item === 'cafe' && (
                <Text style={estilos.nota}>
                  {textoSacas(i.quantidade)} × {formatarMoeda(Number(i.valor_unitario))} · lote nº {um(i.cafe)?.numero} ({rotuloTipo(um(i.cafe) ?? {})}) · saiu de {um(i.armazem)?.nome}
                </Text>
              )}
              {i.tipo_item === 'cafe' && custos && custos[i.cafe_lote_id] != null && (
                <Text style={[estilos.nota, { fontWeight: '700' }]}>
                  Custo {formatarMoeda(custos[i.cafe_lote_id])} por saca · margem {formatarMoeda((Number(i.valor_total) * fatorLiquido) / Number(i.quantidade) - custos[i.cafe_lote_id]!)} por saca (preço líquido)
                </Text>
              )}
              {i.tipo_item === 'insumo' && (
                <Text style={estilos.nota}>
                  {formatarQtd(i.quantidade)} {i.unidade} × {formatarMoeda(Number(i.valor_unitario))} · saiu do estoque
                </Text>
              )}
            </View>
          ))}
          <Dado rotulo="Valor da venda" valor={`${formatarMoeda(Number(v.valor_bruto))}${v.tipo === 'cafe' && Number(v.sacas) ? ` · ${formatarMoeda(Number(v.valor_bruto) / Number(v.sacas))} por saca` : ''}`} />
          {v.tipo === 'cafe' && custos ? (
            custoCafe != null ? (
              <>
                <Dado rotulo="Custo das sacas vendidas" valor={`${formatarMoeda(custoCafe)} · ${formatarMoeda(custoCafe / Number(v.sacas))} por saca`} />
                <Dado rotulo="Resultado da venda (líquido − custo)" valor={`${formatarMoeda(Number(v.valor_total) - custoCafe)} · ${formatarNumero(((Number(v.valor_total) - custoCafe) / Number(v.valor_total)) * 100)}% do recebido`} />
                <Text style={estilos.nota}>Custo pela origem de cada lote (talhão e safra): lavoura, colheita, secagem, pilagem e armazenagem lançados até hoje. O detalhe está em Agrícola › Safras › Consultar.</Text>
              </>
            ) : (
              <Text style={estilos.nota}>Custo por saca ainda não disponível para algum lote desta venda (café de outra origem sem custo informado, ou safra sem sacas beneficiadas).</Text>
            )
          ) : null}
        </>
      )}

      {descontos > 0 && (
        <>
          <Secao titulo="Descontos na nota" />
          {Number(v.funrural_valor) ? <Dado rotulo={`Funrural / Senar${v.funrural_perc != null ? ` (${formatarNumero(Number(v.funrural_perc), 2)}%)` : ''}`} valor={formatarMoeda(Number(v.funrural_valor))} /> : null}
          {Number(v.comissao) ? <Dado rotulo="Comissão" valor={formatarMoeda(Number(v.comissao))} /> : null}
          {Number(v.frete) ? <Dado rotulo="Frete" valor={formatarMoeda(Number(v.frete))} /> : null}
          {Number(v.outros_descontos) ? <Dado rotulo="Outros" valor={formatarMoeda(Number(v.outros_descontos))} /> : null}
        </>
      )}
      <Dado rotulo="Valor a receber" valor={formatarMoeda(Number(v.valor_total))} />

      <Secao titulo="Classificação" />
      <Dado rotulo="Classificação" valor={um(v.conta)?.nome} />
      {rateio.length === 0 ? (
        <Dado rotulo="Centros de custo" valor={null} />
      ) : (
        rateio.map((r, k) => <Dado key={k} rotulo={`${um(r.centro)?.codigo ?? ''} ${um(r.centro)?.nome ?? ''}`.trim()} valor={`${formatarNumero(Number(r.percentual), 2)}% · ${formatarMoeda((Number(v.valor_total) * Number(r.percentual)) / 100)}`} />)
      )}

      <Secao titulo="Contas a receber" />
      <Dado rotulo="Conta bancária / caixa prevista" valor={um(v.banco)?.nome} />
      <Lista>
        {parcelas.map((p) => (
          <Linha
            key={p.id}
            titulo={`Título nº ${p.numero}${parcelas.length > 1 ? ` · ${p.parcela}ª parcela` : ''}`}
            linhas={[
              `Vence ${doBanco(p.data_vencimento)}`,
              p.situacao === 'pago' ? `Recebido em ${doBanco(p.data_pagamento)}` : p.situacao === 'parcial' ? `Recebido em parte: ${formatarMoeda(Number(p.valor_pago))}` : 'Em aberto',
            ]}
            direita={formatarMoeda(Number(p.valor))}
            onPress={() => navegacao.navigate('TituloDetalhe', { id: p.id })}
          />
        ))}
      </Lista>

      {animais.length > 0 && (
        <>
          <Secao titulo={`Animais vendidos (${formatarNumero(animais.length)})`} />
          <Text style={estilos.nota}>
            {animais
              .slice(0, 300)
              .map((a) => `${identAnimal(a)}${a.nome ? ` ${a.nome}` : ''}`)
              .join(' · ')}
            {animais.length > 300 ? ' …' : ''}
          </Text>
        </>
      )}

      <Secao titulo="Outros" />
      <Dado rotulo="Observações" valor={v.observacoes} />
      {/* V149: venda não se altera: exclui e lança de novo */}
      {falha && <Aviso tipo="erro" texto={falha} />}
      <Botao titulo="Excluir esta venda (para lançar de novo)" tipo="perigo" onPress={excluir} carregando={excluindo} />
    </Tela>
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
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  codigo: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura },
  data: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto, marginTop: 6 },
  total: { fontSize: tam.subtitulo + 4, fontWeight: '800', color: cores.cafe },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave, lineHeight: 20 },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 3 },
  itemNome: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemValor: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
