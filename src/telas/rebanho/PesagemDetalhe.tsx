import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { codigoLote, idadeRotulo, identAnimal } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ROTULO_MOV } from '../../lib/movimentacoes';
import { ROTULO_OBJETIVO, TIPOS_DESTINO, TIPOS_ORIGEM, arrobas, diasEntre, gmd, textoGmd, textoLado } from '../../lib/pesagens';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const lista = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
const doisDigitos = (n: number) => String(n).padStart(2, '0');

type Anterior = { data: string; media: number; cab: number };

/** Uma pesagem: cabeçalho, pesadas, totais, comparação com a anterior e em qual movimentação foi usada. */
export default function PesagemDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'PesagemDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [p, setP] = useState<any>(null);
  const [anteriorLote, setAnteriorLote] = useState<Anterior | null>(null);
  const [anteriorAnimal, setAnteriorAnimal] = useState<Record<string, { data: string; kg: number }>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const x = await consulta<any>(
          supabase
            .from('pesagens')
            .select(
              '*, lote:lotes ( numero, descricao ), manga:areas ( nome ), raca:racas ( nome ), ferro:ferros ( descricao ),' +
                ' origem_fazenda:fazendas!pesagens_origem_fazenda_id_fkey ( nome ), destino_fazenda:fazendas!pesagens_destino_fazenda_id_fkey ( nome ),' +
                ' origem_pessoa:pessoas!pesagens_origem_pessoa_id_fkey ( nome ), destino_pessoa:pessoas!pesagens_destino_pessoa_id_fkey ( nome ),' +
                ' itens:pesagem_itens ( id, ordem, brinco, quantidade, peso_bruto_kg, animal:animais ( id, numero_interno, brinco, nome ) ),' +
                ' mov:movimentacoes ( id, tipo, data )',
            )
            .eq('id', params.id)
            .single(),
        );
        setP(x);

        // Pesagem anterior do mesmo lote (para o ganho do lote).
        if (x.lote_id) {
          const ant = await consulta<any[]>(
            supabase.from('pesagens').select('data, itens:pesagem_itens ( quantidade, peso_bruto_kg )').eq('lote_id', x.lote_id).lt('data', x.data).order('data', { ascending: false }).limit(1),
          );
          if (ant[0]) {
            const its = ant[0].itens as any[];
            const cab = its.reduce((s, i) => s + i.quantidade, 0);
            const kg = its.reduce((s, i) => s + Number(i.peso_bruto_kg), 0);
            if (cab) setAnteriorLote({ data: ant[0].data, media: kg / cab, cab });
          }
        }

        // Último peso de cada animal identificado, antes desta data.
        const ids = (x.itens as any[]).map((i) => um(i.animal)?.id).filter(Boolean);
        if (ids.length) {
          const antes = await consulta<any[]>(
            supabase.from('pesagem_itens').select('animal_id, peso_bruto_kg, pesagens!inner ( data )').in('animal_id', ids).lt('pesagens.data', x.data),
          );
          const mapa: Record<string, { data: string; kg: number }> = {};
          for (const a of antes) {
            const d = um(a.pesagens)?.data;
            if (d && (!mapa[a.animal_id] || d > mapa[a.animal_id].data)) mapa[a.animal_id] = { data: d, kg: Number(a.peso_bruto_kg) };
          }
          setAnteriorAnimal(mapa);
        }
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
  }, [params.id]);

  useLayoutEffect(() => {
    if (p) navegacao.setOptions({ title: `Pesagem nº ${p.numero}` });
  }, [navegacao, p]);

  const movs = p ? lista(p.mov) : [];

  function excluir() {
    if (movs.length) return setErro('Esta pesagem está ligada a uma movimentação. Exclua a movimentação antes.');
    Alert.alert('Excluir pesagem', `Excluir a pesagem nº ${p.numero} inteira? Os pesos saem do histórico dos animais.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setExcluindo(true);
          const { error } = await supabase.from('pesagens').delete().eq('id', p.id);
          setExcluindo(false);
          if (error) setErro(traduzirErro(error));
          else navegacao.goBack();
        },
      },
    ]);
  }

  if (!p) {
    return (
      <Tela rolar={false}>
        {erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}
      </Tela>
    );
  }

  const arroba = Number(p.peso_arroba) || 30;
  const itens = (p.itens as any[]).map((i) => ({ ...i, animal: um(i.animal), kg: Number(i.peso_bruto_kg) })).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const cab = itens.reduce((s, i) => s + i.quantidade, 0);
  const total = itens.reduce((s, i) => s + i.kg, 0);
  const qtdArrobas = arrobas(total, arroba);
  const media = cab ? total / cab : 0;
  const l = um(p.lote);
  const gmdLote = anteriorLote ? gmd(anteriorLote.media, anteriorLote.data, media, p.data) : null;
  const identificados = itens.filter((i) => i.animal);

  const cabecalho: [string, string | null][] = [
    ['Data', doBanco(p.data)],
    ['Objetivo', p.objetivo === 'outros' ? `Outras: ${p.objetivo_outro ?? ''}` : ROTULO_OBJETIVO[p.objetivo]],
    ['Origem', textoLado(p.origem_tipo, TIPOS_ORIGEM, um(p.origem_fazenda)?.nome, um(p.origem_pessoa)?.nome, p.origem_texto)],
    ['Destino', textoLado(p.destino_tipo, TIPOS_DESTINO, um(p.destino_fazenda)?.nome, um(p.destino_pessoa)?.nome, p.destino_texto)],
    ['Lote', l ? `${codigoLote(l.numero, sigla)}${l.descricao ? ` – ${l.descricao}` : ''}${um(p.manga)?.nome ? `, manga ${um(p.manga).nome}` : ''}` : null],
    ['Animais', [p.sexo === 'M' ? 'Machos' : p.sexo === 'F' ? 'Fêmeas' : null, um(p.raca)?.nome, idadeRotulo(p.nascimento_ref, p.nascimento_aproximado)].filter(Boolean).join(', ') || null],
    ['Ferro', um(p.ferro)?.descricao ?? null],
    ['Arroba bruta', `${formatarNumero(arroba, arroba % 1 ? 2 : 0)} kg`],
    ['Observações', p.observacoes],
  ];

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.totais}>
        <Total rotulo="Quantidade" valor={`${formatarNumero(cab)} cab.`} />
        <Total rotulo="Peso bruto" valor={`${formatarNumero(total, 1)} kg`} />
        <Total rotulo="Qtde. de arrobas" valor={formatarNumero(qtdArrobas, 2)} />
        <Total rotulo="Arrobas média" valor={formatarNumero(cab ? qtdArrobas / cab : 0, 2)} />
      </View>
      <Text style={estilos.suave}>Média de {formatarNumero(media, 1)} kg por cabeça.</Text>

      <View style={estilos.cartao}>
        {cabecalho
          .filter(([, v]) => v)
          .map(([r, v]) => (
            <View key={r} style={{ gap: 2 }}>
              <Text style={estilos.rotulo}>{r}</Text>
              <Text style={estilos.valor}>{v}</Text>
            </View>
          ))}
      </View>

      {movs.length > 0 ? (
        <Lista>
          {movs.map((m: any) => (
            <Linha key={m.id} titulo={`Usada na movimentação: ${ROTULO_MOV[m.tipo] ?? m.tipo}`} linhas={[doBanco(m.data)]} onPress={() => navegacao.navigate('MovimentacaoDetalhe', { id: m.id })} />
          ))}
        </Lista>
      ) : (
        p.objetivo !== 'controle' && <Text style={estilos.suave}>Ainda não usada em movimentação. Lá, informe o nº {p.numero} para puxar estes dados.</Text>
      )}

      {/* ----- pesadas ----- */}
      <Secao titulo="Pesadas" />
      <View style={estilos.tabela}>
        <View style={[estilos.linhaTab, estilos.cab]}>
          <Text style={[estilos.cOrd, estilos.th]}>Ord.</Text>
          <Text style={[estilos.cBrinco, estilos.th]}>Brinco</Text>
          <Text style={[estilos.cQtd, estilos.th]}>Qtde.</Text>
          <Text style={[estilos.cPeso, estilos.th]}>Peso bruto</Text>
          <Text style={[estilos.cArr, estilos.th]}>Arrobas</Text>
        </View>
        {itens.map((i, n) => (
          <View key={i.id} style={[estilos.linhaTab, n > 0 && estilos.divisor]}>
            <Text style={[estilos.cOrd, estilos.td]}>{doisDigitos(i.ordem ?? n + 1)}</Text>
            <Text style={[estilos.cBrinco, estilos.td]}>{i.brinco ?? '—'}</Text>
            <Text style={[estilos.cQtd, estilos.td]}>{i.quantidade}</Text>
            <Text style={[estilos.cPeso, estilos.td]}>{formatarNumero(i.kg, 1)}</Text>
            <Text style={[estilos.cArr, estilos.td]}>{formatarNumero(arrobas(i.kg, arroba), 2)}</Text>
          </View>
        ))}
      </View>

      {anteriorLote && (
        <View style={estilos.cartao}>
          <Text style={estilos.titulo}>Comparado com a pesagem anterior do lote</Text>
          <Text style={estilos.texto}>
            Em {doBanco(anteriorLote.data)}: média de {formatarNumero(anteriorLote.media, 1)} kg ({formatarNumero(anteriorLote.cab)} cab.)
          </Text>
          <Text style={estilos.texto}>
            Ganho de {formatarNumero(media - anteriorLote.media, 1)} kg em {diasEntre(anteriorLote.data, p.data)} dias
            {gmdLote !== null ? `: ${textoGmd(gmdLote)}` : ''}
          </Text>
          <Text style={estilos.suave}>É média contra média. Se entraram ou saíram animais entre as pesagens, o número muda por isso também.</Text>
        </View>
      )}

      {identificados.length > 0 && (
        <>
          <Secao titulo="Animais identificados" />
          <Lista>
            {identificados.map((i) => {
              const ant = anteriorAnimal[i.animal.id];
              const g = ant ? gmd(ant.kg, ant.data, i.kg, p.data) : null;
              return (
                <Linha
                  key={i.id}
                  titulo={[identAnimal(i.animal), i.animal.nome].filter(Boolean).join('  ')}
                  linhas={[ant ? `Antes: ${formatarNumero(ant.kg, 1)} kg em ${doBanco(ant.data)}${g !== null ? `, ${textoGmd(g)}` : ''}` : 'Primeira pesagem']}
                  direita={`${formatarNumero(i.kg, 1)} kg`}
                  onPress={() => navegacao.navigate('AnimalForm', { id: i.animal.id })}
                />
              );
            })}
          </Lista>
        </>
      )}

      <Botao titulo="Excluir pesagem" tipo="perigo" onPress={excluir} carregando={excluindo} />
      <Text style={estilos.suave}>Pesagem não se altera. Se algo saiu errado, exclua e lance de novo.</Text>
    </Tela>
  );
}

function Total({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.total}>
      <Text style={estilos.totalRotulo}>{rotulo}</Text>
      <Text style={estilos.totalValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 10 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  valor: { fontSize: tam.texto, color: cores.texto, fontWeight: '600' },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  texto: { fontSize: tam.texto, color: cores.texto },
  suave: { fontSize: tam.pequeno, color: cores.textoSuave },

  totais: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  total: { flexBasis: '47%', flexGrow: 1, backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  totalRotulo: { fontSize: tam.pequeno, color: cores.primariaEscura },
  totalValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },

  tabela: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, overflow: 'hidden' },
  cab: { backgroundColor: cores.fundo },
  linhaTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, gap: 4 },
  divisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  th: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  td: { fontSize: tam.pequeno + 1, color: cores.texto },
  cOrd: { width: 34 },
  cBrinco: { flex: 1.1 },
  cQtd: { width: 44, textAlign: 'right' },
  cPeso: { flex: 1.1, textAlign: 'right' },
  cArr: { flex: 1, textAlign: 'right' },
});
