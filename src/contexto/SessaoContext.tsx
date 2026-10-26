import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { lerRelacaoAgendas, type AgendaInfo } from '../lib/agenda';
import { lerRetornoDoEmail } from '../lib/web';

export type FazendaAcesso = {
  id: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
  perfil: 'dono' | 'admin' | 'gerente' | 'funcionario' | 'escritorio';
  nivel: 'completo' | 'lancamento';
  /** vê a aba Financeiro, os saldos e as contas a pagar e a receber desta fazenda */
  financeiro: boolean;
  /** módulos do sistema que abre (Pecuária, Agrícola, Frota, Mais); null = todos */
  modulos: string[] | null;
  /** V137: 'fazenda' ou 'particular' (despesas e receitas dos sócios, vão ao Patrimônio Líquido) */
  tipo: 'fazenda' | 'particular';
};

type SessaoValor = {
  sessao: Session | null;
  carregando: boolean;
  fazendas: FazendaAcesso[];
  fazendaAtiva: FazendaAcesso | null;
  /** nome do Grupo (o tronco, ex.: GRUPO CASSANI); sem ele, o nome do produtor (V132) */
  grupo: string | null;
  /** relê o nome do Grupo (depois de gravar o cadastro do produtor) */
  recarregarGrupo: () => Promise<void>;
  /** relação das agendas (com os participantes) e quais o usuário pode abrir */
  agendas: AgendaInfo[];
  recarregarAgendas: () => Promise<void>;
  erroFazendas: string | null;
  trocarFazenda: (id: string) => void;
  /** V137: lançando no Administrativo (despesas e receitas que não são de nenhuma fazenda; no banco, fazenda em branco) */
  modoAdm: boolean;
  entrarAdm: () => void;
  /** V138: true só depois de tocar numa caixinha de SISTEMAS; volta a false na página de rosto (aí nenhuma unidade fica ativa) */
  naUnidade: boolean;
  sairDaUnidade: () => void;
  recarregarFazendas: () => Promise<void>;
  sair: () => Promise<void>;
  /** true enquanto se troca a senha pelo código: o app fica nas telas de entrada até terminar */
  entradaPausada: boolean;
  pausarEntrada: (pausar: boolean) => void;
  /** veio pelo link do e-mail de troca de senha: 'pronta' abre a tela da senha nova; texto = o link falhou */
  novaSenha: 'pronta' | { erro: string } | null;
  terminarNovaSenha: () => void;
};

const CHAVE_FAZENDA_ATIVA = 'fazendaAtiva';
const CHAVE_MODO_ADM = 'modoAdm';
const SessaoContext = createContext<SessaoValor | null>(null);

