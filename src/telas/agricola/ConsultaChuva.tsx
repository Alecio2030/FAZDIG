import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { anoSafra } from '../../lib/talhoes';
import { MESES, balanco, diaSemana, diarioEstimado, lerChuvas, limitesMes, medidaPorDia, somarDias, somarMes, textoMm, type DiaEstimado, type LocalClima } from '../../lib/clima';
import { cores, tam } from '../../tema';

type Periodo = { estimado: Record<string, DiaEstimado>; medida: Record<string, number>; semEstimada: boolean };

async function lerPeriodo(fid: string, local: LocalClima | null | undefined, inicio: string, fim: string): Promise<Periodo> {
  const chuvas = await lerChuvas(fid, inicio, fim);
  let estimado: Record<string, DiaEstimado> = {};
  let semEstimada = !local;
  if (local) {
    try {
      estimado = await diarioEstimado(local, inicio, fim);
    } catch {
      semEstimada = true; // sem internet ou serviço fora: mostra só o pluviômetro
    }
  }
  return { estimado, medida: medidaPorDia(chuvas), semEstimada };
}

/** Consulta (só mostra): chuva do mês dia a dia (pluviômetro x estimada), balanço dos últimos 30 dias e a chuva de cada mês da safra. */
export default function ConsultaChuva({ local }: { local: LocalClima | null | undefined }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const hoje = hojeBanco();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [doMes, setDoMes] = useState<Periodo | null>(null);
  const [safra, setSafra] = useState<Periodo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const as = anoSafra(hoje);
  const ha30 = somarDias(hoje, -30);
  const pronto = local !== undefined;

  // mês escolhido
  useEffect(() => {
    if (!fid || !pronto) return;
    let vivo = true;
    setDoMes(null);
    const { inicio, fim } = limitesMes(mes);
    lerPeriodo(fid, local, inicio, fim).then(
      (p) => vivo && setDoMes(p),
      (e) => vivo && setErro(traduzirErro(e)),
    );
    return () => {
      vivo = false;
    };
  }, [fid, local, pronto, mes]);

  // safra (desde 1º de setembro) e os últimos 30 dias, lidos uma vez
  useEffect(() => {
    if (!fid || !pronto) return;
    let vivo = true;
    lerPeriodo(fid, local, as.inicio < ha30 ? as.inicio : ha30, hoje).then(
      (p) => vivo && setSafra(p),
      (e) => vivo && setErro(traduzirErro(e)),
    );
    return () => {
      vivo = false;
    };
  }, [fid, local, pronto, as.inicio, ha30, hoje]);

  const { inicio, fim } = limitesMes(mes);
  const dias: string[] = [];
  for (let d = inicio; d <= fim && d <= hoje; d = somarDias(d, 1)) dias.push(d);
  const linhas = doMes ? dias.filter((d) => doMes.medida[d] != null || (doMes.estimado[d]?.chuva ?? 0) >= 0.1) : [];
  const totMedida = doMes ? dias.reduce((s, d) => s + (doMes.medida[d] ?? 0), 0) : 0;
  const leituras = doMes ? dias.filter((d) => doMes.medida[d] != null).length : 0;
  const totEstimada = doMes ? dias.reduce((s, d) => s + (doMes.estimado[d]?.chuva ?? 0), 0) : 0;
  const diasChuva = doMes ? dias.filter((d) => (doMes.medida[d] ?? doMes.estimado[d]?.chuva ?? 0) >= 1).length : 0;

  const b = safra ? balanco(safra.estimado, safra.medida, somarDias(hoje, -29), hoje) : null;
  // meses da safra até o mês atual
  const meses: string[] = [];
  for (let m = as.inicio.slice(0, 7); m <= hoje.slice(0, 7); m = somarMes(m, 1)) meses.push(m);
  const somaMes = (m: string) => {
    const l = limitesMes(m);
    let med = 0;
    let est = 0;
    let n = 0;
    for (let d = l.inicio; d <= l.fim && d <= hoje; d = somarDias(d, 1)) {
      if (safra!.medida[d] != null) {
        med += safra!.medida[d];
        n++;
      }
      est += safra!.estimado[d]?.chuva ?? 0;
    }
    return { med, est, n };
  };

  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {local === null && <Aviso texto="Sem o local da fazenda, a consulta mostra só o pluviômetro. Defina o local na aba Previsão para ver também a chuva estimada e o balanço." />}

      <View style={estilos.navMes}>
        <Pressable onPress={() => setMes(somarMes(mes, -1))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mês anterior">
          <Ionicons name="chevron-back-circle-outline" size={34} color={cores.primaria} />
        </Pressable>
        <Text style={estilos.mes}>
          {MESES[Number(mes.slice(5, 7)) - 1]} de {mes.slice(0, 4)}
        </Text>
        <Pressable onPress={() => mes < hoje.slice(0, 7) && setMes(somarMes(mes, 1))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mês seguinte" style={{ opacity: mes < hoje.slice(0, 7) ? 1 : 0.3 }}>
          <Ionicons name="chevron-forward-circle-outline" size={34} color={cores.primaria} />
        </Pressable>
      </View>

      {!doMes ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 8 }} />
      ) : (
        <>
          <View style={estilos.cards}>
            <View style={estilos.card}>
              <Text style={estilos.pequeno}>Pluviômetro</Text>
              <Text style={estilos.cardValor}>{leituras ? `${textoMm(totMedida)} mm` : '–'}</Text>
              <Text style={estilos.pequeno}>{leituras === 1 ? '1 leitura' : `${leituras} leituras`}</Text>
            </View>
            <View style={estilos.card}>
              <Text style={estilos.pequeno}>Estimada</Text>
              <Text style={estilos.cardValor}>{doMes.semEstimada ? '–' : `${textoMm(totEstimada)} mm`}</Text>
              <Text style={estilos.pequeno}>{diasChuva === 1 ? '1 dia de chuva' : `${diasChuva} dias de chuva`}</Text>
            </View>
          </View>
          <View style={estilos.caixa}>
            <View style={estilos.linha}>
              <Text style={[estilos.cab, { flex: 1 }]}>Dia</Text>
              <Text style={[estilos.cab, estilos.col]}>Pluviômetro</Text>
              <Text style={[estilos.cab, estilos.col]}>Estimada</Text>
            </View>
            {linhas.length === 0 ? (
              <Text style={estilos.nota}>Sem chuva e sem leitura neste mês.</Text>
            ) : (
              linhas.map((d) => (
                <View key={d} style={estilos.linha}>
                  <Text style={[estilos.cel, { flex: 1 }]}>
                    {diaSemana(d)} {d.slice(8, 10)}/{d.slice(5, 7)}
                  </Text>
                  <Text style={[estilos.cel, estilos.col, { color: cores.info, fontWeight: '800' }]}>{doMes.medida[d] != null ? textoMm(doMes.medida[d]) : '–'}</Text>
                  <Text style={[estilos.cel, estilos.col]}>{doMes.estimado[d] ? textoMm(doMes.estimado[d].chuva) : '–'}</Text>
                </View>
              ))
            )}
          </View>
          <Text style={estilos.nota}>
            Em mm. Aparecem os dias com leitura ou com chuva estimada; os outros foram secos. A estimada é a do modelo para o ponto da fazenda: serve de referência e para os dias sem leitura, mas quem manda é o pluviômetro.
            {doMes.semEstimada && local ? ' A chuva estimada não pôde ser lida agora (internet).' : ''}
          </Text>
        </>
      )}

      {b && b.dias > 0 && (
        <>
          <Secao titulo="Balanço dos últimos 30 dias" />
          <View style={[estilos.destaque, { backgroundColor: b.saldo < 0 ? cores.erroFundo : cores.sucessoFundo }]}>
            <Text style={estilos.pequeno}>Chuva menos a água que a lavoura perdeu</Text>
            <Text style={[estilos.destaqueValor, { color: b.saldo < 0 ? cores.erro : cores.primariaEscura }]}>
              {b.saldo < 0 ? '−' : '+'}
              {textoMm(Math.abs(b.saldo))} mm
            </Text>
            <Text style={estilos.nota}>
              Choveu {textoMm(b.chuva)} mm ({b.medidos ? `${b.medidos} ${b.medidos === 1 ? 'dia' : 'dias'} pelo pluviômetro, o resto estimado` : 'estimado'}) e a evapotranspiração foi de {textoMm(b.et0)} mm.
              {b.semChuva >= 5 ? ` São ${b.semChuva} dias seguidos sem chuva de 1 mm ou mais.` : ''}
              {b.saldo < 0 ? ' Faltou água: lavoura irrigada precisa repor; em sequeiro, é sinal de estresse.' : ' A chuva cobriu a demanda do período.'}
            </Text>
          </View>
          <Text style={estilos.nota}>É a evapotranspiração de referência (FAO), uma conta simples que não considera a água guardada no solo nem a irrigação já feita. A irrigação pelo balanço hídrico de cada talhão vem numa próxima etapa.</Text>
        </>
      )}

      {safra && (
        <>
          <Secao titulo={`Chuva na safra ${as.rotulo} (desde ${doBanco(as.inicio)})`} />
          <View style={estilos.caixa}>
            <View style={estilos.linha}>
              <Text style={[estilos.cab, { flex: 1 }]}>Mês</Text>
              <Text style={[estilos.cab, estilos.col]}>Pluviômetro</Text>
              <Text style={[estilos.cab, estilos.col]}>Estimada</Text>
            </View>
            {meses.map((m) => {
              const s = somaMes(m);
              return (
                <Pressable key={m} style={estilos.linha} onPress={() => setMes(m)} accessibilityRole="button">
                  <Text style={[estilos.cel, { flex: 1 }]}>
                    {MESES[Number(m.slice(5, 7)) - 1]}/{m.slice(2, 4)}
                  </Text>
                  <Text style={[estilos.cel, estilos.col, { color: cores.info, fontWeight: '800' }]}>{s.n ? textoMm(s.med) : '–'}</Text>
                  <Text style={[estilos.cel, estilos.col]}>{safra.semEstimada ? '–' : textoMm(s.est)}</Text>
                </Pressable>
              );
            })}
            <View style={[estilos.linha, estilos.total]}>
              <Text style={[estilos.cel, { flex: 1, fontWeight: '800' }]}>Total</Text>
              <Text style={[estilos.cel, estilos.col, { color: cores.info, fontWeight: '800' }]}>{meses.some((m) => somaMes(m).n) ? textoMm(meses.reduce((t, m) => t + somaMes(m).med, 0)) : '–'}</Text>
              <Text style={[estilos.cel, estilos.col, { fontWeight: '800' }]}>{safra.semEstimada ? '–' : textoMm(meses.reduce((t, m) => t + somaMes(m).est, 0))}</Text>
            </View>
          </View>
          <Text style={estilos.nota}>Toque no mês para ver dia a dia. O pluviômetro soma só os dias com leitura.</Text>
        </>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  pequeno: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  navMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mes: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  cards: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 2 },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  total: { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 8 },
  cab: { fontSize: tam.pequeno - 1, fontWeight: '700', color: cores.textoSuave },
  cel: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  col: { width: 92, textAlign: 'right' },
  destaque: { borderRadius: tam.raio, padding: 12, gap: 2 },
  destaqueValor: { fontSize: tam.titulo, fontWeight: '800' },
});
