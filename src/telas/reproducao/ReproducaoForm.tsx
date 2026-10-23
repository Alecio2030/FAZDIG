import React, { useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import CampoAnimal from '../../componentes/CampoAnimal';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import IatfCadastro from './IatfCadastro';
import ConsultaReproducao from './ConsultaReproducao';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarQtd, lerNumero, numeroParaCampo } from '../../lib/formatos';
import {
  COLETAS,
  LIMITE_CONSANGUINIDADE,
  METODOS_DG,
  PARTOS,
  RESULTADOS_DG,
  SEMENS,
  SERVICOS,
  TIPOS_LANCAMENTO,
  parentesco,
  previsaoParto,
} from '../../lib/reproducao';
import { genealogias } from '../../lib/reproducaoDados';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const SEXOS_FETO = [
  { valor: 'F', rotulo: 'Fêmea' },
  { valor: 'M', rotulo: 'Macho' },
];
const CRIAS = [
  { valor: '1', rotulo: '1 cria' },
  { valor: '2', rotulo: 'Gêmeos' },
];

/** Reprodução: protocolos de IATF, coberturas/IA/TE, diagnósticos, partos e coletas de oócitos. */
export default function ReproducaoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ReproducaoForm'>>();
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [tipo, setTipo] = useState<string[]>([params?.tipo ?? 'iatf']);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: 'Reprodução' });
  }, [navegacao]);

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaReproducao />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      <Escolha rotulo="Lançamento" opcoes={TIPOS_LANCAMENTO} valor={tipo} aoMudar={setTipo} />
      {tipo[0] === 'iatf' ? <IatfCadastro key="iatf" iatfInicial={params?.iatfId} /> : <FormEvento key={tipo[0]} tipo={tipo[0] as any} />}
    </Tela>
  );
}

