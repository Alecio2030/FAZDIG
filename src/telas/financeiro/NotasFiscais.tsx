import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { TEXTO_SITUACAO, type SituacaoNota } from '../../lib/nfe';
import { formatarMoeda, somenteDigitos } from '../../lib/formatos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Achada = { id: string; numero: number; serie: number; ambiente: number; situacao: SituacaoNota; valor: number | null; dest_nome: string | null; created_at: string; fazenda: { nome: string } | { nome: string }[] | null };
const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** V157: consulta das NF-e por número, chave ou comprador (não lista tudo: busca). */
export default function NotasFiscais() {
  const navegacao = useNavigation<NavPilha>();
  const [busca, setBusca] = useState('');
  const [achadas, setAchadas] = useState<Achada[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    setErro(null);
    const t = busca.trim();
    if (!t) return setErro('Digite o número da nota, a chave ou o nome do comprador.');
    setBuscando(true);
    try {
      let q = supabase
        .from('nfe_notas')
        .select('id, numero, serie, ambiente, situacao, valor, dest_nome, created_at, fazenda:fazendas ( nome )')
        .order('created_at', { ascending: false })
        .limit(30);
      const d = somenteDigitos(t);
      if (d.length === 44) q = q.eq('chave', d);
      else if (d && d === t.replace(/\s/g, '')) q = q.eq('numero', Number(d));
      else q = q.ilike('dest_nome', `%${t}%`);
      setAchadas(await consulta<Achada[]>(q));
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setBuscando(false);
  }

  return (
    <Tela>
      <Campo rotulo="Número da nota, chave ou comprador" value={busca} onChangeText={setBusca} onSubmitEditing={buscar} returnKeyType="search" />
      <Botao titulo="Buscar" onPress={buscar} carregando={buscando} />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {buscando ? <ActivityIndicator color={cores.primaria} /> : null}
      {achadas && !achadas.length ? <Aviso tipo="info" texto="Nenhuma nota encontrada." /> : null}
      {achadas && achadas.length > 0 && (
        <Lista>
          {achadas.map((a) => (
            <Linha
              key={a.id}
              titulo={`NF-e nº ${a.numero} / ${a.serie}${a.ambiente === 2 ? ' (teste)' : ''}`}
              linhas={[a.dest_nome, `${um(a.fazenda)?.nome ?? ''} · ${TEXTO_SITUACAO[a.situacao]} · ${new Date(a.created_at).toLocaleDateString('pt-BR')}`]}
              direita={a.valor != null ? formatarMoeda(Number(a.valor)) : undefined}
              onPress={() => navegacao.push('NotaFiscalDetalhe', { id: a.id })}
            />
          ))}
        </Lista>
      )}
      <Text style={estilos.nota}>A nota se emite pela venda: em Mais › Vendas, abra a venda na consulta e toque em “Emitir NF-e”.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
});
