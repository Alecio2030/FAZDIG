import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Secao from '../../componentes/Secao';
import QuadroAgua from '../../componentes/QuadroAgua';
import { useSessao } from '../../contexto/SessaoContext';
import { traduzirErro } from '../../lib/supabase';
import { DIAS_BALANCO, aguaDosTalhoes, type AguaTalhao } from '../../lib/irrigacao';
import type { LocalClima } from '../../lib/clima';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** Irrigação pelo balanço hídrico: a água no solo de cada talhão, se é hora de irrigar e a lâmina a repor. */
export default function IrrigacaoAba({ abas, local }: { abas: React.ReactNode; local: LocalClima | null | undefined }) {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [talhoes, setTalhoes] = useState<AguaTalhao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    if (!fid || !local) return;
    setErro(null);
    try {
      setTalhoes(await aguaDosTalhoes(fid, local));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid, local]);

  // relê ao voltar do lançamento da irrigação
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );
  useEffect(() => setTalhoes(null), [fid]);

  async function puxar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  if (local === undefined) return <Tela>{abas}<ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} /></Tela>;
  if (local === null)
    return (
      <Tela>
        {abas}
        <Aviso texto="Para a conta da irrigação, o sistema precisa saber onde fica a fazenda. Defina o local na aba Previsão." />
      </Tela>
    );
  if (!talhoes)
    return (
      <Tela>
        {abas}
        {erro ? (
          <>
            <Aviso tipo="erro" texto={erro} />
            <Botao titulo="Tentar de novo" tipo="secundario" onPress={carregar} />
          </>
        ) : (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        )}
      </Tela>
    );

  const irrigados = talhoes.filter((t) => t.irrigado_sistema);
  const sequeiro = talhoes.filter((t) => !t.irrigado_sistema);
  const lancar = (t: AguaTalhao) => (lamina: number) => navegacao.push('AtividadeForm', { areaId: t.id, irrigar: { lamina } });

  return (
    <Tela atualizando={atualizando} aoAtualizar={puxar}>
      {abas}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {talhoes.length === 0 && <Text style={estilos.nota}>Nenhum talhão cadastrado nesta fazenda. Cadastre em Agrícola › Talhões.</Text>}

      {irrigados.length > 0 && <Secao titulo="Talhões irrigados" />}
      {irrigados.map((t) => (
        <QuadroAgua key={t.id} t={t} aoLancar={lancar(t)} />
      ))}
      {sequeiro.length > 0 && <Secao titulo="Sequeiro (só acompanhamento)" />}
      {sequeiro.map((t) => (
        <QuadroAgua key={t.id} t={t} />
      ))}

      {talhoes.length > 0 && (
        <>
          <Secao titulo="Como a conta é feita" />
          <Text style={estilos.nota}>
            Todo dia: água no solo = a de ontem + chuva + irrigação − consumo da lavoura. A chuva é a do pluviômetro (aba Chuva); nos dias sem leitura, a estimada. A irrigação é a lâmina lançada em Agrícola › Atividades › Irrigação. O consumo é a evapotranspiração de referência vezes o Kc da idade da lavoura.
          </Text>
          <Text style={estilos.nota}>
            O solo guarda até a capacidade de água disponível (pela argila da análise de solo e a profundidade das raízes); o que passa disso se perde. O risco preto na barra é o ponto de irrigar: metade da capacidade. A conta começa {DIAS_BALANCO} dias atrás, com o solo cheio.
          </Text>
          <Text style={estilos.nota}>
            ATENÇÃO: é uma conta simplificada, de apoio à decisão. Só fica certa com as irrigações e o pluviômetro lançados em dia. No gotejamento a água molha só uma faixa: use a lâmina como referência e ajuste pelo que vê na lavoura. Confirme o manejo com o técnico responsável.
          </Text>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
});
