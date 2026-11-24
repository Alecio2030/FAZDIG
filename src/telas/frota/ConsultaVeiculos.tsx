import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Busca from '../../componentes/Busca';
import Botao from '../../componentes/Botao';
import Linha from '../../componentes/Linha';
import Lista from '../../componentes/Lista';
import Aviso from '../../componentes/Aviso';
import Vazio from '../../componentes/Vazio';
import { useSessao } from '../../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../../lib/supabase';
import { limparBusca } from '../../lib/useBusca';
import { codigoBem, ROTULO_TIPO_VEICULO, ROTULO_USO, lerLeiturasAtuais, textoLeitura, type LeituraAtual } from '../../lib/frota';
import type { NavPilha } from '../../navegacao/rotas';
import { cores, tam } from '../../tema';

/** V165: só os bens do Imobilizado com "Controlar na Frota", com o código do bem. */
const SEL = '*, bem:imobilizados ( codigo_patrimonial )';

/** Consulta da frota: busca pelo nome, placa, marca ou nº; ou a relação da frota em uso. Tocando, abre a ficha. */
export default function ConsultaVeiculos() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendas, fazendaAtiva } = useSessao();
  const fid = fazendaAtiva?.id ?? null; // V169: o que é de uma fazenda só aparece nela
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<any[] | null>(null);
  const [relacao, setRelacao] = useState<any[] | null>(null);
  const [leituras, setLeituras] = useState<Record<string, LeituraAtual>>({});
  const [erro, setErro] = useState<string | null>(null);
  const termo = limparBusca(busca);
  const nomeFazenda = (_id: string) => null as string | null; // V169: só a fazenda em uso

  useEffect(() => {
    lerLeiturasAtuais().then(setLeituras).catch(() => {});
    // V130: a consulta já abre com a relação da frota em uso
    abrirRelacao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!termo) return setAchados(null);
    const t = setTimeout(async () => {
      try {
        const partes = [`nome.ilike.*${termo}*`, `placa.ilike.*${termo}*`, `marca.ilike.*${termo}*`, `modelo.ilike.*${termo}*`];
        if (/^\d+$/.test(termo)) partes.unshift(`numero.eq.${termo}`);
        // V165: busca também pelo código do bem (ex.: FI 003)
        const bens = await consulta<any[]>(supabase.from('imobilizados').select('id').ilike('codigo_patrimonial', `%${termo}%`).limit(40));
        if (bens.length) partes.push(`imobilizado_id.in.(${bens.map((b) => b.id).join(',')})`);
        setAchados(await consulta<any[]>(supabase.from('frota_veiculos').select(SEL).not('imobilizado_id', 'is', null).eq('fazenda_id', fid).or(partes.join(',')).order('nome').limit(40)));
      } catch (e) {
        setErro(traduzirErro(e));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [termo, fid]);

  async function abrirRelacao() {
    try {
      setRelacao(await consulta<any[]>(supabase.from('frota_veiculos').select(SEL).not('imobilizado_id', 'is', null).eq('fazenda_id', fid).eq('ativo', true).order('uso').order('nome')));
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }

  const linha = (v: any) => (
    <Linha
      key={v.id}
      titulo={`${codigoBem(v) ?? `Nº ${v.numero}`} · ${v.nome}`}
      linhas={[
        [ROTULO_TIPO_VEICULO[v.tipo], v.marca, v.modelo, v.ano, v.placa].filter(Boolean).join(' · '),
        [ROTULO_USO[v.uso], v.medidor !== 'nenhum' ? textoLeitura(leituras[v.id]?.leitura ?? v.leitura_inicial, v.medidor) : null, nomeFazenda(v.fazenda_id)].filter(Boolean).join(' · '),
      ]}
      inativo={!v.ativo}
      onPress={() => navegacao.navigate('VeiculoDetalhe', { id: v.id })}
    />
  );

  const lista = achados ?? relacao;
  return (
    <>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <Busca valor={busca} aoMudar={setBusca} dica="Nome, placa, marca, código ou nº" />
      {!termo && !relacao && <Botao titulo="Relação da frota em uso" tipo="secundario" onPress={abrirRelacao} />}
      {relacao && !termo && <Text style={estilos.nota}>{relacao.length} em uso. Toque para abrir a ficha.</Text>}
      {lista && lista.length === 0 && <Vazio icone="car-sport-outline" texto={termo ? 'Nada encontrado com esse texto.' : 'Nenhum veículo cadastrado ainda.'} />}
      {lista && lista.length > 0 && <Lista>{lista.map(linha)}</Lista>}
    </>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
});
