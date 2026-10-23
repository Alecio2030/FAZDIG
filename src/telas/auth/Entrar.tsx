import LogoApp from '../../componentes/LogoApp';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoSenha from '../../componentes/CampoSenha';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import { supabase, traduzirErro } from '../../lib/supabase';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

export default function Entrar() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'Entrar'>>();
  const [email, setEmail] = useState(params?.email ?? '');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Vindo de "Criar conta" com um e-mail que já tem conta: o e-mail chega preenchido.
  useEffect(() => {
    if (params?.email) setEmail(params.email);
  }, [params?.email]);

  async function entrar() {
    setErro(null);
    if (!email.trim() || !senha) {
      setErro('Informe o e-mail e a senha.');
      return;
    }
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
    setEnviando(false);
    if (error) setErro(traduzirErro(error));
    // Se deu certo, o app troca de tela sozinho.
  }

  return (
    <Tela comCabecalho={false}>
      <View style={estilos.marca}>
        <LogoApp tamanho={88} />
        <Text style={estilos.subtitulo}>Rebanho, lavoura e financeiro da fazenda.</Text>
      </View>

      {params?.aviso && !erro ? <Aviso tipo="info" texto={params.aviso} /> : null}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <Campo
        rotulo="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        placeholder="seu@email.com"
      />
      <CampoSenha rotulo="Senha" value={senha} onChangeText={setSenha} textContentType="password" returnKeyType="go" onSubmitEditing={entrar} />

      <Botao titulo="Entrar" onPress={entrar} carregando={enviando} />
      <Botao titulo="Esqueci minha senha" tipo="texto" onPress={() => navegacao.navigate('EsqueciSenha', { email: email.trim() })} />

      <View style={estilos.novo}>
        <Text style={estilos.novoTexto}>Ainda não tem conta neste app?</Text>
        <Botao titulo="Criar conta" tipo="secundario" onPress={() => navegacao.navigate('CriarConta')} />
      </View>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  marca: { alignItems: 'flex-start', gap: 6, marginTop: 32, marginBottom: 12 },
  titulo: { fontSize: 32, fontWeight: '800', color: cores.primariaEscura, letterSpacing: -0.5 },
  subtitulo: { fontSize: tam.texto, color: cores.textoSuave },
  novo: { gap: 8, marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: cores.borda },
  novoTexto: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
});
