import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import CampoData from '../../componentes/CampoData';
import Campo from '../../componentes/Campo';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import { lerCoordenadas } from '../../lib/coordenadas';
import MapaPastos, { type MapaRef } from '../../componentes/MapaPastos';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { codigoLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import {
  COR_STATUS,
  ROTULO_STATUS,
  areaM2,
  carregarPastos,
  doGeoJson,
  ordemPadrao,
  paraGeoJson,
  perimetroM,
  type Pasto,
  type Ponto,
  type StatusPasto,
} from '../../lib/pastos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Visao = 'mapa' | 'painel';
type Coluna = 'status' | 'nome' | 'area' | 'destinacao' | 'lote' | 'ocupado' | 'descanso' | 'carga';

/** Visão do Pasto: mapa das mangas coloridas pela ocupação e painel de ocupação com manejo por toque. */
export default function VisaoPasto() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const mapa = useRef<MapaRef>(null);

  const [visao, setVisao] = useState<Visao>('mapa');
  const [pastos, setPastos] = useState<Pasto[] | null>(null);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [ajustou, setAjustou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<Pasto | null>(null);
  const [busca, setBusca] = useState('');

  // desenho
  const [desenhando, setDesenhando] = useState(false);
  const [mangaDesenho, setMangaDesenho] = useState<string | null>(null);
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [salvandoDesenho, setSalvandoDesenho] = useState(false);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: 'Visão do Pasto' });
  }, [navegacao]);

  const carregar = useCallback(async () => {
    if (!fid) return;
    try {
      setPastos(await carregarPastos(fid, hojeBanco()));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const rotuloLote = (l: { numero: number; descricao: string | null }) => `${codigoLote(l.numero, sigla)}${l.descricao ? ` ${l.descricao}` : ''}`;

  // Manda os pastos para o mapa sempre que mudarem.
  useEffect(() => {
    if (!mapaPronto || !pastos) return;
    const lista = pastos
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        cor: COR_STATUS[p.status],
        pontos: doGeoJson(p.geometria),
        rotulo:
          p.status === 'ocupado'
            ? `${p.nome}<br>${formatarNumero(p.cabecas)} cab · ${p.diasOcupado ?? '?'} d`
            : p.status === 'descanso'
              ? `${p.nome}<br>descanso ${p.diasDescanso ?? '–'} d`
              : `${p.nome}<br>vedado`,
      }))
      .filter((p) => p.pontos.length >= 3);
    mapa.current?.mostrarPastos(lista, !ajustou);
    if (!ajustou && lista.length) setAjustou(true);
  }, [mapaPronto, pastos, ajustou]);

  // Sem nenhum pasto desenhado: centraliza onde o celular está.
  useEffect(() => {
    if (!mapaPronto || !pastos || pastos.some((p) => doGeoJson(p.geometria).length >= 3)) return;
    minhaPosicao(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaPronto, pastos === null]);

  async function minhaPosicao(silencioso = false) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!silencioso) setAviso('Sem permissão de localização. Busque pela cidade.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapa.current?.irPara(pos.coords.latitude, pos.coords.longitude, 16);
    } catch {
      if (!silencioso) setAviso('Não foi possível pegar a localização.');
    }
  }

  // ---- desenho ----
  function comecarDesenho(areaId?: string) {
    setAviso(null);
    setVisao('mapa');
    setEscolhido(null);
    setDesenhando(true);
    setMangaDesenho(areaId ?? null);
    const p = areaId ? doGeoJson(pastos?.find((x) => x.id === areaId)?.geometria) : [];
    setPontos(p);
    // espera o mapa aparecer
    setTimeout(() => mapa.current?.desenhar(true, p), 50);
  }
  function escolherMangaDesenho(id: string | null) {
    setMangaDesenho(id);
    const p = id ? doGeoJson(pastos?.find((x) => x.id === id)?.geometria) : [];
    if (p.length) {
      setPontos(p);
      mapa.current?.desenhar(true, p);
    }
  }
  function sairDesenho() {
    setDesenhando(false);
    setPontos([]);
    mapa.current?.desenhar(false);
  }

  const areaHa = areaM2(pontos) / 10000;

  async function salvarDesenho() {
    if (!mangaDesenho) return setAviso('Escolha a manga (ou digite o nome de uma nova).');
    if (pontos.length < 3) return setAviso('Toque pelo menos 3 pontos em volta da cerca.');
    const atual = pastos?.find((p) => p.id === mangaDesenho);
    const gravar = async () => {
      setSalvandoDesenho(true);
      const { error } = await supabase
        .from('areas')
        .update({ geometria: paraGeoJson(pontos), area_ha: Math.round(areaHa * 10000) / 10000, perimetro_m: Math.round(perimetroM(pontos)) })
        .eq('id', mangaDesenho);
      setSalvandoDesenho(false);
      if (error) return setErro(traduzirErro(error));
      setAviso(`${atual?.nome ?? 'Manga'} desenhada: ${formatarNumero(areaHa, 2)} ha.`);
      sairDesenho();
      carregar();
    };
    if (atual?.area_ha && Math.abs(atual.area_ha - areaHa) / atual.area_ha > 0.05) {
      Alert.alert('Área diferente', `A área cadastrada é ${formatarNumero(atual.area_ha, 2)} ha e a desenhada deu ${formatarNumero(areaHa, 2)} ha. Gravar a desenhada?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Gravar a desenhada', onPress: gravar },
      ]);
    } else gravar();
  }

  const buscarMangas = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      let q = supabase.from('areas').select('id, nome, area_ha, geometria').eq('fazenda_id', fid!).eq('tipo', 'manga').eq('ativa', true).order('nome');
      if (t) q = q.ilike('nome', `%${t}%`);
      const d = await consulta<any[]>(q);
      return d.map((a) => ({ id: a.id, titulo: a.nome, detalhe: `${a.area_ha != null ? `${formatarNumero(Number(a.area_ha), 2)} ha` : 'sem área'} · ${a.geometria ? 'já desenhada (redesenhar)' : 'ainda sem desenho'}` }));
    },
    [fid],
  );
  const lerManga = useCallback(async (id: string) => (await supabase.from('areas').select('nome').eq('id', id).maybeSingle()).data?.nome ?? null, []);
  const criarManga = useCallback(
    async (nome: string): Promise<ItemRapido> => {
      const d = await consulta<any>(supabase.from('areas').insert({ fazenda_id: fid, tipo: 'manga', nome: nome.trim(), ativa: true }).select('id, nome').single());
      carregar();
      return { id: d.id, titulo: d.nome, detalhe: 'Manga nova' };
    },
    [fid, carregar],
  );

  const contagem = useMemo(() => {
    const c: Record<StatusPasto, number> = { ocupado: 0, descanso: 0, vedado: 0 };
    (pastos ?? []).forEach((p) => c[p.status]++);
    return c;
  }, [pastos]);
  const semDesenho = (pastos ?? []).filter((p) => doGeoJson(p.geometria).length < 3).length;

  return (
    <Tela rolar={false}>
      {!desenhando && (
        <Escolha
          opcoes={[
            { valor: 'mapa', rotulo: 'Mapa' },
            { valor: 'painel', rotulo: 'Painel de ocupação' },
          ]}
          valor={[visao]}
          aoMudar={(v) => setVisao(v[0] as Visao)}
        />
      )}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && (
        <Pressable onPress={() => setAviso(null)}>
          <Aviso tipo="info" texto={aviso} />
        </Pressable>
      )}

      {!desenhando && (
        <View style={estilos.legenda}>
          {(['ocupado', 'descanso', 'vedado'] as StatusPasto[]).map((s) => (
            <View key={s} style={estilos.legItem}>
              <View style={[estilos.bola, { backgroundColor: COR_STATUS[s] }]} />
              <Text style={estilos.legTexto}>
                {ROTULO_STATUS[s]} {contagem[s]}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ---------- MAPA (fica montado; só se esconde no painel) ---------- */}
      <View style={[{ flex: 1, gap: 10 }, visao !== 'mapa' && { display: 'none' }]}>
        {desenhando ? (
          <View style={estilos.caixaDesenho}>
            <CampoBuscaRapida
              rotulo="Manga a desenhar"
              valorId={mangaDesenho}
              aoMudar={escolherMangaDesenho}
              buscar={buscarMangas}
              lerNome={lerManga}
              criar={criarManga}
              rotuloNovo="nova manga"
              icone="map"
              placeholder="Nome da manga"
            />
            <Text style={estilos.nota}>
              Toque no mapa em volta da cerca, ponto a ponto. Arraste um ponto para acertar. {pontos.length} {pontos.length === 1 ? 'ponto' : 'pontos'}
              {pontos.length >= 3 ? ` · ${formatarNumero(areaHa, 2)} ha · perímetro ${formatarNumero(perimetroM(pontos), 0)} m` : ''}
            </Text>
            <View style={estilos.linha}>
              <BotaoIcone icone="arrow-undo" titulo="Desfazer" onPress={() => mapa.current?.desfazer()} />
              <BotaoIcone icone="trash-outline" titulo="Limpar" onPress={() => mapa.current?.limpar()} />
              <BotaoIcone icone="locate" titulo="Onde estou" onPress={() => minhaPosicao()} />
            </View>
            <View style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Botao titulo="Cancelar" tipo="secundario" onPress={sairDesenho} />
              </View>
              <View style={{ flex: 1 }}>
                <Botao titulo="Salvar desenho" onPress={salvarDesenho} carregando={salvandoDesenho} />
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={estilos.linha}>
              <View style={estilos.busca}>
                <Ionicons name="search" size={18} color={cores.textoSuave} />
                <TextInput
                  value={busca}
                  onChangeText={setBusca}
                  placeholder="Cidade ou lugar"
                  placeholderTextColor={cores.textoSuave}
                  style={estilos.buscaTexto}
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    const c = lerCoordenadas(busca);
                    if (c) mapa.current?.irPara(c.lat, c.lng, 17, true);
                    else if (busca.trim()) mapa.current?.buscar(busca.trim(), { municipio: fazendaAtiva?.municipio, uf: fazendaAtiva?.uf });
                  }}
                />
              </View>
              <BotaoIcone icone="locate" onPress={() => minhaPosicao()} />
              <BotaoIcone icone="create-outline" titulo="Desenhar" onPress={() => comecarDesenho()} />
            </View>
            {pastos && semDesenho > 0 && (
              <Text style={estilos.nota}>
                {semDesenho} {semDesenho === 1 ? 'manga ainda não está desenhada' : 'mangas ainda não estão desenhadas'} no mapa. Toque em "Desenhar".
              </Text>
            )}
          </>
        )}
        <MapaPastos
          ref={mapa}
          aoPronto={() => setMapaPronto(true)}
          aoMudarPontos={setPontos}
          aoAviso={setAviso}
          aoTocarPasto={(id) => setEscolhido(pastos?.find((p) => p.id === id) ?? null)}
        />
      </View>

      {/* ---------- PAINEL ---------- */}
      {visao === 'painel' &&
        (!pastos ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 24 }} />
        ) : pastos.length === 0 ? (
          <Text style={estilos.nota}>Nenhuma manga cadastrada. Cadastre em Pecuário › Mangas ou desenhe no mapa.</Text>
        ) : (
          <TabelaPastos
            pastos={pastos}
            rotuloLote={rotuloLote}
            aoTocar={setEscolhido}
            aoSegurar={(p) => navegacao.navigate('AreaForm', { tipo: 'manga', id: p.id })}
          />
        ))}

      <AcoesPasto
        pasto={escolhido}
        pastos={pastos ?? []}
        rotuloLote={rotuloLote}
        aoFechar={() => setEscolhido(null)}
        aoMudou={(texto) => {
          setEscolhido(null);
          setAviso(texto);
          carregar();
        }}
        aoDesenhar={(id) => comecarDesenho(id)}
        aoVerMapa={(id) => {
          setEscolhido(null);
          setVisao('mapa');
          setTimeout(() => mapa.current?.focarPasto(id), 50);
        }}
      />
    </Tela>
  );
}

function BotaoIcone({ icone, titulo, onPress }: { icone: any; titulo?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [estilos.botaoIcone, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={titulo}>
      <Ionicons name={icone} size={22} color={cores.primaria} />
      {titulo ? <Text style={estilos.botaoIconeTexto}>{titulo}</Text> : null}
    </Pressable>
  );
}

// ======================================================================
// Painel de ocupação: tabela ordenável por qualquer coluna.
const COLUNAS: { chave: Coluna; titulo: string; largura: number }[] = [
  { chave: 'status', titulo: 'Status', largura: 64 },
  { chave: 'nome', titulo: 'Pasto', largura: 150 },
  { chave: 'area', titulo: 'Área (ha)', largura: 84 },
  { chave: 'destinacao', titulo: 'Destinação', largura: 150 },
  { chave: 'lote', titulo: 'Lote atual', largura: 150 },
  { chave: 'ocupado', titulo: 'Dias ocupado', largura: 96 },
  { chave: 'descanso', titulo: 'Dias descanso', largura: 104 },
  { chave: 'carga', titulo: 'UA/ha', largura: 84 },
];

function TabelaPastos({ pastos, rotuloLote, aoTocar, aoSegurar }: { pastos: Pasto[]; rotuloLote: (l: any) => string; aoTocar: (p: Pasto) => void; aoSegurar: (p: Pasto) => void }) {
  const [ordem, setOrdem] = useState<{ col: Coluna | null; asc: boolean }>({ col: null, asc: false });

  const linhas = useMemo(() => {
    const l = [...pastos];
    if (!ordem.col) return l.sort(ordemPadrao);
    const v = (p: Pasto): number | string => {
      switch (ordem.col) {
        case 'status': return p.status;
        case 'nome': return p.nome.toLowerCase();
        case 'area': return p.area_ha ?? -1;
        case 'destinacao': return destinacao(p);
        case 'lote': return p.lotes[0]?.numero ?? 99999;
        case 'ocupado': return p.diasOcupado ?? -1;
        case 'descanso': return p.diasDescanso ?? -1;
        case 'carga': return p.uaHa ?? -1;
        default: return 0;
      }
    };
    return l.sort((a, b) => {
      const x = v(a), y = v(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return ordem.asc ? r : -r;
    });
  }, [pastos, ordem]);

  function tocarColuna(c: Coluna) {
    setOrdem((o) => (o.col === c ? { col: c, asc: !o.asc } : { col: c, asc: c === 'nome' || c === 'destinacao' || c === 'lote' }));
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }}>
      <Text style={estilos.nota}>
        Toque no título para ordenar{ordem.col ? '' : ' (agora: prontos para uso primeiro)'}. Toque na linha para manejar; segure para editar a manga.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={estilos.tabela}>
          <View style={[estilos.tr, estilos.cab]}>
            {COLUNAS.map((c) => (
              <Pressable key={c.chave} onPress={() => tocarColuna(c.chave)} style={[estilos.th, { width: c.largura }]}>
                <Text style={estilos.thTexto}>
                  {c.titulo}
                  {ordem.col === c.chave ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </Text>
              </Pressable>
            ))}
          </View>
          {linhas.map((p) => {
            const alerta = p.status === 'ocupado' && p.diasOcupado != null && p.diasOcupado > p.ocupacao_max;
            const pronto = p.status === 'descanso' && p.descanso_meta != null && (p.diasDescanso ?? 0) >= p.descanso_meta;
            return (
              <Pressable key={p.id} onPress={() => aoTocar(p)} onLongPress={() => aoSegurar(p)} style={({ pressed }) => [estilos.tr, pressed && { backgroundColor: '#F3F6F2' }]}>
                <View style={[estilos.td, { width: 64, alignItems: 'center' }]}>
                  <View style={[estilos.quadrado, { backgroundColor: COR_STATUS[p.status] }]} />
                </View>
                <Text style={[estilos.td, estilos.tdNome, { width: 150 }]}>{p.nome}</Text>
                <Text style={[estilos.td, estilos.num, { width: 84 }]}>{p.area_ha != null ? formatarNumero(p.area_ha, 2) : '–'}</Text>
                <Text style={[estilos.td, { width: 150 }]}>{destinacao(p)}</Text>
                <Text style={[estilos.td, { width: 150 }]}>{p.lotes.length ? p.lotes.map(rotuloLote).join(', ') : 'Vazio'}</Text>
                <Text style={[estilos.td, estilos.num, { width: 96 }, alerta && estilos.alerta]}>
                  {p.diasOcupado != null ? `${p.diasOcupado} dias${alerta ? ' ⚠️' : ''}` : '–'}
                </Text>
                <Text style={[estilos.td, estilos.num, { width: 104 }, pronto && estilos.pronto]}>{p.diasDescanso != null ? `${p.diasDescanso} dias` : '–'}</Text>
                <Text style={[estilos.td, estilos.num, { width: 84 }]}>
                  {p.status === 'vedado' ? 'Vedado' : p.status === 'descanso' ? '0,0' : p.uaHa != null ? formatarNumero(p.uaHa, 1) : p.area_ha ? 'sem peso' : 'sem área'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <Text style={estilos.nota}>
        ⚠️ em vermelho: passou do limite de dias no mesmo pasto (padrão 10). Descanso em verde: já cumpriu os dias de descanso da manga. 1 UA = 450 kg.
      </Text>
    </ScrollView>
  );
}

function destinacao(p: Pasto): string {
  if (p.destinacao === 'agricultura') return 'Transição agricultura';
  return `Pecuária${p.capim ? ` (${p.capim})` : ''}`;
}

// ======================================================================
// Janela de ações: clicou, resolveu.
function AcoesPasto({
  pasto,
  pastos,
  rotuloLote,
  aoFechar,
  aoMudou,
  aoDesenhar,
  aoVerMapa,
}: {
  pasto: Pasto | null;
  pastos: Pasto[];
  rotuloLote: (l: any) => string;
  aoFechar: () => void;
  aoMudou: (aviso: string) => void;
  aoDesenhar: (id: string) => void;
  aoVerMapa: (id: string) => void;
}) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [etapa, setEtapa] = useState<'inicio' | 'entrar' | 'mudar' | 'limites'>('inicio');
  const [loteId, setLoteId] = useState<string | null>(null);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [data, setData] = useState(hojeBR());
  const [lotesFora, setLotesFora] = useState<any[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [maxOcup, setMaxOcup] = useState('');
  const [metaDescanso, setMetaDescanso] = useState('');

  useEffect(() => {
    setEtapa('inicio');
    setLoteId(pasto?.lotes.length === 1 ? pasto.lotes[0].id : null);
    setDestinoId(null);
    setData(hojeBR());
    setErro(null);
    setLotesFora(null);
    setMaxOcup(pasto ? String(pasto.ocupacao_max) : '');
    setMetaDescanso(pasto?.descanso_meta != null ? String(pasto.descanso_meta) : '');
  }, [pasto?.id]);

  // Entrar: lotes ativos que não estão neste pasto (em outro pasto ou sem manga).
  useEffect(() => {
    if (etapa !== 'entrar' || !fid || !pasto) return;
    (async () => {
      try {
        const l = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, manga_id').eq('fazenda_id', fid).eq('situacao', 'ativo').order('numero'));
        const outros = l.filter((x) => x.manga_id !== pasto.id);
        const cont = outros.length
          ? await consulta<any[]>(supabase.from('animais').select('lote_id').eq('situacao', 'ativo').in('lote_id', outros.map((x) => x.id)))
          : [];
        const n: Record<string, number> = {};
        cont.forEach((a) => (n[a.lote_id] = (n[a.lote_id] ?? 0) + 1));
        setLotesFora(outros.map((x) => ({ ...x, cabecas: n[x.id] ?? 0, pasto: pastos.find((p) => p.id === x.manga_id)?.nome ?? null })).filter((x) => x.cabecas > 0));
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
  }, [etapa, fid, pasto, pastos]);

  if (!pasto) return null;

  const destinos = pastos
    .filter((p) => p.id !== pasto.id && p.status === 'descanso')
    .sort((a, b) => (b.diasDescanso ?? -1) - (a.diasDescanso ?? -1));

  async function mover(lote: string, manga: string, texto: string) {
    setErro(null);
    if (!dataValida(data)) return setErro('Data inválida.');
    if (paraBanco(data)! > hojeBanco()) return setErro('A data não pode ser futura.');
    setSalvando(true);
    const { error } = await supabase.rpc('lancar_movimentacao', {
      p: { tipo: 'transferencia_manga', fazenda: fid, data: paraBanco(data), lote_origem: lote, manga_destino: manga, quantidade: 0, animais: [] },
    });
    if (!error) {
      // o pasto que recebe gado deixa de estar vedado
      const alvo = pastos.find((p) => p.id === manga);
      if (alvo?.vedada_desde) await supabase.from('areas').update({ vedada_desde: null }).eq('id', manga);
    }
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    aoMudou(texto);
  }

  async function atualizar(campos: Record<string, any>, texto: string) {
    setSalvando(true);
    const { error } = await supabase.from('areas').update(campos).eq('id', pasto!.id);
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    aoMudou(texto);
  }

  const loteSel = pasto.lotes.find((l) => l.id === loteId);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={aoFechar}>
      <Pressable style={estilos.fundoModal} onPress={aoFechar} />
      <View style={estilos.folha}>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          <View style={estilos.folhaTopo}>
            <View style={[estilos.quadrado, { backgroundColor: COR_STATUS[pasto.status] }]} />
            <Text style={estilos.folhaTitulo}>{pasto.nome}</Text>
            <Pressable onPress={aoFechar} hitSlop={10} accessibilityLabel="Fechar">
              <Ionicons name="close" size={26} color={cores.textoSuave} />
            </Pressable>
          </View>
          <Text style={estilos.folhaSub}>
            {ROTULO_STATUS[pasto.status]} · {pasto.area_ha != null ? `${formatarNumero(pasto.area_ha, 2)} ha` : 'área não informada'} · {destinacao(pasto)}
          </Text>
          {erro && <Aviso tipo="erro" texto={erro} />}

          {/* ---- situação ---- */}
          {pasto.status === 'ocupado' &&
            pasto.lotes.map((l) => (
              <View key={l.id} style={estilos.info}>
                <Text style={estilos.infoTitulo}>{rotuloLote(l)}</Text>
                <Text style={estilos.infoTexto}>
                  {l.cabecas} cabeças{l.pesoMedio != null ? ` · ${formatarNumero(l.pesoMedio, 0)} kg médio` : ' · sem peso médio'}
                  {l.entrada ? ` · aqui há ${Math.max(0, Math.round((Date.parse(hojeBanco()) - Date.parse(l.entrada)) / 86400000))} dias (desde ${doBanco(l.entrada)})` : ''}
                </Text>
              </View>
            ))}
          {pasto.status === 'ocupado' && (
            <Text style={[estilos.infoTexto, pasto.diasOcupado != null && pasto.diasOcupado > pasto.ocupacao_max && estilos.alerta]}>
              Carga: {pasto.uaHa != null ? `${formatarNumero(pasto.uaHa, 2)} UA/ha` : pasto.area_ha ? 'informe o peso médio do lote' : 'informe a área da manga'}
              {pasto.diasOcupado != null && pasto.diasOcupado > pasto.ocupacao_max ? ` · ⚠️ passou de ${pasto.ocupacao_max} dias` : ''}
            </Text>
          )}
          {pasto.status === 'descanso' && (
            <Text style={estilos.infoTexto}>
              {pasto.diasDescanso != null ? `Em descanso há ${pasto.diasDescanso} dias (gado saiu em ${doBanco(pasto.ultimaSaida)}).` : 'Sem registro de saída de gado.'}
              {pasto.descanso_meta != null ? ` Meta de descanso: ${pasto.descanso_meta} dias.` : ''}
            </Text>
          )}
          {pasto.status === 'vedado' && (
            <Text style={estilos.infoTexto}>
              {pasto.destinacao === 'agricultura' ? 'Área em transição para agricultura.' : `Vedado desde ${doBanco(pasto.vedada_desde)} para acumular capim para a seca.`}
            </Text>
          )}

          {/* ---- ações ---- */}
          {etapa === 'inicio' && (
            <>
              {pasto.status === 'ocupado' ? (
                <Botao titulo="➡️  Mudar lote de pasto (rotacionar)" onPress={() => setEtapa('mudar')} />
              ) : pasto.destinacao !== 'agricultura' ? (
                <Botao titulo="🐂  Entrar com lote de animais" onPress={() => setEtapa('entrar')} />
              ) : null}
              {pasto.status === 'descanso' && <Botao titulo="Vedar este pasto (diferir para a seca)" tipo="secundario" onPress={() => atualizar({ vedada_desde: hojeBanco() }, `${pasto.nome} vedado.`)} carregando={salvando} />}
              {pasto.status === 'vedado' && pasto.vedada_desde && <Botao titulo="Liberar a vedação" tipo="secundario" onPress={() => atualizar({ vedada_desde: null }, `${pasto.nome} liberado.`)} carregando={salvando} />}
              <Escolha
                rotulo="Destinação"
                opcoes={[
                  { valor: 'pecuaria', rotulo: 'Pecuária' },
                  { valor: 'agricultura', rotulo: 'Transição agricultura' },
                ]}
                valor={[pasto.destinacao]}
                aoMudar={(v) => {
                  if (v[0] === pasto.destinacao) return;
                  if (v[0] === 'agricultura' && pasto.status === 'ocupado') return setErro('Tire o gado antes de passar a área para agricultura.');
                  atualizar({ destinacao: v[0] }, `${pasto.nome}: ${v[0] === 'agricultura' ? 'transição para agricultura' : 'pecuária'}.`);
                }}
              />
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Botao titulo={pasto.geometria ? 'Ver no mapa' : 'Desenhar no mapa'} tipo="secundario" onPress={() => (pasto.geometria ? aoVerMapa(pasto.id) : aoDesenhar(pasto.id))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Ficha da manga" tipo="secundario" onPress={() => { aoFechar(); navegacao.navigate('MangaDetalhe', { id: pasto.id }); }} />
                </View>
              </View>
              <View style={estilos.linha}>
                {pasto.geometria ? (
                  <View style={{ flex: 1 }}>
                    <Botao titulo="Redesenhar" tipo="texto" onPress={() => aoDesenhar(pasto.id)} />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Botao titulo="Limites de dias" tipo="texto" onPress={() => setEtapa('limites')} />
                </View>
              </View>
            </>
          )}

          {etapa === 'entrar' && (
            <>
              <Text style={estilos.infoTitulo}>Qual lote entra em {pasto.nome}?</Text>
              {!lotesFora ? (
                <ActivityIndicator color={cores.primaria} />
              ) : lotesFora.length === 0 ? (
                <Text style={estilos.infoTexto}>Nenhum outro lote com animais.</Text>
              ) : (
                lotesFora.map((l) => (
                  <Opcao key={l.id} marcada={loteId === l.id} onPress={() => setLoteId(l.id)} titulo={rotuloLote(l)} detalhe={`${formatarNumero(l.cabecas)} cab · ${l.pasto ? `hoje em ${l.pasto}` : 'sem pasto (curral)'}`} />
                ))
              )}
              <CampoData rotulo="Data da entrada" valor={data} aoMudar={setData} />
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Voltar" tipo="secundario" onPress={() => setEtapa('inicio')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao
                    titulo="Confirmar"
                    desabilitado={!loteId}
                    carregando={salvando}
                    onPress={() => {
                      const l = lotesFora?.find((x) => x.id === loteId);
                      if (l) mover(l.id, pasto.id, `${rotuloLote(l)} entrou em ${pasto.nome}.`);
                    }}
                  />
                </View>
              </View>
            </>
          )}

          {etapa === 'mudar' && (
            <>
              {pasto.lotes.length > 1 && (
                <>
                  <Text style={estilos.infoTitulo}>Qual lote sai?</Text>
                  {pasto.lotes.map((l) => (
                    <Opcao key={l.id} marcada={loteId === l.id} onPress={() => setLoteId(l.id)} titulo={rotuloLote(l)} detalhe={`${formatarNumero(l.cabecas)} cab`} />
                  ))}
                </>
              )}
              <Text style={estilos.infoTitulo}>Para qual pasto? (mais descansados primeiro)</Text>
              {destinos.length === 0 ? (
                <Text style={estilos.infoTexto}>Nenhum pasto vazio em descanso. Libere um vedado ou tire outro lote antes.</Text>
              ) : (
                destinos.map((d) => (
                  <Opcao
                    key={d.id}
                    marcada={destinoId === d.id}
                    onPress={() => setDestinoId(d.id)}
                    titulo={d.nome}
                    detalhe={`${d.diasDescanso != null ? `${d.diasDescanso} dias de descanso` : 'sem registro de uso'}${d.area_ha != null ? ` · ${formatarNumero(d.area_ha, 2)} ha` : ''}${d.capim ? ` · ${d.capim}` : ''}${loteSel?.pesoMedio && d.area_ha ? ` · ficaria ${formatarNumero((loteSel.cabecas * loteSel.pesoMedio) / 450 / d.area_ha, 2)} UA/ha` : ''}`}
                  />
                ))
              )}
              <CampoData rotulo="Data da mudança" valor={data} aoMudar={setData} />
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Voltar" tipo="secundario" onPress={() => setEtapa('inicio')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao
                    titulo="Confirmar"
                    desabilitado={!loteId || !destinoId}
                    carregando={salvando}
                    onPress={() => {
                      const d = destinos.find((x) => x.id === destinoId);
                      if (loteSel && d) mover(loteSel.id, d.id, `${rotuloLote(loteSel)} passou de ${pasto.nome} para ${d.nome}.`);
                    }}
                  />
                </View>
              </View>
            </>
          )}

          {etapa === 'limites' && (
            <>
              <Campo rotulo="Máximo de dias ocupado (alerta)" value={maxOcup} onChangeText={(t) => setMaxOcup(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
              <Campo rotulo="Dias de descanso (meta)" value={metaDescanso} onChangeText={(t) => setMetaDescanso(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Voltar" tipo="secundario" onPress={() => setEtapa('inicio')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao
                    titulo="Salvar"
                    carregando={salvando}
                    onPress={() => {
                      const m = Number(maxOcup);
                      if (!m || m < 1) return setErro('Informe o máximo de dias (1 ou mais).');
                      atualizar({ ocupacao_max_dias: m, descanso_dias: metaDescanso ? Number(metaDescanso) : null }, `Limites de ${pasto.nome} salvos.`);
                    }}
                  />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Opcao({ titulo, detalhe, marcada, onPress }: { titulo: string; detalhe?: string; marcada: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[estilos.opcao, marcada && estilos.opcaoMarcada]} accessibilityRole="radio" accessibilityState={{ checked: marcada }}>
      <Ionicons name={marcada ? 'radio-button-on' : 'radio-button-off'} size={22} color={marcada ? cores.primaria : cores.textoSuave} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.infoTitulo}>{titulo}</Text>
        {detalhe ? <Text style={estilos.infoTexto}>{detalhe}</Text> : null}
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  legenda: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legTexto: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  bola: { width: 14, height: 14, borderRadius: 7 },
  busca: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1.5, borderColor: cores.borda, paddingHorizontal: 10, minHeight: 46 },
  buscaTexto: { flex: 1, fontSize: tam.texto, color: cores.texto, minHeight: 44 },
  botaoIcone: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1.5, borderColor: cores.borda, paddingHorizontal: 10, minHeight: 46 },
  botaoIconeTexto: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primaria },
  caixaDesenho: { gap: 8 },
  tabela: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: cores.borda, minHeight: 50 },
  cab: { backgroundColor: cores.fundo },
  th: { paddingHorizontal: 8, paddingVertical: 10 },
  thTexto: { fontSize: tam.pequeno, fontWeight: '800', color: cores.textoSuave },
  td: { paddingHorizontal: 8, paddingVertical: 8, fontSize: tam.pequeno + 1, color: cores.texto },
  tdNome: { fontWeight: '700' },
  num: { textAlign: 'right' },
  alerta: { color: cores.erro, fontWeight: '800' },
  pronto: { color: '#2E7D32', fontWeight: '800' },
  quadrado: { width: 18, height: 18, borderRadius: 4 },
  fundoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  folha: { maxHeight: '82%', backgroundColor: cores.fundo, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: tam.espaco },
  folhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  folhaTitulo: { flex: 1, fontSize: tam.subtitulo + 1, fontWeight: '800', color: cores.primariaEscura },
  folhaSub: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  info: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 2 },
  infoTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  infoTexto: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 20 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1.5, borderColor: cores.borda, padding: 10 },
  opcaoMarcada: { borderColor: cores.primaria },
});
