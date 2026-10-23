import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Botao from './Botao';
import { useSessao } from '../contexto/SessaoContext';
import { salvarSigla, sugerirSigla, useSigla } from '../lib/useSigla';
import { traduzirErro } from '../lib/supabase';
import { cores, tam } from '../tema';

/** Mostra a sigla da fazenda (código dos lotes) e deixa definir ou trocar. */
export default function SiglaFazenda() {
  const { fazendaAtiva } = useSessao();
  const { sigla, carregada } = useSigla(fazendaAtiva?.id);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Sem sigla ainda: já sugere pelas iniciais do nome.
  useEffect(() => {
    if (carregada && !sigla && fazendaAtiva) setTexto(sugerirSigla(fazendaAtiva.nome));
  }, [carregada, sigla, fazendaAtiva]);

  if (!fazendaAtiva || !carregada) return null;
  const aberto = editando || !sigla;

  async function salvar() {
    setErro(null);
    if (!/^[A-Z]{2}$/.test(texto)) return setErro('Use 2 letras, ex.: FC.');
    setSalvando(true);
    try {
      await salvarSigla(fazendaAtiva!.id, texto);
      setEditando(false);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setSalvando(false);
  }

  if (!aberto) {
    return (
      <View style={estilos.linha}>
        <Text style={estilos.texto}>
          {fazendaAtiva.nome}. Código dos lotes: {sigla} 001, {sigla} 002…
        </Text>
        <Pressable
          onPress={() => {
            setTexto(sigla ?? '');
            setEditando(true);
          }}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={estilos.link}>Trocar sigla</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={estilos.caixa}>
      <Text style={estilos.titulo}>Sigla da fazenda</Text>
      <Text style={estilos.texto}>Duas letras que iniciam o código dos lotes de {fazendaAtiva.nome}. Ex.: FC 001.</Text>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <TextInput
          value={texto}
          onChangeText={(t) => setTexto(t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2))}
          autoCapitalize="characters"
          maxLength={2}
          style={estilos.entrada}
        />
        <View style={{ flex: 1 }}>
          <Botao
            titulo="Salvar sigla"
            onPress={salvar}
            carregando={salvando}
          />
        </View>
      </View>
      {erro && <Text style={estilos.erro}>{erro}</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texto: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave, lineHeight: 21 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  caixa: { gap: 10, backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: tam.espaco },
  titulo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.info },
  entrada: {
    width: 90,
    minHeight: tam.alturaToque,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: tam.raio,
    backgroundColor: cores.cartao,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: cores.texto,
    letterSpacing: 2,
  },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
