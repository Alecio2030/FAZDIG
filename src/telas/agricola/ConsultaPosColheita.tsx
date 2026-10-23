import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero } from '../../lib/formatos';
import { limparBusca } from '../../lib/useBusca';
import { semAcento } from '../../lib/codigos';
import { textoLitros } from '../../lib/colheitas';
import { custoEtapa, sacasLiquidas, textoSacas, um } from '../../lib/posColheita';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Relacao = 'fases' | 'secagens' | 'pilagens';

/** Consulta da secagem e da pilagem: pelo nº, secador ou talhão; onde está o café em cada fase; últimas secagens e pilagens. Só mostra. */
export default function ConsultaPosColheita() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [d, setD] = useState<{ secagens: any[]; pilagens: any[]; lotes: any[] } | null>(null);
  const [busca, setBusca] = useState('');
  const [relacao, setRelacao] = useState<Relacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const termo = semAcento(limparBusca(busca));

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      (async () => {
        try {
          const [secagens, pilagens, lotes] = await Promise.all([
            consulta<any[]>(
              supabase
                .from('cafe_secagens')
                .select('*, pessoa:pessoas ( nome ), local:pc_locais ( nome ), itens:cafe_secagem_itens ( litros, lote:pc_lotes ( numero, area:areas ( nome ) ) ), pilados:cafe_pilagem_itens ( sacas_coco )')
                .eq('fazenda_id', fid)
                .order('numero', { ascending: false })
                .limit(500),
            ),
            consulta<any[]>(supabase.from('cafe_pilagens').select('*, pessoa:pessoas ( nome ), itens:cafe_pilagem_itens ( sacas_coco, secagem:cafe_secagens ( numero ) ), armazenados:cafe_lotes ( sacas )').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(500)),
            consulta<any[]>(supabase.from('pc_lotes').select('id, litros, secados:cafe_secagem_itens ( litros )').eq('fazenda_id', fid).limit(2000)),
          ]);
          setD({ secagens, pilagens, lotes });
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid]),
  );

  const quemSecou = (s: any) => (s.onde === 'terceiro' ? um(s.pessoa)?.nome ?? 'Terceiro' : um(s.local)?.nome ?? 'Secador próprio');
  const talhoesDe = (s: any) => [...new Set((s.itens ?? []).map((i: any) => um(um(i.lote)?.area)?.nome).filter(Boolean))].join(', ');

  const linhaSecagem = (s: any) => (
    <Linha
      key={`s${s.id}`}
      titulo={`🔥 Secagem nº ${s.numero} · ${doBanco(s.data_entrada)}`}
      linhas={[`${quemSecou(s)} · ${talhoesDe(s)}`, s.sacas_secas != null ? `${textoLitros(s.litros)} → ${textoSacas(s.sacas_secas)} secas (saída ${doBanco(s.data_saida)})` : `${textoLitros(s.litros)} · no secador`]}
      direita={custoEtapa(s) ? formatarMoeda(custoEtapa(s)) : undefined}
      onPress={() => navegacao.navigate('PosColheitaDetalhe', { tipo: 'secagem', id: s.id })}
    />
  );
  const linhaPilagem = (g: any) => (
    <Linha
      key={`p${g.id}`}
      titulo={`⚙️ Pilagem nº ${g.numero} · ${doBanco(g.data)}`}
      linhas={[
        `${g.onde === 'terceiro' ? um(g.pessoa)?.nome ?? 'Terceiro' : 'Máquina própria'} · secagens ${(g.itens ?? []).map((i: any) => `nº ${um(i.secagem)?.numero}`).join(', ')}`,
        `${textoSacas(g.sacas_coco)} em coco → ${textoSacas(g.sacas_beneficiadas)} beneficiadas`,
      ]}
      direita={custoEtapa(g) ? formatarMoeda(custoEtapa(g)) : undefined}
      onPress={() => navegacao.navigate('PosColheitaDetalhe', { tipo: 'pilagem', id: g.id })}
    />
  );

  if (!d) return erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />;

  const achadas = termo
    ? [
        ...d.secagens.filter((s) => String(s.numero) === termo || semAcento(`secagem ${quemSecou(s)} ${talhoesDe(s)}`).includes(termo)).map(linhaSecagem),
        ...d.pilagens.filter((g) => String(g.numero) === termo || semAcento(`pilagem ${um(g.pessoa)?.nome ?? 'propria'}`).includes(termo)).map(linhaPilagem),
      ]
    : [];

  // ---- onde está o café ----
  const semSecar = d.lotes.map((l) => Number(l.litros ?? 0) - (l.secados ?? []).reduce((t: number, x: any) => t + Number(x.litros), 0)).filter((x) => x > 0.5);
  const noSecador = d.secagens.filter((s) => s.sacas_secas == null);
  const semPilar = d.secagens
    .filter((s) => s.sacas_secas != null)
    .map((s) => sacasLiquidas(s) - (s.pilados ?? []).reduce((t: number, x: any) => t + Number(x.sacas_coco), 0))
    .filter((x) => x > 0.005);
  const beneficiadas = d.pilagens.reduce((t, g) => t + Number(g.sacas_beneficiadas) - Number(g.sacas_pagas ?? 0), 0);
  const armazenadas = d.pilagens.reduce((t, g) => t + (g.armazenados ?? []).reduce((s: number, x: any) => s + Number(x.sacas), 0), 0);
  const soma = (l: number[]) => l.reduce((t, x) => t + x, 0);

  const RELACOES: { valor: Relacao; rotulo: string }[] = [
    { valor: 'fases', rotulo: 'Onde está o café' },
    { valor: 'secagens', rotulo: 'Últimas secagens' },
    { valor: 'pilagens', rotulo: 'Últimas pilagens' },
  ];
  const fechar = <Botao titulo="Fechar a relação" tipo="secundario" onPress={() => setRelacao(null)} />;

  return (
    <>
      <Busca
        valor={busca}
        aoMudar={(t) => {
          setBusca(t);
          if (t) setRelacao(null);
        }}
        dica="Nº, secador, quem pilou ou talhão"
      />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {termo ? (
        achadas.length === 0 ? <Text style={estilos.dica}>Nada com "{busca.trim()}".</Text> : <Lista>{achadas.slice(0, 100)}</Lista>
      ) : relacao === 'fases' ? (
        <>
          <Secao titulo="Onde está o café" />
          <View style={estilos.caixa}>
            <Fase titulo="Colhido, aguardando secagem" valor={textoLitros(soma(semSecar))} detalhe={`${semSecar.length} ${semSecar.length === 1 ? 'colheita' : 'colheitas'}`} />
            <Fase titulo="No secador" valor={textoLitros(soma(noSecador.map((s) => Number(s.litros))))} detalhe={`${noSecador.length} ${noSecador.length === 1 ? 'secagem' : 'secagens'} sem saída`} />
            <Fase titulo="Seco (em coco), aguardando pilagem" valor={textoSacas(soma(semPilar))} detalhe={`${semPilar.length} ${semPilar.length === 1 ? 'secagem' : 'secagens'}`} />
            <Fase titulo="Beneficiado, aguardando entrada no armazém" valor={textoSacas(Math.max(beneficiadas - armazenadas, 0))} detalhe="suas sacas de 60 kg" />
            <Fase titulo="Já entrou no armazém" valor={textoSacas(armazenadas)} detalhe={`${formatarNumero(armazenadas * 60)} kg`} forte />
          </View>
          <Text style={estilos.nota}>O estoque por armazém e por tipo de café está em Agrícola › Armazém de café › Consultar.</Text>
          {fechar}
        </>
      ) : relacao === 'secagens' ? (
        <>
          <Secao titulo="Últimas secagens" />
          {d.secagens.length === 0 ? <Text style={estilos.dica}>Nenhuma secagem lançada.</Text> : <Lista>{d.secagens.slice(0, 50).map(linhaSecagem)}</Lista>}
          {fechar}
        </>
      ) : relacao === 'pilagens' ? (
        <>
          <Secao titulo="Últimas pilagens" />
          {d.pilagens.length === 0 ? <Text style={estilos.dica}>Nenhuma pilagem lançada.</Text> : <Lista>{d.pilagens.slice(0, 50).map(linhaPilagem)}</Lista>}
          {fechar}
        </>
      ) : (
        <View style={{ gap: 10 }}>
          {RELACOES.map((r) => (
            <Botao key={r.valor} titulo={r.rotulo} tipo="secundario" onPress={() => setRelacao(r.valor)} />
          ))}
        </View>
      )}
    </>
  );
}

function Fase({ titulo, valor, detalhe, forte }: { titulo: string; valor: string; detalhe?: string; forte?: boolean }) {
  return (
    <View style={estilos.fase}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.faseTitulo}>{titulo}</Text>
        {detalhe ? <Text style={estilos.nota}>{detalhe}</Text> : null}
      </View>
      <Text style={[estilos.faseValor, forte && { color: cores.primariaEscura }]}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 12 },
  fase: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faseTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  faseValor: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
});
