import React, { useCallback, useState } from 'react';
import { ActionSheetIOS, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Alert } from '../lib/alerta';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { escolherImagem } from '../lib/fotos';
import * as DocumentPicker from 'expo-document-picker';
import Tela from '../componentes/Tela';
import LogoApp from '../componentes/LogoApp';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import BotaoAtalho from '../componentes/BotaoAtalho';
import { confirmarSaida } from '../componentes/Cabecalho';
import { useSessao } from '../contexto/SessaoContext';
import { traduzirErro } from '../lib/supabase';
import { eDono } from '../lib/acessos';
import { hojeExtenso } from '../lib/datas';
import { chaveAgenda, type AgendaRef } from '../lib/agenda';
import { LOGO_TAMANHO_MAXIMO, gravarLogo, lerLogos, lerUrgentes, tempoDaFazenda, type Logos, type TempoFazenda } from '../lib/painel';
import type { NomeIcone } from '../componentes/ItemMenu';
import type { NavPilha } from '../navegacao/rotas';
import { cores, tam } from '../tema';

type Alvo = { produtorId: string } | { fazendaId: string };

/**
 * Página de rosto (V134): logo do aplicativo, nome do Grupo e logo do proprietário; depois a faixa SISTEMAS
 * (Produtor, Administrador, Escritório e cada fazenda, com o tempo de hoje em letras miúdas), a faixa AGENDAS
 * (uma caixinha por agenda; fazenda nova aparece sozinha). V136: as anotações aparecem só ao tocar na caixinha da agenda.
 */
