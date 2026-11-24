import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { somarDias } from '../../lib/reproducao';
import { nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { perguntar } from '../../lib/perguntar';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type ItemTrato = { id: string; ordem: number; nome: string; kg_previsto: number; kg_servido: number; falta_kg: number; sem_estoque: string | null; insumo_id: string | null };
type Trato = { id: string; data: string; cabecas: number; situacao: string; observacoes: string | null; dieta_id: string | null; lote: { numero: number; descricao: string | null } | null; itens: ItemTrato[] };

const SITUACAO: Record<string, string> = { automatico: 'Pela dieta', corrigido: 'Corrigido', sem_trato: 'Não houve trato' };
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * V175: Pecuário › Trato do dia. O trato de cada lote com dieta "fornecer sozinho" já vem lançado
 * (o sistema gera todo dia e baixa o estoque). Aqui só se corrige a exceção: o que foi servido diferente
 * ou o dia em que não houve trato.
 */
export default function TratoDia() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'TratoDia'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [data, setData] = useState(params?.data ?? hojeBanco());
  const [tratos, setTratos] = useState<Trato[] | null>(null);
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const hoje = hojeBanco();

  const carregar = useCallback(async () => {
    if (!fid) return;
    setErro(null);
    setTratos(null);
    try {
      await supabase.rpc('gerar_fornecimentos', { p_fazenda: fid }); // o que faltar até hoje (normalmente já rodou de madrugada)
      let dia = data;
      if (params?.id) {
        const { data: f } = await supabase.from('fornecimentos').select('data').eq('id', params.id).maybeSingle();
        if (f?.data && f.data !== data) {
          dia = f.data;
          setData(f.data);
        }
      }
      const l = await consulta<any[]>(
        supabase
          .from('fornecimentos')
          .select('id, data, cabecas, situacao, observacoes, dieta_id, lote:lotes ( numero, descricao ), itens:fornecimento_itens ( id, ordem, nome, kg_previsto, kg_servido, falta_kg, sem_estoque, insumo_id )')
          .eq('fazenda_id', fid)
          .eq('data', dia),
      );
      const ts: Trato[] = l
        .map((t) => ({
          ...t,
          lote: um(t.lote),
          itens: ((t.itens as any[]) ?? [])
            .map((i) => ({ ...i, kg_previsto: Number(i.kg_previsto), kg_servido: Number(i.kg_servido), falta_kg: Number(i.falta_kg) }))
            .sort((a, b) => a.ordem - b.ordem),
        }))
        .sort((a, b) => (a.lote?.numero ?? 0) - (b.lote?.numero ?? 0));
      setTratos(ts);
      setEdicao(Object.fromEntries(ts.flatMap((t) => t.itens.map((i) => [i.id, numeroParaCampo(i.kg_servido)]))));
    } catch (e) {
      setErro(traduzirErro(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, data]);
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function gravar(t: Trato, semTrato = false) {
    setErro(null);
    setAviso(null);
    if (semTrato && !(await perguntar('Não houve trato', `Marcar que o lote ${nomeLote(t.lote, sigla)} não teve trato em ${doBanco(t.data)}? O que tinha saído do estoque volta.`, 'Marcar', 'Voltar'))) return;
    const itens = t.itens.map((i) => ({ id: i.id, kg_servido: lerNumero(edicao[i.id] ?? '') ?? 0 }));
    if (!semTrato && itens.some((i) => i.kg_servido < 0)) return setErro('Quantidade inválida.');
    setGravando(t.id);
    const { error } = await supabase.rpc('corrigir_fornecimento', { p: { id: t.id, sem_trato: semTrato, itens } });
    setGravando(null);
    if (error) return setErro(traduzirErro(error));
    setAviso(semTrato ? 'Marcado: não houve trato. O estoque voltou.' : 'Trato gravado com o que foi servido. O estoque e o custo do lote foram acertados.');
    carregar();
  }

  const [a, m, d] = data.split('-').map(Number);
  const diaSemana = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];

  return (
    <Tela>
      <View style={estilos.dias}>
        <Pressable onPress={() => setData(somarDias(data, -1))} hitSlop={10} accessibilityLabel="Dia anterior" style={estilos.seta}>
          <Ionicons name="chevron-back" size={26} color={cores.primaria} />
        </Pressable>
        <View style={{ alignItems: 'center', minWidth: 140 }}>
          <Text style={estilos.dia}>{doBanco(data)}</Text>
          <Text style={estilos.nota}>{data === hoje ? 'hoje' : diaSemana}</Text>
        </View>
        <Pressable onPress={() => data < hoje && setData(somarDias(data, 1))} hitSlop={10} accessibilityLabel="Próximo dia" style={[estilos.seta, data >= hoje && { opacity: 0.3 }]}>
          <Ionicons name="chevron-forward" size={26} color={cores.primaria} />
        </Pressable>
      </View>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {!tratos ? (
        !erro && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : !tratos.length ? (
        <View style={estilos.cartao}>
          <Text style={estilos.nota}>
            Nenhum trato neste dia. O trato sai sozinho para os lotes que têm dieta com "Fornecer sozinho todo dia" (Pecuário › Dietas), a partir da data marcada nela.
          </Text>
          <Botao titulo="Abrir as Dietas" tipo="secundario" onPress={() => navegacao.push('DietaForm', {})} />
        </View>
      ) : (
        tratos.map((t) => {
          const total = t.itens.reduce((s, i) => s + (lerNumero(edicao[i.id] ?? '') ?? 0), 0);
          return (
            <View key={t.id} style={estilos.cartao}>
              <View style={estilos.topo}>
                <Text style={estilos.lote}>{nomeLote(t.lote, sigla)}</Text>
                <Text style={[estilos.situacao, t.situacao !== 'automatico' && { color: cores.cafe }]}>{SITUACAO[t.situacao] ?? t.situacao}</Text>
              </View>
              <Text style={estilos.nota}>
                {formatarNumero(t.cabecas)} cabeças · servido no dia {formatarNumero(total, 1)} kg (matéria natural)
              </Text>
              {t.itens.map((i) => (
                <View key={i.id} style={estilos.item}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={estilos.itemNome}>{i.nome}</Text>
                    <Text style={estilos.nota}>Pela dieta: {formatarNumero(i.kg_previsto, 1)} kg</Text>
                    {i.falta_kg > 0 && (
                      <Text style={estilos.falta}>
                        {i.sem_estoque === 'sem_ligacao'
                          ? 'Alimento sem ligação com o estoque: não baixa nem vai ao custo (ligue em Pecuário › Alimentos).'
                          : i.sem_estoque === 'sem_conversao'
                            ? 'O produto do estoque não está em kg: informe o conteúdo da embalagem em kg no cadastro do produto.'
                            : `Faltaram ${formatarNumero(i.falta_kg, 1)} kg no estoque. Ao lançar a compra, o sistema completa sozinho.`}
                      </Text>
                    )}
                  </View>
                  <View style={{ width: 110 }}>
                    <Campo rotulo="Servido (kg)" value={edicao[i.id] ?? ''} onChangeText={(x) => setEdicao((e) => ({ ...e, [i.id]: x }))} keyboardType="decimal-pad" />
                  </View>
                </View>
              ))}
              {t.observacoes ? <Text style={estilos.nota}>Obs.: {t.observacoes}</Text> : null}
              <View style={estilos.botoes}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Gravar o servido" tipo="secundario" carregando={gravando === t.id} onPress={() => gravar(t)} />
                </View>
                {t.situacao !== 'sem_trato' && (
                  <View style={{ flex: 1 }}>
                    <Botao titulo="Não houve trato" tipo="perigo" onPress={() => gravar(t, true)} />
                  </View>
                )}
              </View>
              {t.dieta_id && (
                <Text style={estilos.link} onPress={() => navegacao.push('DietaForm', { id: t.dieta_id! })}>
                  Ver a dieta deste lote
                </Text>
              )}
            </View>
          );
        })
      )}
      <Text style={estilos.nota}>
        O trato é lançado sozinho toda madrugada pela dieta de cada lote (cabeças do dia × kg por cabeça) e baixa o estoque pelo custo médio; o custo vai para o centro de custo do lote. Só corrija quando o servido foi diferente.
      </Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  dias: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  seta: { padding: 6 },
  dia: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  lote: { flex: 1, fontSize: tam.texto + 1, fontWeight: '800', color: cores.primariaEscura },
  situacao: { fontSize: tam.pequeno, fontWeight: '700', color: cores.primaria },
  item: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda, paddingTop: 8 },
  itemNome: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  falta: { fontSize: tam.pequeno, color: cores.erro, lineHeight: 18 },
  botoes: { flexDirection: 'row', gap: 10 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
});
