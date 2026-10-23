import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Botao from './Botao';
import { NO_NAVEGADOR, abertoComoApp, aoMudarInstalacao, aparelho, instalarApp, podeInstalar } from '../lib/web';
import { cores, tam } from '../tema';

const CAMINHO = {
  iphone: 'No iPhone (Safari): toque em Compartilhar (o quadrado com a seta para cima) › "Adicionar à Tela de Início" › Adicionar.',
  android: 'No Android (Chrome): toque nos três pontinhos (⋮) › "Adicionar à tela inicial" (ou "Instalar app") › Adicionar.',
  pc: 'No PC (Chrome): três pontinhos (⋮) › "Transmitir, salvar e compartilhar" › "Criar atalho..." (ou "Instalar página como app", se aparecer). Marque "Abrir como janela" e clique em Criar. No Edge: três pontinhos (…) › Aplicativos › "Instalar este site como um aplicativo". O ícone vai para a área de trabalho.',
};

/** Só pelo navegador: cria o ícone do Fazenda Digital na área de trabalho do PC ou na tela de início do celular. Some quando já está aberto pelo ícone. */
export default function BotaoAtalho() {
  const [, atualizar] = useState(0);
  const [verCaminho, setVerCaminho] = useState(false);
  const [feito, setFeito] = useState(false);

  useEffect(() => aoMudarInstalacao(() => atualizar((n) => n + 1)), []);

  if (!NO_NAVEGADOR || abertoComoApp() || feito) return null;
  const onde = aparelho();
  const umToque = podeInstalar();
  const rotulo = onde === 'pc' ? 'Criar ícone na área de trabalho' : 'Criar ícone na tela de início';

  return (
    <View style={estilos.quadro}>
      <Botao
        titulo={rotulo}
        tipo="secundario"
        onPress={async () => {
          if (umToque) {
            if (await instalarApp()) setFeito(true);
          } else setVerCaminho(!verCaminho);
        }}
      />
      {verCaminho && !umToque && <Text style={estilos.nota}>{CAMINHO[onde]} Depois é só abrir pelo ícone, como um aplicativo.</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  quadro: { gap: 8 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 20 },
});
