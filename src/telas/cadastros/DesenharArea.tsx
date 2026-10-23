import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import MapaPastos, { type LugarMapa, type MapaRef } from '../../componentes/MapaPastos';
import { lerCoordenadas } from '../../lib/coordenadas';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { formatarNumero } from '../../lib/formatos';
import { areaM2, doGeoJson, paraGeoJson, perimetroM, type Ponto } from '../../lib/pastos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** Desenhar o contorno de um talhão (ou manga) no mapa: área e perímetro saem do desenho. */
export default function DesenharArea() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'DesenharArea'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const mapa = useRef<MapaRef>(null);
  const [area, setArea] = useState<any>(null);
  const [outras, setOutras] = useState<any[]>([]);
  const [pronto, setPronto] = useState(false);
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [lugares, setLugares] = useState<LugarMapa[]>([]);
  // ponto da fazenda (gravado em Clima e chuva): onde o mapa abre e o que ajuda a busca a achar distritos
  const [ponto, setPonto] = useState<{ lat: number; lng: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: area ? `Desenhar: ${area.nome}` : 'Desenhar no mapa' });
  }, [navegacao, area]);

  useEffect(() => {
    if (!fid) return;
    (async () => {
      try {
        const [a, o, f] = await Promise.all([
          consulta<any>(supabase.from('areas').select('id, nome, tipo, area_ha, geometria').eq('id', params.id).single()),
          consulta<any[]>(supabase.from('areas').select('id, nome, tipo, geometria').eq('fazenda_id', fid).eq('ativa', true).neq('id', params.id).not('geometria', 'is', null)),
          consulta<any>(supabase.from('fazendas').select('latitude, longitude').eq('id', fid).single()).catch(() => null),
        ]);
        if (f?.latitude != null && f?.longitude != null) setPonto({ lat: Number(f.latitude), lng: Number(f.longitude) });
        setArea(a);
        setOutras(o);
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
  }, [fid, params.id]);

  const posicao = useCallback(async (silencioso = false) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return !silencioso && setAviso('Sem permissão de localização. Busque pela cidade.');
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapa.current?.irPara(p.coords.latitude, p.coords.longitude, 16);
    } catch {
      if (!silencioso) setAviso('Não foi possível pegar a localização.');
    }
  }, []);

  // Mostra as outras áreas (referência, em cinza) e abre o desenho desta.
  useEffect(() => {
    if (!pronto || !area) return;
    const ref = outras.map((o) => ({ id: o.id, nome: o.nome, cor: o.tipo === 'talhao' ? '#6B4226' : '#7A7A7A', pontos: doGeoJson(o.geometria), rotulo: o.nome })).filter((o) => o.pontos.length >= 3);
    mapa.current?.mostrarPastos(ref, true);
    const atuais = doGeoJson(area.geometria);
    setPontos(atuais);
    setTimeout(() => mapa.current?.desenhar(true, atuais), 60);
    // sem desenho nenhum: abre na região da fazenda (o ponto gravado); sem ele, onde o celular está
    if (!atuais.length && !ref.length) {
      if (ponto) mapa.current?.irPara(ponto.lat, ponto.lng, 14);
      else posicao(true);
    }
  }, [pronto, area, outras, posicao, ponto]);

  function buscar() {
    const texto = busca.trim();
    if (!texto) return;
    setAviso(null);
    setLugares([]);
    Keyboard.dismiss();
    const c = lerCoordenadas(texto);
    if (c) {
      mapa.current?.irPara(c.lat, c.lng, 17, true);
      return setAviso('Coordenadas localizadas (ponto vermelho). Confira a foto e toque em volta da divisa.');
    }
    if (/^https?:/i.test(texto)) return setAviso('Esse link não traz as coordenadas. No Google Maps, segure o dedo em cima do lugar: aparecem dois números (ex.: -19.5321, -40.6312). Toque neles para copiar e cole aqui.');
    setBuscando(true);
    mapa.current?.buscar(texto, { municipio: fazendaAtiva?.municipio, uf: fazendaAtiva?.uf, lat: ponto?.lat, lng: ponto?.lng });
  }

  function aoLugares(lista: LugarMapa[], pedido: string) {
    setBuscando(false);
    if (!lista.length) return setAviso(`Não achei "${pedido}". Tente só o nome da cidade e arraste o mapa até a fazenda, ou cole as coordenadas do Google Maps (toque no ? ao lado).`);
    if (lista[0].aproximado) setAviso(`Não achei "${pedido}" no mapa; lugar pequeno nem sempre está cadastrado. Mostrando ${lista[0].nome.split(',').slice(0, 2).join(',')}: arraste o mapa até a fazenda, ou cole as coordenadas do Google Maps (toque no ?).`);
    setLugares(lista.length > 1 || !lista[0].aproximado ? lista.slice(0, 5) : []);
  }

  const ajuda = () =>
    Alert.alert(
      'Como achar o talhão de longe',
      '1. Digite o distrito e a cidade (ex.: Boapaba, Colatina) e toque em buscar. Se houver mais de um lugar com o nome, escolha na lista.\n\n2. Não achou? Abra o Google Maps, ache a fazenda (pelo caminho que você conhece), segure o dedo em cima do talhão e copie os dois números que aparecem (ex.: -19.5321, -40.6312). Cole aqui na busca: o mapa vai direto ao ponto.\n\n3. Também servem as coordenadas do CAR, da escritura ou de um GPS, em graus decimais ou em graus, minutos e segundos.\n\n4. No canto do mapa dá para trocar a foto: "Satélite (mais detalhe)" mostra mais de perto onde existe imagem fina; "Nomes e estradas" liga e desliga os nomes.',
    );

  const ha = areaM2(pontos) / 10000;

  async function salvar() {
    if (pontos.length < 3) return setAviso('Toque pelo menos 3 pontos em volta da divisa.');
    const gravar = async () => {
      setSalvando(true);
      const { error } = await supabase
        .from('areas')
        .update({ geometria: paraGeoJson(pontos), area_ha: Math.round(ha * 10000) / 10000, perimetro_m: Math.round(perimetroM(pontos)) })
        .eq('id', params.id);
      setSalvando(false);
      if (error) return setErro(traduzirErro(error));
      navegacao.goBack();
    };
    const atual = area?.area_ha != null ? Number(area.area_ha) : null;
    if (atual && Math.abs(atual - ha) / atual > 0.05) {
      Alert.alert('Área diferente', `A área total cadastrada é ${formatarNumero(atual, 2)} ha e a desenhada deu ${formatarNumero(ha, 2)} ha. Gravar a desenhada como área total?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Gravar a desenhada', onPress: gravar },
      ]);
    } else gravar();
  }

  return (
    <Tela rolar={false}>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && (
        <Pressable onPress={() => setAviso(null)}>
          <Aviso tipo="info" texto={aviso} />
        </Pressable>
      )}
      <View style={estilos.linha}>
        <View style={estilos.busca}>
          <Ionicons name="search" size={18} color={cores.textoSuave} />
          <TextInput
            value={busca}
            onChangeText={setBusca}
            placeholder="Distrito, cidade ou coordenadas"
            placeholderTextColor={cores.textoSuave}
            style={estilos.buscaTexto}
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={buscar}
          />
          {buscando ? (
            <ActivityIndicator color={cores.primaria} />
          ) : busca.trim() ? (
            <Pressable onPress={buscar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Buscar">
              <Text style={estilos.ir}>Buscar</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={ajuda} style={estilos.icone} accessibilityLabel="Como achar o talhão de longe">
          <Ionicons name="help" size={22} color={cores.primaria} />
        </Pressable>
        <Pressable onPress={() => posicao()} style={estilos.icone} accessibilityLabel="Onde estou">
          <Ionicons name="locate" size={22} color={cores.primaria} />
        </Pressable>
      </View>
      {lugares.length > 0 && (
        <View style={estilos.lugares}>
          {lugares.map((l, i) => (
            <Pressable
              key={`${l.lat},${l.lng},${i}`}
              onPress={() => {
                mapa.current?.irPara(l.lat, l.lng, 15, true);
                setAviso(null);
              }}
              style={({ pressed }) => [estilos.lugar, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Ionicons name="location-outline" size={18} color={cores.primaria} />
              <Text style={estilos.lugarTexto} numberOfLines={2}>
                {l.nome}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setLugares([])} hitSlop={8} accessibilityRole="button">
            <Text style={estilos.fechar}>Fechar a lista</Text>
          </Pressable>
        </View>
      )}
      <Text style={estilos.nota}>
        Toque em volta da divisa, ponto a ponto; arraste um ponto para acertar. {pontos.length} {pontos.length === 1 ? 'ponto' : 'pontos'}
        {pontos.length >= 3 ? ` · ${formatarNumero(ha, 2)} ha · perímetro ${formatarNumero(perimetroM(pontos), 0)} m` : ''}
      </Text>
      <MapaPastos
        ref={mapa}
        aoPronto={() => setPronto(true)}
        aoMudarPontos={(p) => {
          setPontos(p);
          // começou a desenhar: a lista de lugares sai da frente
          if (p.length) setLugares([]);
        }}
        aoAviso={(t) => {
          setBuscando(false);
          setAviso(t);
        }}
        aoLugares={aoLugares}
      />
      <View style={estilos.linha}>
        <Pressable onPress={() => mapa.current?.desfazer()} style={estilos.icone} accessibilityLabel="Desfazer">
          <Ionicons name="arrow-undo" size={22} color={cores.primaria} />
        </Pressable>
        <Pressable onPress={() => mapa.current?.limpar()} style={estilos.icone} accessibilityLabel="Limpar">
          <Ionicons name="trash-outline" size={22} color={cores.primaria} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Botao titulo="Salvar desenho" onPress={salvar} carregando={salvando} />
        </View>
      </View>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  busca: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1.5, borderColor: cores.borda, paddingHorizontal: 10, minHeight: 46 },
  buscaTexto: { flex: 1, fontSize: tam.texto, color: cores.texto, minHeight: 44 },
  ir: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.primaria },
  lugares: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, paddingHorizontal: 10, paddingVertical: 6 },
  lugar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  lugarTexto: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto },
  fechar: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave, textAlign: 'right', paddingVertical: 4 },
  icone: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1.5, borderColor: cores.borda, paddingHorizontal: 12, minHeight: 46, justifyContent: 'center' },
});
