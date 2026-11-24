import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import CampoData from '../../componentes/CampoData';
import { useSessao } from '../../contexto/SessaoContext';
import Escolha from '../../componentes/Escolha';
import { TODAS, filtrarUnidade, nomeUnidade, opcoesFiltroUnidade } from '../../lib/unidades';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { eDono } from '../../lib/acessos';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { somarDias } from '../../lib/reproducao';
import { limparBusca } from '../../lib/useBusca';
import { CAMPOS_TITULO, linhasTitulo, saldoTitulo, textosTitulo, um, type TipoTitulo, type Titulo } from '../../lib/titulos';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** Aba Pagar: o que vence (vencidos e próximos 30 dias), a busca e, para o Master, os pagamentos a confirmar. Tocando, abre a baixa. */
export default function PagarTitulos({ tipo = 'pagar' }: { tipo?: TipoTitulo }) {
  const tx = textosTitulo(tipo);
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva, fazendas } = useSessao();
  const fid = fazendaAtiva?.id;
  const dono = eDono(fazendaAtiva?.perfil);
  // As contas são do Grupo: todas aparecem; o filtro por unidade é opcional.
  const [unidade, setUnidade] = useState<string[]>([TODAS]);
  const und = unidade[0];
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Titulo[] | null>(null);
  const [abertos, setAbertos] = useState<Titulo[] | null>(null);
  const [pendentes, setPendentes] = useState<any[]>([]);
  const [todos, setTodos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // V179: vencimentos por período, igual à Consulta (abre no dia de hoje).
  const [de, setDe] = useState(hojeBR());
  const [ate, setAte] = useState(hojeBR());
  const termo = limparBusca(busca);
  const hoje = hojeBanco();
  const limite = somarDias(hoje, 30);

  useFocusEffect(
    useCallback(() => {
      if (!fid) return;
      (async () => {
        try {
          const [ts, ps] = await Promise.all([
            consulta<Titulo[]>(filtrarUnidade(supabase.from('lancamentos').select(CAMPOS_TITULO).eq('tipo', tipo).in('situacao', ['aberto', 'parcial']), und).order('data_vencimento').order('numero').limit(3000)),
            consulta<any[]>(filtrarUnidade(supabase.from('baixas').select('id, data, valor_pago, fazenda_id, lancamento:lancamentos ( id, numero, tipo, descricao, pessoa:pessoas ( nome ) )'), und).eq('situacao', 'pendente').order('data')),
          ]);
          setAbertos(ts);
          setPendentes(ps.filter((b) => um(b.lancamento)?.tipo === tipo));
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [fid, tipo, und]),
  );

  useEffect(() => {
    if (!fid || !termo) return setAchados(null);
    const t = setTimeout(async () => {
      try {
        const pessoas = await consulta<any[]>(supabase.from('pessoas').select('id').ilike('nome', `%${termo}%`).limit(30));
        const partes = [`descricao.ilike.*${termo}*`, `documento.ilike.*${termo}*`];
        if (/^\d+$/.test(termo)) partes.unshift(`numero.eq.${termo}`);
        if (pessoas.length) partes.push(`pessoa_id.in.(${pessoas.map((p) => p.id).join(',')})`);
        setAchados(await consulta<Titulo[]>(filtrarUnidade(supabase.from('lancamentos').select(CAMPOS_TITULO).eq('tipo', tipo).or(partes.join(',')), und).order('data_vencimento', { ascending: false }).limit(40)));
      } catch (e) {
        setErro(traduzirErro(e));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [fid, termo, tipo, und]);

  const linha = (t: Titulo) => (
    <Linha key={t.id} titulo={`Nº ${t.numero} · ${t.descricao ?? 'Título'}`} linhas={[...linhasTitulo(t), nomeUnidade(t.fazenda_id, fazendas)]} direita={formatarMoeda(t.situacao === 'pago' ? Number(t.valor) : saldoTitulo(t))} onPress={() => (tipo === 'pagar' && t.situacao !== 'pago' ? navegacao.navigate('PagamentoBanco', { id: t.id }) : navegacao.navigate('TituloBaixa', { id: t.id }))} />
  );
  const soma = (l: Titulo[]) => l.reduce((s, t) => s + saldoTitulo(t), 0);
  const grupo = (titulo: string, l: Titulo[], cor?: string) =>
    l.length > 0 && (
      <View style={{ gap: 6 }}>
        <View style={estilos.grupoTopo}>
          <Text style={[estilos.grupoTitulo, cor ? { color: cor } : null]}>{titulo}</Text>
          <Text style={[estilos.grupoTotal, cor ? { color: cor } : null]}>{formatarMoeda(soma(l))}</Text>
        </View>
        <Lista>{l.map(linha)}</Lista>
      </View>
    );

  function periodo() {
    const ok = dataValida(de) && dataValida(ate);
    const i = ok ? paraBanco(de)! : '';
    const f = ok ? paraBanco(ate)! : '';
    const invertido = ok && i > f;
    const lst = ok && !invertido && abertos ? abertos.filter((t) => t.data_vencimento >= i && t.data_vencimento <= f) : [];
    const titulo = !ok ? 'Contas que vencem no período' : i === f ? (i === hoje ? 'Contas que vencem hoje' : `Contas que vencem em ${de}`) : `Contas que vencem de ${de} a ${ate}`;
    return (
      <View style={{ gap: 8 }}>
        <Secao titulo="Vencimentos por período" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="De" valor={de} aoMudar={setDe} />
          </View>
          <View style={{ flex: 1 }}>
            <CampoData rotulo="Até" valor={ate} aoMudar={setAte} />
          </View>
        </View>
        {(de !== hojeBR() || ate !== hojeBR()) && (
          <Botao titulo="Voltar para hoje" tipo="secundario" onPress={() => { setDe(hojeBR()); setAte(hojeBR()); }} />
        )}
        {invertido ? (
          <Text style={estilos.dica}>A data final é anterior à inicial.</Text>
        ) : !ok ? null : (
          <>
            <View style={estilos.periodoResumo}>
              <Text style={estilos.periodoTexto}>
                {titulo} · {lst.length} {lst.length === 1 ? 'título' : 'títulos'}
              </Text>
              <Text style={estilos.periodoValor}>{formatarMoeda(soma(lst))}</Text>
            </View>
            {lst.length === 0 ? <Text style={estilos.dica}>Nenhuma conta em aberto com vencimento {i === f ? 'nesta data' : 'neste período'}.</Text> : <Lista>{lst.map(linha)}</Lista>}
          </>
        )}
      </View>
    );
  }

  const vencidos = (abertos ?? []).filter((t) => t.data_vencimento < hoje);
  const deHoje = (abertos ?? []).filter((t) => t.data_vencimento === hoje);
  const semana = (abertos ?? []).filter((t) => t.data_vencimento > hoje && t.data_vencimento <= somarDias(hoje, 7));
  const mes = (abertos ?? []).filter((t) => t.data_vencimento > somarDias(hoje, 7) && t.data_vencimento <= limite);
  const depois = (abertos ?? []).filter((t) => t.data_vencimento > limite);

  return (
    <>
      <Escolha rotulo="De qual unidade" opcoes={opcoesFiltroUnidade(fazendas)} valor={unidade} aoMudar={setUnidade} />
      <Busca valor={busca} aoMudar={setBusca} dica="Nº do título, fornecedor, descrição ou documento" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      {termo ? (
        achados === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
        ) : achados.length === 0 ? (
          <Text style={estilos.dica}>Nenhum título com "{termo}".</Text>
        ) : (
          <Lista>{achados.map(linha)}</Lista>
        )
      ) : abertos === null ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />
      ) : (
        <>
          {pendentes.length > 0 && (
            <View style={estilos.pendentes}>
              <Text style={estilos.pendTitulo}>
                {dono
                  ? pendentes.length === 1
                    ? `1 ${tx.pagamento} aguardando a sua confirmação`
                    : `${pendentes.length} ${tx.pagamentos} aguardando a sua confirmação`
                  : pendentes.length === 1
                    ? `1 ${tx.pagamento} aguardando a confirmação do Master`
                    : `${pendentes.length} ${tx.pagamentos} aguardando a confirmação do Master`}
              </Text>
              <Lista>
                {pendentes.map((b) => {
                  const l = um(b.lancamento);
                  return <Linha key={b.id} titulo={`Nº ${l.numero} · ${l.descricao ?? 'Título'}`} linhas={[um(l.pessoa)?.nome, `${tx.Pago} em ${doBanco(b.data)}`, nomeUnidade(b.fazenda_id, fazendas)]} direita={formatarMoeda(Number(b.valor_pago))} onPress={() => navegacao.navigate('TituloBaixa', { id: l.id })} />;
                })}
              </Lista>
            </View>
          )}
          <View style={estilos.resumo}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.resumoRotulo}>Vencido</Text>
              <Text style={[estilos.resumoValor, vencidos.length > 0 && { color: cores.erro }]}>{formatarMoeda(soma(vencidos))}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={estilos.resumoRotulo}>A vencer</Text>
              <Text style={estilos.resumoValor}>{formatarMoeda(soma([...deHoje, ...semana, ...mes, ...depois]))}</Text>
              <Text style={estilos.resumoRotulo}>{formatarMoeda(soma([...deHoje, ...semana, ...mes]))} em 30 dias</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={estilos.resumoRotulo}>Total em aberto</Text>
              <Text style={[estilos.resumoValor, { color: cores.primariaEscura }]}>{formatarMoeda(soma(abertos))}</Text>
            </View>
          </View>
          {abertos.length === 0 && <Text style={estilos.dica}>Nenhuma conta em aberto.</Text>}
          {abertos.length > 0 && periodo()}
          {abertos.length > 0 && <Secao titulo="Todas as contas em aberto" />}
          {grupo('Vencidos', vencidos, cores.erro)}
          {grupo('Vencem hoje', deHoje, cores.cafe)}
          {grupo('Próximos 7 dias', semana)}
          {grupo('De 8 a 30 dias', mes)}
          {todos
            ? grupo('Depois de 30 dias', depois)
            : depois.length > 0 && <Botao titulo={`Ver também depois de 30 dias (${depois.length} · ${formatarMoeda(soma(depois))})`} tipo="secundario" onPress={() => setTodos(true)} />}
          <Text style={estilos.nota}>
            {tipo === 'pagar'
              ? 'Toque no título para pagar pelo banco: escolha Pix ou boleto e a conta; o sistema copia o código e abre o app do banco. Depois, a baixa com o comprovante.'
              : `Toque no título para ${tx.pagar} (dar baixa).`}{' '}
            Para estornar um {tx.pagamento}, busque o título pelo número.
          </Text>
        </>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  grupoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  grupoTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  grupoTotal: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  resumo: { flexDirection: 'row', backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 12 },
  resumoRotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  resumoValor: { fontSize: tam.texto + 1, fontWeight: '800', color: cores.texto },
  pendentes: { backgroundColor: '#FFF6E0', borderRadius: tam.raio, borderWidth: 1, borderColor: '#E0A800', padding: 12, gap: 8 },
  periodoResumo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12 },
  periodoTexto: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  periodoValor: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  pendTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
});
