import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import EntradaDocumento from '../../componentes/EntradaDocumento';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { semAcento } from '../../lib/codigos';
import { abrirFotoDocumento } from '../../lib/documentos';
import { textoSacas } from '../../lib/posColheita';
import { ESPECIES_CAFE, TIPOS_CAFE, r2, um } from '../../lib/armazem';
import { cores, tam } from '../../tema';

type Pilagem = { id: string; numero: number; data: string; quem: string; saldo: number };
const n = (t: string) => lerNumero(t);

/**
 * Entrada no armazém: o café beneficiado de uma pilagem (ou de outra origem) vira um lote, guardado na fazenda ou em terceiros,
 * com a classificação (espécie, tipo, peneira, umidade, defeitos). A classificação pode vir pela foto do laudo e ser completada depois.
 */
export default function EntradaCafeAba({ abas, titulo }: { abas: React.ReactNode; titulo: (t: string) => void }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [pilagens, setPilagens] = useState<Pilagem[]>([]);
  const [proximo, setProximo] = useState<number | null>(null);
  const [carregado, setCarregado] = useState(false);

  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [movimentado, setMovimentado] = useState(false);
  const [pilagemId, setPilagemId] = useState<string | null>(null);
  const [avulso, setAvulso] = useState(false);
  const [origem, setOrigem] = useState('');
  const [safraId, setSafraId] = useState<string | null>(null);
  const [custoSaca, setCustoSaca] = useState('');
  const [data, setData] = useState(hojeBR());
  const [onde, setOnde] = useState('fazenda');
  const [localId, setLocalId] = useState<string | null>(null);
  const [terceiroId, setTerceiroId] = useState<string | null>(null);
  const [sacas, setSacas] = useState('');
  const [documento, setDocumento] = useState('');
  const [especie, setEspecie] = useState('Conilon');
  const [tipo, setTipo] = useState('');
  const [peneira, setPeneira] = useState('');
  const [umidade, setUmidade] = useState('');
  const [defeitos, setDefeitos] = useState('');
  const [impurezas, setImpurezas] = useState('');
  const [broca, setBroca] = useState('');
  const [bebida, setBebida] = useState('');
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [avisoDoc, setAvisoDoc] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    titulo(id ? `Lote de café nº ${numero}` : 'Armazém de café');
  }, [id, numero, titulo]);

  /** Pilagens com sacas ainda sem armazenar (na alteração, devolve ao saldo o que é deste lote). */
  const carregarBase = useCallback(
    async (loteId: string | null = null) => {
      if (!fid) return;
      try {
        const [ps, ls, ult] = await Promise.all([
          consulta<any[]>(supabase.from('cafe_pilagens').select('id, numero, data, onde, sacas_beneficiadas, sacas_pagas, pessoa:pessoas ( nome )').eq('fazenda_id', fid).order('data').order('numero').limit(2000)),
          consulta<any[]>(supabase.from('cafe_lotes').select('id, pilagem_id, sacas').eq('fazenda_id', fid).not('pilagem_id', 'is', null).limit(5000)),
          consulta<any[]>(supabase.from('cafe_lotes').select('numero').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(1)),
        ]);
        const usado: Record<string, number> = {};
        for (const l of ls) if (l.id !== loteId) usado[l.pilagem_id] = (usado[l.pilagem_id] ?? 0) + Number(l.sacas);
        setPilagens(
          ps
            .map((g) => ({ id: g.id, numero: g.numero, data: g.data, quem: g.onde === 'terceiro' ? um(g.pessoa)?.nome ?? 'Terceiro' : 'Máquina própria', saldo: r2(Number(g.sacas_beneficiadas) - Number(g.sacas_pagas ?? 0) - (usado[g.id] ?? 0)) }))
            .filter((g) => g.saldo > 0.005),
        );
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

  // ---------- armazéns da fazenda ----------
  const buscarLocal = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      const d = await consulta<any[]>(supabase.from('pc_locais').select('id, nome, tipo').eq('fazenda_id', fid!).in('tipo', ['tulha', 'silo']).eq('ativo', true).order('nome'));
      const termo = semAcento(t.trim());
      return d.filter((x) => !termo || semAcento(x.nome).includes(termo)).map((x) => ({ id: x.id, titulo: x.nome, detalhe: 'Na fazenda' }));
    },
    [fid],
  );
  const lerLocal = useCallback(async (lid: string) => (await supabase.from('pc_locais').select('nome').eq('id', lid).maybeSingle()).data?.nome ?? null, []);
  const criarLocal = useCallback(
    async (nome: string): Promise<ItemRapido> => {
      // nome igual a um já cadastrado (com ou sem acento, maiúscula ou minúscula): usa o que existe
      const ja = await consulta<any[]>(supabase.from('pc_locais').select('id, nome').eq('fazenda_id', fid!).in('tipo', ['tulha', 'silo']));
      const igual = ja.find((x) => semAcento(x.nome.trim()) === semAcento(nome.trim()));
      if (igual) return { id: igual.id, titulo: igual.nome };
      const d = await consulta<any>(supabase.from('pc_locais').insert({ fazenda_id: fid, nome: nome.trim(), tipo: 'tulha' }).select('id, nome').single());
      return { id: d.id, titulo: d.nome };
    },
    [fid],
  );

  const carregarSafras = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('safras').select('id, nome, data_inicio, data_fim').eq('fazenda_id', fid!).order('data_inicio', { ascending: false, nullsFirst: false }));
    return d.map((s) => ({ id: s.id, titulo: s.nome, detalhe: `${doBanco(s.data_inicio)} a ${doBanco(s.data_fim)}` }));
  }, [fid]);

  // ---------- ações ----------
  function escolherPilagem(g: Pilagem) {
    setAvulso(false);
    setPilagemId(g.id);
    setSacas(numeroParaCampo(g.saldo));
    if (dataValida(data) && paraBanco(data)! < g.data) setData(doBanco(g.data));
  }

  /** Laudo ou romaneio lido pela IA: preenche para conferência; nada grava sozinho. */
  function aplicarLaudo(d: any, arq: string | null) {
    setErro(null);
    setArquivo(arq);
    if (d?.legivel === false) return setAvisoDoc('Não deu para ler o laudo. A foto ficou guardada; digite a classificação ou tire outra foto, com o papel inteiro e boa luz.');
    const txt = (v: any) => (v == null ? '' : String(v));
    if (d.especie && ESPECIES_CAFE.some((e) => e.valor === d.especie)) setEspecie(d.especie);
    if (d.tipo != null) setTipo(txt(d.tipo));
    if (d.peneira != null) setPeneira(txt(d.peneira));
    if (d.umidade != null) setUmidade(numeroParaCampo(d.umidade));
    if (d.defeitos != null) setDefeitos(numeroParaCampo(d.defeitos));
    if (d.impurezas != null) setImpurezas(numeroParaCampo(d.impurezas));
    if (d.broca != null) setBroca(numeroParaCampo(d.broca));
    if (d.bebida) setBebida(txt(d.bebida));
    if (d.documento && !documento) setDocumento(txt(d.documento));
    const lidas = d.sacas != null ? Number(d.sacas) : d.peso_kg != null ? r2(Number(d.peso_kg) / 60) : null;
    if (lidas && !movimentado && !sacas) setSacas(numeroParaCampo(lidas));
    const partes = ['Laudo lido: confira os campos antes de lançar.'];
    if (d.emitente) partes.push(`Emitido por ${d.emitente}.`);
    if (lidas && sacas && Math.abs(lidas - (n(sacas) ?? 0)) > 0.01) partes.push(`O papel traz ${textoSacas(lidas)}; a tela está com ${sacas}.`);
    if ((d.nao_lido ?? []).length) partes.push(`Não deu para ler: ${(d.nao_lido as string[]).join(', ')}.`);
    setAvisoDoc(partes.join(' '));
  }

  function limpar() {
    setId(null);
    setNumero(null);
    setMovimentado(false);
    setPilagemId(null);
    setAvulso(false);
    setOrigem('');
    setSafraId(null);
    setCustoSaca('');
    setData(hojeBR());
    setOnde('fazenda');
    setLocalId(null);
    setTerceiroId(null);
    setSacas('');
    setDocumento('');
    setEspecie('Conilon');
    setTipo('');
    setPeneira('');
    setUmidade('');
    setDefeitos('');
    setImpurezas('');
    setBroca('');
    setBebida('');
    setArquivo(null);
    setAvisoDoc(null);
    setObs('');
    setErros({});
    setErro(null);
    setAlterarAberto(false);
    setAlterarNum('');
    setAlterarErro(null);
  }

  async function abrirPorNumero() {
    setAlterarErro(null);
    if (!alterarNum) return setAlterarErro('Informe o número.');
    try {
      const { data: l } = await supabase.from('cafe_lotes').select('*, local:pc_locais ( tipo, pessoa_id )').eq('fazenda_id', fid!).eq('numero', Number(alterarNum)).maybeSingle();
      if (!l) return setAlterarErro(`Não existe o lote de café nº ${alterarNum} nesta fazenda.`);
      const outros = await consulta<any[]>(supabase.from('cafe_movimentos').select('id').eq('lote_id', l.id).neq('tipo', 'entrada').limit(1));
      await carregarBase(l.id);
      const local = um(l.local);
      setId(l.id);
      setNumero(l.numero);
      setMovimentado(outros.length > 0);
      setPilagemId(l.pilagem_id);
      setAvulso(!l.pilagem_id);
      setOrigem(l.origem_descricao ?? '');
      setSafraId(l.safra_id ?? null);
      setCustoSaca(moedaParaCampo(l.custo_saca));
      setData(doBanco(l.data_entrada));
      setOnde(local?.tipo === 'armazem_terceiro' ? 'terceiro' : 'fazenda');
      setLocalId(l.local_id);
      setTerceiroId(local?.pessoa_id ?? null);
      setSacas(numeroParaCampo(l.sacas));
      setDocumento(l.documento ?? '');
      setEspecie(l.especie ?? 'Conilon');
      setTipo(l.tipo ?? '');
      setPeneira(l.peneira ?? '');
      setUmidade(numeroParaCampo(l.umidade));
      setDefeitos(numeroParaCampo(l.defeitos));
      setImpurezas(numeroParaCampo(l.impurezas));
      setBroca(numeroParaCampo(l.broca));
      setBebida(l.bebida ?? '');
      setArquivo(l.arquivo_laudo ?? null);
      setAvisoDoc(null);
      setObs(l.observacoes ?? '');
      setErros({});
      setErro(null);
      setAviso(null);
      setAlterarAberto(false);
    } catch (e) {
      setAlterarErro(traduzirErro(e));
    }
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    const pil = pilagens.find((g) => g.id === pilagemId);
    if (!pilagemId && !avulso) e.origem = 'Escolha de onde veio o café: uma pilagem ou "Café de outra origem".';
    if (avulso && !origem.trim()) e.origemTexto = 'Diga de onde veio o café.';
    if (!dataValida(data)) e.data = 'Informe a data de entrada.';
    else if (paraBanco(data)! > hojeBanco()) e.data = 'A data não pode ser futura.';
    if (!movimentado && onde === 'fazenda' && !localId) e.local = 'Informe o armazém da fazenda.';
    if (!movimentado && onde === 'terceiro' && !terceiroId) e.local = 'Informe de quem é o armazém.';
    if (!n(sacas) || n(sacas)! <= 0) e.sacas = 'Informe quantas sacas entraram.';
    else if (!movimentado && pil && n(sacas)! > pil.saldo + 0.005) e.sacas = `A pilagem nº ${pil.numero} só tem ${textoSacas(pil.saldo)} sem armazenar.`;
    for (const [v, k, r] of [[umidade, 'umidade', 'Umidade'], [impurezas, 'impurezas', 'Impurezas'], [broca, 'broca', 'Broca']] as const) {
      if (v.trim() && (n(v) == null || n(v)! < 0 || n(v)! > 100)) e[k] = `${r} inválida.`;
    }
    if (defeitos.trim() && (n(defeitos) == null || n(defeitos)! < 0)) e.defeitos = 'Defeitos inválidos.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    const p = {
      id,
      fazenda_id: fid,
      pilagem_id: pilagemId ?? '',
      data: paraBanco(data),
      local_id: onde === 'fazenda' ? localId ?? '' : '',
      terceiro_id: onde === 'terceiro' ? terceiroId ?? '' : '',
      sacas: n(sacas),
      documento: documento.trim(),
      origem_descricao: avulso ? origem.trim() : '',
      safra_id: avulso ? safraId ?? '' : '',
      custo_saca: avulso ? n(custoSaca) : null,
      especie,
      tipo: tipo.trim(),
      peneira: peneira.trim(),
      umidade: n(umidade),
      defeitos: n(defeitos),
      impurezas: n(impurezas),
      broca: n(broca),
      bebida: bebida.trim(),
      arquivo_laudo: arquivo ?? '',
      observacoes: obs.trim(),
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_entrada_cafe', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; sacas: number; local: string; so_classificacao: boolean };
    const era = !!id;
    limpar();
    setAviso(res.so_classificacao ? `Lote de café nº ${res.numero}: classificação atualizada.` : `Lote de café nº ${res.numero} ${era ? 'alterado' : 'lançado'}: ${textoSacas(res.sacas)} em ${res.local}.`);
    carregarBase();
  }

  function excluir() {
    Alert.alert('Excluir lote de café', `Excluir o lote nº ${numero}? As sacas voltam a ficar sem armazenar na pilagem.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_entrada_cafe', { p_id: id });
          if (error) return setErro(traduzirErro(error));
          const num = numero;
          limpar();
          setAviso(`Lote de café nº ${num} excluído.`);
          carregarBase();
        },
      },
    ]);
  }

  // ---------- tela ----------
  return (
    <Tela rodape={<RodapeAcoes titulo={id ? 'Salvar alterações' : 'Lançar entrada no armazém'} aoConfirmar={salvar} carregando={salvando} aoDescartar={id || pilagemId || avulso ? limpar : undefined} erro={erro} />}>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Lote nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Entrada no armazém *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair deste lote e lançar um novo
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar ou classificar o lote nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar ou classificar um lote já lançado
        </Text>
      )}
      {movimentado && <Aviso tipo="info" texto="Este lote já tem movimentação (transferência, quebra, taxa ou venda): data, armazém, sacas e origem não mudam mais. A classificação e o documento podem ser alterados." />}

      {!movimentado && (
        <>
          <Secao titulo="De onde veio o café" />
          <View style={estilos.caixa}>
            {pilagens.map((g) => {
              const marcado = pilagemId === g.id;
              return (
                <Pressable key={g.id} onPress={() => escolherPilagem(g)} accessibilityRole="radio" accessibilityState={{ checked: marcado }} style={estilos.opcao}>
                  <Ionicons name={marcado ? 'radio-button-on' : 'radio-button-off'} size={24} color={marcado ? cores.primaria : cores.textoSuave} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.opcaoTitulo}>
                      Pilagem nº {g.numero} · {textoSacas(g.saldo)}
                    </Text>
                    <Text style={estilos.nota}>
                      {doBanco(g.data)} · {g.quem} · sem armazenar
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {carregado && pilagens.length === 0 && <Text style={estilos.nota}>Nenhuma pilagem com sacas sem armazenar (as pilagens são lançadas em Agrícola › Secagem e pilagem).</Text>}
            <Pressable
              onPress={() => {
                setAvulso(true);
                setPilagemId(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: avulso }}
              style={estilos.opcao}
            >
              <Ionicons name={avulso ? 'radio-button-on' : 'radio-button-off'} size={24} color={avulso ? cores.primaria : cores.textoSuave} />
              <View style={{ flex: 1 }}>
                <Text style={estilos.opcaoTitulo}>Café de outra origem</Text>
                <Text style={estilos.nota}>Estoque que já existia, café comprado ou recebido: sem pilagem no sistema.</Text>
              </View>
            </Pressable>
          </View>
          {erros.origem ? <Text style={estilos.erro}>{erros.origem}</Text> : null}

          <Secao titulo="Onde ficou guardado" />
          <Escolha
            opcoes={[
              { valor: 'fazenda', rotulo: 'Na fazenda' },
              { valor: 'terceiro', rotulo: 'Em terceiros' },
            ]}
            valor={[onde]}
            aoMudar={(v) => setOnde(v[0])}
          />
          {onde === 'fazenda' ? (
            <CampoBuscaRapida rotulo="Armazém da fazenda *" valorId={localId} aoMudar={setLocalId} buscar={buscarLocal} lerNome={lerLocal} criar={criarLocal} rotuloNovo="novo armazém" icone="home" placeholder="Ex.: Armazém, Tulha 1" erro={erros.local} />
          ) : (
            <>
              <CampoPessoaBusca rotulo="Cooperativa ou cliente *" valorId={terceiroId} aoMudar={setTerceiroId} tipoNovo="cliente" erro={erros.local} />
              <Text style={estilos.nota}>O armazém do terceiro é criado sozinho com o nome dele. Taxa de armazenagem e quebra entram na aba Movimentar.</Text>
            </>
          )}
        </>
      )}

      {avulso && (
        <>
          <Campo rotulo="De onde veio *" value={origem} onChangeText={setOrigem} autoCapitalize="sentences" placeholder="Ex.: Saldo da safra 2025, comprado de João" erro={erros.origemTexto} />
          <SeletorLista rotulo="Safra do café" valorId={safraId} aoMudar={setSafraId} carregar={carregarSafras} permitirLimpar vazio="Nenhuma safra cadastrada. Abra em Agrícola › Safras." />
          <CampoMoeda rotulo="Custo por saca (R$)" valor={custoSaca} aoMudar={setCustoSaca} ajuda="Opcional. Quanto custou cada saca (produção ou compra): vai ser o custo deste lote na venda." />
          {n(custoSaca) && n(sacas) ? <Text style={estilos.nota}>Valor do lote: {formatarMoeda(n(custoSaca)! * n(sacas)!)}.</Text> : null}
        </>
      )}

      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Sacas de 60 kg *" value={sacas} onChangeText={setSacas} keyboardType="decimal-pad" erro={erros.sacas} editable={!movimentado} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Romaneio / recibo nº" value={documento} onChangeText={setDocumento} />
        </View>
      </View>
      {n(sacas) ? <Text style={estilos.nota}>{formatarNumero(n(sacas)! * 60)} kg.</Text> : null}

      <Secao titulo="Classificação" />
      <EntradaDocumento
        titulo="Pelo laudo ou romaneio"
        tipo="classificacao_cafe"
        rotuloFoto="Foto do laudo"
        instrucao="Enquadre o laudo de classificação ou o romaneio inteiro, bem reto e com boa luz."
        dica="A IA lê tipo, peneira, umidade e defeitos. Nada é gravado sem o seu Lançar. Sem laudo agora, lance assim mesmo e classifique depois."
        textoLendo="Lendo o laudo… (uns 10 segundos)"
        aoLer={(d, arq) => aplicarLaudo(d, arq)}
        aoErro={setErro}
      />
      {avisoDoc && <Aviso tipo="info" texto={avisoDoc} />}
      {arquivo && (
        <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(arquivo)) && setErro('Não foi possível abrir a foto do laudo.')}>
          📷 Ver a foto do laudo
        </Text>
      )}
      <Escolha rotulo="Espécie" opcoes={ESPECIES_CAFE} valor={[especie]} aoMudar={(v) => setEspecie(v[0])} />
      <Escolha rotulo="Tipo (pelos defeitos)" opcoes={TIPOS_CAFE.map((t) => ({ valor: t, rotulo: t }))} valor={TIPOS_CAFE.includes(tipo) ? [tipo] : []} aoMudar={(v) => setTipo(v[0])} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Tipo (outro)" value={tipo} onChangeText={setTipo} placeholder="Ex.: 7/8" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Peneira" value={peneira} onChangeText={setPeneira} placeholder="Ex.: 13 acima" />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Umidade (%)" value={umidade} onChangeText={setUmidade} keyboardType="decimal-pad" erro={erros.umidade} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Defeitos" value={defeitos} onChangeText={setDefeitos} keyboardType="decimal-pad" erro={erros.defeitos} />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Impurezas (%)" value={impurezas} onChangeText={setImpurezas} keyboardType="decimal-pad" erro={erros.impurezas} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Broca (%)" value={broca} onChangeText={setBroca} keyboardType="decimal-pad" erro={erros.broca} />
        </View>
      </View>
      {especie === 'Arábica' && <Campo rotulo="Bebida" value={bebida} onChangeText={setBebida} placeholder="Ex.: dura, mole, riada, rio" />}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 70, paddingTop: 12 }} />

      {id && !movimentado && <Botao titulo="Excluir lote de café" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { minWidth: 96, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  opcaoTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
});
