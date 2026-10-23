import React, { useCallback, useEffect, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import AbasTela from '../../componentes/AbasTela';
import Tela from '../../componentes/Tela';
import SecagemAba from './SecagemAba';
import PilagemAba from './PilagemAba';
import ConsultaPosColheita from './ConsultaPosColheita';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';

export type AbaPosColheita = 'secagem' | 'pilagem' | 'consultar';

/** Secagem e pilagem do café, num ícone só: abas Secagem | Pilagem | Consultar. */
export default function PosColheitaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'PosColheitaForm'>>();
  const [aba, setAba] = useState<AbaPosColheita>(params?.aba ?? 'secagem');
  const titulo = useCallback((t: string) => navegacao.setOptions({ title: t }), [navegacao]);

  useEffect(() => {
    if (aba === 'consultar') titulo('Secagem e pilagem');
  }, [aba, titulo]);

  const abas = (
    <AbasTela
      opcoes={[
        { valor: 'secagem', rotulo: 'Secagem' },
        { valor: 'pilagem', rotulo: 'Pilagem' },
        { valor: 'consultar', rotulo: 'Consultar' },
      ]}
      valor={[aba]}
      aoMudar={(v) => setAba(v[0] as AbaPosColheita)}
    />
  );
  if (aba === 'secagem') return <SecagemAba abas={abas} titulo={titulo} abrirNumero={params?.aba === 'secagem' ? params?.abrirNumero : undefined} />;
  if (aba === 'pilagem') return <PilagemAba abas={abas} titulo={titulo} abrirNumero={params?.aba === 'pilagem' ? params?.abrirNumero : undefined} />;
  return (
    <Tela>
      {abas}
      <ConsultaPosColheita />
    </Tela>
  );
}
