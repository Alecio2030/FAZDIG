import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Botao from '../../componentes/Botao';
import PainelDieta from '../../componentes/PainelDieta';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero } from '../../lib/formatos';
import { nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ROTULO_APTIDAO, ROTULO_GENETICA, ROTULO_TIPO_ALIMENTO, textoComposicao, type Aptidao, type Item } from '../../lib/dietas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const VAZIO = '–';
const num = (v: any, casas = 2) => (v == null ? null : formatarNumero(Number(v), Number.isInteger(Number(v)) ? 0 : casas));

/** Uma dieta na Consulta: só mostra os dados, o balanço e a ficha do trato. Não altera nada. */
export default function DietaDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'DietaDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: d ? `Dieta nº ${d.numero}` : 'Dieta' });
  }, [navegacao, d]);

  useFocusEffect(
    useCallback(() => {
      consulta<any>(supabase.from('dietas').select('*, lote:lotes ( numero, descricao ), itens:dieta_itens ( * )').eq('id', params.id).single())
        .then((x) => setD({ ...x, lote: um(x.lote), itens: ((x.itens as any[]) ?? []).sort((a, b) => a.ordem - b.ordem) }))
        .catch((e) => setErro(traduzirErro(e)));
    }, [params.id]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!d) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const itens: Item[] = d.itens.map((i: any) => ({
    chave: i.id, alimento_id: i.alimento_id, nome: i.nome, tipo: i.tipo, kg_mn: Number(i.kg_mn),
    ms: Number(i.ms), pb: Number(i.pb), ndt: Number(i.ndt), fdn: Number(i.fdn), preco_kg_mn: i.preco_kg_mn != null ? Number(i.preco_kg_mn) : null,
  }));
  const apt = d.aptidao as Aptidao;

  return (
    <Tela>
      <View style={estilos.cartao}>
        <View style={estilos.topo}>
          <View>
            <Text style={estilos.rotulo}>Dieta nº</Text>
            <Text style={estilos.codigo}>{d.numero}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.rotulo}>Data</Text>
            <Text style={estilos.data}>{doBanco(d.data)}</Text>
          </View>
        </View>
        {d.descricao ? <Text style={estilos.desc}>{d.descricao}</Text> : null}
      </View>

      <Secao titulo="Rebanho" />
      <Dado rotulo="Aptidão" valor={ROTULO_APTIDAO[apt]} />
      {apt === 'genetica' && <Dado rotulo="Grupo" valor={ROTULO_GENETICA[d.genetica_tipo]} />}
      <Dado rotulo="Lote" valor={d.lote ? nomeLote(d.lote, sigla) : null} />
      <Dado rotulo="Cabeças" valor={d.cabecas ? formatarNumero(d.cabecas) : null} />
      <Dado rotulo="Peso vivo médio" valor={d.pv != null ? `${num(d.pv)} kg` : null} />
      <Dado rotulo="Escore de Condição Corporal" valor={d.ecc != null ? String(d.ecc) : null} />
      {apt === 'corte' && <Dado rotulo="Meta de ganho (GMD)" valor={d.gmd != null ? `${num(d.gmd, 3)} kg/dia` : null} />}
      {apt === 'leite' && (
        <>
          <Dado rotulo="Leite" valor={d.leite_l != null ? `${num(d.leite_l)} L/dia` : null} />
          <Dado rotulo="Gordura" valor={d.gordura != null ? `${num(d.gordura)}%` : null} />
          <Dado rotulo="Dias em lactação" valor={d.del != null ? String(d.del) : null} />
        </>
      )}

      <Secao titulo="Consumo e metas" />
      {d.cms_perc_pv != null && <Dado rotulo="Consumo de MS (% do PV)" valor={`${num(d.cms_perc_pv)}%`} />}
      <Dado rotulo="Consumo estimado" valor={d.cms_kg != null ? `${num(d.cms_kg)} kg MS/cab/dia` : null} />
      <Dado rotulo="Meta PB" valor={d.meta_pb != null ? `${num(d.meta_pb)}% da MS` : null} />
      <Dado rotulo="Meta NDT" valor={d.meta_ndt != null ? `${num(d.meta_ndt)}% da MS` : null} />
      <Dado rotulo="FDN mínima" valor={d.meta_fdn_min != null ? `${num(d.meta_fdn_min)}% da MS` : null} />

      <Secao titulo="Alimentos (por cabeça/dia)" />
      {itens.map((i) => (
        <View key={i.chave} style={estilos.item}>
          <Text style={estilos.itemNome}>{i.nome} <Text style={estilos.itemTipo}>({ROTULO_TIPO_ALIMENTO[i.tipo] ?? i.tipo})</Text></Text>
          <Text style={estilos.itemComp}>{textoComposicao(i)}</Text>
          <Text style={estilos.itemCalc}>
            {formatarNumero(i.kg_mn, 2)} kg no cocho · {formatarNumero((i.kg_mn * i.ms) / 100, 2)} kg MS
            {i.preco_kg_mn != null ? ` · ${formatarMoeda(i.preco_kg_mn)}/kg → ${formatarMoeda(i.kg_mn * i.preco_kg_mn)}` : ' · sem preço'}
          </Text>
        </View>
      ))}

      <PainelDieta
        itens={itens}
        metas={{ pb: Number(d.meta_pb), ndt: Number(d.meta_ndt), fdnMin: Number(d.meta_fdn_min) }}
        cms={d.cms_kg != null ? Number(d.cms_kg) : null}
        pv={d.pv != null ? Number(d.pv) : null}
        aptidao={apt}
        gmd={d.gmd != null ? Number(d.gmd) : null}
        leite={d.leite_l != null ? Number(d.leite_l) : null}
        cabecas={d.cabecas ?? 0}
        tituloFicha={`Dieta nº ${d.numero}${d.descricao ? ` – ${d.descricao}` : ''}`}
        data={doBanco(d.data)}
      />

      <Secao titulo="Outros" />
      <Dado rotulo="Observações" valor={d.observacoes} />
      <Botao titulo="✏️  Alterar ou excluir esta dieta" tipo="secundario" onPress={() => navegacao.push('DietaForm', { id: d.id })} />
    </Tela>
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
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  codigo: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura },
  data: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto, marginTop: 6 },
  desc: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 4 },
  itemNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemTipo: { fontSize: tam.pequeno, fontWeight: '400', color: cores.textoSuave },
  itemComp: { fontSize: tam.pequeno, color: cores.textoSuave },
  itemCalc: { fontSize: tam.pequeno + 1, color: cores.texto },
});
