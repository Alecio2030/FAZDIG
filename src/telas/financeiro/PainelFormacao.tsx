import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Secao from '../../componentes/Secao';
import RateioCentros, { rateioInicial, validarRateio, type LinhaRateio } from '../../componentes/RateioCentros';
import type { ItemLista } from '../../componentes/SeletorLista';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, lerNumero, moedaParaCampo } from '../../lib/formatos';
import { CATEGORIAS_IMOB } from '../../lib/imobilizado';
import { PARTES_FORMACAO, custoFormacao, type CustoFormacao } from '../../lib/formacao';
import { centroDaUnidade } from '../../lib/unidades';
import { cores, tam } from '../../tema';

const n = (t: string) => lerNumero(t);

/**
 * V152: o bem em formação dentro do Imobilizado.
 * Mostra o centro de custo da formação e o custo acumulado (por origem), e conclui a formação:
 * na data de início da operação o bem é ativado com o custo, começa a depreciação/exaustão e,
 * na lavoura sem talhão, o talhão é criado. Depois de concluído, mostra o resumo e permite reabrir.
 */
export default function PainelFormacao({ bem, aoMudar, aoErro }: { bem: any; aoMudar: (aviso: string) => void; aoErro: (e: string) => void }) {
  const emFormacao = bem.situacao === 'formacao';
  const lavoura = bem.metodo === 'exaustao';
  const [centro, setCentro] = useState<string | null>(null);
  const [custo, setCusto] = useState<CustoFormacao | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [data, setData] = useState(hojeBR());
  const [valor, setValor] = useState('');
  const [valorMexido, setValorMexido] = useState(false);
  const [vida, setVida] = useState(String(CATEGORIAS_IMOB.find((c) => c.valor === bem.categoria)?.vida ?? ''));
  const [residual, setResidual] = useState('');
  const [rateio, setRateio] = useState<LinhaRateio[]>(rateioInicial());
  const [talhaoNome, setTalhaoNome] = useState(String(bem.nome ?? '').replace(/^lavoura( de)?\s*(caf[ée]\s*\w*)?\s*[–-]?\s*/i, '').trim() || bem.nome);
  const [talhaoHa, setTalhaoHa] = useState('');
  const [plantas, setPlantas] = useState('');
  const [especie, setEspecie] = useState(bem.categoria === 'cafe' ? 'Café Conilon' : '');
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!bem.formacao_centro_id) return setCentro(null);
    supabase
      .from('centros_custo')
      .select('codigo, nome')
      .eq('id', bem.formacao_centro_id)
      .maybeSingle()
      .then(({ data: c }) => setCentro(c ? `${c.codigo} ${c.nome}` : null));
  }, [bem.formacao_centro_id]);

  // custo acumulado até a data informada (em formação) ou até o início da operação (concluído)
  const dataIso = dataValida(data) ? paraBanco(data) : null;
  useEffect(() => {
    if (!emFormacao) return;
    let vivo = true;
    setCalculando(true);
    custoFormacao(bem, dataIso ?? undefined)
      .then((c) => {
        if (!vivo) return;
        setCusto(c);
        if (!valorMexido) setValor(c.total > 0 ? moedaParaCampo(c.total) : '');
      })
      .catch((e) => aoErro(traduzirErro(e)))
      .finally(() => vivo && setCalculando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bem.id, emFormacao, dataIso]);

  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id, imobilizado_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, bem.fazenda_id) && c.id !== bem.formacao_centro_id).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [bem.fazenda_id, bem.formacao_centro_id]);

  function concluir() {
    const e: Record<string, string> = {};
    if (!dataIso) e.data = 'Informe a data de início da operação.';
    if (!(n(valor)! > 0)) e.valor = 'O custo da formação precisa ser maior que zero.';
    if (!(n(vida)! > 0)) e.vida = `Informe a vida útil (${lavoura ? 'safras' : 'anos'}).`;
    if (residual.trim() && (n(residual) == null || n(residual)! < 0 || n(residual)! >= 100)) e.residual = 'De 0 a 99%.';
    const rat = validarRateio(rateio, !(lavoura));
    if (rat.erro) e.rateio = rat.erro;
    if (lavoura && !bem.area_id && !talhaoNome.trim()) e.talhao = 'Informe o nome do talhão que será criado.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return aoErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);

    Alert.alert(
      'Concluir a formação',
      `A partir de ${data} o bem passa a "em uso" com ${formatarMoeda(n(valor)!)}, e começa a ${lavoura ? 'exaustão' : 'depreciação'}.` +
        `${lavoura && !bem.area_id ? ` O talhão "${talhaoNome.trim()}" será criado.` : ''} O centro da formação é encerrado. Confirma?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Concluir',
          onPress: async () => {
            setSalvando(true);
            const { data: r, error } = await supabase.rpc('concluir_formacao', {
              p: {
                id: bem.id,
                data: dataIso,
                valor: n(valor),
                vida_util: n(vida),
                residual_perc: n(residual) ?? 0,
                rateio: rat.rateio,
                talhao: lavoura && !bem.area_id ? { nome: talhaoNome.trim(), area_ha: n(talhaoHa), especie: especie.trim() || null, plantas_total: n(plantas) } : null,
                resumo: custo ? { ...custo, valor_ativado: n(valor) } : null,
              },
            });
            setSalvando(false);
            if (error) return aoErro(traduzirErro(error));
            const rr = r as any;
            aoMudar(
              `Formação concluída: bem nº ${rr.numero} em uso desde ${data}, com ${formatarMoeda(n(valor)!)}. A ${lavoura ? 'exaustão' : 'depreciação'} começa no mês seguinte.` +
                `${rr.area_criada ? ' O talhão foi criado (complete os dados em Agrícola › Talhões).' : ''} Daqui em diante os custos são de produção.`,
            );
          },
        },
      ],
    );
  }

  function reabrir() {
    Alert.alert('Reabrir a formação', 'O bem volta a "em formação": a depreciação/exaustão para e o centro da formação reabre. Use só se a data ou o valor foram lançados errados.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reabrir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('reabrir_formacao', { p_id: bem.id });
          if (error) return aoErro(traduzirErro(error));
          aoMudar('Formação reaberta: o bem voltou a "em formação".');
        },
      },
    ]);
  }

  // ---------- já concluída ----------
  if (!emFormacao) {
    const res = bem.formacao_resumo as CustoFormacao | null;
    return (
      <View style={estilos.caixa}>
        <Text style={estilos.titulo}>Bem formado no sistema</Text>
        <Text style={estilos.nota}>
          Formação de {doBanco(bem.formacao_inicio)} a {doBanco(bem.operacao_inicio)}
          {centro ? ` · centro ${centro} (encerrado)` : ''}.
        </Text>
        {res &&
          PARTES_FORMACAO.filter((p) => Number(res[p.chave]) > 0).map((p) => <Par key={p.chave} a={p.rotulo} b={formatarMoeda(Number(res[p.chave]))} />)}
        <Par a="Valor ativado" b={formatarMoeda(Number(bem.valor_aquisicao))} forte />
        <Botao titulo="Reabrir a formação (lançou errado)" tipo="texto" onPress={reabrir} />
      </View>
    );
  }

  // ---------- em formação ----------
  return (
    <>
      <Secao titulo="Em formação" />
      <View style={estilos.caixa}>
        <Text style={estilos.titulo}>Centro de custo da formação</Text>
        <Text style={estilos.centro}>{centro ?? '–'}</Text>
        <Text style={estilos.nota}>
          Escolha este centro nas Compras e Despesas, no Contas a pagar, nos Abastecimentos e nas Transferências.
          {lavoura ? (bem.area_id ? ' As Atividades lançadas no talhão do bem já vão sozinhas para ele.' : ' Ligue o bem a um talhão para as Atividades irem sozinhas para ele.') : ''}
        </Text>
      </View>

      <View style={estilos.caixa}>
        <Text style={estilos.titulo}>Custo acumulado{dataIso ? ` até ${data}` : ''}</Text>
        {calculando && !custo ? <ActivityIndicator color={cores.primaria} /> : null}
        {custo &&
          PARTES_FORMACAO.map((p) => <Par key={p.chave} a={p.rotulo} b={formatarMoeda(Number(custo[p.chave]))} apagado={!Number(custo[p.chave])} />)}
        {custo && <Par a="Total da formação" b={formatarMoeda(custo.total)} forte />}
        {custo && (
          <Text style={estilos.nota}>
            {custo.atividades} {custo.atividades === 1 ? 'atividade' : 'atividades'} · {custo.compras} {custo.compras === 1 ? 'compra/despesa' : 'compras/despesas'} · {custo.titulos}{' '}
            {custo.titulos === 1 ? 'título avulso' : 'títulos avulsos'}
          </Text>
        )}
      </View>

      <Secao titulo="Concluir a formação (início da operação)" />
      <CampoData rotulo="Data de início da operação *" valor={data} aoMudar={setData} erro={erros.data} />
      <CampoMoeda
        rotulo="Valor a ativar (R$) *"
        valor={valor}
        aoMudar={(t) => {
          setValor(t);
          setValorMexido(true);
        }}
        erro={erros.valor}
        ajuda="Vem do custo acumulado até a data. Pode corrigir, se precisar."
      />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo={`Vida útil (${lavoura ? 'safras' : 'anos'}) *`} value={vida} onChangeText={setVida} keyboardType="decimal-pad" erro={erros.vida} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Valor residual %" value={residual} onChangeText={setResidual} keyboardType="decimal-pad" placeholder="Ex.: 10" erro={erros.residual} />
        </View>
      </View>
      {n(valor)! > 0 && n(vida)! > 0 ? (
        <Text style={estilos.nota}>
          {lavoura ? 'Exaustão' : 'Depreciação'} mensal: {formatarMoeda(((n(valor)! * (1 - (n(residual) ?? 0) / 100)) / (n(vida)! * 12)))}
        </Text>
      ) : null}

      {lavoura && !bem.area_id && (
        <>
          <Text style={estilos.subtitulo}>Talhão que será criado</Text>
          <Campo rotulo="Nome do talhão *" value={talhaoNome} onChangeText={setTalhaoNome} autoCapitalize="sentences" erro={erros.talhao} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Área (ha)" value={talhaoHa} onChangeText={setTalhaoHa} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Plantas plantadas" value={plantas} onChangeText={setPlantas} keyboardType="number-pad" />
            </View>
          </View>
          <Campo rotulo="Cultura" value={especie} onChangeText={setEspecie} autoCapitalize="sentences" placeholder="Ex.: Café Conilon" />
        </>
      )}

      <Text style={estilos.subtitulo}>Quem recebe a {lavoura ? 'exaustão' : 'depreciação'} {lavoura ? '(opcional)' : '*'}</Text>
      <RateioCentros linhas={rateio} aoMudar={setRateio} carregar={carregarCentros} erro={erros.rateio} />
      {lavoura && <Text style={estilos.nota}>Em branco, vai para o centro do próprio talhão (ex.: 4.1.01-001): daí em diante é custo de produção.</Text>}

      <Botao titulo="Concluir a formação e ativar o bem" onPress={concluir} carregando={salvando} />
    </>
  );
}

function Par({ a, b, forte, apagado }: { a: string; b: string; forte?: boolean; apagado?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '700', color: cores.texto }, apagado && { opacity: 0.5 }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }, apagado && { opacity: 0.5 }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  titulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  subtitulo: { fontSize: tam.pequeno + 2, fontWeight: '800', color: cores.texto, marginTop: 4 },
  centro: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.cafe },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
});
