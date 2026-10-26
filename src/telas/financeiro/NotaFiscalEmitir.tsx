import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase } from '../../lib/supabase';
import { CSOSN, CST_ICMS, FRETE, PAGAMENTO, chamarNfe } from '../../lib/nfe';
import { formatarMoeda, formatarQtd, lerNumero, mascaraCep, mascaraCpfCnpj, numeroParaCampo, somenteDigitos } from '../../lib/formatos';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** O que a tela edita (números como texto, no formato brasileiro). */
type ItemTela = {
  codigo: string; descricao: string; ncm: string; cfop: string; unidade: string; quantidade: number; valor_total: number;
  unidade_trib: string; quantidade_trib: number; cst_icms: string; aliquota: string; reducao: string; cst_pis: string; cst_cofins: string; info: string;
};

/**
 * V157: conferência e emissão da NF-e de uma venda.
 * O sistema já traz tudo da venda, do cadastro do comprador e da tributação padrão; aqui se confere,
 * completa o que faltar (GTA, transporte, IE...) e envia para a Sefaz.
 */
export default function NotaFiscalEmitir() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'NotaFiscalEmitir'>>();
  const { fazendaAtiva } = useSessao();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoErro, setUltimoErro] = useState<string | null>(null);
  const [ambiente, setAmbiente] = useState<number>(2);
  const [crt, setCrt] = useState<number>(3);
  const [enviando, setEnviando] = useState(false);

  // dados da nota
  const [natureza, setNatureza] = useState('');
  const [dest, setDest] = useState({ doc: '', nome: '', ie: '', email: '', telefone: '', logradouro: '', numero: '', complemento: '', bairro: '', cep: '', municipio: '', uf: '' });
  const [itens, setItens] = useState<ItemTela[]>([]);
  const [gta, setGta] = useState<{ numero: string; serie: string; uf: string } | null>(null);
  const [frete, setFrete] = useState('9');
  const [transp, setTransp] = useState({ nome: '', doc: '', uf: '', placa: '', uf_placa: '' });
  const [vol, setVol] = useState({ quantidade: '', especie: '', peso_bruto: '', peso_liquido: '' });
  const [indPag, setIndPag] = useState('0');
  const [tPag, setTPag] = useState('99');
  const [info, setInfo] = useState('');

  useEffect(() => {
    (async () => {
      const r = await chamarNfe<any>({ acao: 'previa', venda_id: params.vendaId });
      setCarregando(false);
      if ('erro' in r && r.erro) return setErro(r.erro);
      const res = r as any;
      const autorizada = (res.notas ?? []).find((n: any) => n.situacao === 'autorizada' && n.ambiente === res.ambiente);
      if (autorizada) {
        navegacao.replace('NotaFiscalDetalhe', { id: autorizada.id });
        return;
      }
      const n = res.nota;
      setAmbiente(res.ambiente);
      setUltimoErro(res.ultimo_erro ?? null);
      setNatureza(n.natureza ?? '');
      setDest({ ...n.dest, doc: mascaraCpfCnpj(n.dest.doc ?? ''), cep: mascaraCep(n.dest.cep ?? '') });
      setCrt(res.crt === 1 ? 1 : 3);
      setItens(
        (n.itens ?? []).map((it: any) => ({
          ...it,
          info: it.info ?? '',
          aliquota: numeroParaCampo(it.aliquota_icms),
          reducao: numeroParaCampo(it.reducao_bc),
        })),
      );
      // V159: a GTA e a fazenda do cliente vêm da venda
      const { data: vg } = await supabase
        .from('vendas')
        .select('gta_numero, gta_serie, gta_uf, faturamento:pessoas_faturamento ( nome_fazenda, inscricao_sanitaria )')
        .eq('id', params.vendaId)
        .maybeSingle();
      const vv = vg as any;
      setGta(
        n.gta
          ? { numero: vv?.gta_numero ?? n.gta.numero ?? '', serie: vv?.gta_serie ?? n.gta.serie ?? '', uf: vv?.gta_uf ?? n.gta.uf ?? '' }
          : vv?.gta_numero
            ? { numero: vv.gta_numero, serie: vv.gta_serie ?? '', uf: vv.gta_uf ?? '' }
            : null,
      );
      const fc = Array.isArray(vv?.faturamento) ? vv.faturamento[0] : vv?.faturamento;
      const sanit = fc?.inscricao_sanitaria?.trim()
        ? `Destino: ${fc.nome_fazenda?.trim() ? `${fc.nome_fazenda.trim()}, ` : ''}inscrição no órgão de defesa sanitária nº ${fc.inscricao_sanitaria.trim()}.`
        : '';
      setFrete(n.transporte?.modalidade ?? '9');
      const tp = n.transporte?.transportadora ?? {};
      setTransp({ nome: tp.nome ?? '', doc: tp.doc ? mascaraCpfCnpj(tp.doc) : '', uf: tp.uf ?? '', placa: n.transporte?.placa ?? '', uf_placa: n.transporte?.uf_placa ?? '' });
      const v = n.transporte?.volumes ?? {};
      setVol({ quantidade: numeroParaCampo(v.quantidade), especie: v.especie ?? '', peso_bruto: numeroParaCampo(v.peso_bruto), peso_liquido: numeroParaCampo(v.peso_liquido) });
      setIndPag(String(n.pagamento?.indicador ?? 0));
      setTPag(n.pagamento?.tipo ?? '99');
      setInfo([n.info_complementar ?? '', sanit].filter((x) => x.trim()).join(' '));
    })();
  }, [params.vendaId, navegacao]);

  const mudarItem = (i: number, m: Partial<ItemTela>) => setItens((l) => l.map((x, k) => (k === i ? { ...x, ...m } : x)));
  const total = itens.reduce((t, it) => t + Number(it.valor_total), 0);

  async function emitir() {
    setErro(null);
    const nota = {
      natureza: natureza.trim(),
      dest: { ...dest, doc: somenteDigitos(dest.doc), cep: somenteDigitos(dest.cep), uf: dest.uf.toUpperCase() },
      itens: itens.map((it) => ({
        codigo: it.codigo, descricao: it.descricao.trim(), ncm: somenteDigitos(it.ncm), cfop: somenteDigitos(it.cfop), unidade: it.unidade,
        quantidade: Number(it.quantidade), valor_total: Number(it.valor_total), unidade_trib: it.unidade_trib, quantidade_trib: Number(it.quantidade_trib),
        cst_icms: it.cst_icms, aliquota_icms: lerNumero(it.aliquota) ?? 0, reducao_bc: lerNumero(it.reducao) ?? 0,
        cst_pis: it.cst_pis, cst_cofins: it.cst_cofins, info: it.info.trim() || null,
      })),
      transporte: {
        modalidade: frete,
        transportadora: frete !== '9' && (transp.nome.trim() || somenteDigitos(transp.doc)) ? { nome: transp.nome.trim(), doc: somenteDigitos(transp.doc), uf: transp.uf.toUpperCase() } : null,
        placa: frete !== '9' ? transp.placa : '',
        uf_placa: frete !== '9' ? transp.uf_placa.toUpperCase() : '',
        volumes: {
          quantidade: lerNumero(vol.quantidade),
          especie: vol.especie.trim() || null,
          peso_bruto: lerNumero(vol.peso_bruto),
          peso_liquido: lerNumero(vol.peso_liquido),
        },
      },
      pagamento: { indicador: Number(indPag) as 0 | 1, tipo: tPag, descricao: null },
      gta,
      info_complementar: info.trim(),
    };
    setEnviando(true);
    const r = await chamarNfe<any>({ acao: 'emitir', venda_id: params.vendaId, nota });
    setEnviando(false);
    if ('erro' in r && r.erro) return setErro(r.erro);
    const res = r as any;
    if (res.situacao === 'autorizada') {
      navegacao.replace('NotaFiscalDetalhe', { id: res.id, aviso: `NF-e nº ${res.numero} autorizada pela Sefaz.` });
      return;
    }
    setUltimoErro(`${res.cStat ?? ''} ${res.motivo ?? ''}`.trim());
    setErro(`A Sefaz ${res.situacao === 'denegada' ? 'denegou' : 'rejeitou'} a nota: ${res.motivo ?? ''}${res.situacao === 'rejeitada' ? ' Corrija e toque em Emitir de novo (o número da nota se mantém).' : ''}`);
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }
  if (!itens.length && erro) {
    return (
      <Tela>
        <Aviso tipo="erro" texto={erro} />
        <Botao titulo="Voltar" tipo="secundario" onPress={() => navegacao.goBack()} />
      </Tela>
    );
  }

  const cst = crt === 1 ? CSOSN : CST_ICMS;
  return (
    <Tela>
      <Aviso
        tipo={ambiente === 1 ? 'info' : 'sucesso'}
        texto={ambiente === 1 ? 'PRODUÇÃO: a nota vale de verdade.' : 'HOMOLOGAÇÃO (teste): a nota não tem valor fiscal. Para valer, passe para produção em Mais › Nota fiscal (NF-e).'}
      />
      {fazendaAtiva ? <Text style={estilos.nota}>Emitente: {fazendaAtiva.nome} (dados fiscais do cadastro da fazenda).</Text> : null}
      {ultimoErro ? <Aviso tipo="erro" texto={`Última resposta da Sefaz: ${ultimoErro}`} /> : null}

      <Campo rotulo="Natureza da operação" value={natureza} onChangeText={setNatureza} />

      <Secao titulo="Comprador (destinatário)" />
      <Campo rotulo="CPF ou CNPJ" value={dest.doc} onChangeText={(t) => setDest({ ...dest, doc: mascaraCpfCnpj(t) })} keyboardType="number-pad" />
      <Campo rotulo="Nome / razão social" value={dest.nome} onChangeText={(t) => setDest({ ...dest, nome: t })} />
      <Campo rotulo="Inscrição Estadual" value={dest.ie} onChangeText={(t) => setDest({ ...dest, ie: t })} ajuda='Em branco se não tiver; "ISENTO" se for isento.' />
      <Campo rotulo="Endereço" value={dest.logradouro} onChangeText={(t) => setDest({ ...dest, logradouro: t })} />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Número" value={dest.numero} onChangeText={(t) => setDest({ ...dest, numero: t })} />
        </View>
        <View style={{ flex: 2 }}>
          <Campo rotulo="Bairro" value={dest.bairro} onChangeText={(t) => setDest({ ...dest, bairro: t })} />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 2 }}>
          <Campo rotulo="Município" value={dest.municipio} onChangeText={(t) => setDest({ ...dest, municipio: t })} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="UF" value={dest.uf} onChangeText={(t) => setDest({ ...dest, uf: t.toUpperCase().slice(0, 2) })} autoCapitalize="characters" />
        </View>
      </View>
      <Campo rotulo="CEP" value={dest.cep} onChangeText={(t) => setDest({ ...dest, cep: mascaraCep(t) })} keyboardType="number-pad" />

      <Secao titulo="Produtos" />
      {itens.map((it, i) => (
        <View key={i} style={estilos.item}>
          <Text style={estilos.itemTitulo}>
            {formatarQtd(it.quantidade, 4)} {it.unidade} · {formatarMoeda(it.valor_total)}
          </Text>
          <Campo rotulo="Descrição" value={it.descricao} onChangeText={(t) => mudarItem(i, { descricao: t })} />
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="NCM" value={it.ncm} onChangeText={(t) => mudarItem(i, { ncm: somenteDigitos(t).slice(0, 8) })} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="CFOP" value={it.cfop} onChangeText={(t) => mudarItem(i, { cfop: somenteDigitos(t).slice(0, 4) })} keyboardType="number-pad" />
            </View>
          </View>
          <Escolha rotulo={crt === 1 ? 'CSOSN' : 'CST do ICMS'} opcoes={cst} valor={[it.cst_icms]} aoMudar={(v) => mudarItem(i, { cst_icms: v[0] ?? it.cst_icms })} />
          {['00', '20'].includes(it.cst_icms) && (
            <View style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Alíquota do ICMS (%)" value={it.aliquota} onChangeText={(t) => mudarItem(i, { aliquota: t })} keyboardType="decimal-pad" />
              </View>
              {it.cst_icms === '20' && (
                <View style={{ flex: 1 }}>
                  <Campo rotulo="Redução da base (%)" value={it.reducao} onChangeText={(t) => mudarItem(i, { reducao: t })} keyboardType="decimal-pad" />
                </View>
              )}
            </View>
          )}
          <Campo rotulo="Informação do item (opcional)" value={it.info} onChangeText={(t) => mudarItem(i, { info: t })} />
        </View>
      ))}
      <Text style={estilos.total}>Total da nota: {formatarMoeda(total)}</Text>

      {gta && (
        <>
          <Secao titulo="GTA (Guia de Trânsito Animal)" />
          <View style={estilos.linha}>
            <View style={{ flex: 2 }}>
              <Campo rotulo="Número da GTA" value={gta.numero} onChangeText={(t) => setGta({ ...gta, numero: t })} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Série" value={gta.serie} onChangeText={(t) => setGta({ ...gta, serie: t })} autoCapitalize="characters" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="UF" value={gta.uf} onChangeText={(t) => setGta({ ...gta, uf: t.toUpperCase().slice(0, 2) })} autoCapitalize="characters" />
            </View>
          </View>
          <Text style={estilos.nota}>A GTA vai nas informações complementares da nota. Em produção, a nota de gado não sai sem ela.</Text>
        </>
      )}

      <Secao titulo="Transporte" />
      <Escolha rotulo="Frete" opcoes={FRETE} valor={[frete]} aoMudar={(v) => setFrete(v[0] ?? '9')} />
      {frete !== '9' && (
        <>
          <Campo rotulo="Transportador (nome)" value={transp.nome} onChangeText={(t) => setTransp({ ...transp, nome: t })} />
          <View style={estilos.linha}>
            <View style={{ flex: 2 }}>
              <Campo rotulo="CPF/CNPJ do transportador" value={transp.doc} onChangeText={(t) => setTransp({ ...transp, doc: mascaraCpfCnpj(t) })} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="UF" value={transp.uf} onChangeText={(t) => setTransp({ ...transp, uf: t.toUpperCase().slice(0, 2) })} autoCapitalize="characters" />
            </View>
          </View>
          <View style={estilos.linha}>
            <View style={{ flex: 2 }}>
              <Campo rotulo="Placa do veículo" value={transp.placa} onChangeText={(t) => setTransp({ ...transp, placa: t.toUpperCase() })} autoCapitalize="characters" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="UF da placa" value={transp.uf_placa} onChangeText={(t) => setTransp({ ...transp, uf_placa: t.toUpperCase().slice(0, 2) })} autoCapitalize="characters" />
            </View>
          </View>
        </>
      )}
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Volumes" value={vol.quantidade} onChangeText={(t) => setVol({ ...vol, quantidade: t })} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 2 }}>
          <Campo rotulo="Espécie" value={vol.especie} onChangeText={(t) => setVol({ ...vol, especie: t })} />
        </View>
      </View>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Peso bruto (kg)" value={vol.peso_bruto} onChangeText={(t) => setVol({ ...vol, peso_bruto: t })} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Peso líquido (kg)" value={vol.peso_liquido} onChangeText={(t) => setVol({ ...vol, peso_liquido: t })} keyboardType="decimal-pad" />
        </View>
      </View>

      <Secao titulo="Pagamento" />
      <Escolha
        opcoes={[
          { valor: '0', rotulo: 'À vista' },
          { valor: '1', rotulo: 'A prazo' },
        ]}
        valor={[indPag]}
        aoMudar={(v) => setIndPag(v[0] ?? '0')}
      />
      <Escolha rotulo="Forma" opcoes={PAGAMENTO} valor={[tPag]} aoMudar={(v) => setTPag(v[0] ?? '99')} />

      <Secao titulo="Informações complementares" />
      <Campo rotulo="Vão impressas no DANFE" value={info} onChangeText={setInfo} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />

      {erro && <Aviso tipo="erro" texto={erro} />}
      <Botao titulo={ambiente === 1 ? 'Emitir NF-e' : 'Emitir NF-e de teste'} onPress={emitir} carregando={enviando} />
      <Text style={estilos.nota}>Antes de enviar, o sistema confere os dados; a Sefaz responde em alguns segundos. Se ela rejeitar, a tela volta com o motivo e o mesmo número de nota.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  linha: { flexDirection: 'row', gap: 10 },
  item: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, padding: 12, gap: 8 },
  itemTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  total: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura, textAlign: 'right' },
});
