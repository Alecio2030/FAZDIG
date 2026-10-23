import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { consulta, supabase } from '../../lib/supabase';
import { formatarNumero } from '../../lib/formatos';
import { limparBusca, useBusca } from '../../lib/useBusca';
import type { NavPilha } from '../../navegacao/rotas';

const MAXIMO = 20;

/** Dados do produtor no alto + consulta das fazendas pelo nome ou município. */
export default function ConsultaFazendas() {
  const navegacao = useNavigation<NavPilha>();
  const [busca, setBusca] = useState('');
  const [produtor, setProdutor] = useState<{ nome: string; cpf_cnpj: string } | null>(null);
  const [resumo, setResumo] = useState<{ ativas: number; ha: number } | null>(null);
  const termo = limparBusca(busca);

  useFocusEffect(
    useCallback(() => {
      supabase.from('produtor').select('nome, cpf_cnpj').maybeSingle().then(({ data }) => setProdutor(data ?? null));
      supabase
        .from('fazendas')
        .select('area_total_ha')
        .eq('ativa', true)
        .neq('tipo', 'particular')
        .then(({ data }) => {
          const d = (data ?? []) as { area_total_ha: number | null }[];
          setResumo({ ativas: d.length, ha: d.reduce((s, f) => s + Number(f.area_total_ha ?? 0), 0) });
        });
    }, []),
  );

  const buscar = useCallback(
    (t: string) =>
      consulta<any[]>(
        supabase
          .from('fazendas')
          .select('id, nome, sigla, municipio, uf, area_total_ha, ativa, tipo')
          .or(`nome.ilike.*${t}*,municipio.ilike.*${t}*,sigla.ilike.*${t}*`)
          .order('nome')
          .limit(MAXIMO + 1),
      ),
    [],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar, { listarTudo: true });

  return (
    <>
      {produtor && (
        <Lista>
          <Linha titulo={produtor.nome} linhas={['Produtor', produtor.cpf_cnpj]} onPress={() => navegacao.navigate('ProdutorForm')} />
        </Lista>
      )}
      {resumo && (
        <Resumo
          esquerda={resumo.ativas === 1 ? '1 fazenda ativa' : `${resumo.ativas} fazendas ativas`}
          direita={resumo.ha > 0 ? `${formatarNumero(resumo.ha, 2)} ha no total` : undefined}
        />
      )}
      <Busca valor={busca} aoMudar={setBusca} dica="Nome, sigla ou município" />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={buscando}
        erro={erro}
        maximo={MAXIMO}
        dica="Digite o nome, a sigla ou o município da fazenda. Tocando no resultado, abre o cadastro. Para os dados do produtor, toque no quadro acima."
        refinar="do nome"
        item={(f: any) => (
          <Linha
            key={f.id}
            titulo={f.sigla ? `${f.nome} (${f.sigla})` : f.nome}
            inativo={!f.ativa}
            linhas={[f.tipo === 'particular' ? 'Particular dos sócios (vai ao Patrimônio Líquido)' : [f.municipio, f.uf?.trim()].filter(Boolean).join(' / ') || null]}
            direita={f.area_total_ha != null ? `${formatarNumero(f.area_total_ha, 2)} ha` : undefined}
            onPress={() => navegacao.navigate('FazendaForm', { id: f.id })}
          />
        )}
      />
    </>
  );
}
