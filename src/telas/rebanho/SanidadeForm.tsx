import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMedicamento from '../../componentes/CampoMedicamento';
import Botao from '../../componentes/Botao';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Interruptor from '../../componentes/Interruptor';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { useAvisoTemporario } from '../../lib/useAvisoTemporario';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { codigoLote, identAnimal, nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { doseRecomendada, saldoDe, textoDose, textoOutrosUso, textoRecomendacao, textoSaldo, unidadeDeDose } from '../../lib/insumos';
import { CATEGORIAS_DO_TIPO, MAX_MEDICAMENTOS, MAX_REFORCOS, PRAZOS_SUGERIDOS, ROTULO_SANIDADE, TIPOS_SANIDADE, somarDias } from '../../lib/sanidade';
import ConsultaSanidade from './ConsultaSanidade';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Reforco = { dias: string; dose: string };
type Med = {
  insumoId: string | null;
  unidade: string;
  saldo: number;
  dose: string;
  baixar: boolean;
  comReforco: boolean;
  qtdReforcos: string;
  reforcos: Reforco[];
  recomendacao: string | null;
  indicacoes: string | null;
  incompleto: boolean;
  ins: any | null; // cadastro do produto (dose recomendada, peso base, unidade da dose)
  unidadeEstoque: string;
  fator: number; // quanto da unidade da dose há em 1 unidade de estoque
  doseEditada: boolean;
  reforcosEditados: boolean;
};

const MED_VAZIO: Med = { insumoId: null, unidade: '', saldo: 0, dose: '', baixar: true, comReforco: false, qtdReforcos: '', reforcos: [], recomendacao: null, indicacoes: null, incompleto: false, ins: null, unidadeEstoque: '', fator: 1, doseEditada: false, reforcosEditados: false };
/** O produto tem dose recomendada completa? (por cabeça: a dose; por peso: a dose e o peso base) */
const temRecomendacao = (ins: any) => !!ins?.dose_recomendada && (ins.dose_por !== 'kg' || !!ins.dose_cada_kg);
const campoNum = (n: number | null | undefined) => numeroParaCampo(n);
const num = (t: string) => t.replace(/[^\d.,]/g, '');

/** Sem acento e em minúsculas, para comparar textos. */
const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const PALAVRAS_VAZIAS = new Set(['para', 'com', 'sem', 'dos', 'das', 'nos', 'nas', 'uma', 'por', 'provavel', 'suspeita', 'de', 'do', 'da', 'e', 'ou']);

/**
 * Produtos cujo "Para quais doenças serve" combina com o diagnóstico digitado.
 * Combina se alguma palavra do diagnóstico (4+ letras) aparece nas doenças do produto,
 * ou se alguma doença do produto aparece no diagnóstico. Com dose recomendada primeiro, depois mais estoque.
 */
function produtosIndicados(catalogo: any[], diagnostico: string): any[] {
  const d = normal(diagnostico.trim());
  if (d.length < 3) return [];
  const palavras = d.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PALAVRAS_VAZIAS.has(w));
  return catalogo
    .filter((p) => {
      if (!p.indicacoes) return false;
      const ind = normal(p.indicacoes);
      const doencas = ind.split(/[;,\n/]+/).map((x) => x.trim()).filter((x) => x.length >= 3);
      return palavras.some((w) => ind.includes(w)) || doencas.some((x) => d.includes(x));
    })
    .sort((a, b) => Number(!!b.dose_recomendada) - Number(!!a.dose_recomendada) || b.saldo - a.saldo)
    .slice(0, 6);
}

