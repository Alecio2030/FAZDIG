import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import CampoData from '../../componentes/CampoData';
import Escolha from '../../componentes/Escolha';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Aviso from '../../componentes/Aviso';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { codigoLote, nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ENTRADAS, ROTULO_MOV, SAIDAS } from '../../lib/movimentacoes';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const MAXIMO = 50;
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** 30 dias antes de hoje, em dd/mm/aaaa. */
function trintaDiasAtras(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return doBanco(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
}

const GRUPOS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'entradas', rotulo: 'Entradas' },
  { valor: 'saidas', rotulo: 'Saídas' },
  { valor: 'transferencias', rotulo: 'Transferências' },
];

/** Consultar movimentações por período, grupo de tipo e lote. */
export default function ConsultaMovimentacoes() {
  const navegacao = useNavigation<NavPilha>();
  const focado = useIsFocused();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [de, setDe] = useState(trintaDiasAtras());
  const [ate, setAte] = useState(hojeBR());
  const [grupo, setGrupo] = useState<string[]>(['todas']);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [movs, setMovs] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const deIso = dataValida(de) ? paraBanco(de) : null;
  const ateIso = dataValida(ate) ? paraBanco(ate) : null;

  useEffect(() => {
    if (!fid || !focado || !deIso || !ateIso) return;
    setMovs(null);
    setErro(null);
    let q = supabase
      .from('movimentacoes')
      .select(
        'id, data, tipo, documento, observacoes, created_at,' +
          ' origem:lotes!movimentacoes_lote_origem_id_fkey ( numero, descricao ), destino:lotes!movimentacoes_lote_destino_id_fkey ( numero, descricao ),' +
          ' manga_origem:areas!movimentacoes_manga_origem_id_fkey ( nome ), manga_destino:areas!movimentacoes_manga_destino_id_fkey ( nome ),' +
          ' pessoa:pessoas ( nome ), pesagem:pesagens ( numero ), itens:movimentacao_itens ( count )',
      )
      .eq('fazenda_id', fid)
      .gte('data', deIso)
      .lte('data', ateIso)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(MAXIMO + 1);
    if (grupo[0] === 'entradas') q = q.in('tipo', ENTRADAS);
    if (grupo[0] === 'saidas') q = q.in('tipo', SAIDAS);
    if (grupo[0] === 'transferencias') q = q.in('tipo', ['transferencia_lote', 'transferencia_manga', 'transferencia_saida', 'transferencia_entrada']);
    if (loteId) q = q.or(`lote_origem_id.eq.${loteId},lote_destino_id.eq.${loteId}`);
    consulta<any[]>(q)
      .then(setMovs)
      .catch((e) => setErro(traduzirErro(e)));
  }, [fid, focado, deIso, ateIso, grupo, loteId]);

  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao').eq('fazenda_id', fid!).order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla) }));
  }, [fid, sigla]);

  function descrever(m: any): (string | null)[] {
    const o = um(m.origem);
    const d = um(m.destino);
    const n = um(m.itens)?.count ?? 0;
    const cab = `${formatarNumero(n)} cab.`;
    const lo = o ? codigoLote(o.numero, sigla) : '';
    const ld = d ? codigoLote(d.numero, sigla) : '';
    let linha: string;
    if (m.tipo === 'transferencia_manga') linha = `Lote ${lo}: ${um(m.manga_origem)?.nome ?? 'sem manga'} → ${um(m.manga_destino)?.nome ?? ''}`;
    else if (m.tipo === 'transferencia_lote') linha = `${cab} de ${lo} → ${ld}`;
    else if (ENTRADAS.includes(m.tipo) || m.tipo === 'transferencia_entrada') linha = `${cab} para ${ld}${m.observacoes && m.tipo === 'transferencia_entrada' ? ` · ${m.observacoes}` : ''}`;
    else if (m.tipo === 'transferencia_saida') linha = `${cab} de ${lo}${m.observacoes ? ` · ${m.observacoes}` : ''}`;
    else linha = `${cab} de ${lo}`;
    return [linha, um(m.pessoa)?.nome ?? null, [um(m.pesagem) ? `Pesagem nº ${um(m.pesagem).numero}` : null, m.documento ? `Doc.: ${m.documento}` : null].filter(Boolean).join(', ') || null];
  }

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
      <Escolha opcoes={GRUPOS} valor={grupo} aoMudar={setGrupo} />
      <SeletorLista rotulo="Lote" valorId={loteId} aoMudar={setLoteId} carregar={carregarLotes} permitirLimpar vazio="Nenhum lote." />

      {erro && <Aviso tipo="erro" texto={erro} />}
      {(!deIso || !ateIso) && <Text style={estilos.dica}>Informe as datas do período (dd/mm/aaaa).</Text>}
      {deIso && ateIso && movs === null && !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />}
      {movs && movs.length === 0 && <Text style={estilos.dica}>Nenhuma movimentação neste período{loteId ? ' para este lote' : ''}.</Text>}
      {movs && movs.length > 0 && (
        <>
          <Lista>
            {movs.slice(0, MAXIMO).map((m) => (
              <Linha
                key={m.id}
                titulo={`${doBanco(m.data)}  ${ROTULO_MOV[m.tipo] ?? m.tipo}`}
                linhas={descrever(m)}
                onPress={() => navegacao.navigate('MovimentacaoDetalhe', { id: m.id })}
              />
            ))}
          </Lista>
          {movs.length > MAXIMO && <Text style={estilos.dica}>Mostrando as {MAXIMO} mais recentes. Diminua o período para ver as outras.</Text>}
        </>
      )}
      {ateIso && ateIso > hojeBanco() && <Text style={estilos.dica}>A data final está no futuro.</Text>}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12 },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
