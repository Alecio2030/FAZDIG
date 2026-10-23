import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarQtd, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { textoSacas } from '../../lib/posColheita';
import { ESPECIES_CAFE } from '../../lib/armazem';
import { cotacaoReferencia, lerCotacoes, type Cotacao } from '../../lib/cotacoes';
import { TIPOS_CONTRATO, lerContratos, type TipoContrato } from '../../lib/contratosCafe';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const n = (t: string) => lerNumero(t);
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const r2 = (x: number) => Math.round(x * 100) / 100;
type CompraAberta = { id: string; numero: number; data: string; fornecedor: string; pessoaId: string; aberto: number };

/** Contrato de café: venda futura (preço fixo ou a fixar) ou troca por insumos (uma compra a prazo paga em sacas). */
export default function ContratoCafeForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ContratoCafeForm'>>();
  const id = params?.id ?? null;
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [carregando, setCarregando] = useState(!!id);
  const [numero, setNumero] = useState<number | null>(null);
  const [temMovimento, setTemMovimento] = useState(false);
  const [tipo, setTipo] = useState<TipoContrato>('venda_futura');
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [data, setData] = useState(hojeBR());
  const [safraId, setSafraId] = useState<string | null>(null);
  const [sacas, setSacas] = useState('');
  const [especie, setEspecie] = useState('Conilon');
  const [cafeTipo, setCafeTipo] = useState('');
  const [precoTipo, setPrecoTipo] = useState<'fixo' | 'a_fixar'>('fixo');
  const [preco, setPreco] = useState('');
  const [entrega, setEntrega] = useState('');
  const [local, setLocal] = useState('');
  const [obs, setObs] = useState('');
  // troca
  const [compras, setCompras] = useState<CompraAberta[]>([]);
  const [compraId, setCompraId] = useState<string | null>(null);
  const [valorTroca, setValorTroca] = useState<number | null>(null);

  const [cots, setCots] = useState<Cotacao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Contrato nº ${numero ?? ''}` : 'Novo contrato de café' });
  }, [navegacao, id, numero]);

  useEffect(() => {
    lerCotacoes().then(setCots).catch(() => setCots([]));
  }, []);

  // compras a prazo com valor em aberto no contas a pagar (para a troca)
  const lerCompras = useCallback(async (): Promise<CompraAberta[]> => {
    if (!fid) return [];
    const d = await consulta<any[]>(
      supabase.from('lancamentos').select('valor, valor_pago, compra:compras ( id, numero, data, pessoa_id, pessoa:pessoas ( nome ) )').eq('fazenda_id', fid).eq('tipo', 'pagar').in('situacao', ['aberto', 'parcial']).not('compra_id', 'is', null).limit(2000),
    );
    const m: Record<string, CompraAberta> = {};
    for (const l of d) {
      const c = um(l.compra);
      if (!c) continue;
      m[c.id] ??= { id: c.id, numero: c.numero, data: c.data, fornecedor: um(c.pessoa)?.nome ?? '', pessoaId: c.pessoa_id, aberto: 0 };
      m[c.id].aberto = r2(m[c.id].aberto + Number(l.valor) - Number(l.valor_pago ?? 0));
    }
    return Object.values(m).sort((a, b) => b.numero - a.numero);
  }, [fid]);

  useEffect(() => {
    if (tipo === 'troca') lerCompras().then(setCompras).catch((e) => setErro(traduzirErro(e)));
  }, [tipo, lerCompras]);

  useEffect(() => {
    if (!id || !fid) return;
    (async () => {
      try {
        const c = (await lerContratos(fid, id))[0];
        if (!c) throw new Error('Contrato não encontrado.');
        setNumero(c.numero);
        setTemMovimento(c.entregue > 0 || c.adiantado > 0);
        setTipo(c.tipo);
        setPessoaId(c.pessoa_id);
        setData(doBanco(c.data));
        setSafraId(c.safra_id);
        setSacas(numeroParaCampo(c.sacas));
        setEspecie(c.especie ?? '');
        setCafeTipo(c.cafe_tipo ?? '');
        setPrecoTipo(c.preco_tipo);
        setPreco(moedaParaCampo(c.preco));
        setEntrega(doBanco(c.data_entrega));
        setLocal(c.local_entrega ?? '');
        setObs(c.observacoes ?? '');
        setCompraId(c.compra_id);
        setValorTroca(c.tipo === 'troca' ? (c.aberto_compra > 0 ? c.aberto_compra : c.valor_troca) : null);
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [id, fid]);

  const carregarSafras = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('safras').select('id, nome, situacao, data_inicio, data_fim').eq('fazenda_id', fid!).order('data_inicio', { ascending: false }));
    return d.map((s) => ({ id: s.id, titulo: s.nome, detalhe: `${doBanco(s.data_inicio)} a ${doBanco(s.data_fim)}${s.situacao !== 'aberta' ? ' · encerrada' : ''}` }));
  }, [fid]);
  const carregarCompras = useCallback(async (): Promise<ItemLista[]> => {
    const l = await lerCompras();
    setCompras(l);
    return l.map((c) => ({ id: c.id, titulo: `Compra nº ${c.numero} · ${c.fornecedor}`, detalhe: `${doBanco(c.data)} · ${formatarMoeda(c.aberto)} em aberto no contas a pagar` }));
  }, [lerCompras]);

  function escolherCompra(cid: string | null) {
    setCompraId(cid);
    const c = compras.find((x) => x.id === cid);
    setValorTroca(c ? c.aberto : null);
    if (c) {
      setPessoaId(c.pessoaId);
      const p = n(preco);
      if (p && p > 0) setSacas(numeroParaCampo(r2(c.aberto / p)));
    }
  }
  // troca: sacas e preço de referência andam juntos (valor da compra = sacas x preço)
  function mudarPreco(t: string) {
    setPreco(t);
    const p = n(t);
    if (tipo === 'troca' && valorTroca && p && p > 0) setSacas(numeroParaCampo(r2(valorTroca / p)));
  }
  function mudarSacas(t: string) {
    setSacas(t);
    const s = n(t);
    if (tipo === 'troca' && valorTroca && s && s > 0) setPreco(moedaParaCampo(r2(valorTroca / s)));
  }

  const cot = cotacaoReferencia(cots, cafeTipo);
  const total = (n(sacas) ?? 0) * (n(preco) ?? 0);

  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    if (!dataValida(data)) e.data = 'Informe a data do contrato.';
    if (!dataValida(entrega)) e.entrega = 'Informe a data-limite de entrega.';
    else if (dataValida(data) && paraBanco(entrega)! < paraBanco(data)!) e.entrega = 'A entrega não pode ser antes da data do contrato.';
    if (tipo === 'troca') {
      if (!compraId) e.compra = 'Escolha a compra dos insumos.';
      if ((n(preco) ?? 0) <= 0 && (n(sacas) ?? 0) <= 0) e.preco = 'Informe o preço de referência da saca ou as sacas combinadas.';
    } else {
      if (!pessoaId) e.pessoa = 'Informe o cliente.';
      if ((n(sacas) ?? 0) <= 0) e.sacas = 'Informe as sacas.';
      if (precoTipo === 'fixo' && (n(preco) ?? 0) <= 0) e.preco = 'Informe o preço por saca.';
    }
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_contrato_cafe', {
      p: {
        id, fazenda_id: fid, tipo, pessoa_id: pessoaId, data: paraBanco(data), safra_id: safraId ?? '', sacas: n(sacas) ?? '', especie, cafe_tipo: cafeTipo,
        preco_tipo: tipo === 'troca' ? 'fixo' : precoTipo, preco: tipo === 'troca' || precoTipo === 'fixo' ? n(preco) ?? '' : '',
        data_entrega: paraBanco(entrega), local_entrega: local, compra_id: tipo === 'troca' ? compraId : '', observacoes: obs,
      },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { id: string };
    if (id) navegacao.goBack();
    else navegacao.replace('ContratoCafeDetalhe', { id: res.id });
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  return (
    <Tela rodape={<RodapeAcoes titulo={id ? 'Salvar alterações' : 'Gravar contrato'} aoConfirmar={salvar} carregando={salvando} erro={erro} />}>
      {temMovimento ? (
        <Aviso tipo="info" texto="Este contrato já tem entrega ou adiantamento: o tipo e o cliente não mudam mais." />
      ) : (
        <Escolha rotulo="Tipo do contrato" opcoes={TIPOS_CONTRATO} valor={[tipo]} aoMudar={(v) => setTipo(v[0] as TipoContrato)} />
      )}

      {tipo === 'troca' ? (
        <>
          <Text style={estilos.nota}>A compra dos insumos é lançada antes, em Mais › Compras, a prazo. Aqui você diz que ela será paga em café: na entrega, o sistema quita a compra sem movimentar dinheiro.</Text>
          <SeletorLista rotulo="Compra dos insumos (a prazo, em aberto) *" valorId={compraId} aoMudar={escolherCompra} carregar={carregarCompras} erro={erros.compra} vazio="Nenhuma compra a prazo com valor em aberto no contas a pagar." dicaBusca="Nº da compra ou fornecedor" />
          {valorTroca != null && (
            <View style={estilos.calc}>
              <Par a="Valor a quitar em café" b={formatarMoeda(valorTroca)} forte />
            </View>
          )}
        </>
      ) : (
        <CampoPessoaBusca rotulo="Cliente *" valorId={pessoaId} aoMudar={temMovimento ? () => {} : setPessoaId} tipoNovo="cliente" erro={erros.pessoa} />
      )}

      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data do contrato *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Entrega até *" valor={entrega} aoMudar={setEntrega} erro={erros.entrega} />
        </View>
      </View>

      <Secao titulo="Café" />
      <Escolha rotulo="Espécie" opcoes={ESPECIES_CAFE} valor={[especie]} aoMudar={(v) => setEspecie(v[0])} />
      <Campo rotulo="Tipo combinado" value={cafeTipo} onChangeText={setCafeTipo} placeholder="Ex.: 7, 7/8, 8" ajuda="Pela tabela de defeitos. Serve para comparar com a cotação do mesmo tipo." />
      <SeletorLista rotulo="Safra" valorId={safraId} aoMudar={setSafraId} carregar={carregarSafras} permitirLimpar vazio="Nenhuma safra cadastrada em Agrícola › Safras." />

      <Secao titulo={tipo === 'troca' ? 'Sacas e preço de referência' : 'Quantidade e preço'} />
      {tipo === 'venda_futura' && (
        <Escolha
          rotulo="Preço"
          opcoes={[
            { valor: 'fixo', rotulo: 'Fixo por saca' },
            { valor: 'a_fixar', rotulo: 'A fixar na entrega' },
          ]}
          valor={[precoTipo]}
          aoMudar={(v) => setPrecoTipo(v[0] as 'fixo' | 'a_fixar')}
        />
      )}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Sacas de 60 kg *" value={sacas} onChangeText={mudarSacas} keyboardType="decimal-pad" erro={erros.sacas} />
        </View>
        {(tipo === 'troca' || precoTipo === 'fixo') && (
          <View style={{ flex: 1 }}>
            <CampoMoeda rotulo={tipo === 'troca' ? 'Preço de referência (R$/saca) *' : 'Preço por saca (R$) *'} valor={preco} aoMudar={mudarPreco} erro={erros.preco} />
          </View>
        )}
      </View>
      {tipo === 'troca' && <Text style={estilos.nota}>Informe o preço de referência (as sacas saem pela conta) ou as sacas combinadas (o preço sai pela conta).</Text>}
      {tipo === 'venda_futura' && precoTipo === 'a_fixar' && <Text style={estilos.nota}>Preço a fixar: na entrega, a venda vem com a cotação do dia e você confirma o preço fechado com o comprador.</Text>}
      {(total > 0 || cot) && (
        <View style={estilos.calc}>
          {total > 0 && <Par a={`${textoSacas(n(sacas) ?? 0)} × ${formatarMoeda(n(preco) ?? 0)}`} b={formatarMoeda(total)} forte />}
          {cot && <Par a={`Cotação de ${doBanco(cot.data)} (${cot.fonte}, tipo ${cot.tipo})`} b={formatarMoeda(cot.preco)} />}
          {cot && (n(preco) ?? 0) > 0 && (
            <Par a={(n(preco) ?? 0) >= cot.preco ? 'Acima da cotação' : 'Abaixo da cotação'} b={`${formatarMoeda(Math.abs((n(preco) ?? 0) - cot.preco))} por saca (${formatarQtd((Math.abs((n(preco) ?? 0) - cot.preco) / cot.preco) * 100, 1)}%)`} />
          )}
        </View>
      )}

      <Secao titulo="Entrega" />
      <Campo rotulo="Local de entrega" value={local} onChangeText={setLocal} autoCapitalize="sentences" placeholder="Ex.: armazém da cooperativa, posto de compra" />
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} placeholder="Nº do contrato do comprador, condições, multa…" />
    </Tela>
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
  calc: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto, textAlign: 'right', flexShrink: 1 },
});
