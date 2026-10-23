import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import CampoData from '../../componentes/CampoData';
import Escolha from '../../componentes/Escolha';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { codigoLote, identAnimal } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import { ROTULO_SANIDADE, TIPOS_SANIDADE, atrasada, somarDias } from '../../lib/sanidade';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const MAXIMO = 50;
const JANELA_AGENDA = 30; // dias à frente
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Agenda dos reforços que faltam + histórico das aplicações por período e tipo. */
export default function ConsultaSanidade() {
  const navegacao = useNavigation<NavPilha>();
  const focado = useIsFocused();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [agenda, setAgenda] = useState<any[] | null>(null);
  const [de, setDe] = useState(doBanco(somarDias(hojeBanco(), -90)));
  const [ate, setAte] = useState(hojeBR());
  const [tipo, setTipo] = useState<string[]>(['todos']);
  const [historico, setHistorico] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const deIso = dataValida(de) ? paraBanco(de) : null;
  const ateIso = dataValida(ate) ? paraBanco(ate) : null;

  const alvo = useCallback(
    (s: any): string => {
      const a = um(s?.animal);
      const l = um(s?.lote);
      if (a) return `Animal ${identAnimal(a)}${a.nome ? ` ${a.nome}` : ''}`;
      return `Lote ${l ? codigoLote(l.numero, sigla) : ''}, ${formatarNumero(s?.quantidade_animais ?? 0)} cab.`;
    },
    [sigla],
  );

  // Agenda: reforços não aplicados, atrasados ou dos próximos 30 dias.
  useEffect(() => {
    if (!fid || !focado) return;
    consulta<any[]>(
      supabase
        .from('sanidade_reforcos')
        .select(
          'id, ordem, data_prevista, dose, item:sanidade_itens ( unidade, insumo:insumos ( nome ),' +
            ' sanidade:sanidade ( id, tipo, quantidade_animais, lote:lotes ( numero ), animal:animais ( numero_interno, brinco, nome ) ) )',
        )
        .eq('fazenda_id', fid)
        .is('aplicado_em', null)
        .lte('data_prevista', somarDias(hojeBanco(), JANELA_AGENDA))
        .order('data_prevista'),
    )
      .then(setAgenda)
      .catch((e) => setErro(traduzirErro(e)));
  }, [fid, focado, versao]);

  useEffect(() => {
    if (!fid || !focado || !deIso || !ateIso) return;
    setHistorico(null);
    let q = supabase
      .from('sanidade')
      .select('id, data, tipo, diagnostico, quantidade_animais, lote:lotes ( numero ), animal:animais ( numero_interno, brinco, nome ), itens:sanidade_itens ( ordem, insumo:insumos ( nome ) )')
      .eq('fazenda_id', fid)
      .gte('data', deIso)
      .lte('data', ateIso)
      .order('data', { ascending: false })
      .limit(MAXIMO + 1);
    if (tipo[0] !== 'todos') q = q.eq('tipo', tipo[0]);
    consulta<any[]>(q)
      .then(setHistorico)
      .catch((e) => setErro(traduzirErro(e)));
  }, [fid, focado, deIso, ateIso, tipo, versao]);

  // Tocar num reforço da agenda: marcar como aplicado hoje (com ou sem baixa) ou abrir a aplicação.
  function tocarReforco(r: any) {
    const it = um(r.item);
    const s = um(it?.sanidade);
    const marcar = async (baixar: boolean) => {
      setErro(null);
      const { data, error } = await supabase.rpc('aplicar_reforco', { p_id: r.id, p_data: hojeBanco(), p_baixar: baixar });
      if (error) return setErro(traduzirErro(error));
      const b = data as { baixa: number | null; unidade: string | null };
      setSucesso(`${r.ordem}º reforço de ${um(it?.insumo)?.nome ?? ''} marcado como aplicado hoje.${b?.baixa ? ` Baixados ${formatarNumero(b.baixa, 2)} ${b.unidade ?? ''} do estoque.` : ''}`);
      setVersao((v) => v + 1);
    };
    Alert.alert(`${r.ordem}º reforço: ${um(it?.insumo)?.nome ?? ''}`, `${alvo(s)}. Previsto para ${doBanco(r.data_prevista)}, dose de ${formatarNumero(r.dose, 2)} ${it?.unidade ?? ''} por cabeça.`, [
      { text: 'Aplicado hoje, dose prevista (baixar estoque)', onPress: () => marcar(true) },
      { text: 'Aplicado com outra dose (abrir)', onPress: () => s && navegacao.navigate('SanidadeDetalhe', { id: s.id }) },
      { text: 'Aplicado hoje (sem baixar estoque)', onPress: () => marcar(false) },
      { text: 'Voltar', style: 'cancel' },
    ]);
  }

  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {sucesso && <Aviso tipo="sucesso" texto={sucesso} />}

      <Secao titulo="Reforços a aplicar" />
      {agenda === null ? (
        <ActivityIndicator color={cores.primaria} />
      ) : agenda.length === 0 ? (
        <Text style={estilos.dica}>Nenhum reforço atrasado ou previsto para os próximos {JANELA_AGENDA} dias.</Text>
      ) : (
        <Lista>
          {agenda.map((r) => {
            const it = um(r.item);
            const s = um(it?.sanidade);
            return (
              <Linha
                key={r.id}
                titulo={`${doBanco(r.data_prevista)}  ${r.ordem}º reforço: ${um(it?.insumo)?.nome ?? ''}`}
                linhas={[
                  alvo(s),
                  `Dose de ${formatarNumero(r.dose, 2)} ${it?.unidade ?? ''} por cabeça (${ROTULO_SANIDADE[s?.tipo] ?? ''})`,
                  atrasada(r.data_prevista) ? 'ATRASADO' : null,
                ]}
                onPress={() => tocarReforco(r)}
              />
            );
          })}
        </Lista>
      )}

      <Secao titulo="Histórico" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="De" valor={de} aoMudar={setDe} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Até" valor={ate} aoMudar={setAte} />
        </View>
      </View>
      <Escolha opcoes={[{ valor: 'todos', rotulo: 'Todos' }, ...TIPOS_SANIDADE]} valor={tipo} aoMudar={setTipo} />
      {(!deIso || !ateIso) && <Text style={estilos.dica}>Informe as datas do período (dd/mm/aaaa).</Text>}
      {deIso && ateIso && historico === null && <ActivityIndicator color={cores.primaria} />}
      {historico && historico.length === 0 && <Text style={estilos.dica}>Nenhuma aplicação neste período.</Text>}
      {historico && historico.length > 0 && (
        <>
          <Lista>
            {historico.slice(0, MAXIMO).map((x) => {
              const nomes = ((x.itens ?? []) as any[])
                .sort((a, b) => a.ordem - b.ordem)
                .map((i) => um(i.insumo)?.nome)
                .filter(Boolean)
                .join(', ');
              return (
                <Linha
                  key={x.id}
                  titulo={`${doBanco(x.data)}  ${ROTULO_SANIDADE[x.tipo]}`}
                  linhas={[alvo(x), nomes || null, x.diagnostico ? `Diagnóstico: ${x.diagnostico}` : null]}
                  onPress={() => navegacao.navigate('SanidadeDetalhe', { id: x.id })}
                />
              );
            })}
          </Lista>
          {historico.length > MAXIMO && <Text style={estilos.dica}>Mostrando as {MAXIMO} mais recentes. Diminua o período para ver as outras.</Text>}
        </>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12 },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24 },
});
