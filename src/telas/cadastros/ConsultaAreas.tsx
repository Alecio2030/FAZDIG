import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase } from '../../lib/supabase';
import { formatarNumero } from '../../lib/formatos';
import { limparBusca, useBusca } from '../../lib/useBusca';
import { NOMES_AREA } from '../../lib/areas';
import type { NavPilha, TipoArea } from '../../navegacao/rotas';

const MAXIMO = 20;

/** Consultar mangas ou talhões pelo nome ou pelo capim/cultura. */
export default function ConsultaAreas({ tipo }: { tipo: TipoArea }) {
  const navegacao = useNavigation<NavPilha>();
  const nomes = NOMES_AREA[tipo];
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [busca, setBusca] = useState('');
  const [resumo, setResumo] = useState<{ qtd: number; ha: number } | null>(null);
  const termo = limparBusca(busca);

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      supabase
        .from('areas')
        .select('area_ha')
        .eq('fazenda_id', fid)
        .eq('tipo', tipo)
        .eq('ativa', true)
        .then(({ data }) => {
          const d = (data ?? []) as { area_ha: number | null }[];
          setResumo({ qtd: d.length, ha: d.reduce((s, a) => s + Number(a.area_ha ?? 0), 0) });
        });
    }, [fid, tipo]),
  );

  const buscar = useCallback(
    async (t: string) => {
      const areas = await consulta<any[]>(
        supabase
          .from('areas')
          .select('id, nome, area_ha, capim_cultura, ativa, capacidade_aguas, capacidade_seca, indicacao_uso, topografia')
          .eq('fazenda_id', fid!)
          .eq('tipo', tipo)
          .or(tipo === 'manga' ? `nome.ilike.*${t}*,capim_cultura.ilike.*${t}*,indicacao_uso.ilike.*${t}*` : `nome.ilike.*${t}*,capim_cultura.ilike.*${t}*`)
          .order('nome')
          .limit(MAXIMO + 1),
      );
      if (tipo !== 'manga' || areas.length === 0) return areas;

      // Lotação atual só das mangas encontradas: animais no rebanho em lotes ativos daquela manga.
      const lotes = await consulta<any[]>(
        supabase.from('lotes').select('id, manga_id').eq('situacao', 'ativo').in('manga_id', areas.map((a) => a.id)),
      );
      const cont: Record<string, number> = {};
      if (lotes.length) {
        const mangaDoLote: Record<string, string> = Object.fromEntries(lotes.map((l) => [l.id, l.manga_id]));
        const animais = await consulta<any[]>(
          supabase.from('animais').select('lote_id').eq('situacao', 'ativo').in('lote_id', lotes.map((l) => l.id)),
        );
        for (const a of animais) {
          const m = mangaDoLote[a.lote_id];
          cont[m] = (cont[m] ?? 0) + 1;
        }
      }
      return areas.map((a) => ({ ...a, cabecas: cont[a.id] ?? 0 }));
    },
    [fid, tipo],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar, { listarTudo: true });

  return (
    <>
      {resumo && (
        <Resumo
          esquerda={`${resumo.qtd} ${resumo.qtd === 1 ? nomes.singular : nomes.plural.toLowerCase()} ativ${nomes.artigo}${resumo.qtd === 1 ? '' : 's'}`}
          direita={`${formatarNumero(resumo.ha, 2)} ha no total`}
        />
      )}
      <Busca valor={busca} aoMudar={setBusca} dica={tipo === 'manga' ? 'Nome, capim ou uso' : `Nome ou ${nomes.cultura.toLowerCase()}`} />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={buscando}
        erro={erro}
        maximo={MAXIMO}
        dica={tipo === 'manga' ? 'Digite o nome da manga, o capim ou o uso (ex.: Recria). Tocando no resultado, abre a ficha da manga.' : `Digite o nome d${nomes.artigo} ${nomes.singular} ou o ${nomes.cultura.toLowerCase()}. Tocando no resultado, abre o cadastro.`}
        refinar="do nome"
        item={(a: any) => (
          <Linha
            key={a.id}
            titulo={a.nome}
            inativo={!a.ativa}
            linhas={
              tipo === 'manga'
                ? [
                    [a.capim_cultura, a.indicacao_uso, a.topografia].filter(Boolean).join(' • ') || null,
                    a.capacidade_aguas != null || a.capacidade_seca != null
                      ? `Capacidade (UA/ha): ${a.capacidade_aguas != null ? formatarNumero(a.capacidade_aguas, 2) : '–'} águas, ${a.capacidade_seca != null ? formatarNumero(a.capacidade_seca, 2) : '–'} seca`
                      : null,
                    `Agora: ${formatarNumero(a.cabecas ?? 0)} cab.`,
                  ]
                : [a.capim_cultura]
            }
            direita={a.area_ha !== null ? `${formatarNumero(a.area_ha, 2)} ha` : undefined}
            onPress={() => (tipo === 'manga' ? navegacao.navigate('MangaDetalhe', { id: a.id }) : navegacao.navigate('AreaForm', { tipo, id: a.id }))}
          />
        )}
      />
    </>
  );
}
