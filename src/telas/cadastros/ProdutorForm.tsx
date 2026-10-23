import { useSessao } from '../../contexto/SessaoContext';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Escolha from '../../componentes/Escolha';
import CampoData from '../../componentes/CampoData';
import { dataValida, doBanco, hojeBanco, paraBanco } from '../../lib/datas';
import { listaCompradores } from '../../lib/documentos';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { cpfCnpjValido, formatarMoeda, mascaraCpfCnpj, mascaraTelefone, somenteDigitos } from '../../lib/formatos';
import { montarNome } from '../../lib/genealogia';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

type DocEdit = { chave: string; id: string | null; cpf_cnpj: string; nome: string; lanca: boolean; creditos: string[]; principal: boolean };
let contDoc = 0;
const chaveDoc = () => `d${Date.now()}_${contDoc++}`;

/** Dados do produtor (dono de todas as fazendas). Existe um só; aqui só se altera. */
export default function ProdutorForm() {
  const navegacao = useNavigation<NavPilha>();
  const { recarregarGrupo } = useSessao();
  const [idProdutor, setIdProdutor] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  // V127: nome do grupo (ex.: GRUPO CASSANI), em destaque na página de rosto
  const [grupo, setGrupo] = useState('');
  const [doc, setDoc] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [docs, setDocs] = useState<DocEdit[]>([]);
  const [docsApagados, setDocsApagados] = useState<string[]>([]);
  // Criador de gado registrado (o próprio produtor)
  const [criadorId, setCriadorId] = useState<string | null>(null);
  const [serie, setSerie] = useState('');
  const [sufixo, setSufixo] = useState('');
  const [ultimo, setUltimo] = useState('0');
    const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  // início do sistema: o que é anterior a esta data entra como saldo de abertura (contrapartida no Patrimônio Líquido)
  const [inicioGravado, setInicioGravado] = useState<string | null>(null);
  const [inicio, setInicio] = useState('');
  const [previa, setPrevia] = useState<{ titulos: number; titulos_valor: number; financiamentos: number; financiamentos_saldo: number; baixas: number; baixas_valor: number } | null>(null);
  const [inicioOcupado, setInicioOcupado] = useState(false);
  const [inicioErro, setInicioErro] = useState<string | null>(null);
  const [inicioAviso, setInicioAviso] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('produtor').select('*, criador:criador_id ( id, sui, sufixo, rgn_ultimo )').maybeSingle();
      if (error) setErro(traduzirErro(error));
      else if (data) {
        const d = data as any;
        setIdProdutor(d.id);
        setNome(d.nome ?? '');
        setGrupo(d.nome_grupo ?? '');
        setDoc(d.cpf_cnpj ?? '');
        setEmail(d.email ?? '');
        setTelefone(d.telefone ?? '');
        setInicioGravado(d.data_inicio ?? null);
        setInicio(d.data_inicio ? doBanco(d.data_inicio) : '');

        const c = Array.isArray(d.criador) ? d.criador[0] : d.criador;
        if (c) {
          setCriadorId(c.id);
          setSerie(c.sui ?? '');
          setSufixo(c.sufixo ?? '');
          setUltimo(String(c.rgn_ultimo ?? 0));
        }
      }
      const lista = await listaCompradores().catch(() => []);
      setDocs(
        lista.map((x) => ({
          chave: chaveDoc(),
          id: x.id,
          cpf_cnpj: x.cpf_cnpj,
          nome: x.nome,
          lanca: x.lanca,
          creditos: [x.credito_icms && 'icms', x.credito_ipi && 'ipi', x.credito_pis_cofins && 'pis_cofins'].filter(Boolean) as string[],
          principal: x.principal,
        })),
      );
      setCarregando(false);
    })();
  }, []);

  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    if (!nome.trim()) e.nome = 'Informe o nome do produtor.';
    if (!doc.trim()) e.doc = 'Informe o CPF ou CNPJ.';
    const outros = docs.filter((x) => !x.principal);
    if (outros.some((x) => !cpfCnpjValido(x.cpf_cnpj))) e.outros = 'Confira os CPF/CNPJ dos documentos de compra.';
    else if (outros.some((x) => !x.nome.trim())) e.outros = 'Dê um nome a cada documento de compra.';
    else if (new Set([somenteDigitos(doc), ...outros.map((x) => somenteDigitos(x.cpf_cnpj))]).size !== outros.length + 1) e.outros = 'Há documento de compra repetido.';
    else if (!cpfCnpjValido(doc)) e.doc = 'CPF ou CNPJ inválido. Confira os números.';
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'E-mail inválido.';
    if (serie && !/^[A-Z]{2,5}$/.test(serie)) e.serie = 'A Série Alfabética tem de 2 a 5 letras, sem números (ex.: SCS).';
    if (!serie && sufixo.trim()) e.serie = 'Informe a Série Alfabética junto com o sufixo.';
    setErros(e);
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');
    if (!idProdutor) return;

    setSalvando(true);
    try {
      // Série já usada por outro criador?
      let novoCriador = criadorId;
      if (serie) {
        let q = supabase.from('pessoas').select('nome').eq('sui', serie);
        if (criadorId) q = q.neq('id', criadorId);
        const mesma = await consulta<any[]>(q.limit(1));
        if (mesma.length) {
          setSalvando(false);
          setErros({ serie: `A Série ${serie} já é de ${mesma[0].nome} (Mais › Pessoas).` });
          return setErro('Série Alfabética repetida.');
        }
        const dadosCriador = {
          nome: nome.trim(),
          cpf_cnpj: doc.trim(),
          tipo_pessoa: somenteDigitos(doc).length > 11 ? 'J' : 'F',
          sui: serie,
          sufixo: sufixo.trim() || null,
          rgn_ultimo: Number(ultimo || 0),
        };
        if (criadorId) {
          const atual = await consulta<any>(supabase.from('pessoas').select('tipos').eq('id', criadorId).single());
          const tipos = Array.from(new Set([...(atual.tipos ?? []), 'criador']));
          await consulta(supabase.from('pessoas').update({ ...dadosCriador, tipos }).eq('id', criadorId));
        } else {
          const nova = await consulta<any>(supabase.from('pessoas').insert({ ...dadosCriador, tipos: ['criador'] }).select('id').single());
          novoCriador = nova.id;
        }
      }
      await consulta(
        supabase
          .from('produtor')
          .update({ nome: nome.trim(), cpf_cnpj: doc.trim(), email: email.trim().toLowerCase() || null, telefone: telefone.trim() || null, criador_id: novoCriador })
          .eq('id', idProdutor),
      );
      // nome do grupo à parte: se o banco ainda não tem a coluna (arquivo da V127), o resto grava igual
      const { error: erroGrupo } = await supabase.from('produtor').update({ nome_grupo: grupo.trim() || null }).eq('id', idProdutor);
      if (erroGrupo && grupo.trim()) throw new Error(/nome_grupo/i.test(erroGrupo.message) ? 'O nome do grupo precisa do arquivo do banco da V127 (Supabase › SQL Editor). Os outros dados foram gravados.' : erroGrupo.message);
      // V132: o alto de todas as telas mostra o nome do Grupo; atualiza na hora
      recarregarGrupo().catch(() => undefined);
      // Documentos de compra: o principal é o do produtor; os outros como foram editados.
      const linha = (x: DocEdit) => ({
        cpf_cnpj: x.principal ? doc.trim() : mascaraCpfCnpj(x.cpf_cnpj),
        nome: x.principal ? nome.trim() : x.nome.trim(),
        lanca: true,
        credito_icms: x.creditos.includes('icms'),
        credito_ipi: x.creditos.includes('ipi'),
        credito_pis_cofins: x.creditos.includes('pis_cofins'),
        principal: x.principal,
      });
      for (const idDoc of docsApagados) await consulta(supabase.from('documentos_comprador').delete().eq('id', idDoc));
      const lista = docs.some((x) => x.principal) ? docs : [{ chave: chaveDoc(), id: null, cpf_cnpj: doc, nome, lanca: true, creditos: [], principal: true }, ...docs];
      for (const x of lista) {
        if (x.id) await consulta(supabase.from('documentos_comprador').update(linha(x)).eq('id', x.id));
        else await consulta(supabase.from('documentos_comprador').insert(linha(x)));
      }
      // Fazendas ainda sem criador passam a usar o do produtor nos nascimentos.
      if (novoCriador) await supabase.from('fazendas').update({ criador_id: novoCriador }).is('criador_id', null);
    } catch (err) {
      setSalvando(false);
      return setErro(traduzirErro(err));
    }
    setSalvando(false);
    navegacao.goBack();
  }

  async function conferirInicio() {
    setInicioErro(null);
    setInicioAviso(null);
    setPrevia(null);
    if (!dataValida(inicio)) return setInicioErro('Informe a data em que você começa a operar o sistema.');
    const iso = paraBanco(inicio)!;
    if (iso > hojeBanco()) return setInicioErro('O início do sistema não pode ser uma data futura.');
    setInicioOcupado(true);
    const { data, error } = await supabase.rpc('previa_inicio_sistema', { p_data: iso });
    setInicioOcupado(false);
    if (error) return setInicioErro(traduzirErro(error));
    setPrevia(data as any);
  }

  async function gravarInicio(iso: string | null) {
    setInicioErro(null);
    setInicioOcupado(true);
    const { error } = await supabase.rpc('definir_inicio_sistema', { p_data: iso });
    setInicioOcupado(false);
    if (error) return setInicioErro(traduzirErro(error));
    setInicioGravado(iso);
    setPrevia(null);
    if (!iso) setInicio('');
    setInicioAviso(iso ? `Início do sistema gravado: ${doBanco(iso)}. O que é anterior a essa data ficou como saldo de abertura.` : 'Início do sistema retirado. Os lançamentos voltaram para as contas de origem.');
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  return (
    <Tela>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Aviso tipo="info" texto="O produtor é o dono de todas as fazendas do sistema. Só o dono pode alterar estes dados." />
      <Campo rotulo="Nome ou razão social *" value={nome} onChangeText={setNome} autoCapitalize="words" erro={erros.nome} />
      <Campo
        rotulo="Nome do grupo (página de rosto)"
        value={grupo}
        onChangeText={setGrupo}
        autoCapitalize="characters"
        placeholder="Ex.: GRUPO CASSANI"
        ajuda="Aparece em letras grandes na página de rosto, antes de abrir o sistema. Em branco, aparece o nome do produtor."
      />
      <Campo rotulo="CPF ou CNPJ *" value={doc} onChangeText={(t) => setDoc(mascaraCpfCnpj(t))} keyboardType="number-pad" maxLength={18} erro={erros.doc} />
      <Campo rotulo="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} erro={erros.email} />
      <Campo rotulo="Telefone / WhatsApp" value={telefone} onChangeText={(t) => setTelefone(mascaraTelefone(t))} keyboardType="phone-pad" />

      <Secao titulo="Início do sistema (saldos de abertura)" />
      <Text style={estilos.nota}>
        Informe a data em que você começa a operar o sistema de verdade. Tudo o que tiver data anterior (financiamentos já contratados, estoques, contas a receber e a pagar que já existiam) entra como saldo de abertura: a contrapartida vai para o Patrimônio Líquido e não passa pelo resultado nem pelo caixa e bancos. Você só informa esta data uma vez; o sistema classifica sozinho pela data de cada lançamento.
      </Text>
      {inicioAviso && <Aviso tipo="sucesso" texto={inicioAviso} />}
      {inicioErro && <Aviso tipo="erro" texto={inicioErro} />}
      <CampoData
        rotulo="Início do sistema"
        valor={inicio}
        aoMudar={(t) => {
          setInicio(t);
          setPrevia(null);
        }}
      />
      <Text style={estilos.nota}>{inicioGravado ? `Em vigor: ${doBanco(inicioGravado)}.` : 'Ainda não informado: por enquanto nada é tratado como saldo de abertura.'}</Text>
      {previa && dataValida(inicio) && (
        <View style={estilos.doc}>
          <Text style={estilos.docTitulo}>Com o início em {inicio}</Text>
          <Text style={estilos.nota}>• {previa.financiamentos} {previa.financiamentos === 1 ? 'financiamento contratado' : 'financiamentos contratados'} antes: saldo devedor de {formatarMoeda(Number(previa.financiamentos_saldo))} com a contrapartida no Patrimônio Líquido. As parcelas continuam no contas a pagar.</Text>
          <Text style={estilos.nota}>• {previa.titulos} {previa.titulos === 1 ? 'título' : 'títulos'} a pagar ou a receber de antes (fora os de financiamento), somando {formatarMoeda(Number(previa.titulos_valor))}: a contrapartida passa para o Patrimônio Líquido.</Text>
          <Text style={estilos.nota}>• {previa.baixas} {previa.baixas === 1 ? 'pagamento ou recebimento' : 'pagamentos ou recebimentos'} de antes, somando {formatarMoeda(Number(previa.baixas_valor))}: {previa.baixas === 1 ? 'deixa' : 'deixam'} de contar no saldo do caixa e dos bancos (inclusive liberação de financiamento antigo lançada no banco).</Text>
          <Text style={estilos.nota}>Nada é apagado. Se trocar a data depois, o sistema reclassifica tudo de novo.</Text>
          <Botao titulo="Confirmar esta data" onPress={() => gravarInicio(paraBanco(inicio))} carregando={inicioOcupado} />
        </View>
      )}
      {!previa && <Botao titulo="Conferir o que muda" tipo="secundario" onPress={conferirInicio} carregando={inicioOcupado} />}
      {inicioGravado && !previa && <Botao titulo="Retirar o início do sistema" tipo="texto" onPress={() => gravarInicio(null)} />}

      <Secao titulo="Documentos de compra" />
      <Text style={estilos.nota}>
        Em nome de quem as notas de compra vêm e quais créditos fiscais cada um aproveita (regra atual). Na leitura das notas, esses documentos são o comprador: nunca viram fornecedor.
      </Text>
      {docs.map((x) => (
        <View key={x.chave} style={estilos.doc}>
          <View style={estilos.docTopo}>
            <Text style={estilos.docTitulo}>{x.principal ? `Produtor · ${doc || 'CPF/CNPJ acima'}` : x.nome || 'Outro documento'}</Text>
            {!x.principal && (
              <Pressable
                hitSlop={10}
                accessibilityLabel="Tirar documento"
                onPress={() => {
                  if (x.id) setDocsApagados((l) => [...l, x.id!]);
                  setDocs((l) => l.filter((y) => y.chave !== x.chave));
                }}
              >
                <Ionicons name="close-circle" size={24} color={cores.textoSuave} />
              </Pressable>
            )}
          </View>
          {!x.principal && (
            <>
              <Campo rotulo="CPF ou CNPJ" value={x.cpf_cnpj} onChangeText={(t) => setDocs((l) => l.map((y) => (y.chave === x.chave ? { ...y, cpf_cnpj: mascaraCpfCnpj(t) } : y)))} keyboardType="number-pad" maxLength={18} />
              <Campo rotulo="Nome" value={x.nome} onChangeText={(t) => setDocs((l) => l.map((y) => (y.chave === x.chave ? { ...y, nome: t } : y)))} autoCapitalize="sentences" placeholder="Ex.: Filial" />
            </>
          )}
          <Escolha
            rotulo="Créditos que aproveita"
            multiplo
            opcoes={[
              { valor: 'icms', rotulo: 'ICMS' },
              { valor: 'ipi', rotulo: 'IPI' },
              { valor: 'pis_cofins', rotulo: 'PIS/COFINS' },
            ]}
            valor={x.creditos}
            aoMudar={(v) => setDocs((l) => l.map((y) => (y.chave === x.chave ? { ...y, creditos: v } : y)))}
          />
        </View>
      ))}
      <Text style={estilos.link} onPress={() => setDocs((l) => [...l, { chave: chaveDoc(), id: null, cpf_cnpj: '', nome: '', lanca: true, creditos: [], principal: false }])}>
        + Outro documento de compra
      </Text>
      {erros.outros && <Text style={estilos.erro}>{erros.outros}</Text>}

      <Secao titulo="Criador de gado registrado" />
      <Aviso tipo="info" texto="Se você registra animais na associação da raça, informe sua Série Alfabética e o Sufixo/Afixo. Eles vêm prontos no cadastro dos animais com controle genealógico." />
      <Campo
        rotulo="Série Alfabética"
        value={serie}
        onChangeText={(t) => setSerie(t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5))}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={5}
        placeholder="Ex.: SCS"
        erro={erros.serie}
      />
      <Campo rotulo="Sufixo/Afixo" value={sufixo} onChangeText={setSufixo} autoCapitalize="words" placeholder="Ex.: da Constantino" />
      <Campo
        rotulo="Último RGN/RGD usado"
        value={ultimo}
        onChangeText={(t) => setUltimo(t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9))}
        keyboardType="number-pad"
        ajuda="Se já tem animais registrados, informe o último número; o sistema segue daí. Se está começando, deixe 0."
      />
      {serie ? <Aviso tipo="sucesso" texto={`Próximo registro: ${serie}${Number(ultimo || 0) + 1} ${montarNome('Maria', sufixo)}`} /> : null}

      <Botao titulo="Salvar alterações" onPress={salvar} carregando={salvando} />
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  doc: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 10 },
  docTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  docTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura, flexShrink: 1 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  erro: { fontSize: tam.pequeno, color: cores.erro },
});
