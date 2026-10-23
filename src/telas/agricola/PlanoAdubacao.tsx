import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { custosDe, saldoDe, textoSaldo } from '../../lib/insumos';
import { calcularTotal, unidadeConsumo } from '../../lib/atividades';
import { densidadeTalhao, idadeFase } from '../../lib/talhoes';
import { adubacaoNK, calagem, completarSolo, eConilon, type Valores } from '../../lib/agronomia';
import { ROTULO_NUTRIENTE, dosar, formulaDe, garantiaDe, parcelasPadrao, temGarantia, type Nutriente } from '../../lib/adubacao';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const n = (t: string) => lerNumero(t);
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const MASSA = ['g', 'kg', 't'];
const AVISO_FINAL = 'Apoio à decisão. As doses de N e K seguem as tabelas do Incaper para o café conilon no ES; a escolha dos produtos e o parcelamento são uma sugestão. Confirme com o agrônomo responsável antes de comprar e aplicar.';

/** Plano de adubação: com "analiseId" monta um plano novo a partir da análise de solo; com "id" mostra o plano e as aplicações. */
export default function PlanoAdubacao() {
  const { params } = useRoute<RouteProp<PilhaParams, 'PlanoAdubacao'>>();
  return params.id ? <VerPlano id={params.id} /> : <MontarPlano analiseId={params.analiseId!} />;
}

