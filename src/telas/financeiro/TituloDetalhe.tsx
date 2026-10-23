import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Secao from '../../componentes/Secao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { useSessao } from '../../contexto/SessaoContext';
import { nomeUnidade } from '../../lib/unidades';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero } from '../../lib/formatos';
import { abrirFotoDocumento } from '../../lib/documentos';
import { excluirComEstorno } from '../../lib/excluir';
import { Alert } from '../../lib/alerta';
import { ROTULO_BAIXA, saldoTitulo, textoCompetencia, textoPrazo, textosTitulo, um } from '../../lib/titulos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const VAZIO = '–';

/** Um título na Consulta: todos os dados e os pagamentos. Só mostra. */
export default function TituloDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'TituloDetalhe'>>();
  const { fazendas } = useSessao();
  const [t, setT] = useState<any>(null);
  const [baixas, setBaixas] = useState<any[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: t ? `Título nº ${t.numero}` : 'Título' });
  }, [navegacao, t]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [tit, bs] = await Promise.all([
            consulta<any>(
              supabase
                .from('lancamentos')
                .select('*, pessoa:pessoas ( nome ), compra:compras ( id, numero ), venda:vendas ( id, numero ), conta:plano_contas ( nome ), banco:contas_bancarias ( nome ), rateio:lancamento_rateios ( percentual, centro:centros_custo ( codigo, nome ) )')
                .eq('id', params.id)
                .single(),
            ),
            consulta<any[]>(supabase.from('baixas').select('*, banco:contas_bancarias ( nome )').eq('lancamento_id', params.id).order('created_at')),
          ]);
          setT(tit);
          setBaixas(bs);
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  if (erro && !t) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!t) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const tx = textosTitulo(t.tipo === 'receber' ? 'receber' : 'pagar');
  const ROTULO_SITUACAO = tx.situacao;
  const aberto = t.situacao === 'aberto' || t.situacao === 'parcial';
  const rateio = (t.rateio as any[]) ?? [];
  // título lançado direto no contas a pagar/receber (não veio de compra, venda, financiamento, colheita...)
  const avulso = !t.compra_id && !t.venda_id && !t.financiamento_id && !t.frete_id && !t.colheita_id && !t.fech_colheita_id && !t.vale_colheita_id &&
    !t.cafe_secagem_id && !t.cafe_pilagem_id && !t.cafe_movimento_id && !t.cafe_contrato_id && !t.venda_producao_id;
  function excluir() {
    Alert.alert('Excluir título', `Excluir o título nº ${t.numero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setExcluindo(true);
          const { erro: e } = await excluirComEstorno(() => supabase.rpc('excluir_titulo', { p_id: t.id }), 'id', t.id);
          setExcluindo(false);
          if (e) return setErro(e);
          navegacao.goBack();
        },
      },
    ]);
  }
  const abrir = async (caminho: string, oque: string) => !(await abrirFotoDocumento(caminho)) && setErro(`Não foi possível abrir ${oque}.`);

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={estilos.rotulo}>Título nº</Text>
            <Text style={estilos.codigo}>{t.numero}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.rotulo}>Vencimento</Text>
            <Text style={estilos.data}>{doBanco(t.data_vencimento)}</Text>
          </View>
        </View>
        <Text style={estilos.total}>{formatarMoeda(Number(t.valor))}</Text>
        <Text style={[estilos.nota, t.situacao === 'pago' && { color: cores.sucesso, fontWeight: '700' }]}>
          {ROTULO_SITUACAO[t.situacao] ?? t.situacao}
          {aberto ? ` · ${textoPrazo(t)}` : ''}
          {t.situacao === 'parcial' ? ` · saldo ${formatarMoeda(saldoTitulo(t))}` : ''}
          {t.situacao === 'pago' && t.data_pagamento ? ` em ${doBanco(t.data_pagamento)}` : ''}
        </Text>
      </View>

      <Dado rotulo="Descrição" valor={t.descricao} />
      <Dado rotulo="De qual unidade" valor={t.financiamento_id && !t.fazenda_id ? 'Fazenda da despesa a informar no financiamento' : nomeUnidade(t.fazenda_id, fazendas)} />
      <Dado rotulo={tx.pessoa} valor={um(t.pessoa)?.nome} />
      <Dado rotulo="Nº do documento" valor={t.documento} />
      <Dado rotulo="Data de emissão" valor={doBanco(t.data_emissao)} />
      {t.total_parcelas > 1 ? <Dado rotulo="Parcela" valor={`${t.parcela} de ${t.total_parcelas}`} /> : null}
      {t.vencimento_original && t.vencimento_original !== t.data_vencimento ? <Dado rotulo="Vencimento original" valor={doBanco(t.vencimento_original)} /> : null}
      {t.recorrencia_id ? <Dado rotulo="Conta contínua" valor={`Mês ${textoCompetencia(t.competencia)}${t.previsto ? ' · valor previsto' : ''}`} /> : null}
      {um(t.compra) ? (
        <Botao titulo={`Ver a compra nº ${um(t.compra).numero}`} tipo="secundario" onPress={() => navegacao.navigate('CompraDetalhe', { id: um(t.compra).id })} />
      ) : null}
      {um(t.venda) ? <Botao titulo={`Ver a venda nº ${um(t.venda).numero}`} tipo="secundario" onPress={() => navegacao.navigate('VendaDetalhe', { id: um(t.venda).id })} /> : null}
      {t.colheita_id ? <Botao titulo="Ver a colheita" tipo="secundario" onPress={() => navegacao.navigate('ColheitaDetalhe', { id: t.colheita_id })} /> : null}
      {t.cafe_secagem_id ? <Botao titulo="Ver a secagem" tipo="secundario" onPress={() => navegacao.navigate('PosColheitaDetalhe', { tipo: 'secagem', id: t.cafe_secagem_id })} /> : null}
      {t.cafe_pilagem_id ? <Botao titulo="Ver a pilagem" tipo="secundario" onPress={() => navegacao.navigate('PosColheitaDetalhe', { tipo: 'pilagem', id: t.cafe_pilagem_id })} /> : null}
      {t.fech_colheita_id ? <Botao titulo="Ver o fechamento da colheita" tipo="secundario" onPress={() => navegacao.navigate('FechamentoColheita', { id: t.fech_colheita_id })} /> : null}
      {t.arquivo_documento ? <Botao titulo="📷  Ver a foto do documento" tipo="secundario" onPress={() => abrir(t.arquivo_documento, 'a foto do documento')} /> : null}

      <Secao titulo="Classificação" />
      <Dado rotulo="Classificação" valor={um(t.conta)?.nome} />
      {rateio.length === 0 ? (
        <Dado rotulo="Centros de custo" valor={null} />
      ) : (
        rateio.map((r, k) => <Dado key={k} rotulo={`${um(r.centro)?.codigo ?? ''} ${um(r.centro)?.nome ?? ''}`.trim()} valor={`${formatarNumero(Number(r.percentual), 2)}% · ${formatarMoeda((Number(t.valor) * Number(r.percentual)) / 100)}`} />)
      )}

      <Secao titulo={`Para ${tx.pagar}`} />
      <Dado rotulo="Conta bancária / caixa prevista" valor={um(t.banco)?.nome} />
      <Dado rotulo="Linha digitável" valor={t.linha_digitavel ?? t.codigo_barras} />
      {t.pix_copia_cola ? <Dado rotulo="Pix copia e cola" valor={t.pix_copia_cola} /> : null}
      <Dado rotulo="Multa por atraso" valor={t.multa_perc != null ? `${formatarNumero(Number(t.multa_perc), 2)}%` : null} />
      <Dado rotulo="Juros" valor={t.juros_mes_perc != null ? `${formatarNumero(Number(t.juros_mes_perc), 2)}% ao mês` : null} />
      {t.agendado_para ? <Dado rotulo="Agendado no banco para" valor={doBanco(t.agendado_para)} /> : null}

      <Secao titulo={tx.Pagamentos} />
      {baixas.length === 0 && <Text style={estilos.nota}>Nenhum {tx.pagamento} lançado.</Text>}
      {baixas.map((b) => {
        const viva = b.situacao === 'pendente' || b.situacao === 'confirmada';
        return (
          <View key={b.id} style={[estilos.item, !viva && { opacity: 0.7 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={estilos.itemNome}>{doBanco(b.data)}</Text>
              <Text style={[estilos.itemValor, !viva && { textDecorationLine: 'line-through' }]}>{formatarMoeda(Number(b.valor_pago))}</Text>
            </View>
            <Text style={estilos.nota}>
              {[
                um(b.banco)?.nome,
                `do título ${formatarMoeda(Number(b.valor_principal))}`,
                Number(b.juros) ? `juros ${formatarMoeda(Number(b.juros))}` : null,
                Number(b.multa) ? `multa ${formatarMoeda(Number(b.multa))}` : null,
                Number(b.desconto) ? `desconto ${formatarMoeda(Number(b.desconto))}` : null,
                b.autenticacao ? `aut. ${b.autenticacao}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={[estilos.nota, { fontWeight: '700', color: b.situacao === 'confirmada' ? cores.sucesso : b.situacao === 'pendente' ? cores.cafe : cores.erro }]}>
              {ROTULO_BAIXA[b.situacao] ?? b.situacao}
              {b.motivo ? `: ${b.motivo}` : ''}
            </Text>
            {b.observacoes ? <Text style={estilos.nota}>{b.observacoes}</Text> : null}
            {b.arquivo_comprovante ? (
              <Text style={estilos.link} onPress={() => abrir(b.arquivo_comprovante, 'o comprovante')}>
                📷 Ver o comprovante
              </Text>
            ) : null}
          </View>
        );
      })}

      <Secao titulo="Outros" />
      <Dado rotulo="Observações" valor={t.observacoes} />

      {/* V149: alterar ou excluir daqui mesmo (o título avulso) ou pelo lançamento de origem */}
      {avulso && t.situacao !== 'pago' && t.situacao !== 'cancelado' && (
        <Botao titulo="✏️  Alterar este título" tipo="secundario" onPress={() => navegacao.push('TituloForm', { tipo: t.tipo === 'receber' ? 'receber' : 'pagar', aba: 'lancar', numero: t.numero })} />
      )}
      {avulso && <Botao titulo="Excluir este título" tipo="perigo" onPress={excluir} carregando={excluindo} />}
      {um(t.compra) ? <Botao titulo={`✏️  Alterar ou excluir pela compra nº ${um(t.compra).numero}`} tipo="secundario" onPress={() => navegacao.push('CompraForm', { abrirId: um(t.compra).id })} /> : null}
      {t.financiamento_id ? <Botao titulo="✏️  Ver o financiamento (alterar ou excluir)" tipo="secundario" onPress={() => navegacao.push('FinanciamentoForm', { abrirId: t.financiamento_id })} /> : null}
      {t.frete_id ? <Text style={estilos.nota}>Título de frete: altere ou exclua em Frota › Fretes.</Text> : null}
    </Tela>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor} selectable>{valor || VAZIO}</Text>
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
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 3 },
  itemNome: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemValor: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
