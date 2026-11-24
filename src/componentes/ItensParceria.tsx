import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Campo from './Campo';
import CaixaEscolha from './CaixaEscolha';
import { CampoFerro, CampoRaca } from './CamposApoio';
import { NASCIMENTO_FAIXA, lerNascimento } from './CampoNascimento';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { doBanco } from '../lib/datas';
import { formatarNumero, lerNumero, numeroParaCampo } from '../lib/formatos';
import { FAIXAS_IDADE, chaveFaixa, faixaDaIdade, faixaPorChave, type Sexo } from '../lib/faixas';
import { mesesEntre } from '../lib/rebanho';
import { cores, tam } from '../tema';

/**
 * V207: itens da Entrada por parceria (como os da venda de gado, sem preço).
 * Cada item: pesagem (opcional, só puxa os dados), quantidade, sexo, idade (faixa), raça, lote, ferro e peso.
 * O lote digitado que não existe é cadastrado ao lançar, com os dados do item. V208: o lote é opcional.
 */
export type ItemParceria = {
  chave: string;
  numPesagem: string;
  pesagemTexto: string;
  quantidade: string;
  sexo: '' | Sexo;
  faixa: string; // chave da faixa: "M13", "F0"...
  racaId: string | null;
  lote: string;
  ferroId: string | null;
  peso: string;
};

