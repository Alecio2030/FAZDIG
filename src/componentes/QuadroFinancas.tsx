import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSessao } from '../contexto/SessaoContext';
import { lerSaldos, lerTitulosSemana, type Saldos } from '../lib/painel';
import { traduzirErro } from '../lib/supabase';
import { formatarMoeda, formatarNumero } from '../lib/formatos';
import { cores, tam } from '../tema';

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Finanças só pelos totais, somando todas as fazendas: Caixa + Bancos + Aplicações + Contas a receber − Contas a pagar = Saldo.
 * A receber e a pagar: vencidos, de hoje e dos próximos 7 dias (o mesmo critério do painel).
 */
export default function QuadroFinancas() {
  const { fazendas } = useSessao();
  const ids = fazendas.filter((f) => f.financeiro).map((f) => f.id);
  const chave = ids.join(',');
  const [saldos, setSaldos] = useState<Saldos | null>(null);
  const [receber, setReceber] = useState<number | null>(null);
  const [pagar, setPagar] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!chave) return;
    const lista = chave.split(',');
    const falhou = (e: unknown) => setErro(traduzirErro(e));
    lerSaldos().then(setSaldos).catch(falhou);
    lerTitulosSemana(lista, 'receber').then((r) => setReceber(r.total)).catch(falhou);
    lerTitulosSemana(lista, 'pagar').then((r) => setPagar(r.total)).catch(falhou);
  }, [chave]);

  if (!chave) return <Text style={estilos.nota}>Você não tem o Financeiro liberado.</Text>;
  if (erro) return <Text style={[estilos.nota, { color: cores.erro }]}>{erro}</Text>;

  const pronto = !!saldos && receber != null && pagar != null;
  const saldo = pronto ? r2(saldos!.caixa + saldos!.banco + saldos!.aplicacao + receber! - pagar!) : 0;

  return (
    <View style={estilos.quadro}>
      <Linha sinal="" nome="Caixa" valor={saldos?.caixa} />
      <Linha sinal="+" nome="Bancos" valor={saldos?.banco} />
      <Linha sinal="+" nome="Aplicações (disponível)" valor={saldos?.aplicacao} />
      <Linha sinal="+" nome="Contas a receber" valor={receber ?? undefined} />
      <Linha sinal="−" nome="Contas a pagar" valor={pagar ?? undefined} />
      <View style={estilos.total}>
        <Text style={estilos.totalNome}>=  Saldo</Text>
        {pronto ? (
          <Text style={[estilos.totalValor, saldo < 0 && { color: cores.erro }]}>{formatarMoeda(saldo)}</Text>
        ) : (
          <ActivityIndicator color={cores.primaria} />
        )}
      </View>
      <Text style={estilos.nota}>Soma de todas as fazendas. A receber e a pagar: vencidos, de hoje e dos próximos 7 dias. Saldos calculados pelo aplicativo.</Text>
    </View>
  );
}

function Linha({ sinal, nome, valor }: { sinal: string; nome: string; valor: number | undefined }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.sinal}>{sinal}</Text>
      <Text style={estilos.nome}>{nome}</Text>
      <Text style={[estilos.valor, valor != null && valor < 0 && { color: cores.erro }]}>{valor == null ? '…' : formatarNumero(valor, 2)}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { backgroundColor: cores.cartao, borderRadius: tam.raio, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: cores.borda, gap: 6 },
  linha: { flexDirection: 'row', alignItems: 'center' },
  sinal: { width: 18, fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.cafe },
  nome: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto },
  valor: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  total: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 6 },
  totalNome: { flex: 1, fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  totalValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno - 2, color: cores.textoSuave, lineHeight: 16 },
});
