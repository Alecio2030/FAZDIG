// Avisos e confirmações (Alert) que funcionam também no navegador.
// No celular (Expo Go) é o Alert de sempre. No navegador o Alert do sistema não existe:
// quem mostra a caixa é o componente AlertaWeb, colocado uma vez no App.tsx.
import { Alert as AlertNativo, Platform, type AlertButton, type AlertOptions } from 'react-native';

export type PedidoAlerta = {
  id: number;
  titulo: string;
  mensagem?: string;
  botoes: AlertButton[];
  opcoes?: AlertOptions;
};

let mostrar: ((p: PedidoAlerta) => void) | null = null;
let proximo = 1;

/** O AlertaWeb se registra aqui quando o app abre no navegador. */
export function registrarAlertaWeb(fn: ((p: PedidoAlerta) => void) | null) {
  mostrar = fn;
}

export const Alert = {
  alert(titulo: string, mensagem?: string, botoes?: AlertButton[], opcoes?: AlertOptions): void {
    if (Platform.OS !== 'web') {
      AlertNativo.alert(titulo, mensagem, botoes, opcoes);
      return;
    }
    const lista = botoes && botoes.length ? botoes : [{ text: 'OK' }];
    if (mostrar) {
      mostrar({ id: proximo++, titulo, mensagem, botoes: lista, opcoes });
      return;
    }
    // Reserva (não deve acontecer): caixas simples do próprio navegador.
    const w = globalThis as any;
    const texto = mensagem ? `${titulo}\n\n${mensagem}` : titulo;
    if (lista.length === 1) {
      w.alert?.(texto);
      lista[0].onPress?.();
      return;
    }
    const cancelar = lista.find((b) => b.style === 'cancel');
    const confirmar = lista.filter((b) => b !== cancelar).pop();
    if (w.confirm?.(texto)) confirmar?.onPress?.();
    else if (cancelar) cancelar.onPress?.();
    else opcoes?.onDismiss?.();
  },
};