// =====================================================================================================================
// Montar
// =====================================================================================================================
function MontarPlano({ analiseId }: { analiseId: string }) {
  const navegacao = useNavigation<NavPilha>();
  const hoje = hojeBanco();
  const [a, setA] = useState<any>(null);
  const [t, setT] = useState<any>(null);
  const [adubos, setAdubos] = useState<any[]>([]);
  const [prod, setProd] = useState('');
  const [nec, setNec] = useState<Record<Nutriente, string>>({ n: '', p: '', k: '' });
  const [sel, setSel] = useState<string[]>([]);
  const [qtdParcelas, setQtdParcelas] = useState('3');
  const [parcelas, setParcelas] = useState<{ data: string; perc: string }[]>(parcelasPadrao(3, hoje).map((p) => ({ data: doBanco(p.data), perc: numeroParaCampo(p.perc) })));
  const [comCalagem, setComCalagem] = useState(false);
  const [calcarioId, setCalcarioId] = useState<string | null>(null);
  const [prnt, setPrnt] = useState('85');
  const [dataCalagem, setDataCalagem] = useState(doBanco(hoje));
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: 'Plano de adubação' });
  }, [navegacao]);

  useEffect(() => {
    (async () => {
      try {
        const an = await consulta<any>(supabase.from('talhao_analises').select('*').eq('id', analiseId).single());
        const [ta, ins] = await Promise.all([
          consulta<any>(supabase.from('areas').select('id, fazenda_id, nome, especie, data_plantio, area_ha, area_util_ha, plantas_total, plantas_ha_real, irrigacao, previsao_sacas').eq('id', an.area_id).single()),
          consulta<any[]>(supabase.from('insumos').select('*').in('categoria', ['fertilizante', 'adubo']).eq('ativo', true).order('nome')),
        ]);
        const movs = ins.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade, valor_unitario, data').eq('fazenda_id', ta.fazenda_id).in('insumo_id', ins.map((i) => i.id))) : [];
        setAdubos(
          ins.map((i) => {
            const m = movs.filter((x) => x.insumo_id === i.id);
            return { ...i, g: garantiaDe(i), saldo: saldoDe(m), medio: custosDe(m).medio };
          }),
        );
        setA(an);
        setT(ta);
        const util = Number(ta.area_util_ha ?? ta.area_ha ?? 0);
        const p = Number(ta.previsao_sacas) > 0 && util > 0 ? Math.round(Number(ta.previsao_sacas) / util) : null;
        if (p) mudarProdutividade(numeroParaCampo(p), an, ta);
        if (ta.irrigacao === 'irrigada') mudarQtdParcelas('4');
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analiseId]);

  const valoresDe = (an: any): Valores => {
    const antigos = Object.fromEntries((['ph', 'p', 'k', 'ca', 'mg', 'mo', 'v'] as const).filter((c) => an[c] != null).map((c) => [c, Number(an[c])]));
    return completarSolo((Object.keys(an.dados ?? {}).length ? an.dados : antigos) as Valores).valores;
  };

  /** A produtividade puxa N e K da tabela (o que estiver digitado é trocado); o P fica como estiver. */
  function mudarProdutividade(texto: string, an = a, ta = t) {
    setProd(texto);
    if (!an || !ta) return;
    const nk = adubacaoNK(n(texto) ?? 0, valoresDe(an).k ?? null);
    setNec((atual) => ({ ...atual, n: nk ? numeroParaCampo(nk.n) : '', k: nk?.k2o != null ? numeroParaCampo(nk.k2o) : '' }));
  }
  function mudarQtdParcelas(q: string) {
    setQtdParcelas(q);
    setParcelas(parcelasPadrao(Number(q), hoje).map((p) => ({ data: doBanco(p.data), perc: numeroParaCampo(p.perc) })));
  }

  const valores = useMemo(() => (a ? valoresDe(a) : ({} as Valores)), [a]); // eslint-disable-line react-hooks/exhaustive-deps
  if (erro && !a) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!a || !t) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const ha = Number(t.area_util_ha ?? t.area_ha ?? 0);
  const dens = densidadeTalhao(t);
  const plantas = t.plantas_total != null && Number(t.plantas_total) > 0 ? Number(t.plantas_total) : dens && ha ? Math.round(dens * ha) : null;
  const idade = idadeFase(t.data_plantio, hoje);
  const conilon = eConilon(t.especie);
  const emProducao = !idade || idade.meses >= 30;
  const nk = adubacaoNK(n(prod) ?? 0, valores.k ?? null);
  const cal = calagem(valores, n(prnt) ?? 0, !!t.data_plantio);
  const necessidade = { n: nec.n.trim() ? n(nec.n) : null, p: nec.p.trim() ? n(nec.p) : null, k: nec.k.trim() ? n(nec.k) : null };
  const usaveis = adubos.filter((i) => temGarantia(i.g) && MASSA.includes(unidadeConsumo(i)));
  const semGarantia = adubos.filter((i) => !temGarantia(i.g));
  const semMassa = adubos.filter((i) => temGarantia(i.g) && !MASSA.includes(unidadeConsumo(i)));
  const escolhidos = usaveis.filter((i) => sel.includes(i.id));
  const dos = dosar(necessidade, escolhidos.map((i) => ({ id: i.id, nome: i.nome, g: i.g })));
  const somaPerc = parcelas.reduce((s, p) => s + (n(p.perc) ?? 0), 0);
  const calcario = adubos.find((i) => i.id === calcarioId) ?? null;

  /** total do ano de um produto: kg, na unidade do estoque e o custo */
  const anual = (i: any) => {
    const kg = (dos.doses[i.id] ?? 0) * ha;
    const tot = calcularTotal(i, kg, 'kg', 'total', { ha, plantas: plantas ?? 0 });
    return { kg, estoque: tot?.estoque ?? null, custo: tot && i.medio != null ? tot.estoque * i.medio : null };
  };
  const custoTotal = escolhidos.reduce((s, i) => s + (anual(i).custo ?? 0), 0);
  const calKg = comCalagem && cal ? cal.dose * 1000 * ha : 0;

  async function salvar() {
    setErro(null);
    const e: string[] = [];
    if (!ha) e.push('O talhão está sem área útil no cadastro.');
    const comDose = escolhidos.filter((i) => (dos.doses[i.id] ?? 0) > 0);
    if (!comDose.length && !(comCalagem && calcario)) e.push('Escolha os adubos do plano (e informe a necessidade de N, P ou K).');
    if (comDose.length) {
      if (parcelas.some((p) => !dataValida(p.data))) e.push('Confira a data de cada aplicação.');
      if (parcelas.some((p) => !n(p.perc) || n(p.perc)! <= 0)) e.push('Confira o percentual de cada aplicação.');
      else if (Math.abs(somaPerc - 100) > 0.11) e.push(`As aplicações somam ${formatarNumero(somaPerc, 1)}%: precisam fechar 100%.`);
    }
    if (comCalagem) {
      if (!cal?.precisa) e.push('Esta análise não pede calagem: desligue "Incluir a calagem".');
      if (!calcario) e.push('Escolha o calcário do estoque.');
      else if (!MASSA.includes(unidadeConsumo(calcario))) e.push('O calcário precisa estar cadastrado em kg ou tonelada (ou com unidade de dose em kg).');
      if (!dataValida(dataCalagem)) e.push('Informe a data da calagem.');
    }
    if (e.length) return setErro(e.length === 1 ? e[0] : `Falta corrigir:\n• ${e.join('\n• ')}`);

    const linhas: any[] = [];
    if (comCalagem && cal && calcario) {
      linhas.push({ data_prevista: paraBanco(dataCalagem), tipo: 'calagem', insumo_id: calcario.id, percentual: 100, dose: cal.dose, dose_unidade: 't', dose_por: 'ha', quantidade_kg: Math.round(calKg) });
    }
    for (const p of [...parcelas].sort((x, y) => (paraBanco(x.data)! < paraBanco(y.data)! ? -1 : 1))) {
      const f = (n(p.perc) ?? 0) / 100;
      for (const i of comDose) {
        const kgHa = dos.doses[i.id] * f;
        linhas.push({
          data_prevista: paraBanco(p.data),
          tipo: 'adubacao',
          insumo_id: i.id,
          percentual: n(p.perc),
          dose: dens ? Math.round(((kgHa * 1000) / dens) * 10) / 10 : Math.round(kgHa * 10) / 10,
          dose_unidade: dens ? 'g' : 'kg',
          dose_por: dens ? 'planta' : 'ha',
          quantidade_kg: Math.round(kgHa * ha * 10) / 10,
        });
      }
    }
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_plano_adubacao', {
      p: {
        fazenda_id: t.fazenda_id, area_id: t.id, analise_id: a.id, area_ha: ha, plantas, produtividade: n(prod), n_kg_ha: necessidade.n, p2o5_kg_ha: necessidade.p, k2o_kg_ha: necessidade.k,
        calagem_t_ha: comCalagem && cal ? cal.dose : null, observacoes: obs.trim(), parcelas: linhas,
      },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    navegacao.replace('PlanoAdubacao', { id: (r as any).id });
  }

  return (
    <Tela rodape={<RodapeAcoes titulo="Gravar o plano" aoConfirmar={salvar} carregando={salvando} erro={erro} />}>
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Talhão {t.nome}</Text>
        <Text style={estilos.nota}>
          {[t.especie, ha ? `${formatarNumero(ha, 2)} ha úteis` : 'sem área útil', dens ? `${formatarNumero(Math.round(dens))} plantas/ha` : 'falta o total de plantas plantadas no cadastro do talhão', plantas ? `${formatarNumero(plantas)} plantas` : null, idade ? `${idade.texto} (${idade.fase})` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text style={estilos.nota}>
          Análise de solo de {doBanco(a.data)}
          {a.profundidade ? ` · ${a.profundidade}` : ''}
          {valores.k != null ? ` · K ${formatarNumero(valores.k, 0)} mg/dm³` : ''}
          {valores.v != null ? ` · V ${formatarNumero(valores.v, 1)}%` : ''}
        </Text>
      </View>
      {!conilon && <Aviso tipo="info" texto="As tabelas de N e K do sistema são do café conilon. Para esta cultura, digite a necessidade recomendada pelo agrônomo." />}
      {conilon && !emProducao && <Aviso tipo="info" texto="Lavoura em formação: a tabela do sistema é para lavoura em produção. Digite a necessidade recomendada para a formação." />}

      <Secao titulo="Necessidade do ano (kg por hectare)" />
      <Campo rotulo="Produtividade esperada (sacas beneficiadas por hectare)" value={prod} onChangeText={(x) => mudarProdutividade(x)} keyboardType="decimal-pad" ajuda="Vem da previsão do talhão. Ao mudar, o N e o K são refeitos pela tabela." />
      <View style={estilos.linha}>
        {(['n', 'p', 'k'] as Nutriente[]).map((x) => (
          <View key={x} style={{ flex: 1 }}>
            <Campo rotulo={ROTULO_NUTRIENTE[x]} value={nec[x]} onChangeText={(v) => setNec((at) => ({ ...at, [x]: v }))} keyboardType="decimal-pad" />
          </View>
        ))}
      </View>
      <Text style={estilos.nota}>
        {nk ? `N e K₂O pela tabela do conilon (faixa de ${nk.faixa} sc/ha${nk.classeK ? `; ${nk.classeK} mg/dm³` : ''}). ` : ''}
        O fósforo não é calculado pelo sistema: se o agrônomo (ou o parecer da análise) recomendou, digite o P₂O₅; em branco, fica fora do plano. Pode corrigir qualquer um dos três.
      </Text>

      <Secao titulo="Adubos do plano" />
      {usaveis.length === 0 ? (
        <Text style={estilos.nota}>Nenhum adubo com a garantia (N, P, K) preenchida. Cadastre em Agrícola › Insumos e estoque, categoria Fertilizante (químico) ou Adubo orgânico, com o N, P e K.</Text>
      ) : (
        <View style={estilos.caixa}>
          {usaveis.map((i) => {
            const marcado = sel.includes(i.id);
            return (
              <Pressable key={i.id} onPress={() => setSel((s) => (marcado ? s.filter((x) => x !== i.id) : [...s, i.id]))} accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} style={estilos.opcao}>
                <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={26} color={marcado ? cores.primaria : cores.textoSuave} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.opcaoTitulo}>
                    {i.nome} · {formulaDe(i.g)}
                  </Text>
                  <Text style={estilos.nota}>
                    Estoque {textoSaldo(i.saldo, i)}
                    {i.medio != null ? ` · ${formatarMoeda(i.medio)}/${i.unidade}` : ' · sem custo de compra'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {(semGarantia.length > 0 || semMassa.length > 0) && (
        <Text style={estilos.nota}>
          {semGarantia.length > 0 ? `Sem garantia no cadastro (não entram): ${semGarantia.map((i) => i.nome).join(', ')}. ` : ''}
          {semMassa.length > 0 ? `Sem unidade em kg (não entram): ${semMassa.map((i) => i.nome).join(', ')}; informe a unidade de dose em kg no cadastro.` : ''}
        </Text>
      )}
      <Text style={estilos.nota}>O sistema usa primeiro os formulados, até o nutriente que fecha primeiro, e completa com os adubos simples (ureia, cloreto de potássio…).</Text>

      {escolhidos.length > 0 && (
        <>
          <View style={estilos.caixa}>
            {escolhidos.map((i) => {
              const an = anual(i);
              const dose = dos.doses[i.id] ?? 0;
              return (
                <View key={i.id} style={{ gap: 2 }}>
                  <View style={estilos.par}>
                    <Text style={estilos.opcaoTitulo}>{i.nome}</Text>
                    <Text style={estilos.valor}>{dose > 0 ? `${formatarNumero(dose, 0)} kg/ha` : 'não entra'}</Text>
                  </View>
                  {dose > 0 && (
                    <Text style={estilos.nota}>
                      {dens ? `${formatarNumero((dose * 1000) / dens, 0)} g por planta no ano · ` : ''}
                      {formatarNumero(an.kg, 0)} kg no talhão{an.estoque != null && i.unidade !== 'kg' ? ` (${formatarQtd(an.estoque, 1)} ${i.unidade})` : ''}
                      {an.custo != null ? ` · ${formatarMoeda(an.custo)}` : ''}
                    </Text>
                  )}
                  {dose > 0 && an.estoque != null && an.estoque > i.saldo + 0.0001 && (
                    <Text style={[estilos.nota, { color: cores.cafe, fontWeight: '700' }]}>
                      Faltam {formatarQtd(an.estoque - Math.max(i.saldo, 0), 1)} {i.unidade} no estoque para o ano todo.
                    </Text>
                  )}
                </View>
              );
            })}
            <View style={estilos.divisor} />
            {(['n', 'p', 'k'] as Nutriente[]).map((x) =>
              necessidade[x] != null || dos.entregue[x] > 0 ? (
                <View key={x} style={estilos.par}>
                  <Text style={estilos.nota}>{ROTULO_NUTRIENTE[x]} entregue</Text>
                  <Text style={estilos.valorPequeno}>
                    {formatarNumero(dos.entregue[x], 0)} kg/ha{necessidade[x] ? ` de ${formatarNumero(necessidade[x]!, 0)} (${formatarNumero((dos.entregue[x] / necessidade[x]!) * 100)}%)` : ''}
                  </Text>
                </View>
              ) : null,
            )}
            {custoTotal > 0 && (
              <View style={estilos.par}>
                <Text style={[estilos.opcaoTitulo, { flex: 1 }]}>Custo dos adubos no ano</Text>
                <Text style={estilos.valor}>
                  {formatarMoeda(custoTotal)}
                  {ha ? ` · ${formatarMoeda(custoTotal / ha)}/ha` : ''}
                </Text>
              </View>
            )}
          </View>
          {dos.avisos.map((x, k) => (
            <Text key={k} style={[estilos.nota, { color: cores.cafe, fontWeight: '700' }]}>
              {x}
            </Text>
          ))}

          <Secao titulo="Parcelamento" />
          <Escolha rotulo="Número de aplicações" opcoes={['2', '3', '4', '5', '6'].map((q) => ({ valor: q, rotulo: q }))} valor={[qtdParcelas]} aoMudar={(v) => mudarQtdParcelas(v[0])} />
          {parcelas.map((p, k) => (
            <View key={k} style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <CampoData rotulo={`${k + 1}ª aplicação`} valor={p.data} aoMudar={(v) => setParcelas((l) => l.map((x, j) => (j === k ? { ...x, data: v } : x)))} />
              </View>
              <View style={{ width: 96 }}>
                <Campo rotulo="% do ano" value={p.perc} onChangeText={(v) => setParcelas((l) => l.map((x, j) => (j === k ? { ...x, perc: v } : x)))} keyboardType="decimal-pad" />
              </View>
            </View>
          ))}
          <Text style={[estilos.nota, Math.abs(somaPerc - 100) > 0.11 ? { color: cores.erro, fontWeight: '700' } : null]}>
            Soma: {formatarNumero(somaPerc, 1)}%. Sugestão em partes iguais, da floração (setembro) à granação (março); lavoura irrigada vem com 4 aplicações. Mude as datas e os percentuais como o agrônomo orientar.
          </Text>
        </>
      )}

      {cal?.precisa && (
        <>
          <Secao titulo="Calagem" />
          <Interruptor
            rotulo="Incluir a calagem no plano"
            descricao={`A análise pede ${formatarNumero(cal.dose, 2)} t/ha de calcário PRNT ${formatarNumero(cal.prnt, 0)}%${cal.cobertura ? ' em cobertura' : ', incorporado'} (${formatarNumero(cal.dose * ha, 1)} t no talhão).`}
            valor={comCalagem}
            aoMudar={setComCalagem}
          />
          {comCalagem && (
            <>
              <View style={estilos.linha}>
                <View style={{ width: 110 }}>
                  <Campo rotulo="PRNT (%)" value={prnt} onChangeText={setPrnt} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <CampoData rotulo="Data da calagem" valor={dataCalagem} aoMudar={setDataCalagem} />
                </View>
              </View>
              <Escolha rotulo="Calcário (do cadastro de fertilizantes)" opcoes={(adubos.some((i) => i.atributos?.natureza === 'Corretivo de solo') ? adubos.filter((i) => i.atributos?.natureza === 'Corretivo de solo') : adubos).map((i) => ({ valor: i.id, rotulo: i.nome }))} valor={calcarioId ? [calcarioId] : []} aoMudar={(v) => setCalcarioId(v[0])} />
              {adubos.length === 0 && <Text style={estilos.nota}>Cadastre o calcário em Agrícola › Insumos e estoque, categoria Fertilizante (químico), natureza Corretivo de solo, em kg ou tonelada.</Text>}
            </>
          )}
        </>
      )}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 70, paddingTop: 12 }} />
      <Text style={estilos.aviso}>{AVISO_FINAL}</Text>
    </Tela>
  );
}

// =====================================================================================================================
// Ver e executar
// =====================================================================================================================
function VerPlano({ id }: { id: string }) {
  const navegacao = useNavigation<NavPilha>();
  const [d, setD] = useState<{ p: any; parcelas: any[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const hoje = hojeBanco();

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? `Plano de adubação nº ${d.p.numero}` : 'Plano de adubação' });
  }, [navegacao, d]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [p, parcelas] = await Promise.all([
            consulta<any>(supabase.from('adubacao_planos').select('*, area:areas ( id, nome )').eq('id', id).single()),
            consulta<any[]>(supabase.from('adubacao_parcelas').select('*, insumo:insumos ( nome, unidade ), atividade:atividades_agricolas ( id, numero, data )').eq('plano_id', id).order('data_prevista').order('ordem')),
          ]);
          setD({ p, parcelas });
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [id]),
  );

  if (!d) return <Tela rolar={!!erro}>{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}</Tela>;
  const { p, parcelas } = d;
  const area = um(p.area);
  // uma aplicação = os produtos do mesmo dia e do mesmo tipo
  const grupos: { chave: string; data: string; tipo: string; itens: any[] }[] = [];
  for (const x of parcelas) {
    const k = `${x.data_prevista}|${x.tipo}`;
    let g = grupos.find((y) => y.chave === k);
    if (!g) grupos.push((g = { chave: k, data: x.data_prevista, tipo: x.tipo, itens: [] }));
    g.itens.push(x);
  }
  const feitas = grupos.filter((g) => g.itens.every((x) => x.atividade_id)).length;

  function lancar(g: (typeof grupos)[number]) {
    const pend = g.itens.filter((x) => !x.atividade_id);
    navegacao.navigate('AtividadeForm', {
      areaId: area?.id,
      pre: {
        sub: g.tipo === 'calagem' ? 'Correção do solo' : 'Via solo',
        produtos: pend.map((x) => ({ insumoId: x.insumo_id, dose: Number(x.dose), unidade: x.dose_unidade, por: x.dose_por })),
        parcelaIds: pend.map((x) => x.id),
        obs: `Plano de adubação nº ${p.numero}${g.tipo === 'calagem' ? ' – calagem' : ''}`,
      },
    });
  }

  function excluir() {
    Alert.alert('Excluir plano', `Excluir o plano de adubação nº ${p.numero}? As atividades já lançadas continuam; só as aplicações programadas somem.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_plano_adubacao', { p_id: id });
          if (error) return setErro(traduzirErro(error));
          navegacao.goBack();
        },
      },
    ]);
  }

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Talhão {area?.nome}</Text>
        <Text style={estilos.nota}>
          Plano nº {p.numero} · {doBanco(p.data)} · {formatarNumero(Number(p.area_ha), 2)} ha{p.plantas ? ` · ${formatarNumero(p.plantas)} plantas` : ''}
        </Text>
        <Text style={estilos.nota}>
          {[
            p.produtividade ? `${formatarQtd(p.produtividade)} sc/ha esperadas` : null,
            p.n_kg_ha != null ? `N ${formatarNumero(Number(p.n_kg_ha), 0)}` : null,
            p.p2o5_kg_ha != null ? `P₂O₅ ${formatarNumero(Number(p.p2o5_kg_ha), 0)}` : null,
            p.k2o_kg_ha != null ? `K₂O ${formatarNumero(Number(p.k2o_kg_ha), 0)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          kg/ha no ano
          {p.calagem_t_ha ? ` · calagem ${formatarNumero(Number(p.calagem_t_ha), 2)} t/ha` : ''}
        </Text>
        <Text style={[estilos.nota, { fontWeight: '700', color: cores.primaria }]}>
          {feitas} de {grupos.length} {grupos.length === 1 ? 'aplicação feita' : 'aplicações feitas'}
        </Text>
      </View>

      <Secao titulo="Aplicações" />
      {grupos.map((g, k) => {
        const feita = g.itens.every((x) => x.atividade_id);
        const at = um(g.itens.find((x) => x.atividade_id)?.atividade);
        const atrasada = !feita && g.data < hoje;
        return (
          <View key={g.chave} style={[estilos.caixa, feita && { opacity: 0.75 }]}>
            <View style={estilos.par}>
              <Text style={[estilos.opcaoTitulo, { flex: 1 }]}>
                {g.tipo === 'calagem' ? 'Calagem' : `${k + 1 - grupos.slice(0, k).filter((y) => y.tipo === 'calagem').length}ª adubação`} · {doBanco(g.data)}
              </Text>
              <Text style={[estilos.situacao, { color: feita ? cores.primaria : atrasada ? cores.erro : cores.cafe }]}>{feita ? 'Feita' : atrasada ? 'Atrasada' : 'Programada'}</Text>
            </View>
            {g.itens.map((x) => (
              <Text key={x.id} style={estilos.nota}>
                {um(x.insumo)?.nome}: {formatarQtd(x.dose, 1)} {x.dose_unidade} por {x.dose_por === 'planta' ? 'planta' : 'hectare'} · {formatarNumero(Number(x.quantidade_kg), 0)} kg no talhão
                {x.percentual != null && g.tipo !== 'calagem' ? ` (${formatarQtd(x.percentual, 1)}% do ano)` : ''}
              </Text>
            ))}
            {feita && at ? (
              <Text style={estilos.link} onPress={() => navegacao.navigate('AtividadeDetalhe', { id: at.id })}>
                Atividade nº {at.numero}, de {doBanco(at.data)} ›
              </Text>
            ) : (
              <Botao titulo="Lançar esta aplicação" tipo="secundario" onPress={() => lancar(g)} />
            )}
          </View>
        );
      })}
      <Text style={estilos.nota}>
        "Lançar esta aplicação" abre a tela de Atividades já com o talhão, os produtos e a dose: confira, ajuste se aplicou diferente e lance. A atividade baixa o estoque e marca a aplicação como feita.
      </Text>
      {p.observacoes ? <Text style={estilos.texto}>{p.observacoes}</Text> : null}
      <Text style={estilos.aviso}>{AVISO_FINAL}</Text>
      <Botao titulo="Excluir plano" tipo="perigo" onPress={excluir} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 6 },
  titulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  texto: { fontSize: tam.texto, color: cores.texto, lineHeight: 24 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  aviso: { fontSize: tam.pequeno, color: cores.cafe, lineHeight: 19, fontWeight: '600' },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  opcaoTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  par: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  valor: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  valorPequeno: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  situacao: { fontSize: tam.pequeno + 1, fontWeight: '800' },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda },
});
