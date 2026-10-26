import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Secao from '../../componentes/Secao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { TEXTO_SITUACAO, chamarNfe, chaveFormatada, type SituacaoNota } from '../../lib/nfe';
import { formatarMoeda, mascaraCpfCnpj } from '../../lib/formatos';
import { NO_NAVEGADOR, baixarArquivo, baixarBase64 } from '../../lib/web';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Nota = {
  id: string; venda_id: string | null; numero: number; serie: number; ambiente: number; chave: string | null; situacao: SituacaoNota;
  cstat: string | null; motivo: string | null; protocolo: string | null; autorizada_em: string | null; valor: number | null;
  dest_nome: string | null; dest_doc: string | null; cancelada_em: string | null; motivo_cancelamento: string | null; created_at: string;
};

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

/** V157: uma NF-e: situação, DANFE, XML, consulta na Sefaz e cancelamento. */
export default function NotaFiscalDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'NotaFiscalDetalhe'>>();
  const [n, setN] = useState<Nota | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(params.aviso ?? null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  useLayoutEffect(() => {
    navegacao.setOptions({ title: n ? `NF-e nº ${n.numero}` : 'Nota fiscal' });
  }, [navegacao, n]);

  const carregar = useCallback(async () => {
    try {
      setN(
        await consulta<Nota>(
          supabase
            .from('nfe_notas')
            .select('id, venda_id, numero, serie, ambiente, chave, situacao, cstat, motivo, protocolo, autorizada_em, valor, dest_nome, dest_doc, cancelada_em, motivo_cancelamento, created_at')
            .eq('id', params.id)
            .single(),
        ),
      );
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [params.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function danfe() {
    setErro(null);
    if (!NO_NAVEGADOR) return setAviso('Para baixar o DANFE, abra o Fazenda Digital pelo navegador (no PC ou no celular).');
    setOcupado('danfe');
    const r = await chamarNfe<{ nome: string; pdf: string }>({ acao: 'danfe', nota_id: params.id });
    setOcupado(null);
    if ('erro' in r && r.erro) return setErro(r.erro);
    const ok = r as { nome: string; pdf: string };
    if (!baixarBase64(ok.nome, ok.pdf)) setErro('O navegador não deixou baixar o arquivo.');
  }

  async function xml() {
    setErro(null);
    if (!NO_NAVEGADOR) return setAviso('Para baixar o XML, abra o Fazenda Digital pelo navegador (no PC ou no celular).');
    setOcupado('xml');
    const r = await chamarNfe<any>({ acao: 'xml', nota_id: params.id });
    setOcupado(null);
    if ('erro' in r && r.erro) return setErro(r.erro);
    const ok = r as any;
    baixarArquivo(ok.nome, ok.xml, 'application/xml');
    if (ok.xml_cancelamento) baixarArquivo(ok.nome_cancelamento, ok.xml_cancelamento, 'application/xml');
    setAviso('XML baixado. Envie para a contabilidade e para o comprador; guarde por 5 anos.');
  }

  async function consultarSefaz() {
    setErro(null);
    setAviso(null);
    setOcupado('consultar');
    const r = await chamarNfe<any>({ acao: 'consultar', nota_id: params.id });
    setOcupado(null);
    if ('erro' in r && r.erro) return setErro(r.erro);
    setAviso(`Sefaz: ${(r as any).motivo ?? (r as any).situacao}`);
    carregar();
  }

  async function cancelar() {
    setErro(null);
    setAviso(null);
    if (motivo.trim().length < 15) return setErro('Escreva o motivo com pelo menos 15 letras.');
    setOcupado('cancelar');
    const r = await chamarNfe<any>({ acao: 'cancelar', nota_id: params.id, justificativa: motivo });
    setOcupado(null);
    if ('erro' in r && r.erro) return setErro(r.erro);
    setCancelando(false);
    setMotivo('');
    setAviso('Nota cancelada na Sefaz. A venda continua lançada: se a venda também não valeu, exclua a venda.');
    carregar();
  }

  if (erro && !n) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!n) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const cor = n.situacao === 'autorizada' ? cores.sucesso : n.situacao === 'cancelada' || n.situacao === 'denegada' || n.situacao === 'rejeitada' ? cores.erro : cores.textoSuave;
  return (
    <Tela>
      <View style={estilos.cartao}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={estilos.rotulo}>NF-e nº / série</Text>
            <Text style={estilos.numero}>
              {n.numero} / {n.serie}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.rotulo}>Valor</Text>
            <Text style={estilos.numero}>{formatarMoeda(Number(n.valor ?? 0))}</Text>
          </View>
        </View>
        <Text style={[estilos.situacao, { color: cor }]}>
          {TEXTO_SITUACAO[n.situacao]}
          {n.ambiente === 2 ? ' · HOMOLOGAÇÃO (sem valor fiscal)' : ''}
        </Text>
      </View>

      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <Dado rotulo="Comprador" valor={`${n.dest_nome ?? ''}${n.dest_doc ? ` · ${mascaraCpfCnpj(n.dest_doc)}` : ''}`} />
      <Dado rotulo="Chave de acesso" valor={chaveFormatada(n.chave)} />
      {n.protocolo ? <Dado rotulo="Protocolo de autorização" valor={`${n.protocolo} · ${quando(n.autorizada_em)}`} /> : null}
      {n.situacao !== 'autorizada' && n.motivo ? <Dado rotulo="Resposta da Sefaz" valor={`${n.cstat ?? ''} ${n.motivo}`} /> : null}
      {n.situacao === 'cancelada' ? <Dado rotulo="Cancelada em" valor={`${quando(n.cancelada_em)} · ${n.motivo_cancelamento ?? ''}`} /> : null}

      {(n.situacao === 'autorizada' || n.situacao === 'cancelada') && (
        <>
          <Secao titulo="Documentos" />
          <Botao titulo="Baixar o DANFE (PDF)" onPress={danfe} carregando={ocupado === 'danfe'} desabilitado={!!ocupado && ocupado !== 'danfe'} />
          <Botao titulo="Baixar o XML" tipo="secundario" onPress={xml} carregando={ocupado === 'xml'} desabilitado={!!ocupado && ocupado !== 'xml'} />
        </>
      )}

      <Secao titulo="Sefaz" />
      <Botao titulo="Consultar a situação na Sefaz" tipo="secundario" onPress={consultarSefaz} carregando={ocupado === 'consultar'} desabilitado={!n.chave || (!!ocupado && ocupado !== 'consultar')} />
      {n.situacao !== 'autorizada' && n.situacao !== 'cancelada' && n.venda_id ? (
        <Botao titulo="Corrigir e emitir de novo" onPress={() => navegacao.replace('NotaFiscalEmitir', { vendaId: n.venda_id! })} />
      ) : null}

      {n.situacao === 'autorizada' && (
        <>
          {!cancelando ? (
            <Botao titulo="Cancelar esta nota" tipo="perigo" onPress={() => setCancelando(true)} />
          ) : (
            <View style={estilos.cancelar}>
              <Text style={estilos.nota}>O cancelamento é aceito em até 24 horas da autorização e se a mercadoria ainda não circulou. Depois disso, fale com a contabilidade.</Text>
              <Campo rotulo="Motivo do cancelamento (mínimo 15 letras)" value={motivo} onChangeText={setMotivo} multiline />
              <Botao titulo="Confirmar o cancelamento" tipo="perigo" onPress={cancelar} carregando={ocupado === 'cancelar'} />
              <Botao titulo="Desistir" tipo="texto" onPress={() => setCancelando(false)} />
            </View>
          )}
        </>
      )}

      {n.venda_id ? <Botao titulo="Ver a venda" tipo="texto" onPress={() => navegacao.push('VendaDetalhe', { id: n.venda_id! })} /> : null}
    </Tela>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor} selectable>
        {valor || '–'}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, padding: 14, gap: 8 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  numero: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.texto },
  situacao: { fontSize: tam.texto, fontWeight: '800' },
  valor: { fontSize: tam.texto, color: cores.texto },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  cancelar: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.erro, padding: 12, gap: 8 },
});
