import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Secao from '../../componentes/Secao';
import CampoMoeda from '../../componentes/CampoMoeda';
import QuadroDiagnostico from '../../componentes/QuadroDiagnostico';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero } from '../../lib/formatos';
import { abrirFotoDocumento } from '../../lib/documentos';
import { PARAMETROS_CORRETIVO, PARAMETROS_ORGANICO, diagnosticoCorretivo, diagnosticoOrganico, entregaOrganico, prntDoLaudo, tipoCalcario } from '../../lib/diagnostico';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/**
 * V166 · Laudo de adubo orgânico ou de calcário: resultados, o que está fora do padrão, as sugestões
 * e a conta do custo (por kg de nutriente no orgânico; custo efetivo pelo PRNT no calcário).
 */
export default function LaudoInsumoDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'LaudoInsumoDetalhe'>>();
  const [l, setL] = useState<any>(null);
  const [preco, setPreco] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: l ? (l.tipo === 'organico' ? 'Laudo do adubo orgânico' : 'Laudo do calcário') : 'Laudo' });
  }, [navegacao, l]);

  useFocusEffect(
    useCallback(() => {
      consulta<any>(supabase.from('laudos_insumo').select('*, insumo:insumos ( nome )').eq('id', params.id).single())
        .then(setL)
        .catch((e) => setErro(traduzirErro(e)));
    }, [params.id]),
  );

  if (!l) return <Tela rolar={false}>{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}</Tela>;

  const org = l.tipo === 'organico';
  const v = (l.dados ?? {}) as Record<string, number>;
  const diag = org ? diagnosticoOrganico(v, l.base) : diagnosticoCorretivo(v);
  const lista = (org ? PARAMETROS_ORGANICO : PARAMETROS_CORRETIVO).filter((p) => v[p.chave] != null);
  const ins = Array.isArray(l.insumo) ? l.insumo[0] : l.insumo;
  const entrega = org ? entregaOrganico(v, l.base) : [];
  const prnt = org ? null : prntDoLaudo(v);
  const pr = lerNumero(preco);

  function excluir() {
    Alert.alert('Excluir laudo', `Excluir este laudo de ${doBanco(l.data)}? O cadastro do produto não muda.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('laudos_insumo').delete().eq('id', l.id);
          if (error) return setErro(traduzirErro(error));
          navegacao.goBack();
        },
      },
    ]);
  }

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>
          {org ? 'Adubo orgânico' : 'Calcário'} · {doBanco(l.data)}
        </Text>
        <Text style={estilos.nota}>{[ins?.nome ? `Produto: ${ins.nome}` : 'Sem produto do estoque ligado', l.fornecedor, l.amostra].filter(Boolean).join(' · ')}</Text>
        <Text style={estilos.nota}>{[l.laboratorio, l.numero_laudo ? `laudo ${l.numero_laudo}` : null].filter(Boolean).join(' · ') || 'Laboratório não informado'}</Text>
        {!org && v.mgo != null && <Text style={estilos.nota}>Tipo: {tipoCalcario(v.mgo)}</Text>}
        {l.arquivo_documento ? (
          <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(l.arquivo_documento)) && setErro('Não foi possível abrir o laudo.')}>
            📄 Ver o laudo
          </Text>
        ) : null}
        <Text style={estilos.link} onPress={() => navegacao.navigate('LaudoForm', { abrirId: l.id })}>
          Alterar os valores
        </Text>
      </View>

      <QuadroDiagnostico diagnostico={diag} />

      <Secao titulo="Resultados" />
      {lista.map((p) => (
        <View key={p.chave} style={estilos.par}>
          <Text style={estilos.parRotulo}>{p.rotulo}</Text>
          <Text style={estilos.parValor}>
            {formatarNumero(v[p.chave], p.casas)} {p.unidade}
          </Text>
        </View>
      ))}

      <Secao titulo={org ? 'O que entrega e quanto custa' : 'Custo efetivo'} />
      <View style={estilos.quadro}>
        <CampoMoeda rotulo={`Preço da tonelada${org ? ' (como vem, com frete)' : ' posto na fazenda'} (R$)`} valor={preco} aoMudar={setPreco} />
        {org ? (
          entrega.length ? (
            entrega.map((e) => (
              <View key={e.chave} style={estilos.par}>
                <Text style={estilos.parRotulo}>{e.rotulo}</Text>
                <Text style={estilos.parValor}>
                  {formatarNumero(e.kg, 1)} kg/t{pr && e.kg > 0 ? ` · ${formatarMoeda(pr / e.kg)} por kg` : ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={estilos.nota}>O laudo não trouxe N, P₂O₅ ou K₂O.</Text>
          )
        ) : prnt ? (
          <>
            <Text style={estilos.resultado}>PRNT {formatarNumero(prnt, 1)}%</Text>
            {pr ? (
              <Text style={estilos.texto}>
                Custo efetivo: {formatarMoeda((pr / prnt) * 100)} por tonelada de PRNT 100. Compare com outros calcários pela mesma conta (preço ÷ PRNT × 100).
              </Text>
            ) : (
              <Text style={estilos.nota}>Informe o preço para ver o custo efetivo e comparar com outros calcários.</Text>
            )}
          </>
        ) : (
          <Text style={estilos.nota}>Sem PRNT no laudo (nem as peneiras e o PN para calcular).</Text>
        )}
      </View>
      {l.observacoes ? <Text style={estilos.nota}>Observação: {l.observacoes}</Text> : null}

      <Botao titulo="Excluir laudo" tipo="perigo" onPress={excluir} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 6 },
  titulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  par: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  parRotulo: { fontSize: tam.pequeno + 1, color: cores.textoSuave, flex: 1 },
  parValor: { fontSize: tam.texto, color: cores.texto, fontWeight: '700' },
  quadro: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  resultado: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  texto: { fontSize: tam.texto, color: cores.texto, lineHeight: 24 },
});
