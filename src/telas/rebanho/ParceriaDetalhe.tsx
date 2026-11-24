import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { codigoLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { lerParcerias, type ResumoParceria } from '../../lib/parcerias';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** V208 – ficha da parceria: dados de entrada, condições e os itens (com o lote de cada um; sem lote, informa aqui). */
export default function ParceriaDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ParceriaDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [p, setP] = useState<ResumoParceria | null>(null);
  const [abertas, setAbertas] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lotes, setLotes] = useState<Record<string, string>>({});
  const [gravando, setGravando] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: p ? `Parceria nº ${p.numero}` : 'Parceria' });
  }, [navegacao, p]);

  const carregar = useCallback(async () => {
    if (!fid) return;
    try {
      const l = await lerParcerias(fid, { id: params.id });
      setP(l[0] ?? null);
      if (!l[0]) setErro('Parceria não encontrada nesta fazenda.');
      const { data: c } = await supabase.rpc('parceria_cab_em', { p_id: params.id, p_data: new Date().toISOString().slice(0, 10) });
      setAbertas(typeof c === 'number' ? c : null);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid, params.id]);
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function porNoLote(movId: string) {
    setErro(null);
    setAviso(null);
    const n = Number(lotes[movId] ?? '');
    if (!Number.isInteger(n) || n < 1) return setErro('Informe o nº do lote.');
    setGravando(movId);
    const { data: r, error } = await supabase.rpc('parceria_por_no_lote', { p_mov: movId, p_lote: n });
    setGravando(null);
    if (error) return setErro(traduzirErro(error));
    const x = r as { lote: number; novo: boolean; cabecas: number };
    setAviso(`${formatarNumero(x.cabecas)} ${x.cabecas === 1 ? 'animal foi' : 'animais foram'} para o lote ${codigoLote(x.lote, sigla)}${x.novo ? ' (lote cadastrado agora; manga e outros dados em Pecuário › Lotes)' : ''}.`);
    setLotes((l) => ({ ...l, [movId]: '' }));
    carregar();
  }

  if (!p) {
    return <Tela>{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator color={cores.primaria} />}</Tela>;
  }

  return (
    <Tela>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Parceria nº {p.numero} · {p.situacao === 'aberta' ? 'aberta' : 'encerrada'}</Text>
        <Text style={estilos.titulo}>{p.parceiro}</Text>
        <Dado rotulo="Data da entrada" valor={doBanco(p.dataEntrada)} />
        <Dado rotulo="Quantidade" valor={`${formatarNumero(p.cabecas)} cab.${abertas != null && p.situacao === 'aberta' ? ` · ${formatarNumero(abertas)} em aberto` : ''}`} />
        <Dado rotulo="Sexo" valor={p.sexos} />
        {/* V209: peso bruto e médio de entrada por sexo */}
        {p.pesoSexo.length ? (
          p.pesoSexo.map((l) => {
            const [sx, resto] = [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)];
            return <Dado key={sx} rotulo={`Peso de entrada · ${sx}`} valor={resto} />;
          })
        ) : (
          <Dado rotulo="Peso de entrada" valor={null} />
        )}
        {p.pesoSexo.length > 1 && p.pesoKg != null ? (
          <Dado rotulo="Peso de entrada · total" valor={`peso bruto ${formatarNumero(p.pesoKg, 1)} kg · média ${formatarNumero(p.pesoKg / Math.max(1, p.cabecas), 2)} kg`} />
        ) : null}
        <Dado rotulo="Idade na entrada" valor={p.idades} />
        <Dado rotulo="Raça" valor={p.racas} />
        <Dado rotulo="Ferro" valor={p.ferros} />
        <Dado rotulo="Condições" valor={p.condicoes} />
        {p.dataSaida ? <Dado rotulo="Encerrada em" valor={doBanco(p.dataSaida)} /> : null}
        {p.vendaNumero ? <Dado rotulo="Veio da venda" valor={`nº ${p.vendaNumero} (o gado vendido ficou na fazenda)`} /> : null}
      </View>

      <Secao titulo={p.itens.length > 1 ? `Itens da entrada (${p.itens.length})` : 'Entrada'} />
      {p.itens.map((it, k) => (
        <View key={it.movId} style={estilos.cartao}>
          <Text style={estilos.item}>
            {p.itens.length > 1 ? `Item ${k + 1} · ` : ''}
            {formatarNumero(it.cabecas)} cab. · {it.lote ? `lote ${codigoLote(it.lote, sigla)}` : 'sem lote'}
          </Text>
          {it.sexos ? <Text style={estilos.nota}>{it.sexos}{it.idades ? ` · ${it.idades}` : ''}</Text> : null}
          {it.racas || it.ferros ? <Text style={estilos.nota}>{[it.racas && `Raça: ${it.racas}`, it.ferros && `Ferro: ${it.ferros}`].filter(Boolean).join(' · ')}</Text> : null}
          {it.pesoSexo.map((l) => (
            <Text key={l} style={estilos.nota}>Entrada · {l}</Text>
          ))}
          {it.semLote > 0 && (
            <>
              <Text style={[estilos.nota, { color: cores.erro, fontWeight: '700' }]}>
                {formatarNumero(it.semLote)} {it.semLote === 1 ? 'animal sem lote' : 'animais sem lote'}: informe o lote (para a saída da parceria eles precisam estar num lote).
              </Text>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Campo rotulo="Lote nº" value={lotes[it.movId] ?? ''} onChangeText={(t) => setLotes((l) => ({ ...l, [it.movId]: t.replace(/\D/g, '').slice(0, 6) }))} keyboardType="number-pad" />
                </View>
                <View style={{ width: 150, paddingTop: 26 }}>
                  <Botao titulo="Pôr no lote" onPress={() => porNoLote(it.movId)} carregando={gravando === it.movId} />
                </View>
              </View>
              <Text style={estilos.nota}>Lote que não existe é cadastrado agora, com o sexo, a raça, o ferro e a idade dos animais.</Text>
            </>
          )}
        </View>
      ))}
      <Text style={estilos.nota}>A saída da parceria (com o acerto) é em Pecuário › Movimentações › Saída da parceria, escolhendo o lote.</Text>
    </Tela>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || '—'}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 6 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  titulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  item: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 2, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
