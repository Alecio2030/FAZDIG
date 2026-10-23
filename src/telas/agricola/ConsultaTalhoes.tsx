import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { hojeBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { densidadeTalhao, idadeFase } from '../../lib/talhoes';
import { semAcento } from '../../lib/codigos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** Consulta dos talhões: a relação aparece logo (V127) e a busca filtra pelo nome ou cultura. Tocando, abre o painel do talhão. Só mostra. */
export default function ConsultaTalhoes() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [todos, setTodos] = useState<any[] | null>(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const termo = semAcento(limparBusca(busca));

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      consulta<any[]>(supabase.from('areas').select('*').eq('fazenda_id', fid).eq('tipo', 'talhao').order('nome'))
        .then(setTodos)
        .catch((e) => setErro(traduzirErro(e)));
    }, [fid]),
  );

  const hoje = hojeBanco();
  const lista = todos ? (termo ? todos.filter((t) => semAcento(`${t.nome} ${t.capim_cultura ?? ''}`).includes(termo)) : todos) : null;
  const ativos = (todos ?? []).filter((t) => t.ativa);
  const somaUtil = ativos.reduce((s, t) => s + Number(t.area_util_ha ?? t.area_ha ?? 0), 0);

  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Nome do talhão ou cultura" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {lista === null ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : termo && lista.length === 0 ? (
        <Text style={estilos.dica}>Nenhum talhão com "{busca.trim()}".</Text>
      ) : !termo && lista.length === 0 ? (
        <Text style={estilos.dica}>Nenhum talhão cadastrado nesta fazenda.</Text>
      ) : (
        <>
          {!termo && (
            <Text style={estilos.total}>
              {ativos.length} {ativos.length === 1 ? 'talhão ativo' : 'talhões ativos'} · {formatarNumero(somaUtil, 2)} ha úteis
            </Text>
          )}
          {lista.length > 0 && (
            <Lista>
              {lista.map((t) => {
                const dens = densidadeTalhao(t);
                const util = Number(t.area_util_ha ?? t.area_ha ?? 0);
                const idade = idadeFase(t.data_plantio, hoje);
                return (
                  <Linha
                    key={t.id}
                    titulo={t.nome}
                    inativo={!t.ativa}
                    linhas={[
                      t.capim_cultura,
                      idade ? `${idade.texto} · ${idade.fase}` : null,
                      t.plantas_total != null
                        ? `${formatarNumero(Number(t.plantas_total))} plantas plantadas${util ? ` (${formatarNumero(Math.round(Number(t.plantas_total) / util))}/ha)` : ''}`
                        : dens && util ? `${formatarNumero(Math.round(dens * util))} plantas plantadas (${formatarNumero(Math.round(dens))}/ha)` : 'Falta o total de plantas plantadas',
                    ]}
                    direita={util ? `${formatarNumero(util, 2)} ha` : undefined}
                    onPress={() => navegacao.navigate('TalhaoDetalhe', { id: t.id })}
                  />
                );
              })}
            </Lista>
          )}
        </>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  total: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
});
