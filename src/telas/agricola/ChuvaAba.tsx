import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { lerNumero } from '../../lib/formatos';
import { perguntar } from '../../lib/perguntar';
import { diaSemana, lerChuvas, somarDias, textoMm, type Chuva } from '../../lib/clima';
import { cores, tam } from '../../tema';

/** Chuva medida no pluviômetro da fazenda: lança a leitura do dia e mostra as últimas. */
export default function ChuvaAba({ abas }: { abas: React.ReactNode }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [data, setData] = useState(hojeBR());
  const [mm, setMm] = useState('');
  const [local, setLocal] = useState('');
  const [obs, setObs] = useState('');
  const [ultimas, setUltimas] = useState<Chuva[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!fid) return;
    try {
      const hoje = hojeBanco();
      const c = await lerChuvas(fid, somarDias(hoje, -120), hoje);
      setUltimas(c);
      // o pluviômetro da última leitura já vem escolhido
      setLocal((atual) => atual || c[0]?.local || '');
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function lancar() {
    setErro(null);
    setAviso(null);
    if (!fid) return;
    const d = paraBanco(data);
    const v = lerNumero(mm);
    if (!dataValida(data) || !d || d > hojeBanco()) return setErro('Informe o dia da chuva (não pode ser futuro).');
    if (v == null || v < 0) return setErro('Informe os milímetros do pluviômetro (0 se não choveu).');
    if (v > 500) return setErro('Confira os milímetros: mais de 500 mm num dia não é comum.');
    const nome = local.trim();
    const { data: ja, error: e1 } = await supabase.from('chuvas').select('id, mm').eq('fazenda_id', fid).eq('data', d).eq('local', nome).maybeSingle();
    if (e1) return setErro(traduzirErro(e1));
    if (ja) {
      const ok = await perguntar('Leitura já lançada', `Em ${data}${nome ? `, no pluviômetro ${nome},` : ''} já há ${textoMm(Number(ja.mm))} mm. Trocar por ${textoMm(v)} mm?`, 'Trocar', 'Voltar');
      if (!ok) return;
    }
    setSalvando(true);
    const { error } = await supabase.from('chuvas').upsert({ fazenda_id: fid, data: d, mm: Math.round(v * 10) / 10, local: nome, observacoes: obs.trim() || null }, { onConflict: 'fazenda_id,data,local' });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setAviso(`Chuva de ${data} lançada: ${textoMm(v)} mm${nome ? ` (${nome})` : ''}.`);
    setMm('');
    setObs('');
    carregar();
  }

  async function excluir(c: Chuva) {
    const ok = await perguntar('Excluir leitura', `Excluir a leitura de ${doBanco(c.data)} (${textoMm(c.mm)} mm)?`, 'Excluir', 'Voltar');
    if (!ok) return;
    setErro(null);
    setAviso(null);
    const { error } = await supabase.from('chuvas').delete().eq('id', c.id);
    if (error) return setErro(traduzirErro(error));
    carregar();
  }

  const locais = [...new Set(ultimas.map((c) => c.local).filter(Boolean))];
  const hoje = hojeBanco();
  const total30 = ultimas.filter((c) => c.data > somarDias(hoje, -30)).reduce((s, c) => s + c.mm, 0);

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}

      <Secao titulo="Leitura do pluviômetro" />
      <View style={estilos.campos}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Dia da chuva *" valor={data} aoMudar={setData} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Chuva (mm) *" value={mm} onChangeText={setMm} keyboardType="decimal-pad" placeholder="0 se não choveu" />
        </View>
      </View>
      <Campo rotulo="Pluviômetro (onde fica)" value={local} onChangeText={setLocal} autoCapitalize="words" placeholder="Em branco se a fazenda só tem um" ajuda="Só precisa do nome se houver mais de um pluviômetro (ex.: Sede, Chapada)." />
      {locais.length > 1 && <Escolha opcoes={locais.map((l) => ({ valor: l, rotulo: l }))} valor={locais.includes(local.trim()) ? [local.trim()] : []} aoMudar={(v) => setLocal(v[0])} />}
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} placeholder="Ex.: granizo, chuva de vento" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Botao titulo="Lançar chuva" onPress={lancar} carregando={salvando} />
      <Text style={estilos.nota}>Leia o pluviômetro sempre na mesma hora (de manhã cedo é o costume) e lance no dia em que choveu. Lançar 0 nos dias secos deixa o balanço certo: dia sem leitura usa a chuva estimada.</Text>

      <Secao titulo="Últimas leituras" />
      {ultimas.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma leitura lançada ainda.</Text>
      ) : (
        <View style={estilos.caixa}>
          <Text style={estilos.nota}>Soma dos últimos 30 dias: {textoMm(total30)} mm</Text>
          {ultimas.slice(0, 20).map((c) => (
            <View key={c.id} style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.cel}>
                  {diaSemana(c.data)} {doBanco(c.data)}
                  {c.local ? ` · ${c.local}` : ''}
                </Text>
                {c.observacoes ? <Text style={estilos.nota}>{c.observacoes}</Text> : null}
              </View>
              <Text style={[estilos.cel, { fontWeight: '800', color: c.mm >= 1 ? cores.info : cores.textoSuave }]}>{textoMm(c.mm)} mm</Text>
              <Pressable onPress={() => excluir(c)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Excluir leitura">
                <Ionicons name="trash-outline" size={20} color={cores.erro} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  campos: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cel: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
});
