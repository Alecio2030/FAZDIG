import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Campo from './Campo';
import Escolha from './Escolha';
import Aviso from './Aviso';
import { PROGRAMAS_DEP, caracteristicasDep, rotuloClasse, type Caracteristica, type ValoresDep } from '../lib/deps';
import { traduzirErro } from '../lib/supabase';
import { cores, tam } from '../tema';

type Props = {
  programa: string | null;
  aoMudarPrograma: (p: string | null) => void;
  sumario: string;
  aoMudarSumario: (t: string) => void;
  valores: ValoresDep;
  aoMudarValores: (v: ValoresDep) => void;
};

const VAZIO = { dep: '', ac: '', classe: '' };

/** DEPs oficiais do animal: escolhe o programa e o sistema apresenta as características para informar. */
export default function DepsAnimal({ programa, aoMudarPrograma, sumario, aoMudarSumario, valores, aoMudarValores }: Props) {
  const [lista, setLista] = useState<Caracteristica[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!programa) return setLista(null);
    setLista(null);
    setErro(null);
    caracteristicasDep(programa)
      .then(setLista)
      .catch((e) => setErro(traduzirErro(e)));
  }, [programa]);

  const muda = (id: string, campo: 'dep' | 'ac' | 'classe', t: string) =>
    aoMudarValores({ ...valores, [id]: { ...(valores[id] ?? VAZIO), [campo]: t.replace(/[^\d,.\-−]/g, '').slice(0, 8) } });

  const classe = rotuloClasse(programa);

  return (
    <View style={{ gap: 10 }}>
      <Escolha
        rotulo="Programa de avaliação"
        opcoes={PROGRAMAS_DEP}
        valor={programa ? [programa] : []}
        aoMudar={(v) => aoMudarPrograma(v[0] === programa ? null : v[0])}
      />
      {!programa && <Text style={estilos.nota}>Escolha o programa do sumário do animal: as DEPs oficiais dele aparecem para informar. Tocando de novo, desmarca.</Text>}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {programa && !lista && !erro && <ActivityIndicator color={cores.primaria} />}
      {programa && lista && (
        <>
          <Campo rotulo="Sumário (edição)" value={sumario} onChangeText={aoMudarSumario} placeholder="Ex.: 2026/1" autoCapitalize="characters" />
          <View style={estilos.cabecalho}>
            <Text style={[estilos.cab, { flex: 1 }]}>Característica</Text>
            <Text style={[estilos.cab, estilos.cDep]}>DEP</Text>
            <Text style={[estilos.cab, estilos.cAc]}>AC %</Text>
            <Text style={[estilos.cab, estilos.cAc]}>{classe}</Text>
          </View>
          {lista.map((c) => {
            const v = valores[c.id] ?? VAZIO;
            return (
              <View key={c.id} style={[estilos.linha, c.indice && estilos.linhaIndice]}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.sigla}>{c.sigla}</Text>
                  <Text style={estilos.nome}>
                    {c.nome}
                    {c.unidade ? ` (${c.unidade})` : ''}
                  </Text>
                </View>
                <TextInput value={v.dep} onChangeText={(t) => muda(c.id, 'dep', t)} keyboardType="numbers-and-punctuation" style={[estilos.entrada, estilos.cDep]} selectTextOnFocus accessibilityLabel={`DEP ${c.sigla}`} />
                <TextInput value={v.ac} onChangeText={(t) => muda(c.id, 'ac', t)} keyboardType="decimal-pad" style={[estilos.entrada, estilos.cAc]} selectTextOnFocus accessibilityLabel={`Acurácia ${c.sigla}`} />
                <TextInput value={v.classe} onChangeText={(t) => muda(c.id, 'classe', t)} keyboardType="decimal-pad" style={[estilos.entrada, estilos.cAc]} selectTextOnFocus accessibilityLabel={`${classe} ${c.sigla}`} />
              </View>
            );
          })}
          <Text style={estilos.nota}>Informe o que constar no sumário; o que ficar em branco não é gravado. DEP negativa: digite o sinal de menos antes do número.</Text>
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 20 },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 10 },
  cab: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave, textAlign: 'center' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, paddingHorizontal: 10, paddingVertical: 6 },
  linhaIndice: { borderColor: cores.cafe, borderWidth: 1.5 },
  sigla: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  nome: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  entrada: { minHeight: 42, borderWidth: 1.5, borderColor: cores.borda, borderRadius: 8, textAlign: 'center', fontSize: tam.texto - 1, color: cores.texto, paddingHorizontal: 2 },
  cDep: { width: 74 },
  cAc: { width: 52 },
});
