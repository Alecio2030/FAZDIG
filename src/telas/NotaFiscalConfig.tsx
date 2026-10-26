import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import Tela from '../componentes/Tela';
import Aviso from '../componentes/Aviso';
import Botao from '../componentes/Botao';
import Campo from '../componentes/Campo';
import CampoSenha from '../componentes/CampoSenha';
import Escolha from '../componentes/Escolha';
import Secao from '../componentes/Secao';
import { useSessao } from '../contexto/SessaoContext';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { eDono } from '../lib/acessos';
import type { NavPilha } from '../navegacao/rotas';
import { cores, tam } from '../tema';

type Fiscal = { id: string; nome: string; razao_social: string | null; cpf_cnpj: string | null; inscricao_estadual: string | null; municipio: string | null; uf: string | null };
type Config = {
  ambiente: number;
  serie: number;
  proximo_numero: number;
  crt: number;
  cert_titular: string | null;
  cert_documento: string | null;
  cert_validade: string | null;
  ultimo_teste_em: string | null;
  ultimo_teste_cstat: string | null;
  ultimo_teste_motivo: string | null;
};

const soNumeros = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const diasAte = (iso: string | null) => (iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 86400000) : -1);

/** Mensagem de erro que a função do servidor devolveu (ou uma padrão). */
async function erroDaFuncao(error: unknown, padrao: string): Promise<string> {
  try {
    const j = await (error as any)?.context?.json();
    if (j?.erro) return j.erro;
  } catch {
    /* mantém a padrão */
  }
  return padrao;
}

/** Lê o arquivo escolhido e devolve em base64 (funciona no navegador e no celular). */
async function lerArquivoBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const texto = await new Promise<string>((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result));
    leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(blob);
  });
  return texto.replace(/^data:[^,]*,/, '');
}

/**
 * Mais › Nota fiscal (NF-e) — V156, etapa 1.
 * Por fazenda: os dados fiscais (do cadastro da Fazenda), o certificado A1 do titular, a série e o próximo número,
 * o ambiente (teste ou produção) e o teste de comunicação com a Sefaz. Só o Produtor e o Administrador.
 */
