import React, { useCallback, useEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import CampoBuscaRapida, { type ItemRapido } from '../../componentes/CampoBuscaRapida';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, lerNumero } from '../../lib/formatos';
import { semAcento } from '../../lib/codigos';
import { textoSacas } from '../../lib/posColheita';
import { CAMPOS_POSICAO, ROTULO_MOVIMENTO, TIPOS_MOVIMENTO, ePropio, nomeLocal, posicoes, rotuloTipo, um, type Posicao } from '../../lib/armazem';
import { cores, tam } from '../../tema';

const n = (t: string) => lerNumero(t);

/** Movimentar o café guardado: transferir entre armazéns, lançar quebra, taxa de armazenagem (em R$ ou em sacas) e ajuste de contagem. */
export default function MovimentoCafeAba({ abas }: { abas: React.ReactNode }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [pos, setPos] = useState<Posicao[] | null>(null);
  const [ultimos, setUltimos] = useState<any[]>([]);
  const [chave, setChave] = useState<string | null>(null);
  const [tipo, setTipo] = useState('transferencia');
  const [data, setData] = useState(hojeBR());
  const [sacas, setSacas] = useState('');
  const [destOnde, setDestOnde] = useState('terceiro');
  const [destLocal, setDestLocal] = useState<string | null>(null);
  const [destTerceiro, setDestTerceiro] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [venc, setVenc] = useState('');
  const [obs, setObs] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fid) return;
    try {
      const [movs, ult] = await Promise.all([
        consulta<any[]>(supabase.from('cafe_movimentos').select(CAMPOS_POSICAO).eq('fazenda_id', fid).limit(10000)),
        consulta<any[]>(
          supabase.from('cafe_movimentos').select('id, data, tipo, sacas, valor, par_id, observacoes, lote:cafe_lotes ( numero ), local:pc_locais ( nome, tipo )').eq('fazenda_id', fid).not('tipo', 'in', '(entrada,venda)').order('created_at', { ascending: false }).limit(40),
        ),
      ]);
      setPos(posicoes(movs));
      // a transferência tem duas pontas: mostra só a de saída, com o destino
      const destino: Record<string, any> = {};
      for (const m of ult) if (m.par_id && Number(m.sacas) > 0) destino[m.par_id] = um(m.local);
      setUltimos(ult.filter((m) => !(m.par_id && Number(m.sacas) > 0)).map((m) => ({ ...m, destino: m.par_id ? destino[m.par_id] : null })).slice(0, 15));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [fid]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const p = (pos ?? []).find((x) => x.chave === chave) ?? null;
  const terceiro = p ? !ePropio(p.local) : false;

  const buscarLocal = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      const d = await consulta<any[]>(supabase.from('pc_locais').select('id, nome, tipo').eq('fazenda_id', fid!).in('tipo', ['tulha', 'silo']).eq('ativo', true).order('nome'));
      const termo = semAcento(t.trim());
      return d.filter((x) => !termo || semAcento(x.nome).includes(termo)).map((x) => ({ id: x.id, titulo: x.nome, detalhe: 'Na fazenda' }));
    },
    [fid],
  );
  const lerLocal = useCallback(async (lid: string) => (await supabase.from('pc_locais').select('nome').eq('id', lid).maybeSingle()).data?.nome ?? null, []);
  const criarLocal = useCallback(
    async (nome: string): Promise<ItemRapido> => {
      const ja = await consulta<any[]>(supabase.from('pc_locais').select('id, nome').eq('fazenda_id', fid!).in('tipo', ['tulha', 'silo']));
      const igual = ja.find((x) => semAcento(x.nome.trim()) === semAcento(nome.trim()));
      if (igual) return { id: igual.id, titulo: igual.nome };
      const d = await consulta<any>(supabase.from('pc_locais').insert({ fazenda_id: fid, nome: nome.trim(), tipo: 'tulha' }).select('id, nome').single());
      return { id: d.id, titulo: d.nome };
    },
    [fid],
  );

  function limpar() {
    setChave(null);
    setTipo('transferencia');
    setData(hojeBR());
    setSacas('');
    setDestLocal(null);
    setDestTerceiro(null);
    setValor('');
    setVenc('');
    setObs('');
    setErro(null);
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    if (!p) return setErro('Escolha o lote e o armazém onde o café está.');
    if (!dataValida(data)) return setErro('Informe a data.');
    if (paraBanco(data)! > hojeBanco()) return setErro('A data não pode ser futura.');
    const q = n(sacas);
    if (tipo === 'transferencia') {
      if (!q || q <= 0) return setErro('Informe quantas sacas transferir.');
      if (destOnde === 'fazenda' ? !destLocal : !destTerceiro) return setErro('Informe o armazém de destino.');
    }
    if (tipo === 'quebra' && (!q || q <= 0)) return setErro('Informe a quebra em sacas.');
    if (tipo === 'ajuste' && !q) return setErro('Informe o ajuste em sacas (com sinal de menos para diminuir).');
    if (tipo === 'ajuste' && !obs.trim()) return setErro('Explique o motivo do ajuste nas observações.');
    if (tipo === 'taxa' && !(n(valor) || (q && q > 0))) return setErro('Informe a taxa em R$ ou em sacas.');
    if (tipo !== 'ajuste' && q && q > p.saldo + 0.005) return setErro(`O lote só tem ${textoSacas(p.saldo)} neste armazém.`);
    if (tipo === 'taxa' && venc && !dataValida(venc)) return setErro('Vencimento inválido.');

    setSalvando(true);
    const { data: r, error } = await supabase.rpc('movimentar_cafe', {
      p: {
        fazenda_id: fid,
        lote_id: p.loteId,
        local_id: p.localId,
        tipo,
        data: paraBanco(data),
        sacas: q,
        destino_local_id: tipo === 'transferencia' && destOnde === 'fazenda' ? destLocal : '',
        destino_terceiro_id: tipo === 'transferencia' && destOnde === 'terceiro' ? destTerceiro : '',
        valor: tipo === 'taxa' ? n(valor) : null,
        vencimento: tipo === 'taxa' && dataValida(venc) ? paraBanco(venc) : '',
        observacoes: obs.trim(),
      },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { lote: number; saldo: number; titulo: number | null };
    const nome = p.local?.nome ?? '';
    limpar();
    setAviso(`${ROTULO_MOVIMENTO[tipo]} lançada no lote nº ${res.lote}: ficaram ${textoSacas(res.saldo)} em ${nome}${res.titulo ? `; título nº ${res.titulo} no Contas a pagar` : ''}.`);
    carregar();
  }

  function excluir(m: any) {
    Alert.alert('Excluir movimentação', `Excluir a ${ROTULO_MOVIMENTO[m.tipo].toLowerCase()} de ${doBanco(m.data)} do lote nº ${um(m.lote)?.numero}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_movimento_cafe', { p_id: m.id }), 'cafe_movimento_id', String(m.id));
          if (error) return setErro(traduzirErro(error));
          setAviso('Movimentação excluída.');
          carregar();
        },
      },
    ]);
  }

  return (
    <Tela rodape={<RodapeAcoes titulo="Lançar movimentação" aoConfirmar={salvar} carregando={salvando} aoDescartar={chave ? limpar : undefined} erro={erro} />}>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}

      <Secao titulo="Café guardado" />
      {pos === null ? null : pos.length === 0 ? (
        <Text style={estilos.nota}>Nenhum café em estoque. Lance a entrada na aba Entrada.</Text>
      ) : (
        <View style={estilos.caixa}>
          {pos.map((x) => {
            const marcado = chave === x.chave;
            return (
              <Pressable key={x.chave} onPress={() => setChave(x.chave)} accessibilityRole="radio" accessibilityState={{ checked: marcado }} style={estilos.opcao}>
                <Ionicons name={marcado ? 'radio-button-on' : 'radio-button-off'} size={24} color={marcado ? cores.primaria : cores.textoSuave} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.opcaoTitulo}>
                    Lote nº {x.numero} · {nomeLocal(x.local)}
                  </Text>
                  <Text style={estilos.nota}>{rotuloTipo(x.lote ?? {})}</Text>
                </View>
                <Text style={estilos.saldo}>{textoSacas(x.saldo)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {p && (
        <>
          <Secao titulo="O que fazer" />
          <Escolha opcoes={TIPOS_MOVIMENTO} valor={[tipo]} aoMudar={(v) => setTipo(v[0])} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Data *" valor={data} aoMudar={setData} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo
                rotulo={tipo === 'taxa' ? 'Taxa em sacas' : tipo === 'ajuste' ? 'Sacas (+ ou −) *' : 'Sacas *'}
                value={sacas}
                onChangeText={setSacas}
                keyboardType={tipo === 'ajuste' ? 'numbers-and-punctuation' : 'decimal-pad'}
              />
            </View>
          </View>

          {tipo === 'transferencia' && (
            <>
              <Escolha
                rotulo="Para onde"
                opcoes={[
                  { valor: 'terceiro', rotulo: 'Para terceiros' },
                  { valor: 'fazenda', rotulo: 'Para a fazenda' },
                ]}
                valor={[destOnde]}
                aoMudar={(v) => setDestOnde(v[0])}
              />
              {destOnde === 'fazenda' ? (
                <CampoBuscaRapida rotulo="Armazém da fazenda *" valorId={destLocal} aoMudar={setDestLocal} buscar={buscarLocal} lerNome={lerLocal} criar={criarLocal} rotuloNovo="novo armazém" icone="home" placeholder="Ex.: Armazém, Tulha 1" />
              ) : (
                <CampoPessoaBusca rotulo="Cooperativa ou cliente *" valorId={destTerceiro} aoMudar={setDestTerceiro} tipoNovo="cliente" />
              )}
              <Text style={estilos.nota}>O lote continua o mesmo, com a mesma classificação; só muda de armazém.</Text>
            </>
          )}
          {tipo === 'quebra' && <Text style={estilos.nota}>Perda de peso ou diferença na pesagem do armazém: as sacas saem do estoque.</Text>}
          {tipo === 'ajuste' && <Text style={estilos.nota}>Correção de contagem. Use o sinal de menos para diminuir (ex.: -2). Pede o motivo nas observações e só quem tem acesso completo lança.</Text>}
          {tipo === 'taxa' && (
            <>
              {terceiro ? (
                <View style={estilos.linha}>
                  <View style={{ flex: 1 }}>
                    <CampoMoeda rotulo="Taxa em R$" valor={valor} aoMudar={setValor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CampoData rotulo="Vencimento" valor={venc} aoMudar={setVenc} />
                  </View>
                </View>
              ) : null}
              <Text style={estilos.nota}>
                {terceiro
                  ? 'Em R$, gera um título no Contas a pagar em nome do dono do armazém (conta Frete e armazenagem). Em sacas, o café sai do seu saldo. Pode ser as duas coisas.'
                  : 'Armazém da fazenda: só dá para lançar taxa em sacas. A taxa em R$ é para café em armazém de terceiro.'}
              </Text>
            </>
          )}
          <Campo rotulo={tipo === 'ajuste' ? 'Motivo *' : 'Observações'} value={obs} onChangeText={setObs} autoCapitalize="sentences" />
        </>
      )}

      {ultimos.length > 0 && (
        <>
          <Secao titulo="Últimas movimentações" />
          <View style={estilos.caixa}>
            {ultimos.map((m) => (
              <View key={m.id} style={estilos.opcao}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.opcaoTitulo}>
                    {ROTULO_MOVIMENTO[m.tipo]} · lote nº {um(m.lote)?.numero}
                  </Text>
                  <Text style={estilos.nota}>
                    {doBanco(m.data)} · {um(m.local)?.nome}
                    {m.destino ? ` → ${m.destino.nome}` : ''}
                    {m.valor ? ` · ${formatarMoeda(Number(m.valor))}` : ''}
                    {m.observacoes ? ` · ${m.observacoes}` : ''}
                  </Text>
                </View>
                {Number(m.sacas) !== 0 && <Text style={estilos.saldo}>{m.tipo === 'ajuste' && Number(m.sacas) > 0 ? '+' : ''}{textoSacas(m.tipo === 'ajuste' ? Number(m.sacas) : Math.abs(Number(m.sacas)))}</Text>}
                <Pressable onPress={() => excluir(m)} hitSlop={10} accessibilityLabel="Excluir movimentação">
                  <Ionicons name="trash-outline" size={22} color={cores.erro} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  opcaoTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  saldo: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
});
