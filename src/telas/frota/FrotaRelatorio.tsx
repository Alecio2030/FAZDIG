import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Vazio from '../../componentes/Vazio';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda, formatarQtd } from '../../lib/formatos';
import { USOS, calcularConsumo, textoConsumo, unidadeMedidor } from '../../lib/frota';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function periodo(p: string): { de: string; ate: string; texto: string } {
  const hoje = hojeBanco();
  const [a, m] = hoje.split('-').map(Number);
  const iso = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
  if (p === 'mes_passado') return { de: iso(a, m - 1, 1), ate: iso(a, m, 0), texto: 'mês passado' };
  if (p === 'ano') return { de: `${a}-01-01`, ate: hoje, texto: 'este ano' };
  if (p === '12m') return { de: iso(a, m - 11, 1), ate: hoje, texto: 'últimos 12 meses' };
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje, texto: 'este mês' };
}

type PorVeiculo = { id: string; nome: string; uso: string; medidor: string; litros: number; comb: number; manut: number; rodado: number | null; consumo: number | null };

/** Frota › Gastos da frota: combustível e manutenção por uso e por veículo, com o custo por km ou por hora. */
export default function FrotaRelatorio() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  const [per, setPer] = useState<string[]>(['mes']);
  const [filtro, setFiltro] = useState<string[]>(['todas']);
  const [linhas, setLinhas] = useState<PorVeiculo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { de, ate, texto } = periodo(per[0]);
  const soEsta = filtro[0] === 'esta';

  const carregar = useCallback(async () => {
    setLinhas(null);
    try {
      let qa = supabase.from('frota_abastecimentos').select('veiculo_id, data, leitura, litros, tanque_cheio, valor_total, arla_valor, uso, veiculo:frota_veiculos ( nome, medidor )').gte('data', de).lte('data', ate);
      let qm = supabase.from('frota_manutencoes').select('veiculo_id, valor_servico, valor_pecas, uso, veiculo:frota_veiculos ( nome, medidor )').gte('data', de).lte('data', ate);
      if (soEsta && fid) {
        qa = qa.eq('fazenda_id', fid);
        qm = qm.eq('fazenda_id', fid);
      }
      const [ab, ma, le] = await Promise.all([
        consulta<any[]>(qa),
        consulta<any[]>(qm),
        consulta<any[]>(supabase.from('frota_leituras_todas').select('veiculo_id, data, leitura').gte('data', de).lte('data', ate)),
      ]);
      // agrupa por veículo e uso (o mesmo veículo pode ter lançamentos de usos diferentes)
      const mapa: Record<string, PorVeiculo> = {};
      const chaveDe = (vid: string, uso: string) => `${vid}|${uso}`;
      const pegar = (x: any): PorVeiculo => {
        const k = chaveDe(x.veiculo_id, x.uso);
        const ve = um(x.veiculo);
        if (!mapa[k]) mapa[k] = { id: x.veiculo_id, nome: ve?.nome ?? '', uso: x.uso, medidor: ve?.medidor ?? 'km', litros: 0, comb: 0, manut: 0, rodado: null, consumo: null };
        return mapa[k];
      };
      for (const a of ab) {
        const l = pegar(a);
        l.litros += Number(a.litros);
        l.comb += Number(a.valor_total ?? 0) + Number(a.arla_valor ?? 0);
      }
      for (const m of ma) pegar(m).manut += Number(m.valor_servico ?? 0) + Number(m.valor_pecas ?? 0);
      for (const l of Object.values(mapa)) {
        const ls = le.filter((x) => x.veiculo_id === l.id).map((x) => Number(x.leitura));
        if (ls.length >= 2 && l.medidor !== 'nenhum') l.rodado = Math.max(...ls) - Math.min(...ls);
        const c = calcularConsumo(ab.filter((a) => a.veiculo_id === l.id).map((a) => ({ data: a.data, leitura: a.leitura == null ? null : Number(a.leitura), litros: Number(a.litros), tanque_cheio: a.tanque_cheio, valor_total: a.valor_total })), l.medidor);
        l.consumo = c.media;
      }
      setLinhas(Object.values(mapa).sort((a, b) => b.comb + b.manut - (a.comb + a.manut)));
    } catch (e) {
      setErro(traduzirErro(e));
      setLinhas([]);
    }
  }, [de, ate, soEsta, fid]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const total = (l: PorVeiculo[]) => l.reduce((s, x) => s + x.comb + x.manut, 0);

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Escolha
        rotulo="Período"
        opcoes={[
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'mes_passado', rotulo: 'Mês passado' },
          { valor: 'ano', rotulo: 'Este ano' },
          { valor: '12m', rotulo: '12 meses' },
        ]}
        valor={per}
        aoMudar={setPer}
      />
      {fazendas.length > 1 && (
        <Escolha
          opcoes={[
            { valor: 'todas', rotulo: 'Todas as fazendas' },
            { valor: 'esta', rotulo: fazendaAtiva?.nome ?? 'Esta fazenda' },
          ]}
          valor={filtro}
          aoMudar={setFiltro}
        />
      )}
      <Text style={estilos.nota}>De {doBanco(de)} a {doBanco(ate)}. Combustível do tanque pelo custo médio do estoque; do posto, pelo valor pago (com o Arla 32). Manutenção = serviço + peças do estoque.</Text>

      {!linhas && <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 24 }} />}
      {linhas && linhas.length === 0 && <Vazio icone="stats-chart-outline" texto={`Nenhum abastecimento ou manutenção ${texto}.`} />}
      {linhas && linhas.length > 0 && (
        <>
          <View style={estilos.resumo}>
            {USOS.map((u) => {
              const doUso = linhas.filter((l) => l.uso === u.valor);
              if (!doUso.length) return null;
              return (
                <View key={u.valor} style={estilos.resumoLinha}>
                  <Text style={estilos.resumoRotulo}>{u.rotulo}</Text>
                  <Text style={estilos.resumoValor}>{formatarMoeda(total(doUso))}</Text>
                </View>
              );
            })}
            <View style={[estilos.resumoLinha, estilos.resumoTotal]}>
              <Text style={[estilos.resumoRotulo, { fontWeight: '800' }]}>Total da frota</Text>
              <Text style={[estilos.resumoValor, { fontWeight: '800' }]}>{formatarMoeda(total(linhas))}</Text>
            </View>
          </View>
          {linhas.some((l) => l.uso === 'particular') && <Text style={estilos.nota}>Particular: não é custo da fazenda. O que a fazenda pagou sai no Resultado como retirada do proprietário (Patrimônio Líquido).</Text>}

          {USOS.map((u) => {
            const doUso = linhas.filter((l) => l.uso === u.valor);
            if (!doUso.length) return null;
            return (
              <View key={u.valor} style={{ gap: tam.espaco }}>
                <Secao titulo={u.rotulo} />
                <Lista>
                  {doUso.map((l) => {
                    const custoUn = l.rodado ? (l.comb + l.manut) / l.rodado : null;
                    const un = unidadeMedidor(l.medidor);
                    return (
                      <Linha
                        key={`${l.id}|${l.uso}`}
                        titulo={l.nome}
                        linhas={[
                          `Combustível ${formatarMoeda(l.comb)} (${formatarQtd(l.litros, 1)} L) · manutenção ${formatarMoeda(l.manut)}`,
                          [l.rodado != null ? `${formatarQtd(l.rodado, 1)} ${un} no período` : null, custoUn != null ? `${formatarMoeda(custoUn)} por ${un}` : null, l.consumo != null ? textoConsumo(l.consumo, l.medidor) : null].filter(Boolean).join(' · '),
                        ]}
                        direita={formatarMoeda(l.comb + l.manut)}
                        onPress={() => navegacao.navigate('VeiculoDetalhe', { id: l.id })}
                      />
                    );
                  })}
                </Lista>
              </View>
            );
          })}
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  resumo: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between' },
  resumoTotal: { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 6 },
  resumoRotulo: { fontSize: tam.texto, color: cores.texto },
  resumoValor: { fontSize: tam.texto, color: cores.cafe, fontWeight: '700' },
});
