import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import Botao from './Botao';
import Escolha from './Escolha';
import Aviso from './Aviso';
import { supabase, traduzirErro } from '../lib/supabase';
import { cores, tam } from '../tema';

type Props = {
  fazendaId: string;
  /** sexo já escolhido na tela (o lote nasce com ele) */
  sexo?: string | null;
  /** chamado com o id do lote aberto, para a tela já escolhê-lo */
  aoCriar: (id: string, numero: number) => void;
};

/** V164: abrir um lote novo (vazio) sem sair da tela: a entrada ou a troca de lote já cai nele. */
export default function LoteRapido({ fazendaId, sexo, aoCriar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [sx, setSx] = useState<string[]>(sexo === 'M' || sexo === 'F' ? [sexo] : []);
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  async function abrir() {
    setErro(null);
    if (!sx.length) return setErro('Escolha se o lote é de machos ou de fêmeas.');
    setGravando(true);
    const { data, error } = await supabase.rpc('abrir_lote', { p_fazenda: fazendaId, p_sexo: sx[0], p_quantidade: 0, p_descricao: descricao.trim() || null });
    setGravando(false);
    if (error) return setErro(traduzirErro(error));
    const r = data as { id: string; numero: number };
    setAberto(false);
    setDescricao('');
    aoCriar(r.id, r.numero);
  }

  if (!aberto) {
    return (
      <Text
        style={estilos.link}
        onPress={() => {
          if (sexo === 'M' || sexo === 'F') setSx([sexo]);
          setAberto(true);
        }}
      >
        + Abrir um lote novo
      </Text>
    );
  }
  return (
    <View style={estilos.caixa}>
      <Text style={estilos.titulo}>Lote novo</Text>
      <Escolha
        rotulo="Sexo do lote *"
        opcoes={[
          { valor: 'M', rotulo: 'Machos' },
          { valor: 'F', rotulo: 'Fêmeas' },
        ]}
        valor={sx}
        aoMudar={setSx}
      />
      <Campo rotulo="Descrição (opcional)" value={descricao} onChangeText={setDescricao} placeholder="Ex.: Garrotes comprados do Zé" />
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Botao titulo="Abrir o lote" tipo="secundario" onPress={abrir} carregando={gravando} />
      <Botao titulo="Cancelar" tipo="texto" onPress={() => setAberto(false)} />
      <Text style={estilos.nota}>O lote abre vazio; os animais entram por esta movimentação. Manga, raça e outros dados completam-se depois em Pecuário › Lotes.</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  link: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '700' },
  caixa: { gap: 8, padding: 12, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundo },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
});
