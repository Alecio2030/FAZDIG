import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Vazio from '../../componentes/Vazio';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { agruparDigitacao, formatarMoeda, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import {
  ROTULO_USO, USOS, carregarProdutosEstoque, carregarVeiculos, itemVeiculo, lerLeiturasAtuais, lerSituacao, nomeMedidor,
  textoLeitura, textoSituacao, unidadeMedidor, type LeituraAtual, type Situacao, type Veiculo,
} from '../../lib/frota';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Peca = { chave: string; insumoId: string | null; qtd: string };
let cont = 0;
const chave = () => `m${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const COR_SIT: Record<string, string> = { vencida: cores.erro, proxima: '#B7791F', ok: cores.primaria };

/**
 * Frota › Manutenções: troca de óleo, filtros, revisões (preventiva: marca os itens do plano)
 * e consertos (corretiva). Óleo, filtros e peças podem sair do estoque da fazenda; o serviço da
 * oficina vira despesa e contas a pagar, classificada pelo uso do veículo.
 */
export default function ManutencaoForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ManutencaoForm'>>();
  const { fazendaAtiva } = useSessao();
  // quem não vê o Financeiro não escolhe caixa nem banco: a despesa vai para o Contas a pagar e o escritório dá a baixa
  const padraoPagto = fazendaAtiva?.financeiro === false ? 'prazo' : 'pago';
  const fid = fazendaAtiva?.id;

  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [leituras, setLeituras] = useState<Record<string, LeituraAtual>>({});
  const [situacao, setSituacao] = useState<Situacao[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [veiculoId, setVeiculoId] = useState<string | null>(params?.veiculoId ?? null);
  const [leitura, setLeitura] = useState('');
  const [tipo, setTipo] = useState<string[]>(['preventiva']);
  const [marcados, setMarcados] = useState<string[]>(params?.planoIds ?? []);
  const [descricao, setDescricao] = useState('');
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [onde, setOnde] = useState<string[]>(['propria']);
  const [oficinaId, setOficinaId] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [documento, setDocumento] = useState('');
  const [pagto, setPagto] = useState<string[]>([padraoPagto]);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [vencimento, setVencimento] = useState('');
  const [uso, setUso] = useState<string[]>([]);
  const [obs, setObs] = useState('');
  const [alterarNum, setAlterarNum] = useState('');

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const veiculo = veiculos.find((v) => v.id === veiculoId) ?? null;
  const med = veiculo?.medidor ?? 'km';
  const un = unidadeMedidor(med);
  const atual = veiculoId ? leituras[veiculoId] : null;
  const itensDoVeiculo = situacao.filter((s) => s.veiculo_id === veiculoId);
  const terceiro = onde[0] === 'terceiro';

  const recarregar = useCallback(async () => {
    try {
      const [vs, ls, si] = await Promise.all([carregarVeiculos(fid, true), lerLeiturasAtuais(), lerSituacao(null)]);
      setVeiculos(vs);
      setLeituras(ls);
      setSituacao(si);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);
  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // veículo escolhido (lançamento novo): o uso vem do cadastro e a leitura sugerida é a última
  useEffect(() => {
    if (!veiculo || id) return;
    setUso([veiculo.uso]);
    if (!leitura && atual?.leitura != null && veiculo.medidor !== 'nenhum') setLeitura(numeroParaCampo(atual.leitura));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veiculoId, veiculos.length, leituras]);

  const carregarVeiculosLista = useCallback(async (): Promise<ItemLista[]> => veiculos.filter((v) => v.ativo).map((v) => itemVeiculo(v, leituras[v.id])), [veiculos, leituras]);
  const carregarPecas = useCallback(async () => (fid ? carregarProdutosEstoque(fid, ['peca', 'outro', 'combustivel']) : []), [fid]);
  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.filter((c) => !c.fazenda_id || c.fazenda_id === fid).map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }));
  }, [fid]);

  function limpar() {
    setId(null);
    setNumero(null);
    setData(hojeBR());
    setVeiculoId(null);
    setLeitura('');
    setTipo(['preventiva']);
    setMarcados([]);
    setDescricao('');
    setPecas([]);
    setOnde(['propria']);
    setOficinaId(null);
    setValor('');
    setDocumento('');
    setPagto([padraoPagto]);
    setVencimento('');
    setUso([]);
    setObs('');
    setErros({});
  }

  async function abrir(mid: string) {
    setCarregando(true);
    setErro(null);
    try {
      const [m, itens, movs] = await Promise.all([
        consulta<any>(supabase.from('frota_manutencoes').select('*, compra:compras ( pago_na_hora, conta_bancaria_id, numero_documento, lancamentos ( data_vencimento ) )').eq('id', mid).single()),
        consulta<any[]>(supabase.from('frota_manutencao_itens').select('plano_id, item').eq('manutencao_id', mid)),
        consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, quantidade').eq('frota_manutencao_id', mid)),
      ]);
      const c = um(m.compra);
      setId(m.id);
      setNumero(m.numero);
      setData(doBanco(m.data));
      setVeiculoId(m.veiculo_id);
      setLeitura(numeroParaCampo(m.leitura));
      setTipo([m.tipo]);
      setMarcados(itens.filter((i) => i.plano_id).map((i) => i.plano_id));
      setDescricao(m.descricao ?? '');
      setPecas(movs.map((x) => ({ chave: chave(), insumoId: x.insumo_id, qtd: numeroParaCampo(x.quantidade) })));
      setOnde([m.onde]);
      setOficinaId(m.pessoa_id);
      setValor(Number(m.valor_servico) > 0 ? moedaParaCampo(m.valor_servico) : '');
      setDocumento(c?.numero_documento ?? '');
      setPagto([c && !c.pago_na_hora ? 'prazo' : 'pago']);
      setBancoId(c?.conta_bancaria_id ?? null);
      setVencimento(c && !c.pago_na_hora && c.lancamentos?.[0]?.data_vencimento ? doBanco(c.lancamentos[0].data_vencimento) : '');
      setUso([m.uso]);
      setObs(m.observacoes ?? '');
      setAba('cadastrar');
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

  async function abrirPorNumero() {
    const m = /^0*(\d+)$/.exec(alterarNum.trim());
    if (!m || !fid) return setErro('Digite o número da manutenção.');
    const { data: x } = await supabase.from('frota_manutencoes').select('id').eq('fazenda_id', fid).eq('numero', Number(m[1])).maybeSingle();
    if (!x) return setErro(`Não há manutenção nº ${m[1]} nesta fazenda.`);
    setAlterarNum('');
    abrir(x.id);
  }

  function marcar(pid: string) {
    setMarcados((l) => (l.includes(pid) ? l.filter((x) => x !== pid) : [...l, pid]));
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(data)) e.data = 'Informe a data.';
    if (!veiculoId) e.veiculo = 'Escolha o veículo ou a máquina.';
    if (veiculo && med !== 'nenhum' && marcados.length > 0 && n(leitura) == null) e.leitura = `Informe o ${nomeMedidor(med)}: é dele que o plano conta a próxima troca.`;
    if (leitura.trim() && (n(leitura) == null || n(leitura)! < 0)) e.leitura = 'Leitura inválida.';
    if (!marcados.length && !descricao.trim()) e.descricao = 'Marque os itens do plano feitos ou descreva o serviço.';
    if (pecas.some((p) => !p.insumoId || !(n(p.qtd)! > 0))) e.pecas = 'Confira o produto e a quantidade de cada peça do estoque.';
    const v = n(valor) ?? 0;
    if (terceiro && v > 0) {
      if (!oficinaId) e.oficina = 'Informe a oficina ou o mecânico.';
      if (pagto[0] === 'pago' && !bancoId) e.banco = 'Escolha o caixa ou o banco de onde saiu o dinheiro.';
      if (pagto[0] === 'prazo' && !dataValida(vencimento)) e.venc = 'Informe o vencimento.';
    }
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    const p = {
      id,
      fazenda_id: fid,
      veiculo_id: veiculoId,
      data: paraBanco(data),
      leitura: med === 'nenhum' || !leitura.trim() ? null : n(leitura),
      tipo: tipo[0],
      planos: marcados,
      descricao: descricao.trim(),
      pecas: pecas.map((x) => ({ insumo_id: x.insumoId, quantidade: n(x.qtd) })),
      onde: onde[0],
      pessoa_id: terceiro ? oficinaId : null,
      valor_servico: terceiro ? v : 0,
      numero_documento: documento.trim(),
      pago: pagto[0] === 'pago',
      conta_bancaria_id: bancoId,
      parcelas: terceiro && v > 0 && pagto[0] === 'prazo' ? [{ vencimento: paraBanco(vencimento), valor: v }] : [],
      uso: uso[0] ?? null,
      observacoes: obs,
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_manutencao', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; pecas: number; servico: number; itens: number | null; compra_numero: number | null; baixa: string | null; pago: boolean | null };
    const partes = [`Manutenção nº ${res.numero} ${id ? 'alterada' : 'lançada'}.`];
    if (res.itens) partes.push(`${res.itens} ${res.itens === 1 ? 'item do plano zerado' : 'itens do plano zerados'}: a próxima conta a partir de agora.`);
    if (res.pecas > 0) partes.push(`Peças do estoque: ${formatarMoeda(res.pecas)}.`);
    if (res.servico > 0)
      partes.push(
        res.pago
          ? res.baixa === 'pendente'
            ? `Serviço de ${formatarMoeda(res.servico)}: pagamento aguardando a confirmação do dono.`
            : `Serviço de ${formatarMoeda(res.servico)} pago.`
          : `Serviço de ${formatarMoeda(res.servico)} no contas a pagar (compra nº ${res.compra_numero}).`,
      );
    setAviso(partes.join(' '));
    limpar();
    recarregar();
  }

  function excluir() {
    Alert.alert('Excluir', `Excluir a manutenção nº ${numero}? As peças voltam ao estoque e o serviço sai do contas a pagar.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('excluir_manutencao', { p_id: id });
          if (error) return setErro(traduzirErro(error));
          setAviso(`Manutenção nº ${numero} excluída.`);
          limpar();
          recarregar();
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

  const abas = <AbasCadastro aba={aba} aoMudar={setAba} rotuloCadastrar="Lançar" />;
  if (aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaManutencoes veiculos={veiculos} veiculoInicial={params?.veiculoId ?? null} aoAbrir={abrir} />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Manutenção nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : 'nova'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair desta e lançar outra
        </Text>
      ) : (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar a manutenção nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={abrirPorNumero} />
          </View>
        </View>
      )}

      <SeletorLista rotulo="Veículo ou máquina *" valorId={veiculoId} aoMudar={(x) => { setVeiculoId(x); setMarcados([]); setLeitura(''); }} carregar={carregarVeiculosLista} dicaBusca="Nome ou placa" erro={erros.veiculo} vazio="Nenhum veículo cadastrado. Cadastre em Frota › Veículos e máquinas." />
      {veiculo && med !== 'nenhum' && (
        <>
          <Campo rotulo={`${med === 'horas' ? 'Horímetro' : 'Hodômetro'} no dia (${un})`} value={leitura} onChangeText={(t) => setLeitura(agruparDigitacao(t))} keyboardType="decimal-pad" erro={erros.leitura} />
          <Text style={estilos.nota}>Última leitura: {textoLeitura(atual?.leitura, med)}{atual?.data ? ` em ${doBanco(atual.data)}` : ''}</Text>
        </>
      )}
      <Escolha
        rotulo="Tipo"
        opcoes={[
          { valor: 'preventiva', rotulo: 'Preventiva (troca, revisão)' },
          { valor: 'corretiva', rotulo: 'Corretiva (conserto)' },
        ]}
        valor={tipo}
        aoMudar={setTipo}
      />

      {veiculo && itensDoVeiculo.length > 0 && (
        <>
          <Secao titulo="Itens do plano feitos" />
          <Text style={estilos.nota}>Marque o que foi feito: o item volta a contar do zero a partir desta data e leitura.</Text>
          {itensDoVeiculo.map((s) => {
            const sel = marcados.includes(s.plano_id);
            return (
              <Pressable key={s.plano_id} onPress={() => marcar(s.plano_id)} style={[estilos.opcao, sel && estilos.opcaoMarcada]} accessibilityRole="checkbox">
                <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={26} color={sel ? cores.primaria : cores.textoSuave} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.opcaoTitulo}>{s.item}</Text>
                  <Text style={[estilos.nota, { color: COR_SIT[s.situacao] }]}>{textoSituacao(s, doBanco)}</Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
      {veiculo && itensDoVeiculo.length === 0 && <Text style={estilos.nota}>Este veículo ainda não tem plano de manutenção. Cadastre em Frota › Veículos e máquinas (há um plano sugerido para cada tipo).</Text>}

      <Campo rotulo={marcados.length ? 'Mais alguma coisa? (opcional)' : 'O que foi feito *'} value={descricao} onChangeText={setDescricao} autoCapitalize="sentences" placeholder="Ex.: troca da bomba d'água, solda no engate" multiline style={{ minHeight: 64, paddingTop: 12, textAlignVertical: 'top' }} erro={erros.descricao} />

      <Secao titulo="Óleo, filtros e peças do estoque" />
      {pecas.map((p) => (
        <View key={p.chave} style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <SeletorLista rotulo="Produto" valorId={p.insumoId} aoMudar={(x) => setPecas((l) => l.map((y) => (y.chave === p.chave ? { ...y, insumoId: x } : y)))} carregar={carregarPecas} vazio="Nenhuma peça ou óleo no estoque. Lance a compra em Mais › Compras." />
          </View>
          <View style={{ width: 90 }}>
            <Campo rotulo="Qtde." value={p.qtd} onChangeText={(t) => setPecas((l) => l.map((y) => (y.chave === p.chave ? { ...y, qtd: agruparDigitacao(t) } : y)))} keyboardType="decimal-pad" />
          </View>
          <Pressable onPress={() => setPecas((l) => l.filter((y) => y.chave !== p.chave))} hitSlop={8} style={{ paddingTop: 26 }} accessibilityLabel="Tirar peça">
            <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
          </Pressable>
        </View>
      ))}
      {erros.pecas ? <Text style={estilos.erro}>{erros.pecas}</Text> : null}
      <Text style={estilos.link} onPress={() => setPecas((l) => [...l, { chave: chave(), insumoId: null, qtd: '' }])}>
        + Peça ou óleo do estoque
      </Text>
      <Text style={estilos.nota}>Sai do estoque desta fazenda pelo custo médio, na unidade do cadastro do produto. Peça comprada na hora, na oficina, vai no valor do serviço abaixo.</Text>

      <Secao titulo="Onde foi feito" />
      <Escolha
        opcoes={[
          { valor: 'propria', rotulo: 'Na fazenda (equipe própria)' },
          { valor: 'terceiro', rotulo: 'Oficina / mecânico de fora' },
        ]}
        valor={onde}
        aoMudar={setOnde}
      />
      {terceiro && (
        <>
          <CampoPessoaBusca rotulo="Oficina ou mecânico" valorId={oficinaId} aoMudar={setOficinaId} tipoNovo="fornecedor" erro={erros.oficina} />
          <CampoMoeda rotulo="Valor do serviço e das peças compradas (R$)" valor={valor} aoMudar={setValor} />
          {(n(valor) ?? 0) > 0 && (
            <>
              <Campo rotulo="Nº da nota / recibo" value={documento} onChangeText={setDocumento} autoCapitalize="characters" />
              <Escolha
                rotulo="Pagamento"
                opcoes={[
                  { valor: 'pago', rotulo: 'Já paguei' },
                  { valor: 'prazo', rotulo: 'A pagar' },
                ]}
                valor={pagto}
                aoMudar={setPagto}
              />
              {pagto[0] === 'pago' ? (
                <SeletorLista rotulo="De onde saiu o dinheiro *" valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} erro={erros.banco} vazio={fazendaAtiva?.financeiro === false ? 'Seu acesso não mostra o caixa e os bancos. Escolha "A pagar" (ou "A receber"): o escritório dá a baixa.' : 'Nenhuma conta. Cadastre em Financeiro › Bancos e caixa.'} />
              ) : (
                <CampoData rotulo="Vencimento *" valor={vencimento} aoMudar={setVencimento} erro={erros.venc} />
              )}
            </>
          )}
        </>
      )}

      <Secao titulo="Uso" />
      <Escolha opcoes={USOS.map((u) => ({ valor: u.valor, rotulo: u.rotulo }))} valor={uso} aoMudar={setUso} />
      {veiculo && uso[0] && uso[0] !== veiculo.uso && <Text style={estilos.nota}>Diferente do cadastro ({ROTULO_USO[veiculo.uso]}): vale só para esta manutenção.</Text>}
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 64, paddingTop: 12, textAlignVertical: 'top' }} />

      <Botao titulo={id ? 'Salvar alterações' : 'Lançar manutenção'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir manutenção" tipo="perigo" onPress={excluir} />}
      {!id && veiculo && <Botao titulo="Ver a ficha do veículo" tipo="texto" onPress={() => navegacao.navigate('VeiculoDetalhe', { id: veiculo.id })} />}
    </Tela>
  );
}

/** Consulta: as últimas manutenções (de um veículo ou de todos desta fazenda). Tocando, abre para alterar. */
function ConsultaManutencoes({ veiculos, veiculoInicial, aoAbrir }: { veiculos: Veiculo[]; veiculoInicial: string | null; aoAbrir: (id: string) => void }) {
  const { fazendaAtiva } = useSessao();
  const [veiculoId, setVeiculoId] = useState<string | null>(veiculoInicial);
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let q = supabase.from('frota_manutencoes').select('*, veiculo:frota_veiculos ( nome, medidor ), oficina:pessoas ( nome ), frete:frota_fretes ( numero )').order('data', { ascending: false }).order('numero', { ascending: false }).limit(60);
    q = veiculoId ? q.eq('veiculo_id', veiculoId) : q.eq('fazenda_id', fazendaAtiva?.id);
    consulta<any[]>(q).then(setLista).catch((e) => setErro(traduzirErro(e)));
  }, [veiculoId, fazendaAtiva?.id]);

  const carregar = useCallback(async (): Promise<ItemLista[]> => veiculos.map((v) => itemVeiculo(v)), [veiculos]);
  const total = (lista ?? []).reduce((s, x) => s + Number(x.valor_servico ?? 0) + Number(x.valor_pecas ?? 0), 0);

  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <SeletorLista rotulo="Veículo (em branco = todos desta fazenda)" valorId={veiculoId} aoMudar={setVeiculoId} carregar={carregar} permitirLimpar />
      {lista && lista.length > 0 && (
        <View style={estilos.quadro}>
          <Text style={estilos.quadroTexto}>
            {lista.length} {lista.length === 1 ? 'manutenção' : 'manutenções'} · {formatarMoeda(total)} (serviços e peças)
          </Text>
        </View>
      )}
      {lista && lista.length === 0 && <Vazio icone="build-outline" texto="Nenhuma manutenção lançada." />}
      {lista && lista.length > 0 && (
        <Lista>
          {lista.map((m) => {
            const ve = um(m.veiculo);
            const custo = Number(m.valor_servico ?? 0) + Number(m.valor_pecas ?? 0);
            return (
              <Linha
                key={m.id}
                titulo={`Nº ${m.numero} · ${doBanco(m.data)} · ${ve?.nome ?? ''}`}
                linhas={[
                  m.descricao,
                  [m.tipo === 'corretiva' ? 'Corretiva' : 'Preventiva', m.leitura != null ? textoLeitura(Number(m.leitura), ve?.medidor) : null, m.frete_id ? `na estrada, frete nº ${um(m.frete)?.numero ?? ''}${m.observacoes ? ` (${m.observacoes})` : ''}` : m.onde === 'terceiro' ? um(m.oficina)?.nome ?? 'Oficina' : 'Na fazenda', ROTULO_USO[m.uso]].filter(Boolean).join(' · '),
                ]}
                direita={custo > 0 ? formatarMoeda(custo) : undefined}
                onPress={() => aoAbrir(m.id)}
              />
            );
          })}
        </Lista>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { minWidth: 110, paddingTop: 4 },
  numeroRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  numeroValor: { fontSize: tam.titulo - 4, fontWeight: '800', color: cores.cafe },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.erro },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10 },
  opcaoMarcada: { borderColor: cores.primaria, borderWidth: 2 },
  opcaoTitulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 4 },
  quadroTexto: { fontSize: tam.pequeno + 1, color: cores.info, fontWeight: '700' },
});
