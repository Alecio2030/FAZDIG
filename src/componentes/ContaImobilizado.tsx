import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import Botao from './Botao';
import Escolha from './Escolha';
import { supabase, traduzirErro } from '../lib/supabase';
import { proximoCodigo } from '../lib/planoContas';
import { cores, tam } from '../tema';

// V178: compra de bem do Imobilizado classificada pela conta do grupo do Ativo Imobilizado
// (Tratores, Ferramentas, Veículos...). Não achando a conta, cadastra-se ali mesmo, dentro do grupo.

export type ContaImob = { id: string; codigo: string; nome: string; conta_pai_id: string | null };
type Grupo = { id: string; codigo: string; nome: string };

const NAO_E_BEM = /deprecia|exaust|amortiz|forma[cç][aã]o/i;

/** Grupos (sintéticas) do Ativo Imobilizado e as contas analíticas de cada um. */
export async function contasImobilizado(): Promise<{ grupos: Grupo[]; contas: ContaImob[] }> {
  const { data, error } = await supabase.from('plano_contas').select('id, codigo, nome, conta_pai_id, analitica, ativa, tipo').eq('tipo', 'ativo').limit(3000);
  if (error) throw error;
  const todas = (data ?? []) as any[];
  // grupo = conta sintética do Ativo com "imobiliz" no nome (sem depreciação/formação); vale o de cima de todos
  let grupos: Grupo[] = todas.filter((c) => !c.analitica && /imobiliz/i.test(c.nome) && !NAO_E_BEM.test(c.nome));
  grupos = grupos.filter((g) => !grupos.some((o) => o.id !== g.id && g.codigo.startsWith(`${o.codigo}.`)));
  const contas = todas
    .filter((c) => c.analitica && c.ativa !== false && grupos.some((g) => c.codigo.startsWith(`${g.codigo}.`)) && !NAO_E_BEM.test(c.nome))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  // onde se cria conta nova: as sintéticas dentro do grupo que já têm contas de bens (ou o próprio grupo)
  const pais = new Set(contas.map((c) => c.conta_pai_id));
  const ondeCriar: Grupo[] = todas
    .filter((c) => !c.analitica && (pais.has(c.id) || grupos.some((g) => g.id === c.id)) && !NAO_E_BEM.test(c.nome))
    .filter((c) => grupos.some((g) => g.id === c.id || c.codigo.startsWith(`${g.codigo}.`)))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  return { grupos: ondeCriar, contas };
}

export default function ContaImobilizado({ valor, aoMudar, erro }: { valor: string | null; aoMudar: (id: string | null, nome?: string) => void; erro?: string | null }) {
  const [dados, setDados] = useState<{ grupos: Grupo[]; contas: ContaImob[] } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [nome, setNome] = useState('');
  const [grupo, setGrupo] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const d = await contasImobilizado();
      setDados(d);
      if (d.grupos.length && !grupo.length) setGrupo([d.grupos.find((g) => g.id === d.contas[0]?.conta_pai_id)?.id ?? d.grupos[0].id]);
    } catch (e) {
      setFalha(traduzirErro(e));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cadastrar() {
    setFalha(null);
    const n = nome.trim();
    if (!n) return setFalha('Digite o nome da conta (ex.: Tratores, Ferramentas).');
    const pai = dados?.grupos.find((g) => g.id === grupo[0]);
    if (!pai) return setFalha('Escolha em que grupo do imobilizado a conta entra.');
    const igual = dados?.contas.find((c) => c.nome.trim().toLowerCase() === n.toLowerCase());
    if (igual) {
      aoMudar(igual.id, igual.nome);
      setNova(false);
      return setFalha(null);
    }
    setSalvando(true);
    const { data: irmas } = await supabase.from('plano_contas').select('codigo').eq('conta_pai_id', pai.id);
    const cod = proximoCodigo(pai.codigo, ((irmas ?? []) as any[]).map((x) => x.codigo));
    if (!cod) {
      setSalvando(false);
      return setFalha(`O grupo ${pai.codigo} não aceita mais contas abaixo dele.`);
    }
    const { data: c, error } = await supabase.from('plano_contas').insert({ codigo: cod, nome: n, tipo: 'ativo', conta_pai_id: pai.id, analitica: true }).select('id, codigo, nome, conta_pai_id').single();
    setSalvando(false);
    if (error) return setFalha(traduzirErro(error));
    setNome('');
    setNova(false);
    await carregar();
    aoMudar((c as any).id, (c as any).nome);
  }

  if (!dados) return falha ? <Text style={estilos.erro}>{falha}</Text> : <ActivityIndicator color={cores.primaria} />;
  return (
    <View style={{ gap: 8 }}>
      {dados.contas.length ? (
        <Escolha rotulo="Conta do Ativo Imobilizado *" opcoes={dados.contas.map((c) => ({ valor: c.id, rotulo: c.nome }))} valor={valor ? [valor] : []} aoMudar={(v) => aoMudar(v[0], dados.contas.find((c) => c.id === v[0])?.nome)} erro={erro} />
      ) : (
        <Text style={estilos.nota}>Nenhuma conta de bens no grupo do Ativo Imobilizado ainda. Cadastre abaixo.</Text>
      )}
      {nova ? (
        <View style={estilos.caixa}>
          <Campo rotulo="Nome da conta nova" value={nome} onChangeText={setNome} autoCapitalize="sentences" placeholder="Ex.: Ferramentas, Tratores, Implementos" />
          {dados.grupos.length > 1 && <Escolha rotulo="Dentro do grupo" opcoes={dados.grupos.map((g) => ({ valor: g.id, rotulo: `${g.codigo} ${g.nome}` }))} valor={grupo} aoMudar={setGrupo} />}
          {dados.grupos.length === 0 && <Text style={estilos.erro}>O plano de contas não tem o grupo do Ativo Imobilizado (conta sintética do Ativo com "Imobilizado" no nome). Cadastre-o em Financeiro › Plano de contas.</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Botao titulo="Cancelar" tipo="secundario" onPress={() => setNova(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Botao titulo="Cadastrar a conta" onPress={cadastrar} carregando={salvando} desabilitado={!dados.grupos.length} />
            </View>
          </View>
        </View>
      ) : (
        <Text style={estilos.link} onPress={() => setNova(true)}>
          + Não achou a conta? Cadastrar no grupo do Ativo Imobilizado
        </Text>
      )}
      {falha && <Text style={estilos.erro}>{falha}</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  erro: { fontSize: tam.pequeno, color: cores.erro, lineHeight: 19 },
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  caixa: { gap: 8, padding: 10, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: '#F7FAF6' },
});
