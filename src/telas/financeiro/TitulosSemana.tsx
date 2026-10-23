import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Resumo from '../../componentes/Resumo';
import { useSessao } from '../../contexto/SessaoContext';
import { traduzirErro } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/formatos';
import { linhasTitulo } from '../../lib/titulos';
import { nomeUnidade } from '../../lib/unidades';
import { lerTitulosSemana, type ResumoTitulos, type TituloPainel } from '../../lib/painel';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** Aberta pelo painel: títulos a pagar ou a receber vencidos, de hoje e dos próximos 7 dias, cada grupo com o seu total. */
export default function TitulosSemana() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'TitulosSemana'>>();
  const { fazendas } = useSessao();
  const receber = params.tipo === 'receber';
  const [r, setR] = useState<ResumoTitulos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ids = fazendas.map((f) => f.id).join(',');

  useLayoutEffect(() => {
    navegacao.setOptions({ title: receber ? 'Contas a receber' : 'Contas a pagar' });
  }, [navegacao, receber]);

  useFocusEffect(
    useCallback(() => {
      lerTitulosSemana(ids.split(','), params.tipo)
        .then(setR)
        .catch((e) => setErro(traduzirErro(e)));
    }, [ids, params.tipo]),
  );

  const linha = (t: TituloPainel) => (
    <Linha
      key={t.id}
      titulo={`Nº ${t.numero} · ${t.descricao ?? 'Título'}`}
      linhas={[...linhasTitulo({ ...t, tipo: params.tipo } as any), nomeUnidade(t.fazenda_id, fazendas)]}
      direita={formatarMoeda(t.saldo)}
      onPress={() => navegacao.navigate('TituloDetalhe', { id: t.id })}
    />
  );

  const grupo = (titulo: string, lista: TituloPainel[], total: number, alerta = false) => (
    <>
      <Text style={[estilos.titulo, alerta && lista.length > 0 && { color: cores.erro }]}>{titulo}</Text>
      <Resumo esquerda={lista.length === 1 ? '1 título' : `${lista.length} títulos`} direita={formatarMoeda(total)} />
      {lista.length > 0 && <Lista>{lista.map(linha)}</Lista>}
    </>
  );

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!r && !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 24 }} />}
      {r && (
        <>
          <View style={estilos.total}>
            <Text style={estilos.totalNome}>Total (vencidos + hoje + 7 dias)</Text>
            <Text style={estilos.totalValor}>{formatarMoeda(r.total)}</Text>
          </View>
          {grupo('Vencidos', r.vencidos, r.totalVencidos, true)}
          {grupo('Hoje', r.hoje, r.totalHoje)}
          {grupo('Próximos 7 dias (sem hoje)', r.proximos, r.totalProximos)}
          <Botao
            titulo={receber ? 'Abrir o Contas a receber' : 'Abrir o Contas a pagar'}
            tipo="secundario"
            onPress={() => navegacao.navigate('TituloForm', { tipo: params.tipo, aba: 'pagar' })}
          />
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura, marginTop: 8 },
  total: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  totalNome: { flex: 1, fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  totalValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
});
