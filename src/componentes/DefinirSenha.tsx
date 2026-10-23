import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import CampoSenha from './CampoSenha';
import Botao from './Botao';
import Aviso from './Aviso';
import { supabase, traduzirErro } from '../lib/supabase';
import { cores, tam } from '../tema';

/**
 * Grava a senha de uma pessoa na hora, sem e-mail nem código (só Produtor e administrador).
 * Quando é a própria pessoa (eu = true), troca a senha dela mesma.
 */
export default function DefinirSenha({ email, nome, eu = false }: { email: string; nome?: string | null; eu?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState('');
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function gravar() {
    setErro(null);
    setOk(null);
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.');
    setGravando(true);
    const { error } = eu ? await supabase.auth.updateUser({ password: senha }) : await supabase.rpc('definir_senha', { p_email: email, p_senha: senha });
    setGravando(false);
    if (error && !String(error.message).toLowerCase().includes('should be different from the old password')) return setErro(traduzirErro(error));
    setOk(eu ? 'Sua senha nova está gravada. Vale no PC e nos celulares.' : `Senha gravada. Passe para ${nome || email}: e-mail ${email} e a senha que você digitou. Vale na hora, no PC e nos celulares.`);
    setSenha('');
    setAberto(false);
  }

  return (
    <View style={estilos.quadro}>
      {ok && <Aviso tipo="sucesso" texto={ok} />}
      {aberto ? (
        <>
          <Text style={estilos.titulo}>{eu ? 'Trocar minha senha' : `Definir a senha de ${nome || email}`}</Text>
          {erro && <Aviso tipo="erro" texto={erro} />}
          <CampoSenha rotulo="Senha nova" value={senha} onChangeText={setSenha} textContentType="newPassword" ajuda="Pelo menos 6 caracteres. Toque no olho para ver o que digitou." returnKeyType="go" onSubmitEditing={gravar} />
          <Botao titulo="Gravar senha" onPress={gravar} carregando={gravando} />
          <Botao titulo="Cancelar" tipo="texto" onPress={() => (setAberto(false), setErro(null))} />
        </>
      ) : (
        <Botao titulo={eu ? 'Trocar minha senha' : 'Definir senha'} tipo="secundario" onPress={() => (setOk(null), setAberto(true))} />
      )}
      {!aberto && !eu && !ok && <Text style={estilos.nota}>Esqueceu a senha? Grave uma nova aqui e passe para a pessoa. Não precisa de e-mail nem de código.</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { gap: 10 },
  titulo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
});
