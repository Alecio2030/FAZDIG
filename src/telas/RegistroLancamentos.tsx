import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Tela from '../componentes/Tela';
import Aviso from '../componentes/Aviso';
import Botao from '../componentes/Botao';
import CampoData from '../componentes/CampoData';
import Escolha from '../componentes/Escolha';
import Resumo from '../componentes/Resumo';
import { useSessao } from '../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { agruparPorPessoa, eDono, type LinhaAcesso } from '../lib/acessos';
import { somarDiasIso } from '../lib/agenda';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../lib/datas';
import { cores, tam } from '../tema';

type Registro = { quando: string; quem: string; email: string | null; fazenda: string | null; tabela: string; o_que: string; detalhe: string | null };

/** Dia (aaaa-mm-dd) e hora (hh:mm) no horário de Brasília. */
function diaHora(quando: string): { dia: string; hora: string } {
  const d = new Date(new Date(quando).getTime() - 3 * 3600 * 1000).toISOString();
  return { dia: d.slice(0, 10), hora: d.slice(11, 16) };
}

/**
 * Mais › Auditoria: registro dos lançamentos por período e por pessoa (só o dono e o administrador).
 * Mostra a operação (compra, atividade, conta a pagar...), quem fez, quando e em qual fazenda. Só consulta: nada é alterado aqui.
 */
export default function RegistroLancamentos() {
  const { fazendaAtiva } = useSessao();
  const chefe = eDono(fazendaAtiva?.perfil);
  const [periodo, setPeriodo] = useState<string[]>(['hoje']);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pessoas, setPessoas] = useState<{ valor: string; rotulo: string }[]>([]);
  const [quem, setQuem] = useState<string[]>(['todos']);
  const [linhas, setLinhas] = useState<Registro[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!chefe) return;
    consulta<LinhaAcesso[]>(supabase.rpc('listar_acessos'))
      .then((l) => setPessoas(agruparPorPessoa(l).filter((p) => p.situacao !== 'convite').map((p) => ({ valor: p.email, rotulo: p.nome ?? p.email }))))
      .catch(() => setPessoas([]));
  }, [chefe]);

  const faixa = useMemo(() => {
    const hoje = hojeBanco();
    if (periodo[0] === 'hoje') return { de: hoje, ate: hoje };
    if (periodo[0] === '7') return { de: somarDiasIso(hoje, -6), ate: hoje };
    if (periodo[0] === '30') return { de: somarDiasIso(hoje, -29), ate: hoje };
    if (!dataValida(de) || !dataValida(ate)) return null;
    const a = paraBanco(de)!;
    const b = paraBanco(ate)!;
    return a <= b ? { de: a, ate: b } : null;
  }, [periodo, de, ate]);

  const buscar = useCallback(async () => {
    if (!faixa) return setErro('Informe as duas datas do período.');
    setErro(null);
    setBuscando(true);
    const { data, error } = await supabase.rpc('registro_lancamentos', { p_de: faixa.de, p_ate: faixa.ate, p_email: quem[0] === 'todos' ? null : quem[0] });
    setBuscando(false);
    if (error) {
      setLinhas(null);
      return setErro(/registro_lancamentos/i.test(error.message ?? '') ? 'Falta atualizar o banco: rode o arquivo "Fazenda Digital V122 - banco.sql" no Supabase.' : traduzirErro(error));
    }
    setLinhas((data ?? []) as Registro[]);
  }, [faixa, quem]);

  // Abre já mostrando o dia de hoje.
  useEffect(() => {
    if (chefe) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chefe]);

  if (!chefe) {
    return (
      <Tela>
        <Aviso tipo="info" texto="Só o dono ou o administrador consulta quem lançou." />
      </Tela>
    );
  }

  // agrupa por dia, do mais novo para o mais antigo
  const dias: { dia: string; itens: (Registro & { hora: string })[] }[] = [];
  for (const l of linhas ?? []) {
    const { dia, hora } = diaHora(l.quando);
    const grupo = dias[dias.length - 1]?.dia === dia ? dias[dias.length - 1] : (dias.push({ dia, itens: [] }), dias[dias.length - 1]);
    grupo.itens.push({ ...l, hora });
  }
  const porPessoa = new Map<string, number>();
  for (const l of linhas ?? []) porPessoa.set(l.quem, (porPessoa.get(l.quem) ?? 0) + 1);
  const total = linhas?.length ?? 0;

  return (
    <Tela>
      <Escolha
        rotulo="Período"
        opcoes={[
          { valor: 'hoje', rotulo: 'Hoje' },
          { valor: '7', rotulo: '7 dias' },
          { valor: '30', rotulo: '30 dias' },
          { valor: 'outro', rotulo: 'Outro' },
        ]}
        valor={periodo}
        aoMudar={(v) => {
          setPeriodo(v);
          setLinhas(null);
        }}
      />
      {periodo[0] === 'outro' && (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="De" valor={de} aoMudar={setDe} />
          </View>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="Até" valor={ate} aoMudar={setAte} />
          </View>
        </View>
      )}
      {pessoas.length > 1 && (
        <Escolha
          rotulo="Quem"
          opcoes={[{ valor: 'todos', rotulo: 'Todos' }, ...pessoas]}
          valor={quem}
          aoMudar={(v) => {
            setQuem(v);
            setLinhas(null);
          }}
        />
      )}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Botao titulo="Consultar" onPress={buscar} carregando={buscando} />

      {linhas && faixa && (
        <Resumo
          esquerda={`${total} ${total === 1 ? 'lançamento' : 'lançamentos'}${total >= 1000 ? ' (os 1.000 mais recentes)' : ''}`}
          direita={faixa.de === faixa.ate ? doBanco(faixa.de) : `${doBanco(faixa.de)} a ${doBanco(faixa.ate)}`}
        />
      )}
      {linhas && total === 0 && <Aviso tipo="info" texto="Nada lançado neste período. O registro começa a contar da instalação da V122: o que foi lançado antes não tem o autor guardado em todas as telas." />}
      {porPessoa.size > 1 && (
        <Text style={estilos.nota}>
          {[...porPessoa.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([nome, n]) => `${nome}: ${n}`)
            .join('  ·  ')}
        </Text>
      )}

      {dias.map((d) => (
        <View key={d.dia} style={{ gap: 8 }}>
          <Text style={estilos.dia}>{doBanco(d.dia)}</Text>
          <View style={estilos.lista}>
            {d.itens.map((l, i) => (
              <View key={`${l.quando}-${l.tabela}-${i}`} style={[estilos.item, i > 0 && estilos.divisor]}>
                <Text style={estilos.hora}>{l.hora}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={estilos.oQue}>{l.o_que}</Text>
                  {l.detalhe ? <Text style={estilos.detalhe}>{l.detalhe}</Text> : null}
                  <Text style={estilos.quem}>
                    {l.quem}
                    {l.fazenda ? ` · ${l.fazenda}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      <Text style={estilos.nota}>Aparece a operação de origem: a compra (e não cada título dela), a atividade (e não cada saída de estoque). Só consulta: nada é alterado nesta tela.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  dia: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura, marginTop: 6 },
  lista: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, overflow: 'hidden' },
  item: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'flex-start' },
  divisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  hora: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.textoSuave, width: 46 },
  oQue: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  detalhe: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 20 },
  quem: { fontSize: tam.pequeno, color: cores.cafe, fontWeight: '700' },
});
