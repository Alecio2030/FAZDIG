import React from 'react';
import Campo from './Campo';
import { dataValida, mascaraData } from '../lib/datas';

type Props = {
  rotulo: string;
  valor: string; // sempre dd/mm/aaaa
  aoMudar: (valor: string) => void;
  erro?: string | null;
};

/** Campo de data padrão do sistema: digita só números, as barras entram sozinhas. */
export default function CampoData({ rotulo, valor, aoMudar, erro }: Props) {
  const incompletoOuInvalido = valor.length === 10 && !dataValida(valor) ? 'Data inválida.' : null;
  return (
    <Campo
      rotulo={rotulo}
      value={valor}
      onChangeText={(t) => aoMudar(mascaraData(t))}
      placeholder="dd/mm/aaaa"
      keyboardType="number-pad"
      maxLength={10}
      erro={erro ?? incompletoOuInvalido}
    />
  );
}
