import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Alert } from '../../lib/alerta';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { entregarPessoaNova } from '../../lib/retorno';
import Tela from '../../componentes/Tela';
import Campo from '../../componentes/Campo';
import Botao from '../../componentes/Botao';
import Aviso from '../../componentes/Aviso';
import Escolha from '../../componentes/Escolha';
import Interruptor from '../../componentes/Interruptor';
import Secao from '../../componentes/Secao';
import { supabase, traduzirErro } from '../../lib/supabase';
import { cpfCnpjValido, lerNumero, mascaraCep, mascaraCpfCnpj, mascaraTelefone, moedaParaCampo, somenteDigitos } from '../../lib/formatos';
import CampoMoeda from '../../componentes/CampoMoeda';
import { BASES_MO, textoCustoPessoa } from '../../lib/maoObra';
import type { NavPilha, PilhaParams } from '../../navegacao/rotas';
import { cores } from '../../tema';
import { TIPOS_PESSOA } from '../../lib/pessoas';
import AbasCadastro, { type Aba } from '../../componentes/AbasCadastro';
import ConsultaPessoas from './ConsultaPessoas';

type Form = {
  nome: string;
  nome_fantasia: string;
  tipos: string[];
  cpf_cnpj: string;
  rg_ie: string;
  celular: string;
  telefone: string;
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  banco: string;
  banco_numero: string;
  agencia_local: string;
  agencia: string;
  conta: string;
  pix: string;
  observacoes: string;
  ativo: boolean;
  sui: string;
  sufixo: string;
  rgn_ultimo: string;
  mo_base: string;
  mo_valor: string;
};

const VAZIO: Form = {
  nome: '', nome_fantasia: '', tipos: [], cpf_cnpj: '', rg_ie: '', celular: '', telefone: '', email: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '',
  banco: '', banco_numero: '', agencia_local: '', agencia: '', conta: '', pix: '', observacoes: '', ativo: true,
  sui: '', sufixo: '', rgn_ultimo: '0', mo_base: 'dia', mo_valor: '',
};

const texto = (v: string) => (v.trim() ? v.trim() : null);