let cont = 0;
const chave = () => `p${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t) ?? 0;

export const itemParceriaVazio = (): ItemParceria => ({
  chave: chave(), numPesagem: '', pesagemTexto: '', quantidade: '', sexo: '', faixa: '', racaId: null, lote: '', ferroId: null, peso: '',
});
/** "Igual ao anterior": copia tudo, menos a pesagem, a quantidade e o peso. */
export const copiarItemParceria = (it: ItemParceria): ItemParceria => ({ ...it, chave: chave(), numPesagem: '', pesagemTexto: '', quantidade: '', peso: '' });

export const cabecasParceria = (itens: ItemParceria[]) => itens.reduce((t, it) => t + Math.max(0, Math.floor(n(it.quantidade))), 0);
export const pesoParceria = (itens: ItemParceria[]) => itens.reduce((t, it) => t + n(it.peso), 0);

/** Confere os itens; devolve os erros por item ("i1", "i2"...). Rendimento exige o peso de cada item. */
export function validarItensParceria(itens: ItemParceria[], exigePeso: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  itens.forEach((it, i) => {
    const q = Number(it.quantidade || 0);
    let msg = '';
    if (!Number.isInteger(q) || q < 1 || q > 5000) msg = 'informe a quantidade (de 1 a 5.000 cabeças).';
    else if (!it.sexo) msg = 'escolha o sexo.';
    else if (!it.faixa) msg = 'escolha a idade (animal não entra sem idade).';
    else if (it.peso.trim() && n(it.peso) <= 0) msg = 'peso inválido. Ex.: 1.250,5';
    else if (exigePeso && n(it.peso) <= 0) msg = 'na parceria por rendimento, informe o peso (kg).';
    if (msg) e[`i${i + 1}`] = `Item ${i + 1}: ${msg}`;
  });
  return e;
}

/** O que vai para o banco (lancar_entrada_parceria_itens › itens). */
export function itensParceriaParaBanco(itens: ItemParceria[], baseIso: string) {
  return itens.map((it) => {
    const nasc = lerNascimento({ ...NASCIMENTO_FAIXA, faixa: it.faixa }, baseIso);
    return {
      quantidade: Number(it.quantidade),
      sexo: it.sexo,
      raca: it.racaId ?? '',
      ferro: it.ferroId ?? '',
      lote: Number(it.lote) > 0 ? Number(it.lote) : '', // V208: opcional (informa-se depois em Pecuário › Parcerias)
      nascimento: nasc.iso ?? '',
      nasc_aprox: true,
      peso_total: n(it.peso) > 0 ? n(it.peso) : '',
    };
  });
}

type Props = {
  itens: ItemParceria[];
  setItens: React.Dispatch<React.SetStateAction<ItemParceria[]>>;
  fid: string;
  dataIso: string;
  erros: Record<string, string>;
  /** a pesagem trouxe data e pessoa (preenche a tela se ainda estiverem vazias) */
  aoPuxarPesagem?: (x: { data: string; pessoaId: string | null }) => void;
};

export default function ItensParceria({ itens, setItens, fid, dataIso, erros, aoPuxarPesagem }: Props) {
  const [puxando, setPuxando] = useState<string | null>(null);
  const [erroPes, setErroPes] = useState<Record<string, string>>({});
  const mudar = (k: string, m: Partial<ItemParceria>) => setItens((l) => l.map((x) => (x.chave === k ? { ...x, ...m } : x)));

  async function puxar(it: ItemParceria) {
    setErroPes((e) => ({ ...e, [it.chave]: '' }));
    const num = Number(it.numPesagem);
    if (!Number.isInteger(num) || num < 1) return setErroPes((e) => ({ ...e, [it.chave]: 'Informe o nº da pesagem.' }));
    setPuxando(it.chave);
    try {
      const lista = await consulta<any[]>(
        supabase
          .from('pesagens')
          .select('id, numero, data, sexo, raca_id, ferro_id, nascimento_ref, origem_pessoa_id, itens:pesagem_itens ( quantidade, peso_bruto_kg )')
          .eq('fazenda_id', fid)
          .eq('numero', num)
          .limit(1),
      );
      const x = lista[0];
      if (!x) return setErroPes((e) => ({ ...e, [it.chave]: `Pesagem nº ${num} não encontrada nesta fazenda.` }));
      const its = (x.itens ?? []) as { quantidade: number; peso_bruto_kg: number }[];
      const cab = its.reduce((s, i) => s + i.quantidade, 0);
      const kg = its.reduce((s, i) => s + Number(i.peso_bruto_kg), 0);
      const sx = (String(x.sexo ?? '').trim() || it.sexo) as '' | Sexo;
      mudar(it.chave, {
        pesagemTexto: `Pesagem nº ${x.numero}: ${formatarNumero(cab)} cab., ${formatarNumero(kg, 1)} kg, em ${doBanco(x.data)}.`,
        quantidade: String(cab),
        peso: numeroParaCampo(kg),
        ...(sx ? { sexo: sx } : {}),
        ...(x.raca_id ? { racaId: x.raca_id } : {}),
        ...(x.ferro_id ? { ferroId: x.ferro_id } : {}),
        ...(sx && x.nascimento_ref ? { faixa: chaveFaixa(faixaDaIdade(sx, mesesEntre(x.nascimento_ref, dataIso))) } : {}),
      });
      aoPuxarPesagem?.({ data: doBanco(x.data), pessoaId: x.origem_pessoa_id ?? null });
    } catch (e) {
      setErroPes((er) => ({ ...er, [it.chave]: traduzirErro(e) }));
    } finally {
      setPuxando(null);
    }
  }

  const cabTot = cabecasParceria(itens);
  const pesoTot = pesoParceria(itens);

  return (
    <View style={{ gap: 12 }}>
      {itens.map((it, i) => {
        const erro = erros[`i${i + 1}`];
        const q = Number(it.quantidade || 0);
        const kg = n(it.peso);
        return (
          <View key={it.chave} style={[estilos.item, !!erro && { borderColor: cores.erro }]}>
            <View style={estilos.topo}>
              <Text style={estilos.num}>Item {i + 1}</Text>
              {itens.length > 1 && (
                <Pressable onPress={() => setItens((ls) => ls.filter((x) => x.chave !== it.chave))} hitSlop={10} accessibilityLabel={`Tirar o item ${i + 1}`}>
                  <Ionicons name="close-circle" size={26} color={cores.textoSuave} />
                </Pressable>
              )}
            </View>
            <View style={estilos.grade}>
              <View style={{ width: 110 }}>
                <Campo
                  rotulo="Pesagem nº"
                  value={it.numPesagem}
                  onChangeText={(t) => mudar(it.chave, { numPesagem: t.replace(/\D/g, '').slice(0, 6), pesagemTexto: '' })}
                  keyboardType="number-pad"
                  placeholder="Opcional"
                />
              </View>
              <Pressable onPress={() => puxar(it)} style={estilos.botaoPuxar} accessibilityRole="button" disabled={puxando === it.chave}>
                <Text style={estilos.botaoTexto}>{puxando === it.chave ? '…' : 'Puxar'}</Text>
              </Pressable>
              <View style={{ width: 90 }}>
                <Campo rotulo="Qtde." value={it.quantidade} onChangeText={(t) => mudar(it.chave, { quantidade: t.replace(/\D/g, '').slice(0, 4) })} keyboardType="number-pad" />
              </View>
              <CaixaEscolha
                rotulo="Sexo"
                largura={110}
                valor={it.sexo}
                opcoes={[
                  { valor: 'M', rotulo: 'Machos' },
                  { valor: 'F', rotulo: 'Fêmeas' },
                ]}
                aoMudar={(v) => mudar(it.chave, { sexo: v as Sexo, faixa: it.faixa && it.faixa[0] === v ? it.faixa : '' })}
              />
              <CaixaEscolha
                rotulo="Idade"
                largura={150}
                valor={it.faixa}
                fixo={!it.sexo ? 'escolha o sexo' : null}
                opcoes={it.sexo ? FAIXAS_IDADE[it.sexo].map((f) => ({ valor: chaveFaixa(f), rotulo: f.rotulo })) : []}
                aoMudar={(v) => mudar(it.chave, { faixa: v })}
              />
              <View style={{ width: 210 }}>
                <CampoRaca valorId={it.racaId} aoMudar={(v) => mudar(it.chave, { racaId: v })} />
              </View>
              <View style={{ width: 90 }}>
                <Campo rotulo="Lote nº" value={it.lote} onChangeText={(t) => mudar(it.chave, { lote: t.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" placeholder="Opcional" />
              </View>
              <View style={{ width: 210 }}>
                <CampoFerro valorId={it.ferroId} aoMudar={(v) => mudar(it.chave, { ferroId: v })} />
              </View>
              <View style={{ width: 120 }}>
                <Campo rotulo="Peso kg" value={it.peso} onChangeText={(t) => mudar(it.chave, { peso: t.replace(/[^\d.,]/g, '') })} keyboardType="decimal-pad" />
              </View>
            </View>
            {erroPes[it.chave] ? <Text style={estilos.erro}>{erroPes[it.chave]}</Text> : null}
            {it.pesagemTexto ? <Text style={estilos.nota}>{it.pesagemTexto} Complete o que faltar.</Text> : null}
            {q > 0 && kg > 0 ? (
              <Text style={estilos.nota}>
                Peso médio {formatarNumero(kg / q, 2)} kg · {formatarNumero(kg / q / 30, 2)} @ (de 30 kg)
                {it.faixa ? ` · ${faixaPorChave(it.faixa)?.rotulo ?? ''}` : ''}
              </Text>
            ) : null}
            {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
          </View>
        );
      })}
      <View style={estilos.linhaBotoes}>
        <Pressable onPress={() => setItens((l) => [...l, copiarItemParceria(l[l.length - 1] ?? itemParceriaVazio())])} style={estilos.botaoAdd} accessibilityRole="button">
          <Ionicons name="copy-outline" size={18} color={cores.primaria} />
          <Text style={estilos.addTexto}>Item igual ao anterior</Text>
        </Pressable>
        <Pressable onPress={() => setItens((l) => [...l, itemParceriaVazio()])} style={estilos.botaoAdd} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={18} color={cores.primaria} />
          <Text style={estilos.addTexto}>Item em branco</Text>
        </Pressable>
      </View>
      {itens.length > 1 && cabTot > 0 ? (
        <View style={estilos.resumo}>
          <Text style={estilos.resumoTexto}>
            Total: {formatarNumero(cabTot)} cab.{pesoTot > 0 ? ` · ${formatarNumero(pesoTot, 1)} kg (média ${formatarNumero(pesoTot / cabTot, 2)} kg)` : ''}
          </Text>
        </View>
      ) : null}
      <Text style={estilos.nota}>Os animais entram sem brinco; a identificação é feita depois, no cadastro de cada animal. Lote é opcional: sem ele, os animais ficam sem lote e o lote é informado depois em Pecuário › Parcerias (para a saída, os animais precisam estar num lote). Lote que não existe é cadastrado ao lançar, com o sexo, a raça, o ferro e a idade do item.</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
  botaoPuxar: { width: 70, minHeight: tam.alturaToque, marginTop: 26, borderRadius: tam.raio, borderWidth: 1.5, borderColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primaria },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  resumo: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 10 },
  resumoTexto: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 21 },
  linhaBotoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  botaoAdd: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  addTexto: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
});
