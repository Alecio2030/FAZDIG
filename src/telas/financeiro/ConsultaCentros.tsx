import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { semAcento } from '../../lib/codigos';
import { caminhoCentro, type Centro } from '../../lib/centrosCusto';
import { nomeUnidade } from '../../lib/unidades';
import type { NavPilha } from '../../navegacao/rotas';

const MAXIMO = 80;

const vinculo = (c: Centro) => (c.conta_plano_id ? 'Conta de grau 3 do Plano de contas' : c.area_id ? 'Divisão do talhão ou manga' : c.lote_id ? 'Divisão do lote' : null);

/**
 * V144: consultar os centros de custo (contas de grau 3 do grupo 4 e as divisões delas)
 * pelo nome ou pelo começo do código ("4.1" mostra a 3 Irmãos inteira, "4.1.01" o Agrícola dela).
 */
export default function ConsultaCentros() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendas } = useSessao();
  const [centros, setCentros] = useState<Centro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(() => {
    consulta<Centro[]>(supabase.from('centros_custo').select('id, codigo, nome, centro_pai_id, fazenda_id, area_id, lote_id, conta_plano_id, ativo').order('codigo'))
      .then(setCentros)
      .catch((e) => setErro(traduzirErro(e)));
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const porId = useMemo(() => Object.fromEntries((centros ?? []).map((c) => [c.id, c])), [centros]);
  const termo = busca.trim();
  const achados = useMemo(() => {
    if (!centros) return null;
    if (!termo) return centros;
    if (/^[\d.-]+$/.test(termo)) return centros.filter((c) => c.codigo.startsWith(termo.replace(/\.$/, '')));
    const t = semAcento(termo);
    return centros.filter((c) => semAcento(c.nome).includes(t) || semAcento(nomeUnidade(c.fazenda_id, fazendas)).includes(t));
  }, [centros, termo, fazendas]);

  return (
    <>
      {centros && centros.length > 0 && <Resumo esquerda={`${centros.filter((c) => c.ativo).length} centros ativos`} />}
      <Busca valor={busca} aoMudar={setBusca} dica="Nome, fazenda ou código (ex.: 4.1.01)" />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={centros === null}
        erro={erro}
        maximo={MAXIMO}
        dica="Digite parte do nome ou o começo do código: 4.1 mostra a primeira fazenda inteira, 4.1.01 o Agrícola dela com os talhões. Tocando no centro, abre."
        refinar="do nome ou do código"
        item={(c: Centro) => (
          <Linha
            key={c.id}
            titulo={`${c.centro_pai_id ? '      ' : ''}${c.codigo}  ${c.nome}`}
            inativo={!c.ativo}
            linhas={[nomeUnidade(c.fazenda_id, fazendas), caminhoCentro(c, porId) || null, vinculo(c)]}
            onPress={() => navegacao.navigate('CentroForm', { id: c.id })}
          />
        )}
      />
    </>
  );
}
