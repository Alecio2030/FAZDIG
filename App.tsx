import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessaoProvider } from './src/contexto/SessaoContext';
import Navegacao from './src/navegacao/Navegacao';
import AlertaWeb from './src/componentes/AlertaWeb';
import { prepararPaginaWeb } from './src/lib/web';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

// No navegador: nome e ícone do app para a tela de início do celular.
prepararPaginaWeb();

export default function App() {
  // V130: carrega já os símbolos (ícones) das abas e dos menus, para não aparecerem quadradinhos no navegador.
  useEffect(() => {
    Font.loadAsync(Ionicons.font).catch(() => undefined);
  }, []);
  return (
    <SafeAreaProvider>
      <SessaoProvider>
        <StatusBar style="dark" />
        <Navegacao />
        <AlertaWeb />
      </SessaoProvider>
    </SafeAreaProvider>
  );
}
