import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { abrirFotoDocumento } from '../../lib/documentos';
import { quandoFoi } from '../../lib/campo';
import { cores, tam } from '../../tema';

const ROTULO: Record<string, string> = {
  contagem: 'Contagem', vistoria: 'Vistoria da manga', tarefa_feita: 'Tarefa cumprida', sanidade: 'Sanidade', nascimento: 'Nascimento',
  morte: 'Morte', sumido: 'Sumido', achado: 'Achado', cio: 'Cio', pesagem: 'Pesagem', transferencia: 'Transferência', trato: 'Trato do dia', chuva: 'Chuva',
};
/** O que o sistema lança ao confirmar (os outros só ficam registrados). */
const LANCA: Record<string, string> = {
  sanidade: 'Ao confirmar, lança na Sanidade (com a baixa do estoque dos medicamentos).',
  nascimento: 'Ao confirmar, o bezerro entra no rebanho (lote da mãe) e o parto vai para a Reprodução.',
  morte: 'Ao confirmar, sai do rebanho (movimentação de morte).',
  pesagem: 'Ao confirmar, a pesagem ganha o número e os pesos vão para os animais com brinco.',
  transferencia: 'Ao confirmar, o sistema faz a troca de manga ou de lote.',
  trato: 'Ao confirmar, corrige o trato do dia (o que foi servido e o estoque) e grava a leitura de cocho.',
  chuva: 'Ao confirmar, grava a chuva (Agrícola › Clima e chuva).',
};

