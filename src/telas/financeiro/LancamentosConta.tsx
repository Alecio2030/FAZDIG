import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Escolha from '../../componentes/Escolha';
import CampoData from '../../componentes/CampoData';
import Aviso from '../../componentes/Aviso';
import { OPCOES_PERIODO, carregarMovimentos, periodoDe, r2, rotaDaOrigem, type Movimento } from '../../lib/balancete';
import { consulta, supabase } from '../../lib/supabase';
import { dataValida, doBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Grupo = { chave: string; rotulo: string; valor: number; qtde: number };

function agrupar(movs: Movimento[], chave: (m: Movimento) => string, rotulo: (k: string) => string): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const x of movs) {
    const k = chave(x);
    const g = m.get(k) ?? { chave: k, rotulo: rotulo(k), valor: 0, qtde: 0 };
    g.valor = r2(g.valor + x.valor);
    g.qtde += 1;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

/**
 * V173: relação dos lançamentos de uma conta do plano (grau 3 = centro de custo, ou grau 4) no período:
 * Atividades, compras, títulos, abastecimentos e sanidade. Só consulta; tocando, abre o lançamento de origem.
 */
export default function LancamentosConta() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'LancamentosConta'>>();
  const [periodo, setPeriodo] = useState<string[]>([params.periodo ?? 'ano']);
  const [de, setDe] = useState(params.de ? doBanco(params.de) : '');
  const [ate, setAte] = useState(params.ate ? doBanco(params.ate) : '');
  const [movs, setMovs] = useState<Movimento[] | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [filtroConta, setFiltroConta] = useState<string | null>(null);
  const [filtroCentro, setFiltroCentro] = useState<string | null>(null);

  const faixa = useMemo(() => {
    if (periodo[0] !== 'outro') return periodoDe(periodo[0]);
    if (!dataValida(de) || !dataValida(ate)) return null;
    const a = paraBanco(de)!;
    const b = paraBanco(ate)!;
    return a <= b ? { de: a, ate: b } : null;
  }, [periodo, de, ate]);

  useFocusEffect(
    useCallback(() => {
      if (!faixa) return;
      let vivo = true;
      setErro(null);
      setMovs(null);
      carregarMovimentos(params.codigo, faixa.de, faixa.ate)
        .then(async (l) => {
          if (!vivo) return;
          setMovs(l);
          const cods = [...new Set(l.map((m) => m.conta_codigo))];
          if (cods.length) {
            const pc = await consulta<{ codigo: string; nome: string }[]>(supabase.from('plano_contas').select('codigo, nome').in('codigo', cods)).catch(() => []);
            if (vivo) setNomes(Object.fromEntries(pc.map((c) => [c.codigo, c.nome])));
          }
        })
        .catch((e) => vivo && setErro(e.message));
      return () => {
        vivo = false;
      };
    }, [faixa, params.codigo]),
  );

  const porConta = useMemo(() => agrupar(movs ?? [], (m) => m.conta_codigo, (k) => `${k}  ${nomes[k] ?? ''}`), [movs, nomes]);
  const porCentro = useMemo(() => agrupar(movs ?? [], (m) => m.centro ?? '', (k) => k || 'Sem centro de custo informado'), [movs]);
  const visiveis = useMemo(
    () => (movs ?? []).filter((m) => (!filtroConta || m.conta_codigo === filtroConta) && (filtroCentro === null || (m.centro ?? '') === filtroCentro)),
    [movs, filtroConta, filtroCentro],
  );
  const total = r2(visiveis.reduce((t, m) => t + m.valor, 0));
  const receita = params.codigo.startsWith('3');

  const quadro = (titulo: string, grupos: Grupo[], ativo: string | null, aoTocar: (k: string | null) => void) =>
    grupos.length > 1 && (
      <View style={estilos.bloco}>
        <Text style={estilos.blocoTitulo}>{titulo}</Text>
        {grupos.map((g) => {
          const marcado = ativo === g.chave;
          return (
            <Pressable key={g.chave} onPress={() => aoTocar(marcado ? null : g.chave)} style={({ pressed }) => [estilos.grupo, marcado && estilos.grupoMarcado, pressed && { opacity: 0.8 }]}>
              <Text style={[estilos.grupoNome, marcado && { fontWeight: '800' }]}>{g.rotulo}</Text>
              <Text style={estilos.grupoValor}>{formatarMoeda(g.valor)}</Text>
            </Pressable>
          );
        })}
        <Text style={estilos.nota}>Toque para ver só esses lançamentos; toque de novo para ver todos.</Text>
      </View>
    );

  return (
    <Tela>
      <View style={estilos.cabeca}>
        <Text style={estilos.titulo}>
          {params.codigo}  {params.nome}
        </Text>
        {params.unidade ? <Text style={estilos.nota}>{params.unidade}</Text> : null}
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
      ) : !movs ? (
        !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          <View style={estilos.cartao}>
            <Text style={estilos.rotulo}>
              {receita ? 'Receitas' : 'Custos e despesas'} · {periodo[0] === 'tudo' ? 'desde o início' : `${doBanco(faixa.de)} a ${doBanco(faixa.ate)}`}
            </Text>
            <Text style={[estilos.total, receita && { color: cores.primaria }]}>{formatarMoeda(total)}</Text>
            <Text style={estilos.nota}>
              {visiveis.length} {visiveis.length === 1 ? 'lançamento' : 'lançamentos'}
              {filtroConta || filtroCentro !== null ? ' (filtrados)' : ''}
            </Text>
          </View>
          {quadro('Por conta', porConta, filtroConta, setFiltroConta)}
          {quadro('Por talhão, manga, lote ou centro', porCentro, filtroCentro, setFiltroCentro)}
          {!visiveis.length ? (
            <Text style={estilos.nota}>Nenhum lançamento no período.</Text>
          ) : (
            <View style={estilos.lista}>
              {visiveis.map((m, i) => {
                const destino = rotaDaOrigem(m);
                return (
                  <Pressable
                    key={`${m.origem_id}-${m.conta_codigo}-${m.centro}-${i}`}
                    disabled={!destino}
                    onPress={() => destino && navegacao.navigate(destino.rota, { id: destino.id })}
                    style={({ pressed }) => [estilos.mov, i > 0 && estilos.divisor, pressed && { backgroundColor: '#F3F6F2' }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={estilos.movTitulo}>
                        {doBanco(m.data)} · {m.documento ?? ''}
                      </Text>
                      {m.historico ? <Text style={estilos.movTexto}>{m.historico}</Text> : null}
                      {m.pessoa ? <Text style={estilos.nota}>{m.pessoa}</Text> : null}
                      {m.centro ? <Text style={estilos.nota}>{m.centro}</Text> : null}
                      <Text style={estilos.nota}>
                        {m.conta_codigo}  {nomes[m.conta_codigo] ?? ''}
                      </Text>
                    </View>
                    <Text style={[estilos.movValor, m.valor < 0 && { color: cores.erro }]}>{formatarMoeda(m.valor)}</Text>
                    {destino ? <Ionicons name="chevron-forward" size={18} color={cores.textoSuave} /> : <View style={{ width: 18 }} />}
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={estilos.nota}>
            Regime de competência: compras e títulos pela data de emissão; Atividades, abastecimentos e sanidade pela data do consumo (o retorno ao estoque entra negativo); juros, multas e descontos pela data do pagamento.
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
  total: { fontSize: tam.subtitulo + 6, fontWeight: '800', color: cores.cafe },
  bloco: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 4 },
  blocoTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  grupo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 6 },
  grupoMarcado: { backgroundColor: cores.sucessoFundo },
  grupoNome: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto },
  grupoValor: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  lista: { borderRadius: tam.raio, overflow: 'hidden', borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao },
  divisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  mov: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  movTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  movTexto: { fontSize: tam.pequeno + 1, color: cores.texto },
  movValor: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
});
