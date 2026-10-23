import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Vazio from '../../componentes/Vazio';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { somarDias } from '../../lib/reproducao';
import { ROTULO_TIPO_VEICULO, USOS, carregarVeiculos, lerLeiturasAtuais, lerSituacao, textoLeitura, textoSituacao, type LeituraAtual, type Situacao, type Veiculo } from '../../lib/frota';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const PESO: Record<string, number> = { vencida: 0, proxima: 1, ok: 2 };

/** Frota › Situação da frota: o que está vencido ou perto de vencer, a leitura de cada um e o gasto do mês. */
export default function FrotaPainel() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  const [filtro, setFiltro] = useState<string[]>(['todas']);
  const [veiculos, setVeiculos] = useState<Veiculo[] | null>(null);
  const [leituras, setLeituras] = useState<Record<string, LeituraAtual>>({});
  const [situacao, setSituacao] = useState<Situacao[]>([]);
  const [seguros, setSeguros] = useState<any[]>([]);
  const [gasto, setGasto] = useState<{ comb: number; manut: number }>({ comb: 0, manut: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const soEsta = filtro[0] === 'esta';

  const carregar = useCallback(async () => {
    try {
      const hoje = hojeBanco();
      const inicioMes = `${hoje.slice(0, 7)}-01`;
      let qa = supabase.from('frota_abastecimentos').select('valor_total, arla_valor, fazenda_id').gte('data', inicioMes);
      let qm = supabase.from('frota_manutencoes').select('valor_servico, valor_pecas, fazenda_id').gte('data', inicioMes);
      if (soEsta && fid) {
        qa = qa.eq('fazenda_id', fid);
        qm = qm.eq('fazenda_id', fid);
      }
      const [vs, ls, si, ab, ma, sg] = await Promise.all([
        carregarVeiculos(fid),
        lerLeiturasAtuais(),
        lerSituacao(soEsta ? fid : null),
        consulta<any[]>(qa),
        consulta<any[]>(qm),
        consulta<any[]>(supabase.from('frota_veiculos').select('id, nome, seguro_vencimento, fazenda_id').eq('ativo', true).not('seguro_vencimento', 'is', null).lte('seguro_vencimento', somarDias(hoje, 30)).order('seguro_vencimento')),
      ]);
      setVeiculos(soEsta ? vs.filter((v) => v.fazenda_id === fid) : vs);
      setLeituras(ls);
      setSituacao(si);
      setSeguros(soEsta ? sg.filter((s) => s.fazenda_id === fid) : sg);
      setGasto({
        comb: ab.reduce((s, a) => s + Number(a.valor_total ?? 0) + Number(a.arla_valor ?? 0), 0),
        manut: ma.reduce((s, m) => s + Number(m.valor_servico ?? 0) + Number(m.valor_pecas ?? 0), 0),
      });
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid, soEsta]);
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  if (!veiculos) {
    return (
      <Tela rolar={false}>
        {erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}
      </Tela>
    );
  }

  const avisos = situacao.filter((s) => s.situacao !== 'ok').sort((a, b) => PESO[a.situacao] - PESO[b.situacao] || String(a.vence_em ?? '').localeCompare(String(b.vence_em ?? '')));
  const vencidas = avisos.filter((s) => s.situacao === 'vencida').length;
  const proximas = avisos.length - vencidas;
  const piorDo = (vid: string) => situacao.filter((s) => s.veiculo_id === vid).sort((a, b) => PESO[a.situacao] - PESO[b.situacao])[0] ?? null;
  const nomeFazenda = (id: string) => (fazendas.length > 1 && !soEsta ? fazendas.find((f) => f.id === id)?.nome : null);

  return (
    <Tela atualizando={false} aoAtualizar={carregar}>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {fazendas.length > 1 && (
        <Escolha
          opcoes={[
            { valor: 'todas', rotulo: 'Todas as fazendas' },
            { valor: 'esta', rotulo: fazendaAtiva?.nome ?? 'Esta fazenda' },
          ]}
          valor={filtro}
          aoMudar={setFiltro}
        />
      )}

      <View style={estilos.quadros}>
        <View style={[estilos.quadro, vencidas > 0 && { borderColor: cores.erro }]}>
          <Text style={estilos.qRotulo}>Vencidas</Text>
          <Text style={[estilos.qValor, { color: vencidas ? cores.erro : cores.primaria }]}>{vencidas}</Text>
        </View>
        <View style={estilos.quadro}>
          <Text style={estilos.qRotulo}>Perto de vencer</Text>
          <Text style={[estilos.qValor, { color: proximas ? '#B7791F' : cores.primaria }]}>{proximas}</Text>
        </View>
        <View style={[estilos.quadro, { flexBasis: 160 }]}>
          <Text style={estilos.qRotulo}>Gasto no mês</Text>
          <Text style={estilos.qValor}>{formatarMoeda(gasto.comb + gasto.manut)}</Text>
          <Text style={estilos.qNota}>combustível {formatarMoeda(gasto.comb)} · manutenção {formatarMoeda(gasto.manut)}</Text>
        </View>
      </View>

      {veiculos.length === 0 && (
        <>
          <Vazio icone="car-sport-outline" texto="Nenhum veículo ou máquina cadastrado ainda." />
          <Botao titulo="Cadastrar o primeiro" onPress={() => navegacao.push('VeiculoForm', {})} />
        </>
      )}

      {(avisos.length > 0 || seguros.length > 0) && (
        <>
          <Secao titulo="Avisos" />
          <Lista>
            {avisos.map((s) => (
              <Linha
                key={s.plano_id}
                titulo={`${s.situacao === 'vencida' ? '🔴' : '🟡'} ${s.veiculo}: ${s.item}`}
                linhas={[textoSituacao(s, doBanco), nomeFazenda(s.fazenda_id)]}
                onPress={() => navegacao.navigate('VeiculoDetalhe', { id: s.veiculo_id })}
              />
            ))}
            {seguros.map((s) => (
              <Linha
                key={`seg-${s.id}`}
                titulo={`🛡️ ${s.nome}: seguro`}
                linhas={[`${s.seguro_vencimento < hojeBanco() ? 'Venceu em' : 'Vence em'} ${doBanco(s.seguro_vencimento)}`]}
                onPress={() => navegacao.navigate('VeiculoDetalhe', { id: s.id })}
              />
            ))}
          </Lista>
        </>
      )}
      {veiculos.length > 0 && avisos.length === 0 && seguros.length === 0 && <Aviso tipo="sucesso" texto="Tudo em dia: nenhuma manutenção vencida ou perto de vencer." />}

      {USOS.map((u) => {
        const doUso = veiculos.filter((v) => v.uso === u.valor);
        if (!doUso.length) return null;
        return (
          <View key={u.valor} style={{ gap: tam.espaco }}>
            <Secao titulo={`${u.rotulo} (${doUso.length})`} />
            <Lista>
              {doUso.map((v) => {
                const pior = piorDo(v.id);
                const estado = !pior ? 'sem plano de manutenção' : pior.situacao === 'ok' ? 'manutenção em dia' : `${pior.situacao === 'vencida' ? 'vencida' : 'perto'}: ${pior.item}`;
                return (
                  <Linha
                    key={v.id}
                    titulo={`${pior?.situacao === 'vencida' ? '🔴 ' : pior?.situacao === 'proxima' ? '🟡 ' : ''}${v.nome}`}
                    linhas={[[ROTULO_TIPO_VEICULO[v.tipo], v.placa, v.medidor !== 'nenhum' ? textoLeitura(leituras[v.id]?.leitura, v.medidor) : null, nomeFazenda(v.fazenda_id)].filter(Boolean).join(' · '), estado]}
                    onPress={() => navegacao.navigate('VeiculoDetalhe', { id: v.id })}
                  />
                );
              })}
            </Lista>
          </View>
        );
      })}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  quadros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quadro: { flexGrow: 1, flexBasis: 90, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 2 },
  qRotulo: { fontSize: tam.pequeno - 1, color: cores.textoSuave, fontWeight: '600' },
  qValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.cafe },
  qNota: { fontSize: tam.pequeno - 2, color: cores.textoSuave },
});
