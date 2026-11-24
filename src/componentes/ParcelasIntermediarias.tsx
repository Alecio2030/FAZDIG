// V170: parcelas intermediárias (a 1ª pode ser a entrada) junto com as parcelas normais.
// Usado em Compras, Vendas, Contas a pagar e Contas a receber.
// - As intermediárias são digitadas uma a uma (data e valor), porque costumam ter datas e valores diferentes.
// - As normais são geradas pelo nº, 1º vencimento e intervalo, dividindo o que sobra depois das intermediárias
//   (ou com o valor fixo de cada parcela, se informado).
// - A relação final mostra tudo junto, por ordem de vencimento ("Int. 2/5", "7/36").
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import CampoData from './CampoData';
import CampoMoeda from './CampoMoeda';
import { dataValida, doBanco, paraBanco } from '../lib/datas';
import { formatarMoeda, lerNumero, moedaParaCampo } from '../lib/formatos';
import { somarDias } from '../lib/reproducao';
import { cores, tam } from '../tema';

export type LinhaParcela = { chave: string; venc: string; valor: string };

let cont = 0;
export const chaveParcela = () => `p${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t) ?? 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export const somaLinhas = (l: LinhaParcela[]) => r2(l.reduce((s, x) => s + n(x.valor), 0));

/** Muda a quantidade de intermediárias mantendo o que já foi digitado. */
export function ajustarIntermediarias(atual: LinhaParcela[], qtde: string): LinhaParcela[] {
  const q = Math.max(0, Math.min(24, Number(qtde) || 0));
  if (q === atual.length) return atual;
  if (q < atual.length) return atual.slice(0, q);
  return [...atual, ...Array.from({ length: q - atual.length }, () => ({ chave: chaveParcela(), venc: '', valor: '' }))];
}

/**
 * Parcelas normais: q parcelas a partir de "base" (aaaa-mm-dd), a cada "intervalo" dias.
 * Com valor fixo, todas têm o mesmo valor; sem ele, divide o "total" e a última acerta os centavos.
 */
export function gerarSerie(q: number, base: string, intervalo: number, total: number, fixo?: number | null): LinhaParcela[] {
  const qq = Math.max(1, Math.min(120, q || 1));
  const passo = intervalo || 30;
  const cada = fixo && fixo > 0 ? r2(fixo) : Math.floor((total / qq) * 100) / 100;
  const ultima = fixo && fixo > 0 ? cada : r2(total - cada * (qq - 1));
  return Array.from({ length: qq }, (_, i) => ({ chave: chaveParcela(), venc: doBanco(proximoVencimento(base, i, passo)), valor: moedaParaCampo(i === qq - 1 ? ultima : cada) }));
}

/**
 * Vencimento da parcela i (0 = a primeira). 30, 60, 90… dias contam como 1, 2, 3… meses, sempre no mesmo dia
 * do 1º vencimento (dia 31 cai no último dia dos meses mais curtos). Outros intervalos contam em dias.
 */
export function proximoVencimento(base: string, i: number, passo: number): string {
  if (passo % 30 !== 0) return somarDias(base, i * passo);
  const [a, m, d] = base.split('-').map(Number);
  const meses = m - 1 + i * (passo / 30);
  const ano = a + Math.floor(meses / 12);
  const mes = (meses % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Tudo junto, por vencimento, no formato que o banco grava. Na mesma data, a intermediária vem antes. */
export function juntarParcelas(normais: LinhaParcela[], interm: LinhaParcela[]) {
  const l = [
    ...interm.map((x, i) => ({ vencimento: paraBanco(x.venc) ?? '', valor: lerNumero(x.valor), intermediaria: true, o: i })),
    ...normais.map((x, i) => ({ vencimento: paraBanco(x.venc) ?? '', valor: lerNumero(x.valor), intermediaria: false, o: 1000 + i })),
  ];
  l.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.o - b.o);
  return l.map(({ o, ...x }) => x);
}

/** Erro das intermediárias (ou null). */
export function erroIntermediarias(interm: LinhaParcela[]): string | null {
  if (interm.some((x) => !dataValida(x.venc) || n(x.valor) <= 0)) return 'Informe a data e o valor de cada parcela intermediária.';
  return null;
}

/** Caixinha "Intermediárias" (qtde.), para ficar ao lado da caixinha "Parcelas". */
export function CampoQtdeIntermediarias({ valor, aoMudar }: { valor: string; aoMudar: (t: string) => void }) {
  return (
    <View style={{ width: 112 }}>
      <Campo rotulo="Intermediárias" value={valor} onChangeText={(t) => aoMudar(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="0" />
    </View>
  );
}

type Props = {
  normais: LinhaParcela[];
  setNormais: (f: (l: LinhaParcela[]) => LinhaParcela[]) => void;
  interm: LinhaParcela[];
  setInterm: (f: (l: LinhaParcela[]) => LinhaParcela[]) => void;
  /** valor fixo de cada parcela normal (opcional) */
  fixo: string;
  setFixo: (t: string) => void;
  /** o que as parcelas precisam somar */
  total: number;
  /** "o total da compra", "o valor a receber"… */
  rotuloTotal: string;
  erro?: string | null;
  /** mostra a linha mesmo com uma parcela só (ex.: compra à vista) */
  mostrarUma?: boolean;
};

/**
 * Intermediárias para digitar e a relação de todas as parcelas por vencimento.
 * Sem intermediárias, mostra só as parcelas normais, como antes.
 */
export default function ParcelasIntermediarias({ normais, setNormais, interm, setInterm, fixo, setFixo, total, rotuloTotal, erro, mostrarUma }: Props) {
  const temInterm = interm.length > 0;
  const mostrar = temInterm || normais.length > 1 || (!!mostrarUma && normais.length === 1);
  const soma = r2(somaLinhas(normais) + somaLinhas(interm));
  const dif = r2(soma - total);

  // relação por vencimento (as que ainda não têm data ficam no fim)
  const rel = [
    ...interm.map((x, i) => ({ x, interm: true, k: i + 1, de: interm.length })),
    ...normais.map((x, i) => ({ x, interm: false, k: i + 1, de: normais.length })),
  ].sort((a, b) => (paraBanco(a.x.venc) ?? '9999').localeCompare(paraBanco(b.x.venc) ?? '9999') || Number(b.interm) - Number(a.interm) || a.k - b.k);

  const mudar = (lista: 'n' | 'i', chave: string, campo: 'venc' | 'valor', t: string) =>
    (lista === 'n' ? setNormais : setInterm)((l) => l.map((y) => (y.chave === chave ? { ...y, [campo]: t } : y)));

  return (
    <View style={{ gap: 10 }}>
      {temInterm && (
        <>
          <Text style={estilos.subtitulo}>Parcelas intermediárias</Text>
          <Text style={estilos.nota}>A entrada, se houver, é a 1ª intermediária. Parcela com vencimento já passado entra em aberto: dê baixa pelo caixa ou banco normalmente.</Text>
          {interm.map((x, k) => (
            <View key={x.chave} style={estilos.linha}>
              <Text style={estilos.num}>Int. {k + 1}</Text>
              <View style={{ flex: 1 }}>
                <CampoData rotulo="Vencimento" valor={x.venc} aoMudar={(t) => mudar('i', x.chave, 'venc', t)} />
              </View>
              <View style={{ flex: 1 }}>
                <CampoMoeda rotulo="Valor" valor={x.valor} aoMudar={(t) => mudar('i', x.chave, 'valor', t)} />
              </View>
            </View>
          ))}
          <CampoMoeda
            rotulo="Valor de cada parcela normal (opcional)"
            valor={fixo}
            aoMudar={setFixo}
            ajuda={fixo.trim() ? 'Todas as parcelas normais com este valor.' : `Em branco: o que sobra depois das intermediárias é dividido nas parcelas normais.`}
          />
          <Text style={estilos.subtitulo}>Relação das parcelas por vencimento</Text>
        </>
      )}
      {mostrar &&
        rel.map(({ x, interm: ei, k, de }) =>
          ei ? (
            <View key={x.chave} style={[estilos.linha, estilos.linhaInterm]}>
              <Text style={[estilos.num, { color: cores.cafe, paddingTop: 0 }]}>Int. {k}/{de}</Text>
              <Text style={[estilos.fixoTxt, { flex: 1 }]}>{x.venc || 'sem data'}</Text>
              <Text style={[estilos.fixoTxt, { flex: 1, textAlign: 'right' }]}>{x.valor ? formatarMoeda(n(x.valor)) : '–'}</Text>
            </View>
          ) : (
            <View key={x.chave} style={estilos.linha}>
              <Text style={estilos.num}>{temInterm ? `${k}/${de}` : `${k}ª`}</Text>
              <View style={{ flex: 1 }}>
                <CampoData rotulo="Vencimento" valor={x.venc} aoMudar={(t) => mudar('n', x.chave, 'venc', t)} />
              </View>
              <View style={{ flex: 1 }}>
                <CampoMoeda rotulo="Valor" valor={x.valor} aoMudar={(t) => mudar('n', x.chave, 'valor', t)} />
              </View>
            </View>
          ),
        )}
      {(temInterm || normais.length > 1) && (
        <Text style={[estilos.soma, Math.abs(dif) > 0.009 && { color: cores.erro }]}>
          {temInterm ? `${interm.length} intermediária${interm.length > 1 ? 's' : ''} (${formatarMoeda(somaLinhas(interm))}) + ${normais.length} parcela${normais.length > 1 ? 's' : ''} (${formatarMoeda(somaLinhas(normais))}) = ` : 'Parcelas somam '}
          {formatarMoeda(soma)}
          {Math.abs(dif) > 0.009 ? ` · ${dif > 0 ? 'passa' : 'falta'} ${formatarMoeda(Math.abs(dif))} para ${rotuloTotal}` : ''}
        </Text>
      )}
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linhaInterm: { alignItems: 'center', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, paddingHorizontal: 10, minHeight: tam.alturaToque },
  num: { minWidth: 52, paddingTop: 36, fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.textoSuave },
  fixoTxt: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  subtitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  soma: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
