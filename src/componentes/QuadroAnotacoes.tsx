import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../lib/alerta';
import { DIAS_CUMPRIDAS, marcarCumprida, type AnotacaoCapa } from '../lib/agenda';
import { traduzirErro } from '../lib/supabase';
import { doBanco } from '../lib/datas';
import { cores, tam } from '../tema';

type Props = {
  abertas: AnotacaoCapa[];
  cumpridas: AnotacaoCapa[];
  hoje: string; // aaaa-mm-dd
  carregando: boolean;
  /** depois de marcar ou desfazer: relê a lista */
  aoMudar: () => void;
};

/**
 * V134: a caixa grande da página de rosto com as anotações de todas as agendas que a pessoa abre.
 * Fora do prazo fica em vermelho. "Cumprida" tira da lista e leva para Tarefas cumpridas,
 * que o banco apaga sozinho 3 dias depois.
 */
export default function QuadroAnotacoes({ abertas, cumpridas, hoje, carregando, aoMudar }: Props) {
  const [verCumpridas, setVerCumpridas] = useState(false);
  const [mexendo, setMexendo] = useState<string | null>(null);

  async function marcar(a: AnotacaoCapa, cumprida: boolean) {
    setMexendo(a.id);
    try {
      await marcarCumprida(a.id, cumprida);
      aoMudar();
    } catch (e) {
      Alert.alert('Não deu para gravar', traduzirErro(e));
    }
    setMexendo(null);
  }

  const atrasadas = abertas.filter((a) => a.prazo < hoje).length;

  return (
    <View style={estilos.caixa}>
      {carregando && !abertas.length ? (
        <ActivityIndicator color={cores.primaria} style={{ marginVertical: 12 }} />
      ) : !abertas.length ? (
        <Text style={estilos.vazio}>Nenhuma anotação em aberto nas agendas.</Text>
      ) : (
        <>
          <Text style={estilos.resumo}>
            {abertas.length === 1 ? '1 anotação em aberto' : `${abertas.length} anotações em aberto`}
            {atrasadas ? <Text style={{ color: cores.erro }}>{` · ${atrasadas} fora do prazo`}</Text> : null}
          </Text>
          {abertas.map((a, i) => {
            const vencida = a.prazo < hoje;
            const hojeMesmo = a.prazo === hoje;
            return (
              <View key={a.id} style={[estilos.linha, i > 0 && estilos.divisa, vencida && estilos.linhaVencida]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[estilos.onde, vencida && { color: cores.erro }]} numberOfLines={1}>
                    {a.onde}
                  </Text>
                  <Text style={[estilos.titulo, vencida && { color: cores.erro }]}>{a.titulo}</Text>
                  {a.observacao ? <Text style={estilos.obs}>{a.observacao}</Text> : null}
                  <Text style={[estilos.prazo, vencida && { color: cores.erro, fontWeight: '800' }]}>
                    {vencida ? `Venceu em ${doBanco(a.prazo)}` : hojeMesmo ? 'Prazo: hoje' : `Prazo: ${doBanco(a.prazo)}`}
                    {a.autorNome ? ` · por ${a.autorNome}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => marcar(a, true)}
                  disabled={mexendo === a.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Marcar como cumprida: ${a.titulo}`}
                  style={({ pressed }) => [estilos.botao, pressed && { opacity: 0.7 }]}
                >
                  {mexendo === a.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                  <Text style={estilos.botaoTexto}>Cumprida</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      )}

      {/* Tarefas cumpridas: ficam aqui por 3 dias e depois o banco apaga sozinho */}
      {cumpridas.length > 0 && (
        <View style={estilos.cumpridas}>
          <Pressable onPress={() => setVerCumpridas(!verCumpridas)} accessibilityRole="button" style={estilos.cabCumpridas}>
            <Ionicons name={verCumpridas ? 'chevron-down' : 'chevron-forward'} size={18} color={cores.primaria} />
            <Text style={estilos.cabCumpridasTexto}>
              Tarefas cumpridas ({cumpridas.length})
            </Text>
          </Pressable>
          {verCumpridas && (
            <>
              <Text style={estilos.nota}>Somem sozinhas {DIAS_CUMPRIDAS} dias depois de cumpridas.</Text>
              {cumpridas.map((a) => (
                <View key={a.id} style={[estilos.linha, estilos.divisa]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={estilos.onde} numberOfLines={1}>{a.onde}</Text>
                    <Text style={[estilos.titulo, estilos.riscado]}>{a.titulo}</Text>
                    <Text style={estilos.prazo}>Cumprida em {doBanco(a.feitoEm)} · prazo era {doBanco(a.prazo)}</Text>
                  </View>
                  <Pressable
                    onPress={() => marcar(a, false)}
                    disabled={mexendo === a.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Voltar para em aberto: ${a.titulo}`}
                    hitSlop={8}
                  >
                    <Text style={estilos.desfazer}>Desfazer</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, paddingHorizontal: 12, paddingVertical: 10, minHeight: 120 },
  vazio: { fontSize: tam.pequeno + 1, color: cores.textoSuave, textAlign: 'center', marginVertical: 16 },
  resumo: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave, marginBottom: 4 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  linhaVencida: { backgroundColor: cores.erroFundo, marginHorizontal: -12, paddingHorizontal: 12 },
  divisa: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  onde: { fontSize: tam.pequeno - 1, fontWeight: '800', color: cores.primaria, textTransform: 'uppercase', letterSpacing: 0.5 },
  titulo: { fontSize: tam.texto - 1, fontWeight: '600', color: cores.texto },
  obs: { fontSize: tam.pequeno, color: cores.textoSuave },
  prazo: { fontSize: tam.pequeno - 1, color: cores.cafe, fontWeight: '600' },
  riscado: { textDecorationLine: 'line-through', color: cores.textoSuave },
  botao: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: cores.primaria, borderRadius: 20, paddingHorizontal: 12, minHeight: 40 },
  botaoTexto: { color: '#FFFFFF', fontWeight: '700', fontSize: tam.pequeno },
  cumpridas: { marginTop: 8, borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 8 },
  cabCumpridas: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  cabCumpridasTexto: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primaria },
  nota: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  desfazer: { fontSize: tam.pequeno, color: cores.primaria, fontWeight: '700' },
});
