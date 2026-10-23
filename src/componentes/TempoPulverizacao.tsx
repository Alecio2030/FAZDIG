import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSessao } from '../contexto/SessaoContext';
import { horaValida, hojeBanco, paraBanco } from '../lib/datas';
import { REGRA_PULVERIZACAO, lerPrevisao, localDaFazenda, pulverizacaoNoDia, somarDias, type Previsao } from '../lib/clima';
import { cores, tam } from '../tema';

/**
 * Na pulverização de hoje, amanhã ou depois de amanhã: diz se a hora informada é boa para aplicar e mostra as janelas boas do dia.
 * Não aparece para datas passadas, sem o local da fazenda ou sem internet (não atrapalha o lançamento).
 */
export default function TempoPulverizacao({ data, inicio }: { data: string; inicio: string }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [prev, setPrev] = useState<Previsao | null>(null);
  const iso = paraBanco(data);
  const hoje = hojeBanco();
  const noAlcance = !!iso && iso >= hoje && iso <= somarDias(hoje, 2);

  useEffect(() => {
    if (!fid || !noAlcance || prev) return;
    let vivo = true;
    localDaFazenda(fid)
      .then((l) => (l ? lerPrevisao(l) : null))
      .then(
        (p) => vivo && setPrev(p),
        () => undefined,
      );
    return () => {
      vivo = false;
    };
  }, [fid, noAlcance, prev]);

  if (!prev || !iso || !noAlcance) return null;
  const r = pulverizacaoNoDia(prev, iso, horaValida(inicio) ? inicio : null);
  if (!r.temPrevisao) return null;
  const quando = iso === prev.hoje ? 'hoje' : iso === somarDias(prev.hoje, 1) ? 'amanhã' : `em ${data.slice(0, 5)}`;

  return (
    <View style={estilos.quadro}>
      <Text style={estilos.titulo}>Tempo para pulverizar {quando}</Text>
      {r.naHora && (
        <Text style={[estilos.forte, { color: r.naHora.boa ? cores.primaria : cores.erro }]}>
          {r.naHora.boa ? `Às ${inicio}: condição boa para aplicar.` : `Às ${inicio}: não é recomendado – ${r.naHora.motivos.join(', ')}.`}
        </Text>
      )}
      <Text style={estilos.texto}>
        {r.janelas.length ? `Janelas boas${iso === prev.hoje ? ' de agora em diante' : ''}: ${r.janelas.map((j) => `das ${j.inicio.slice(0, 2)} h às ${j.fim.slice(0, 2)} h`).join('; ')}.` : `Sem janela boa ${iso === prev.hoje ? 'no resto do dia' : 'neste dia'}.`}
      </Text>
      <Text style={estilos.nota}>Janela boa: {REGRA_PULVERIZACAO}. É previsão; vale a bula do produto.</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  titulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.info },
  forte: { fontSize: tam.pequeno + 1, fontWeight: '800' },
  texto: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 21 },
  nota: { fontSize: tam.pequeno - 1, color: cores.textoSuave, lineHeight: 18 },
});
