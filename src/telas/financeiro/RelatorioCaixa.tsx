import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import CampoData from '../../componentes/CampoData';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { useSessao } from '../../contexto/SessaoContext';
import { nomeUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { somarMeses } from '../../lib/financiamentos';
import { cores, tam } from '../../tema';

const r2 = (x: number) => Math.round(x * 100) / 100;
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const TODAS = 'todas';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`;
const ultimoDia = (am: string) => {
  const [a, m] = am.split('-').map(Number);
  return `${am}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Financeiro › Extrato e fluxo de caixa. Só consulta: tudo sai dos pagamentos, recebimentos e títulos já lançados. */
export default function RelatorioCaixa() {
  const [aba, setAba] = useState<string[]>(['extrato']);
  return (
    <Tela>
      <Escolha
        opcoes={[
          { valor: 'extrato', rotulo: 'Extrato' },
          { valor: 'fluxo', rotulo: 'Fluxo previsto' },
        ]}
        valor={aba}
        aoMudar={setAba}
      />
      {aba[0] === 'extrato' ? <Extrato /> : <Fluxo />}
    </Tela>
  );
}

// =====================================================================================================
// EXTRATO: o que entrou e saiu de um caixa ou banco num período
// =====================================================================================================
type Mov = { id: string; data: string; valor: number; tipo: string; numero: number | null; descricao: string | null; documento: string | null; parcela: number | null; total_parcelas: number | null; pessoa: string | null; fazenda: string | null; conta: string | null };

function periodoDe(p: string): { de: string; ate: string } {
  const hoje = hojeBanco();
  const mes = hoje.slice(0, 7);
  if (p === 'anterior') {
    const ant = somarMeses(`${mes}-01`, -1).slice(0, 7);
    return { de: `${ant}-01`, ate: ultimoDia(ant) };
  }
  if (p === 'ano') return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
  if (p === '3meses') return { de: somarMeses(`${mes}-01`, -2), ate: hoje };
  return { de: `${mes}-01`, ate: ultimoDia(mes) };
}

function Extrato() {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [contas, setContas] = useState<any[] | null>(null);
  const [contaId, setContaId] = useState<string | null>(TODAS);
  const [periodo, setPeriodo] = useState<string[]>(['mes']);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [dados, setDados] = useState<{ saldo_anterior: number; movimentos: Mov[]; pendentes: number } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!fid) return;
    consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id, data_saldo_inicial').eq('ativa', true).order('nome'))
      .then((d) => setContas(d)) // caixa e bancos são do Grupo
      .catch((e) => setErro(traduzirErro(e)));
  }, [fid]);

  const carregarContas = useCallback(async (): Promise<ItemLista[]> => [{ id: TODAS, titulo: 'Todas as contas (caixa e bancos)' }, ...(contas ?? []).map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }))], [contas]);

  const faixa = useMemo(() => {
    if (periodo[0] !== 'outro') return periodoDe(periodo[0]);
    if (!dataValida(de) || !dataValida(ate)) return null;
    const a = paraBanco(de)!;
    const b = paraBanco(ate)!;
    return a <= b ? { de: a, ate: b } : null;
  }, [periodo, de, ate]);

  const carregar = useCallback(() => {
    if (!contas || !faixa || !contaId) return;
    const ids = contaId === TODAS ? contas.map((c) => c.id) : [contaId];
    if (!ids.length) return setDados({ saldo_anterior: 0, movimentos: [], pendentes: 0 });
    setErro(null);
    setCarregando(true);
    supabase.rpc('extrato_contas', { p_contas: ids, p_de: faixa.de, p_ate: faixa.ate }).then(({ data, error }) => {
      setCarregando(false);
      if (error) return setErro(traduzirErro(error));
      setDados(data as any);
    });
  }, [contas, faixa, contaId]);
  useFocusEffect(carregar);

  const movs = dados?.movimentos ?? [];
  const entradas = r2(movs.filter((m) => Number(m.valor) > 0).reduce((t, m) => t + Number(m.valor), 0));
  const saidas = r2(movs.filter((m) => Number(m.valor) < 0).reduce((t, m) => t - Number(m.valor), 0));
  const anterior = Number(dados?.saldo_anterior ?? 0);
  const final = r2(anterior + entradas - saidas);
  let corrente = anterior;
  const comecoDepois = contaId !== TODAS && faixa ? (contas ?? []).find((c) => c.id === contaId && c.data_saldo_inicial && c.data_saldo_inicial > faixa.de) : null;

  return (
    <>
      <SeletorLista rotulo="Conta" valorId={contaId} aoMudar={(v) => setContaId(v ?? TODAS)} carregar={carregarContas} vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />
      <Escolha
        rotulo="Período"
        opcoes={[
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'anterior', rotulo: 'Mês passado' },
          { valor: '3meses', rotulo: '3 meses' },
          { valor: 'ano', rotulo: 'Este ano' },
          { valor: 'outro', rotulo: 'Outro' },
        ]}
        valor={periodo}
        aoMudar={setPeriodo}
      />
      {periodo[0] === 'outro' && (
        <View style={estilos.linha}>
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
        <Text style={estilos.vazio}>Informe as duas datas do período.</Text>
      ) : carregando || !dados ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          <View style={estilos.cartao}>
            <Text style={estilos.rotuloCartao}>
              {doBanco(faixa.de)} a {doBanco(faixa.ate)}
            </Text>
            <LinhaTotal rotulo="Saldo anterior" valor={anterior} />
            <LinhaTotal rotulo="Entradas" valor={entradas} cor={cores.primaria} />
            <LinhaTotal rotulo="Saídas" valor={-saidas} cor={cores.erro} />
            <View style={estilos.divisor} />
            <LinhaTotal rotulo="Saldo final" valor={final} forte />
          </View>
          {comecoDepois && <Text style={estilos.nota}>Esta conta começou no sistema em {doBanco(comecoDepois.data_saldo_inicial)}: o que é de antes dessa data não entra.</Text>}
          {Number(dados.pendentes) > 0 && <Aviso tipo="info" texto={`${dados.pendentes} ${Number(dados.pendentes) === 1 ? 'pagamento aguarda' : 'pagamentos aguardam'} a confirmação do dono e ainda não ${Number(dados.pendentes) === 1 ? 'entrou' : 'entraram'} no extrato.`} />}
          {movs.length === 0 ? (
            <Text style={estilos.vazio}>Nenhum movimento no período.</Text>
          ) : (
            movs.map((m) => {
              corrente = r2(corrente + Number(m.valor));
              const entrada = Number(m.valor) >= 0;
              return (
                <View key={m.id} style={estilos.mov}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={estilos.movTitulo}>
                      {doBanco(m.data)} · {m.descricao ?? (m.tipo === 'receber' ? 'Recebimento' : 'Pagamento')}
                      {m.total_parcelas && m.total_parcelas > 1 && !/parcela/i.test(m.descricao ?? '') ? ` (${m.parcela}/${m.total_parcelas})` : ''}
                    </Text>
                    <Text style={estilos.nota}>{[m.pessoa, m.numero ? `título nº ${m.numero}` : null, m.documento ? `doc. ${m.documento}` : null, m.fazenda, contaId === TODAS ? m.conta : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={[estilos.movValor, { color: entrada ? cores.primaria : cores.erro }]}>
                      {entrada ? '+' : '−'} {formatarMoeda(Math.abs(Number(m.valor)))}
                    </Text>
                    <Text style={estilos.nota}>{formatarMoeda(corrente)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
    </>
  );
}

// =====================================================================================================
// FLUXO PREVISTO: o que há a receber e a pagar, mês a mês, a partir do saldo de hoje
// =====================================================================================================
type Grupo = { chave: string; rotulo: string; receber: number; pagar: number; titulos: any[] };

function Fluxo() {
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  const [titulos, setTitulos] = useState<any[] | null>(null);
  const [saldoHoje, setSaldoHoje] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O caixa é do Grupo: o fluxo previsto é sempre do Grupo inteiro (fazendas e Administração).
  const todas = true;

  const carregar = useCallback(() => {
    if (!fid) return;
    setErro(null);
    setTitulos(null);
    (async () => {
      try {
        const q = supabase
          .from('lancamentos')
          .select('id, numero, tipo, descricao, valor, valor_pago, data_vencimento, previsto, fazenda_id, pessoa:pessoas ( nome )')
          .in('situacao', ['aberto', 'parcial'])
          .order('data_vencimento')
          .limit(5000);
        const [ts, saldos] = await Promise.all([consulta<any[]>(q), consulta<any[]>(supabase.rpc('saldos_painel'))]);
        setSaldoHoje(r2(saldos.reduce((t, c) => t + Number(c.saldo), 0)));
        setTitulos(ts);
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
  }, [fid]);
  useFocusEffect(carregar);

  const grupos = useMemo((): Grupo[] => {
    if (!titulos) return [];
    const hoje = hojeBanco();
    const mesAtual = hoje.slice(0, 7);
    const meses = Array.from({ length: 12 }, (_, i) => somarMeses(`${mesAtual}-01`, i).slice(0, 7));
    const mapa = new Map<string, Grupo>();
    const pega = (chave: string, rotulo: string) => {
      if (!mapa.has(chave)) mapa.set(chave, { chave, rotulo, receber: 0, pagar: 0, titulos: [] });
      return mapa.get(chave)!;
    };
    pega('vencidos', 'Vencidos');
    meses.forEach((m) => pega(m, rotuloMes(m)));
    pega('depois', `Depois de ${rotuloMes(meses[meses.length - 1])}`);
    for (const t of titulos) {
      const falta = r2(Number(t.valor) - Number(t.valor_pago ?? 0));
      if (falta <= 0) continue;
      const am = String(t.data_vencimento).slice(0, 7);
      const g = t.data_vencimento < hoje ? pega('vencidos', '') : mapa.has(am) ? mapa.get(am)! : pega('depois', '');
      if (t.tipo === 'receber') g.receber = r2(g.receber + falta);
      else g.pagar = r2(g.pagar + falta);
      g.titulos.push({ ...t, falta });
    }
    return [...mapa.values()].filter((g) => !['vencidos', 'depois'].includes(g.chave) || g.titulos.length > 0);
  }, [titulos]);

  const totReceber = r2(grupos.reduce((t, g) => t + g.receber, 0));
  const totPagar = r2(grupos.reduce((t, g) => t + g.pagar, 0));
  let acumulado = saldoHoje;
  const nomeFazenda = (id: string | null) => nomeUnidade(id, fazendas);

  return (
    <>
      <Text style={estilos.nota}>Fluxo do Grupo: o caixa e os bancos de hoje, mais o que há a receber e menos o que há a pagar de todas as fazendas, do Administrativo e do Particular.</Text>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!titulos ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          <View style={estilos.cartao}>
            <LinhaTotal rotulo="Saldo hoje em caixa e bancos" valor={saldoHoje} />
            <LinhaTotal rotulo="A receber (em aberto)" valor={totReceber} cor={cores.primaria} />
            <LinhaTotal rotulo="A pagar (em aberto)" valor={-totPagar} cor={cores.erro} />
            <View style={estilos.divisor} />
            <LinhaTotal rotulo="Saldo previsto no fim" valor={r2(saldoHoje + totReceber - totPagar)} forte />
          </View>
          <Text style={estilos.nota}>Entram os títulos em aberto de Contas a pagar e a receber, com as parcelas dos financiamentos e as contas contínuas previstas. Toque num mês para ver os títulos.</Text>
          <View style={estilos.cab}>
            <Text style={[estilos.cel, estilos.celMes, estilos.celCab]}>Mês</Text>
            <Text style={[estilos.cel, estilos.celCab]}>A receber</Text>
            <Text style={[estilos.cel, estilos.celCab]}>A pagar</Text>
            <Text style={[estilos.cel, estilos.celCab]}>Saldo</Text>
          </View>
          {grupos.map((g) => {
            acumulado = r2(acumulado + g.receber - g.pagar);
            const saldoG = acumulado;
            return (
              <View key={g.chave}>
                <Pressable onPress={() => setAberto(aberto === g.chave ? null : g.chave)} style={[estilos.lin, g.chave === 'vencidos' && { backgroundColor: '#FDECEA' }]} accessibilityRole="button">
                  <Text style={[estilos.cel, estilos.celMes, { fontWeight: '700' }]}>{g.rotulo}</Text>
                  <Text style={[estilos.cel, { color: g.receber ? cores.primaria : cores.textoSuave }]}>{g.receber ? formatarMoeda(g.receber).replace('R$', '').trim() : '—'}</Text>
                  <Text style={[estilos.cel, { color: g.pagar ? cores.erro : cores.textoSuave }]}>{g.pagar ? formatarMoeda(g.pagar).replace('R$', '').trim() : '—'}</Text>
                  <Text style={[estilos.cel, { fontWeight: '800', color: saldoG < 0 ? cores.erro : cores.texto }]}>{formatarMoeda(saldoG).replace('R$', '').trim()}</Text>
                </Pressable>
                {aberto === g.chave &&
                  (g.titulos.length === 0 ? (
                    <Text style={[estilos.nota, { padding: 8 }]}>Nada a pagar nem a receber neste mês.</Text>
                  ) : (
                    g.titulos.map((t) => (
                      <View key={t.id} style={estilos.tit}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={estilos.titNome}>
                            {doBanco(t.data_vencimento)} · {t.descricao ?? 'Título'}
                          </Text>
                          <Text style={estilos.nota}>{[um(t.pessoa)?.nome, `título nº ${t.numero}`, t.previsto ? 'valor previsto' : null, todas ? nomeFazenda(t.fazenda_id) : null].filter(Boolean).join(' · ')}</Text>
                        </View>
                        <Text style={[estilos.movValor, { color: t.tipo === 'receber' ? cores.primaria : cores.erro }]}>
                          {t.tipo === 'receber' ? '+' : '−'} {formatarMoeda(t.falta)}
                        </Text>
                      </View>
                    ))
                  ))}
              </View>
            );
          })}
          {grupos.some((g) => g.chave === 'vencidos') && <Text style={estilos.nota}>"Vencidos" são títulos em aberto com vencimento antes de hoje: entram primeiro na conta do saldo.</Text>}
        </>
      )}
    </>
  );
}

function LinhaTotal({ rotulo, valor, cor, forte }: { rotulo: string; valor: number; cor?: string; forte?: boolean }) {
  return (
    <View style={estilos.total}>
      <Text style={[estilos.totalRotulo, forte && { fontWeight: '800', color: cores.texto }]}>{rotulo}</Text>
      <Text style={[estilos.totalValor, cor ? { color: cor } : null, forte && { fontSize: tam.subtitulo + 2, color: valor < 0 ? cores.erro : cores.cafe }]}>{formatarMoeda(valor)}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  vazio: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 6 },
  rotuloCartao: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '700' },
  divisor: { height: 1, backgroundColor: cores.borda },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  totalRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  totalValor: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  mov: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  movTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  movValor: { fontSize: tam.pequeno + 2, fontWeight: '800' },
  cab: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: cores.borda, paddingBottom: 4, paddingHorizontal: 8 },
  lin: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: cores.borda },
  cel: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, textAlign: 'right' },
  celCab: { fontWeight: '700', color: cores.textoSuave, fontSize: tam.pequeno },
  celMes: { flex: 0, width: 78, textAlign: 'left' },
  tit: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: cores.infoFundo, padding: 10, borderBottomWidth: 1, borderBottomColor: cores.borda },
  titNome: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
});
