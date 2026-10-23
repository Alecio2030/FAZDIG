import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { doBanco } from '../../lib/datas';
import { formatarMoeda, formatarNumero } from '../../lib/formatos';
import { codigoLote, idadeRotulo } from '../../lib/rebanho';
import { useSigla } from '../../lib/useSigla';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const VAZIO = '–';
const num = (v: any, casas = 2) => (v == null ? null : formatarNumero(Number(v), Number.isInteger(Number(v)) ? 0 : casas));
const kg = (v: any) => (v == null ? null : `${num(v)} kg`);
const perc = (v: any) => (v == null ? null : `${num(v)}%`);

const ROTULO_ORIGEM: Record<string, string> = { compra: 'Compra', parceria: 'Parceria', cria: 'Cria (crias da fazenda)', outra: 'Outra' };
const ROTULO_PARCERIA: Record<string, string> = { apascentamento: 'Apascentamento', engorda: 'Engorda' };

/** Um lote na Consulta: só mostra os dados. Não inclui nem altera nada. */
export default function LoteDetalhe() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'LoteDetalhe'>>();
  const { fazendaAtiva } = useSessao();
  const { sigla } = useSigla(fazendaAtiva?.id);
  const [l, setL] = useState<any>(null);
  const [cabecas, setCabecas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useLayoutEffect(() => {
    navegacao.setOptions({ title: l ? codigoLote(l.numero, sigla) : 'Lote' });
  }, [navegacao, l, sigla]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const x = await consulta<any>(
            supabase
              .from('lotes')
              .select(
                '*, manga:areas!lotes_manga_id_fkey ( nome ), dono:pessoas!lotes_pessoa_terceiro_id_fkey ( nome ),' +
                  ' raca:racas!lotes_raca_id_fkey ( nome ), ferro:ferros!lotes_ferro_id_fkey ( descricao ),' +
                  ' mineral:insumos!lotes_mineral_insumo_id_fkey ( nome ), alimentar:insumos!lotes_alimentar_insumo_id_fkey ( nome )',
              )
              .eq('id', params.id)
              .single(),
          );
          setL({ ...x, manga: um(x.manga), dono: um(x.dono), raca: um(x.raca), ferro: um(x.ferro), mineral: um(x.mineral), alimentar: um(x.alimentar) });
          const { count } = await supabase.from('animais').select('id', { count: 'exact', head: true }).eq('lote_id', params.id).eq('situacao', 'ativo');
          setCabecas(count ?? 0);
        } catch (e) {
          setErro(traduzirErro(e));
        }
      })();
    }, [params.id]),
  );

  if (erro) {
    return (
      <Tela>
        <Aviso tipo="erro" texto={erro} />
      </Tela>
    );
  }
  if (!l) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  const engorda = l.origem === 'parceria' && l.origem_parceria === 'engorda';
  const apasc = l.origem === 'parceria' && l.origem_parceria === 'apascentamento';
  const origem = !l.origem
    ? null
    : l.origem === 'outra'
      ? `Outra: ${l.origem_outra ?? VAZIO}`
      : l.origem === 'parceria'
        ? `Parceria – ${ROTULO_PARCERIA[l.origem_parceria] ?? VAZIO}`
        : ROTULO_ORIGEM[l.origem];

  return (
    <Tela>
      <View style={estilos.cartao}>
        <View style={estilos.topo}>
          <View>
            <Text style={estilos.rotulo}>Lote nº</Text>
            <Text style={estilos.codigo}>{codigoLote(l.numero, sigla)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={estilos.rotulo}>Data de criação</Text>
            <Text style={estilos.data}>{doBanco(l.data_abertura)}</Text>
          </View>
        </View>
        <Text style={estilos.saldo}>
          Saldo: {formatarNumero(cabecas)} {cabecas === 1 ? 'animal ativo' : 'animais ativos'}
          {l.situacao === 'encerrado' ? '  ·  lote encerrado' : ''}
        </Text>
      </View>

      <Secao titulo="Origem" />
      <Dado rotulo="Origem" valor={origem} />
      {engorda && (
        <>
          <Dado rotulo="% do Criador" valor={perc(l.perc_criador)} />
          <Dado rotulo="% do Parceiro" valor={perc(l.perc_parceiro)} />
          <Dado rotulo="% das @ acrescidas" valor={perc(l.engorda_perc_arrobas)} />
        </>
      )}
      {apasc && (
        <>
          <Dado rotulo="Aluguel do pasto" valor={l.aluguel_pasto_cab_dia != null ? `${formatarMoeda(l.aluguel_pasto_cab_dia)} cab/dia` : null} />
          <Dado rotulo="Aluguel do suplemento" valor={l.aluguel_suplemento_cab_dia != null ? `${formatarMoeda(l.aluguel_suplemento_cab_dia)} cab/dia` : null} />
        </>
      )}

      <Secao titulo="Pesos e condição" />
      <Dado rotulo="Peso Bruto Inicial – Total" valor={kg(l.peso_inicial_total)} />
      <Dado rotulo="Peso Bruto Inicial – Médio" valor={kg(l.peso_inicial_medio)} />
      <Dado rotulo="Escore de Condição Corporal" valor={l.ecc != null ? String(l.ecc) : null} />
      <Dado rotulo="Peso Bruto Parcial – Data" valor={l.peso_parcial_data ? doBanco(l.peso_parcial_data) : null} />
      <Dado rotulo="Peso Bruto Parcial – Total" valor={kg(l.peso_parcial_total)} />
      <Dado rotulo="Peso Bruto Parcial – Médio" valor={kg(l.peso_parcial_medio)} />

      <Secao titulo="Composição" />
      <Dado rotulo="Descrição" valor={l.descricao} />
      <Dado rotulo="Sexo" valor={l.sexo === 'M' ? 'Machos' : l.sexo === 'F' ? 'Fêmeas' : null} />
      <Dado rotulo="Categoria" valor={l.categoria} />
      <Dado rotulo="Raça" valor={l.raca?.nome} />
      <Dado rotulo="Idade" valor={idadeRotulo(l.nascimento_ref, l.nascimento_aproximado)} />
      <Dado rotulo="Ferro" valor={l.ferro?.descricao} />

      <Secao titulo="Proprietário e local" />
      <Dado rotulo="Animais" valor={l.proprietario === 'terceiro' ? `De terceiro: ${l.dono?.nome ?? VAZIO}` : 'Próprios'} />
      <Dado rotulo="Manga" valor={l.manga?.nome} />

      <Secao titulo="Mineral e alimentação" />
      <Dado rotulo="Mineral" valor={l.mineral?.nome} />
      <Dado rotulo="Mineral – kg cab/dia" valor={num(l.mineral_kg_cab_dia, 3)} />
      <Dado rotulo="Alimentar" valor={l.alimentar?.nome} />
      <Dado rotulo="Alimentar – kg cab/dia" valor={num(l.alimentar_kg_cab_dia, 3)} />

      <Secao titulo="Outros" />
      <Dado rotulo="Situação" valor={l.situacao === 'encerrado' ? 'Encerrado' : 'Ativo'} />
      <Dado rotulo="Observações" valor={l.observacoes} />

      {cabecas > 0 && <Botao titulo="Ver os animais do lote" tipo="secundario" onPress={() => navegacao.navigate('Animais', { loteId: l.id })} />}
      <Botao titulo="✏️  Alterar ou excluir este lote" tipo="secundario" onPress={() => navegacao.push('LoteForm', { id: l.id })} />
    </Tela>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={estilos.dado}>
      <Text style={estilos.dadoRotulo}>{rotulo}</Text>
      <Text style={estilos.dadoValor}>{valor || VAZIO}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 8 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rotulo: { fontSize: tam.pequeno, color: cores.textoSuave, fontWeight: '600' },
  codigo: { fontSize: 30, fontWeight: '800', color: cores.primariaEscura, letterSpacing: 1 },
  data: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto, marginTop: 6 },
  saldo: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.cafe },
  dado: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: cores.borda },
  dadoRotulo: { flex: 1, fontSize: tam.pequeno + 1, color: cores.textoSuave },
  dadoValor: { flex: 1, fontSize: tam.pequeno + 1, color: cores.texto, fontWeight: '600', textAlign: 'right' },
});
