import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import Escolha from '../../componentes/Escolha';
import { ADM, filtrarUnidade, nomeUnidade, opcoesFiltroUnidade, TODAS } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarQtd } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const CAMPOS = 'id, numero, data, fazenda_id, numero_documento, valor_total, situacao, tipo, pessoa:pessoas ( nome ), tipo_desp:tipos_lancamento ( nome )';
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
type Relacao = 'completar' | 'ultimas' | 'minimo';

/** Consulta de compras: pelo nº da compra, nº da nota ou fornecedor; ou as relações. Só mostra. */
export default function ConsultaCompras() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const fid = fazendaAtiva?.id;
  // Abre na unidade em uso; dá para ver outra fazenda, o Administrativo, o Particular ou todas.
  const [unidade, setUnidade] = useState<string[]>([modoAdm ? ADM : fid ?? TODAS]);
  const und = unidade[0];
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<any[] | null>(null);
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const termo = limparBusca(busca);

  useEffect(() => {
    if (!fid || !termo) return setAchados(null);
    const t = setTimeout(async () => {
      try {
        const pessoas = await consulta<any[]>(supabase.from('pessoas').select('id').ilike('nome', `%${termo}%`).limit(30));
        const partes = [`numero_documento.ilike.*${termo}*`];
        if (/^\d+$/.test(termo)) partes.unshift(`numero.eq.${termo}`);
        if (pessoas.length) partes.push(`pessoa_id.in.(${pessoas.map((p) => p.id).join(',')})`);
        setAchados(await consulta<any[]>(filtrarUnidade(supabase.from('compras').select(CAMPOS).or(partes.join(',')), und).order('data', { ascending: false }).limit(30)));
      } catch (e) {
        setErro(traduzirErro(e));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [fid, termo, und]);

  useFocusEffect(
    useCallback(() => {
      if (!fid || !relacao) return;
      setLista(null);
      (async () => {
        try {
          if (relacao === 'minimo') {
            const ins = await consulta<any[]>(supabase.from('insumos').select('id, nome, unidade, estoque_minimo').eq('ativo', true).not('estoque_minimo', 'is', null));
            const movs = ins.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade').eq('fazenda_id', fid).in('insumo_id', ins.map((i) => i.id))) : [];
            const saldo = (id: string) => movs.filter((m) => m.insumo_id === id).reduce((s, m) => (m.tipo === 'saida' ? s - Number(m.quantidade) : s + Number(m.quantidade)), 0);
            setLista(ins.map((i) => ({ ...i, saldo: saldo(i.id) })).filter((i) => i.saldo <= Number(i.estoque_minimo)).sort((a, b) => a.saldo / (a.estoque_minimo || 1) - b.saldo / (b.estoque_minimo || 1)));
          } else {
            let q = filtrarUnidade(supabase.from('compras').select(CAMPOS), und);
            q = relacao === 'completar' ? q.eq('situacao', 'a_completar').order('data') : q.neq('situacao', 'a_completar').order('data', { ascending: false }).limit(50);
            setLista(await consulta<any[]>(q));
          }
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid, relacao, und]),
  );

  const linha = (c: any) => (
    <Linha
      key={c.id}
      titulo={`Compra nº ${c.numero} · ${doBanco(c.data)}`}
      linhas={[um(c.pessoa)?.nome ?? 'Fornecedor não informado', c.tipo === 'despesa' ? `Despesa: ${um(c.tipo_desp)?.nome ?? 'sem estoque'}` : null, c.numero_documento ? `${c.tipo === 'despesa' ? 'Doc.' : 'Nota'} ${c.numero_documento}` : null, c.situacao === 'a_completar' ? 'Entrada rápida: a completar' : null, und === TODAS ? nomeUnidade(c.fazenda_id, fazendas) : null]}
      direita={Number(c.valor_total) ? formatarMoeda(Number(c.valor_total)) : undefined}
      onPress={() => navegacao.navigate('CompraDetalhe', { id: c.id })}
    />
  );

  const RELACOES: { valor: Relacao; rotulo: string }[] = [
    { valor: 'ultimas', rotulo: 'Últimas compras' },
    { valor: 'completar', rotulo: 'Compras a completar (entrada rápida)' },
    { valor: 'minimo', rotulo: 'Produtos no estoque mínimo (repor)' },
  ];

  return (
    <>
      <Escolha rotulo="De qual unidade" opcoes={opcoesFiltroUnidade(fazendas)} valor={unidade} aoMudar={setUnidade} />
      <Busca valor={busca} aoMudar={(t) => { setBusca(t); if (t) setRelacao(null); }} dica="Nº da compra, nº da nota ou fornecedor" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {termo ? (
        achados === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        ) : achados.length === 0 ? (
          <Text style={estilos.dica}>Nenhuma compra com "{termo}".</Text>
        ) : (
          <Lista>{achados.map(linha)}</Lista>
        )
      ) : relacao ? (
        <>
          <Secao titulo={RELACOES.find((r) => r.valor === relacao)!.rotulo} />
          {lista === null ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
          ) : lista.length === 0 ? (
            <Text style={estilos.dica}>{relacao === 'minimo' ? 'Nenhum produto abaixo do estoque mínimo.' : 'Nenhuma compra.'}</Text>
          ) : relacao === 'minimo' ? (
            <Lista>
              {lista.map((i) => (
                <Linha key={i.id} titulo={i.nome} linhas={[`Mínimo ${formatarQtd(i.estoque_minimo)} ${i.unidade}`]} direita={`${formatarQtd(i.saldo)} ${i.unidade}`} onPress={() => {}} />
              ))}
            </Lista>
          ) : (
            <Lista>{lista.map(linha)}</Lista>
          )}
          <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />
        </>
      ) : (
        <View style={{ gap: 10 }}>
          {RELACOES.map((r) => (
            <Botao key={r.valor} titulo={r.rotulo} tipo="secundario" onPress={() => setRelacao(r.valor)} />
          ))}
        </View>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
