import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Escolha from '../../componentes/Escolha';
import CampoData from '../../componentes/CampoData';
import Aviso from '../../componentes/Aviso';
import { OPCOES_PERIODO, carregarPatrimonial, carregarRazaoPatrimonial, destinoDaRazao, natureza, periodoDe, r2, type LinhaRazao } from '../../lib/balancete';
import { consulta, supabase } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import type { PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const LOTE = 200;

/**
 * V177: razão de uma conta patrimonial (Ativo, Passivo e Patrimônio Líquido, do Grupo).
 * Abre com o saldo anterior (acumulado desde o início), mostra cada lançamento com débito, crédito
 * e o saldo depois dele, e fecha com o saldo final, que tem que bater com o Balancete.
 * Só consulta; tocando numa linha, abre o lançamento de origem.
 */
export default function RazaoConta() {
  const navegacao = useNavigation<any>();
  const { params } = useRoute<RouteProp<PilhaParams, 'RazaoConta'>>();
  const [periodo, setPeriodo] = useState<string[]>([params.periodo ?? 'ano']);
  const [de, setDe] = useState(params.de ? doBanco(params.de) : '');
  const [ate, setAte] = useState(params.ate ? doBanco(params.ate) : '');
  const [linhas, setLinhas] = useState<LinhaRazao[] | null>(null);
  const [saldoBalancete, setSaldoBalancete] = useState<number | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [filtroConta, setFiltroConta] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(LOTE);
  const nat = natureza(params.codigo);
  const sinal = nat === 'D' ? 1 : -1;

  // Saldo é sempre até hoje, no máximo (igual ao Balancete)
  const faixa = useMemo(() => {
    let f: { de: string; ate: string } | null;
    if (periodo[0] !== 'outro') f = periodoDe(periodo[0]);
    else if (!dataValida(de) || !dataValida(ate)) f = null;
    else {
      const a = paraBanco(de)!;
      const b = paraBanco(ate)!;
      f = a <= b ? { de: a, ate: b } : null;
    }
    if (!f) return null;
    const hoje = hojeBanco();
    return { de: f.de, ate: f.ate > hoje ? hoje : f.ate };
  }, [periodo, de, ate]);

  useFocusEffect(
    useCallback(() => {
      if (!faixa) return;
      let vivo = true;
      setErro(null);
      setLinhas(null);
      setSaldoBalancete(null);
      setMostrar(LOTE);
      carregarRazaoPatrimonial(params.codigo, faixa.de, faixa.ate)
        .then(async (l) => {
          if (!vivo) return;
          setLinhas(l);
          const cods = [...new Set(l.filter((x) => !x.anterior).map((x) => x.conta_codigo))];
          if (cods.length) {
            const pc = await consulta<{ codigo: string; nome: string }[]>(supabase.from('plano_contas').select('codigo, nome').in('codigo', cods)).catch(() => []);
            if (vivo) setNomes(Object.fromEntries(pc.map((c) => [c.codigo, c.nome])));
          }
        })
        .catch((e) => vivo && setErro(e.message));
      // conferência com o Balancete na data final
      carregarPatrimonial(faixa.ate)
        .then((c) => vivo && setSaldoBalancete(c.find((x) => x.codigo === params.codigo)?.valor ?? 0))
        .catch(() => undefined);
      return () => {
        vivo = false;
      };
    }, [faixa, params.codigo]),
  );

  const anterior = r2((linhas?.find((l) => l.anterior)?.valor ?? 0) * sinal);
  const movs = useMemo(() => (linhas ?? []).filter((l) => !l.anterior), [linhas]);

  const porConta = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of movs) m.set(l.conta_codigo, r2((m.get(l.conta_codigo) ?? 0) + l.valor));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [movs]);

  const visiveis = useMemo(() => movs.filter((l) => !filtroConta || l.conta_codigo === filtroConta), [movs, filtroConta]);
  const debitos = r2(visiveis.reduce((t, l) => t + (l.valor > 0 ? l.valor : 0), 0));
  const creditos = r2(visiveis.reduce((t, l) => t + (l.valor < 0 ? -l.valor : 0), 0));
  const finalConta = r2(anterior + sinal * (debitos - creditos));

  // saldo depois de cada linha (só faz sentido sem filtro por conta)
  const saldos = useMemo(() => {
    let s = anterior;
    return movs.map((l) => (s = r2(s + sinal * l.valor)));
  }, [movs, anterior, sinal]);

  const naoBate = !filtroConta && saldoBalancete !== null && linhas && Math.abs(finalConta - saldoBalancete) > 0.01;

  return (
    <Tela>
      <View style={estilos.cabeca}>
        <Text style={estilos.titulo}>
          {params.codigo}  {params.nome}
        </Text>
        <Text style={estilos.nota}>Conta do Grupo · natureza {nat === 'D' ? 'devedora (Ativo)' : 'credora (Passivo e PL)'}</Text>
      </View>
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
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!faixa ? (
        <Text style={estilos.nota}>Informe as duas datas do período.</Text>
      ) : !linhas ? (
        !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          <View style={estilos.cartao}>
            <Text style={estilos.rotulo}>{periodo[0] === 'tudo' ? `Desde o início até ${doBanco(faixa.ate)}` : `${doBanco(faixa.de)} a ${doBanco(faixa.ate)}`}</Text>
            <View style={estilos.resumo}>
              <Text style={estilos.resumoRotulo}>Saldo anterior</Text>
              <Text style={[estilos.resumoValor, anterior < 0 && { color: cores.erro }]}>{filtroConta ? '—' : formatarMoeda(anterior)}</Text>
            </View>
            <View style={estilos.resumo}>
              <Text style={estilos.resumoRotulo}>(+) Débitos</Text>
              <Text style={estilos.resumoValor}>{formatarMoeda(debitos)}</Text>
            </View>
            <View style={estilos.resumo}>
              <Text style={estilos.resumoRotulo}>(–) Créditos</Text>
              <Text style={estilos.resumoValor}>{formatarMoeda(creditos)}</Text>
            </View>
            <View style={estilos.resumo}>
              <Text style={[estilos.resumoRotulo, estilos.forte]}>Saldo final</Text>
              <Text style={[estilos.total, finalConta < 0 && { color: cores.erro }]}>{filtroConta ? '—' : formatarMoeda(finalConta)}</Text>
            </View>
            <Text style={estilos.nota}>
              {visiveis.length} {visiveis.length === 1 ? 'lançamento' : 'lançamentos'} no período{filtroConta ? ' (filtrados por conta)' : ''}
              {nat === 'C' ? ' · nas contas credoras, o crédito aumenta o saldo e o débito diminui' : ''}
            </Text>
          </View>
          {naoBate && (
            <Aviso
              tipo="erro"
              texto={`O saldo final da razão (${formatarMoeda(finalConta)}) não bate com o Balancete (${formatarMoeda(saldoBalancete!)}). Me avise para conferir.`}
            />
          )}
          {porConta.length > 1 && (
            <View style={estilos.bloco}>
              <Text style={estilos.blocoTitulo}>Movimento por conta</Text>
              {porConta.map(([cod, v]) => {
                const marcado = filtroConta === cod;
                return (
                  <Pressable key={cod} onPress={() => setFiltroConta(marcado ? null : cod)} style={({ pressed }) => [estilos.grupo, marcado && estilos.grupoMarcado, pressed && { opacity: 0.8 }]}>
                    <Text style={[estilos.grupoNome, marcado && { fontWeight: '800' }]}>
                      {cod}  {nomes[cod] ?? ''}
                    </Text>
                    <Text style={estilos.grupoValor}>{formatarMoeda(v * sinal)}</Text>
                  </Pressable>
                );
              })}
              <Text style={estilos.nota}>Toque para ver só os lançamentos dessa conta; toque de novo para ver todos.</Text>
            </View>
          )}
          <View style={estilos.lista}>
            {!filtroConta && (
              <View style={[estilos.mov, estilos.linhaAnterior]}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.movTitulo}>{periodo[0] === 'tudo' ? 'Início' : doBanco(faixa.de)} · Saldo anterior</Text>
                </View>
                <Text style={[estilos.saldo, anterior < 0 && { color: cores.erro }]}>{formatarMoeda(anterior)}</Text>
                <View style={{ width: 18 }} />
              </View>
            )}
            {!visiveis.length ? (
              <Text style={[estilos.nota, { padding: 12 }]}>Nenhum lançamento no período.</Text>
            ) : (
              visiveis.slice(0, mostrar).map((l, i) => {
                const destino = destinoDaRazao(l);
                const saldo = filtroConta ? null : saldos[i];
                return (
                  <Pressable
                    key={`${l.origem_id}-${l.conta_codigo}-${l.data}-${i}`}
                    disabled={!destino}
                    onPress={() => destino && navegacao.navigate(destino.rota, destino.params)}
                    style={({ pressed }) => [estilos.mov, estilos.divisor, pressed && { backgroundColor: '#F3F6F2' }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={estilos.movTitulo}>
                        {doBanco(l.data)} · {l.documento ?? ''}
                      </Text>
                      {l.historico ? <Text style={estilos.movTexto}>{l.historico}</Text> : null}
                      {l.pessoa ? <Text style={estilos.nota}>{l.pessoa}</Text> : null}
                      {l.conta_codigo !== params.codigo ? (
                        <Text style={estilos.nota}>
                          {l.conta_codigo}  {nomes[l.conta_codigo] ?? ''}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', minWidth: 118 }}>
                      <Text style={[estilos.movValor, l.valor < 0 && { color: cores.cafe }]}>
                        {l.valor > 0 ? 'D ' : 'C '}
                        {formatarMoeda(Math.abs(l.valor))}
                      </Text>
                      {saldo !== null ? <Text style={[estilos.saldoLinha, saldo < 0 && { color: cores.erro }]}>Saldo {formatarMoeda(saldo)}</Text> : null}
                    </View>
                    {destino ? <Ionicons name="chevron-forward" size={18} color={cores.textoSuave} /> : <View style={{ width: 18 }} />}
                  </Pressable>
                );
              })
            )}
            {visiveis.length > mostrar && (
              <Pressable onPress={() => setMostrar(mostrar + LOTE)} style={({ pressed }) => [estilos.mais, pressed && { opacity: 0.7 }]}>
                <Text style={estilos.maisTexto}>Mostrar mais ({visiveis.length - mostrar} restantes)</Text>
              </Pressable>
            )}
          </View>
          <Text style={estilos.nota}>
            D = débito, C = crédito. Os saldos são apurados pelo sistema a partir dos próprios registros: caixa e bancos pelas baixas, contas a receber e a pagar pelo que está em aberto, estoques a custo, imobilizado menos a depreciação e o principal dos financiamentos (passa para o curto prazo quando faltam 12 meses para vencer). O Resultado acumulado vem resumido por mês; os Saldos de Abertura mostram o que entrou sem contrapartida no sistema (implantação, saldos iniciais).
          </Text>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cabeca: { gap: 2 },
  titulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  linhaDatas: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  rotulo: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '700' },
  resumo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resumoRotulo: { fontSize: tam.texto, color: cores.texto },
  resumoValor: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  forte: { fontWeight: '800', color: cores.texto },
  total: { fontSize: tam.subtitulo + 4, fontWeight: '800', color: cores.cafe },
  bloco: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 4 },
  blocoTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  grupo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 6 },
  grupoMarcado: { backgroundColor: cores.sucessoFundo },
  grupoNome: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto },
  grupoValor: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  lista: { borderRadius: tam.raio, overflow: 'hidden', borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao },
  divisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  linhaAnterior: { backgroundColor: cores.infoFundo },
  mov: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  movTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  movTexto: { fontSize: tam.pequeno + 1, color: cores.texto },
  movValor: { fontSize: tam.texto, fontWeight: '800', color: cores.primaria },
  saldo: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  saldoLinha: { fontSize: tam.pequeno, color: cores.textoSuave },
  mais: { padding: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  maisTexto: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primaria },
});
