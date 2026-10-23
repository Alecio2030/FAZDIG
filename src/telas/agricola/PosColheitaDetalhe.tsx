import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Botao from '../../componentes/Botao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, textoHoras } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { textoLitros } from '../../lib/colheitas';
import { custoEtapa, sacasLiquidas, textoCobranca, textoSacas, um } from '../../lib/posColheita';
import { ROTULO_SITUACAO } from '../../lib/titulos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const VAZIO = '–';

/** Ficha da secagem ou da pilagem (Consulta): origem do café, resultado, rendimento, cobrança e custo. Só mostra. */
export default function PosColheitaDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'PosColheitaDetalhe'>>();
  const secagem = params.tipo === 'secagem';
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? `${secagem ? 'Secagem' : 'Pilagem'} nº ${d.x.numero}` : secagem ? 'Secagem' : 'Pilagem' });
  }, [navegacao, d, secagem]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          if (secagem) {
            const [x, itens, pil, tit] = await Promise.all([
              consulta<any>(supabase.from('cafe_secagens').select('*, pessoa:pessoas ( nome ), local:pc_locais ( nome )').eq('id', params.id).single()),
              consulta<any[]>(supabase.from('cafe_secagem_itens').select('id, litros, lote:pc_lotes ( id, numero, data_colheita, area:areas ( nome ) )').eq('secagem_id', params.id)),
              consulta<any[]>(supabase.from('cafe_pilagem_itens').select('id, sacas_coco, pilagem:cafe_pilagens ( id, numero, data )').eq('secagem_id', params.id)),
              consulta<any[]>(supabase.from('lancamentos').select('id, numero, situacao').eq('cafe_secagem_id', params.id)),
            ]);
            setD({ x, itens, pil, tit: tit[0] ?? null });
          } else {
            const [x, itens, tit] = await Promise.all([
              consulta<any>(supabase.from('cafe_pilagens').select('*, pessoa:pessoas ( nome )').eq('id', params.id).single()),
              consulta<any[]>(
                supabase
                  .from('cafe_pilagem_itens')
                  .select('id, sacas_coco, secagem:cafe_secagens ( id, numero, data_saida, litros, sacas_secas, itens:cafe_secagem_itens ( litros, lote:pc_lotes ( area:areas ( nome ) ) ) )')
                  .eq('pilagem_id', params.id),
              ),
              consulta<any[]>(supabase.from('lancamentos').select('id, numero, situacao').eq('cafe_pilagem_id', params.id)),
            ]);
            setD({ x, itens, tit: tit[0] ?? null });
          }
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id, secagem]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!d) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const { x, itens, tit } = d;
  const custo = custoEtapa(x);
  const botaoTitulo = tit ? <Botao titulo={`Ver o título nº ${tit.numero} (${ROTULO_SITUACAO[tit.situacao] ?? tit.situacao})`} tipo="secundario" onPress={() => navegacao.navigate('TituloDetalhe', { id: tit.id })} /> : null;
  const rodape = (
    <>
      {Number(x.custo_proprio) > 0 && <Dado rotulo="Custo próprio informado" valor={formatarMoeda(Number(x.custo_proprio))} />}
      {botaoTitulo}
      {x.observacoes ? <Text style={estilos.obs}>{x.observacoes}</Text> : null}
      <Botao
        titulo={`✏️  Alterar ou excluir esta ${secagem ? 'secagem' : 'pilagem'}`}
        tipo="secundario"
        onPress={() => navegacao.push('PosColheitaForm', { aba: secagem ? 'secagem' : 'pilagem', abrirNumero: x.numero })}
      />
    </>
  );

  if (secagem) {
    const sacas = x.sacas_secas != null ? Number(x.sacas_secas) : null;
    const liquidas = sacasLiquidas(x);
    return (
      <Tela>
        <View style={estilos.cartao}>
          <Text style={estilos.titulo}>🔥 {x.onde === 'terceiro' ? um(x.pessoa)?.nome ?? 'Secador de terceiro' : um(x.local)?.nome ?? 'Secador próprio'}</Text>
          <Text style={estilos.sub}>
            Nº {x.numero} · entrou em {doBanco(x.data_entrada)}
            {x.data_saida ? ` · saiu em ${doBanco(x.data_saida)}` : ' · no secador'}
          </Text>
          <View style={estilos.cards}>
            <Card rotulo="Café da roça" valor={textoLitros(x.litros)} detalhe={`${itens.length} ${itens.length === 1 ? 'colheita' : 'colheitas'}`} />
            <Card rotulo="Sacas secas (em coco)" valor={sacas != null ? formatarQtd(sacas, 2) : VAZIO} detalhe={sacas ? `${formatarNumero(Number(x.litros) / sacas)} L por saca` : 'aguardando a saída'} />
            {Number(x.sacas_pagas) > 0 && <Card rotulo="Suas sacas" valor={formatarQtd(liquidas, 2)} detalhe={`${textoSacas(x.sacas_pagas)} com o secador`} />}
            <Card rotulo="Custo da secagem" valor={formatarMoeda(custo)} detalhe={custo && liquidas > 0 ? `${formatarMoeda(custo / liquidas)} por saca seca` : undefined} />
          </View>
        </View>

        <Secao titulo="Colheitas que entraram" />
        {itens.map((i: any) => {
          const l = um(i.lote);
          return (
            <View key={i.id} style={estilos.item}>
              <View style={estilos.itemLinha}>
                <Text style={estilos.itemTitulo}>
                  Colheita nº {l?.numero} · {um(l?.area)?.nome}
                </Text>
                <Text style={estilos.itemValor}>{textoLitros(i.litros)}</Text>
              </View>
              <Text style={estilos.nota}>
                Colhida em {doBanco(l?.data_colheita)} · {formatarNumero((Number(i.litros) / Number(x.litros)) * 100)}% da carga
                {sacas ? ` · ${textoSacas((liquidas * Number(i.litros)) / Number(x.litros))} suas` : ''}
              </Text>
            </View>
          );
        })}

        <Secao titulo="Secagem" />
        <Dado rotulo="Umidade" valor={x.umidade_inicial != null || x.umidade_final != null ? `${x.umidade_inicial != null ? `${formatarQtd(x.umidade_inicial)}%` : '?'} → ${x.umidade_final != null ? `${formatarQtd(x.umidade_final)}%` : '?'}` : null} />
        <Dado rotulo="Horas de secagem" valor={x.horas != null ? textoHoras(Number(x.horas)) : null} />
        <Dado rotulo="Cobrança" valor={textoCobranca(x, formatarMoeda)} />

        {d.pil.length > 0 && (
          <>
            <Secao titulo="Pilagens" />
            {d.pil.map((p: any) => (
              <Dado key={p.id} rotulo={`Pilagem nº ${um(p.pilagem)?.numero} · ${doBanco(um(p.pilagem)?.data)}`} valor={textoSacas(p.sacas_coco)} />
            ))}
          </>
        )}
        {rodape}
      </Tela>
    );
  }

  // ---------- pilagem ----------
  const benef = Number(x.sacas_beneficiadas);
  const suas = benef - Number(x.sacas_pagas ?? 0);
  const coco = Number(x.sacas_coco);
  const litros = itens.reduce((t: number, i: any) => {
    const s = um(i.secagem);
    return t + (s && Number(s.sacas_secas) ? (Number(i.sacas_coco) / Number(s.sacas_secas)) * Number(s.litros) : 0);
  }, 0);
  // de que talhões veio o café: sacas piladas de cada secagem x parte de cada colheita na secagem
  const porTalhao: Record<string, number> = {};
  for (const i of itens as any[]) {
    const s = um(i.secagem);
    for (const si of s?.itens ?? []) {
      const nome = um(um(si.lote)?.area)?.nome ?? '';
      porTalhao[nome] = (porTalhao[nome] ?? 0) + (Number(i.sacas_coco) * Number(si.litros)) / Number(s.litros);
    }
  }
  return (
    <Tela>
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>⚙️ {x.onde === 'terceiro' ? um(x.pessoa)?.nome ?? 'Pilagem de terceiro' : 'Máquina própria'}</Text>
        <Text style={estilos.sub}>
          Nº {x.numero} · {doBanco(x.data)}
        </Text>
        <View style={estilos.cards}>
          <Card rotulo="Sacas beneficiadas" valor={formatarQtd(benef, 2)} detalhe={`${formatarNumero(benef * 60)} kg`} />
          <Card rotulo="Renda" valor={formatarQtd(coco / benef, 2)} detalhe="sacas em coco por saca" />
          <Card rotulo="Da roça à saca" valor={litros ? `${formatarNumero(litros / benef)} L` : VAZIO} detalhe="café da roça por saca" />
          {Number(x.sacas_pagas) > 0 && <Card rotulo="Suas sacas" valor={formatarQtd(suas, 2)} detalhe={`${textoSacas(x.sacas_pagas)} com quem pilou`} />}
          <Card rotulo="Custo da pilagem" valor={formatarMoeda(custo)} detalhe={custo && suas > 0 ? `${formatarMoeda(custo / suas)} por saca` : undefined} />
        </View>
      </View>

      <Secao titulo="Café seco que foi pilado" />
      {itens.map((i: any) => {
        const s = um(i.secagem);
        return (
          <View key={i.id} style={estilos.item}>
            <View style={estilos.itemLinha}>
              <Text style={estilos.itemTitulo}>Secagem nº {s?.numero}</Text>
              <Text style={estilos.itemValor}>{textoSacas(i.sacas_coco)}</Text>
            </View>
            <Text style={estilos.nota}>
              Saiu do secador em {doBanco(s?.data_saida)} · {formatarNumero((Number(i.sacas_coco) / coco) * 100)}% desta pilagem
            </Text>
          </View>
        );
      })}

      <Secao titulo="De que talhões veio" />
      {Object.entries(porTalhao)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, peso]) => (
          <Dado key={nome} rotulo={nome} valor={`${textoSacas((suas * peso) / coco)} (${formatarNumero((peso / coco) * 100)}%)`} />
        ))}

      <Secao titulo="Pilagem" />
      <Dado rotulo="Sacas em coco" valor={textoSacas(coco)} />
      <Dado rotulo="Palha" valor={x.palha_kg != null ? `${formatarNumero(Number(x.palha_kg))} kg` : null} />
      <Dado rotulo="Cobrança" valor={textoCobranca(x, formatarMoeda)} />
      {rodape}
    </Tela>
  );
}

function Card({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.cardRotulo}>{rotulo}</Text>
      <Text style={estilos.cardValor}>{valor}</Text>
      {detalhe ? <Text style={estilos.cardDetalhe}>{detalhe}</Text> : null}
    </View>
  );
}
function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || VAZIO}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 8 },
  titulo: { fontSize: tam.subtitulo + 3, fontWeight: '800', color: cores.primariaEscura },
  sub: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  obs: { fontSize: tam.texto, color: cores.texto, lineHeight: 24, marginTop: 6 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  cardDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 3 },
  itemLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  itemTitulo: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemValor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
