import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Escolha from '../../componentes/Escolha';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { idsEscolha } from '../../lib/balancete';
import { somarMes, textoMes } from '../../lib/imobilizado';
import { ADM, TODAS, opcoesUnidade, rotuloRelatorio } from '../../lib/unidades';
import { supabase, traduzirErro } from '../../lib/supabase';
import { hojeBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Bem = { id: string; numero: number; nome: string };
type Dados = {
  depreciacao: number;
  depreciacao_bens: number;
  depreciacao_centros: { centro: string; valor: number }[];
  a_classificar_valor: number;
  a_classificar_qtde: number;
  a_classificar_contas: string[];
  sem_centro_valor: number;
  sem_centro_qtde: number;
  bens_sem_rateio: Bem[];
  bens_sem_vida: Bem[];
  tem_rateio_depreciacao: boolean;
  custos: number;
  trato_faltas?: { data: string; lote: number; item: string; kg: number; motivo: string }[];
};

const ultimoDia = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/**
 * V174: Financeiro › Fechamento do mês. Não se digita nada: mostra o que o sistema lançou sozinho
 * (depreciação e exaustão do Imobilizado, pelos rateios) e a lista do que precisa de alguém.
 */
export default function FechamentoMes() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const naoParticular = fazendas.filter((f) => f.tipo !== 'particular');
  const [quais, setQuais] = useState<string[]>([modoAdm ? ADM : fazendaAtiva && fazendaAtiva.tipo !== 'particular' ? fazendaAtiva.id : TODAS]);
  const [mes, setMes] = useState(hojeBanco().slice(0, 7));
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const qual = quais[0];
  const de = `${mes}-01`;
  const ate = ultimoDia(mes);
  const chaveIds = idsEscolha(qual, naoParticular).join(',');
  const futuro = mes > hojeBanco().slice(0, 7);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      setErro(null);
      setD(null);
      supabase.rpc('fechamento_mes', { p_fazendas: chaveIds.split(','), p_de: de, p_ate: ate }).then(({ data, error }) => {
        if (!vivo) return;
        if (error) return setErro(/fechamento_mes/i.test(error.message ?? '') ? 'O banco ainda não tem a atualização da V174. Me avise.' : traduzirErro(error));
        setD(data as Dados);
      });
      return () => {
        vivo = false;
      };
    }, [chaveIds, de, ate]),
  );

  const pendencias =
    !!d && ((d.trato_faltas?.length ?? 0) > 0 || Number(d.a_classificar_qtde) > 0 || Number(d.sem_centro_qtde) > 0 || d.bens_sem_vida.length > 0 || (d.bens_sem_rateio.length > 0 && !d.tem_rateio_depreciacao));

  return (
    <Tela>
      <Escolha rotulo="De quem" opcoes={[{ valor: TODAS, rotulo: 'Grupo (tudo)' }, ...opcoesUnidade(naoParticular)]} valor={quais} aoMudar={setQuais} />
      <View style={estilos.meses}>
        <Pressable onPress={() => setMes(somarMes(mes, -1))} hitSlop={10} accessibilityLabel="Mês anterior" style={estilos.seta}>
          <Ionicons name="chevron-back" size={26} color={cores.primaria} />
        </Pressable>
        <Text style={estilos.mes}>{textoMes(mes)}</Text>
        <Pressable onPress={() => setMes(somarMes(mes, 1))} hitSlop={10} accessibilityLabel="Próximo mês" style={estilos.seta}>
          <Ionicons name="chevron-forward" size={26} color={cores.primaria} />
        </Pressable>
      </View>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {futuro && <Aviso tipo="info" texto="Mês que ainda não começou: a depreciação entra quando o mês chegar." />}
      {!d ? (
        !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          <View style={estilos.cartao}>
            <Text style={estilos.rotulo}>{rotuloRelatorio(qual, fazendas)}</Text>
            <Text style={estilos.rotulo}>Custos e despesas do mês (competência)</Text>
            <Text style={estilos.total}>{formatarMoeda(Number(d.custos))}</Text>
          </View>

          <Secao titulo="Lançado sozinho pelo sistema" />
          <View style={estilos.cartao}>
            <View style={estilos.par}>
              <Text style={estilos.parRotulo}>Depreciação e exaustão</Text>
              <Text style={estilos.parValor}>{formatarMoeda(Number(d.depreciacao))}</Text>
            </View>
            <Text style={estilos.nota}>
              {Number(d.depreciacao_bens)} {Number(d.depreciacao_bens) === 1 ? 'bem' : 'bens'} do Imobilizado, repartidos pelo rateio de cada bem. Não se digita nada: muda sozinho se o bem for alterado.
            </Text>
            {d.depreciacao_centros.map((c) => (
              <View key={c.centro} style={estilos.par}>
                <Text style={estilos.centro}>{c.centro}</Text>
                <Text style={estilos.centroValor}>{formatarMoeda(Number(c.valor))}</Text>
              </View>
            ))}
          </View>

          <Secao titulo="Precisa de alguém" />
          {!pendencias && (
            <View style={[estilos.cartao, { backgroundColor: cores.sucessoFundo }]}>
              <Text style={estilos.ok}>Nada pendente neste mês.</Text>
            </View>
          )}
          {(d.trato_faltas?.length ?? 0) > 0 && (
            <View style={estilos.cartao}>
              <Text style={estilos.pendTitulo}>Trato servido sem estoque para baixar ({d.trato_faltas!.length})</Text>
              <Text style={estilos.nota}>Falta de produto (lance a compra: o sistema completa sozinho), alimento sem ligação com o estoque ou produto sem o peso da embalagem.</Text>
              {d.trato_faltas!.slice(0, 12).map((f, k) => (
                <Pressable key={k} onPress={() => navegacao.navigate('TratoDia', { data: f.data })} style={estilos.link}>
                  <Text style={estilos.linkTexto}>
                    {f.data.split('-').reverse().join('/')} · Lote {f.lote} · {f.item}: {Number(f.kg).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg
                    {f.motivo === 'sem_ligacao' ? ' (sem ligação)' : f.motivo === 'sem_conversao' ? ' (sem peso da embalagem)' : ''}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
                </Pressable>
              ))}
            </View>
          )}
          {Number(d.a_classificar_qtde) > 0 && (
            <View style={estilos.cartao}>
              <Text style={estilos.pendTitulo}>
                {d.a_classificar_qtde} {Number(d.a_classificar_qtde) === 1 ? 'lançamento' : 'lançamentos'} em "Outros a classificar": {formatarMoeda(Number(d.a_classificar_valor))}
              </Text>
              <Text style={estilos.nota}>O sistema não soube em que conta pôr. Abra, veja a origem e acerte o tipo da despesa ou a categoria do produto no estoque.</Text>
              {d.a_classificar_contas.map((c) => (
                <Pressable key={c} onPress={() => navegacao.navigate('LancamentosConta', { codigo: c, nome: 'Outros a Classificar', periodo: 'outro', de, ate })} style={estilos.link}>
                  <Text style={estilos.linkTexto}>Ver os lançamentos de {c}</Text>
                  <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
                </Pressable>
              ))}
            </View>
          )}
          {Number(d.sem_centro_qtde) > 0 && (
            <View style={estilos.cartao}>
              <Text style={estilos.pendTitulo}>
                {d.sem_centro_qtde} {Number(d.sem_centro_qtde) === 1 ? 'lançamento' : 'lançamentos'} sem centro de custo: {formatarMoeda(Number(d.sem_centro_valor))}
              </Text>
              <Text style={estilos.nota}>Entram no resultado da fazenda, mas não em nenhum talhão, lote ou atividade. Para ver quais, abra o Balancete analítico e toque nas contas.</Text>
            </View>
          )}
          {d.bens_sem_vida.length > 0 && (
            <View style={estilos.cartao}>
              <Text style={estilos.pendTitulo}>Bens sem valor, data de ativação ou vida útil (não depreciam)</Text>
              {d.bens_sem_vida.map((b) => (
                <Pressable key={b.id} onPress={() => navegacao.navigate('ImobilizadoDetalhe', { id: b.id })} style={estilos.link}>
                  <Text style={estilos.linkTexto}>
                    Bem nº {b.numero} – {b.nome}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
                </Pressable>
              ))}
            </View>
          )}
          {d.bens_sem_rateio.length > 0 && !d.tem_rateio_depreciacao && (
            <View style={estilos.cartao}>
              <Text style={estilos.pendTitulo}>
                {d.bens_sem_rateio.length} {d.bens_sem_rateio.length === 1 ? 'bem sem rateio' : 'bens sem rateio'}: a depreciação foi para Despesas Operacionais
              </Text>
              <Text style={estilos.nota}>Informe o rateio no bem ou defina o rateio padrão de "Depreciação" em Financeiro › Parâmetros.</Text>
              <Pressable onPress={() => navegacao.navigate('Parametros')} style={estilos.link}>
                <Text style={estilos.linkTexto}>Abrir os Parâmetros</Text>
                <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
              </Pressable>
            </View>
          )}
          <Text style={estilos.nota}>
            A depreciação e a exaustão entram no Balancete, nos Centros de custo das abas e nos lançamentos de cada conta, pelo último dia de cada mês. O mês atual aparece desde já.
          </Text>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  meses: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  seta: { padding: 6 },
  mes: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura, minWidth: 110, textAlign: 'center' },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  rotulo: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '700' },
  total: { fontSize: tam.subtitulo + 6, fontWeight: '800', color: cores.cafe },
  par: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  parRotulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  parValor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  centro: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto },
  centroValor: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  ok: { fontSize: tam.texto, fontWeight: '700', color: cores.sucesso },
  pendTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.erro },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  linkTexto: { flex: 1, fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primaria },
});
