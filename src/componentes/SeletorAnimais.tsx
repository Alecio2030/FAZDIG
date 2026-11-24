import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Busca from './Busca';
import Aviso from './Aviso';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { identAnimal } from '../lib/rebanho';
import { cores, tam } from '../tema';

export type AnimalSel = { id: string; numero_interno: number; brinco: string | null; nome: string | null; categoria: string | null; sexo: string | null; data_nascimento: string | null };
type Animal = AnimalSel;

type Props = {
  /** animais de um lote... */
  loteId?: string | null;
  /** ...ou (V204) de todo o rebanho ativo da fazenda, opcionalmente só de um sexo */
  fazendaId?: string | null;
  sexo?: string | null;
  valor: string[];
  aoMudar: (ids: string[]) => void;
  /** V204: devolve também os dados dos animais marcados (sexo e nascimento) */
  aoMudarDados?: (animais: AnimalSel[]) => void;
  erro?: string | null;
};

const MOSTRAR = 60;

/** Marcar animais específicos de um lote (os que estão no rebanho). Busca por número, brinco ou nome. */
export default function SeletorAnimais({ loteId, fazendaId, sexo, valor, aoMudar, aoMudarDados, erro }: Props) {
  const [animais, setAnimais] = useState<Animal[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    setAnimais(null);
    let q = supabase.from('animais').select('id, numero_interno, brinco, nome, categoria, sexo, data_nascimento').eq('situacao', 'ativo');
    if (loteId) q = q.eq('lote_id', loteId);
    else if (fazendaId) {
      q = q.eq('fazenda_id', fazendaId);
      if (sexo) q = q.eq('sexo', sexo);
    } else return setAnimais([]);
    consulta<Animal[]>(q.order('numero_interno').limit(5000))
      .then((l) => setAnimais(l.map((a) => ({ ...a, sexo: a.sexo?.trim() || null }))))
      .catch((e) => setFalha(traduzirErro(e)));
  }, [loteId, fazendaId, sexo]);

  const t = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () =>
      (animais ?? []).filter(
        (a) => !t || String(a.numero_interno) === t || (a.brinco ?? '').toLowerCase().includes(t) || (a.nome ?? '').toLowerCase().includes(t),
      ),
    [animais, t],
  );

  function alternar(id: string) {
    const novos = valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id];
    aoMudar(novos);
    aoMudarDados?.((animais ?? []).filter((a) => novos.includes(a.id)));
  }

  if (falha) return <Aviso tipo="erro" texto={falha} />;
  if (!animais) return <ActivityIndicator color={cores.primaria} />;

  return (
    <View style={{ gap: 8 }}>
      <Text style={estilos.contagem}>
        {valor.length} de {animais.length} marcados
      </Text>
      {(animais.length > 8 || !loteId) && <Busca valor={busca} aoMudar={setBusca} dica="Número, brinco ou nome" />}
      {!loteId && !t && animais.length > MOSTRAR ? <Text style={estilos.contagem}>Digite o brinco (ou o número) para achar o animal.</Text> : null}
      <View style={estilos.grade}>
        {(!loteId && !t && animais.length > MOSTRAR ? animais.filter((a) => valor.includes(a.id)) : visiveis.slice(0, MOSTRAR)).map((a) => {
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
