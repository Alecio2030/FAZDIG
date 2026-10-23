import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import Escolha from '../../componentes/Escolha';
import { TODAS, filtrarUnidade, nomeUnidade, opcoesFiltroUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { CAMPOS_TITULO, ROTULO_BAIXA, limitesMes, linhasTitulo, nomeMes, saldoTitulo, somarMeses, textosTitulo, um, type TipoTitulo, type Titulo } from '../../lib/titulos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Relacao = 'abertos' | 'pagos' | 'continuas' | 'saldos';

/** Consulta do contas a pagar: pelo nº, fornecedor, descrição ou documento; ou as relações. Só mostra. */
export default function ConsultaTitulos({ tipo = 'pagar' }: { tipo?: TipoTitulo }) {
  const tx = textosTitulo(tipo);
  const RELACOES: { valor: Relacao; rotulo: string }[] = [
    { valor: 'abertos', rotulo: 'Contas em aberto' },
    { valor: 'pagos', rotulo: `${tx.Pagamentos} do mês` },
    { valor: 'continuas', rotulo: 'Contas contínuas (todo mês)' },
    { valor: 'saldos', rotulo: 'Saldo dos bancos e do caixa' },
  ];
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  // Contas a pagar e a receber são do Grupo: aparecem todas, com filtro opcional por unidade.
  const [unidade, setUnidade] = useState<string[]>([TODAS]);
  const und = unidade[0];
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Titulo[] | null>(null);
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [lista, setLista] = useState<any[] | null>(null);
  const [mes, setMes] = useState(limitesMes(hojeBanco()).inicio);
  const [erro, setErro] = useState<string | null>(null);
  const termo = limparBusca(busca);

  useEffect(() => {
    if (!fid || !termo) return setAchados(null);
    const t = setTimeout(async () => {
      try {
        const pessoas = await consulta<any[]>(supabase.from('pessoas').select('id').ilike('nome', `%${termo}%`).limit(30));
        const partes = [`descricao.ilike.*${termo}*`, `documento.ilike.*${termo}*`];
        if (/^\d+$/.test(termo)) partes.unshift(`numero.eq.${termo}`);
        if (pessoas.length) partes.push(`pessoa_id.in.(${pessoas.map((p) => p.id).join(',')})`);
        setAchados(await consulta<Titulo[]>(filtrarUnidade(supabase.from('lancamentos').select(CAMPOS_TITULO).eq('tipo', tipo).or(partes.join(',')), und).order('data_vencimento', { ascending: false }).limit(40)));
      } catch (e) {
        setErro(traduzirErro(e));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [fid, termo, tipo, und]);

  useFocusEffect(
    useCallback(() => {
      if (!fid || !relacao) return;
      setLista(null);
      (async () => {
        try {
          if (relacao === 'abertos') {
            setLista(await consulta<any[]>(filtrarUnidade(supabase.from('lancamentos').select(CAMPOS_TITULO).eq('tipo', tipo).in('situacao', ['aberto', 'parcial']), und).order('data_vencimento').order('numero').limit(500)));
          } else if (relacao === 'pagos') {
            const { inicio, fim } = limitesMes(mes);
            const bs = await consulta<any[]>(
              filtrarUnidade(
                supabase
                  .from('baixas')
                  .select('id, data, valor_pago, situacao, fazenda_id, banco:contas_bancarias ( nome ), lancamento:lancamentos ( id, numero, tipo, descricao, pessoa:pessoas ( nome ) )'),
                und,
              )
                .in('situacao', ['confirmada', 'pendente'])
                .gte('data', inicio)
                .lte('data', fim)
                .order('data'),
            );
            setLista(bs.filter((b) => um(b.lancamento)?.tipo === tipo));
          } else if (relacao === 'continuas') {
            setLista(await consulta<any[]>(filtrarUnidade(supabase.from('recorrencias').select('id, descricao, valor, dia_vencimento, inicio, fim, ativa, fazenda_id, pessoa:pessoas ( nome )').eq('tipo', tipo), und).order('ativa', { ascending: false }).order('descricao')));
          } else {
            setLista(await consulta<any[]>(supabase.rpc('saldo_contas', { p_fazenda: fid })));
          }
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid, relacao, mes, tipo, und]),
  );

  const linhaTitulo = (t: Titulo) => (
    <Linha key={t.id} titulo={`Nº ${t.numero} · ${t.descricao ?? 'Título'}`} linhas={[...linhasTitulo(t), nomeUnidade(t.fazenda_id, fazendas)]} direita={formatarMoeda(t.situacao === 'parcial' ? saldoTitulo(t) : Number(t.valor))} onPress={() => navegacao.navigate('TituloDetalhe', { id: t.id })} />
  );

  function corpo() {
    if (lista === null) return <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;
    if (relacao === 'abertos') {
      if (!lista.length) return <Text style={estilos.dica}>Nenhuma conta em aberto.</Text>;
      const hoje = hojeBanco();
      const vencido = lista.filter((t) => t.data_vencimento < hoje).reduce((s, t) => s + saldoTitulo(t), 0);
      return (
        <>
          <View style={estilos.resumo}>
            <Text style={estilos.resumoTexto}>
              {lista.length} {lista.length === 1 ? 'título' : 'títulos'}
              {vencido > 0 ? ` · vencido ${formatarMoeda(vencido)}` : ''}
            </Text>
            <Text style={estilos.resumoValor}>{formatarMoeda(lista.reduce((s, t) => s + saldoTitulo(t), 0))}</Text>
          </View>
          <Lista>{lista.map(linhaTitulo)}</Lista>
        </>
      );
    }
    if (relacao === 'pagos') {
      const confirmado = lista.filter((b) => b.situacao === 'confirmada').reduce((s, b) => s + Number(b.valor_pago), 0);
      const pendente = lista.filter((b) => b.situacao === 'pendente').reduce((s, b) => s + Number(b.valor_pago), 0);
      return (
        <>
          <View style={estilos.mes}>
            <Pressable onPress={() => setMes((m) => somarMeses(m, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
              <Ionicons name="chevron-back-circle" size={32} color={cores.primaria} />
            </Pressable>
            <Text style={estilos.mesTexto}>{nomeMes(mes)}</Text>
            <Pressable onPress={() => setMes((m) => somarMeses(m, 1))} hitSlop={12} accessibilityLabel="Mês seguinte">
              <Ionicons name="chevron-forward-circle" size={32} color={cores.primaria} />
            </Pressable>
          </View>
          <View style={estilos.resumo}>
            <Text style={estilos.resumoTexto}>
              {tx.Pago} no mês{pendente > 0 ? ` · mais ${formatarMoeda(pendente)} aguardando confirmação` : ''}
            </Text>
            <Text style={estilos.resumoValor}>{formatarMoeda(confirmado)}</Text>
          </View>
          {!lista.length ? (
            <Text style={estilos.dica}>Nenhum {tx.pagamento} neste mês.</Text>
          ) : (
            <Lista>
              {lista.map((b) => {
                const l = um(b.lancamento);
                return (
                  <Linha
                    key={b.id}
                    titulo={`${doBanco(b.data)} · Nº ${l.numero} · ${l.descricao ?? 'Título'}`}
                    linhas={[um(l.pessoa)?.nome, um(b.banco)?.nome, nomeUnidade(b.fazenda_id, fazendas), b.situacao === 'pendente' ? ROTULO_BAIXA.pendente : null]}
                    direita={formatarMoeda(Number(b.valor_pago))}
                    onPress={() => navegacao.navigate('TituloDetalhe', { id: l.id })}
                  />
                );
              })}
            </Lista>
          )}
        </>
      );
    }
    if (relacao === 'continuas') {
      if (!lista.length) return <Text style={estilos.dica}>Nenhuma conta contínua. Lance em Lançar › "Contínua (todo mês)".</Text>;
      return (
        <>
          <View style={estilos.resumo}>
            <Text style={estilos.resumoTexto}>Previsto por mês (contas ativas)</Text>
            <Text style={estilos.resumoValor}>{formatarMoeda(lista.filter((r) => r.ativa).reduce((s, r) => s + Number(r.valor), 0))}</Text>
          </View>
          <Lista>
            {lista.map((r) => (
              <Linha
                key={r.id}
                titulo={r.descricao}
                linhas={[um(r.pessoa)?.nome, nomeUnidade(r.fazenda_id, fazendas), `Todo dia ${r.dia_vencimento} · desde ${doBanco(r.inicio)}${r.fim ? ` · até ${doBanco(r.fim).slice(3)}` : ''}`, r.ativa ? null : 'Encerrada']}
                direita={formatarMoeda(Number(r.valor))}
                inativo={!r.ativa}
                onPress={() => {
                  setRelacao(null);
                  setBusca(r.descricao);
                }}
              />
            ))}
          </Lista>
          <Text style={estilos.nota}>Tocando, aparecem os títulos da conta. Para encerrar: Lançar › Alterar um título já lançado › abra o título do último mês.</Text>
        </>
      );
    }
    if (!lista.length) return <Text style={estilos.dica}>Nenhuma conta bancária ou caixa. Cadastre em Financeiro › Bancos e caixa.</Text>;
    return (
      <>
        <View style={estilos.resumo}>
          <Text style={estilos.resumoTexto}>Saldo total</Text>
          <Text style={estilos.resumoValor}>{formatarMoeda(lista.reduce((s, c) => s + Number(c.saldo), 0))}</Text>
        </View>
        <Lista>
          {lista.map((c) => (
            <Linha key={c.id} titulo={c.nome} linhas={[c.tipo === 'caixa' ? 'Caixa' : c.tipo === 'aplicacao' ? 'Aplicação' : 'Conta bancária']} direita={formatarMoeda(Number(c.saldo))} onPress={() => {}} />
          ))}
        </Lista>
        <Text style={estilos.nota}>Saldo inicial, mais os recebimentos e menos os pagamentos confirmados.</Text>
      </>
    );
  }

  return (
    <>
      <Escolha rotulo="De qual unidade" opcoes={opcoesFiltroUnidade(fazendas)} valor={unidade} aoMudar={setUnidade} />
      <Busca valor={busca} aoMudar={(t) => { setBusca(t); if (t) setRelacao(null); }} dica="Nº do título, fornecedor, descrição ou documento" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {termo ? (
        achados === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        ) : achados.length === 0 ? (
          <Text style={estilos.dica}>Nenhum título com "{termo}".</Text>
        ) : (
          <Lista>{achados.map(linhaTitulo)}</Lista>
        )
      ) : relacao ? (
        <>
          <Secao titulo={RELACOES.find((r) => r.valor === relacao)!.rotulo} />
          {corpo()}
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
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  resumo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  resumoTexto: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  resumoValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  mes: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mesTexto: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto, textTransform: 'capitalize' },
});
