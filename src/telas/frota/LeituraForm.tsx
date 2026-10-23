import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { agruparDigitacao, lerNumero } from '../../lib/formatos';
import { carregarVeiculos, itemVeiculo, lerLeiturasAtuais, lerSituacao, nomeMedidor, textoLeitura, unidadeMedidor, type LeituraAtual, type Veiculo } from '../../lib/frota';
import type { PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/**
 * Frota › Atualizar km ou horas: a leitura do hodômetro ou do horímetro sem abastecer
 * (ex.: conferência semanal do trator). Mantém os avisos de manutenção em dia.
 */
export default function LeituraForm() {
  const { params } = useRoute<RouteProp<PilhaParams, 'LeituraForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [leituras, setLeituras] = useState<Record<string, LeituraAtual>>({});
  const [veiculoId, setVeiculoId] = useState<string | null>(params?.veiculoId ?? null);
  const [data, setData] = useState(hojeBR());
  const [leitura, setLeitura] = useState('');
  const [obs, setObs] = useState('');
  const [historico, setHistorico] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const veiculo = veiculos.find((v) => v.id === veiculoId) ?? null;
  const med = veiculo?.medidor ?? 'km';
  const un = unidadeMedidor(med);
  const atual = veiculoId ? leituras[veiculoId] : null;

  const recarregar = useCallback(async () => {
    try {
      const [vs, ls] = await Promise.all([carregarVeiculos(fid), lerLeiturasAtuais()]);
      setVeiculos(vs.filter((v) => v.medidor !== 'nenhum'));
      setLeituras(ls);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);
  useEffect(() => {
    recarregar();
  }, [recarregar]);

  useEffect(() => {
    if (!veiculoId) return setHistorico([]);
    consulta<any[]>(supabase.from('frota_leituras').select('id, data, leitura, observacoes').eq('veiculo_id', veiculoId).order('data', { ascending: false }).limit(15))
      .then(setHistorico)
      .catch(() => setHistorico([]));
  }, [veiculoId, aviso]);

  const carregar = useCallback(async (): Promise<ItemLista[]> => veiculos.map((v) => itemVeiculo(v, leituras[v.id])), [veiculos, leituras]);

  async function salvar() {
    setErro(null);
    setAviso(null);
    const l = lerNumero(leitura);
    if (!veiculo) return setErro('Escolha o veículo ou a máquina.');
    if (!dataValida(data)) return setErro('Informe a data.');
    if (paraBanco(data)! > paraBanco(hojeBR())!) return setErro('A data não pode ser futura.');
    if (l == null || l < 0) return setErro(`Informe o ${nomeMedidor(med)} (${un}).`);
    setSalvando(true);
    try {
      await consulta(supabase.rpc('frota_conferir_leitura', { p_veiculo: veiculo.id, p_data: paraBanco(data), p_leitura: l, p_ignorar: null }));
      await consulta(supabase.from('frota_leituras').insert({ fazenda_id: veiculo.fazenda_id, veiculo_id: veiculo.id, data: paraBanco(data), leitura: l, observacoes: obs.trim() || null }));
      // depois de gravar: o que ficou vencido ou perto de vencer neste veículo
      const sit = (await lerSituacao(veiculo.fazenda_id)).filter((s) => s.veiculo_id === veiculo.id && s.situacao !== 'ok');
      const alerta = sit.length ? ` Atenção: ${sit.map((s) => `${s.item} (${s.situacao === 'vencida' ? 'vencida' : 'perto de vencer'})`).join(', ')}.` : ' Nenhuma manutenção vencida.';
      setAviso(`${veiculo.nome}: ${textoLeitura(l, med)} em ${data}.${alerta}`);
      setLeitura('');
      setObs('');
      recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setSalvando(false);
    }
  }

  function apagar(h: any) {
    Alert.alert('Excluir leitura', `Excluir a leitura de ${textoLeitura(Number(h.leitura), med)} em ${doBanco(h.data)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('frota_leituras').delete().eq('id', h.id);
          if (error) return setErro(traduzirErro(error));
          setAviso('Leitura excluída.');
          recarregar();
        },
      },
    ]);
  }

  return (
    <Tela>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <SeletorLista rotulo="Veículo ou máquina *" valorId={veiculoId} aoMudar={setVeiculoId} carregar={carregar} dicaBusca="Nome ou placa" vazio="Nenhum veículo com hodômetro ou horímetro." />
      {veiculo && (
        <Text style={estilos.nota}>
          Última leitura: {textoLeitura(atual?.leitura, med)}
          {atual?.data ? ` em ${doBanco(atual.data)}` : ''}
        </Text>
      )}
      <View style={estilos.linha}>
        <View style={{ flex: 1.2 }}>
          <Campo rotulo={`${med === 'horas' ? 'Horímetro' : 'Hodômetro'} (${un}) *`} value={leitura} onChangeText={(t) => setLeitura(agruparDigitacao(t))} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} />
        </View>
      </View>
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} autoCapitalize="sentences" placeholder="Opcional" />
      <Botao titulo="Gravar leitura" onPress={salvar} carregando={salvando} />
      <Text style={estilos.nota}>Abastecimentos e manutenções já gravam a leitura sozinhos. Use esta tela entre um e outro, para os avisos não atrasarem.</Text>

      {historico.length > 0 && (
        <>
          <Secao titulo="Leituras avulsas deste veículo" />
          <Lista>
            {historico.map((h) => (
              <Linha key={h.id} titulo={`${doBanco(h.data)} · ${textoLeitura(Number(h.leitura), med)}`} linhas={[h.observacoes, 'Toque para excluir']} onPress={() => apagar(h)} />
            ))}
          </Lista>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
});
