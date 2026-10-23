import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Tela from '../../componentes/Tela';
import Busca from '../../componentes/Busca';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import Aviso from '../../componentes/Aviso';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { ROTULO_OBJETIVO_ANIMAL, ROTULO_SITUACAO, idadeRotulo, identAnimal, localDoLote, nomeLote } from '../../lib/rebanho';
import { doBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { useSigla } from '../../lib/useSigla';
import { normalizarRegistro } from '../../lib/genealogia';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

const MAXIMO = 20;
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const limpar = (t: string) => t.replace(/[,()*%\\]/g, '').trim();

/** Tela própria (usada pelo quadro da tela Início). */
export default function ConsultaAnimal() {
  return (
    <Tela>
      <ConsultaCorpo />
    </Tela>
  );
}

/** Consultar um animal específico pelo número interno, brinco ou nome. Não lista o rebanho. */
export function ConsultaCorpo() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id;
  const { sigla } = useSigla(fid);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const termo = limpar(busca);

  useEffect(() => {
    if (!fid || !termo) {
      setAchados(null);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      setErro(null);
      try {
        const partes = [`brinco.ilike.*${termo}*`, `nome.ilike.*${termo}*`, `registro.ilike.*${termo}*`];
        // Série + RGN digitado com espaço ("CSC 123") também acha o brinco CSC123.
        const norm = normalizarRegistro(termo);
        if (norm && norm !== termo.toUpperCase()) partes.push(`brinco.ilike.*${norm}*`);
        if (/^\d+$/.test(termo)) partes.unshift(`numero_interno.eq.${termo}`);
        const dados = await consulta<any[]>(
          supabase
            .from('animais')
            .select('id, numero_interno, brinco, nome, registro, controle_genealogico, tipo_registro, sexo, categoria, data_nascimento, nascimento_aproximado, situacao, objetivo, peso_atual_kg, peso_atual_data, raca:racas ( nome ), lote:lotes!animais_lote_id_fkey ( numero, descricao, manga:areas!lotes_manga_id_fkey ( nome, indicacao_uso ) )')
            .eq('fazenda_id', fid)
            .or(partes.join(','))
            .order('numero_interno')
            .limit(MAXIMO + 1),
        );
        // Número interno exato vem primeiro.
        dados.sort((a, b) => (String(b.numero_interno) === termo ? 1 : 0) - (String(a.numero_interno) === termo ? 1 : 0));
        setAchados(dados.map((a) => ({ ...a, raca: um(a.raca), lote: um(a.lote) ? { ...um(a.lote), manga: um(um(a.lote).manga) } : null })));
      } catch (e) {
        setErro(traduzirErro(e));
      }
      setBuscando(false);
    }, 350);
    return () => clearTimeout(t);
  }, [fid, termo]);

  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Número, brinco, nome ou Série + RGN" />
      {erro && <Aviso tipo="erro" texto={erro} />}

      {!termo && <Text style={estilos.dica}>Digite o número interno, o brinco, o nome ou a Série Alfabética + RGN/RGD (ex.: CSC123). O resultado mostra o lote, o local e o último peso. Tocando nele, abre a ficha com todos os pesos.</Text>}
      {termo && buscando && <ActivityIndicator color={cores.primaria} style={{ marginTop: 16 }} />}
      {termo && !buscando && achados && achados.length === 0 && <Text style={estilos.dica}>Nenhum animal encontrado com "{termo}".</Text>}

      {termo && !buscando && achados && achados.length > 0 && (
        <>
          <Lista>
            {achados.slice(0, MAXIMO).map((a) => (
              <Linha
                key={a.id}
                titulo={a.registro ? `${a.registro}` : [identAnimal(a), a.nome].filter(Boolean).join('  ')}
                linhas={[
                  [a.categoria ?? (a.sexo === 'F' ? 'Fêmea' : a.sexo === 'M' ? 'Macho' : null), a.raca?.nome, idadeRotulo(a.data_nascimento, a.nascimento_aproximado)]
                    .filter(Boolean)
                    .join(', ') || null,
                  a.registro ? (a.nome ? null : 'Sem nome no cadastro: toque para informar') : null,
                  a.objetivo ? `Objetivo: ${ROTULO_OBJETIVO_ANIMAL[a.objetivo] ?? a.objetivo}` : null,
                  a.situacao !== 'ativo'
                    ? ROTULO_SITUACAO[a.situacao]
                    : a.lote
                      ? `Lote ${nomeLote(a.lote, sigla)} · ${localDoLote(a.lote.manga) ?? 'local não informado'}`
                      : 'Sem lote',
                  a.peso_atual_kg != null ? `Último peso: ${formatarNumero(Number(a.peso_atual_kg), 1)} kg${a.peso_atual_data ? `, em ${doBanco(a.peso_atual_data)}` : ''}` : 'Sem peso guardado',
                ]}
                onPress={() => navegacao.navigate('AnimalForm', { id: a.id })}
              />
            ))}
          </Lista>
          {achados.length > MAXIMO && <Text style={estilos.dica}>Há mais resultados. Digite mais do número, brinco ou nome.</Text>}
        </>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
});
