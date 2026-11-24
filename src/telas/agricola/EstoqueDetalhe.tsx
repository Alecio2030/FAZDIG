import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Secao from '../../componentes/Secao';
import EstoqueInicial from '../../componentes/EstoqueInicial';
import { useSessao } from '../../contexto/SessaoContext';
import { TODAS, nomeUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarQtd } from '../../lib/formatos';
import { ROTULO_CATEGORIA_INSUMO, custosDe, saldoDe, textoSaldo, textoUnidades } from '../../lib/insumos';
import { linhaCompraDoProduto, ultimasComprasDosProdutos } from '../../lib/ultimasCompras';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** De onde veio o movimento (pelo lançamento de origem gravado nele). */
function origem(m: any): string {
  if (m.compra_id || m.compra_item_id) return 'Compra';
  if (m.atividade_id) return 'Atividade';
  if (m.sanidade_id || m.sanidade_item_id || m.sanidade_reforco_id) return 'Sanidade';
  if (m.frota_abastecimento_id) return 'Abastecimento';
  if (m.frota_manutencao_id) return 'Manutenção';
  if (m.transferencia_id) return 'Transferência';
  if (m.venda_id) return 'Venda';
  if (m.trato_id || m.trato_dia_id) return 'Trato do dia';
  if (m.tipo === 'ajuste') return 'Ajuste';
  return m.tipo === 'entrada' ? 'Estoque inicial / entrada avulsa' : 'Saída avulsa';
}

const MOSTRAR = 30;

