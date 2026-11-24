import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Tela from '../../componentes/Tela';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Escolha from '../../componentes/Escolha';
import Busca from '../../componentes/Busca';
import Aviso from '../../componentes/Aviso';
import Secao from '../../componentes/Secao';
import Lista from '../../componentes/Lista';
import Linha from '../../componentes/Linha';
import { ChuvaCampo, PesagemCampo, TransferenciaCampo, TratoCampo } from './CampoManejo';
import { CioCampo, FotosCampo, MorteCampo, NascimentoCampo, SanidadeCampo, SumidoCampo } from './CampoAnimais';
import { confirmarSaida } from '../../componentes/Cabecalho';
import { useSessao } from '../../contexto/SessaoContext';
import { doBanco } from '../../lib/datas';
import { formatarNumero } from '../../lib/formatos';
import { traduzirErro } from '../../lib/supabase';
import { VERSAO_APP } from '../../config';
import {
  NOTAS, apagarDaFila, baixarPacote, enviarFila, lancar, lerEnviados, lerFila, pacoteGuardado, quandoFoi, textoIdade,
  type AnimalCampo, type FotoLocal, type LoteCampo, type PacoteCampo, type RegistroCampo,
} from '../../lib/campo';
import { FAIXAS_IDADE, chaveFaixa, faixaPorChave, type Sexo } from '../../lib/faixas';
import { cores, tam } from '../../tema';

type NomeIcone = React.ComponentProps<typeof Ionicons>['name'];
type Pagina =
  | { p: 'inicio' }
  | { p: 'lotes' }
  | { p: 'lote'; id: string }
  | { p: 'animais' }
  | { p: 'animal'; id: string }
  | { p: 'mangas' }
  | { p: 'contagem'; loteId?: string }
  | { p: 'vistoria'; mangaId?: string }
  | { p: 'tarefas' }
  | { p: 'fila' }
  | { p: 'sanidade' }
  | { p: 'nascimento' }
  | { p: 'morte' }
  | { p: 'sumido' }
  | { p: 'cio' }
  | { p: 'pesagem' }
  | { p: 'transferencia' }
  | { p: 'trato' }
  | { p: 'chuva' };

const SEXO: Record<string, string> = { M: 'Macho', F: 'Fêmea' };
const sexoLote = (l: LoteCampo) => (l.machos && l.femeas ? `${l.machos} M · ${l.femeas} F` : l.sexo ? (l.sexo === 'M' ? 'Machos' : 'Fêmeas') : '');

/**
 * V184 – Modo Vaqueiro: o que o vaqueiro usa no campo, com ou sem sinal.
 * Consulta lotes, animais e mangas (guardados no celular); lança contagem, vistoria da manga e tarefa cumprida.
 * V188: contagem sem lote (sexo, idade provável e raça, em um ou mais grupos).
 * Os lançamentos ficam numa fila no celular e vão sozinhos quando houver sinal; no sistema, ficam pendentes até o gerente conferir.
 */
