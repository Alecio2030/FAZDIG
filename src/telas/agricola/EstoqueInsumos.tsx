import React, { useLayoutEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Escolha from '../../componentes/Escolha';
import ConsultaInsumos from './ConsultaInsumos';
import { useSessao } from '../../contexto/SessaoContext';
import { TODAS } from '../../lib/unidades';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/**
 * V179 – Mais › Estoque.
 * O estoque é de cada fazenda: primeiro pergunta de qual, depois mostra o saldo dos produtos dela
 * (custo médio, últimas compras, mínimo). Tocando num produto, abre as entradas e saídas e o estoque inicial.
 */
export default function EstoqueInsumos() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'EstoqueInsumos'>>();
  const { fazendas } = useSessao();
  // Só as fazendas guardam estoque (o Particular e o Administrativo não).
  const lista = (fazendas ?? []).filter((f) => f.tipo !== 'particular');
  const inicial = params?.fazendaId ?? (lista.length === 1 ? lista[0].id : null);
  const [escolha, setEscolha] = useState<string[]>(inicial ? [inicial] : []);
  // V180: "Todas as fazendas" mostra o estoque total (com o saldo de cada uma)
  const faz = escolha[0] === TODAS ? { id: TODAS, nome: 'todas as fazendas' } : lista.find((f) => f.id === escolha[0]) ?? null;
  const ids = faz?.id === TODAS ? lista.map((f) => f.id) : faz ? [faz.id] : [];

  useLayoutEffect(() => {
    navegacao.setOptions({ title: faz ? (faz.id === TODAS ? 'Estoque · Todas as fazendas' : `Estoque · ${faz.nome}`) : 'Estoque' });
  }, [navegacao, faz]);

  return (
    <Tela>
      <Escolha rotulo="De qual fazenda? *" opcoes={[...(lista.length > 1 ? [{ valor: TODAS, rotulo: 'Todas as fazendas' }] : []), ...lista.map((f) => ({ valor: f.id, rotulo: f.nome }))]} valor={escolha} aoMudar={setEscolha} />
      {lista.length === 0 ? (
        <Text style={estilos.dica}>Nenhuma fazenda liberada para você.</Text>
      ) : !faz ? (
        <Text style={estilos.dica}>Escolha a fazenda para ver o estoque dela.</Text>
      ) : (
        <ConsultaInsumos key={faz.id} estoque={{ id: faz.id, ids, nome: faz.nome }} />
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
