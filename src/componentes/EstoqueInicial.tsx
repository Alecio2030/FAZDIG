import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import CampoData from './CampoData';
import Botao from './Botao';
import Aviso from './Aviso';
import Secao from './Secao';
import { supabase, traduzirErro } from '../lib/supabase';
import { perguntar } from '../lib/perguntar';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../lib/datas';
import { formatarMoeda, formatarQtd, lerNumero, numeroParaCampo } from '../lib/formatos';
import { cores, tam } from '../tema';

type Mov = { id: string; data: string; quantidade: number; valor_unitario: number; observacoes: string | null };
type Form = { id: string | null; data: string; qtd: string; unit: string; obs: string };
const NOVO: Form = { id: null, data: hojeBR(), qtd: '', unit: '', obs: '' };

/**
 * V149 – Estoque inicial (implantação) de um produto na fazenda em uso.
 * É a entrada que não veio de compra: o saldo que já existia quando o sistema começou.
 * Aqui se lança, se corrige (quantidade, valor, data) ou se exclui. A compra continua sendo alterada na própria compra.
 */
export default function EstoqueInicial({ insumoId, fazendaId, fazendaNome, unidade, aoMudar }: {
  insumoId: string;
  fazendaId: string;
  fazendaNome: string;
  unidade: string;
  aoMudar: () => void;
}) {
  const [movs, setMovs] = useState<Mov[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('estoque_movimentos')
      .select('id, data, quantidade, valor_unitario, observacoes, compra_id, compra_item_id, venda_id, atividade_id, sanidade_id, sanidade_item_id, sanidade_reforco_id, frota_abastecimento_id, frota_manutencao_id, transferencia_id')
      .eq('fazenda_id', fazendaId)
      .eq('insumo_id', insumoId)
      .eq('tipo', 'entrada')
      .order('data');
    if (error) return setErro(traduzirErro(error));
    // só as entradas "soltas" (sem compra nem outro lançamento de origem)
    const soltas = ((data ?? []) as any[]).filter(
      (m) => !m.compra_id && !m.compra_item_id && !m.venda_id && !m.atividade_id && !m.sanidade_id && !m.sanidade_item_id && !m.sanidade_reforco_id && !m.frota_abastecimento_id && !m.frota_manutencao_id && !m.transferencia_id,
    );
    setMovs(soltas.map((m) => ({ id: m.id, data: m.data, quantidade: Number(m.quantidade), valor_unitario: Number(m.valor_unitario ?? 0), observacoes: m.observacoes })));
  }, [fazendaId, insumoId]);

  useEffect(() => {
    setForm(null);
    setAviso(null);
    setErro(null);
    carregar();
  }, [carregar]);

  const q = form ? lerNumero(form.qtd) : null;
  const u = form ? lerNumero(form.unit) : null;

  async function gravar() {
    if (!form) return;
    setErro(null);
    setAviso(null);
    if (!dataValida(form.data)) return setErro('Informe a data do estoque inicial.');
    if (paraBanco(form.data)! > hojeBanco()) return setErro('A data não pode ser futura.');
    if (q == null || q <= 0) return setErro(`Informe a quantidade em ${unidade}.`);
    if (form.unit.trim() && (u == null || u < 0)) return setErro('Valor unitário inválido.');
    setGravando(true);
    const { error } = await supabase.rpc('salvar_estoque_inicial', {
      p: { id: form.id, fazenda_id: fazendaId, insumo_id: insumoId, data: paraBanco(form.data), quantidade: q, valor_unitario: u ?? 0, observacoes: form.obs.trim() },
    });
    setGravando(false);
    if (error) return setErro(traduzirErro(error));
    setAviso(form.id ? 'Estoque inicial corrigido.' : 'Estoque inicial lançado.');
    setForm(null);
    await carregar();
    aoMudar();
  }

  async function excluir(m: Mov) {
    setErro(null);
    setAviso(null);
    const ok = await perguntar('Excluir estoque inicial', `Excluir a entrada de ${formatarQtd(m.quantidade)} ${unidade} de ${doBanco(m.data)}? O saldo do estoque diminui.`, 'Excluir', 'Voltar');
    if (!ok) return;
    const { error } = await supabase.rpc('excluir_estoque_inicial', { p_id: m.id });
    if (error) return setErro(traduzirErro(error));
    setAviso('Entrada excluída.');
    if (form?.id === m.id) setForm(null);
    await carregar();
    aoMudar();
  }

  return (
    <View style={{ gap: 8 }}>
      <Secao titulo={`Estoque inicial em ${fazendaNome}`} />
      <Text style={estilos.nota}>
        O saldo que já existia quando começou a usar o sistema (não veio de compra). Corrija ou exclua aqui se lançou errado. Entrada de compra se altera na própria compra.
      </Text>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {movs === null ? (
        <Text style={estilos.nota}>Carregando…</Text>
      ) : movs.length === 0 ? (
        <Text style={estilos.nota}>Nenhum estoque inicial lançado para este produto nesta fazenda.</Text>
      ) : (
        movs.map((m) => (
          <View key={m.id} style={[estilos.item, form?.id === m.id && { borderColor: cores.primaria }]}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.itemTitulo}>
                {formatarQtd(m.quantidade)} {unidade} · {doBanco(m.data)}
              </Text>
              <Text style={estilos.nota}>
                {m.valor_unitario ? `${formatarMoeda(m.valor_unitario)} por ${unidade} · total ${formatarMoeda(m.valor_unitario * m.quantidade)}` : 'sem valor'}
                {m.observacoes ? ` · ${m.observacoes}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => setForm({ id: m.id, data: doBanco(m.data), qtd: numeroParaCampo(m.quantidade), unit: m.valor_unitario ? numeroParaCampo(m.valor_unitario) : '', obs: m.observacoes ?? '' })}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={estilos.acao}>Alterar</Text>
            </Pressable>
            <Pressable onPress={() => excluir(m)} hitSlop={8} accessibilityRole="button">
              <Text style={[estilos.acao, { color: cores.erro }]}>Excluir</Text>
            </Pressable>
          </View>
        ))
      )}

      {form ? (
        <View style={estilos.quadro}>
          <Text style={estilos.itemTitulo}>{form.id ? 'Corrigir a entrada' : 'Lançar estoque inicial'}</Text>
          <CampoData rotulo="Data *" valor={form.data} aoMudar={(t) => setForm({ ...form, data: t })} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo={`Quantidade (${unidade}) *`} value={form.qtd} onChangeText={(t) => setForm({ ...form, qtd: t })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo={`Valor por ${unidade} (R$)`} value={form.unit} onChangeText={(t) => setForm({ ...form, unit: t })} keyboardType="decimal-pad" placeholder="0,00" />
            </View>
          </View>
          {q != null && u != null && q > 0 ? <Text style={estilos.nota}>Total {formatarMoeda(q * u)}</Text> : null}
          <Campo rotulo="Observação" value={form.obs} onChangeText={(t) => setForm({ ...form, obs: t })} autoCapitalize="sentences" placeholder="Ex.: contagem do depósito" />
          <Botao titulo={form.id ? 'Salvar a correção' : 'Lançar no estoque'} onPress={gravar} carregando={gravando} />
          <Botao titulo="Cancelar" tipo="secundario" onPress={() => setForm(null)} />
        </View>
      ) : (
        <Botao titulo="+ Lançar estoque inicial" tipo="secundario" onPress={() => setForm({ ...NOVO, data: hojeBR() })} />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 10 },
  itemTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  acao: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primaria },
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 8 },
  linha: { flexDirection: 'row', gap: 10 },
});
