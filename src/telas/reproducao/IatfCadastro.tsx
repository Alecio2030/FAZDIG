import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import SeletorAnimais from '../../componentes/SeletorAnimais';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import CampoAnimal, { rotuloAnimal } from '../../componentes/CampoAnimal';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarQtd, lerNumero } from '../../lib/formatos';
import { nomeLote } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { LIMITE_CONSANGUINIDADE, METODOS_DG, SEMENS, parentesco, previsaoParto, somarDias } from '../../lib/reproducao';
import { genealogias } from '../../lib/reproducaoDados';
import { cores, tam } from '../../tema';

type Etapa = { dia: number; acao: string; ia?: boolean; feito?: string | null };
type EtapaForm = { chave: string; dia: string; acao: string; ia?: boolean };
let cont = 0;
const chave = () => `e${Date.now()}_${cont++}`;

/** Protocolo de IATF: abrir um novo ou continuar um aberto (manejos, inseminação e DG). */
export default function IatfCadastro({ iatfInicial }: { iatfInicial?: string }) {
  const [iatfId, setIatfId] = useState<string | null>(iatfInicial ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  if (iatfId) return <IatfAndamento id={iatfId} avisoInicial={aviso} aoFechar={() => { setIatfId(null); setAviso(null); }} />;
  return <IatfNovo aoAbrir={(id, texto) => { setAviso(texto); setIatfId(id); }} />;
}

// ======================================================================
function IatfNovo({ aoAbrir }: { aoAbrir: (id: string, aviso: string) => void }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [proximo, setProximo] = useState<number | null>(null);
  const [d0, setD0] = useState(hojeBR());
  const [protocoloId, setProtocoloId] = useState<string | null>(null);
  const [protocoloNome, setProtocoloNome] = useState('');
  const [etapas, setEtapas] = useState<EtapaForm[]>([]);
  const [dg1, setDg1] = useState('30');
  const [dg2, setDg2] = useState('60');
  const [loteId, setLoteId] = useState<string | null>(null);
  const [femeas, setFemeas] = useState<string[]>([]);
  // Fêmeas individuais: entram no protocolo uma a uma, de qualquer lote ou sem lote.
  const [avulsas, setAvulsas] = useState<{ id: string; nome: string }[]>([]);
  const [avulsaId, setAvulsaId] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [continuarAberto, setContinuarAberto] = useState(false);
  const [continuarNum, setContinuarNum] = useState('');
  const [continuarErro, setContinuarErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!fid) return;
    supabase
      .from('repro_iatf')
      .select('numero')
      .eq('fazenda_id', fid)
      .order('numero', { ascending: false })
      .limit(1)
      .then(({ data }) => setProximo(((data?.[0]?.numero as number) ?? 0) + 1));
  }, [fid]);

  const carregarProtocolos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('repro_protocolos').select('id, nome, etapas').eq('ativo', true).order('nome'));
    return d.map((p) => ({ id: p.id, titulo: p.nome, detalhe: (p.etapas as Etapa[]).map((e) => `D${e.dia}`).join(' · ') }));
  }, []);
  const carregarLotes = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, sexo').eq('fazenda_id', fid!).eq('situacao', 'ativo').eq('sexo', 'F').order('numero'));
    return d.map((l) => ({ id: l.id, titulo: nomeLote(l, sigla) }));
  }, [fid, sigla]);

  async function escolherProtocolo(pid: string | null) {
    setProtocoloId(pid);
    if (!pid) return;
    const { data: p } = await supabase.from('repro_protocolos').select('*').eq('id', pid).single();
    if (!p) return;
    setProtocoloNome(p.nome);
    setEtapas((p.etapas as Etapa[]).map((e) => ({ chave: chave(), dia: String(e.dia), acao: e.acao, ia: !!e.ia })));
    setDg1(p.dias_dg1 != null ? String(p.dias_dg1) : '30');
    setDg2(p.dias_dg2 != null ? String(p.dias_dg2) : '');
  }

  // Fêmea individual escolhida: vai para a lista e o campo fica livre para a próxima.
  async function incluirAvulsa(animalId: string | null) {
    if (!animalId) return;
    setAvulsaId(animalId);
    if (!avulsas.some((a) => a.id === animalId) && !femeas.includes(animalId)) {
      const { data } = await supabase.from('animais').select('numero_interno, brinco, nome, registro').eq('id', animalId).maybeSingle();
      setAvulsas((l) => (l.some((a) => a.id === animalId) ? l : [...l, { id: animalId, nome: data ? rotuloAnimal(data) : 'Fêmea' }]));
    }
    setAvulsaId(null);
  }
  // Todas as fêmeas do protocolo: as marcadas no lote e as individuais, sem repetir.
  const todas = [...new Set([...femeas, ...avulsas.map((a) => a.id)])];

  const d0Iso = paraBanco(d0);
  const mudarEtapa = (k: string, campo: 'dia' | 'acao', v: string) => setEtapas((l) => l.map((e) => (e.chave === k ? { ...e, [campo]: campo === 'dia' ? v.replace(/\D/g, '').slice(0, 2) : v } : e)));

  async function continuar() {
    setContinuarErro(null);
    const m = /^0*(\d+)$/.exec(continuarNum.trim());
    if (!m || !fid) return setContinuarErro('Digite o número do protocolo.');
    const { data } = await supabase.from('repro_iatf').select('id').eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!data) return setContinuarErro(`Não há protocolo IATF nº ${m[1]}.`);
    aoAbrir(data.id, '');
  }

  async function abrir() {
    setErro(null);
    const e: Record<string, string> = {};
    if (!d0 || !dataValida(d0)) e.d0 = 'Informe o D0.';
    if (!protocoloNome.trim()) e.protocolo = 'Escolha o protocolo.';
    if (!etapas.length) e.etapas = 'O protocolo precisa de etapas.';
    else if (etapas.some((x) => !x.dia.trim() || !x.acao.trim())) e.etapas = 'Preencha o dia e a ação de cada etapa.';
    else if (!etapas.some((x) => x.ia)) e.etapas = 'Marque qual etapa é a inseminação.';
    if (!todas.length) e.femeas = 'Informe as fêmeas que entram no protocolo (do lote ou individuais).';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;
    setSalvando(true);
    const { data: i, error } = await supabase
      .from('repro_iatf')
      .insert({
        fazenda_id: fid,
        data_d0: d0Iso,
        protocolo_nome: protocoloNome.trim(),
        etapas: etapas
          .map((x) => ({ dia: Number(x.dia), acao: x.acao.trim(), ia: !!x.ia, feito: null }))
          .sort((a, b) => a.dia - b.dia),
        dias_dg1: Number(dg1) || 30,
        dias_dg2: dg2.trim() ? Number(dg2) : null,
        lote_id: loteId,
        observacoes: obs.trim() || null,
      })
      .select('id, numero')
      .single();
    if (error || !i) {
      setSalvando(false);
      return setErro(traduzirErro(error));
    }
    const { error: e2 } = await supabase.from('repro_iatf_femeas').insert(todas.map((a) => ({ iatf_id: i.id, animal_id: a })));
    setSalvando(false);
    if (e2) return setErro(`Protocolo nº ${i.numero} aberto, mas as fêmeas não foram gravadas: ${traduzirErro(e2)}`);
    aoAbrir(i.id, `Protocolo IATF nº ${i.numero} aberto com ${todas.length} ${todas.length === 1 ? 'fêmea' : 'fêmeas'}. Siga a agenda abaixo.`);
  }

  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>IATF nº</Text>
          <Text style={estilos.numeroValor}>{proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Início (D0) *" valor={d0} aoMudar={setD0} erro={erros.d0} />
        </View>
      </View>
      {continuarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Continuar o protocolo nº" value={continuarNum} onChangeText={(t) => setContinuarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={continuarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={continuar} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setContinuarAberto(true)}>
          Continuar um protocolo já aberto (manejos, IA e DG)
        </Text>
      )}

      <Secao titulo="Protocolo" />
      <SeletorLista rotulo="Modelo de protocolo *" valorId={protocoloId} aoMudar={escolherProtocolo} carregar={carregarProtocolos} erro={erros.protocolo} />
      {etapas.length > 0 && (
        <>
          <Campo rotulo="Nome do protocolo" value={protocoloNome} onChangeText={setProtocoloNome} />
          <Text style={estilos.nota}>Agenda do curral. Pode ajustar os dias e as ações para este grupo.</Text>
          {etapas.map((x) => {
            const dia = Number(x.dia);
            return (
              <View key={x.chave} style={estilos.etapa}>
                <View style={estilos.etapaTopo}>
                  <Text style={estilos.etapaD}>D</Text>
                  <TextInput value={x.dia} onChangeText={(t) => mudarEtapa(x.chave, 'dia', t)} keyboardType="number-pad" style={estilos.etapaDia} selectTextOnFocus />
                  <Text style={estilos.etapaData}>{d0Iso && x.dia.trim() ? doBanco(somarDias(d0Iso, dia)) : ''}</Text>
                  <Pressable onPress={() => setEtapas((l) => l.map((e) => ({ ...e, ia: e.chave === x.chave })))} hitSlop={8} accessibilityRole="radio" accessibilityState={{ checked: !!x.ia }}>
                    <Text style={[estilos.iaTag, x.ia && estilos.iaTagMarcada]}>IA</Text>
                  </Pressable>
                  <Pressable onPress={() => setEtapas((l) => l.filter((e) => e.chave !== x.chave))} hitSlop={8} accessibilityLabel="Tirar etapa">
                    <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
                  </Pressable>
                </View>
                <TextInput value={x.acao} onChangeText={(t) => mudarEtapa(x.chave, 'acao', t)} multiline style={estilos.etapaAcao} placeholder="Ação / medicamentos" placeholderTextColor={cores.textoSuave} />
              </View>
            );
          })}
          <Text style={estilos.link} onPress={() => setEtapas((l) => [...l, { chave: chave(), dia: '', acao: '' }])}>
            + Adicionar etapa
          </Text>
          {erros.etapas && <Text style={estilos.erro}>{erros.etapas}</Text>}
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="DG 1 (dias após a IA)" value={dg1} onChangeText={(t) => setDg1(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="DG 2 / sexagem (dias)" value={dg2} onChangeText={(t) => setDg2(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            </View>
          </View>
        </>
      )}

      <Secao titulo="Fêmeas" />
      <SeletorLista rotulo="Lote de fêmeas (opcional)" valorId={loteId} aoMudar={(l) => { setLoteId(l); setFemeas([]); }} carregar={carregarLotes} permitirLimpar vazio="Nenhum lote de fêmeas ativo." />
      {loteId && <SeletorAnimais loteId={loteId} valor={femeas} aoMudar={setFemeas} />}

      <Secao titulo="Fêmeas individuais" />
      <Text style={estilos.nota}>Para protocolar fêmea por fêmea, de qualquer lote ou sem lote: busque pelo brinco, pelo registro (Série + RGN/RGD), pelo número do sistema ou pelo nome. Cada uma escolhida entra na lista.</Text>
      <CampoAnimal rotulo="Incluir fêmea" valorId={avulsaId} aoMudar={incluirAvulsa} sexo="F" />
      {avulsas.map((a) => (
        <View key={a.id} style={estilos.grade}>
          <Text style={[estilos.femeaNome, { flex: 1 }]}>{a.nome}</Text>
          <Pressable onPress={() => setAvulsas((l) => l.filter((x) => x.id !== a.id))} hitSlop={8} accessibilityLabel={`Tirar ${a.nome}`}>
            <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
          </Pressable>
        </View>
      ))}
      <Text style={estilos.numeroRotulo}>
        {todas.length} {todas.length === 1 ? 'fêmea' : 'fêmeas'} no protocolo
      </Text>
      {erros.femeas && <Text style={estilos.erro}>{erros.femeas}</Text>}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />
      <Botao titulo="Abrir protocolo" onPress={abrir} carregando={salvando} />
    </>
  );
}

// ======================================================================
type Femea = { animal_id: string; situacao: string; ecc: number | null; nome: string };

function IatfAndamento({ id, avisoInicial, aoFechar }: { id: string; avisoInicial: string | null; aoFechar: () => void }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [iatf, setIatf] = useState<any>(null);
  const [femeas, setFemeas] = useState<Femea[]>([]);
  const [servicos, setServicos] = useState<Record<string, any>>({});
  const [dgs, setDgs] = useState<Record<string, any>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(avisoInicial);

  // inseminação
  const [iaData, setIaData] = useState('');
  const [touroFora, setTouroFora] = useState(false);
  const [touroId, setTouroId] = useState<string | null>(null);
  const [touroExterno, setTouroExterno] = useState('');
  const [semen, setSemen] = useState<string[]>(['convencional']);
  const [inseminadorId, setInseminadorId] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [eccs, setEccs] = useState<Record<string, string>>({});
  const [gravandoIa, setGravandoIa] = useState(false);
  // DG
  const [dgData, setDgData] = useState('');
  const [metodo, setMetodo] = useState<string[]>(['ultrassom']);
  const [resultados, setResultados] = useState<Record<string, string>>({});
  const [gravandoDg, setGravandoDg] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const i = await consulta<any>(supabase.from('repro_iatf').select('*, lote:lotes ( numero, descricao )').eq('id', id).single());
      const f = await consulta<any[]>(
        supabase.from('repro_iatf_femeas').select('animal_id, situacao, ecc, animal:animais ( numero_interno, brinco, nome, registro )').eq('iatf_id', id),
      );
      const ev = await consulta<any[]>(supabase.from('repro_eventos').select('id, animal_id, tipo, subtipo, data, touro_externo, touro:animais!repro_eventos_touro_id_fkey ( numero_interno, brinco, nome, registro )').eq('iatf_id', id));
      setIatf({ ...i, lote: Array.isArray(i.lote) ? i.lote[0] : i.lote });
      setFemeas(
        f
          .map((x) => ({ animal_id: x.animal_id, situacao: x.situacao, ecc: x.ecc != null ? Number(x.ecc) : null, nome: rotuloAnimal(Array.isArray(x.animal) ? x.animal[0] : x.animal) }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })),
      );
      const s: Record<string, any> = {};
      const d: Record<string, any> = {};
      for (const e of ev) {
        if (e.tipo === 'servico') s[e.animal_id] = { ...e, touroNome: e.touro ? rotuloAnimal(Array.isArray(e.touro) ? e.touro[0] : e.touro) : e.touro_externo };
        if (e.tipo === 'dg' && (!d[e.animal_id] || e.data > d[e.animal_id].data)) d[e.animal_id] = e;
      }
      setServicos(s);
      setDgs(d);
      const etIa = (i.etapas as Etapa[]).find((x) => x.ia);
      const iaIso = etIa ? somarDias(i.data_d0, etIa.dia) : i.data_d0;
      setIaData((v) => v || doBanco(iaIso));
      setDgData((v) => v || doBanco(somarDias(iaIso, i.dias_dg1 ?? 30)));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!iatf) return erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator color={cores.primaria} style={{ marginTop: 24 }} />;

  const etapas = iatf.etapas as Etapa[];
  const etIa = etapas.find((x) => x.ia);
  const iaIso = etIa ? somarDias(iatf.data_d0, etIa.dia) : iatf.data_d0;
  const hoje = hojeBanco();

  const aptasIa = femeas.filter((f) => f.situacao !== 'saiu' && !servicos[f.animal_id]);
  const paraDg = femeas.filter((f) => servicos[f.animal_id] && !dgs[f.animal_id]);

  async function marcarEtapa(idx: number) {
    const novas = etapas.map((e, i) => (i === idx ? { ...e, feito: e.feito ? null : hoje } : e));
    const { error } = await supabase.from('repro_iatf').update({ etapas: novas }).eq('id', id);
    if (error) return setErro(traduzirErro(error));
    setIatf({ ...iatf, etapas: novas });
  }

  async function mudarSituacao(animalId: string, situacao: string) {
    const { error } = await supabase.from('repro_iatf_femeas').update({ situacao }).eq('iatf_id', id).eq('animal_id', animalId);
    if (error) return setErro(traduzirErro(error));
    setFemeas((l) => l.map((f) => (f.animal_id === animalId ? { ...f, situacao } : f)));
    if (situacao === 'saiu') setMarcadas((m) => m.filter((x) => x !== animalId));
  }

  async function registrarIa(conferir = true) {
    setErro(null);
    setAviso(null);
    if (!iaData || !dataValida(iaData)) return setErro('Informe a data da inseminação.');
    if (!touroFora && !touroId) return setErro('Escolha o touro.');
    if (touroFora && !touroExterno.trim()) return setErro('Informe o touro de fora.');
    if (!marcadas.length) return setErro('Marque as fêmeas inseminadas.');
    for (const a of marcadas) {
      const v = eccs[a];
      const n = v ? lerNumero(v) : null;
      if (v && (n == null || n < 1 || n > 5)) return setErro('ECC deve ser de 1 a 5.');
    }
    if (conferir && !touroFora && touroId) {
      const g = await genealogias([...marcadas, touroId]);
      const problemas = marcadas
        .map((a) => {
          const p = g[a] && g[touroId] ? parentesco(g[a], g[touroId]) : null;
          return p && p.perc > LIMITE_CONSANGUINIDADE ? `${femeas.find((f) => f.animal_id === a)?.nome}: ${formatarQtd(p.perc)}% (${p.motivo})` : null;
        })
        .filter(Boolean);
      if (problemas.length) {
        return Alert.alert('Parentesco próximo', `Consanguinidade esperada acima de ${formatarQtd(LIMITE_CONSANGUINIDADE)}%:\n\n${problemas.join('\n')}`, [
          { text: 'Rever', style: 'cancel' },
          { text: 'Gravar assim mesmo', style: 'destructive', onPress: () => registrarIa(false) },
        ]);
      }
    }
    setGravandoIa(true);
    const data = paraBanco(iaData);
    const registros = marcadas.map((a) => ({
      fazenda_id: fid,
      animal_id: a,
      data,
      tipo: 'servico',
      subtipo: 'iatf',
      touro_id: touroFora ? null : touroId,
      touro_externo: touroFora ? touroExterno.trim() : null,
      semen_tipo: semen[0],
      inseminador_id: inseminadorId,
      iatf_id: id,
      ecc: eccs[a] ? lerNumero(eccs[a]) : null,
    }));
    const { error } = await supabase.from('repro_eventos').insert(registros);
    if (!error) {
      // guarda o ECC também na fêmea do protocolo
      await Promise.all(registros.filter((r) => r.ecc != null).map((r) => supabase.from('repro_iatf_femeas').update({ ecc: r.ecc }).eq('iatf_id', id).eq('animal_id', r.animal_id)));
    }
    setGravandoIa(false);
    if (error) return setErro(traduzirErro(error));
    setAviso(`${registros.length} ${registros.length === 1 ? 'inseminação registrada' : 'inseminações registradas'}.`);
    setMarcadas([]);
    setEccs({});
    carregar();
  }

  async function registrarDg() {
    setErro(null);
    setAviso(null);
    if (!dgData || !dataValida(dgData)) return setErro('Informe a data do DG.');
    const lista = Object.entries(resultados).filter(([a]) => paraDg.some((f) => f.animal_id === a));
    if (!lista.length) return setErro('Marque Prenhe ou Vazia nas fêmeas examinadas.');
    setGravandoDg(true);
    const data = paraBanco(dgData)!;
    const { error } = await supabase.from('repro_eventos').insert(
      lista.map(([a, r]) => ({
        fazenda_id: fid,
        animal_id: a,
        data,
        tipo: 'dg',
        subtipo: r,
        metodo_dg: metodo[0],
        iatf_id: id,
        previsao_parto: r === 'prenhe' ? previsaoParto({ dataServico: servicos[a]?.data }) : null,
      })),
    );
    setGravandoDg(false);
    if (error) return setErro(traduzirErro(error));
    const p = lista.filter(([, r]) => r === 'prenhe').length;
    setAviso(`DG gravado: ${p} ${p === 1 ? 'prenhe' : 'prenhes'} e ${lista.length - p} ${lista.length - p === 1 ? 'vazia' : 'vazias'}.`);
    setResultados({});
    carregar();
  }

  const noProtocolo = femeas.filter((f) => f.situacao !== 'saiu').length;
  const inseminadas = Object.keys(servicos).length;
  const prenhes = Object.values(dgs).filter((d: any) => d.subtipo === 'prenhe').length;

  return (
    <>
      {aviso ? <Aviso tipo="sucesso" texto={aviso} /> : null}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.cartao}>
        <View style={estilos.linhaEntre}>
          <View>
            <Text style={estilos.numeroRotulo}>IATF nº</Text>
            <Text style={estilos.numeroValor}>{iatf.numero}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.numeroRotulo}>D0</Text>
            <Text style={estilos.dataGrande}>{doBanco(iatf.data_d0)}</Text>
          </View>
        </View>
        <Text style={estilos.protocolo}>{iatf.protocolo_nome}</Text>
        {iatf.lote && <Text style={estilos.nota}>Lote {nomeLote(iatf.lote, sigla)}</Text>}
        <Text style={estilos.nota}>
          {noProtocolo} no protocolo · {inseminadas} inseminadas · {prenhes} prenhes
        </Text>
      </View>

      <Secao titulo="Agenda do curral" />
      {etapas.map((e, i) => {
        const dia = somarDias(iatf.data_d0, e.dia);
        const atrasada = !e.feito && dia < hoje;
        const hojeE = !e.feito && dia === hoje;
        return (
          <View key={i} style={[estilos.agenda, hojeE && { borderColor: cores.cafe, borderWidth: 2 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={estilos.agendaTitulo}>
                D{e.dia} · {doBanco(dia)}
                {hojeE ? '  · HOJE' : atrasada ? '  · atrasada' : ''}
              </Text>
              <Text style={estilos.agendaAcao}>{e.acao}</Text>
              {e.feito && <Text style={estilos.feito}>Feito em {doBanco(e.feito)}</Text>}
            </View>
            {!e.ia && (
              <Pressable onPress={() => marcarEtapa(i)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: !!e.feito }}>
                <Ionicons name={e.feito ? 'checkmark-circle' : 'ellipse-outline'} size={32} color={e.feito ? cores.primaria : cores.textoSuave} />
              </Pressable>
            )}
          </View>
        );
      })}
      <View style={estilos.agenda}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={estilos.agendaTitulo}>
            DG 1 · {doBanco(somarDias(iaIso, iatf.dias_dg1 ?? 30))}
            {iatf.dias_dg2 ? `   ·   DG 2 · ${doBanco(somarDias(iaIso, iatf.dias_dg2))}` : ''}
          </Text>
          <Text style={estilos.agendaAcao}>Diagnóstico de gestação ({iatf.dias_dg1} dias{iatf.dias_dg2 ? ` e ${iatf.dias_dg2} dias, com sexagem` : ''} após a IA)</Text>
        </View>
      </View>

      <Secao titulo="Fêmeas no protocolo" />
      {femeas.map((f) => {
        const s = servicos[f.animal_id];
        const d = dgs[f.animal_id];
        return (
          <View key={f.animal_id} style={estilos.femea}>
            <Text style={estilos.femeaNome}>{f.nome}</Text>
            {s ? (
              <Text style={estilos.nota}>
                IA em {doBanco(s.data)} · {s.touroNome ?? 'touro'}
                {d ? ` · DG: ${d.subtipo === 'prenhe' ? 'PRENHE' : 'vazia'}` : ' · aguardando DG'}
              </Text>
            ) : (
              <Escolha
                opcoes={[
                  { valor: 'protocolo', rotulo: 'No protocolo' },
                  { valor: 'perdeu_dispositivo', rotulo: 'Perdeu disp.' },
                  { valor: 'saiu', rotulo: 'Saiu' },
                ]}
                valor={[f.situacao]}
                aoMudar={(v) => mudarSituacao(f.animal_id, v[0])}
              />
            )}
          </View>
        );
      })}

      {aptasIa.length > 0 && (
        <>
          <Secao titulo="Inseminação (IATF)" />
          <CampoData rotulo="Data da IA" valor={iaData} aoMudar={setIaData} />
          <Escolha
            opcoes={[
              { valor: 'rebanho', rotulo: 'Touro do rebanho' },
              { valor: 'fora', rotulo: 'De fora / central' },
            ]}
            valor={[touroFora ? 'fora' : 'rebanho']}
            aoMudar={(v) => setTouroFora(v[0] === 'fora')}
          />
          {touroFora ? (
            <Campo rotulo="Touro (nome, registro e central)" value={touroExterno} onChangeText={setTouroExterno} autoCapitalize="characters" />
          ) : (
            <CampoAnimal rotulo="Touro" valorId={touroId} aoMudar={setTouroId} sexo="M" />
          )}
          <Escolha rotulo="Sêmen" opcoes={SEMENS} valor={semen} aoMudar={setSemen} />
          <CampoPessoaBusca rotulo="Inseminador" valorId={inseminadorId} aoMudar={setInseminadorId} tipoNovo="funcionario" />
          <View style={estilos.linhaEntre}>
            <Text style={estilos.numeroRotulo}>
              {marcadas.length} de {aptasIa.length} marcadas
            </Text>
            <Text style={estilos.link} onPress={() => setMarcadas(marcadas.length === aptasIa.length ? [] : aptasIa.map((f) => f.animal_id))}>
              {marcadas.length === aptasIa.length ? 'Desmarcar todas' : 'Marcar todas'}
            </Text>
          </View>
          <Text style={estilos.nota}>Troque o touro e grave de novo para as fêmeas que usarem outro sêmen.</Text>
          {aptasIa.map((f) => {
            const m = marcadas.includes(f.animal_id);
            return (
              <View key={f.animal_id} style={estilos.grade}>
                <Pressable
                  style={estilos.gradeNome}
                  onPress={() => setMarcadas(m ? marcadas.filter((x) => x !== f.animal_id) : [...marcadas, f.animal_id])}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: m }}
                >
                  <Ionicons name={m ? 'checkbox' : 'square-outline'} size={26} color={m ? cores.primaria : cores.textoSuave} />
                  <Text style={estilos.femeaNome}>{f.nome}</Text>
                </Pressable>
                <TextInput
                  value={eccs[f.animal_id] ?? ''}
                  onChangeText={(t) => setEccs({ ...eccs, [f.animal_id]: t.replace(/[^\d,]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholder="ECC"
                  placeholderTextColor={cores.textoSuave}
                  style={estilos.ecc}
                  selectTextOnFocus
                />
              </View>
            );
          })}
          <Botao titulo={`Registrar inseminação${marcadas.length ? ` (${marcadas.length})` : ''}`} onPress={() => registrarIa()} carregando={gravandoIa} />
        </>
      )}

      {paraDg.length > 0 && (
        <>
          <Secao titulo="Diagnóstico de gestação (DG)" />
          <CampoData rotulo="Data do DG" valor={dgData} aoMudar={setDgData} />
          <Escolha rotulo="Método" opcoes={METODOS_DG} valor={metodo} aoMudar={setMetodo} />
          {paraDg.map((f) => (
            <View key={f.animal_id} style={estilos.femea}>
              <Text style={estilos.femeaNome}>{f.nome}</Text>
              <Escolha
                opcoes={[
                  { valor: 'prenhe', rotulo: 'Prenhe' },
                  { valor: 'vazia', rotulo: 'Vazia' },
                ]}
                valor={resultados[f.animal_id] ? [resultados[f.animal_id]] : []}
                aoMudar={(v) => setResultados({ ...resultados, [f.animal_id]: v[0] })}
              />
            </View>
          ))}
          <Text style={estilos.nota}>Sexagem fetal e dias de gestação: lance o DG individual (Lançamento › Diagnóstico).</Text>
          <Botao titulo={`Gravar DG${Object.keys(resultados).length ? ` (${Object.keys(resultados).length})` : ''}`} onPress={registrarDg} carregando={gravandoDg} />
        </>
      )}

      <Botao titulo="Fechar este protocolo e abrir outro" tipo="secundario" onPress={aoFechar} />
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  linhaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  dataGrande: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto, marginTop: 6 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 20 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  protocolo: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  etapa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 6 },
  etapaTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  etapaD: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  etapaDia: { width: 50, minHeight: 40, borderWidth: 1.5, borderColor: cores.borda, borderRadius: 8, textAlign: 'center', fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  etapaData: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  etapaAcao: { minHeight: 44, borderWidth: 1, borderColor: cores.borda, borderRadius: 8, padding: 8, fontSize: tam.pequeno + 1, color: cores.texto, textAlignVertical: 'top' },
  iaTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1.5, borderColor: cores.borda, color: cores.textoSuave, fontWeight: '800', overflow: 'hidden' },
  iaTagMarcada: { backgroundColor: cores.cafe, borderColor: cores.cafe, color: '#FFFFFF' },
  agenda: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  agendaTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  agendaAcao: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 20 },
  feito: { fontSize: tam.pequeno, color: cores.primaria, fontWeight: '700' },
  femea: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 6 },
  femeaNome: { fontSize: tam.texto, fontWeight: '700', color: cores.texto, flexShrink: 1 },
  grade: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, paddingHorizontal: 10, minHeight: tam.alturaToque },
  gradeNome: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: tam.alturaToque },
  ecc: { width: 64, minHeight: 40, borderWidth: 1.5, borderColor: cores.borda, borderRadius: 8, textAlign: 'center', fontSize: tam.texto, color: cores.texto },
});
