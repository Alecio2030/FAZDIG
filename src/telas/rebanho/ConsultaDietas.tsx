import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { limparBusca, useBusca } from '../../lib/useBusca';
import { nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ROTULO_APTIDAO } from '../../lib/dietas';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const CAMPOS = 'id, numero, data, aptidao, descricao, cabecas, lote:lotes ( numero, descricao )';
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Consultar dietas: pelo número ou pela relação das dietas. Só consulta. */
export default function ConsultaDietas() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [busca, setBusca] = useState('');
  const [verLista, setVerLista] = useState(true); // V130: já abre com a relação
  const [lista, setLista] = useState<any[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const termo = limparBusca(busca);

  const buscar = useCallback(
    async (t: string) => {
      const m = /^0*(\d+)$/.exec(t);
      if (!m) return [];
      return consulta<any[]>(supabase.from('dietas').select(CAMPOS).eq('fazenda_id', fid!).eq('numero', Number(m[1])));
    },
    [fid],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar);

  const carregarLista = useCallback(async () => {
    if (!fid) return;
    setErroLista(null);
    try {
      setLista(await consulta<any[]>(supabase.from('dietas').select(CAMPOS).eq('fazenda_id', fid).order('numero', { ascending: false }).limit(100)));
    } catch (e) {
      setErroLista(traduzirErro(e));
    }
  }, [fid]);

  useFocusEffect(
    useCallback(() => {
      if (verLista) carregarLista();
    }, [verLista, carregarLista]),
  );

  const linha = (d: any) => {
    const lote = um(d.lote);
    return (
      <Linha
        key={d.id}
        titulo={`Dieta nº ${d.numero}${d.descricao ? ` – ${d.descricao}` : ''}`}
        linhas={[`${doBanco(d.data)} · ${ROTULO_APTIDAO[d.aptidao] ?? d.aptidao}`, lote ? `Lote ${nomeLote(lote, sigla)}` : null]}
        direita={d.cabecas ? `${formatarNumero(d.cabecas)} cab.` : undefined}
        onPress={() => navegacao.navigate('DietaDetalhe', { id: d.id })}
      />
    );
  };

  return (
    <>
      <Busca
        valor={busca}
        aoMudar={(t) => {
          setBusca(t);
          if (t) setVerLista(false);
        }}
        dica="Número da dieta (ex.: 3)"
      />
      {termo ? (
        <ResultadoBusca termo={termo} achados={achados} buscando={buscando} erro={erro} maximo={20} dica="" refinar="do número" item={linha} />
      ) : verLista ? (
        <>
          {erroLista && <Aviso tipo="erro" texto={erroLista} />}
          {lista === null ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
          ) : lista.length === 0 ? (
            <Text style={estilos.dica}>Nenhuma dieta cadastrada.</Text>
          ) : (
            <Lista>{lista.map(linha)}</Lista>
          )}
          <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setVerLista(false)} />
        </>
      ) : (
        <Botao titulo="Relação das dietas" tipo="secundario" onPress={() => setVerLista(true)} />
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
