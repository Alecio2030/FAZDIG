import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, lerNumero } from '../../lib/formatos';
import { textoSacas } from '../../lib/posColheita';
import { perguntar } from '../../lib/perguntar';
import { cotacaoReferencia, lerCotacoes, type Cotacao } from '../../lib/cotacoes';
import { ROTULO_SITUACAO_CONTRATO, ROTULO_TIPO_CONTRATO, aCompensar, diasParaEntrega, lerContratos, saldoSacas, textoCafe, textoPrazo, textoPreco, type ContratoCafe } from '../../lib/contratosCafe';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** Ficha do contrato de café: o que foi combinado, o que já foi entregue, o adiantamento (ou a compra da troca) e as ações. */
export default function ContratoCafeDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ContratoCafeDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [c, setC] = useState<ContratoCafe | null>(null);
  const [cots, setCots] = useState<Cotacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // adiantamento
  const [adAberto, setAdAberto] = useState(false);
  const [adData, setAdData] = useState(hojeBR());
  const [adValor, setAdValor] = useState('');
  const [adBanco, setAdBanco] = useState<string | null>(null);
  const [adObs, setAdObs] = useState('');
  const [adErro, setAdErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: c ? `Contrato nº ${c.numero}` : 'Contrato de café' });
  }, [navegacao, c]);

  const carregar = useCallback(async () => {
    if (!fid) return;
    try {
      const l = await lerContratos(fid, params.id);
      if (!l[0]) throw new Error('Contrato não encontrado.');
      setC(l[0]);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid, params.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
      lerCotacoes().then(setCots).catch(() => setCots([]));
    }, [carregar]),
  );

  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.filter((b) => !b.fazenda_id || b.fazenda_id === fid).map((b) => ({ id: b.id, titulo: b.nome, detalhe: b.banco }));
  }, [fid]);

  async function receberAdiantamento() {
    setAdErro(null);
    const v = lerNumero(adValor);
    if (!dataValida(adData)) return setAdErro('Informe a data do recebimento.');
    if (!v || v <= 0) return setAdErro('Informe o valor do adiantamento.');
    if (!adBanco) return setAdErro('Escolha a conta bancária ou o caixa onde o dinheiro entrou.');
    setOcupado(true);
    const { data: r, error } = await supabase.rpc('receber_adiantamento_contrato', { p: { contrato_id: c!.id, data: paraBanco(adData), valor: v, conta_bancaria_id: adBanco, observacoes: adObs } });
    setOcupado(false);
    if (error) return setAdErro(traduzirErro(error));
    setAdAberto(false);
    setAdValor('');
    setAdObs('');
    setAviso(`Adiantamento de ${formatarMoeda(v)} recebido${(r as any)?.situacao === 'pendente' ? ' (aguardando a confirmação do Master)' : ''}. Não é receita: será abatido das entregas deste contrato.`);
    carregar();
  }

  async function mudarSituacao(situacao: 'aberto' | 'concluido' | 'cancelado', titulo: string, pergunta: string) {
    if (!(await perguntar(titulo, pergunta, titulo, 'Voltar'))) return;
    setErro(null);
    setOcupado(true);
    const { error } = await supabase.rpc('situacao_contrato_cafe', { p_id: c!.id, p_situacao: situacao });
    setOcupado(false);
    if (error) return setErro(traduzirErro(error));
    carregar();
  }

  async function excluir() {
    if (!(await perguntar('Excluir contrato', `Excluir o contrato nº ${c!.numero}? Só é possível se ele não tiver entrega nem adiantamento.`, 'Excluir', 'Voltar'))) return;
    setErro(null);
    setOcupado(true);
    const { error } = await supabase.rpc('excluir_contrato_cafe', { p_id: c!.id });
    setOcupado(false);
    if (error) return setErro(traduzirErro(error));
    navegacao.goBack();
  }

  if (erro && !c) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!c) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const falta = saldoSacas(c);
  const comp = aCompensar(c);
  const aberto = c.situacao === 'aberto';
  const cot = cotacaoReferencia(cots, c.cafe_tipo);
  const recebidoEntregas = c.entregas.reduce((t, e) => t + e.valor_bruto, 0);
  const dias = diasParaEntrega(c);

  return (
    <Tela>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aberto && dias < 0 && <Aviso tipo="erro" texto={`Entrega vencida em ${doBanco(c.data_entrega)}: faltam ${textoSacas(falta)}.`} />}

      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>{c.pessoa_nome}</Text>
        <Text style={estilos.sub}>
          {ROTULO_TIPO_CONTRATO[c.tipo]} · {ROTULO_SITUACAO_CONTRATO[c.situacao]} · contrato de {doBanco(c.data)}
        </Text>
        <View style={estilos.cards}>
          <Card rotulo="Contratado" valor={textoSacas(c.sacas)} detalhe={textoCafe(c) || undefined} />
          <Card rotulo="Entregue" valor={textoSacas(c.entregue)} detalhe={c.entregas.length ? `${c.entregas.length} ${c.entregas.length === 1 ? 'entrega' : 'entregas'}` : undefined} />
          <Card rotulo="Falta entregar" valor={textoSacas(falta)} detalhe={aberto ? textoPrazo(c) : undefined} destaque={aberto && dias < 0} />
        </View>
      </View>

      <Secao titulo="Combinado" />
      <Dado rotulo="Preço" valor={textoPreco(c)} />
      {c.preco != null && <Dado rotulo="Valor do contrato" valor={formatarMoeda(c.sacas * c.preco)} />}
      {cot && aberto && (
        <Dado
          rotulo={`Cotação de ${doBanco(cot.data)}`}
          valor={`${formatarMoeda(cot.preco)} (${cot.fonte}, tipo ${cot.tipo})${c.preco != null ? ` · contrato ${c.preco >= cot.preco ? 'acima' : 'abaixo'} em ${formatarMoeda(Math.abs(c.preco - cot.preco))} por saca` : ''}`}
        />
      )}
      <Dado rotulo="Entrega até" valor={doBanco(c.data_entrega)} />
      <Dado rotulo="Local de entrega" valor={c.local_entrega} />
      <Dado rotulo="Safra" valor={c.safra_nome} />
      {c.observacoes ? <Text style={estilos.obs}>{c.observacoes}</Text> : null}

      {c.tipo === 'troca' ? (
        <>
          <Secao titulo="Compra paga em café" />
          <Dado rotulo="Compra" valor={c.compra_numero ? `nº ${c.compra_numero}${c.compra_valor ? ` · ${formatarMoeda(c.compra_valor)}` : ''}` : null} />
          <Dado rotulo="Valor da troca" valor={c.valor_troca != null ? formatarMoeda(c.valor_troca) : null} />
          <Dado rotulo="Já quitado com café" valor={formatarMoeda(c.compensado)} />
          <Dado rotulo="Ainda em aberto no contas a pagar" valor={formatarMoeda(c.aberto_compra)} />
          <Text style={estilos.nota}>Cada entrega é uma venda de café ao fornecedor pelo preço da troca. O sistema quita a compra com o valor da venda, sem movimentar dinheiro (encontro de contas).</Text>
        </>
      ) : (
        <>
          <Secao titulo="Adiantamento" />
          <Dado rotulo="Recebido" valor={formatarMoeda(c.adiantado)} />
          <Dado rotulo="Já abatido nas entregas" valor={formatarMoeda(c.compensado)} />
          <Dado rotulo="A compensar" valor={formatarMoeda(comp)} />
          {c.adiantamentos.length > 0 && (
            <Lista>
              {c.adiantamentos.map((a) => (
                <Linha key={a.id} titulo={`${doBanco(a.data)} · título nº ${a.numero}`} linhas={[a.situacao === 'pago' ? 'Recebido' : a.situacao === 'parcial' ? 'Recebido em parte' : 'Em aberto (estornado)']} direita={formatarMoeda(a.valor)} onPress={() => navegacao.navigate('TituloDetalhe', { id: a.id })} />
              ))}
            </Lista>
          )}
          <Text style={estilos.nota}>O adiantamento entra na conta bancária como adiantamento de cliente, não como receita. A receita é da entrega; o adiantamento é abatido do valor a receber.</Text>
          {aberto &&
            (adAberto ? (
              <View style={estilos.quadro}>
                <Text style={estilos.quadroTitulo}>Receber adiantamento</Text>
                <View style={estilos.linha}>
                  <View style={{ flex: 1 }}>
                    <CampoData rotulo="Data *" valor={adData} aoMudar={setAdData} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CampoMoeda rotulo="Valor (R$) *" valor={adValor} aoMudar={setAdValor} />
                  </View>
                </View>
                <SeletorLista rotulo="Conta bancária / caixa onde entrou *" valorId={adBanco} aoMudar={setAdBanco} carregar={carregarBancos} vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />
                <Campo rotulo="Observações" value={adObs} onChangeText={setAdObs} autoCapitalize="sentences" />
                {adErro ? <Text style={estilos.erro}>{adErro}</Text> : null}
                <View style={estilos.linha}>
                  <View style={{ flex: 1 }}>
                    <Botao titulo="Fechar" tipo="texto" onPress={() => setAdAberto(false)} />
                  </View>
                  <View style={{ flex: 2 }}>
                    <Botao titulo="Confirmar recebimento" onPress={receberAdiantamento} carregando={ocupado} />
                  </View>
                </View>
              </View>
            ) : (
              <Botao titulo="Receber adiantamento" tipo="secundario" onPress={() => setAdAberto(true)} />
            ))}
        </>
      )}

      <Secao titulo="Entregas" />
      {c.entregas.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma entrega ainda.</Text>
      ) : (
        <>
          <Lista>
            {c.entregas.map((e) => (
              <Linha
                key={e.id}
                titulo={`${doBanco(e.data)} · venda nº ${e.numero}`}
                linhas={[`${textoSacas(e.sacas)}${e.sacas ? ` · ${formatarMoeda(e.valor_bruto / e.sacas)} por saca` : ''}`, e.compensado > 0 ? `${formatarMoeda(e.compensado)} ${c.tipo === 'troca' ? 'quitaram a compra' : 'abatidos do adiantamento'} (sem dinheiro)` : null]}
                direita={formatarMoeda(e.valor_bruto)}
                onPress={() => navegacao.navigate('VendaDetalhe', { id: e.id })}
              />
            ))}
          </Lista>
          <Text style={estilos.nota}>
            Entregue: {textoSacas(c.entregue)} · {formatarMoeda(recebidoEntregas)}
            {c.entregue ? ` · preço médio ${formatarMoeda(recebidoEntregas / c.entregue)} por saca` : ''}
          </Text>
        </>
      )}

      {aberto && falta > 0 && <Botao titulo="Entregar café (lançar a venda)" onPress={() => navegacao.navigate('VendaForm', { contratoId: c.id })} />}
      {aberto && <Botao titulo="Alterar o contrato" tipo="secundario" onPress={() => navegacao.navigate('ContratoCafeForm', { id: c.id })} />}
      {aberto && c.entregue > 0 && falta > 0 && (
        <Botao titulo="Encerrar com saldo" tipo="texto" onPress={() => mudarSituacao('concluido', 'Encerrar', `Encerrar o contrato nº ${c.numero} com ${textoSacas(falta)} sem entregar? O saldo deixa de contar como café comprometido.`)} />
      )}
      {!aberto && (c.situacao === 'cancelado' || falta > 0) && <Botao titulo="Reabrir o contrato" tipo="texto" onPress={() => mudarSituacao('aberto', 'Reabrir', `Reabrir o contrato nº ${c.numero}?`)} />}
      {aberto && c.entregue === 0 && <Botao titulo="Cancelar o contrato" tipo="perigo" onPress={() => mudarSituacao('cancelado', 'Cancelar o contrato', `Cancelar o contrato nº ${c.numero}? Ele fica guardado como cancelado.`)} />}
      {c.entregas.length === 0 && c.adiantamentos.length === 0 && <Botao titulo="Excluir contrato" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

function Card({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.cardRotulo}>{rotulo}</Text>
      <Text style={[estilos.cardValor, destaque && { color: cores.erro }]}>{valor}</Text>
      {detalhe ? <Text style={[estilos.cardDetalhe, destaque && { color: cores.erro }]}>{detalhe}</Text> : null}
    </View>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 14, gap: 8 },
  titulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  sub: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, minWidth: 96, backgroundColor: cores.fundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  cardValor: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  cardDetalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
  dadoRotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  dadoValor: { fontSize: tam.texto, color: cores.texto, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  obs: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 21, fontStyle: 'italic' },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 10 },
  quadroTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.info },
});
