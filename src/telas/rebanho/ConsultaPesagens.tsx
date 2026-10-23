import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import CampoData from '../../componentes/CampoData';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Aviso from '../../componentes/Aviso';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { codigoLote, nomeLote } from '../../lib/rebanho';
import Escolha from '../../componentes/Escolha';
import { OBJETIVOS, ROTULO_OBJETIVO, arrobas } from '../../lib/pesagens';
import { useSigla } from '../../lib/useSigla';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const MAXIMO = 50;
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function noventaDiasAtras(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return doBanco(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
}

/** Consultar pesagens por período e lote. */
export default function ConsultaPesagens() {
  const navegacao = useNavigation<NavPilha>();
  const focado = useIsFocused();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [de, setDe] = useState(noventaDiasAtras());
  const [ate, setAte] = useState(hojeBR());
  const [loteId, setLoteId] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState<string[]>(['todos']);
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const deIso = dataValida(de) ? paraBanco(de) : null;
  const ateIso = dataValida(ate) ? paraBanco(ate) : null;

  useEffect(() => {
    if (!fid || !focado || !deIso || !ateIso) return;
    setLista(null);
    setErro(null);
    let q = supabase
      .from('pesagens')
      .select(
        'id, numero, data, objetivo, objetivo_outro, peso_arroba, lote:lotes ( numero, descricao ),' +
          ' origem_pessoa:pessoas!pesagens_origem_pessoa_id_fkey ( nome ), destino_pessoa:pessoas!pesagens_destino_pessoa_id_fkey ( nome ),' +
          ' itens:pesagem_itens ( quantidade, peso_bruto_kg ), mov:movimentacoes ( id )',
      )
      .eq('fazenda_id', fid)
      .gte('data', deIso)
      .lte('data', ateIso)
      .order('numero', { ascending: false })
      .limit(MAXIMO + 1);
    if (loteId) q = q.eq('lote_id', loteId);
    if (objetivo[0] !== 'todos') q = q.eq('objetivo', objetivo[0]);
    consulta<any[]>(q)
      .then(setLista)
      .catch((e) => setErro(traduzirErro(e)));
  }, [fid, focado, deIso, ateIso, loteId, objetivo]);

  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao').eq('fazenda_id', fid!).order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla) }));
  }, [fid, sigla]);

  return (
    <>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="De" valor={de} aoMudar={setDe} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Até" valor={ate} aoMudar={setAte} />
        </View>
      </View>
      <Escolha opcoes={[{ valor: 'todos', rotulo: 'Todos' }, ...OBJETIVOS]} valor={objetivo} aoMudar={setObjetivo} />
      <SeletorLista rotulo="Lote" valorId={loteId} aoMudar={setLoteId} carregar={carregarLotes} permitirLimpar vazio="Nenhum lote." />

      {erro && <Aviso tipo="erro" texto={erro} />}
      {(!deIso || !ateIso) && <Text style={estilos.dica}>Informe as datas do período (dd/mm/aaaa).</Text>}
      {deIso && ateIso && lista === null && !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />}
      {lista && lista.length === 0 && <Text style={estilos.dica}>Nenhuma pesagem neste período{loteId ? ' para este lote' : ''}.</Text>}
      {lista && lista.length > 0 && (
        <>
          <Lista>
            {lista.slice(0, MAXIMO).map((p) => {
              const itens = (p.itens ?? []) as { quantidade: number; peso_bruto_kg: number }[];
              const cab = itens.reduce((s, i) => s + i.quantidade, 0);
              const kg = itens.reduce((s, i) => s + Number(i.peso_bruto_kg), 0);
              const l = um(p.lote);
              const usada = (Array.isArray(p.mov) ? p.mov : p.mov ? [p.mov] : []).length > 0;
              const quem = um(p.origem_pessoa)?.nome ?? um(p.destino_pessoa)?.nome;
              return (
                <Linha
                  key={p.id}
                  titulo={`Nº ${p.numero}  ${doBanco(p.data)}  ${p.objetivo === 'outros' ? p.objetivo_outro ?? 'Outras' : ROTULO_OBJETIVO[p.objetivo]}`}
                  linhas={[
                    `${formatarNumero(cab)} cab., ${formatarNumero(arrobas(kg, Number(p.peso_arroba)), 2)} arrobas, média de ${formatarNumero(cab ? kg / cab : 0, 1)} kg`,
                    [l ? `Lote ${codigoLote(l.numero, sigla)}` : null, quem].filter(Boolean).join(', ') || null,
                    usada ? 'Já usada em movimentação' : null,
                  ]}
                  direita={`${formatarNumero(kg, 0)} kg`}
                  onPress={() => navegacao.navigate('PesagemDetalhe', { id: p.id })}
                />
              );
            })}
          </Lista>
          {lista.length > MAXIMO && <Text style={estilos.dica}>Mostrando as {MAXIMO} mais recentes. Diminua o período para ver as outras.</Text>}
        </>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12 },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
