import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Aviso from './Aviso';
import Botao from './Botao';
import Campo from './Campo';
import { supabase, traduzirErro } from '../lib/supabase';
import { cores, tam } from '../tema';

type Gta = { gta_numero: string | null; gta_serie: string | null; gta_uf: string | null };
type Props = { vendaId: string; atual: Gta; ufPadrao?: string; aoGravar: (g: Gta) => void };

/** V161: informar (ou corrigir) a GTA de uma venda de gado já gravada. */
export default function GtaVenda({ vendaId, atual, ufPadrao, aoGravar }: Props) {
  const tem = !!atual.gta_numero;
  const [aberto, setAberto] = useState(!tem);
  const [num, setNum] = useState(atual.gta_numero ?? '');
  const [serie, setSerie] = useState(atual.gta_serie ?? '');
  const [uf, setUf] = useState(atual.gta_uf ?? ufPadrao ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  async function gravar() {
    setErro(null);
    if (!num.trim()) return setErro('Informe o número da GTA.');
    setGravando(true);
    const { error } = await supabase.rpc('informar_gta_venda', { p_venda: vendaId, p_numero: num.trim(), p_serie: serie.trim(), p_uf: uf.trim() });
    setGravando(false);
    if (error) return setErro(traduzirErro(error));
    aoGravar({ gta_numero: num.trim(), gta_serie: serie.trim().toUpperCase() || null, gta_uf: uf.trim().toUpperCase() || null });
    setAberto(false);
  }

  if (!aberto) {
    return (
      <Text style={estilos.link} onPress={() => setAberto(true)}>
        Corrigir a GTA
      </Text>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {!tem && <Aviso tipo="info" texto="Venda sem GTA: o gado só pode ser transportado com a GTA (e com a nota fiscal, no estado em que ela for obrigatória)." />}
      <View style={estilos.linha}>
        <View style={{ flex: 2 }}>
          <Campo rotulo="Número da GTA" value={num} onChangeText={(t) => setNum(t.replace(/[^0-9A-Za-z-]/g, '').slice(0, 20))} autoCapitalize="characters" erro={erro} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Série" value={serie} onChangeText={(t) => setSerie(t.toUpperCase().slice(0, 3))} autoCapitalize="characters" />
        </View>
        <View style={{ width: 64 }}>
          <Campo rotulo="UF" value={uf} onChangeText={(t) => setUf(t.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} autoCapitalize="characters" />
        </View>
      </View>
      <Botao titulo="Gravar a GTA" tipo="secundario" onPress={gravar} carregando={gravando} />
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
});
