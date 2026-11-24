import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Escolha from '../../componentes/Escolha';
import CampoData from '../../componentes/CampoData';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { OPCOES_PERIODO, carregarBalancete, carregarPatrimonial, idsEscolha, periodoDe, r2, type ContaBalancete } from '../../lib/balancete';
import { ADM, TODAS, opcoesUnidade, rotuloRelatorio } from '../../lib/unidades';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/**
 * V173: Financeiro › Balancete das contas de resultado (Receitas e Custos e despesas), por fazenda,
 * do Administrativo ou do Grupo. Sintético (até o grau 3, os centros de custo) ou analítico (até o grau 4).
 * Regime de competência. Tocando numa conta de grau 3 ou 4, abre a relação dos lançamentos.
 */
export default function Balancete() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const naoParticular = fazendas.filter((f) => f.tipo !== 'particular');
  const inicial = modoAdm ? ADM : fazendaAtiva && fazendaAtiva.tipo !== 'particular' ? fazendaAtiva.id : TODAS;
  const [quais, setQuais] = useState<string[]>([inicial]);
  const [periodo, setPeriodo] = useState<string[]>(['ano']);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [tipo, setTipo] = useState<string[]>(['sintetico']);
  const [zeradas, setZeradas] = useState<string[]>([]);
  const [contas, setContas] = useState<ContaBalancete[] | null>(null);
  // V176: Ativo, Passivo e PL (do Grupo): no Grupo e no Administrativo
  const [patr, setPatr] = useState<ContaBalancete[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const qual = quais[0];
  const grau = tipo[0] === 'analitico' ? 4 : 3;

  const faixa = useMemo(() => {
    if (periodo[0] !== 'outro') return periodoDe(periodo[0]);
    if (!dataValida(de) || !dataValida(ate)) return null;
    const a = paraBanco(de)!;
    const b = paraBanco(ate)!;
    return a <= b ? { de: a, ate: b } : null;
  }, [periodo, de, ate]);

  const chaveIds = idsEscolha(qual, naoParticular).join(',');
  const mostraPatr = qual === TODAS || qual === ADM;
  const dataPatr = faixa ? (faixa.ate > hojeBanco() ? hojeBanco() : faixa.ate) : null;
  useFocusEffect(
    useCallback(() => {
      if (!faixa) return;
      let vivo = true;
      setErro(null);
      setContas(null);
      carregarBalancete(chaveIds.split(','), faixa.de, faixa.ate, grau as 3 | 4)
        .then((c) => vivo && setContas(c))
        .catch((e) => vivo && setErro(e.message));
      setPatr(null);
      if (mostraPatr && dataPatr)
        carregarPatrimonial(dataPatr)
          .then((c) => vivo && setPatr(c.filter((x) => x.grau <= grau)))
          .catch((e) => vivo && setErro(e.message));
      return () => {
        vivo = false;
      };
    }, [faixa, chaveIds, grau, mostraPatr, dataPatr]),
  );

  const visiveis = useMemo(() => (contas ?? []).filter((c) => c.grau === 1 || zeradas.length > 0 || c.valor !== 0), [contas, zeradas]);
  const total = (g: string) => r2(contas?.find((c) => c.codigo === g)?.valor ?? 0);
  const resultado = r2(total('3') - total('4'));
  const unidade = rotuloRelatorio(qual, fazendas);

  const linha = (c: ContaBalancete) => {
    const abre = c.grau >= 3;
    return (
      <Pressable
        key={c.codigo}
        disabled={!abre}
        onPress={() => navegacao.navigate('LancamentosConta', { codigo: c.codigo, nome: c.nome, periodo: periodo[0] === 'outro' ? 'outro' : periodo[0], de: faixa?.de, ate: faixa?.ate, unidade })}
        style={({ pressed }) => [estilos.linha, estilos[`g${c.grau}` as 'g1'], pressed && abre && { backgroundColor: '#F3F6F2' }]}
      >
        <Text style={[estilos.codigo, c.grau <= 2 && estilos.forte]}>{c.codigo}</Text>
        <Text style={[estilos.nome, c.grau <= 2 && estilos.forte, c.grau === 3 && { fontWeight: '700' }]}>{c.nome}</Text>
        <Text style={[estilos.valor, c.grau <= 3 && estilos.forte, c.valor < 0 && { color: cores.erro }]}>{formatarMoeda(c.valor)}</Text>
        {abre ? <Ionicons name="chevron-forward" size={16} color={cores.textoSuave} /> : <View style={{ width: 16 }} />}
      </Pressable>
    );
  };

  return (
    <Tela>
      <Escolha rotulo="De quem" opcoes={[{ valor: TODAS, rotulo: 'Grupo (tudo)' }, ...opcoesUnidade(naoParticular)]} valor={quais} aoMudar={setQuais} />
      <Escolha rotulo="Período" opcoes={OPCOES_PERIODO} valor={periodo} aoMudar={setPeriodo} />
      {periodo[0] === 'outro' && (
        <View style={estilos.linhaDatas}>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="De" valor={de} aoMudar={setDe} />
          </View>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="Até" valor={ate} aoMudar={setAte} />
          </View>
        </View>
      )}
      <Escolha
        rotulo="Apresentar"
        opcoes={[
          { valor: 'sintetico', rotulo: 'Sintético (grau 3)' },
          { valor: 'analitico', rotulo: 'Analítico (grau 4)' },
        ]}
        valor={tipo}
        aoMudar={setTipo}
      />
      <Escolha opcoes={[{ valor: 'sim', rotulo: 'Mostrar contas sem movimento' }]} valor={zeradas} aoMudar={setZeradas} multiplo />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!faixa ? (
        <Text style={estilos.nota}>Informe as duas datas do período.</Text>
      ) : !contas ? (
        !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          {mostraPatr ? (
            <>
              <View style={[estilos.cartao, { marginTop: 8 }]}>
                <Text style={estilos.rotulo}>Contas patrimoniais do Grupo · saldo em {dataPatr ? doBanco(dataPatr) : ''}</Text>
                {!patr ? (
                  <ActivityIndicator color={cores.primaria} />
                ) : (
                  <>
                    <View style={estilos.resumo}>
                      <Text style={estilos.resumoRotulo}>Ativo</Text>
                      <Text style={estilos.resumoValor}>{formatarMoeda(patr.find((c) => c.codigo === '1')?.valor ?? 0)}</Text>
                    </View>
                    <View style={estilos.resumo}>
                      <Text style={estilos.resumoRotulo}>Passivo</Text>
                      <Text style={estilos.resumoValor}>{formatarMoeda((patr.find((c) => c.codigo === '2.1')?.valor ?? 0) + (patr.find((c) => c.codigo === '2.2')?.valor ?? 0))}</Text>
                    </View>
                    <View style={estilos.resumo}>
                      <Text style={[estilos.resumoRotulo, estilos.forte]}>Patrimônio Líquido</Text>
                      <Text style={[estilos.resultado, (patr.find((c) => c.codigo === '2.3')?.valor ?? 0) < 0 && { color: cores.erro }]}>{formatarMoeda(patr.find((c) => c.codigo === '2.3')?.valor ?? 0)}</Text>
                    </View>
                  </>
                )}
              </View>
              {patr && (
                <View style={estilos.tabela}>
                  <View style={[estilos.linha, estilos.cabecalho]}>
                    <Text style={[estilos.codigo, estilos.forte]}>Conta</Text>
                    <Text style={[estilos.nome, estilos.forte]}>Nome</Text>
                    <Text style={[estilos.valor, estilos.forte]}>Saldo</Text>
                    <View style={{ width: 16 }} />
                  </View>
                  {patr
                    .filter((c) => c.grau <= 2 || zeradas.length > 0 || c.valor !== 0)
                    .map((c) => {
                      // V177: tocando numa conta de grau 3 ou 4, abre a razão (saldo anterior, débitos, créditos e saldo)
                      const abre = c.grau >= 3;
                      return (
                        <Pressable
                          key={c.codigo}
                          disabled={!abre}
                          onPress={() =>
                            navegacao.navigate('RazaoConta', { codigo: c.codigo, nome: c.nome, periodo: periodo[0], de: faixa?.de, ate: dataPatr ?? faixa?.ate })
                          }
                          style={({ pressed }) => [estilos.linha, estilos[`g${Math.min(c.grau, 4)}` as 'g1'], pressed && abre && { backgroundColor: '#F3F6F2' }]}
                        >
                          <Text style={[estilos.codigo, c.grau <= 2 && estilos.forte]}>{c.codigo}</Text>
                          <Text style={[estilos.nome, c.grau <= 2 && estilos.forte, c.grau === 3 && { fontWeight: '700' }]}>{c.codigo === '2' ? 'PASSIVO E PATRIMÔNIO LÍQUIDO' : c.nome}</Text>
                          <Text style={[estilos.valor, c.grau <= 3 && estilos.forte, c.valor < 0 && { color: cores.erro }]}>{formatarMoeda(c.valor)}</Text>
                          {abre ? <Ionicons name="chevron-forward" size={16} color={cores.textoSuave} /> : <View style={{ width: 16 }} />}
                        </Pressable>
                      );
                    })}
                </View>
              )}
              <Text style={estilos.nota}>
                Saldos na data, apurados pelo sistema: caixa e bancos, contas a receber e a pagar em aberto, estoques a custo, imobilizado menos a depreciação acumulada e o principal dos financiamentos (até 12 meses no circulante). O Patrimônio Líquido fecha a conta: os Saldos de Abertura são o Ativo menos o Passivo, o Resultado acumulado e as Retiradas. Terras, rebanho e café em estoque ainda não têm valor no sistema, por isso o PL pode aparecer menor (ou negativo). Toque numa conta para ver a razão dela.
              </Text>
            </>
          ) : (
            <Text style={estilos.nota}>Ativo, Passivo e Patrimônio Líquido são do Grupo: escolha "Grupo (tudo)" ou "Administrativo" para ver as contas patrimoniais.</Text>
          )}
          <Text style={[estilos.rotulo, { marginTop: 8 }]}>Contas de resultado (3 Receitas e 4 Custos e despesas) no período</Text>
          <View style={estilos.cartao}>
            <Text style={estilos.rotulo}>
              Balancete {grau === 3 ? 'sintético' : 'analítico'} · {unidade}
            </Text>
            <Text style={estilos.rotulo}>{periodo[0] === 'tudo' ? 'Desde o início' : `${doBanco(faixa.de)} a ${doBanco(faixa.ate)}`}</Text>
            <View style={estilos.resumo}>
              <Text style={estilos.resumoRotulo}>Receitas</Text>
              <Text style={[estilos.resumoValor, { color: cores.primaria }]}>{formatarMoeda(total('3'))}</Text>
            </View>
            <View style={estilos.resumo}>
              <Text style={estilos.resumoRotulo}>Custos e despesas</Text>
              <Text style={estilos.resumoValor}>{formatarMoeda(total('4'))}</Text>
            </View>
            <View style={estilos.resumo}>
              <Text style={[estilos.resumoRotulo, estilos.forte]}>Resultado</Text>
              <Text style={[estilos.resultado, resultado < 0 && { color: cores.erro }]}>{formatarMoeda(resultado)}</Text>
            </View>
          </View>
          <View style={estilos.tabela}>
            <View style={[estilos.linha, estilos.cabecalho]}>
              <Text style={[estilos.codigo, estilos.forte]}>Conta</Text>
              <Text style={[estilos.nome, estilos.forte]}>Nome</Text>
              <Text style={[estilos.valor, estilos.forte]}>Valor</Text>
              <View style={{ width: 16 }} />
            </View>
            {visiveis.map(linha)}
          </View>
          <Text style={estilos.nota}>
            Regime de competência: compras e títulos pela data de emissão; Atividades, abastecimentos e sanidade pela data do consumo; juros, multas e descontos pela data do pagamento. O Particular dos sócios fica fora (é Patrimônio Líquido). Para o que entrou e saiu do caixa, veja o Resultado da atividade.
          </Text>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linhaDatas: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  rotulo: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '700' },
  resumo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resumoRotulo: { fontSize: tam.texto, color: cores.texto },
  resumoValor: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  resultado: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.cafe },
  tabela: { borderRadius: tam.raio, overflow: 'hidden', borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao },
  cabecalho: { backgroundColor: cores.infoFundo },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cores.borda },
  g1: { backgroundColor: cores.sucessoFundo },
  g2: { backgroundColor: '#F4F7F3' },
  g3: {},
  g4: { paddingLeft: 22 },
  codigo: { width: 96, fontSize: tam.pequeno, color: cores.textoSuave },
  nome: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto },
  valor: { minWidth: 110, textAlign: 'right', fontSize: tam.pequeno + 1, color: cores.texto },
  forte: { fontWeight: '800', color: cores.texto },
});
