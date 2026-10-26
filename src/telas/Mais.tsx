import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Tela from '../componentes/Tela';
import ItemMenu from '../componentes/ItemMenu';
import { VERSAO_APP } from '../config';
import { useSessao } from '../contexto/SessaoContext';
import { MODULOS, abrirFuncao } from '../navegacao/modulos';
import type { NavPilha } from '../navegacao/rotas';
import { estilos as lista, FORA_ADM, FORA_PARTICULAR } from './Modulo';
import { eDono, podeModulo } from '../lib/acessos';
import { confirmarSaida } from '../componentes/Cabecalho';
import DefinirSenha from '../componentes/DefinirSenha';
import { cores, tam } from '../tema';

const PERFIS = { dono: 'Produtor (dono)', admin: 'Administrador', gerente: 'Gerente', escritorio: 'Escritório', funcionario: 'Funcionário' } as const;

export default function Mais() {
  const navegacao = useNavigation<NavPilha>();
  const { sessao, fazendaAtiva, sair, grupo, modoAdm } = useSessao();
  const onde = modoAdm ? 'Administrativo' : fazendaAtiva?.nome ?? '';

  const chefe = eDono(fazendaAtiva?.perfil);
  // sem o módulo "Mais" liberado, a pessoa vê só a Agenda, a troca de senha e o Sair
  const verMais = podeModulo(fazendaAtiva, 'mais');
  // V139: Compras, Imobilizado e Vendas vieram do Financeiro (quem tem o Financeiro as vê mesmo sem o módulo "Mais").
  // V155: são operação da fazenda, então quem tem o "Mais" também as vê, mesmo sem o Financeiro;
  // sem o Financeiro saem só Usuários e Auditoria (e a Cópia de segurança), que são do Produtor.
  // No Administrativo e no Particular saem as que só existem nas fazendas.
  const verFinanceiro = fazendaAtiva?.financeiro !== false;
  const fora = modoAdm ? FORA_ADM : fazendaAtiva?.tipo === 'particular' ? FORA_PARTICULAR : [];
  const funcoes = MODULOS.mais.funcoes.filter((f) =>
    f.soFinanceiro
      ? (verFinanceiro || verMais) && !fora.includes(f.chave)
      : (!f.soDono || chefe) && (verMais || f.chave === 'agenda'));

  return (
    <Tela emAba>
      <View style={estilos.usuario}>
        <Text style={estilos.email}>{sessao?.user.email}</Text>
        {fazendaAtiva && (
          <Text style={estilos.perfil}>
            {/* V133: o usuário é do Grupo (o tronco); a fazenda é só onde caem os lançamentos */}
            {PERFIS[fazendaAtiva.perfil]} {grupo ? `do ${grupo} (lançando em ${onde})` : `em ${onde}`}, com acesso {fazendaAtiva.nivel === 'completo' ? 'completo' : 'só para lançamentos'}{fazendaAtiva.financeiro ? '' : ', sem o Financeiro'}.
          </Text>
        )}
      </View>

      <View style={lista.lista}>
        {funcoes.map((f, i) => (
          <View key={f.chave} style={i > 0 && lista.divisor}>
            <ItemMenu
              icone={f.icone}
              titulo={f.titulo}
              descricao={f.descricao}
              onPress={() => abrirFuncao(navegacao, f)}
            />
          </View>
        ))}
      </View>

      {sessao?.user.email && <DefinirSenha email={sessao.user.email} eu />}

      <View style={lista.lista}>
        <ItemMenu icone="log-out-outline" titulo="Sair do sistema" onPress={() => confirmarSaida(sair)} perigo />
      </View>
      <Text style={estilos.versao}>Fazenda Digital {VERSAO_APP}</Text>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  usuario: { gap: 4, paddingHorizontal: 4 },
  email: { fontSize: tam.subtitulo, fontWeight: '700', color: cores.texto },
  perfil: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  versao: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
});
