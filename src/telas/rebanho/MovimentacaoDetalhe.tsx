import React, { useEffect, useLayoutEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Secao from '../../componentes/Secao';
import CampoData from '../../componentes/CampoData';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, paraBanco } from '../../lib/datas';
import { abrirFotoDocumento } from '../../lib/documentos';
import { formatarNumero, formatarMoeda } from '../../lib/formatos';
import { codigoLote, identAnimal } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ENTRADAS, ROTULO_MOV } from '../../lib/movimentacoes';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const MOSTRAR = 100;

/** Uma movimentação: dados, animais envolvidos e o botão de desfazer. */
export default function MovimentacaoDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'MovimentacaoDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [m, setM] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [fiscal, setFiscal] = useState(false);
  // V182: parceria (contrato, contas a receber, acerto do rendimento)
  const [par, setPar] = useState<any>(null);
  const [titulos, setTitulos] = useState<any[]>([]);
  const [acerto, setAcerto] = useState<any>(null);
  const [novaPrev, setNovaPrev] = useState('');
  const [alterando, setAlterando] = useState(false);
  const [avisoPar, setAvisoPar] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('estoque_fiscal_lanc').select('id').eq('movimentacao_id', params.id).limit(1).then(({ data }) => setFiscal(!!data?.length));
  }, [params.id]);

  useEffect(() => {
    consulta<any>(
      supabase
        .from('movimentacoes')
        .select(
          '*, origem:lotes!movimentacoes_lote_origem_id_fkey ( numero, descricao ), destino:lotes!movimentacoes_lote_destino_id_fkey ( numero, descricao ),' +
            ' manga_origem:areas!movimentacoes_manga_origem_id_fkey ( nome ), manga_destino:areas!movimentacoes_manga_destino_id_fkey ( nome ),' +
            ' pessoa:pessoas ( nome ), pesagem:pesagens ( id, numero ), compra:compras ( id, numero, valor_total ), venda:vendas ( id, numero, valor_total ), itens:movimentacao_itens ( id, peso_kg, animal:animais ( id, numero_interno, brinco, nome, categoria, situacao ) )',
        )
        .eq('id', params.id)
        .single(),
    )
      .then(setM)
      .catch((e) => setErro(traduzirErro(e)));
  }, [params.id]);

  async function carregarParceria(mov: any) {
    if (!['entrada_parceria', 'saida_parceria'].includes(mov.tipo)) return;
    const q = supabase.from('parcerias').select('*, pessoa:pessoas ( nome )');
    const { data: lp } =
      mov.tipo === 'entrada_parceria' ? await q.eq('mov_entrada_id', mov.id).limit(1) : mov.parceria_id ? await q.eq('id', mov.parceria_id).limit(1) : { data: [] as any[] };
    const pc: any = lp?.[0] ?? null;
    setPar(pc);
    if (!pc) return;
    setNovaPrev(pc.data_prevista ? doBanco(pc.data_prevista) : '');
    const { data: tl } = await supabase
      .from('lancamentos')
      .select('id, numero, tipo, descricao, valor, valor_pago, data_vencimento, situacao, parceria_acerto_id')
      .eq('parceria_id', pc.id)
      .order('data_vencimento');
    if (mov.tipo === 'saida_parceria') {
      const { data: la } = await supabase.from('parceria_acertos').select('*, compra:compras ( id, numero )').eq('mov_saida_id', mov.id).limit(1);
      const a: any = la?.[0] ?? null;
      setAcerto(a);
      setTitulos((tl ?? []).filter((t: any) => a && t.parceria_acerto_id === a.id));
    } else setTitulos((tl ?? []).filter((t: any) => !t.parceria_acerto_id));
  }

  useEffect(() => {
    if (m) carregarParceria(m).catch((e) => setErro(traduzirErro(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);

  async function alterarPrevista() {
    setErro(null);
    setAvisoPar(null);
    if (!dataValida(novaPrev)) return setErro('Informe a nova data prevista para sair.');
    setAlterando(true);
    const { data: r, error } = await supabase.rpc('parceria_alterar_prevista', { p_id: par.id, p_data: paraBanco(novaPrev) });
    setAlterando(false);
    if (error) return setErro(traduzirErro(error));
    const x = r as { titulos: number; total: number };
    setAvisoPar(`Data prevista alterada para ${novaPrev}. Contas a receber refeito: ${x.titulos} ${x.titulos === 1 ? 'título' : 'títulos'}, ${formatarMoeda(Number(x.total))} no total (os já recebidos ficam como estão).`);
    await carregarParceria(m);
  }

  useLayoutEffect(() => {
    if (m) navegacao.setOptions({ title: ROTULO_MOV[m.tipo] ?? 'Movimentação' });
  }, [navegacao, m]);

  function excluir() {
    const entrada = ENTRADAS.includes(m.tipo);
    Alert.alert(
      'Excluir e desfazer',
      entrada
        ? 'Os animais criados por este lançamento serão apagados. Só é possível se eles ainda não tiveram outros lançamentos (pesagem, vacina, saída...).' +
          (m.compra_id ? ' A compra e o contas a pagar dela também são apagados.' : '') +
          (m.tipo === 'entrada_parceria' ? ' A parceria e o contas a receber dela também são apagados.' : '')
        : m.tipo === 'transferencia_manga'
          ? 'O lote volta para a manga de antes.'
          : m.tipo === 'transferencia_lote'
            ? 'Os animais voltam para o lote de origem.'
            : 'Os animais voltam para o rebanho, no mesmo lote.' +
              (m.tipo === 'saida_parceria' && m.parceria_id ? ' O acerto da parceria (contas a receber, cabeças recebidas) também é desfeito, e o apascentamento é recalculado.' : ''),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setErro(null);
            setExcluindo(true);
            const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_movimentacao', { p_id: m.id }), 'movimentacao', String(m.id));
            setExcluindo(false);
            if (error) setErro(traduzirErro(error));
            else navegacao.goBack();
          },
        },
      ],
    );
  }

  if (!m) {
    return (
      <Tela rolar={false}>
        {erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />}
      </Tela>
    );
  }

  const o = um(m.origem);
  const d = um(m.destino);
  const itens = (m.itens ?? []).map((i: any) => ({ ...i, animal: um(i.animal) })).sort((a: any, b: any) => (a.animal?.numero_interno ?? 0) - (b.animal?.numero_interno ?? 0));
  const pesoTotal = itens.reduce((s: number, i: any) => s + Number(i.peso_kg ?? 0), 0);
  const linhas: [string, string | null][] = [
    ['Data', doBanco(m.data)],
    ['Lote de origem', o ? codigoLote(o.numero, sigla) + (o.descricao ? ` – ${o.descricao}` : '') : null],
    ['Lote de destino', d ? codigoLote(d.numero, sigla) + (d.descricao ? ` – ${d.descricao}` : '') : null],
    ['Manga', m.tipo === 'transferencia_manga' ? `${um(m.manga_origem)?.nome ?? 'sem manga'} → ${um(m.manga_destino)?.nome ?? ''}` : null],
    ['Cabeças', itens.length ? formatarNumero(itens.length) : null],
    ['Peso total', pesoTotal > 0 ? `${formatarNumero(pesoTotal, 2)} kg (média ${formatarNumero(pesoTotal / itens.length, 1)} kg)` : null],
    ['Pesagem', um(m.pesagem) ? `nº ${um(m.pesagem).numero}` : null],
    ['Pessoa', um(m.pessoa)?.nome ?? null],
    // V181: documentos separados (NF, GTA, outro); os antigos ficam no campo Documento
    ['Nota fiscal', m.nf_numero ?? null],
    ['GTA', m.gta_numero ?? null],
    ['Outro documento', m.outro_documento ?? null],
    ['Documento', m.nf_numero || m.gta_numero || m.outro_documento ? null : m.documento],
    ['Estoque de gado', m.nf_numero || m.gta_numero ? (fiscal ? 'Lançado por esta movimentação' : 'Contado pela GTA emitida em Mais › GTA (ou animais sem idade)') : 'Não entra (sem NF nem GTA)'],
    ['Observações', m.observacoes],
  ];

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={estilos.cartao}>
        {linhas
          .filter(([, v]) => v)
          .map(([r, v]) => (
            <View key={r} style={estilos.par}>
              <Text style={estilos.rotulo}>{r}</Text>
              <Text style={estilos.valor}>{v}</Text>
            </View>
          ))}
      </View>
      {[
        ['da NF', m.foto_nf],
        ['da GTA', m.foto_gta],
        ['do outro documento', m.foto_outro],
      ]
        .filter(([, c]) => c)
        .map(([r, c]) => (
          <Botao key={r} titulo={`📷  Ver a foto ${r}`} tipo="secundario" onPress={async () => !(await abrirFotoDocumento(c)) && setErro('Não foi possível abrir a foto.')} />
        ))}

      {itens.length > 0 && (
        <>
          <Secao titulo="Animais" />
          <Lista>
            {itens.slice(0, MOSTRAR).map((i: any) => (
              <Linha
                key={i.id}
                titulo={[identAnimal(i.animal ?? {}), i.animal?.nome].filter(Boolean).join('  ')}
                linhas={[i.animal?.categoria, i.peso_kg ? `${formatarNumero(i.peso_kg, 1)} kg` : null]}
                onPress={() => i.animal && navegacao.navigate('AnimalForm', { id: i.animal.id })}
              />
            ))}
          </Lista>
          {itens.length > MOSTRAR && <Text style={estilos.nota}>Mostrando {MOSTRAR} de {itens.length} animais.</Text>}
        </>
      )}

      {/* ----- V182: parceria ----- */}
      {par && (
        <>
          <Secao titulo={`Parceria nº ${par.numero}`} />
          {avisoPar && <Aviso tipo="sucesso" texto={avisoPar} />}
          <View style={estilos.cartao}>
            {(
              [
                ['Condição', par.modalidade === 'apascentamento' ? 'Apascentamento' : 'Por rendimento'],
                ['Parceiro', um(par.pessoa)?.nome ?? null],
                ['Data de entrada', doBanco(par.data_entrada)],
                ['Data prevista para sair', par.data_prevista ? doBanco(par.data_prevista) : null],
                ['Preço por cabeça', par.preco_cab_mes != null ? `${formatarMoeda(Number(par.preco_cab_mes))} por mês` : null],
                ['Cabeças na entrada', formatarNumero(par.cabecas_entrada)],
                ['Peso de entrada', par.peso_entrada_kg ? `${formatarNumero(Number(par.peso_entrada_kg), 2)} kg (${formatarNumero(Number(par.peso_entrada_kg) / par.cabecas_entrada, 2)} kg por cabeça)` : null],
                ['Participações', par.modalidade === 'rendimento' ? `Fazenda ${formatarNumero(Number(par.perc_fazenda), 2)}% · Parceiro ${formatarNumero(Number(par.perc_parceiro), 2)}% · arroba de ${formatarNumero(Number(par.kg_arroba), 2)} kg` : null],
                ['Situação', par.situacao === 'aberta' ? 'Aberta' : `Encerrada em ${doBanco(par.data_saida)}`],
              ] as [string, string | null][]
            )
              .filter(([, v]) => v)
              .map(([r, v]) => (
                <View key={r} style={estilos.par}>
                  <Text style={estilos.rotulo}>{r}</Text>
                  <Text style={estilos.valor}>{v}</Text>
                </View>
              ))}
          </View>

          {acerto && (
            <View style={estilos.cartao}>
              <Text style={[estilos.valor, { color: cores.primariaEscura }]}>Acerto do rendimento</Text>
              {(
                [
                  ['Cabeças', formatarNumero(acerto.cabecas)],
                  ['Peso de entrada → saída', `${formatarNumero(Number(acerto.peso_entrada_kg), 2)} kg → ${formatarNumero(Number(acerto.peso_saida_kg), 2)} kg`],
                  ['Arrobas ganhas', `${formatarNumero(Number(acerto.ganho_arrobas), 2)} @`],
                  ['Da fazenda', `${formatarNumero(Number(acerto.arrobas_fazenda), 2)} @ (${formatarNumero(Number(acerto.perc_fazenda), 2)}%) × ${formatarMoeda(Number(acerto.preco_arroba))}`],
                  ['Valor do rendimento', formatarMoeda(Number(acerto.valor))],
                  [
                    'Recebido',
                    acerto.forma === 'cabecas'
                      ? `Em ${acerto.cab_fazenda} ${acerto.cab_fazenda === 1 ? 'cabeça' : 'cabeças'} de ${formatarMoeda(Number(acerto.valor_cab))}` +
                        (Math.abs(Number(acerto.diferenca)) > 0.009 ? ` · diferença ${formatarMoeda(Number(acerto.diferenca))}` : '')
                      : 'Em R$ (contas a receber)',
                  ],
                ] as [string, string][]
              ).map(([r, v]) => (
                <View key={r} style={estilos.par}>
                  <Text style={estilos.rotulo}>{r}</Text>
                  <Text style={estilos.valor}>{v}</Text>
                </View>
              ))}
              {um(acerto.compra) && (
                <Botao titulo={`Ver a compra nº ${um(acerto.compra).numero} (cabeças no estoque)`} tipo="secundario" onPress={() => navegacao.navigate('CompraDetalhe', { id: um(acerto.compra).id })} />
              )}
            </View>
          )}

          {titulos.length > 0 && (
            <>
              <Text style={estilos.subtitulo}>
                {m.tipo === 'entrada_parceria' ? 'Contas a receber do apascentamento' : 'Lançado no financeiro'} · {formatarMoeda(titulos.reduce((s, t) => s + Number(t.valor), 0))}
              </Text>
              <Lista>
                {titulos.map((t) => (
                  <Linha
                    key={t.id}
                    titulo={`${doBanco(t.data_vencimento)} · ${formatarMoeda(Number(t.valor))}`}
                    linhas={[t.descricao, `Título nº ${t.numero} · ${t.tipo === 'pagar' ? 'a pagar' : 'a receber'} · ${t.situacao === 'pago' ? 'quitado' : t.situacao === 'parcial' ? 'parcial' : 'em aberto'}`]}
                    onPress={() => navegacao.navigate('TituloDetalhe', { id: t.id })}
                  />
                ))}
              </Lista>
            </>
          )}

          {m.tipo === 'entrada_parceria' && par.situacao === 'aberta' && (
            <View style={estilos.cartao}>
              <CampoData rotulo="Alterar a data prevista para sair" valor={novaPrev} aoMudar={setNovaPrev} />
              <Botao titulo="Gravar nova data" tipo="secundario" onPress={alterarPrevista} carregando={alterando} />
              <Text style={estilos.notaEsq}>
                {par.modalidade === 'apascentamento'
                  ? 'Os meses em aberto são refeitos até a nova data (os que já têm recebimento ficam como estão).'
                  : 'Na parceria por rendimento a data é só referência; o acerto é feito na saída.'}
              </Text>
            </View>
          )}
        </>
      )}

      {um(m.compra) && (
        <Botao titulo={`Ver a compra nº ${um(m.compra).numero} (${formatarMoeda(Number(um(m.compra).valor_total))})`} tipo="secundario" onPress={() => navegacao.navigate('CompraDetalhe', { id: um(m.compra).id })} />
      )}
      {um(m.venda) && (
        <>
          <Botao titulo={`Ver a venda nº ${um(m.venda).numero} (${formatarMoeda(Number(um(m.venda).valor_total))})`} tipo="secundario" onPress={() => navegacao.navigate('VendaDetalhe', { id: um(m.venda).id })} />
          <Text style={estilos.nota}>Esta saída veio de uma venda: para desfazer, exclua a venda em Mais › Vendas.</Text>
        </>
      )}
      {um(m.pesagem) && (
        <Botao titulo={`Abrir pesagem nº ${um(m.pesagem).numero}`} tipo="secundario" onPress={() => navegacao.navigate('PesagemDetalhe', { id: um(m.pesagem).id })} />
      )}
      {/* V163: compra, venda, parceria e transferência de gado viajam com GTA */}
      {['compra', 'venda', 'entrada_parceria', 'saida_parceria', 'transferencia_saida', 'transferencia_entrada'].includes(m.tipo) && (
        <Botao titulo="Preparar a GTA" tipo="secundario" onPress={() => navegacao.navigate('GtaForm', { movimentacaoId: m.id })} />
      )}
      <Botao titulo="Excluir e desfazer" tipo="perigo" onPress={excluir} carregando={excluindo} />
      <Text style={estilos.nota}>Só dá para desfazer se os animais não tiveram movimentação depois desta. Se tiveram, desfaça primeiro as mais recentes.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 10 },
  par: { gap: 2 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  valor: { fontSize: tam.texto, color: cores.texto, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
  notaEsq: { fontSize: tam.pequeno, color: cores.textoSuave },
  subtitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
});
