import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../lib/alerta';
import { useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../componentes/Tela';
import Campo from '../componentes/Campo';
import CampoData from '../componentes/CampoData';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import Escolha from '../componentes/Escolha';
import Secao from '../componentes/Secao';
import Lista from '../componentes/Lista';
import Linha from '../componentes/Linha';
import Vazio from '../componentes/Vazio';
import SeletorLista, { type ItemLista } from '../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../componentes/AbasCadastro';
import { useSessao } from '../contexto/SessaoContext';
import { centroDaUnidade, idUnidade, nomeUnidade, opcoesUnidade } from '../lib/unidades';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../lib/datas';
import { formatarMoeda, formatarQtd, lerNumero } from '../lib/formatos';
import { ROTULO_CAT_IMOB } from '../lib/imobilizado';
import type { PilhaParams } from '../navegacao/rotas';
import { cores, tam } from '../tema';

type Tipo = 'estoque' | 'bem' | 'gado';
type ItemTransf = { chave: string; insumoId: string | null; qtd: string };
let cont = 0;
const novoItem = (): ItemTransf => ({ chave: `t${Date.now()}_${cont++}`, insumoId: null, qtd: '' });
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const n = (t: string) => lerNumero(t);
const ROTULO_TIPO: Record<string, string> = { estoque: 'Produtos do estoque', bem: 'Bem do imobilizado', gado: 'Gado' };
const ROTULO_DESTINO: Record<string, string> = { estoque: 'para o estoque', centro: 'direto no centro de custo', imobilizado: 'para o imobilizado', lote: 'para o lote' };

/**
 * V152: Mais › Transferências entre fazendas do Grupo.
 * - Produtos do estoque: entram no estoque da outra fazenda (pelo custo médio daqui) ou vão direto
 *   para um centro de custo de lá (aplicação, inclusive um bem em formação).
 * - Bem do imobilizado: muda de fazenda com o mesmo código patrimonial (o da fazenda de aquisição).
 * - Gado: os animais vão para um lote da outra fazenda com o mesmo número (se livre), brinco e registro.
 * Não gera conta a pagar nem a receber: tudo é do Grupo.
 */
export default function TransferenciaForm() {
  const { params } = useRoute<RouteProp<PilhaParams, 'TransferenciaForm'>>();
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const origem = modoAdm ? null : fazendaAtiva?.id ?? null;
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [tipo, setTipo] = useState<Tipo[]>([modoAdm ? 'bem' : 'estoque']);
  const [para, setPara] = useState<string[]>([]);
  const [data, setData] = useState(hojeBR());
  const [destino, setDestino] = useState<string[]>(['estoque']);
  const [centroId, setCentroId] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemTransf[]>([novoItem()]);
  const [bemId, setBemId] = useState<string | null>(null);
  const [loteOrigem, setLoteOrigem] = useState<string | null>(null);
  const [loteDestino, setLoteDestino] = useState<string | null>(null);
  const [cabecas, setCabecas] = useState('');
  const [obs, setObs] = useState('');
  const [desfazerNum, setDesfazerNum] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [saldos, setSaldos] = useState<Record<string, { nome: string; unidade: string; saldo: number }>>({});

  const t = tipo[0];
  const paraId = para[0] ? idUnidade(para[0]) : undefined;
  // estoque e gado só existem nas fazendas; bem e aplicação direta também vão para o Administrativo
  const soFazendas = t === 'gado' || (t === 'estoque' && destino[0] === 'estoque');
  const opcoesPara = opcoesUnidade(fazendas, !soFazendas).filter((o) => idUnidade(o.valor) !== origem && !fazendas.some((f) => f.id === o.valor && f.tipo === 'particular'));

  // saldo dos produtos da fazenda de origem
  const carregarSaldos = useCallback(async () => {
    if (!origem) return;
    const [ins, movs] = await Promise.all([
      consulta<any[]>(supabase.from('insumos').select('id, nome, unidade').order('nome')),
      consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade').eq('fazenda_id', origem).limit(50000)),
    ]);
    const s: Record<string, number> = {};
    for (const m of movs) s[m.insumo_id] = (s[m.insumo_id] ?? 0) + (m.tipo === 'saida' ? -Number(m.quantidade) : Number(m.quantidade));
    const r: Record<string, { nome: string; unidade: string; saldo: number }> = {};
    for (const i of ins) if ((s[i.id] ?? 0) > 0.0005) r[i.id] = { nome: i.nome, unidade: i.unidade ?? '', saldo: s[i.id] };
    setSaldos(r);
  }, [origem]);
  useEffect(() => {
    carregarSaldos().catch((e) => setErro(traduzirErro(e)));
  }, [carregarSaldos]);

  const carregarProdutos = useCallback(
    async (): Promise<ItemLista[]> => Object.entries(saldos).map(([id, x]) => ({ id, titulo: x.nome, detalhe: `Estoque: ${formatarQtd(x.saldo, 2)} ${x.unidade}` })),
    [saldos],
  );
  const carregarCentrosDestino = useCallback(async (): Promise<ItemLista[]> => {
    if (paraId === undefined) return [];
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id, imobilizado_id').eq('ativo', true).order('codigo'));
    return d
      .filter((c) => centroDaUnidade(c, paraId))
      .map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim(), detalhe: c.imobilizado_id ? 'Bem em formação' : null }));
  }, [paraId]);
  const carregarBens = useCallback(async (): Promise<ItemLista[]> => {
    let q = supabase.from('imobilizados').select('id, numero, nome, codigo_patrimonial, categoria, fazenda_id').eq('situacao', 'ativo').order('numero');
    q = origem ? q.eq('fazenda_id', origem) : q.is('fazenda_id', null);
    const d = await consulta<any[]>(q);
    return d.map((b) => ({ id: b.id, titulo: `${b.codigo_patrimonial ? `${b.codigo_patrimonial} · ` : ''}${b.nome}`, detalhe: `Bem nº ${b.numero} · ${ROTULO_CAT_IMOB[b.categoria] ?? b.categoria}` }));
  }, [origem]);
  const lotesDe = useCallback(async (faz: string | null | undefined): Promise<ItemLista[]> => {
    if (!faz) return [];
    const [ls, an] = await Promise.all([
      consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, sexo, categoria').eq('fazenda_id', faz).eq('situacao', 'ativo').order('numero')),
      consulta<any[]>(supabase.from('animais').select('lote_id').eq('fazenda_id', faz).eq('situacao', 'ativo').limit(50000)),
    ]);
    const q: Record<string, number> = {};
    for (const a of an) if (a.lote_id) q[a.lote_id] = (q[a.lote_id] ?? 0) + 1;
    return ls.map((l) => ({
      id: l.id,
      titulo: `Lote ${l.numero}${l.descricao ? ` · ${l.descricao}` : ''}`,
      detalhe: [l.sexo === 'M' ? 'Machos' : l.sexo === 'F' ? 'Fêmeas' : 'Misto', `${q[l.id] ?? 0} cab.`].join(' · '),
    }));
  }, []);
  const carregarLotesOrigem = useCallback(() => lotesDe(origem), [lotesDe, origem]);
  const carregarLotesDestino = useCallback(() => lotesDe(paraId), [lotesDe, paraId]);

  function limpar() {
    setPara([]);
    setCentroId(null);
    setItens([novoItem()]);
    setBemId(null);
    setLoteOrigem(null);
    setLoteDestino(null);
    setCabecas('');
    setObs('');
    setErros({});
  }

  async function transferir() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(data)) e.data = 'Informe a data.';
    if (paraId === undefined) e.para = 'Escolha para onde vai.';
    let usados: ItemTransf[] = [];
    if (t === 'estoque') {
      if (!origem) e.tipo = 'O Administrativo não tem estoque.';
      if (destino[0] === 'centro' && !centroId) e.centro = 'Escolha o centro de custo de destino.';
      usados = itens.filter((x) => x.insumoId || x.qtd.trim());
      if (!usados.length) e.itens = 'Informe os produtos e as quantidades.';
      for (const x of usados) {
        const s = x.insumoId ? saldos[x.insumoId] : null;
        if (!x.insumoId) e.itens = 'Escolha o produto de cada linha.';
        else if (!(n(x.qtd)! > 0)) e.itens = `Informe a quantidade de ${s?.nome ?? 'cada produto'}.`;
        else if (s && n(x.qtd)! > s.saldo + 0.0005) e.itens = `${s.nome}: só há ${formatarQtd(s.saldo, 2)} ${s.unidade} no estoque.`;
      }
      if (new Set(usados.map((x) => x.insumoId)).size !== usados.length) e.itens = 'Há produto repetido.';
    } else if (t === 'bem') {
      if (!bemId) e.bem = 'Escolha o bem.';
    } else {
      if (!origem) e.tipo = 'O Administrativo não tem gado.';
      if (!loteOrigem) e.loteOrigem = 'Escolha o lote de origem.';
      if (!loteDestino) e.loteDestino = 'Escolha o lote de destino na outra fazenda.';
      if (!(Number(cabecas) > 0)) e.cabecas = 'Informe quantas cabeças.';
    }
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    setSalvando(true);
    const base = { fazenda_id: origem, para_fazenda_id: paraId, data: paraBanco(data), observacoes: obs };
    const nomePara = nomeUnidade(paraId, fazendas);
    let texto = '';
    if (t === 'estoque') {
      const { data: r, error } = await supabase.rpc('transferir_estoque', {
        p: { ...base, destino: destino[0], centro_custo_id: destino[0] === 'centro' ? centroId : null, itens: usados.map((x) => ({ insumo_id: x.insumoId, quantidade: n(x.qtd) })) },
      });
      setSalvando(false);
      if (error) return setErro(traduzirErro(error));
      const rr = r as any;
      texto = `Transferência nº ${rr.numero}: ${rr.itens} ${rr.itens === 1 ? 'produto' : 'produtos'} (${formatarMoeda(Number(rr.valor))} pelo custo médio) ${destino[0] === 'centro' ? 'aplicados direto no centro de custo' : 'para o estoque'} de ${nomePara}.`;
      carregarSaldos();
    } else if (t === 'bem') {
      const { data: r, error } = await supabase.rpc('transferir_bem', { p: { ...base, id: bemId, centro_custo_id: centroId } });
      setSalvando(false);
      if (error) return setErro(traduzirErro(error));
      const rr = r as any;
      texto = `Transferência nº ${rr.numero}: bem nº ${rr.bem}${rr.codigo ? ` (${rr.codigo}, o código continua o mesmo)` : ''} agora está em ${nomePara}. A depreciação passa a ir para lá.`;
    } else {
      const { data: r, error } = await supabase.rpc('transferir_gado', { p: { ...base, lote_origem_id: loteOrigem, lote_destino_id: loteDestino, quantidade: Number(cabecas) } });
      setSalvando(false);
      if (error) return setErro(traduzirErro(error));
      const rr = r as any;
      texto = `Transferência nº ${rr.numero}: ${rr.cabecas} ${rr.cabecas === 1 ? 'cabeça' : 'cabeças'} para ${nomePara}, com o mesmo brinco e registro.${rr.renumerados ? ` ${rr.renumerados} ${rr.renumerados === 1 ? 'animal ganhou' : 'animais ganharam'} outro nº interno (o nº já existia lá).` : ' Os números internos foram mantidos.'}`;
    }
    setAviso(texto);
    limpar();
  }

  async function desfazer() {
    setErro(null);
    const m = /^0*(\d+)$/.exec(desfazerNum.trim());
    if (!m) return setErro('Digite o número da transferência.');
    let q = supabase.from('transferencias').select('id, numero, tipo').eq('numero', Number(m[1]));
    q = origem ? q.eq('fazenda_id', origem) : q.is('fazenda_id', null);
    const { data: tr } = await q.maybeSingle();
    if (!tr) return setErro(`Não há transferência nº ${m[1]} saindo daqui.`);
    Alert.alert('Desfazer', `Desfazer a transferência nº ${tr.numero} (${ROTULO_TIPO[tr.tipo]})? Tudo volta para cá.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desfazer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_transferencia', { p_id: tr.id });
          if (error) return setErro(traduzirErro(error));
          setDesfazerNum('');
          setAviso(`Transferência nº ${tr.numero} desfeita.`);
          carregarSaldos();
        },
      },
    ]);
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Transferir" />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaTransferencias origem={origem} />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Text style={estilos.de}>Sai de: {nomeUnidade(origem, fazendas)}</Text>
      <Text style={estilos.nota}>Tudo é do Grupo: a transferência não gera conta a pagar nem a receber, só muda onde as coisas estão e quem recebe o custo.</Text>

      <Escolha
        rotulo="O que vai *"
        opcoes={(modoAdm ? (['bem'] as Tipo[]) : (['estoque', 'bem', 'gado'] as Tipo[])).map((v) => ({ valor: v, rotulo: ROTULO_TIPO[v] }))}
        valor={tipo}
        aoMudar={(v) => {
          setTipo(v as Tipo[]);
          setPara([]);
          setCentroId(null);
          setErros({});
        }}
        erro={erros.tipo}
      />
      {t === 'estoque' && (
        <Escolha
          rotulo="Lá, entra *"
          opcoes={[
            { valor: 'estoque', rotulo: 'No estoque da outra fazenda' },
            { valor: 'centro', rotulo: 'Direto num centro de custo (aplicação, obra ou lavoura em formação)' },
          ]}
          valor={destino}
          aoMudar={(v) => {
            setDestino(v);
            setCentroId(null);
            if (v[0] === 'estoque' && para[0] && !fazendas.some((f) => f.id === para[0])) setPara([]);
          }}
        />
      )}
      <Escolha
        rotulo="Para onde vai *"
        opcoes={opcoesPara}
        valor={para}
        aoMudar={(v) => {
          setPara(v);
          setCentroId(null);
          setLoteDestino(null);
        }}
        erro={erros.para}
      />
      <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />

      {t === 'estoque' && (
        <>
          <Secao titulo="Produtos" />
          {itens.map((x) => {
            const s = x.insumoId ? saldos[x.insumoId] : null;
            return (
              <View key={x.chave} style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <SeletorLista
                    rotulo="Produto"
                    valorId={x.insumoId}
                    aoMudar={(v) => setItens((l) => l.map((y) => (y.chave === x.chave ? { ...y, insumoId: v } : y)))}
                    carregar={carregarProdutos}
                    vazio="Nenhum produto com saldo nesta fazenda."
                  />
                </View>
                <View style={{ width: 100 }}>
                  <Campo rotulo={s?.unidade ? `Qtde. (${s.unidade})` : 'Qtde.'} value={x.qtd} onChangeText={(v) => setItens((l) => l.map((y) => (y.chave === x.chave ? { ...y, qtd: v } : y)))} keyboardType="decimal-pad" />
                </View>
                {itens.length > 1 && (
                  <Pressable onPress={() => setItens((l) => l.filter((y) => y.chave !== x.chave))} hitSlop={8} style={{ paddingTop: 30 }} accessibilityLabel="Tirar produto">
                    <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
                  </Pressable>
                )}
              </View>
            );
          })}
          <Text style={estilos.link} onPress={() => setItens((l) => [...l, novoItem()])}>
            + Produto
          </Text>
          {erros.itens && <Text style={estilos.erro}>{erros.itens}</Text>}
          <Text style={estilos.nota}>Sai pelo custo médio daqui e, no estoque de lá, entra com esse mesmo custo. O código do produto é o mesmo em todas as fazendas.</Text>
          {destino[0] === 'centro' && paraId !== undefined && (
            <SeletorLista rotulo="Centro de custo de lá *" valorId={centroId} aoMudar={setCentroId} carregar={carregarCentrosDestino} erro={erros.centro} vazio="Nenhum centro de custo lá." />
          )}
        </>
      )}

      {t === 'bem' && (
        <>
          <Secao titulo="Bem" />
          <SeletorLista rotulo="Bem do imobilizado *" valorId={bemId} aoMudar={setBemId} carregar={carregarBens} dicaBusca="Código, nome ou nº" erro={erros.bem} vazio="Nenhum bem em uso alocado aqui." />
          {paraId !== undefined && (
            <SeletorLista rotulo="Centro de custo de lá (depreciação)" valorId={centroId} aoMudar={setCentroId} carregar={carregarCentrosDestino} permitirLimpar vazio="Nenhum centro de custo lá." />
          )}
          <Text style={estilos.nota}>O bem leva o código patrimonial da fazenda onde foi adquirido (ex.: FI 012). Sem centro escolhido, a depreciação vai para o centro principal de lá.</Text>
        </>
      )}

      {t === 'gado' && (
        <>
          <Secao titulo="Gado" />
          <SeletorLista rotulo="Lote de origem *" valorId={loteOrigem} aoMudar={setLoteOrigem} carregar={carregarLotesOrigem} erro={erros.loteOrigem} vazio="Nenhum lote aberto aqui." />
          <Campo rotulo="Cabeças *" value={cabecas} onChangeText={(v) => setCabecas(v.replace(/\D/g, ''))} keyboardType="number-pad" erro={erros.cabecas} />
          {paraId ? (
            <SeletorLista rotulo="Lote de destino (na outra fazenda) *" valorId={loteDestino} aoMudar={setLoteDestino} carregar={carregarLotesDestino} erro={erros.loteDestino} vazio="Nenhum lote aberto lá: abra o lote em Pecuário › Lotes na outra fazenda." />
          ) : null}
          <Text style={estilos.nota}>Saem primeiro os sem brinco e depois os de número mais alto. Os animais levam o brinco, o registro e o nº interno (se o nº já existir lá, ganham o próximo livre).</Text>
        </>
      )}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" />
      <Botao titulo="Transferir" onPress={transferir} carregando={salvando} />

      <Secao titulo="Lançou errado?" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Desfazer a transferência nº" value={desfazerNum} onChangeText={(v) => setDesfazerNum(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        </View>
        <View style={{ width: 120, paddingTop: 26 }}>
          <Botao titulo="Desfazer" tipo="secundario" onPress={desfazer} />
        </View>
      </View>
      <Text style={estilos.nota}>Bem do imobilizado não se desfaz: transfira de volta.</Text>
    </Tela>
  );
}

/** Consulta: as transferências que saíram daqui ou chegaram aqui, com os itens. Só mostra. */
function ConsultaTransferencias({ origem }: { origem: string | null }) {
  const { fazendas } = useSessao();
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sentido, setSentido] = useState<string[]>(['todas']);

  useEffect(() => {
    let q = supabase
      .from('transferencias')
      .select('*, itens:transferencia_itens ( quantidade, valor, insumo:insumos ( nome, unidade, codigo ) ), animais:transferencia_animais ( numero_origem, numero_destino ), bem:imobilizados ( numero, nome, codigo_patrimonial ), centro:centros_custo ( codigo, nome )')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(80);
    const f = origem ?? null;
    if (sentido[0] === 'saidas') q = f ? q.eq('fazenda_id', f) : q.is('fazenda_id', null);
    else if (sentido[0] === 'entradas') q = f ? q.eq('para_fazenda_id', f) : q.is('para_fazenda_id', null);
    else q = f ? q.or(`fazenda_id.eq.${f},para_fazenda_id.eq.${f}`) : q.or('fazenda_id.is.null,para_fazenda_id.is.null');
    consulta<any[]>(q).then(setLista).catch((e) => setErro(traduzirErro(e)));
  }, [origem, sentido]);

  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Escolha
        opcoes={[
          { valor: 'todas', rotulo: 'Todas' },
          { valor: 'saidas', rotulo: 'Saíram daqui' },
          { valor: 'entradas', rotulo: 'Chegaram aqui' },
        ]}
        valor={sentido}
        aoMudar={setSentido}
      />
      {!lista ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : lista.length === 0 ? (
        <Vazio icone="swap-horizontal-outline" texto="Nenhuma transferência." />
      ) : (
        <Lista>
          {lista.map((x) => {
            const bem = um(x.bem);
            const c = um(x.centro);
            const linhas: (string | null)[] = [`${nomeUnidade(x.fazenda_id, fazendas)} → ${nomeUnidade(x.para_fazenda_id, fazendas)} · ${ROTULO_DESTINO[x.destino] ?? ''}`];
            if (x.tipo === 'estoque') for (const i of (x.itens as any[]) ?? []) linhas.push(`${um(i.insumo)?.codigo ? `${um(i.insumo).codigo} · ` : ''}${um(i.insumo)?.nome ?? ''}: ${formatarQtd(Number(i.quantidade), 2)} ${um(i.insumo)?.unidade ?? ''} · ${formatarMoeda(Number(i.valor))}`);
            if (x.tipo === 'bem' && bem) linhas.push(`Bem nº ${bem.numero}${bem.codigo_patrimonial ? ` · ${bem.codigo_patrimonial}` : ''} · ${bem.nome}`);
            if (x.tipo === 'gado') {
              const an = (x.animais as any[]) ?? [];
              const trocados = an.filter((a) => a.numero_origem !== a.numero_destino);
              linhas.push(`${an.length} ${an.length === 1 ? 'cabeça' : 'cabeças'}${trocados.length ? ` · renumerados: ${trocados.map((a) => `${a.numero_origem}→${a.numero_destino}`).join(', ')}` : ''}`);
            }
            if (c) linhas.push(`Centro: ${c.codigo} ${c.nome}`);
            if (x.observacoes) linhas.push(x.observacoes);
            return (
              <Linha
                key={x.id}
                titulo={`Nº ${x.numero} · ${doBanco(x.data)} · ${ROTULO_TIPO[x.tipo]}`}
                linhas={linhas}
                direita={x.tipo !== 'gado' && Number(x.valor) > 0 ? formatarMoeda(Number(x.valor)) : undefined}
                onPress={() => {}}
              />
            );
          })}
        </Lista>
      )}
      <Text style={estilos.nota}>A numeração é da unidade de onde saiu.</Text>
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  de: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
