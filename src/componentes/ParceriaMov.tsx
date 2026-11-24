import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import CampoMoeda from './CampoMoeda';
import CampoData from './CampoData';
import Escolha from './Escolha';
import Secao from './Secao';
import { dataValida, doBanco, paraBanco } from '../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, numeroParaCampo } from '../lib/formatos';
import { cores, tam } from '../tema';

/**
 * V182 – Parceria pecuária dentro de Movimentações.
 * - CondicoesParceria: no fim da Entrada por parceria (apascentamento ou rendimento).
 * - AcertoParceria: na Saída da parceria, calcula o rendimento (em R$ ou em cabeças).
 */

const n = (t: string) => lerNumero(t);

/** Mesmo dia do mês, N meses depois (31 vira o último dia do mês menor) – igual ao banco. */
export function somarMesesIso(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}
const dias = (de: string, ate: string) => Math.round((new Date(ate + 'T12:00:00').getTime() - new Date(de + 'T12:00:00').getTime()) / 86400000);

/** Meses do apascentamento entre a entrada e a saída prevista (o último proporcional aos dias). */
export function mesesApascentamento(entradaIso: string, fimIso: string, cab: number, preco: number) {
  const meses: { de: string; ate: string; valor: number; proporcional: boolean }[] = [];
  for (let k = 0; k < 600; k++) {
    const ini = somarMesesIso(entradaIso, k);
    if (ini >= fimIso) break;
    const prox = somarMesesIso(entradaIso, k + 1);
    const fim = prox < fimIso ? prox : fimIso;
    const valor = Math.round(cab * preco * (dias(ini, fim) / dias(ini, prox)) * 100) / 100;
    meses.push({ de: ini, ate: fim, valor, proporcional: fim < prox });
  }
  return meses;
}

// ------------------------------------------------------------------ entrada

export type CondicoesParceriaRef = { obter: () => { erro?: string; dados?: Record<string, unknown> } };
type PropsEntrada = { data: string; cabecas: number; pesoBruto: number };

