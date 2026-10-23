import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import CampoData from './CampoData';
import Escolha from './Escolha';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../lib/datas';
import { idadeTexto, mesAno, mesesAtras, mesesEntre } from '../lib/rebanho';
import { cores, tam } from '../tema';

export type ValorNascimento = { modo: 'exata' | 'idade'; data: string; meses: string };

export const NASCIMENTO_VAZIO: ValorNascimento = { modo: 'idade', data: '', meses: '' };

/** Converte o que foi digitado para gravar: data (aaaa-mm-dd) e se é aproximada. */
export function lerNascimento(v: ValorNascimento, baseIso: string): { iso: string | null; aprox: boolean; erro?: string } {
  if (v.modo === 'exata') {
    if (!v.data) return { iso: null, aprox: false };
    if (!dataValida(v.data)) return { iso: null, aprox: false, erro: 'Data inválida.' };
    const iso = paraBanco(v.data)!;
    if (iso > hojeBanco()) return { iso: null, aprox: false, erro: 'O nascimento não pode ser no futuro.' };
    return { iso, aprox: false };
  }
  if (!v.meses.trim()) return { iso: null, aprox: false };
  const n = Number(v.meses);
  if (!Number.isInteger(n) || n < 0 || n > 360) return { iso: null, aprox: true, erro: 'Informe a idade em meses (número inteiro).' };
  return { iso: mesesAtras(baseIso, n), aprox: true };
}

/** Monta o campo a partir do que está no banco. */
export function nascimentoDoBanco(iso: string | null, aprox: boolean, baseIso: string): ValorNascimento {
  if (!iso) return NASCIMENTO_VAZIO;
  if (aprox) return { modo: 'idade', data: '', meses: String(Math.max(0, mesesEntre(iso, baseIso))) };
  return { modo: 'exata', data: doBanco(iso), meses: '' };
}

type Props = {
  rotulo?: string;
  valor: ValorNascimento;
  aoMudar: (v: ValorNascimento) => void;
  /** data de entrada/abertura (aaaa-mm-dd) a partir da qual a idade é contada */
  baseIso: string;
  erro?: string | null;
  rotuloMeses?: string;
};

/** Nascimento por data exata ou pela idade em meses (vira um mês de referência). */
export default function CampoNascimento({ rotulo = 'Nascimento', valor, aoMudar, baseIso, erro, rotuloMeses = 'Idade na entrada, em meses' }: Props) {
  const lido = lerNascimento(valor, baseIso);
  const idadeHoje = lido.iso ? idadeTexto(lido.iso) : null;

  return (
    <View style={{ gap: 10 }}>
      <Escolha
        rotulo={rotulo}
        opcoes={[
          { valor: 'idade', rotulo: 'Pela idade (meses)' },
          { valor: 'exata', rotulo: 'Data exata' },
        ]}
        valor={[valor.modo]}
        aoMudar={(v) => aoMudar({ ...valor, modo: v[0] as ValorNascimento['modo'] })}
      />
      {valor.modo === 'exata' ? (
        <CampoData rotulo="Data de nascimento" valor={valor.data} aoMudar={(d) => aoMudar({ ...valor, data: d })} erro={erro ?? lido.erro} />
      ) : (
        <Campo
          rotulo={rotuloMeses}
          value={valor.meses}
          onChangeText={(t) => aoMudar({ ...valor, meses: t.replace(/\D/g, '').slice(0, 3) })}
          keyboardType="number-pad"
          placeholder="Ex.: 11"
          erro={erro ?? lido.erro}
        />
      )}
      {lido.iso && !lido.erro && (
        <Text style={estilos.nota}>
          {lido.aprox ? `Mês de referência: ${mesAno(lido.iso)}. ` : ''}
          {idadeHoje ? `Idade hoje: ${idadeHoje}${lido.aprox ? ' (aprox.)' : ''}.` : ''}
          {lido.aprox ? ' A idade evolui sozinha a cada mês.' : ''}
        </Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '600', lineHeight: 21 },
});