/** V179 – Estoque de um produto numa fazenda: saldo, custos, últimas compras, entradas e saídas e o estoque inicial. */
export default function EstoqueDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'EstoqueDetalhe'>>();
  const { fazendas } = useSessao();
  // V180: fazendaId = 'todas' mostra o estoque somado de todas as fazendas
  const todas = params.fazendaId === TODAS;
  const fazLista = (fazendas ?? []).filter((f) => f.tipo !== 'particular');
  const ids = todas ? fazLista.map((f) => f.id) : [params.fazendaId];
  const chaveIds = ids.join(',');
  const faz = (fazendas ?? []).find((f) => f.id === params.fazendaId);
  const fazNome = todas ? 'todas as fazendas' : faz?.nome ?? 'Fazenda';
  const [insumo, setInsumo] = useState<any>(null);
  const [movs, setMovs] = useState<any[] | null>(null);
  const [compras, setCompras] = useState<any[]>([]);
  const [todos, setTodos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [i, ms, cs] = await Promise.all([
        consulta<any>(supabase.from('insumos').select('*').eq('id', params.insumoId).single()),
        consulta<any[]>(supabase.from('estoque_movimentos').select('*').eq('insumo_id', params.insumoId).in('fazenda_id', ids).order('data', { ascending: false }).limit(2000)),
        ultimasComprasDosProdutos([params.insumoId]),
      ]);
      setInsumo(i);
      setMovs(ms);
      setCompras((cs[params.insumoId] ?? []).filter((c: any) => !c.fazenda_id || ids.includes(c.fazenda_id)));
    } catch (e) {
      setErro(traduzirErro(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.insumoId, chaveIds]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  useLayoutEffect(() => {
    navegacao.setOptions({ title: insumo ? insumo.nome : 'Estoque do produto' });
  }, [navegacao, insumo]);

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!insumo || movs === null) return <Tela><ActivityIndicator color={cores.primaria} style={{ marginTop: 24 }} /></Tela>;

  const saldo = saldoDe(movs);
  const custos = custosDe(movs);
  const minimo = insumo.estoque_minimo != null ? Number(insumo.estoque_minimo) : null;
  const entradas = movs.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + Number(m.quantidade), 0);
  const saidas = movs.filter((m) => m.tipo === 'saida').reduce((s, m) => s + Number(m.quantidade), 0);
  const lista = todos ? movs : movs.slice(0, MOSTRAR);

  return (
    <Tela>
      <View style={estilos.quadro}>
        <Text style={estilos.titulo}>{insumo.codigo != null ? `${insumo.codigo} · ${insumo.nome}` : insumo.nome}</Text>
        <Text style={estilos.nota}>{ROTULO_CATEGORIA_INSUMO[insumo.categoria] ?? insumo.categoria} · {textoUnidades(insumo)}</Text>
        <Text style={estilos.saldo}>{todas ? 'Estoque total' : `Estoque em ${fazNome}`}: {textoSaldo(saldo, insumo)}</Text>
        {todas &&
          fazLista
            .filter((f) => movs.some((m) => m.fazenda_id === f.id))
            .map((f) => (
              <Text key={f.id} style={estilos.nota}>
                {f.nome}: {textoSaldo(saldoDe(movs.filter((m) => m.fazenda_id === f.id)), insumo)}
              </Text>
            ))}
        {minimo != null && (
          <Text style={[estilos.nota, saldo <= minimo && { color: cores.erro, fontWeight: '700' }]}>
            Mínimo {formatarQtd(minimo)} {insumo.unidade}{saldo <= minimo ? ' — abaixo do mínimo: repor' : ''}
          </Text>
        )}
        {custos.medio != null && (
          <Text style={estilos.nota}>
            Custo médio {formatarMoeda(custos.medio)} por {insumo.unidade} · último {formatarMoeda(custos.ultimo)} · saldo em valor {formatarMoeda(saldo * custos.medio)}
          </Text>
        )}
        <Text style={estilos.nota}>
          Entradas {formatarQtd(entradas)} · saídas {formatarQtd(saidas)} {insumo.unidade}
        </Text>
      </View>

      <Secao titulo={compras.length === 1 ? 'Última compra' : 'Últimas compras'} />
      {compras.length ? (
        compras.map((c, k) => <Text key={k} style={estilos.nota}>{linhaCompraDoProduto(c, insumo.conteudo_medida, todas ? nomeUnidade(c.fazenda_id, fazendas ?? []) : undefined)}</Text>)
      ) : (
        <Text style={estilos.nota}>Nenhuma compra registrada {todas ? 'nas fazendas' : 'nesta fazenda'}.</Text>
      )}

      <Secao titulo="Entradas e saídas" />
      {movs.length === 0 ? (
        <Text style={estilos.nota}>Nenhum movimento deste produto em {fazNome}.</Text>
      ) : (
        <Lista>
          {lista.map((m) => {
            const q = Number(m.quantidade);
            const sinal = m.tipo === 'saida' ? '−' : '+';
            return (
              <Linha
                key={m.id}
                titulo={`${doBanco(m.data)} · ${origem(m)}${todas ? ` · ${nomeUnidade(m.fazenda_id, fazendas ?? [])}` : ''}`}
                linhas={[Number(m.valor_unitario) > 0 ? `${formatarMoeda(Number(m.valor_unitario))} por ${insumo.unidade}` : null, m.observacoes]}
                direita={`${sinal} ${formatarQtd(Math.abs(q))} ${insumo.unidade}`}
                onPress={() => {}}
              />
            );
          })}
        </Lista>
      )}
      {!todos && movs.length > MOSTRAR && <Botao titulo={`Ver todos os ${movs.length} movimentos`} tipo="secundario" onPress={() => setTodos(true)} />}

      {todas ? (
        <Text style={estilos.nota}>O estoque inicial é lançado por fazenda: volte e escolha a fazenda.</Text>
      ) : (
        <EstoqueInicial insumoId={insumo.id} fazendaId={params.fazendaId} fazendaNome={fazNome} unidade={insumo.unidade} aoMudar={carregar} />
      )}

      <Botao titulo="Abrir o cadastro do produto" tipo="secundario" onPress={() => navegacao.navigate('InsumoForm', { id: insumo.id })} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 4 },
  titulo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura },
  saldo: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
});
