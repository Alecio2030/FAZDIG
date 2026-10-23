import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import CampoData from '../../componentes/CampoData';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import { useSessao } from '../../contexto/SessaoContext';
import { ADM, TODAS, idsRelatorio, opcoesRelatorio, rotuloRelatorio } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { somarMeses } from '../../lib/financiamentos';
import { cores, tam } from '../../tema';

const r2 = (x: number) => Math.round(x * 100) / 100;
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
  if (p === '12meses') return { de: somarMeses(`${mes}-01`, -11), ate: hoje };
  return { de: `${mes}-01`, ate: ultimoDia(mes) };
}

type Conta = { id: string; codigo: string; nome: string; tipo: string; conta_pai_id: string | null };
type LinhaRes = { conta_id: string | null; entradas: number; saidas: number };
type Secao = 'receitas' | 'despesas' | 'estoque' | 'investimentos' | 'financiamentos' | 'abertura' | 'socios' | 'outros';
type Item = { codigo: string; nome: string; grupo: string; entradas: number; saidas: number; liquido: number };

/** Em que parte do relatório a conta entra. O resultado de caixa da atividade soma as três primeiras. */
function secaoDe(c: Conta | undefined, contaAbertura?: string | null): Secao {
  if (!c) return 'outros';
  // operações anteriores ao início do sistema: contrapartida no Patrimônio Líquido, fora do resultado
  if (contaAbertura && c.id === contaAbertura) return 'abertura';
  if (c.tipo === 'receita') return 'receitas';
  if (c.tipo === 'despesa') return 'despesas';
  if (c.codigo.startsWith('1.1.03')) return 'estoque';
  if (c.codigo.startsWith('1.6') || c.codigo.startsWith('1.2')) return 'investimentos'; // V142: Permanente 1.6
  if (c.codigo.startsWith('2.1.04') || c.codigo.startsWith('2.2')) return 'financiamentos';
  // V137: Particular dos sócios e retiradas (Patrimônio Líquido), fora do resultado
  if (c.codigo.startsWith('2.3.05')) return 'socios';
  return 'outros';
}
const TITULOS: Record<Secao, string> = {
  receitas: 'Receitas recebidas',
  despesas: 'Custos e despesas pagos',
  estoque: 'Compras para estoque (insumos e animais)',
  investimentos: 'Investimentos (bens)',
  financiamentos: 'Financiamentos',
  abertura: 'Saldos de abertura (Patrimônio Líquido)',
  socios: 'Particular dos sócios e retiradas (Patrimônio Líquido)',
  outros: 'Outros movimentos',
};

/**
 * Financeiro › Resultado da atividade (regime de caixa): o que foi recebido e pago no período,
 * agrupado pela estrutura do plano de contas, por fazenda ou de todas juntas. Só consulta.
 */
