import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import Botao from './Botao';
import Interruptor from './Interruptor';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { somenteDigitos } from '../lib/formatos';
import { montarNome } from '../lib/genealogia';
import { cores, tam } from '../tema';

type Props = { aoCriar: (criadorId: string) => void; aoCancelar: () => void };

/** Cadastra o criador (Série Alfabética e Sufixo/Afixo) sem sair do cadastro do animal. */
export default function CriadorRapido({ aoCriar, aoCancelar }: Props) {
  const [produtor, setProdutor] = useState<{ id: string; nome: string; cpf_cnpj: string | null; criador_id: string | null } | null>(null);
  const [souEu, setSouEu] = useState(true);
  const [nome, setNome] = useState('');
  const [serie, setSerie] = useState('');
  const [sufixo, setSufixo] = useState('');
  const [ultimo, setUltimo] = useState('0');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('produtor').select('id, nome, cpf_cnpj, criador_id').maybeSingle().then(({ data }) => {
      if (data) {
        setProdutor(data as any);
        setNome((data as any).nome ?? '');
        if ((data as any).criador_id) setSouEu(false); // o produtor já é criador: este é outro
      }
    });
  }, []);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome do criador.');
    if (!/^[A-Z]{2,5}$/.test(serie)) return setErro('A Série Alfabética tem de 2 a 5 letras, sem números (ex.: SCS).');
    setSalvando(true);
    try {
      const mesma = await consulta<any[]>(supabase.from('pessoas').select('nome').eq('sui', serie).limit(1));
      if (mesma.length) {
        setSalvando(false);
        return setErro(`A Série ${serie} já é de ${mesma[0].nome}.`);
      }
      const eu = souEu && produtor;
      const doc = eu ? produtor!.cpf_cnpj : null;
      const nova = await consulta<any>(
        supabase
          .from('pessoas')
          .insert({
            nome: nome.trim(),
            cpf_cnpj: doc,
            tipo_pessoa: doc && somenteDigitos(doc).length > 11 ? 'J' : 'F',
            tipos: ['criador'],
            sui: serie,
            sufixo: sufixo.trim() || null,
            rgn_ultimo: Number(ultimo || 0),
          })
          .select('id')
          .single(),
      );
      if (eu) {
        await supabase.from('produtor').update({ criador_id: nova.id }).eq('id', produtor!.id);
        await supabase.from('fazendas').update({ criador_id: nova.id }).is('criador_id', null);
      }
      setSalvando(false);
      aoCriar(nova.id);
    } catch (e) {
      setSalvando(false);
      setErro(traduzirErro(e));
    }
  }

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.titulo}>Cadastrar criador</Text>
      {produtor && !produtor.criador_id && (
        <Interruptor
          rotulo="O criador sou eu (produtor)"
          descricao="Vira o criador padrão das suas fazendas."
          valor={souEu}
          aoMudar={(v) => {
            setSouEu(v);
            setNome(v ? produtor.nome : '');
          }}
        />
      )}
      <Campo rotulo="Nome do criador *" value={nome} onChangeText={setNome} autoCapitalize="words" editable={!(souEu && produtor && !produtor.criador_id)} />
      <Campo
        rotulo="Série Alfabética *"
        value={serie}
        onChangeText={(t) => setSerie(t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5))}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={5}
        placeholder="Ex.: SCS"
      />
      <Campo rotulo="Sufixo/Afixo" value={sufixo} onChangeText={setSufixo} autoCapitalize="words" placeholder="Ex.: da Constantino" />
      <Campo
        rotulo="Último RGN/RGD usado"
        value={ultimo}
        onChangeText={(t) => setUltimo(t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9))}
        keyboardType="number-pad"
        ajuda="Começando agora: deixe 0. Já tem animais registrados: informe o último número."
      />
      {serie ? <Text style={estilos.previa}>Próximo registro: {serie}{Number(ultimo || 0) + 1} {montarNome('Maria', sufixo)}</Text> : null}
      {erro && <Text style={estilos.erro}>{erro}</Text>}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Botao titulo="Cancelar" tipo="secundario" onPress={aoCancelar} />
        </View>
        <View style={{ flex: 1 }}>
          <Botao titulo="Cadastrar" onPress={salvar} carregando={salvando} />
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 12 },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  previa: { fontSize: tam.pequeno + 1, color: cores.primariaEscura, fontWeight: '600' },
  erro: { fontSize: tam.pequeno + 1, color: cores.erro, fontWeight: '600' },
});
