import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import CampoData from './CampoData';
import CampoPessoaBusca from './CampoPessoaBusca';
import Escolha from './Escolha';
import { dataValida, hojeBR, hojeBanco, paraBanco } from '../lib/datas';
import { formatarNumero, lerNumero, numeroParaCampo } from '../lib/formatos';
import { cores, tam } from '../tema';

/**
 * Entrada parcial: medicamento comprado às pressas.
 * Só os dados do medicamento e os frascos que chegaram (entram no estoque).
 * O banco guarda uma compra "a completar": fornecedor, nota, valor e pagamento se completam em Compras.
 */
export type Parcial = { data: string; frascos: string; volume: string; dosePor: string[]; dose: string; cadaKg: string; fornecedor: string | null };

export const parcialVazio = (categoria: string): Parcial => ({
  data: hojeBR(), frascos: '', volume: '', dosePor: [categoria === 'vacina' ? 'cabeca' : 'kg'], dose: '', cadaKg: '', fornecedor: null,
});

/** Unidade em que se aplica: vacina em dose, medicamento em mL. */
export const consumoDaCategoria = (categoria: string) => (categoria === 'vacina' ? 'dose' : 'mL');

const num = (t: string) => t.replace(/[^\d.,]/g, '');

/** Confere os campos; devolve o primeiro problema ou null. */
export function erroParcial(p: Parcial, consumo: string): string | null {
  const iso = paraBanco(p.data);
  if (!dataValida(p.data) || !iso) return 'Data da compra inválida.';
  if (iso > hojeBanco()) return 'A data da compra não pode ser futura.';
  const f = lerNumero(p.frascos);
  if (!f || f <= 0) return 'Informe quantos frascos chegaram.';
  const v = lerNumero(p.volume);
  if (!v || v <= 0) return consumo === 'dose' ? 'Informe quantas doses tem 1 frasco.' : 'Informe o volume do frasco (mL).';
  const d = lerNumero(p.dose);
  if (!d || d <= 0) return 'Informe a dose recomendada.';
  if (p.dosePor[0] === 'kg') {
    const c = lerNumero(p.cadaKg);
    if (!c || c <= 0) return 'Dose por peso: informe para cada quantos kg.';
  }
  return null;
}

const campoNum = (n: any) => numeroParaCampo(n);
/** Produto já cadastrado: volume e dose vêm do cadastro. */
export const parcialDoCadastro = (p: Parcial, i: any): Parcial => ({
  ...p,
  volume: campoNum(i.conteudo_por_unidade),
  dosePor: [i.dose_por ?? 'kg'],
  dose: campoNum(i.dose_recomendada),
  cadaKg: campoNum(i.dose_cada_kg),
});

/** Parâmetro da função entrada_rapida do banco. */
export const parcialParaBanco = (p: Parcial, fazenda: string, nome: string, categoria: string, insumo: string | null = null) => ({
  fazenda, nome, categoria, insumo,
  data: paraBanco(p.data),
  frascos: lerNumero(p.frascos),
  volume: lerNumero(p.volume),
  dose: lerNumero(p.dose),
  dose_por: p.dosePor[0],
  cada_kg: p.dosePor[0] === 'kg' ? lerNumero(p.cadaKg) : null,
  fornecedor: p.fornecedor,
  unidade_consumo: consumoDaCategoria(categoria),
});

type Props = {
  valor: Parcial;
  aoMudar: (p: Parcial) => void;
  categoria: string;
  /** peso por cabeça vindo da aplicação (Sanidade); sem ele, aparece um campo de peso só para conferir a conta */
  peso?: number | null;
};

