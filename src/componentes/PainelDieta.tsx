import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Alert } from '../lib/alerta';
import { compartilharTexto } from '../lib/web';
import Botao from './Botao';
import Secao from './Secao';
import { formatarMoeda, formatarNumero } from '../lib/formatos';
import { alertas, balanco, eficiencia, textoFicha, type Aptidao, type Item, type Metas } from '../lib/dietas';
import { cores, tam } from '../tema';

const VERDE = '#2F7D3A';
const AMARELO = '#C08A00';
const VERMELHO = cores.erro;

type Props = {
  itens: Item[];
  metas: Metas;
  cms: number | null;
  pv: number | null;
  aptidao: Aptidao;
  gmd?: number | null;
  leite?: number | null;
  cabecas: number;
  tituloFicha: string;
  data: string;
};

/** Balanço da dieta (exigido x fornecido), custos, alertas e a ficha do trato. Só mostra; não altera nada. */
export default function PainelDieta(p: Props) {
  const b = balanco(p.itens);
  const lista = alertas(b, { metas: p.metas, cms: p.cms, pv: p.pv, aptidao: p.aptidao });
  const efic = eficiencia(b, { aptidao: p.aptidao, gmd: p.gmd, leite: p.leite });
  const cab = Math.max(p.cabecas, 0);

  if (b.kgMn <= 0) {
    return <Text style={estilos.nota}>Informe os kg de cada alimento para ver o balanço da dieta.</Text>;
  }

  async function compartilhar() {
    const r = await compartilharTexto(textoFicha({ titulo: p.tituloFicha, data: p.data, cabecas: cab, itens: p.itens, b }));
    if (r === 'copiado') Alert.alert('Ficha copiada', 'O texto da ficha foi copiado. Cole no WhatsApp, no e-mail ou onde quiser.');
  }

  return (
    <View style={{ gap: 12 }}>
      <Secao titulo="Balanço da dieta" />

      <View style={estilos.cards}>
        <Card rotulo="Custo/cab/dia" valor={formatarMoeda(b.custoCab)} />
        <Card rotulo="Custo do lote/dia" valor={cab ? formatarMoeda(b.custoCab * cab) : '–'} />
        <Card rotulo="Consumo (MS)" valor={`${formatarNumero(b.kgMs, 2)} kg`} detalhe={p.cms ? `estimado ${formatarNumero(p.cms, 2)} kg` : undefined} />
        <Card rotulo="Volumoso" valor={`${formatarNumero(b.volumosoPerc, 0)}% da MS`} detalhe={`concentrado ${formatarNumero(100 - b.volumosoPerc, 0)}%`} />
      </View>
      {b.custoKgMs != null && <Text style={estilos.nota}>Custo por kg de MS: {formatarMoeda(b.custoKgMs)}</Text>}
      {efic && <Text style={estilos.nota}>Eficiência alimentar estimada: {efic}</Text>}

      <View style={estilos.caixa}>
        <Text style={estilos.caixaTitulo}>Exigido x Fornecido (% da MS)</Text>
        <Barra rotulo="Proteína (PB)" fornecido={b.pb} meta={p.metas.pb} modo="alvo" />
        <Barra rotulo="Energia (NDT)" fornecido={b.ndt} meta={p.metas.ndt} modo="alvo" />
        <Barra rotulo="Fibra (FDN) mínima" fornecido={b.fdn} meta={p.metas.fdnMin} modo="minimo" />
        {p.cms ? <Barra rotulo="Consumo de MS (kg)" fornecido={b.kgMs} meta={p.cms} modo="alvo" casas={2} sufixo=" kg" /> : null}
      </View>

      {lista.length === 0 ? (
        <View style={[estilos.alerta, { borderLeftColor: VERDE }]}>
          <Text style={[estilos.alertaTexto, { color: VERDE }]}>Dieta dentro das metas informadas.</Text>
        </View>
      ) : (
        lista.map((a, i) => (
          <View key={i} style={[estilos.alerta, { borderLeftColor: a.nivel === 'vermelho' ? VERMELHO : AMARELO }]}>
            <Text style={[estilos.alertaTexto, { color: a.nivel === 'vermelho' ? VERMELHO : AMARELO }]}>
              {a.nivel === 'vermelho' ? '🛑 ' : '⚠️ '}
              {a.texto}
            </Text>
          </View>
        ))
      )}

      <Secao titulo="Ficha do trato" />
      <View style={estilos.caixa}>
        <View style={estilos.linhaFicha}>
          <Text style={[estilos.th, { flex: 1 }]}>Alimento</Text>
          <Text style={[estilos.th, estilos.num]}>kg/cab</Text>
          <Text style={[estilos.th, estilos.num]}>{cab ? `${formatarNumero(cab)} cab.` : 'lote'}</Text>
        </View>
        {p.itens
          .filter((i) => i.kg_mn > 0)
          .map((i) => (
            <View key={i.chave} style={estilos.linhaFicha}>
              <Text style={[estilos.td, { flex: 1 }]}>{i.nome}</Text>
              <Text style={[estilos.td, estilos.num]}>{formatarNumero(i.kg_mn, 2)}</Text>
              <Text style={[estilos.td, estilos.num]}>{cab ? formatarNumero(i.kg_mn * cab, 1) : '–'}</Text>
            </View>
          ))}
        <View style={[estilos.linhaFicha, { borderTopWidth: 1, borderTopColor: cores.borda }]}>
          <Text style={[estilos.th, { flex: 1 }]}>Total (matéria natural)</Text>
          <Text style={[estilos.th, estilos.num]}>{formatarNumero(b.kgMn, 2)}</Text>
          <Text style={[estilos.th, estilos.num]}>{cab ? formatarNumero(b.kgMn * cab, 1) : '–'}</Text>
        </View>
      </View>
      <Botao titulo="Enviar ficha do trato (WhatsApp…)" tipo="secundario" onPress={compartilhar} />
    </View>
  );
}

