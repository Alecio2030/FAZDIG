// Usuários e acessos: perfis, níveis e o agrupamento por pessoa da lista que vem do banco.

export const PERFIS = [
  { valor: 'gerente', rotulo: 'Gerente' },
  { valor: 'escritorio', rotulo: 'Escritório' },
  { valor: 'funcionario', rotulo: 'Funcionário' },
  { valor: 'admin', rotulo: 'Administrador' },
];

/** Só o administrador do sistema vê e usa: cadastra o Produtor (dono), que depois libera os demais. */
export const PERFIS_ADMIN_SISTEMA = [{ valor: 'dono', rotulo: 'Produtor (dono)' }, ...PERFIS];

/** Dono (o produtor) ou Administrador: vê e faz tudo, libera acessos e faz a cópia de segurança. */
export function eDono(perfil: string | null | undefined): boolean {
  return perfil === 'dono' || perfil === 'admin';
}
/** Partes do sistema que o Produtor marca para cada pessoa (V127). O Financeiro continua na chave "Vê o Financeiro". */
export const MODULOS_SISTEMA = [
  { valor: 'pecuario', rotulo: 'Pecuária' },
  { valor: 'agricola', rotulo: 'Agrícola' },
  { valor: 'frota', rotulo: 'Frota' },
  { valor: 'mais', rotulo: 'Mais (cadastros)' },
];
export const TODOS_MODULOS = MODULOS_SISTEMA.map((m) => m.valor);

/** A pessoa abre este módulo na fazenda? Sem a marcação gravada (cadastros antigos), abre todos. Dono e administrador abrem tudo. */
export function podeModulo(acesso: { perfil?: string | null; modulos?: string[] | null } | null | undefined, modulo: string): boolean {
  if (!acesso) return true;
  if (eDono(acesso.perfil)) return true;
  return !acesso.modulos || acesso.modulos.includes(modulo);
}

export const NIVEIS = [
  { valor: 'completo', rotulo: 'Completo' },
  { valor: 'lancamento', rotulo: 'Só lançamentos' },
];
export const ROTULO_PERFIL: Record<string, string> = { dono: 'Produtor (dono)', admin: 'Administrador', gerente: 'Gerente', escritorio: 'Escritório', funcionario: 'Funcionário' };
export const ROTULO_NIVEL: Record<string, string> = { completo: 'acesso completo', lancamento: 'só lançamentos' };

export type LinhaAcesso = {
  email: string;
  nome: string | null;
  perfil: string;
  nivel: string;
  ativo: boolean;
  /** vê o Financeiro (só vem do banco a partir da V122) */
  financeiro?: boolean | null;
  /** módulos do sistema que abre (V127); null = todos */
  modulos?: string[] | null;
  fazenda_id: string;
  fazenda: string;
  situacao: 'conta' | 'convite';
  sou_eu: boolean;
};

export type Pessoa = {
  email: string;
  nome: string | null;
  perfil: string;
  nivel: string;
  financeiro: boolean;
  /** módulos do sistema que abre; null = todos (cadastro anterior à V127) */
  modulos: string[] | null;
  fazendaIds: string[];
  fazendas: string[];
  /** conta: já entrou no app; convite: liberado, falta criar a conta; bloqueado: sem nenhuma fazenda ativa */
  situacao: 'conta' | 'convite' | 'bloqueado';
  souEu: boolean;
};

/** Junta as linhas (uma por fazenda) numa pessoa por e-mail. */
export function agruparPorPessoa(linhas: LinhaAcesso[]): Pessoa[] {
  const mapa = new Map<string, LinhaAcesso[]>();
  for (const l of linhas) {
    const chave = (l.email ?? '').toLowerCase();
    mapa.set(chave, [...(mapa.get(chave) ?? []), l]);
  }
  const pessoas: Pessoa[] = [];
  for (const [email, ls] of mapa) {
    const ativas = ls.filter((l) => l.ativo);
    const base = ativas[0] ?? ls[0];
    pessoas.push({
      email,
      nome: ls.find((l) => l.nome)?.nome ?? null,
      perfil: ls.some((l) => l.perfil === 'dono') ? 'dono' : base.perfil,
      nivel: base.nivel,
      financeiro: ls.some((l) => l.perfil === 'dono' || l.perfil === 'admin') || (base.financeiro ?? base.perfil === 'escritorio'),
      modulos: base.modulos ?? null,
      fazendaIds: ativas.map((l) => l.fazenda_id),
      fazendas: ativas.map((l) => l.fazenda).sort((a, b) => a.localeCompare(b)),
      situacao: ativas.length === 0 ? 'bloqueado' : ls.every((l) => l.situacao === 'convite') ? 'convite' : 'conta',
      souEu: ls.some((l) => l.sou_eu),
    });
  }
  return pessoas.sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email));
}

export function situacaoTexto(p: Pessoa): string {
  if (p.souEu) return 'Você';
  if (p.situacao === 'convite') return 'Aguardando criar a conta no app';
  if (p.situacao === 'bloqueado') return 'Acesso bloqueado';
  return 'Com acesso';
}
