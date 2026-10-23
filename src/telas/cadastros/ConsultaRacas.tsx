import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { consulta, supabase } from '../../lib/supabase';
import { limparBusca, useBusca } from '../../lib/useBusca';
import type { NavPilha } from '../../navegacao/rotas';

const MAXIMO = 20;

/** Consultar raças pelo nome. */
export default function ConsultaRacas() {
  const navegacao = useNavigation<NavPilha>();
  const [busca, setBusca] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const termo = limparBusca(busca);

  useFocusEffect(
    useCallback(() => {
      supabase.from('racas').select('id', { count: 'exact', head: true }).then(({ count }) => setTotal(count ?? 0));
    }, []),
  );

  const buscar = useCallback(
    (t: string) => consulta<any[]>(supabase.from('racas').select('id, nome').ilike('nome', `%${t}%`).order('nome').limit(MAXIMO + 1)),
    [],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar, { listarTudo: true });

  return (
    <>
      {total !== null && <Resumo esquerda={total === 1 ? '1 raça cadastrada' : `${total} raças cadastradas`} />}
      <Busca valor={busca} aoMudar={setBusca} dica="Nome da raça" />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={buscando}
        erro={erro}
        maximo={MAXIMO}
        dica="Digite o nome da raça. Tocando no resultado, abre o cadastro."
        refinar="do nome"
        item={(r: any) => <Linha key={r.id} titulo={r.nome} onPress={() => navegacao.navigate('RacaForm', { id: r.id })} />}
      />
    </>
  );
}
