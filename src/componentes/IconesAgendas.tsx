import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSessao } from '../contexto/SessaoContext';
import { chaveAgenda, type AgendaRef } from '../lib/agenda';
import type { NomeIcone } from './ItemMenu';
import type { NavPilha } from '../navegacao/rotas';
import { cores, tam } from '../tema';

type Props = {
  /** número no ícone: atrasados e de hoje, por agenda ('produtor', 'escritorio' ou id da fazenda) */
  avisos?: Record<string, number>;
  /** agenda que já está aberta: não aparece */
  menos?: AgendaRef;
};

/** Ícones das agendas que o usuário pode abrir (as que o produtor liberou para ele). Só abrem com o toque. */
export default function IconesAgendas({ avisos = {}, menos }: Props) {
  const navegacao = useNavigation<NavPilha>();
  const { agendas } = useSessao();
  const ICONE: Record<string, NomeIcone> = { produtor: 'person', admin: 'shield-checkmark', fazenda: 'home', escritorio: 'business' };

  const visiveis = agendas
    .filter((a) => a.podeAbrir && !(menos && chaveAgenda(menos) === chaveAgenda(a)))
    .map((a) => ({ ref: { agenda: a.agenda, fazendaId: a.fazendaId } as AgendaRef, chave: chaveAgenda(a), nome: a.nome, icone: ICONE[a.agenda] }));
  if (!visiveis.length) return null;

  return (
    <View style={estilos.linha}>
      {visiveis.map((a) => {
        const n = avisos[a.chave] ?? 0;
        return (
          <Pressable
            key={a.chave}
            onPress={() => navegacao.push('Agenda', a.ref)}
            accessibilityRole="button"
            accessibilityLabel={`Agenda ${a.nome}${n ? `, ${n} para hoje` : ''}`}
            style={({ pressed }) => [estilos.item, pressed && { opacity: 0.7 }]}
          >
            <View style={estilos.circulo}>
              <Ionicons name={a.icone} size={24} color="#FFFFFF" />
              {n > 0 && (
                <View style={estilos.selo}>
                  <Text style={estilos.seloTexto}>{n > 99 ? '99+' : n}</Text>
                </View>
              )}
            </View>
            <Text style={estilos.nome} numberOfLines={2}>{a.nome}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { width: 78, alignItems: 'center', gap: 4 },
  circulo: { width: 52, height: 52, borderRadius: 26, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  selo: { position: 'absolute', top: -4, right: -6, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: cores.erro, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: cores.cartao },
  seloTexto: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  nome: { fontSize: tam.pequeno - 1, fontWeight: '600', color: cores.texto, textAlign: 'center' },
});
