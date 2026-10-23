import React, { useCallback, useEffect, useState } from 'react';
import { excluirComEstorno } from '../../lib/excluir';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoMoeda from '../../componentes/CampoMoeda';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import CampoPessoaBusca from '../../componentes/CampoPessoaBusca';
import RodapeAcoes from '../../componentes/RodapeAcoes';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { dataValida, doBanco, hojeBR, hojeBanco, paraBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero, formatarQtd, lerNumero, moedaParaCampo, numeroParaCampo } from '../../lib/formatos';
import { textoLitros } from '../../lib/colheitas';
import { COBRANCA_PILAGEM, r2, textoSacas, um } from '../../lib/posColheita';
import { cores, tam } from '../../tema';

type Seca = { id: string; numero: number; saida: string; onde: string; quem: string; sacasSecas: number; litros: number; saldo: number };
const n = (t: string) => lerNumero(t);

/**
 * Pilagem (beneficiamento): quais secagens foram piladas, quantas sacas beneficiadas de 60 kg saíram e a cobrança de quem pilou
 * (R$ por saca ou percentual das sacas). Mostra a renda e os litros de café da roça por saca beneficiada.
 */
export default function PilagemAba({ abas, titulo, abrirNumero }: { abas: React.ReactNode; titulo: (t: string) => void; abrirNumero?: number }) {
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;

  const [secas, setSecas] = useState<Seca[]>([]);
  const [proximo, setProximo] = useState<number | null>(null);
  const [carregado, setCarregado] = useState(false);

  const [id, setId] = useState<string | null>(null);
  const [numero, setNumero] = useState<number | null>(null);
  const [data, setData] = useState(hojeBR());
  const [onde, setOnde] = useState('proprio');
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [benef, setBenef] = useState('');
  const [kg, setKg] = useState('');
  const [palha, setPalha] = useState('');
  const [cobranca, setCobranca] = useState('');
  const [preco, setPreco] = useState('');
  const [perc, setPerc] = useState('');
  const [valorSaca, setValorSaca] = useState('');
  const [venc, setVenc] = useState('');
  const [custoProprio, setCustoProprio] = useState('');
  const [obs, setObs] = useState('');
  const [alterarAberto, setAlterarAberto] = useState(false);
  const [alterarNum, setAlterarNum] = useState('');
  const [alterarErro, setAlterarErro] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    titulo(id ? `Pilagem nº ${numero}` : 'Secagem e pilagem');
  }, [id, numero, titulo]);

  /** Secagens que já saíram do secador e ainda têm sacas sem pilar (na alteração, devolve ao saldo o que é desta pilagem). */
  const carregarBase = useCallback(
    async (pilagemId: string | null = null) => {
      if (!fid) return;
      try {
        const [ss, usados, ult] = await Promise.all([
          consulta<any[]>(
            supabase.from('cafe_secagens').select('id, numero, data_saida, onde, litros, sacas_secas, sacas_pagas, pessoa:pessoas ( nome ), local:pc_locais ( nome )').eq('fazenda_id', fid).not('sacas_secas', 'is', null).order('data_saida').order('numero').limit(2000),
          ),
          consulta<any[]>(supabase.from('cafe_pilagem_itens').select('secagem_id, sacas_coco, pilagem_id').eq('fazenda_id', fid).limit(5000)),
          consulta<any[]>(supabase.from('cafe_pilagens').select('numero').eq('fazenda_id', fid).order('numero', { ascending: false }).limit(1)),
        ]);
        const usado: Record<string, number> = {};
        for (const u of usados) if (u.pilagem_id !== pilagemId) usado[u.secagem_id] = (usado[u.secagem_id] ?? 0) + Number(u.sacas_coco);
        setSecas(
          ss
            .map((s) => ({
              id: s.id, numero: s.numero, saida: s.data_saida, onde: s.onde, litros: Number(s.litros), sacasSecas: Number(s.sacas_secas),
              quem: s.onde === 'terceiro' ? um(s.pessoa)?.nome ?? 'Terceiro' : um(s.local)?.nome ?? 'Secador próprio',
              saldo: r2(Number(s.sacas_secas) - Number(s.sacas_pagas ?? 0) - (usado[s.id] ?? 0)),
            }))
            .filter((s) => s.saldo > 0.005),
        );
        setProximo((ult[0]?.numero ?? 0) + 1);
        setCarregado(true);
      } catch (e) {
        setErro(traduzirErro(e));
      }
    },
    [fid],
  );

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  // ---------- cálculos ----------
  const escolhidas = secas.filter((s) => sel[s.id] !== undefined);
  const coco = r2(escolhidas.reduce((t, s) => t + (n(sel[s.id]) ?? 0), 0));
  // litros de café da roça que deram origem às sacas de coco piladas
  const litrosOrigem = escolhidas.reduce((t, s) => t + (s.sacasSecas ? ((n(sel[s.id]) ?? 0) / s.sacasSecas) * s.litros : 0), 0);
  const terceiro = onde === 'terceiro';
  const nBenef = n(benef) ?? 0;
  const pagas = terceiro && cobranca === 'percentual' && nBenef ? r2((nBenef * (n(perc) ?? 0)) / 100) : 0;
  const valorDinheiro = terceiro && cobranca === 'saca' ? r2(nBenef * (n(preco) ?? 0)) : 0;
  const valorCafe = r2(pagas * (n(valorSaca) ?? 0));

  // ---------- ações ----------
  function alternar(s: Seca) {
    setSel((a) => {
      const novo = { ...a };
      if (novo[s.id] !== undefined) delete novo[s.id];
      else novo[s.id] = numeroParaCampo(s.saldo);
      return novo;
    });
  }

  function limpar() {
    setId(null);
    setNumero(null);
    setData(hojeBR());
    setOnde('proprio');
    setPessoaId(null);
    setSel({});
    setBenef('');
    setKg('');
    setPalha('');
    setCobranca('');
    setPreco('');
    setPerc('');
    setValorSaca('');
    setVenc('');
    setCustoProprio('');
    setObs('');
    setErros({});
    setErro(null);
    setAlterarAberto(false);
    setAlterarNum('');
    setAlterarErro(null);
  }

  async function abrirPorNumero(numInformado?: number) {
    const alvoNum = numInformado ?? Number(alterarNum);
    setAlterarErro(null);
    if (!alvoNum) return setAlterarErro('Informe o número.');
    try {
      const { data: g } = await supabase.from('cafe_pilagens').select('*').eq('fazenda_id', fid!).eq('numero', alvoNum).maybeSingle();
      if (!g) return setAlterarErro(`Não existe a pilagem nº ${alvoNum} nesta fazenda.`);
      const itens = await consulta<any[]>(supabase.from('cafe_pilagem_itens').select('secagem_id, sacas_coco').eq('pilagem_id', g.id));
      await carregarBase(g.id);
      setId(g.id);
      setNumero(g.numero);
      setData(doBanco(g.data));
      setOnde(g.onde);
      setPessoaId(g.pessoa_id);
      setSel(Object.fromEntries(itens.map((i) => [i.secagem_id, numeroParaCampo(i.sacas_coco)])));
      setBenef(numeroParaCampo(g.sacas_beneficiadas));
      setKg('');
      setPalha(numeroParaCampo(g.palha_kg));
      setCobranca(g.cobranca ?? '');
      setPreco(moedaParaCampo(g.preco));
      setPerc(numeroParaCampo(g.percentual));
      setValorSaca(moedaParaCampo(g.valor_saca));
      setVenc(doBanco(g.vencimento));
      setCustoProprio(Number(g.custo_proprio) ? moedaParaCampo(g.custo_proprio) : '');
      setObs(g.observacoes ?? '');
      setErros({});
      setErro(null);
      setAviso(null);
      setAlterarAberto(false);
    } catch (e) {
      setAlterarErro(traduzirErro(e));
    }
  }
  // V149: veio da ficha da Consulta pelo botão "Alterar ou excluir"
  useEffect(() => {
    if (!abrirNumero || !fid) return;
    setAlterarAberto(true);
    abrirPorNumero(abrirNumero);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirNumero, fid]);


  async function salvar() {
    setErro(null);
    setAviso(null);
    const e: Record<string, string> = {};
    if (!dataValida(data)) e.data = 'Informe a data.';
    else if (paraBanco(data)! > hojeBanco()) e.data = 'A data não pode ser futura.';
    if (terceiro && !pessoaId) e.pessoa = 'Informe quem fez a pilagem.';
    if (!escolhidas.length) e.itens = 'Escolha as secagens que foram piladas.';
    for (const s of escolhidas) {
      const v = n(sel[s.id]);
      if (!v || v <= 0) e.itens = `Informe as sacas da secagem nº ${s.numero}.`;
      else if (v > s.saldo + 0.005) e.itens = `A secagem nº ${s.numero} só tem ${textoSacas(s.saldo)} sem pilar.`;
    }
    if (!nBenef || nBenef <= 0) e.benef = 'Informe quantas sacas beneficiadas saíram.';
    if (palha.trim() && (n(palha) == null || n(palha)! < 0)) e.palha = 'Palha inválida.';
    if (terceiro && cobranca === 'saca' && !n(preco)) e.cobranca = 'Informe o preço por saca beneficiada.';
    if (terceiro && cobranca === 'percentual' && (!n(perc) || n(perc)! <= 0 || n(perc)! >= 100)) e.cobranca = 'Informe o percentual das sacas que fica com quem pilou.';
    if (terceiro && cobranca && venc && !dataValida(venc)) e.venc = 'Vencimento inválido.';
    setErros(e);
    const lista = Object.values(e);
    if (lista.length) return setErro(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    if (!fid) return;

    const p = {
      id,
      fazenda_id: fid,
      data: paraBanco(data),
      onde,
      pessoa_id: pessoaId ?? '',
      itens: escolhidas.map((s) => ({ secagem_id: s.id, sacas_coco: n(sel[s.id]) })),
      sacas_beneficiadas: nBenef,
      palha_kg: n(palha),
      cobranca: terceiro ? cobranca : '',
      preco: n(preco),
      percentual: n(perc),
      valor_saca: n(valorSaca),
      vencimento: terceiro && cobranca === 'saca' && dataValida(venc) ? paraBanco(venc) : '',
      custo_proprio: n(custoProprio),
      observacoes: obs.trim(),
    };
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('salvar_pilagem', { p });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    const res = r as { numero: number; coco: number; sacas: number; pagas: number; titulo: number };
    const partes = [`Pilagem nº ${res.numero} ${id ? 'alterada' : 'lançada'}: ${textoSacas(res.coco)} em coco deram ${textoSacas(res.sacas)} beneficiadas`];
    if (res.pagas) partes.push(`${textoSacas(res.pagas)} ficam com quem pilou e ${textoSacas(r2(res.sacas - res.pagas))} são suas`);
    if (res.titulo) partes.push(`serviço de ${formatarMoeda(res.titulo)} no Contas a pagar`);
    limpar();
    setAviso(`${partes.join('; ')}.`);
    carregarBase();
  }

  function excluir() {
    Alert.alert('Excluir pilagem', `Excluir a pilagem nº ${numero}? As sacas em coco voltam a ficar sem pilar e o título do serviço sai do Contas a pagar.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { erro: error } = await excluirComEstorno(() => supabase.rpc('excluir_pilagem', { p_id: id }), 'cafe_pilagem_id', String(id));
          if (error) return setErro(traduzirErro(error));
          const num = numero;
          limpar();
          setAviso(`Pilagem nº ${num} excluída.`);
          carregarBase();
        },
      },
    ]);
  }

  // ---------- tela ----------
  return (
    <Tela rodape={<RodapeAcoes titulo={id ? 'Salvar alterações' : 'Lançar pilagem'} aoConfirmar={salvar} carregando={salvando} aoDescartar={id || escolhidas.length ? limpar : undefined} erro={erro} />}>
      {abas}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}

      <View style={estilos.linha}>
        <View style={estilos.numero}>
          <Text style={estilos.numeroRotulo}>Pilagem nº</Text>
          <Text style={estilos.numeroValor}>{id ? numero : proximo ?? '…'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
        </View>
      </View>
      {id ? (
        <Text style={estilos.link} onPress={limpar}>
          Sair desta pilagem e lançar uma nova
        </Text>
      ) : alterarAberto ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Alterar a pilagem nº" value={alterarNum} onChangeText={(t) => setAlterarNum(t.replace(/\D/g, ''))} keyboardType="number-pad" erro={alterarErro} />
          </View>
          <View style={{ width: 110, paddingTop: 26 }}>
            <Botao titulo="Abrir" tipo="secundario" onPress={() => abrirPorNumero()} />
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setAlterarAberto(true)}>
          Alterar uma pilagem já lançada
        </Text>
      )}

      <Secao titulo="Onde pilou" />
      <Escolha
        opcoes={[
          { valor: 'proprio', rotulo: 'Máquina própria' },
          { valor: 'terceiro', rotulo: 'De terceiro' },
        ]}
        valor={[onde]}
        aoMudar={(v) => setOnde(v[0])}
      />
      {terceiro && <CampoPessoaBusca rotulo="Quem pilou *" valorId={pessoaId} aoMudar={setPessoaId} tipoNovo="fornecedor" erro={erros.pessoa} />}

      <Secao titulo="Café seco que foi pilado" />
      {carregado && secas.length === 0 ? (
        <Text style={estilos.nota}>Nenhuma secagem com sacas sem pilar. Dê a saída do secador na aba Secagem.</Text>
      ) : (
        <View style={estilos.caixa}>
          {secas.map((s) => {
            const marcado = sel[s.id] !== undefined;
            return (
              <View key={s.id} style={estilos.lote}>
                <Pressable onPress={() => alternar(s)} accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} style={estilos.loteToque}>
                  <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={26} color={marcado ? cores.primaria : cores.textoSuave} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.loteTitulo}>
                      Secagem nº {s.numero} · {textoSacas(s.saldo)}
                    </Text>
                    <Text style={estilos.nota}>
                      Saiu em {doBanco(s.saida)} · {s.quem}
                    </Text>
                  </View>
                </Pressable>
                {marcado && (
                  <View style={{ width: 104 }}>
                    <Campo rotulo="" value={sel[s.id]} onChangeText={(t) => setSel((a) => ({ ...a, [s.id]: t }))} keyboardType="decimal-pad" placeholder="sacas" />
                  </View>
                )}
              </View>
            );
          })}
          {escolhidas.length > 0 && (
            <Text style={estilos.total}>
              {escolhidas.length === 1 ? '1 secagem' : `${escolhidas.length} secagens`} · {textoSacas(coco)} em coco
            </Text>
          )}
          <Text style={estilos.nota}>Vêm todas as sacas que faltam pilar de cada secagem (já sem as que pagaram o secador). Se pilou só uma parte, corrija.</Text>
        </View>
      )}
      {erros.itens ? <Text style={estilos.erro}>{erros.itens}</Text> : null}

      <Secao titulo="Resultado" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo
            rotulo="Sacas beneficiadas (60 kg) *"
            value={benef}
            onChangeText={(t) => {
              setBenef(t);
              setKg('');
            }}
            keyboardType="decimal-pad"
            erro={erros.benef}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Campo
            rotulo="ou peso total (kg)"
            value={kg}
            onChangeText={(t) => {
              setKg(t);
              const v = n(t);
              setBenef(v ? numeroParaCampo(r2(v / 60)) : '');
            }}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      <Campo rotulo="Palha que sobrou (kg)" value={palha} onChangeText={setPalha} keyboardType="decimal-pad" erro={erros.palha} ajuda="Opcional. A palha volta para a lavoura como adubo: lance a aplicação em Atividades." />

      {terceiro ? (
        <>
          <Secao titulo="Cobrança da pilagem" />
          <Escolha opcoes={COBRANCA_PILAGEM} valor={[cobranca]} aoMudar={(v) => setCobranca(v[0])} />
          {cobranca === 'saca' && (
            <>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <CampoMoeda rotulo="Preço por saca (R$) *" valor={preco} aoMudar={setPreco} />
                </View>
                <View style={{ flex: 1 }}>
                  <CampoData rotulo="Vencimento" valor={venc} aoMudar={setVenc} erro={erros.venc} />
                </View>
              </View>
              <Text style={estilos.nota}>Gera um título no Contas a pagar (conta Secagem e beneficiamento), rateado pelos talhões de onde veio o café. Em branco, vence na data da pilagem.</Text>
            </>
          )}
          {cobranca === 'percentual' && (
            <>
              <View style={estilos.linha}>
                <View style={{ flex: 1 }}>
                  <Campo rotulo="% das sacas *" value={perc} onChangeText={setPerc} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <CampoMoeda rotulo="Valor da saca (R$)" valor={valorSaca} aoMudar={setValorSaca} />
                </View>
              </View>
              <Text style={estilos.nota}>Pagamento em café: as sacas de quem pilou saem do seu saldo e não geram título. O valor da saca é opcional e serve só para pôr esse pagamento no custo.</Text>
            </>
          )}
          {cobranca === '' && <Text style={estilos.nota}>Sem cobrança agora: complete depois em "Alterar uma pilagem já lançada".</Text>}
          {erros.cobranca ? <Text style={estilos.erro}>{erros.cobranca}</Text> : null}
        </>
      ) : (
        <>
          <Secao titulo="Custo da pilagem própria" />
          <CampoMoeda rotulo="Energia, diesel e mão de obra (R$)" valor={custoProprio} aoMudar={setCustoProprio} />
          <Text style={estilos.nota}>Opcional. Entra no custo por saca desta pilagem; não gera título.</Text>
        </>
      )}

      <Campo rotulo="Observações" value={obs} onChangeText={setObs} autoCapitalize="sentences" multiline style={{ minHeight: 70, paddingTop: 12 }} />

      {coco > 0 && nBenef > 0 && (
        <View style={estilos.resumo}>
          <Par a="Sacas beneficiadas" b={`${textoSacas(nBenef)} (${formatarNumero(nBenef * 60)} kg)`} forte />
          <Par a="Renda" b={`${formatarQtd(coco / nBenef, 2)} sacas em coco por saca beneficiada`} />
          {litrosOrigem > 0 && <Par a="Da roça à saca" b={`${formatarNumero(litrosOrigem / nBenef)} L de café da roça por saca`} />}
          {litrosOrigem > 0 && <Text style={estilos.nota}>Vieram de {textoLitros(litrosOrigem)} colhidos.</Text>}
          {pagas > 0 && <Par a={`Ficam com quem pilou (${formatarQtd(n(perc))}%)`} b={textoSacas(pagas)} />}
          {pagas > 0 && <Par a="Suas sacas" b={textoSacas(r2(nBenef - pagas))} forte />}
          {valorDinheiro > 0 && <Par a="Serviço da pilagem" b={formatarMoeda(valorDinheiro)} />}
          {valorCafe > 0 && <Par a="Pagamento em café, no custo" b={formatarMoeda(valorCafe)} />}
          {!terceiro && n(custoProprio) ? <Par a="Custo próprio" b={formatarMoeda(n(custoProprio))} /> : null}
        </View>
      )}

      {id && <Botao titulo="Excluir pilagem" tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}

function Par({ a, b, forte }: { a: string; b: string; forte?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={[estilos.parA, forte && { fontWeight: '700', color: cores.texto }]}>{a}</Text>
      <Text style={[estilos.parB, forte && { color: cores.primariaEscura }]}>{b}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { minWidth: 110, gap: 6 },
  numeroRotulo: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.texto },
  numeroValor: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, minHeight: tam.alturaToque, textAlignVertical: 'center' },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  lote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loteToque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  loteTitulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  total: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.primariaEscura },
  resumo: { backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  parA: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  parB: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.texto, textAlign: 'right', flexShrink: 1 },
});
