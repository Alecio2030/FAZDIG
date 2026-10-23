import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { consulta, supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/formatos';
import { doBanco } from '../../lib/datas';
import { limparBusca, useBusca } from '../../lib/useBusca';
import type { NavPilha } from '../../navegacao/rotas';

const MAXIMO = 20;
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Consultar contas bancárias e caixas pelo nome, banco ou número da conta. */
export default function ConsultaContasBancarias() {
  const navegacao = useNavigation<NavPilha>();
  const [busca, setBusca] = useState('');
  const [resumo, setResumo] = useState<{ bancos: number; caixas: number } | null>(null);
  const termo = limparBusca(busca);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('contas_bancarias')
        .select('tipo')
        .eq('ativa', true)
        .then(({ data }) => {
          const d = (data ?? []) as { tipo: string }[];
          setResumo({ bancos: d.filter((c) => c.tipo === 'banco').length, caixas: d.filter((c) => c.tipo === 'caixa').length });
        });
    }, []),
  );

  const buscar = useCallback(
    (t: string) =>
      consulta<any[]>(
        supabase
          .from('contas_bancarias')
          .select('id, nome, tipo, banco, agencia, conta, saldo_inicial, data_saldo_inicial, ativa, fazenda:fazendas ( nome )')
          .or(`nome.ilike.*${t}*,banco.ilike.*${t}*,conta.ilike.*${t}*`)
          .order('tipo')
          .order('nome')
          .limit(MAXIMO + 1),
      ),
    [],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar, { listarTudo: true });

  return (
    <>
      {resumo && (
        <Resumo
          esquerda={`${resumo.bancos} ${resumo.bancos === 1 ? 'conta bancária' : 'contas bancárias'}`}
          direita={`${resumo.caixas} ${resumo.caixas === 1 ? 'caixa' : 'caixas'}`}
        />
      )}
      <Busca valor={busca} aoMudar={setBusca} dica="Nome, banco ou número da conta" />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={buscando}
        erro={erro}
        maximo={MAXIMO}
        dica="Digite o nome da conta, o banco ou o número da conta. Tocando no resultado, abre o cadastro."
        refinar="do nome"
        item={(c: any) => (
          <Linha
            key={c.id}
            titulo={c.nome}
            inativo={!c.ativa}
            linhas={[
              c.tipo === 'caixa' ? 'Caixa (dinheiro)' : [c.tipo === 'aplicacao' ? 'Aplicação de liquidez imediata' : null, c.banco, c.agencia && `ag. ${c.agencia}`, c.conta && `c/c ${c.conta}`].filter(Boolean).join('  ') || 'Conta bancária',
              c.data_saldo_inicial ? `Saldo inicial ${formatarMoeda(c.saldo_inicial)} em ${doBanco(c.data_saldo_inicial)}` : null,
            ]}
            onPress={() => navegacao.navigate('ContaBancariaForm', { id: c.id })}
          />
        )}
      />
    </>
  );
}
