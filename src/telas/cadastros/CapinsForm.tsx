// V195: tabela de capins e parâmetros da estimativa das mangas (sequeiro), com valores iniciais usuais, editáveis.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { lerNumero, numeroParaCampo } from '../../lib/formatos';

type Capim = {
  id?: string; nome: string; ms_ano_t: string; perc_aguas: string; gmd_aguas: string; gmd_seca: string;
  descanso_aguas: string; descanso_seca: string; altura_entrada_cm: string; altura_saida_cm: string;
};
const VAZIO: Capim = { nome: '', ms_ano_t: '', perc_aguas: '75', gmd_aguas: '', gmd_seca: '', descanso_aguas: '', descanso_seca: '', altura_entrada_cm: '', altura_saida_cm: '' };
const FAIXAS: [string, string][] = [
  ['M0', 'Machos 0 a 12'], ['M13', 'Machos 13 a 24'], ['M25', 'Machos 25 a 36'], ['M37', 'Machos + 36'],
  ['F0', 'Fêmeas 0 a 2'], ['F3', 'Fêmeas 3 a 8'], ['F9', 'Fêmeas 9 a 12'], ['F13', 'Fêmeas 13 a 24'], ['F25', 'Fêmeas 25 a 36'], ['F37', 'Fêmeas + 36'],
];

