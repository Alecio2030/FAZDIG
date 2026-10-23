import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Tela from '../componentes/Tela';
import ItemMenu from '../componentes/ItemMenu';
import { MODULOS, abrirFuncao, type ChaveModulo } from '../navegacao/modulos';
import { useSessao } from '../contexto/SessaoContext';
import type { NavPilha } from '../navegacao/rotas';
import { cores, tam } from '../tema';

/** Lista as funções de um módulo (abas Pecuário, Agrícola e Financeiro). */
export default function Modulo({ chave }: { chave: ChaveModulo }) {
  const navegacao = useNavigation<NavPilha>();
  const modulo = MODULOS[chave];
  const { modoAdm, fazendaAtiva } = useSessao();
  // V137: no Administrativo e no Particular saem as funções que só existem nas fazendas
  const fora = modoAdm ? FORA_ADM : fazendaAtiva?.tipo === 'particular' ? FORA_PARTICULAR : null;
  const funcoes = fora ? modulo.funcoes.filter((f) => !fora.includes(f.chave)) : modulo.funcoes;
  return (
    <Tela emAba>
      <View style={estilos.lista}>
        {funcoes.map((f, i) => (
          <View key={f.chave} style={i > 0 && estilos.divisor}>
            <ItemMenu
              icone={f.icone}
              titulo={f.titulo}
              descricao={f.descricao}
              onPress={() => abrirFuncao(navegacao, f)}
            />
          </View>
        ))}
      </View>
    </Tela>
  );
}

export const FORA_ADM = ['vendas'];
export const FORA_PARTICULAR = ['vendas', 'imobilizado', 'plano', 'tipos', 'transferencias'];

export const estilos = StyleSheet.create({
  lista: { borderRadius: tam.raio, overflow: 'hidden', borderWidth: 1, borderColor: cores.borda },
  divisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
});
