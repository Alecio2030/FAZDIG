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
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Consultar ferros pela descrição ou pelo nome do dono. */
export default function ConsultaFerros() {
  const navegacao = useNavigation<NavPilha>();
  const [busca, setBusca] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const termo = limparBusca(busca);

  useFocusEffect(
    useCallback(() => {
      supabase.from('ferros').select('id', { count: 'exact', head: true }).then(({ count }) => setTotal(count ?? 0));
    }, []),
  );

  const buscar = useCallback(async (t: string) => {
    // Donos com esse nome, para achar também "o ferro do Fulano".
    if (!t) return consulta<any[]>(supabase.from('ferros').select('id, descricao, proprio, pessoas ( nome )').order('proprio', { ascending: false }).order('descricao').limit(MAXIMO + 1));
    const donos = await consulta<any[]>(supabase.from('pessoas').select('id').ilike('nome', `%${t}%`).limit(50));
    const partes = [`descricao.ilike.*${t}*`];
    if (donos.length) partes.push(`pessoa_id.in.(${donos.map((d) => d.id).join(',')})`);
    return consulta<any[]>(
      supabase
        .from('ferros')
        .select('id, descricao, proprio, pessoas ( nome )')
        .or(partes.join(','))
        .order('proprio', { ascending: false })
        .order('descricao')
        .limit(MAXIMO + 1),
    );
  }, []);
  const { achados, buscando, erro } = useBusca(termo, buscar, { listarTudo: true });

  return (
    <>
      {total !== null && <Resumo esquerda={total === 1 ? '1 ferro cadastrado' : `${total} ferros cadastrados`} />}
      <Busca valor={busca} aoMudar={setBusca} dica="Descrição do ferro ou nome do dono" />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={buscando}
        erro={erro}
        maximo={MAXIMO}
        dica="Digite a descrição do ferro ou o nome do dono. Tocando no resultado, abre o cadastro."
        refinar="da descrição"
        item={(f: any) => (
          <Linha
            key={f.id}
            titulo={f.descricao}
            linhas={[f.proprio ? 'Ferro próprio' : `De ${um(f.pessoas)?.nome ?? 'terceiro'}`]}
            onPress={() => navegacao.navigate('FerroForm', { id: f.id })}
          />
        )}
      />
    </>
  );
}
