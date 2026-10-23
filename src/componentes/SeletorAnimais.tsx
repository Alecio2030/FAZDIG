import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Busca from './Busca';
import Aviso from './Aviso';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { identAnimal } from '../lib/rebanho';
import { cores, tam } from '../tema';

type Animal = { id: string; numero_interno: number; brinco: string | null; nome: string | null; categoria: string | null };

type Props = { loteId: string; valor: string[]; aoMudar: (ids: string[]) => void; erro?: string | null };

const MOSTRAR = 60;

/** Marcar animais específicos de um lote (os que estão no rebanho). Busca por número, brinco ou nome. */
export default function SeletorAnimais({ loteId, valor, aoMudar, erro }: Props) {
  const [animais, setAnimais] = useState<Animal[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    setAnimais(null);
    consulta<Animal[]>(
      supabase.from('animais').select('id, numero_interno, brinco, nome, categoria').eq('lote_id', loteId).eq('situacao', 'ativo').order('numero_interno'),
    )
      .then(setAnimais)
      .catch((e) => setFalha(traduzirErro(e)));
  }, [loteId]);

  const t = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () =>
      (animais ?? []).filter(
        (a) => !t || String(a.numero_interno) === t || (a.brinco ?? '').toLowerCase().includes(t) || (a.nome ?? '').toLowerCase().includes(t),
      ),
    [animais, t],
  );

  function alternar(id: string) {
    aoMudar(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id]);
  }

  if (falha) return <Aviso tipo="erro" texto={falha} />;
  if (!animais) return <ActivityIndicator color={cores.primaria} />;

  return (
    <View style={{ gap: 8 }}>
      <Text style={estilos.contagem}>
        {valor.length} de {animais.length} marcados
      </Text>
      {animais.length > 8 && <Busca valor={busca} aoMudar={setBusca} dica="Número, brinco ou nome" />}
      <View style={estilos.grade}>
        {visiveis.slice(0, MOSTRAR).map((a) => {
          const marcado = valor.includes(a.id);
          return (
            <Pressable
              key={a.id}
              onPress={() => alternar(a.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marcado }}
              style={[estilos.item, marcado && estilos.marcado]}
            >
              <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={20} color={marcado ? '#FFFFFF' : cores.primaria} />
              <Text style={[estilos.texto, marcado && { color: '#FFFFFF' }]}>
                {identAnimal(a)}
                {a.nome ? `  ${a.nome}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {visiveis.length > MOSTRAR && <Text style={estilos.contagem}>Mostrando {MOSTRAR} de {visiveis.length}. Use a busca para achar os outros.</Text>}
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  grade: { gap: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: tam.raio,
    borderWidth: 1.5,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  marcado: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  texto: { fontSize: tam.texto, color: cores.texto, flexShrink: 1 },
  contagem: { fontSize: tam.pequeno, color: cores.textoSuave },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
