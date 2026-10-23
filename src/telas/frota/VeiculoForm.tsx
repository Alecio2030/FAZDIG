import React, { useCallback, useEffect, useState } from 'react';
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
import Interruptor from '../../componentes/Interruptor';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaVeiculos from './ConsultaVeiculos';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { centroDaUnidade } from '../../lib/unidades';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { agruparDigitacao, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { perguntar } from '../../lib/perguntar';
import {
  COMBUSTIVEIS, MEDIDORES, PLANOS_PADRAO, ROTULO_TIPO_VEICULO, TIPOS_VEICULO, USOS, unidadeMedidor,
  type Medidor, type TipoVeiculo, type Uso,
} from '../../lib/frota';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type LinhaPlano = { chave: string; id: string | null; item: string; intervalo: string; meses: string; baseLeitura: string; baseData: string };

let cont = 0;
const chave = () => `p${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);

/**
 * Frota › Veículos e máquinas: cadastro do veículo, trator, máquina, implemento ou equipamento,
 * com o uso (Agricultura, Pecuária, Administrativo ou Particular) e o plano de manutenção
 * (cada item a cada tantos km/horas e/ou meses). É o plano que gera os avisos na Agenda.
 */
export default function VeiculoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'VeiculoForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const veioDeFora = !!params?.id;

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [fazendaDoVeiculo, setFazendaDoVeiculo] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<string[]>([]);
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [ano, setAno] = useState('');
  const [placa, setPlaca] = useState('');
  const [chassi, setChassi] = useState('');
  const [renavam, setRenavam] = useState('');
  const [uso, setUso] = useState<string[]>(['agricultura']);
  const [proprietario, setProprietario] = useState('');
  const [centroId, setCentroId] = useState<string | null>(null);
  const [responsavelId, setResponsavelId] = useState<string | null>(null);
  const [imobId, setImobId] = useState<string | null>(null);
  const [medidor, setMedidor] = useState<string[]>(['km']);
  const [leitura, setLeitura] = useState('');
  const [dataLeitura, setDataLeitura] = useState(hojeBR());
  const [combustivel, setCombustivel] = useState<string[]>([]);
  const [tanque, setTanque] = useState('');
  const [seguro, setSeguro] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [obs, setObs] = useState('');
  const [plano, setPlano] = useState<LinhaPlano[]>([]);
  const [apagados, setApagados] = useState<string[]>([]);
  const [temHistorico, setTemHistorico] = useState(false);

  const [carregando, setCarregando] = useState(veioDeFora);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params?.aviso ?? null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const med = (medidor[0] ?? 'km') as Medidor;
  const un = unidadeMedidor(med);

  function limpar() {
    setId(null);
    setNumero(null);
    setFazendaDoVeiculo(null);
    setNome('');
    setTipo([]);
    setMarca('');
    setModelo('');
    setAno('');
    setPlaca('');
    setChassi('');
    setRenavam('');
    setUso(['agricultura']);
    setProprietario('');
    setCentroId(null);
    setResponsavelId(null);
    setImobId(null);
    setMedidor(['km']);
    setLeitura('');
    setDataLeitura(hojeBR());
    setCombustivel([]);
    setTanque('');
    setSeguro('');
    setAtivo(true);
    setObs('');
    setPlano([]);
    setApagados([]);
    setTemHistorico(false);
    setErros({});
  }

  async function abrir(vid: string) {
    setCarregando(true);
    setErro(null);
    try {
      const [v, ps, ab, ma] = await Promise.all([
        consulta<any>(supabase.from('frota_veiculos').select('*').eq('id', vid).single()),
        consulta<any[]>(supabase.from('frota_planos').select('*').eq('veiculo_id', vid).order('ordem').order('created_at')),
        consulta<any[]>(supabase.from('frota_abastecimentos').select('id').eq('veiculo_id', vid).limit(1)),
        consulta<any[]>(supabase.from('frota_manutencoes').select('id').eq('veiculo_id', vid).limit(1)),
      ]);
      setId(v.id);
      setNumero(v.numero);
      setFazendaDoVeiculo(v.fazenda_id);
      setNome(v.nome ?? '');
      setTipo([v.tipo]);
      setMarca(v.marca ?? '');
      setModelo(v.modelo ?? '');
      setAno(v.ano ? String(v.ano) : '');
      setPlaca(v.placa ?? '');
      setChassi(v.chassi ?? '');
      setRenavam(v.renavam ?? '');
      setUso([v.uso]);
      setProprietario(v.proprietario ?? '');
      setCentroId(v.centro_custo_id);
      setResponsavelId(v.responsavel_id);
      setImobId(v.imobilizado_id);
      setMedidor([v.medidor]);
      setLeitura(numeroParaCampo(v.leitura_inicial));
      setDataLeitura(doBanco(v.data_leitura_inicial));
      setCombustivel(v.combustivel ? [v.combustivel] : []);
      setTanque(numeroParaCampo(v.tanque_litros));
      setSeguro(v.seguro_vencimento ? doBanco(v.seguro_vencimento) : '');
      setAtivo(v.ativo !== false);
      setObs(v.observacoes ?? '');
      setPlano(
        ps.map((p) => ({
          chave: chave(),
          id: p.id,
          item: p.item,
          intervalo: numeroParaCampo(p.intervalo),
          meses: p.intervalo_meses ? String(p.intervalo_meses) : '',
          baseLeitura: numeroParaCampo(p.base_leitura),
          baseData: p.base_data ? doBanco(p.base_data) : '',
        })),
      );
      setApagados([]);
      setTemHistorico(ab.length > 0 || ma.length > 0);
      setErros({});
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setCarregando(false);
  }

  useEffect(() => {
    if (params?.id) abrir(params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  // ---- listas ----
  const carregarVeiculos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('frota_veiculos').select('id, numero, nome, tipo, placa, ativo').order('nome'));
    return d.map((v) => ({ id: v.id, titulo: `Nº ${v.numero} · ${v.nome}`, detalhe: [ROTULO_TIPO_VEICULO[v.tipo], v.placa, v.ativo ? null : 'fora de uso'].filter(Boolean).join(' · ') }));
  }, []);
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, (fazendaDoVeiculo ?? fid))).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [fid, fazendaDoVeiculo]);
  const carregarBens = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(
      supabase.from('imobilizados').select('id, numero, nome, categoria').eq('fazenda_id', fazendaDoVeiculo ?? fid).eq('situacao', 'ativo').eq('metodo', 'depreciacao').order('numero'),
    );
    return d.map((b) => ({ id: b.id, titulo: `Bem nº ${b.numero} · ${b.nome}`, detalhe: b.categoria }));
  }, [fid, fazendaDoVeiculo]);

  // ---- tipo: sugere o medidor e, sem plano ainda, o plano padrão ----
  function mudarTipo(v: string[]) {
    setTipo(v);
    const t = TIPOS_VEICULO.find((x) => x.valor === v[0]);
    if (t && !id) setMedidor([t.medidor]);
    if (t && plano.length === 0) aplicarPadrao(t.valor, false);
  }
  function aplicarPadrao(t: TipoVeiculo, trocar: boolean) {
    const novos = PLANOS_PADRAO[t].map((p) => ({
      chave: chave(),
      id: null,
      item: p.item,
      intervalo: p.intervalo ? numeroParaCampo(p.intervalo) : '',
      meses: p.meses ? String(p.meses) : '',
      baseLeitura: '',
      baseData: '',
    }));
    if (trocar) {
      setApagados((a) => [...a, ...plano.filter((x) => x.id).map((x) => x.id!)]);
      setPlano(novos);
    } else setPlano((l) => [...l, ...novos]);
  }
  async function usarPadrao() {
    const t = tipo[0] as TipoVeiculo | undefined;
    if (!t) return setErro('Escolha o tipo primeiro: o plano sugerido depende dele.');
    if (!PLANOS_PADRAO[t].length) return setErro('Para "Outro" não há plano sugerido: inclua os itens com "+ Item do plano".');
    if (plano.length) {
      const ok = await perguntar('Plano sugerido', `Trocar os ${plano.length} itens de agora pelo plano sugerido para ${ROTULO_TIPO_VEICULO[t]}?`, 'Trocar', 'Voltar');
      if (!ok) return;
      aplicarPadrao(t, true);
    } else aplicarPadrao(t, false);
  }
  function mudarItem(k: string, campo: keyof LinhaPlano, valor: string) {
    setPlano((l) => l.map((x) => (x.chave === k ? { ...x, [campo]: valor } : x)));
  }
  function tirarItem(x: LinhaPlano) {
    if (x.id) setApagados((a) => [...a, x.id!]);
    setPlano((l) => l.filter((y) => y.chave !== x.chave));
  }

  // ---- salvar ----
  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!nome.trim()) e.nome = 'Dê um nome (ex.: Hilux branca, Trator JD 6110J, Motobomba do poço).';
    if (!tipo[0]) e.tipo = 'Escolha o tipo.';
    if (!uso[0]) e.uso = 'Escolha o uso.';
    if (ano.trim() && (!/^\d{4}$/.test(ano.trim()) || Number(ano) < 1950 || Number(ano) > 2100)) e.ano = 'Ano com 4 números.';
    if (med !== 'nenhum') {
      if (n(leitura) == null || n(leitura)! < 0) e.leitura = `Informe o ${med === 'horas' ? 'horímetro (horas)' : 'hodômetro (km)'} de hoje.`;
      if (!dataValida(dataLeitura)) e.dataLeitura = 'Informe a data dessa leitura.';
    }
    if (tanque.trim() && (n(tanque) == null || n(tanque)! <= 0)) e.tanque = 'Capacidade inválida.';
    if (seguro.trim() && !dataValida(seguro)) e.seguro = 'Data inválida.';
    const planoErro = plano.find(
      (p) =>
        !p.item.trim() ||
        (med === 'nenhum' ? !n(p.meses) : !n(p.intervalo) && !n(p.meses)) ||
        (p.intervalo.trim() && !(n(p.intervalo)! > 0)) ||
        (p.meses.trim() && !(Number(p.meses) > 0)) ||
        (p.baseData.trim() && !dataValida(p.baseData)),
    );
    if (planoErro) e.plano = `Confira o item "${planoErro.item || 'sem nome'}": precisa do nome e de quando se repete (${med === 'nenhum' ? 'meses' : `a cada ${un} e/ou meses`}).`;
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return setErro('Escolha a fazenda ativa.');

    const dados = {
      nome: nome.trim(),
      tipo: tipo[0],
      marca: marca.trim() || null,
      modelo: modelo.trim() || null,
      ano: ano.trim() ? Number(ano) : null,
      placa: placa.trim().toUpperCase() || null,
      chassi: chassi.trim().toUpperCase() || null,
      renavam: renavam.trim() || null,
      medidor: med,
      leitura_inicial: med === 'nenhum' ? 0 : n(leitura),
      data_leitura_inicial: med === 'nenhum' ? paraBanco(hojeBR()) : paraBanco(dataLeitura),
      combustivel: combustivel[0] ?? null,
      tanque_litros: tanque.trim() ? n(tanque) : null,
      uso: uso[0],
      centro_custo_id: centroId,
      proprietario: uso[0] === 'particular' ? proprietario.trim() || null : null,
      responsavel_id: responsavelId,
      imobilizado_id: imobId,
      seguro_vencimento: seguro.trim() ? paraBanco(seguro) : null,
      ativo,
      observacoes: obs.trim() || null,
    };
    setSalvando(true);
    try {
      let vid = id;
      let faz = fazendaDoVeiculo ?? fid;
      if (vid) await consulta(supabase.from('frota_veiculos').update(dados).eq('id', vid).select('id').single());
      else {
        const r = await consulta<any>(supabase.from('frota_veiculos').insert({ ...dados, fazenda_id: fid }).select('id, numero').single());
        vid = r.id;
        faz = fid;
        setNumero(r.numero);
      }
      // plano: apaga os tirados, grava os outros na ordem da tela
      if (apagados.length) await consulta(supabase.from('frota_planos').delete().in('id', apagados));
      for (let i = 0; i < plano.length; i++) {
        const p = plano[i];
        const linha = {
          item: p.item.trim(),
          intervalo: med === 'nenhum' ? null : p.intervalo.trim() ? n(p.intervalo) : null,
          intervalo_meses: p.meses.trim() ? Number(p.meses) : null,
          base_leitura: med === 'nenhum' || !p.baseLeitura.trim() ? null : n(p.baseLeitura),
          base_data: p.baseData.trim() ? paraBanco(p.baseData) : null,
          ordem: i,
        };
        if (p.id) await consulta(supabase.from('frota_planos').update(linha).eq('id', p.id));
        else await consulta(supabase.from('frota_planos').insert({ ...linha, veiculo_id: vid, fazenda_id: faz }));
      }
      const msg = `${dados.nome} ${id ? 'alterado' : 'cadastrado'}${plano.length ? `, com ${plano.length} ${plano.length === 1 ? 'item' : 'itens'} no plano de manutenção` : ''}.`;
      if (veioDeFora) return navegacao.goBack();
      limpar();
      setAviso(`${msg} Pode cadastrar o próximo.`);
    } catch (err) {
      setErro(traduzirErro(err));
    } finally {
      setSalvando(false);
    }
  }

  function excluir() {
    Alert.alert('Excluir', `Excluir ${nome}? Só é possível sem abastecimentos e manutenções lançados.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_veiculo', { p_id: id });
          if (error) return setErro(traduzirErro(error));
          if (veioDeFora) return navegacao.goBack();
          limpar();
          setAviso(`${nome} excluído.`);
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

  const abas = !veioDeFora && <AbasCadastro aba={aba} aoMudar={setAba} />;
  if (!veioDeFora && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaVeiculos />
      </Tela>
    );
  }

  const usoInfo = USOS.find((u) => u.valor === uso[0]);
  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {id ? (
        <View style={estilos.cabecalho}>
          <Text style={estilos.numero}>Nº {numero}</Text>
          {!veioDeFora && (
            <Text style={estilos.link} onPress={limpar}>
              Sair deste e cadastrar outro
            </Text>
          )}
        </View>
      ) : (
        <SeletorLista rotulo="Alterar um veículo já cadastrado" valorId={null} aoMudar={(v) => v && abrir(v)} carregar={carregarVeiculos} dicaBusca="Nome ou placa" vazio="Nenhum veículo cadastrado." />
      )}

      <Secao titulo="Identificação" />
      <Campo rotulo="Nome *" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder="Ex.: Hilux branca, Trator JD 6110J, Motobomba do poço" erro={erros.nome} />
      <Escolha rotulo="Tipo *" opcoes={TIPOS_VEICULO.map((t) => ({ valor: t.valor, rotulo: t.rotulo }))} valor={tipo} aoMudar={mudarTipo} erro={erros.tipo} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Marca" value={marca} onChangeText={setMarca} autoCapitalize="words" placeholder="Ex.: Toyota" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Modelo" value={modelo} onChangeText={setModelo} autoCapitalize="characters" placeholder="Ex.: SRV 2.8" />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ width: 100 }}>
          <Campo rotulo="Ano" value={ano} onChangeText={(t) => setAno(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" erro={erros.ano} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Placa" value={placa} onChangeText={(t) => setPlaca(t.toUpperCase())} autoCapitalize="characters" placeholder="ABC1D23" />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1.3 }}>
          <Campo rotulo="Chassi / nº de série" value={chassi} onChangeText={setChassi} autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="RENAVAM" value={renavam} onChangeText={(t) => setRenavam(t.replace(/\D/g, ''))} keyboardType="number-pad" />
        </View>
      </View>

      <Secao titulo="Uso (para onde vai o custo)" />
      <Escolha opcoes={USOS.map((u) => ({ valor: u.valor, rotulo: u.rotulo }))} valor={uso} aoMudar={setUso} erro={erros.uso} />
      {usoInfo && <Text style={estilos.nota}>{usoInfo.explica}</Text>}
      {uso[0] === 'particular' && <Campo rotulo="De quem é (proprietário)" value={proprietario} onChangeText={setProprietario} autoCapitalize="words" placeholder="Em branco = o produtor" />}
      {uso[0] !== 'particular' && (
        <SeletorLista rotulo="Centro de custo (opcional)" valorId={centroId} aoMudar={setCentroId} carregar={carregarCentros} permitirLimpar vazio="Nenhum centro de custo. Cadastre em Financeiro › Centros de custo." />
      )}
      <CampoPessoaBusca rotulo="Responsável / motorista habitual" valorId={responsavelId} aoMudar={setResponsavelId} tipoNovo="funcionario" />

      <Secao titulo="Medidor e combustível" />
      <Escolha rotulo="Medidor" opcoes={MEDIDORES} valor={medidor} aoMudar={setMedidor} />
      {med !== 'nenhum' && (
        <View style={estilos.linha}>
          <View style={{ flex: 1.2 }}>
            <Campo
              rotulo={id ? `Leitura no cadastro (${un}) *` : `${med === 'horas' ? 'Horímetro' : 'Hodômetro'} hoje (${un}) *`}
              value={leitura}
              onChangeText={(t) => setLeitura(agruparDigitacao(t))}
              keyboardType="decimal-pad"
              erro={erros.leitura}
            />
          </View>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="Na data *" valor={dataLeitura} aoMudar={setDataLeitura} erro={erros.dataLeitura} />
          </View>
        </View>
      )}
      {med !== 'nenhum' && id && <Text style={estilos.nota}>É a leitura de quando o veículo entrou no sistema. As novas vêm dos abastecimentos, das manutenções e de "Atualizar km ou horas".</Text>}
      <Escolha rotulo="Combustível" opcoes={COMBUSTIVEIS} valor={combustivel} aoMudar={(v) => setCombustivel(combustivel[0] === v[0] ? [] : v)} />
      <Campo rotulo="Tanque (litros)" value={tanque} onChangeText={(t) => setTanque(agruparDigitacao(t))} keyboardType="decimal-pad" placeholder="Opcional" erro={erros.tanque} />

      <Secao titulo="Documentos e ligação com o Imobilizado" />
      <CampoData rotulo="Seguro vence em" valor={seguro} aoMudar={setSeguro} erro={erros.seguro} />
      {uso[0] !== 'particular' && (
        <>
          <SeletorLista rotulo="Bem do Imobilizado (opcional)" valorId={imobId} aoMudar={setImobId} carregar={carregarBens} permitirLimpar vazio="Nenhum bem com depreciação nesta fazenda." />
          <Text style={estilos.nota}>Ligado ao bem, a ficha do veículo oferece levar o consumo real (litros por hora) para o custo por hora que vai às Atividades.</Text>
        </>
      )}

      <Secao titulo="Plano de manutenção" />
      <Text style={estilos.nota}>
        Cada item se repete a cada tantos {un === 'h' ? 'horas' : 'km'} e/ou meses (o que vencer primeiro). Em "Última vez", informe quando foi feito antes de usar o sistema: sem isso, conta a partir da leitura do cadastro. Os intervalos sugeridos são médias: confira no manual do fabricante.
      </Text>
      {plano.map((p) => (
        <View key={p.chave} style={estilos.item}>
          <View style={estilos.itemTopo}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Item" value={p.item} onChangeText={(t) => mudarItem(p.chave, 'item', t)} autoCapitalize="sentences" />
            </View>
            <Pressable onPress={() => tirarItem(p)} hitSlop={8} style={{ paddingTop: 26 }} accessibilityLabel="Tirar item">
              <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
            </Pressable>
          </View>
          <View style={estilos.linha}>
            {med !== 'nenhum' && (
              <View style={{ flex: 1 }}>
                <Campo rotulo={`A cada (${un})`} value={p.intervalo} onChangeText={(t) => mudarItem(p.chave, 'intervalo', agruparDigitacao(t))} keyboardType="decimal-pad" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Campo rotulo="A cada (meses)" value={p.meses} onChangeText={(t) => mudarItem(p.chave, 'meses', t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            </View>
          </View>
          <View style={estilos.linha}>
            {med !== 'nenhum' && (
              <View style={{ flex: 1 }}>
                <Campo rotulo={`Última vez (${un})`} value={p.baseLeitura} onChangeText={(t) => mudarItem(p.chave, 'baseLeitura', agruparDigitacao(t))} keyboardType="decimal-pad" placeholder="Opcional" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Última vez (data)" valor={p.baseData} aoMudar={(t) => mudarItem(p.chave, 'baseData', t)} />
            </View>
          </View>
        </View>
      ))}
      {erros.plano ? <Text style={estilos.erro}>{erros.plano}</Text> : null}
      <View style={estilos.linhaEntre}>
        <Text style={estilos.link} onPress={() => setPlano((l) => [...l, { chave: chave(), id: null, item: '', intervalo: '', meses: '', baseLeitura: '', baseData: '' }])}>
          + Item do plano
        </Text>
        {!!tipo[0] && (
          <Text style={estilos.link} onPress={usarPadrao}>
            Usar o plano sugerido
          </Text>
        )}
      </View>
      {id && apagados.length > 0 && temHistorico && <Text style={estilos.nota}>Item tirado do plano: as manutenções já lançadas continuam no histórico.</Text>}

      <Secao titulo="Outros" />
      {id && <Interruptor rotulo="Em uso" descricao="Fora de uso (vendido, sucateado) não aparece nos lançamentos nem nos avisos. O histórico fica guardado." valor={ativo} aoMudar={setAtivo} />}
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linhaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.cafe },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.erro },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 8 },
  itemTopo: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
});