/** Um lançamento individual: serviço (monta, IA, IATF, TE, FIV), DG, parto/aborto ou coleta. */
function FormEvento({ tipo }: { tipo: 'servico' | 'dg' | 'parto' | 'coleta' }) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [editId, setEditId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [femeaId, setFemeaId] = useState<string | null>(null);
  const [subtipo, setSubtipo] = useState<string[]>(tipo === 'servico' ? ['ia'] : tipo === 'dg' ? ['prenhe'] : tipo === 'parto' ? ['normal'] : ['fiv']);
  const [touroId, setTouroId] = useState<string | null>(null);
  const [touroFora, setTouroFora] = useState(false);
  const [touroExterno, setTouroExterno] = useState('');
  const [semen, setSemen] = useState<string[]>(['convencional']);
  const [inseminadorId, setInseminadorId] = useState<string | null>(null);
  const [doadoraId, setDoadoraId] = useState<string | null>(null);
  const [ecc, setEcc] = useState('');
  const [metodo, setMetodo] = useState<string[]>(['ultrassom']);
  const [diasGest, setDiasGest] = useState('');
  const [sexoFeto, setSexoFeto] = useState<string[]>([]);
  const [crias, setCrias] = useState<string[]>(['1']);
  const [estruturas, setEstruturas] = useState('');
  const [embrioes, setEmbrioes] = useState('');
  const [obs, setObs] = useState('');
  const [ultimoServico, setUltimoServico] = useState<string | null>(null);

  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!fid || editId) return;
    supabase
      .from('repro_eventos')
      .select('numero')
      .eq('fazenda_id', fid)
      .order('numero', { ascending: false })
      .limit(1)
      .then(({ data: d }) => setProximo(((d?.[0]?.numero as number) ?? 0) + 1));
  }, [fid, editId, aviso]);

  // DG: busca o último serviço da fêmea para a previsão de parto.
  useEffect(() => {
    setUltimoServico(null);
    if (tipo !== 'dg' || !femeaId) return;
    const ate = paraBanco(data);
    let q = supabase.from('repro_eventos').select('data').eq('animal_id', femeaId).eq('tipo', 'servico').order('data', { ascending: false }).limit(1);
    if (ate) q = q.lte('data', ate);
    q.then(({ data: d }) => setUltimoServico(d?.[0]?.data ?? null));
  }, [tipo, femeaId, data]);

  const sub = subtipo[0];
  const comSemen = tipo === 'servico' && sub !== 'monta';
  const precisaDoadora = tipo === 'servico' && (sub === 'te' || sub === 'fiv');
  const dataIso = paraBanco(data);
  const previsao =
    tipo === 'dg' && sub === 'prenhe' && dataIso ? previsaoParto({ dataDg: dataIso, diasGestacao: lerNumero(diasGest), dataServico: ultimoServico }) : null;

  function limpar() {
    setEditId(null);
    setNumero(null);
    setFemeaId(null);
    setTouroId(null);
    setTouroExterno('');
    setTouroFora(false);
    setDoadoraId(null);
    setEcc('');
    setDiasGest('');
    setSexoFeto([]);
    setEstruturas('');
    setEmbrioes('');
    setObs('');
    setErros({});
  }

  async function abrirParaAlterar() {
    setAlterarErro(null);
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m || !fid) return setAlterarErro('Digite o número do lançamento.');
    const { data: e } = await supabase.from('repro_eventos').select('*').eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!e) return setAlterarErro(`Não há lançamento nº ${m[1]}.`);
    if (e.tipo !== tipo) return setAlterarErro(`O nº ${m[1]} é de outro tipo de lançamento. Escolha o tipo certo acima.`);
    setAlterarAberto(false);
    setAlterarNum('');
    setAviso(null);
    setEditId(e.id);
    setNumero(e.numero);
    setData(doBanco(e.data));
    setFemeaId(e.animal_id);
    setSubtipo([e.subtipo]);
    setTouroId(e.touro_id);
    setTouroExterno(e.touro_externo ?? '');
    setTouroFora(!e.touro_id && !!e.touro_externo);
    setSemen([e.semen_tipo ?? 'convencional']);
    setInseminadorId(e.inseminador_id);
    setDoadoraId(e.doadora_id);
    setEcc(numeroParaCampo(e.ecc));
    setMetodo([e.metodo_dg ?? 'ultrassom']);
    setDiasGest(e.dias_gestacao != null ? String(e.dias_gestacao) : '');
    setSexoFeto(e.sexo_feto ? [e.sexo_feto] : []);
    setCrias([String(e.crias ?? 1)]);
    setEstruturas(e.estruturas != null ? String(e.estruturas) : '');
    setEmbrioes(e.embrioes != null ? String(e.embrioes) : '');
    setObs(e.observacoes ?? '');
  }

  async function salvar(conferirParentesco = true) {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!data || !dataValida(data)) e.data = 'Informe a data.';
    if (!femeaId) e.femea = tipo === 'coleta' ? 'Escolha a doadora.' : 'Escolha a fêmea.';
    const eccN = lerNumero(ecc);
    if (ecc.trim() && (eccN == null || eccN < 1 || eccN > 5)) e.ecc = 'De 1 a 5.';
    if (tipo === 'servico' && !touroId && !touroExterno.trim()) e.touro = 'Informe o touro (do rebanho ou de fora).';
    if (precisaDoadora && !doadoraId) e.doadora = 'Escolha a doadora do embrião.';
    const dg = lerNumero(diasGest);
    if (tipo === 'dg' && diasGest.trim() && (dg == null || dg < 20 || dg > 300)) e.dias = 'De 20 a 300 dias.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    // Parentesco entre a fêmea (ou a doadora do embrião) e o touro.
    if (conferirParentesco && (tipo === 'servico' || tipo === 'coleta') && touroId) {
      const mae = precisaDoadora ? doadoraId! : femeaId!;
      const g = await genealogias([mae, touroId]);
      const p = g[mae] && g[touroId] ? parentesco(g[mae], g[touroId]) : null;
      if (p && p.perc > LIMITE_CONSANGUINIDADE) {
        return Alert.alert(
          'Parentesco próximo',
          `Consanguinidade esperada da cria: ${formatarQtd(p.perc)}% (${p.motivo}). O limite recomendado é ${formatarQtd(LIMITE_CONSANGUINIDADE)}%.`,
          [
            { text: 'Trocar o touro', style: 'cancel' },
            { text: 'Gravar assim mesmo', style: 'destructive', onPress: () => salvar(false) },
          ],
        );
      }
    }

    const registro: Record<string, any> = {
      fazenda_id: fid,
      animal_id: femeaId,
      data: dataIso,
      tipo,
      subtipo: sub,
      touro_id: tipo === 'servico' || tipo === 'coleta' ? (touroFora ? null : touroId) : null,
      touro_externo: tipo === 'servico' || tipo === 'coleta' ? (touroFora ? touroExterno.trim() || null : null) : null,
      semen_tipo: comSemen || tipo === 'coleta' ? semen[0] : null,
      inseminador_id: comSemen || tipo === 'coleta' || tipo === 'dg' ? inseminadorId : null,
      doadora_id: precisaDoadora ? doadoraId : null,
      ecc: eccN,
      metodo_dg: tipo === 'dg' ? metodo[0] : null,
      dias_gestacao: tipo === 'dg' && sub === 'prenhe' && dg != null ? dg : null,
      sexo_feto: tipo === 'dg' && sub === 'prenhe' ? sexoFeto[0] ?? null : null,
      previsao_parto: previsao,
      crias: tipo === 'parto' && sub !== 'aborto' ? Number(crias[0]) : null,
      estruturas: tipo === 'coleta' && estruturas.trim() ? Number(estruturas) : null,
      embrioes: tipo === 'coleta' && embrioes.trim() ? Number(embrioes) : null,
      observacoes: obs.trim() || null,
    };

    setSalvando(true);
    const { data: r, error } = editId
      ? await supabase.from('repro_eventos').update(registro).eq('id', editId).select('numero').single()
      : await supabase.from('repro_eventos').insert(registro).select('numero').single();
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setAviso(`Lançamento nº ${r.numero} ${editId ? 'alterado' : 'gravado'}.${tipo === 'parto' && sub !== 'aborto' ? ' Para cadastrar a cria: Pecuário › Movimentações › Nascimento.' : ''}`);
    limpar();
  }

  function excluir() {
    Alert.alert('Excluir lançamento', `Excluir o lançamento nº ${numero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('repro_eventos').delete().eq('id', editId!);
          if (error) return setErro(traduzirErro(error));
          setAviso(`Lançamento nº ${numero} excluído.`);
          limpar();
        },
      },
    ]);
  }

  return (
    <>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Lançamento nº</Text>
          <Text style={estilos.numeroValor}>{editId ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {!editId &&
        (alterarAberto ? (
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Alterar o lançamento nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
            </View>
            <View style={{ width: 110, paddingTop: 26 }}>
              <Botao titulo="Abrir" tipo="secundario" onPress={abrirParaAlterar} />
            </View>
          </View>
        ) : (
          <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
            Alterar um lançamento já cadastrado
          </Text>
        ))}

      <CampoAnimal rotulo={tipo === 'coleta' ? 'Doadora *' : 'Fêmea *'} valorId={femeaId} aoMudar={setFemeaId} sexo="F" erro={erros.femea} />

      {tipo === 'servico' && (
        <>
          <Escolha rotulo="Tipo de serviço" opcoes={SERVICOS} valor={subtipo} aoMudar={setSubtipo} />
          {precisaDoadora && (
            <>
              <Text style={estilos.nota}>Receptora é a fêmea acima. Informe a doadora e o touro do embrião.</Text>
              <CampoAnimal rotulo="Doadora do embrião *" valorId={doadoraId} aoMudar={setDoadoraId} sexo="F" erro={erros.doadora} />
            </>
          )}
        </>
      )}

      {(tipo === 'servico' || tipo === 'coleta') && (
        <>
          <Secao titulo={tipo === 'coleta' ? 'Touro / sêmen da fecundação' : 'Touro'} />
          <Escolha
            opcoes={[
              { valor: 'rebanho', rotulo: 'Do rebanho' },
              { valor: 'fora', rotulo: 'De fora / central' },
            ]}
            valor={[touroFora ? 'fora' : 'rebanho']}
            aoMudar={(v) => setTouroFora(v[0] === 'fora')}
          />
          {touroFora ? (
            <Campo rotulo="Touro (nome, registro e central)" value={touroExterno} onChangeText={setTouroExterno} autoCapitalize="characters" placeholder="Ex.: REM ARMADOR – CRV" erro={erros.touro} />
          ) : (
            <CampoAnimal rotulo="Touro" valorId={touroId} aoMudar={setTouroId} sexo="M" erro={erros.touro} />
          )}
          {(comSemen || tipo === 'coleta') && <Escolha rotulo="Sêmen" opcoes={SEMENS} valor={semen} aoMudar={setSemen} />}
          {(comSemen || tipo === 'coleta') && <CampoPessoaBusca rotulo={tipo === 'coleta' ? 'Técnico / veterinário' : 'Inseminador'} valorId={inseminadorId} aoMudar={setInseminadorId} tipoNovo="funcionario" />}
          {tipo === 'servico' && <Campo rotulo="Escore de Condição Corporal (1 a 5)" value={ecc} onChangeText={setEcc} keyboardType="decimal-pad" placeholder="Ex.: 3,25" erro={erros.ecc} />}
        </>
      )}

      {tipo === 'dg' && (
        <>
          <Escolha rotulo="Resultado" opcoes={RESULTADOS_DG} valor={subtipo} aoMudar={setSubtipo} />
          <Escolha rotulo="Método" opcoes={METODOS_DG} valor={metodo} aoMudar={setMetodo} />
          {sub === 'prenhe' && (
            <>
              <Campo rotulo="Dias de gestação" value={diasGest} onChangeText={(t) => setDiasGest(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="Ex.: 30" erro={erros.dias} />
              <Escolha rotulo="Sexagem fetal" opcoes={SEXOS_FETO} valor={sexoFeto} aoMudar={(v) => setSexoFeto(sexoFeto[0] === v[0] ? [] : v)} />
              <Text style={estilos.destaque}>
                {previsao ? `Previsão de parto: ${doBanco(previsao)}` : femeaId ? 'Informe os dias de gestação para prever o parto (não há serviço lançado).' : ''}
              </Text>
            </>
          )}
          <CampoPessoaBusca rotulo="Veterinário" valorId={inseminadorId} aoMudar={setInseminadorId} tipoNovo="fornecedor" />
        </>
      )}

      {tipo === 'parto' && (
        <>
          <Escolha rotulo="Tipo" opcoes={PARTOS} valor={subtipo} aoMudar={setSubtipo} />
          {sub !== 'aborto' && <Escolha rotulo="Crias" opcoes={CRIAS} valor={crias} aoMudar={setCrias} />}
        </>
      )}

      {tipo === 'coleta' && (
        <>
          <Secao titulo="Coleta de oócitos" />
          <Escolha rotulo="Técnica" opcoes={COLETAS} valor={subtipo} aoMudar={setSubtipo} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo={sub === 'fiv' ? 'Oócitos' : 'Estruturas'} value={estruturas} onChangeText={(t) => setEstruturas(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Embriões viáveis" value={embrioes} onChangeText={(t) => setEmbrioes(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            </View>
          </View>
        </>
      )}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }} />
      <Botao titulo={editId ? 'Salvar alterações' : 'Gravar lançamento'} onPress={() => salvar()} carregando={salvando} />
      {editId && <Botao titulo="Cancelar alteração" tipo="secundario" onPress={limpar} />}
      {editId && <Botao titulo="Excluir lançamento" tipo="perigo" onPress={excluir} />}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  numero: { minWidth: 130, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 20 },
  destaque: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
});
