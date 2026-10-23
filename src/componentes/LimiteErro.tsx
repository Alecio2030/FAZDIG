import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Botao from './Botao';
import { cores, tam } from '../tema';

type Estado = { erro: Error | null };

/**
 * Proteção de cada tela (V127): se uma tela der erro, em vez da página branca aparece o aviso
 * com o motivo e os botões para voltar ou ir para o início. O resto do app continua funcionando.
 */
export default class LimiteErro extends React.Component<{ children: React.ReactNode }, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error) {
    // aparece no console do navegador (F12), para achar a causa
    console.error('Erro na tela:', erro);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return <Falha erro={this.state.erro} aoLimpar={() => this.setState({ erro: null })} />;
  }
}

function Falha({ erro, aoLimpar }: { erro: Error; aoLimpar: () => void }) {
  const navegacao = useNavigation<any>();
  function voltar() {
    aoLimpar();
    if (navegacao.canGoBack()) navegacao.goBack();
    else navegacao.navigate('Principal');
  }
  function inicio() {
    aoLimpar();
    navegacao.navigate('Capa');
  }
  return (
    <ScrollView contentContainerStyle={estilos.caixa}>
      <Text style={estilos.titulo}>Esta tela teve um problema</Text>
      <Text style={estilos.texto}>Nada foi perdido. Volte e tente de novo. Se continuar, mande esta mensagem para o suporte:</Text>
      <View style={estilos.msg}>
        <Text style={estilos.msgTexto} selectable>
          {String(erro?.message ?? erro)}
        </Text>
      </View>
      <Botao titulo="Voltar para a página anterior" onPress={voltar} />
      <Botao titulo="Ir para a página de início" tipo="secundario" onPress={inicio} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  caixa: { padding: tam.espaco, gap: tam.espaco, maxWidth: 640, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.erro },
  texto: { fontSize: tam.texto, color: cores.texto, lineHeight: 24 },
  msg: { backgroundColor: cores.erroFundo, borderRadius: tam.raio, padding: 12 },
  msgTexto: { fontSize: tam.pequeno, color: cores.erro },
});
