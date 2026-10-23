import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Botao from '../../componentes/Botao';
import { abrirFotoDocumento } from '../../lib/documentos';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { useSessao } from '../../contexto/SessaoContext';
import { nomeUnidade } from '../../lib/unidades';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero } from '../../lib/formatos';
import { ROTULO_CAT_IMOB, ROTULO_METODO, calcular, tabelaAnual, textoMes } from '../../lib/imobilizado';
import { PARTES_FORMACAO, custoFormacao, type CustoFormacao } from '../../lib/formacao';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const VAZIO = '–';

/** Um bem na Consulta: todos os dados, rateio e a tabela ano a ano. Só mostra. */
export default function ImobilizadoDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'ImobilizadoDetalhe'>>();
  const { fazendas } = useSessao();
  const [b, setB] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  // V152: bem em formação: custo acumulado e o centro de custo dele
  const [form, setForm] = useState<{ custo: CustoFormacao; centro: string | null } | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: b ? `Bem nº ${b.numero}` : 'Bem' });
  }, [navegacao, b]);

  useFocusEffect(
    useCallback(() => {
      consulta<any>(
        supabase
          .from('imobilizados')
          .select('*, pessoa:pessoas ( nome ), area:areas ( nome ), compra:compras ( numero ), rateio:imobilizado_rateios ( percentual, centro:centros_custo ( codigo, nome ) ), alocacoes:imobilizado_alocacoes ( data, de_fazenda_id, para_fazenda_id, observacoes )')
          .eq('id', params.id)
          .single(),
      )
        .then(async (x) => {
          setB(x);
          if (x.situacao === 'formacao' || x.formacao_centro_id) {
            const [custo, cc] = await Promise.all([
              x.situacao === 'formacao' ? custoFormacao(x) : Promise.resolve((x.formacao_resumo as CustoFormacao) ?? null),
              x.formacao_centro_id ? consulta<any>(supabase.from('centros_custo').select('codigo, nome').eq('id', x.formacao_centro_id).maybeSingle()) : Promise.resolve(null),
            ]);
            setForm(custo ? { custo, centro: cc ? `${cc.codigo} ${cc.nome}` : null } : null);
          } else setForm(null);
        })
        .catch((e) => setErro(traduzirErro(e)));
    }, [params.id]),
  );

  if (erro) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!b) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  if (b.situacao === 'formacao') {
    return (
      <Tela>
        <View style={estilos.cartao}>
          <Text style={estilos.nome}>{b.nome}</Text>
          <Text style={estilos.nota}>
            Nº {b.numero}
            {b.codigo_patrimonial ? ` · patrimônio ${b.codigo_patrimonial}` : ''} · {ROTULO_CAT_IMOB[b.categoria] ?? b.categoria}
          </Text>
          <Text style={estilos.valor}>{form ? formatarMoeda(form.custo.total) : '…'}</Text>
          <Text style={estilos.nota}>EM FORMAÇÃO desde {doBanco(b.formacao_inicio ?? b.data_ativacao)} · custo acumulado até hoje</Text>
        </View>
        <Dado rotulo="Centro de custo da formação" valor={form?.centro} />
        <Dado rotulo="Alocado em" valor={nomeUnidade(b.fazenda_id, fazendas)} />
        {b.metodo === 'exaustao' && <Dado rotulo="Talhão" valor={um(b.area)?.nome ?? 'criado ao concluir a formação'} />}
        <Secao titulo="Custo da formação por origem" />
        {form && PARTES_FORMACAO.map((p) => <Dado key={p.chave} rotulo={p.rotulo} valor={formatarMoeda(Number(form.custo[p.chave]))} />)}
        <Dado rotulo="Observações" valor={b.observacoes} />
        <Botao titulo="✏️  Alterar, excluir ou concluir a formação" tipo="secundario" onPress={() => navegacao.push('ImobilizadoForm', { abrirId: b.id })} />
      </Tela>
    );
  }

  const c = calcular(b, hojeBanco());
  const tabela = tabelaAnual(b);

  return (
    <Tela>
      <View style={estilos.cartao}>
        <Text style={estilos.nome}>{b.nome}</Text>
        <Text style={estilos.nota}>
          Nº {b.numero}
          {b.codigo_patrimonial ? ` · patrimônio ${b.codigo_patrimonial}` : ''} · {ROTULO_CAT_IMOB[b.categoria] ?? b.categoria}
        </Text>
        <Text style={estilos.valor}>{formatarMoeda(c.contabil)}</Text>
        <Text style={estilos.nota}>valor contábil hoje{b.situacao === 'baixado' ? ` · BAIXADO em ${doBanco(b.data_baixa)}` : c.encerrado ? ' · totalmente depreciado' : ''}</Text>
      </View>

      <Dado rotulo="Descrição" valor={b.descricao} />
      <Dado rotulo="Alocado em" valor={nomeUnidade(b.fazenda_id, fazendas)} />
      <Dado rotulo="Tipo" valor={ROTULO_METODO[b.metodo]} />
      {b.metodo === 'exaustao' && <Dado rotulo="Talhão / área" valor={um(b.area)?.nome} />}
      <Dado rotulo="Data de ativação" valor={doBanco(b.data_ativacao)} />
      <Dado rotulo="Valor de aquisição" valor={formatarMoeda(c.valor)} />
      <Dado rotulo="Vida útil" valor={`${formatarNumero(Number(b.vida_util))} ${b.vida_unidade}`} />
      <Dado rotulo="Valor residual" valor={`${formatarNumero(Number(b.residual_perc), 2)}% · ${formatarMoeda(c.residual)}`} />
      <Dado rotulo={`${ROTULO_METODO[b.metodo]} mensal`} valor={formatarMoeda(c.mensal)} />
      <Dado rotulo="Acumulado até hoje" valor={`${formatarMoeda(c.acumulado)} (${c.decorridos} de ${c.meses} meses)`} />
      <Dado rotulo="Termina em" valor={textoMes(c.fim)} />

      {b.operacao_inicio && form && (
        <>
          <Secao titulo="Formação" />
          <Dado rotulo="Período da formação" valor={`${doBanco(b.formacao_inicio)} a ${doBanco(b.operacao_inicio)}`} />
          <Dado rotulo="Centro da formação (encerrado)" valor={form.centro} />
          {PARTES_FORMACAO.filter((p) => Number(form.custo[p.chave]) > 0).map((p) => <Dado key={p.chave} rotulo={p.rotulo} valor={formatarMoeda(Number(form.custo[p.chave]))} />)}
        </>
      )}

      <Secao titulo="Rateio mensal por centro de custo" />
      {(b.rateio as any[]).map((r, k) => (
        <Dado key={k} rotulo={`${um(r.centro)?.codigo ?? ''} ${um(r.centro)?.nome ?? ''}`.trim()} valor={`${formatarNumero(Number(r.percentual), 2)}% · ${formatarMoeda((c.mensal * Number(r.percentual)) / 100)}/mês`} />
      ))}

      {((b.alocacoes as any[]) ?? []).length > 0 && (
        <>
          <Secao titulo="Transferências" />
          {(b.alocacoes as any[])
            .slice()
            .sort((x, y) => (x.data < y.data ? -1 : 1))
            .map((a, k) => (
              <Dado key={k} rotulo={doBanco(a.data)} valor={`${nomeUnidade(a.de_fazenda_id, fazendas)} → ${nomeUnidade(a.para_fazenda_id, fazendas)}${a.observacoes ? ` · ${a.observacoes}` : ''}`} />
            ))}
        </>
      )}

      <Secao titulo="Ano a ano" />
      <View style={estilos.tabela}>
        <View style={estilos.tr}>
          <Text style={[estilos.th, { width: 52 }]}>Ano</Text>
          <Text style={[estilos.th, estilos.num]}>{ROTULO_METODO[b.metodo]}</Text>
          <Text style={[estilos.th, estilos.num]}>Acumulado</Text>
          <Text style={[estilos.th, estilos.num]}>Contábil</Text>
        </View>
        {tabela.map((l) => (
          <View key={l.ano} style={estilos.tr}>
            <Text style={[estilos.td, { width: 52 }]}>{l.ano}</Text>
            <Text style={[estilos.td, estilos.num]}>{formatarNumero(l.quota, 2)}</Text>
            <Text style={[estilos.td, estilos.num]}>{formatarNumero(l.acumulado, 2)}</Text>
            <Text style={[estilos.td, estilos.num]}>{formatarNumero(l.contabil, 2)}</Text>
          </View>
        ))}
      </View>

      <Secao titulo="Origem" />
      <Dado rotulo="Fornecedor" valor={um(b.pessoa)?.nome} />
      <Dado rotulo="Documento" valor={b.documento} />
      <Dado rotulo="Compra" valor={um(b.compra)?.numero ? `nº ${um(b.compra).numero}` : null} />
      {b.chave_nfe ? <Dado rotulo="Chave da NF-e" valor={b.chave_nfe.replace(/(\d{4})(?=\d)/g, '$1 ')} /> : null}
      {b.arquivo_documento ? (
        <Botao
          titulo="📷  Ver a foto da nota"
          tipo="secundario"
          onPress={async () => {
            if (!(await abrirFotoDocumento(b.arquivo_documento))) setErro('Não foi possível abrir a foto da nota.');
          }}
        />
      ) : null}
      {b.situacao === 'baixado' && <Dado rotulo="Motivo da baixa" valor={b.motivo_baixa} />}
      <Dado rotulo="Observações" valor={b.observacoes} />
      <Botao titulo="✏️  Alterar ou excluir este bem" tipo="secundario" onPress={() => navegacao.push('ImobilizadoForm', { abrirId: b.id })} />
    </Tela>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || VAZIO}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  nome: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
  valor: { fontSize: tam.subtitulo + 6, fontWeight: '800', color: cores.cafe, marginTop: 6 },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
  tabela: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 8 },
  tr: { flexDirection: 'row', gap: 6, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: cores.borda },
  th: { fontSize: tam.pequeno, fontWeight: '800', color: cores.textoSuave },
  td: { fontSize: tam.pequeno, color: cores.texto },
  num: { flex: 1, textAlign: 'right' },
});
