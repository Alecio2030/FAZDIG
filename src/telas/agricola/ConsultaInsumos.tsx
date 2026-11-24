import React, { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Escolha from '../../componentes/Escolha';
import Linha from '../../componentes/Linha';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase } from '../../lib/supabase';
import { formatarMoeda, formatarNumero, formatarQtd } from '../../lib/formatos';
import { textoAtributos } from '../../componentes/AtributosProduto';
import { limparBusca, useBusca } from '../../lib/useBusca';
import { CATEGORIAS_INSUMO, CATEGORIAS_VETERINARIAS, GRUPO_CATEGORIA, ROTULO_CATEGORIA_INSUMO, custosDe, saldoDe, textoDose, textoSaldo, textoUnidades, textoVias } from '../../lib/insumos';
import { linhaCompraDoProduto, ultimasComprasDosProdutos } from '../../lib/ultimasCompras';
import { nomeUnidade as nomeDaUnidade } from '../../lib/unidades';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const MAXIMO = 20;

/**
 * Consultar insumos pelo nome ou código.
 * V179: o cadastro e o estoque são separados.
 * - Sem "estoque" (Mais › Cadastro de insumos): só os dados do cadastro; tocando, abre o cadastro.
 * - Com "estoque" (Mais › Estoque): saldo, custos e últimas compras NA FAZENDA ESCOLHIDA; tocando, abre o estoque do produto.
 */
