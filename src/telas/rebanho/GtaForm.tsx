import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Busca from '../../componentes/Busca';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, paraBanco } from '../../lib/datas';
import { formatarNumero, mascaraCpfCnpj, somenteDigitos } from '../../lib/formatos';
import { escolherImagem } from '../../lib/fotos';
import { arquivoEmBase64 } from '../../lib/conciliacao';
import { ROTULO_MOV } from '../../lib/movimentacoes';
import {
  FINALIDADES_GTA,
  LINHAS_GTA,
  PARTE_VAZIA,
  TRANSPORTES_GTA,
  URL_SIAPEC,
  dadosDoMovimento,
  lerGta,
  mascaraEstabelecimento,
  parteDaFazenda,
  parteDaPessoa,
  partesNumeroGta,
  totalSexo,
  femeas0a12,
  type Parte,
  type Quantidades,
} from '../../lib/gta';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
// tipos de movimento que pedem GTA (o transporte do gado)
const TIPOS_COM_GTA = ['compra', 'venda', 'entrada_parceria', 'saida_parceria', 'transferencia_saida', 'transferencia_entrada'];
const ENTRADA_TIPOS = ['compra', 'entrada_parceria', 'transferencia_entrada'];

/** Copiar para colar no Siapec: no navegador vai para a área de transferência; no celular, toque e segure o campo. */
async function copiar(t: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
    try {
      await (navigator as any).clipboard.writeText(t);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Um campo da ficha com "Copiar" ao lado (no navegador). */
function CampoCopiar({ rotulo, valor, aoMudar, teclado, mascara }: { rotulo: string; valor: string; aoMudar: (t: string) => void; teclado?: 'number-pad'; mascara?: (t: string) => string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <View style={estilos.linhaCopiar}>
      <View style={{ flex: 1 }}>
        <Campo rotulo={rotulo} value={valor} onChangeText={(t) => aoMudar(mascara ? mascara(t) : t)} keyboardType={teclado} />
      </View>
      {Platform.OS === 'web' && !!valor && (
        <Text
          style={estilos.copiar}
          onPress={async () => {
            if (await copiar(valor)) {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }
          }}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </Text>
      )}
    </View>
  );
}

type Sugestao = { chave: string; titulo: string; detalhe: string | null; pegar: () => Promise<Parte> };
type FazendaGrupo = { id: string; nome: string; municipio?: string | null; uf?: string | null };

/** V164: Nome primeiro; ao digitar aparecem as pessoas (com cada fazenda delas) e as fazendas do grupo: tocar traz todos os dados. */
function BlocoParte({ titulo, parte, aoMudar, fazendasGrupo }: { titulo: string; parte: Parte; aoMudar: (p: Parte) => void; fazendasGrupo: FazendaGrupo[] }) {
  const m = (k: keyof Parte) => (t: string) => aoMudar({ ...parte, [k]: t });
  const [busca, setBusca] = useState<string | null>(null); // só busca o que a pessoa digitou
  const [sug, setSug] = useState<Sugestao[]>([]);
  useEffect(() => {
    const t = (busca ?? '').trim().replace(/[,()*%\\]/g, '');
    if (t.length < 2) {
      setSug([]);
      return;
    }
    let vivo = true;
    const tm = setTimeout(async () => {
      const { data } = await supabase
        .from('pessoas')
        .select('id, nome, cpf_cnpj, municipio, uf, faz:pessoas_faturamento ( id, nome_fazenda, municipio, uf )')
        .eq('ativo', true)
        .or(`nome.ilike.*${t}*,nome_fantasia.ilike.*${t}*`)
        .order('nome')
        .limit(8);
      const l: Sugestao[] = [];
      for (const fz of fazendasGrupo.filter((f) => f.nome.toUpperCase().includes(t.toUpperCase())).slice(0, 4)) {
        l.push({ chave: `g${fz.id}`, titulo: fz.nome, detalhe: `Fazenda do grupo${fz.municipio ? ` · ${fz.municipio}/${fz.uf ?? ''}` : ''}`, pegar: () => parteDaFazenda(fz.id) });
      }
      for (const pe of (data ?? []) as any[]) {
        const fzs = (pe.faz ?? []) as any[];
        if (!fzs.length) l.push({ chave: pe.id, titulo: pe.nome, detalhe: [pe.cpf_cnpj ? mascaraCpfCnpj(pe.cpf_cnpj) : null, pe.municipio ? `${pe.municipio}/${pe.uf ?? ''}` : null, 'sem fazenda cadastrada'].filter(Boolean).join(' · '), pegar: async () => (await parteDaPessoa(pe.id)).parte });
        for (const f of fzs) l.push({ chave: `${pe.id}${f.id}`, titulo: pe.nome, detalhe: [f.nome_fazenda, f.municipio ? `${f.municipio}/${f.uf ?? ''}` : null].filter(Boolean).join(' · '), pegar: async () => (await parteDaPessoa(pe.id, f.id)).parte });
      }
      if (vivo) setSug(l);
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(tm);
    };
  }, [busca, fazendasGrupo]);

  return (
    <View style={estilos.caixa}>
      <Text style={estilos.caixaTitulo}>{titulo}</Text>
      <CampoCopiar
        rotulo="Nome (digite para buscar)"
        valor={parte.nome}
        aoMudar={(t) => {
          setBusca(t);
          aoMudar({ ...parte, nome: t });
        }}
      />
      {sug.length > 0 && (
        <View style={estilos.sugestoes}>
          {sug.map((x) => (
            <Pressable
              key={x.chave}
              style={({ pressed }) => [estilos.sugestao, pressed && { opacity: 0.7 }]}
              onPress={async () => {
                setSug([]);
                setBusca(null);
                aoMudar(await x.pegar());
              }}
            >
              <Text style={estilos.sugestaoTitulo}>{x.titulo}</Text>
              {x.detalhe ? <Text style={estilos.sugestaoDetalhe}>{x.detalhe}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
      <CampoCopiar rotulo="CPF/CNPJ" valor={parte.doc} aoMudar={m('doc')} teclado="number-pad" mascara={mascaraCpfCnpj} />
      <CampoCopiar rotulo="Estabelecimento (fazenda)" valor={parte.estabelecimento} aoMudar={m('estabelecimento')} />
      <CampoCopiar rotulo="Código do Estabelecimento (IDAF)" valor={parte.codigo} aoMudar={m('codigo')} teclado="number-pad" mascara={mascaraEstabelecimento} />
      <CampoCopiar rotulo="Município" valor={parte.municipio} aoMudar={m('municipio')} />
      <View style={{ width: 110 }}>
        <Campo rotulo="UF" value={parte.uf} onChangeText={(t) => aoMudar({ ...parte, uf: t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2) })} autoCapitalize="characters" maxLength={2} />
      </View>
    </View>
  );
}

const faltaParte = (p: Parte) => {
  const f: string[] = [];
  if (somenteDigitos(p.doc).length !== 11 && somenteDigitos(p.doc).length !== 14) f.push('CPF/CNPJ');
  if (!p.nome.trim()) f.push('nome');
  if (!p.estabelecimento.trim()) f.push('estabelecimento');
  if (somenteDigitos(p.codigo).length !== 11) f.push('Código do Estabelecimento (11 números)');
  if (!p.municipio.trim()) f.push('município');
  if (p.uf.trim().length !== 2) f.push('UF');
  return f;
};

/** V163: GTA. Preparar (ficha para emitir no Siapec) e guardar a e-GTA emitida | Consultar. */
export default function GtaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'GtaForm'>>();
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');

  const [id, setId] = useState<string | null>(null);
  const [direcao, setDirecao] = useState<string[]>(['saida']);
  // V192: de quem é o gado (o Estoque de gado separa o próprio, o de cada terceiro e o nosso em posse de terceiros)
  const [dono, setDono] = useState<string[]>(['proprio']);
  const [parceiroId, setParceiroId] = useState<string | null>(null);
  const [movId, setMovId] = useState<string | null>(params?.movimentacaoId ?? null);
  const [vendaId, setVendaId] = useState<string | null>(null);
  const [finalidade, setFinalidade] = useState<string[]>([]);
  const [transporte, setTransporte] = useState<string[]>(['Rodoviário']);
  const [origem, setOrigem] = useState<Parte>(PARTE_VAZIA);
  const [destino, setDestino] = useState<Parte>(PARTE_VAZIA);
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [qtdMov, setQtdMov] = useState<Quantidades | null>(null);
  const [numero, setNumero] = useState('');
  const [emissao, setEmissao] = useState('');
  const [validade, setValidade] = useState('');
  const [autenticidade, setAutenticidade] = useState('');
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [nfNumero, setNfNumero] = useState(''); // V178: nota fiscal opcional (há estado em que a operação interna vai só com a GTA)
  const [lendo, setLendo] = useState<string | null>(null);
  const [avisoLeitura, setAvisoLeitura] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(params?.aviso ?? null);
  const [salvando, setSalvando] = useState(false);

  const saida = direcao[0] === 'saida';
  const daFazenda = useCallback(async () => (fid ? parteDaFazenda(fid) : PARTE_VAZIA), [fid]);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: 'GTA' });
  }, [navegacao]);

  // a ponta da fazenda: procedência na saída, destino na entrada
  useEffect(() => {
    if (!fid || id) return;
    daFazenda()
      .then((p) => (saida ? setOrigem(p) : setDestino(p)))
      .catch(() => {});
  }, [fid, saida, id, daFazenda]);

  // puxar de um movimento já lançado: quantidades por faixa da GTA, a pessoa e a venda
  const puxarMovimento = useCallback(async (mid: string | null) => {
    setMovId(mid);
    setAvisoLeitura(null);
    if (!mid) {
      setQtdMov(null);
      return;
    }
    try {
      const d = await dadosDoMovimento(mid);
      setQtdMov(d.quantidades);
      setQtd(Object.fromEntries(LINHAS_GTA.map((l) => [l.chave, d.quantidades[l.chave] ? String(d.quantidades[l.chave]) : ''])));
      setVendaId(d.vendaId);
      const entrada = ENTRADA_TIPOS.includes(d.tipo);
      setDirecao([entrada ? 'entrada' : 'saida']);
      if (d.tipo === 'venda' && !finalidade.length) setFinalidade(['Abate']);
      if (d.tipo.startsWith('transferencia') && !finalidade.length) setFinalidade(['Transferência entre propriedades']);
      if (d.pessoaId) {
        const r = await parteDaPessoa(d.pessoaId, d.faturamentoId);
        if (entrada) setOrigem(r.parte);
        else setDestino(r.parte);
      }
      if (d.semIdade) setAvisoLeitura(`${d.semIdade} animal(is) do movimento sem idade ou sem sexo: confira as quantidades.`);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      let mid = params?.movimentacaoId ?? null;
      if (!mid && params?.vendaId) {
        const m = await supabase.from('movimentacoes').select('id').eq('venda_id', params.vendaId).limit(1).maybeSingle();
        mid = (m.data as any)?.id ?? null;
        setVendaId(params.vendaId);
      }
      if (mid) puxarMovimento(mid);
    })();
  }, [params?.movimentacaoId, params?.vendaId, puxarMovimento]);

  const carregarMovs = useCallback(async (): Promise<ItemLista[]> => {
    const d = await consulta<any[]>(
      supabase
        .from('movimentacoes')
        .select('id, data, tipo, pessoa:pessoas ( nome ), itens:movimentacao_itens ( count )')
        .eq('fazenda_id', fid!)
        .in('tipo', TIPOS_COM_GTA)
        .order('data', { ascending: false })
        .limit(80),
    );
    return d.map((m) => ({
      id: m.id,
      titulo: `${ROTULO_MOV[m.tipo] ?? m.tipo} · ${doBanco(m.data)}`,
      detalhe: [um(m.pessoa)?.nome, `${formatarNumero(um(m.itens)?.count ?? 0)} cab.`].filter(Boolean).join(' · '),
    }));
  }, [fid]);

  const fazGrupo: FazendaGrupo[] = useMemo(() => fazendas.filter((f) => f.tipo !== 'particular').map((f) => ({ id: f.id, nome: f.nome, municipio: f.municipio, uf: f.uf })), [fazendas]);

  const numeros: Quantidades = Object.fromEntries(LINHAS_GTA.map((l) => [l.chave, Number(qtd[l.chave] || 0)]));
  const machos = totalSexo(numeros, 'M');
  const femeas = totalSexo(numeros, 'F');
  const diferencas = qtdMov ? LINHAS_GTA.filter((l) => (qtdMov[l.chave] ?? 0) !== (numeros[l.chave] ?? 0)) : [];

  // ---------- ler a e-GTA emitida (foto ou PDF) ----------
  async function lerArquivo(modo: 'camera' | 'galeria' | 'pdf') {
    setErro(null);
    setAvisoLeitura(null);
    let b64: string;
    let formato: string;
    if (modo === 'pdf') {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      b64 = await arquivoEmBase64(a.uri);
      formato = /\.pdf$/i.test(a.name ?? '') || a.mimeType === 'application/pdf' ? 'application/pdf' : a.mimeType ?? 'image/jpeg';
    } else {
      const r = await escolherImagem(modo === 'camera', { quality: 0.8, ladoWeb: 2400 });
      if ('negado' in r) return setErro('Sem permissão para usar a câmera ou as fotos. Libere nas configurações do aparelho.');
      if (!r.foto) return;
      b64 = r.foto.base64;
      formato = r.foto.mimeType;
    }
    setLendo('A IA está lendo a GTA… (uns 20 segundos)');
    const res = await lerGta(b64, formato);
    setLendo(null);
    if ('erro' in res) return setErro(res.erro);
    const g = res.dados ?? {};
    if (g.legivel === false) return setErro('Não deu para ler a GTA. Tire a foto de novo, com o papel inteiro e bem iluminado, ou envie o PDF.');
    setArquivo(res.arquivo);
    if (g.numero) setNumero(String(g.numero).toUpperCase());
    if (g.emissao) setEmissao(doBanco(g.emissao));
    if (g.validade) setValidade(doBanco(g.validade));
    if (g.autenticidade) setAutenticidade(somenteDigitos(String(g.autenticidade)));
    if (g.finalidade) {
      const f = FINALIDADES_GTA.find((x) => x.toUpperCase() === String(g.finalidade).toUpperCase());
      setFinalidade([f ?? 'Outra']);
    }
    if (g.transporte) setTransporte([/RODOV/i.test(g.transporte) ? 'Rodoviário' : /P[ÉE]/i.test(g.transporte) ? 'A pé' : 'Outro']);
    const parte = (p: any): Parte => ({
      doc: mascaraCpfCnpj(p?.doc ?? ''),
      nome: p?.nome ?? '',
      estabelecimento: p?.estabelecimento ?? '',
      codigo: mascaraEstabelecimento(p?.codigo ?? ''),
      municipio: p?.municipio ?? '',
      uf: (p?.uf ?? '').toUpperCase(),
    });
    if (g.origem) setOrigem(parte(g.origem));
    if (g.destino) setDestino(parte(g.destino));
    if (g.quantidades) setQtd(Object.fromEntries(LINHAS_GTA.map((l) => [l.chave, Number(g.quantidades[l.chave]) ? String(Number(g.quantidades[l.chave])) : ''])));
    const avisos: string[] = [];
    // V181: a GTA traz as fêmeas de 0 a 12 numa linha só; aqui elas vão em 3 faixas
    if (g.quantidades && Number(g.quantidades.F0) > 0) avisos.push(`A GTA traz ${Number(g.quantidades.F0)} fêmea(s) de 0 a 12 meses: estão na linha 0 a 2; distribua entre 0 a 2, 3 a 8 e 9 a 12.`);
    if (Array.isArray(g.nao_lido) && g.nao_lido.length) avisos.push(`Não deu para ler: ${g.nao_lido.join(', ')}. Complete à mão.`);
    const soma = g.quantidades ? LINHAS_GTA.reduce((t, l) => t + (Number(g.quantidades[l.chave]) || 0), 0) : 0;
    if (g.total != null && Number(g.total) !== soma) avisos.push(`A soma das linhas (${soma}) não bate com o TOTAL da GTA (${g.total}). Confira as quantidades.`);
    if (g.situacao && /CANCEL/i.test(g.situacao)) avisos.push('Esta GTA está CANCELADA no Siapec.');
    setAvisoLeitura(avisos.length ? avisos.join(' ') : 'GTA lida. Confira os dados antes de gravar.');
  }

  function limpar() {
    setId(null);
    setDono(['proprio']);
    setParceiroId(null);
    setMovId(null);
    setVendaId(null);
    setFinalidade([]);
    setTransporte(['Rodoviário']);
    setOrigem(PARTE_VAZIA);
    setDestino(PARTE_VAZIA);
    setQtd({});
    setQtdMov(null);
    setNumero('');
    setEmissao('');
    setValidade('');
    setAutenticidade('');
    setArquivo(null);
    setObservacoes('');
    setNfNumero('');
    setAvisoLeitura(null);
    daFazenda()
      .then((p) => (saida ? setOrigem(p) : setDestino(p)))
      .catch(() => {});
  }

  async function gravar() {
    setErro(null);
    setOk(null);
    if (!fid) return;
    if (!finalidade.length) return setErro('Escolha a finalidade.');
    if (machos + femeas === 0) return setErro('Informe a quantidade de animais.');
    if (dono[0] !== 'proprio' && !parceiroId) return setErro('Informe o parceiro dono do gado.');
    const num = numero.trim().toUpperCase().replace(/\s+/g, ' ');
    if (num && !partesNumeroGta(num)) return setErro('Nº da e-GTA no formato do papel, ex.: ES 816265 D.');
    if (emissao && !dataValida(emissao)) return setErro('Data de emissão inválida.');
    if (validade && !dataValida(validade)) return setErro('Data de validade inválida.');
    const falta = [...faltaParte(origem).map((x) => `procedência: ${x}`), ...faltaParte(destino).map((x) => `destino: ${x}`)];
    if (num && falta.length) return setErro(`Falta na GTA ${falta.join('; ')}.`);
    setSalvando(true);
    const limpo = (p: Parte) => ({ ...p, doc: somenteDigitos(p.doc), codigo: somenteDigitos(p.codigo), nome: p.nome.trim(), estabelecimento: p.estabelecimento.trim(), municipio: p.municipio.trim() });
    const reg = {
      fazenda_id: fid,
      direcao: direcao[0],
      dono: dono[0],
      parceiro_id: dono[0] === 'proprio' ? null : parceiroId,
      numero: num || null,
      situacao: num ? 'emitida' : 'preparada',
      emissao: emissao ? paraBanco(emissao) : null,
      validade: validade ? paraBanco(validade) : null,
      finalidade: finalidade[0],
      transporte: transporte[0] ?? null,
      autenticidade: autenticidade || null,
      origem: limpo(origem),
      destino: limpo(destino),
      quantidades: numeros,
      total_machos: machos,
      total_femeas: femeas,
      movimentacao_id: movId,
      venda_id: vendaId,
      arquivo,
      observacoes: observacoes.trim() || null,
      // só vai quando preenchido: assim a GTA grava mesmo antes de rodar o banco da V178
      ...(nfNumero.trim() || id ? { nf_numero: nfNumero.trim() || null } : {}),
    };
    const { error } = id ? await supabase.from('gtas').update(reg).eq('id', id) : await supabase.from('gtas').insert(reg);
    setSalvando(false);
    if (error) {
      if (/gtas_numero_unico|duplicate/i.test(error.message ?? '')) return setErro(`A GTA ${num} já está gravada nesta fazenda.`);
      if (/relation .*gtas|gtas.*does not exist/i.test(error.message ?? '')) return setErro('Falta rodar o banco da V163 no Supabase.');
      return setErro(traduzirErro(error));
    }
    setOk(num ? `GTA ${num} gravada${vendaId ? ' e ligada à venda (vai para a NF-e)' : ''}.` : 'Ficha da GTA guardada. Quando emitir no Siapec, abra em Consultar e informe o número (ou leia o PDF).');
    limpar();
  }

  // ---------- consultar ----------
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<any[] | null>(null);
  const [vista, setVista] = useState<any | null>(null);
  useEffect(() => {
    if (aba !== 'consultar' || !fid) return;
    const t = setTimeout(async () => {
      let q = supabase.from('gtas').select('*').eq('fazenda_id', fid).order('created_at', { ascending: false }).limit(30);
      const b = busca.trim().replace(/[,()*%\\]/g, '');
      if (b) q = q.or(`numero.ilike.*${b}*,destino->>nome.ilike.*${b}*,origem->>nome.ilike.*${b}*,finalidade.ilike.*${b}*`);
      const { data, error } = await q;
      if (error) setErro(traduzirErro(error));
      setLista(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [aba, busca, fid]);

  function alterar(g: any) {
    const p = (x: any): Parte => ({ ...PARTE_VAZIA, ...x, doc: mascaraCpfCnpj(x?.doc ?? ''), codigo: mascaraEstabelecimento(x?.codigo ?? '') });
    setId(g.id);
    setDirecao([g.direcao]);
    setDono([g.dono ?? 'proprio']);
    setParceiroId(g.parceiro_id ?? null);
    setMovId(g.movimentacao_id);
    setVendaId(g.venda_id);
    setFinalidade(g.finalidade ? [g.finalidade] : []);
    setTransporte(g.transporte ? [g.transporte] : ['Rodoviário']);
    setOrigem(p(g.origem));
    setDestino(p(g.destino));
    setQtd(Object.fromEntries(LINHAS_GTA.map((l) => [l.chave, g.quantidades?.[l.chave] ? String(g.quantidades[l.chave]) : ''])));
    setQtdMov(null);
    setNumero(g.numero ?? '');
    setEmissao(g.emissao ? doBanco(g.emissao) : '');
    setValidade(g.validade ? doBanco(g.validade) : '');
    setAutenticidade(g.autenticidade ?? '');
    setArquivo(g.arquivo);
    setObservacoes(g.observacoes ?? '');
    setNfNumero(g.nf_numero ?? '');
    setVista(null);
    setAba('cadastrar');
  }

  const textoParte = (x: any) =>
    [x?.nome, x?.doc ? mascaraCpfCnpj(x.doc) : null, x?.estabelecimento, x?.codigo ? `Cód. ${mascaraEstabelecimento(x.codigo)}` : null, [x?.municipio, x?.uf].filter(Boolean).join('/')]
      .filter(Boolean)
      .join(' · ');

  return (
    <Tela>
      <AbasCadastro aba={aba} aoMudar={(a) => { setAba(a); setVista(null); }} rotuloCadastrar={id ? 'Alterar' : 'Preparar'} />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {ok && <Aviso tipo="sucesso" texto={ok} />}

      {aba === 'cadastrar' ? (
        <>
          <Aviso tipo="info" texto="A e-GTA é emitida no Siapec (IDAF), com o login do produtor. Aqui o app monta a ficha com os dados que o Siapec pede; depois de emitir, leia a foto ou o PDF da GTA para guardar o número." />

          <Escolha
            rotulo="GTA de"
            opcoes={[
              { valor: 'saida', rotulo: 'Saída (eu emito)' },
              { valor: 'entrada', rotulo: 'Entrada (recebida)' },
            ]}
            valor={direcao}
            aoMudar={(v) => {
              setDirecao(v);
              const a = origem;
              setOrigem(destino);
              setDestino(a);
            }}
          />
          <Escolha
            rotulo="De quem é o gado"
            opcoes={[
              { valor: 'proprio', rotulo: 'Nosso' },
              { valor: 'terceiro', rotulo: 'De terceiro (parceiro)' },
              { valor: 'remessa', rotulo: 'Nosso em posse de terceiro' },
            ]}
            valor={dono}
            aoMudar={(v) => {
              if (!v.length) return;
              setDono(v);
              if (v[0] === 'proprio') setParceiroId(null);
            }}
          />
          {dono[0] !== 'proprio' && <CampoPessoaBusca rotulo="Parceiro *" valorId={parceiroId} aoMudar={setParceiroId} tipoNovo="parceiro" />}
          <SeletorLista
            rotulo="Movimento do rebanho (opcional)"
            valorId={movId}
            aoMudar={puxarMovimento}
            carregar={carregarMovs}
            permitirLimpar
            vazio="Nenhuma compra, venda, parceria ou transferência lançada nesta fazenda."
            dicaBusca="Buscar pelo tipo, data ou pessoa"
          />
          {movId && <Text style={estilos.nota}>As quantidades vêm dos animais do movimento, pela idade na data dele.</Text>}

          <Escolha rotulo="Finalidade *" opcoes={FINALIDADES_GTA.map((f) => ({ valor: f, rotulo: f }))} valor={finalidade} aoMudar={setFinalidade} />
          <Escolha rotulo="Meio de transporte" opcoes={TRANSPORTES_GTA.map((f) => ({ valor: f, rotulo: f }))} valor={transporte} aoMudar={setTransporte} />

          <BlocoParte titulo="Procedência" parte={origem} aoMudar={setOrigem} fazendasGrupo={fazGrupo} />
          <BlocoParte titulo="Destino" parte={destino} aoMudar={setDestino} fazendasGrupo={fazGrupo} />

          <Secao titulo="Animais (faixas da GTA)" />
          <View style={estilos.grade}>
            <View style={estilos.gradeLinha}>
              <Text style={[estilos.gradeCab, { flex: 1.4 }]}>Bovinos</Text>
              <Text style={estilos.gradeCab}>Machos</Text>
              <Text style={estilos.gradeCab}>Fêmeas</Text>
            </View>
            {/* V181: fêmeas de 0 a 12 em três faixas (0-2, 3-8, 9-12), como o estoque do IDAF; no Siapec vão somadas */}
            {[
              { de: '0', rot: '0 a 12 m (machos) · 0 a 2 m (fêmeas)', m: true },
              { de: '3', rot: 'Fêmeas 3 a 8 meses', m: false },
              { de: '9', rot: 'Fêmeas 9 a 12 meses', m: false },
              { de: '13', rot: '13 a 24 meses', m: true },
              { de: '25', rot: '25 a 36 meses', m: true },
              { de: '37', rot: 'Acima de 36 meses', m: true },
            ].map(({ de, rot, m }) => (
              <View key={de} style={estilos.gradeLinha}>
                <Text style={[estilos.gradeRot, { flex: 1.4 }]}>{rot}</Text>
                {(['M', 'F'] as const).map((s) =>
                  s === 'M' && !m ? (
                    <View key={s} style={{ flex: 1 }} />
                  ) : (
                    <View key={s} style={{ flex: 1 }}>
                      <Campo
                        rotulo=""
                        value={qtd[`${s}${de}`] ?? ''}
                        onChangeText={(t) => setQtd((q) => ({ ...q, [`${s}${de}`]: t.replace(/\D/g, '').slice(0, 5) }))}
                        keyboardType="number-pad"
                        placeholder="0"
                      />
                    </View>
                  ),
                )}
              </View>
            ))}
            {femeas0a12(qtd) > 0 && (
              <Text style={estilos.nota}>No Siapec (papel da GTA), fêmeas de 0 a 12 meses: {formatarNumero(femeas0a12(qtd))}.</Text>
            )}
            <View style={estilos.gradeLinha}>
              <Text style={[estilos.gradeRot, { flex: 1.4, fontWeight: '700' }]}>Total {formatarNumero(machos + femeas)}</Text>
              <Text style={estilos.gradeTotal}>{formatarNumero(machos)}</Text>
              <Text style={estilos.gradeTotal}>{formatarNumero(femeas)}</Text>
            </View>
          </View>
          {diferencas.length > 0 && (
            <Aviso
              tipo="erro"
              texto={`Diferente do movimento lançado: ${diferencas
                .map((l) => `${l.rotulo.replace('Bovino, ', '')}: movimento ${qtdMov?.[l.chave] ?? 0}, GTA ${numeros[l.chave] ?? 0}`)
                .join('; ')}. Confira antes de transportar.`}
            />
          )}

          <Botao titulo="Abrir o Siapec (IDAF) para emitir" tipo="secundario" onPress={() => Linking.openURL(URL_SIAPEC)} />
          {Platform.OS !== 'web' && <Text style={estilos.nota}>Para copiar um dado, toque e segure no campo.</Text>}

          <Secao titulo="GTA emitida" />
          <Text style={estilos.nota}>Leia a foto ou o PDF da e-GTA: o app preenche o número, as datas, as partes e as quantidades.</Text>
          {lendo ? (
            <View style={estilos.linha}>
              <ActivityIndicator color={cores.primaria} />
              <Text style={estilos.nota}>{lendo}</Text>
            </View>
          ) : (
            <View style={estilos.linhaBotoes}>
              <Pressable style={estilos.botaoPeq} onPress={() => lerArquivo('camera')}>
                <Text style={estilos.botaoPeqTexto}>Foto</Text>
              </Pressable>
              <Pressable style={estilos.botaoPeq} onPress={() => lerArquivo('galeria')}>
                <Text style={estilos.botaoPeqTexto}>Galeria</Text>
              </Pressable>
              <Pressable style={estilos.botaoPeq} onPress={() => lerArquivo('pdf')}>
                <Text style={estilos.botaoPeqTexto}>PDF</Text>
              </Pressable>
            </View>
          )}
          {avisoLeitura && <Aviso tipo="info" texto={avisoLeitura} />}
          <Campo rotulo="Nº da e-GTA" value={numero} onChangeText={(t) => setNumero(t.toUpperCase().slice(0, 20))} autoCapitalize="characters" placeholder="ES 816265 D" />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Emissão" valor={emissao} aoMudar={setEmissao} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Validade" valor={validade} aoMudar={setValidade} />
            </View>
          </View>
          <Campo rotulo="Código de autenticidade" value={autenticidade} onChangeText={(t) => setAutenticidade(somenteDigitos(t).slice(0, 60))} keyboardType="number-pad" />
          <Campo rotulo="Nº da nota fiscal (opcional)" value={nfNumero} onChangeText={setNfNumero} ajuda="A GTA emitida movimenta o Estoque de gado (Pecuário › Estoque de gado), Total e Com GTA, com ou sem nota." />
          <Campo rotulo="Observações" value={observacoes} onChangeText={setObservacoes} multiline />

          <Botao titulo={numero.trim() ? 'Gravar a GTA' : 'Guardar a ficha (GTA ainda não emitida)'} onPress={gravar} carregando={salvando} />
          {id && <Botao titulo="Cancelar alteração" tipo="texto" onPress={limpar} />}
        </>
      ) : vista ? (
        <>
          <View style={estilos.caixa}>
            <Text style={estilos.caixaTitulo}>{vista.numero ?? 'GTA ainda não emitida (ficha)'}</Text>
            <Text style={estilos.nota}>
              {vista.direcao === 'saida' ? 'Saída' : 'Entrada'} · {vista.finalidade ?? '-'} · {vista.transporte ?? '-'}
              {vista.emissao ? ` · emitida em ${doBanco(vista.emissao)}` : ''}
              {vista.validade ? ` · válida até ${doBanco(vista.validade)}` : ''}
            </Text>
            <Text style={estilos.rotuloVista}>Procedência</Text>
            <Text style={estilos.textoVista}>{textoParte(vista.origem) || '-'}</Text>
            <Text style={estilos.rotuloVista}>Destino</Text>
            <Text style={estilos.textoVista}>{textoParte(vista.destino) || '-'}</Text>
            <Text style={estilos.rotuloVista}>Animais</Text>
            {LINHAS_GTA.filter((l) => vista.quantidades?.[l.chave]).map((l) => (
              <Text key={l.chave} style={estilos.textoVista}>
                {l.rotulo}: {formatarNumero(vista.quantidades[l.chave])}
              </Text>
            ))}
            {femeas0a12(vista.quantidades ?? {}) > 0 && (
              <Text style={estilos.nota}>No papel da GTA: fêmeas de 0 a 12 meses = {formatarNumero(femeas0a12(vista.quantidades ?? {}))}</Text>
            )}
            <Text style={[estilos.textoVista, { fontWeight: '700' }]}>
              Machos {formatarNumero(vista.total_machos)} · Fêmeas {formatarNumero(vista.total_femeas)} · Total {formatarNumero(vista.total_machos + vista.total_femeas)}
            </Text>
            {vista.autenticidade && <Text style={estilos.nota}>Autenticidade: {vista.autenticidade}</Text>}
            {vista.nf_numero ? <Text style={estilos.nota}>Nota fiscal nº {vista.nf_numero}</Text> : null}
            {vista.observacoes && <Text style={estilos.nota}>{vista.observacoes}</Text>}
          </View>
          <Botao titulo={vista.numero ? 'Alterar' : 'Informar a GTA emitida'} tipo="secundario" onPress={() => alterar(vista)} />
          <Botao titulo="Voltar à lista" tipo="texto" onPress={() => setVista(null)} />
        </>
      ) : (
        <>
          <Busca valor={busca} aoMudar={setBusca} dica="Nº da GTA, nome, finalidade" />
          {lista === null ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
          ) : lista.length === 0 ? (
            <Text style={estilos.nota}>Nenhuma GTA {busca ? `com "${busca}"` : 'gravada nesta fazenda'}.</Text>
          ) : (
            <Lista>
              {lista.map((g) => (
                <Linha
                  key={g.id}
                  titulo={g.numero ?? 'Ficha (não emitida)'}
                  linhas={[
                    `${g.direcao === 'saida' ? 'Saída' : 'Entrada'} · ${g.finalidade ?? ''}${g.emissao ? ` · ${doBanco(g.emissao)}` : ''}`,
                    g.direcao === 'saida' ? g.destino?.nome : g.origem?.nome,
                  ]}
                  direita={`${formatarNumero(g.total_machos + g.total_femeas)} cab.`}
                  onPress={() => setVista(g)}
                />
              ))}
            </Lista>
          )}
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave, lineHeight: 20 },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  linhaCopiar: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  copiar: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700', paddingBottom: 16, minWidth: 64 },
  caixa: { gap: 8, padding: 12, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao },
  caixaTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.primariaEscura },
  grade: { gap: 4, padding: 10, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao },
  gradeLinha: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  gradeCab: { flex: 1, fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave },
  gradeRot: { fontSize: tam.pequeno + 1, color: cores.texto },
  gradeTotal: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto, paddingLeft: 14 },
  sugestoes: { gap: 6 },
  sugestao: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundo },
  sugestaoTitulo: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  sugestaoDetalhe: { fontSize: tam.pequeno, color: cores.textoSuave },
  linhaBotoes: { flexDirection: 'row', gap: 10 },
  botaoPeq: { flex: 1, minHeight: tam.alturaToque, borderRadius: tam.raio, borderWidth: 1.5, borderColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  botaoPeqTexto: { fontSize: tam.texto, fontWeight: '700', color: cores.primaria },
  rotuloVista: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave, marginTop: 6 },
  textoVista: { fontSize: tam.pequeno + 1, color: cores.texto },
});