export default function Capa() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendas, trocarFazenda, agendas, sair, entrarAdm, sairDaUnidade } = useSessao();
  const [avisos, setAvisos] = useState<Record<string, number>>({});
  const [logos, setLogos] = useState<Logos | null>(null);
  const [tempos, setTempos] = useState<Record<string, TempoFazenda | null>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const dono = fazendas.some((f) => eDono(f.perfil));
  // V154: o Administrativo só tem Financeiro e Mais; o Escritório sem acesso ao financeiro não o vê (fica só com a sua fazenda)
  const escritorio = fazendas.some((f) => f.perfil === 'escritorio' && f.financeiro);
  const { width } = useWindowDimensions();
  // caixinhas lado a lado: 2 por linha no celular, 3 no celular deitado/tablet, 4 no PC
  const colunas = width >= 700 ? 4 : width >= 520 ? 3 : 2;
  const conteudo = Math.min(width, 860) - 2 * tam.espaco;
  const largura = Math.floor((conteudo - VAO * (colunas - 1)) / colunas);
  const ids = fazendas.map((f) => f.id).join(',');

  const carregar = useCallback(
    async (forcar = false) => {
      const lista = ids ? ids.split(',') : [];
      if (!lista.length) return;
      lerLogos(lista).then(setLogos).catch(() => setLogos({ produtorId: null, produtor: null, grupo: null, fazendas: {} }));
      lerUrgentes(agendas).then((u) => setAvisos(u.paraHoje)).catch(() => setAvisos({}));
      // o tempo só das fazendas (o Particular não tem local)
      const soFaz = new Set(fazendas.filter((f) => f.tipo === 'fazenda').map((f) => f.id));
      const t = await Promise.all(lista.map((id) => (soFaz.has(id) ? tempoDaFazenda(id, forcar) : Promise.resolve(null))));
      setTempos(Object.fromEntries(lista.map((id, i) => [id, t[i]])));
    },
    [ids, agendas],
  );


  useFocusEffect(
    useCallback(() => {
      // V138: voltou à página de rosto: sai da unidade (nenhuma fica ativa nem marcada)
      sairDaUnidade();
      carregar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [carregar]),
  );

  // V138: na página de rosto nenhuma caixinha fica marcada: ao voltar, sai-se da unidade.
  // V137: cada caixinha é uma unidade que recebe lançamentos: o Administrativo, o Particular ou uma fazenda
  function entrar(fazendaId?: string) {
    if (fazendaId) trocarFazenda(fazendaId);
    else entrarAdm();
    navegacao.navigate('Principal');
  }

  // ---- logo do proprietário e das fazendas: foto, galeria ou arquivo ----
  async function guardar(alvo: Alvo, imagem: string | null) {
    setErro(null);
    if (imagem && imagem.length > LOGO_TAMANHO_MAXIMO) return setErro('Imagem grande demais. Escolha uma menor (uma logo de até 1 MB) ou recorte antes.');
    setGravando(true);
    try {
      await gravarLogo(alvo, imagem);
      await carregar();
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setGravando(false);
  }

  async function daFoto(alvo: Alvo, camera: boolean) {
    try {
      const r = await escolherImagem(camera, { quality: 0.2, allowsEditing: true, aspect: [1, 1], ladoWeb: 600 });
      if ('negado' in r) return setErro(camera ? 'Sem permissão para usar a câmera. Libere nos Ajustes do celular.' : 'Sem permissão para abrir as fotos. Libere nos Ajustes do celular.');
      if (!r.foto) return;
      await guardar(alvo, `data:${r.foto.mimeType};base64,${r.foto.base64}`);
    } catch (e: any) {
      setErro(String(e?.message ?? e));
    }
  }

  async function doArquivo(alvo: Alvo) {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const blob = await (await fetch(r.assets[0].uri)).blob();
      const texto = await new Promise<string>((ok, falha) => {
        const leitor = new FileReader();
        leitor.onload = () => ok(String(leitor.result));
        leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
        leitor.readAsDataURL(blob);
      });
      if (!texto.startsWith('data:image/')) return setErro('Escolha um arquivo de imagem (PNG ou JPG).');
      await guardar(alvo, texto);
    } catch (e: any) {
      setErro(String(e?.message ?? e));
    }
  }

  function trocarLogo(alvo: Alvo, nome: string, temLogo: boolean) {
    const opcoes = ['Tirar foto', 'Escolher da galeria', 'Importar de um arquivo', ...(temLogo ? ['Tirar a logo'] : []), 'Cancelar'];
    const acao = (i: number) => {
      if (i === 0) daFoto(alvo, true);
      else if (i === 1) daFoto(alvo, false);
      else if (i === 2) doArquivo(alvo);
      else if (temLogo && i === 3) guardar(alvo, null);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title: `Logo: ${nome}`, options: opcoes, cancelButtonIndex: opcoes.length - 1, destructiveButtonIndex: temLogo ? 3 : undefined }, acao);
    } else if (Platform.OS === 'web') {
      // Navegador: a caixa de aviso do app aceita todas as opções de uma vez.
      Alert.alert(`Logo: ${nome}`, undefined, opcoes.map((texto, i) => ({
        text: texto,
        style: i === opcoes.length - 1 ? ('cancel' as const) : temLogo && i === 3 ? ('destructive' as const) : ('default' as const),
        onPress: () => acao(i),
      })), { cancelable: true });
    } else {
      // Android: o aviso aceita até 3 botões; arquivo e remoção ficam em "Mais opções".
      Alert.alert(`Logo: ${nome}`, undefined, [
        { text: 'Tirar foto', onPress: () => acao(0) },
        { text: 'Galeria', onPress: () => acao(1) },
        {
          text: 'Mais opções',
          onPress: () =>
            Alert.alert(`Logo: ${nome}`, undefined, [
              { text: 'Importar de um arquivo', onPress: () => acao(2) },
              ...(temLogo ? [{ text: 'Tirar a logo', style: 'destructive' as const, onPress: () => acao(3) }] : []),
              { text: 'Cancelar', style: 'cancel' as const },
            ]),
        },
      ], { cancelable: true });
    }
  }

  const alvoProdutor: Alvo | null = logos?.produtorId ? { produtorId: logos.produtorId } : null;

  return (
    <Tela
      comCabecalho={false}
      atualizando={atualizando}
      aoAtualizar={async () => {
        setAtualizando(true);
        await carregar(true);
        setAtualizando(false);
      }}
    >
      <View style={estilos.topo}>
        <LogoApp />
      </View>

      {/* Nome do grupo (ou do produtor): é a página de rosto do grupo, não de uma fazenda */}
      {logos?.grupo ? (
        <Text style={estilos.grupo} accessibilityRole="header">
          {logos.grupo.toUpperCase()}
        </Text>
      ) : null}

      {erro && <Aviso tipo="erro" texto={erro} />}

      {/* Logo do proprietário */}
      {(logos?.produtor || (dono && alvoProdutor)) && (
        <Pressable
          disabled={!dono || !alvoProdutor || !(editando || !logos?.produtor) || gravando}
          onPress={() => alvoProdutor && trocarLogo(alvoProdutor, 'proprietário', !!logos?.produtor)}
          style={estilos.proprietario}
          accessibilityRole={dono ? 'button' : undefined}
          accessibilityLabel="Logo do proprietário"
        >
          {logos?.produtor ? (
            <Image source={{ uri: logos.produtor }} style={estilos.logoProprietario} resizeMode="contain" />
          ) : (
            <View style={estilos.semLogo}>
              <Ionicons name="image-outline" size={30} color={cores.textoSuave} />
              <Text style={estilos.semLogoTexto}>Toque para colocar a logo do proprietário</Text>
            </View>
          )}
          {editando && logos?.produtor ? <Text style={estilos.trocar}>Toque para trocar</Text> : null}
        </Pressable>
      )}

      <Text style={estilos.data}>{hojeExtenso()}</Text>

      {/* ===== SISTEMAS: tocar abre o sistema; na caixinha da fazenda, já na fazenda escolhida ===== */}
      <Faixa titulo="SISTEMAS" />
      <View style={estilos.grade}>
        {/* V137: só as unidades que recebem lançamentos; o Administrativo e o Particular, só para o Produtor, o Administrador e o Escritório */}
        {(dono || escritorio) && (
          <Caixinha largura={largura} icone="business" nome="Administrativo" aoTocar={() => entrar()} dica="Abrir o sistema no Administrativo (despesas e receitas que não são de nenhuma fazenda)" />
        )}
        {fazendas
          .filter((f) => f.tipo === 'particular')
          .map((f) => (
            <Caixinha key={f.id} largura={largura} icone="wallet" nome={f.nome} aoTocar={() => entrar(f.id)} dica={`Abrir o sistema no ${f.nome} (despesas e receitas dos sócios)`}>
              <Text style={estilos.tempoLinha} numberOfLines={2}>Despesas e receitas dos sócios</Text>
            </Caixinha>
          ))}
        {fazendas.filter((f) => f.tipo === 'fazenda').map((f) => {
          const t = tempos[f.id];
          const logo = logos?.fazendas[f.id];
          return (
            <Caixinha
              key={f.id}
              largura={largura}
              icone="home"
              logo={logo}
              nome={f.nome}
             
              aoTocar={() => (editando ? trocarLogo({ fazendaId: f.id }, f.nome, !!logo) : entrar(f.id))}
              dica={editando ? 'Trocar a logo desta fazenda' : `Abrir o sistema na ${f.nome}`}
            >
              {/* o tempo de hoje, em letras miúdas */}
              {t ? (
                <>
                  <Text style={estilos.tempoLinha} numberOfLines={1}>
                    {t.agora != null ? `Agora ${Math.round(t.agora)}° · ` : ''}Máx. {t.max == null ? '–' : `${Math.round(t.max)}°`} · Mín. {t.min == null ? '–' : `${Math.round(t.min)}°`}
                  </Text>
                  <Text style={[estilos.tempoLinha, t.chuva >= 0.1 && estilos.chuva]} numberOfLines={2}>
                    {t.chuva >= 0.1 ? `Chuva: ${textoChuva(t.chuva)} mm${t.prob != null ? ` (${Math.round(t.prob)}%)` : ''}` : 'Sem chuva prevista'}
                  </Text>
                  {t.ceu ? <Text style={estilos.tempoLinha} numberOfLines={1}>{t.ceu}</Text> : null}
                </>
              ) : (
                <Text style={estilos.tempoLinha} numberOfLines={2}>{t === null ? 'Sem o local da fazenda (Agrícola › Clima e chuva)' : 'Buscando o tempo…'}</Text>
              )}
            </Caixinha>
          );
        })}
      </View>

      {/* ===== AGENDAS: uma caixinha por agenda que a pessoa abre; fazenda nova aparece sozinha ===== */}
      {agendas.some((a) => a.podeAbrir) && (
        <>
          <Faixa titulo="AGENDAS" />
          <View style={estilos.grade}>
            {agendas
              .filter((a) => a.podeAbrir)
              .map((a) => {
                const k = chaveAgenda(a);
                const n = avisos[k] ?? 0;
                const ref: AgendaRef = { agenda: a.agenda, fazendaId: a.fazendaId };
                return (
                  <Caixinha
                    key={k}
                    largura={largura}
                    icone={ICONE_AGENDA[a.agenda] ?? 'calendar'}
                    nome={a.nome}
                    selo={n}
                    aoTocar={() => navegacao.push('Agenda', ref)}
                    dica={`Abrir a agenda ${a.nome}${n ? `, ${n} para hoje ou atrasados` : ''}`}
                  />
                );
              })}
          </View>

        </>
      )}

      <BotaoAtalho />
      {dono && <Botao titulo={editando ? 'Concluir' : 'Trocar as logos (proprietário e fazendas)'} tipo="texto" onPress={() => setEditando(!editando)} carregando={gravando} />}
      {editando && <Text style={estilos.nota}>Toque na logo do proprietário ou numa fazenda para colocar a imagem: tirando uma foto, da galeria ou de um arquivo (PNG ou JPG).</Text>}
      {dono && !editando && <Text style={estilos.nota}>O nome do grupo em destaque é o do cadastro do produtor (Mais › Fazendas › Consultar › toque no Produtor).</Text>}
      <Botao titulo="Sair do sistema" tipo="perigo" onPress={() => confirmarSaida(sair)} />
    </Tela>
  );
}

