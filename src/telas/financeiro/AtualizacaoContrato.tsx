import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import Botao from '../../componentes/Botao';
import Escolha from '../../componentes/Escolha';
import { supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { r2 } from '../../lib/financiamentos';
import { INDICES, OPCOES_ORDEM, ROTULO_INDICE, atualizarSaldo, indiceAcumulado, indiceFlutuante, jurosDesdePadrao, type Acumulado, type CodigoIndice, type OrdemCm } from '../../lib/indices';
import { cores, tam } from '../../tema';

type Props = {
  /** o financiamento, como vem do banco */
  f: any;
  /** principal em aberto */
  principal: number;
  /** vencimento da última parcela paga e da primeira em aberto */
  ultimaPaga: string | null;
  primeiraAberta: string | null;
  /** quantas parcelas em aberto (para as cotas da carência) */
  abertas: number;
  aoFechar: () => void;
  /** depois de guardar o indexador no contrato */
  aoGuardar: () => void;
};

type Resultado = {
  ate: string;
  jurosDesde: string;
  cmDesde: string | null;
  indice: string | null;
  perc: number;
  acumulado: Acumulado | null;
  manual: boolean;
  ordem: OrdemCm;
  cotas: number;
  cm: number;
  juros: number;
  total: number;
  dias: number;
  /** total pela outra forma de cálculo, para comparar */
  totalOutro: number | null;
};

/**
 * Atualização do contrato até uma data: principal em aberto + correção monetária + juros ainda não pagos.
 * É só informação: nada é gravado nas parcelas nem no contas a pagar.
 */
export default function AtualizacaoContrato({ f, principal, ultimaPaga, primeiraAberta, abertas, aoFechar, aoGuardar }: Props) {
  const [ate, setAte] = useState(hojeBR());
  const [indice, setIndice] = useState<string[]>([f.indexador_codigo ?? 'nenhum']);
  const [perc, setPerc] = useState(numeroParaCampo(f.indexador_perc ?? 100) || '100');
  const [ordem, setOrdem] = useState<string[]>([f.cm_ordem ?? 'corrigido']);
  const [variacao, setVariacao] = useState('');
  const [manual, setManual] = useState(false);
  // datas de início: o sistema sugere; se a pessoa mexer, vale o que ela pôs
  const [jurosDesde, setJurosDesde] = useState('');
  const [cmDesde, setCmDesde] = useState('');
  const [mexeuJuros, setMexeuJuros] = useState(false);
  const [mexeuCm, setMexeuCm] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);

  const cod = indice[0] === 'nenhum' ? null : (indice[0] as CodigoIndice);
  const ateIso = dataValida(ate) ? paraBanco(ate) : null;
  const emAndamento = Number(f.pago_principal) > 0 || Number(f.pago_juros) > 0;
  const cotas = f.juros_carencia === 'fixos' && f.sistema === 'sac' ? r2(Number(f.carencia_cota ?? 0) * abertas) : 0;

  const jurosPadrao = useMemo(
    () =>
      ateIso
        ? jurosDesdePadrao({
            liberacao: f.data_liberacao,
            ate: ateIso,
            ultimaPaga,
            primeiraAberta,
            emAndamento,
            jurosCarencia: f.juros_carencia,
            sistema: f.sistema,
            periodicidade: f.periodicidade,
            periodicidadeDias: Number(f.periodicidade_dias) || 30,
          })
        : null,
    [ateIso, f, ultimaPaga, primeiraAberta, emAndamento],
  );
  useEffect(() => {
    if (!mexeuJuros && jurosPadrao) setJurosDesde(doBanco(jurosPadrao));
  }, [jurosPadrao, mexeuJuros]);
  // correção: CDI e Selic acompanham os juros (do último pagamento); os índices de preço e a TR corrigem o saldo desde a liberação
  const jurosIso = dataValida(jurosDesde) ? paraBanco(jurosDesde) : null;
  useEffect(() => {
    if (mexeuCm || !cod) return;
    setCmDesde(indiceFlutuante(cod) ? (jurosIso ? doBanco(jurosIso) : '') : doBanco(f.data_liberacao));
  }, [cod, jurosIso, mexeuCm, f.data_liberacao]);

  const pedeManual = cod === 'outro' || manual;
  const mudou = (f.indexador_codigo ?? 'nenhum') !== indice[0] || (cod ? Number(f.indexador_perc ?? 100) !== (lerNumero(perc) ?? 100) || (f.cm_ordem ?? 'corrigido') !== ordem[0] : false);

  async function calcular() {
    setErro(null);
    setRes(null);
    if (!ateIso) return setErro('Informe a data até quando atualizar.');
    const jIso = dataValida(jurosDesde) ? paraBanco(jurosDesde)! : null;
    if (!jIso) return setErro('Informe de quando contam os juros.');
    const p = lerNumero(perc) ?? 100;
    if (cod && !(p > 0)) return setErro('Informe o percentual do indexador (100 = o índice cheio).');
    const cIso = cod ? (dataValida(cmDesde) ? paraBanco(cmDesde)! : null) : null;
    if (cod && !cIso) return setErro('Informe de quando conta a correção monetária.');

    let fator = 1;
    let acumulado: Acumulado | null = null;
    if (cod) {
      if (pedeManual) {
        const v = lerNumero(variacao);
        if (v == null) return setErro('Informe a variação do índice no período, em %.');
        fator = 1 + (v / 100) * (p / 100);
      } else {
        setCalculando(true);
        try {
          acumulado = await indiceAcumulado(cod, cIso!, ateIso, p);
          fator = acumulado.fator;
        } catch (e) {
          setCalculando(false);
          setManual(true);
          return setErro(`${traduzirErro(e) || 'Não foi possível buscar o índice.'} Abriu o campo para informar a variação à mão.`);
        }
        setCalculando(false);
      }
    }
    const dados = { principal, cotas, taxaAnual: Number(f.taxa_anual), jurosTipo: f.juros_tipo, baseDias: Number(f.base_dias), jurosDesde: jIso, ate: ateIso, fatorCm: fator };
    const o = ordem[0] as OrdemCm;
    const r = atualizarSaldo({ ...dados, ordem: o });
    const outro = cod && Math.abs(fator - 1) > 1e-9 ? atualizarSaldo({ ...dados, ordem: o === 'corrigido' ? 'separado' : 'corrigido' }).total : null;
    setRes({ ate: ateIso, jurosDesde: jIso, cmDesde: cIso, indice: cod, perc: p, acumulado, manual: pedeManual, ordem: o, cotas, cm: r.cm, juros: r.juros, total: r.total, dias: r.dias, totalOutro: outro });
  }

  async function guardar() {
    setErro(null);
    const p = lerNumero(perc) ?? 100;
    const { error } = await supabase
      .from('financiamentos')
      .update({ indexador_codigo: cod, indexador: cod ? (cod === 'outro' ? f.indexador || 'Outro' : ROTULO_INDICE[cod]) : null, indexador_perc: cod ? p : 100, cm_ordem: ordem[0] })
      .eq('id', f.id);
    if (error) return setErro(traduzirErro(error));
    setGuardado('Indexador guardado no contrato: das próximas vezes já vem assim.');
    aoGuardar();
  }

  const limpar = () => {
    setRes(null);
    setGuardado(null);
  };

  return (
    <View style={estilos.caixa}>
      <Text style={estilos.titulo}>Atualizar o contrato até uma data</Text>
      <Text style={estilos.nota}>Só informação: mostra quanto está a dívida na data. Nada é gravado nas parcelas nem no contas a pagar.</Text>
      <CampoData rotulo="Atualizar até" valor={ate} aoMudar={(v) => { setAte(v); limpar(); }} />
      <Escolha
        rotulo="Correção monetária (indexador)"
        opcoes={[{ valor: 'nenhum', rotulo: 'Sem correção' }, ...INDICES.map((i) => ({ valor: i.valor, rotulo: i.rotulo }))]}
        valor={indice}
        aoMudar={(v) => { setIndice(v); setManual(false); limpar(); }}
      />
      {cod && (
        <>
          <View style={estilos.linha}>
            <View style={{ width: 130 }}>
              <Campo rotulo="% do indexador" value={perc} onChangeText={(t) => { setPerc(t); limpar(); }} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <CampoData rotulo="Correção desde" valor={cmDesde} aoMudar={(v) => { setCmDesde(v); setMexeuCm(true); limpar(); }} />
            </View>
          </View>
          <Text style={estilos.nota}>
            100 = o índice cheio (ex.: 100% do CDI); 120 = 120% do índice.{' '}
            {indiceFlutuante(cod) ? 'CDI e Selic contam do último pagamento, junto com os juros.' : 'A correção do saldo conta desde a liberação; mude a data se o banco já cobrou parte dela.'}
          </Text>
          <Escolha rotulo="Forma de cálculo" opcoes={OPCOES_ORDEM} valor={ordem} aoMudar={(v) => { setOrdem(v); limpar(); }} />
          <Text style={estilos.nota}>
            {ordem[0] === 'corrigido' ? 'Primeiro corrige o saldo; os juros são calculados sobre o saldo já corrigido (o usual nos bancos).' : 'Correção e juros calculados, cada um, sobre o saldo original.'}
          </Text>
          {pedeManual ? (
            <Campo rotulo="Variação do índice no período (%)" value={variacao} onChangeText={(t) => { setVariacao(t); limpar(); }} keyboardType="decimal-pad" ajuda={cod === 'outro' ? 'Este indexador não tem busca automática: informe a variação acumulada do período.' : 'Informe a variação acumulada do período (sem o percentual do indexador, que o sistema aplica).'} />
          ) : (
            <Text style={estilos.nota}>O {ROTULO_INDICE[cod]} é buscado na hora no Banco Central (gratuito).</Text>
          )}
          {manual && cod !== 'outro' && (
            <Text style={estilos.link} onPress={() => { setManual(false); limpar(); }}>
              Tentar de novo a busca automática
            </Text>
          )}
        </>
      )}
      <CampoData rotulo="Juros desde" valor={jurosDesde} aoMudar={(v) => { setJurosDesde(v); setMexeuJuros(true); limpar(); }} />
      <Text style={estilos.nota}>
        {ultimaPaga ? 'Sugerido: o vencimento da última parcela paga.' : 'Sugerido pelo contrato: de quando os juros ainda não foram pagos.'} Pode mudar.
      </Text>
      {erro && <Text style={estilos.erro}>{erro}</Text>}
      <Botao titulo="Calcular" onPress={calcular} carregando={calculando} />

      {res && (
        <View style={estilos.resultado}>
          <Text style={estilos.resTitulo}>Posição em {doBanco(res.ate)}</Text>
          <Item rotulo="Principal em aberto" valor={formatarMoeda(principal)} />
          {res.cotas > 0 && <Item rotulo="Juros da carência a pagar (cotas)" valor={formatarMoeda(res.cotas)} />}
          {res.indice && (
            <Item
              rotulo={`Correção monetária · ${ROTULO_INDICE[res.indice]}${res.perc !== 100 ? ` ${formatarNumero(res.perc, Number.isInteger(res.perc) ? 0 : 2)}%` : ''}`}
              detalhe={`${res.manual ? `variação informada, desde ${doBanco(res.cmDesde)}` : res.acumulado?.descricao ?? ''} · ${formatarNumero(r2(((principal + res.cotas > 0 ? res.cm / (principal + res.cotas) : 0) * 100)), 2)}%`}
              valor={formatarMoeda(res.cm)}
            />
          )}
          <Item
            rotulo="Juros"
            detalhe={res.dias > 0 ? `${formatarNumero(res.dias)} dias, de ${doBanco(res.jurosDesde)} a ${doBanco(res.ate)} · ${formatarNumero(Number(f.taxa_anual), 4)}% a.a.` : 'sem dias a contar até esta data'}
            valor={formatarMoeda(res.juros)}
          />
          <View style={estilos.totalLinha}>
            <Text style={estilos.totalRotulo}>Total atualizado</Text>
            <Text style={estilos.totalValor}>{formatarMoeda(res.total)}</Text>
          </View>
          {res.acumulado?.aviso ? <Text style={estilos.erro}>{res.acumulado.aviso}</Text> : null}
          {res.totalOutro != null && (
            <Text style={estilos.nota}>
              Pela outra forma ({res.ordem === 'corrigido' ? 'correção e juros separados' : 'juros sobre o saldo corrigido'}) o total seria {formatarMoeda(res.totalOutro)}: diferença de {formatarMoeda(Math.abs(r2(res.total - res.totalOutro)))}.
            </Text>
          )}
          <Text style={estilos.nota}>São os juros do contrato. Multa e juros de mora de parcela vencida não entram; para quitar, vale o valor que o banco informar.</Text>
        </View>
      )}
      {guardado && <Text style={estilos.ok}>{guardado}</Text>}
      {mudou && !guardado && (
        <Text style={estilos.link} onPress={guardar}>
          Guardar este indexador e a forma de cálculo no contrato
        </Text>
      )}
      <Botao titulo="Fechar" tipo="texto" onPress={aoFechar} />
    </View>
  );
}

function Item({ rotulo, detalhe, valor }: { rotulo: string; detalhe?: string; valor: string }) {
  return (
    <View style={estilos.item}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.itemRotulo}>{rotulo}</Text>
        {detalhe ? <Text style={estilos.nota}>{detalhe}</Text> : null}
      </View>
      <Text style={estilos.itemValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 10 },
  titulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno + 1, color: cores.erro, lineHeight: 20 },
  ok: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '700' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  resultado: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  resTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  item: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: cores.borda },
  itemRotulo: { fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600' },
  itemValor: { fontSize: tam.texto, color: cores.texto, fontWeight: '700' },
  totalLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  totalRotulo: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  totalValor: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.cafe },
});
