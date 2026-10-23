import React from 'react';
import SeletorLista from './SeletorLista';
import { consulta, supabase } from '../lib/supabase';

type Props = {
  rotulo: string;
  valorId: string | null;
  aoMudar: (id: string | null) => void;
  erro?: string | null;
  permitirLimpar?: boolean;
};

/** Escolher uma pessoa cadastrada (Mais › Pessoas). */
export default function SeletorPessoa(props: Props) {
  return (
    <SeletorLista
      {...props}
      dicaBusca="Buscar por nome ou CPF/CNPJ"
      vazio="Nenhuma pessoa cadastrada. Cadastre em Mais › Pessoas."
      carregar={async () => {
        const dados = await consulta<any[]>(supabase.from('pessoas').select('id, nome, cpf_cnpj, ativo').order('nome'));
        return dados.map((p) => ({ id: p.id, titulo: p.nome, detalhe: p.cpf_cnpj, oculto: !p.ativo }));
      }}
    />
  );
}
