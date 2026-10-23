import React, { useCallback, useEffect, useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import AbasTela from '../../componentes/AbasTela';
import Tela from '../../componentes/Tela';
import PrevisaoAba from './PrevisaoAba';
import ChuvaAba from './ChuvaAba';
import IrrigacaoAba from './IrrigacaoAba';
import ConsultaChuva from './ConsultaChuva';
import { useSessao } from '../../contexto/SessaoContext';
import { traduzirErro } from '../../lib/supabase';
import { gravarLocal, localDaFazenda, type LocalClima } from '../../lib/clima';
import type { PilhaParams } from '../../navegacao/rotas';

export type AbaClima = 'previsao' | 'chuva' | 'irrigacao' | 'consultar';

/** Clima e chuva, num ícone só: abas Previsão (tempo, alertas e janela de pulverização) | Chuva (pluviômetro) | Irrigação (balanço hídrico por talhão) | Consultar (chuva do mês, da safra e balanço). */
export default function ClimaForm() {
  const { params } = useRoute<RouteProp<PilhaParams, 'ClimaForm'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [aba, setAba] = useState<AbaClima>(params?.aba ?? 'previsao');
  // undefined = procurando; null = não deu para saber onde fica a fazenda
  const [local, setLocal] = useState<LocalClima | null | undefined>(undefined);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  useEffect(() => {
    if (!fid) return;
    setLocal(undefined);
    setErroLocal(null);
    localDaFazenda(fid).then(setLocal, (e) => {
      setErroLocal(traduzirErro(e));
      setLocal(null);
    });
  }, [fid]);

  const mudarLocal = useCallback(
    async (l: LocalClima) => {
      if (!fid) return;
      await gravarLocal(fid, l);
      setLocal(l);
    },
    [fid],
  );

  const abas = (
    <AbasTela
      opcoes={[
        { valor: 'previsao', rotulo: 'Previsão' },
        { valor: 'chuva', rotulo: 'Chuva' },
        { valor: 'irrigacao', rotulo: 'Irrigação' },
        { valor: 'consultar', rotulo: 'Consultar' },
      ]}
      valor={[aba]}
      aoMudar={(v) => setAba(v[0] as AbaClima)}
    />
  );
  if (aba === 'previsao') return <PrevisaoAba abas={abas} local={local} erroLocal={erroLocal} aoMudarLocal={mudarLocal} />;
  if (aba === 'chuva') return <ChuvaAba abas={abas} />;
  if (aba === 'irrigacao') return <IrrigacaoAba abas={abas} local={local} />;
  return (
    <Tela>
      {abas}
      <ConsultaChuva local={local} />
    </Tela>
  );
}
