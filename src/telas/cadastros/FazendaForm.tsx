import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import Escolha from '../../componentes/Escolha';
import { Ionicons } from '@expo/vector-icons';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { supabase, traduzirErro } from '../../lib/supabase';
import { cpfCnpjValido, formatarNumero, lerNumero, mascaraCep, mascaraCpfCnpj, numeroParaCampo } from '../../lib/formatos';
import { lembrarSigla, sugerirSigla } from '../../lib/useSigla';
import ConsultaFazendas from './ConsultaFazendas';
import SeletorLista from '../../componentes/SeletorLista';
import { carregarCriadores } from '../../lib/criadores';
import { perguntar } from '../../lib/perguntar';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type Form = {
  nome: string;
  sigla: string;
  razao: string;
  doc: string;
  ie: string;
  defesa: string;
  incra: string;
  itr: string;
  car: string;
  areaHa: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  ativa: boolean;
  criadorId: string | null;
  /** V137: fazenda ou Particular dos sócios */
  tipo: 'fazenda' | 'particular';
};

const VAZIO: Form = { nome: '', sigla: '', razao: '', doc: '', ie: '', defesa: '', incra: '', itr: '', car: '', areaHa: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', ativa: true, criadorId: null, tipo: 'fazenda' };
const texto = (v: string) => (v.trim() ? v.trim() : null);

export default function FazendaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'FazendaForm'>>();
  const id = params?.id;
  const { fazendas, recarregarFazendas } = useSessao();
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  const [f, setF] = useState<Form>(VAZIO);
  const [siglaMexida, setSiglaMexida] = useState(false);
  const [areasHa, setAreasHa] = useState<{ mangas: number; talhoes: number } | null>(null);
  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});

  // V137: sócios do Particular (são os centros de custo dele)
  const [socios, setSocios] = useState<{ id: string; nome: string }[]>([]);
  const [novoSocio, setNovoSocio] = useState('');
  const [erroSocio, setErroSocio] = useState<string | null>(null);
  const [incluindo, setIncluindo] = useState(false);
  const particular = f.tipo === 'particular';

  const lerSocios = React.useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('centros_custo').select('id, nome, centro_pai_id').eq('fazenda_id', id).eq('ativo', true).not('centro_pai_id', 'is', null).order('codigo');
    setSocios(((data ?? []) as any[]).map((c) => ({ id: c.id, nome: c.nome })));
  }, [id]);

  async function incluirSocio() {
    setErroSocio(null);
    if (!id || !novoSocio.trim()) return setErroSocio('Escreva o nome do sócio.');
    setIncluindo(true);
    const { error } = await supabase.rpc('incluir_socio', { p_particular: id, p_nome: novoSocio.trim() });
    setIncluindo(false);
    if (error) return setErroSocio(traduzirErro(error));
    setNovoSocio('');
    lerSocios();
  }

  async function tirarSocio(s: { id: string; nome: string }) {
    setErroSocio(null);
    const { error } = await supabase.from('centros_custo').update({ ativo: false }).eq('id', s.id);
    if (error) return setErroSocio(traduzirErro(error));
    lerSocios();
  }

  const muda = <K extends keyof Form>(campo: K, valor: Form[K]) => setF((a) => ({ ...a, [campo]: valor }));

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? (particular ? 'Particular dos sócios' : 'Editar fazenda') : 'Fazendas' });
  }, [navegacao, id, particular]);

  useEffect(() => {
    if (id && particular) lerSocios();
  }, [id, particular, lerSocios]);

  useEffect(() => {
    if (!id) return;
    supabase.from('fazendas').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) setErro(traduzirErro(error));
      else if (data) {
        setF({
          nome: data.nome ?? '',
          sigla: data.sigla ?? '',
          razao: data.razao_social ?? '',
          doc: data.cpf_cnpj ?? '',
          ie: data.inscricao_estadual ?? '',
          defesa: data.inscricao_defesa ?? '',
          incra: data.incra ?? '',
          itr: data.itr ?? '',
          car: data.car ?? '',
          areaHa: numeroParaCampo(data.area_total_ha),
          cep: data.cep ?? '',
          logradouro: data.logradouro ?? '',
          numero: data.numero ?? '',
          complemento: data.complemento ?? '',
          bairro: data.bairro ?? '',
          municipio: data.municipio ?? '',
          uf: (data.uf ?? '').trim(),
          ativa: data.ativa !== false,
          criadorId: data.criador_id ?? null,
          tipo: data.tipo === 'particular' ? 'particular' : 'fazenda',
        });
        setSiglaMexida(true);
      }
      setCarregando(false);
    });
    // Quanto já está cadastrado em mangas e talhões, para comparar com a área total.
    supabase
      .from('areas')
      .select('tipo, area_ha')
      .eq('fazenda_id', id)
      .eq('ativa', true)
      .then(({ data }) => {
        const d = (data ?? []) as { tipo: string; area_ha: number | null }[];
        const soma = (t: string) => d.filter((a) => a.tipo === t).reduce((s, a) => s + Number(a.area_ha ?? 0), 0);
        setAreasHa({ mangas: soma('manga'), talhoes: soma('talhao') });
      });
  }, [id]);

  // Num cadastro novo, a sigla vai sendo sugerida pelo nome até a pessoa mexer nela.
  function mudarNome(t: string) {
    setF((a) => ({ ...a, nome: t, sigla: siglaMexida || !t.trim() ? a.sigla : sugerirSigla(t) }));
  }

  // V149: excluir fazenda (ou Particular) cadastrada errada – só sem movimento; o banco diz o que impede
  async function excluir() {
    setErro(null);
    const ok = await perguntar(
      particular ? 'Excluir Particular' : 'Excluir fazenda',
      `Excluir ${f.nome}? Só é possível se ainda não tiver compras, contas, estoque, imobilizado, animais, atividades ou outros lançamentos. Talhões, mangas, centros de custo, contas bancárias e acessos dela saem junto.`,
      'Excluir',
      'Voltar',
    );
    if (!ok) return;
    const { error } = await supabase.rpc('excluir_fazenda', { p_id: id });
    if (error) return setErro(traduzirErro(error));
    await recarregarFazendas();
    navegacao.goBack();
  }

  async function salvar() {
    setErro(null);
    const e: Partial<Record<keyof Form, string>> = {};
    const ha = lerNumero(f.areaHa);
    if (!f.nome.trim()) e.nome = particular ? 'Informe o nome (ex.: Particular).' : 'Informe o nome da fazenda.';
    if (f.sigla && !/^[A-Z]{2}$/.test(f.sigla)) e.sigla = 'Use 2 letras, ex.: FC.';
    if (f.areaHa.trim() && (ha === null || ha < 0)) e.areaHa = 'Número inválido. Use vírgula para decimais, ex.: 120,5';
    if (f.uf && f.uf.length !== 2) e.uf = '2 letras';
    if (f.doc.trim() && !cpfCnpjValido(f.doc)) e.doc = 'CPF ou CNPJ inválido. Confira os números.';
    if (f.razao.trim() && !f.doc.trim()) e.doc = 'Informe o CPF/CNPJ deste nome.';
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');

    // Não deixa ficar sem nenhuma fazenda ativa (o app voltaria ao primeiro acesso).
    if (id && !particular && !f.ativa && fazendas.filter((x) => x.id !== id && x.tipo === 'fazenda').length === 0) {
      return setErro('Esta é a única fazenda ativa. Cadastre ou ative outra antes de inativar esta.');
    }

    setSalvando(true);

    // Sigla repetida em outra fazenda confundiria os códigos dos lotes.
    if (f.sigla) {
      let q = supabase.from('fazendas').select('nome').eq('sigla', f.sigla);
      if (id) q = q.neq('id', id);
      const { data: iguais } = await q.limit(1);
      if (iguais && iguais.length) {
        setSalvando(false);
        setErros({ sigla: `A fazenda ${iguais[0].nome} já usa esta sigla.` });
        return setErro('Sigla repetida.');
      }
    }

    const registro = {
      nome: f.nome.trim(),
      sigla: f.sigla || null,
      razao_social: texto(f.razao),
      cpf_cnpj: texto(f.doc),
      inscricao_estadual: texto(f.ie),
      inscricao_defesa: texto(f.defesa),
      incra: texto(f.incra),
      itr: texto(f.itr),
      car: texto(f.car),
      area_total_ha: f.areaHa.trim() ? ha : null,
      cep: texto(f.cep),
      logradouro: texto(f.logradouro),
      numero: texto(f.numero),
      complemento: texto(f.complemento),
      bairro: texto(f.bairro),
      municipio: texto(f.municipio),
      uf: texto(f.uf.toUpperCase()),
      ativa: f.ativa,
      criador_id: f.criadorId,
      tipo: f.tipo,
    };
    // o Particular não tem sigla, dados rurais nem criador
    if (particular) Object.assign(registro, { sigla: null, inscricao_defesa: null, incra: null, itr: null, car: null, area_total_ha: null, criador_id: null });

    if (id) {
      const { error } = await supabase.from('fazendas').update(registro).eq('id', id);
      if (error) {
        setSalvando(false);
        return setErro(traduzirErro(error));
      }
      lembrarSigla(id, registro.sigla);
      await recarregarFazendas();
      setSalvando(false);
      navegacao.goBack();
      return;
    }

    const { data: prod, error: e1 } = await supabase.from('produtor').select('id').single();
    if (e1 || !prod) {
      setSalvando(false);
      return setErro(e1 ? traduzirErro(e1) : 'Produtor não encontrado.');
    }
    const { data: nova, error } = await supabase.from('fazendas').insert({ ...registro, produtor_id: prod.id }).select('id').single();
    if (error) {
      setSalvando(false);
      return setErro(traduzirErro(error));
    }
    if (nova) lembrarSigla(nova.id, registro.sigla);
    await recarregarFazendas();
    setSalvando(false);
    if (particular && nova) {
      // abre o Particular para cadastrar os sócios
      navegacao.replace('FazendaForm', { id: nova.id });
      return;
    }
    navegacao.replace('FazendaForm', {
      aviso: `Fazenda ${registro.nome} cadastrada. Para lançar nela, toque na caixinha dela na página de rosto.`,
    });
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  const abas = !id && <AbasCadastro aba={aba} aoMudar={setAba} />;

  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaFazendas />
      </Tela>
    );
  }

  const cadastradoHa = areasHa ? areasHa.mangas + areasHa.talhoes : 0;

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}

      {!id && (
        <Escolha
          rotulo="O que você está cadastrando"
          opcoes={[
            { valor: 'fazenda', rotulo: 'Fazenda' },
            { valor: 'particular', rotulo: 'Particular dos sócios' },
          ]}
          valor={[f.tipo]}
          aoMudar={(v) => muda('tipo', v[0] as Form['tipo'])}
        />
      )}
      {particular && (
        <Text style={estilos.nota}>
          Particular: para lançar as despesas e as receitas dos sócios. Não entra no resultado das fazendas: vai ao Patrimônio Líquido. Cada lançamento diz de qual sócio é. Só o Produtor, o Administrador e o Escritório veem. Pode haver um ou mais Particulares.
        </Text>
      )}
      <Secao titulo="Identificação" />
      <Campo rotulo={particular ? 'Nome *' : 'Nome da fazenda *'} value={f.nome} onChangeText={particular ? (t) => muda('nome', t) : mudarNome} autoCapitalize="words" placeholder={particular ? 'Ex.: Particular' : 'Ex.: Fazenda Cachoeira'} erro={erros.nome} />
      {particular && id && (
        <>
          <Secao titulo="Sócios" />
          {socios.length === 0 && <Text style={estilos.nota}>Nenhum sócio ainda. Cadastre abaixo: cada despesa ou receita do Particular diz de qual sócio é.</Text>}
          {socios.map((x) => (
            <View key={x.id} style={estilos.socio}>
              <Ionicons name="person-circle-outline" size={22} color={cores.primaria} />
              <Text style={estilos.socioNome}>{x.nome}</Text>
              <Pressable onPress={() => tirarSocio(x)} hitSlop={8} accessibilityLabel={`Tirar o sócio ${x.nome}`}>
                <Ionicons name="close-circle" size={22} color={cores.textoSuave} />
              </Pressable>
            </View>
          ))}
          <View style={estilos.linha}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Nome do sócio" value={novoSocio} onChangeText={setNovoSocio} autoCapitalize="words" placeholder="Ex.: Mário Cassani" />
            </View>
            <View style={{ paddingTop: 22 }}>
              <Botao titulo="Incluir" onPress={incluirSocio} carregando={incluindo} />
            </View>
          </View>
          {erroSocio && <Aviso tipo="erro" texto={erroSocio} />}
          <Text style={estilos.nota}>Tirar o sócio só o esconde das escolhas; os lançamentos dele ficam guardados.</Text>
        </>
      )}
      {!particular && (
      <>
      <Campo
        rotulo="Sigla"
        value={f.sigla}
        onChangeText={(t) => {
          setSiglaMexida(true);
          muda('sigla', t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2));
        }}
        autoCapitalize="characters"
        maxLength={2}
        ajuda="2 letras. Vai no código dos lotes, ex.: FC 001."
        erro={erros.sigla}
      />
      <Secao titulo="Dados fiscais (faturamento)" />
      <Text style={{ fontSize: 13, color: '#56625A', lineHeight: 19 }}>Em nome de quem saem as notas de compra e de venda desta fazenda. Só muda o faturamento: a movimentação continua toda de um dono só, com várias fazendas. Em branco, valem os dados do produtor.</Text>
      <Campo rotulo="Nome / razão social" value={f.razao} onChangeText={(t) => muda('razao', t)} autoCapitalize="words" />
      <Campo rotulo="CPF ou CNPJ" value={f.doc} onChangeText={(t) => muda('doc', mascaraCpfCnpj(t))} keyboardType="number-pad" maxLength={18} erro={erros.doc} />
      <Campo rotulo="Inscrição estadual de produtor" value={f.ie} onChangeText={(t) => muda('ie', t)} keyboardType="numbers-and-punctuation" />
      <Campo rotulo="Inscrição no órgão de defesa animal/sanitária" value={f.defesa} onChangeText={(t) => muda('defesa', t)} autoCapitalize="characters" autoCorrect={false} ajuda="O cadastro da propriedade no órgão estadual (no ES, o IDAF). É o que sai na GTA." />
      <Campo rotulo="INCRA nº" value={f.incra} onChangeText={(t) => muda('incra', t)} keyboardType="numbers-and-punctuation" ajuda="Código do imóvel rural no INCRA (o do CCIR)." />
      <Campo rotulo="ITR nº" value={f.itr} onChangeText={(t) => muda('itr', t)} keyboardType="numbers-and-punctuation" ajuda="Número do imóvel na Receita Federal (NIRF/CIB)." />
      <Campo rotulo="CAR nº" value={f.car} onChangeText={(t) => muda('car', t)} autoCapitalize="characters" autoCorrect={false} ajuda="Registro no Cadastro Ambiental Rural (começa pela UF, ex.: ES-...)." />
      <Campo
        rotulo="Área total (ha)"
        value={f.areaHa}
        onChangeText={(t) => muda('areaHa', t)}
        keyboardType="decimal-pad"
        placeholder="Ex.: 120,5"
        erro={erros.areaHa}
      />
      {id && areasHa && cadastradoHa > 0 && (
        <Text style={estilos.nota}>
          Cadastrado em áreas: {formatarNumero(areasHa.mangas, 2)} ha de mangas e {formatarNumero(areasHa.talhoes, 2)} ha de talhões
          ({formatarNumero(cadastradoHa, 2)} ha).
        </Text>
      )}

      <Secao titulo="Endereço" />
      <Campo rotulo="CEP" value={f.cep} onChangeText={(t) => muda('cep', mascaraCep(t))} keyboardType="number-pad" maxLength={9} />
      <Campo rotulo="Estrada, rodovia ou córrego" value={f.logradouro} onChangeText={(t) => muda('logradouro', t)} autoCapitalize="words" />
      <View style={estilos.linha}>
        <View style={{ width: 110 }}>
          <Campo rotulo="Número / km" value={f.numero} onChangeText={(t) => muda('numero', t)} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Complemento" value={f.complemento} onChangeText={(t) => muda('complemento', t)} />
        </View>
      </View>
      <Campo rotulo="Distrito ou localidade" value={f.bairro} onChangeText={(t) => muda('bairro', t)} autoCapitalize="words" />
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Município" value={f.municipio} onChangeText={(t) => muda('municipio', t)} autoCapitalize="words" />
        </View>
        <View style={{ width: 84 }}>
          <Campo
            rotulo="UF"
            value={f.uf}
            onChangeText={(t) => muda('uf', t.replace(/[^A-Za-z]/g, '').toUpperCase())}
            autoCapitalize="characters"
            maxLength={2}
            erro={erros.uf}
          />
        </View>
      </View>

      <Secao titulo="Gado registrado" />
      <SeletorLista
        rotulo="Criador dos nascimentos desta fazenda"
        valorId={f.criadorId}
        aoMudar={(v) => muda('criadorId', v)}
        carregar={carregarCriadores}
        permitirLimpar
        dicaBusca="Série ou nome"
        vazio="Nenhum criador com Série Alfabética. Informe a sua nos dados do Produtor."
      />
      <Text style={estilos.nota}>Os nascimentos registrados nesta fazenda recebem a Série Alfabética deste criador e o próximo RGN/RGD, que vira o brinco do animal.</Text>

      </>
      )}

      {id && (
        <>
          <Secao titulo="Situação" />
          <Interruptor
            rotulo="Ativa"
            descricao="Fazenda inativa some da troca de fazenda, mas todo o histórico dela fica guardado."
            valor={f.ativa}
            aoMudar={(v) => muda('ativa', v)}
          />
        </>
      )}

      <Botao titulo={id ? 'Salvar alterações' : particular ? 'Cadastrar o Particular' : 'Cadastrar fazenda'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo={particular ? 'Excluir este Particular' : 'Excluir fazenda'} tipo="perigo" onPress={excluir} />}
      {!id && particular && <Text style={estilos.nota}>Depois de cadastrar, a tela abre para incluir os sócios.</Text>}
      {id && <Text style={estilos.nota}>Fazendas não são excluídas, para não perder rebanho e lançamentos. Se não usar mais, desmarque "Ativa".</Text>}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 12 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  socio: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cores.borda },
  socioNome: { flex: 1, fontSize: tam.texto, color: cores.texto, fontWeight: '600' },
});
