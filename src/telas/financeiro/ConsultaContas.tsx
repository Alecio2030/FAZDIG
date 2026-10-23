import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { ROTULO_TIPO_CONTA, caminho, nivelDe, semAcento, type Conta } from '../../lib/planoContas';

const MAXIMO = 1000;
const RECUO = ['', '   ', '      ', '         '];

/**
 * Consultar contas pelo nome ou pelo código.
 * Digitando o começo de um código (ex.: "5.1"), aparecem todas as contas daquele grupo, em ordem.
 */
export default function ConsultaContas() {
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [tudo, setTudo] = useState(false);

  useFocusEffect(
    useCallback(() => {
      consulta<Conta[]>(supabase.from('plano_contas').select('id, codigo, nome, tipo, conta_pai_id, analitica, ativa').order('codigo'))
        .then(setContas)
        .catch((e) => setErro(traduzirErro(e)));
    }, []),
  );

  const porId = useMemo(() => Object.fromEntries((contas ?? []).map((c) => [c.id, c])), [contas]);
  const termo = busca.trim() || (tudo ? '*' : '');

  const achados = useMemo(() => {
    if (!contas || !termo) return null;
    if (termo === '*') return contas;
    if (/^[\d.]+$/.test(termo)) {
      const prefixo = termo.replace(/\.$/, '');
      return contas.filter((c) => c.codigo.startsWith(prefixo));
    }
    const t = semAcento(termo);
    return contas.filter((c) => semAcento(c.nome).includes(t));
  }, [contas, termo]);

  const analiticas = (contas ?? []).filter((c) => c.analitica && c.ativa).length;

  return (
    <>
      {contas && <Resumo esquerda={`${contas.length} contas no plano`} direita={`${analiticas} recebem lançamentos`} />}
      <Busca valor={busca} aoMudar={(t) => { setBusca(t); if (t) setTudo(false); }} dica="Nome ou código (ex.: adubo, 4.1.01)" />
      {!busca.trim() && <Botao titulo={tudo ? 'Fechar o plano completo' : 'Ver o plano completo'} tipo="secundario" onPress={() => setTudo(!tudo)} />}
      <ResultadoBusca
        termo={termo === '*' ? 'plano completo' : termo}
        achados={achados}
        buscando={contas === null}
        erro={erro}
        maximo={MAXIMO}
        dica={'Digite parte do nome da conta, ou o começo do código para ver um grupo inteiro: 3 mostra as receitas, 4.1.01 os custos da produção. Para alterar uma conta, use Cadastrar › Alterar uma conta já cadastrada.'}
        refinar="do nome ou do código"
        item={(c: Conta) => {
          const nivel = nivelDe(c.codigo);
          return (
            <Linha
              key={c.id}
              titulo={`${RECUO[nivel - 1]}${c.codigo}  ${c.nome}`}
              inativo={!c.ativa}
              linhas={[
                nivel === 1 ? ROTULO_TIPO_CONTA[c.tipo] : caminho(c, porId),
                c.analitica ? 'Analítica: recebe lançamentos' : 'Sintética: agrupa contas',
              ]}
              onPress={() => {}}
            />
          );
        }}
      />
    </>
  );
}