export const CondicoesParceria = forwardRef<CondicoesParceriaRef, PropsEntrada>(function CondicoesParceria({ data, cabecas, pesoBruto }, ref) {
  const [modalidade, setModalidade] = useState<string[]>([]);
  const [prevista, setPrevista] = useState('');
  const [preco, setPreco] = useState('');
  const [percFaz, setPercFaz] = useState('');
  const [percPar, setPercPar] = useState('');
  const [kgArroba, setKgArroba] = useState('30');

  const mod = modalidade[0];
  const entradaIso = paraBanco(data);
  const prevIso = paraBanco(prevista);
  const pr = n(preco) ?? 0;
  const meses = mod === 'apascentamento' && entradaIso && prevIso && prevIso > entradaIso && pr > 0 && cabecas > 0 ? mesesApascentamento(entradaIso, prevIso, cabecas, pr) : [];
  const totalMeses = meses.reduce((s, x) => s + x.valor, 0);

  function mudarPerc(qual: 'faz' | 'par', t: string) {
    const v = t.replace(/[^\d,]/g, '').slice(0, 6);
    const num = n(v);
    if (qual === 'faz') {
      setPercFaz(v);
      setPercPar(num != null && num >= 0 && num <= 100 ? numeroParaCampo(Math.round((100 - num) * 100) / 100) : '');
    } else {
      setPercPar(v);
      setPercFaz(num != null && num >= 0 && num <= 100 ? numeroParaCampo(Math.round((100 - num) * 100) / 100) : '');
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      obter() {
        if (!mod) return { erro: 'Condições da parceria: escolha Apascentamento ou Por rendimento.' };
        if (prevista.trim() && !dataValida(prevista)) return { erro: 'Condições da parceria: data prevista para sair inválida.' };
        if (prevIso && entradaIso && prevIso <= entradaIso) return { erro: 'Condições da parceria: a data prevista para sair precisa ser depois da entrada.' };
        if (mod === 'apascentamento') {
          if (!prevIso) return { erro: 'Condições da parceria: informe a data prevista para sair (o contas a receber vai até ela).' };
          if (pr <= 0) return { erro: 'Condições da parceria: informe o preço por cabeça por mês.' };
          return { dados: { modalidade: 'apascentamento', data_prevista: prevIso, preco_cab_mes: pr } };
        }
        const pf = n(percFaz);
        const pp = n(percPar);
        if (pf == null || pp == null || pf < 0 || pp < 0 || Math.abs(pf + pp - 100) > 0.001) return { erro: 'Condições da parceria: as participações da fazenda e do parceiro precisam somar 100%.' };
        if ((n(kgArroba) ?? 0) <= 0) return { erro: 'Condições da parceria: informe os kg da arroba.' };
        if (pesoBruto <= 0) return { erro: 'Parceria por rendimento: informe o "Peso total (kg)" de entrada; o ganho é calculado a partir dele.' };
        return { dados: { modalidade: 'rendimento', data_prevista: prevIso ?? '', perc_fazenda: pf, perc_parceiro: pp, kg_arroba: n(kgArroba) } };
      },
    }),
    [mod, prevista, prevIso, entradaIso, pr, percFaz, percPar, kgArroba, pesoBruto],
  );

  return (
    <>
      <Secao titulo="Condições da parceria" />
      <Escolha
        rotulo="Condição *"
        opcoes={[
          { valor: 'apascentamento', rotulo: 'Apascentamento' },
          { valor: 'rendimento', rotulo: 'Por rendimento' },
        ]}
        valor={modalidade}
        aoMudar={setModalidade}
      />
      {!!mod && (
        <>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.rotulo}>Data de entrada</Text>
              <Text style={estilos.valorFixo}>{dataValida(data) ? data : '—'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <CampoData rotulo={mod === 'apascentamento' ? 'Data prevista para sair *' : 'Data prevista para sair'} valor={prevista} aoMudar={setPrevista} />
            </View>
          </View>
        </>
      )}

      {mod === 'apascentamento' && (
        <>
          <CampoMoeda rotulo="Preço por cabeça (R$ por mês) *" valor={preco} aoMudar={setPreco} />
          {meses.length > 0 ? (
            <View style={estilos.quadro}>
              <Text style={estilos.quadroTitulo}>Contas a receber automático</Text>
              <Text style={estilos.nota}>
                {formatarNumero(cabecas)} cab. × {formatarMoeda(pr)} = {formatarMoeda(cabecas * pr)} por mês · {meses.length} {meses.length === 1 ? 'lançamento' : 'lançamentos'} mensais, de{' '}
                {doBanco(meses[0].ate)} a {doBanco(meses[meses.length - 1].ate)}
              </Text>
              {meses.slice(0, 3).map((x, i) => (
                <Text key={x.de} style={estilos.linhaMes}>
                  {i + 1}º · vence {doBanco(x.ate)} · {formatarMoeda(x.valor)}
                  {x.proporcional ? ' (proporcional)' : ''}
                </Text>
              ))}
              {meses.length > 4 && <Text style={estilos.linhaMes}>…</Text>}
              {meses.length > 3 && (
                <Text style={estilos.linhaMes}>
                  {meses.length}º · vence {doBanco(meses[meses.length - 1].ate)} · {formatarMoeda(meses[meses.length - 1].valor)}
                  {meses[meses.length - 1].proporcional ? ' (proporcional)' : ''}
                </Text>
              )}
              <Text style={estilos.total}>Total previsto: {formatarMoeda(totalMeses)}</Text>
              <Text style={estilos.nota}>
                Se a data prevista mudar (na Consulta desta entrada), os lançamentos continuam até a nova data. Saídas parciais recalculam os meses seguintes, e a saída final fecha o último mês proporcional aos dias.
              </Text>
            </View>
          ) : (
            <Text style={estilos.nota}>Informe a data prevista e o preço: o sistema lança no contas a receber um título por mês, do mês da entrada até o mês previsto para sair.</Text>
          )}
        </>
      )}

      {mod === 'rendimento' && (
        <>
          <Text style={estilos.subtitulo}>Participação de cada um no rendimento (ganho de peso)</Text>
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="% da fazenda *" value={percFaz} onChangeText={(t) => mudarPerc('faz', t)} keyboardType="decimal-pad" placeholder="Ex.: 50" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="% do parceiro *" value={percPar} onChangeText={(t) => mudarPerc('par', t)} keyboardType="decimal-pad" placeholder="Ex.: 50" />
            </View>
            <View style={{ width: 110 }}>
              <Campo rotulo="Kg da arroba" value={kgArroba} onChangeText={(t) => setKgArroba(t.replace(/[^\d,]/g, ''))} keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={estilos.quadro}>
            <Text style={estilos.quadroTitulo}>Como é o acerto</Text>
            <Text style={estilos.nota}>
              Na saída, o sistema calcula as arrobas ganhas (peso de saída − peso de entrada de cada animal) e separa a parte da fazenda pelo percentual. Ela vai para o contas a receber em R$ ou fica em cabeças de gado no estoque, com o valor calculado.
            </Text>
            {pesoBruto > 0 && cabecas > 0 ? (
              <Text style={estilos.nota}>
                Entrada: {formatarNumero(pesoBruto, 2)} kg · {formatarNumero(pesoBruto / cabecas, 2)} kg por cabeça · {formatarNumero(pesoBruto / cabecas / (n(kgArroba) || 30), 2)} @ por cabeça.
              </Text>
            ) : (
              <Text style={estilos.alerta}>Informe acima o "Peso total (kg)" de entrada: é a base do cálculo do rendimento.</Text>
            )}
          </View>
        </>
      )}
    </>
  );
});

