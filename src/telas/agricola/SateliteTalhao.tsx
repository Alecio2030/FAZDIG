import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Secao from '../../componentes/Secao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { doGeoJson } from '../../lib/pastos';
import { FAIXAS, atualizarIndices, faixaDe, imagemNdvi, lerHistorico, lerIndices, precisaAtualizar, textoNdvi, textoVariacaoNdvi, type Indice } from '../../lib/satelite';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** Lavoura vista de cima: índice de vigor (NDVI) do talhão pelo satélite, com a imagem colorida, o histórico e o alerta de queda. Só mostra. */
export default function SateliteTalhao() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'SateliteTalhao'>>();
  const [area, setArea] = useState<any>(null);
  const [indices, setIndices] = useState<Indice[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [imagem, setImagem] = useState<{ data: string; uri: string; largura: number; altura: number } | null>(null);
  const [carregandoImagem, setCarregandoImagem] = useState(false);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: area ? `Satélite · ${area.nome}` : 'Satélite' });
  }, [navegacao, area]);

  const atualizar = useCallback(async (a: any, avisar: boolean) => {
    setBuscando(true);
    if (avisar) {
      setErro(null);
      setAviso(null);
    }
    const r = await atualizarIndices(a);
    setBuscando(false);
    if ('erro' in r) return setErro(r.erro);
    try {
      setIndices(await lerIndices(a.id));
      if (avisar) setAviso(r.novas ? `${r.novas === 1 ? '1 imagem nova' : `${r.novas} imagens novas`} com o talhão sem nuvem.` : 'Nenhuma imagem nova com o talhão sem nuvem desde a última consulta.');
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, []);

  // relê ao voltar do desenho do contorno
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      (async () => {
        try {
          const a = await consulta<any>(supabase.from('areas').select('id, fazenda_id, nome, geometria, satelite_em, data_plantio').eq('id', params.id).single());
          if (!vivo) return;
          setArea(a);
          if (doGeoJson(a.geometria).length < 3) return setIndices([]);
          const guardados = await lerIndices(a.id);
          if (!vivo) return;
          setIndices(guardados);
          if (precisaAtualizar(a.satelite_em)) atualizar(a, false);
        } catch (e) {
          if (vivo) setErro(traduzirErro(e));
        }
      })();
      return () => {
        vivo = false;
      };
    }, [params.id, atualizar]),
  );

  async function verImagem(data: string) {
    setDia(data);
    if (imagem?.data === data) return;
    setErro(null);
    setImagem(null);
    setCarregandoImagem(true);
    const r = await imagemNdvi(area.geometria, data);
    setCarregandoImagem(false);
    if ('erro' in r) return setErro(r.erro);
    setImagem({ data, ...r });
  }

  if (!area || indices === null) return <Tela rolar={!!erro}>{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}</Tela>;

  if (doGeoJson(area.geometria).length < 3)
    return (
      <Tela>
        <Aviso texto="Para o satélite olhar este talhão, ele precisa do contorno desenhado no mapa." />
        <Botao titulo="Desenhar o contorno no mapa" onPress={() => navegacao.navigate('DesenharArea', { id: area.id })} />
      </Tela>
    );

  const l = lerHistorico(indices);
  const faixa = l ? faixaDe(l.ultimo.ndvi) : null;
  const lista = indices.slice(0, 20);

  return (
    <Tela>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {!l ? (
        buscando ? (
          <View style={estilos.linhaCentro}>
            <ActivityIndicator color={cores.primaria} />
            <Text style={estilos.nota}>Buscando as imagens dos últimos 6 meses… (pode levar uns 20 segundos)</Text>
          </View>
        ) : (
          <Text style={estilos.nota}>Ainda não há imagem com o talhão sem nuvem. Toque em "Atualizar agora".</Text>
        )
      ) : (
        <>
          <View style={[estilos.destaque, { borderLeftColor: faixa!.cor }]}>
            <Text style={estilos.pequeno}>Vigor da lavoura (NDVI) em {doBanco(l.ultimo.data)}</Text>
            <Text style={estilos.valor}>
              {textoNdvi(l.ultimo.ndvi)} <Text style={estilos.faixa}>{faixa!.rotulo}</Text>
            </Text>
            <Text style={estilos.nota}>
              {l.variacao != null ? `${textoVariacaoNdvi(l.variacao)} em relação a ${doBanco(l.anterior!.data)}. ` : ''}
              {l.ultimo.ndvi_min != null && l.ultimo.ndvi_max != null ? `No talhão vai de ${textoNdvi(l.ultimo.ndvi_min)} a ${textoNdvi(l.ultimo.ndvi_max)}. ` : ''}
              {l.diasSemImagem > 15 ? `Faz ${l.diasSemImagem} dias sem imagem limpa (nuvem).` : ''}
            </Text>
          </View>
          {l.queda && (
            <Aviso
              tipo="erro"
              texto={`Queda de vigor: ${textoVariacaoNdvi(l.diferencaBase!)} em relação à média das imagens anteriores (${textoNdvi(l.base!)}). Vale ir ao talhão olhar: falta de água, praga, doença, desfolha ou poda. Veja a imagem para achar a mancha.`}
            />
          )}

          <Secao titulo={`Imagem de ${doBanco(dia ?? l.ultimo.data)}`} />
          {imagem && imagem.data === (dia ?? l.ultimo.data) ? (
            <>
              <Image source={{ uri: imagem.uri }} style={[estilos.imagem, { aspectRatio: imagem.largura / imagem.altura }]} resizeMode="contain" />
              <View style={estilos.legenda}>
                {FAIXAS.map((f) => (
                  <View key={f.rotulo} style={estilos.legendaItem}>
                    <View style={[estilos.cor, { backgroundColor: f.cor }]} />
                    <Text style={estilos.pequeno}>{f.rotulo}</Text>
                  </View>
                ))}
                <View style={estilos.legendaItem}>
                  <View style={[estilos.cor, { backgroundColor: '#BFBFBF' }]} />
                  <Text style={estilos.pequeno}>nuvem</Text>
                </View>
              </View>
              <Text style={estilos.nota}>O norte fica para cima. Cada quadradinho tem 10 metros. Mancha mais clara ou alaranjada dentro do talhão é onde a lavoura está mais fraca: falha, reboleira, entupimento de gotejo.</Text>
            </>
          ) : carregandoImagem ? (
            <View style={estilos.linhaCentro}>
              <ActivityIndicator color={cores.primaria} />
              <Text style={estilos.nota}>Buscando a imagem…</Text>
            </View>
          ) : (
            <Botao titulo="🛰  Ver a imagem do talhão" tipo="secundario" onPress={() => verImagem(dia ?? l.ultimo.data)} />
          )}

          <Secao titulo="Histórico" />
          <View style={estilos.caixa}>
            {lista.map((x, i) => {
              const f = faixaDe(x.ndvi);
              const ant = indices[i + 1];
              const marcado = (dia ?? l.ultimo.data) === x.data;
              return (
                <Pressable key={x.data} onPress={() => verImagem(x.data)} style={({ pressed }) => [estilos.linha, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                  <Text style={[estilos.cel, { width: 84 }, marcado && { color: cores.primaria, fontWeight: '800' }]}>{doBanco(x.data)}</Text>
                  <View style={estilos.trilho}>
                    <View style={[estilos.barra, { width: `${Math.max(3, Math.min(100, x.ndvi * 100))}%`, backgroundColor: f.cor }]} />
                  </View>
                  <Text style={[estilos.cel, { width: 40, textAlign: 'right', fontWeight: '800' }]}>{textoNdvi(x.ndvi)}</Text>
                  <Text style={[estilos.pequeno, { width: 44, textAlign: 'right' }, ant && x.ndvi - ant.ndvi <= -0.05 ? { color: cores.erro, fontWeight: '700' } : null]}>{ant ? textoVariacaoNdvi(x.ndvi - ant.ndvi) : ''}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={estilos.nota}>Só entram as passagens com pelo menos 60% do talhão sem nuvem. Toque numa data para ver a imagem daquele dia.</Text>
        </>
      )}

      <Botao titulo={buscando ? 'Buscando…' : 'Atualizar agora'} tipo="secundario" onPress={() => atualizar(area, true)} carregando={buscando} />
      <Text style={estilos.nota}>
        Fonte: satélite Sentinel-2 (programa europeu Copernicus), sem custo. Passa a cada 5 dias e enxerga quadrados de 10 metros; com nuvem não há leitura, e na época das chuvas pode ficar semanas sem imagem. O NDVI vai de 0 a 1: mede o verde e o enfolhamento, não diz a causa. Lavoura nova, com muito chão aparecendo, tem NDVI baixo mesmo sadia; mato na rua aumenta o número. O que importa é a mudança no tempo e as manchas dentro do talhão.
      </Text>
      <Text style={estilos.nota}>O sistema consulta o satélite sozinho ao abrir esta tela, no máximo uma vez por dia. Redesenhar o contorno apaga o histórico e busca tudo de novo.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19, flexShrink: 1 },
  pequeno: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  linhaCentro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  destaque: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, borderLeftWidth: 8, padding: 12, gap: 2 },
  valor: { fontSize: 34, fontWeight: '800', color: cores.texto },
  faixa: { fontSize: tam.texto, fontWeight: '700', color: cores.textoSuave },
  imagem: { width: '100%', maxHeight: 420, alignSelf: 'center', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cor: { width: 14, height: 14, borderRadius: 3 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  cel: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  trilho: { flex: 1, height: 12, borderRadius: 6, backgroundColor: cores.fundo, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: 6 },
});
