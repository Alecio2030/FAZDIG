import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoSenha from '../../componentes/CampoSenha';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase, traduzirErro } from '../../lib/supabase';
import { enderecoDoSite } from '../../lib/web';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/**
 * Esqueci minha senha, em dois passos, sem sair do app:
 * 1) informa o e-mail e recebe um código;  2) digita o código e a senha nova.
 * Ao terminar, já entra no sistema.
 */
export default function EsqueciSenha() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'EsqueciSenha'>>();
  const { pausarEntrada } = useSessao();
  const [email, setEmail] = useState(params?.email ?? '');
  const [passo, setPasso] = useState<'email' | 'codigo'>('email');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // O código só vale uma vez: se ele já foi aceito e só a troca da senha falhou, não se confere de novo.
  const codigoAceito = useRef(false);

  // Saindo desta tela, o app volta a seguir o login normalmente.
  useEffect(() => () => pausarEntrada(false), [pausarEntrada]);

  const emailLimpo = email.trim().toLowerCase();

  async function enviarCodigo() {
    setErro(null);
    setAviso(null);
    if (!/^\S+@\S+\.\S+$/.test(emailLimpo)) return setErro('Informe o e-mail da sua conta.');
    setEnviando(true);
    const site = enderecoDoSite();
    const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, site ? { redirectTo: site } : undefined);
    setEnviando(false);
    if (error) return setErro(traduzirErro(error));
    codigoAceito.current = false;
    setCodigo('');
    setPasso('codigo');
    setAviso(`Se existe conta com ${emailLimpo}, o e-mail foi enviado agora (olhe também o spam). Toque no link "Reset password" do e-mail: o app abre direto na tela da senha nova. Se o e-mail trouxer um código de números, digite-o aqui.`);
  }

  async function trocarSenha() {
    setErro(null);
    if (!codigoAceito.current && codigo.length < 6) return setErro('Digite o código que chegou no e-mail.');
    if (senha.length < 6) return setErro('A senha nova precisa ter pelo menos 6 caracteres.');
    if (senha !== confirma) return setErro('As duas senhas não são iguais.');

    setEnviando(true);
    setAviso(null);
    if (!codigoAceito.current) {
      // O código aceito já abre a sessão; o app espera nesta tela até a senha nova ser gravada.
      pausarEntrada(true);
      const { error } = await supabase.auth.verifyOtp({ email: emailLimpo, token: codigo, type: 'recovery' });
      if (error) {
        pausarEntrada(false);
        setEnviando(false);
        return setErro(traduzirErro(error));
      }
      codigoAceito.current = true;
    }
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error && !String(error.message).toLowerCase().includes('should be different from the old password')) {
      setEnviando(false);
      return setErro(`O código foi aceito, mas a senha não foi gravada: ${traduzirErro(error)} Tente de novo.`);
    }
    setEnviando(false);
    pausarEntrada(false); // senha gravada: o app entra sozinho
  }

  if (passo === 'email') {
    return (
      <Tela>
        <Text style={estilos.texto}>Informe o e-mail da sua conta. Enviaremos um e-mail com o link para você criar uma senha nova.</Text>
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
          returnKeyType="send"
          onSubmitEditing={enviarCodigo}
        />
        <Botao titulo="Enviar e-mail" onPress={enviarCodigo} carregando={enviando} />
        <Botao titulo="Já tenho o código" tipo="texto" onPress={() => (/^\S+@\S+\.\S+$/.test(emailLimpo) ? (setErro(null), setPasso('codigo')) : setErro('Informe o e-mail da sua conta.'))} />
        <Botao titulo="Voltar para entrar" tipo="texto" onPress={() => navegacao.goBack()} />
      </Tela>
    );
  }

  return (
    <Tela>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Text style={estilos.texto}>Conta: {emailLimpo}</Text>
      {!codigoAceito.current && (
        <Campo
          rotulo="Código do e-mail (se houver)"
          value={codigo}
          onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, 10))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={10}
          placeholder="Só os números"
          ajuda="O código vale por pouco tempo e só uma vez."
        />
      )}
      <CampoSenha rotulo="Senha nova" value={senha} onChangeText={setSenha} textContentType="newPassword" ajuda="Pelo menos 6 caracteres." />
      <CampoSenha rotulo="Repita a senha nova" value={confirma} onChangeText={setConfirma} textContentType="newPassword" returnKeyType="go" onSubmitEditing={trocarSenha} />
      <Botao titulo="Gravar senha nova e entrar" onPress={trocarSenha} carregando={enviando} />
      {!codigoAceito.current && <Botao titulo="Não chegou? Enviar outro e-mail" tipo="texto" onPress={enviarCodigo} desabilitado={enviando} />}
      {!codigoAceito.current && <Botao titulo="Trocar o e-mail" tipo="texto" onPress={() => (setErro(null), setAviso(null), setPasso('email'))} desabilitado={enviando} />}
    </Tela>
  );
}

const estilos = { texto: { fontSize: tam.texto, color: cores.textoSuave, lineHeight: 24 } } as const;