export default function ConsultaInsumos({ grupo, estoque }: { grupo?: 'veterinario'; estoque?: { id: string; ids: string[]; nome: string } } = {}) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendas } = useSessao();
  // V180: no estoque, uma fazenda ou todas (ids); mostra só os produtos que têm movimento nelas.
  const ids = estoque?.ids ?? [];
  const todas = ids.length > 1;
  const chaveIds = ids.join(',');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string[]>(['todas']);
  const [total, setTotal] = useState<number | null>(null);
  const termo = limparBusca(busca);

  useFocusEffect(
    useCallback(() => {
      supabase.from('insumos').select('id', { count: 'exact', head: true }).eq('ativo', true).then(({ count }) => setTotal(count ?? 0));
    }, []),
  );

  const buscar = useCallback(
    async (t: string) => {
      // V143: aceita também o código do produto
      const cod = /^\d{1,9}$/.test(t.trim()) ? t.trim() : null;
      let doEstoque: string[] | null = null;
      if (estoque) {
        const ms = await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id').in('fazenda_id', ids).limit(20000));
        doEstoque = [...new Set(ms.map((m) => m.insumo_id))];
        if (!doEstoque.length) return [];
      }
      let q = supabase.from('insumos').select('*');
      if (doEstoque) q = q.in('id', doEstoque);
      q = cod ? q.or(`nome.ilike.*${t}*,codigo.eq.${cod}`) : q.ilike('nome', `%${t}%`);
      q = q.order('nome').limit(MAXIMO + 1);
      if (categoria[0] !== 'todas') q = q.eq('categoria', categoria[0]);
      else if (grupo === 'veterinario') q = q.in('categoria', CATEGORIAS_VETERINARIAS);
      const insumos = await consulta<any[]>(q);
      if (!insumos.length) return insumos;
      const pids = insumos.map((i) => i.id);
      // V143: as 3 últimas compras de cada produto (de todas as unidades que a pessoa pode ver)
      if (!estoque) return insumos;
      const comprasTodas = await ultimasComprasDosProdutos(pids);
      const [movs, pend] = await Promise.all([
        consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, fazenda_id, tipo, quantidade, valor_unitario, data').in('fazenda_id', ids).in('insumo_id', pids)),
        // Entradas parciais: compras "a completar" (sem fornecedor/nota/valor), completadas depois em Compras.
        consulta<any[]>(supabase.from('compra_itens').select('insumo_id, compra:compras!inner ( situacao )').in('fazenda_id', ids).eq('compra.situacao', 'a_completar').in('insumo_id', pids)),
      ]);
      return insumos.map((i) => {
        const m = movs.filter((x) => x.insumo_id === i.id);
        // V180: em "Todas", o saldo de cada fazenda que tem o produto
        const porFazenda = todas
          ? ids.map((f) => ({ f, s: saldoDe(m.filter((x) => x.fazenda_id === f)), tem: m.some((x) => x.fazenda_id === f) })).filter((x) => x.tem)
          : [];
        const compras = (comprasTodas[i.id] ?? []).filter((c) => !c.fazenda_id || ids.includes(c.fazenda_id));
        return { ...i, saldo: saldoDe(m), custos: custosDe(m), porFazenda, pendentes: pend.filter((c) => c.insumo_id === i.id).length, compras };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoria, chaveIds, grupo, !!estoque],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar, { listarTudo: true });

  return (
    <>
      {total !== null && <Resumo esquerda={total === 1 ? '1 insumo ativo' : `${total} insumos ativos`} direita={estoque ? `Estoque em ${estoque.nome}` : undefined} />}
      <Busca valor={busca} aoMudar={setBusca} dica="Nome ou código do insumo" />
      <Escolha
        opcoes={[{ valor: 'todas', rotulo: 'Todas' }, ...(grupo === 'veterinario' ? CATEGORIAS_INSUMO.filter((c) => CATEGORIAS_VETERINARIAS.includes(c.valor)) : CATEGORIAS_INSUMO)]}
        valor={categoria}
        aoMudar={setCategoria}
      />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={buscando}
        erro={erro}
        maximo={MAXIMO}
        dica={estoque ? `Aparecem só os produtos com movimento em ${estoque.nome}. Digite o nome ou o código; os botões acima filtram pela categoria.` : 'Digite o nome ou o código do insumo. Os botões acima filtram pela categoria. O saldo fica em Mais › Estoque.'}
        refinar="do nome"
        item={(i: any) => {
          // V208: no estoque, só o essencial (saldo em negrito, mínimo, último custo e custo médio); tocando, abre o resto
          if (estoque) {
            const repor = i.estoque_minimo != null && i.saldo <= Number(i.estoque_minimo);
            return (
              <Linha
                key={i.id}
                titulo={i.codigo != null ? `${i.codigo} · ${i.nome}` : i.nome}
                inativo={!i.ativo}
                onPress={() => navegacao.navigate('EstoqueDetalhe', { insumoId: i.id, fazendaId: estoque.id })}
                extra={
                  <>
                    <Text style={estilos.saldo}>
                      {todas ? 'Estoque atual (total): ' : 'Estoque atual: '}
                      {textoSaldo(i.saldo, i)}
                    </Text>
                    {((i.porFazenda ?? []) as any[]).map((x) => (
                      <Text key={x.f} style={estilos.detalhe}>
                        {'   '}
                        {nomeDaUnidade(x.f, fazendas)}: <Text style={{ fontWeight: '700' }}>{textoSaldo(x.s, i)}</Text>
                      </Text>
                    ))}
                    <Text style={[estilos.detalhe, repor && { color: cores.erro, fontWeight: '700' }]}>
                      Estoque mínimo: {i.estoque_minimo != null ? `${formatarQtd(i.estoque_minimo)} ${i.unidade ?? ''}${repor ? ' · REPOR' : ''}` : 'não informado'}
                    </Text>
                    <Text style={estilos.detalhe}>
                      Custo unitário da última compra: {i.custos?.ultimo != null ? `${formatarMoeda(i.custos.ultimo)} por ${i.unidade}` : '—'}
                    </Text>
                    <Text style={estilos.detalhe}>Custo médio atual: {i.custos?.medio != null ? `${formatarMoeda(i.custos.medio)} por ${i.unidade}` : '—'}</Text>
                  </>
                }
              />
            );
          }
          const vet = CATEGORIAS_VETERINARIAS.includes(i.categoria);
          const dose = vet ? textoDose(i, i.unidade) : null;
          const compras: any[] = i.compras ?? [];
          return (
            <Linha
              key={i.id}
              titulo={i.codigo != null ? `${i.codigo} · ${i.nome}` : i.nome}
              inativo={!i.ativo}
              linhas={[
                `${ROTULO_CATEGORIA_INSUMO[i.categoria] ?? i.categoria}, ${textoUnidades(i)}`,
                vet ? (dose ? `Dose: ${dose}${i.via_aplicacao ? `, ${textoVias(i.via_aplicacao)}` : ''}` : 'SEM DOSE RECOMENDADA — toque para completar') : null,
                vet && i.indicacoes ? `Para: ${i.indicacoes}` : null,
                [GRUPO_CATEGORIA[i.categoria], i.fabricante, i.codigo_barras ? `cód. barras ${i.codigo_barras}` : null].filter(Boolean).join(' · ') || null,
                textoAtributos(i.categoria, i.atributos),
                i.saldo !== undefined ? `${todas ? 'Estoque total' : 'Estoque'}: ${textoSaldo(i.saldo, i)}${i.estoque_minimo != null ? ` · mínimo ${formatarQtd(i.estoque_minimo)}${i.saldo <= Number(i.estoque_minimo) ? ' ⚠️ REPOR' : ''}` : ''}` : null,
                ...((i.porFazenda ?? []) as any[]).map((x) => `   ${nomeDaUnidade(x.f, fazendas)}: ${textoSaldo(x.s, i)}`),
                i.custos?.medio != null ? `Custo médio ${formatarMoeda(i.custos.medio)} · último ${formatarMoeda(i.custos.ultimo)} por ${i.unidade}` : null,
                i.cadastro_completo === false && dose ? 'Cadastro incompleto' : null,
                i.pendentes ? `${i.pendentes === 1 ? '1 compra' : `${i.pendentes} compras`} a completar (entrada parcial)` : null,
                !estoque ? null : compras.length ? (compras.length === 1 ? 'Última compra:' : `Últimas ${compras.length} compras:`) : 'Nenhuma compra registrada',
                ...compras.map((c) => linhaCompraDoProduto(c, i.conteudo_medida, todas ? nomeDaUnidade(c.fazenda_id, fazendas) : undefined)),
              ]}
              onPress={() => (estoque ? navegacao.navigate('EstoqueDetalhe', { insumoId: i.id, fazendaId: estoque.id }) : navegacao.navigate('InsumoForm', { id: i.id, grupo }))}
            />
          );
        }}
      />
    </>
  );
}

const estilos = StyleSheet.create({
  saldo: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  detalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
});
