import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import Botao from './Botao';
import { consulta, supabase } from '../lib/supabase';
import { mascaraCep, somenteDigitos } from '../lib/formatos';
import { cores, tam } from '../tema';

/** V159: uma fazenda do cliente produtor rural (para onde vai a mercadoria e com qual inscrição). */
export type FazendaCliente = {
  id?: string;
  chave: string;
  nome_fazenda: string;
  inscricao_estadual: string;
  inscricao_sanitaria: string;
  localidade: string;
  distrito: string;
  municipio: string;
  uf: string;
  cep: string;
};

let seq = 0;
export const fazendaClienteVazia = (): FazendaCliente => ({
  chave: `n${++seq}`, nome_fazenda: '', inscricao_estadual: '', inscricao_sanitaria: '', localidade: '', distrito: '', municipio: '', uf: '', cep: '',
});

export async function lerFazendasCliente(pessoaId: string): Promise<FazendaCliente[]> {
  const d = await consulta<any[]>(supabase.from('pessoas_faturamento').select('*').eq('pessoa_id', pessoaId).order('created_at'));
  return d.map((r) => ({
    id: r.id, chave: r.id, nome_fazenda: r.nome_fazenda ?? '', inscricao_estadual: r.inscricao_estadual ?? '', inscricao_sanitaria: r.inscricao_sanitaria ?? '',
    localidade: r.localidade ?? '', distrito: r.distrito ?? '', municipio: r.municipio ?? '', uf: (r.uf ?? '').trim(), cep: mascaraCep(r.cep ?? ''),
  }));
}

/** Grava as fazendas do cliente: altera as que já existiam, inclui as novas e apaga as retiradas. */
export async function gravarFazendasCliente(pessoaId: string, lista: FazendaCliente[], apagadas: string[]) {
  const txt = (v: string) => (v.trim() ? v.trim() : null);
  for (const id of apagadas) {
    const { error } = await supabase.from('pessoas_faturamento').delete().eq('id', id);
    if (error) throw error;
  }
  for (const f of lista) {
    if (!f.nome_fazenda.trim() && !f.inscricao_estadual.trim() && !f.municipio.trim()) continue; // linha em branco
    const reg = {
      pessoa_id: pessoaId, nome_fazenda: txt(f.nome_fazenda), inscricao_estadual: txt(f.inscricao_estadual), inscricao_sanitaria: txt(f.inscricao_sanitaria),
      localidade: txt(f.localidade), distrito: txt(f.distrito), municipio: txt(f.municipio), uf: txt(f.uf.toUpperCase()), cep: somenteDigitos(f.cep) || null,
      // a nota fiscal usa a localidade como endereço e o distrito como bairro
      logradouro: txt(f.localidade), bairro: txt(f.distrito),
    };
    const { error } = f.id ? await supabase.from('pessoas_faturamento').update(reg).eq('id', f.id) : await supabase.from('pessoas_faturamento').insert(reg);
    if (error) throw error;
  }
}

type Props = { lista: FazendaCliente[]; aoMudar: (l: FazendaCliente[]) => void; aoApagar: (id: string) => void };

/** Fazendas do cliente produtor rural: nome, IE, inscrição no órgão de defesa sanitária (IDAF), localidade, distrito, município. */
export default function FazendasCliente({ lista, aoMudar, aoApagar }: Props) {
  const muda = (chave: string, m: Partial<FazendaCliente>) => aoMudar(lista.map((f) => (f.chave === chave ? { ...f, ...m } : f)));
  return (
    <View style={{ gap: 10 }}>
      <Text style={estilos.nota}>Quando o cliente é produtor rural, cadastre as fazendas dele: a venda escolhe para qual fazenda vai, e a nota fiscal e a GTA saem com a inscrição dela.</Text>
      {lista.map((f, i) => (
        <View key={f.chave} style={estilos.caixa}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={estilos.titulo}>Fazenda {i + 1}</Text>
            <Pressable
              onPress={() => {
                if (f.id) aoApagar(f.id);
                aoMudar(lista.filter((x) => x.chave !== f.chave));
              }}
              accessibilityRole="button"
            >
              <Text style={estilos.tirar}>Tirar</Text>
            </Pressable>
          </View>
          <Campo rotulo="Nome da fazenda" value={f.nome_fazenda} onChangeText={(t) => muda(f.chave, { nome_fazenda: t })} autoCapitalize="words" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Inscrição Estadual" value={f.inscricao_estadual} onChangeText={(t) => muda(f.chave, { inscricao_estadual: t })} autoCapitalize="characters" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Nº no órgão sanitário (IDAF)" value={f.inscricao_sanitaria} onChangeText={(t) => muda(f.chave, { inscricao_sanitaria: t })} autoCapitalize="characters" />
            </View>
          </View>
          <Campo rotulo="Localidade (córrego, comunidade, estrada)" value={f.localidade} onChangeText={(t) => muda(f.chave, { localidade: t })} autoCapitalize="words" />
          <Campo rotulo="Distrito" value={f.distrito} onChangeText={(t) => muda(f.chave, { distrito: t })} autoCapitalize="words" />
          <View style={estilos.linha}>
            <View style={{ flex: 2 }}>
              <Campo rotulo="Município" value={f.municipio} onChangeText={(t) => muda(f.chave, { municipio: t })} autoCapitalize="words" />
            </View>
            <View style={{ width: 70 }}>
              <Campo rotulo="UF" value={f.uf} onChangeText={(t) => muda(f.chave, { uf: t.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) })} autoCapitalize="characters" />
            </View>
          </View>
          <Campo rotulo="CEP" value={f.cep} onChangeText={(t) => muda(f.chave, { cep: mascaraCep(t) })} keyboardType="number-pad" maxLength={9} />
        </View>
      ))}
      <Botao titulo={lista.length ? 'Incluir outra fazenda do cliente' : 'Incluir fazenda do cliente'} tipo="secundario" onPress={() => aoMudar([...lista, fazendaClienteVazia()])} />
    </View>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  caixa: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, padding: 12, gap: 8 },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  tirar: { fontSize: tam.pequeno + 1, color: cores.erro, fontWeight: '600' },
  linha: { flexDirection: 'row', gap: 10 },
});
