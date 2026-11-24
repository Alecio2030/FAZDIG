import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { TEXTO_SITUACAO, type SituacaoNota } from '../../lib/nfe';
import { formatarMoeda, somenteDigitos } from '../../lib/formatos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Achada = { id: string; numero: number; serie: number; ambiente: number; situacao: SituacaoNota; valor: number | null; dest_nome: string | null; created_at: string; fazenda: { nome: string } | { nome: string }[] | null };
const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** V157: consulta das NF-e por número, chave ou comprador (não lista tudo: busca).
 *  V160: só mostra as notas da fazenda em que o sistema está aberto, e emite a NF-e pelo nº da venda. */
export default function NotasFiscais() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [vendaNum, setVendaNum] = useState('');
  const [vendaErro, setVendaErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  // V203: uma nota pode juntar várias vendas do mesmo cliente, para a mesma fazenda do cliente (mesma IE)
  async function emitirPelaVenda() {
    setVendaErro(null);
    const nums = [...new Set(vendaNum.split(/[^0-9]+/).map((x) => Number(x)).filter((x) => x > 0))];
    if (!nums.length) return setVendaErro('Digite o número da venda (ou das vendas, separados por vírgula).');
    if (!fid) return setVendaErro('Abra o sistema numa fazenda.');
    setAbrindo(true);
    const { data: r, error } = await supabase.rpc('nfe_vendas_juntar', { p_fazenda: fid, p_numeros: nums });
    setAbrindo(false);
    if (error) return setVendaErro(traduzirErro(error) + ' A nota só sai pela fazenda em que o sistema está aberto.');
    const ids = ((r as any)?.vendas ?? []) as string[];
    if (!ids.length) return setVendaErro('Venda não encontrada.');
    navegacao.push('NotaFiscalEmitir', { vendaId: ids[0], vendaIds: ids });
  }
  const [busca, setBusca] = useState('');
  const [achadas, setAchadas] = useState<Achada[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    setErro(null);
    const t = busca.trim();
    if (!t) return setErro('Digite o número da nota, a chave ou o nome do comprador.');
    if (!fid) return setErro('Abra o sistema numa fazenda.');
    setBuscando(true);
    try {
      let q = supabase
        .from('nfe_notas')
        .select('id, numero, serie, ambiente, situacao, valor, dest_nome, created_at, fazenda:fazendas ( nome )')
        .eq('fazenda_id', fid)
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
      <Secao titulo="Emitir NF-e de vendas" />
      <Campo
        rotulo="Nº da venda (ou das vendas)"
        value={vendaNum}
        onChangeText={(t) => setVendaNum(t.replace(/[^0-9, ]/g, ''))}
        keyboardType="numbers-and-punctuation"
        placeholder="Ex.: 12 ou 12, 13, 15"
        onSubmitEditing={emitirPelaVenda}
        erro={vendaErro}
        ajuda="Várias vendas numa nota só: do mesmo cliente e para a mesma fazenda dele (mesma Inscrição Estadual)."
      />
      <Botao titulo="Emitir NF-e" onPress={emitirPelaVenda} carregando={abrindo} />
      <Secao titulo="Notas já emitidas" />
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
      <Text style={estilos.nota}>Aqui aparecem só as vendas e notas de {fazendaAtiva?.nome ?? 'a fazenda aberta'}. Para outra fazenda, troque a fazenda na capa.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
});
