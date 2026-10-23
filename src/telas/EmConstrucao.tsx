import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../componentes/Tela';
import Botao from '../componentes/Botao';
import type { PilhaParams } from '../navegacao/rotas';
import { cores, tam } from '../tema';

export default function EmConstrucao() {
  const navegacao = useNavigation();
  const { params } = useRoute<RouteProp<PilhaParams, 'EmConstrucao'>>();
  return (
    <Tela rolar={false}>
      <View style={estilos.centro}>
        <Ionicons name="hammer-outline" size={56} color={cores.cafe} />
        <Text style={estilos.titulo}>{params.titulo}: em construção</Text>
        {params.descricao ? <Text style={estilos.texto}>{params.descricao}.</Text> : null}
        <Text style={estilos.texto}>Esta função entra numa das próximas etapas.</Text>
      </View>
      <Botao titulo="Voltar" tipo="secundario" onPress={() => navegacao.goBack()} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12 },
  titulo: { fontSize: tam.subtitulo + 2, fontWeight: '700', color: cores.texto, textAlign: 'center' },
  texto: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24 },
});
