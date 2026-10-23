import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from '../../lib/alerta';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import { useSessao } from '../../contexto/SessaoContext';
import { ADM, centroDaUnidade, ehParticular, idUnidade, nomeUnidade, opcoesUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { escolherImagem } from '../../lib/fotos';
import { listaTiposTitulo, tiposLancamento } from '../../lib/classificacao';
import { arquivoEmBase64, lerExtratoIA, lerOfx, sugerirTipo, textoDeBase64, type ExtratoLido } from '../../lib/conciliacao';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const r2 = (x: number) => Math.round(x * 100) / 100;
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
type Mov = { id: string; data: string; valor: number; descricao: string | null; pessoa: string | null; numero: number | null; fazenda: string | null; documento: string | null };
type LinhaB = { id: string; data: string; valor: number; descricao: string | null; documento: string | null; situacao: string; baixa_id: string | null; como: string | null };

/**
 * V153: Financeiro › Conciliação bancária.
 * Traz o extrato do banco (arquivo OFX do internet banking, foto, PDF ou Excel/CSV), casa sozinho com os
 * pagamentos e recebimentos do sistema (mesma conta, mesmo valor, até 5 dias de diferença) e lista o que
 * não bateu, dos dois lados. Para o que está no banco e não no sistema: dar baixa num título em aberto,
 * lançar como despesa ou receita (Grupo, Fazenda ou Particular com o sócio), parear à mão ou ignorar.
 */
export default function ConciliacaoBancaria() {
  const { fazendas } = useSessao();
  const [contaId, setContaId] = useState<string | null>(null);
  const [contaInfo, setContaInfo] = useState<{ nome: string; conta: string | null } | null>(null);
  const hoje = hojeBanco();
  const [de, setDe] = useState(doBanco(`${somarDias(hoje, -40).slice(0, 7)}-01`));
  const [ate, setAte] = useState(doBanco(hoje));
  const [linhas, setLinhas] = useState<LinhaB[] | null>(null);
  const [sistema, setSistema] = useState<Mov[]>([]);
  const [casadas, setCasadas] = useState<Set<string>>(new Set());
  const [saldoSistema, setSaldoSistema] = useState<number | null>(null);
  const [ultimoExtrato, setUltimoExtrato] = useState<any>(null);
  const [extratos, setExtratos] = useState<any[]>([]);
  const [lido, setLido] = useState<(ExtratoLido & { nome: string | null }) | null>(null);
  const [lendo, setLendo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [verConciliados, setVerConciliados] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const deIso = dataValida(de) ? paraBanco(de) : null;
  const ateIso = dataValida(ate) ? paraBanco(ate) : null;

  const carregarContas = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, agencia, conta, tipo').eq('ativa', true).order('nome'));
    return d.filter((c) => c.tipo !== 'caixa').map((c) => ({ id: c.id, titulo: c.nome, detalhe: [c.banco, c.agencia ? `Ag. ${c.agencia}` : null, c.conta ? `C/C ${c.conta}` : null].filter(Boolean).join(' · ') }));
  }, []);

  const recarregar = useCallback(async () => {
    if (!contaId || !deIso || !ateIso) return;
    setErro(null);
    try {
      const [c, ls, ex, exs] = await Promise.all([
        consulta<any>(supabase.from('contas_bancarias').select('nome, conta').eq('id', contaId).single()),
        consulta<LinhaB[]>(supabase.from('extrato_linhas').select('id, data, valor, descricao, documento, situacao, baixa_id, como').eq('conta_bancaria_id', contaId).gte('data', deIso).lte('data', ateIso).order('data').order('created_at')),
        consulta<any>(supabase.rpc('extrato_contas', { p_contas: [contaId], p_de: deIso, p_ate: ateIso })),
        consulta<any[]>(supabase.from('extratos_bancarios').select('*').eq('conta_bancaria_id', contaId).order('created_at', { ascending: false }).limit(20)),
      ]);
      setContaInfo(c);
      setLinhas(ls.map((x) => ({ ...x, valor: Number(x.valor) })));
      const movs: Mov[] = ((ex?.movimentos ?? []) as any[])
        .filter((m) => !String(m.id).startsWith('ini-'))
        .map((m) => ({ id: m.id, data: m.data, valor: Number(m.valor), descricao: m.descricao, pessoa: m.pessoa, numero: m.numero, fazenda: m.fazenda, documento: m.documento }));
      setSistema(movs);
      setSaldoSistema(r2(Number(ex?.saldo_anterior ?? 0) + movs.reduce((t, m) => t + m.valor, 0)));
      const ids = movs.map((m) => m.id);
      const ligadas = ids.length ? await consulta<any[]>(supabase.from('extrato_linhas').select('baixa_id').in('baixa_id', ids)) : [];
      setCasadas(new Set(ligadas.map((x) => x.baixa_id)));
      setExtratos(exs);
      setUltimoExtrato(exs.filter((x) => x.saldo_final != null && (!x.ate || x.ate <= ateIso)).sort((a, b) => ((a.ate ?? '') < (b.ate ?? '') ? 1 : -1))[0] ?? null);
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [contaId, deIso, ateIso]);
  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // ---------- trazer o extrato ----------
  async function lerArquivo(tipo: 'ofx' | 'pdf' | 'planilha') {
    setErro(null);
    setAviso(null);
    try {
      const tipos = tipo === 'pdf' ? ['application/pdf'] : tipo === 'ofx' ? ['*/*'] : ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values', 'application/vnd.oasis.opendocument.spreadsheet', '*/*'];
      const r = await DocumentPicker.getDocumentAsync({ type: tipos, copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const nome = a.name ?? '';
      setLendo(tipo === 'ofx' ? 'Lendo o arquivo do banco…' : 'A IA está lendo o extrato… (de 20 segundos a 1 minuto)');
      const b64 = await arquivoEmBase64(a.uri);
      let res: ExtratoLido | { erro: string };
      if (tipo === 'ofx' || /\.ofx$/i.test(nome)) {
        res = lerOfx(textoDeBase64(b64));
        if (!res.linhas.length) res = { erro: 'O arquivo não parece um OFX com lançamentos. No internet banking, procure "Exportar extrato" › formato OFX (Money).' };
      } else {
        const pdf = tipo === 'pdf' || /\.pdf$/i.test(nome);
        res = await lerExtratoIA(b64, pdf ? 'application/pdf' : a.mimeType ?? '', nome, pdf ? 'pdf' : 'planilha');
      }
      setLendo(null);
      if ('erro' in res) return setErro(res.erro);
      setLido({ ...res, nome });
    } catch (e: any) {
      setLendo(null);
      setErro(String(e?.message ?? e));
    }
  }
  function tirarFoto() {
    Alert.alert('Foto do extrato', 'Uma página por vez, inteira, com boa luz. Para muitas páginas, prefira o PDF ou o arquivo OFX.', [
      { text: 'Tirar foto', onPress: () => lerFoto(true) },
      { text: 'Escolher da galeria', onPress: () => lerFoto(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }
  async function lerFoto(camera: boolean) {
    setErro(null);
    setAviso(null);
    try {
      const r = await escolherImagem(camera, { quality: 0.8, ladoWeb: 2400 });
      if ('negado' in r) return setErro('Sem permissão para a câmera/fotos. Libere nos Ajustes do celular.');
      if (!r.foto) return;
      setLendo('A IA está lendo o extrato… (uns 20 segundos)');
      const res = await lerExtratoIA(r.foto.base64, r.foto.mimeType, 'foto', 'foto');
      setLendo(null);
      if ('erro' in res) return setErro(res.erro);
      setLido({ ...res, nome: null });
    } catch (e: any) {
      setLendo(null);
      setErro(String(e?.message ?? e));
    }
  }

  async function gravarExtrato() {
    if (!lido || !contaId) return;
    setSalvando(true);
    setErro(null);
    try {
      const imp = await consulta<any>(
        supabase.rpc('importar_extrato', {
          p: { conta_bancaria_id: contaId, de: lido.de, ate: lido.ate, saldo_inicial: lido.saldo_inicial, saldo_final: lido.saldo_final, origem: lido.origem, arquivo: lido.arquivo, nome_arquivo: lido.nome, linhas: lido.linhas },
        }),
      );
      const auto = await consulta<number>(supabase.rpc('conciliar_automatico', { p_conta: contaId, p_dias: 5 }));
      if (lido.de && lido.ate) {
        setDe(doBanco(lido.de));
        setAte(doBanco(lido.ate));
      }
      setLido(null);
      setAviso(
        `Extrato guardado: ${imp.novas} ${imp.novas === 1 ? 'lançamento novo' : 'lançamentos novos'}${imp.repetidas ? ` (${imp.repetidas} já estavam guardados e não entraram de novo)` : ''}. ` +
          `${auto} ${auto === 1 ? 'casou' : 'casaram'} sozinhos com o sistema. Confira abaixo o que não bateu.`,
      );
      await recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setSalvando(false);
  }

  // ---------- ações ----------
  const rodar = async (fn: () => PromiseLike<{ error: any; data?: any }>, ok: string) => {
    setErro(null);
    const { error } = await fn();
    if (error) return setErro(traduzirErro(error));
    setAviso(ok);
    setAberta(null);
    recarregar();
  };
  const pendentes = (linhas ?? []).filter((l) => l.situacao === 'pendente');
  const conciliadas = (linhas ?? []).filter((l) => l.situacao !== 'pendente');
  const soSistema = sistema.filter((m) => !casadas.has(m.id));
  const totBanco = r2(pendentes.reduce((t, l) => t + l.valor, 0));
  const totSistema = r2(soSistema.reduce((t, m) => t + m.valor, 0));
  const dif = ultimoExtrato && saldoSistema != null && ultimoExtrato.ate === ateIso ? r2(Number(ultimoExtrato.saldo_final) - saldoSistema) : null;

  return (
    <Tela>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <SeletorLista
        rotulo="Conta do banco *"
        valorId={contaId}
        aoMudar={(v) => {
          setContaId(v);
          setLido(null);
          setLinhas(null);
        }}
        carregar={carregarContas}
        vazio="Nenhuma conta de banco. Cadastre em Financeiro › Bancos e caixa."
      />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="De" valor={de} aoMudar={setDe} />
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Até" valor={ate} aoMudar={setAte} />
        </View>
      </View>

      {contaId && (
        <View style={estilos.quadro}>
          <Text style={estilos.quadroTitulo}>Trazer o extrato do banco</Text>
          {lendo ? (
            <View style={estilos.linhaCentro}>
              <ActivityIndicator color={cores.primaria} />
              <Text style={estilos.nota}>{lendo}</Text>
            </View>
          ) : (
            <>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="🏦  Arquivo do banco (OFX)" tipo="secundario" onPress={() => lerArquivo('ofx')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao titulo="📄  PDF" tipo="secundario" onPress={() => lerArquivo('pdf')} />
                </View>
              </View>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="📊  Excel / CSV" tipo="secundario" onPress={() => lerArquivo('planilha')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao titulo="📷  Foto" tipo="secundario" onPress={tirarFoto} />
                </View>
              </View>
              <Text style={estilos.nota}>
                O melhor é o OFX: no internet banking (ou no app do banco), Extrato › Exportar › OFX/Money. É exato, não gasta a IA e não repete lançamento. PDF, Excel e foto são lidos pela IA: confira.
              </Text>
            </>
          )}
        </View>
      )}

      {lido && (
        <View style={estilos.caixa}>
          <Text style={estilos.quadroTitulo}>Extrato lido: confira antes de guardar</Text>
          <Par a="Lançamentos" b={String(lido.linhas.length)} />
          <Par a="Período" b={`${lido.de ? doBanco(lido.de) : '?'} a ${lido.ate ? doBanco(lido.ate) : '?'}`} />
          <Par a="Entradas" b={formatarMoeda(lido.linhas.filter((l) => l.valor > 0).reduce((t, l) => t + l.valor, 0))} />
          <Par a="Saídas" b={formatarMoeda(-lido.linhas.filter((l) => l.valor < 0).reduce((t, l) => t + l.valor, 0))} />
          {lido.saldo_final != null && <Par a="Saldo final no banco" b={formatarMoeda(lido.saldo_final)} forte />}
          {lido.conta && contaInfo?.conta && lido.conta.replace(/\D/g, '') !== contaInfo.conta.replace(/\D/g, '') && (
            <Aviso tipo="erro" texto={`A conta do extrato (${lido.conta}) parece diferente da escolhida (${contaInfo.nome}, ${contaInfo.conta}). Confira antes de guardar.`} />
          )}
          {lido.avisos.map((t, k) => (
            <Text key={k} style={estilos.alerta}>
              {t}
            </Text>
          ))}
          {lido.linhas.slice(0, 8).map((l, k) => (
            <Par key={k} a={`${doBanco(l.data)} ${l.descricao}`} b={formatarMoeda(l.valor)} />
          ))}
          {lido.linhas.length > 8 && <Text style={estilos.nota}>… e mais {lido.linhas.length - 8}.</Text>}
          <Botao titulo="Guardar e conciliar" onPress={gravarExtrato} carregando={salvando} />
          <Botao titulo="Descartar" tipo="texto" onPress={() => setLido(null)} />
        </View>
      )}

      {contaId && linhas && (
        <>
          <Secao titulo="Resumo do período" />
          <View style={estilos.caixa}>
            <Par a="Linhas do extrato no período" b={String(linhas.length)} />
            <Par a="Conciliadas" b={String(conciliadas.length)} />
            <Par a="No banco e não no sistema" b={`${pendentes.length} · ${formatarMoeda(totBanco)}`} />
            <Par a="No sistema e não no banco" b={`${soSistema.length} · ${formatarMoeda(totSistema)}`} />
            {saldoSistema != null && <Par a={`Saldo do sistema em ${ate}`} b={formatarMoeda(saldoSistema)} forte />}
            {ultimoExtrato && <Par a={`Saldo do banco em ${ultimoExtrato.ate ? doBanco(ultimoExtrato.ate) : '?'}`} b={formatarMoeda(Number(ultimoExtrato.saldo_final))} forte />}
            {dif != null && (
              <Text style={[estilos.nota, { color: Math.abs(dif) < 0.01 ? cores.primaria : cores.erro, fontWeight: '800' }]}>
                {Math.abs(dif) < 0.01 ? '✓ Saldo do banco = saldo do sistema.' : `Diferença de ${formatarMoeda(dif)} entre o banco e o sistema.`}
              </Text>
            )}
            {linhas.length === 0 && <Text style={estilos.nota}>Nenhum extrato guardado neste período. Traga o extrato acima.</Text>}
          </View>

          {pendentes.length > 0 && (
            <>
              <Secao titulo="No banco e NÃO no sistema" />
              <Text style={estilos.nota}>Toque na linha para resolver: dar baixa num título em aberto, lançar como despesa/receita, parear ou ignorar.</Text>
              {pendentes.map((l) => (
                <LinhaPendente
                  key={l.id}
                  l={l}
                  aberta={aberta === l.id}
                  aoAbrir={() => setAberta(aberta === l.id ? null : l.id)}
                  sistema={soSistema.filter((m) => (m.valor > 0) === (l.valor > 0))}
                  fazendas={fazendas}
                  rodar={rodar}
                />
              ))}
            </>
          )}

          {soSistema.length > 0 && (
            <>
              <Secao titulo="No sistema e NÃO no banco" />
              <Text style={estilos.nota}>Pode ser cheque ainda não compensado, data diferente da do banco, lançado na conta errada ou que não aconteceu. Para casar com uma linha do banco, abra a linha acima › Parear.</Text>
              {soSistema.map((m) => (
                <MovSistema key={m.id} m={m} rodar={rodar} />
              ))}
            </>
          )}

          {conciliadas.length > 0 && (
            <>
              <Secao titulo="Conciliados" />
              <Botao titulo={verConciliados ? 'Esconder os conciliados' : `Ver os ${conciliadas.length} conciliados`} tipo="texto" onPress={() => setVerConciliados(!verConciliados)} />
              {verConciliados &&
                conciliadas.map((l) => (
                  <View key={l.id} style={estilos.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.itemTitulo}>
                        {doBanco(l.data)} · {l.descricao ?? ''}
                      </Text>
                      <Text style={estilos.nota}>
                        {l.situacao === 'ignorado' ? 'Ignorado' : l.como === 'automatico' ? 'Casou sozinho' : l.como === 'baixa' ? 'Baixa de título' : l.como === 'lancado' ? 'Lançado na conciliação' : 'Pareado à mão'}
                      </Text>
                    </View>
                    <Text style={[estilos.valor, { color: l.valor > 0 ? cores.primaria : cores.erro }]}>{formatarMoeda(l.valor)}</Text>
                    <Pressable onPress={() => rodar(() => supabase.rpc('conciliar_desfazer', { p_linha: l.id }), 'Par desfeito: a linha voltou para as pendências.')} hitSlop={8}>
                      <Text style={estilos.link}>Desfazer</Text>
                    </Pressable>
                  </View>
                ))}
              <Text style={estilos.nota}>Desfazer só separa o par: o pagamento ou o lançamento continua no sistema.</Text>
            </>
          )}

          {extratos.length > 0 && (
            <>
              <Secao titulo="Extratos guardados desta conta" />
              {extratos.map((x) => (
                <View key={x.id} style={estilos.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.itemTitulo}>
                      {x.de ? doBanco(x.de) : '?'} a {x.ate ? doBanco(x.ate) : '?'} · {x.origem.toUpperCase()}
                    </Text>
                    <Text style={estilos.nota}>
                      {x.linhas} {x.linhas === 1 ? 'linha' : 'linhas'}
                      {x.saldo_final != null ? ` · saldo ${formatarMoeda(Number(x.saldo_final))}` : ''} · guardado em {doBanco(String(x.created_at).slice(0, 10))}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      Alert.alert('Excluir extrato', 'Tira as linhas deste extrato da conciliação (os pagamentos e lançamentos do sistema ficam). Use se guardou o extrato errado.', [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Excluir', style: 'destructive', onPress: () => rodar(() => supabase.rpc('excluir_extrato', { p_id: x.id }), 'Extrato excluído.') },
                      ])
                    }
                  >
                    <Text style={[estilos.link, { color: cores.erro }]}>Excluir</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </Tela>
  );
}

type Rodar = (fn: () => PromiseLike<{ error: any; data?: any }>, ok: string) => Promise<void>;

/** Uma linha do banco que não está no sistema, com as formas de resolver. */
function LinhaPendente({ l, aberta, aoAbrir, sistema, fazendas, rodar }: { l: LinhaB; aberta: boolean; aoAbrir: () => void; sistema: Mov[]; fazendas: any[]; rodar: Rodar }) {
  const entrada = l.valor > 0;
  const [modo, setModo] = useState<string[]>(['lancar']);
  const [tituloId, setTituloId] = useState<string | null>(null);
  const [baixaId, setBaixaId] = useState<string | null>(null);
  const [unidade, setUnidade] = useState<string>(ADM);
  const [contaId, setContaId] = useState<string | null>(null);
  const [centroId, setCentroId] = useState<string | null>(null);
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState(l.descricao ?? '');
  const [salvando, setSalvando] = useState(false);
  const particular = ehParticular(idUnidade(unidade), fazendas);

  // tipo sugerido pelo histórico do banco (tarifa, IOF, rendimento, energia...)
  useEffect(() => {
    if (!aberta || contaId) return;
    const chave = sugerirTipo(l.descricao ?? '', entrada);
    if (chave) tiposLancamento().then((ts) => setContaId(ts.find((t) => t.chave === chave)?.conta_id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta]);

  const carregarTitulos = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(
      supabase.from('lancamentos').select('id, numero, descricao, valor, valor_pago, data_vencimento, fazenda_id, pessoa:pessoas ( nome )').eq('tipo', entrada ? 'receber' : 'pagar').in('situacao', ['aberto', 'parcial']).limit(500),
    );
    const alvo = Math.abs(l.valor);
    return d
      .map((t) => ({ t, saldo: r2(Number(t.valor) - Number(t.valor_pago ?? 0)) }))
      .sort((a, b) => Math.abs(a.saldo - alvo) - Math.abs(b.saldo - alvo) || (a.t.data_vencimento < b.t.data_vencimento ? -1 : 1))
      .map(({ t, saldo }) => ({
        id: t.id,
        titulo: `${Math.abs(saldo - alvo) < 0.01 ? '✓ ' : ''}Nº ${t.numero} · ${t.descricao ?? ''}`,
        detalhe: [um(t.pessoa)?.nome, `saldo ${formatarMoeda(saldo)}`, t.data_vencimento ? `vence ${doBanco(t.data_vencimento)}` : null, nomeUnidade(t.fazenda_id, fazendas)].filter(Boolean).join(' · '),
      }));
  }, [entrada, l.valor, fazendas]);
  const carregarMovs = useCallback(
    async (): Promise<ItemLista[]> =>
      sistema
        .slice()
        .sort((a, b) => Math.abs(Math.abs(a.valor) - Math.abs(l.valor)) - Math.abs(Math.abs(b.valor) - Math.abs(l.valor)))
        .map((m) => ({ id: m.id, titulo: `${doBanco(m.data)} · ${formatarMoeda(m.valor)}`, detalhe: [m.numero ? `Título nº ${m.numero}` : null, m.descricao, m.pessoa].filter(Boolean).join(' · ') })),
    [sistema, l.valor],
  );
  const carregarTipos = useCallback(() => listaTiposTitulo(entrada ? 'receber' : 'pagar'), [entrada]);
  const carregarCentros = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(supabase.from('centros_custo').select('id, codigo, nome, fazenda_id, centro_pai_id').eq('ativo', true).order('codigo'));
    return d.filter((c) => centroDaUnidade(c, idUnidade(unidade)) && (!particular || c.centro_pai_id)).map((c) => ({ id: c.id, titulo: particular ? c.nome : `${c.codigo ?? ''} ${c.nome}`.trim() }));
  }, [unidade, particular]);

  async function executar() {
    setSalvando(true);
    if (modo[0] === 'baixar') {
      if (!tituloId) {
        setSalvando(false);
        return Alert.alert('Falta', 'Escolha o título.');
      }
      await rodar(() => supabase.rpc('conciliar_baixar', { p: { linha_id: l.id, lancamento_id: tituloId } }), 'Baixa lançada e conciliada.');
    } else if (modo[0] === 'parear') {
      if (!baixaId) {
        setSalvando(false);
        return Alert.alert('Falta', 'Escolha o lançamento do sistema.');
      }
      await rodar(() => supabase.rpc('conciliar_parear', { p_linha: l.id, p_baixa: baixaId, p_como: 'manual' }), 'Pareado.');
    } else {
      if (!contaId) {
        setSalvando(false);
        return Alert.alert('Falta', `Escolha o que é ${entrada ? 'esta receita' : 'esta despesa'}.`);
      }
      if (particular && !centroId) {
        setSalvando(false);
        return Alert.alert('Falta', 'Diga de qual sócio é.');
      }
      await rodar(
        () => supabase.rpc('conciliar_lancar', { p: { linha_id: l.id, fazenda_id: idUnidade(unidade), conta_contabil_id: contaId, centro_custo_id: centroId, pessoa_id: pessoaId, descricao } }),
        `${entrada ? 'Receita' : 'Despesa'} lançada em ${nomeUnidade(idUnidade(unidade), fazendas)}, já ${entrada ? 'recebida' : 'paga'} e conciliada.`,
      );
    }
    setSalvando(false);
  }

  return (
    <View style={[estilos.cartao, aberta && { borderColor: cores.primaria }]}>
      <Pressable onPress={aoAbrir} style={estilos.itemCab}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.itemTitulo}>
            {doBanco(l.data)} · {l.descricao ?? ''}
          </Text>
          {l.documento ? <Text style={estilos.nota}>Doc. {l.documento}</Text> : null}
        </View>
        <Text style={[estilos.valor, { color: entrada ? cores.primaria : cores.erro }]}>{formatarMoeda(l.valor)}</Text>
      </Pressable>
      {aberta && (
        <View style={{ gap: 10 }}>
          <Escolha
            opcoes={[
              { valor: 'lancar', rotulo: `Lançar ${entrada ? 'receita' : 'despesa'}` },
              { valor: 'baixar', rotulo: `Baixar conta a ${entrada ? 'receber' : 'pagar'}` },
              { valor: 'parear', rotulo: 'Parear com o sistema' },
            ]}
            valor={modo}
            aoMudar={setModo}
          />
          {modo[0] === 'lancar' && (
            <>
              <Escolha
                rotulo="De quem é *"
                opcoes={opcoesUnidade(fazendas).map((o) => (o.valor === ADM ? { ...o, rotulo: 'Grupo (Administrativo)' } : o))}
                valor={[unidade]}
                aoMudar={(v) => {
                  setUnidade(v[0]);
                  setCentroId(null);
                }}
              />
              {particular && <Text style={estilos.nota}>Particular dos sócios: fica fora do resultado das fazendas (vai ao Patrimônio Líquido).</Text>}
              <SeletorLista rotulo={entrada ? 'O que é esta receita *' : 'O que é esta despesa *'} valorId={contaId} aoMudar={setContaId} carregar={carregarTipos} dicaBusca="Ex.: tarifa, energia, rendimento" />
              <SeletorLista
                rotulo={particular ? 'De qual sócio *' : 'Centro de custo (opcional)'}
                valorId={centroId}
                aoMudar={setCentroId}
                carregar={carregarCentros}
                permitirLimpar={!particular}
                vazio={particular ? 'Nenhum sócio neste Particular. Cadastre em Mais › Fazendas e Particular.' : 'Nenhum centro de custo nesta unidade.'}
              />
              <CampoPessoaBusca rotulo={entrada ? 'Quem pagou (opcional)' : 'Para quem (opcional)'} valorId={pessoaId} aoMudar={setPessoaId} tipoNovo={entrada ? 'cliente' : 'fornecedor'} />
              <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} autoCapitalize="sentences" />
              <Text style={estilos.nota}>Cria o título já {entrada ? 'recebido' : 'pago'} nesta conta, na data e no valor do banco.</Text>
            </>
          )}
          {modo[0] === 'baixar' && (
            <>
              <SeletorLista rotulo={`Conta a ${entrada ? 'receber' : 'pagar'} em aberto *`} valorId={tituloId} aoMudar={setTituloId} carregar={carregarTitulos} dicaBusca="Nº, descrição ou pessoa" vazio="Nenhum título em aberto." />
              <Text style={estilos.nota}>✓ = mesmo valor. Se o banco tiver mais que o saldo do título, a diferença entra como juros/multa; se tiver menos, fica pago em parte.</Text>
            </>
          )}
          {modo[0] === 'parear' && (
            <SeletorLista rotulo="Lançamento do sistema (desta conta) *" valorId={baixaId} aoMudar={setBaixaId} carregar={carregarMovs} vazio="Nada do sistema sem par neste período e nesta conta." />
          )}
          <Botao titulo={modo[0] === 'lancar' ? 'Lançar e conciliar' : modo[0] === 'baixar' ? 'Dar baixa e conciliar' : 'Parear'} onPress={executar} carregando={salvando} />
          <Botao
            titulo="Ignorar esta linha"
            tipo="texto"
            onPress={() =>
              Alert.alert('Ignorar', 'A linha sai das pendências sem lançar nada (ex.: aplicação e resgate automáticos que você não controla). Pode desfazer depois.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Ignorar', onPress: () => rodar(() => supabase.rpc('conciliar_ignorar', { p_linha: l.id }), 'Linha ignorada.') },
              ])
            }
          />
        </View>
      )}
    </View>
  );
}

