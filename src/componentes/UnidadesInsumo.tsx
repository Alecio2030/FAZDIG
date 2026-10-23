import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import Escolha from './Escolha';
import { MEDIDAS, UNIDADES, conversaoDe, ehEmbalagem, fatorEntre, medidaSugerida, nomeUnidade, textoConversao, type Unidades } from '../lib/insumos';
import { cores, tam } from '../tema';

type Props = { valor: Unidades; aoMudar: (u: Unidades) => void; erro?: string | null };

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Unidade de compra (em que se compra e se conta o estoque), com quanto ela tem (Saco: 50 kg),
 * e unidade de consumo (em que se aplica), já com a conversão calculada (1 saco = 50 kg).
 */
export default function UnidadesInsumo({ valor: u, aoMudar, erro }: Props) {
  const compra = u.compra[0];
  const consumo = u.consumo[0];
  const embalagem = ehEmbalagem(compra);
  const outra = !!consumo && !!compra && consumo !== compra;
  const conv = conversaoDe(u);
  const convertido = textoConversao(u);
  // medida gravada que não está na lista (cadastro antigo) continua aparecendo
  const medidas = u.medida[0] && !MEDIDAS.some((m) => m.valor === u.medida[0]) ? [...MEDIDAS, { valor: u.medida[0], rotulo: nomeUnidade(u.medida[0]) }] : MEDIDAS;

  function mudarCompra(v: string[]) {
    const medida = ehEmbalagem(v[0]) ? (u.medida.length && u.medida[0] !== v[0] ? u.medida : medidaSugerida(v[0], consumo)) : [];
    aoMudar({ ...u, compra: v, medida, qtd: ehEmbalagem(v[0]) ? u.qtd : '' });
  }

  // Mudou a medida do conteúdo: se o consumo não converte dela, o consumo passa a ser a própria medida.
  function mudarMedida(v: string[]) {
    const serve = !!consumo && consumo !== compra && fatorEntre(v[0], consumo) !== null;
    aoMudar({ ...u, medida: v, consumo: serve || v[0] === compra ? u.consumo : v });
  }

  return (
    <View style={{ gap: 12 }}>
      <Escolha rotulo="Unidade de compra (e do estoque) *" opcoes={UNIDADES} valor={u.compra} aoMudar={mudarCompra} />
      {embalagem && (
        <View style={estilos.quadro}>
          <View style={estilos.linha}>
            <Text style={estilos.texto}>{maiuscula(nomeUnidade(compra))}:</Text>
            <View style={{ width: 120 }}>
              <Campo rotulo="" value={u.qtd} onChangeText={(t) => aoMudar({ ...u, qtd: t })} keyboardType="decimal-pad" placeholder="Ex.: 50" />
            </View>
            <Text style={estilos.texto}>{u.medida[0] ?? ''}</Text>
          </View>
          <Escolha rotulo={`Medida do conteúdo de 1 ${nomeUnidade(compra)}`} opcoes={medidas.filter((m) => m.valor !== compra)} valor={u.medida} aoMudar={mudarMedida} />
        </View>
      )}

      <Escolha rotulo="Unidade de consumo (em que se aplica) *" opcoes={UNIDADES} valor={u.consumo} aoMudar={(v) => aoMudar({ ...u, consumo: v })} />

      {outra && convertido && conv.automatica && (
        <View style={estilos.convertido}>
          <Text style={estilos.convertidoTexto}>{convertido}</Text>
        </View>
      )}
      {outra && conv.falta === 'conteudo' && (
        <Text style={estilos.nota}>
          Informe acima quanto tem em 1 {nomeUnidade(compra)}: a conversão para {consumo} aparece aqui.
        </Text>
      )}
      {outra && !conv.automatica && conv.falta !== 'conteudo' && (
        <View style={estilos.linha}>
          <Text style={estilos.texto}>
            1 {nomeUnidade(compra)}
            {embalagem && u.qtd && u.medida[0] ? ` (${u.qtd} ${u.medida[0]})` : ''} tem
          </Text>
          <View style={{ width: 110 }}>
            <Campo rotulo="" value={u.conteudo} onChangeText={(t) => aoMudar({ ...u, conteudo: t })} keyboardType="decimal-pad" placeholder="Ex.: 25" />
          </View>
          <Text style={estilos.texto}>{consumo}</Text>
        </View>
      )}
      {outra && (
        <Text style={estilos.nota}>
          O estoque fica em {nomeUnidade(compra)}; o que for aplicado em {consumo} baixa convertido.
        </Text>
      )}
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 },
  texto: { fontSize: tam.texto, fontWeight: '600', color: cores.texto, paddingBottom: 14 },
  convertido: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, paddingVertical: 10, paddingHorizontal: 14 },
  convertidoTexto: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
