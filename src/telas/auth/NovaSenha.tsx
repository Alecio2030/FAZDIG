import React, { useState } from 'react';
import { Text } from 'react-native';
import Tela from '../../componentes/Tela';
import CampoSenha from '../../componentes/CampoSenha';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase, traduzirErro } from '../../lib/supabase';
import { cores, tam } from '../../tema';

/** Aberta pelo link "Reset password" do e-mail: grava a senha nova e já entra no sistema. */
export default function NovaSenha() {
  const { novaSenha, terminarNovaSenha, sessao, sair } = useSessao();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (novaSenha && typeof novaSenha === 'object') {
    return (
      <Tela>
        <Aviso tipo="erro" texto={novaSenha.erro} />
        <Botao
          titulo="Voltar para entrar"
          onPress={async () => {
            if (sessao) await sair();
            terminarNovaSenha();
          }}
        />
      </Tela>
    );
  }

  async function gravar() {
    setErro(null);
    if (senha.length < 6) return setErro('A senha nova precisa ter pelo menos 6 caracteres.');
    if (senha !== confirma) return setErro('As duas senhas não são iguais.');
    setGravando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setGravando(false);
    if (error && !String(error.message).toLowerCase().includes('should be different from the old password')) return setErro(traduzirErro(error));
    terminarNovaSenha(); // senha gravada: o app entra sozinho
  }

  return (
    <Tela>
      <Text style={{ fontSize: tam.texto, color: cores.textoSuave, lineHeight: 24 }}>
        {sessao?.user.email ? `Conta: ${sessao.user.email}. ` : ''}Crie a senha nova. Ela passa a valer no PC e nos celulares.
      </Text>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <CampoSenha rotulo="Senha nova" value={senha} onChangeText={setSenha} textContentType="newPassword" ajuda="Pelo menos 6 caracteres." />
      <CampoSenha rotulo="Repita a senha nova" value={confirma} onChangeText={setConfirma} textContentType="newPassword" returnKeyType="go" onSubmitEditing={gravar} />
      <Botao titulo="Gravar senha nova e entrar" onPress={gravar} carregando={gravando} />
    </Tela>
  );
}
