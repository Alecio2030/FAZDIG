import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { REGRA_PULVERIZACAO, alertas, diaSemana, janelasPulverizacao, gravarEscritorio, lerPrevisao, localDoGps, locaisCadastrados, tempo, textoMm, type LocalClima, type Previsao } from '../../lib/clima';
import { cores, tam } from '../../tema';

type Props = { abas: React.ReactNode; local: LocalClima | null | undefined; erroLocal: string | null; aoMudarLocal: (l: LocalClima) => Promise<void> };

const grau = (v: number | null) => (v == null ? '–' : `${Math.round(v)}°`);

/** Previsão do tempo no ponto da fazenda: agora, alertas, janela de pulverização, 7 dias e a chuva dos últimos dias. */
export default function PrevisaoAba({ abas, local, erroLocal, aoMudarLocal }: Props) {
  const { fazendaAtiva, fazendas } = useSessao();
  const souDono = fazendas.some((f) => f.perfil === 'dono' || f.perfil === 'admin');
  // V130: lugares já cadastrados ("Na fazenda X", "No escritório") no lugar do centro do município
  const [locais, setLocais] = useState<LocalClima[]>([]);
  const soFazendas = fazendas.filter((f) => f.tipo !== 'particular');
  const idsFazendas = soFazendas.map((f) => f.id).join(',');
  useEffect(() => {
    locaisCadastrados(soFazendas.map((f) => ({ id: f.id, nome: f.nome }))).then(setLocais).catch(() => setLocais([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsFazendas]);
  const [prev, setPrev] = useState<Previsao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [mudando, setMudando] = useState<string | null>(null);

  const carregar = useCallback(
    async (forcar: boolean) => {
      if (!local) return;
      setErro(null);
      try {
        setPrev(await lerPrevisao(local, forcar));
      } catch (e) {
        setErro(traduzirErro(e));
      }
    },
    [local],
  );

  useEffect(() => {
    setPrev(null);
    carregar(false);
  }, [carregar]);

  async function puxar() {
    setAtualizando(true);
    await carregar(true);
    setAtualizando(false);
  }

  async function usarGps() {
    setErro(null);
    setAviso(null);
    setMudando('gps');
    try {
      await aoMudarLocal(await localDoGps());
      setAviso('Local gravado: a previsão passa a ser a do ponto onde você está agora.');
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setMudando(null);
  }

  async function usarLocal(l: LocalClima) {
    setErro(null);
    setAviso(null);
    setMudando(l.nome);
    try {
      await aoMudarLocal(l);
      setAviso(`Local gravado: ${l.nome}.`);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setMudando(null);
  }

  async function marcarEscritorio() {
    setErro(null);
    setAviso(null);
    setMudando('escritorio');
    try {
      const l = { ...(await localDoGps()), nome: 'No escritório' };
      await gravarEscritorio(l);
      setLocais((ls) => [...ls.filter((x) => x.nome !== 'No escritório'), l]);
      setAviso('Ponto do escritório gravado. Agora "No escritório" aparece na lista dos locais.');
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setMudando(null);
  }

  const atual = local ? local.nome : '';
  const botoesLocal = (
    <>
      {locais.map((l) => (
        <Botao
          key={l.nome}
          titulo={`${l.nome === 'No escritório' ? '🏢' : '🏡'}  ${l.nome}${l.nome === atual ? '  ✓' : ''}`}
          tipo={l.nome === atual ? 'primario' : 'secundario'}
          onPress={() => usarLocal(l)}
          carregando={mudando === l.nome}
          desabilitado={mudando !== null}
        />
      ))}
      <Botao titulo="📍  Onde estou agora (GPS)" tipo="secundario" onPress={usarGps} carregando={mudando === 'gps'} desabilitado={mudando !== null} />
      {souDono && !locais.some((l) => l.nome === 'No escritório') ? (
        <Botao titulo="Estou no escritório: marcar este lugar como o Escritório" tipo="texto" onPress={marcarEscritorio} carregando={mudando === 'escritorio'} desabilitado={mudando !== null} />
      ) : null}
    </>
  );

  if (local === undefined) return <Tela>{abas}<ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} /></Tela>;

  if (local === null)
    return (
      <Tela>
        {abas}
        {(erro || erroLocal) && <Aviso tipo="erro" texto={(erro || erroLocal)!} />}
        <Aviso texto="Para mostrar o tempo, o sistema precisa saber onde fica a fazenda. Estando na fazenda, toque no botão do GPS: o ponto fica gravado e não é pedido de novo." />
        {botoesLocal}
        <Text style={estilos.nota}>Também serve informar o município e a UF em Mais › Fazendas, ou desenhar um talhão ou manga no mapa: o sistema usa o centro.</Text>
      </Tela>
    );

  if (!prev)
    return (
      <Tela>
        {abas}
        {erro ? (
          <>
            <Aviso tipo="erro" texto={erro} />
            <Botao titulo="Tentar de novo" tipo="secundario" onPress={() => carregar(true)} />
            <Secao titulo="Local da previsão" />
            <Text style={estilos.nota}>Agora: {local.nome}</Text>
            {botoesLocal}
          </>
        ) : (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        )}
      </Tela>
    );

  const hoje = prev.dias.find((d) => d.data === prev.hoje) ?? null;
  const frente = prev.dias.filter((d) => d.data >= prev.hoje).slice(0, 7);
  const tras = prev.dias.filter((d) => d.data < prev.hoje);
  const soma = (n: number) => tras.slice(-n).reduce((s, d) => s + d.chuva, 0);
  const prox7 = frente.reduce((s, d) => s + d.chuva, 0);
  const al = alertas(prev);
  const pulv = janelasPulverizacao(prev);
  const t = tempo(prev.agora?.codigo ?? hoje?.codigo);
  const nomeDia = (d: string) => (d === prev.hoje ? 'Hoje' : d === frente[1]?.data ? 'Amanhã' : `${diaSemana(d)} ${d.slice(8, 10)}/${d.slice(5, 7)}`);

  return (
    <Tela atualizando={atualizando} aoAtualizar={puxar}>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.agora}>
        <Ionicons name={t.icone as any} size={54} color={cores.primariaEscura} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.temp}>{prev.agora?.temp != null ? `${Math.round(prev.agora.temp)} °C` : '–'}</Text>
          <Text style={estilos.titulo}>{t.texto}</Text>
          <Text style={estilos.nota}>
            {hoje ? `Máx. ${grau(hoje.max)} · mín. ${grau(hoje.min)} · ` : ''}
            umidade {prev.agora?.umid != null ? `${Math.round(prev.agora.umid)}%` : '–'} · vento {prev.agora?.vento != null ? `${Math.round(prev.agora.vento)} km/h` : '–'}
          </Text>
          {hoje && (
            <Text style={estilos.nota}>
              Chuva hoje: {textoMm(hoje.chuva)} mm{hoje.prob != null ? ` (chance de ${Math.round(hoje.prob)}%)` : ''}
            </Text>
          )}
        </View>
      </View>

      {al.map((a, i) => (
        <Aviso key={i} tipo={a.tipo} texto={a.texto} />
      ))}

      <Secao titulo="Pulverização" />
      <View style={estilos.caixa}>
        {pulv.agora && (
          <Text style={[estilos.titulo, { color: pulv.agora.boa ? cores.primaria : cores.erro }]}>
            {pulv.agora.boa ? 'Agora: condição boa para aplicar' : `Agora: não é recomendado – ${pulv.agora.motivos.join(', ')}`}
          </Text>
        )}
        {pulv.janelas.length === 0 ? (
          <Text style={estilos.nota}>Sem janela boa até o fim de amanhã.</Text>
        ) : (
          pulv.janelas.map((j, i) => (
            <View key={i} style={estilos.linha}>
              <Text style={[estilos.cel, { width: 78 }]}>{nomeDia(j.data)}</Text>
              <Text style={[estilos.cel, { flex: 1, fontWeight: '800', color: cores.primariaEscura }]}>
                das {j.inicio.slice(0, 2)} h às {j.fim.slice(0, 2)} h
              </Text>
            </View>
          ))
        )}
        <Text style={estilos.nota}>Janela boa: {REGRA_PULVERIZACAO}. Vale a bula do produto.</Text>
      </View>

      <Secao titulo="Próximos 7 dias" />
      <View style={estilos.caixa}>
        {frente.map((d) => {
          const td = tempo(d.codigo);
          return (
            <View key={d.data} style={estilos.linha}>
              <Text style={[estilos.cel, { width: 78 }]}>{nomeDia(d.data)}</Text>
              <Ionicons name={td.icone as any} size={22} color={cores.cafe} />
              <View style={{ flex: 1 }}>
                <Text style={[estilos.cel, d.chuva >= 1 ? { color: cores.info, fontWeight: '800' } : null]}>
                  {d.chuva >= 0.1 ? `${textoMm(d.chuva)} mm` : 'sem chuva'}
                  {d.prob != null && d.prob >= 20 ? ` · ${Math.round(d.prob)}%` : ''}
                </Text>
                <Text style={estilos.pequeno}>
                  {td.texto}
                  {d.vento != null ? ` · vento ${Math.round(d.vento)} km/h` : ''}
                </Text>
              </View>
              <Text style={estilos.cel}>
                {grau(d.max)} / {grau(d.min)}
              </Text>
            </View>
          );
        })}
        <View style={[estilos.linha, estilos.total]}>
          <Text style={[estilos.cel, { flex: 1 }]}>Chuva prevista em 7 dias</Text>
          <Text style={[estilos.cel, { fontWeight: '800' }]}>{textoMm(prox7)} mm</Text>
        </View>
      </View>

      <Secao titulo="Chuva dos últimos dias (estimada)" />
      <View style={estilos.cards}>
        {[7, 15, 30].map((n) => (
          <View key={n} style={estilos.card}>
            <Text style={estilos.pequeno}>{n} dias</Text>
            <Text style={estilos.cardValor}>{textoMm(soma(n))} mm</Text>
          </View>
        ))}
      </View>
      <Text style={estilos.nota}>É a chuva calculada pelo modelo para o ponto da fazenda, não a do seu pluviômetro. As leituras do pluviômetro entram na aba Chuva e a comparação fica em Consultar.</Text>

      <Secao titulo="Local da previsão" />
      <Text style={estilos.nota}>
        Agora: {local.nome} ({local.lat.toFixed(4).replace('.', ',')}; {local.lng.toFixed(4).replace('.', ',')}). Toque num dos lugares cadastrados para trocar; estando na lavoura, o GPS deixa a previsão mais certa.
      </Text>
      {botoesLocal}
      <Text style={estilos.nota}>
        Fonte: Open-Meteo (modelos de previsão do tempo), sem custo. Atualizado às {new Date(prev.buscadoEm).toTimeString().slice(0, 5)} de {doBanco(prev.hoje)}; puxe a tela para baixo para atualizar. É previsão: pode errar, principalmente em pancada de verão.
      </Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  pequeno: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  agora: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 14 },
  temp: { fontSize: 34, fontWeight: '800', color: cores.primariaEscura },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  total: { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 8 },
  cel: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  cards: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 2 },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
});