export function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [sessaoPronta, setSessaoPronta] = useState(false);
  const [fazendas, setFazendas] = useState<FazendaAcesso[]>([]);
  const [fazendaAtivaId, setFazendaAtivaId] = useState<string | null>(null);
  const [modoAdm, setModoAdm] = useState(false);
  const [naUnidade, setNaUnidade] = useState(false);
  const [agendas, setAgendas] = useState<AgendaInfo[]>([]);
  const [grupo, setGrupo] = useState<string | null>(null);
  const [carregandoFazendas, setCarregandoFazendas] = useState(false);
  const [erroFazendas, setErroFazendas] = useState<string | null>(null);
  // Para qual usuário a lista de fazendas já foi lida (evita mostrar a tela errada por um instante).
  const [lidoPara, setLidoPara] = useState<string | null>(null);
  const [entradaPausada, setEntradaPausada] = useState(false);
  const [novaSenha, setNovaSenha] = useState<'pronta' | { erro: string } | null>(null);

  // Login salvo no aparelho + avisos de entrada/saída.
  useEffect(() => {
    // Link do e-mail "Reset password": entra com ele e abre a tela da senha nova antes de qualquer outra.
    const retorno = lerRetornoDoEmail();
    const inicio =
      retorno?.tipo === 'recuperacao'
        ? (setEntradaPausada(true),
          supabase.auth
            .setSession({ access_token: retorno.access_token, refresh_token: retorno.refresh_token })
            .then(({ error }) => setNovaSenha(error ? { erro: 'Este link já foi usado ou venceu. Peça outro e-mail em "Esqueci minha senha".' } : 'pronta')))
        : (retorno?.tipo === 'erro' && setNovaSenha({ erro: retorno.mensagem }), Promise.resolve());
    inicio.then(() =>
      supabase.auth.getSession().then(({ data }) => {
        setSessao(data.session);
        setSessaoPronta(true);
      }),
    );
    const { data } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const recarregarAgendas = useCallback(async () => {
    setAgendas(await lerRelacaoAgendas().catch(() => []));
  }, []);

  // V132: o nome que aparece no alto de todas as telas é o do Grupo (o tronco), e não o da fazenda.
  const recarregarGrupo = useCallback(async () => {
    let { data, error }: { data: any[] | null; error: any } = await supabase.from('produtor').select('nome, nome_grupo').order('created_at').limit(1);
    if (error && /nome_grupo/i.test(error.message ?? '')) ({ data, error } = await supabase.from('produtor').select('nome').order('created_at').limit(1));
    if (error) return;
    const p = ((data ?? []) as any[])[0];
    setGrupo((p?.nome_grupo ?? '').trim() || (p?.nome ?? '').trim() || null);
  }, []);

  const recarregarFazendas = useCallback(async () => {
    const userId = sessao?.user.id;
    if (!userId) {
      setFazendas([]);
      setAgendas([]);
      setFazendaAtivaId(null);
      setLidoPara(null);
      setGrupo(null);
      return;
    }
    setCarregandoFazendas(true);
    setErroFazendas(null);
    // Acessos liberados pelo dono para este e-mail viram acesso de verdade agora.
    await supabase.rpc('aceitar_convites').then(() => undefined, () => undefined);
    const ler = (campos: string) => supabase.from('usuarios_fazenda').select(campos).eq('user_id', userId).eq('ativo', true);
    let { data, error } = await ler('perfil, nivel, financeiro, modulos, fazendas ( id, nome, municipio, uf, ativa, tipo )');
    // Banco ainda sem a atualização da V137 (coluna "tipo"): todas são fazendas.
    if (error && /tipo/i.test(error.message ?? '')) ({ data, error } = await ler('perfil, nivel, financeiro, modulos, fazendas ( id, nome, municipio, uf, ativa )'));
    // Banco ainda sem a atualização da V127 (coluna "modulos"): entra como antes, com todos os módulos.
    if (error && /modulos/i.test(error.message ?? '')) ({ data, error } = await ler('perfil, nivel, financeiro, fazendas ( id, nome, municipio, uf, ativa )'));
    // Banco ainda sem a atualização da V122 (coluna "financeiro"): entra como antes, vendo tudo.
    if (error && /financeiro/i.test(error.message ?? '')) ({ data, error } = await ler('perfil, nivel, fazendas ( id, nome, municipio, uf, ativa )'));

    if (error) {
      setErroFazendas(error.message);
      setLidoPara(userId);
      setCarregandoFazendas(false);
      return;
    }

    const lista: FazendaAcesso[] = [];
    for (const linha of (data ?? []) as any[]) {
      const f = Array.isArray(linha.fazendas) ? linha.fazendas[0] : linha.fazendas;
      if (!f || f.ativa === false) continue;
      const chefe = linha.perfil === 'dono' || linha.perfil === 'admin';
      lista.push({ id: f.id, nome: f.nome, municipio: f.municipio, uf: f.uf, perfil: linha.perfil, nivel: linha.nivel, financeiro: chefe || linha.financeiro !== false, modulos: chefe || !Array.isArray(linha.modulos) ? null : linha.modulos, tipo: f.tipo === 'particular' ? 'particular' : 'fazenda' });
    }
    // as fazendas primeiro; o Particular no fim
    lista.sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === 'fazenda' ? -1 : 1));

    const salva = await AsyncStorage.getItem(CHAVE_FAZENDA_ATIVA);
    // sem escolha gravada, abre numa fazenda (e não no Particular)
    const escolhida = lista.find((f) => f.id === salva) ?? lista.find((f) => f.tipo === 'fazenda') ?? lista[0] ?? null;
    const adm = (await AsyncStorage.getItem(CHAVE_MODO_ADM).catch(() => null)) === '1';
    setModoAdm(adm && lista.some((f) => f.perfil === 'dono' || f.perfil === 'admin' || (f.perfil === 'escritorio' && f.financeiro)));
    setFazendas(lista);
    setFazendaAtivaId(escolhida?.id ?? null);
    const [relacao] = await Promise.all([lista.length ? lerRelacaoAgendas().catch(() => []) : Promise.resolve([]), recarregarGrupo().catch(() => undefined)]);
    setAgendas(relacao);
    setLidoPara(userId);
    setCarregandoFazendas(false);
  }, [sessao?.user.id, recarregarGrupo]);

  useEffect(() => {
    recarregarFazendas();
  }, [recarregarFazendas]);

  const trocarFazenda = useCallback((id: string) => {
    setFazendaAtivaId(id);
    setModoAdm(false);
    setNaUnidade(true);
    AsyncStorage.setItem(CHAVE_FAZENDA_ATIVA, id).catch(() => {});
    AsyncStorage.setItem(CHAVE_MODO_ADM, '0').catch(() => {});
  }, []);

  // Administrativo: os lançamentos ficam sem fazenda; a fazenda em uso só serve de apoio às consultas.
  // Se a fazenda em uso for o Particular, passa para uma fazenda.
  const entrarAdm = useCallback(() => {
    setModoAdm(true);
    setNaUnidade(true);
    AsyncStorage.setItem(CHAVE_MODO_ADM, '1').catch(() => {});
    setFazendaAtivaId((atual) => {
      if (fazendas.find((f) => f.id === atual)?.tipo === 'fazenda') return atual;
      const outra = fazendas.find((f) => f.tipo === 'fazenda')?.id ?? atual;
      if (outra) AsyncStorage.setItem(CHAVE_FAZENDA_ATIVA, outra).catch(() => {});
      return outra;
    });
  }, [fazendas]);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    setFazendas([]);
    setFazendaAtivaId(null);
    setAgendas([]);
    setGrupo(null);
  }, []);

  const valor = useMemo<SessaoValor>(
    () => ({
      sessao,
      carregando: !sessaoPronta || (!entradaPausada && (carregandoFazendas || (!!sessao && lidoPara !== sessao.user.id))),
      fazendas,
      fazendaAtiva: fazendas.find((f) => f.id === fazendaAtivaId) ?? null,
      grupo,
      recarregarGrupo,
      agendas,
      recarregarAgendas,
      erroFazendas,
      trocarFazenda,
      modoAdm,
      entrarAdm,
      naUnidade,
      sairDaUnidade: () => setNaUnidade(false),
      recarregarFazendas,
      sair,
      entradaPausada,
      pausarEntrada: setEntradaPausada,
      novaSenha,
      terminarNovaSenha: () => {
        setNovaSenha(null);
        setEntradaPausada(false);
      },
    }),
    [sessao, sessaoPronta, carregandoFazendas, lidoPara, fazendas, fazendaAtivaId, grupo, recarregarGrupo, agendas, recarregarAgendas, erroFazendas, trocarFazenda, modoAdm, entrarAdm, naUnidade, recarregarFazendas, sair, entradaPausada, novaSenha],
  );

  return <SessaoContext.Provider value={valor}>{children}</SessaoContext.Provider>;
}

export function useSessao(): SessaoValor {
  const ctx = useContext(SessaoContext);
  if (!ctx) throw new Error('useSessao precisa estar dentro de SessaoProvider');
  return ctx;
}
