import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import { BANCOS, acharBanco, agenciasDoBanco, buscarBancoNaInternet, nomeDoNumero, numeroBanco, numeroDoNome, rotuloBanco, semAcento, sugerirBancos, type BancoCadastrado, type BancoDigitado } from '../lib/bancos';
import { cores, tam } from '../tema';

type Props = {
  valor: BancoDigitado;
  aoMudar: (v: BancoDigitado) => void;
  /** bancos + agências já cadastrados (Pessoas › Banco) */
  cadastrados: BancoCadastrado[];
  erro?: string | null;
};

/**
 * Banco e agência do contrato: nº do banco ↔ nome (um acha o outro) e nº ↔ nome da agência.
 * O que for digitado pela primeira vez é cadastrado ao gravar e aparece para escolher nas próximas.
 */
export default function CampoBanco({ valor, aoMudar, cadastrados, erro }: Props) {
  // o que o sistema preencheu sozinho pode ser trocado por ele; o que a pessoa digitou, não
  const nomeAuto = useRef(false);
  const numAuto = useRef(false);
  const [focoNome, setFocoNome] = useState(false);
  const [focoAg, setFocoAg] = useState(false);
  const saida = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valorRef = useRef(valor);
  valorRef.current = valor;
  useEffect(
    () => () => {
      if (saida.current) clearTimeout(saida.current);
    },
    [],
  );

  const num = numeroBanco(valor.numero);
  const escolhido = acharBanco(cadastrados, valor);
  const vazio = !valor.numero.trim() && !valor.nome.trim() && !valor.agencia.trim() && !valor.local.trim();

  // número que não está na tabela nem nos cadastrados: busca o nome na internet (se houver)
  useEffect(() => {
    if (!num || valor.numero.replace(/\D/g, '').length < 2) return;
    if (valor.nome.trim() && !nomeAuto.current) return;
    if (BANCOS[num] || cadastrados.some((b) => b.banco_numero && numeroBanco(b.banco_numero) === num)) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const nome = await buscarBancoNaInternet(num);
      const atual = valorRef.current;
      if (!vivo || !nome || numeroBanco(atual.numero) !== num || (atual.nome.trim() && !nomeAuto.current)) return;
      nomeAuto.current = true;
      aoMudar({ ...atual, nome });
    }, 700);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [num]);

  function digitarNumero(t: string) {
    const numero = t.replace(/\D/g, '').slice(0, 4);
    numAuto.current = false;
    const n3 = numeroBanco(numero);
    const doCadastro = n3 ? cadastrados.find((b) => b.banco_numero && numeroBanco(b.banco_numero) === n3)?.nome : null;
    const achado = n3 ? doCadastro ?? nomeDoNumero(n3) : null;
    if (achado && (!valor.nome.trim() || nomeAuto.current)) {
      nomeAuto.current = true;
      return aoMudar({ ...valor, numero, nome: achado });
    }
    // apagou ou trocou o número: o nome que o sistema tinha posto sai junto
    if (nomeAuto.current && !achado) {
      nomeAuto.current = false;
      return aoMudar({ ...valor, numero, nome: '' });
    }
    aoMudar({ ...valor, numero });
  }
  function digitarNome(nome: string) {
    nomeAuto.current = false;
    const k = semAcento(nome);
    const doCadastro = k ? cadastrados.find((b) => semAcento(b.nome) === k && b.banco_numero)?.banco_numero : null;
    const achado = k ? (doCadastro ? numeroBanco(doCadastro) : numeroDoNome(nome)) : null;
    if (achado && (!valor.numero.trim() || numAuto.current)) {
      numAuto.current = true;
      return aoMudar({ ...valor, nome, numero: achado });
    }
    if (numAuto.current && !achado) {
      numAuto.current = false;
      return aoMudar({ ...valor, nome, numero: '' });
    }
    aoMudar({ ...valor, nome });
  }
  function usarCadastrado(b: BancoCadastrado) {
    nomeAuto.current = false;
    numAuto.current = false;
    setFocoNome(false);
    setFocoAg(false);
    aoMudar({ numero: b.banco_numero ? numeroBanco(b.banco_numero) : nomeDoNumeroDe(b.nome), nome: b.nome, agencia: b.agencia ?? '', local: b.agencia_local ?? '' });
  }
  function usarDaTabela(b: { numero: string; nome: string }) {
    nomeAuto.current = false;
    numAuto.current = false;
    setFocoNome(false);
    aoMudar({ ...valor, numero: b.numero, nome: b.nome });
  }
  const foco = (set: (v: boolean) => void) => ({
    onFocus: () => {
      if (saida.current) clearTimeout(saida.current);
      set(true);
    },
    // espera um instante para o toque na sugestão valer antes de esconder
    onBlur: () => {
      saida.current = setTimeout(() => set(false), 250);
    },
  });

  // sugestões do nome: a partir de 2 letras, primeiro os cadastrados, depois a tabela de bancos
  const kNome = semAcento(valor.nome);
  const sugCadastrados = focoNome && kNome.length >= 2 ? cadastrados.filter((b) => semAcento(b.nome).includes(kNome) && b.id !== escolhido?.id).slice(0, 6) : [];
  const sugTabela = focoNome && kNome.length >= 2 ? sugerirBancos(valor.nome).filter((b) => semAcento(b.nome) !== kNome && !cadastrados.some((c) => semAcento(c.nome) === semAcento(b.nome))) : [];
  // agências já cadastradas deste banco
  const agencias = agenciasDoBanco(cadastrados, valor).filter((b) => b.id !== escolhido?.id);
  const agDig = valor.agencia.trim();
  const localDig = semAcento(valor.local);
  const sugAgencias = agencias.filter((b) => (!agDig && !localDig) || (!!agDig && (b.agencia ?? '').includes(agDig)) || (!!localDig && semAcento(b.agencia_local ?? '').includes(localDig)));
  const mostrarAgencias = sugAgencias.length > 0 && (focoAg || (!valor.agencia.trim() && !valor.local.trim()));

  return (
    <View style={{ gap: 8 }}>
      <Text style={estilos.titulo}>Banco *</Text>
      {vazio && cadastrados.length > 0 && (
        <View style={estilos.chips}>
          <Text style={estilos.nota}>Já cadastrados (toque para usar):</Text>
          {cadastrados.slice(0, 12).map((b) => (
            <Chip key={b.id} texto={rotuloBanco(b)} onPress={() => usarCadastrado(b)} />
          ))}
        </View>
      )}
      <View style={estilos.linha}>
        <View style={{ width: 96 }}>
          <Campo rotulo="Nº do banco" value={valor.numero} onChangeText={digitarNumero} keyboardType="number-pad" placeholder="Ex.: 001" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Nome do banco *" value={valor.nome} onChangeText={digitarNome} autoCapitalize="words" autoCorrect={false} placeholder="Ex.: Cresol, Sicoob" erro={erro} {...foco(setFocoNome)} />
        </View>
      </View>
      {(sugCadastrados.length > 0 || sugTabela.length > 0) && (
        <View style={estilos.chips}>
          {sugCadastrados.map((b) => (
            <Chip key={b.id} texto={rotuloBanco(b)} onPress={() => usarCadastrado(b)} />
          ))}
          {sugTabela.map((b) => (
            <Chip key={b.numero} texto={`${b.numero} ${b.nome}`} suave onPress={() => usarDaTabela(b)} />
          ))}
        </View>
      )}
      <View style={estilos.linha}>
        <View style={{ width: 96 }}>
          <Campo rotulo="Nº da agência" value={valor.agencia} onChangeText={(t) => aoMudar({ ...valor, agencia: t })} keyboardType="numbers-and-punctuation" {...foco(setFocoAg)} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Nome da agência" value={valor.local} onChangeText={(t) => aoMudar({ ...valor, local: t })} autoCapitalize="words" autoCorrect={false} placeholder="Ex.: Marilândia, Centro Colatina" {...foco(setFocoAg)} />
        </View>
      </View>
      {mostrarAgencias && (
        <View style={estilos.chips}>
          <Text style={estilos.nota}>Agências deste banco já cadastradas:</Text>
          {sugAgencias.slice(0, 8).map((b) => (
            <Chip key={b.id} texto={[b.agencia, b.agencia_local].filter(Boolean).join(' ')} onPress={() => usarCadastrado(b)} />
          ))}
        </View>
      )}
      {!vazio && valor.nome.trim() ? (
        escolhido ? (
          <Text style={estilos.ok}>Banco cadastrado: {rotuloBanco(escolhido)}{semAgenciaTexto(escolhido, valor)}</Text>
        ) : (
          <Text style={estilos.nota}>Banco/agência novo: ao gravar, entra em Cadastros › Pessoas › Banco e aparece aqui nas próximas vezes.</Text>
        )
      ) : null}
    </View>
  );
}

const nomeDoNumeroDe = (nome: string) => numeroDoNome(nome) ?? '';

/** Avisa quando a agência digitada vai completar o cadastro do banco, que estava sem agência. */
function semAgenciaTexto(b: BancoCadastrado, v: BancoDigitado): string {
  const faltava = !b.agencia?.trim() && !b.agencia_local?.trim();
  return faltava && (v.agencia.trim() || v.local.trim()) ? ' (a agência digitada completa o cadastro dele ao gravar)' : '';
}

function Chip({ texto, onPress, suave }: { texto: string; onPress: () => void; suave?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [estilos.chip, pressed && { opacity: 0.7 }]}>
      <Text style={[estilos.chipTexto, suave && { color: cores.texto, fontWeight: '500' }]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, justifyContent: 'center' },
  chipTexto: { fontSize: tam.pequeno + 1, color: cores.primaria, fontWeight: '600' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  ok: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '700', lineHeight: 20 },
});
