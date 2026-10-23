import React from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import Lista from './Lista';
import Aviso from './Aviso';
import { cores, tam } from '../tema';

type Props<T> = {
  termo: string;
  achados: T[] | null;
  buscando: boolean;
  erro: string | null;
  /** texto mostrado antes de digitar */
  dica: string;
  /** o que falta digitar quando há resultados demais, ex.: "o nome" */
  refinar: string;
  maximo: number;
  item: (x: T) => React.ReactElement;
};

/** Mostra o resultado de uma consulta: dica, carregando, nada encontrado ou a lista. */
export default function ResultadoBusca<T>({ termo, achados, buscando, erro, dica, refinar, maximo, item }: Props<T>) {
  if (erro) return <Aviso tipo="erro" texto={erro} />;
  // sem nada digitado: a relação dos cadastrados, quando a tela já trouxe (V130); senão, a dica
  if (!termo && achados === null && !buscando) return dica ? <Text style={estilos.dica}>{dica}</Text> : null;
  if (buscando || achados === null) return <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;
  if (achados.length === 0) return <Text style={estilos.dica}>{termo ? `Nada encontrado com "${termo}".` : 'Nada cadastrado ainda.'}</Text>;
  return (
    <>
      <Lista>{achados.slice(0, maximo).map(item)}</Lista>
      {achados.length > maximo && <Text style={estilos.dica}>{termo ? `Há mais resultados. Digite mais ${refinar}.` : `Mostrando os ${maximo} primeiros. Para achar outro, digite ${refinar} na busca.`}</Text>}
    </>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