export default function ModoVaqueiro() {
  const { fazendas, fazendaAtiva, trocarFazenda, sair } = useSessao();
  const fid = fazendaAtiva?.id ?? null;
  const [pg, setPg] = useState<Pagina>({ p: 'inicio' });
  const [pacote, setPacote] = useState<PacoteCampo | null>(null);
  const [fila, setFila] = useState<RegistroCampo[]>([]);
  const [enviados, setEnviados] = useState<RegistroCampo[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const lerLocal = useCallback(async () => {
    setFila(await lerFila());
    setEnviados(await lerEnviados());
  }, []);

  /** Envia a fila e baixa os dados novos. Sem sinal, fica com o que está guardado. */
  const sincronizar = useCallback(
    async (mostrar = false) => {
      if (!fid) return;
      setAtualizando(true);
      try {
        const r = await enviarFila();
        const p = await baixarPacote(fid);
        setPacote(p);
        setOnline(true);
        if (mostrar) setAviso(r.enviados ? `${r.enviados} ${r.enviados === 1 ? 'lançamento enviado' : 'lançamentos enviados'} e dados atualizados.` : 'Dados atualizados.');
        if (r.erros) setErro(`${r.erros} ${r.erros === 1 ? 'lançamento foi recusado' : 'lançamentos foram recusados'} pelo sistema: veja em "Fila".`);
      } catch (e) {
        const msg = traduzirErro(e);
        const semSinal = /fetch|network|failed|internet|timeout|load/i.test(msg);
        setOnline(semSinal ? false : true);
        if (mostrar) setErro(semSinal ? 'Sem sinal agora. Os lançamentos ficam guardados no celular e vão sozinhos quando o sinal voltar.' : msg);
      } finally {
        setAtualizando(false);
        lerLocal();
      }
    },
    [fid, lerLocal],
  );

  // abre com o que está guardado e já tenta atualizar
  useEffect(() => {
    if (!fid) return;
    pacoteGuardado(fid).then(setPacote);
    lerLocal();
    sincronizar();
  }, [fid, lerLocal, sincronizar]);

  // tenta de novo a cada 2 minutos, quando o app volta para a frente e quando o navegador avisa que o sinal voltou
  useEffect(() => {
    const t = setInterval(() => sincronizar(), 120_000);
    const sub = AppState.addEventListener('change', (e) => e === 'active' && sincronizar());
    const w = Platform.OS === 'web' ? (globalThis as any) : null;
    const voltou = () => sincronizar();
    const caiu = () => setOnline(false);
    w?.addEventListener?.('online', voltou);
    w?.addEventListener?.('offline', caiu);
    return () => {
      clearInterval(t);
      sub.remove();
      w?.removeEventListener?.('online', voltou);
      w?.removeEventListener?.('offline', caiu);
    };
  }, [sincronizar]);

  const voltar = () => {
    setErro(null);
    setAviso(null);
    setPg(pg.p === 'lote' ? { p: 'lotes' } : pg.p === 'animal' ? { p: 'animais' } : { p: 'inicio' });
  };
  const ir = (x: Pagina) => {
    setErro(null);
    setAviso(null);
    setPg(x);
  };

  /** Lançou: guarda, tenta enviar e volta ao início com o aviso. */
  async function aposLancar(texto: string, enviado: boolean) {
    await lerLocal();
    setPg({ p: 'inicio' });
    setErro(null);
    setAviso(enviado ? `${texto} Enviado ao sistema: fica pendente até o gerente conferir.` : `${texto} Guardado no celular: vai sozinho quando houver sinal.`);
    if (enviado) setOnline(true);
  }

  const titulo: Record<Pagina['p'], string> = {
    inicio: 'Modo Vaqueiro', lotes: 'Lotes', lote: 'Lote', animais: 'Animais', animal: 'Animal', mangas: 'Mangas',
    contagem: 'Contagem', vistoria: 'Vistoria da manga', tarefas: 'Tarefas', fila: 'Lançamentos',
    sanidade: 'Sanidade', nascimento: 'Nascimento', morte: 'Morte', sumido: 'Sumido ou achado', cio: 'Cio', pesagem: 'Pesagem', transferencia: 'Transferência', trato: 'Trato do dia', chuva: 'Chuva',
  };

  return (
    <Tela comCabecalho={false}>
      {/* ---------- topo ---------- */}
      <View style={estilos.topo}>
        {pg.p !== 'inicio' ? (
          <Pressable onPress={voltar} style={estilos.voltar} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={26} color={cores.primaria} />
            <Text style={estilos.voltarTexto}>Voltar</Text>
          </Pressable>
        ) : (
          <Ionicons name="person-circle-outline" size={30} color={cores.primaria} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={estilos.topoTitulo}>{titulo[pg.p]}</Text>
          <Text style={estilos.topoFazenda}>{fazendaAtiva?.nome ?? ''}</Text>
        </View>
        <View style={[estilos.sinal, { backgroundColor: online === false ? cores.erroFundo : online ? cores.sucessoFundo : cores.infoFundo }]}>
          <Ionicons name={online === false ? 'cloud-offline-outline' : 'cloud-done-outline'} size={18} color={online === false ? cores.erro : cores.primaria} />
          <Text style={[estilos.sinalTexto, { color: online === false ? cores.erro : cores.primaria }]}>{online === false ? 'Sem sinal' : online ? 'Com sinal' : '...'}</Text>
        </View>
      </View>

      {erro && <Aviso tipo="erro" texto={erro} />}
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}

      {!pacote && pg.p !== 'inicio' ? (
        <Aviso tipo="info" texto="Ainda não há dados guardados neste celular. Com sinal, toque em Atualizar no início." />
      ) : pg.p === 'inicio' ? (
        <Inicio
          pacote={pacote}
          fila={fila}
          atualizando={atualizando}
          fazendas={fazendas.map((f) => ({ valor: f.id, rotulo: f.nome }))}
          fid={fid}
          trocar={trocarFazenda}
          ir={ir}
          atualizar={() => sincronizar(true)}
          sair={() => confirmarSaida(sair)}
        />
      ) : pg.p === 'lotes' ? (
        <Lotes pacote={pacote!} abrir={(id) => ir({ p: 'lote', id })} />
      ) : pg.p === 'lote' ? (
        <LoteVer pacote={pacote!} id={pg.id} abrirAnimal={(id) => ir({ p: 'animal', id })} contar={() => ir({ p: 'contagem', loteId: pg.id })} />
      ) : pg.p === 'animais' ? (
        <Animais pacote={pacote!} abrir={(id) => ir({ p: 'animal', id })} />
      ) : pg.p === 'animal' ? (
        <AnimalVer pacote={pacote!} id={pg.id} />
      ) : pg.p === 'mangas' ? (
        <Mangas pacote={pacote!} vistoriar={(id) => ir({ p: 'vistoria', mangaId: id })} />
      ) : pg.p === 'contagem' ? (
        <Contagem pacote={pacote!} loteInicial={pg.loteId} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'vistoria' ? (
        <Vistoria pacote={pacote!} mangaInicial={pg.mangaId} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'sanidade' ? (
        <SanidadeCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'nascimento' ? (
        <NascimentoCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'morte' ? (
        <MorteCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'sumido' ? (
        <SumidoCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'pesagem' ? (
        <PesagemCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'trato' ? (
        <TratoCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'chuva' ? (
        <ChuvaCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'transferencia' ? (
        <TransferenciaCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'cio' ? (
        <CioCampo pacote={pacote!} aoLancar={aposLancar} aoErro={setErro} />
      ) : pg.p === 'tarefas' ? (
        <Tarefas pacote={pacote!} fila={fila} aoLancar={aposLancar} aoErro={setErro} />
      ) : (
        <Fila fila={fila} enviados={enviados} enviar={() => sincronizar(true)} apagar={async (id) => { await apagarDaFila(id); lerLocal(); }} />
      )}

      {pg.p === 'inicio' && <Text style={estilos.rodape}>Fazenda Digital {VERSAO_APP}</Text>}
    </Tela>
  );
}

// ======================================================================= início
function Inicio(props: {
  pacote: PacoteCampo | null; fila: RegistroCampo[]; atualizando: boolean; fazendas: { valor: string; rotulo: string }[];
  fid: string | null; trocar: (id: string) => void; ir: (p: Pagina) => void; atualizar: () => void; sair: () => void;
}) {
  const { pacote, fila } = props;
  const nTar = pacote?.tarefas.length ?? 0;
  const cab = pacote?.lotes.reduce((s, l) => s + l.cabecas, 0) ?? 0;
  return (
    <>
      {props.fazendas.length > 1 && <Escolha rotulo="Fazenda" opcoes={props.fazendas} valor={props.fid ? [props.fid] : []} aoMudar={(v) => v[0] && props.trocar(v[0])} />}
      <View style={estilos.estado}>
        <Text style={estilos.estadoTexto}>
          {pacote ? `Dados de ${quandoFoi(pacote.gerado_em)} · ${pacote.lotes.length} lotes · ${formatarNumero(cab)} cabeças` : 'Sem dados guardados ainda'}
        </Text>
        <Text style={[estilos.estadoTexto, fila.length ? { color: cores.cafe, fontWeight: '800' } : null]}>
          {fila.length ? `${fila.length} ${fila.length === 1 ? 'lançamento esperando sinal' : 'lançamentos esperando sinal'}` : 'Nada esperando para enviar'}
        </Text>
        <Botao titulo="Atualizar agora" tipo="secundario" onPress={props.atualizar} carregando={props.atualizando} />
      </View>

      <Secao titulo="Lançar" />
      <View style={estilos.grade}>
        <Bloco icone="calculator-outline" titulo="Contagem" detalhe="Contar o lote na manga" onPress={() => props.ir({ p: 'contagem' })} />
        <Bloco icone="clipboard-outline" titulo="Vistoria" detalhe="Água, cocho, capim e cerca" onPress={() => props.ir({ p: 'vistoria' })} />
        <Bloco icone="restaurant-outline" titulo="Trato do dia" detalhe={pacote?.dietas?.length ? `${pacote.dietas.length} lote(s) com dieta` : 'Dieta e cocho'} onPress={() => props.ir({ p: 'trato' })} />
        <Bloco icone="rainy-outline" titulo="Chuva" detalhe="Pluviômetro" onPress={() => props.ir({ p: 'chuva' })} />
        <Bloco icone="speedometer-outline" titulo="Pesagem" detalhe="Pesar o lote" onPress={() => props.ir({ p: 'pesagem' })} />
        <Bloco icone="swap-horizontal-outline" titulo="Transferência" detalhe="Manga ou lote" onPress={() => props.ir({ p: 'transferencia' })} />
        <Bloco icone="medkit-outline" titulo="Sanidade" detalhe="Aplicou ou viu doença" onPress={() => props.ir({ p: 'sanidade' })} />
        <Bloco icone="heart-outline" titulo="Nascimento" detalhe="Bezerro e parto" onPress={() => props.ir({ p: 'nascimento' })} />
        <Bloco icone="close-circle-outline" titulo="Morte" detalhe="Com foto" onPress={() => props.ir({ p: 'morte' })} />
        <Bloco icone="help-circle-outline" titulo="Sumido / Achado" detalhe="Animal que sumiu ou apareceu" onPress={() => props.ir({ p: 'sumido' })} />
        <Bloco icone="flower-outline" titulo="Cio" detalhe="Para inseminar ou cobrir" onPress={() => props.ir({ p: 'cio' })} />
        <Bloco icone="checkbox-outline" titulo="Tarefas" detalhe={nTar ? `${nTar} em aberto` : 'Nenhuma em aberto'} destaque={nTar > 0} onPress={() => props.ir({ p: 'tarefas' })} />
      </View>
      <Secao titulo="Consultar" />
      <View style={estilos.grade}>
        <Bloco icone="albums-outline" titulo="Lotes" detalhe={pacote ? `${pacote.lotes.length} lotes` : ''} onPress={() => props.ir({ p: 'lotes' })} />
        <Bloco icone="paw-outline" titulo="Animais" detalhe="Por brinco ou número" onPress={() => props.ir({ p: 'animais' })} />
        <Bloco icone="map-outline" titulo="Mangas" detalhe={pacote ? `${pacote.mangas.length} mangas` : ''} onPress={() => props.ir({ p: 'mangas' })} />
        <Bloco icone="cloud-upload-outline" titulo="Lançamentos" detalhe={fila.length ? `${fila.length} na fila` : 'Enviados'} destaque={fila.some((f) => f.erro)} onPress={() => props.ir({ p: 'fila' })} />
      </View>
      <Text style={estilos.nota}>
        Antes de ir para o pasto, abra com sinal para atualizar. Sem sinal, tudo o que lançar fica guardado no celular e vai sozinho quando o sinal voltar.
      </Text>
      <Botao titulo="Sair" tipo="perigo" onPress={props.sair} />
    </>
  );
}

function Bloco({ icone, titulo, detalhe, onPress, destaque }: { icone: NomeIcone; titulo: string; detalhe?: string; onPress: () => void; destaque?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [estilos.bloco, destaque && { borderColor: cores.cafe }, pressed && { backgroundColor: '#F3F6F2' }]}>
      <Ionicons name={icone} size={34} color={destaque ? cores.cafe : cores.primaria} />
      <Text style={estilos.blocoTitulo}>{titulo}</Text>
      {!!detalhe && <Text style={estilos.blocoDetalhe}>{detalhe}</Text>}
    </Pressable>
  );
}

// ======================================================================= consultas
function Lotes({ pacote, abrir }: { pacote: PacoteCampo; abrir: (id: string) => void }) {
  const [busca, setBusca] = useState('');
  const t = busca.trim().toLowerCase();
  const lista = pacote.lotes.filter((l) => !t || String(l.numero) === t || `${l.numero} ${l.descricao ?? ''} ${l.manga ?? ''} ${l.raca ?? ''}`.toLowerCase().includes(t));
  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Nº do lote, manga ou raça" />
      {lista.length === 0 ? (
        <Text style={estilos.dica}>Nenhum lote{t ? ` com "${busca}"` : ''}.</Text>
      ) : (
        <Lista>
          {lista.map((l) => (
            <Linha
              key={l.id}
              titulo={`Lote ${l.numero}${l.descricao ? ` · ${l.descricao}` : ''}`}
              linhas={[[sexoLote(l), l.raca, l.ferro ? `ferro ${l.ferro}` : null].filter(Boolean).join(' · '), l.manga ? `Manga ${l.manga}` : 'Sem manga', l.proprietario === 'terceiro' ? `De terceiro${l.dono_terceiro ? `: ${l.dono_terceiro}` : ''}` : null]}
              direita={`${formatarNumero(l.cabecas)} cab.`}
              onPress={() => abrir(l.id)}
            />
          ))}
        </Lista>
      )}
    </>
  );
}

function LoteVer({ pacote, id, abrirAnimal, contar }: { pacote: PacoteCampo; id: string; abrirAnimal: (id: string) => void; contar: () => void }) {
  const l = pacote.lotes.find((x) => x.id === id);
  const animais = useMemo(() => pacote.animais.filter((a) => a.lote_id === id), [pacote, id]);
  const [todos, setTodos] = useState(false);
  if (!l) return <Aviso tipo="erro" texto="Lote não encontrado nos dados guardados. Atualize com sinal." />;
  const comBrinco = animais.filter((a) => a.brinco || a.nome);
  return (
    <>
      <Cartao
        titulo={`Lote ${l.numero}${l.descricao ? ` · ${l.descricao}` : ''}`}
        itens={[
          ['Cabeças', formatarNumero(l.cabecas)],
          ['Sexo', sexoLote(l) || '—'],
          ['Raça', l.raca ?? '—'],
          ['Ferro', l.ferro ?? '—'],
          ['Manga', l.manga ?? 'Sem manga'],
          ['Categoria', l.categoria ?? '—'],
          ...(l.proprietario === 'terceiro' ? ([['Dono', l.dono_terceiro ?? 'Terceiro']] as [string, string][]) : []),
        ]}
      />
      <Botao titulo="Contar este lote" onPress={contar} />
      {comBrinco.length > 0 && (
        <>
          <Secao titulo={`Animais identificados (${comBrinco.length})`} />
          <Lista>
            {(todos ? comBrinco : comBrinco.slice(0, 30)).map((a) => (
              <Linha key={a.id} titulo={a.brinco ?? a.nome ?? `Nº ${a.n}`} linhas={[[a.sexo ? SEXO[a.sexo] : null, textoIdade(a.nasc, a.nasc_aprox)].filter(Boolean).join(' · ')]} direita={a.peso ? `${formatarNumero(Number(a.peso))} kg` : undefined} onPress={() => abrirAnimal(a.id)} />
            ))}
          </Lista>
          {!todos && comBrinco.length > 30 && <Botao titulo={`Ver os ${comBrinco.length}`} tipo="secundario" onPress={() => setTodos(true)} />}
        </>
      )}
      {animais.length > comBrinco.length && <Text style={estilos.nota}>{animais.length - comBrinco.length} sem brinco neste lote.</Text>}
    </>
  );
}

function Animais({ pacote, abrir }: { pacote: PacoteCampo; abrir: (id: string) => void }) {
  const [busca, setBusca] = useState('');
  const t = busca.trim().toUpperCase().replace(/\s+/g, '');
  const lista = t
    ? pacote.animais.filter((a) => String(a.n) === t || (a.brinco ?? '').toUpperCase().replace(/\s+/g, '').includes(t) || (a.nome ?? '').toUpperCase().includes(busca.trim().toUpperCase()) || (a.registro ?? '').toUpperCase().replace(/\s+/g, '').includes(t)).slice(0, 40)
    : [];
  const lote = (id: string | null) => pacote.lotes.find((l) => l.id === id);
  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} dica="Brinco, número, nome ou registro" />
      {!t ? (
        <Text style={estilos.dica}>Digite o brinco ou o número do animal.</Text>
      ) : lista.length === 0 ? (
        <Text style={estilos.dica}>Nenhum animal com "{busca}".</Text>
      ) : (
        <Lista>
          {lista.map((a) => (
            <Linha key={a.id} titulo={a.brinco ?? a.nome ?? `Nº ${a.n}`} linhas={[[a.sexo ? SEXO[a.sexo] : null, a.raca, textoIdade(a.nasc, a.nasc_aprox)].filter(Boolean).join(' · '), lote(a.lote_id) ? `Lote ${lote(a.lote_id)!.numero}${lote(a.lote_id)!.manga ? ` · Manga ${lote(a.lote_id)!.manga}` : ''}` : null]} onPress={() => abrir(a.id)} />
          ))}
        </Lista>
      )}
    </>
  );
}

function AnimalVer({ pacote, id }: { pacote: PacoteCampo; id: string }) {
  const a = pacote.animais.find((x) => x.id === id) as AnimalCampo | undefined;
  if (!a) return <Aviso tipo="erro" texto="Animal não encontrado nos dados guardados." />;
  const l = pacote.lotes.find((x) => x.id === a.lote_id);
  return (
    <Cartao
      titulo={a.brinco ?? a.nome ?? `Nº ${a.n}`}
      itens={[
        ['Nº do sistema', String(a.n)],
        ...(a.nome ? ([['Nome', a.nome]] as [string, string][]) : []),
        ...(a.registro ? ([['Registro', a.registro]] as [string, string][]) : []),
        ['Sexo', a.sexo ? SEXO[a.sexo] : '—'],
        ['Raça', a.raca ?? '—'],
        ['Ferro', a.ferro ?? '—'],
        ['Idade', textoIdade(a.nasc, a.nasc_aprox)],
        ['Último peso', a.peso ? `${formatarNumero(Number(a.peso), 1)} kg${a.peso_data ? ` em ${doBanco(a.peso_data)}` : ''}` : '—'],
        ['Lote', l ? `${l.numero}${l.descricao ? ` · ${l.descricao}` : ''}` : '—'],
        ['Manga', l?.manga ?? '—'],
      ]}
    />
  );
}

function Mangas({ pacote, vistoriar }: { pacote: PacoteCampo; vistoriar: (id: string) => void }) {
  if (!pacote.mangas.length) return <Text style={estilos.dica}>Nenhuma manga cadastrada nesta fazenda.</Text>;
  return (
    <Lista>
      {pacote.mangas.map((m) => {
        const ls = pacote.lotes.filter((l) => l.manga_id === m.id);
        const cab = ls.reduce((s, l) => s + l.cabecas, 0);
        return (
          <Linha
            key={m.id}
            titulo={`Manga ${m.nome}`}
            linhas={[[m.capim, m.area_ha ? `${formatarNumero(Number(m.area_ha), 2)} ha` : null].filter(Boolean).join(' · '), ls.length ? `Lotes: ${ls.map((l) => l.numero).join(', ')}` : 'Vazia']}
            direita={cab ? `${formatarNumero(cab)} cab.` : undefined}
            onPress={() => vistoriar(m.id)}
          />
        );
      })}
    </Lista>
  );
}

function Cartao({ titulo, itens }: { titulo: string; itens: [string, string][] }) {
  return (
    <View style={estilos.cartao}>
      <Text style={estilos.cartaoTitulo}>{titulo}</Text>
      {itens.map(([r, v]) => (
        <View key={r} style={estilos.par}>
          <Text style={estilos.parRotulo}>{r}</Text>
          <Text style={estilos.parValor}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

// ======================================================================= lançamentos
type PropsLancar = { pacote: PacoteCampo; aoLancar: (texto: string, enviado: boolean) => void; aoErro: (m: string | null) => void };

type GrupoContagem = { sexo: string[]; faixa: string[]; raca: string; qtd: string };
const grupoVazio = (): GrupoContagem => ({ sexo: [], faixa: [], raca: '', qtd: '' });

/** V188: sem nº de lote, o vaqueiro informa o gado por grupos (sexo, idade provável, raça e cabeças). */
function Contagem({ pacote, loteInicial, aoLancar, aoErro }: PropsLancar & { loteInicial?: string }) {
  const [numLote, setNumLote] = useState(() => String(pacote.lotes.find((l) => l.id === loteInicial)?.numero ?? ''));
  const [contadas, setContadas] = useState('');
  const [grupos, setGrupos] = useState<GrupoContagem[]>([grupoVazio()]);
  const [mangaId, setMangaId] = useState<string[]>([]);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const semLote = !numLote.trim();
  const lote = pacote.lotes.find((l) => String(l.numero) === numLote.trim());
  useEffect(() => {
    if (lote?.manga_id) setMangaId([lote.manga_id]);
  }, [lote?.id]);

  // raças para escolher: as do cadastro e as que já aparecem nos lotes e animais da fazenda
  const racas = useMemo(() => {
    const s = new Set<string>(pacote.racas ?? []);
    pacote.lotes.forEach((l) => l.raca && s.add(l.raca));
    pacote.animais.forEach((a) => a.raca && s.add(a.raca));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [pacote]);

  const mudar = (i: number, x: Partial<GrupoContagem>) => setGrupos((g) => g.map((y, j) => (j === i ? { ...y, ...x } : y)));
  const totalGrupos = grupos.reduce((s, g) => s + (Number(g.qtd) || 0), 0);

  async function salvar() {
    aoErro(null);
    const manga = pacote.mangas.find((m) => m.id === mangaId[0]);
    if (semLote) {
      for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i];
        const q = grupos.length > 1 ? ` (grupo ${i + 1})` : '';
        if (!g.sexo[0]) return aoErro(`Marque o sexo${q}.`);
        if (!g.faixa[0]) return aoErro(`Marque a idade provável${q}.`);
        if (!g.raca.trim()) return aoErro(`Informe a raça${q}.`);
        if (!(Number(g.qtd) > 0)) return aoErro(`Informe quantas cabeças${q}.`);
      }
      setSalvando(true);
      const dados = grupos.map((g) => {
        const f = faixaPorChave(g.faixa[0])!;
        return { sexo: g.sexo[0], faixa: f.rotulo, faixa_de: f.de, faixa_ate: f.ate, raca: g.raca.trim(), qtd: Number(g.qtd) };
      });
      const resumo = `Contagem sem lote${manga ? ` na manga ${manga.nome}` : ''}: ${totalGrupos} cab.`;
      const r = await lancar({ fazenda_id: pacote.fazenda.id, tipo: 'contagem', dados: { lote_id: null, manga_id: manga?.id ?? null, grupos: dados, contadas: totalGrupos, obs: obs.trim() }, fotos: [], resumo });
      setSalvando(false);
      return aoLancar(`${resumo} O gerente recebe o aviso para identificar o gado.`, r.enviado);
    }
    if (!lote) return aoErro('Lote não encontrado. Confira o nº, ou deixe em branco para contar gado sem lote.');
    const n = Number(contadas);
    if (!contadas.trim() || !Number.isInteger(n) || n < 0) return aoErro('Informe quantas cabeças você contou.');
    setSalvando(true);
    const confere = n === lote.cabecas;
    const resumo = `Contagem do lote ${lote.numero}${manga ? ` na manga ${manga.nome}` : ''}: ${n} cab.`;
    const r = await lancar({ fazenda_id: pacote.fazenda.id, tipo: 'contagem', dados: { lote_id: lote.id, manga_id: manga?.id ?? null, contadas: n, obs: obs.trim() }, fotos: [], resumo });
    setSalvando(false);
    aoLancar(
      `Contagem do lote ${lote.numero}: ${n} cab. ${confere ? 'Confere com o sistema.' : `O sistema tem ${lote.cabecas} (${n > lote.cabecas ? 'sobram' : 'faltam'} ${Math.abs(n - lote.cabecas)}): o gerente recebe o aviso.`}`,
      r.enviado,
    );
  }

  return (
    <>
      <Campo
        rotulo="Nº do lote"
        value={numLote}
        onChangeText={(t) => setNumLote(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        ajuda={lote ? `Lote ${lote.numero}${lote.descricao ? ` · ${lote.descricao}` : ''} · ${sexoLote(lote)}` : numLote ? 'Lote não encontrado' : 'Em branco = gado sem lote (informe sexo, idade e raça abaixo)'}
      />
      {semLote && pacote.lotes.length > 0 && (
        <View style={estilos.chips}>
          {pacote.lotes.slice(0, 20).map((l) => (
            <Pressable key={l.id} onPress={() => setNumLote(String(l.numero))} style={estilos.chip}>
              <Text style={estilos.chipTexto}>{l.numero}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {pacote.mangas.length > 0 && <Escolha rotulo="Manga onde contou" opcoes={pacote.mangas.map((m) => ({ valor: m.id, rotulo: m.nome }))} valor={mangaId} aoMudar={setMangaId} />}

      {semLote ? (
        <>
          <Secao titulo="Gado sem lote" />
          {grupos.map((g, i) => {
            const sx = g.sexo[0] as Sexo | undefined;
            const busca = g.raca.trim().toLowerCase();
            const sugestoes = (busca ? racas.filter((r) => r.toLowerCase().includes(busca) && r.toLowerCase() !== busca) : racas).slice(0, 10);
            return (
              <View key={i} style={estilos.cartao}>
                {grupos.length > 1 && <Text style={estilos.cartaoTitulo}>Grupo {i + 1}</Text>}
                <Escolha rotulo="Sexo *" opcoes={[{ valor: 'M', rotulo: 'Macho' }, { valor: 'F', rotulo: 'Fêmea' }]} valor={g.sexo} aoMudar={(v) => mudar(i, { sexo: v, faixa: [] })} />
                {sx && (
                  <Escolha
                    rotulo="Idade provável *"
                    opcoes={FAIXAS_IDADE[sx].map((f) => ({ valor: chaveFaixa(f), rotulo: f.rotulo }))}
                    valor={g.faixa}
                    aoMudar={(v) => mudar(i, { faixa: v })}
                  />
                )}
                <Campo rotulo="Raça *" value={g.raca} onChangeText={(t) => mudar(i, { raca: t })} placeholder="Ex.: Nelore, Anelorado, Girolando" />
                {sugestoes.length > 0 && (
                  <View style={estilos.chips}>
                    {sugestoes.map((r) => (
                      <Pressable key={r} onPress={() => mudar(i, { raca: r })} style={estilos.chip}>
                        <Text style={estilos.chipTexto}>{r}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <Campo rotulo="Cabeças *" value={g.qtd} onChangeText={(t) => mudar(i, { qtd: t.replace(/\D/g, '').slice(0, 5) })} keyboardType="number-pad" style={{ fontSize: 24, fontWeight: '800' }} />
                {grupos.length > 1 && <Botao titulo="Tirar este grupo" tipo="secundario" onPress={() => setGrupos((x) => x.filter((_, j) => j !== i))} />}
              </View>
            );
          })}
          <Botao titulo="+ Outro grupo (outro sexo, idade ou raça)" tipo="secundario" onPress={() => setGrupos((x) => [...x, grupoVazio()])} />
          {grupos.length > 1 && <Text style={[estilos.cartaoTitulo, { textAlign: 'center' }]}>Total: {formatarNumero(totalGrupos)} cab.</Text>}
        </>
      ) : (
        <Campo rotulo="Cabeças contadas *" value={contadas} onChangeText={(t) => setContadas(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" style={{ fontSize: 28, fontWeight: '800' }} />
      )}
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline placeholder="Ex.: uma vaca mancando, cerca aberta no fundo" />
      <Text style={estilos.nota}>
        {semLote ? 'Gado sem lote vai como aviso para o gerente identificar e cadastrar.' : 'Conte sem olhar o número do sistema: a comparação aparece depois de lançar.'}
      </Text>
      <Botao titulo="Lançar contagem" onPress={salvar} carregando={salvando} />
    </>
  );
}

function Vistoria({ pacote, mangaInicial, aoLancar, aoErro }: PropsLancar & { mangaInicial?: string }) {
  const [mangaId, setMangaId] = useState<string[]>(mangaInicial ? [mangaInicial] : []);
  const [agua, setAgua] = useState<string[]>([]);
  const [cocho, setCocho] = useState<string[]>([]);
  const [capim, setCapim] = useState<string[]>([]);
  const [cerca, setCerca] = useState<string[]>([]);
  const [sal, setSal] = useState('');
  const sais = pacote.sais ?? [];
  const [salId, setSalId] = useState<string[]>(sais.length === 1 ? [sais[0].id] : []);
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [salvando, setSalvando] = useState(false);

  if (!pacote.mangas.length) return <Text style={estilos.dica}>Nenhuma manga cadastrada nesta fazenda.</Text>;

  async function salvar() {
    aoErro(null);
    const manga = pacote.mangas.find((m) => m.id === mangaId[0]);
    if (!manga) return aoErro('Escolha a manga.');
    if (!agua[0] || !cocho[0] || !capim[0] || !cerca[0]) return aoErro('Marque Água, Cocho, Capim e Cerca.');
    const sacos = sal.trim() ? Number(sal.replace(',', '.')) : 0;
    if (sal.trim() && !(sacos >= 0)) return aoErro('Sacos de sal inválido.');
    setSalvando(true);
    const ruins = [['Água', agua[0]], ['Cocho', cocho[0]], ['Capim', capim[0]], ['Cerca', cerca[0]]].filter(([, v]) => v === 'ruim').map(([k]) => k);
    const r = await lancar({
      fazenda_id: pacote.fazenda.id,
      tipo: 'vistoria',
      dados: { manga_id: manga.id, agua: agua[0], cocho: cocho[0], capim: capim[0], cerca: cerca[0], sal_sacos: sacos || null, sal_insumo_id: sacos ? salId[0] ?? null : null, sal_qtd: sacos || null, obs: obs.trim() },
      fotos: [],
      resumo: `Vistoria da manga ${manga.nome}${ruins.length ? ` (${ruins.join(', ')} ruim)` : ''}`,
    }, fotos);
    setSalvando(false);
    aoLancar(`Vistoria da manga ${manga.nome} lançada.${ruins.length ? ` ${ruins.join(', ')} ruim: o gerente recebe o aviso na agenda.` : ''}`, r.enviado);
  }

  return (
    <>
      <Escolha rotulo="Manga *" opcoes={pacote.mangas.map((m) => ({ valor: m.id, rotulo: m.nome }))} valor={mangaId} aoMudar={setMangaId} />
      <Escolha rotulo="Água (aguada, bebedouro) *" opcoes={NOTAS} valor={agua} aoMudar={setAgua} />
      <Escolha rotulo="Cocho *" opcoes={NOTAS} valor={cocho} aoMudar={setCocho} />
      <Escolha rotulo="Capim *" opcoes={NOTAS} valor={capim} aoMudar={setCapim} />
      <Escolha rotulo="Cerca *" opcoes={NOTAS} valor={cerca} aoMudar={setCerca} />
      {sais.length > 1 && <Escolha rotulo="Sal mineral colocado" opcoes={sais.map((x) => ({ valor: x.id, rotulo: x.nome }))} valor={salId} aoMudar={setSalId} />}
      <Campo
        rotulo={`Sal no cocho (${sais.find((x) => x.id === salId[0])?.unidade ?? 'sacos'} colocados)`}
        value={sal}
        onChangeText={(t) => setSal(t.replace(/[^\d,]/g, '').slice(0, 5))}
        keyboardType="decimal-pad"
        placeholder="Em branco = não colocou"
        ajuda={salId[0] ? 'Ao confirmar, baixa do estoque.' : sais.length ? 'Escolha o sal para baixar do estoque.' : 'Sem sal mineral no cadastro: fica só anotado.'}
      />
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline placeholder="O que viu de diferente" />
      <FotosCampo fotos={fotos} aoMudar={setFotos} aoErro={(m) => aoErro(m)} rotulo="Foto da manga" />
      <Botao titulo="Lançar vistoria" onPress={salvar} carregando={salvando} />
    </>
  );
}

function Tarefas({ pacote, fila, aoLancar, aoErro }: PropsLancar & { fila: RegistroCampo[] }) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const jaMarcadas = new Set(fila.filter((f) => f.tipo === 'tarefa_feita').map((f) => String((f.dados as any).item_id)));
  const lista = pacote.tarefas.filter((t) => !jaMarcadas.has(t.id));
  const hoje = new Date().toISOString().slice(0, 10);
  async function cumprir(t: { id: string; titulo: string }) {
    aoErro(null);
    setSalvando(t.id);
    const r = await lancar({ fazenda_id: pacote.fazenda.id, tipo: 'tarefa_feita', dados: { item_id: t.id, titulo: t.titulo }, fotos: [], resumo: `Tarefa cumprida: ${t.titulo}` });
    setSalvando(null);
    aoLancar(`Tarefa "${t.titulo}" marcada como cumprida.`, r.enviado);
  }
  if (!lista.length) return <Text style={estilos.dica}>Nenhuma tarefa em aberto na agenda da fazenda.{'\n'}As tarefas que o gerente anotar aparecem aqui.</Text>;
  return (
    <>
      {lista.map((t) => (
        <View key={t.id} style={[estilos.cartao, t.data < hoje && { borderColor: cores.erro }]}>
          <Text style={[estilos.tarefaData, t.data < hoje && { color: cores.erro }]}>{t.data < hoje ? `Atrasada · ${doBanco(t.data)}` : t.data === hoje ? 'Hoje' : doBanco(t.data)}</Text>
          <Text style={estilos.cartaoTitulo}>{t.titulo}</Text>
          {!!t.obs && <Text style={estilos.nota}>{t.obs}</Text>}
          {!!t.autor && <Text style={estilos.nota}>De: {t.autor}</Text>}
          <Botao titulo="Cumprida" onPress={() => cumprir(t)} carregando={salvando === t.id} />
        </View>
      ))}
    </>
  );
}

function Fila({ fila, enviados, enviar, apagar }: { fila: RegistroCampo[]; enviados: RegistroCampo[]; enviar: () => void; apagar: (id: string) => void }) {
  return (
    <>
      <Secao titulo={`Esperando sinal (${fila.length})`} />
      {fila.length === 0 ? (
        <Text style={estilos.dica}>Nada na fila.</Text>
      ) : (
        <>
          {fila.map((r) => (
            <View key={r.id} style={[estilos.cartao, r.erro && { borderColor: cores.erro }]}>
              <Text style={estilos.cartaoTitulo}>{r.resumo}</Text>
              <Text style={estilos.nota}>
                Lançado em {quandoFoi(r.feito_em)}
                {r.fotosLocais?.length ? ` · ${r.fotosLocais.length} foto(s) guardada(s) no celular` : ''}
              </Text>
              {!!r.erro && (
                <>
                  <Text style={[estilos.nota, { color: cores.erro, fontWeight: '700' }]}>Recusado: {r.erro}</Text>
                  <Botao titulo="Apagar da fila" tipo="perigo" onPress={() => apagar(r.id)} />
                </>
              )}
            </View>
          ))}
          <Botao titulo="Enviar agora" onPress={enviar} />
        </>
      )}
      {enviados.length > 0 && (
        <>
          <Secao titulo="Enviados (últimos)" />
          <Lista>
            {enviados.slice(0, 20).map((r) => (
              <Linha key={r.id} titulo={r.resumo} linhas={[`Lançado em ${quandoFoi(r.feito_em)}`]} onPress={() => undefined} />
            ))}
          </Lista>
        </>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingRight: 8 },
  voltarTexto: { fontSize: tam.texto, color: cores.primaria, fontWeight: '700' },
  topoTitulo: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.primariaEscura },
  topoFazenda: { fontSize: tam.pequeno, color: cores.textoSuave },
  sinal: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  sinalTexto: { fontSize: tam.pequeno, fontWeight: '700' },
  estado: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  estadoTexto: { fontSize: tam.pequeno + 1, color: cores.textoSuave },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bloco: { flexGrow: 1, flexBasis: '45%', minHeight: 118, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 2, borderColor: cores.borda, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 4 },
  blocoTitulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto },
  blocoDetalhe: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
  dica: { fontSize: tam.texto, color: cores.textoSuave, textAlign: 'center', lineHeight: 24, marginTop: 8 },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  rodape: { fontSize: tam.pequeno, color: cores.textoSuave, textAlign: 'center' },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 14, gap: 6 },
  cartaoTitulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto },
  par: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#EEF1EC', paddingTop: 6 },
  parRotulo: { fontSize: tam.texto, color: cores.textoSuave },
  parValor: { fontSize: tam.texto, color: cores.texto, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 56, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: cores.primaria, backgroundColor: cores.cartao },
  chipTexto: { fontSize: tam.texto, fontWeight: '800', color: cores.primaria },
  tarefaData: { fontSize: tam.pequeno, fontWeight: '800', color: cores.cafe },
});
