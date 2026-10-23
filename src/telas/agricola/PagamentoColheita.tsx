import React, { useCallback, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, lerNumero } from '../../lib/formatos';
import { perguntar } from '../../lib/perguntar';
import { r2, um } from '../../lib/colheitas';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/**
 * Pagamento dos colhedores: a produção lançada nas colheitas fica em aberto; o fechamento soma o período,
 * desconta os vales e gera um título no Contas a pagar para cada colhedor.
 */
export default function PagamentoColheita() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [producao, setProducao] = useState<any[] | null>(null);
  const [vales, setVales] = useState<any[]>([]);
  const [fechamentos, setFechamentos] = useState<any[]>([]);
  const [ate, setAte] = useState(hojeBR());
  const [pagarEm, setPagarEm] = useState(hojeBR());
  const [fora, setFora] = useState<string[]>([]);
  // vale
  const [valeAberto, setValeAberto] = useState(false);
  const [valePessoa, setValePessoa] = useState<string | null>(null);
  const [valeData, setValeData] = useState(hojeBR());
  const [valeValor, setValeValor] = useState('');
  const [valeObs, setValeObs] = useState('');

  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fid) return;
    try {
      const [pr, vl, fe] = await Promise.all([
        consulta<any[]>(supabase.from('pc_colhedores').select('pessoa_id, valor, pessoa:pessoas ( nome ), lote:pc_lotes ( data_colheita )').eq('fazenda_id', fid).is('fechamento_id', null).limit(5000)),
        consulta<any[]>(
          supabase
            .from('colheita_vales')
            .select('id, pessoa_id, data, valor, observacoes, origem_fechamento_id, pessoa:pessoas ( nome ), titulo:lancamentos ( id, numero, situacao )')
            .eq('fazenda_id', fid)
            .is('fechamento_id', null)
            .order('data', { ascending: false }),
        ),
        consulta<any[]>(supabase.from('colheita_fechamentos').select('*').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(20)),
      ]);
      setProducao(pr);
      setVales(vl);
      setFechamentos(fe);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  // ---------- contas ----------
  const ateIso = paraBanco(ate);
  const porPessoa: Record<string, { id: string; nome: string; producao: number; vales: number; dias: Set<string> }> = {};
  for (const p of producao ?? []) {
    const d = um(p.lote)?.data_colheita as string | undefined;
    if (!p.pessoa_id || !ateIso || !d || d > ateIso) continue;
    porPessoa[p.pessoa_id] ??= { id: p.pessoa_id, nome: um(p.pessoa)?.nome ?? '', producao: 0, vales: 0, dias: new Set() };
    porPessoa[p.pessoa_id].producao += Number(p.valor);
    porPessoa[p.pessoa_id].dias.add(d);
  }
  for (const v of vales) if (ateIso && v.data <= ateIso && porPessoa[v.pessoa_id]) porPessoa[v.pessoa_id].vales += Number(v.valor);
  const linhas = Object.values(porPessoa)
    .map((x) => ({ ...x, producao: r2(x.producao), vales: r2(x.vales), liquido: r2(x.producao - x.vales) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const escolhidas = linhas.filter((l) => !fora.includes(l.id));
  const totProducao = r2(escolhidas.reduce((s, l) => s + l.producao, 0));
  const totVales = r2(escolhidas.reduce((s, l) => s + l.vales, 0));
  const totPagar = r2(escolhidas.reduce((s, l) => s + Math.max(l.liquido, 0), 0));
  const depois = (producao ?? []).filter((p) => ateIso && (um(p.lote)?.data_colheita ?? '') > ateIso).length;

  // ---------- ações ----------
  async function fechar() {
    setErro(null);
    setAviso(null);
    if (!dataValida(ate)) return setErro('Informe até que dia fechar.');
    if (ateIso! > hojeBanco()) return setErro('A data do fechamento não pode ser futura.');
    if (!dataValida(pagarEm)) return setErro('Informe o dia do pagamento.');
    if (paraBanco(pagarEm)! < ateIso!) return setErro('O dia do pagamento não pode ser antes do último dia fechado.');
    if (!escolhidas.length) return setErro('Não há produção em aberto para fechar.');
    const ok = await perguntar(
      'Fechar pagamento',
      `Fechar a produção até ${ate} de ${escolhidas.length === 1 ? '1 colhedor' : `${escolhidas.length} colhedores`}?\n\nProdução ${formatarMoeda(totProducao)}\nVales ${formatarMoeda(totVales)}\nA pagar ${formatarMoeda(totPagar)} em ${pagarEm}`,
      'Fechar',
      'Voltar',
    );
    if (!ok) return;
    setTrabalhando(true);
    const { data: r, error } = await supabase.rpc('fechar_colheita', {
      p: { fazenda_id: fid, ate: ateIso, vencimento: paraBanco(pagarEm), pessoas: fora.length ? escolhidas.map((l) => l.id) : [] },
    });
    setTrabalhando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; colhedores: number; titulos: number; liquido: number };
    setFora([]);
    setAviso(`Fechamento nº ${res.numero}: ${res.titulos === 1 ? '1 título' : `${res.titulos} títulos`} no Contas a pagar, total ${formatarMoeda(res.liquido)}, com vencimento em ${pagarEm}.`);
    carregar();
  }

  async function lancarVale() {
    setErro(null);
    setAviso(null);
    if (!valePessoa) return setErro('Informe quem recebeu o vale.');
    if (!dataValida(valeData)) return setErro('Informe a data do vale.');
    if (paraBanco(valeData)! > hojeBanco()) return setErro('A data do vale não pode ser futura.');
    const valor = lerNumero(valeValor);
    if (!valor || valor <= 0) return setErro('Informe o valor do vale.');
    setTrabalhando(true);
    const { data: r, error } = await supabase.rpc('lancar_vale_colheita', { p: { fazenda_id: fid, pessoa_id: valePessoa, data: paraBanco(valeData), valor, observacoes: valeObs.trim() } });
    setTrabalhando(false);
    if (error) return setErro(traduzirErro(error));
    setValePessoa(null);
    setValeValor('');
    setValeObs('');
    setValeAberto(false);
    setAviso(`Vale de ${formatarMoeda(valor)} lançado: título nº ${(r as any).titulo} no Contas a pagar. Dê a baixa lá para sair do caixa ou do banco.`);
    carregar();
  }

  function excluirVale(v: any) {
    Alert.alert('Excluir vale', `Excluir o vale de ${formatarMoeda(Number(v.valor))} de ${um(v.pessoa)?.nome ?? ''}? O título dele sai do Contas a pagar.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_vale_colheita', { p_id: v.id }), 'vale_colheita_id', String(v.id));
          if (error) return setErro(traduzirErro(error));
          setAviso('Vale excluído.');
          carregar();
        },
      },
    ]);
  }

  if (producao === null) return erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;

  return (
    <>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {/* ---------- produção em aberto ---------- */}
      <Secao titulo="Produção em aberto" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Fechar até" valor={ate} aoMudar={setAte} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Dia do pagamento" valor={pagarEm} aoMudar={setPagarEm} />
        </View>
      </View>
      {linhas.length === 0 ? (
        <Text style={estilos.dica}>Nenhuma produção em aberto até {ate}.</Text>
      ) : (
        <>
          <View style={estilos.caixa}>
            {linhas.map((l) => {
              const marcado = !fora.includes(l.id);
              return (
                <Pressable key={l.id} onPress={() => setFora((f) => (marcado ? [...f, l.id] : f.filter((x) => x !== l.id)))} accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} style={estilos.pessoa}>
                  <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={26} color={marcado ? cores.primaria : cores.textoSuave} />
                  <View style={{ flex: 1 }}>
                    <Text style={[estilos.pessoaNome, !marcado && { color: cores.textoSuave }]}>{l.nome}</Text>
                    <Text style={estilos.nota}>
                      {l.dias.size} {l.dias.size === 1 ? 'dia' : 'dias'} · produção {formatarMoeda(l.producao)}
                      {l.vales ? ` · vales ${formatarMoeda(l.vales)}` : ''}
                    </Text>
                    {l.liquido < 0 && <Text style={[estilos.nota, { color: cores.cafe, fontWeight: '700' }]}>Vales maiores que a produção: sobram {formatarMoeda(-l.liquido)} para descontar no próximo fechamento.</Text>}
                  </View>
                  <Text style={[estilos.pessoaValor, !marcado && { color: cores.textoSuave }]}>{formatarMoeda(Math.max(l.liquido, 0))}</Text>
                </Pressable>
              );
            })}
            <View style={estilos.totais}>
              <Par a={`Produção de ${escolhidas.length === 1 ? '1 colhedor' : `${escolhidas.length} colhedores`}`} b={formatarMoeda(totProducao)} />
              <Par a="Vales descontados" b={formatarMoeda(totVales)} />
              <Par a="A pagar" b={formatarMoeda(totPagar)} forte />
            </View>
          </View>
          {depois > 0 && <Text style={estilos.nota}>Há produção lançada depois de {ate}: fica para o próximo fechamento.</Text>}
          <Botao titulo="Fechar pagamento" onPress={fechar} carregando={trabalhando} desabilitado={!escolhidas.length} />
          <Text style={estilos.nota}>O fechamento gera um título por colhedor no Contas a pagar (conta Mão de obra da colheita), rateado pelos talhões onde ele colheu. A baixa é feita lá, como qualquer conta.</Text>
        </>
      )}

      {/* ---------- vales ---------- */}
      <Secao titulo="Vales (adiantamentos)" />
      {valeAberto ? (
        <View style={estilos.caixa}>
          <CampoPessoaBusca rotulo="Quem recebeu *" valorId={valePessoa} aoMudar={setValePessoa} tipoNovo="funcionario" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Data *" valor={valeData} aoMudar={setValeData} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Valor (R$) *" valor={valeValor} aoMudar={setValeValor} />
            </View>
          </View>
          <Campo rotulo="Observações" value={valeObs} onChangeText={setValeObs} autoCapitalize="sentences" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Botao titulo="Cancelar" tipo="secundario" onPress={() => setValeAberto(false)} />
            </View>
            <View style={{ flex: 1.4 }}>
              <Botao titulo="Lançar vale" onPress={lancarVale} carregando={trabalhando} />
            </View>
          </View>
        </View>
      ) : (
        <Botao titulo="+ Lançar vale" tipo="secundario" onPress={() => setValeAberto(true)} />
      )}
      {vales.length === 0 ? (
        <Text style={estilos.nota}>Nenhum vale em aberto. O vale vira um título no Contas a pagar e é descontado no fechamento.</Text>
      ) : (
        <View style={estilos.caixa}>
          {vales.map((v) => {
            const t = um(v.titulo);
            return (
              <View key={v.id} style={estilos.pessoa}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.pessoaNome}>{um(v.pessoa)?.nome}</Text>
                  <Text style={estilos.nota}>
                    {doBanco(v.data)}
                    {v.origem_fechamento_id ? ` · ${v.observacoes ?? 'saldo devedor'}` : t ? ` · título nº ${t.numero} ${t.situacao === 'pago' ? '(pago)' : '(em aberto no Contas a pagar)'}` : ''}
                    {!v.origem_fechamento_id && v.observacoes ? ` · ${v.observacoes}` : ''}
                  </Text>
                </View>
                <Text style={estilos.pessoaValor}>{formatarMoeda(Number(v.valor))}</Text>
                {!v.origem_fechamento_id && (
                  <Pressable onPress={() => excluirVale(v)} hitSlop={10} accessibilityLabel="Excluir vale">
                    <Ionicons name="trash-outline" size={22} color={cores.erro} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ---------- fechamentos ---------- */}
      <Secao titulo="Fechamentos feitos" />
      {fechamentos.length === 0 ? (
        <Text style={estilos.nota}>Nenhum fechamento ainda.</Text>
      ) : (
        <Lista>
          {fechamentos.map((f) => (
            <Linha
              key={f.id}
              titulo={`Nº ${f.numero} · até ${doBanco(f.data_fim)}`}
              linhas={[`Produção ${formatarMoeda(Number(f.total_producao))}${Number(f.total_vales) ? ` · vales ${formatarMoeda(Number(f.total_vales))}` : ''}`, `Pagamento em ${doBanco(f.vencimento)}`]}
              direita={formatarMoeda(Number(f.total_liquido))}
              onPress={() => navegacao.navigate('FechamentoColheita', { id: f.id })}
            />
          ))}
        </Lista>
      )}
    </>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '800', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura, fontSize: tam.texto }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  pessoaNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  pessoaValor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  totais: { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 8, gap: 5 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
});
