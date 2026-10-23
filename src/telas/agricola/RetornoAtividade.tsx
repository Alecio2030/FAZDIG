import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarQtd, lerNumero } from '../../lib/formatos';
import { tituloAtividade } from '../../lib/atividades';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const n = (t: string) => lerNumero(t);
const q = (v: any) => formatarQtd(Number(v), 4);

type Prod = { insumoId: string; nome: string; unidade: string; saiu: number; voltou: number; custo: number | null };

/**
 * Atividades › Retorno (V148): a atividade é o documento de saída (nº automático). O que sobrou de cada
 * produto volta ao estoque pelo nº da atividade, com o mesmo valor unitário da saída; o custo da atividade
 * e do talhão fica só com o consumido. Tudo na unidade de estoque.
 */
export default function RetornoAtividade({ fid, numeroInicial }: { fid: string; numeroInicial?: number }) {
  const [num, setNum] = useState(numeroInicial ? String(numeroInicial) : '');
  const [at, setAt] = useState<any>(null);
  const [prods, setProds] = useState<Prod[]>([]);
  const [retornos, setRetornos] = useState<any[]>([]);
  const [volta, setVolta] = useState<Record<string, string>>({});
  const [data, setData] = useState(hojeBR());
  const [obs, setObs] = useState('');
  const [recentes, setRecentes] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // atividades recentes com produto baixado do estoque e ainda com saldo para voltar
  const lerRecentes = useCallback(async () => {
    const d = await consulta<any[]>(
      supabase
        .from('atividades_agricolas')
        .select('id, numero, data, tipo, subtipo, itens:atividade_insumos ( quantidade_estoque, retornado, baixou )')
        .eq('fazenda_id', fid)
        .order('numero', { ascending: false })
        .limit(40),
    ).catch(() => [] as any[]);
    setRecentes(d.filter((a) => (a.itens ?? []).some((i: any) => i.baixou && Number(i.quantidade_estoque) - Number(i.retornado ?? 0) > 0.00001)).slice(0, 8));
  }, [fid]);

  const abrir = useCallback(
    async (texto: string) => {
      setErro(null);
      setAt(null);
      setProds([]);
      setRetornos([]);
      setVolta({});
      const numero = Number(String(texto).replace(/\D/g, ''));
      if (!numero) return setErro('Informe o nº da atividade.');
      try {
        const r = await consulta<any[]>(
          supabase
            .from('atividades_agricolas')
            .select('id, numero, data, tipo, subtipo, areas:atividade_areas ( area:areas ( nome ) ), itens:atividade_insumos ( insumo_id, ordem, quantidade_estoque, custo_unitario, baixou, retornado, insumo:insumos ( nome, unidade ) )')
            .eq('fazenda_id', fid)
            .eq('numero', numero)
            .limit(1),
        );
        if (!r.length) return setErro(`Atividade nº ${numero} não encontrada nesta fazenda.`);
        const a = r[0];
        const porProduto: Record<string, Prod> = {};
        for (const i of (a.itens ?? []).sort((x: any, y: any) => x.ordem - y.ordem)) {
          if (!i.baixou) continue;
          const ins = um(i.insumo);
          const p = (porProduto[i.insumo_id] ??= { insumoId: i.insumo_id, nome: ins?.nome ?? 'Produto', unidade: ins?.unidade ?? '', saiu: 0, voltou: 0, custo: i.custo_unitario != null ? Number(i.custo_unitario) : null });
          p.saiu += Number(i.quantidade_estoque);
          p.voltou += Number(i.retornado ?? 0);
        }
        const movs = await consulta<any[]>(supabase.from('estoque_movimentos').select('id, insumo_id, data, quantidade, valor_unitario, observacoes').eq('atividade_id', a.id).eq('tipo', 'retorno').order('data'));
        setAt(a);
        setProds(Object.values(porProduto));
        setRetornos(movs);
      } catch (e) {
        setErro(traduzirErro(e));
      }
    },
    [fid],
  );

  useEffect(() => {
    lerRecentes();
    if (numeroInicial) abrir(String(numeroInicial));
  }, [numeroInicial, abrir, lerRecentes]);

  const valorVolta = prods.reduce((s, p) => s + (n(volta[p.insumoId] ?? '') ?? 0) * (p.custo ?? 0), 0);

  async function gravar() {
    setErro(null);
    setAviso(null);
    if (!at) return;
    if (!dataValida(data)) return setErro('Informe a data do retorno.');
    const lista = prods.filter((p) => (n(volta[p.insumoId] ?? '') ?? 0) > 0);
    if (!lista.length) return setErro('Informe quanto voltou de pelo menos um produto.');
    for (const p of lista) {
      if (n(volta[p.insumoId])! > p.saiu - p.voltou + 0.00001) return setErro(`${p.nome}: podem voltar no máximo ${q(p.saiu - p.voltou)} ${p.unidade}.`);
    }
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('retornar_atividade', {
      p: { atividade: at.id, data: paraBanco(data), obs, itens: lista.map((p) => ({ insumo: p.insumoId, quantidade: n(volta[p.insumoId]) })) },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; valor: number };
    setAviso(`Retorno da atividade nº ${res.numero} gravado: ${formatarMoeda(Number(res.valor))} voltaram ao estoque e saíram do custo da atividade.`);
    setObs('');
    abrir(String(res.numero));
    lerRecentes();
  }

  function desfazer(m: any) {
    const p = prods.find((x) => x.insumoId === m.insumo_id);
    Alert.alert('Desfazer retorno', `Desfazer o retorno de ${q(m.quantidade)} ${p?.unidade ?? ''} de ${p?.nome ?? 'produto'} (${doBanco(m.data)})? Sai de novo do estoque e volta ao custo da atividade.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desfazer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_retorno_atividade', { p_mov: m.id });
          if (error) return setErro(traduzirErro(error));
          setAviso('Retorno desfeito.');
          abrir(String(at.numero));
          lerRecentes();
        },
      },
    ]);
  }

  const locais = at ? (at.areas ?? []).map((x: any) => um(x.area)?.nome).filter(Boolean).join(', ') : '';

  return (
    <>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Nº da atividade *" value={num} onChangeText={(t) => setNum(t.replace(/\D/g, ''))} keyboardType="number-pad" onSubmitEditing={() => abrir(num)} />
        </View>
        <View style={{ width: 110, paddingTop: 26 }}>
          <Botao titulo="Abrir" tipo="secundario" onPress={() => abrir(num)} />
        </View>
      </View>
      {!at && recentes.length > 0 && (
        <>
          <Text style={estilos.nota}>Atividades recentes com produto que saiu do estoque:</Text>
          <View style={estilos.chips}>
            {recentes.map((a) => (
              <Pressable
                key={a.id}
                style={({ pressed }) => [estilos.chip, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  setNum(String(a.numero));
                  abrir(String(a.numero));
                }}
                accessibilityRole="button"
              >
                <Text style={estilos.chipTexto}>
                  Nº {a.numero} · {doBanco(a.data)} · {tituloAtividade(a)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {at && (
        <>
          <View style={estilos.cartao}>
            <Text style={estilos.titulo}>
              Atividade nº {at.numero} · {doBanco(at.data)}
            </Text>
            <Text style={estilos.nota}>
              {tituloAtividade(at)}
              {locais ? ` · ${locais}` : ''}
            </Text>
          </View>
          {prods.length === 0 ? (
            <Text style={estilos.nota}>Nenhum produto desta atividade saiu do estoque: não há o que voltar.</Text>
          ) : (
            <>
              <CampoData rotulo="Data do retorno *" valor={data} aoMudar={setData} />
              {prods.map((p) => {
                const pode = p.saiu - p.voltou;
                return (
                  <View key={p.insumoId} style={estilos.item}>
                    <Text style={estilos.titulo}>{p.nome}</Text>
                    <Par a="Saiu do estoque" b={`${q(p.saiu)} ${p.unidade}`} />
                    {p.voltou > 0 && <Par a="Já voltou" b={`${q(p.voltou)} ${p.unidade}`} />}
                    <Par a="Pode voltar (no máximo)" b={`${q(pode)} ${p.unidade}`} />
                    <Par a="Valor unitário da saída" b={p.custo != null ? `${formatarMoeda(p.custo)} / ${p.unidade}` : 'sem custo'} />
                    {pode > 0.00001 ? (
                      <Campo
                        rotulo={`Quantidade que voltou (${p.unidade})`}
                        value={volta[p.insumoId] ?? ''}
                        onChangeText={(t) => setVolta((v) => ({ ...v, [p.insumoId]: t }))}
                        keyboardType="decimal-pad"
                        placeholder="0"
                      />
                    ) : (
                      <Text style={estilos.nota}>Já voltou tudo o que saiu.</Text>
                    )}
                  </View>
                );
              })}
              {valorVolta > 0 && (
                <View style={estilos.calc}>
                  <Par a="Volta ao estoque (e sai do custo)" b={formatarMoeda(valorVolta)} forte />
                </View>
              )}
              <Campo rotulo="Observação" value={obs} onChangeText={setObs} autoCapitalize="sentences" />
              <Botao titulo="Dar entrada no estoque" onPress={gravar} carregando={salvando} />
            </>
          )}
          {retornos.length > 0 && (
            <>
              <Text style={[estilos.titulo, { marginTop: 8 }]}>Retornos já lançados</Text>
              {retornos.map((m) => {
                const p = prods.find((x) => x.insumoId === m.insumo_id);
                return (
                  <View key={m.id} style={estilos.retorno}>
                    <Text style={[estilos.nota, { flex: 1 }]}>
                      {doBanco(m.data)} · {p?.nome ?? 'Produto'}: {q(m.quantidade)} {p?.unidade ?? ''}
                      {m.valor_unitario != null ? ` · ${formatarMoeda(Number(m.quantidade) * Number(m.valor_unitario))}` : ''}
                    </Text>
                    <Text style={[estilos.link, { color: cores.erro }]} onPress={() => desfazer(m)}>
                      Desfazer
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </>
      )}
      {!at && (
        <Text style={estilos.nota}>
          A atividade é o documento de saída do estoque. Se sobrou produto (ex.: saíram 20 L e foram usados 12 L), informe o nº da atividade e a quantidade que voltou: entra no estoque com o mesmo valor unitário da saída e sai do custo da atividade e do talhão.
        </Text>
      )}
    </>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '700', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  titulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: cores.primaria, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: cores.cartao },
  chipTexto: { fontSize: tam.pequeno, color: cores.primariaEscura, fontWeight: '600' },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.primaria, padding: 12, gap: 4 },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  calc: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  retorno: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
});