// ------------------------------------------------------------------ saída

export type Parceria = {
  id: string;
  numero: number;
  modalidade: 'apascentamento' | 'rendimento';
  data_entrada: string;
  data_prevista: string | null;
  preco_cab_mes: number | null;
  cabecas_entrada: number;
  peso_entrada_kg: number | null;
  kg_arroba: number;
  perc_fazenda: number | null;
  perc_parceiro: number | null;
  pessoa_id: string | null;
  pessoa?: { nome: string } | null;
  cab_abertas?: number;
};

export type AcertoParceriaRef = { obter: () => { erro?: string; acerto?: Record<string, unknown>; loteNumero?: number } };
type PropsSaida = { parceria: Parceria; cabecas: number; pesoBruto: number; data: string };

export const AcertoParceria = forwardRef<AcertoParceriaRef, PropsSaida>(function AcertoParceria({ parceria: r, cabecas, pesoBruto, data }, ref) {
  const [preco, setPreco] = useState('');
  const [forma, setForma] = useState<string[]>(['dinheiro']);
  const [venc, setVenc] = useState('');
  const [cabFaz, setCabFaz] = useState('');
  const [numLote, setNumLote] = useState('');

  const rend = r.modalidade === 'rendimento';
  const kg = Number(r.kg_arroba) || 30;
  const pr = n(preco) ?? 0;
  const pesoEnt = r.peso_entrada_kg && r.cabecas_entrada ? (Number(r.peso_entrada_kg) / r.cabecas_entrada) * cabecas : 0;
  const ganhoArr = cabecas > 0 && pesoBruto > 0 ? Math.round(((pesoBruto - pesoEnt) / kg) * 100) / 100 : 0;
  const arrFaz = Math.round(Math.max(ganhoArr, 0) * (Number(r.perc_fazenda) || 0)) / 100;
  const valor = Math.round(arrFaz * pr * 100) / 100;
  const valorCab = cabecas > 0 && pesoBruto > 0 ? Math.round((pesoBruto / cabecas / kg) * pr * 100) / 100 : 0;
  const sugestao = valorCab > 0 ? Math.floor(valor / valorCab) : 0;
  const cabF = cabFaz.trim() ? Number(cabFaz) || 0 : sugestao;
  const diferenca = Math.round((valor - cabF * valorCab) * 100) / 100;

  useImperativeHandle(
    ref,
    () => ({
      obter() {
        if (!rend) return { acerto: {} };
        if (pesoBruto <= 0) return { erro: 'Saída da parceria por rendimento: informe o "Peso total (kg)" de saída.' };
        if (pr <= 0) return { erro: 'Saída da parceria: informe o preço da arroba para calcular o rendimento.' };
        if (forma[0] === 'dinheiro') {
          if (venc.trim() && !dataValida(venc)) return { erro: 'Saída da parceria: vencimento inválido.' };
          return { acerto: { forma: 'dinheiro', preco_arroba: pr, vencimento: paraBanco(venc) ?? '' } };
        }
        if (cabF < 1) return { erro: valor <= 0 ? 'Não houve ganho de peso para a fazenda: receba em R$ (fica zerado) ou confira os pesos.' : 'Informe quantas cabeças ficam para a fazenda.' };
        if (cabF >= cabecas) return { erro: `As cabeças que ficam para a fazenda (${cabF}) precisam ser menos que as que saem (${cabecas}).` };
        if (venc.trim() && !dataValida(venc)) return { erro: 'Saída da parceria: vencimento da diferença inválido.' };
        const nl = Number(numLote);
        return {
          acerto: { forma: 'cabecas', preco_arroba: pr, cab_fazenda: cabF, vencimento: paraBanco(venc) ?? '' },
          loteNumero: Number.isInteger(nl) && nl > 0 ? nl : undefined,
        };
      },
    }),
    [rend, pesoBruto, pr, forma, venc, cabF, cabecas, valor, numLote],
  );

  return (
    <>
      <Secao titulo={`Acerto da parceria nº ${r.numero}`} />
      <View style={estilos.quadro}>
        <Text style={estilos.quadroTitulo}>{rend ? 'Parceria por rendimento' : 'Parceria de apascentamento'}</Text>
        <Text style={estilos.nota}>
          {r.pessoa?.nome ? `Parceiro: ${r.pessoa.nome} · ` : ''}Entrada em {doBanco(r.data_entrada)}
          {r.data_prevista ? ` · saída prevista ${doBanco(r.data_prevista)}` : ''} · {formatarNumero(r.cab_abertas ?? r.cabecas_entrada)} cab. em aberto
        </Text>
        {rend ? (
          <Text style={estilos.nota}>
            Fazenda {formatarNumero(Number(r.perc_fazenda), 2)}% · Parceiro {formatarNumero(Number(r.perc_parceiro), 2)}% · arroba de {formatarNumero(kg, 2)} kg
            {r.peso_entrada_kg ? ` · entrada ${formatarNumero(Number(r.peso_entrada_kg) / r.cabecas_entrada, 2)} kg por cabeça` : ''}
          </Text>
        ) : (
          <Text style={estilos.nota}>
            {formatarMoeda(Number(r.preco_cab_mes))} por cabeça por mês. O contas a receber é refeito sozinho: com saída parcial, os meses seguintes ficam com as cabeças que restam; com a saída de todas, o último mês fecha proporcional aos dias.
          </Text>
        )}
      </View>

      {rend && (
        <>
          <CampoMoeda rotulo="Preço da arroba (R$) *" valor={preco} aoMudar={setPreco} ajuda="Para dar valor às arrobas da fazenda" />
          {cabecas > 0 && pesoBruto > 0 && (
            <View style={estilos.quadro}>
              <Text style={estilos.quadroTitulo}>Cálculo do rendimento</Text>
              <View style={estilos.grade}>
                <Item rotulo="Peso de entrada" valor={`${formatarNumero(pesoEnt, 2)} kg`} />
                <Item rotulo="Peso de saída" valor={`${formatarNumero(pesoBruto, 2)} kg`} />
                <Item rotulo="Arrobas ganhas" valor={`${formatarNumero(ganhoArr, 2)} @`} />
                <Item rotulo={`Da fazenda (${formatarNumero(Number(r.perc_fazenda), 2)}%)`} valor={`${formatarNumero(arrFaz, 2)} @`} />
                <Item rotulo="Valor do rendimento" valor={pr > 0 ? formatarMoeda(valor) : '—'} forte />
              </View>
              <Text style={estilos.nota}>O valor final usa o peso de entrada de cada animal que sai (o daqui é a média da entrada).</Text>
            </View>
          )}
          <Escolha
            rotulo="A fazenda recebe"
            opcoes={[
              { valor: 'dinheiro', rotulo: 'Em R$ (contas a receber)' },
              { valor: 'cabecas', rotulo: 'Em cabeças de gado' },
            ]}
            valor={forma}
            aoMudar={(v) => v.length && setForma(v)}
          />
          {forma[0] === 'dinheiro' ? (
            <CampoData rotulo="Vencimento do recebimento" valor={venc} aoMudar={setVenc} />
          ) : (
            <>
              {valorCab > 0 && pr > 0 && (
                <Text style={estilos.nota}>
                  Valor por cabeça na saída: {formatarNumero(pesoBruto / cabecas / kg, 2)} @ × {formatarMoeda(pr)} = {formatarMoeda(valorCab)}. O rendimento dá {formatarNumero(valorCab ? valor / valorCab : 0, 2)} cabeças.
                </Text>
              )}
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Cabeças que ficam para a fazenda *"
                    value={cabFaz}
                    onChangeText={(t) => setCabFaz(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    placeholder={sugestao > 0 ? String(sugestao) : ''}
                    ajuda={sugestao > 0 ? `Sugestão: ${sugestao}` : undefined}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Nº do lote para elas"
                    value={numLote}
                    onChangeText={(t) => setNumLote(t.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    placeholder="Em branco = mesmo lote"
                    ajuda="Se não existir, é cadastrado"
                  />
                </View>
              </View>
              {cabF > 0 && valorCab > 0 && (
                <View style={estilos.quadro}>
                  <Text style={estilos.nota}>
                    {cabF} cab. × {formatarMoeda(valorCab)} = {formatarMoeda(cabF * valorCab)} entram no estoque da fazenda (como compra quitada pelo rendimento).
                  </Text>
                  {Math.abs(diferenca) > 0.009 && (
                    <Text style={[estilos.nota, { fontWeight: '700', color: diferenca > 0 ? cores.primariaEscura : cores.erro }]}>
                      {diferenca > 0 ? `Diferença a receber do parceiro: ${formatarMoeda(diferenca)}` : `Diferença a pagar ao parceiro: ${formatarMoeda(-diferenca)}`}
                    </Text>
                  )}
                </View>
              )}
              {Math.abs(diferenca) > 0.009 && <CampoData rotulo="Vencimento da diferença" valor={venc} aoMudar={setVenc} />}
            </>
          )}
        </>
      )}
    </>
  );
});

function Item({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <View style={estilos.item}>
      <Text style={estilos.itemRotulo}>{rotulo}</Text>
      <Text style={[estilos.itemValor, forte && { fontWeight: '800', color: cores.primariaEscura }]}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto, marginBottom: 6 },
  valorFixo: { fontSize: tam.texto, color: cores.texto, paddingVertical: 12 },
  subtitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  alerta: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '700' },
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  quadroTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.info },
  linhaMes: { fontSize: tam.pequeno + 1, color: cores.texto },
  total: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { minWidth: 130, flexGrow: 1, flexBasis: '30%', gap: 2 },
  itemRotulo: { fontSize: tam.pequeno, color: cores.textoSuave },
  itemValor: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
});
