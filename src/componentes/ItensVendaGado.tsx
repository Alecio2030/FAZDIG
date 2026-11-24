import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Campo from './Campo';
import CampoMoeda from './CampoMoeda';
import CaixaEscolha from './CaixaEscolha';
import SeletorAnimais, { type AnimalSel } from './SeletorAnimais';
import { CampoFerro, CampoRaca } from './CamposApoio';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { doBanco } from '../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, moedaParaCampo, numeroParaCampo } from '../lib/formatos';
import { FAIXAS_IDADE, faixaDaIdade, type Sexo } from '../lib/faixas';
import { mesesEntre } from '../lib/rebanho';
import { calcularItemGado, r2v, type FormaPreco } from '../lib/vendas';
import { cores, tam } from '../tema';

/** V203: um item da venda de gado (uma linha da nota). */
export type ItemGado = {
  chave: string;
  numPesagem: string;
  pesagem: { id: string; numero: number; texto: string } | null;
  quantidade: string;
  sexo: '' | Sexo;
  faixa: string; // início da faixa de idade, em meses ("0", "13"...)
  racaId: string | null;
  lote: string; // nº do lote digitado (vazio = do rebanho, por sexo e idade)
  ferroId: string | null;
  animais: string[]; // brincos escolhidos (no lote ou, sem lote, no rebanho da fazenda)
  /** V204: sem lote, os brincos marcados definem sexo e idade; aqui o problema, se houver (sexos ou faixas diferentes, sem nascimento) */
  erroBrincos?: string;
  verBrincos: boolean;
  peso: string;
  barrigaTipo: 'perc' | 'kg_cab';
  barriga: string;
  kgArroba: string;
  forma: FormaPreco;
  preco: string;
};

export type LoteVenda = {
  id: string; numero: number; descricao: string | null; sexo: Sexo | null; raca_id: string | null; ferro_id: string | null;
  nascimento_ref: string | null; controle_individual: boolean | null; cabecas: number;
};
export type SaldoFaixa = { sexo: Sexo; idade_de: number; cabecas: number };

let cont = 0;
const chave = () => `g${Date.now()}_${cont++}`;
const n = (t: string) => lerNumero(t) ?? 0;

export const itemGadoVazio = (): ItemGado => ({
  chave: chave(), numPesagem: '', pesagem: null, quantidade: '', sexo: '', faixa: '', racaId: null, lote: '', ferroId: null,
  animais: [], verBrincos: false, peso: '', barrigaTipo: 'perc', barriga: '', kgArroba: '30', forma: 'arroba', preco: '',
});

/** "Igual ao anterior": copia tudo, menos a pesagem, os brincos e o peso (que são de cada item). */
export const copiarItemGado = (it: ItemGado): ItemGado => ({ ...it, chave: chave(), numPesagem: '', pesagem: null, animais: [], verBrincos: false, peso: '', erroBrincos: '' });

/** Lotes ativos da fazenda, com as cabeças de cada um. */
export function useLotesVenda(fid: string | undefined) {
  const [lotes, setLotes] = useState<LoteVenda[]>([]);
  useEffect(() => {
    if (!fid) return;
    Promise.all([
      consulta<any[]>(supabase.from('lotes').select('id, numero, descricao, sexo, raca_id, ferro_id, nascimento_ref, controle_individual').eq('fazenda_id', fid).eq('situacao', 'ativo').order('numero')),
      consulta<any[]>(supabase.from('animais').select('lote_id').eq('fazenda_id', fid).eq('situacao', 'ativo').not('lote_id', 'is', null)),
    ])
      .then(([ls, as]) => {
        const c: Record<string, number> = {};
        for (const a of as) c[a.lote_id] = (c[a.lote_id] ?? 0) + 1;
        setLotes(ls.map((l) => ({ ...l, sexo: (l.sexo?.trim() || null) as Sexo | null, cabecas: c[l.id] ?? 0 })));
      })
      .catch(() => setLotes([]));
  }, [fid]);
  return lotes;
}

const loteDo = (it: ItemGado, lotes: LoteVenda[]) => (it.lote.trim() ? lotes.find((l) => String(l.numero) === it.lote.trim()) ?? null : null);
export const cabecasItem = (it: ItemGado) => (it.animais.length ? it.animais.length : Math.max(0, Math.floor(n(it.quantidade))));
export const sexoItem = (it: ItemGado, lotes: LoteVenda[]): '' | Sexo => loteDo(it, lotes)?.sexo ?? it.sexo;
const faixaDe = (sx: '' | Sexo, de: string) => (sx ? FAIXAS_IDADE[sx].find((f) => String(f.de) === de) ?? null : null);

