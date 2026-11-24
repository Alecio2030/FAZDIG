import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import Botao from './Botao';
import { buscarCep, procurarCep, type EnderecoCep } from '../lib/cep';
import { mascaraCep, somenteDigitos } from '../lib/formatos';
import { cores, tam } from '../tema';

type Props = {
  rotulo?: string;
  valor: string;
  aoMudar: (cep: string) => void;
  /** chamado quando o CEP é achado: preencha cidade, UF e, se vierem, rua e bairro */
  aoAchar: (e: EnderecoCep) => void;
  erro?: string | null;
  /** UF e cidade já digitadas, para a procura "Não sei o CEP" começar preenchida */
  ufAtual?: string;
  cidadeAtual?: string;
};

/**
 * V162: CEP com consulta automática. Ao completar os 8 números, busca o endereço (ViaCEP/BrasilAPI, gratuitas)
 * e preenche a cidade e a UF. Quem não sabe o CEP procura pela UF, cidade e rua.
 */
export default function CampoCep({ rotulo = 'CEP *', valor, aoMudar, aoAchar, erro, ufAtual = '', cidadeAtual = '' }: Props) {
  const [buscando, setBuscando] = useState(false);
  const [nota, setNota] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [procurar, setProcurar] = useState(false);
  const [pUf, setPUf] = useState(ufAtual);
  const [pCidade, setPCidade] = useState(cidadeAtual);
  const [pRua, setPRua] = useState('');
  const [achados, setAchados] = useState<EnderecoCep[] | null>(null);
  const [procurando, setProcurando] = useState(false);
  const ultimo = useRef('');

  // Só busca quando a pessoa digita: o CEP que já veio gravado no cadastro não é consultado de novo.
  function buscar(digitos: string) {
    if (digitos === ultimo.current) return;
    ultimo.current = digitos;
    setBuscando(true);
    buscarCep(digitos)
      .then((e) => {
        if (ultimo.current !== digitos) return; // já digitou outro
        if (e) {
          aoAchar(e);
          setNota({ tipo: 'ok', texto: `${e.municipio}/${e.uf}${e.logradouro ? ` — ${e.logradouro}` : ' (CEP geral da cidade)'}` });
        } else setNota({ tipo: 'erro', texto: 'CEP não encontrado. Confira os números ou use "Não sei o CEP".' });
      })
      .catch((x) => setNota({ tipo: 'erro', texto: x?.message ?? 'Não foi possível consultar o CEP agora.' }))
      .finally(() => setBuscando(false));
  }

  function digitar(t: string) {
    const m = mascaraCep(t);
    aoMudar(m);
    const d = somenteDigitos(m);
    if (d.length === 8) buscar(d);
    else {
      ultimo.current = '';
      setNota(null);
    }
  }

  async function fazerProcura() {
    setProcurando(true);
    setAchados(await procurarCep(pUf, pCidade, pRua));
    setProcurando(false);
  }

  function escolher(e: EnderecoCep) {
    ultimo.current = e.cep;
    aoMudar(mascaraCep(e.cep));
    aoAchar(e);
    setNota({ tipo: 'ok', texto: `${e.municipio}/${e.uf}${e.logradouro ? ` — ${e.logradouro}` : ''}` });
    setProcurar(false);
    setAchados(null);
  }

  return (
    <View style={{ gap: 6 }}>
      <Campo
        rotulo={rotulo}
        value={valor}
        onChangeText={digitar}
        keyboardType="number-pad"
        maxLength={9}
        placeholder="00000-000"
        erro={erro}
      />
      <View style={estilos.linha}>
        {buscando ? (
          <View style={estilos.linha}>
            <ActivityIndicator size="small" color={cores.primaria} />
            <Text style={estilos.ajuda}>Buscando o CEP…</Text>
          </View>
        ) : nota ? (
          <Text style={[estilos.ajuda, { color: nota.tipo === 'ok' ? cores.primaria : cores.erro, flex: 1 }]}>{nota.texto}</Text>
        ) : (
          <Text style={[estilos.ajuda, { flex: 1 }]}>Digite o CEP: a cidade e a UF vêm sozinhas.</Text>
        )}
        <Text
          style={estilos.link}
          onPress={() => {
            setPUf((u) => u || ufAtual);
            setPCidade((c) => c || cidadeAtual);
            setProcurar((p) => !p);
          }}
        >
          {procurar ? 'Fechar' : 'Não sei o CEP'}
        </Text>
      </View>

      {procurar && (
        <View style={estilos.caixa}>
          <View style={estilos.linha}>
            <View style={{ width: 76 }}>
              <Campo rotulo="UF" value={pUf} onChangeText={(t) => setPUf(t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2))} autoCapitalize="characters" maxLength={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Cidade" value={pCidade} onChangeText={setPCidade} autoCapitalize="words" />
            </View>
          </View>
          <Campo
            rotulo="Rua, estrada, córrego ou localidade"
            value={pRua}
            onChangeText={setPRua}
            autoCapitalize="words"
            ajuda="Pelo menos 3 letras. Em cidade pequena e na zona rural costuma haver um CEP geral da cidade (ex.: 29700-000)."
          />
          <Botao titulo="Procurar o CEP" tipo="secundario" onPress={fazerProcura} carregando={procurando} desabilitado={pUf.length !== 2 || pCidade.trim().length < 3 || pRua.trim().length < 3} />
          {achados !== null &&
            (achados.length === 0 ? (
              <Text style={estilos.ajuda}>Nenhum CEP achado. Tente outro nome da rua ou da localidade.</Text>
            ) : (
              achados.map((e) => (
                <Pressable key={`${e.cep}-${e.logradouro}-${e.bairro}`} onPress={() => escolher(e)} style={({ pressed }) => [estilos.achado, pressed && { opacity: 0.7 }]}>
                  <Text style={estilos.achadoCep}>{mascaraCep(e.cep)}</Text>
                  <Text style={estilos.achadoTexto}>
                    {[e.logradouro, e.bairro].filter(Boolean).join(' — ')} · {e.municipio}/{e.uf}
                  </Text>
                </Pressable>
              ))
            ))}
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ajuda: { fontSize: tam.pequeno, color: cores.textoSuave },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  caixa: { gap: 10, padding: 12, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundo },
  achado: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: tam.raio, backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.borda, gap: 2 },
  achadoCep: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  achadoTexto: { fontSize: tam.pequeno, color: cores.textoSuave },
});
