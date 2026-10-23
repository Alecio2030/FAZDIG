import React from 'react';
import AbasTela from './AbasTela';

export type Aba = 'cadastrar' | 'consultar';

/** Abas do padrão das telas: Cadastrar | Consultar. */
export default function AbasCadastro({ aba, aoMudar, rotuloCadastrar = 'Cadastrar' }: { aba: Aba; aoMudar: (a: Aba) => void; rotuloCadastrar?: string }) {
  return (
    <AbasTela
      opcoes={[
        { valor: 'cadastrar', rotulo: rotuloCadastrar },
        { valor: 'consultar', rotulo: 'Consultar' },
      ]}
      valor={[aba]}
      aoMudar={(v) => aoMudar(v[0] as Aba)}
    />
  );
}
