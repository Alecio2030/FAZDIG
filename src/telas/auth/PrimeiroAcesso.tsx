import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase, traduzirErro } from '../../lib/supabase';
import { cpfCnpjValido, mascaraCpfCnpj } from '../../lib/formatos';
import { cores, tam } from '../../tema';

export default function PrimeiroAcesso() {
  const { sessao, erroFazendas, recarregarFazendas, sair } = useSessao();
  const [seuNome, setSeuNome] = useState('');
  const [produtor, setProdutor] = useState('');
  const [documento, setDocumento] = useState('');
  const [fazenda, setFazenda] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [uf, setUf] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // null = verificando; true = sistema novo (configurar); false = já configurado (aguardar liberação)
  const [sistemaNovo, setSistemaNovo] = useState<boolean | null>(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    supabase.rpc('sistema_sem_usuarios').then(({ data, error }) => setSistemaNovo(error ? true : !!data));
  }, []);

  async function verificarDeNovo() {
    setVerificando(true);
    await recarregarFazendas(); // se o acesso foi liberado, abre a tela Início
    setVerificando(false);
  }

  async function salvar() {
    setErro(null);
    if (!seuNome.trim()) return setErro('Informe o seu nome.');
    if (!produtor.trim()) return setErro('Informe o nome do produtor (como sai nas notas).');
    if (!cpfCnpjValido(documento)) return setErro('CPF ou CNPJ inválido. Confira os números.');
    if (!fazenda.trim()) return setErro('Informe o nome da fazenda.');
    if (uf && !/^[A-Za-z]{2}$/.test(uf.trim())) return setErro('A UF tem 2 letras, por exemplo ES.');

    setEnviando(true);
    const { error } = await supabase.rpc('configurar_primeiro_acesso', {
      p_nome_produtor: produtor.trim(),
      p_cpf_cnpj: documento,
      p_nome_fazenda: fazenda.trim(),
      p_municipio: municipio.trim(),
      p_uf: uf.trim().toUpperCase(),
      p_nome_usuario: seuNome.trim(),
    });
    setEnviando(false);
    if (error) return setErro(traduzirErro(error));
    await recarregarFazendas(); // abre a tela Início
  }

  if (sistemaNovo === null) {
    return (
      <Tela comCabecalho={false} rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 60 }} />
      </Tela>
    );
  }

  if (!sistemaNovo) {
    return (
      <Tela comCabecalho={false}>
        <View style={{ gap: 6, marginTop: 12 }}>
          <Text style={estilos.titulo}>Aguardando liberação</Text>
          <Text style={estilos.texto}>
            Você entrou como {sessao?.user.email}, mas este e-mail ainda não tem acesso a nenhuma fazenda. Peça ao dono do sistema para
            liberar este e-mail em Mais › Usuários e acessos. Depois, toque em "Verificar de novo".
          </Text>
        </View>
        {erroFazendas && <Aviso tipo="erro" texto={`Não foi possível ler suas fazendas: ${traduzirErro(erroFazendas)}`} />}
        <Botao titulo="Verificar de novo" onPress={verificarDeNovo} carregando={verificando} />
        <Botao titulo="Sair da conta" tipo="texto" onPress={sair} />
      </Tela>
    );
  }

  return (
    <Tela comCabecalho={false}>
      <View style={{ gap: 6, marginTop: 12 }}>
        <Text style={estilos.titulo}>Configurar o sistema</Text>
        <Text style={estilos.texto}>
          Entrando como {sessao?.user.email}. Cadastre o produtor e a primeira fazenda. Você ficará como dono, com acesso completo.
        </Text>
      </View>

      {erroFazendas && <Aviso tipo="erro" texto={`Não foi possível ler suas fazendas: ${traduzirErro(erroFazendas)}`} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <Campo rotulo="Seu nome" value={seuNome} onChangeText={setSeuNome} autoCapitalize="words" textContentType="name" />
      <Campo rotulo="Produtor" value={produtor} onChangeText={setProdutor} autoCapitalize="words" ajuda="Nome ou razão social, como aparece nas notas." />
      <Campo
        rotulo="CPF ou CNPJ do produtor"
        value={documento}
        onChangeText={(t) => setDocumento(mascaraCpfCnpj(t))}
        keyboardType="number-pad"
        maxLength={18}
      />
      <Campo rotulo="Nome da fazenda" value={fazenda} onChangeText={setFazenda} autoCapitalize="words" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Município" value={municipio} onChangeText={setMunicipio} autoCapitalize="words" />
        </View>
        <View style={{ width: 84 }}>
          <Campo rotulo="UF" value={uf} onChangeText={(t) => setUf(t.replace(/[^A-Za-z]/g, '').toUpperCase())} autoCapitalize="characters" maxLength={2} />
        </View>
      </View>

      <Botao titulo="Salvar e começar" onPress={salvar} carregando={enviando} />
      {erroFazendas && <Botao titulo="Tentar ler de novo" tipo="secundario" onPress={recarregarFazendas} />}
      <Botao titulo="Sair da conta" tipo="texto" onPress={sair} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: tam.titulo, fontWeight: '800', color: cores.primariaEscura },
  texto: { fontSize: tam.texto, color: cores.textoSuave, lineHeight: 24 },
});