export default function RelatorioResultado() {
  const { fazendaAtiva, fazendas, modoAdm } = useSessao();
  const fid = fazendaAtiva?.id;
  // uma fazenda, a Administração (sede) ou o Grupo inteiro (o resultado do Grupo é a soma de todas)
  const [quais, setQuais] = useState<string[]>([modoAdm ? ADM : fid ?? TODAS]);
  const [periodo, setPeriodo] = useState<string[]>(['ano']);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [plano, setPlano] = useState<Conta[] | null>(null);
  const [dados, setDados] = useState<{ contas: LinhaRes[]; caixa_entradas: number; caixa_saidas: number; pendentes: number; abertura_conta?: string | null; inicio?: string | null } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const qual = quais[0];

  useEffect(() => {
    consulta<Conta[]>(supabase.from('plano_contas').select('id, codigo, nome, tipo, conta_pai_id'))
      .then(setPlano)
      .catch((e) => setErro(traduzirErro(e)));
  }, []);

  const faixa = useMemo(() => {
    if (periodo[0] !== 'outro') return periodoDe(periodo[0]);
    if (!dataValida(de) || !dataValida(ate)) return null;
    const a = paraBanco(de)!;
    const b = paraBanco(ate)!;
    return a <= b ? { de: a, ate: b } : null;
  }, [periodo, de, ate]);

  const carregar = useCallback(() => {
    if (!fid || !faixa) return;
    setErro(null);
    setCarregando(true);
    supabase.rpc('resultado_caixa', { p_fazendas: idsRelatorio(qual, fazendas), p_de: faixa.de, p_ate: faixa.ate }).then(({ data, error }) => {
      setCarregando(false);
      if (error) return setErro(traduzirErro(error));
      setDados(data as any);
    });
  }, [fid, faixa, qual, fazendas]);
  useFocusEffect(carregar);

  const secoes = useMemo(() => {
    const porId = new Map((plano ?? []).map((c) => [c.id, c]));
    const m: Record<Secao, Item[]> = { receitas: [], despesas: [], estoque: [], investimentos: [], financiamentos: [], abertura: [], socios: [], outros: [] };
    for (const l of dados?.contas ?? []) {
      const c = l.conta_id ? porId.get(l.conta_id) : undefined;
      const pai = c?.conta_pai_id ? porId.get(c.conta_pai_id) : undefined;
      // V142: nas Receitas e Custos o grau 2 é a fazenda (centro de custo) e o grau 3 o subcentro
      const avo = pai?.conta_pai_id ? porId.get(pai.conta_pai_id) : undefined;
      const grupo = pai ? (avo && avo.conta_pai_id && (c!.tipo === 'receita' || c!.tipo === 'despesa') ? `${avo.nome} › ${pai.nome}` : pai.nome) : '';
      const ent = Number(l.entradas);
      const sai = Number(l.saidas);
      if (!ent && !sai) continue;
      m[secaoDe(c, dados?.abertura_conta)].push({ codigo: c?.codigo ?? 'zzz', nome: c?.nome ?? 'Sem classificação (títulos lançados sem tipo)', grupo, entradas: ent, saidas: sai, liquido: r2(ent - sai) });
    }
    (Object.keys(m) as Secao[]).forEach((k) => m[k].sort((a, b) => a.codigo.localeCompare(b.codigo)));
    return m;
  }, [plano, dados]);
  const total = (s: Secao) => r2(secoes[s].reduce((t, i) => t + i.liquido, 0));
  const resultado = r2(total('receitas') + total('despesas') + total('estoque'));
  const variacao = r2(resultado + total('investimentos') + total('financiamentos') + total('abertura') + total('socios') + total('outros'));
  const caixa = r2(Number(dados?.caixa_entradas ?? 0) - Number(dados?.caixa_saidas ?? 0));

  const bloco = (s: Secao, mostrarVazio = false) => {
    const itens = secoes[s];
    if (!itens.length && !mostrarVazio) return null;
    let grupoAnt = '';
    return (
      <View style={estilos.bloco}>
        <View style={estilos.blocoTopo}>
          <Text style={estilos.blocoTitulo}>{TITULOS[s]}</Text>
          <Text style={[estilos.blocoTotal, { color: total(s) < 0 ? cores.erro : cores.primariaEscura }]}>{formatarMoeda(total(s))}</Text>
        </View>
        {!itens.length && <Text style={estilos.nota}>Nada no período.</Text>}
        {itens.map((i) => {
          const cab = i.grupo && i.grupo !== grupoAnt ? i.grupo : null;
          grupoAnt = i.grupo;
          return (
            <View key={i.codigo + i.nome}>
              {cab && <Text style={estilos.grupo}>{cab}</Text>}
              <View style={estilos.item}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.itemNome}>{i.nome}</Text>
                  {i.entradas > 0 && i.saidas > 0 && (
                    <Text style={estilos.nota}>
                      Entrou {formatarMoeda(i.entradas)} · Saiu {formatarMoeda(i.saidas)}
                    </Text>
                  )}
                </View>
                <Text style={[estilos.itemValor, i.liquido < 0 && { color: cores.erro }]}>{formatarMoeda(i.liquido)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Tela>
      <Escolha rotulo="De quem" opcoes={opcoesRelatorio(fazendas)} valor={quais} aoMudar={setQuais} />
      <Escolha
        rotulo="Período"
        opcoes={[
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'anterior', rotulo: 'Mês passado' },
          { valor: 'ano', rotulo: 'Este ano' },
          { valor: '12meses', rotulo: '12 meses' },
          { valor: 'outro', rotulo: 'Outro' },
        ]}
        valor={periodo}
        aoMudar={setPeriodo}
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
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!faixa ? (
        <Text style={estilos.vazio}>Informe as duas datas do período.</Text>
      ) : carregando || !dados || !plano ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          <View style={estilos.cartao}>
            <Text style={estilos.rotuloCartao}>
              {rotuloRelatorio(qual, fazendas)} · {doBanco(faixa.de)} a {doBanco(faixa.ate)}
            </Text>
            <Text style={estilos.rotuloCartao}>Resultado de caixa da atividade</Text>
            <Text style={[estilos.totalCartao, resultado < 0 && { color: cores.erro }]}>{formatarMoeda(resultado)}</Text>
            <Text style={estilos.nota}>Receitas recebidas, menos custos e despesas pagos, menos compras para estoque.</Text>
          </View>
          {Number(dados.pendentes) > 0 && <Aviso tipo="info" texto={`${dados.pendentes} ${Number(dados.pendentes) === 1 ? 'pagamento aguarda' : 'pagamentos aguardam'} a confirmação do dono e ainda não ${Number(dados.pendentes) === 1 ? 'entrou' : 'entraram'} aqui.`} />}

          {bloco('receitas', true)}
          {bloco('despesas', true)}
          {bloco('estoque')}
          <View style={estilos.fecho}>
            <Text style={estilos.fechoRotulo}>Resultado de caixa da atividade</Text>
            <Text style={[estilos.fechoValor, resultado < 0 && { color: cores.erro }]}>{formatarMoeda(resultado)}</Text>
          </View>

          {bloco('investimentos')}
          {bloco('financiamentos')}
          {bloco('abertura')}
          {bloco('socios')}
          {secoes.abertura.length > 0 && (
            <Text style={estilos.nota}>
              Saldos de abertura: contas a pagar e a receber que já existiam antes do início do sistema{dados.inicio ? ` (${doBanco(dados.inicio)})` : ''}. Quando são pagas ou recebidas, o dinheiro mexe no caixa, mas não é receita nem despesa do período: a contrapartida é o Patrimônio Líquido.
            </Text>
          )}
          {bloco('outros')}
          <View style={estilos.fecho}>
            <Text style={estilos.fechoRotulo}>Variação do caixa no período</Text>
            <Text style={[estilos.fechoValor, variacao < 0 && { color: cores.erro }]}>{formatarMoeda(variacao)}</Text>
          </View>
          {Math.abs(variacao - caixa) > 0.01 && <Aviso tipo="erro" texto={`A soma das contas (${formatarMoeda(variacao)}) não fechou com o movimento de caixa (${formatarMoeda(caixa)}). Me avise: é erro do relatório.`} />}
          <Text style={estilos.nota}>
            Regime de caixa: vale a data em que o dinheiro entrou ou saiu. Nas parcelas de financiamento, os juros e a variação monetária entram em despesas financeiras e o principal em Financiamentos, fora do resultado. Liberação de financiamento não é receita.
          </Text>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  vazio: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 4 },
  rotuloCartao: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '700' },
  totalCartao: { fontSize: tam.subtitulo + 6, fontWeight: '800', color: cores.cafe },
  bloco: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  blocoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  blocoTitulo: { flex: 1, fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  blocoTotal: { fontSize: tam.texto, fontWeight: '800' },
  grupo: { fontSize: tam.pequeno, fontWeight: '700', color: cores.textoSuave, marginTop: 6 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: cores.borda },
  itemNome: { fontSize: tam.pequeno + 1, color: cores.texto },
  itemValor: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  fecho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12 },
  fechoRotulo: { flex: 1, fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  fechoValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.cafe },
});
