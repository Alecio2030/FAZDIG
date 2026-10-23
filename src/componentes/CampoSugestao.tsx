import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import { cores, tam } from '../tema';

type Props = {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  /** devolve as sugestões (já usadas + padrão); é chamada ao abrir e quando "versao" muda */
  carregar: () => Promise<string[]>;
  placeholder?: string;
  erro?: string | null;
  ajuda?: string;
  /** quantas letras digitar para as sugestões aparecerem (0 = aparecem ao tocar no campo) */
  minimo?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** mude o número para recarregar as sugestões (ex.: depois de gravar) */
  versao?: number;
};

const MAXIMO = 8;
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Campo livre que lembra o que já foi digitado antes:
 * ao tocar ou começar a escrever, aparecem as opções para escolher.
 * Se não tiver na lista, é só digitar — na próxima vez já aparece.
 */
export default function CampoSugestao({ rotulo, valor, aoMudar, carregar, placeholder, erro, ajuda, minimo = 0, autoCapitalize = 'sentences', versao = 0 }: Props) {
  const [opcoes, setOpcoes] = useState<string[]>([]);
  const [focado, setFocado] = useState(false);
  const saida = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => {
    let vivo = true;
    carregarRef.current().then((o) => vivo && setOpcoes(o)).catch(() => vivo && setOpcoes([]));
    return () => {
      vivo = false;
    };
  }, [versao]);
  useEffect(
    () => () => {
      if (saida.current) clearTimeout(saida.current);
    },
    [],
  );

  const termo = semAcento(valor.trim());
  const filtradas =
    termo.length < minimo
      ? []
      : opcoes
          .filter((o) => {
            const k = semAcento(o);
            return k !== termo && (!termo || k.includes(termo));
          })
          // quem começa com o que foi digitado vem primeiro
          .sort((a, b) => Number(semAcento(b).startsWith(termo)) - Number(semAcento(a).startsWith(termo)));
  const mostrar = focado && filtradas.length > 0;

  return (
    <View style={{ gap: 6 }}>
      <Campo
        rotulo={rotulo}
        value={valor}
        onChangeText={aoMudar}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        erro={erro}
        ajuda={ajuda}
        onFocus={() => {
          if (saida.current) clearTimeout(saida.current);
          setFocado(true);
        }}
        // espera um instante para o toque na sugestão valer antes de esconder
        onBlur={() => {
          saida.current = setTimeout(() => setFocado(false), 250);
        }}
      />
      {mostrar && (
        <View style={estilos.linha}>
          {filtradas.slice(0, MAXIMO).map((o) => (
            <Pressable
              key={o}
              onPress={() => {
                aoMudar(o);
                setFocado(false);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [estilos.chip, pressed && { opacity: 0.7 }]}
            >
              <Text style={estilos.chipTexto}>{o}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
    justifyContent: 'center',
  },
  chipTexto: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
});