export default function EntradaParcial({ valor: p, aoMudar, categoria, peso }: Props) {
  const muda = (parte: Partial<Parcial>) => aoMudar({ ...p, ...parte });
  const consumo = consumoDaCategoria(categoria);
  const [pesoConferir, setPesoConferir] = useState('');
  const pesoUsado = peso !== undefined ? peso : lerNumero(pesoConferir);

  const d = lerNumero(p.dose);
  const c = lerNumero(p.cadaKg);
  let calculo: React.ReactNode;
  if (!d) calculo = <Text style={estilos.nota}>Preencha a dose recomendada.</Text>;
  else if (p.dosePor[0] === 'cabeca') calculo = <Text style={estilos.valor}>{formatarNumero(d, 2)} {consumo}</Text>;
  else if (!c) calculo = <Text style={estilos.nota}>Preencha para cada quantos kg.</Text>;
  else if (!pesoUsado) calculo = <Text style={estilos.nota}>{peso !== undefined ? 'Informe o peso para cálculo da dose (acima) para ver a conta.' : 'Informe um peso abaixo para conferir a conta.'}</Text>;
  else {
    const v = Math.round((pesoUsado / c) * d * 100) / 100;
    calculo = (
      <>
        <Text style={estilos.valor}>{formatarNumero(v, 2)} {consumo}</Text>
        <Text style={estilos.nota}>{formatarNumero(pesoUsado, 1)} kg ÷ {formatarNumero(c, 0)} kg × {formatarNumero(d, 2)} {consumo}</Text>
      </>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={estilos.nota}>Para medicamento comprado às pressas: só os dados do medicamento e os frascos que chegaram (entram no estoque). Fornecedor, nota, valor e pagamento se completam depois em Compras.</Text>
      <CampoData rotulo="Data da compra *" valor={p.data} aoMudar={(t) => muda({ data: t })} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Qtde. de frascos *" value={p.frascos} onChangeText={(t) => muda({ frascos: num(t) })} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo={consumo === 'dose' ? 'Doses em 1 frasco *' : 'Volume do frasco (mL) *'} value={p.volume} onChangeText={(t) => muda({ volume: num(t) })} keyboardType="decimal-pad" placeholder={consumo === 'dose' ? '50' : '100'} />
        </View>
      </View>
      <Escolha
        rotulo="Dose recomendada *"
        opcoes={[
          { valor: 'kg', rotulo: 'Por peso vivo' },
          { valor: 'cabeca', rotulo: 'Por cabeça' },
        ]}
        valor={p.dosePor}
        aoMudar={(v) => muda({ dosePor: v })}
      />
      <View style={estilos.frase}>
        <View style={{ width: 80 }}>
          <Campo rotulo="" value={p.dose} onChangeText={(t) => muda({ dose: num(t) })} keyboardType="decimal-pad" placeholder="1" />
        </View>
        <Text style={estilos.fraseTexto}>{consumo} {p.dosePor[0] === 'kg' ? 'para cada' : 'por cabeça'}</Text>
        {p.dosePor[0] === 'kg' && (
          <>
            <View style={{ width: 80 }}>
              <Campo rotulo="" value={p.cadaKg} onChangeText={(t) => muda({ cadaKg: num(t) })} keyboardType="decimal-pad" placeholder="100" />
            </View>
            <Text style={estilos.fraseTexto}>kg</Text>
          </>
        )}
      </View>
      <View style={estilos.calculada}>
        <Text style={estilos.rotulo}>Dose calculada por cabeça</Text>
        {calculo}
      </View>
      {peso === undefined && p.dosePor[0] === 'kg' && (
        <Campo rotulo="Peso do animal para conferir (kg)" value={pesoConferir} onChangeText={(t) => setPesoConferir(num(t))} keyboardType="decimal-pad" placeholder="Ex.: 450" ajuda="Só para conferir a conta; não é gravado." />
      )}
      <CampoPessoaBusca rotulo="Fornecedor (opcional)" valorId={p.fornecedor} aoMudar={(id) => muda({ fornecedor: id })} tipoNovo="fornecedor" />
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10 },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  frase: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 },
  fraseTexto: { fontSize: tam.texto, fontWeight: '600', color: cores.texto, paddingBottom: 14 },
  calculada: { backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  rotulo: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  valor: { fontSize: 22, fontWeight: '800', color: cores.primariaEscura },
});
