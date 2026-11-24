import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Secao from '../../componentes/Secao';
import CamposManejo, { MANEJO_VAZIO, conferirManejo, registroManejo, type ManejoEd } from '../../componentes/CamposManejo';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBR } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { CATEGORIAS, ORDEM_CATEGORIAS, ROTULO_MANEJO, nomeEstrutura, textoInundacao, textoManejo, type Categoria } from '../../lib/mangas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const HISTORICO = 100;

/** Ficha da manga: todos os dados, estruturas com o último manejo, lançar novo manejo e histórico. */
export default function MangaDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'MangaDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const [a, setA] = useState<any>(null);
  const [estruturas, setEstruturas] = useState<any[]>([]);
  const [manejos, setManejos] = useState<any[]>([]);
  const [cabecas, setCabecas] = useState(0);
  // V195: estimativa pelo capim, área e gado (sequeiro), nas águas e na seca
  const [est, setEst] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // lançamento aberto: id da estrutura
  const [lancando, setLancando] = useState<string | null>(null);
  const [manejo, setManejo] = useState<ManejoEd>(MANEJO_VAZIO);
  const [erroManejo, setErroManejo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const area = await consulta<any>(supabase.from('areas').select('*').eq('id', params.id).single());
      const [est, man, lotes] = await Promise.all([
        consulta<any[]>(supabase.from('manga_estruturas').select('*').eq('area_id', params.id).order('created_at')),
        consulta<any[]>(
          supabase.from('manga_manejos').select('*').eq('area_id', params.id).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(HISTORICO + 1),
        ),
        consulta<any[]>(supabase.from('lotes').select('id').eq('situacao', 'ativo').eq('manga_id', params.id)),
      ]);
      let cab = 0;
      if (lotes.length) {
        const { count } = await supabase
          .from('animais')
          .select('id', { count: 'exact', head: true })
          .eq('situacao', 'ativo')
          .in('lote_id', lotes.map((l) => l.id));
        cab = count ?? 0;
      }
      setA(area);
      const { data: e } = await supabase.rpc('manga_estimativa', { p_area: params.id });
      setEst(e ?? null);
      setEstruturas(est.sort((x, y) => ORDEM_CATEGORIAS.indexOf(x.categoria) - ORDEM_CATEGORIAS.indexOf(y.categoria)));
      setManejos(man);
      setCabecas(cab);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [params.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  useLayoutEffect(() => {
    if (a) navegacao.setOptions({ title: a.nome });
  }, [navegacao, a]);

  function abrirLancamento(estId: string) {
    setAviso(null);
    setErroManejo(null);
    setManejo({ ...MANEJO_VAZIO, data: hojeBR() });
    setLancando(estId);
  }

  async function salvarManejo(e: any) {
    const p = conferirManejo(manejo) ?? (manejo.data.trim() ? null : 'Informe a data.');
    setErroManejo(p);
    if (p || !fazendaAtiva) return;
    setSalvando(true);
    const { error } = await supabase
      .from('manga_manejos')
      .insert({ ...registroManejo(manejo, e.categoria as Categoria), estrutura_id: e.id, area_id: a.id, fazenda_id: a.fazenda_id });
    setSalvando(false);
    if (error) return setErroManejo(traduzirErro(error));
    setLancando(null);
    setAviso(`${ROTULO_MANEJO[CATEGORIAS[e.categoria as Categoria].manejo]} de ${manejo.data} registrad${CATEGORIAS[e.categoria as Categoria].manejo === 'abastecimento' ? 'o' : 'a'}.`);
    carregar();
  }

  function excluirManejo(m: any) {
    Alert.alert('Excluir registro', `Excluir ${ROTULO_MANEJO[m.tipo as keyof typeof ROTULO_MANEJO].toLowerCase()} de ${doBanco(m.data)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('manga_manejos').delete().eq('id', m.id);
          if (error) setErro(traduzirErro(error));
          else carregar();
        },
      },
    ]);
  }

  if (!a) {
    return (
      <Tela rolar={false}>
        {erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}
      </Tela>
    );
  }

  const ha = a.area_ha != null ? Number(a.area_ha) : null;
  const suporte = (uaHa: any) => (uaHa != null ? `${formatarNumero(uaHa, 2)} UA/ha${ha ? ` (≈ ${formatarNumero(Number(uaHa) * ha, 0)} UA na manga)` : ''}` : null);
  const nomeEst: Record<string, string> = Object.fromEntries(estruturas.map((e) => [e.id, nomeEstrutura(e)]));

  const linhas: [string, string | null][] = [
    ['Área', ha != null ? `${formatarNumero(ha, 2)} ha${a.perimetro_m ? ` • perímetro ${formatarNumero(a.perimetro_m)} m` : ''}` : null],
    ['Capim', a.capim_cultura],
    ['Indicação de uso', a.indicacao_uso],
    ['Animais agora', `${formatarNumero(cabecas)} cab.`],
    ['GMD potencial', a.gmd_potencial != null ? `${formatarNumero(a.gmd_potencial, 3)} kg/dia` : null],
    ['Biomassa', a.biomassa != null ? `${formatarNumero(a.biomassa, 0)} kg MS/ha` : null],
    ['Análise do solo', doBanco(a.data_analise_solo) || null],
    ['Capacidade nas águas', suporte(a.capacidade_aguas)],
    ['Capacidade na seca', suporte(a.capacidade_seca)],
    [
      'Altura de entrada / saída',
      a.altura_entrada_cm != null || a.altura_saida_cm != null
        ? `${a.altura_entrada_cm != null ? formatarNumero(a.altura_entrada_cm, 0) : '–'} cm / ${a.altura_saida_cm != null ? formatarNumero(a.altura_saida_cm, 0) : '–'} cm`
        : null,
    ],
    ['Período de descanso', a.descanso_dias != null ? `${a.descanso_dias} dias` : null],
    ['Topografia', a.topografia],
    ['Risco de inundação', textoInundacao(a)],
    ['Medidas e observações', a.medidas],
  ];

  function estimativa() {
    if (!est) return null;
    if (!est.capim_reconhecido)
      return (
        <>
          <Secao titulo="Estimativa (sequeiro)" />
          <Aviso tipo="info" texto="Escolha o capim no cadastro da manga (Editar cadastro) para o sistema calcular a capacidade nas águas e na seca." />
        </>
      );
    const ag = est.aguas ?? {};
    const se = est.seca ?? {};
    const n = (v: any, c = 0) => (v != null ? formatarNumero(Number(v), c) : '–');
    const linha = (rot: string, x: string, y: string, negrito = false) => (
      <View key={rot} style={estilos.linhaTab}>
        <Text style={[estilos.cel1, negrito && estilos.cab]}>{rot}</Text>
        <Text style={[estilos.cel, negrito && estilos.cab]}>{x}</Text>
        <Text style={[estilos.cel, negrito && estilos.cab]}>{y}</Text>
      </View>
    );
    const l = est.lotacao ?? {};
    const sit = SITUACAO[l.situacao] ?? SITUACAO.vazia;
    const estAgora = est.estacao_agora === 'aguas' ? 'águas' : 'seca';
    return (
      <>
        <Secao titulo={`Estimativa (sequeiro) · ${est.capim} · fertilidade ${est.fertilidade === 'boa' ? 'boa' : est.fertilidade === 'fraca' ? 'fraca' : 'média'}`} />
        <View style={estilos.cartao}>
          {linha('', 'Águas', 'Seca', true)}
          {linha('Biomassa (kg MS/ha)', n(ag.biomassa_kg_ha), n(se.biomassa_kg_ha))}
          {linha('Capacidade (UA/ha)', n(ag.ua_ha, 2), n(se.ua_ha, 2))}
          {linha('Capacidade na manga (UA)', n(ag.ua, 1), n(se.ua, 1))}
          {linha('GMD esperado (kg/dia)', n(ag.gmd, 2), n(se.gmd, 2))}
          {linha('Período de descanso (dias)', n(ag.descanso), n(se.descanso))}
          {linha('Altura entrada / saída (cm)', `${n(ag.altura_entrada)} / ${n(ag.altura_saida)}`, `${n(se.altura_entrada)} / ${n(se.altura_saida)}`)}
          {linha('Capacidade em cabeças', 'Águas', 'Seca', true)}
          {FAIXAS.map(([k, rot]) => linha(rot, n(ag.cabecas?.[k]), n(se.cabecas?.[k])))}
        </View>
        <Secao titulo={`Lotação agora (${estAgora})`} />
        <View style={estilos.cartao}>
          <Text style={[estilos.valor, { color: sit.cor }]}>{sit.texto}</Text>
          {linha('Cabeças na manga', n(l.cabecas), '')}
          {linha('UA na manga', n(l.ua, 2), '')}
          {linha('Capacidade agora (UA)', n(l.capacidade_ua, 1), '')}
          {l.dias_ocupacao != null && linha('Ocupação prevista (dias)', n(l.dias_ocupacao), '')}
          {l.sair_em && linha('Tirar o gado em', doBanco(l.sair_em), '')}
        </View>
      </>
    );
  }

  return (
    <Tela atualizando={false} aoAtualizar={carregar}>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {!a.ativa && <Aviso tipo="info" texto="Esta manga está inativa." />}

      <View style={estilos.cartao}>
        {linhas
          .filter(([, v]) => v)
          .map(([r, v]) => (
            <View key={r} style={estilos.par}>
              <Text style={estilos.rotulo}>{r}</Text>
              <Text style={estilos.valor}>{v}</Text>
            </View>
          ))}
      </View>

      {estimativa()}

      <Secao titulo="Bebedouros, cochos e cercas" />
      {estruturas.length === 0 && <Text style={estilos.nota}>Nenhum cadastrado. Inclua em "Editar cadastro".</Text>}
      {estruturas.map((e) => {
        const info = CATEGORIAS[e.categoria as Categoria];
        const ultimo = manejos.find((m) => m.estrutura_id === e.id);
        const artigo = info.manejo === 'abastecimento' ? 'o' : 'a';
        const detalhes = [
          e.categoria === 'cocho_sal' && e.com_cobertura != null ? (e.com_cobertura ? 'Com cobertura' : 'Sem cobertura') : null,
          e.capacidade_kg != null ? `Capacidade ${formatarNumero(e.capacidade_kg, 0)} kg` : null,
          e.capacidade_animais != null ? `Capacidade ${formatarNumero(e.capacidade_animais)} animais` : null,
        ].filter(Boolean);
        return (
          <View key={e.id} style={estilos.cartao}>
            <Text style={estilos.titulo}>{nomeEstrutura(e)}</Text>
            {detalhes.length > 0 && <Text style={estilos.detalhe}>{detalhes.join(' • ')}</Text>}
            <Text style={estilos.ultimo}>
              Últim{artigo} {info.rotuloManejo.toLowerCase()}: {ultimo ? textoManejo(ultimo) : 'nenhum registro'}
            </Text>
            {lancando === e.id ? (
              <>
                <CamposManejo
                  categoria={e.categoria}
                  valor={manejo}
                  aoMudar={setManejo}
                  rotuloData={`Data d${artigo} ${info.rotuloManejo.toLowerCase()}`}
                  erro={erroManejo}
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Botao titulo="Cancelar" tipo="secundario" onPress={() => setLancando(null)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Botao titulo="Registrar" onPress={() => salvarManejo(e)} carregando={salvando} />
                  </View>
                </View>
              </>
            ) : (
              <Botao titulo={`+ Lançar ${info.rotuloManejo.toLowerCase()}`} tipo="secundario" onPress={() => abrirLancamento(e.id)} />
            )}
          </View>
        );
      })}

      <Secao titulo="Histórico de manejo" />
      {manejos.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma limpeza, abastecimento ou manutenção registrada ainda.</Text>
      ) : (
        <>
          <Lista>
            {manejos.slice(0, HISTORICO).map((m) => (
              <Linha
                key={m.id}
                titulo={`${doBanco(m.data)} – ${ROTULO_MANEJO[m.tipo as keyof typeof ROTULO_MANEJO]}`}
                linhas={[
                  nomeEst[m.estrutura_id] ?? CATEGORIAS[m.categoria as Categoria]?.rotulo,
                  [m.produto, m.quantidade_kg != null ? `${formatarNumero(m.quantidade_kg, 1)} kg` : null, m.servico].filter(Boolean).join(', ') || null,
                ]}
                onPress={() => excluirManejo(m)}
              />
            ))}
          </Lista>
          <Text style={estilos.nota}>
            {manejos.length > HISTORICO ? `Mostrando os ${HISTORICO} mais recentes. ` : ''}Tocando num registro, dá para excluir se foi lançado errado.
          </Text>
        </>
      )}

      <Botao titulo="Editar cadastro" onPress={() => navegacao.navigate('AreaForm', { tipo: 'manga', id: a.id })} />
    </Tela>
  );
}

const FAIXAS: [string, string][] = [
  ['M0', 'Machos 0 a 12 meses'], ['M13', 'Machos 13 a 24'], ['M25', 'Machos 25 a 36'], ['M37', 'Machos + 36'],
  ['F0', 'Fêmeas 0 a 2 meses'], ['F3', 'Fêmeas 3 a 8'], ['F9', 'Fêmeas 9 a 12'], ['F13', 'Fêmeas 13 a 24'], ['F25', 'Fêmeas 25 a 36'], ['F37', 'Fêmeas + 36'],
];
const SITUACAO: Record<string, { texto: string; cor: string }> = {
  acima: { texto: 'Acima da capacidade', cor: '#B3261E' },
  dentro: { texto: 'Dentro da capacidade', cor: '#2E7D32' },
  abaixo: { texto: 'Abaixo da capacidade (sobra pasto)', cor: '#8D6E00' },
  vazia: { texto: 'Sem gado', cor: '#56625A' },
};

const estilos = StyleSheet.create({
  linhaTab: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: cores.borda, alignItems: 'center' },
  cel1: { flex: 2, fontSize: tam.pequeno + 1, color: cores.texto },
  cel: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, textAlign: 'right' },
  cab: { fontWeight: '700', color: cores.cafe },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 10 },
  par: { gap: 2 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  valor: { fontSize: tam.texto, color: cores.texto, fontWeight: '600' },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  detalhe: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  ultimo: { fontSize: tam.pequeno + 1, color: cores.primariaEscura, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
});
