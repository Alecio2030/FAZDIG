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
import { formatarNumero } from '../../lib/formatos';
import { limparBusca, useBusca } from '../../lib/useBusca';
import { nomeLote, resumoComposicao } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const MAXIMO = 20;
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const CAMPOS = 'id, numero, descricao, situacao, sexo, categoria, nascimento_ref, nascimento_aproximado, raca:racas!lotes_raca_id_fkey ( nome )';

/** Conta os animais ativos de cada lote e junta ao lote. */
async function comCabecas(lotes: any[]) {
  if (lotes.length === 0) return [];
  const animais = await consulta<any[]>(supabase.from('animais').select('lote_id').eq('situacao', 'ativo').in('lote_id', lotes.map((l) => l.id)));
  const cont: Record<string, number> = {};
  for (const a of animais) cont[a.lote_id] = (cont[a.lote_id] ?? 0) + 1;
  return lotes.map((l) => ({ ...l, raca: um(l.raca), cabecas: cont[l.id] ?? 0 }));
}

/** Consultar lotes: pelo número do lote ou pela relação dos lotes com animais ativos. */
export default function ConsultaLotes() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [busca, setBusca] = useState('');
  const [verLista, setVerLista] = useState(true); // V130: já abre com a relação
  const [lista, setLista] = useState<any[] | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const termo = limparBusca(busca);

  // Pelo número: "FC 003", "fc3" ou "3".
  const buscar = useCallback(
    async (t: string) => {
      const num = /^[a-z]{0,3}\s*0*(\d+)$/i.exec(t);
      if (!num) return [];
      const lotes = await consulta<any[]>(supabase.from('lotes').select(CAMPOS).eq('fazenda_id', fid!).eq('numero', Number(num[1])).limit(MAXIMO + 1));
      return comCabecas(lotes);
    },
    [fid],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar);

  const carregarLista = useCallback(async () => {
    if (!fid) return;
    setCarregandoLista(true);
    setErroLista(null);
    try {
      const lotes = await consulta<any[]>(supabase.from('lotes').select(CAMPOS).eq('fazenda_id', fid).eq('situacao', 'ativo').order('numero'));
      setLista((await comCabecas(lotes)).filter((l) => l.cabecas > 0));
    } catch (e) {
      setErroLista(traduzirErro(e));
    }
    setCarregandoLista(false);
  }, [fid]);

  // Volta para a tela com a relação aberta: atualiza (animais podem ter mudado de lote).
  useFocusEffect(
    useCallback(() => {
      if (verLista) carregarLista();
    }, [verLista, carregarLista]),
  );

  const linha = (l: any) => (
    <Linha
      key={l.id}
      titulo={nomeLote(l, sigla) + (l.situacao === 'encerrado' ? '  (encerrado)' : '')}
      linhas={[resumoComposicao({ sexo: l.sexo, categoria: l.categoria, raca: l.raca?.nome, nascimento: l.nascimento_ref, aproximado: l.nascimento_aproximado }) || null]}
      direita={`${formatarNumero(l.cabecas)} cab.`}
      onPress={() => navegacao.navigate('LoteDetalhe', { id: l.id })}
    />
  );

  const total = lista?.reduce((s, l) => s + l.cabecas, 0) ?? 0;

  return (
    <>
      <Busca
        valor={busca}
        aoMudar={(t) => {
          setBusca(t);
          if (t) setVerLista(false);
        }}
        dica={`Número do lote (ex.: ${sigla ?? 'FC'} 003 ou 3)`}
      />

      {termo ? (
        <ResultadoBusca termo={termo} achados={achados} buscando={buscando} erro={erro} maximo={MAXIMO} dica="" refinar="do número" item={linha} />
      ) : verLista ? (
        <>
          {erroLista && <Aviso tipo="erro" texto={erroLista} />}
          {carregandoLista && lista === null ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
          ) : lista && lista.length === 0 ? (
            <Text style={estilos.dica}>Nenhum lote com animais ativos.</Text>
          ) : lista ? (
            <>
              <Text style={estilos.total}>
                {lista.length === 1 ? '1 lote' : `${formatarNumero(lista.length)} lotes`} · {formatarNumero(total)} {total === 1 ? 'cabeça' : 'cabeças'}
              </Text>
              <Lista>{lista.map(linha)}</Lista>
            </>
          ) : null}
          <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setVerLista(false)} />
        </>
      ) : (
        <Botao titulo="Relação de lotes com animais ativos" tipo="secundario" onPress={() => setVerLista(true)} />
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  total: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
});
