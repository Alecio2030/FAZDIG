import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import CampoBuscaRapida, { type ItemRapido } from './CampoBuscaRapida';
import DadosUsoVeterinario from './DadosUsoVeterinario';
import Escolha from './Escolha';
import Botao from './Botao';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { USO_VAZIO, erroUnidades, errosUso, saldoDe, textoSaldo, unidadesNovas, unidadesParaBanco, usoParaBanco, type Unidades, type UsoVet } from '../lib/insumos';
import UnidadesInsumo from './UnidadesInsumo';
import EntradaParcial, { erroParcial, parcialParaBanco, parcialVazio, type Parcial } from './EntradaParcial';
import { CATEGORIAS_DO_TIPO, NOVO_PRODUTO } from '../lib/sanidade';
import { cores, tam } from '../tema';

type Props = {
  rotulo: string;
  tipo: string;
  fazendaId: string;
  valorId: string | null;
  aoMudar: (id: string | null) => void;
  erro?: string | null;
  /** peso por cabeça informado na aplicação (para mostrar a dose calculada na entrada parcial) */
  peso?: number | null;
};


/**
 * Medicamento ou vacina: digita, consulta os cadastrados (com estoque) ou cadastra na hora.
 * No cadastro na hora: Completo (unidades e dados de uso) ou Entrada parcial (medicamento comprado às pressas).
 * Nos dois, a dose recomendada é obrigatória.
 */
export default function CampoMedicamento({ rotulo, tipo, fazendaId, valorId, aoMudar, erro, peso = null }: Props) {
  const [novoNome, setNovoNome] = useState<string | null>(null);
  const [un, setUn] = useState<Unidades>(unidadesNovas(NOVO_PRODUTO[tipo].compra, NOVO_PRODUTO[tipo].consumo));
  const [quando, setQuando] = useState<string[]>(['agora']);
  const [uso, setUso] = useState<UsoVet>(USO_VAZIO);
  const categoria = NOVO_PRODUTO[tipo].categoria;
  const [par, setPar] = useState<Parcial>(parcialVazio(categoria));
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [errosNovo, setErrosNovo] = useState<Record<string, string>>({});

  const buscar = useCallback(
    async (t: string): Promise<ItemRapido[]> => {
      let q = supabase.from('insumos').select('id, nome, unidade, unidade_dose, conteudo_por_unidade, cadastro_completo, dose_recomendada, dose_por, dose_cada_kg').eq('ativo', true).in('categoria', CATEGORIAS_DO_TIPO[tipo]).order('nome').limit(100);
      if (t) q = q.ilike('nome', `%${t}%`);
      const ins = await consulta<any[]>(q);
      const movs = ins.length
        ? await consulta<any[]>(supabase.from('estoque_movimentos').select('insumo_id, tipo, quantidade').eq('fazenda_id', fazendaId).in('insumo_id', ins.map((i) => i.id)))
        : [];
      return ins.map((i) => {
        const s = saldoDe(movs.filter((m) => m.insumo_id === i.id));
        const semDose = !i.dose_recomendada || (i.dose_por === 'kg' && !i.dose_cada_kg);
        return { id: i.id, titulo: i.nome, detalhe: `Estoque ${textoSaldo(s, i)}${semDose ? ' — SEM DOSE RECOMENDADA: complete o cadastro' : i.cadastro_completo ? '' : ', cadastro incompleto'}` };
      });
    },
    [tipo, fazendaId],
  );
  const lerNome = useCallback(async (id: string) => (await supabase.from('insumos').select('nome').eq('id', id).maybeSingle()).data?.nome ?? null, []);

  function pedirNovo(nome: string) {
    setNovoNome(nome);
    setUn(unidadesNovas(NOVO_PRODUTO[tipo].compra, NOVO_PRODUTO[tipo].consumo));
    setQuando(['agora']);
    setUso(USO_VAZIO);
    setPar(parcialVazio(categoria));
    setFalha(null);
    setErrosNovo({});
  }

  // Entrada parcial: produto só com os dados do medicamento + os frascos que chegaram.
  // O banco guarda uma compra "a completar" (fornecedor, nota, valor e pagamento se completam em Compras).
  async function salvarParcial() {
    if (!novoNome) return;
    const problema = erroParcial(par, NOVO_PRODUTO[tipo].consumo);
    if (problema) return setFalha(problema);
    setSalvando(true);
    const { data: r, error } = await supabase.rpc('entrada_rapida', { p: parcialParaBanco(par, fazendaId, novoNome, categoria) });
    setSalvando(false);
    if (error) return setFalha(traduzirErro(error));
    setNovoNome(null);
    aoMudar((r as { insumo: string }).insumo);
  }

  async function salvarNovo() {
    if (!novoNome) return;
    if (quando[0] === 'parcial') return salvarParcial();
    const agora = true; // todo produto entra com dose recomendada
    const e = errosUso(uso, true);
    const pu = erroUnidades(un);
    if (pu) e.unidade = pu;
    setErrosNovo(e);
    const lista = Object.values(e);
    if (lista.length) return setFalha(lista.length === 1 ? lista[0] : `Falta corrigir:\n• ${lista.join('\n• ')}`);
    setSalvando(true);
    try {
      const d = await consulta<any>(
        supabase
          .from('insumos')
          .insert({ nome: novoNome, categoria: NOVO_PRODUTO[tipo].categoria, cadastro_completo: agora, ...unidadesParaBanco(un), ...(agora ? usoParaBanco(uso) : {}) })
          .select('id')
          .single(),
      );
      setNovoNome(null);
      aoMudar(d.id);
    } catch (e) {
      setFalha(traduzirErro(e));
    }
    setSalvando(false);
  }

  if (novoNome) {
    return (
      <View style={estilos.novo}>
        <Text style={estilos.titulo}>Novo produto: {novoNome}</Text>
        <Escolha
          rotulo="Como cadastrar"
          opcoes={[
            { valor: 'agora', rotulo: 'Completo' },
            { valor: 'parcial', rotulo: 'Entrada parcial' },
          ]}
          valor={quando}
          aoMudar={(v) => {
            setQuando(v);
            setFalha(null);
          }}
        />
        {quando[0] !== 'parcial' && <UnidadesInsumo valor={un} aoMudar={setUn} erro={errosNovo.unidade} />}
        {quando[0] === 'parcial' ? (
          <EntradaParcial valor={par} aoMudar={setPar} categoria={categoria} peso={peso} />
        ) : (
          <DadosUsoVeterinario valor={uso} aoMudar={setUso} unidade={un.consumo[0] ?? ''} erros={errosNovo} />
        )}
        {falha ? <Text style={estilos.erro}>{falha}</Text> : null}
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Botao titulo="Cancelar" tipo="secundario" onPress={() => setNovoNome(null)} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Botao titulo={quando[0] === 'parcial' ? 'Dar entrada' : 'Salvar produto'} onPress={salvarNovo} carregando={salvando} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <CampoBuscaRapida
      rotulo={rotulo}
      valorId={valorId}
      aoMudar={aoMudar}
      buscar={buscar}
      lerNome={lerNome}
      aoPedirNovo={pedirNovo}
      rotuloNovo="novo produto"
      icone="medkit"
      placeholder="Nome do produto (digite para buscar ou cadastrar)"
      erro={erro}
    />
  );
}

const estilos = StyleSheet.create({
  novo: { gap: 12, borderWidth: 1.5, borderColor: cores.primaria, borderRadius: tam.raio, padding: 12, backgroundColor: cores.cartao },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  erro: { fontSize: tam.pequeno, color: cores.erro },
  linha: { flexDirection: 'row', gap: 10 },
});
