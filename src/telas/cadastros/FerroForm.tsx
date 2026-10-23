import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Interruptor from '../../componentes/Interruptor';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaFerros from './ConsultaFerros';
import SeletorPessoa from '../../componentes/SeletorPessoa';
import { supabase, traduzirErro } from '../../lib/supabase';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';

export default function FerroForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'FerroForm'>>();
  const id = params?.id;
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [descricao, setDescricao] = useState('');
  const [proprio, setProprio] = useState(true);
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDono, setErroDono] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? 'Editar ferro' : 'Ferros' });
  }, [navegacao, id]);

  useEffect(() => {
    if (!id) return;
    supabase.from('ferros').select('descricao, proprio, pessoa_id').eq('id', id).single().then(({ data, error }) => {
      if (error) setErro(traduzirErro(error));
      else if (data) {
        setDescricao(data.descricao ?? '');
        setProprio(data.proprio !== false);
        setPessoaId(data.pessoa_id);
      }
    });
  }, [id]);

  async function salvar() {
    setErro(null);
    setErroDono(null);
    if (!descricao.trim()) return setErro('Descreva o ferro.');
    if (!proprio && !pessoaId) return setErroDono('Escolha de quem é o ferro.');
    setSalvando(true);
    const registro = { descricao: descricao.trim(), proprio, pessoa_id: proprio ? null : pessoaId };
    const { error } = id
      ? await supabase.from('ferros').update(registro).eq('id', id)
      : await supabase.from('ferros').insert(registro);
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    if (id) navegacao.goBack();
    else navegacao.replace('FerroForm', { aviso: `Ferro "${descricao.trim()}" cadastrado. Pode cadastrar o próximo.` });
  }

  function excluir() {
    Alert.alert('Excluir ferro', `Excluir "${descricao}"? Se já houver animais marcados com ele, o sistema não deixa.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('ferros').delete().eq('id', id!);
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
        <ConsultaFerros />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Campo
        rotulo="Descrição do ferro *"
        value={descricao}
        onChangeText={setDescricao}
        autoCapitalize="sentences"
        placeholder="Ex.: AP entrelaçado, lado direito"
      />
      <Interruptor
        rotulo="Ferro próprio"
        descricao={proprio ? 'É o ferro do produtor.' : 'É de outra pessoa (parceiro, vendedor).'}
        valor={proprio}
        aoMudar={setProprio}
      />
      {!proprio && <SeletorPessoa rotulo="De quem é o ferro *" valorId={pessoaId} aoMudar={setPessoaId} erro={erroDono} />}
      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir ferro" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}
