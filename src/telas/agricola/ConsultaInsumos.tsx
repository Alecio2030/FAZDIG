import React, { useCallback, useState } from 'react';
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

const MAXIMO = 20;

/** Consultar insumos pelo nome, com o saldo em estoque na fazenda ativa. */
export default function ConsultaInsumos({ grupo }: { grupo?: 'veterinario' } = {}) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas } = useSessao();
  const variasUnidades = (fazendas ?? []).length > 1;
  const fid = fazendaAtiva?.id;
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
      let q = supabase.from('insumos').select('*');
      q = cod ? q.or(`nome.ilike.*${t}*,codigo.eq.${cod}`) : q.ilike('nome', `%${t}%`);
      q = q.order('nome').limit(MAXIMO + 1);
      if (categoria[0] !== 'todas') q = q.eq('categoria', categoria[0]);
      else if (grupo === 'veterinario') q = q.in('categoria', CATEGORIAS_VETERINARIAS);
      const insumos = await consulta<any[]>(q);
      if (!insumos.length) return insumos;
      const ids = insumos.map((i) => i.id);
      // V143: as 3 últimas compras de cada produto (de todas as unidades que a pessoa pode ver)
      const compras = await ultimasComprasDosProdutos(ids);
      if (!fid) return insumos.map((i) => ({ ...i, compras: compras[i.id] ?? [] }));
      const [movs, pend] = await Promise.all([
        consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade, valor_unitario, data').eq('fazenda_id', fid).in('insumo_id', ids)),
        // Entradas parciais: compras "a completar" (sem fornecedor/nota/valor), completadas depois em Compras.
        consulta<any[]>(supabase.from('compra_itens').select('insumo_id, compra:compras!inner ( situacao )').eq('fazenda_id', fid).eq('compra.situacao', 'a_completar').in('insumo_id', ids)),
      ]);
      return insumos.map((i) => {
        const m = movs.filter((x) => x.insumo_id === i.id);
        return { ...i, saldo: saldoDe(m), custos: custosDe(m), pendentes: pend.filter((c) => c.insumo_id === i.id).length, compras: compras[i.id] ?? [] };
      });
    },
    [categoria, fid, grupo],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar, { listarTudo: true });

  return (
    <>
      {total !== null && <Resumo esquerda={total === 1 ? '1 insumo ativo' : `${total} insumos ativos`} direita={fazendaAtiva ? `Estoque em ${fazendaAtiva.nome}` : undefined} />}
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
        dica="Digite o nome ou o código do insumo. Os botões acima filtram pela categoria. O saldo mostrado é o da fazenda ativa."
        refinar="do nome"
        item={(i: any) => {
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
                i.saldo !== undefined ? `Estoque: ${textoSaldo(i.saldo, i)}${i.estoque_minimo != null ? ` · mínimo ${formatarQtd(i.estoque_minimo)}${i.saldo <= Number(i.estoque_minimo) ? ' ⚠️ REPOR' : ''}` : ''}` : null,
                i.custos?.medio != null ? `Custo médio ${formatarMoeda(i.custos.medio)} · último ${formatarMoeda(i.custos.ultimo)} por ${i.unidade}` : null,
                i.cadastro_completo === false && dose ? 'Cadastro incompleto' : null,
                i.pendentes ? `${i.pendentes === 1 ? '1 compra' : `${i.pendentes} compras`} a completar (entrada parcial)` : null,
                compras.length ? (compras.length === 1 ? 'Última compra:' : `Últimas ${compras.length} compras:`) : 'Nenhuma compra registrada',
                ...compras.map((c) => linhaCompraDoProduto(c, i.conteudo_medida, variasUnidades ? nomeDaUnidade(c.fazenda_id, fazendas) : undefined)),
              ]}
              onPress={() => navegacao.navigate('InsumoForm', { id: i.id, grupo })}
            />
          );
        }}
      />
    </>
  );
}
