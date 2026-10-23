import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import Campo from '../../componentes/Campo';
import Interruptor from '../../componentes/Interruptor';
import { codigoLote, identAnimal } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ROTULO_SANIDADE, atrasada } from '../../lib/sanidade';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const lista = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);

/** Uma aplicação: diagnóstico, medicamentos com seus reforços (aplicar/desfazer) e excluir. */
export default function SanidadeDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'SanidadeDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [x, setX] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [outraDose, setOutraDose] = useState<{ id: string; dose: string; baixar: boolean } | null>(null);

  const carregar = useCallback(() => {
    consulta<any>(
      supabase
        .from('sanidade')
        .select(
          '*, lote:lotes ( numero, descricao ), animal:animais ( id, numero_interno, brinco, nome ),' +
            ' itens:sanidade_itens ( id, ordem, dose, unidade, baixou, insumo:insumos ( nome ), reforcos:sanidade_reforcos ( id, ordem, dias, data_prevista, dose, aplicado_em, baixou ) )',
        )
        .eq('id', params.id)
        .single(),
    )
      .then(setX)
      .catch((e) => setErro(traduzirErro(e)));
  }, [params.id]);

  useEffect(carregar, [carregar]);

  useLayoutEffect(() => {
    if (x) navegacao.setOptions({ title: ROTULO_SANIDADE[x.tipo] ?? 'Sanidade' });
  }, [navegacao, x]);

  function tocarReforco(r: any, nome: string, unidade: string) {
    if (r.aplicado_em) {
      return Alert.alert(`${r.ordem}º reforço: ${nome}`, `Aplicado em ${doBanco(r.aplicado_em)}.`, [
        { text: 'Desfazer (voltar para a agenda)', style: 'destructive', onPress: async () => {
          const { error } = await supabase.rpc('desfazer_reforco', { p_id: r.id });
          if (error) setErro(traduzirErro(error));
          else carregar();
        } },
        { text: 'Voltar', style: 'cancel' },
      ]);
    }
    const marcar = async (baixar: boolean) => {
      const { error } = await supabase.rpc('aplicar_reforco', { p_id: r.id, p_data: hojeBanco(), p_baixar: baixar });
      if (error) setErro(traduzirErro(error));
      else carregar();
    };
    Alert.alert(`${r.ordem}º reforço: ${nome}`, `Previsto para ${doBanco(r.data_prevista)}, dose de ${formatarNumero(r.dose, 2)} ${unidade} por cabeça.`, [
      { text: 'Aplicado hoje, dose prevista (baixar estoque)', onPress: () => marcar(true) },
      { text: 'Aplicado hoje com outra dose', onPress: () => setOutraDose({ id: r.id, dose: numeroParaCampo(Number(r.dose)), baixar: true }) },
      { text: 'Aplicado hoje (sem baixar estoque)', onPress: () => marcar(false) },
      { text: 'Voltar', style: 'cancel' },
    ]);
  }

  function excluir() {
    Alert.alert('Excluir aplicação', 'Excluir esta aplicação inteira, com os reforços? O que foi baixado do estoque volta para o estoque.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setExcluindo(true);
          const { error } = await supabase.rpc('excluir_sanidade', { p_id: x.id });
          setExcluindo(false);
          if (error) setErro(traduzirErro(error));
          else navegacao.goBack();
        },
      },
    ]);
  }

  if (!x) {
    return (
      <Tela rolar={false}>
        {erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}
      </Tela>
    );
  }

  const l = um(x.lote);
  const a = um(x.animal);
  const itens = lista(x.itens).sort((p: any, q: any) => p.ordem - q.ordem);
  const cabecalho: [string, string | null][] = [
    ['Data', doBanco(x.data)],
    ['Em quem', a ? `Animal ${identAnimal(a)}${a.nome ? ` ${a.nome}` : ''}` : l ? `Lote ${codigoLote(l.numero, sigla)}${l.descricao ? ` – ${l.descricao}` : ''}` : null],
    ['Cabeças tratadas', x.quantidade_animais ? formatarNumero(x.quantidade_animais) : null],
    ['Diagnóstico provável', x.diagnostico],
    ['Responsável', x.responsavel],
    ['Observações', x.observacoes],
  ];

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        {cabecalho
          .filter(([, v]) => v)
          .map(([r, v]) => (
            <View key={r} style={{ gap: 2 }}>
              <Text style={estilos.rotulo}>{r}</Text>
              <Text style={estilos.valor}>{v}</Text>
            </View>
          ))}
      </View>

      {itens.map((it: any) => {
        const nome = um(it.insumo)?.nome ?? '';
        const reforcos = lista(it.reforcos).sort((p: any, q: any) => p.ordem - q.ordem);
        return (
          <View key={it.id} style={estilos.cartao}>
            <Text style={estilos.tituloMed}>
              {it.ordem}. {nome}
            </Text>
            <Text style={estilos.texto}>
              Dose de {formatarNumero(it.dose, 2)} {it.unidade ?? ''} por cabeça{it.baixou ? ', baixada do estoque' : ''}
            </Text>
            {reforcos.length === 0 ? (
              <Text style={estilos.suave}>Dose única.</Text>
            ) : (
              reforcos.map((r: any) => (
                <View key={r.id} style={estilos.reforco}>
                  <Pressable onPress={() => tocarReforco(r, nome, it.unidade ?? '')} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                  <Text style={estilos.reforcoTitulo}>
                    {r.ordem}º reforço: {doBanco(r.data_prevista)} ({r.dias} dias), {formatarNumero(r.dose, 2)} {it.unidade ?? ''}
                  </Text>
                  <Text style={[estilos.suave, !r.aplicado_em && atrasada(r.data_prevista) && { color: cores.erro, fontWeight: '700' }]}>
                    {r.aplicado_em ? `Aplicado em ${doBanco(r.aplicado_em)}${r.baixou ? ', baixado do estoque' : ''}` : atrasada(r.data_prevista) ? 'ATRASADO. Toque para marcar.' : 'A aplicar. Toque para marcar.'}
                  </Text>
                  </Pressable>
                  {outraDose && outraDose.id === r.id && (
                    <View style={{ gap: 8, marginTop: 6 }}>
                      <Campo
                        rotulo={`Dose aplicada por cabeça (${it.unidade ?? ''})`}
                        value={outraDose.dose}
                        onChangeText={(t) => setOutraDose((o) => (o ? { ...o, dose: t.replace(/[^\d.,]/g, '') } : o))}
                        keyboardType="decimal-pad"
                        ajuda="É esta dose que baixa do estoque."
                      />
                      <Interruptor rotulo="Baixar do estoque" valor={outraDose.baixar} aoMudar={(v) => setOutraDose((o) => (o ? { ...o, baixar: v } : o))} />
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Botao titulo="Cancelar" tipo="secundario" onPress={() => setOutraDose(null)} />
                        </View>
                        <View style={{ flex: 1.3 }}>
                          <Botao
                            titulo="Confirmar"
                            onPress={async () => {
                              if (!outraDose) return;
                              const d = lerNumero(outraDose.dose);
                              if (!d || d <= 0) return setErro('Dose inválida.');
                              const { error } = await supabase.rpc('aplicar_reforco', { p_id: r.id, p_data: hojeBanco(), p_baixar: outraDose.baixar, p_dose: d });
                              if (error) return setErro(traduzirErro(error));
                              setOutraDose(null);
                              carregar();
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        );
      })}

      {a && <Botao titulo="Abrir ficha do animal" tipo="secundario" onPress={() => navegacao.navigate('AnimalForm', { id: a.id })} />}
      <Botao titulo="Excluir aplicação" tipo="perigo" onPress={excluir} carregando={excluindo} />
      <Text style={estilos.suave}>Aplicação não se altera. Se algo saiu errado, exclua e lance de novo.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 8 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  valor: { fontSize: tam.texto, color: cores.texto, fontWeight: '600' },
  tituloMed: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura },
  texto: { fontSize: tam.texto, color: cores.texto },
  suave: { fontSize: tam.pequeno, color: cores.textoSuave },
  reforco: { backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  reforcoTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.cafe },
});