export default function SanidadeForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'SanidadeForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const avisoAnterior = useAvisoTemporario(params?.aviso);

  const [tipo, setTipo] = useState<string[]>(['vacina']);
  const [data, setData] = useState(hojeBR());
  const [alvo, setAlvo] = useState<string[]>(['lote']);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [cabLote, setCabLote] = useState<number | null>(null);
  const [cabecas, setCabecas] = useState('');
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState('');
  const [peso, setPeso] = useState('');
  const [pesoOrigem, setPesoOrigem] = useState<string | null>(null);
  const [meds, setMeds] = useState<Med[]>([{ ...MED_VAZIO }]);
  const [responsavel, setResponsavel] = useState('');
  const [obs, setObs] = useState('');

  const [catalogo, setCatalogo] = useState<any[]>([]); // produtos do tipo, com estoque (para os indicados)
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const baseIso = paraBanco(data) ?? hojeBanco();

  // ---- listas ----
  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao').eq('fazenda_id', fid!).eq('situacao', 'ativo').order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla) }));
  }, [fid, sigla]);

  const carregarAnimais = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(
      supabase.from('animais').select('id, numero_interno, brinco, nome, lote:lotes!animais_lote_id_fkey ( numero )').eq('fazenda_id', fid!).eq('situacao', 'ativo').order('numero_interno'),
    );
    return d.map((a) => {
      const l = Array.isArray(a.lote) ? a.lote[0] : a.lote;
      return { id: a.id, titulo: [identAnimal(a), a.nome].filter(Boolean).join('  '), detalhe: l ? codigoLote(l.numero, sigla) : 'Sem lote' };
    });
  }, [fid, sigla]);

  // Ao escolher o lote, já vem a quantidade de cabeças dele.
  useEffect(() => {
    setCabLote(null);
    if (!loteId) return;
    supabase
      .from('animais')
      .select('id', { count: 'exact', head: true })
      .eq('lote_id', loteId)
      .eq('situacao', 'ativo')
      .then(({ count }) => {
        setCabLote(count ?? 0);
        setCabecas(String(count ?? 0));
      });
  }, [loteId]);

  // Peso aproximado: sugere o da última pesagem do animal ou a média da última do lote.
  useEffect(() => {
    setPesoOrigem(null);
    (async () => {
      if (alvo[0] === 'animal' && animalId) {
        const { data: d } = await supabase
          .from('pesagens')
          .select('data, itens:pesagem_itens!inner ( peso_bruto_kg )')
          .eq('itens.animal_id', animalId)
          .order('data', { ascending: false })
          .limit(1);
        const p0 = (d ?? [])[0] as any;
        const it0 = p0 ? (Array.isArray(p0.itens) ? p0.itens[0] : p0.itens) : null;
        const ult = it0 ? { kg: Number(it0.peso_bruto_kg), data: p0.data } : null;
        if (ult) {
          setPeso(numeroParaCampo(ult.kg));
          setPesoOrigem(`Da pesagem de ${doBanco(ult.data)}.`);
        }
      } else if (alvo[0] === 'lote' && loteId) {
        const { data: d } = await supabase
          .from('pesagens')
          .select('data, itens:pesagem_itens ( quantidade, peso_bruto_kg )')
          .eq('lote_id', loteId)
          .order('data', { ascending: false })
          .limit(1);
        const p0 = (d ?? [])[0] as any;
        if (p0) {
          const its = (p0.itens ?? []) as any[];
          const cab = its.reduce((s, i) => s + i.quantidade, 0);
          const kg = its.reduce((s, i) => s + Number(i.peso_bruto_kg), 0);
          if (cab) {
            setPeso(numeroParaCampo(Math.round((kg / cab) * 10) / 10));
            setPesoOrigem(`Média da pesagem de ${doBanco(p0.data)}.`);
          }
        }
      }
    })();
  }, [alvo, animalId, loteId]);

  const pesoNum = peso.trim() ? lerNumero(peso) : null;

  // Mudou o peso: recalcula as doses que ainda não foram mudadas à mão.
  useEffect(() => {
    setMeds((ms) =>
      ms.map((m) => {
        if (!m.ins) return m;
        const novo = { ...m };
        const d = doseRecomendada(m.ins, pesoNum);
        if (!m.doseEditada && d) novo.dose = numeroParaCampo(d);
        const dr = doseRecomendada(m.ins, pesoNum, true);
        if (!m.reforcosEditados && dr) novo.reforcos = m.reforcos.map((r) => ({ ...r, dose: numeroParaCampo(dr) }));
        return novo;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pesoNum]);

  // ---- produtos do cadastro para o tipo (com estoque), usados nos indicados do diagnóstico ----
  useEffect(() => {
    if (!fid) return;
    (async () => {
      const ins = await consulta<any[]>(supabase.from('insumos').select('*').eq('ativo', true).in('categoria', CATEGORIAS_DO_TIPO[tipo[0]]).order('nome'));
      const movs = ins.length ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade').eq('fazenda_id', fid).in('insumo_id', ins.map((i) => i.id))) : [];
      setCatalogo(ins.map((i) => ({ ...i, saldo: saldoDe(movs.filter((m) => m.insumo_id === i.id)) })));
    })().catch(() => setCatalogo([]));
  }, [tipo, fid]);

  const indicados = useMemo(() => produtosIndicados(catalogo, diagnostico), [catalogo, diagnostico]);

  // Um só indicado e nenhum medicamento escolhido ainda: já coloca no Medicamento 1.
  useEffect(() => {
    const t = setTimeout(() => {
      if (indicados.length === 1 && meds.length === 1 && !meds[0].insumoId) escolherProduto(0, indicados[0].id);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicados]);

  /** Toque num indicado: vai para o primeiro medicamento vazio (ou abre mais um). */
  function usarIndicado(id: string) {
    const vazio = meds.findIndex((m) => !m.insumoId);
    if (vazio >= 0) return escolherProduto(vazio, id);
    if (meds.length >= MAX_MEDICAMENTOS) return setErro(`No máximo ${MAX_MEDICAMENTOS} medicamentos por aplicação.`);
    const i = meds.length;
    setMeds((ms) => [...ms, { ...MED_VAZIO }]);
    setTimeout(() => escolherProduto(i, id), 0);
  }

  // ---- medicamentos ----
  const mudaMed = (i: number, parte: Partial<Med>) => setMeds((ms) => ms.map((m, j) => (j === i ? { ...m, ...parte } : m)));

  async function escolherProduto(i: number, id: string | null) {
    if (!id) return mudaMed(i, { ...MED_VAZIO });
    const [ins, movs] = await Promise.all([
      consulta<any>(supabase.from('insumos').select('*').eq('id', id).single()),
      consulta<any[]>(supabase.from('estoque_movimentos').select('tipo, quantidade').eq('fazenda_id', fid!).eq('insumo_id', id)),
    ]);
    const saldo = saldoDe(movs);
    // A recomendação do cadastro já preenche a dose (se for por cabeça) e os reforços; dá para mudar.
    const ud = unidadeDeDose(ins);
    const parte: Partial<Med> = {
      insumoId: id,
      unidade: ud.unidade,
      unidadeEstoque: ins.unidade,
      fator: ud.fator,
      ins,
      doseEditada: false,
      reforcosEditados: false,
      saldo,
      baixar: true, // sempre ligado; só desliga se o operador quiser
      recomendacao: textoRecomendacao(ins, ins.unidade),
      indicacoes: ins.indicacoes ?? null,
      incompleto: ins.cadastro_completo === false,
    };
    const d0 = doseRecomendada(ins, pesoNum);
    parte.dose = d0 ? numeroParaCampo(d0) : '';
    if ((ins.reforcos_qtd ?? 0) > 0) {
      const dr = doseRecomendada(ins, pesoNum, true);
      const doseRef = dr ? numeroParaCampo(dr) : '';
      parte.comReforco = true;
      parte.qtdReforcos = String(ins.reforcos_qtd);
      parte.reforcos = Array.from({ length: ins.reforcos_qtd }, () => ({ dias: ins.reforco_dias ? String(ins.reforco_dias) : '', dose: doseRef }));
    }
    mudaMed(i, parte);
  }

  // Quantidade de reforços: mantém os já preenchidos; os novos repetem o prazo e a dose do último.
  function mudarQtdReforcos(i: number, t: string) {
    const q = Math.min(Number(t.replace(/\D/g, '') || 0), MAX_REFORCOS);
    setMeds((ms) =>
      ms.map((m, j) => {
        if (j !== i) return m;
        const lista = m.reforcos.slice(0, q);
        const modelo = lista[lista.length - 1] ?? { dias: '', dose: m.dose };
        while (lista.length < q) lista.push({ ...modelo });
        return { ...m, qtdReforcos: t.replace(/\D/g, '').slice(0, 2), reforcos: lista };
      }),
    );
  }
  const mudaReforco = (i: number, r: number, parte: Partial<Reforco>) =>
    setMeds((ms) =>
      ms.map((m, j) => (j === i ? { ...m, reforcosEditados: m.reforcosEditados || parte.dose !== undefined, reforcos: m.reforcos.map((x, k) => (k === r ? { ...x, ...parte } : x)) } : m)),
    );
  const prazoParaTodos = (i: number, dias: number) =>
    setMeds((ms) => ms.map((m, j) => (j === i ? { ...m, reforcos: m.reforcos.map((x) => ({ ...x, dias: String(dias) })) } : m)));

  const cabNum = alvo[0] === 'animal' ? 1 : Number(cabecas || 0);

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    const iso = paraBanco(data);
    if (!dataValida(data) || !iso) e.data = 'Data inválida.';
    else if (iso > hojeBanco()) e.data = 'A data não pode ser futura.';
    if (alvo[0] === 'lote') {
      if (!loteId) e.lote = 'Escolha o lote.';
      if (!Number.isInteger(cabNum) || cabNum < 1) e.cabecas = 'Informe quantas cabeças foram tratadas.';
      else if (cabLote !== null && cabNum > cabLote) e.cabecas = `O lote tem ${cabLote} cabeças.`;
    } else if (!animalId) e.animal = 'Escolha o animal.';

    meds.forEach((m, i) => {
      const n = i + 1;
      if (!m.insumoId) e[`med${i}`] = `Escolha o medicamento ${n}.`;
      else if (!temRecomendacao(m.ins)) e[`med${i}`] = `O medicamento ${n} está sem dose recomendada no cadastro: não pode ser aplicado.`;
      const d = lerNumero(m.dose);
      if (!d || d <= 0) e[`dose${i}`] = `Informe a dose do medicamento ${n}.`;
      if (m.comReforco) {
        if (m.reforcos.length === 0) e[`ref${i}`] = `Informe quantos reforços do medicamento ${n}.`;
        m.reforcos.forEach((r, k) => {
          if (!Number(r.dias) || Number(r.dias) < 1) e[`ref${i}`] = `Informe o prazo em dias do ${k + 1}º reforço (medicamento ${n}).`;
          const dr = lerNumero(r.dose);
          if (!dr || dr <= 0) e[`ref${i}`] = `Informe a dose do ${k + 1}º reforço (medicamento ${n}).`;
        });
      }
    });
    const ids = meds.map((m) => m.insumoId).filter(Boolean);
    if (new Set(ids).size !== ids.length) e.meds = 'O mesmo medicamento aparece duas vezes.';
    setErros(e);
    const lista = Object.values(e).filter(Boolean);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    setSalvando(true);
    const { data: r, error } = await supabase.rpc('lancar_sanidade', {
      p: {
        fazenda: fid,
        tipo: tipo[0],
        data: iso,
        lote: alvo[0] === 'lote' ? loteId : null,
        animal: alvo[0] === 'animal' ? animalId : null,
        cabecas: cabNum,
        diagnostico,
        peso_medio: pesoNum,
        responsavel,
        obs,
        medicamentos: meds.map((m) => ({
          insumo: m.insumoId,
          dose: lerNumero(m.dose),
          baixar: m.baixar,
          reforcos: m.comReforco ? m.reforcos.map((x) => ({ dias: Number(x.dias), dose: lerNumero(x.dose) })) : [],
        })),
      },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { cabecas: number; medicamentos: number; reforcos: number; baixas: number };
    navegacao.replace('SanidadeForm', {
      aviso:
        `${ROTULO_SANIDADE[tipo[0]]} lançada: ${formatarNumero(res.cabecas)} ${res.cabecas === 1 ? 'cabeça' : 'cabeças'}, ${res.medicamentos} ${res.medicamentos === 1 ? 'medicamento' : 'medicamentos'}.` +
        (res.reforcos ? ` ${res.reforcos} ${res.reforcos === 1 ? 'reforço ficou' : 'reforços ficaram'} na agenda (aba Consultar).` : ''),
    });
  }

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Lançar" />;

  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaSanidade />
      </Tela>
    );
  }


  return (
    <Tela
      rodape={
        <RodapeAcoes
          titulo="Aplicado"
          aoConfirmar={salvar}
          carregando={salvando}
          aoDescartar={() => navegacao.replace('SanidadeForm')}
          erro={erro}
        />
      }
    >
      {abas}
      {avisoAnterior && <Aviso tipo="sucesso" texto={avisoAnterior} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <Escolha
        rotulo="Tipo"
        opcoes={TIPOS_SANIDADE}
        valor={tipo}
        aoMudar={(v) => {
          setTipo(v);
          setMeds([{ ...MED_VAZIO }]);
        }}
      />
      <CampoData rotulo="Data da aplicação *" valor={data} aoMudar={setData} erro={erros.data} />

      <Escolha
        rotulo="Em quem"
        opcoes={[
          { valor: 'lote', rotulo: 'Lote' },
          { valor: 'animal', rotulo: 'Um animal' },
        ]}
        valor={alvo}
        aoMudar={setAlvo}
      />
      {alvo[0] === 'lote' ? (
        <>
          <SeletorLista rotulo="Lote *" valorId={loteId} aoMudar={setLoteId} carregar={carregarLotes} erro={erros.lote} vazio="Nenhum lote ativo." />
          {loteId && (
            <Campo
              rotulo="Cabeças tratadas *"
              value={cabecas}
              onChangeText={(t) => setCabecas(t.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              ajuda={cabLote !== null ? `O lote tem ${cabLote} cabeças. Mude se nem todas foram tratadas.` : undefined}
              erro={erros.cabecas}
            />
          )}
        </>
      ) : (
        <SeletorLista rotulo="Animal *" valorId={animalId} aoMudar={setAnimalId} carregar={carregarAnimais} dicaBusca="Número, brinco ou nome" erro={erros.animal} vazio="Nenhum animal no rebanho." />
      )}

      {/* ----- peso e medicamentos ----- */}
      <Secao titulo="Peso para cálculo da dose" />
      <Campo
        rotulo={alvo[0] === 'lote' ? 'Peso médio aproximado por cabeça (kg)' : 'Peso aproximado do animal (kg)'}
        value={peso}
        onChangeText={(t) => {
          setPeso(t.replace(/[^\d.,]/g, ''));
          setPesoOrigem(null);
        }}
        keyboardType="decimal-pad"
        ajuda={pesoOrigem ?? 'Usado para calcular a dose dos medicamentos dosados por peso vivo.'}
      />
      <Campo
        rotulo="Diagnóstico provável"
        value={diagnostico}
        onChangeText={setDiagnostico}
        ajuda="Os medicamentos indicados para este diagnóstico (no cadastro) aparecem abaixo."
        autoCapitalize="sentences"
        multiline
        placeholder={tipo[0] === 'vacina' ? 'Opcional (ex.: campanha de aftosa)' : 'Ex.: pneumonia, tristeza parasitária'}
        style={{ minHeight: 60, paddingTop: 12, textAlignVertical: 'top' }}
      />


      {/* ----- medicamentos indicados para o diagnóstico (do cadastro) ----- */}
      {diagnostico.trim().length >= 3 && (
        <View style={estilos.indicados}>
          <Text style={estilos.indTitulo}>
            {indicados.length ? `Indicados no cadastro para "${diagnostico.trim()}"` : `Nenhum produto do cadastro indicado para "${diagnostico.trim()}"`}
          </Text>
          {indicados.length === 0 && (
            <Text style={estilos.doseLinha}>Escolha o produto abaixo. Para aparecer aqui da próxima vez, informe as doenças em "Para quais doenças serve" no cadastro do produto.</Text>
          )}
          {indicados.map((p) => {
            const emUso = meds.some((m) => m.insumoId === p.id);
            return (
              <Pressable key={p.id} onPress={() => !emUso && usarIndicado(p.id)} style={({ pressed }) => [estilos.indItem, pressed && { opacity: 0.6 }]} accessibilityRole="button">
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={estilos.indNome}>{p.nome}</Text>
                  <Text style={estilos.doseLinha}>{textoDose(p, p.unidade) ?? 'SEM DOSE RECOMENDADA (complete o cadastro)'}</Text>
                  <Text style={estilos.doseLinha}>Estoque: {textoSaldo(p.saldo, p)}</Text>
                </View>
                <Text style={emUso ? estilos.indEmUso : estilos.indUsar}>{emUso ? '✓ Em uso' : '+ Usar'}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ----- medicamentos ----- */}
      {meds.map((m, i) => {
        const doseNum = lerNumero(m.dose);
        const consumo = m.insumoId && doseNum ? doseNum * cabNum : null;
        let dataRef = baseIso;
        return (
          <View key={i} style={estilos.cartao}>
            <View style={estilos.cabCartao}>
              <Text style={estilos.tituloCartao}>Medicamento {i + 1}</Text>
              {meds.length > 1 && (
                <Pressable onPress={() => setMeds((ms) => ms.filter((_, j) => j !== i))} hitSlop={10} accessibilityRole="button">
                  <Text style={estilos.remover}>Remover</Text>
                </Pressable>
              )}
            </View>
            <CampoMedicamento
              key={`${tipo[0]}-${i}`}
              rotulo="Produto *"
              tipo={tipo[0]}
              fazendaId={fid!}
              valorId={m.insumoId}
              aoMudar={(id) => escolherProduto(i, id)}
              erro={erros[`med${i}`]}
              peso={pesoNum}
            />
            {m.insumoId && !temRecomendacao(m.ins) && (
              <Aviso tipo="erro" texto="Este produto está sem dose recomendada no cadastro e não pode ser aplicado. Complete o cadastro em Pecuário › Medicamentos e vacinas." />
            )}
            {/* Só segue quando o produto tem dose recomendada. */}
            {m.insumoId && temRecomendacao(m.ins) && (
              <>
              {(() => {
                const calc = doseRecomendada(m.ins, pesoNum);
                const porKg = m.ins.dose_por === 'kg';
                const aplicada = lerNumero(m.dose);
                const diferente = calc && aplicada && Math.abs(aplicada - calc) > 0.001;
                return (
                  <View style={estilos.doses}>
                    {m.indicacoes ? <Text style={estilos.doseLinha}>Serve para: {m.indicacoes}</Text> : null}

                    <View style={estilos.doseBloco}>
                      <Text style={estilos.doseRotulo}>1. DOSE RECOMENDADA (do cadastro)</Text>
                      <Text style={estilos.doseValor}>{textoDose(m.ins, m.unidadeEstoque)}</Text>
                      <Text style={estilos.doseLinha}>{textoOutrosUso(m.ins, m.unidadeEstoque)}</Text>
                    </View>

                    <View style={[estilos.doseBloco, estilos.doseCalculada]}>
                      <Text style={estilos.doseRotulo}>2. DOSE CALCULADA POR CABEÇA</Text>
                      {porKg && !pesoNum ? (
                        <Text style={estilos.doseFalta}>Falta o peso: informe o peso aproximado em "Peso para cálculo da dose", acima.</Text>
                      ) : (
                        <>
                          <Text style={estilos.doseGrande}>
                            {formatarNumero(calc ?? 0, 2)} {m.unidade}
                          </Text>
                          <Text style={estilos.doseLinha}>
                            {porKg
                              ? `${formatarNumero(pesoNum ?? 0, 1)} kg ÷ ${formatarNumero(Number(m.ins.dose_cada_kg), 0)} kg × ${formatarNumero(Number(m.ins.dose_recomendada), 2)} ${m.unidade}`
                              : 'Dose por cabeça (não depende do peso).'}
                          </Text>
                        </>
                      )}
                    </View>

                    <View style={[estilos.doseBloco, estilos.doseAplicada]}>
                      <Text style={estilos.doseRotulo}>3. DOSE APLICADA POR CABEÇA *</Text>
                      <View style={estilos.aplicadaLinha}>
                        <View style={{ width: 130 }}>
                          <Campo
                            rotulo=""
                            value={m.dose}
                            onChangeText={(t) => mudaMed(i, { dose: num(t), doseEditada: true })}
                            keyboardType="decimal-pad"
                            placeholder="0,0"
                            style={estilos.aplicadaEntrada}
                          />
                        </View>
                        <Text style={estilos.aplicadaUnidade}>{m.unidade} por cabeça</Text>
                      </View>
                      {erros[`dose${i}`] ? <Text style={estilos.erro}>{erros[`dose${i}`]}</Text> : null}
                      <Text style={estilos.doseLinha}>Informe o que foi aplicado em cada animal. Já vem com a dose calculada; mude só se aplicou diferente. É o que baixa do estoque.</Text>
                      {diferente ? <Text style={estilos.doseFalta}>Diferente da calculada ({formatarNumero(calc!, 2)} {m.unidade}).</Text> : null}
                    </View>
                  </View>
                );
              })()}
              {m.insumoId && (
                <>
                  {consumo !== null && consumo > 0 && (
                    <Text style={estilos.nota}>
                      Consumo: {formatarNumero(consumo, Number.isInteger(consumo) ? 0 : 2)} {m.unidade}
                      {m.fator !== 1 ? ` (= ${formatarNumero(consumo / m.fator, 3)} ${m.unidadeEstoque})` : ''}. Em estoque: {m.ins ? textoSaldo(m.saldo, m.ins) : formatarNumero(m.saldo, 2)}.
                    </Text>
                  )}
                  <Interruptor
                    rotulo="Baixar do estoque"
                    descricao={!m.baixar ? 'Desligado: esta aplicação NÃO vai baixar o estoque.' : m.saldo <= 0 ? 'Estoque zerado: vai baixar mesmo assim e o saldo fica negativo (lance a compra depois, ou cadastre o produto com "Entrada parcial").' : 'Tira o consumo do estoque da fazenda (os reforços baixam quando forem marcados como aplicados).'}
                    valor={m.baixar}
                    aoMudar={(v) => mudaMed(i, { baixar: v })}
                  />
                </>
              )}

              <Escolha
                opcoes={[
                  { valor: 'unica', rotulo: 'Dose única' },
                  { valor: 'reforco', rotulo: 'Com reforço' },
                ]}
                valor={[m.comReforco ? 'reforco' : 'unica']}
                aoMudar={(v) => mudaMed(i, { comReforco: v[0] === 'reforco' })}
              />
              {m.comReforco && (
                <>
                  <Campo rotulo="Quantos reforços?" value={m.qtdReforcos} onChangeText={(t) => mudarQtdReforcos(i, t)} keyboardType="number-pad" placeholder={`1 a ${MAX_REFORCOS}`} />
                  {m.reforcos.length > 0 && (
                    <>
                      <Text style={estilos.rotuloPequeno}>Prazo entre as doses (preenche todos)</Text>
                      <Escolha
                        opcoes={PRAZOS_SUGERIDOS.map((d) => ({ valor: String(d), rotulo: `${d} dias` }))}
                        valor={[]}
                        aoMudar={(v) => prazoParaTodos(i, Number(v[0]))}
                      />
                    </>
                  )}
                  {m.reforcos.map((r, k) => {
                    const dias = Number(r.dias || 0);
                    if (dias > 0) dataRef = somarDias(dataRef, dias);
                    return (
                      <View key={k} style={estilos.reforco}>
                        <Text style={estilos.reforcoTitulo}>
                          {k + 1}º reforço{dias > 0 ? `: ${doBanco(dataRef)}` : ''}
                        </Text>
                        <View style={estilos.linha}>
                          <View style={{ flex: 1 }}>
                            <Campo rotulo={k === 0 ? 'Dias depois da aplicação' : 'Dias depois do anterior'} value={r.dias} onChangeText={(t) => mudaReforco(i, k, { dias: t.replace(/\D/g, '').slice(0, 3) })} keyboardType="number-pad" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Campo rotulo={`Dose${m.unidade ? ` (${m.unidade})` : ''}`} value={r.dose} onChangeText={(t) => mudaReforco(i, k, { dose: num(t) })} keyboardType="decimal-pad" />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  {erros[`ref${i}`] ? <Text style={estilos.erro}>{erros[`ref${i}`]}</Text> : null}
                </>
              )}
              </>
            )}
          </View>
        );
      })}
      {erros.meds ? <Text style={estilos.erro}>{erros.meds}</Text> : null}
      {meds.length < MAX_MEDICAMENTOS && (
        <Botao titulo={`+ Adicionar medicamento (${meds.length} de ${MAX_MEDICAMENTOS})`} tipo="secundario" onPress={() => setMeds((ms) => [...ms, { ...MED_VAZIO }])} />
      )}

      <Campo rotulo="Responsável" value={responsavel} onChangeText={setResponsavel} autoCapitalize="words" placeholder="Quem aplicou ou o veterinário" />
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12 },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 12 },
  cabCartao: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tituloCartao: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura },
  remover: { fontSize: tam.pequeno + 1, color: cores.erro, fontWeight: '600' },
  rotuloPequeno: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  reforco: { backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 8 },
  reforcoTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  doses: { gap: 8 },
  frase: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 },
  fraseTexto: { fontSize: tam.texto, fontWeight: '600', color: cores.texto, paddingBottom: 14 },
  doseBloco: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  doseCalculada: { backgroundColor: cores.sucessoFundo },
  doseRotulo: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  doseValor: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  doseGrande: { fontSize: 24, fontWeight: '800', color: cores.primariaEscura },
  doseLinha: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  doseAplicada: { backgroundColor: cores.fundo, borderWidth: 1.5, borderColor: cores.primaria },
  indicados: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 10, gap: 6 },
  indTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.primariaEscura },
  indItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.cartao, borderRadius: tam.raio, padding: 10 },
  indNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  indUsar: { fontSize: tam.texto, fontWeight: '800', color: cores.primaria },
  indEmUso: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.sucesso },
  aplicadaLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aplicadaEntrada: { fontSize: 22, fontWeight: '800', textAlign: 'center', minHeight: 56 },
  aplicadaUnidade: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto },
  doseFalta: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.erro },
});