/** Lançamento do sistema sem par no banco: mostra e permite estornar (se não aconteceu). */
function MovSistema({ m, rodar }: { m: Mov; rodar: Rodar }) {
  const [estornar, setEstornar] = useState(false);
  const [motivo, setMotivo] = useState('');
  return (
    <View style={estilos.cartao}>
      <View style={estilos.itemCab}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.itemTitulo}>
            {doBanco(m.data)} · {m.numero ? `Título nº ${m.numero} · ` : ''}
            {m.descricao ?? ''}
          </Text>
          <Text style={estilos.nota}>{[m.pessoa, m.fazenda, m.documento ? `Doc. ${m.documento}` : null].filter(Boolean).join(' · ')}</Text>
        </View>
        <Text style={[estilos.valor, { color: m.valor > 0 ? cores.primaria : cores.erro }]}>{formatarMoeda(m.valor)}</Text>
      </View>
      {estornar ? (
        <View style={{ gap: 8 }}>
          <Campo rotulo="Motivo do estorno *" value={motivo} onChangeText={setMotivo} autoCapitalize="sentences" placeholder="Ex.: lançado em duplicidade" />
          <Botao
            titulo="Estornar este pagamento"
            tipo="perigo"
            onPress={() => {
              if (!motivo.trim()) return Alert.alert('Falta', 'Informe o motivo.');
              rodar(() => supabase.rpc('estornar_baixa', { p_id: m.id, p_motivo: motivo }), 'Pagamento estornado: o título voltou a ficar em aberto.');
            }}
          />
          <Botao titulo="Cancelar" tipo="texto" onPress={() => setEstornar(false)} />
        </View>
      ) : (
        <Pressable onPress={() => setEstornar(true)} hitSlop={6}>
          <Text style={estilos.link}>Não aconteceu? Estornar…</Text>
        </Pressable>
      )}
    </View>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '800', color: cores.texto }]} numberOfLines={2}>
        {a}
      </Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linhaCentro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  quadro: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 8 },
  quadroTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.info },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: cores.borda },
  itemCab: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemTitulo: { fontSize: tam.pequeno + 2, fontWeight: '700', color: cores.texto },
  valor: { fontSize: tam.pequeno + 2, fontWeight: '800' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, flexShrink: 1 },
  alerta: { fontSize: tam.pequeno, color: cores.erro, fontWeight: '700' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto },
});
