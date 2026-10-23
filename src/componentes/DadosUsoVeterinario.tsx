import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import Escolha from './Escolha';
import { MAX_VIAS, VIAS_APLICACAO, type UsoVet } from '../lib/insumos';
import { cores, tam } from '../tema';

/** unidade = unidade de CONSUMO (em que se aplica) */
type Props = { valor: UsoVet; aoMudar: (u: UsoVet) => void; unidade: string; erros?: Record<string, string> };

const num = (t: string) => t.replace(/[^\d.,]/g, '');
const inteiro = (t: string, max = 4) => t.replace(/\D/g, '').slice(0, max);

/** Dados de uso de vacina ou medicamento: dose recomendada, doenças, esquema (única ou reforços) e carência. */
export default function DadosUsoVeterinario({ valor: u, aoMudar, unidade, erros = {} }: Props) {
  const muda = <K extends keyof UsoVet>(k: K, v: UsoVet[K]) => aoMudar({ ...u, [k]: v });
  const un = unidade || 'unidade';
  return (
    <View style={{ gap: 12 }}>
      <Campo rotulo="Para quais doenças serve" value={u.indicacoes} onChangeText={(t) => muda('indicacoes', t)} autoCapitalize="sentences" multiline placeholder="Ex.: aftosa; pneumonia, pododermatite" style={estilos.multi} />
      <Campo rotulo="Princípio ativo" value={u.principio} onChangeText={(t) => muda('principio', t)} autoCapitalize="sentences" placeholder="Opcional" />
      <Escolha
        rotulo={`Via de aplicação (até ${MAX_VIAS})`}
        opcoes={VIAS_APLICACAO}
        valor={u.via}
        multiplo
        // Marcou a 3ª: fica com as duas últimas marcadas.
        aoMudar={(v) => muda('via', v.slice(-MAX_VIAS))}
      />

      <Escolha
        rotulo="Dose recomendada *"
        opcoes={[
          { valor: 'cabeca', rotulo: 'Por cabeça' },
          { valor: 'kg', rotulo: 'Por peso vivo' },
        ]}
        valor={u.dosePor}
        aoMudar={(v) => muda('dosePor', v)}
      />
      {u.dosePor[0] === 'kg' ? (
        <View style={estilos.frase}>
          <View style={{ width: 90 }}>
            <Campo rotulo="" value={u.dose} onChangeText={(t) => muda('dose', num(t))} keyboardType="decimal-pad" placeholder="1" />
          </View>
          <Text style={estilos.fraseTexto}>{un} para cada</Text>
          <View style={{ width: 90 }}>
            <Campo rotulo="" value={u.cadaKg} onChangeText={(t) => muda('cadaKg', num(t))} keyboardType="decimal-pad" placeholder="100" />
          </View>
          <Text style={estilos.fraseTexto}>kg de peso vivo</Text>
        </View>
      ) : (
        <View style={estilos.frase}>
          <View style={{ width: 90 }}>
            <Campo rotulo="" value={u.dose} onChangeText={(t) => muda('dose', num(t))} keyboardType="decimal-pad" placeholder="5" />
          </View>
          <Text style={estilos.fraseTexto}>{un} por cabeça</Text>
        </View>
      )}

      {erros.dose ? <Text style={estilos.erro}>{erros.dose}</Text> : null}

      <Escolha
        rotulo="Esquema"
        opcoes={[
          { valor: 'unica', rotulo: 'Dose única' },
          { valor: 'reforco', rotulo: 'Com reforço' },
        ]}
        valor={u.esquema}
        aoMudar={(v) => muda('esquema', v)}
      />
      {u.esquema[0] === 'reforco' && (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Reforços" value={u.reforcosQtd} onChangeText={(t) => muda('reforcosQtd', inteiro(t, 2))} keyboardType="number-pad" placeholder="Qtos" />
          </View>
          <View style={{ flex: 1 }}>
            <Campo rotulo="A cada (dias)" value={u.reforcoDias} onChangeText={(t) => muda('reforcoDias', inteiro(t, 3))} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1.1 }}>
            <Campo rotulo={u.dosePor[0] === 'kg' ? `Dose (${un}/${u.cadaKg || '?'} kg)` : `Dose (${un})`} value={u.doseReforco} onChangeText={(t) => muda('doseReforco', num(t))} keyboardType="decimal-pad" placeholder="= inicial" />
          </View>
        </View>
      )}

      {erros.reforco ? <Text style={estilos.erro}>{erros.reforco}</Text> : null}

      <Text style={estilos.titulo}>Carência (dias)</Text>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Para abate" value={u.carenciaCarne} onChangeText={(t) => muda('carenciaCarne', inteiro(t))} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Para leite" value={u.carenciaLeite} onChangeText={(t) => muda('carenciaLeite', inteiro(t))} keyboardType="number-pad" />
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10 },
  erro: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.erro },
  multi: { minHeight: 60, paddingTop: 12, textAlignVertical: 'top' },
  titulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  frase: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 },
  fraseTexto: { fontSize: tam.texto, fontWeight: '600', color: cores.texto, paddingBottom: 14 },
});
