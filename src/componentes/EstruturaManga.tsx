import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import CampoSugestao from './CampoSugestao';
import Escolha from './Escolha';
import CamposManejo, { type ManejoEd } from './CamposManejo';
import { CATEGORIAS, sugestoesTipo, textoManejo, type Categoria } from '../lib/mangas';
import { cores, tam } from '../tema';

export type EstruturaEd = {
  chave: string; // identifica o cartão na tela
  id?: string; // já gravada no banco
  categoria: Categoria;
  tipo: string;
  descricao: string;
  cobertura: boolean | null;
  capKg: string;
  capAnimais: string;
  /** novo manejo a registrar ao salvar (histórico) */
  manejo: ManejoEd;
  /** último manejo já registrado (só para mostrar) */
  ultimo?: { data: string; produto?: string | null; quantidade_kg?: number | null; servico?: string | null } | null;
};

type Props = {
  valor: EstruturaEd;
  aoMudar: (v: EstruturaEd) => void;
  aoRemover: () => void;
  erro?: string | null;
  erroManejo?: string | null;
};

/** Um bebedouro, cocho ou cerca dentro do cadastro da manga. */
export default function EstruturaManga({ valor, aoMudar, aoRemover, erro, erroManejo }: Props) {
  const info = CATEGORIAS[valor.categoria];
  const mudar = (parte: Partial<EstruturaEd>) => aoMudar({ ...valor, ...parte });
  const carregarTipo = useCallback(() => sugestoesTipo(valor.categoria), [valor.categoria]);
  const manejoMin = info.rotuloManejo.toLowerCase();

  return (
    <View style={estilos.cartao}>
      <View style={estilos.topo}>
        <Text style={estilos.titulo}>{info.rotulo}</Text>
        <Pressable onPress={aoRemover} hitSlop={10} accessibilityRole="button">
          <Text style={estilos.remover}>Remover</Text>
        </Pressable>
      </View>

      <CampoSugestao rotulo="Tipo" valor={valor.tipo} aoMudar={(tipo) => mudar({ tipo })} carregar={carregarTipo} placeholder={`Ex.: ${info.tiposPadrao[0]}`} erro={erro} />
      <Campo rotulo="Identificação (opcional)" value={valor.descricao} onChangeText={(descricao) => mudar({ descricao })} autoCapitalize="sentences" placeholder="Ex.: perto da porteira" />

      {valor.categoria === 'cocho_sal' && (
        <>
          <Escolha
            rotulo="Com cobertura"
            opcoes={[
              { valor: 'sim', rotulo: 'Sim' },
              { valor: 'nao', rotulo: 'Não' },
            ]}
            valor={valor.cobertura === null ? [] : [valor.cobertura ? 'sim' : 'nao']}
            aoMudar={(v) => mudar({ cobertura: v[0] === 'sim' })}
          />
          <Campo rotulo="Capacidade (kg)" value={valor.capKg} onChangeText={(capKg) => mudar({ capKg })} keyboardType="decimal-pad" placeholder="0" />
        </>
      )}
      {valor.categoria === 'cocho_alimentacao' && (
        <Campo
          rotulo="Capacidade (nº de animais)"
          value={valor.capAnimais}
          onChangeText={(t) => mudar({ capAnimais: t.replace(/\D/g, '').slice(0, 5) })}
          keyboardType="number-pad"
          placeholder="0"
        />
      )}

      {valor.ultimo && (
        <Text style={estilos.ultimo}>
          Últim{info.manejo === 'abastecimento' ? 'o' : 'a'} {manejoMin}: {textoManejo(valor.ultimo)}
        </Text>
      )}
      <CamposManejo
        categoria={valor.categoria}
        valor={valor.manejo}
        aoMudar={(manejo) => mudar({ manejo })}
        rotuloData={valor.id ? `Nov${info.manejo === 'abastecimento' ? 'o' : 'a'} ${manejoMin} (data)` : `Data d${info.manejo === 'abastecimento' ? 'o' : 'a'} ${manejoMin}`}
        erro={erroManejo}
      />
      {valor.id && <Text style={estilos.nota}>Preencha só quando houver um novo registro: ele entra no histórico, sem apagar os anteriores.</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: tam.espaco, gap: 12 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.cafe },
  remover: { fontSize: tam.pequeno + 1, fontWeight: '600', color: cores.erro },
  ultimo: { fontSize: tam.pequeno + 1, color: cores.primariaEscura, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
});
