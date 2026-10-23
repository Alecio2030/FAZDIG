import React, { useCallback, useEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { semAcento } from '../../lib/codigos';
import { textoLitros } from '../../lib/colheitas';
import { COBRANCA_SECAGEM, ONDE, r2, textoSacas, um } from '../../lib/posColheita';
import { cores, tam } from '../../tema';

type Lote = { id: string; numero: number; data: string; talhao: string; litros: number; saldo: number };
const n = (t: string) => lerNumero(t);

/**
 * Secagem: quais colheitas entraram no secador (próprio ou de terceiro), a saída em sacas secas e a cobrança do terceiro
 * (R$ por saco de cereja ou percentual das sacas). A carga pode ser lançada na entrada e completada na saída.
 */
export default function SecagemAba({ abas, titulo, abrirNumero }: { abas: React.ReactNode; titulo: (t: string) => void; abrirNumero?: number }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [noSecador, setNoSecador] = useState<any[]>([]);
  const [litrosSaco, setLitrosSaco] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [carregado, setCarregado] = useState(false);

  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [entrada, setEntrada] = useState(hojeBR());
  const [onde, setOnde] = useState('proprio');
  const [localId, setLocalId] = useState<string | null>(null);
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [umidIni, setUmidIni] = useState('');
  const [saiu, setSaiu] = useState(false);
  const [saida, setSaida] = useState(hojeBR());
  const [sacas, setSacas] = useState('');
  const [umidFim, setUmidFim] = useState('');
  const [horas, setHoras] = useState('');
  const [cobranca, setCobranca] = useState('');
  const [sacosCereja, setSacosCereja] = useState('');
  const [sacosEditado, setSacosEditado] = useState(false);
  const [preco, setPreco] = useState('');
  const [perc, setPerc] = useState('');
  const [valorSaca, setValorSaca] = useState('');
  const [venc, setVenc] = useState('');
  const [custoProprio, setCustoProprio] = useState('');
  const [obs, setObs] = useState('');
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    titulo(id ? `Secagem nº ${numero}` : 'Secagem e pilagem');
  }, [id, numero, titulo]);

  /** Colheitas com litros ainda sem secar (na alteração, devolve ao saldo o que é desta secagem). */
  const carregarBase = useCallback(
    async (secagemId: string | null = null) => {
      if (!fid) return;
      try {
        const [ls, usados, abertas, med, ult] = await Promise.all([
          consulta<any[]>(supabase.from('pc_lotes').select('id, numero, data_colheita, litros, area:areas ( nome )').eq('fazenda_id', fid).order('data_colheita').order('numero').limit(2000)),
          consulta<any[]>(supabase.from('cafe_secagem_itens').select('lote_id, litros, secagem_id').eq('fazenda_id', fid).limit(5000)),
          consulta<any[]>(supabase.from('cafe_secagens').select('id, numero, data_entrada, litros, onde, pessoa:pessoas ( nome ), local:pc_locais ( nome )').eq('fazenda_id', fid).is('sacas_secas', null).order('numero')),
          consulta<any[]>(supabase.from('colheita_medidas').select('litros').eq('fazenda_id', fid).eq('unidade', 'saco').limit(1)),
          consulta<any[]>(supabase.from('cafe_secagens').select('numero').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(1)),
        ]);
        const usado: Record<string, number> = {};
        for (const u of usados) if (u.secagem_id !== secagemId) usado[u.lote_id] = (usado[u.lote_id] ?? 0) + Number(u.litros);
        setLotes(
          ls
            .map((l) => ({ id: l.id, numero: l.numero, data: l.data_colheita, talhao: um(l.area)?.nome ?? '', litros: Number(l.litros ?? 0), saldo: Math.round((Number(l.litros ?? 0) - (usado[l.id] ?? 0)) * 100) / 100 }))
            .filter((l) => l.saldo > 0.5),
        );
        setNoSecador(abertas);
        setLitrosSaco(med[0] ? Number(med[0].litros) : null);
        setProximo((ult[0]?.numero ?? 0) + 1);
        setCarregado(true);
      } catch (e) {
        setErro(traduzirErro(e));
      }
    },
    [fid],
  );

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  // ---------- cálculos ----------
  const escolhidos = lotes.filter((l) => sel[l.id] !== undefined);
  const litros = escolhidos.reduce((s, l) => s + (n(sel[l.id]) ?? 0), 0);
  const terceiro = onde === 'terceiro';
  const nSacas = saiu ? n(sacas) ?? 0 : 0;
  const pagas = terceiro && cobranca === 'percentual' && nSacas ? r2((nSacas * (n(perc) ?? 0)) / 100) : 0;
  const valorDinheiro = terceiro && cobranca === 'saco_cereja' ? r2((n(sacosCereja) ?? 0) * (n(preco) ?? 0)) : 0;
  const valorCafe = r2(pagas * (n(valorSaca) ?? 0));

  // sacos de cereja acompanham os litros (pela capacidade do saco usada nas colheitas) até a pessoa mudar à mão
  useEffect(() => {
    if (!sacosEditado && cobranca === 'saco_cereja') setSacosCereja(litrosSaco && litros ? numeroParaCampo(Math.round((litros / litrosSaco) * 10) / 10) : '');
  }, [litros, litrosSaco, cobranca, sacosEditado]);

  // ---------- locais próprios (secador, terreiro) ----------
  const buscarLocal = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      const d = await consulta<any[]>(supabase.from('pc_locais').select('id, nome, tipo, ativo').eq('fazenda_id', fid!).in('tipo', ['secador', 'terreiro', 'terreiro_suspenso']).eq('ativo', true).order('nome'));
      const termo = semAcento(t.trim());
      return d.filter((x) => !termo || semAcento(x.nome).includes(termo)).map((x) => ({ id: x.id, titulo: x.nome, detalhe: x.tipo === 'secador' ? 'Secador' : 'Terreiro' }));
    },
    [fid],
  );
  const lerLocal = useCallback(async (lid: string) => (await supabase.from('pc_locais').select('nome').eq('id', lid).maybeSingle()).data?.nome ?? null, []);
  const criarLocal = useCallback(
    async (nome: string): Promise<ItemRapido> => {
      const ja = await consulta<any[]>(supabase.from('pc_locais').select('id, nome').eq('fazenda_id', fid!).in('tipo', ['secador', 'terreiro', 'terreiro_suspenso']));
      const igual = ja.find((x) => semAcento(x.nome.trim()) === semAcento(nome.trim()));
      if (igual) return { id: igual.id, titulo: igual.nome };
      const d = await consulta<any>(supabase.from('pc_locais').insert({ fazenda_id: fid, nome: nome.trim(), tipo: /terreiro/i.test(nome) ? 'terreiro' : 'secador' }).select('id, nome').single());
      return { id: d.id, titulo: d.nome };
    },
    [fid],
  );

  // ---------- ações ----------
  function alternar(l: Lote) {
    setSel((s) => {
      const novo = { ...s };
      if (novo[l.id] !== undefined) delete novo[l.id];
      else novo[l.id] = numeroParaCampo(l.saldo);
      return novo;
    });
  }

  function limpar() {
    setId(null);
    setNumero(null);
    setEntrada(hojeBR());
    setOnde('proprio');
    setLocalId(null);
    setPessoaId(null);
    setSel({});
    setUmidIni('');
    setSaiu(false);
    setSaida(hojeBR());
    setSacas('');
    setUmidFim('');
    setHoras('');
    setCobranca('');
    setSacosCereja('');
    setSacosEditado(false);
    setPreco('');
    setPerc('');
    setValorSaca('');
    setVenc('');
    setCustoProprio('');
    setObs('');
    setErros({});
    setErro(null);
    setAlterarAberto(false);
    setAlterarNum('');
    setAlterarErro(null);
  }

  async function abrir(sid: string, darSaida = false) {
    setErro(null);
    setAviso(null);
    setAlterarErro(null);
    try {
      const s = await consulta<any>(supabase.from('cafe_secagens').select('*').eq('id', sid).single());
      const itens = await consulta<any[]>(supabase.from('cafe_secagem_itens').select('lote_id, litros').eq('secagem_id', sid));
      await carregarBase(sid);
      setId(s.id);
      setNumero(s.numero);
      setEntrada(doBanco(s.data_entrada));
      setOnde(s.onde);
      setLocalId(s.local_id);
      setPessoaId(s.pessoa_id);
      setSel(Object.fromEntries(itens.map((i) => [i.lote_id, numeroParaCampo(i.litros)])));
      setUmidIni(numeroParaCampo(s.umidade_inicial));
      setSaiu(s.sacas_secas != null || darSaida);
      setSaida(s.data_saida ? doBanco(s.data_saida) : hojeBR());
      setSacas(numeroParaCampo(s.sacas_secas));
      setUmidFim(numeroParaCampo(s.umidade_final));
      setHoras(numeroParaCampo(s.horas));
      setCobranca(s.cobranca ?? '');
      setSacosCereja(numeroParaCampo(s.sacos_cereja));
      setSacosEditado(s.sacos_cereja != null);
      setPreco(moedaParaCampo(s.preco));
      setPerc(numeroParaCampo(s.percentual));
      setValorSaca(moedaParaCampo(s.valor_saca));
      setVenc(doBanco(s.vencimento));
      setCustoProprio(Number(s.custo_proprio) ? moedaParaCampo(s.custo_proprio) : '');
      setObs(s.observacoes ?? '');
      setErros({});
      setAlterarAberto(false);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  async function abrirPorNumero(numInformado?: number) {
    const alvoNum = numInformado ?? Number(alterarNum);
    setAlterarErro(null);
    if (!alvoNum) return setAlterarErro('Informe o número.');
    const { data: s } = await supabase.from('cafe_secagens').select('id').eq('fazenda_id', fid!).eq('numero', alvoNum).maybeSingle();
    if (!s) return setAlterarErro(`Não existe a secagem nº ${alvoNum} nesta fazenda.`);
    abrir(s.id);
  }
  // V149: veio da ficha da Consulta pelo botão "Alterar ou excluir"
  useEffect(() => {
    if (!abrirNumero || !fid) return;
    setAlterarAberto(true);
    abrirPorNumero(abrirNumero);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirNumero, fid]);


  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(entrada)) e.entrada = 'Informe a data de entrada.';
    else if (paraBanco(entrada)! > hojeBanco()) e.entrada = 'A entrada não pode ser futura.';
    if (terceiro && !pessoaId) e.pessoa = 'Informe de quem é o secador.';
    if (!escolhidos.length) e.itens = 'Escolha as colheitas que entraram no secador.';
    for (const l of escolhidos) {
      const v = n(sel[l.id]);
      if (!v || v <= 0) e.itens = `Informe os litros da colheita nº ${l.numero}.`;
      else if (v > l.saldo + 0.5) e.itens = `A colheita nº ${l.numero} só tem ${textoLitros(l.saldo)} sem secar.`;
    }
    if (saiu) {
      if (!dataValida(saida)) e.saida = 'Informe a data de saída.';
      else if (dataValida(entrada) && paraBanco(saida)! < paraBanco(entrada)!) e.saida = 'A saída não pode ser antes da entrada.';
      else if (paraBanco(saida)! > hojeBanco()) e.saida = 'A saída não pode ser futura.';
      if (!n(sacas) || n(sacas)! <= 0) e.sacas = 'Informe quantas sacas secas saíram.';
    }
    for (const [v, k, r] of [[umidIni, 'umidIni', 'Umidade inicial'], [umidFim, 'umidFim', 'Umidade final']] as const) {
      if (v.trim() && (n(v) == null || n(v)! < 0 || n(v)! > 100)) e[k] = `${r} inválida.`;
    }
    if (terceiro && cobranca === 'saco_cereja' && (!n(sacosCereja) || !n(preco))) e.cobranca = 'Informe os sacos de cereja e o preço por saco.';
    if (terceiro && cobranca === 'percentual' && (!n(perc) || n(perc)! <= 0 || n(perc)! >= 100)) e.cobranca = 'Informe o percentual das sacas que fica com o secador.';
    if (terceiro && cobranca && venc && !dataValida(venc)) e.venc = 'Vencimento inválido.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    const p = {
      id,
      fazenda_id: fid,
      data_entrada: paraBanco(entrada),
      data_saida: saiu ? paraBanco(saida) : '',
      onde,
      local_id: localId ?? '',
      pessoa_id: pessoaId ?? '',
      itens: escolhidos.map((l) => ({ lote_id: l.id, litros: n(sel[l.id]) })),
      umidade_inicial: n(umidIni),
      umidade_final: saiu ? n(umidFim) : null,
      horas: saiu ? n(horas) : null,
      sacas_secas: saiu ? n(sacas) : null,
      cobranca: terceiro ? cobranca : '',
      sacos_cereja: n(sacosCereja),
      preco: n(preco),
      percentual: n(perc),
      valor_saca: n(valorSaca),
      vencimento: terceiro && cobranca === 'saco_cereja' && dataValida(venc) ? paraBanco(venc) : '',
      custo_proprio: n(custoProprio),
      observacoes: obs.trim(),
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_secagem', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; litros: number; sacas: number | null; pagas: number; titulo: number };
    const partes = [`Secagem nº ${res.numero} ${id ? 'alterada' : 'lançada'}: ${textoLitros(res.litros)}`];
    partes.push(res.sacas ? `saíram ${textoSacas(res.sacas)} secas${res.pagas ? `, ${textoSacas(res.pagas)} ficam com o secador` : ''}` : 'no secador, aguardando a saída');
    if (res.titulo) partes.push(`serviço de ${formatarMoeda(res.titulo)} no Contas a pagar`);
    limpar();
    setAviso(`${partes.join('; ')}.`);
    carregarBase();
  }

  function excluir() {
    Alert.alert('Excluir secagem', `Excluir a secagem nº ${numero}? As colheitas voltam a ficar sem secar e o título do serviço sai do Contas a pagar.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_secagem', { p_id: id }), 'cafe_secagem_id', String(id));
          if (error) return setErro(traduzirErro(error));
          const num = numero;
          limpar();
          setAviso(`Secagem nº ${num} excluída.`);
          carregarBase();
        },
      },
    ]);
  }

  // ---------- tela ----------
  return (
    <Tela rodape={<RodapeAcoes titulo={id ? 'Salvar alterações' : saiu ? 'Lançar secagem' : 'Lançar entrada no secador'} aoConfirmar={salvar} carregando={salvando} aoDescartar={id || escolhidos.length ? limpar : undefined} erro={erro} />}>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}

      {!id && noSecador.length > 0 && (
        <View style={estilos.caixa}>
          <Text style={estilos.rotulo}>No secador, aguardando saída</Text>
          {noSecador.map((s) => (
            <Pressable key={s.id} onPress={() => abrir(s.id, true)} style={({ pressed }) => [estilos.pendente, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <View style={{ flex: 1 }}>
                <Text style={estilos.pendenteTitulo}>
                  Nº {s.numero} · {textoLitros(s.litros)}
                </Text>
                <Text style={estilos.nota}>
                  Entrou em {doBanco(s.data_entrada)} · {s.onde === 'terceiro' ? um(s.pessoa)?.nome ?? 'terceiro' : um(s.local)?.nome ?? 'secador próprio'}
                </Text>
              </View>
              <Text style={estilos.link}>Dar saída ›</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Secagem nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Entrada no secador *" valor={entrada} aoMudar={setEntrada} erro={erros.entrada} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair desta secagem e lançar uma nova
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar a secagem nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={() => abrirPorNumero()} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar uma secagem já lançada
        </Text>
      )}

      <Secao titulo="Onde secou" />
      <Escolha opcoes={ONDE.map((o) => ({ valor: o.valor, rotulo: o.valor === 'proprio' ? 'Secador próprio' : 'Secador de terceiro' }))} valor={[onde]} aoMudar={(v) => setOnde(v[0])} />
      {terceiro ? (
        <CampoPessoaBusca rotulo="Dono do secador *" valorId={pessoaId} aoMudar={setPessoaId} tipoNovo="fornecedor" erro={erros.pessoa} />
      ) : (
        <CampoBuscaRapida rotulo="Secador ou terreiro" valorId={localId} aoMudar={setLocalId} buscar={buscarLocal} lerNome={lerLocal} criar={criarLocal} rotuloNovo="novo secador" icone="flame" placeholder="Ex.: Secador 1, Terreiro" />
      )}

      <Secao titulo="Colheitas que entraram" />
      {carregado && lotes.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma colheita com café sem secar. Lance a colheita em Agrícola › Colheitas.</Text>
      ) : (
        <View style={estilos.caixa}>
          {lotes.map((l) => {
            const marcado = sel[l.id] !== undefined;
            return (
              <View key={l.id} style={estilos.lote}>
                <Pressable onPress={() => alternar(l)} accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} style={estilos.loteToque}>
                  <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={26} color={marcado ? cores.primaria : cores.textoSuave} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.loteTitulo}>
                      Nº {l.numero} · {l.talhao}
                    </Text>
                    <Text style={estilos.nota}>
                      {doBanco(l.data)} · {textoLitros(l.saldo)} sem secar{l.saldo < l.litros - 0.5 ? ` de ${textoLitros(l.litros)}` : ''}
                    </Text>
                  </View>
                </Pressable>
                {marcado && (
                  <View style={{ width: 112 }}>
                    <Campo rotulo="" value={sel[l.id]} onChangeText={(t) => setSel((s) => ({ ...s, [l.id]: t }))} keyboardType="decimal-pad" placeholder="litros" />
                  </View>
                )}
              </View>
            );
          })}
          {escolhidos.length > 0 && (
            <Text style={estilos.total}>
              {escolhidos.length === 1 ? '1 colheita' : `${escolhidos.length} colheitas`} · {textoLitros(litros)} no secador
            </Text>
          )}
          <Text style={estilos.nota}>Vêm todos os litros que faltam secar de cada colheita. Se entrou só uma parte, corrija: o resto fica para outra secagem.</Text>
        </View>
      )}
      {erros.itens ? <Text style={estilos.erro}>{erros.itens}</Text> : null}
      <Campo rotulo="Umidade na entrada (%)" value={umidIni} onChangeText={setUmidIni} keyboardType="decimal-pad" erro={erros.umidIni} />

      <Secao titulo="Saída do secador" />
      <Interruptor rotulo="Já saiu do secador" descricao={saiu ? 'Informe as sacas secas que saíram.' : 'Desligado: fica "no secador"; a saída é lançada depois, pelo aviso no alto da tela.'} valor={saiu} aoMudar={setSaiu} />
      {saiu && (
        <>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Saída *" valor={saida} aoMudar={setSaida} erro={erros.saida} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Sacas secas (em coco) *" value={sacas} onChangeText={setSacas} keyboardType="decimal-pad" erro={erros.sacas} />
            </View>
          </View>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Umidade final (%)" value={umidFim} onChangeText={setUmidFim} keyboardType="decimal-pad" erro={erros.umidFim} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Horas de secagem" value={horas} onChangeText={setHoras} keyboardType="decimal-pad" />
            </View>
          </View>
        </>
      )}

      {terceiro ? (
        <>
          <Secao titulo="Cobrança do secador" />
          <Escolha opcoes={COBRANCA_SECAGEM} valor={[cobranca]} aoMudar={(v) => setCobranca(v[0])} />
          {cobranca === 'saco_cereja' && (
            <>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Sacos de cereja *"
                    value={sacosCereja}
                    onChangeText={(t) => {
                      setSacosEditado(true);
                      setSacosCereja(t);
                    }}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <CampoMoeda rotulo="Preço por saco (R$) *" valor={preco} aoMudar={setPreco} />
                </View>
              </View>
              {!sacosEditado && litrosSaco && litros > 0 ? <Text style={estilos.nota}>Pelos litros no secador e o saco de {formatarQtd(litrosSaco)} L usado nas colheitas. Pode corrigir pelo romaneio do secador.</Text> : null}
              <CampoData rotulo="Vencimento" valor={venc} aoMudar={setVenc} erro={erros.venc} />
              <Text style={estilos.nota}>Gera um título no Contas a pagar (conta Secagem e beneficiamento), rateado pelos talhões de onde veio o café. Em branco, vence na entrada.</Text>
            </>
          )}
          {cobranca === 'percentual' && (
            <>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Campo rotulo="% das sacas secas *" value={perc} onChangeText={setPerc} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <CampoMoeda rotulo="Valor da saca (R$)" valor={valorSaca} aoMudar={setValorSaca} />
                </View>
              </View>
              <Text style={estilos.nota}>Pagamento em café: as sacas do secador saem do seu saldo e não geram título. O valor da saca é opcional e serve só para pôr esse pagamento no custo.</Text>
            </>
          )}
          {cobranca === '' && <Text style={estilos.nota}>Sem cobrança agora: complete depois em "Alterar uma secagem já lançada".</Text>}
          {erros.cobranca ? <Text style={estilos.erro}>{erros.cobranca}</Text> : null}
        </>
      ) : (
        <>
          <Secao titulo="Custo da secagem própria" />
          <CampoMoeda rotulo="Lenha, gás, energia e mão de obra (R$)" valor={custoProprio} aoMudar={setCustoProprio} />
          <Text style={estilos.nota}>Opcional. Entra no custo por saca desta secagem; não gera título (as compras de lenha, gás e energia continuam em Compras e Contas a pagar).</Text>
        </>
      )}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 70, paddingTop: 12 }} />

      {litros > 0 && (
        <View style={estilos.resumo}>
          <Par a="No secador" b={textoLitros(litros)} forte />
          {nSacas > 0 && <Par a="Saíram" b={`${textoSacas(nSacas)} secas`} />}
          {nSacas > 0 && <Par a="Rendimento" b={`${formatarNumero(litros / nSacas)} L de café da roça por saca seca`} />}
          {pagas > 0 && <Par a={`Ficam com o secador (${formatarQtd(n(perc))}%)`} b={textoSacas(pagas)} />}
          {pagas > 0 && <Par a="Suas sacas" b={textoSacas(r2(nSacas - pagas))} forte />}
          {valorDinheiro > 0 && <Par a="Serviço do secador" b={formatarMoeda(valorDinheiro)} />}
          {valorCafe > 0 && <Par a="Pagamento em café, no custo" b={formatarMoeda(valorCafe)} />}
          {!terceiro && n(custoProprio) ? <Par a="Custo próprio" b={formatarMoeda(n(custoProprio))} /> : null}
        </View>
      )}

      {id && <Botao titulo="Excluir secagem" tipo="perigo" onPress={excluir} />}
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
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  rotulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.cafe },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  pendente: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  pendenteTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  lote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loteToque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  loteTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  total: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.primariaEscura },
  resumo: { backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto, textAlign: 'right', flexShrink: 1 },
});
