import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { perguntar } from '../../lib/perguntar';
import {
  ICONE_TIPO_VEICULO, ROTULO_TIPO_VEICULO, ROTULO_USO, calcularConsumo, lerLeiturasAtuais, lerSituacao, textoConsumo,
  textoLeitura, textoSituacao, unidadeMedidor, type LeituraAtual, type Situacao,
} from '../../lib/frota';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const COR_SIT: Record<string, string> = { vencida: cores.erro, proxima: '#B7791F', ok: cores.primaria };
const ROTULO_SIT: Record<string, string> = { vencida: 'Vencida', proxima: 'Perto de vencer', ok: 'Em dia' };

/** Ficha do veículo: leitura atual, consumo, plano de manutenção com a situação de cada item, gastos e histórico. */
export default function VeiculoDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'VeiculoDetalhe'>>();
  const { fazendas } = useSessao();
  const [v, setV] = useState<any>(null);
  const [leitura, setLeitura] = useState<LeituraAtual | null>(null);
  const [plano, setPlano] = useState<Situacao[]>([]);
  const [abast, setAbast] = useState<any[]>([]);
  const [manut, setManut] = useState<any[]>([]);
  const [bem, setBem] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const desde = `${Number(hojeBanco().slice(0, 4)) - 1}${hojeBanco().slice(4)}`;
      const [vei, ls, si, ab, ma] = await Promise.all([
        consulta<any>(supabase.from('frota_veiculos').select('*, centro:centros_custo ( codigo, nome ), responsavel:pessoas ( nome )').eq('id', params.id).single()),
        lerLeiturasAtuais(),
        lerSituacao(null),
        consulta<any[]>(supabase.from('frota_abastecimentos').select('id, numero, data, leitura, litros, tanque_cheio, valor_total, arla_valor, origem, frete_id').eq('veiculo_id', params.id).order('data', { ascending: false }).limit(300)),
        consulta<any[]>(supabase.from('frota_manutencoes').select('id, numero, data, leitura, descricao, tipo, valor_servico, valor_pecas, frete_id').eq('veiculo_id', params.id).gte('data', desde).order('data', { ascending: false }).limit(100)),
      ]);
      setV(vei);
      setLeitura(ls[params.id] ?? null);
      setPlano(si.filter((s) => s.veiculo_id === params.id));
      setAbast(ab);
      setManut(ma);
      setBem(vei.imobilizado_id ? await consulta<any>(supabase.from('imobilizados').select('id, numero, nome, consumo_l_hora, preco_litro, manutencao_hora').eq('id', vei.imobilizado_id).maybeSingle()) : null);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [params.id]);
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  if (!v) {
    return (
      <Tela rolar={false}>
        {erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}
      </Tela>
    );
  }

  const med = v.medidor;
  const un = unidadeMedidor(med);
  const consumo = calcularConsumo(abast.map((a) => ({ data: a.data, leitura: a.leitura == null ? null : Number(a.leitura), litros: Number(a.litros), tanque_cheio: a.tanque_cheio, valor_total: a.valor_total })), med);
  const desde = `${Number(hojeBanco().slice(0, 4)) - 1}${hojeBanco().slice(4)}`;
  const abAno = abast.filter((a) => a.data >= desde);
  const gastoComb = abAno.reduce((s, a) => s + Number(a.valor_total ?? 0) + Number(a.arla_valor ?? 0), 0);
  const litrosAno = abAno.reduce((s, a) => s + Number(a.litros), 0);
  const gastoManut = manut.reduce((s, m) => s + Number(m.valor_servico ?? 0) + Number(m.valor_pecas ?? 0), 0);
  const ultPreco = abast.find((a) => Number(a.valor_total) > 0 && Number(a.litros) > 0);
  const precoLitro = ultPreco ? Number(ultPreco.valor_total) / Number(ultPreco.litros) : null;
  const vencidos = plano.filter((p) => p.situacao === 'vencida').length;
  const proximos = plano.filter((p) => p.situacao === 'proxima').length;
  const nomeFazenda = fazendas.length > 1 ? fazendas.find((f) => f.id === v.fazenda_id)?.nome : null;

  async function levarConsumoAoBem() {
    if (!bem || consumo.media == null) return;
    const ok = await perguntar(
      'Custo por hora do bem',
      `Gravar no bem nº ${bem.numero} o consumo real de ${formatarNumero(consumo.media, 1)} L/h${precoLitro ? ` e o litro a ${formatarMoeda(precoLitro)}` : ''}? Vale para as próximas Atividades agrícolas.`,
      'Gravar',
      'Voltar',
    );
    if (!ok) return;
    const dados: any = { consumo_l_hora: Math.round(consumo.media * 100) / 100 };
    if (precoLitro) dados.preco_litro = Math.round(precoLitro * 100) / 100;
    const { error } = await supabase.from('imobilizados').update(dados).eq('id', bem.id);
    if (error) return setErro(traduzirErro(error));
    setAviso(`Bem nº ${bem.numero} atualizado: ${formatarNumero(dados.consumo_l_hora, 2)} L/h.`);
    carregar();
  }

  return (
    <Tela>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.topo}>
        <Ionicons name={ICONE_TIPO_VEICULO[v.tipo] ?? 'car-outline'} size={34} color={cores.primaria} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.nome}>
            Nº {v.numero} · {v.nome}
            {v.ativo ? '' : '  (fora de uso)'}
          </Text>
          <Text style={estilos.nota}>{[ROTULO_TIPO_VEICULO[v.tipo], v.marca, v.modelo, v.ano, v.placa].filter(Boolean).join(' · ')}</Text>
          <Text style={estilos.nota}>
            {[ROTULO_USO[v.uso], v.uso === 'particular' ? v.proprietario || 'do produtor' : um(v.centro) ? `${um(v.centro).codigo} ${um(v.centro).nome}` : null, um(v.responsavel)?.nome, nomeFazenda].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <View style={estilos.quadros}>
        {med !== 'nenhum' && (
          <View style={estilos.quadro}>
            <Text style={estilos.qRotulo}>{med === 'horas' ? 'Horímetro' : 'Hodômetro'}</Text>
            <Text style={estilos.qValor}>{textoLeitura(leitura?.leitura, med)}</Text>
            <Text style={estilos.qNota}>{leitura?.data ? `em ${doBanco(leitura.data)}` : ''}{leitura?.por_dia ? ` · ${formatarQtd(leitura.por_dia, 1)} ${un}/dia` : ''}</Text>
          </View>
        )}
        {med !== 'nenhum' && (
          <View style={estilos.quadro}>
            <Text style={estilos.qRotulo}>Consumo médio</Text>
            <Text style={estilos.qValor}>{textoConsumo(consumo.media, med)}</Text>
            <Text style={estilos.qNota}>{consumo.ultimo != null ? `último: ${textoConsumo(consumo.ultimo, med)}` : 'tanque cheio a tanque cheio'}</Text>
          </View>
        )}
        <View style={estilos.quadro}>
          <Text style={estilos.qRotulo}>Manutenção</Text>
          <Text style={[estilos.qValor, { color: vencidos ? cores.erro : proximos ? '#B7791F' : cores.primaria }]}>{vencidos ? `${vencidos} vencida${vencidos > 1 ? 's' : ''}` : proximos ? `${proximos} perto` : 'Em dia'}</Text>
          <Text style={estilos.qNota}>{plano.length} {plano.length === 1 ? 'item' : 'itens'} no plano</Text>
        </View>
      </View>

      <View style={estilos.botoes}>
        <View style={{ flex: 1 }}>
          <Botao titulo="Abastecer" onPress={() => navegacao.push('AbastecimentoForm', { veiculoId: v.id })} />
        </View>
        <View style={{ flex: 1 }}>
          <Botao titulo="Manutenção" tipo="secundario" onPress={() => navegacao.push('ManutencaoForm', { veiculoId: v.id })} />
        </View>
      </View>
      {med !== 'nenhum' && <Botao titulo={`Atualizar ${med === 'horas' ? 'horas' : 'km'}`} tipo="secundario" onPress={() => navegacao.push('LeituraForm', { veiculoId: v.id })} />}
      {['caminhao', 'caminhonete', 'carro', 'outro'].includes(v.tipo) && <Botao titulo="Lançar frete" tipo="texto" onPress={() => navegacao.push('FreteForm', { veiculoId: v.id })} />}

      <Secao titulo="Plano de manutenção" />
      {plano.length === 0 && <Text style={estilos.nota}>Sem plano. Toque em "Editar o cadastro" e use o plano sugerido para o tipo.</Text>}
      {plano.map((p) => (
        <View key={p.plano_id} style={[estilos.item, { borderLeftColor: COR_SIT[p.situacao] }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={estilos.itemNome}>{p.item}</Text>
            <Text style={[estilos.nota, { color: COR_SIT[p.situacao], fontWeight: '700' }]}>{ROTULO_SIT[p.situacao]} · {textoSituacao(p, doBanco)}</Text>
            <Text style={estilos.nota}>
              A cada {[p.intervalo ? `${formatarQtd(p.intervalo)} ${un}` : null, p.intervalo_meses ? `${p.intervalo_meses} ${p.intervalo_meses === 1 ? 'mês' : 'meses'}` : null].filter(Boolean).join(' ou ')}
              {p.ultima_data ? ` · última: ${doBanco(p.ultima_data)}${p.ultima_leitura != null && med !== 'nenhum' ? `, ${textoLeitura(p.ultima_leitura, med)}` : ''}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => navegacao.push('ManutencaoForm', { veiculoId: v.id, planoIds: [p.plano_id] })} style={estilos.feito} accessibilityRole="button" hitSlop={6}>
            <Ionicons name="checkmark-done-outline" size={20} color={cores.primaria} />
            <Text style={estilos.feitoTexto}>Feito</Text>
          </Pressable>
        </View>
      ))}

      <Secao titulo="Últimos 12 meses" />
      <View style={estilos.resumo}>
        <Text style={estilos.resumoTexto}>Combustível: {formatarQtd(litrosAno, 1)} L · {formatarMoeda(gastoComb)}</Text>
        <Text style={estilos.resumoTexto}>Manutenção: {formatarMoeda(gastoManut)} ({manut.length} {manut.length === 1 ? 'lançamento' : 'lançamentos'})</Text>
        <Text style={[estilos.resumoTexto, { fontWeight: '800' }]}>Total: {formatarMoeda(gastoComb + gastoManut)}</Text>
      </View>

      {bem && med === 'horas' && (
        <View style={estilos.bem}>
          <Text style={estilos.nota}>
            Ligado ao bem nº {bem.numero} do Imobilizado. Custo por hora hoje: {bem.consumo_l_hora ? `${formatarNumero(Number(bem.consumo_l_hora), 2)} L/h` : 'consumo não informado'}
            {bem.preco_litro ? ` a ${formatarMoeda(Number(bem.preco_litro))} o litro` : ''}.
          </Text>
          {consumo.media != null && <Botao titulo={`Usar o consumo real (${formatarNumero(consumo.media, 1)} L/h)`} tipo="texto" onPress={levarConsumoAoBem} />}
        </View>
      )}

      {abast.length > 0 && (
        <>
          <Secao titulo="Abastecimentos recentes" />
          <Lista>
            {abast.slice(0, 8).map((a) => (
              <Linha
                key={a.id}
                titulo={`${doBanco(a.data)} · ${formatarQtd(Number(a.litros), 2)} L`}
                linhas={[[a.leitura != null ? textoLeitura(Number(a.leitura), med) : null, a.origem === 'tanque' ? 'tanque da fazenda' : 'posto', a.tanque_cheio ? 'cheio' : null].filter(Boolean).join(' · ')]}
                direita={a.valor_total != null ? formatarMoeda(Number(a.valor_total)) : undefined}
                onPress={() => (a.frete_id ? navegacao.push('FreteForm', { id: a.frete_id }) : navegacao.push('AbastecimentoForm', { id: a.id }))}
              />
            ))}
          </Lista>
        </>
      )}
      {manut.length > 0 && (
        <>
          <Secao titulo="Manutenções recentes" />
          <Lista>
            {manut.slice(0, 8).map((m) => (
              <Linha
                key={m.id}
                titulo={`${doBanco(m.data)} · ${m.descricao}`}
                linhas={[[m.tipo === 'corretiva' ? 'Corretiva' : 'Preventiva', m.leitura != null ? textoLeitura(Number(m.leitura), med) : null].filter(Boolean).join(' · ')]}
                direita={Number(m.valor_servico) + Number(m.valor_pecas) > 0 ? formatarMoeda(Number(m.valor_servico) + Number(m.valor_pecas)) : undefined}
                onPress={() => (m.frete_id ? navegacao.push('FreteForm', { id: m.frete_id }) : navegacao.push('ManutencaoForm', { id: m.id }))}
              />
            ))}
          </Lista>
        </>
      )}

      <Botao titulo="Editar o cadastro e o plano" tipo="texto" onPress={() => navegacao.push('VeiculoForm', { id: v.id })} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  topo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  nome: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  quadros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quadro: { flexGrow: 1, flexBasis: 100, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 2 },
  qRotulo: { fontSize: tam.pequeno - 1, color: cores.textoSuave, fontWeight: '600' },
  qValor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  qNota: { fontSize: tam.pequeno - 2, color: cores.textoSuave },
  botoes: { flexDirection: 'row', gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, borderLeftWidth: 5, padding: 10 },
  itemNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  feito: { alignItems: 'center', paddingHorizontal: 6 },
  feitoTexto: { fontSize: tam.pequeno - 1, color: cores.primaria, fontWeight: '700' },
  resumo: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 4 },
  resumoTexto: { fontSize: tam.pequeno + 1, color: cores.info, fontWeight: '600' },
  bem: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 4 },
});
