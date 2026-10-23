import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Botao from '../../componentes/Botao';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { useSessao } from '../../contexto/SessaoContext';
import { nomeUnidade as nomeDaUnidade } from '../../lib/unidades';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { nomeUnidade } from '../../lib/insumos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const VAZIO = '–';
const SITUACAO: Record<string, string> = { confirmada: 'Confirmada', a_completar: 'Entrada rápida: a completar', aberta: 'Aberta', cancelada: 'Cancelada' };

/** Uma compra na Consulta: todos os dados. Só mostra. */
export default function CompraDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'CompraDetalhe'>>();
  const { fazendas } = useSessao();
  const [c, setC] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** frete à parte: as compras que esta nota de frete transportou, e os fretes que esta compra recebeu */
  const [transportadas, setTransportadas] = useState<any[]>([]);
  const [fretes, setFretes] = useState<any[]>([]);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: c ? `Compra nº ${c.numero}` : 'Compra' });
  }, [navegacao, c]);

  useFocusEffect(
    useCallback(() => {
      consulta<any>(
        supabase
          .from('compras')
          .select(
            '*, pessoa:pessoas ( nome ), comprador:documentos_comprador ( nome, cpf_cnpj ), conta:plano_contas ( nome ), tipo_desp:tipos_lancamento ( nome ), banco:contas_bancarias ( nome ),' +
              ' itens:compra_itens ( *, insumo:insumos ( nome, conteudo_medida, unidade_dose ) ), rateio:compra_rateios ( percentual, centro:centros_custo ( codigo, nome ) ),' +
              ' parcelas:lancamentos ( parcela, valor, valor_pago, data_vencimento, situacao, data_pagamento )',
          )
          .eq('id', params.id)
          .single(),
      )
        .then(setC)
        .catch((e) => setErro(traduzirErro(e)));
      // frete à parte, dos dois lados
      (async () => {
        try {
          const [lig, rec] = await Promise.all([
            consulta<any[]>(supabase.from('compra_fretes').select('compra_id, valor_rateado').eq('frete_compra_id', params.id)),
            consulta<any[]>(supabase.from('compra_fretes').select('frete_compra_id, valor_rateado').eq('compra_id', params.id)),
          ]);
          const ids = [...lig.map((x) => x.compra_id), ...rec.map((x) => x.frete_compra_id)];
          const cs = ids.length ? await consulta<any[]>(supabase.from('compras').select('id, numero, data, numero_documento, pessoa:pessoas ( nome )').in('id', ids)) : [];
          const com = (cid: string, valor: any) => ({ ...(cs.find((x) => x.id === cid) ?? { id: cid }), valor: Number(valor) });
          setTransportadas(lig.map((x) => com(x.compra_id, x.valor_rateado)).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)));
          setFretes(rec.map((x) => com(x.frete_compra_id, x.valor_rateado)).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)));
        } catch {
          /* a compra aparece mesmo sem o quadro do frete */
        }
      })();
    }, [params.id]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!c) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const itens = c.itens as any[];
  const somaItens = itens.reduce((s, i) => s + Number(i.valor_total ?? 0), 0);
  const parcelas = ((c.parcelas as any[]) ?? []).sort((a, b) => a.parcela - b.parcela);
  const custoNota = itens.reduce((s, i) => s + Number(i.custo_total ?? i.valor_total ?? 0), 0);
  const ligada = (x: any, rotulo: string) => (
    <Pressable key={x.id} onPress={() => navegacao.push('CompraDetalhe', { id: x.id })} style={({ pressed }) => [estilos.item, pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={estilos.itemNome}>
          Compra nº {x.numero ?? '?'}
          {x.data ? ` · ${doBanco(x.data)}` : ''}
        </Text>
        <Text style={estilos.itemValor}>{formatarMoeda(x.valor)}</Text>
      </View>
      <Text style={estilos.nota}>{[um(x.pessoa)?.nome, x.numero_documento ? `Nota ${x.numero_documento}` : null, rotulo].filter(Boolean).join(' · ')}</Text>
    </Pressable>
  );

  return (
    <Tela>
      <View style={estilos.cartao}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={estilos.rotulo}>Compra nº</Text>
            <Text style={estilos.codigo}>{c.numero}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.rotulo}>Data</Text>
            <Text style={estilos.data}>{doBanco(c.data)}</Text>
          </View>
        </View>
        <Text style={estilos.total}>{formatarMoeda(Number(c.valor_total))}</Text>
        <Text style={[estilos.nota, c.situacao === 'a_completar' && { color: cores.cafe, fontWeight: '700' }]}>{SITUACAO[c.situacao] ?? c.situacao}</Text>
      </View>

      <Dado rotulo="De quem é" valor={nomeDaUnidade(c.fazenda_id, fazendas)} />
      <Dado rotulo="Fornecedor" valor={um(c.pessoa)?.nome} />
      <Dado rotulo="Nº da nota / documento" valor={c.numero_documento} />
      {c.chave_nfe ? <Dado rotulo="Chave da NF-e" valor={c.chave_nfe.replace(/(\d{4})(?=\d)/g, '$1 ')} /> : null}
      {c.arquivo_documento ? (
        <Botao
          titulo="📷  Ver a foto da nota"
          tipo="secundario"
          onPress={async () => {
            const { data: u, error } = await supabase.storage.from('documentos').createSignedUrl(c.arquivo_documento, 600);
            if (error || !u?.signedUrl) return setErro('Não foi possível abrir a foto da nota.');
            Linking.openURL(u.signedUrl);
          }}
        />
      ) : null}

      {c.tipo === 'animais' && (
        <>
          <Secao titulo="Compra de animais" />
          <Dado rotulo="Cabeças" valor={formatarNumero(Number(c.cabecas ?? 0))} />
          {c.peso_bruto_kg != null ? <Dado rotulo="Peso total" valor={`${formatarNumero(Number(c.peso_bruto_kg), 2)} kg${Number(c.cabecas) ? ` · ${formatarNumero(Number(c.peso_bruto_kg) / Number(c.cabecas), 1)} kg por cabeça` : ''}`} /> : null}
          {c.barriga_tipo ? <Dado rotulo="Desconto de barriga" valor={`${c.barriga_tipo === 'perc' ? `${formatarNumero(Number(c.barriga_valor), 2)}%` : `${formatarNumero(Number(c.barriga_valor), 2)} kg por cabeça`} · peso para a conta ${formatarNumero(Number(c.peso_liquido_kg), 2)} kg`} /> : null}
          {c.arrobas != null ? <Dado rotulo={`Arrobas (de ${formatarNumero(Number(c.kg_arroba), 2)} kg)`} valor={`${formatarNumero(Number(c.arrobas), 2)} @`} /> : null}
          <Dado rotulo={`Preço por ${c.forma_preco === 'arroba' ? 'arroba' : c.forma_preco === 'kg' ? 'kg vivo' : 'cabeça'}`} valor={formatarMoeda(Number(c.preco))} />
          {Number(c.cabecas) ? <Dado rotulo="Custo por cabeça" valor={formatarMoeda(itens.reduce((s, i) => s + Number(i.custo_total ?? i.valor_total ?? 0), 0) / Number(c.cabecas))} /> : null}
          <Text style={estilos.nota}>Lançada em Pecuário › Movimentações › Compra, junto com a entrada dos animais.</Text>
        </>
      )}
      <Secao titulo="Itens" />
      {itens.map((i) => (
        <View key={i.id} style={estilos.item}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={estilos.itemNome}>{i.tipo_item === 'insumo' ? um(i.insumo)?.nome ?? 'Produto' : i.tipo_item === 'animal' ? `Bovinos · ${formatarNumero(Number(i.quantidade))} cab.` : i.descricao ?? 'Serviço'}</Text>
            <Text style={estilos.itemValor}>{formatarMoeda(Number(i.valor_total))}</Text>
          </View>
          {i.tipo_item === 'insumo' && (
            <Text style={estilos.nota}>
              {formatarQtd(i.quantidade)} {i.unidade} × {formatarMoeda(Number(i.valor_unitario))}
              {Number(i.embalagens) > 0 && Number(i.conteudo_embalagem) > 0
                ? ` · veio em ${formatarQtd(i.embalagens)} ${nomeUnidade(i.unidade)} de ${formatarQtd(i.conteudo_embalagem)} ${um(i.insumo)?.conteudo_medida ?? um(i.insumo)?.unidade_dose ?? ''}`
                : ''}
              {i.lote_fabricacao ? ` · lote ${i.lote_fabricacao}` : ''}
              {i.validade ? ` · validade ${doBanco(i.validade)}` : ''}
            </Text>
          )}
          {i.custo_total != null && Math.abs(Number(i.custo_total) - Number(i.valor_total)) > 0.004 && (
            <Text style={estilos.nota}>
              {[
                Number(i.frete_rateado) ? `frete ${formatarMoeda(Number(i.frete_rateado))}` : null,
                Number(i.frete_aparte) ? `frete à parte ${formatarMoeda(Number(i.frete_aparte))}` : null,
                Number(i.acessorios_rateados) > 0 ? `despesas ${formatarMoeda(Number(i.acessorios_rateados))}` : Number(i.acessorios_rateados) < 0 ? `desconto −${formatarMoeda(-Number(i.acessorios_rateados))}` : null,
                Number(i.ipi) ? `IPI ${formatarMoeda(Number(i.ipi))}` : null,
                Number(i.icms_st) ? `ICMS-ST ${formatarMoeda(Number(i.icms_st))}` : null,
                Number(i.credito_icms) ? `crédito ICMS −${formatarMoeda(Number(i.credito_icms))}` : null,
                Number(i.credito_ipi) ? `crédito IPI −${formatarMoeda(Number(i.credito_ipi))}` : null,
                Number(i.credito_pis) + Number(i.credito_cofins) ? `crédito PIS/COFINS −${formatarMoeda(Number(i.credito_pis) + Number(i.credito_cofins))}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              {'\n'}Custo {formatarMoeda(Number(i.custo_total))}
              {i.tipo_item === 'insumo' && i.custo_unitario != null && Number(i.quantidade) !== 1 ? ` · ${formatarMoeda(Number(i.custo_unitario))} por ${i.unidade}` : ''}
            </Text>
          )}
        </View>
      ))}
      <Dado rotulo="Soma dos itens" valor={formatarMoeda(somaItens)} />
      <Dado rotulo="Frete" valor={formatarMoeda(Number(c.frete ?? 0))} />
      {Number(c.seguro) ? <Dado rotulo="Seguro" valor={formatarMoeda(Number(c.seguro))} /> : null}
      <Dado rotulo="Outras despesas" valor={formatarMoeda(Number(c.outras_despesas ?? 0))} />
      {Number(c.acrescimo_financeiro) ? <Dado rotulo="Acréscimo financeiro" valor={formatarMoeda(Number(c.acrescimo_financeiro))} /> : null}
      {Number(c.ipi) ? <Dado rotulo="IPI" valor={formatarMoeda(Number(c.ipi))} /> : null}
      {Number(c.icms_st) ? <Dado rotulo="ICMS-ST" valor={formatarMoeda(Number(c.icms_st))} /> : null}
      <Dado rotulo="Desconto" valor={formatarMoeda(Number(c.desconto ?? 0))} />
      <Dado rotulo="Total" valor={formatarMoeda(Number(c.valor_total))} />
      <Dado rotulo="Nota em nome de" valor={um(c.comprador) ? `${um(c.comprador).nome} · ${um(c.comprador).cpf_cnpj}` : null} />
      {Number(c.credito_icms) + Number(c.credito_ipi) + Number(c.credito_pis) + Number(c.credito_cofins) > 0 && (
        <>
          <Secao titulo="Créditos a recuperar" />
          {Number(c.credito_icms) ? <Dado rotulo="ICMS" valor={formatarMoeda(Number(c.credito_icms))} /> : null}
          {Number(c.credito_ipi) ? <Dado rotulo="IPI" valor={formatarMoeda(Number(c.credito_ipi))} /> : null}
          {Number(c.credito_pis) ? <Dado rotulo="PIS" valor={formatarMoeda(Number(c.credito_pis))} /> : null}
          {Number(c.credito_cofins) ? <Dado rotulo="COFINS" valor={formatarMoeda(Number(c.credito_cofins))} /> : null}
        </>
      )}

      {transportadas.length > 0 && (
        <>
          <Secao titulo="Frete à parte: compras transportadas" />
          <Text style={estilos.nota}>
            Esta nota é o frete das compras abaixo. O custo dela ({formatarMoeda(custoNota)}) foi rateado no custo dos itens delas, pelo valor de cada item.
          </Text>
          {transportadas.map((x) => ligada(x, 'recebeu do frete'))}
        </>
      )}
      {fretes.length > 0 && (
        <>
          <Secao titulo="Frete à parte recebido" />
          {fretes.map((x) => ligada(x, 'frete rateado nos itens desta compra'))}
          <Dado rotulo="Custo dos itens com o frete à parte" valor={formatarMoeda(custoNota)} />
        </>
      )}

      <Secao titulo="Classificação" />
      {c.tipo === 'despesa' ? <Dado rotulo="Tipo de despesa" valor={um(c.tipo_desp)?.nome ?? um(c.conta)?.nome} /> : <Dado rotulo="Classificação" valor={um(c.conta)?.nome ?? 'Automática, pelos produtos'} />}
      {(c.rateio as any[]).length === 0 ? (
        <Dado rotulo="Centros de custo" valor={null} />
      ) : (
        (c.rateio as any[]).map((r, k) => (
          <Dado key={k} rotulo={`${um(r.centro)?.codigo ?? ''} ${um(r.centro)?.nome ?? ''}`.trim()} valor={`${formatarNumero(Number(r.percentual), 2)}% · ${formatarMoeda((Number(c.valor_total) * Number(r.percentual)) / 100)}`} />
        ))
      )}

      <Secao titulo="Pagamento" />
      <Dado rotulo="Conta bancária" valor={um(c.banco)?.nome} />
      <Dado rotulo="Forma" valor={c.pago_na_hora ? 'Paga na hora' : c.forma_pagamento === 'prazo' ? (c.tipo === 'despesa' ? 'A pagar' : 'A prazo / parcelado') : c.forma_pagamento === 'avista' ? 'À vista' : null} />
      {parcelas.map((p) => (
        <Dado
          key={p.parcela}
          rotulo={`${p.parcela}ª · vence ${doBanco(p.data_vencimento)}`}
          valor={`${formatarMoeda(Number(p.valor))} · ${p.situacao === 'pago' ? `paga ${doBanco(p.data_pagamento)}` : p.situacao === 'cancelado' ? 'cancelada' : p.situacao === 'parcial' ? `paga em parte (${formatarMoeda(Number(p.valor_pago ?? 0))})` : 'em aberto'}`}
        />
      ))}

      <Secao titulo="Outros" />
      <Dado rotulo="Observações" valor={c.observacoes} />
      <Botao
        titulo={c.tipo === 'animais' ? '✏️  Excluir pela entrada dos animais' : '✏️  Alterar ou excluir esta compra'}
        tipo="secundario"
        onPress={async () => {
          if (c.tipo !== 'animais') return navegacao.push('CompraForm', { abrirId: c.id });
          // compra de animais nasce na movimentação de entrada: é lá que se desfaz (animais + compra + contas a pagar)
          const { data: m } = await supabase.from('movimentacoes').select('id').eq('compra_id', c.id).maybeSingle();
          if (m?.id) navegacao.navigate('MovimentacaoDetalhe', { id: m.id });
          else setErro('Não achei a entrada dos animais desta compra.');
        }}
      />
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
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 3 },
  itemNome: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemValor: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
