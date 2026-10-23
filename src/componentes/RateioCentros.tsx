import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Campo from './Campo';
import SeletorLista, { type ItemLista } from './SeletorLista';
import { formatarMoeda, formatarNumero, lerNumero, numeroParaCampo } from '../lib/formatos';
import { cores, tam } from '../tema';

// V152: rateio por centros de custo que se completa sozinho.
// Começa com um centro em 100%. Trocou para 40%? Abre outra linha já com os 60% que faltam;
// nela pôs 40%? Abre mais uma com 20%... até fechar 100%. Pôs 100% de novo? As linhas vazias somem.

export type LinhaRateio = { chave: string; centroId: string | null; perc: string; auto?: boolean };

let cont = 0;
const nova = (perc: string, auto = false): LinhaRateio => ({ chave: `rc${Date.now()}_${cont++}`, centroId: null, perc, auto });
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Rateio inicial: um centro com 100%. */
export const rateioInicial = (centroId: string | null = null): LinhaRateio[] => [{ ...nova('100'), centroId }];

/** Rateio gravado -> linhas da tela. */
export const rateioDoBanco = (l: { centro_custo_id: string; percentual: any }[]): LinhaRateio[] =>
  l.length ? l.map((x) => ({ ...nova(numeroParaCampo(Number(x.percentual))), centroId: x.centro_custo_id })) : rateioInicial();

const soma = (l: LinhaRateio[]) => l.reduce((t, x) => t + (lerNumero(x.perc) ?? 0), 0);

/** Acerta as linhas: tira as vazias que sobraram no fim e abre a que falta para fechar 100%. */
function completar(l: LinhaRateio[]): LinhaRateio[] {
  let x = [...l];
  while (x.length > 1 && !x[x.length - 1].centroId && x[x.length - 1].auto) x = x.slice(0, -1);
  const s = soma(x);
  if (s < 99.999 && x.every((y) => (lerNumero(y.perc) ?? 0) > 0)) x = [...x, nova(numeroParaCampo(r2(100 - s)), true)];
  return x;
}

/**
 * O que vai para o banco: lista vazia quando nenhum centro foi escolhido (rateio opcional),
 * ou a mensagem do que falta corrigir.
 */
export function validarRateio(l: LinhaRateio[], obrigatorio = false): { erro: string | null; rateio: { centro_custo_id: string; percentual: number }[] } {
  const usadas = l.filter((x) => x.centroId || !x.auto || l.length === 1);
  if (usadas.every((x) => !x.centroId)) return { erro: obrigatorio ? 'Escolha o centro de custo.' : null, rateio: [] };
  const comPerc = l.filter((x) => (lerNumero(x.perc) ?? 0) > 0);
  if (comPerc.some((x) => !x.centroId)) return { erro: 'Escolha o centro de custo de cada linha do rateio (ou zere a linha).', rateio: [] };
  if (new Set(comPerc.map((x) => x.centroId)).size !== comPerc.length) return { erro: 'Há centro de custo repetido no rateio.', rateio: [] };
  const s = soma(comPerc);
  if (Math.abs(s - 100) > 0.001) return { erro: `O rateio soma ${formatarNumero(s, 2)}%: precisa fechar 100%.`, rateio: [] };
  return { erro: null, rateio: comPerc.map((x) => ({ centro_custo_id: x.centroId!, percentual: lerNumero(x.perc)! })) };
}

type Props = {
  linhas: LinhaRateio[];
  aoMudar: (l: LinhaRateio[]) => void;
  carregar: () => Promise<ItemLista[]>;
  /** valor a ratear, para mostrar quanto vai para cada centro */
  valor?: number | null;
  rotulo?: string;
  erro?: string | null;
  vazio?: string;
};

export default function RateioCentros({ linhas, aoMudar, carregar, valor, rotulo = 'Centro de custo', erro, vazio }: Props) {
  const s = soma(linhas);
  const fechou = Math.abs(s - 100) <= 0.001;

  function mudarPerc(chave: string, t: string) {
    aoMudar(completar(linhas.map((y) => (y.chave === chave ? { ...y, perc: t, auto: false } : y))));
  }
  function mudarCentro(chave: string, v: string | null) {
    aoMudar(completar(linhas.map((y) => (y.chave === chave ? { ...y, centroId: v, auto: false } : y))));
  }
  function tirar(chave: string) {
    const resto = linhas.filter((y) => y.chave !== chave);
    aoMudar(resto.length ? completar(resto) : rateioInicial());
  }

  return (
    <View style={{ gap: 8 }}>
      {linhas.map((x, k) => {
        const p = lerNumero(x.perc) ?? 0;
        return (
          <View key={x.chave} style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <SeletorLista
                rotulo={linhas.length > 1 ? `${rotulo} ${k + 1}` : rotulo}
                valorId={x.centroId}
                aoMudar={(v) => mudarCentro(x.chave, v)}
                carregar={carregar}
                permitirLimpar
                vazio={vazio ?? 'Nenhum centro de custo nesta unidade.'}
              />
              {valor != null && valor > 0 && x.centroId && p > 0 ? <Text style={estilos.nota}>{formatarMoeda(r2((valor * p) / 100))}</Text> : null}
            </View>
            <View style={{ width: 78 }}>
              <Campo rotulo="%" value={x.perc} onChangeText={(t) => mudarPerc(x.chave, t)} keyboardType="decimal-pad" />
            </View>
            {linhas.length > 1 && (
              <Pressable onPress={() => tirar(x.chave)} hitSlop={8} style={{ paddingTop: 30 }} accessibilityLabel="Tirar este centro">
                <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
              </Pressable>
            )}
          </View>
        );
      })}
      {linhas.length > 1 && (
        <Text style={[estilos.soma, !fechou && { color: cores.erro }]}>
          Soma {formatarNumero(s, 2)}%{fechou ? '' : s > 100 ? ' – passou de 100%' : ' – falta fechar 100%'}
        </Text>
      )}
      {linhas.length === 1 && <Text style={estilos.nota}>Para dividir em vários centros, troque os 100% (ex.: 40): abre a linha do próximo centro com o que falta.</Text>}
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  soma: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave, textAlign: 'right' },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