export default function NotaFiscalConfig() {
  const navegacao = useNavigation<NavPilha>();
  const { fazendas, fazendaAtiva } = useSessao();
  const chefe = eDono(fazendaAtiva?.perfil) || fazendas.some((f) => eDono(f.perfil));
  const soFazendas = fazendas.filter((f) => f.tipo === 'fazenda');
  const [fazId, setFazId] = useState<string | null>(fazendaAtiva?.tipo === 'fazenda' ? fazendaAtiva.id : soFazendas[0]?.id ?? null);

  const [fiscal, setFiscal] = useState<Fiscal | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<string[]>([]);

  // certificado
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  // numeração e ambiente
  const [ambiente, setAmbiente] = useState('2');
  const [serie, setSerie] = useState('920');
  const [proximo, setProximo] = useState('1');
  const [crt, setCrt] = useState('3');
  const [gravando, setGravando] = useState(false);
  const [testando, setTestando] = useState(false);

  const carregar = useCallback(async () => {
    if (!fazId) return setCarregando(false);
    setCarregando(true);
    setErro(null);
    try {
      const f = await consulta<Fiscal>(supabase.from('fazendas').select('id, nome, razao_social, cpf_cnpj, inscricao_estadual, municipio, uf').eq('id', fazId).single());
      const c = await consulta<Config | null>(
        supabase
          .from('nfe_config')
          .select('ambiente, serie, proximo_numero, crt, cert_titular, cert_documento, cert_validade, ultimo_teste_em, ultimo_teste_cstat, ultimo_teste_motivo')
          .eq('fazenda_id', fazId)
          .maybeSingle(),
      );
      setFiscal(f);
      setCfg(c);
      setAmbiente(String(c?.ambiente ?? 2));
      setSerie(String(c?.serie ?? 920));
      setProximo(String(c?.proximo_numero ?? 1));
      setCrt(String(c?.crt ?? 3));
    } catch (e: any) {
      setErro(/nfe_config/i.test(String(e?.message ?? '')) ? 'Falta atualizar o banco: rode o arquivo "V156-banco.sql" no Supabase.' : traduzirErro(e));
    }
    setCarregando(false);
  }, [fazId]);

  useFocusEffect(
    useCallback(() => {
      if (chefe) carregar();
    }, [chefe, carregar]),
  );
  useEffect(() => {
    setArquivo(null);
    setSenha('');
    setAviso(null);
    setAlertas([]);
  }, [fazId]);

  async function escolherArquivo() {
    setErro(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      if (!/\.(pfx|p12)$/i.test(a.name ?? '')) return setErro('Escolha o arquivo do certificado A1: termina em .pfx ou .p12.');
      setArquivo({ nome: a.name, base64: await lerArquivoBase64(a.uri) });
    } catch (e: any) {
      setErro(String(e?.message ?? e));
    }
  }

  async function enviarCertificado() {
    if (!fazId) return;
    setErro(null);
    setAviso(null);
    setAlertas([]);
    if (!arquivo) return setErro('Escolha o arquivo do certificado.');
    if (!senha) return setErro('Informe a senha do certificado.');
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('nfe', { body: { acao: 'certificado', fazenda_id: fazId, pfx: arquivo.base64, senha } });
    setEnviando(false);
    if (error) return setErro(await erroDaFuncao(error, 'Não foi possível enviar o certificado agora.'));
    setArquivo(null);
    setSenha('');
    setAviso(`Certificado de ${data.titular} guardado, válido até ${dataBr(data.validade)}. Agora toque em “Testar comunicação com a Sefaz”.`);
    setAlertas(data.avisos ?? []);
    carregar();
  }

  async function gravar() {
    if (!fazId) return;
    setErro(null);
    setAviso(null);
    const s = Number(soNumeros(serie));
    const p = Number(soNumeros(proximo));
    if (!Number.isInteger(s) || s < 0 || s > 999) return setErro('Série: de 0 a 999.');
    if (!Number.isInteger(p) || p < 1) return setErro('Próximo número: a partir de 1.');
    setGravando(true);
    const { error } = await supabase.rpc('salvar_nfe_config', { p_fazenda: fazId, p_ambiente: Number(ambiente), p_serie: s, p_proximo: p, p_crt: Number(crt) });
    setGravando(false);
    if (error) return setErro(traduzirErro(error));
    setAviso(ambiente === '1' ? 'Gravado. ATENÇÃO: em produção as notas valem de verdade.' : 'Gravado. As notas serão de teste (homologação), sem valor fiscal.');
    carregar();
  }

  async function testar() {
    if (!fazId) return;
    setErro(null);
    setAviso(null);
    setTestando(true);
    const { data, error } = await supabase.functions.invoke('nfe', { body: { acao: 'testar', fazenda_id: fazId } });
    setTestando(false);
    if (error) return setErro(await erroDaFuncao(error, 'Não foi possível falar com a Sefaz agora.'));
    if (data.ok) setAviso(`Comunicação com a Sefaz funcionando (${data.ambiente === 1 ? 'produção' : 'homologação'}): ${data.motivo}`);
    else setErro(`A Sefaz respondeu ${data.cStat ?? ''}: ${data.motivo}`);
    carregar();
  }

  if (!chefe) {
    return (
      <Tela>
        <Aviso tipo="info" texto="Só o Produtor ou o Administrador configuram a nota fiscal." />
      </Tela>
    );
  }
  if (!soFazendas.length) {
    return (
      <Tela>
        <Aviso tipo="info" texto="Cadastre uma fazenda primeiro (Mais › Fazendas)." />
      </Tela>
    );
  }

  const faltando = fiscal
    ? [!(fiscal.razao_social || fiscal.nome) && 'nome', !soNumeros(fiscal.cpf_cnpj) && 'CPF/CNPJ', !soNumeros(fiscal.inscricao_estadual) && 'Inscrição Estadual', !fiscal.municipio && 'município', !fiscal.uf && 'UF'].filter(Boolean)
    : [];
  const dias = diasAte(cfg?.cert_validade ?? null);
  const temCert = !!cfg?.cert_validade;
  const docDiferente = temCert && cfg?.cert_documento && soNumeros(fiscal?.cpf_cnpj) && cfg.cert_documento !== soNumeros(fiscal?.cpf_cnpj);

  return (
    <Tela>
      <Text style={estilos.nota}>
        Cada fazenda emite a nota com os seus dados fiscais e o seu certificado digital A1. Comece em homologação (teste da Sefaz, sem valor fiscal) e só passe para produção depois de conferir as primeiras notas.
      </Text>

      {soFazendas.length > 1 && (
        <Escolha rotulo="Fazenda" opcoes={soFazendas.map((f) => ({ valor: f.id, rotulo: f.nome }))} valor={fazId ? [fazId] : []} aoMudar={(v) => setFazId(v[0] ?? null)} />
      )}

      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {alertas.map((a) => (
        <Aviso key={a} tipo="info" texto={a} />
      ))}

      {carregando ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 20 }} />
      ) : (
        <>
          <Secao titulo="Dados fiscais (do cadastro da fazenda)" />
          {fiscal && (
            <View style={estilos.quadro}>
              <Text style={estilos.linha}>
                <Text style={estilos.rotulo}>Emitente: </Text>
                {fiscal.razao_social || fiscal.nome}
              </Text>
              <Text style={estilos.linha}>
                <Text style={estilos.rotulo}>CPF/CNPJ: </Text>
                {fiscal.cpf_cnpj || '—'}
              </Text>
              <Text style={estilos.linha}>
                <Text style={estilos.rotulo}>Inscrição Estadual: </Text>
                {fiscal.inscricao_estadual || '—'}
              </Text>
              <Text style={estilos.linha}>
                <Text style={estilos.rotulo}>Município: </Text>
                {[fiscal.municipio, fiscal.uf].filter(Boolean).join(' - ') || '—'}
              </Text>
            </View>
          )}
          {faltando.length > 0 && <Aviso tipo="erro" texto={`Falta no cadastro da fazenda: ${faltando.join(', ')}. Sem isso a Sefaz não aceita a nota.`} />}
          <Botao titulo="Corrigir dados da fazenda" tipo="secundario" onPress={() => navegacao.push('FazendaForm', {})} />

          <Secao titulo="Certificado digital A1" />
          {temCert ? (
            <View style={estilos.quadro}>
              <Text style={estilos.linha}>
                <Text style={estilos.rotulo}>Titular: </Text>
                {cfg?.cert_titular}
                {cfg?.cert_documento ? ` (${cfg.cert_documento})` : ''}
              </Text>
              <Text style={[estilos.linha, dias <= 30 && { color: cores.erro, fontWeight: '700' }]}>
                <Text style={estilos.rotulo}>Válido até: </Text>
                {dataBr(cfg?.cert_validade ?? null)}
                {dias < 0 ? ' — VENCIDO' : dias <= 30 ? ` — vence em ${dias} dia(s)` : ''}
              </Text>
            </View>
          ) : (
            <Aviso tipo="info" texto="Esta fazenda ainda não tem certificado. Envie o arquivo .pfx do A1 do titular e a senha." />
          )}
          {docDiferente ? <Aviso tipo="erro" texto={`O certificado é do documento ${cfg?.cert_documento}, diferente do CPF/CNPJ da fazenda. A Sefaz recusa a nota assim.`} /> : null}

          <Botao titulo={arquivo ? `Arquivo: ${arquivo.nome}` : temCert ? 'Trocar o certificado (.pfx)' : 'Escolher o certificado (.pfx)'} tipo="secundario" onPress={escolherArquivo} />
          {arquivo && (
            <>
              <CampoSenha rotulo="Senha do certificado" value={senha} onChangeText={setSenha} ajuda="A senha fica guardada cifrada no servidor, junto com o certificado. Ninguém a vê no app." />
              <Botao titulo="Enviar certificado" onPress={enviarCertificado} carregando={enviando} />
            </>
          )}

          <Secao titulo="Numeração e ambiente" />
          <Escolha
            rotulo="Ambiente"
            opcoes={[
              { valor: '2', rotulo: 'Homologação (teste)' },
              { valor: '1', rotulo: 'Produção (vale de verdade)' },
            ]}
            valor={[ambiente]}
            aoMudar={(v) => setAmbiente(v[0] ?? '2')}
          />
          <Campo rotulo="Série" value={serie} onChangeText={setSerie} keyboardType="number-pad" ajuda="Produtor pessoa física (CPF): séries de 920 a 969. Use a que a contabilidade ou a Sefaz indicar." />
          <Campo rotulo="Próximo número da nota" value={proximo} onChangeText={setProximo} keyboardType="number-pad" ajuda="Se a fazenda já emitia NF-e por outro sistema nesta série, continue a partir do último número + 1." />
          <Escolha
            rotulo="Regime tributário"
            opcoes={[
              { valor: '3', rotulo: 'Regime normal' },
              { valor: '1', rotulo: 'Simples Nacional' },
            ]}
            valor={[crt]}
            aoMudar={(v) => setCrt(v[0] ?? '3')}
          />
          <Botao titulo="Gravar numeração e ambiente" onPress={gravar} carregando={gravando} />

          <Secao titulo="Comunicação com a Sefaz" />
          {cfg?.ultimo_teste_em ? (
            <Text style={[estilos.nota, { color: cfg.ultimo_teste_cstat === '107' ? cores.sucesso : cores.erro }]}>
              Último teste em {dataBr(cfg.ultimo_teste_em)}: {cfg.ultimo_teste_cstat === '107' ? 'funcionando' : `${cfg.ultimo_teste_cstat ?? ''} ${cfg.ultimo_teste_motivo ?? ''}`}
            </Text>
          ) : null}
          <Botao titulo="Testar comunicação com a Sefaz" tipo="secundario" onPress={testar} carregando={testando} desabilitado={!temCert} />

          <View style={estilos.ajuda}>
            <Text style={estilos.ajudaTitulo}>O que vem a seguir</Text>
            <Text style={estilos.nota}>• Esta é a etapa 1: deixar cada fazenda pronta para emitir. A emissão das notas (venda de café e de gado, remessas, retornos, transferências e devoluções), o DANFE, o cancelamento e a carta de correção chegam nas próximas versões.</Text>
            <Text style={estilos.nota}>• O certificado A1 vale 1 ano. O sistema avisa quando faltar 30 dias para vencer.</Text>
            <Text style={estilos.nota}>• A fazenda precisa estar credenciada como emissora de NF-e na Sefaz-ES. Se o teste der erro de credenciamento, procure a Agência da Receita Estadual ou a contabilidade.</Text>
          </View>
        </>
      )}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  quadro: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, padding: 12, gap: 4 },
  linha: { fontSize: tam.texto, color: cores.texto },
  rotulo: { fontWeight: '700', color: cores.textoSuave },
  ajuda: { backgroundColor: cores.infoFundo, borderRadius: tam.raio, padding: 12, gap: 6, marginTop: 8 },
  ajudaTitulo: { fontSize: tam.pequeno + 1, fontWeight: '800', color: cores.info },
});
