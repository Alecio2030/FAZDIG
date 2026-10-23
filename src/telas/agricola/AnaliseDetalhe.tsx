import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { abrirFotoDocumento, pedirParecer } from '../../lib/documentos';
import { densidadeTalhao, idadeFase } from '../../lib/talhoes';
import { EPOCAS_FOLIAR, adubacaoNK, calagem, classeFoliar, completarSolo, eConilon, parametrosDe, type Valores } from '../../lib/agronomia';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const COR_CLASSE: Record<string, string> = { 'muito baixo': cores.erro, baixo: cores.erro, médio: cores.cafe, adequado: cores.sucesso, alto: cores.info, 'muito alto': cores.info };

/**
 * Painel de uma análise de solo ou foliar: resultados, o que o sistema calcula (calagem, N e K, classes foliares)
 * e o parecer do agrônomo virtual (IA). É apoio à decisão: a recomendação final é do agrônomo responsável.
 */
export default function AnaliseDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AnaliseDetalhe'>>();
  const [a, setA] = useState<any>(null);
  const [t, setT] = useState<any>(null);
  const [prnt, setPrnt] = useState('85');
  const [modo, setModo] = useState<string[]>(['cobertura']);
  const [prod, setProd] = useState('');
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [planos, setPlanos] = useState<any[]>([]);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: a ? `Análise ${a.tipo === 'foliar' ? 'foliar' : 'de solo'}` : 'Análise' });
  }, [navegacao, a]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const an = await consulta<any>(supabase.from('talhao_analises').select('*').eq('id', params.id).single());
          const ta = await consulta<any>(supabase.from('areas').select('id, nome, especie, variedade, data_plantio, area_ha, area_util_ha, plantas_total, plantas_ha_real, irrigacao, metodo_irrigacao, previsao_sacas, altitude_m').eq('id', an.area_id).single());
          setA(an);
          setT(ta);
          supabase.from('adubacao_planos').select('id, numero, data').eq('analise_id', an.id).order('numero', { ascending: false }).then(({ data: pl }) => setPlanos((pl as any[]) ?? []));
          const util = Number(ta.area_util_ha ?? ta.area_ha ?? 0);
          setProd((atual) => atual || (Number(ta.previsao_sacas) > 0 && util > 0 ? numeroParaCampo(Math.round(Number(ta.previsao_sacas) / util)) : ''));
          setModo([ta.data_plantio ? 'cobertura' : 'incorporado']);
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  if (erro && !a) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!a || !t) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const solo = a.tipo === 'solo';
  // análise antiga (lançada no cadastro do talhão): só tem as colunas básicas
  const antigos = Object.fromEntries((['ph', 'p', 'k', 'ca', 'mg', 'mo', 'v', 'n'] as const).filter((c) => a[c] != null).map((c) => [c, Number(a[c])]));
  const bruto = (Object.keys(a.dados ?? {}).length ? a.dados : antigos) as Valores;
  const { valores, calculados } = solo ? completarSolo(bruto) : { valores: bruto, calculados: [] as string[] };
  const lista = parametrosDe(a.tipo).filter((p) => valores[p.chave] != null);
  const conilon = eConilon(t.especie);
  const dens = densidadeTalhao(t);
  const idade = idadeFase(t.data_plantio, hojeBanco());
  const emProducao = !idade || idade.meses >= 30;
  const cal = solo ? calagem(valores, lerNumero(prnt) ?? 0, modo[0] === 'cobertura') : null;
  const nk = solo && conilon && emProducao ? adubacaoNK(lerNumero(prod) ?? 0, valores.k ?? null, dens) : null;
  const epoca = EPOCAS_FOLIAR.find((e) => e.valor === a.epoca)?.rotulo;
  const relCaMg = solo && valores.ca != null && valores.mg > 0 ? valores.ca / valores.mg : null;
  const parecer = a.parecer as any;

  async function pedir() {
    setErro(null);
    setPedindo(true);
    const contexto = {
      talhao: {
        cultura: t.especie,
        variedade: t.variedade,
        idade: idade?.texto ?? null,
        fase: idade?.fase ?? null,
        plantas_por_hectare: dens ? Math.round(dens) : null,
        irrigacao: t.irrigacao === 'irrigada' ? `irrigada (${t.metodo_irrigacao ?? 'método não informado'})` : t.irrigacao ?? null,
        altitude_m: t.altitude_m,
        produtividade_esperada_sc_ha: lerNumero(prod),
      },
      analise: { tipo: a.tipo, data: a.data, profundidade: a.profundidade, epoca_coleta: epoca ?? null, valores, calculados_pelo_sistema: calculados, unidades: Object.fromEntries(lista.map((p) => [p.chave, p.unidade || 'sem unidade'])) },
      calculo: {
        calagem: cal ? { saturacao_esperada_Ve: cal.ve, classe_da_CTC: cal.classeT, NC_t_ha_PRNT100_incorporado: cal.nc, dose_t_ha: cal.dose, PRNT_do_calcario: cal.prnt, aplicacao: cal.cobertura ? 'em cobertura (metade da dose)' : 'incorporado a 20 cm' } : null,
        adubacao_producao: nk ? { faixa_produtividade_sc_ha: nk.faixa, N_kg_ha_ano: nk.n, K2O_kg_ha_ano: nk.k2o, classe_K_solo: nk.classeK, N_g_planta_ano: nk.nPlanta, K2O_g_planta_ano: nk.k2oPlanta } : null,
        relacao_Ca_Mg: relCaMg ? Number(relCaMg.toFixed(1)) : null,
        classes_foliares: !solo ? Object.fromEntries(lista.map((p) => [p.chave, classeFoliar(p.chave, valores[p.chave], a.epoca)?.classe ?? 'sem faixa de referência para esta época'])) : null,
      },
    };
    const res = await pedirParecer(contexto);
    setPedindo(false);
    if ('erro' in res) return setErro(res.erro);
    const agora = new Date().toISOString();
    const { error } = await supabase.from('talhao_analises').update({ parecer: res.dados, parecer_em: agora }).eq('id', a.id);
    setA({ ...a, parecer: res.dados, parecer_em: agora });
    if (error) setErro(`O parecer veio, mas não pôde ser guardado: ${traduzirErro(error)}`);
  }

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>
          {solo ? `Solo ${a.profundidade ?? ''}` : `Foliar${epoca ? ` · ${epoca}` : ''}`} · {doBanco(a.data)}
        </Text>
        <Text style={estilos.nota}>
          Talhão {t.nome}
          {t.especie ? ` · ${t.especie}` : ''}
          {idade ? ` · ${idade.texto} (${idade.fase})` : ''}
          {dens ? ` · ${formatarNumero(Math.round(dens))} plantas/ha plantadas` : ' · falta o total de plantas plantadas no talhão'}
        </Text>
        <Text style={estilos.nota}>{[a.laboratorio, a.numero_laudo ? `laudo ${a.numero_laudo}` : null, a.amostra ? `amostra ${a.amostra}` : null].filter(Boolean).join(' · ') || 'Laboratório não informado'}</Text>
        {a.arquivo_documento ? (
          <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(a.arquivo_documento)) && setErro('Não foi possível abrir a foto do laudo.')}>
            📷 Ver a foto do laudo
          </Text>
        ) : null}
        <Text style={estilos.link} onPress={() => navegacao.navigate('AnaliseForm', { areaId: a.area_id, id: a.id })}>
          Alterar os valores ou excluir
        </Text>
      </View>

      <Secao titulo="Resultados" />
      {lista.map((p) => {
        const cf = !solo ? classeFoliar(p.chave, valores[p.chave], a.epoca) : null;
        return (
          <View key={p.chave} style={estilos.par}>
            <Text style={estilos.parRotulo}>
              {p.rotulo}
              {calculados.includes(p.chave) ? ' (calculado)' : ''}
            </Text>
            <View style={{ alignItems: 'flex-end', flex: 1 }}>
              <Text style={estilos.parValor}>
                {formatarNumero(valores[p.chave], p.casas)} {p.unidade}
              </Text>
              {cf && (
                <Text style={[estilos.classe, { color: cf.classe === 'adequado' ? cores.sucesso : cf.classe === 'baixo' ? cores.erro : cores.info }]}>
                  {cf.classe === 'adequado' ? 'Adequado' : cf.classe === 'baixo' ? 'Baixo' : 'Alto'} · faixa {formatarNumero(cf.faixa[0], p.casas)} a {formatarNumero(cf.faixa[1], p.casas)}
                </Text>
              )}
            </View>
          </View>
        );
      })}
      {relCaMg != null && <Text style={estilos.nota}>Relação Ca:Mg = {formatarNumero(relCaMg, 1)}:1 (para o conilon, o desejável é em torno de 4:1).</Text>}
      {!solo && !conilon && <Text style={estilos.nota}>As faixas de referência do sistema são do café conilon; para esta cultura, veja o parecer.</Text>}
      {!solo && conilon && a.epoca === 'outra' && <Text style={estilos.nota}>As faixas de referência são para folhas coletadas na pré-florada ou na granação: fora dessas épocas a comparação não vale.</Text>}

      {solo && (
        <>
          <Secao titulo="Calagem (conta do sistema)" />
          {!cal ? (
            <Text style={estilos.nota}>Para calcular a calagem faltam a CTC a pH 7 (T) e a saturação por bases (V%), ou Ca, Mg, K e H+Al para o sistema calcular.</Text>
          ) : (
            <View style={estilos.quadro}>
              <View style={estilos.linha}>
                <View style={{ width: 110 }}>
                  <Campo rotulo="PRNT (%)" value={prnt} onChangeText={setPrnt} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Escolha
                    rotulo="Aplicação"
                    opcoes={[
                      { valor: 'cobertura', rotulo: 'Em cobertura' },
                      { valor: 'incorporado', rotulo: 'Incorporado' },
                    ]}
                    valor={modo}
                    aoMudar={setModo}
                  />
                </View>
              </View>
              <Text style={estilos.conta}>
                T {formatarNumero(valores.ctc, 2)} × (Ve {cal.ve}% − V {formatarNumero(valores.v, 1)}%) ÷ 100 = <Text style={estilos.forte}>{formatarNumero(cal.nc, 2)} t/ha</Text> (PRNT 100, incorporado)
              </Text>
              <Text style={estilos.nota}>Ve de {cal.ve}% porque o solo tem {cal.classeT}.</Text>
              {cal.precisa ? (
                <Text style={estilos.resultado}>
                  Aplicar {formatarNumero(cal.dose, 2)} t/ha de calcário PRNT {formatarNumero(cal.prnt, 0)}%{cal.cobertura ? ' em cobertura (metade da dose)' : ', incorporado a 20 cm'}
                  {dens ? ` · ${formatarNumero((cal.dose * 1_000_000) / dens, 0)} g por planta` : ''}
                </Text>
              ) : (
                <Text style={estilos.resultado}>Não precisa de calagem agora: a saturação por bases já está na faixa.</Text>
              )}
            </View>
          )}

          {conilon && emProducao && (
            <>
              <Secao titulo="Adubação de produção: N e K (conta do sistema)" />
              <View style={estilos.quadro}>
                <Campo rotulo="Produtividade esperada (sacas beneficiadas por hectare)" value={prod} onChangeText={setProd} keyboardType="decimal-pad" ajuda="Vem da previsão de safra do talhão; pode mudar para simular." />
                {nk ? (
                  <>
                    <Text style={estilos.resultado}>
                      Nitrogênio: {formatarNumero(nk.n)} kg/ha por ano{nk.nPlanta ? ` · ${formatarNumero(nk.nPlanta)} g de N por planta` : ''}
                    </Text>
                    {nk.k2o != null ? (
                      <Text style={estilos.resultado}>
                        Potássio: {formatarNumero(nk.k2o)} kg/ha de K₂O por ano{nk.k2oPlanta ? ` · ${formatarNumero(nk.k2oPlanta)} g de K₂O por planta` : ''}
                      </Text>
                    ) : (
                      <Text style={estilos.nota}>Sem o K do solo na análise, o potássio não é calculado.</Text>
                    )}
                    <Text style={estilos.nota}>
                      Faixa de {nk.faixa} sc/ha{nk.classeK ? `; ${nk.classeK} mg/dm³ no solo` : ''}. Parcelar na floração (ago/set), no chumbinho (nov/dez) e na granação (fev/mar); em lavoura irrigada, parcelar mais.
                    </Text>
                  </>
                ) : (
                  <Text style={estilos.nota}>Informe a produtividade esperada para ver as doses.</Text>
                )}
              </View>
            </>
          )}
          {conilon && !emProducao && <Text style={estilos.nota}>Lavoura em formação: a tabela de N e K do sistema é para lavoura em produção. Veja a orientação de formação no parecer.</Text>}
          {!conilon && <Text style={estilos.nota}>As tabelas de adubação do sistema são do café conilon; para {t.especie || 'esta cultura'}, peça o parecer abaixo.</Text>}
        </>
      )}

      {solo && (
        <>
          <Secao titulo="Plano de adubação" />
          {planos.map((pl) => (
            <Botao key={pl.id} titulo={`Ver o plano nº ${pl.numero}, de ${doBanco(pl.data)}`} tipo="secundario" onPress={() => navegacao.navigate('PlanoAdubacao', { id: pl.id })} />
          ))}
          <Botao titulo={planos.length ? 'Montar outro plano' : 'Montar o plano de adubação'} onPress={() => navegacao.navigate('PlanoAdubacao', { analiseId: a.id })} />
          <Text style={estilos.nota}>Transforma as doses acima em quilos dos adubos do seu estoque, por planta e no talhão, parcelados em aplicações com data. Cada aplicação vira uma atividade quando for feita.</Text>
        </>
      )}

      <Secao titulo="Parecer do agrônomo virtual (IA)" />
      {parecer ? (
        <View style={{ gap: 10 }}>
          <Text style={estilos.nota}>Gerado em {doBanco(a.parecer_em)}.</Text>
          <Text style={estilos.texto}>{parecer.resumo}</Text>
          {(parecer.parametros ?? []).length > 0 && (
            <View style={estilos.quadro}>
              {(parecer.parametros as any[]).map((p, k) => (
                <View key={k} style={{ gap: 1 }}>
                  <Text style={estilos.paramNome}>
                    {p.nome}: {p.valor} · <Text style={{ color: COR_CLASSE[String(p.classe).toLowerCase()] ?? cores.texto }}>{p.classe}</Text>
                  </Text>
                  {p.comentario ? <Text style={estilos.nota}>{p.comentario}</Text> : null}
                </View>
              ))}
            </View>
          )}
          <Bloco titulo="Calagem" texto={parecer.calagem} />
          <Bloco titulo="Gessagem" texto={parecer.gessagem} />
          <Bloco titulo="Nitrogênio" texto={parecer.adubacao?.nitrogenio} />
          <Bloco titulo="Fósforo" texto={parecer.adubacao?.fosforo} />
          <Bloco titulo="Potássio" texto={parecer.adubacao?.potassio} />
          <Bloco titulo="Outros nutrientes" texto={parecer.adubacao?.outros} />
          <Bloco titulo="Micronutrientes" texto={parecer.micronutrientes} />
          <Bloco titulo="Parcelamento" texto={parecer.parcelamento} />
          <Lista titulo="Atenção" itens={parecer.alertas} cor={cores.cafe} />
          <Lista titulo="Próximos passos" itens={parecer.proximos_passos} />
          {parecer.confianca ? <Text style={estilos.nota}>Sobre a confiança: {parecer.confianca}</Text> : null}
          <Botao titulo="Pedir o parecer de novo" tipo="secundario" onPress={pedir} carregando={pedindo} />
        </View>
      ) : (
        <>
          <Text style={estilos.nota}>
            A IA lê esta análise junto com os dados do talhão e as contas acima, classifica cada resultado e explica o que fazer (calagem, gesso, N, P, K, micronutrientes, parcelamento). Leva uns 20 segundos.
          </Text>
          <Botao titulo="Pedir o parecer" onPress={pedir} carregando={pedindo} />
        </>
      )}
      <Text style={estilos.aviso}>
        Apoio à decisão. As contas seguem as tabelas do Incaper para o café conilon no ES; o parecer é gerado por IA e pode errar. Confirme com o agrônomo responsável antes de comprar e aplicar.
      </Text>
    </Tela>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto?: string | null }) {
  if (!texto) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={estilos.blocoTitulo}>{titulo}</Text>
      <Text style={estilos.texto}>{texto}</Text>
    </View>
  );
}
function Lista({ titulo, itens, cor }: { titulo: string; itens?: string[] | null; cor?: string }) {
  if (!itens?.length) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={[estilos.blocoTitulo, cor ? { color: cor } : null]}>{titulo}</Text>
      {itens.map((i, k) => (
        <Text key={k} style={estilos.texto}>
          • {i}
        </Text>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 6 },
  titulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  par: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  parRotulo: { fontSize: tam.pequeno + 1, color: cores.textoSuave, flex: 1 },
  parValor: { fontSize: tam.texto, color: cores.texto, fontWeight: '700' },
  classe: { fontSize: tam.pequeno, fontWeight: '700' },
  quadro: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  conta: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 21 },
  forte: { fontWeight: '800' },
  resultado: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura, lineHeight: 24 },
  texto: { fontSize: tam.texto, color: cores.texto, lineHeight: 24 },
  blocoTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.primariaEscura },
  paramNome: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  aviso: { fontSize: tam.pequeno, color: cores.cafe, lineHeight: 19, fontWeight: '600' },
});
