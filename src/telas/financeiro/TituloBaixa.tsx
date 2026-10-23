import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoMoeda from '../../componentes/CampoMoeda';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import EntradaDocumento from '../../componentes/EntradaDocumento';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { eDono } from '../../lib/acessos';
import { dataValida, doBanco, hojeBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, lerNumero, moedaParaCampo } from '../../lib/formatos';
import { codigoBarras } from '../../lib/notaFiscal';
import { abrirFotoDocumento } from '../../lib/documentos';
import { ROTULO_BAIXA, encargosAtraso, r2, saldoTitulo, textoPrazo, textosTitulo, um } from '../../lib/titulos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const n = (t: string) => lerNumero(t) ?? 0;

/** Pagar um título (dar baixa). Também é aqui que o Master confirma ou rejeita, e que se estorna um pagamento. */
export default function TituloBaixa() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'TituloBaixa'>>();
  const { fazendaAtiva, sessao } = useSessao();
  const fid = fazendaAtiva?.id;
  const dono = eDono(fazendaAtiva?.perfil);
  const eu = sessao?.user?.id ?? null;

  const [t, setT] = useState<any>(null);
  const [baixas, setBaixas] = useState<any[]>([]);
  const [data, setData] = useState(hojeBR());
  const [principal, setPrincipal] = useState('');
  const [juros, setJuros] = useState('');
  const [multa, setMulta] = useState('');
  const [desconto, setDesconto] = useState('');
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [novoVenc, setNovoVenc] = useState('');
  const [autent, setAutent] = useState('');
  const [obs, setObs] = useState('');
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [avisoDoc, setAvisoDoc] = useState<string | null>(null);
  const [acao, setAcao] = useState<{ id: string; tipo: 'estornar' | 'rejeitar' } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: t ? `${t.tipo === 'receber' ? 'Receber' : 'Pagar'} título nº ${t.numero}` : 'Título' });
  }, [navegacao, t]);

  const carregar = useCallback(
    async (preencher: boolean) => {
      try {
        const [tit, bs] = await Promise.all([
          consulta<any>(supabase.from('lancamentos').select('*, pessoa:pessoas ( nome ), compra:compras ( numero ), venda:vendas ( id, numero )').eq('id', params.id).single()),
          consulta<any[]>(supabase.from('baixas').select('*, banco:contas_bancarias ( nome )').eq('lancamento_id', params.id).order('created_at')),
        ]);
        setT(tit);
        setBaixas(bs);
        if (preencher) {
          const saldo = saldoTitulo(tit);
          const enc = encargosAtraso(saldo, tit.data_vencimento, hojeBanco(), tit.multa_perc, tit.juros_mes_perc);
          setData(hojeBR());
          setPrincipal(saldo > 0 ? moedaParaCampo(saldo) : '');
          setMulta(enc.multa ? moedaParaCampo(enc.multa) : '');
          setJuros(enc.juros ? moedaParaCampo(enc.juros) : '');
          setDesconto('');
          setBancoId(tit.conta_bancaria_id ?? null);
          setNovoVenc('');
          setAutent('');
          setObs('');
          setComprovante(null);
          setAvisoDoc(null);
          setErros({});
        }
      } catch (e) {
        setErro(traduzirErro(e));
      }
    },
    [params.id],
  );
  useFocusEffect(
    useCallback(() => {
      carregar(true);
    }, [carregar]),
  );

  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const [d, s] = await Promise.all([
      consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome')),
      fid ? supabase.rpc('saldo_contas', { p_fazenda: fid }) : Promise.resolve({ data: [] as any[] }),
    ]);
    const saldos = ((s as any).data as any[]) ?? [];
    // caixa e bancos são do Grupo: qualquer conta paga ou recebe título de qualquer unidade
    return d
      .map((c) => {
        const sd = saldos.find((x) => x.id === c.id);
        return { id: c.id, titulo: c.nome, detalhe: [c.banco, sd ? `saldo ${formatarMoeda(Number(sd.saldo))}` : null].filter(Boolean).join(' · ') };
      });
  }, [fid]);

  if (erro && !t) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!t) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const tx = textosTitulo(t.tipo === 'receber' ? 'receber' : 'pagar');
  const ROTULO_SITUACAO = tx.situacao;
  const saldo = saldoTitulo(t);
  const aberto = t.situacao === 'aberto' || t.situacao === 'parcial';
  const princ = n(principal);
  const totalPago = r2(princ + n(juros) + n(multa) - n(desconto));
  const parcial = princ > 0 && princ < saldo - 0.005;
  const dataBanco = paraBanco(data);
  const enc = dataBanco ? encargosAtraso(princ, t.data_vencimento, dataBanco, t.multa_perc, t.juros_mes_perc) : { dias: 0, multa: 0, juros: 0 };

  function recalcularEncargos() {
    setMulta(enc.multa ? moedaParaCampo(enc.multa) : '');
    setJuros(enc.juros ? moedaParaCampo(enc.juros) : '');
  }

  /** Comprovante lido pela IA: preenche a baixa para conferência. */
  function aplicarComprovante(d: any, arq: string | null) {
    setErro(null);
    const atencao: string[] = [];
    const faltou: string[] = [...(d.nao_lido ?? [])];
    if (d.data_pagamento && d.data_pagamento <= hojeBanco()) setData(doBanco(d.data_pagamento));
    else faltou.push('data do pagamento');
    let j = Number(d.juros) || 0;
    const m = Number(d.multa) || 0;
    const desc = Number(d.desconto) || 0;
    let p = d.valor_documento != null ? Number(d.valor_documento) : d.valor_pago != null ? r2(Number(d.valor_pago) - j - m + desc) : null;
    if (p == null) faltou.push('valor');
    else {
      if (p > saldo + 0.005) {
        // pagou mais que o saldo do título: a diferença só pode ser encargo
        j = r2(j + (p - saldo));
        p = saldo;
        atencao.push(`o valor do comprovante é maior que o saldo do título (${formatarMoeda(saldo)}): a diferença foi para os juros, confira`);
      } else if (p < saldo - 0.005) atencao.push(`o comprovante é de ${formatarMoeda(p)} e o saldo do título é ${formatarMoeda(saldo)}: fica como pagamento parcial, confira`);
      setPrincipal(moedaParaCampo(p));
      setJuros(j ? moedaParaCampo(j) : '');
      setMulta(m ? moedaParaCampo(m) : '');
      setDesconto(desc ? moedaParaCampo(desc) : '');
    }
    const cb = codigoBarras(d.codigo_barras);
    if (cb && t.codigo_barras && cb !== t.codigo_barras) atencao.push('o código de barras do comprovante é diferente do boleto deste título: confira se é o título certo');
    setAutent(d.autenticacao ?? '');
    setComprovante(arq);
    const partes = ['Comprovante lido.'];
    if (d.legivel === false) partes.push('Quase nada pôde ser lido: tire outra foto ou digite.');
    if (faltou.length) partes.push(`Não veio na leitura: ${[...new Set(faltou)].join(', ')}.`);
    if (atencao.length) partes.push(`Atenção: ${atencao.join('; ')}.`);
    partes.push(t.tipo === 'receber' ? 'Confira, escolha a conta em que o dinheiro entrou e toque em Recebido.' : 'Confira, escolha a conta de onde saiu o dinheiro e toque em Pago.');
    setAvisoDoc(partes.join(' '));
  }

  async function pagar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(data)) e.data = `Informe a data do ${tx.pagamento}.`;
    else if (dataBanco! > hojeBanco()) e.data = tx.receber ? 'A data do recebimento não pode ser futura.' : 'A data do pagamento não pode ser futura. Se só agendou no banco, informe o agendamento em Lançar › Alterar um título.';
    if (princ <= 0) e.principal = `Informe o valor ${tx.pago} do título.`;
    else if (princ > saldo + 0.005) e.principal = `O valor é maior que o saldo do título (${formatarMoeda(saldo)}). Juros e multa vão nos campos deles.`;
    if (!bancoId) e.banco = tx.receber ? 'Escolha a conta bancária ou o caixa em que o dinheiro entrou.' : 'Escolha a conta bancária ou o caixa de onde saiu o dinheiro.';
    if (totalPago <= 0) e.desconto = `O desconto não pode zerar o ${tx.pagamento}.`;
    if (novoVenc && !dataValida(novoVenc)) e.novoVenc = 'Data inválida.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('baixar_titulo', {
      p: {
        lancamento_id: t.id,
        data: dataBanco,
        valor_principal: princ,
        juros: n(juros),
        multa: n(multa),
        desconto: n(desconto),
        conta_bancaria_id: bancoId,
        arquivo_comprovante: comprovante ?? '',
        autenticacao: autent,
        observacoes: obs,
        novo_vencimento: parcial && novoVenc ? paraBanco(novoVenc) : '',
      },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const pendente = (r as any)?.situacao === 'pendente';
    setAviso(
      `${tx.Pagamento} de ${formatarMoeda(totalPago)} lançado${parcial ? ` (parcial: ficou saldo de ${formatarMoeda(r2(saldo - princ))})` : ''}. ${pendente ? 'Fica aguardando a confirmação do Master; o saldo do banco só muda depois dela.' : 'Saldo da conta atualizado.'}`,
    );
    await carregar(true);
  }

  async function confirmar(b: any, aceitar: boolean) {
    setErro(null);
    setAviso(null);
    const { error } = await supabase.rpc('confirmar_baixa', { p_id: b.id, p_aceitar: aceitar, p_motivo: aceitar ? null : motivo });
    if (error) return setErro(traduzirErro(error));
    setAcao(null);
    setMotivo('');
    setAviso(aceitar ? `${tx.Pagamento} confirmado: saldo da conta atualizado.` : `${tx.Pagamento} rejeitado: o título voltou a ficar em aberto.`);
    await carregar(true);
  }
  async function estornar(b: any) {
    setErro(null);
    setAviso(null);
    if (!motivo.trim()) return setErro('Informe o motivo do estorno.');
    const { error } = await supabase.rpc('estornar_baixa', { p_id: b.id, p_motivo: motivo });
    if (error) return setErro(traduzirErro(error));
    setAcao(null);
    setMotivo('');
    setAviso(`${tx.Pagamento} estornado: o valor voltou para o saldo do título e a conta foi acertada.`);
    await carregar(true);
  }

  return (
    <Tela>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <View style={estilos.cartao}>
        <Text style={estilos.descricao}>{t.descricao ?? 'Título'}</Text>
        <Text style={estilos.nota}>
          {[um(t.pessoa)?.nome, t.documento ? `Doc. ${t.documento}` : null, t.total_parcelas > 1 ? `parcela ${t.parcela}/${t.total_parcelas}` : null, um(t.compra) ? `compra nº ${um(t.compra).numero}` : null, um(t.venda) ? `venda nº ${um(t.venda).numero}` : null].filter(Boolean).join(' · ')}
        </Text>
        <View style={estilos.entre}>
          <View>
            <Text style={estilos.rotulo}>Vencimento</Text>
            <Text style={[estilos.valor, aberto && t.data_vencimento < hojeBanco() && { color: cores.erro }]}>{doBanco(t.data_vencimento)}</Text>
            <Text style={estilos.nota}>{textoPrazo(t)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.rotulo}>{aberto ? `Saldo a ${tx.pagar}` : ROTULO_SITUACAO[t.situacao]}</Text>
            <Text style={estilos.saldo}>{formatarMoeda(aberto ? saldo : Number(t.valor))}</Text>
            {t.situacao === 'parcial' && <Text style={estilos.nota}>de {formatarMoeda(Number(t.valor))}</Text>}
          </View>
        </View>
        {t.previsto && aberto && <Text style={estilos.alerta}>Valor previsto (conta contínua): se a conta do mês veio com outro valor, corrija antes de {tx.pagar}.</Text>}
        {t.agendado_para && aberto && <Text style={estilos.nota}>Agendado no banco para {doBanco(t.agendado_para)}</Text>}
        {t.linha_digitavel || t.codigo_barras ? (
          <>
            <Text style={estilos.rotulo}>Linha digitável (segure para copiar)</Text>
            <Text style={estilos.codigo} selectable>{t.linha_digitavel ?? t.codigo_barras}</Text>
          </>
        ) : null}
        {t.pix_copia_cola ? (
          <>
            <Text style={estilos.rotulo}>Pix copia e cola (segure para copiar)</Text>
            <Text style={estilos.codigo} selectable numberOfLines={3}>{t.pix_copia_cola}</Text>
          </>
        ) : null}
        {t.arquivo_documento ? (
          <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(t.arquivo_documento)) && setErro('Não foi possível abrir a foto do documento.')}>
            📷 Ver a foto do documento
          </Text>
        ) : null}
        {aberto && (
          <Text style={estilos.link} onPress={() => navegacao.push('TituloForm', { tipo: tx.receber ? 'receber' : 'pagar', aba: 'lancar', numero: t.numero })}>
            {tx.receber ? 'Alterar vencimento, valor ou encargos' : 'Alterar vencimento, valor, boleto ou agendamento'}
          </Text>
        )}
      </View>

      {/* ---------- pagar ---------- */}
      {aberto && (
        <>
          <Secao titulo={tx.Pagamento} />
          <EntradaDocumento
            titulo="Entrada pelo comprovante"
            tipo="comprovante"
            rotuloFoto="Foto ou print do comprovante"
            instrucao={tx.receber ? 'Comprovante do Pix, TED ou depósito recebido. Pode ser o print da tela do banco.' : 'Comprovante do boleto pago, Pix, TED ou recibo. Pode ser o print da tela do banco.'}
            dica={`A leitura traz a data, o valor, juros, multa e a autenticação. Nada é gravado sem o seu ${tx.Pago}.`}
            textoLendo="Lendo o comprovante… (uns 10 segundos)"
            aoLer={(d, arq) => aplicarComprovante(d, arq)}
            aoErro={setErro}
          />
          {avisoDoc && <Aviso tipo="info" texto={avisoDoc} />}
          {comprovante && (
            <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(comprovante)) && setErro('Não foi possível abrir o comprovante.')}>
              📷 Ver o comprovante
            </Text>
          )}
          <CampoData rotulo={`Data do ${tx.pagamento} *`} valor={data} aoMudar={setData} erro={erros.data} />
          <CampoMoeda rotulo={`Valor ${tx.pago} do título (saldo ${formatarMoeda(saldo)}) *`} valor={principal} aoMudar={setPrincipal} erro={erros.principal} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Juros" valor={juros} aoMudar={setJuros} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Multa" valor={multa} aoMudar={setMulta} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Desconto" valor={desconto} aoMudar={setDesconto} erro={erros.desconto} />
            </View>
          </View>
          {enc.dias > 0 && (enc.multa > 0 || enc.juros > 0) && (
            <Text style={estilos.nota}>
              Atraso de {enc.dias} {enc.dias === 1 ? 'dia' : 'dias'}: pelo título, multa {formatarMoeda(enc.multa)} e juros {formatarMoeda(enc.juros)}.{' '}
              {Math.abs(enc.multa - n(multa)) > 0.004 || Math.abs(enc.juros - n(juros)) > 0.004 ? (
                <Text style={estilos.link} onPress={recalcularEncargos}>
                  Usar esses valores
                </Text>
              ) : null}
            </Text>
          )}
          {enc.dias > 0 && t.multa_perc == null && t.juros_mes_perc == null && <Text style={estilos.nota}>Atraso de {enc.dias} {enc.dias === 1 ? 'dia' : 'dias'}: se {tx.receber ? 'recebeu' : 'pagou'} juros ou multa, informe acima (o título não tem os percentuais).</Text>}
          <View style={estilos.total}>
            <Text style={estilos.totalRotulo}>{tx.receber ? 'Total que entrou na conta' : 'Total que saiu da conta'}</Text>
            <Text style={estilos.totalValor}>{formatarMoeda(totalPago)}</Text>
          </View>
          <SeletorLista rotulo={tx.receber ? 'Entrou em qual conta / caixa *' : 'Saiu de qual conta / caixa *'} valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} erro={erros.banco} vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />
          {parcial && (
            <>
              <Text style={estilos.alerta}>{tx.Pagamento} parcial: fica saldo de {formatarMoeda(r2(saldo - princ))} neste título.</Text>
              <CampoData rotulo="Novo vencimento do saldo (em branco = mantém)" valor={novoVenc} aoMudar={setNovoVenc} erro={erros.novoVenc} />
            </>
          )}
          <Campo rotulo="Autenticação / nº do comprovante" value={autent} onChangeText={setAutent} autoCapitalize="characters" />
          <Campo rotulo="Observações" value={obs} onChangeText={setObs} multiline style={{ minHeight: 60, paddingTop: 12, textAlignVertical: 'top' }} />
          {!dono && <Text style={estilos.nota}>O {tx.pagamento} fica aguardando a confirmação do Master. O saldo do banco só muda depois dela.</Text>}
          <Botao titulo={tx.Pago} onPress={pagar} carregando={salvando} />
        </>
      )}

      {/* ---------- pagamentos já lançados ---------- */}
      {baixas.length > 0 && <Secao titulo={`${tx.Pagamentos} deste título`} />}
      {baixas.map((b) => {
        const viva = b.situacao === 'pendente' || b.situacao === 'confirmada';
        const podeEstornar = viva && (dono || (b.situacao === 'pendente' && b.created_by === eu));
        const extras = [Number(b.juros) ? `juros ${formatarMoeda(Number(b.juros))}` : null, Number(b.multa) ? `multa ${formatarMoeda(Number(b.multa))}` : null, Number(b.desconto) ? `desconto ${formatarMoeda(Number(b.desconto))}` : null].filter(Boolean);
        return (
          <View key={b.id} style={[estilos.baixa, !viva && { opacity: 0.7 }]}>
            <View style={estilos.entre}>
              <Text style={estilos.baixaData}>{doBanco(b.data)}</Text>
              <Text style={[estilos.baixaValor, !viva && { textDecorationLine: 'line-through' }]}>{formatarMoeda(Number(b.valor_pago))}</Text>
            </View>
            <Text style={estilos.nota}>
              {[um(b.banco)?.nome, extras.length ? `do título ${formatarMoeda(Number(b.valor_principal))}, ${extras.join(', ')}` : null, b.autenticacao ? `aut. ${b.autenticacao}` : null].filter(Boolean).join(' · ')}
            </Text>
            <Text style={[estilos.baixaSit, b.situacao === 'pendente' && { color: cores.cafe }, !viva && { color: cores.erro }]}>
              {ROTULO_BAIXA[b.situacao] ?? b.situacao}
              {b.motivo ? `: ${b.motivo}` : ''}
            </Text>
            {b.observacoes ? <Text style={estilos.nota}>{b.observacoes}</Text> : null}
            {b.arquivo_comprovante ? (
              <Text style={estilos.link} onPress={async () => !(await abrirFotoDocumento(b.arquivo_comprovante)) && setErro('Não foi possível abrir o comprovante.')}>
                📷 Ver o comprovante
              </Text>
            ) : null}
            {acao?.id === b.id ? (
              <>
                <Campo rotulo={acao!.tipo === 'estornar' ? 'Motivo do estorno *' : 'Motivo da rejeição'} value={motivo} onChangeText={setMotivo} autoCapitalize="sentences" />
                <View style={estilos.linha}>
                  <View style={{ flex: 1 }}>
                    <Botao titulo="Voltar" tipo="secundario" onPress={() => { setAcao(null); setMotivo(''); }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Botao titulo={acao!.tipo === 'estornar' ? 'Estornar' : 'Rejeitar'} tipo="perigo" onPress={() => (acao!.tipo === 'estornar' ? estornar(b) : confirmar(b, false))} />
                  </View>
                </View>
              </>
            ) : (
              <>
                {b.situacao === 'pendente' && dono && (
                  <View style={estilos.linha}>
                    <View style={{ flex: 1 }}>
                      <Botao titulo="Confirmar" onPress={() => confirmar(b, true)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Botao titulo="Rejeitar" tipo="secundario" onPress={() => { setAcao({ id: b.id, tipo: 'rejeitar' }); setMotivo(''); }} />
                    </View>
                  </View>
                )}
                {podeEstornar && !(b.situacao === 'pendente' && dono) && (
                  <Text style={[estilos.link, { color: cores.erro }]} onPress={() => { setAcao({ id: b.id, tipo: 'estornar' }); setMotivo(''); }}>
                    {b.situacao === 'pendente' ? `Desfazer este ${tx.pagamento}` : `Estornar este ${tx.pagamento}`}
                  </Text>
                )}
              </>
            )}
          </View>
        );
      })}
      {!aberto && baixas.length === 0 && <Text style={estilos.nota}>{ROTULO_SITUACAO[t.situacao]}.</Text>}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 6 },
  descricao: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  valor: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto },
  saldo: { fontSize: tam.subtitulo + 4, fontWeight: '800', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  alerta: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '700', lineHeight: 20 },
  codigo: { fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  totalRotulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  totalValor: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
  baixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  baixaData: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  baixaValor: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  baixaSit: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.sucesso },
});
