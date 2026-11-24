import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSessao } from '../contexto/SessaoContext';
import { GRAU3_DA_ABA, carregarBalancete, idsDaUnidade, periodoDe, r2, type ContaBalancete } from '../lib/balancete';
import { formatarMoeda } from '../lib/formatos';
import type { NavPilha } from '../navegacao/rotas';
import { cores, tam } from '../tema';

/**
 * V173: no alto das abas Agrícola, Pecuário e Financeiro, a soma das contas de grau 3 (centros de custo)
 * da unidade em uso no ano. Tocando numa delas, abre a relação dos lançamentos (Atividades, compras, títulos...).
 * Só para quem vê o Financeiro. No Particular não aparece (vai ao Patrimônio Líquido).
 */
export default function CentrosDaAba({ chave }: { chave: string }) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, modoAdm } = useSessao();
  const [contas, setContas] = useState<ContaBalancete[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const finais = GRAU3_DA_ABA[chave];
  const mostrar = chave in GRAU3_DA_ABA && !!fazendaAtiva && fazendaAtiva.financeiro !== false && fazendaAtiva.tipo !== 'particular' && !(modoAdm && finais);
  const ids = idsDaUnidade(fazendaAtiva?.id, modoAdm);
  const chaveIds = ids.join(',');

  useFocusEffect(
    useCallback(() => {
      if (!mostrar) return;
      const { de, ate } = periodoDe('ano');
      let vivo = true;
      setErro(null);
      carregarBalancete(chaveIds.split(','), de, ate, 3)
        .then((c) => vivo && setContas(c.filter((x) => x.grau === 3 && (!finais || finais.includes(x.codigo.split('.')[2])))))
        .catch((e) => vivo && setErro(e.message));
      return () => {
        vivo = false;
      };
    }, [mostrar, chaveIds, finais]),
  );

  if (!mostrar) return null;
  const receitas = (contas ?? []).filter((c) => c.codigo.startsWith('3.'));
  const custos = (contas ?? []).filter((c) => c.codigo.startsWith('4.'));
  // no Financeiro as contas sem movimento ficam de fora (são muitas); nas outras abas aparecem as duas
  const lista = (l: ContaBalancete[]) => (finais ? l : l.filter((c) => c.valor !== 0));
  const soma = (l: ContaBalancete[]) => r2(l.reduce((t, c) => t + c.valor, 0));
  const resultado = r2(soma(receitas) - soma(custos));
  const ano = periodoDe('ano').de.slice(0, 4);

  const linha = (c: ContaBalancete) => (
    <Pressable
      key={c.codigo}
      onPress={() => navegacao.navigate('LancamentosConta', { codigo: c.codigo, nome: c.nome, periodo: 'ano' })}
      accessibilityRole="button"
      style={({ pressed }) => [estilos.linha, pressed && { backgroundColor: '#F3F6F2' }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={estilos.nome}>{c.nome}</Text>
        <Text style={estilos.codigo}>
          {c.codigo} · {c.qtde} {c.qtde === 1 ? 'lançamento' : 'lançamentos'}
        </Text>
      </View>
      <Text style={[estilos.valor, c.codigo.startsWith('3.') && { color: cores.primaria }]}>{formatarMoeda(c.valor)}</Text>
      <Ionicons name="chevron-forward" size={18} color={cores.textoSuave} />
    </Pressable>
  );

  return (
    <View style={estilos.quadro}>
      <Text style={estilos.titulo}>Centros de custo · {ano}</Text>
      {erro ? (
        <Text style={estilos.erro}>{erro}</Text>
      ) : !contas ? (
        <ActivityIndicator color={cores.primaria} style={{ marginVertical: 8 }} />
      ) : (
        <>
          {lista(receitas).length > 0 && <Text style={estilos.grupo}>Receitas</Text>}
          {lista(receitas).map(linha)}
          {lista(custos).length > 0 && <Text style={estilos.grupo}>Custos e despesas</Text>}
          {lista(custos).map(linha)}
          {!lista(receitas).length && !lista(custos).length && <Text style={estilos.nota}>Nenhum lançamento neste ano.</Text>}
          <View style={estilos.fecho}>
            <Text style={estilos.fechoRotulo}>Receitas − custos</Text>
            <Text style={[estilos.fechoValor, resultado < 0 && { color: cores.erro }]}>{formatarMoeda(resultado)}</Text>
          </View>
          <Text style={estilos.nota}>Regime de competência (data do lançamento). Toque numa conta para ver os lançamentos e mudar o período.</Text>
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 4, marginBottom: tam.espaco },
  titulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  grupo: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave, marginTop: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cores.borda },
  nome: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  codigo: { fontSize: tam.pequeno, color: cores.textoSuave },
  valor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  fecho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 10, marginTop: 6 },
  fechoRotulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
  fechoValor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
