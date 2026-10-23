import React, { useState } from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoSenha from '../../componentes/CampoSenha';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import { supabase, traduzirErro } from '../../lib/supabase';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

export default function CriarConta() {
  const navegacao = useNavigation<NavPilha>();
  // E-mail que já tem conta: em vez de só recusar, oferece entrar ou trocar a senha.
  const [jaExiste, setJaExiste] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aguardandoConfirmacao, setAguardandoConfirmacao] = useState(false);

  // Volta para a tela Entrar que já está aberta, levando o e-mail digitado.
  function voltarParaEntrar() {
    const n = navegacao as any;
    if (typeof n.popTo === 'function') n.popTo('Entrar', { email: jaExiste ?? undefined });
    else navegacao.navigate('Entrar', { email: jaExiste ?? undefined });
  }

  async function criar() {
    setErro(null);
    setJaExiste(null);
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErro('Informe um e-mail válido.');
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.');
    if (senha !== confirma) return setErro('As duas senhas não são iguais.');

    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({ email: e, password: senha });
    setEnviando(false);
    if (error) {
      const m = String(error.message).toLowerCase();
      if (m.includes('already registered') || m.includes('already been registered')) return setJaExiste(e);
      return setErro(traduzirErro(error));
    }
    // Com confirmação de e-mail desligada, já vem logado e o app avança sozinho.
    if (!data.session) setAguardandoConfirmacao(true);
  }

  if (aguardandoConfirmacao) {
    return (
      <Tela>
        <Aviso
          tipo="sucesso"
          texto={`Conta criada para ${email.trim().toLowerCase()}. Falta confirmar o e-mail: abra a mensagem que enviamos (olhe também no spam) e toque no link. Se a página do link der erro, pode ignorar, a confirmação já vale.`}
        />
        <Text style={{ fontSize: tam.texto, color: cores.texto }}>Depois de confirmar, volte e entre com o e-mail e a senha que você acabou de criar.</Text>
        <Botao titulo="Voltar para entrar" onPress={() => navegacao.goBack()} />
      </Tela>
    );
  }

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {jaExiste && (
        <>
          <Aviso tipo="info" texto={`Já existe conta com ${jaExiste}. Não precisa criar outra: entre com a senha dessa conta ou, se não lembra, crie uma senha nova.`} />
          <Botao titulo="Entrar com este e-mail" onPress={voltarParaEntrar} />
          <Botao titulo="Esqueci minha senha" tipo="secundario" onPress={() => navegacao.navigate('EsqueciSenha', { email: jaExiste })} />
        </>
      )}
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
      <CampoSenha rotulo="Senha" value={senha} onChangeText={setSenha} textContentType="newPassword" ajuda="Pelo menos 6 caracteres. Anote: é a mesma em todos os aparelhos." />
      <CampoSenha rotulo="Repita a senha" value={confirma} onChangeText={setConfirma} textContentType="newPassword" returnKeyType="go" onSubmitEditing={criar} />
      <Botao titulo="Criar conta" onPress={criar} carregando={enviando} />
    </Tela>
  );
}
