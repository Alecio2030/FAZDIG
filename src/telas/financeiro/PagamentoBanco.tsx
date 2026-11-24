import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import SeletorLista, { type ItemLista } from '../../componentes/SeletorLista';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco, hojeBanco } from '../../lib/datas';
import { formatarMoeda, moedaParaCampo } from '../../lib/formatos';
import { codigoBarras } from '../../lib/notaFiscal';
import { encargosAtraso, r2, saldoTitulo, textoPrazo, um } from '../../lib/titulos';
import { abrirBanco, bancoDaConta, copiarTexto, plataforma } from '../../lib/bancosApp';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const digitos = (t: string) => t.replace(/\D/g, '');
/** Pix copia e cola começa com 000201 (padrão EMV do Banco Central). */
const ePixCopiaCola = (t: string) => /^000201/.test(t.trim());

/** Linha digitável com os espaços e pontos de sempre, para conferir de olho. */
function formatarLinha(t: string): string {
  const d = digitos(t);
  if (d.length === 47) return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  if (d.length === 48) return `${d.slice(0, 12)} ${d.slice(12, 24)} ${d.slice(24, 36)} ${d.slice(36)}`;
  return t.trim();
}

/**
 * V183 – Pagar pelo banco.
 * Escolhe a forma (Pix ou boleto) e a conta; o sistema copia o código e abre o aplicativo do banco (no computador, o site).
 * No banco, a pessoa só cola, confere e confirma. Ao voltar, "Já paguei" leva à baixa, que lê o comprovante pela foto.
 */
