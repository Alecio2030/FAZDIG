import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { registrarAlertaWeb, type PedidoAlerta } from '../lib/alerta';
import { cores, tam } from '../tema';

/**
 * Caixa de aviso/confirmação para o navegador (PC e celular pelo site).
 * Fica uma vez só no App.tsx. No Expo Go não mostra nada: lá vale o aviso do próprio celular.
 */
export default function AlertaWeb() {
  const [fila, setFila] = useState<PedidoAlerta[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    registrarAlertaWeb((p) => setFila((f) => [...f, p]));
    return () => registrarAlertaWeb(null);
  }, []);

  if (Platform.OS !== 'web') return null;
  const atual = fila[0];
  if (!atual) return null;

  // A ação roda na hora do toque (o navegador só deixa abrir câmera/arquivo assim).
  // Se ela abrir outro aviso, ele entra na fila e aparece em seguida.
  const fechar = (acao?: () => void) => {
    const id = atual.id;
    try {
      acao?.();
    } finally {
      setFila((f) => f.filter((x) => x.id !== id));
    }
  };

  const emLinha = atual.botoes.length <= 2;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => atual.opcoes?.cancelable && fechar(atual.opcoes?.onDismiss)}>
      <Pressable style={estilos.fundo} onPress={() => atual.opcoes?.cancelable && fechar(atual.opcoes?.onDismiss)}>
        <Pressable style={estilos.caixa} onPress={() => {}}>
          <Text style={estilos.titulo}>{atual.titulo}</Text>
          {atual.mensagem ? <Text style={estilos.mensagem}>{atual.mensagem}</Text> : null}
          <View style={emLinha ? estilos.linha : estilos.coluna}>
            {atual.botoes.map((b, i) => {
              const cancelar = b.style === 'cancel';
              const perigo = b.style === 'destructive';
              return (
                <Pressable
                  key={`${atual.id}-${i}`}
                  accessibilityRole="button"
                  onPress={() => fechar(() => b.onPress?.())}
                  style={({ pressed }) => [estilos.botao, emLinha && { flex: 1 }, cancelar ? estilos.botaoNeutro : perigo ? estilos.botaoPerigo : estilos.botaoPrimario, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[estilos.botaoTexto, cancelar && { color: cores.texto }]}>{b.text ?? 'OK'}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  caixa: { width: '100%', maxWidth: 420, backgroundColor: cores.cartao, borderRadius: 14, padding: 20, gap: 12 },
  titulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto },
  mensagem: { fontSize: tam.texto, color: cores.texto, lineHeight: 22 },
  linha: { flexDirection: 'row', gap: 10, marginTop: 6 },
  coluna: { gap: 8, marginTop: 6 },
  botao: { minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  botaoPrimario: { backgroundColor: cores.primaria },
  botaoPerigo: { backgroundColor: '#B3261E' },
  botaoNeutro: { backgroundColor: cores.fundo, borderWidth: 1, borderColor: cores.borda },
  botaoTexto: { fontSize: tam.texto, fontWeight: '700', color: '#fff', textAlign: 'center' },
});