export function calcItem(it: ItemGado) {
  return calcularItemGado({ cabecas: cabecasItem(it), pesoBruto: n(it.peso), kgArroba: n(it.kgArroba), barrigaTipo: it.barrigaTipo, barrigaValor: n(it.barriga), forma: it.forma, preco: n(it.preco) });
}

/** Confere os itens; devolve os erros (chave "g1", "g2"... e "gEstoque"). */
export function validarItensGado(itens: ItemGado[], lotes: LoteVenda[], estoque: SaldoFaixa[] | null, bloquearSemSaldo: boolean, nomeEstoque: string): Record<string, string> {
  const e: Record<string, string> = {};
  const usoFaixa: Record<string, number> = {};
  const usoLote: Record<string, number> = {};
  const pesagens = new Set<string>();
  itens.forEach((it, i) => {
    const k = `Item ${i + 1}: `;
    const cab = cabecasItem(it);
    const l = loteDo(it, lotes);
    const c = calcItem(it);
    let msg = '';
    if (it.lote.trim() && !l) msg = `não há lote ativo nº ${it.lote.trim()}.`;
    else if (!l && it.animais.length && it.erroBrincos) msg = it.erroBrincos;
    else if (!l && !it.sexo) msg = 'informe o sexo (ou o lote).';
    else if (!l && !it.faixa) msg = 'informe a idade (ou o lote).';
    else if (cab < 1) msg = 'informe a quantidade de cabeças.';
    else if (l && cab > l.cabecas) msg = `o lote nº ${l.numero} só tem ${formatarNumero(l.cabecas)} cabeças.`;
    else if (it.forma !== 'cabeca' && n(it.peso) <= 0) msg = 'informe o peso bruto (kg).';
    else if (it.forma === 'arroba' && n(it.kgArroba) <= 0) msg = 'informe os kg da arroba.';
    else if (n(it.barriga) > 0 && c.pesoLiquido <= 0) msg = 'o desconto de barriga não pode zerar o peso.';
    else if (n(it.preco) <= 0) msg = 'informe o preço (por arroba, por kg ou por cabeça).';
    else if (it.pesagem && pesagens.has(it.pesagem.id)) msg = `a pesagem nº ${it.pesagem.numero} já está em outro item.`;
    if (it.pesagem) pesagens.add(it.pesagem.id);
    if (msg) e[`g${i + 1}`] = k + msg;
    if (l) usoLote[l.id] = (usoLote[l.id] ?? 0) + cab;
    else if (it.sexo && it.faixa) usoFaixa[`${it.sexo}${it.faixa}`] = (usoFaixa[`${it.sexo}${it.faixa}`] ?? 0) + cab;
  });
  for (const [id, q] of Object.entries(usoLote)) {
    const l = lotes.find((x) => x.id === id)!;
    if (q > l.cabecas) e.gEstoque = `Os itens tiram ${formatarNumero(q)} cabeças do lote nº ${l.numero}, que só tem ${formatarNumero(l.cabecas)}.`;
  }
  if (estoque && bloquearSemSaldo) {
    for (const [ch, q] of Object.entries(usoFaixa)) {
      const sx = ch[0] as Sexo;
      const de = ch.slice(1);
      const tem = estoque.find((x) => x.sexo === sx && String(x.idade_de) === de)?.cabecas ?? 0;
      if (q > tem) e.gEstoque = `${nomeEstoque} há ${formatarNumero(tem)} ${sx === 'M' ? 'machos' : 'fêmeas'} de ${faixaDe(sx, de)?.rotulo ?? ''}, e os itens somam ${formatarNumero(q)}.`;
    }
  }
  return e;
}

