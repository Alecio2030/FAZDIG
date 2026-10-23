import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import CampoData from '../../componentes/CampoData';
import CampoSugestao from '../../componentes/CampoSugestao';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import Interruptor from '../../componentes/Interruptor';
import EstruturaManga, { type EstruturaEd } from '../../componentes/EstruturaManga';
import { MANEJO_VAZIO, conferirManejo, manejoPreenchido, registroManejo } from '../../componentes/CamposManejo';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { lerNumero, numeroParaCampo } from '../../lib/formatos';
import { dataValida, doBanco, paraBanco } from '../../lib/datas';
import { CATEGORIAS, ORDEM_CATEGORIAS, TOPOGRAFIAS, sugestoesUso, type Categoria } from '../../lib/mangas';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';
import { NOMES_AREA } from '../../lib/areas';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaAreas from './ConsultaAreas';
import ItemMenu from '../../componentes/ItemMenu';

let contador = 0;
const novaChave = () => `e${Date.now()}_${contador++}`;

function novaEstrutura(categoria: Categoria): EstruturaEd {
  return { chave: novaChave(), categoria, tipo: '', descricao: '', cobertura: null, capKg: '', capAnimais: '', manejo: { ...MANEJO_VAZIO } };
}

export default function AreaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'AreaForm'>>();
  const { tipo, id } = params;
  const nomes = NOMES_AREA[tipo];
  const manga = tipo === 'manga';
  const { fazendaAtiva } = useSessao();

  const [aba, setAba] = useState<Aba>(params.aba ?? 'cadastrar');
  const [nome, setNome] = useState('');
  const [areaHa, setAreaHa] = useState('');
  const [perimetro, setPerimetro] = useState('');
  const [cultura, setCultura] = useState('');
  const [medidas, setMedidas] = useState('');
  const [ativa, setAtiva] = useState(true);
  // Manga: uso e produção
  const [uso, setUso] = useState('');
  const [gmd, setGmd] = useState('');
  const [biomassa, setBiomassa] = useState('');
  const [dataSolo, setDataSolo] = useState('');
  const [capAguas, setCapAguas] = useState('');
  const [capSeca, setCapSeca] = useState('');
  // Manga: manejo do pasto
  const [altEntrada, setAltEntrada] = useState('');
  const [altSaida, setAltSaida] = useState('');
  const [descanso, setDescanso] = useState('');
  const [topografia, setTopografia] = useState('');
  // Manga: estruturas
  const [estruturas, setEstruturas] = useState<EstruturaEd[]>([]);
  const removidas = useRef<string[]>([]);

  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? `Editar ${nomes.singular}` : nomes.plural });
  }, [navegacao, id, nomes]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const data = await consulta<any>(supabase.from('areas').select('*').eq('id', id).single());
        setNome(data.nome ?? '');
        setAreaHa(numeroParaCampo(data.area_ha));
        setPerimetro(numeroParaCampo(data.perimetro_m));
        setCultura(data.capim_cultura ?? '');
        setMedidas(data.medidas ?? '');
        setAtiva(data.ativa !== false);
        setUso(data.indicacao_uso ?? '');
        setGmd(numeroParaCampo(data.gmd_potencial));
        setBiomassa(numeroParaCampo(data.biomassa));
        setDataSolo(doBanco(data.data_analise_solo));
        setCapAguas(numeroParaCampo(data.capacidade_aguas));
        setCapSeca(numeroParaCampo(data.capacidade_seca));
        setAltEntrada(numeroParaCampo(data.altura_entrada_cm));
        setAltSaida(numeroParaCampo(data.altura_saida_cm));
        setDescanso(data.descanso_dias != null ? String(data.descanso_dias) : '');
        setTopografia(data.topografia ?? '');
        if (data.tipo === 'manga') {
          const est = await consulta<any[]>(supabase.from('manga_estruturas').select('*').eq('area_id', id).order('created_at'));
          const man = est.length
            ? await consulta<any[]>(
                supabase.from('manga_manejos').select('estrutura_id, data, produto, quantidade_kg, servico').eq('area_id', id).order('data', { ascending: false }).order('created_at', { ascending: false }),
              )
            : [];
          setEstruturas(
            est.map((e) => ({
              chave: novaChave(),
              id: e.id,
              categoria: e.categoria,
              tipo: e.tipo ?? '',
              descricao: e.descricao ?? '',
              cobertura: e.com_cobertura ?? null,
              capKg: numeroParaCampo(e.capacidade_kg),
              capAnimais: e.capacidade_animais != null ? String(e.capacidade_animais) : '',
              manejo: { ...MANEJO_VAZIO },
              ultimo: man.find((m) => m.estrutura_id === e.id) ?? null,
            })),
          );
        }
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [id]);

  function mudarEstrutura(chave: string, v: EstruturaEd) {
    setEstruturas((l) => l.map((e) => (e.chave === chave ? v : e)));
  }

  function removerEstrutura(e: EstruturaEd) {
    const tirar = () => {
      if (e.id) removidas.current.push(e.id);
      setEstruturas((l) => l.filter((x) => x.chave !== e.chave));
    };
    if (!e.id) return tirar();
    Alert.alert(`Remover ${CATEGORIAS[e.categoria].rotulo.toLowerCase()}`, 'O histórico dele (limpezas, abastecimentos, manutenções) também será apagado ao salvar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: tirar },
    ]);
  }

  async function salvar() {
    setErro(null);
    setErroNome(null);
    const erros: Record<string, string> = {};
    const lista: string[] = [];
    const falha = (campo: string, rotulo: string, msg: string) => {
      erros[campo] = msg;
      lista.push(`${rotulo}: ${msg}`);
    };
    // número decimal opcional, não negativo
    const num = (texto: string, campo: string, rotulo: string): number | null => {
      if (!texto.trim()) return null;
      const n = lerNumero(texto);
      if (n === null || n < 0) {
        falha(campo, rotulo, 'número inválido (use vírgula para decimais, ex.: 12,5)');
        return null;
      }
      return n;
    };

    if (!nome.trim()) {
      setErroNome('Informe o nome.');
      lista.push('Nome: informe o nome');
    }
    const ha = num(areaHa, 'area', 'Área');
    const per = num(perimetro, 'perimetro', 'Perímetro');
    const vGmd = manga ? num(gmd, 'gmd', 'GMD potencial') : null;
    const vBio = manga ? num(biomassa, 'biomassa', 'Biomassa') : null;
    const vAguas = manga ? num(capAguas, 'aguas', 'Capacidade nas águas') : null;
    const vSeca = manga ? num(capSeca, 'seca', 'Capacidade na seca') : null;
    const vEnt = manga ? num(altEntrada, 'entrada', 'Altura de entrada') : null;
    const vSai = manga ? num(altSaida, 'saida', 'Altura de saída') : null;
    if (manga && dataSolo.trim() && !dataValida(dataSolo)) falha('solo', 'Data da análise do solo', 'data inválida (use dd/mm/aaaa)');
    if (manga && vEnt !== null && vSai !== null && vSai >= vEnt) falha('saida', 'Altura de saída', 'deve ser menor que a de entrada');
    const errosEst: Record<string, string> = {};
    if (manga) {
      estruturas.forEach((e) => {
        const nomeE = CATEGORIAS[e.categoria].rotulo;
        const p = conferirManejo(e.manejo);
        if (p) {
          errosEst[e.chave] = p;
          lista.push(`${nomeE}: ${p}`);
        }
        if (e.capKg.trim() && (lerNumero(e.capKg) === null || lerNumero(e.capKg)! < 0)) {
          errosEst[e.chave] = errosEst[e.chave] ?? 'Capacidade inválida.';
          lista.push(`${nomeE}: capacidade inválida`);
        }
      });
    }
    setErrosCampo({ ...erros, ...Object.fromEntries(Object.entries(errosEst).map(([k, v]) => [`est_${k}`, v])) });
    setProblemas(lista);
    if (lista.length || !fazendaAtiva) return;

    setSalvando(true);
    try {
      // Evita dois nomes iguais na mesma fazenda.
      let q = supabase.from('areas').select('id').eq('fazenda_id', fazendaAtiva.id).eq('tipo', tipo).ilike('nome', nome.trim());
      if (id) q = q.neq('id', id);
      const iguais = await consulta<any[]>(q.limit(1));
      if (iguais.length) {
        setSalvando(false);
        setErroNome(`Já existe ${nomes.artigo} ${nomes.singular} com esse nome nesta fazenda.`);
        setProblemas([`Nome: já existe ${nomes.artigo} ${nomes.singular} com esse nome`]);
        return;
      }

      const registro = {
        nome: nome.trim(),
        area_ha: ha,
        perimetro_m: per,
        capim_cultura: cultura.trim() || null,
        medidas: medidas.trim() || null,
        ativa,
        indicacao_uso: manga ? uso.trim() || null : null,
        gmd_potencial: vGmd,
        biomassa: vBio,
        data_analise_solo: manga ? paraBanco(dataSolo) : null,
        capacidade_aguas: vAguas,
        capacidade_seca: vSeca,
        altura_entrada_cm: vEnt,
        altura_saida_cm: vSai,
        descanso_dias: manga && descanso ? Number(descanso) : null,
        topografia: manga ? topografia || null : null,
      };
      const areaId = id
        ? (await consulta<any>(supabase.from('areas').update(registro).eq('id', id).select('id').single())).id
        : (await consulta<any>(supabase.from('areas').insert({ ...registro, fazenda_id: fazendaAtiva.id, tipo }).select('id').single())).id;

      if (manga) {
        if (removidas.current.length) {
          await consulta(supabase.from('manga_estruturas').delete().in('id', removidas.current));
          removidas.current = [];
        }
        for (const e of estruturas) {
          const dados = {
            categoria: e.categoria,
            tipo: e.tipo.trim() || null,
            descricao: e.descricao.trim() || null,
            com_cobertura: e.categoria === 'cocho_sal' ? e.cobertura : null,
            capacidade_kg: e.categoria === 'cocho_sal' ? lerNumero(e.capKg) : null,
            capacidade_animais: e.categoria === 'cocho_alimentacao' && e.capAnimais ? Number(e.capAnimais) : null,
          };
          const estId = e.id
            ? (await consulta<any>(supabase.from('manga_estruturas').update(dados).eq('id', e.id).select('id').single())).id
            : (await consulta<any>(supabase.from('manga_estruturas').insert({ ...dados, area_id: areaId, fazenda_id: fazendaAtiva.id }).select('id').single())).id;
          if (manejoPreenchido(e.manejo)) {
            await consulta(
              supabase.from('manga_manejos').insert({ ...registroManejo(e.manejo, e.categoria), estrutura_id: estId, area_id: areaId, fazenda_id: fazendaAtiva.id }),
            );
          }
        }
      }
    } catch (e) {
      setSalvando(false);
      return setErro(traduzirErro(e));
    }
    setSalvando(false);
    if (id) navegacao.goBack();
    else
      navegacao.replace('AreaForm', {
        tipo,
        aviso: `${nomes.singular.charAt(0).toUpperCase()}${nomes.singular.slice(1)} "${nome.trim()}" cadastrad${nomes.artigo}. Pode cadastrar ${nomes.artigo === 'a' ? 'a próxima' : 'o próximo'}.`,
      });
  }

  function excluir() {
    Alert.alert(`Excluir ${nomes.singular}`, `Excluir ${nome}? Se já tiver lotes, pesagens ou lançamentos ligados, o sistema não deixa: nesse caso, desmarque "Ativ${nomes.artigo}".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          // V149: o centro de custo que nasceu com a área sai junto; se tiver lançamentos, diz quais
          const { error } = await supabase.rpc('excluir_area', { p_id: id! });
          if (error) setErro(traduzirErro(error));
          else {
            // Se veio da ficha da manga, volta direto para a lista (a ficha não existe mais).
            const rotas = navegacao.getState().routes;
            navegacao.pop(rotas[rotas.length - 2]?.name === 'MangaDetalhe' ? 2 : 1);
          }
        },
      },
    ]);
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  const abas = !id && (
    <>
      <AbasCadastro aba={aba} aoMudar={setAba} />
      {tipo === 'manga' && (
        <View style={{ borderRadius: tam.raio, overflow: 'hidden', borderWidth: 1, borderColor: cores.borda }}>
          <ItemMenu icone="navigate-circle-outline" titulo="Visão do Pasto" descricao="Mapa das mangas e ocupação: ocupado, descanso e vedado" onPress={() => navegacao.navigate('VisaoPasto')} />
        </View>
      )}
    </>
  );

  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaAreas tipo={tipo} />
      </Tela>
    );
  }

  const dupla = (a: React.ReactNode, b: React.ReactNode) => (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ flex: 1 }}>{a}</View>
      <View style={{ flex: 1 }}>{b}</View>
    </View>
  );

  return (
    <Tela>
      {abas}
      {!id && params.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!id && fazendaAtiva && !params.aviso && <Aviso tipo="info" texto={`Será cadastrad${nomes.artigo} na fazenda ${fazendaAtiva.nome}.`} />}

      <Campo
        rotulo="Nome *"
        value={nome}
        onChangeText={setNome}
        autoCapitalize="sentences"
        placeholder={manga ? 'Ex.: Manga do Açude' : 'Ex.: Talhão 3 – Baixada'}
        erro={erroNome}
      />
      {dupla(
        <Campo rotulo="Área (ha)" value={areaHa} onChangeText={setAreaHa} keyboardType="decimal-pad" placeholder="0,00" erro={errosCampo.area} />,
        <Campo rotulo="Perímetro (m)" value={perimetro} onChangeText={setPerimetro} keyboardType="decimal-pad" placeholder="0" erro={errosCampo.perimetro} />,
      )}
      <Campo
        rotulo={nomes.cultura}
        value={cultura}
        onChangeText={setCultura}
        autoCapitalize="sentences"
        placeholder={manga ? 'Ex.: Braquiária, Mombaça' : 'Ex.: Café conilon'}
      />

      {manga && (
        <>
          <Secao titulo="Uso e produção" />
          <CampoSugestao rotulo="Indicação de uso" valor={uso} aoMudar={setUso} carregar={sugestoesUso} placeholder="Ex.: Recria" />
          {dupla(
            <Campo rotulo="GMD potencial (kg/dia)" value={gmd} onChangeText={setGmd} keyboardType="decimal-pad" placeholder="0,000" erro={errosCampo.gmd} />,
            <Campo rotulo="Biomassa (kg MS/ha)" value={biomassa} onChangeText={setBiomassa} keyboardType="decimal-pad" placeholder="0" erro={errosCampo.biomassa} />,
          )}
          <CampoData rotulo="Data da análise do solo" valor={dataSolo} aoMudar={setDataSolo} erro={errosCampo.solo} />
          {dupla(
            <Campo rotulo="Capacidade águas (UA/ha)" value={capAguas} onChangeText={setCapAguas} keyboardType="decimal-pad" placeholder="0,00" erro={errosCampo.aguas} />,
            <Campo rotulo="Capacidade seca (UA/ha)" value={capSeca} onChangeText={setCapSeca} keyboardType="decimal-pad" placeholder="0,00" erro={errosCampo.seca} />,
          )}

          <Secao titulo="Manejo do pasto" />
          {dupla(
            <Campo rotulo="Altura de entrada (cm)" value={altEntrada} onChangeText={setAltEntrada} keyboardType="decimal-pad" placeholder="0" erro={errosCampo.entrada} />,
            <Campo rotulo="Altura de saída (cm)" value={altSaida} onChangeText={setAltSaida} keyboardType="decimal-pad" placeholder="0" erro={errosCampo.saida} />,
          )}
          <Campo
            rotulo="Período de descanso (dias)"
            value={descanso}
            onChangeText={(t) => setDescanso(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="0"
          />
          <Escolha
            rotulo="Topografia"
            opcoes={TOPOGRAFIAS.map((t) => ({ valor: t, rotulo: t }))}
            valor={topografia ? [topografia] : []}
            aoMudar={(v) => setTopografia(v[0] === topografia ? '' : v[0])}
          />

          <Secao titulo="Bebedouros, cochos e cercas" />
          {estruturas.length === 0 && <Text style={{ fontSize: tam.pequeno + 1, color: cores.textoSuave }}>Nenhum cadastrado. Toque abaixo para incluir; pode ter mais de um de cada.</Text>}
          {estruturas.map((e) => (
            <EstruturaManga
              key={e.chave}
              valor={e}
              aoMudar={(v) => mudarEstrutura(e.chave, v)}
              aoRemover={() => removerEstrutura(e)}
              erroManejo={errosCampo[`est_${e.chave}`]}
            />
          ))}
          <Escolha
            rotulo="Incluir"
            opcoes={ORDEM_CATEGORIAS.map((c) => ({ valor: c, rotulo: `+ ${CATEGORIAS[c].rotulo}` }))}
            valor={[]}
            aoMudar={(v) => setEstruturas((l) => [...l, novaEstrutura(v[0] as Categoria)])}
          />
        </>
      )}

      <Campo
        rotulo="Medidas e observações"
        value={medidas}
        onChangeText={setMedidas}
        multiline
        placeholder="Limites, divisas, aguadas…"
        style={{ minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }}
      />
      {id && <Interruptor rotulo={`Ativ${nomes.artigo}`} descricao="Inativas não aparecem para escolher em novos lançamentos." valor={ativa} aoMudar={setAtiva} />}

      {problemas.length > 0 && <Aviso tipo="erro" texto={`Falta corrigir:\n• ${problemas.join('\n• ')}`} />}
      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo={`Excluir ${nomes.singular}`} tipo="perigo" onPress={excluir} />}
    </Tela>
  );
}
