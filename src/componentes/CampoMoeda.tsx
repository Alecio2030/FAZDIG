import React from 'react';
import Campo from './Campo';
import { mascaraMoeda } from '../lib/formatos';

type Props = {
  rotulo: string;
  valor: string;
  aoMudar: (t: string) => void;
  erro?: string | null;
  ajuda?: string;
  placeholder?: string;
  negativo?: boolean;
};

/** Campo de dinheiro: sempre no formato 1.234,56 (duas casas depois da vírgula, ponto a cada 3 casas). */
export default function CampoMoeda({ rotulo, valor, aoMudar, erro, ajuda, placeholder = '0,00', negativo }: Props) {
  return (
    <Campo
      rotulo={rotulo}
      value={valor}
      onChangeText={(t) => aoMudar(mascaraMoeda(t, negativo))}
      keyboardType={negativo ? 'numbers-and-punctuation' : 'number-pad'}
      placeholder={placeholder}
      erro={erro}
      ajuda={ajuda}
      style={{ textAlign: 'right' }}
    />
  );
}
