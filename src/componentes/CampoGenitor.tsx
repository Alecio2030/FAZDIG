import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import { buscarPorRegistro, normalizarRegistro, type Achado } from '../lib/genealogia';
import { cores, tam } from '../tema';

export type Genitor = { texto: string; id: string | null };

type Props = {
  rotulo: string; // "Mãe" ou "Pai"
  sexo: 'F' | 'M';
  valor: Genitor;
  aoMudar: (v: Genitor) => void;
  /** achou no cadastro um animal diferente do anterior: devolve os avós para preencher */
  aoAchar: (a: Achado) => void;
  ignorarId?: string | null;
  erro?: string | null;
};

/**
 * Mãe ou pai pela Série + RGN/RGD. Se o animal estiver no cadastro, liga os dois
 * e puxa os avós do cadastro dele; se não, fica registrado como informado.
 */
export default function CampoGenitor({ rotulo, sexo, valor, aoMudar, aoAchar, ignorarId, erro }: Props) {
  const [estado, setEstado] = useState<'nada' | 'buscando' | 'achado' | 'fora'>(valor.id ? 'achado' : 'nada');
  const [achado, setAchado] = useState<Achado | null>(null);
  const ultimoId = useRef<string | null>(valor.id);
  const valorRef = useRef(valor);
  valorRef.current = valor;

  const chave = normalizarRegistro(valor.texto);

  useEffect(() => {
    if (chave.length < 4) {
      setEstado('nada');
      setAchado(null);
      if (valorRef.current.id) aoMudar({ ...valorRef.current, id: null });
      return;
    }
    setEstado('buscando');
    const t = setTimeout(async () => {
      const a = await buscarPorRegistro(chave, ignorarId).catch(() => null);
      if (a && a.sexo && a.sexo !== sexo) {
        setAchado(a);
        setEstado('fora');
        if (valorRef.current.id) aoMudar({ ...valorRef.current, id: null });
        return;
      }
      setAchado(a);
      setEstado(a ? 'achado' : 'fora');
      if ((a?.id ?? null) !== valorRef.current.id) aoMudar({ ...valorRef.current, id: a?.id ?? null });
      if (a && a.id !== ultimoId.current) aoAchar(a);
      ultimoId.current = a?.id ?? null;
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, sexo, ignorarId]);

  const sexoErrado = achado && achado.sexo && achado.sexo !== sexo;

  return (
    <View style={{ gap: 6 }}>
      <Campo
        rotulo={`${rotulo} – Série + RGN/RGD`}
        value={valor.texto}
        onChangeText={(texto) => aoMudar({ ...valor, texto })}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="Ex.: CSC123"
        erro={erro}
      />
      {estado === 'buscando' && <ActivityIndicator color={cores.primaria} style={{ alignSelf: 'flex-start' }} />}
      {estado === 'achado' && achado && (
        <Text style={estilos.ok}>✓ No cadastro: {achado.registro ?? [achado.brinco, achado.nome].filter(Boolean).join(' ')}. Avós puxados do cadastro del{sexo === 'F' ? 'a' : 'e'}.</Text>
      )}
      {estado === 'fora' && !sexoErrado && <Text style={estilos.nota}>Não está no cadastro: fica registrad{sexo === 'F' ? 'a' : 'o'} como informad{sexo === 'F' ? 'a' : 'o'}. Informe os avós abaixo.</Text>}
      {estado === 'fora' && sexoErrado && (
        <Text style={estilos.aviso}>
          {achado?.brinco} está no cadastro como {achado?.sexo === 'F' ? 'fêmea' : 'macho'}; não foi ligad{sexo === 'F' ? 'a' : 'o'}. Confira o número.
        </Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  ok: { fontSize: tam.pequeno + 1, color: cores.sucesso, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  aviso: { fontSize: tam.pequeno + 1, color: cores.erro, fontWeight: '600' },
});
