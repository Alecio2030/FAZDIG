import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Tela from '../componentes/Tela';
import Aviso from '../componentes/Aviso';
import Botao from '../componentes/Botao';
import { useSessao } from '../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { eDono } from '../lib/acessos';
import { doBanco } from '../lib/datas';
import { formatarNumero } from '../lib/formatos';
import { NO_NAVEGADOR, baixarArquivo } from '../lib/web';
import { cores, tam } from '../tema';

type Copia = { id: string; criada_em: string; automatica: boolean; linhas: number; tamanho: number };

/** Data e hora no horário de Brasília: "12/10/2026 às 03:00". */
function quando(iso: string): { texto: string; dia: string } {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString();
  return { texto: `${doBanco(d.slice(0, 10))} às ${d.slice(11, 16)}`, dia: d.slice(0, 10) };
}
const tamanhoTexto = (b: number) => (b >= 1_000_000 ? `${formatarNumero(b / 1_000_000, 1)} MB` : `${formatarNumero(Math.max(1, Math.round(b / 1000)), 0)} KB`);

/**
 * Mais › Cópia de segurança (só o dono e o administrador).
 * O banco guarda sozinho uma cópia por semana (as 8 últimas). Aqui se faz uma cópia na hora e se baixa o arquivo
 * para guardar fora do sistema (PC, pen drive, nuvem).
 */
export default function CopiaSeguranca() {
  const { fazendaAtiva } = useSessao();
  const chefe = eDono(fazendaAtiva?.perfil);
  const [copias, setCopias] = useState<Copia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fazendo, setFazendo] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCopias(await consulta<Copia[]>(supabase.from('copias_seguranca').select('id, criada_em, automatica, linhas, tamanho').order('criada_em', { ascending: false }).limit(20)));
    } catch (e: any) {
      setCopias([]);
      setErro(/copias_seguranca/i.test(String(e?.message ?? '')) ? 'Falta atualizar o banco: rode o arquivo "Fazenda Digital V122 - banco.sql" no Supabase.' : traduzirErro(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (chefe) carregar();
    }, [chefe, carregar]),
  );

  async function fazerAgora() {
    setErro(null);
    setAviso(null);
    setFazendo(true);
    const { error } = await supabase.rpc('fazer_copia_seguranca');
    setFazendo(false);
    if (error) return setErro(traduzirErro(error));
    setAviso('Cópia feita e guardada no banco. Para guardar também fora do sistema, baixe o arquivo.');
    carregar();
  }

  async function baixar(c: Copia) {
    setErro(null);
    setAviso(null);
    if (!NO_NAVEGADOR) return setAviso('Para baixar o arquivo, abra o Fazenda Digital pelo navegador (no PC ou no celular). Pelo Expo Go a cópia fica guardada só no banco.');
    setBaixando(c.id);
    try {
      const d = await consulta<{ dados: unknown }>(supabase.from('copias_seguranca').select('dados').eq('id', c.id).single());
      const nome = `Fazenda Digital - copia de seguranca ${quando(c.criada_em).dia}.json`;
      if (!baixarArquivo(nome, JSON.stringify(d.dados))) setErro('O navegador não deixou baixar o arquivo. Tente de novo ou use outro navegador.');
      else setAviso(`Arquivo "${nome}" baixado. Guarde num lugar seguro (pasta do PC, pen drive ou nuvem).`);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setBaixando(null);
  }

  if (!chefe) {
    return (
      <Tela>
        <Aviso tipo="info" texto="Só o dono ou o administrador faz e baixa a cópia de segurança." />
      </Tela>
    );
  }

  const ultimaAuto = copias?.find((c) => c.automatica);
  return (
    <Tela>
      <Text style={estilos.nota}>
        O sistema guarda sozinho uma cópia de tudo o que foi lançado, todo domingo de madrugada, e mantém as 8 últimas (dois meses). Antes de um lançamento grande ou de uma limpeza, faça uma cópia na hora.
      </Text>
      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      <Botao titulo="Fazer cópia agora" onPress={fazerAgora} carregando={fazendo} />

      {copias === null ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 20 }} />
      ) : copias.length === 0 ? (
        !erro && <Aviso tipo="info" texto="Ainda não há nenhuma cópia. Toque em “Fazer cópia agora”." />
      ) : (
        <>
          <Text style={estilos.resumo}>{ultimaAuto ? `Última cópia automática: ${quando(ultimaAuto.criada_em).texto}` : 'A primeira cópia automática sai no próximo domingo.'}</Text>
          <View style={estilos.lista}>
            {copias.map((c, i) => (
              <View key={c.id} style={[estilos.item, i > 0 && estilos.divisor]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={estilos.titulo}>{quando(c.criada_em).texto}</Text>
                  <Text style={estilos.detalhe}>
                    {c.automatica ? 'Automática da semana' : 'Feita na hora'} · {formatarNumero(c.linhas, 0)} registros · {tamanhoTexto(c.tamanho)}
                  </Text>
                </View>
                <View style={{ width: 120 }}>
                  <Botao titulo="Baixar" tipo="secundario" onPress={() => baixar(c)} carregando={baixando === c.id} desabilitado={!!baixando && baixando !== c.id} />
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={estilos.ajuda}>
        <Text style={estilos.ajudaTitulo}>O que é bom saber</Text>
        <Text style={estilos.nota}>• A cópia leva todos os cadastros e lançamentos (todas as fazendas). As fotos de notas e laudos ficam guardadas à parte e não entram no arquivo.</Text>
        <Text style={estilos.nota}>• As cópias ficam no mesmo banco do sistema: protegem de um lançamento errado ou de uma exclusão. Para ficar protegido também de um problema no banco, baixe o arquivo de vez em quando e guarde fora.</Text>
        <Text style={estilos.nota}>• O arquivo tem os dados de todas as fazendas, inclusive o financeiro: guarde como se guarda um documento.</Text>
        <Text style={estilos.nota}>• Voltar uma cópia não é feito por aqui, para ninguém apagar o sistema sem querer. Se precisar, é só pedir, informando a data da cópia.</Text>
      </View>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  resumo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  lista: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, overflow: 'hidden' },
  item: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' },
  divisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  detalhe: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  ajuda: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 6 },
  ajudaTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.info },
});
