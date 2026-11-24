import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Busca from '../../componentes/Busca';
import Escolha from '../../componentes/Escolha';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Resumo from '../../componentes/Resumo';
import { useSessao } from '../../contexto/SessaoContext';
import { traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { lerParcerias, type ResumoParceria } from '../../lib/parcerias';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/**
 * V208 – Pecuário › Parcerias: os registros das parcerias da fazenda.
 * Parceiro, quantidade, sexo, data e peso de entrada, idade de entrada, raça, ferro e condições.
 * Tocando, abre a ficha (com os itens e o lote de cada um; quem ficou sem lote recebe o lote por lá).
 */
export default function Parcerias() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [situacao, setSituacao] = useState<string[]>(['aberta']);
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<ResumoParceria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: 'Parcerias' });
  }, [navegacao]);

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      setLista(null);
      setErro(null);
      lerParcerias(fid, situacao[0] === 'todas' ? {} : { situacao: situacao[0] as 'aberta' | 'encerrada' })
        .then(setLista)
        .catch((e) => setErro(traduzirErro(e)));
    }, [fid, situacao[0]]),
  );

  const t = busca.trim().toLowerCase();
  const vistas = (lista ?? []).filter((p) => !t || p.parceiro.toLowerCase().includes(t) || String(p.numero) === t.replace(/\D/g, ''));
  const cab = vistas.reduce((s, p) => s + p.cabecas, 0);

  return (
    <Tela>
      <Escolha
        opcoes={[
          { valor: 'aberta', rotulo: 'Abertas' },
          { valor: 'encerrada', rotulo: 'Encerradas' },
          { valor: 'todas', rotulo: 'Todas' },
        ]}
        valor={situacao}
        aoMudar={(v) => v[0] && setSituacao(v)}
      />
      <Busca valor={busca} aoMudar={setBusca} dica="Parceiro ou nº da parceria" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {lista === null && !erro ? (
        <ActivityIndicator color={cores.primaria} />
      ) : vistas.length === 0 ? (
        <Text style={estilos.dica}>
          {t ? 'Nenhuma parceria com esse parceiro ou número.' : 'Nenhuma parceria aqui. A entrada é em Pecuário › Movimentações › Entrada por parceria (ou pela venda com "o gado fica na fazenda").'}
        </Text>
      ) : (
        <>
          <Resumo esquerda={`${vistas.length} ${vistas.length === 1 ? 'parceria' : 'parcerias'}`} direita={`${formatarNumero(cab)} cab. na entrada`} />
          <Lista>
            {vistas.map((p) => (
              <Linha
                key={p.id}
                titulo={`Nº ${p.numero} · ${p.parceiro}`}
                direita={`${formatarNumero(p.cabecas)} cab.`}
                linhas={[
                  `Entrada em ${doBanco(p.dataEntrada)}${p.sexos ? ` · ${p.sexos}` : ''}${p.situacao === 'encerrada' && p.dataSaida ? ` · encerrada em ${doBanco(p.dataSaida)}` : ''}`,
                  // V209: peso bruto e médio por sexo
                  ...(p.pesoSexo.length ? p.pesoSexo.map((l) => `Entrada · ${l}`) : ['Peso de entrada não informado']),
                  p.pesoSexo.length > 1 && p.pesoKg != null ? `Total: peso bruto ${formatarNumero(p.pesoKg, 1)} kg · média ${formatarNumero(p.pesoKg / Math.max(1, p.cabecas), 2)} kg` : null,
                  p.idades ? `Idade na entrada: ${p.idades}` : null,
                  [p.racas && `Raça: ${p.racas}`, p.ferros && `Ferro: ${p.ferros}`].filter(Boolean).join(' · ') || null,
                  p.condicoes,
                  p.semLote ? `⚠️ ${formatarNumero(p.semLote)} ${p.semLote === 1 ? 'animal sem lote' : 'animais sem lote'}: toque para informar o lote` : null,
                ]}
                onPress={() => navegacao.navigate('ParceriaDetalhe', { id: p.id })}
              />
            ))}
          </Lista>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