const VAO = 10; // espaço entre as caixinhas

const ICONE_AGENDA: Record<string, NomeIcone> = { produtor: 'person', admin: 'shield-checkmark', fazenda: 'home', escritorio: 'business' };

const textoChuva = (mm: number) => (mm < 10 ? mm.toFixed(1).replace('.', ',') : String(Math.round(mm)));

/** Faixa verde com o nome da parte da página. */
function Faixa({ titulo }: { titulo: string }) {
  return (
    <View style={estilos.faixa} accessibilityRole="header">
      <Text style={estilos.faixaTexto}>{titulo}</Text>
    </View>
  );
}

/** Caixinha das faixas SISTEMAS e AGENDAS. */
function Caixinha({ largura, icone, logo, nome, selo = 0, destaque, aoTocar, dica, children }: { largura: number; icone: NomeIcone; logo?: string | null; nome: string; selo?: number; destaque?: boolean; aoTocar: () => void; dica?: string; children?: React.ReactNode }) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={nome}
      accessibilityHint={dica}
      style={({ pressed }) => [estilos.caixinha, { width: largura }, destaque && estilos.caixinhaDestaque, pressed && { opacity: 0.75 }]}
    >
      <View style={estilos.circulo}>
        {logo ? <Image source={{ uri: logo }} style={estilos.logoCirculo} resizeMode="contain" /> : <Ionicons name={icone} size={24} color="#FFFFFF" />}
        {selo > 0 && (
          <View style={estilos.selo}>
            <Text style={estilos.seloTexto}>{selo > 99 ? '99+' : selo}</Text>
          </View>
        )}
      </View>
      <Text style={estilos.caixinhaNome} numberOfLines={2}>{nome}</Text>
      {children}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  faixa: { backgroundColor: cores.primaria, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, marginBottom: -4 },
  faixaTexto: { color: '#FFFFFF', fontWeight: '900', fontSize: tam.texto, letterSpacing: 2, textAlign: 'center' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 10 },
  caixinha: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, gap: 4, minHeight: 104 },
  caixinhaDestaque: { borderColor: cores.primaria, borderWidth: 2 },
  circulo: { width: 46, height: 46, borderRadius: 23, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  logoCirculo: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF' },
  selo: { position: 'absolute', top: -4, right: -8, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: cores.erro, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: cores.cartao },
  seloTexto: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  caixinhaNome: { fontSize: tam.pequeno, fontWeight: '800', color: cores.texto, textAlign: 'center' },
  tempoLinha: { fontSize: 11, color: cores.textoSuave, textAlign: 'center', lineHeight: 14 },
  chuva: { color: cores.info, fontWeight: '700' },
  topo: { alignItems: 'center', marginTop: 28, marginBottom: 4 },
  grupo: { fontSize: 30, fontWeight: '900', color: cores.primariaEscura, textAlign: 'center', letterSpacing: 1.5 },
  proprietario: { alignItems: 'center', gap: 4 },
  logoProprietario: { width: 220, height: 110 },
  semLogo: { width: 220, height: 96, borderRadius: tam.raio, borderWidth: 1.5, borderStyle: 'dashed', borderColor: cores.borda, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12 },
  semLogoTexto: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
  trocar: { fontSize: tam.pequeno, color: cores.primaria, fontWeight: '600' },
  data: { fontSize: tam.pequeno + 1, color: cores.textoSuave, textAlign: 'center' },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '700' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center', lineHeight: 20 },
});
