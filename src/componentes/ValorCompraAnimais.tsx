import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import CampoMoeda from './CampoMoeda';
import CampoData from './CampoData';
import Escolha from './Escolha';
import Secao from './Secao';
import SeletorLista, { type ItemLista } from './SeletorLista';
import { consulta, supabase } from '../lib/supabase';
import { centroDaUnidade } from '../lib/unidades';
import { dataValida, doBanco, paraBanco } from '../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo } from '../lib/formatos';
import { somarDias } from '../lib/reproducao';
import { calcularVendaAnimais, r2v, textoFormaPreco, type FormaPreco } from '../lib/vendas';
import { cores, tam } from '../tema';

/** O que a tela de Movimentações lê deste quadro na hora de lançar: nada (sem preço), um erro, ou os dados da compra. */
export type ValorCompraRef = { obter: () => { erro?: string; dados?: Record<string, unknown> } };
type Props = { fazendaId?: string | null; cabecas: number; pesoBruto: number; /** data da compra, dd/mm/aaaa */ data: string };
type Parcela = { chave: string; venc: string; valor: string };

let cont = 0;
const chave = () => `c${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t);

/** Soma meses a uma data aaaa-mm-dd mantendo o dia (31 vira o último dia do mês, se o mês for menor). */
function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimo);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * V182 – Dados financeiros e condições de pagamento da compra de animais (fim da tela Movimentações › Compra).
 * Preço por arroba (kg da arroba e desconto de barriga), por kg vivo ou por cabeça; mostra preço, peso médio,
 * valor por cabeça e valor total. Pagamento à vista, com prazo em dias (30/60/90…) ou em data fixa (mesmo dia a cada mês),
 * com a quantidade de parcelas e a relação dos vencimentos e valores (editáveis). Gera a compra e o contas a pagar.
 * Preço em branco: só entram os animais, sem financeiro.
 */
const ValorCompraAnimais = forwardRef<ValorCompraRef, Props>(function ValorCompraAnimais({ fazendaId, cabecas, pesoBruto, data }, ref) {
  const [forma, setForma] = useState<string[]>(['arroba']);
  const [kgArroba, setKgArroba] = useState('30');
  const [barrigaTipo, setBarrigaTipo] = useState<string[]>(['nao']);
  const [barrigaValor, setBarrigaValor] = useState('');
  const [preco, setPreco] = useState('');
  const [centroId, setCentroId] = useState<string | null>(null);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [pagto, setPagto] = useState<string[]>(['avista']);
  const [nParc, setNParc] = useState('1');
  const [prazo1, setPrazo1] = useState('30');
  const [intervalo, setIntervalo] = useState('30');
  const [primeiro, setPrimeiro] = useState('');
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  const formaPreco = forma[0] as FormaPreco;
  const usaBarriga = formaPreco !== 'cabeca' && barrigaTipo[0] !== 'nao';
  const calc = calcularVendaAnimais({
    cabecas,
    pesoBruto,
    forma: formaPreco,
    kgArroba: n(kgArroba) ?? 0,
    barrigaTipo: usaBarriga ? (barrigaTipo[0] as 'perc' | 'kg_cab') : null,
    barrigaValor: n(barrigaValor) ?? 0,
    preco: n(preco) ?? 0,
  });
  const valor = cabecas > 0 ? calc.valor : 0;
  const somaParcelas = parcelas.reduce((s, x) => s + (n(x.valor) ?? 0), 0);
  const dataIso = paraBanco(data);

  // Monta os vencimentos e valores pelas condições escolhidas (depois ainda dá para mexer em cada parcela).
  useEffect(() => {
    if (valor <= 0) return setParcelas([]);
    if (pagto[0] === 'avista') return setParcelas([{ chave: chave(), venc: data, valor: moedaParaCampo(valor) }]);
    const q = Math.max(1, Math.min(120, Number(nParc) || 1));
    let vencs: string[] = [];
    if (pagto[0] === 'dias') {
      if (!dataIso) return;
      const p1 = Number(prazo1) || 0;
      const iv = Number(intervalo) || 30;
      vencs = Array.from({ length: q }, (_, i) => somarDias(dataIso, p1 + i * iv));
    } else {
      const base = paraBanco(primeiro);
      if (!base) return setParcelas([]);
      vencs = Array.from({ length: q }, (_, i) => somarMeses(base, i));
    }
    const cada = Math.floor((valor / q) * 100) / 100;
    const ultima = r2v(valor - cada * (q - 1));
    setParcelas(vencs.map((v, i) => ({ chave: chave(), venc: doBanco(v), valor: moedaParaCampo(i === q - 1 ? ultima : cada) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagto[0], nParc, prazo1, intervalo, primeiro, valor, data]);

  useImperativeHandle(
    ref,
    () => ({
      obter() {
        if (!preco.trim() || (n(preco) ?? 0) <= 0) return {}; // sem preço: só a entrada dos animais
        if (formaPreco !== 'cabeca' && pesoBruto <= 0) return { erro: `Para o preço por ${textoFormaPreco(formaPreco)}, informe o "Peso total (kg)" da compra.` };
        if (formaPreco === 'arroba' && (n(kgArroba) ?? 0) <= 0) return { erro: 'Informe os kg da arroba.' };
        if (usaBarriga && (n(barrigaValor) ?? 0) <= 0) return { erro: 'Informe o desconto de barriga, ou marque "Sem desconto".' };
        if (valor <= 0) return { erro: 'O valor da compra ficou zerado: confira as cabeças, o peso e o preço.' };
        if (pagto[0] === 'data' && !dataValida(primeiro)) return { erro: 'Condições de pagamento: informe a data do 1º vencimento.' };
        if (!parcelas.length || parcelas.some((p) => !dataValida(p.venc) || (n(p.valor) ?? 0) <= 0)) return { erro: 'Condições de pagamento: confira o vencimento e o valor de cada parcela.' };
        if (dataIso && parcelas.some((p) => (paraBanco(p.venc) ?? '') < dataIso)) return { erro: 'Condições de pagamento: há parcela com vencimento antes da data da compra.' };
        if (Math.abs(somaParcelas - valor) > 0.009) return { erro: `As parcelas somam ${formatarMoeda(somaParcelas)} e o valor da compra é ${formatarMoeda(valor)}.` };
        return {
          dados: {
            forma_preco: formaPreco,
            kg_arroba: n(kgArroba) ?? '',
            barriga_tipo: usaBarriga ? barrigaTipo[0] : '',
            barriga_valor: usaBarriga ? n(barrigaValor) : '',
            preco: n(preco),
            valor,
            conta_contabil_id: null, // classificação automática (compra de animais)
            centro_custo_id: centroId,
            conta_bancaria_id: bancoId,
            forma_pagamento: pagto[0] === 'avista' ? 'avista' : 'prazo',
            parcelas: parcelas.map((x) => ({ vencimento: paraBanco(x.venc), valor: n(x.valor) })),
          },
        };
      },
    }),
    [preco, formaPreco, pesoBruto, kgArroba, usaBarriga, barrigaTipo, barrigaValor, valor, parcelas, somaParcelas, centroId, bancoId, pagto, primeiro, dataIso],
  );

  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, fazendaId)).map((c) => ({ id: c.id, titulo: `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [fazendaId]);
  const carregarBancos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, fazenda_id').eq('ativa', true).order('nome'));
    return d.filter((c) => centroDaUnidade(c, fazendaId)).map((c) => ({ id: c.id, titulo: c.nome, detalhe: c.banco }));
  }, [fazendaId]);

  const temPreco = (n(preco) ?? 0) > 0;
  const pesoMedio = cabecas > 0 && pesoBruto > 0 ? pesoBruto / cabecas : 0;
  const prazoDias = (p: Parcela) => {
    const v = paraBanco(p.venc);
    if (!v || !dataIso) return '';
    const d = Math.round((new Date(v + 'T12:00:00').getTime() - new Date(dataIso + 'T12:00:00').getTime()) / 86400000);
    return d <= 0 ? 'à vista' : `${d} dias`;
  };

  return (
    <>
      <Secao titulo="Dados financeiros da compra" />
      <Text style={estilos.nota}>Com o preço, a compra e o contas a pagar são lançados junto com a entrada. Sem preço, só entram os animais.</Text>
      <Escolha
        rotulo="Como é o preço"
        opcoes={[
          { valor: 'arroba', rotulo: 'Por arroba' },
          { valor: 'kg', rotulo: 'Por kg vivo' },
          { valor: 'cabeca', rotulo: 'Por cabeça' },
        ]}
        valor={forma}
        aoMudar={setForma}
      />
      {formaPreco !== 'cabeca' && (
        <>
          <Escolha
            rotulo="Desconto de barriga"
            opcoes={[
              { valor: 'nao', rotulo: 'Sem desconto' },
              { valor: 'perc', rotulo: '% do peso' },
              { valor: 'kg_cab', rotulo: 'kg por cabeça' },
            ]}
            valor={barrigaTipo}
            aoMudar={setBarrigaTipo}
          />
          {barrigaTipo[0] !== 'nao' && (
            <Campo
              rotulo={barrigaTipo[0] === 'perc' ? 'Desconto de barriga (% do peso total)' : 'Desconto de barriga (kg por cabeça)'}
              value={barrigaValor}
              onChangeText={setBarrigaValor}
              keyboardType="decimal-pad"
              ajuda={calc.barrigaKg > 0 ? `Desconta ${formatarNumero(calc.barrigaKg, 2)} kg: peso para a conta ${formatarNumero(calc.pesoLiquido, 2)} kg.` : undefined}
            />
          )}
        </>
      )}
      {formaPreco === 'arroba' && (
        <Campo
          rotulo="Kg da arroba"
          value={kgArroba}
          onChangeText={setKgArroba}
          keyboardType="decimal-pad"
          ajuda={(n(kgArroba) ?? 0) > 0 ? `Arroba de 15 kg de carcaça com ${formatarNumero((15 / n(kgArroba)!) * 100, 2)}% de rendimento. 30 kg = boi em pé a 50%.` : '30 kg = boi em pé a 50% de rendimento.'}
        />
      )}
      <CampoMoeda rotulo={`Preço (R$ por ${textoFormaPreco(formaPreco)})`} valor={preco} aoMudar={setPreco} placeholder="Em branco = sem valor" />
      {temPreco && formaPreco !== 'cabeca' && pesoBruto <= 0 && <Text style={estilos.alerta}>Informe o "Peso total (kg)" acima para fazer a conta.</Text>}

      {temPreco && cabecas > 0 && valor > 0 && (
        <>
          {/* ----- resumo financeiro da operação ----- */}
          <View style={estilos.calculo}>
            <Text style={estilos.calcTitulo}>Resumo financeiro da compra</Text>
            {formaPreco !== 'cabeca' && (
              <Text style={estilos.nota}>
                {formatarNumero(pesoBruto, 2)} kg
                {calc.barrigaKg > 0 ? ` − ${formatarNumero(calc.barrigaKg, 2)} kg de barriga = ${formatarNumero(calc.pesoLiquido, 2)} kg` : ''}
                {formaPreco === 'arroba' ? ` ÷ ${formatarNumero(n(kgArroba) ?? 0, 2)} kg = ${formatarNumero(calc.arrobas, 2)} @` : ''}
              </Text>
            )}
            <View style={estilos.grade}>
              <Resumo rotulo="Cabeças" valor={formatarNumero(cabecas)} />
              <Resumo rotulo={`Preço por ${textoFormaPreco(formaPreco)}`} valor={formatarMoeda(n(preco) ?? 0)} />
              <Resumo rotulo="Peso médio por cabeça" valor={pesoMedio > 0 ? `${formatarNumero(pesoMedio, 2)} kg` : '—'} />
              {formaPreco !== 'cabeca' && <Resumo rotulo="Arrobas por cabeça" valor={calc.arrobas > 0 ? `${formatarNumero(calc.arrobas / cabecas, 2)} @` : '—'} />}
              <Resumo rotulo="Valor por cabeça" valor={formatarMoeda(valor / cabecas)} />
              <Resumo rotulo="Valor total da operação" valor={formatarMoeda(valor)} forte />
            </View>
            {formaPreco !== 'arroba' && calc.arrobas > 0 && (
              <Text style={estilos.nota}>Equivale a {formatarMoeda(valor / calc.arrobas)} por @ de {formatarNumero(n(kgArroba) || 30, 2)} kg.</Text>
            )}
          </View>

          <SeletorLista rotulo="Centro de custo" valorId={centroId} aoMudar={setCentroId} carregar={carregarCentros} permitirLimpar vazio="Nenhum centro de custo. Cadastre em Financeiro › Centros de custo." />
          <SeletorLista rotulo="Conta bancária / caixa prevista" valorId={bancoId} aoMudar={setBancoId} carregar={carregarBancos} permitirLimpar vazio="Nenhuma conta. Cadastre em Financeiro › Bancos e caixa." />

          {/* ----- condições de pagamento ----- */}
          <Secao titulo="Condições de pagamento" />
          <Escolha
            rotulo="Prazo"
            opcoes={[
              { valor: 'avista', rotulo: 'À vista' },
              { valor: 'dias', rotulo: 'Prazo em dias' },
              { valor: 'data', rotulo: 'Data fixa' },
            ]}
            valor={pagto}
            aoMudar={(v) => v.length && setPagto(v)}
          />
          {pagto[0] === 'dias' && (
            <View style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Parcelas" value={nParc} onChangeText={(t) => setNParc(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" ajuda="1 = prazo único" />
              </View>
              <View style={{ flex: 1 }}>
                <Campo rotulo="1ª em (dias)" value={prazo1} onChangeText={(t) => setPrazo1(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" ajuda="Da data da compra" />
              </View>
              {(Number(nParc) || 1) > 1 && (
                <View style={{ flex: 1 }}>
                  <Campo rotulo="Demais a cada (dias)" value={intervalo} onChangeText={(t) => setIntervalo(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
                </View>
              )}
            </View>
          )}
          {pagto[0] === 'data' && (
            <View style={estilos.linha}>
              <View style={{ width: 100 }}>
                <Campo rotulo="Parcelas" value={nParc} onChangeText={(t) => setNParc(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" ajuda="1 = parcela única" />
              </View>
              <View style={{ flex: 1 }}>
                <CampoData rotulo="Vencimento da 1ª *" valor={primeiro} aoMudar={setPrimeiro} />
              </View>
            </View>
          )}
          {pagto[0] === 'data' && (Number(nParc) || 1) > 1 && <Text style={estilos.nota}>As seguintes vencem no mesmo dia, nos meses seguintes.</Text>}

          {parcelas.length > 0 && (
            <>
              <Text style={estilos.subtitulo}>{parcelas.length === 1 ? 'Vencimento e valor' : `Vencimentos e valores das ${parcelas.length} parcelas`}</Text>
              {parcelas.map((x, k) => (
                <View key={x.chave} style={estilos.linha}>
                  <Text style={estilos.parcNum}>{k + 1}ª</Text>
                  <View style={{ flex: 1 }}>
                    <CampoData rotulo={`Vencimento${prazoDias(x) ? ` (${prazoDias(x)})` : ''}`} valor={x.venc} aoMudar={(t) => setParcelas((l) => l.map((y) => (y.chave === x.chave ? { ...y, venc: t } : y)))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CampoMoeda rotulo="Valor da parcela" valor={x.valor} aoMudar={(t) => setParcelas((l) => l.map((y) => (y.chave === x.chave ? { ...y, valor: t } : y)))} />
                  </View>
                </View>
              ))}
              <Text style={[estilos.soma, Math.abs(somaParcelas - valor) > 0.009 && { color: cores.erro }]}>
                {parcelas.length > 1 ? `Parcelas somam ${formatarMoeda(somaParcelas)}` : `Total ${formatarMoeda(somaParcelas)}`}
                {Math.abs(somaParcelas - valor) > 0.009 ? ` (a compra é de ${formatarMoeda(valor)})` : ''}
              </Text>
            </>
          )}
        </>
      )}
    </>
  );
});

export default ValorCompraAnimais;

function Resumo({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <View style={estilos.item}>
      <Text style={estilos.itemRotulo}>{rotulo}</Text>
      <Text style={[estilos.itemValor, forte && { fontWeight: '800', color: cores.primariaEscura }]}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  subtitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto, marginTop: 4 },
  alerta: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '700' },
  soma: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  parcNum: { width: 28, paddingTop: 36, fontSize: tam.texto, fontWeight: '800', color: cores.textoSuave },
  calculo: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  calcTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.info },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { minWidth: 140, flexGrow: 1, flexBasis: '45%', gap: 2 },
  itemRotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  itemValor: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
});
