import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NavPilha } from '../navegacao/rotas';
import { aguardarPessoaNova } from '../lib/retorno';
import CampoBuscaRapida, { type ItemRapido } from './CampoBuscaRapida';
import { consulta, supabase } from '../lib/supabase';
import { ROTULO_TIPO_PESSOA } from '../lib/pessoas';

type Props = {
  rotulo: string;
  valorId: string | null;
  aoMudar: (id: string | null) => void;
  /** tipo dado a quem for cadastrado aqui na hora (ex.: 'parceiro') */
  tipoNovo: string;
  erro?: string | null;
};

/** Pessoa: digita o nome e aparecem as parecidas; "Ver cadastrados" lista; se não existir, cadastra na hora. */
export default function CampoPessoaBusca({ rotulo, valorId, aoMudar, tipoNovo, erro }: Props) {
  const buscar = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      let q = supabase.from('pessoas').select('id, nome, cpf_cnpj, tipos').eq('ativo', true).order('nome').limit(100);
      if (t) q = q.or(`nome.ilike.*${t}*,nome_fantasia.ilike.*${t}*`);
      const d = await consulta<any[]>(q);
      // Quem já é do tipo pedido (ex.: fornecedor) aparece primeiro.
      d.sort((a, b) => Number((b.tipos ?? []).includes(tipoNovo)) - Number((a.tipos ?? []).includes(tipoNovo)));
      return d.map((p) => ({
        id: p.id,
        titulo: p.nome,
        detalhe: [(p.tipos ?? []).map((x: string) => ROTULO_TIPO_PESSOA[x] ?? x).join(', '), p.cpf_cnpj].filter(Boolean).join('   ') || null,
      }));
    },
    [tipoNovo],
  );
  const lerNome = useCallback(async (id: string) => (await supabase.from('pessoas').select('nome').eq('id', id).maybeSingle()).data?.nome ?? null, []);
  // V158: "Cadastrar" abre a ficha completa da pessoa (CPF/CNPJ, endereço, IE...); ao salvar, volta para esta tela com ela escolhida
  const navegacao = useNavigation<NavPilha>();
  const pedirNovo = useCallback(
    (nome: string) => {
      aguardarPessoaNova(aoMudar);
      navegacao.push('PessoaForm', { novo: { nome, tipo: tipoNovo } });
    },
    [aoMudar, navegacao, tipoNovo],
  );
  const criar = useCallback(
    async (nome: string): Promise<ItemRapido> => {
      const d = await consulta<any>(supabase.from('pessoas').insert({ nome, tipos: [tipoNovo] }).select('id, nome').single());
      return { id: d.id, titulo: d.nome };
    },
    [tipoNovo],
  );
  return (
    <CampoBuscaRapida
      rotulo={rotulo}
      valorId={valorId}
      aoMudar={aoMudar}
      buscar={buscar}
      lerNome={lerNome}
      criar={criar}
      aoPedirNovo={pedirNovo}
      rotuloNovo={`novo ${ROTULO_TIPO_PESSOA[tipoNovo]?.toLowerCase() ?? tipoNovo}`}
      icone="person"
      placeholder="Digite o nome para buscar ou cadastrar"
      erro={erro}
    />
  );
}
