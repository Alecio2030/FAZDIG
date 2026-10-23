import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { voltarDaConsulta } from '../../lib/voltarConsulta';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import PainelDieta from '../../componentes/PainelDieta';
import ConsultaDietas from './ConsultaDietas';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import {
  APTIDOES,
  TIPOS_GENETICA,
  cmsEstimado,
  cmsPercPadrao,
  metasPadrao,
  textoComposicao,
  type Aptidao,
  type Item,
} from '../../lib/dietas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type ItemForm = Item & { kgTexto: string };
const ESCORES = ['1', '2', '3', '4', '5'].map((v) => ({ valor: v, rotulo: v }));
const n = (t: string) => lerNumero(t);
let contador = 0;
const novaChave = () => `i${Date.now()}_${contador++}`;

export default function DietaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'DietaForm'>>();
  const id = params?.id;
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [numero, setNumero] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [aptidao, setAptidao] = useState<string[]>(['corte']);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [cabecas, setCabecas] = useState('');
  const [pv, setPv] = useState('');
  const [ecc, setEcc] = useState<string[]>([]);
  const [gmd, setGmd] = useState('');
  const [leite, setLeite] = useState('');
  const [gordura, setGordura] = useState('3,5');
  const [del, setDel] = useState('');
  const [genTipo, setGenTipo] = useState<string[]>([]);
  const [cmsPerc, setCmsPerc] = useState('');
  const [metaPb, setMetaPb] = useState('');
  const [metaNdt, setMetaNdt] = useState('');
  const [metaFdn, setMetaFdn] = useState('');
  const [metasEditadas, setMetasEditadas] = useState(false);
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [obs, setObs] = useState('');

  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);

  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const apt = (aptidao[0] ?? 'corte') as Aptidao;

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? (numero ? `Dieta nº ${numero}` : 'Dieta') : 'Dietas' });
  }, [navegacao, id, numero]);

  // Número que a nova dieta vai receber (o banco confirma ao gravar).
  useEffect(() => {
    if (id || !fid) return;
    supabase
      .from('dietas')
      .select('numero')
      .eq('fazenda_id', fid)
      .order('numero', { ascending: false })
      .limit(1)
      .then(({ data: d }) => setProximo(((d?.[0]?.numero as number) ?? 0) + 1));
  }, [id, fid]);

  // Alteração: carrega a dieta e os itens.
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await consulta<any>(supabase.from('dietas').select('*, itens:dieta_itens ( * )').eq('id', id).single());
        setNumero(d.numero);
        setData(doBanco(d.data));
        setAptidao([d.aptidao]);
        setLoteId(d.lote_id);
        setDescricao(d.descricao ?? '');
        setCabecas(d.cabecas ? String(d.cabecas) : '');
        setPv(numeroParaCampo(d.pv));
        setEcc(d.ecc != null ? [String(d.ecc)] : []);
        setGmd(numeroParaCampo(d.gmd));
        setLeite(numeroParaCampo(d.leite_l));
        setGordura(numeroParaCampo(d.gordura) || '3,5');
        setDel(d.del != null ? String(d.del) : '');
        setGenTipo(d.genetica_tipo ? [d.genetica_tipo] : []);
        setCmsPerc(numeroParaCampo(d.cms_perc_pv));
        setMetaPb(numeroParaCampo(d.meta_pb));
        setMetaNdt(numeroParaCampo(d.meta_ndt));
        setMetaFdn(numeroParaCampo(d.meta_fdn_min));
        setMetasEditadas(true);
        setObs(d.observacoes ?? '');
        const its = ((d.itens as any[]) ?? []).sort((a, b) => a.ordem - b.ordem);
        setItens(
          its.map((i) => ({
            chave: novaChave(),
            alimento_id: i.alimento_id,
            nome: i.nome,
            tipo: i.tipo,
            kg_mn: Number(i.kg_mn),
            kgTexto: numeroParaCampo(i.kg_mn),
            ms: Number(i.ms),
            pb: Number(i.pb),
            ndt: Number(i.ndt),
            fdn: Number(i.fdn),
            preco_kg_mn: i.preco_kg_mn != null ? Number(i.preco_kg_mn) : null,
          })),
        );
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [id]);

  // Metas de referência acompanham a aptidão e o desempenho, até a pessoa mexer nelas.
  const metasRef = metasPadrao({ aptidao: apt, gmd: n(gmd), leite: n(leite), genetica: genTipo[0] });
  useEffect(() => {
    if (metasEditadas) return;
    setMetaPb(numeroParaCampo(metasRef.pb));
    setMetaNdt(numeroParaCampo(metasRef.ndt));
    setMetaFdn(numeroParaCampo(metasRef.fdnMin));
  }, [metasEditadas, metasRef.pb, metasRef.ndt, metasRef.fdnMin]);

  const usaPerc = !(apt === 'leite' && (n(leite) ?? 0) > 0);
  const cms = cmsEstimado({ aptidao: apt, pv: n(pv), leite: n(leite), gordura: n(gordura), del: n(del), percPv: n(cmsPerc) ?? cmsPercPadrao(apt) });
  const metas = { pb: n(metaPb) ?? metasRef.pb, ndt: n(metaNdt) ?? metasRef.ndt, fdnMin: n(metaFdn) ?? metasRef.fdnMin };
  const itensCalc: Item[] = useMemo(() => itens.map((i) => ({ ...i, kg_mn: n(i.kgTexto) ?? 0 })), [itens]);

  // ---- listas ----
  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, categoria').eq('fazenda_id', fid!).eq('situacao', 'ativo').order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla), detalhe: l.categoria }));
  }, [fid, sigla]);

  const carregarAlimentos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('alimentos').select('*').eq('ativo', true).order('tipo').order('nome'));
    return d.map((a) => ({
      id: a.id,
      titulo: a.nome,
      detalhe: `${textoComposicao(a)}${a.preco_kg_mn != null ? ` · ${formatarMoeda(Number(a.preco_kg_mn))}/kg` : ' · sem preço'}`,
    }));
  }, []);

  async function escolherLote(lid: string | null) {
    setLoteId(lid);
    if (!lid) return;
    const [{ data: l }, { count }] = await Promise.all([
      supabase.from('lotes').select('descricao, ecc, peso_inicial_medio, peso_parcial_medio').eq('id', lid).single(),
      supabase.from('animais').select('id', { count: 'exact', head: true }).eq('lote_id', lid).eq('situacao', 'ativo'),
    ]);
    setCabecas(count ? String(count) : '');
    if (l) {
      const peso = l.peso_parcial_medio ?? l.peso_inicial_medio;
      if (peso != null) setPv(numeroParaCampo(peso));
      if (l.ecc != null) setEcc([String(l.ecc)]);
      if (!descricao && l.descricao) setDescricao(l.descricao);
    }
  }

  async function adicionarAlimento(aid: string | null) {
    if (!aid) return;
    const { data: a, error } = await supabase.from('alimentos').select('*').eq('id', aid).single();
    if (error || !a) return setErro(traduzirErro(error));
    setItens((v) => [
      ...v,
      {
        chave: novaChave(),
        alimento_id: a.id,
        nome: a.nome,
        tipo: a.tipo,
        kg_mn: 0,
        kgTexto: '',
        ms: Number(a.ms),
        pb: Number(a.pb),
        ndt: Number(a.ndt),
        fdn: Number(a.fdn),
        preco_kg_mn: a.preco_kg_mn != null ? Number(a.preco_kg_mn) : null,
      },
    ]);
  }

  const mudarKg = (chave: string, t: string) => setItens((v) => v.map((i) => (i.chave === chave ? { ...i, kgTexto: t } : i)));
  const tirarItem = (chave: string) => setItens((v) => v.filter((i) => i.chave !== chave));

  async function abrirParaAlterar() {
    setAlterarErro(null);
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m || !fid) return setAlterarErro('Digite o número da dieta.');
    const { data: d } = await supabase.from('dietas').select('id').eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!d) return setAlterarErro(`Não há dieta nº ${m[1]} nesta fazenda.`);
    setAlterarAberto(false);
    setAlterarNum('');
    navegacao.navigate('DietaForm', { id: d.id });
  }

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    if (!data || !dataValida(data)) e.data = 'Informe a data.';
    if (!n(pv) || (n(pv) ?? 0) <= 0) e.pv = 'Informe o peso vivo médio.';
    const cab = cabecas.trim() ? Number(cabecas) : 0;
    if (!Number.isInteger(cab) || cab < 0) e.cabecas = 'Número inválido.';
    if (apt === 'corte' && gmd.trim() && n(gmd) == null) e.gmd = 'Valor inválido.';
    if (apt === 'leite') {
      if (!n(leite)) e.leite = 'Informe a produção diária.';
      if (gordura.trim() && n(gordura) == null) e.gordura = 'Valor inválido.';
    }
    if (apt === 'genetica' && !genTipo[0]) e.genTipo = 'Escolha: Receptoras, Doadoras ou Touros.';
    if (usaPerc && cmsPerc.trim() && (n(cmsPerc) == null || (n(cmsPerc) ?? 0) <= 0)) e.cmsPerc = 'Valor inválido.';
    if (itens.length === 0) e.itens = 'Adicione pelo menos um alimento.';
    else if (itens.some((i) => n(i.kgTexto) == null || (n(i.kgTexto) ?? 0) <= 0)) e.itens = 'Informe os kg de cada alimento (ou tire o que não vai usar).';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    const p = {
      id: id ?? null,
      fazenda_id: fid,
      data: paraBanco(data),
      aptidao: apt,
      lote_id: loteId,
      descricao: descricao.trim(),
      cabecas: cab,
      pv: n(pv),
      ecc: ecc[0] ? Number(ecc[0]) : null,
      gmd: apt === 'corte' ? n(gmd) : null,
      leite_l: apt === 'leite' ? n(leite) : null,
      gordura: apt === 'leite' ? n(gordura) : null,
      del: apt === 'leite' && del.trim() ? Number(del) : null,
      genetica_tipo: apt === 'genetica' ? genTipo[0] : null,
      cms_perc_pv: usaPerc ? n(cmsPerc) ?? cmsPercPadrao(apt) : null,
      cms_kg: cms != null ? Math.round(cms * 1000) / 1000 : null,
      meta_pb: metas.pb,
      meta_ndt: metas.ndt,
      meta_fdn_min: metas.fdnMin,
      observacoes: obs.trim(),
      itens: itensCalc.map((i) => ({ alimento_id: i.alimento_id, nome: i.nome, tipo: i.tipo, kg_mn: i.kg_mn, ms: i.ms, pb: i.pb, ndt: i.ndt, fdn: i.fdn, preco_kg_mn: i.preco_kg_mn })),
    };

    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_dieta', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { id: string; numero: number };
    if (!id) {
      navegacao.replace('DietaForm', { aviso: `Dieta nº ${res.numero} gravada. Veja em Consultar.` });
    } else {
      navegacao.goBack();
    }
  }

  function excluir() {
    Alert.alert('Excluir dieta', `Excluir a dieta nº ${numero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('dietas').delete().eq('id', id!);
          if (error) setErro(traduzirErro(error));
          else voltarDaConsulta(navegacao, id, true); // V149: se veio da ficha, volta direto à Consulta
        },
      },
    ]);
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  const abas = !id && <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaDietas />
      </Tela>
    );
  }

  const cabN = cabecas.trim() ? Number(cabecas) || 0 : 0;

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {/* ----- número e data ----- */}
      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Dieta nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero ?? '…' : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {!id &&
        (alterarAberto ? (
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Alterar a dieta nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
            </View>
            <View style={{ width: 110, paddingTop: 26 }}>
              <Botao titulo="Abrir" tipo="secundario" onPress={abrirParaAlterar} />
            </View>
          </View>
        ) : (
          <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
            Alterar uma dieta já cadastrada
          </Text>
        ))}

      {/* ----- 1. o rebanho ----- */}
      <Secao titulo="Rebanho" />
      <Escolha rotulo="Aptidão" opcoes={APTIDOES} valor={aptidao} aoMudar={(v) => setAptidao(v)} />
      <SeletorLista rotulo="Lote" valorId={loteId} aoMudar={escolherLote} carregar={carregarLotes} permitirLimpar vazio="Nenhum lote ativo." />
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} autoCapitalize="sentences" placeholder="Ex.: Terminação confinamento" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Cabeças" value={cabecas} onChangeText={(t) => setCabecas(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" erro={erros.cabecas} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Peso vivo médio (kg) *" value={pv} onChangeText={setPv} keyboardType="decimal-pad" erro={erros.pv} />
        </View>
      </View>
      <Escolha rotulo="Escore de Condição Corporal" opcoes={ESCORES} valor={ecc} aoMudar={(v) => setEcc(ecc[0] === v[0] ? [] : v)} />

      {apt === 'corte' && <Campo rotulo="Meta de ganho (GMD, kg/dia)" value={gmd} onChangeText={setGmd} keyboardType="decimal-pad" placeholder="Ex.: 1,2" erro={erros.gmd} />}
      {apt === 'leite' && (
        <>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Leite (L/dia) *" value={leite} onChangeText={setLeite} keyboardType="decimal-pad" erro={erros.leite} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="% de gordura" value={gordura} onChangeText={setGordura} keyboardType="decimal-pad" erro={erros.gordura} />
            </View>
          </View>
          <Campo rotulo="Dias em lactação (DEL)" value={del} onChangeText={(t) => setDel(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="Ex.: 90" />
        </>
      )}
      {apt === 'genetica' && <Escolha rotulo="Grupo *" opcoes={TIPOS_GENETICA} valor={genTipo} aoMudar={setGenTipo} erro={erros.genTipo} />}

      {/* ----- consumo e metas ----- */}
      <Secao titulo="Consumo e metas" />
      {usaPerc ? (
        <Campo
          rotulo="Consumo de MS (% do peso vivo)"
          value={cmsPerc}
          onChangeText={setCmsPerc}
          keyboardType="decimal-pad"
          placeholder={numeroParaCampo(cmsPercPadrao(apt))}
          ajuda={cms != null ? `Consumo estimado: ${formatarNumero(cms, 2)} kg de MS/cab/dia` : 'Informe o peso vivo para estimar.'}
          erro={erros.cmsPerc}
        />
      ) : (
        <Text style={estilos.nota}>
          Consumo estimado (equação NRC 2001 para vacas em lactação): {cms != null ? `${formatarNumero(cms, 2)} kg de MS/cab/dia` : 'informe o peso vivo'}
        </Text>
      )}
      <Text style={estilos.nota}>Metas em % da matéria seca. Vêm de uma referência média e podem ser alteradas pelo técnico.</Text>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="PB %" value={metaPb} onChangeText={(t) => { setMetaPb(t); setMetasEditadas(true); }} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="NDT %" value={metaNdt} onChangeText={(t) => { setMetaNdt(t); setMetasEditadas(true); }} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="FDN mín. %" value={metaFdn} onChangeText={(t) => { setMetaFdn(t); setMetasEditadas(true); }} keyboardType="decimal-pad" />
        </View>
      </View>
      {metasEditadas && (
        <Text style={estilos.link} onPress={() => setMetasEditadas(false)}>
          Voltar às metas de referência ({numeroParaCampo(metasRef.pb)} / {numeroParaCampo(metasRef.ndt)} / {numeroParaCampo(metasRef.fdnMin)})
        </Text>
      )}

      {/* ----- 2. a mistura ----- */}
      <Secao titulo="Alimentos da dieta (por cabeça/dia)" />
      {itens.map((i) => {
        const kg = n(i.kgTexto) ?? 0;
        return (
          <View key={i.chave} style={estilos.item}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.itemNome}>{i.nome}</Text>
                <Text style={estilos.itemComp}>{textoComposicao(i)}</Text>
              </View>
              <Pressable onPress={() => tirarItem(i.chave)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Tirar ${i.nome}`}>
                <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
              </Pressable>
            </View>
            <View style={estilos.linha}>
              <View style={{ width: 130 }}>
                <Campo rotulo="kg no cocho" value={i.kgTexto} onChangeText={(t) => mudarKg(i.chave, t)} keyboardType="decimal-pad" placeholder="kg MN" />
              </View>
              <View style={{ flex: 1, paddingTop: 30, gap: 2 }}>
                <Text style={estilos.itemCalc}>{formatarNumero((kg * i.ms) / 100, 2)} kg de MS</Text>
                <Text style={estilos.itemCalc}>
                  {i.preco_kg_mn != null ? `${formatarMoeda(kg * i.preco_kg_mn)}/cab/dia` : 'sem preço cadastrado'}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
      <SeletorLista
        rotulo={itens.length ? 'Adicionar outro alimento' : 'Adicionar alimento'}
        valorId={null}
        aoMudar={adicionarAlimento}
        carregar={carregarAlimentos}
        erro={erros.itens}
        dicaBusca="Nome do alimento"
        vazio="Nenhum alimento cadastrado. Cadastre em Pecuário › Alimentos."
      />
      <Text style={estilos.link} onPress={() => navegacao.push('AlimentoForm', {})}>
        Alimento não está na lista? Cadastrar alimento
      </Text>

      {/* ----- 3. balanço, alertas e ficha ----- */}
      <PainelDieta
        itens={itensCalc}
        metas={metas}
        cms={cms}
        pv={n(pv)}
        aptidao={apt}
        gmd={n(gmd)}
        leite={n(leite)}
        cabecas={cabN}
        tituloFicha={`Dieta nº ${id ? numero : proximo ?? ''}${descricao ? ` – ${descricao}` : ''}`}
        data={data}
      />

      <Secao titulo="Outros" />
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={id ? 'Salvar alterações' : 'Gravar dieta'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir dieta" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 20 },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  itemNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  itemComp: { fontSize: tam.pequeno, color: cores.textoSuave },
  itemCalc: { fontSize: tam.pequeno + 1, color: cores.texto },
});
