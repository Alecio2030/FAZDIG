import React, { useCallback, useEffect, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import AbasTela from '../../componentes/AbasTela';
import Tela from '../../componentes/Tela';
import EntradaCafeAba from './EntradaCafeAba';
import MovimentoCafeAba from './MovimentoCafeAba';
import ConsultaArmazem from './ConsultaArmazem';
import CotacaoCafeAba from './CotacaoCafeAba';
import ContratosCafeAba from './ContratosCafeAba';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';

export type AbaArmazem = 'entrada' | 'movimentar' | 'contratos' | 'cotacao' | 'consultar';

/** Armazém de café, num ícone só: abas Entrada (lote e classificação) | Movimentar | Contratos (venda futura e troca) | Cotação | Consultar (estoque). */
export default function ArmazemForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ArmazemForm'>>();
  const [aba, setAba] = useState<AbaArmazem>(params?.aba ?? 'entrada');
  const titulo = useCallback((t: string) => navegacao.setOptions({ title: t }), [navegacao]);

  useEffect(() => {
    if (aba !== 'entrada') titulo('Armazém de café');
  }, [aba, titulo]);

  const abas = (
    <AbasTela
      opcoes={[
        { valor: 'entrada', rotulo: 'Entrada' },
        { valor: 'movimentar', rotulo: 'Movimentar' },
        { valor: 'contratos', rotulo: 'Contratos' },
        { valor: 'cotacao', rotulo: 'Cotação' },
        { valor: 'consultar', rotulo: 'Consultar' },
      ]}
      valor={[aba]}
      aoMudar={(v) => setAba(v[0] as AbaArmazem)}
    />
  );
  if (aba === 'entrada') return <EntradaCafeAba abas={abas} titulo={titulo} />;
  if (aba === 'movimentar') return <MovimentoCafeAba abas={abas} />;
  if (aba === 'contratos') return <ContratosCafeAba abas={abas} />;
  if (aba === 'cotacao') return <CotacaoCafeAba abas={abas} />;
  return (
    <Tela>
      {abas}
      <ConsultaArmazem />
    </Tela>
  );
}