/** O que vai para o banco (salvar_venda › itens_gado). */
export function itensGadoParaBanco(itens: ItemGado[], lotes: LoteVenda[]) {
  return itens.map((it) => {
    const l = loteDo(it, lotes);
    const f = faixaDe(it.sexo, it.faixa);
    const c = calcItem(it);
    return {
      lote_origem: l?.id ?? '',
      quantidade: it.animais.length ? 0 : cabecasItem(it),
      // V204: brincos também sem lote (saem do rebanho da fazenda)
      animais: it.animais,
      sexo: l ? l.sexo ?? '' : it.sexo,
      idade_de: l ? '' : it.faixa,
      idade_ate: l ? '' : String(f?.ate ?? ''),
      raca_id: it.racaId ?? '',
      ferro_id: it.ferroId ?? '',
      pesagem: it.pesagem?.id ?? '',
      peso_bruto: n(it.peso) || '',
      forma_preco: it.forma,
      preco: n(it.preco),
      kg_arroba: n(it.kgArroba) || 30,
      barriga_tipo: n(it.barriga) > 0 ? it.barrigaTipo : '',
      barriga_valor: n(it.barriga) > 0 ? n(it.barriga) : '',
      valor: c.valor,
    };
  });
}

type Props = {
  itens: ItemGado[];
  setItens: React.Dispatch<React.SetStateAction<ItemGado[]>>;
  lotes: LoteVenda[];
  fid: string;
  dataIso: string;
  estoque: SaldoFaixa[] | null;
  nomeEstoque: string;
  erros: Record<string, string>;
  /** a pesagem trouxe data e comprador (preenche o cabeçalho se ainda estiver vazio) */
  aoPuxarPesagem?: (x: { data: string; pessoaId: string | null }) => void;
};