export default function CapinsForm() {
  const [lista, setLista] = useState<any[]>([]);
  const [escolhido, setEscolhido] = useState<string>('novo');
  const [c, setC] = useState<Capim>(VAZIO);
  const [par, setPar] = useState<Record<string, string>>({});
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([
        consulta<any[]>(supabase.from('capins').select('*').eq('ativo', true).order('nome')),
        consulta<any>(supabase.from('pastagem_parametros').select('*').eq('id', 1).single()),
      ]);
      setLista(l);
      setPar({
        eficiencia_perc: numeroParaCampo(p.eficiencia_perc), consumo_perc_pv: numeroParaCampo(p.consumo_perc_pv), ua_kg: numeroParaCampo(p.ua_kg),
        mes_aguas_ini: String(p.mes_aguas_ini), mes_aguas_fim: String(p.mes_aguas_fim),
        fator_fraca: numeroParaCampo(p.fator_fraca), fator_media: numeroParaCampo(p.fator_media), fator_boa: numeroParaCampo(p.fator_boa),
      });
      setPesos(Object.fromEntries(Object.entries(p.pesos ?? {}).map(([k, v]) => [k, numeroParaCampo(v as number)])));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  function escolher(id: string) {
    setEscolhido(id);
    setOk(null);
    setErro(null);
    const x = lista.find((y) => y.id === id);
    if (!x) return setC(VAZIO);
    setC({
      id: x.id, nome: x.nome, ms_ano_t: numeroParaCampo(x.ms_ano_t), perc_aguas: numeroParaCampo(x.perc_aguas),
      gmd_aguas: numeroParaCampo(x.gmd_aguas), gmd_seca: numeroParaCampo(x.gmd_seca),
      descanso_aguas: x.descanso_aguas != null ? String(x.descanso_aguas) : '', descanso_seca: x.descanso_seca != null ? String(x.descanso_seca) : '',
      altura_entrada_cm: numeroParaCampo(x.altura_entrada_cm), altura_saida_cm: numeroParaCampo(x.altura_saida_cm),
    });
  }
  const campo = (k: keyof Capim, rot: string, inteiro = false) => (
    <View style={{ flex: 1 }}>
      <Campo rotulo={rot} value={c[k] ?? ''} onChangeText={(t) => setC({ ...c, [k]: inteiro ? t.replace(/\D/g, '') : t })} keyboardType={inteiro ? 'number-pad' : 'decimal-pad'} />
    </View>
  );

  async function gravarCapim() {
    setErro(null);
    setOk(null);
    const ms = lerNumero(c.ms_ano_t);
    const pa = lerNumero(c.perc_aguas);
    if (!c.nome.trim()) return setErro('Informe o nome do capim.');
    if (!ms || ms <= 0) return setErro('Informe a produção de matéria seca (t/ha/ano).');
    if (!pa || pa < 1 || pa > 99) return setErro('Informe o % da produção nas águas (de 1 a 99).');
    const int = (t: string) => (t.trim() ? Number(t) : null);
    const reg = {
      nome: c.nome.trim(), ms_ano_t: ms, perc_aguas: pa, gmd_aguas: lerNumero(c.gmd_aguas), gmd_seca: lerNumero(c.gmd_seca),
      descanso_aguas: int(c.descanso_aguas), descanso_seca: int(c.descanso_seca),
      altura_entrada_cm: lerNumero(c.altura_entrada_cm), altura_saida_cm: lerNumero(c.altura_saida_cm),
    };
    setSalvando(true);
    const { error } = c.id
      ? await supabase.from('capins').update(reg).eq('id', c.id)
      : await supabase.from('capins').insert({ ...reg, palavras: [reg.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setOk(`${reg.nome} gravado.`);
    await carregar();
  }

  async function gravarParametros() {
    setErro(null);
    setOk(null);
    const n = (k: string) => lerNumero(par[k] ?? '');
    const ini = Number(par.mes_aguas_ini);
    const fim = Number(par.mes_aguas_fim);
    if (!(ini >= 1 && ini <= 12 && fim >= 1 && fim <= 12)) return setErro('Os meses das águas vão de 1 a 12.');
    const p = {
      eficiencia_perc: n('eficiencia_perc'), consumo_perc_pv: n('consumo_perc_pv'), ua_kg: n('ua_kg'), mes_aguas_ini: ini, mes_aguas_fim: fim,
      fator_fraca: n('fator_fraca'), fator_media: n('fator_media'), fator_boa: n('fator_boa'),
      pesos: Object.fromEntries(FAIXAS.map(([k]) => [k, lerNumero(pesos[k] ?? '') ?? 0])),
    };
    if (Object.entries(p).some(([k, v]) => k !== 'pesos' && (v == null || Number(v) <= 0))) return setErro('Preencha todos os parâmetros com valores maiores que zero.');
    if (Object.values(p.pesos).some((v) => !v || v <= 0)) return setErro('Informe o peso de todas as faixas.');
    setSalvando(true);
    const { error } = await supabase.from('pastagem_parametros').update(p).eq('id', 1);
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    setOk('Parâmetros gravados.');
  }

  const cp = (k: string, rot: string) => (
    <View style={{ flex: 1 }}>
      <Campo rotulo={rot} value={par[k] ?? ''} onChangeText={(t) => setPar({ ...par, [k]: t })} keyboardType="decimal-pad" />
    </View>
  );

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {ok && <Aviso tipo="sucesso" texto={ok} />}
      <Escolha rotulo="Capim" opcoes={[...lista.map((x) => ({ valor: x.id, rotulo: x.nome })), { valor: 'novo', rotulo: '+ Novo capim' }]} valor={[escolhido]} aoMudar={(v) => v.length && escolher(v[0])} />
      <Campo rotulo="Nome *" value={c.nome} onChangeText={(t) => setC({ ...c, nome: t })} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {campo('ms_ano_t', 'MS t/ha/ano *')}
        {campo('perc_aguas', '% nas águas *')}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {campo('gmd_aguas', 'GMD águas (kg/dia)')}
        {campo('gmd_seca', 'GMD seca (kg/dia)')}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {campo('descanso_aguas', 'Descanso águas (dias)', true)}
        {campo('descanso_seca', 'Descanso seca (dias)', true)}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {campo('altura_entrada_cm', 'Altura entrada (cm)')}
        {campo('altura_saida_cm', 'Altura saída (cm)')}
      </View>
      <Botao titulo={c.id ? 'Gravar capim' : 'Cadastrar capim'} onPress={gravarCapim} carregando={salvando} />

      <Secao titulo="Parâmetros da estimativa" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {cp('eficiencia_perc', 'Aproveitamento do pasto (%)')}
        {cp('consumo_perc_pv', 'Consumo (% do peso/dia)')}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {cp('ua_kg', 'UA (kg)')}
        {cp('mes_aguas_ini', 'Águas: do mês')}
        {cp('mes_aguas_fim', 'até o mês')}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {cp('fator_fraca', 'Fertilidade fraca (×)')}
        {cp('fator_media', 'Média (×)')}
        {cp('fator_boa', 'Boa (×)')}
      </View>
      <Secao titulo="Peso padrão por faixa (kg, quando o animal não tem peso)" />
      {[0, 2, 4, 6, 8].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          {FAIXAS.slice(i, i + 2).map(([k, rot]) => (
            <View key={k} style={{ flex: 1 }}>
              <Campo rotulo={rot} value={pesos[k] ?? ''} onChangeText={(t) => setPesos({ ...pesos, [k]: t })} keyboardType="decimal-pad" />
            </View>
          ))}
        </View>
      ))}
      <Botao titulo="Gravar parâmetros" onPress={gravarParametros} carregando={salvando} />
    </Tela>
  );
}
