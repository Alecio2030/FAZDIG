import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Interruptor from '../../componentes/Interruptor';
import Caixinha from '../../componentes/Caixinha';
import Secao from '../../componentes/Secao';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { MODULOS_SISTEMA, NIVEIS, PERFIS, PERFIS_ADMIN_SISTEMA, TODOS_MODULOS, agruparPorPessoa, eDono, situacaoTexto, type LinhaAcesso, type Pessoa } from '../../lib/acessos';
import ConsultaUsuarios from './ConsultaUsuarios';
import DefinirSenha from '../../componentes/DefinirSenha';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

export default function UsuarioForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'UsuarioForm'>>();
  const emailEditado = params?.email;
  const { fazendaAtiva, recarregarAgendas } = useSessao();
  const souDono = eDono(fazendaAtiva?.perfil);
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState<string[]>(['funcionario']);
  const [nivel, setNivel] = useState<string[]>(['lancamento']);
  const [fazendas, setFazendas] = useState<string[]>([]);
  const [opcoesFazenda, setOpcoesFazenda] = useState<{ valor: string; rotulo: string }[]>([]);
  const [liberado, setLiberado] = useState(true);
  // vê a aba Financeiro, os saldos e as contas a pagar e a receber (o padrão segue o perfil; dá para mudar)
  const [financeiro, setFinanceiro] = useState(false);
  // V127: caixinhas das agendas que a pessoa abre: 'produtor', 'admin', 'escritorio', 'todas' (todas as fazendas) ou 'sua' (só as fazendas dela).
  // Enquanto o produtor não mexe, seguem o perfil.
  const [agendas, setAgendas] = useState<string[]>([]);
  const [agendasMexidas, setAgendasMexidas] = useState(false);
  // V127: módulos do sistema que abre (Pecuária, Agrícola, Frota, Mais); o Financeiro é a caixinha "financeiro"
  const [modulos, setModulos] = useState<string[]>(TODOS_MODULOS);
  const [modulosMexidos, setModulosMexidos] = useState(false);
  const [avisoBanco, setAvisoBanco] = useState<string | null>(null);
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  // administrador do sistema: é o único que cadastra o Produtor (dono)
  const [adminSistema, setAdminSistema] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navegacao.setOptions({ title: emailEditado ? 'Acesso' : 'Usuários e acessos' });
  }, [navegacao, emailEditado]);

  useEffect(() => {
    if (!souDono) return setCarregando(false);
    (async () => {
      try {
        const { data: adm } = await supabase.rpc('e_admin_sistema');
        const souAdm = adm === true;
        setAdminSistema(souAdm);
        const fz = await consulta<any[]>(supabase.from('fazendas').select('id, nome').eq('ativa', true).neq('tipo', 'particular').order('nome'));
        setOpcoesFazenda(fz.map((f) => ({ valor: f.id, rotulo: f.nome })));
        if (!emailEditado) {
          if (fz.length === 1) setFazendas([fz[0].id]);
        } else {
          const linhas = await consulta<LinhaAcesso[]>(supabase.rpc('listar_acessos'));
          const p = agruparPorPessoa(linhas).find((x) => x.email === emailEditado.toLowerCase()) ?? null;
          setPessoa(p);
          if (p) {
            setNome(p.nome ?? '');
            setEmail(p.email);
            if (p.perfil !== 'dono' || souAdm) setPerfil([p.perfil]);
            setNivel([p.nivel]);
            setFinanceiro(p.financeiro);
            setFazendas(p.fazendaIds);
            setLiberado(p.situacao !== 'bloqueado');
            const ag = await consulta<{ agenda: string; fazenda_id: string | null }[]>(supabase.rpc('agendas_do_participante', { p_email: p.email }));
            setAgendas(caixinhasDasAgendas(ag, p.fazendaIds, fz.map((f) => f.id)));
            setAgendasMexidas(true);
            setModulos(p.modulos ?? TODOS_MODULOS);
            setModulosMexidos(true);
          }
        }
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setCarregando(false);
    })();
  }, [emailEditado, souDono]);

  // Sugestão pelo perfil: gerente abre a agenda da fazenda dele; escritório, a do Escritório e as de todas as fazendas; funcionário, nenhuma.
  useEffect(() => {
    if (agendasMexidas) return;
    setAgendas(perfil[0] === 'gerente' ? ['sua'] : perfil[0] === 'escritorio' ? ['escritorio', 'todas'] : []);
  }, [perfil, agendasMexidas]);
  // Módulos: gerente e escritório abrem todos; funcionário, os do campo (sem os cadastros do Mais).
  useEffect(() => {
    if (modulosMexidos) return;
    setModulos(perfil[0] === 'funcionario' ? ['pecuario', 'agricola', 'frota'] : TODOS_MODULOS);
  }, [perfil, modulosMexidos]);

  function marcarAgenda(chave: string, marcado: boolean) {
    setAgendasMexidas(true);
    setAgendas((l) => {
      let nova = marcado ? [...l.filter((x) => x !== chave), chave] : l.filter((x) => x !== chave);
      // "De todas as fazendas" e "Só da sua fazenda" não vão juntas
      if (marcado && chave === 'todas') nova = nova.filter((x) => x !== 'sua');
      if (marcado && chave === 'sua') nova = nova.filter((x) => x !== 'todas');
      return nova;
    });
  }
  function marcarModulo(chave: string, marcado: boolean) {
    setModulosMexidos(true);
    setModulos((l) => (marcado ? [...l.filter((x) => x !== chave), chave] : l.filter((x) => x !== chave)));
  }

  // Gerente costuma ter acesso completo; funcionário, só lançamentos. Dá para mudar.
  function mudarPerfil(v: string[]) {
    setPerfil(v);
    setNivel([v[0] === 'gerente' || v[0] === 'admin' || v[0] === 'dono' ? 'completo' : 'lancamento']);
    // Produtor, Escritório e Administrador veem o Financeiro; gerente e funcionário, não (dá para mudar na chave abaixo).
    setFinanceiro(v[0] === 'escritorio' || v[0] === 'admin' || v[0] === 'dono');
    // o Produtor é dono de todas as fazendas
    if (v[0] === 'dono') setFazendas(opcoesFazenda.map((f) => f.valor));
  }

  const nomesSuas = opcoesFazenda.filter((f) => fazendas.includes(f.valor)).map((f) => f.rotulo);

  const dono = perfil[0] === 'dono';
  const admin = perfil[0] === 'admin' || dono;
  const fazendasSalvar = dono ? opcoesFazenda.map((f) => f.valor) : fazendas;

  async function salvar() {
    setErro(null);
    const e: Record<string, string> = {};
    const mail = email.trim().toLowerCase();
    if (!nome.trim()) e.nome = 'Informe o nome da pessoa.';
    if (!/^\S+@\S+\.\S+$/.test(mail)) e.email = 'E-mail inválido.';
    if (liberado && fazendasSalvar.length === 0) e.fazendas = 'Marque pelo menos uma fazenda.';
    setErros(e);
    if (dono && e.fazendas) return setErro('Cadastre primeiro uma fazenda (Cadastros › Fazendas): o Produtor fica dono de todas.');
    if (Object.keys(e).length) return setErro('Confira os campos marcados em vermelho.');

    setSalvando(true);
    // agendas marcadas: as fixas (Produtor, Administrador, Escritório), todas as fazendas ou só as fazendas da pessoa
    const listaAgendas = dono || admin
      ? []
      : [
          ...agendas.filter((a) => ['produtor', 'admin', 'escritorio'].includes(a)).map((a) => ({ agenda: a })),
          ...(agendas.includes('todas') ? [{ agenda: 'todas_fazendas' }] : []),
          ...(agendas.includes('sua') ? fazendasSalvar.map((f) => ({ agenda: 'fazenda', fazenda_id: f })) : []),
        ];
    const base = {
      p_email: mail,
      p_nome: nome.trim(),
      p_perfil: perfil[0],
      p_nivel: admin ? 'completo' : nivel[0],
      p_fazendas: liberado ? fazendasSalvar : [],
      p_ativo: liberado,
      p_financeiro: admin || financeiro,
    };
    let { data, error } = await supabase.rpc('salvar_acesso', { ...base, p_agendas: listaAgendas, p_modulos: admin ? null : modulos });
    // banco ainda sem o arquivo da V127: grava como antes (sem os módulos e só as agendas antigas)
    if (error && /p_modulos|salvar_acesso/i.test(error.message ?? '') && /function|schema cache/i.test(error.message ?? '')) {
      const antigas = dono || admin
        ? []
        : [
            ...(agendas.includes('escritorio') ? [{ agenda: 'escritorio' }] : []),
            ...(agendas.includes('todas') ? opcoesFazenda.map((f) => f.valor) : agendas.includes('sua') ? fazendasSalvar : []).map((f) => ({ agenda: 'fazenda', fazenda_id: f })),
          ];
      ({ data, error } = await supabase.rpc('salvar_acesso', { ...base, p_agendas: antigas }));
      if (!error) setAvisoBanco('Gravado sem os módulos e sem as agendas do Produtor e do Administrador: falta rodar o arquivo do banco da V127 no Supabase.');
    }
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    recarregarAgendas();

    const situacao = (data as { situacao: string })?.situacao;
    if (emailEditado) {
      navegacao.goBack();
      return;
    }
    navegacao.replace('UsuarioForm', {
      aviso: dono
        ? situacao === 'liberado'
          ? `${nome.trim()} cadastrado como Produtor (dono) de todas as fazendas. Na próxima vez que entrar, já libera os demais usuários em Mais › Usuários e acessos.`
          : `${nome.trim()} cadastrado como Produtor (dono) com o e-mail ${mail}. Peça para ele entrar no app e tocar em "Criar conta" usando exatamente este e-mail. Depois ele mesmo libera os demais usuários em Mais › Usuários e acessos.`
        : situacao === 'liberado'
          ? `Acesso de ${nome.trim()} liberado. Na próxima vez que entrar no app, já vai ver as fazendas.`
          : `Acesso de ${nome.trim()} liberado para ${mail}. Peça para a pessoa entrar no app e tocar em "Criar conta" usando exatamente este e-mail. O acesso é liberado sozinho no primeiro login.`,
    });
  }

  function removerPendente() {
    Alert.alert('Cancelar liberação', `A pessoa ainda não criou a conta. Cancelar a liberação de ${email}?`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar liberação',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('salvar_acesso', { p_email: email, p_nome: nome, p_perfil: perfil[0], p_nivel: nivel[0], p_fazendas: [], p_ativo: false });
          if (error) setErro(traduzirErro(error));
          else navegacao.goBack();
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

  if (!souDono) {
    return (
      <Tela>
        <Aviso tipo="info" texto="Só o dono ou o administrador libera e altera acessos. Se precisar de acesso a outra fazenda, fale com um deles." />
      </Tela>
    );
  }

  const abas = !emailEditado && <AbasCadastro aba={aba} aoMudar={setAba} />;

  if (!emailEditado && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaUsuarios />
      </Tela>
    );
  }

  // O próprio dono (ou outro dono) não é alterado por aqui.
  if (pessoa && (pessoa.souEu || (pessoa.perfil === 'dono' && !adminSistema))) {
    return (
      <Tela>
        <Text style={estilos.nome}>{pessoa.nome ?? pessoa.email}</Text>
        <Text style={estilos.nota}>{pessoa.email}</Text>
        <Aviso tipo="info" texto={pessoa.souEu ? `Você, com acesso a: ${pessoa.fazendas.join(', ')}. O seu próprio acesso não é alterado por aqui.` : `Dono do sistema, com acesso completo a: ${pessoa.fazendas.join(', ')}. Este acesso não é alterado por aqui.`} />
        {pessoa.souEu && <DefinirSenha email={pessoa.email} eu />}
      </Tela>
    );
  }

  const nivelTexto =
    nivel[0] === 'completo'
      ? 'Completo: lança, altera, exclui e mexe nos cadastros.'
      : 'Só lançamentos: lança no dia a dia (animais, movimentações, atividades), mas não altera nem exclui cadastros e lançamentos.';

  return (
    <Tela>
      {abas}
      {!emailEditado && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {avisoBanco && <Aviso tipo="info" texto={avisoBanco} />}
      {!emailEditado && !params?.aviso && adminSistema && (
        <Aviso
          tipo="info"
          texto='Para começar, cadastre o Produtor: perfil "Produtor (dono)" com o e-mail dele. Ele fica dono de todas as fazendas e, depois, ele mesmo libera o escritório, os gerentes e os funcionários.'
        />
      )}
      {!emailEditado && !params?.aviso && !adminSistema && (
        <Aviso
          tipo="info"
          texto='Libere o acesso pelo e-mail da pessoa e marque as agendas que ela pode abrir. Ela entra no app, toca em "Criar conta" com esse mesmo e-mail, e o acesso aparece sozinho.'
        />
      )}
      {pessoa && <Text style={estilos.situacao}>{situacaoTexto(pessoa)}</Text>}

      <Campo rotulo="Nome *" value={nome} onChangeText={setNome} autoCapitalize="words" erro={erros.nome} />
      <Campo
        rotulo="E-mail *"
        value={email}
        onChangeText={setEmail}
        editable={!emailEditado}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        ajuda={emailEditado ? 'O e-mail identifica a pessoa e não muda.' : 'O mesmo e-mail que ela vai usar para criar a conta.'}
        erro={erros.email}
      />
      <Escolha rotulo="Perfil" opcoes={adminSistema ? PERFIS_ADMIN_SISTEMA : PERFIS} valor={perfil} aoMudar={mudarPerfil} />
      {dono ? (
        <Text style={estilos.nota}>Produtor (dono): dono de todas as fazendas, inclusive as que forem cadastradas depois. Vê e faz tudo, abre a agenda do Produtor e libera e bloqueia os acessos do escritório, dos gerentes e dos funcionários.</Text>
      ) : admin ? (
        <Text style={estilos.nota}>Administrador: vê e faz tudo nas fazendas marcadas, como o dono. Libera e bloqueia acessos, vê o Financeiro, consulta a Auditoria (quem lançou) e faz a cópia de segurança. Abre também a agenda do Produtor.</Text>
      ) : (
        <>
          <Escolha rotulo="Nível de acesso" opcoes={NIVEIS} valor={nivel} aoMudar={setNivel} />
          <Text style={estilos.nota}>{nivelTexto}</Text>
        </>
      )}

      {liberado && !dono && (
        <>
          <Escolha rotulo="Fazendas que pode ver *" multiplo opcoes={opcoesFazenda} valor={fazendas} aoMudar={setFazendas} erro={erros.fazendas} />
          <Text style={estilos.nota}>O Administrativo e o Particular dos sócios abrem sozinhos para o Administrador e o Escritório. O gerente e o funcionário nunca os veem.</Text>
        </>
      )}

      {liberado && !admin && (
        <>
          {/* V127: caixinhas do que a pessoa pode abrir, marcadas pelo Produtor ou pelo Administrador */}
          <Secao titulo="Agendas" />
          <View style={estilos.caixas}>
            <Caixinha rotulo="Produtor" detalhe="A agenda do Produtor" marcado={agendas.includes('produtor')} aoMudar={(m) => marcarAgenda('produtor', m)} />
            <Caixinha rotulo="Administrador" detalhe="A agenda do administrador do sistema" marcado={agendas.includes('admin')} aoMudar={(m) => marcarAgenda('admin', m)} />
            <Caixinha rotulo="Escritório" detalhe="A agenda do Escritório" marcado={agendas.includes('escritorio')} aoMudar={(m) => marcarAgenda('escritorio', m)} />
            <Caixinha rotulo="De todas as fazendas" detalhe="As agendas de todas as fazendas, inclusive as cadastradas depois" marcado={agendas.includes('todas')} aoMudar={(m) => marcarAgenda('todas', m)} />
            <Caixinha
              rotulo="Só da sua fazenda"
              detalhe={nomesSuas.length ? `A agenda de: ${nomesSuas.join(', ')}` : 'Marque a fazenda dela acima'}
              marcado={agendas.includes('sua')}
              aoMudar={(m) => marcarAgenda('sua', m)}
            />
          </View>
          <Text style={estilos.nota}>
            {agendas.length
              ? 'Abre e anota nas agendas marcadas, e pode enviar tarefa para as outras.'
              : 'Sem agenda marcada: não participa das agendas (não abre nenhuma nem envia tarefa).'}
          </Text>

          <Secao titulo="Sistema" />
          <View style={estilos.caixas}>
            {MODULOS_SISTEMA.slice(0, 3).map((m) => (
              <Caixinha key={m.valor} rotulo={m.rotulo} marcado={modulos.includes(m.valor)} aoMudar={(x) => marcarModulo(m.valor, x)} />
            ))}
            <Caixinha
              rotulo="Financeiro"
              detalhe={financeiro ? 'Saldos de caixa e bancos, contas a pagar e a receber, compras, vendas e financiamentos' : 'Do Contas a pagar, só enxerga o que ele mesmo lançar'}
              marcado={financeiro}
              aoMudar={setFinanceiro}
            />
            <Caixinha rotulo="Mais" detalhe="Pessoas, fazendas, raças e ferros (a Agenda e o Sair aparecem sempre)" marcado={modulos.includes('mais')} aoMudar={(x) => marcarModulo('mais', x)} />
          </View>
          <Text style={estilos.nota}>O que não estiver marcado some das abas de baixo para esta pessoa. O Início aparece sempre.</Text>
        </>
      )}

      {emailEditado && pessoa?.situacao !== 'convite' && (
        <Interruptor
          rotulo="Acesso liberado"
          descricao={liberado ? 'Pode entrar nas fazendas marcadas.' : 'Bloqueado: não entra em nenhuma fazenda. O que ela lançou continua guardado.'}
          valor={liberado}
          aoMudar={setLiberado}
        />
      )}

      <Botao titulo={emailEditado ? 'Salvar alterações' : 'Liberar acesso'} onPress={salvar} carregando={salvando} />
      {pessoa?.situacao === 'convite' && <Botao titulo="Cancelar liberação" tipo="perigo" onPress={removerPendente} />}
      {pessoa && pessoa.situacao !== 'convite' && <DefinirSenha email={pessoa.email} nome={pessoa.nome} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nome: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto },
  situacao: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  caixas: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, paddingHorizontal: 12, paddingVertical: 6 },
});

/** Do que está gravado no banco para as caixinhas. Linhas de fazenda iguais às fazendas da pessoa = "Só da sua fazenda"; todas = "De todas". */
function caixinhasDasAgendas(linhas: { agenda: string; fazenda_id: string | null }[], suas: string[], todasFazendas: string[]): string[] {
  const c = new Set<string>();
  for (const l of linhas) if (['produtor', 'admin', 'escritorio'].includes(l.agenda)) c.add(l.agenda);
  if (linhas.some((l) => l.agenda === 'todas_fazendas')) c.add('todas');
  const daFazenda = linhas.filter((l) => l.agenda === 'fazenda' && l.fazenda_id).map((l) => l.fazenda_id!);
  if (daFazenda.length && !c.has('todas')) {
    const soAsSuas = daFazenda.every((f) => suas.includes(f));
    c.add(soAsSuas ? 'sua' : daFazenda.length >= todasFazendas.length ? 'todas' : 'sua');
  }
  return [...c];
}