export default function PessoaForm() {
  const navegacao = useNavigation<NavPilha>();
  const { params } = useRoute<RouteProp<PilhaParams, 'PessoaForm'>>();
  const id = params?.id;
  const [aba, setAba] = useState<Aba>(params?.aba ?? 'cadastrar');
  // V158: cadastro pedido de outra tela já vem com o nome digitado e o tipo (ex.: cliente)
  const [f, setF] = useState<Form>(() => (params?.novo ? { ...VAZIO, nome: params.novo.nome, tipos: [params.novo.tipo] } : VAZIO));
  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  // Cadastrar: Pessoa | Banco. O banco tem ficha própria, só com os dados da agência.
  const [modoBanco, setModoBanco] = useState(!!params?.banco);
  const eBanco = id ? f.tipos.includes('banco') : modoBanco;

  const muda = <K extends keyof Form>(campo: K, valor: Form[K]) => setF((atual) => ({ ...atual, [campo]: valor }));

  useLayoutEffect(() => {
    navegacao.setOptions({ title: id ? (eBanco ? 'Editar banco' : 'Editar pessoa') : 'Pessoas' });
  }, [navegacao, id, eBanco]);

  useEffect(() => {
    if (!id) return;
    supabase.from('pessoas').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) setErro(traduzirErro(error));
      else if (data) {
        const d = data as Record<string, any>;
        const lido = { ...VAZIO };
        (Object.keys(VAZIO) as (keyof Form)[]).forEach((k) => {
          if (d[k] !== null && d[k] !== undefined) (lido as any)[k] = d[k];
        });
        lido.uf = (d.uf ?? '').trim();
        lido.rgn_ultimo = String(d.rgn_ultimo ?? 0);
        lido.mo_base = d.mo_base ?? 'dia';
        lido.mo_valor = moedaParaCampo(d.mo_valor);
        setF(lido);
      }
      setCarregando(false);
    });
  }, [id]);

  async function salvar() {
    setErro(null);
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.nome.trim()) e.nome = eBanco ? 'Informe o nome do banco.' : 'Informe o nome.';
    if (!eBanco && f.tipos.length === 0) e.tipos = 'Marque pelo menos um tipo.';
    if (f.cpf_cnpj && !cpfCnpjValido(f.cpf_cnpj)) e.cpf_cnpj = 'CPF ou CNPJ inválido. Confira os números.';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'E-mail inválido.';
    if (f.uf && f.uf.length !== 2) e.uf = '2 letras';
    const tipos = eBanco ? Array.from(new Set([...f.tipos, 'banco'])) : f.tipos.filter((t) => t !== 'banco');
    const criador = f.tipos.includes('criador');
    const trabalha = f.tipos.includes('funcionario') || f.tipos.includes('parceiro');
    if (criador && !/^[A-Z]{2,5}$/.test(f.sui)) e.sui = 'A Série Alfabética tem de 2 a 5 letras, sem números (ex.: SCS).';
    if (criador && (!/^\d+$/.test(f.rgn_ultimo || '0') || Number(f.rgn_ultimo) > 99999)) e.rgn_ultimo = 'Número de 0 a 99.999.';
    setErros(e);
    if (Object.keys(e).length) {
      setErro('Confira os campos marcados em vermelho.');
      return;
    }

    setSalvando(true);
    // SUI é única: dois criadores não podem ter a mesma.
    if (criador) {
      let q = supabase.from('pessoas').select('nome').eq('sui', f.sui);
      if (id) q = q.neq('id', id);
      const { data: mesma } = await q.limit(1);
      if (mesma && mesma.length) {
        setSalvando(false);
        setErros({ sui: `A Série ${f.sui} já é de ${mesma[0].nome}.` });
        setErro('Série Alfabética repetida.');
        return;
      }
    }
    // Avisa se já existe outra pessoa com o mesmo CPF/CNPJ.
    if (f.cpf_cnpj) {
      let q = supabase.from('pessoas').select('id, nome').eq('cpf_cnpj', f.cpf_cnpj);
      if (id) q = q.neq('id', id);
      const { data: iguais } = await q.limit(1);
      if (iguais && iguais.length) {
        setSalvando(false);
        setErros({ cpf_cnpj: `Já cadastrado para ${iguais[0].nome}.` });
        setErro('Este CPF/CNPJ já está cadastrado.');
        return;
      }
    }

    const digitos = somenteDigitos(f.cpf_cnpj);
    const valorMo = trabalha && (lerNumero(f.mo_valor) ?? 0) > 0 ? lerNumero(f.mo_valor) : null;
    const registro = {
      nome: f.nome.trim(),
      nome_fantasia: texto(f.nome_fantasia),
      tipos,
      tipo_pessoa: digitos.length === 11 ? 'F' : digitos.length === 14 ? 'J' : null,
      cpf_cnpj: texto(f.cpf_cnpj),
      rg_ie: texto(f.rg_ie),
      celular: texto(f.celular),
      telefone: texto(f.telefone),
      email: texto(f.email.toLowerCase()),
      cep: texto(f.cep),
      logradouro: texto(f.logradouro),
      numero: texto(f.numero),
      complemento: texto(f.complemento),
      bairro: texto(f.bairro),
      municipio: texto(f.municipio),
      uf: texto(f.uf.toUpperCase()),
      banco: texto(f.banco),
      banco_numero: eBanco ? texto(f.banco_numero) : null,
      agencia_local: eBanco ? texto(f.agencia_local) : null,
      agencia: texto(f.agencia),
      conta: texto(f.conta),
      pix: texto(f.pix),
      observacoes: texto(f.observacoes),
      ativo: f.ativo,
      sui: criador ? f.sui : null,
      sufixo: criador ? texto(f.sufixo) : null,
      rgn_ultimo: criador ? Number(f.rgn_ultimo || 0) : 0,
      mo_base: valorMo ? f.mo_base : null,
      mo_valor: valorMo,
    };
    const { data: gravada, error } = id
      ? await supabase.from('pessoas').update(registro).eq('id', id).select('id').single()
      : await supabase.from('pessoas').insert(registro).select('id').single();
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    if (id) return navegacao.goBack();
    // V158: veio de outra tela (ex.: Venda): volta para ela já com a pessoa escolhida
    if (params?.novo && gravada?.id && entregarPessoaNova(gravada.id)) return navegacao.goBack();
    else navegacao.replace('PessoaForm', eBanco ? { banco: true, aviso: `Banco ${registro.nome} salvo. Pode cadastrar o próximo.` } : { aviso: `Cadastro de ${registro.nome} salvo. Pode cadastrar a próxima pessoa.` });
  }

  function excluir() {
    Alert.alert(eBanco ? 'Excluir banco' : 'Excluir pessoa', `Excluir ${f.nome}? Se já houver compras, vendas, financiamentos ou lançamentos, o sistema não deixa: nesse caso, desmarque "Ativo".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('pessoas').delete().eq('id', id!);
          if (error) setErro(traduzirErro(error));
          else navegacao.goBack();
        },
      },
    ]);
  }

  if (carregando) {
    return (
      <Tela rolar={false}>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 40 }} />
      </Tela>
    );
  }

  const abas = !id && <AbasCadastro aba={aba} aoMudar={setAba} />;

  if (!id && aba === 'consultar') {
    return (
      <Tela>
        {abas}
        <ConsultaPessoas />
      </Tela>
    );
  }

  return (
    <Tela>
      {abas}
      {!id && params?.aviso && <Aviso tipo="sucesso" texto={params.aviso} />}
      {erro && <Aviso tipo="erro" texto={erro} />}
      {!id && (
        <Escolha
          rotulo="O que vai cadastrar"
          opcoes={[
            { valor: 'pessoa', rotulo: 'Pessoa' },
            { valor: 'banco', rotulo: 'Banco' },
          ]}
          valor={[modoBanco ? 'banco' : 'pessoa']}
          aoMudar={(v) => {
            setModoBanco(v[0] === 'banco');
            setErros({});
            setErro(null);
          }}
        />
      )}

      {eBanco ? (
        <>
          <Secao titulo="Banco" />
          <Campo rotulo="Nome *" value={f.nome} onChangeText={(t) => muda('nome', t)} autoCapitalize="words" placeholder="Ex.: Cresol, Sicoob, Banco do Brasil" erro={erros.nome} />
          <Campo rotulo="Local da agência" value={f.agencia_local} onChangeText={(t) => muda('agencia_local', t)} autoCapitalize="words" placeholder="Cidade ou bairro da agência" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Nº da agência" value={f.agencia} onChangeText={(t) => muda('agencia', t)} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo rotulo="Nº do banco" value={f.banco_numero} onChangeText={(t) => muda('banco_numero', t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="Ex.: 133, 756, 001" />
            </View>
          </View>
          <Campo rotulo="E-mail" value={f.email} onChangeText={(t) => muda('email', t)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} erro={erros.email} />
          <Campo rotulo="Telefone" value={f.telefone} onChangeText={(t) => muda('telefone', mascaraTelefone(t))} keyboardType="phone-pad" />
          <Campo rotulo="Celular" value={f.celular} onChangeText={(t) => muda('celular', mascaraTelefone(t))} keyboardType="phone-pad" />
          {id && <Interruptor rotulo="Ativo" descricao="Inativos não aparecem para escolher em novos lançamentos." valor={f.ativo} aoMudar={(v) => muda('ativo', v)} />}
          <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar banco'} onPress={salvar} carregando={salvando} />
          {id && <Botao titulo="Excluir banco" tipo="perigo" onPress={excluir} />}
        </>
      ) : (
        <>
      <Secao titulo="Identificação" />
      <Campo rotulo="Nome ou razão social *" value={f.nome} onChangeText={(t) => muda('nome', t)} autoCapitalize="words" erro={erros.nome} />
      <Campo rotulo="Apelido ou nome fantasia" value={f.nome_fantasia} onChangeText={(t) => muda('nome_fantasia', t)} autoCapitalize="words" />
      <Escolha rotulo="Tipo * (pode marcar mais de um)" multiplo opcoes={TIPOS_PESSOA.filter((t) => t.valor !== 'banco')} valor={f.tipos} aoMudar={(v) => muda('tipos', v)} erro={erros.tipos} />
      <Text style={{ fontSize: 13, color: '#56625A' }}>A mesma pessoa pode ser, por exemplo, cliente e fornecedor: marque os dois e ela fica num cadastro só. Tocando de novo, desmarca.</Text>
      <Campo
        rotulo="CPF ou CNPJ"
        value={f.cpf_cnpj}
        onChangeText={(t) => muda('cpf_cnpj', mascaraCpfCnpj(t))}
        keyboardType="number-pad"
        maxLength={18}
        erro={erros.cpf_cnpj}
      />
      <Campo rotulo="RG ou inscrição estadual" value={f.rg_ie} onChangeText={(t) => muda('rg_ie', t)} autoCapitalize="characters" />

      {f.tipos.includes('criador') && (
        <>
          <Secao titulo="Criador (gado registrado)" />
          <Campo
            rotulo="Série Alfabética *"
            value={f.sui}
            onChangeText={(t) => muda('sui', t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
            placeholder="Ex.: SCS"
            ajuda="Letras que identificam o criador na associação da raça (ex.: SCS). Não aceita números."
            erro={erros.sui}
          />
          <Campo rotulo="Sufixo/Afixo" value={f.sufixo} onChangeText={(t) => muda('sufixo', t)} autoCapitalize="words" placeholder="Ex.: da Constantino" ajuda="Vai depois do nome do animal: Maria da Constantino." />
          <Campo
            rotulo="Último RGN/RGD usado"
            value={f.rgn_ultimo}
            onChangeText={(t) => muda('rgn_ultimo', t.replace(/\D/g, '').slice(0, 9))}
            keyboardType="number-pad"
            ajuda={`O próximo nascimento registrado recebe ${f.sui || 'SCS'}${Number(f.rgn_ultimo || 0) + 1} (sem zeros à esquerda; a sequência não tem limite). Se já tem nascimentos anotados no papel, informe o último número aqui.`}
            erro={erros.rgn_ultimo}
          />
          {f.sui ? (
            <Aviso tipo="info" texto={`Exemplo de registro: ${f.sui}${Number(f.rgn_ultimo || 0) + 1} Maria ${f.sufixo}`.trim()} />
          ) : null}
        </>
      )}

      {(f.tipos.includes('funcionario') || f.tipos.includes('parceiro')) && (
        <>
          <Secao titulo="Mão de obra (custo nas atividades)" />
          <Escolha rotulo="Como é pago" opcoes={BASES_MO} valor={[f.mo_base]} aoMudar={(v) => muda('mo_base', v[0])} />
          <CampoMoeda
            rotulo={f.mo_base === 'hora' ? 'Valor da hora (R$)' : f.mo_base === 'mes' ? 'Custo por mês (R$)' : 'Valor da diária (R$)'}
            valor={f.mo_valor}
            aoMudar={(t) => muda('mo_valor', t)}
            ajuda={textoCustoPessoa(f.mo_base, lerNumero(f.mo_valor)) ?? 'Em branco: o trabalho desta pessoa não entra no custo das atividades.'}
          />
          <Aviso tipo="info" texto="É o valor que vai para o custo do talhão em Agrícola › Atividades (horas trabalhadas x valor da hora). Para o custo completo, informe já com os encargos (INSS, FGTS, férias, 13º)." />
        </>
      )}

      <Secao titulo="Contato" />
      <Campo rotulo="Celular / WhatsApp" value={f.celular} onChangeText={(t) => muda('celular', mascaraTelefone(t))} keyboardType="phone-pad" />
      <Campo rotulo="Telefone fixo" value={f.telefone} onChangeText={(t) => muda('telefone', mascaraTelefone(t))} keyboardType="phone-pad" />
      <Campo rotulo="E-mail" value={f.email} onChangeText={(t) => muda('email', t)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} erro={erros.email} />

      <Secao titulo="Endereço" />
      <Campo rotulo="CEP" value={f.cep} onChangeText={(t) => muda('cep', mascaraCep(t))} keyboardType="number-pad" maxLength={9} />
      <Campo rotulo="Rua, estrada ou córrego" value={f.logradouro} onChangeText={(t) => muda('logradouro', t)} autoCapitalize="words" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 110 }}>
          <Campo rotulo="Número" value={f.numero} onChangeText={(t) => muda('numero', t)} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Complemento" value={f.complemento} onChangeText={(t) => muda('complemento', t)} />
        </View>
      </View>
      <Campo rotulo="Bairro ou localidade" value={f.bairro} onChangeText={(t) => muda('bairro', t)} autoCapitalize="words" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Município" value={f.municipio} onChangeText={(t) => muda('municipio', t)} autoCapitalize="words" />
        </View>
        <View style={{ width: 84 }}>
          <Campo
            rotulo="UF"
            value={f.uf}
            onChangeText={(t) => muda('uf', t.replace(/[^A-Za-z]/g, '').toUpperCase())}
            autoCapitalize="characters"
            maxLength={2}
            erro={erros.uf}
          />
        </View>
      </View>

      <Secao titulo="Dados bancários" />
      <Campo rotulo="Banco" value={f.banco} onChangeText={(t) => muda('banco', t)} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Agência" value={f.agencia} onChangeText={(t) => muda('agencia', t)} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Conta" value={f.conta} onChangeText={(t) => muda('conta', t)} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Campo rotulo="Chave PIX" value={f.pix} onChangeText={(t) => muda('pix', t)} autoCapitalize="none" autoCorrect={false} />

      <Secao titulo="Outros" />
      <Campo
        rotulo="Observações"
        value={f.observacoes}
        onChangeText={(t) => muda('observacoes', t)}
        multiline
        style={{ minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }}
      />
      {id && <Interruptor rotulo="Ativo" descricao="Inativos não aparecem para escolher em novos lançamentos." valor={f.ativo} aoMudar={(v) => muda('ativo', v)} />}

      <Botao titulo={id ? 'Salvar alterações' : 'Cadastrar'} onPress={salvar} carregando={salvando} />
      {id && <Botao titulo="Excluir pessoa" tipo="perigo" onPress={excluir} />}
        </>
      )}
    </Tela>
  );
}
