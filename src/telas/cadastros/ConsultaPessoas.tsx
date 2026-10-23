import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Escolha from '../../componentes/Escolha';
import Linha from '../../componentes/Linha';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { consulta, supabase } from '../../lib/supabase';
import { somenteDigitos } from '../../lib/formatos';
import { limparBusca, padraoDigitos, useBusca } from '../../lib/useBusca';
import { ROTULO_TIPO_PESSOA, TIPOS_PESSOA } from '../../lib/pessoas';
import { useSessao } from '../../contexto/SessaoContext';
import { linhasFornecimento, ultimosFornecimentos } from '../../lib/ultimasCompras';
import { nomeUnidade as nomeDaUnidade } from '../../lib/unidades';
import type { NavPilha } from '../../navegacao/rotas';

const MAXIMO = 20;

/** Consultar pessoas pelo nome, nome fantasia ou CPF/CNPJ. Não lista o cadastro inteiro. */
export default function ConsultaPessoas() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendas } = useSessao();
  const variasUnidades = (fazendas ?? []).length > 1;
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<string[]>(['todos']);
  const [total, setTotal] = useState<number | null>(null);
  const termo = limparBusca(busca);

  useFocusEffect(
    useCallback(() => {
      supabase.from('pessoas').select('id', { count: 'exact', head: true }).then(({ count }) => setTotal(count ?? 0));
    }, []),
  );

  const buscar = useCallback(
    async (t: string) => {
      const partes = [`nome.ilike.*${t}*`, `nome_fantasia.ilike.*${t}*`];
      const dig = somenteDigitos(t);
      if (dig.length >= 3) partes.push(`cpf_cnpj.ilike.${padraoDigitos(dig)}`);
      let q = supabase
        .from('pessoas')
        .select('id, nome, nome_fantasia, tipos, cpf_cnpj, celular, telefone, municipio, ativo, agencia, agencia_local, banco_numero')
        .or(partes.join(','))
        .order('nome')
        .limit(MAXIMO + 1);
      if (tipo[0] !== 'todos') q = q.contains('tipos', [tipo[0]]);
      const pessoas = await consulta<any[]>(q);
      // V143: fornecedor mostra os 3 últimos fornecimentos (compras), com os itens
      //       (também para quem não está marcado como Fornecedor, mas já vendeu para o Grupo)
      const fornec = await ultimosFornecimentos(pessoas.filter((p) => !(p.tipos ?? []).includes('banco') || (p.tipos ?? []).includes('fornecedor')).map((p) => p.id));
      return pessoas.map((p) => ({ ...p, fornecimentos: fornec[p.id] ?? null }));
    },
    [tipo],
  );
  const { achados, buscando, erro } = useBusca(termo, buscar, { listarTudo: true });

  return (
    <>
      {total !== null && <Resumo esquerda={total === 1 ? '1 pessoa cadastrada' : `${total} pessoas cadastradas`} />}
      <Busca valor={busca} aoMudar={setBusca} dica="Nome, nome fantasia ou CPF/CNPJ" />
      <Escolha opcoes={[{ valor: 'todos', rotulo: 'Todos' }, ...TIPOS_PESSOA]} valor={tipo} aoMudar={setTipo} />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={buscando}
        erro={erro}
        maximo={MAXIMO}
        dica="Digite o nome ou o CPF/CNPJ. Os botões acima filtram pelo tipo. Tocando no resultado, abre o cadastro."
        refinar="do nome"
        item={(p: any) => {
          const fs: any[] | null = p.fornecimentos;
          const eForn = (p.tipos ?? []).includes('fornecedor') || !!fs?.length;
          return (
          <Linha
            key={p.id}
            titulo={p.nome}
            inativo={!p.ativo}
            linhas={[
              eForn ? `Razão social: ${p.nome}` : null,
              p.nome_fantasia ? (eForn ? `Nome fantasia: ${p.nome_fantasia}` : p.nome_fantasia) : null,
              (p.tipos ?? []).map((t: string) => ROTULO_TIPO_PESSOA[t] ?? t).join(', ') || null,
              (p.tipos ?? []).includes('banco') ? [p.banco_numero ? `banco ${p.banco_numero}` : null, p.agencia ? `ag. ${p.agencia}` : null, p.agencia_local].filter(Boolean).join('   ') || null : null,
              [p.cpf_cnpj, p.celular || p.telefone, p.municipio].filter(Boolean).join('   ') || null,
              ...(eForn
                ? fs && fs.length
                  ? [fs.length === 1 ? 'Último fornecimento:' : `Últimos ${fs.length} fornecimentos:`, ...fs.flatMap((f) => linhasFornecimento(f, variasUnidades ? nomeDaUnidade(f.fazenda_id, fazendas) : undefined))]
                  : ['Nenhum fornecimento registrado']
                : []),
            ]}
            onPress={() => navegacao.navigate('PessoaForm', { id: p.id })}
          />
          );
        }}
      />
    </>
  );
}
