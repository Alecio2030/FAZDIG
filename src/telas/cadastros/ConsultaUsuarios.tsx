import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Linha from '../../componentes/Linha';
import Resumo from '../../componentes/Resumo';
import ResultadoBusca from '../../componentes/ResultadoBusca';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { semAcento } from '../../lib/codigos';
import { ROTULO_NIVEL, ROTULO_PERFIL, agruparPorPessoa, situacaoTexto, type LinhaAcesso, type Pessoa, MODULOS_SISTEMA, eDono } from '../../lib/acessos';
import type { NavPilha } from '../../navegacao/rotas';

const MAXIMO = 30;

/** Consultar quem tem acesso (ou liberação pendente), pelo nome ou e-mail. */
export default function ConsultaUsuarios() {
  const navegacao = useNavigation<NavPilha>();
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useFocusEffect(
    useCallback(() => {
      consulta<LinhaAcesso[]>(supabase.rpc('listar_acessos'))
        .then((l) => setPessoas(agruparPorPessoa(l)))
        .catch((e) => setErro(traduzirErro(e)));
    }, []),
  );

  const termo = busca.trim();
  const achados = useMemo(() => {
    if (!pessoas || !termo) return null;
    const t = semAcento(termo);
    return pessoas.filter((p) => semAcento(p.nome ?? '').includes(t) || p.email.includes(t));
  }, [pessoas, termo]);

  const comAcesso = (pessoas ?? []).filter((p) => p.situacao === 'conta').length;
  const pendentes = (pessoas ?? []).filter((p) => p.situacao === 'convite').length;

  return (
    <>
      {pessoas && <Resumo esquerda={`${comAcesso} ${comAcesso === 1 ? 'pessoa com acesso' : 'pessoas com acesso'}`} direita={pendentes ? `${pendentes} aguardando conta` : undefined} />}
      <Busca valor={busca} aoMudar={setBusca} dica="Nome ou e-mail" />
      <ResultadoBusca
        termo={termo}
        achados={achados}
        buscando={pessoas === null && !erro}
        erro={erro}
        maximo={MAXIMO}
        dica="Digite o nome ou o e-mail da pessoa. Tocando no resultado, abre o acesso dela."
        refinar="do nome"
        item={(p: Pessoa) => (
          <Linha
            key={p.email}
            titulo={p.nome ?? p.email}
            inativo={p.situacao === 'bloqueado'}
            linhas={[
              p.nome ? p.email : null,
              `${ROTULO_PERFIL[p.perfil] ?? p.perfil}, ${ROTULO_NIVEL[p.nivel] ?? p.nivel}${p.financeiro ? ', vê o Financeiro' : ', sem o Financeiro'}`,
              p.fazendas.length ? p.fazendas.join(', ') : null,
              p.modulos && !eDono(p.perfil) ? `Abre: ${['Início', ...MODULOS_SISTEMA.filter((m) => p.modulos!.includes(m.valor)).map((m) => m.rotulo), ...(p.financeiro ? ['Financeiro'] : [])].join(', ')}` : null,
              situacaoTexto(p),
            ]}
            onPress={() => navegacao.navigate('UsuarioForm', { email: p.email })}
          />
        )}
      />
    </>
  );
}
