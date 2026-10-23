import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { compartilharTexto } from '../../lib/web';
import Tela from '../../componentes/Tela';
import CampoData from '../../componentes/CampoData';
import Aviso from '../../componentes/Aviso';
import Botao from '../../componentes/Botao';
import Escolha from '../../componentes/Escolha';
import { useSessao } from '../../contexto/SessaoContext';
import { TODAS, idsRelatorio, opcoesRelatorio, rotuloRelatorio } from '../../lib/unidades';
import { supabase } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { somarMeses } from '../../lib/financiamentos';
import { cores, tam } from '../../tema';

const ultimoDia = (am: string) => {
  const [a, m] = am.split('-').map(Number);
  return `${am}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
function periodoDe(p: string): { de: string; ate: string } {
  const hoje = hojeBanco();
  const mes = hoje.slice(0, 7);
  if (p === 'anterior') {
    const ant = somarMeses(`${mes}-01`, -1).slice(0, 7);
    return { de: `${ant}-01`, ate: ultimoDia(ant) };
  }
  if (p === 'ano') return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
  if (p === 'anopassado') {
    const a = Number(hoje.slice(0, 4)) - 1;
    return { de: `${a}-01-01`, ate: `${a}-12-31` };
  }
  return { de: `${mes}-01`, ate: ultimoDia(mes) };
}

type Resultado = { linhas: number; lancados?: number; pagos?: number; recebidos?: number; sem_conta?: number; arquivo?: string; link?: string };

/**
 * Financeiro › Exportar para a contabilidade: gera um arquivo (CSV, abre no Excel) com tudo o que foi lançado,
 * pago e recebido no período, já com a conta do plano, a fazenda e o centro de custo. Quem faz a contabilidade
 * apanha o arquivo e lança do lado de lá: aqui ninguém precisa pensar em débito e crédito.
 */
export default function ExportarContabilidade() {
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  const [quais, setQuais] = useState<string[]>([TODAS]);
  const [periodo, setPeriodo] = useState<string[]>(['anterior']);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [gerando, setGerando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const qual = quais[0];

  const faixa = useMemo(() => {
    if (periodo[0] !== 'outro') return periodoDe(periodo[0]);
    if (!dataValida(de) || !dataValida(ate)) return null;
    const a = paraBanco(de)!;
    const b = paraBanco(ate)!;
    return a <= b ? { de: a, ate: b } : null;
  }, [periodo, de, ate]);

  async function gerar() {
    if (!fid || !faixa) return setErro('Informe as duas datas do período.');
    setErro(null);
    setRes(null);
    setGerando(true);
    const { data, error } = await supabase.functions.invoke('exportar-contabilidade', { body: { fazendas: idsRelatorio(qual, fazendas), de: faixa.de, ate: faixa.ate } });
    setGerando(false);
    if (error) {
      let msg = 'Não foi possível gerar o arquivo agora. Tente de novo.';
      try {
        const j = await (error as any).context?.json();
        if (j?.erro) msg = j.erro;
      } catch {
        /* mantém a mensagem padrão */
      }
      return setErro(msg);
    }
    setRes(data as Resultado);
  }

  const mudou = () => setRes(null);
  return (
    <Tela>
      <Text style={estilos.nota}>Gera um arquivo que abre no Excel, para quem faz a contabilidade apanhar os dados e lançar no sistema dele. Aqui nada muda.</Text>
      <Escolha
        rotulo="De quem"
        opcoes={opcoesRelatorio(fazendas)}
        valor={quais}
        aoMudar={(v) => {
          setQuais(v);
          mudou();
        }}
      />
      <Escolha
        rotulo="Período"
        opcoes={[
          { valor: 'anterior', rotulo: 'Mês passado' },
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'ano', rotulo: 'Este ano' },
          { valor: 'anopassado', rotulo: 'Ano passado' },
          { valor: 'outro', rotulo: 'Outro' },
        ]}
        valor={periodo}
        aoMudar={(v) => {
          setPeriodo(v);
          mudou();
        }}
      />
      {periodo[0] === 'outro' && (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="De" valor={de} aoMudar={(t) => { setDe(t); mudou(); }} />
          </View>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="Até" valor={ate} aoMudar={(t) => { setAte(t); mudou(); }} />
          </View>
        </View>
      )}
      {faixa && (
        <Text style={estilos.periodo}>
          {rotuloRelatorio(qual, fazendas)} · {doBanco(faixa.de)} a {doBanco(faixa.ate)}
        </Text>
      )}
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Botao titulo="Gerar o arquivo" onPress={gerar} carregando={gerando} />

      {res && res.linhas === 0 && <Aviso tipo="info" texto="Não há nada lançado, pago nem recebido neste período." />}
      {res && res.linhas > 0 && res.link && (
        <View style={estilos.cartao}>
          <Text style={estilos.titulo}>{res.arquivo}</Text>
          <Text style={estilos.texto}>
            {res.linhas} {res.linhas === 1 ? 'linha' : 'linhas'}: {res.lancados ?? 0} de títulos lançados, {res.pagos ?? 0} de pagamentos e {res.recebidos ?? 0} de recebimentos.
          </Text>
          {(res.sem_conta ?? 0) > 0 && <Text style={[estilos.texto, { color: cores.cafe, fontWeight: '700' }]}>{res.sem_conta} {res.sem_conta === 1 ? 'linha saiu' : 'linhas saíram'} sem classificação (título lançado sem tipo). Dá para corrigir alterando o título.</Text>}
          <Botao titulo="Abrir / baixar o arquivo" onPress={() => Linking.openURL(res.link!).catch(() => setErro('Não foi possível abrir o link. Use "Enviar o link".'))} />
          <Botao titulo="Enviar o link (WhatsApp, e-mail…)" tipo="secundario" onPress={async () => {
            const r = await compartilharTexto(`Fazenda Digital – dados para a contabilidade (${res.arquivo}). O link vale por 1 hora:\n${res.link}`);
            if (r === 'copiado') Alert.alert('Link copiado', 'Cole no WhatsApp, no e-mail ou onde quiser. O link vale por 1 hora.');
          }} />
          <Text style={estilos.nota}>O link vale por 1 hora. Depois disso, é só gerar de novo.</Text>
        </View>
      )}

      <View style={estilos.ajuda}>
        <Text style={estilos.ajudaTitulo}>O que vem no arquivo</Text>
        <Text style={estilos.nota}>• "Lançado": cada título emitido no período (compra, despesa, venda, parcela de financiamento), pela data do lançamento, com o vencimento ao lado.</Text>
        <Text style={estilos.nota}>• "Pago" e "Recebido": o dinheiro que saiu ou entrou no período, com o caixa ou banco.</Text>
        <Text style={estilos.nota}>• Em cada linha: valor, código e nome da conta do plano, pessoa e CPF/CNPJ, documento, histórico, origem, fazenda e centro de custo.</Text>
        <Text style={estilos.nota}>• Parcela de financiamento sai em duas linhas: o principal e os juros. Juros, multa e desconto da baixa também saem em linhas próprias (o desconto vem negativo).</Text>
      </View>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  periodo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 10 },
  titulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  texto: { fontSize: tam.pequeno + 1, color: cores.texto, lineHeight: 20 },
  ajuda: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  ajudaTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.info },
});