/** V203: itens da venda de gado em caixinhas lado a lado (no celular, quebram em linhas). */
export default function ItensVendaGado({ itens, setItens, lotes, fid, dataIso, estoque, nomeEstoque, erros, aoPuxarPesagem }: Props) {
  const [puxando, setPuxando] = useState<string | null>(null);
  const [erroPes, setErroPes] = useState<Record<string, string>>({});
  const mudar = (k: string, m: Partial<ItemGado>) => setItens((l) => l.map((x) => (x.chave === k ? { ...x, ...m } : x)));
  const saldo = (sx: '' | Sexo, de: number) => estoque?.find((x) => x.sexo === sx && x.idade_de === de)?.cabecas ?? 0;

  /** V204: brincos marcados sem lote: o sexo e a idade do item saem dos próprios animais. */
  function brincosSemLote(it: ItemGado, ids: string[], dados: AnimalSel[]) {
    if (!ids.length) return mudar(it.chave, { animais: [], erroBrincos: '' });
    const sexos = [...new Set(dados.map((a) => a.sexo).filter(Boolean))] as Sexo[];
    const semNasc = dados.filter((a) => !a.data_nascimento);
    let erroB = '';
    let faixa = '';
    if (sexos.length > 1) erroB = 'os brincos de um item têm de ser do mesmo sexo (na nota, cada sexo é um item).';
    else if (semNasc.length) erroB = `o animal ${semNasc[0].brinco ?? semNasc[0].numero_interno} está sem data de nascimento: acerte o cadastro dele.`;
    else if (sexos.length === 1) {
      const fs = [...new Set(dados.map((a) => faixaDaIdade(sexos[0], mesesEntre(a.data_nascimento!, dataIso)).de))];
      if (fs.length > 1) erroB = 'os brincos de um item têm de ser da mesma faixa de idade (na nota, cada faixa é um item): separe em outro item.';
      else faixa = String(fs[0]);
    }
    mudar(it.chave, { animais: ids, erroBrincos: erroB, ...(sexos.length === 1 ? { sexo: sexos[0] } : {}), ...(faixa ? { faixa } : {}) });
  }

  async function puxar(it: ItemGado) {
    setErroPes((e) => ({ ...e, [it.chave]: '' }));
    const num = Number(it.numPesagem);
    if (!Number.isInteger(num) || num < 1) return setErroPes((e) => ({ ...e, [it.chave]: 'Informe o nº da pesagem.' }));
    if (itens.some((x) => x.chave !== it.chave && x.pesagem?.numero === num)) return setErroPes((e) => ({ ...e, [it.chave]: `A pesagem nº ${num} já está em outro item.` }));
    setPuxando(it.chave);
    try {
      const lista = await consulta<any[]>(
        supabase
          .from('pesagens')
          .select('id, numero, data, lote_id, sexo, raca_id, ferro_id, nascimento_ref, destino_pessoa_id, peso_arroba, itens:pesagem_itens ( quantidade, peso_bruto_kg ), mov:movimentacoes ( id )')
          .eq('fazenda_id', fid)
          .eq('numero', num)
          .limit(1),
      );
      const x = lista[0];
      if (!x) return setErroPes((e) => ({ ...e, [it.chave]: `Pesagem nº ${num} não encontrada nesta fazenda.` }));
      if ((Array.isArray(x.mov) ? x.mov : x.mov ? [x.mov] : []).length) return setErroPes((e) => ({ ...e, [it.chave]: `A pesagem nº ${num} já foi usada em outra movimentação ou venda.` }));
      const its = x.itens as { quantidade: number; peso_bruto_kg: number }[];
      const cab = its.reduce((s, i) => s + i.quantidade, 0);
      const kg = its.reduce((s, i) => s + Number(i.peso_bruto_kg), 0);
      const l = x.lote_id ? lotes.find((y) => y.id === x.lote_id) : null;
      const sx = (String(x.sexo ?? '').trim() || l?.sexo || '') as '' | Sexo;
      const nasc = x.nascimento_ref ?? l?.nascimento_ref ?? null;
      mudar(it.chave, {
        pesagem: { id: x.id, numero: x.numero, texto: `${formatarNumero(cab)} cab., ${formatarNumero(kg, 1)} kg brutos, em ${doBanco(x.data)}` },
        quantidade: String(cab),
        peso: numeroParaCampo(kg),
        animais: [],
        ...(Number(x.peso_arroba) > 0 ? { kgArroba: numeroParaCampo(x.peso_arroba) } : {}),
        ...(l ? { lote: String(l.numero) } : {}),
        ...(sx ? { sexo: sx } : {}),
        ...(x.raca_id ? { racaId: x.raca_id } : l?.raca_id ? { racaId: l.raca_id } : {}),
        ...(x.ferro_id ? { ferroId: x.ferro_id } : l?.ferro_id ? { ferroId: l.ferro_id } : {}),
        ...(!l && sx && nasc ? { faixa: String(faixaDaIdade(sx, mesesEntre(nasc, dataIso)).de) } : {}),
      });
      aoPuxarPesagem?.({ data: doBanco(x.data), pessoaId: x.destino_pessoa_id ?? null });
    } catch (e) {
      setErroPes((er) => ({ ...er, [it.chave]: traduzirErro(e) }));
    } finally {
      setPuxando(null);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {itens.map((it, i) => {
        const l = loteDo(it, lotes);
        const sx = sexoItem(it, lotes);
        const cab = cabecasItem(it);
        const c = calcItem(it);
        const erro = erros[`g${i + 1}`];
        const caixaPreco = (forma: FormaPreco, equivalente: number) => (it.forma === forma ? it.preco : equivalente > 0 ? moedaParaCampo(r2v(equivalente)) : '');
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
                  onChangeText={(t) => mudar(it.chave, { numPesagem: t.replace(/\D/g, '').slice(0, 6), pesagem: null })}
                  keyboardType="number-pad"
                  placeholder="Opcional"
                />
              </View>
              <Pressable onPress={() => puxar(it)} style={estilos.botaoPuxar} accessibilityRole="button" disabled={puxando === it.chave}>
                <Text style={estilos.botaoTexto}>{puxando === it.chave ? '…' : 'Puxar'}</Text>
              </Pressable>
              <View style={{ width: 90 }}>
                <Campo
                  rotulo="Qtde."
                  value={it.animais.length ? String(it.animais.length) : it.quantidade}
                  editable={!it.animais.length}
                  onChangeText={(t) => mudar(it.chave, { quantidade: t.replace(/\D/g, '').slice(0, 5) })}
                  keyboardType="number-pad"
                />
              </View>
              <CaixaEscolha
                rotulo="Sexo"
                largura={110}
                valor={it.sexo}
                fixo={l ? (l.sexo === 'M' ? 'Machos' : l.sexo === 'F' ? 'Fêmeas' : 'do lote') : it.animais.length ? (it.sexo === 'M' ? 'Machos' : it.sexo === 'F' ? 'Fêmeas' : 'dos brincos') : null}
                opcoes={[
                  { valor: 'M', rotulo: 'Machos' },
                  { valor: 'F', rotulo: 'Fêmeas' },
                ]}
                aoMudar={(v) => mudar(it.chave, { sexo: v as Sexo, faixa: '' })}
              />
              <CaixaEscolha
                rotulo="Idade"
                largura={150}
                valor={it.faixa}
                fixo={l ? 'do lote' : it.animais.length ? (faixaDe(sx, it.faixa)?.rotulo ?? 'dos brincos') : !sx ? 'escolha o sexo' : null}
                opcoes={sx ? FAIXAS_IDADE[sx].map((f) => ({ valor: String(f.de), rotulo: f.rotulo, detalhe: estoque ? `${formatarNumero(saldo(sx, f.de))} em estoque` : undefined })) : []}
                aoMudar={(v) => mudar(it.chave, { faixa: v })}
              />
              <View style={{ width: 210 }}>
                <CampoRaca valorId={it.racaId} aoMudar={(v) => mudar(it.chave, { racaId: v })} />
              </View>
              <View style={{ width: 90 }}>
                <Campo
                  rotulo="Lote"
                  value={it.lote}
                  onChangeText={(t) => {
                    const v = t.replace(/\D/g, '').slice(0, 6);
                    const nl = lotes.find((y) => String(y.numero) === v);
                    mudar(it.chave, {
                      lote: v,
                      animais: [],
                      erroBrincos: '',
                      verBrincos: false,
                      ...(nl?.raca_id && !it.racaId ? { racaId: nl.raca_id } : {}),
                      ...(nl?.ferro_id && !it.ferroId ? { ferroId: nl.ferro_id } : {}),
                    });
                  }}
                  keyboardType="number-pad"
                  placeholder="Opcional"
                />
              </View>
              <View style={{ width: 210 }}>
                <CampoFerro valorId={it.ferroId} aoMudar={(v) => mudar(it.chave, { ferroId: v })} />
              </View>
              {/* V204: o Brinco funciona com ou sem lote (sem lote, procura no rebanho da fazenda) */}
              <Pressable
                onPress={() => mudar(it.chave, { verBrincos: !it.verBrincos })}
                style={estilos.botaoBrinco}
                accessibilityRole="button"
                accessibilityLabel={l ? 'Escolher os brincos do lote' : 'Escolher os animais pelo brinco'}
              >
                <Text style={estilos.rotuloBotao}>Brinco</Text>
                <Text style={estilos.botaoTexto}>{it.animais.length ? `${it.animais.length} marcados` : it.verBrincos ? 'Fechar ▴' : 'Escolher ▸'}</Text>
              </Pressable>
              <View style={{ width: 120 }}>
                <Campo rotulo="Peso bruto kg" value={it.peso} onChangeText={(t) => mudar(it.chave, { peso: t })} keyboardType="decimal-pad" />
              </View>
              <CaixaEscolha
                rotulo="Desconto"
                largura={115}
                valor={it.barrigaTipo}
                opcoes={[
                  { valor: 'perc', rotulo: '% / peso' },
                  { valor: 'kg_cab', rotulo: 'kg / cabeça' },
                ]}
                aoMudar={(v) => mudar(it.chave, { barrigaTipo: v as ItemGado['barrigaTipo'] })}
              />
              <View style={{ width: 90 }}>
                <Campo rotulo={it.barrigaTipo === 'perc' ? 'Desc. %' : 'Desc. kg/cab'} value={it.barriga} onChangeText={(t) => mudar(it.chave, { barriga: t })} keyboardType="decimal-pad" placeholder="0" />
              </View>
              <View style={{ width: 95 }}>
                <Campo rotulo="Kg da @" value={it.kgArroba} onChangeText={(t) => mudar(it.chave, { kgArroba: t })} keyboardType="decimal-pad" />
              </View>
              <View style={{ width: 125 }}>
                <CampoMoeda rotulo={`Preço/@${it.forma === 'arroba' ? ' •' : ''}`} valor={caixaPreco('arroba', c.porArroba)} aoMudar={(t) => mudar(it.chave, { forma: 'arroba', preco: t })} />
              </View>
              <View style={{ width: 125 }}>
                <CampoMoeda rotulo={`Preço/kg bruto${it.forma === 'kg' ? ' •' : ''}`} valor={caixaPreco('kg', c.porKg)} aoMudar={(t) => mudar(it.chave, { forma: 'kg', preco: t })} />
              </View>
              <View style={{ width: 135 }}>
                <CampoMoeda rotulo={`Preço/cabeça${it.forma === 'cabeca' ? ' •' : ''}`} valor={caixaPreco('cabeca', c.porCabeca)} aoMudar={(t) => mudar(it.chave, { forma: 'cabeca', preco: t })} />
              </View>
            </View>

            {erroPes[it.chave] ? <Text style={estilos.erro}>{erroPes[it.chave]}</Text> : null}
            {it.pesagem && <Text style={estilos.nota}>Pesagem nº {it.pesagem.numero}: {it.pesagem.texto}. Complete o que faltar.</Text>}
            {it.lote.trim() ? (
              l ? (
                <Text style={estilos.nota}>
                  Lote {l.numero}
                  {l.descricao ? ` – ${l.descricao}` : ''} · {formatarNumero(l.cabecas)} cab. agora{it.animais.length ? '' : ' · saem primeiro os sem brinco'}
                </Text>
              ) : (
                <Text style={[estilos.nota, { color: cores.erro }]}>Não há lote ativo nº {it.lote.trim()} nesta fazenda.</Text>
              )
            ) : sx && it.faixa ? (
              <Text style={estilos.nota}>
                Do rebanho: {formatarNumero(saldo(sx, Number(it.faixa)))} {sx === 'M' ? 'machos' : 'fêmeas'} de {faixaDe(sx, it.faixa)?.rotulo} {nomeEstoque.replace(/^No /, 'no ').replace(/^Na /, 'na ')}.
              </Text>
            ) : null}
            {l && it.verBrincos && <SeletorAnimais loteId={l.id} valor={it.animais} aoMudar={(ids) => mudar(it.chave, { animais: ids })} />}
            {!l && !it.lote.trim() && it.verBrincos && (
              <SeletorAnimais
                fazendaId={fid}
                sexo={it.animais.length ? null : it.sexo || null}
                valor={it.animais}
                aoMudar={() => {}}
                aoMudarDados={(dados) => brincosSemLote(it, dados.map((a) => a.id), dados)}
              />
            )}
            {!l && it.animais.length > 0 && !it.verBrincos ? (
              <Text style={estilos.nota}>{it.animais.length} {it.animais.length === 1 ? 'animal marcado' : 'animais marcados'} pelo brinco, do rebanho da fazenda. Toque em Brinco para ver ou mudar.</Text>
            ) : null}

            {cab > 0 && c.valor > 0 && (
              <View style={estilos.resumo}>
                {c.pesoMedio > 0 && (
                  <Text style={estilos.resumoTexto}>
                    Peso médio {formatarNumero(c.pesoMedio, 2)} kg · {formatarNumero(c.arrobasMedia, 2)} @{c.barrigaKg > 0 ? ` (desconto de ${formatarNumero(c.barrigaKg, 2)} kg)` : ''}
                  </Text>
                )}
                <Text style={estilos.resumoTexto}>
                  Preço médio por cabeça {formatarMoeda(c.porCabeca)} · <Text style={{ fontWeight: '800' }}>Total do item {formatarMoeda(c.valor)}</Text>
                </Text>
              </View>
            )}
            {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
          </View>
        );
      })}
      <View style={estilos.linhaBotoes}>
        <Pressable onPress={() => setItens((l) => [...l, copiarItemGado(l[l.length - 1] ?? itemGadoVazio())])} style={estilos.botaoAdd} accessibilityRole="button">
          <Ionicons name="copy-outline" size={18} color={cores.primaria} />
          <Text style={estilos.addTexto}>Item igual ao anterior</Text>
        </Pressable>
        <Pressable onPress={() => setItens((l) => [...l, itemGadoVazio()])} style={estilos.botaoAdd} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={18} color={cores.primaria} />
          <Text style={estilos.addTexto}>Item em branco</Text>
        </Pressable>
      </View>
      {erros.gEstoque ? <Text style={estilos.erro}>{erros.gEstoque}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
  botaoPuxar: { width: 70, minHeight: tam.alturaToque, marginTop: 26, borderRadius: tam.raio, borderWidth: 1.5, borderColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  botaoBrinco: { width: 110, minHeight: tam.alturaToque + 26, justifyContent: 'flex-end', gap: 6 },
  rotuloBotao: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  botaoTexto: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primaria, minHeight: tam.alturaToque, textAlignVertical: 'center', lineHeight: tam.alturaToque },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  resumo: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 10, gap: 2 },
  resumoTexto: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 21 },
  linhaBotoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  botaoAdd: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  addTexto: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
});
