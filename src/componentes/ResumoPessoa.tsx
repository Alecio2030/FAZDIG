import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavPilha } from '../navegacao/rotas';
import { supabase } from '../lib/supabase';
import { mascaraCep, mascaraCpfCnpj, mascaraIE, mascaraTelefone } from '../lib/formatos';
import { cores, tam } from '../tema';

type Dados = {
  nome: string;
  cpf_cnpj: string | null;
  rg_ie: string | null;
  celular: string | null;
  telefone: string | null;
  email: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
};

/** V164: os dados da pessoa escolhida (comprador, fornecedor...), logo abaixo do nome. Tocar no nome abre o cadastro dela. */
export default function ResumoPessoa({ pessoaId }: { pessoaId: string | null }) {
  const navegacao = useNavigation<NavPilha>();
  const [d, setD] = useState<Dados | null>(null);
  // relê ao voltar para a tela (ex.: depois de completar o cadastro da pessoa)
  useFocusEffect(
    useCallback(() => {
    setD(null);
    if (!pessoaId) return;
    let vivo = true;
    supabase
      .from('pessoas')
      .select('nome, cpf_cnpj, rg_ie, celular, telefone, email, logradouro, numero, bairro, municipio, uf, cep')
      .eq('id', pessoaId)
      .maybeSingle()
      .then(({ data }) => vivo && setD((data as Dados) ?? null));
    return () => {
      vivo = false;
    };
    }, [pessoaId]),
  );
  if (!pessoaId || !d) return null;
  const endereco = [[d.logradouro, d.numero].filter(Boolean).join(', '), d.bairro, [d.municipio, (d.uf ?? '').trim()].filter(Boolean).join('/'), d.cep ? `CEP ${mascaraCep(d.cep)}` : null]
    .filter(Boolean)
    .join(' · ');
  const falta = [!d.cpf_cnpj && 'CPF/CNPJ', !d.municipio && 'cidade', !(d.uf ?? '').trim() && 'UF', !d.cep && 'CEP'].filter(Boolean);
  return (
    <View style={estilos.caixa}>
      <Pressable onPress={() => navegacao.navigate('PessoaForm', { id: pessoaId })} accessibilityRole="link">
        <Text style={estilos.nome}>{d.nome} ›</Text>
      </Pressable>
      <Text style={estilos.linha}>
        {[d.cpf_cnpj ? mascaraCpfCnpj(d.cpf_cnpj) : null, d.rg_ie ? `IE ${mascaraIE(d.rg_ie)}` : null].filter(Boolean).join(' · ') || 'Sem CPF/CNPJ no cadastro'}
      </Text>
      {endereco ? <Text style={estilos.linha}>{endereco}</Text> : null}
      {d.celular || d.telefone || d.email ? (
        <Text style={estilos.linha}>{[d.celular ? mascaraTelefone(d.celular) : null, d.telefone ? mascaraTelefone(d.telefone) : null, d.email].filter(Boolean).join(' · ')}</Text>
      ) : null}
      {falta.length > 0 && <Text style={estilos.falta}>Falta no cadastro: {falta.join(', ')}. Toque no nome para completar.</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { gap: 3, padding: 10, borderRadius: tam.raio, backgroundColor: cores.fundo, borderWidth: 1, borderColor: cores.borda },
  nome: { fontSize: tam.texto, fontWeight: '700', color: cores.primaria },
  linha: { fontSize: tam.pequeno + 1, color: cores.texto },
  falta: { fontSize: tam.pequeno, color: cores.erro, fontWeight: '600' },
});