export default function PagamentoBanco() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'PagamentoBanco'>>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [t, setT] = useState<any>(null);
  const [forma, setForma] = useState<string[]>([]);
  const [codigo, setCodigo] = useState('');
  const [contas, setContas] = useState<any[]>([]);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const [pj, setPj] = useState<string[]>(['pf']);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: t ? `Pagar título nº ${t.numero}` : 'Pagar pelo banco' });
  }, [navegacao, t]);

  const carregar = useCallback(async () => {
    try {
      const [tit, cs] = await Promise.all([
        consulta<any>(supabase.from('lancamentos').select('*, pessoa:pessoas ( id, nome, pix )').eq('id', params.id).single()),
        consulta<any[]>(supabase.from('contas_bancarias').select('id, nome, banco, agencia, conta, tipo').eq('ativa', true).order('nome')),
      ]);
      setT(tit);
      setContas(cs);
      setBancoId((b) => b ?? tit.conta_bancaria_id ?? null);
      // forma e código: o que o título já tem; senão a chave Pix do fornecedor
      setForma((f) => {
        if (f.length) return f;
        if (tit.pix_copia_cola) return ['pix'];
        if (tit.linha_digitavel || tit.codigo_barras) return ['boleto'];
        if (um(tit.pessoa)?.pix) return ['pix'];
        return [];
      });
      setCodigo((c) => c || (tit.pix_copia_cola ?? (tit.linha_digitavel ? formatarLinha(tit.linha_digitavel) : tit.codigo_barras ?? '') ?? ''));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [params.id]);
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const carregarContas = useCallback(async (): Promise<ItemLista[]> => {
    const s = fid ? await supabase.rpc('saldo_contas', { p_fazenda: fid }) : { data: [] as any[] };
    const saldos = ((s as any).data as any[]) ?? [];
    return contas
      .filter((c) => c.tipo !== 'caixa')
      .map((c) => {
        const sd = saldos.find((x) => x.id === c.id);
        return { id: c.id, titulo: c.nome, detalhe: [c.banco, c.agencia ? `ag. ${c.agencia}` : null, c.conta ? `c/c ${c.conta}` : null, sd ? `saldo ${formatarMoeda(Number(sd.saldo))}` : null].filter(Boolean).join(' · ') };
      });
  }, [contas, fid]);

  if (erro && !t) return <Tela><Aviso tipo="erro" texto={erro} /></Tela>;
  if (!t) return <Tela rolar={false}><ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} /></Tela>;

  const fornecedor = um(t.pessoa);
  const saldo = saldoTitulo(t);
  const enc = encargosAtraso(saldo, t.data_vencimento, hojeBanco(), t.multa_perc, t.juros_mes_perc);
  const aPagar = r2(saldo + enc.multa + enc.juros);
  const conta = contas.find((c) => c.id === bancoId) ?? null;
  const banco = bancoDaConta(conta);
  const plat = plataforma();
  const pago = t.situacao === 'pago' || t.situacao === 'cancelado';

  const cod = codigo.trim();
  const copiaCola = forma[0] === 'pix' && ePixCopiaCola(cod);
  const chavePix = forma[0] === 'pix' && !!cod && !copiaCola;
  const barras = forma[0] === 'boleto' ? codigoBarras(cod) : null;

  function validar(): string | null {
    if (!forma[0]) return 'Escolha a forma: Pix ou boleto.';
    if (!cod) return forma[0] === 'pix' ? 'Informe a chave Pix do fornecedor ou cole o Pix copia e cola.' : 'Cole ou digite a linha digitável (ou o código de barras) do boleto.';
    if (forma[0] === 'boleto' && !barras) return 'A linha digitável do boleto não confere: são 47 números (boleto) ou 48 (conta de consumo). Confira.';
    if (!bancoId) return 'Escolha a conta de onde sai o dinheiro.';
    return null;
  }

  /** Guarda o código no título (e a chave Pix no fornecedor, se ele não tinha) e a conta escolhida como prevista. */
  async function guardar() {
    const upd: Record<string, unknown> = { conta_bancaria_id: bancoId };
    if (forma[0] === 'pix' && copiaCola) upd.pix_copia_cola = cod;
    if (forma[0] === 'boleto' && barras) {
      upd.codigo_barras = barras;
      upd.linha_digitavel = digitos(cod).length >= 47 ? digitos(cod) : t.linha_digitavel ?? null;
    }
    await supabase.from('lancamentos').update(upd).eq('id', t.id); // sem acesso completo, só não guarda
    if (chavePix && fornecedor?.id && !fornecedor.pix) await supabase.from('pessoas').update({ pix: cod }).eq('id', fornecedor.id);
  }

  async function copiarEAbrir() {
    setErro(null);
    setAviso(null);
    const e = validar();
    if (e) return setErro(e);
    setTrabalhando(true);
    await guardar();
    const texto = forma[0] === 'boleto' ? digitos(cod) : cod;
    const copiou = await copiarTexto(texto);
    const abriu = await abrirBanco(banco, { pj: pj[0] === 'pj', nomeLivre: conta?.banco });
    setTrabalhando(false);
    setAberto(true);
    const oQue = forma[0] === 'boleto' ? 'A linha digitável' : copiaCola ? 'O Pix copia e cola' : 'A chave Pix';
    const partes = [copiou ? `${oQue} foi copiada.` : `Não deu para copiar sozinho: copie ${oQue.toLowerCase()} abaixo, segurando o dedo no texto.`];
    if (abriu === 'app') partes.push(plat === 'ios' ? `Toque em "Abrir" na página do app ${banco?.nome}.` : `Abrindo o app ${banco?.nome}.`);
    else if (abriu === 'site') partes.push(`Abrimos o site do ${banco?.nome}: entre no internet banking.`);
    else if (abriu === 'loja') partes.push('Não achamos o app deste banco: escolha-o na loja de aplicativos ou abra o app pelo celular.');
    else partes.push('Abra o app do seu banco.');
    partes.push(
      forma[0] === 'boleto'
        ? 'No banco: Pagar boleto › colar o código › conferir o valor › confirmar.'
        : copiaCola
          ? 'No banco: Pix › Pix copia e cola › colar › conferir › confirmar.'
          : `No banco: Pix › colar a chave › valor ${formatarMoeda(aPagar)} › conferir o nome (${fornecedor?.nome ?? 'fornecedor'}) › confirmar.`,
    );
    partes.push('Depois volte aqui e toque em "Já paguei".');
    setAviso(partes.join(' '));
  }

  async function copiarValor() {
    const ok = await copiarTexto(moedaParaCampo(aPagar));
    setAviso(ok ? `Valor ${formatarMoeda(aPagar)} copiado.` : `Valor: ${formatarMoeda(aPagar)}`);
  }

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && <Aviso tipo="info" texto={aviso} />}

      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Nº {t.numero} · {t.descricao ?? 'Título'}</Text>
        {fornecedor?.nome && <Text style={estilos.linhaInfo}>{fornecedor.nome}</Text>}
        <Text style={estilos.linhaInfo}>
          Vencimento {doBanco(t.data_vencimento)} · {textoPrazo(t)}
        </Text>
        <View style={estilos.valorLinha}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.rotulo}>{enc.dias > 0 && (enc.multa || enc.juros) ? 'A pagar (com multa e juros do título)' : 'A pagar'}</Text>
            <Text style={estilos.valor}>{formatarMoeda(aPagar)}</Text>
            {enc.dias > 0 && (enc.multa > 0 || enc.juros > 0) && (
              <Text style={estilos.nota}>
                Saldo {formatarMoeda(saldo)} + multa {formatarMoeda(enc.multa)} + juros {formatarMoeda(enc.juros)} ({enc.dias} dias). O boleto pode calcular diferente: vale o que o banco mostrar.
              </Text>
            )}
          </View>
          <Botao titulo="Copiar valor" tipo="secundario" onPress={copiarValor} />
        </View>
      </View>

      {pago ? (
        <Aviso tipo="sucesso" texto="Este título já está quitado." />
      ) : (
        <>
          <Secao titulo="1. Forma e conta" />
          <Escolha
            rotulo="Forma de pagamento"
            opcoes={[
              { valor: 'pix', rotulo: 'Pix' },
              { valor: 'boleto', rotulo: 'Boleto (normal)' },
            ]}
            valor={forma}
            aoMudar={(v) => {
              if (!v.length) return;
              setForma(v);
              setCodigo(v[0] === 'pix' ? t.pix_copia_cola ?? fornecedor?.pix ?? '' : t.linha_digitavel ? formatarLinha(t.linha_digitavel) : t.codigo_barras ?? '');
              setAberto(false);
            }}
          />
          {forma[0] === 'pix' && (
            <Campo
              rotulo="Chave Pix do fornecedor ou Pix copia e cola"
              value={codigo}
              onChangeText={(x) => setCodigo(x)}
              autoCapitalize="none"
              autoCorrect={false}
              multiline={codigo.length > 60}
              ajuda={
                copiaCola
                  ? 'Pix copia e cola: o valor e o recebedor já vêm no código.'
                  : cod
                    ? fornecedor?.pix && cod === fornecedor.pix
                      ? 'Chave Pix do cadastro do fornecedor.'
                      : 'Chave Pix (CPF/CNPJ, celular, e-mail ou aleatória). Se o fornecedor não tiver, fica gravada no cadastro dele.'
                    : 'Cole o Pix copia e cola da cobrança ou digite a chave Pix.'
              }
            />
          )}
          {forma[0] === 'boleto' && (
            <Campo
              rotulo="Linha digitável ou código de barras"
              value={codigo}
              onChangeText={(x) => setCodigo(x)}
              keyboardType="number-pad"
              autoCorrect={false}
              multiline
              ajuda={cod ? (barras ? 'Código conferido.' : 'Faltam números ou há erro de digitação: confira.') : 'Cole a linha digitável do boleto (ou digite os números).'}
            />
          )}

          <SeletorLista rotulo="Conta de onde sai o dinheiro *" valorId={bancoId} aoMudar={(id) => { setBancoId(id); setAberto(false); }} carregar={carregarContas} vazio="Nenhuma conta bancária. Cadastre em Financeiro › Bancos e caixa." />
          {conta && !banco && <Text style={estilos.nota}>Não reconhecemos o banco desta conta ("{conta.banco || conta.nome}"): o código é copiado e você abre o app do banco.</Text>}
          {banco && (banco.androidPJ || banco.chave === 'bradesco' || banco.chave === 'santander') && plat === 'android' && (
            <Escolha
              rotulo={`App do ${banco.nome}`}
              opcoes={[
                { valor: 'pf', rotulo: 'Conta pessoa física' },
                { valor: 'pj', rotulo: 'Conta empresa' },
              ]}
              valor={pj}
              aoMudar={(v) => v.length && setPj(v)}
            />
          )}

          <Secao titulo="2. Pagar no banco" />
          <Botao
            titulo={banco ? (plat === 'pc' ? `Copiar e abrir o site do ${banco.nome}` : `Copiar e abrir o app ${banco.nome}`) : 'Copiar o código'}
            onPress={copiarEAbrir}
            carregando={trabalhando}
          />
          {aberto && cod && (
            <View style={estilos.codigo}>
              <Text style={estilos.rotulo}>{forma[0] === 'boleto' ? 'Linha digitável' : copiaCola ? 'Pix copia e cola' : 'Chave Pix'}</Text>
              <Text style={estilos.codigoTexto} selectable>
                {forma[0] === 'boleto' ? formatarLinha(cod) : cod}
              </Text>
            </View>
          )}
          <Text style={estilos.nota}>
            O sistema não entra no seu banco: ele copia o código e abre o app. Lá você cola, confere o valor e o recebedor e confirma com a sua senha ou digital. É a mesma segurança de sempre.
          </Text>

          <Secao titulo="3. Dar a baixa" />
          <Botao titulo="Já paguei: lançar a baixa com o comprovante" tipo={aberto ? 'primario' : 'secundario'} onPress={() => navegacao.navigate('TituloBaixa', { id: t.id })} />
          <Text style={estilos.nota}>Na baixa, tire a foto ou o print do comprovante: o sistema lê a data, o valor, os juros e a autenticação. A conta escolhida aqui já vem marcada.</Text>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 14, gap: 6 },
  titulo: { fontSize: tam.texto + 1, fontWeight: '800', color: cores.texto },
  linhaInfo: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  valorLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  valor: { fontSize: tam.subtitulo + 4, fontWeight: '800', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  codigo: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 4 },
  codigoTexto: { fontSize: tam.texto, color: cores.texto, fontFamily: 'monospace' },
});