function Card({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.cardRotulo}>{rotulo}</Text>
      <Text style={estilos.cardValor}>{valor}</Text>
      {detalhe ? <Text style={estilos.cardDetalhe}>{detalhe}</Text> : null}
    </View>
  );
}

/** Barra de atendimento: "alvo" = verde perto da meta; "minimo" = verde a partir da meta. */
function Barra({ rotulo, fornecido, meta, modo, casas = 1, sufixo = '%' }: { rotulo: string; fornecido: number; meta: number; modo: 'alvo' | 'minimo'; casas?: number; sufixo?: string }) {
  const r = meta > 0 ? fornecido / meta : 0;
  const cor =
    modo === 'minimo'
      ? r >= 1 ? VERDE : r >= 0.9 ? AMARELO : VERMELHO
      : r >= 0.97 && r <= 1.1 ? VERDE : r >= 0.9 && r <= 1.25 ? AMARELO : VERMELHO;
  const largura = `${Math.min(r / 1.5, 1) * 100}%` as const;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={estilos.barraRotulo}>{rotulo}</Text>
        <Text style={[estilos.barraValor, { color: cor }]}>
          {formatarNumero(fornecido, casas)}{sufixo} <Text style={estilos.barraMeta}>/ {modo === 'minimo' ? 'mín. ' : ''}{formatarNumero(meta, casas)}{sufixo}</Text>
        </Text>
      </View>
      <View style={estilos.trilho}>
        <View style={[estilos.preenche, { width: largura, backgroundColor: cor }]} />
        <View style={estilos.marcaMeta} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '46%', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10, gap: 2 },
  cardRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  cardValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  cardDetalhe: { fontSize: tam.pequeno - 1, color: cores.textoSuave },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 12 },
  caixaTitulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  barraRotulo: { fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600' },
  barraValor: { fontSize: tam.pequeno + 1, fontWeight: '800' },
  barraMeta: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  trilho: { height: 12, borderRadius: 6, backgroundColor: cores.fundo, overflow: 'hidden' },
  preenche: { height: 12, borderRadius: 6 },
  // a meta fica em 2/3 da barra (100% de 150%)
  marcaMeta: { position: 'absolute', left: '66.6%', top: 0, bottom: 0, width: 2, backgroundColor: cores.texto },
  alerta: { borderLeftWidth: 4, borderRadius: 6, padding: 10, backgroundColor: cores.cartao },
  alertaTexto: { fontSize: tam.pequeno + 1, lineHeight: 20, fontWeight: '600' },
  linhaFicha: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  th: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  td: { fontSize: tam.pequeno + 1, color: cores.texto },
  num: { width: 80, textAlign: 'right' },
});
