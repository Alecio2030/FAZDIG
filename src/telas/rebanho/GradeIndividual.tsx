import React, { memo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ItemLista } from '../../componentes/SeletorLista';
import type { LinhaIndividual } from '../../lib/lotes';
import { cores, tam } from '../../tema';

export type Dica = { texto: string; tipo: 'ok' | 'aviso' | 'erro' };
export type LinhaGrade = { chave: string; rotulo: string; valor: LinhaIndividual; dica?: Dica | null };
export type GrupoGrade = { chave: string; titulo?: string | null; linhas: LinhaGrade[] };

type Props = {
  grupos: GrupoGrade[];
  ferros: ItemLista[];
  /** texto do ferro quando a linha não escolhe nenhum (ex.: "Do lote", "O mesmo") */
  ferroPadrao: string;
  aoMudar: (chave: string, valor: LinhaIndividual) => void;
  aoSairBrinco?: (chave: string, brinco: string) => void;
};

/** V200 · Grade do controle individual: uma linha por animal com Brinco, Ferro e Peso (kg). */
export default function GradeIndividual({ grupos, ferros, ferroPadrao, aoMudar, aoSairBrinco }: Props) {
  const [ferroDe, setFerroDe] = useState<string | null>(null); // linha com a lista de ferros aberta
  const [busca, setBusca] = useState('');
  const linhaAberta = ferroDe ? grupos.flatMap((g) => g.linhas).find((l) => l.chave === ferroDe) : undefined;
  const termo = busca.trim().toLowerCase();
  const filtrados = ferros.filter((f) => !termo || f.titulo.toLowerCase().includes(termo));

  return (
    <View style={{ gap: 6 }}>
      <View style={[estilos.linha, estilos.cabecalho]}>
        <Text style={[estilos.ord, estilos.cabTexto]}>Ord.</Text>
        <Text style={[estilos.brinco, estilos.cabTexto]}>Brinco</Text>
        <Text style={[estilos.ferro, estilos.cabTexto]}>Ferro</Text>
        <Text style={[estilos.peso, estilos.cabTexto]}>Peso kg</Text>
      </View>
      {grupos.map((g) => (
        <View key={g.chave} style={{ gap: 4 }}>
          {g.titulo ? <Text style={estilos.grupo}>{g.titulo}</Text> : null}
          {g.linhas.map((l) => (
            <Linha
              key={l.chave}
              chave={l.chave}
              rotulo={l.rotulo}
              valor={l.valor}
              dica={l.dica}
              nomeFerro={l.valor.ferroId ? ferros.find((f) => f.id === l.valor.ferroId)?.titulo ?? '…' : ferroPadrao}
              aoMudar={aoMudar}
              aoSairBrinco={aoSairBrinco}
              abrirFerro={(c) => {
                setBusca('');
                setFerroDe(c);
              }}
            />
          ))}
        </View>
      ))}

      <Modal visible={!!ferroDe} animationType="slide" onRequestClose={() => setFerroDe(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundo }}>
          <View style={estilos.modalTopo}>
            <Text style={estilos.modalTitulo}>Ferro {linhaAberta ? `· ${linhaAberta.rotulo}` : ''}</Text>
            <Pressable onPress={() => setFerroDe(null)} accessibilityRole="button" hitSlop={12}>
              <Ionicons name="close" size={28} color={cores.texto} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: tam.espaco }}>
            <TextInput style={estilos.entrada} value={busca} onChangeText={setBusca} placeholder="Buscar ferro" />
          </View>
          <ScrollView contentContainerStyle={{ padding: tam.espaco, gap: 8 }}>
            <Item
              titulo={ferroPadrao}
              detalhe="Sem escolher (fica o ferro do lote ou o que o animal já tem)"
              onPress={() => {
                if (linhaAberta) aoMudar(linhaAberta.chave, { ...linhaAberta.valor, ferroId: null });
                setFerroDe(null);
              }}
            />
            {filtrados.map((f) => (
              <Item
                key={f.id}
                titulo={f.titulo}
                detalhe={f.detalhe}
                marcado={linhaAberta?.valor.ferroId === f.id}
                onPress={() => {
                  if (linhaAberta) aoMudar(linhaAberta.chave, { ...linhaAberta.valor, ferroId: f.id });
                  setFerroDe(null);
                }}
              />
            ))}
            {ferros.length === 0 && <Text style={estilos.dica}>Nenhum ferro cadastrado. Cadastre em Pecuário › Ferros.</Text>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const Linha = memo(function Linha({
  chave,
  rotulo,
  valor: v,
  dica,
  nomeFerro,
  aoMudar,
  aoSairBrinco,
  abrirFerro,
}: {
  chave: string;
  rotulo: string;
  valor: LinhaIndividual;
  dica?: Dica | null;
  nomeFerro: string;
  aoMudar: (chave: string, valor: LinhaIndividual) => void;
  aoSairBrinco?: (chave: string, brinco: string) => void;
  abrirFerro: (chave: string) => void;
}) {
  const corDica = dica?.tipo === 'erro' ? cores.erro : dica?.tipo === 'aviso' ? cores.cafe : cores.primaria;
  return (
    <View style={{ gap: 2 }}>
      <View style={estilos.linha}>
        <Text style={[estilos.ord, estilos.ordTexto]}>{rotulo}</Text>
        <TextInput
          style={[estilos.entrada, estilos.brinco, dica?.tipo === 'erro' && { borderColor: cores.erro }]}
          value={v.brinco}
          onChangeText={(t) => aoMudar(chave, { ...v, brinco: t.toUpperCase() })}
          onBlur={() => aoSairBrinco?.(chave, v.brinco)}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Brinco"
        />
        <Pressable style={[estilos.entrada, estilos.ferro, { justifyContent: 'center' }]} onPress={() => abrirFerro(chave)} accessibilityRole="button">
          <Text numberOfLines={1} style={{ fontSize: tam.pequeno + 1, color: v.ferroId ? cores.texto : cores.textoSuave }}>
            {nomeFerro}
          </Text>
        </Pressable>
        <TextInput
          style={[estilos.entrada, estilos.peso]}
          value={v.peso}
          onChangeText={(t) => aoMudar(chave, { ...v, peso: t.replace(/[^\d,.]/g, '') })}
          keyboardType="decimal-pad"
          placeholder="kg"
        />
      </View>
      {dica ? <Text style={[estilos.dicaLinha, { color: corDica }]}>{dica.texto}</Text> : null}
    </View>
  );
});

function Item({ titulo, detalhe, marcado, onPress }: { titulo: string; detalhe?: string | null; marcado?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[estilos.item, marcado && { borderColor: cores.primaria, borderWidth: 2 }]}>
      <Text style={estilos.itemTitulo}>{titulo}</Text>
      {detalhe ? <Text style={estilos.itemDetalhe}>{detalhe}</Text> : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  cabecalho: { paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: cores.borda },
  cabTexto: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  grupo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primariaEscura, marginTop: 6 },
  ord: { width: 44 },
  ordTexto: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  brinco: { flex: 1.1 },
  ferro: { flex: 1 },
  peso: { width: 78 },
  entrada: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: tam.raio,
    backgroundColor: cores.cartao,
    paddingHorizontal: 8,
    fontSize: tam.pequeno + 1,
    color: cores.texto,
  },
  dicaLinha: { fontSize: tam.pequeno, marginLeft: 50 },
  modalTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: tam.espaco },
  modalTitulo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto },
  item: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 2 },
  itemTitulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  itemDetalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
  dica: { fontSize: tam.pequeno + 1, color: cores.textoSuave, textAlign: 'center' },
});
