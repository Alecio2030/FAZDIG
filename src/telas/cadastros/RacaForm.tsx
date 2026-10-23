import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaRacas from './ConsultaRacas';
import { supabase, traduzirErro } from '../../lib/supabase';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';

export default function RacaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'RacaForm'>>();
  const id = params?.id;
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? 'Editar raça' : 'Raças' });
  }, [navegacao, id]);

  useEffect(() => {
    if (!id) return;
    supabase.from('racas').select('nome').eq('id', id).single().then(({ data, error }) => {
      if (error) setErro(traduzirErro(error));
      else setNome(data?.nome ?? '');
    });
  }, [id]);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome da raça.');
    setSalvando(true);
    const { error } = id
      ? await supabase.from('racas').update({ nome: nome.trim() }).eq('id', id)
      : await supabase.from('racas').insert({ nome: nome.trim() });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    if (id) navegacao.goBack();
    else navegacao.replace('RacaForm', { aviso: `Raça "${nome.trim()}" cadastrada. Pode cadastrar a próxima.` });
  }

  function excluir() {
    Alert.alert('Excluir raça', `Excluir ${nome}? Se já houver animais com essa raça, o sistema não deixa.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('racas').delete().eq('id', id!);
          if (error) setErro(traduzirErro(error));
          else navegacao.goBack();
        },
      },
    ]);
  }

  const abas = !id && <AbasCadastro aba={aba} aoMudar={setAba} />;

  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaRacas />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Campo
        rotulo="Nome da raça *"
        value={nome}
        onChangeText={setNome}
        autoCapitalize="words"
        placeholder="Ex.: Nelore"
        returnKeyType="done"
        onSubmitEditing={salvar}
        autoFocus={!id && !!params?.aviso}
      />
      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir raça" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}
