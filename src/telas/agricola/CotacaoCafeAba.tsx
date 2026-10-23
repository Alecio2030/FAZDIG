import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero } from '../../lib/formatos';
import { textoSacas } from '../../lib/posColheita';
import { CAMPOS_POSICAO, TIPOS_CAFE, posicoes, type Posicao } from '../../lib/armazem';
import { atualizarCotacoes, cotacaoReferencia, cotacaoVelha, lerCotacoes, textoVariacao, ultimasCotacoes, type Cotacao } from '../../lib/cotacoes';
import { cores, tam } from '../../tema';

/**
 * Cotação do conilon: os preços do dia (Centro do Comércio de Café de Vitória e Cooabriel), o histórico dos últimos fechamentos,
 * quanto vale o café em estoque e a cotação informada à mão (o preço da sua cooperativa ou comprador).
 */
export default function CotacaoCafeAba({ abas }: { abas: React.ReactNode }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const [cots, setCots] = useState<Cotacao[] | null>(null);
  const [pos, setPos] = useState<Posicao[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // informar à mão
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hojeBR());
  const [tipo, setTipo] = useState('7');
  const [preco, setPreco] = useState('');
  const [fonte, setFonte] = useState('');
  const [salvando, setSalvando] = useState(false);

  const buscar = useCallback(async (silencioso: boolean) => {
    setBuscando(true);
    if (!silencioso) {
      setErro(null);
      setAviso(null);
    }
    const r = await atualizarCotacoes();
    setBuscando(false);
    if (r.erro) {
      if (!silencioso) setErro(r.erro);
      return;
    }
    try {
      setCots(await lerCotacoes());
      if (!silencioso) setAviso(r.data ? `Cotação atualizada: último fechamento de ${doBanco(r.data)}.` : 'Cotação atualizada.');
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, []);

  useEffect(() => {
    if (!fid) return;
    (async () => {
      try {
        const [c, movs] = await Promise.all([lerCotacoes(), consulta<any[]>(supabase.from('cafe_movimentos').select(CAMPOS_POSICAO).eq('fazenda_id', fid).limit(10000))]);
        setCots(c);
        setPos(posicoes(movs));
        // a cotação entra sozinha nos dias úteis; se a que está aqui ficou velha, busca agora sem incomodar
        if (cotacaoVelha(c)) buscar(true);
      } catch (e) {
        setErro(traduzirErro(e));
      }
    })();
  }, [fid, buscar]);

  async function informar() {
    setErro(null);
    setAviso(null);
    const p = lerNumero(preco);
    if (!dataValida(data) || paraBanco(data)! > hojeBanco()) return setErro('Informe a data da cotação (não pode ser futura).');
    if (!tipo.trim()) return setErro('Informe o tipo do café.');
    if (!p || p <= 0) return setErro('Informe o preço por saca.');
    setSalvando(true);
    const { error } = await supabase.rpc('informar_cotacao_cafe', { p_data: paraBanco(data), p_tipo: tipo.trim(), p_preco: p, p_fonte: fonte.trim() });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setPreco('');
    setAberto(false);
    setAviso(`Cotação de ${data} gravada: tipo ${tipo.trim()} a ${formatarMoeda(p)} por saca.`);
    setCots(await lerCotacoes());
  }

  if (cots === null) return <Tela>{abas}{erro ? <Aviso tipo="erro" texto={erro} /> : <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />}</Tela>;

  const ult = ultimasCotacoes(cots);
  const dias = [...new Set(cots.map((c) => c.data))].slice(0, 10);
  const colunas = [...new Set(cots.map((c) => `${c.fonte}|${c.tipo}`))].sort();
  // estoque valorizado: cada lote pela cotação do tipo dele
  const valor = pos.reduce((t, p) => t + p.saldo * (cotacaoReferencia(cots, p.lote?.tipo)?.preco ?? 0), 0);
  const sacas = pos.reduce((t, p) => t + p.saldo, 0);
  const semTipo = pos.filter((p) => !p.lote?.tipo).length;

  return (
    <Tela>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      <Secao titulo="Conilon hoje (R$ por saca de 60 kg)" />
      {ult.length === 0 ? (
        <Text style={estilos.nota}>{buscando ? 'Buscando a cotação…' : 'Ainda não há cotação. Toque em "Atualizar agora" ou informe a cotação do dia.'}</Text>
      ) : (
        <View style={estilos.caixa}>
          {ult.map((c) => (
            <View key={`${c.fonte}|${c.tipo}`} style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.titulo}>
                  {c.fonte} · tipo {c.tipo}
                </Text>
                <Text style={estilos.nota}>
                  {c.origem === 'manual' ? 'Informada' : 'Fechamento'} de {doBanco(c.data)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={estilos.preco}>{formatarMoeda(c.preco)}</Text>
                {c.variacao != null && <Text style={[estilos.variacao, { color: c.variacao < 0 ? cores.erro : cores.primaria }]}>{textoVariacao(c.variacao)}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
      <Botao titulo={buscando ? 'Buscando…' : 'Atualizar agora'} tipo="secundario" onPress={() => buscar(false)} carregando={buscando} />
      <Text style={estilos.nota}>Fonte: Centro do Comércio de Café de Vitória e Cooabriel, pelo site Notícias Agrícolas. Entra sozinha nos dias úteis, perto do meio-dia e no fim da tarde. É preço de referência: o da sua praça pode ser outro.</Text>

      {sacas > 0.005 && ult.length > 0 && (
        <>
          <Secao titulo="Seu café em estoque" />
          <View style={estilos.destaque}>
            <Text style={estilos.destaqueRotulo}>{textoSacas(sacas)} valem hoje</Text>
            <Text style={estilos.destaqueValor}>{formatarMoeda(valor)}</Text>
            <Text style={estilos.nota}>
              Média de {formatarMoeda(valor / sacas)} por saca: cada lote pela cotação do tipo dele (sem cotação do tipo, pela do tipo 7).
              {semTipo ? ` ${semTipo} ${semTipo === 1 ? 'lote está' : 'lotes estão'} sem classificação.` : ''} O custo por saca e a margem estão em Agrícola › Safras › Consultar.
            </Text>
          </View>
        </>
      )}

      {dias.length > 1 && (
        <>
          <Secao titulo="Últimos fechamentos" />
          <View style={estilos.caixa}>
            <View style={estilos.linha}>
              <Text style={[estilos.cab, { width: 62 }]}>Dia</Text>
              {colunas.map((k) => (
                <Text key={k} style={[estilos.cab, estilos.col]}>
                  {k.split('|')[0].replace(' (Vitória)', '')} {k.split('|')[1]}
                </Text>
              ))}
            </View>
            {dias.map((d) => (
              <View key={d} style={estilos.linha}>
                <Text style={[estilos.cel, { width: 62 }]}>{doBanco(d).slice(0, 5)}</Text>
                {colunas.map((k) => {
                  const c = cots.find((x) => x.data === d && `${x.fonte}|${x.tipo}` === k);
                  return (
                    <Text key={k} style={[estilos.cel, estilos.col, c?.variacao != null && c.variacao < 0 ? { color: cores.erro } : null]}>
                      {c ? formatarNumero(c.preco, 0) : '–'}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={estilos.nota}>Em vermelho, os dias em que o preço caiu.</Text>
        </>
      )}

      <Secao titulo="Cotação da sua praça" />
      {aberto ? (
        <View style={estilos.caixa}>
          <View style={estilos.campos}>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Data *" valor={data} aoMudar={setData} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoMoeda rotulo="Preço por saca (R$) *" valor={preco} aoMudar={setPreco} />
            </View>
          </View>
          <Escolha rotulo="Tipo" opcoes={TIPOS_CAFE.map((t) => ({ valor: t, rotulo: t }))} valor={TIPOS_CAFE.includes(tipo) ? [tipo] : []} aoMudar={(v) => setTipo(v[0])} />
          <Campo rotulo="De quem (cooperativa, comprador)" value={fonte} onChangeText={setFonte} autoCapitalize="words" placeholder="Em branco: Informada por mim" />
          <View style={estilos.campos}>
            <View style={{ flex: 1 }}>
              <Botao titulo="Cancelar" tipo="secundario" onPress={() => setAberto(false)} />
            </View>
            <View style={{ flex: 1.4 }}>
              <Botao titulo="Gravar cotação" onPress={informar} carregando={salvando} />
            </View>
          </View>
        </View>
      ) : (
        <Botao titulo="+ Informar a cotação do dia" tipo="secundario" onPress={() => setAberto(true)} />
      )}
      <Text style={estilos.nota}>O preço que a sua cooperativa ou comprador passou. Na mesma data, a cotação informada vale mais que a do site para valorizar o estoque.</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campos: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  preco: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.primariaEscura },
  variacao: { fontSize: tam.pequeno, fontWeight: '700' },
  destaque: { backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 12, gap: 2 },
  destaqueRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.textoSuave },
  destaqueValor: { fontSize: tam.titulo, fontWeight: '800', color: cores.primariaEscura },
  cab: { fontSize: tam.pequeno - 1, fontWeight: '700', color: cores.textoSuave },
  cel: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  col: { flex: 1, textAlign: 'right' },
});