/** V184 – O gerente confere o que o vaqueiro lançou no campo (Modo Vaqueiro): confirma ou rejeita com o motivo. */
export default function CampoConferir() {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [ver, setVer] = useState<string[]>(['pendente']);
  const [lista, setLista] = useState<any[] | null>(null);
  const [rejeitando, setRejeitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);

  const carregar = useCallback(async () => {
    if (!fid) return;
    try {
      let q = supabase.from('campo_registros').select('*').eq('fazenda_id', fid).order('feito_em', { ascending: false }).limit(200);
      q = ver[0] === 'pendente' ? q.eq('situacao', 'pendente') : q.neq('situacao', 'pendente');
      setLista(await consulta<any[]>(q));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid, ver]);
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function conferir(ids: string[], aceitar: boolean) {
    setErro(null);
    setAviso(null);
    if (!aceitar && !motivo.trim()) return setErro('Informe o motivo da rejeição.');
    setTrabalhando(true);
    const { data, error } = await supabase.rpc('campo_conferir', { p_ids: ids, p_aceitar: aceitar, p_motivo: aceitar ? null : motivo.trim() });
    setTrabalhando(false);
    if (error) return setErro(traduzirErro(error));
    const r = (data ?? {}) as { feitos?: number; erros?: { resumo: string; erro: string }[] };
    const n = Number(r.feitos) || 0;
    if (r.erros?.length) setErro(`Não deu para lançar:\n• ${r.erros.map((x) => `${x.resumo}: ${x.erro}`).join('\n• ')}\nCorrija no sistema e confirme de novo, ou rejeite.`);
    setAviso(n ? (aceitar ? `${n} ${n === 1 ? 'lançamento confirmado' : 'lançamentos confirmados'}.` : 'Lançamento rejeitado.') : null);
    setRejeitando(null);
    setMotivo('');
    carregar();
  }

  const pendentes = (lista ?? []).filter((x) => x.situacao === 'pendente');

  return (
    <Tela>
      <Text style={estilos.nota}>
        O que o vaqueiro lança no Modo Vaqueiro chega aqui. Contagem que não confere e manga com item Ruim também viram aviso na agenda da fazenda, na hora em que chegam.
      </Text>
      <Escolha rotulo="Ver" opcoes={[{ valor: 'pendente', rotulo: 'A conferir' }, { valor: 'feitos', rotulo: 'Já conferidos' }]} valor={ver} aoMudar={(v) => v.length && setVer(v)} />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {lista === null ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : lista.length === 0 ? (
        <Text style={estilos.dica}>{ver[0] === 'pendente' ? 'Nada a conferir.' : 'Nenhum lançamento conferido ainda.'}</Text>
      ) : (
        <>
          {ver[0] === 'pendente' && pendentes.length > 1 && (
            <Botao titulo={`Confirmar todos (${pendentes.length})`} onPress={() => conferir(pendentes.map((x) => x.id), true)} carregando={trabalhando} />
          )}
          {lista.map((x) => {
            const d = x.dados ?? {};
            const alerta =
              (x.tipo === 'contagem' && Number(d.contadas) !== Number(d.esperado)) ||
              (x.tipo === 'vistoria' && ['agua', 'cocho', 'capim', 'cerca'].some((k) => d[k] === 'ruim')) ||
              ['morte', 'sumido', 'cio'].includes(x.tipo) ||
              (x.tipo === 'sanidade' && !(d.medicamentos ?? []).length);
            return (
              <View key={x.id} style={[estilos.cartao, alerta && { borderColor: cores.cafe }]}>
                <Text style={estilos.tipo}>{ROTULO[x.tipo] ?? x.tipo} · {quandoFoi(x.feito_em)} · {x.autor_nome ?? 'Vaqueiro'}</Text>
                <Text style={estilos.resumo}>{x.resumo}</Text>
                {!!d.obs && <Text style={estilos.nota}>Obs.: {d.obs}</Text>}
                {x.situacao === 'pendente' && x.tipo === 'contagem' && !d.lote_id && <Text style={estilos.nota}>Gado sem lote: ao confirmar, só fica registrado. Identifique e cadastre os animais (ou ponha num lote) em Pecuário.</Text>}
                {x.tipo === 'sanidade' && !!d.peso && <Text style={estilos.nota}>Peso estimado: {d.peso} kg</Text>}
                {x.situacao === 'pendente' && x.tipo === 'vistoria' && !!d.sal_insumo_id && <Text style={estilos.nota}>Ao confirmar, baixa {d.sal_qtd} do sal mineral no estoque.</Text>}
                {x.situacao === 'pendente' && LANCA[x.tipo] && !(x.tipo === 'sanidade' && !(d.medicamentos ?? []).length) && <Text style={estilos.nota}>{LANCA[x.tipo]}</Text>}
                {x.situacao === 'pendente' && !!x.erro_aplicar && <Text style={[estilos.nota, { color: cores.erro, fontWeight: '700' }]}>Não lançou: {x.erro_aplicar}</Text>}
                {x.latitude != null && <Text style={estilos.nota}>Local: {Number(x.latitude).toFixed(5)}, {Number(x.longitude).toFixed(5)}</Text>}
                {(x.fotos ?? []).map((f: string, i: number) => (
                  <Text key={f} style={estilos.link} onPress={async () => !(await abrirFotoDocumento(f)) && setErro('Não foi possível abrir a foto.')}>
                    📷 Ver a foto{(x.fotos ?? []).length > 1 ? ` ${i + 1}` : ''}
                  </Text>
                ))}
                {x.situacao === 'pendente' ? (
                  rejeitando === x.id ? (
                    <>
                      <Campo rotulo="Motivo da rejeição *" value={motivo} onChangeText={setMotivo} />
                      <View style={estilos.linha}>
                        <View style={{ flex: 1 }}><Botao titulo="Rejeitar" tipo="perigo" onPress={() => conferir([x.id], false)} carregando={trabalhando} /></View>
                        <View style={{ flex: 1 }}><Botao titulo="Desistir" tipo="secundario" onPress={() => setRejeitando(null)} /></View>
                      </View>
                    </>
                  ) : (
                    <View style={estilos.linha}>
                      <View style={{ flex: 1 }}><Botao titulo="Confirmar" onPress={() => conferir([x.id], true)} carregando={trabalhando} /></View>
                      <View style={{ flex: 1 }}><Botao titulo="Rejeitar" tipo="secundario" onPress={() => { setRejeitando(x.id); setMotivo(''); }} /></View>
                    </View>
                  )
                ) : (
                  <Text style={[estilos.nota, { fontWeight: '700', color: x.situacao === 'rejeitado' ? cores.erro : cores.primaria }]}>
                    {x.situacao === 'confirmado' ? 'Confirmado' : x.situacao === 'rejeitado' ? `Rejeitado: ${x.motivo ?? ''}` : 'Aplicado'}
                    {x.conferido_em ? ` em ${quandoFoi(x.conferido_em)}` : ''}
                  </Text>
                )}
              </View>
            );
          })}
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', marginTop: 8 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  tipo: { fontSize: tam.pequeno, fontWeight: '800', color: cores.cafe },
  resumo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  linha: { flexDirection: 'row', gap: 10 },
});
