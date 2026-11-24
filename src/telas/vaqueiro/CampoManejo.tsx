import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Escolha from '../../componentes/Escolha';
import Secao from '../../componentes/Secao';
import { formatarNumero, lerNumero } from '../../lib/formatos';
import { lancar, type AnimalCampo, type PacoteCampo } from '../../lib/campo';
import { BuscaAnimal, type PropsLancar } from './CampoAnimais';
import { cores, tam } from '../../tema';

/** V186 – Modo Vaqueiro: Pesagem e Transferências (manga e lote). Funcionam sem sinal. */

type Pesada = { brinco: string; quantidade: number; peso: number };
const CHAVE_RASCUNHO = 'campo_rascunho_pesagem';

// ------------------------------------------------------------------ pesagem
export function PesagemCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const [numLote, setNumLote] = useState('');
  const [objetivo, setObjetivo] = useState<string[]>(['controle']);
  const [outro, setOutro] = useState('');
  const [arroba, setArroba] = useState('30');
  const [pesadas, setPesadas] = useState<Pesada[]>([]);
  const [brinco, setBrinco] = useState('');
  const [qtd, setQtd] = useState('1');
  const [peso, setPeso] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [lido, setLido] = useState(false);
  const lote = pacote.lotes.find((l) => String(l.numero) === numLote.trim()) ?? null;
  const kgArroba = lerNumero(arroba) ?? 30;

  // o que já foi pesado fica guardado no celular (se o app fechar no meio, continua de onde parou)
  useEffect(() => {
    AsyncStorage.getItem(CHAVE_RASCUNHO)
      .then((t) => {
        if (!t) return;
        const r = JSON.parse(t);
        if (r.fazenda !== pacote.fazenda.id) return;
        setNumLote(r.numLote ?? '');
        setObjetivo(r.objetivo ?? ['controle']);
        setOutro(r.outro ?? '');
        setArroba(r.arroba ?? '30');
        setPesadas(r.pesadas ?? []);
        setObs(r.obs ?? '');
      })
      .catch(() => undefined)
      .finally(() => setLido(true));
  }, [pacote.fazenda.id]);
  useEffect(() => {
    if (!lido) return;
    AsyncStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ fazenda: pacote.fazenda.id, numLote, objetivo, outro, arroba, pesadas, obs })).catch(() => undefined);
  }, [lido, numLote, objetivo, outro, arroba, pesadas, obs, pacote.fazenda.id]);

  const cab = pesadas.reduce((s, p) => s + p.quantidade, 0);
  const kg = pesadas.reduce((s, p) => s + p.peso, 0);

  function pesar() {
    aoErro(null);
    const b = brinco.trim().toUpperCase();
    const q = b ? 1 : Math.max(1, Number(qtd) || 1);
    const p = lerNumero(peso);
    if (!p || p <= 0) return aoErro('Informe o peso da pesada (kg).');
    if (p / q > 2000) return aoErro('Peso alto demais para essa quantidade de cabeças: confira.');
    if (b && pesadas.some((x) => x.brinco === b)) return aoErro(`O brinco ${b} já foi pesado nesta pesagem.`);
    setPesadas((l) => [...l, { brinco: b, quantidade: q, peso: p }]);
    setBrinco('');
    setPeso('');
    setQtd('1');
  }

  async function salvar() {
    aoErro(null);
    if (!lote) return aoErro('Informe o nº do lote pesado.');
    if (objetivo[0] === 'outros' && !outro.trim()) return aoErro('Escreva qual é o objetivo da pesagem.');
    if (!pesadas.length) return aoErro('Lance pelo menos uma pesada.');
    setSalvando(true);
    const r = await lancar({
      fazenda_id: pacote.fazenda.id,
      tipo: 'pesagem',
      dados: { lote_id: lote.id, objetivo: objetivo[0], objetivo_outro: outro.trim(), peso_arroba: kgArroba, obs: obs.trim(), itens: pesadas.map((p) => ({ brinco: p.brinco || null, quantidade: p.quantidade, peso: p.peso })) },
      fotos: [],
      resumo: `Pesagem do lote ${lote.numero}: ${cab} cab., ${formatarNumero(kg, 1)} kg`,
    });
    await AsyncStorage.removeItem(CHAVE_RASCUNHO).catch(() => undefined);
    setSalvando(false);
    aoLancar(`Pesagem do lote ${lote.numero}: ${cab} cab., ${formatarNumero(kg, 1)} kg (média ${formatarNumero(kg / cab, 1)} kg). Ao confirmar, ganha o número e os pesos ficam nos animais com brinco.`, r.enviado);
  }

  return (
    <>
      <View style={estilos.linha}>
        <View style={{ flex: 1 }}>
          <Campo
            rotulo="Nº do lote *"
            value={numLote}
            onChangeText={(t) => setNumLote(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            ajuda={lote ? `${formatarNumero(lote.cabecas)} cab.${lote.manga ? ` · manga ${lote.manga}` : ''}` : numLote ? 'Lote não encontrado' : undefined}
          />
        </View>
        <View style={{ width: 110 }}>
          <Campo rotulo="Kg da @" value={arroba} onChangeText={(t) => setArroba(t.replace(/[^\d,]/g, '').slice(0, 5))} keyboardType="decimal-pad" />
        </View>
      </View>
      <Escolha rotulo="Objetivo" opcoes={[{ valor: 'controle', rotulo: 'Controle (ganho de peso)' }, { valor: 'outros', rotulo: 'Outro' }]} valor={objetivo} aoMudar={(v) => v.length && setObjetivo(v)} />
      {objetivo[0] === 'outros' && <Campo rotulo="Qual objetivo *" value={outro} onChangeText={setOutro} />}

      <Secao titulo="Pesadas" />
      <View style={estilos.cartao}>
        <View style={estilos.linha}>
          <View style={{ flex: 1.3 }}>
            <Campo rotulo="Brinco" value={brinco} onChangeText={(t) => setBrinco(t)} autoCapitalize="characters" autoCorrect={false} placeholder="Opcional" />
          </View>
          {!brinco.trim() && (
            <View style={{ width: 80 }}>
              <Campo rotulo="Cab." value={qtd} onChangeText={(t) => setQtd(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Campo rotulo="Peso (kg) *" value={peso} onChangeText={(t) => setPeso(t.replace(/[^\d,]/g, '').slice(0, 7))} keyboardType="decimal-pad" onSubmitEditing={pesar} style={{ fontSize: 22, fontWeight: '800' }} />
          </View>
        </View>
        <Botao titulo="Pôr na lista" onPress={pesar} />
      </View>

      {pesadas.length > 0 && (
        <>
          <View style={estilos.total}>
            <Text style={estilos.totalTexto}>{cab} cab.</Text>
            <Text style={estilos.totalTexto}>{formatarNumero(kg, 1)} kg</Text>
            <Text style={estilos.totalTexto}>{formatarNumero(kg / kgArroba, 2)} @</Text>
            <Text style={estilos.totalTexto}>média {formatarNumero(kg / cab, 1)} kg</Text>
          </View>
          {[...pesadas].reverse().map((p, iInv) => {
            const i = pesadas.length - 1 - iInv;
            return (
              <View key={i} style={estilos.pesada}>
                <Text style={estilos.ord}>{i + 1}</Text>
                <Text style={estilos.pesadaTexto}>{p.brinco || `${p.quantidade} cab.`}</Text>
                <Text style={estilos.pesadaPeso}>{formatarNumero(p.peso, 1)} kg</Text>
                <Text style={estilos.pesadaArr}>{formatarNumero(p.peso / kgArroba, 2)} @</Text>
                <Pressable onPress={() => setPesadas((l) => l.filter((_, j) => j !== i))} hitSlop={10}>
                  <Text style={estilos.tirar}>Tirar</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      )}
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline />
      <Text style={estilos.nota}>A lista fica guardada no celular enquanto você pesa: se o app fechar, continua de onde parou.</Text>
      <Botao titulo="Lançar pesagem" onPress={salvar} carregando={salvando} />
      {pesadas.length > 0 && (
        <Botao titulo="Começar de novo" tipo="secundario" onPress={() => setPesadas([])} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ transferência
export function TransferenciaCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const [modo, setModo] = useState<string[]>([]);
  const [numOrigem, setNumOrigem] = useState('');
  const [mangaDestino, setMangaDestino] = useState<string[]>([]);
  const [numDestino, setNumDestino] = useState('');
  const [como, setComo] = useState<string[]>(['quantidade']);
  const [qtd, setQtd] = useState('');
  const [sexo, setSexo] = useState<string[]>(['todos']);
  const [escolhidos, setEscolhidos] = useState<AnimalCampo[]>([]);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const origem = pacote.lotes.find((l) => String(l.numero) === numOrigem.trim()) ?? null;
  const destino = pacote.lotes.find((l) => String(l.numero) === numDestino.trim()) ?? null;
  const disponivel = origem ? (sexo[0] === 'M' ? origem.machos : sexo[0] === 'F' ? origem.femeas : origem.cabecas) : 0;

  async function salvar() {
    aoErro(null);
    if (!modo[0]) return aoErro('Escolha: mudar de manga ou mudar de lote.');
    if (!origem) return aoErro('Informe o nº do lote de origem.');
    if (modo[0] === 'manga') {
      const m = pacote.mangas.find((x) => x.id === mangaDestino[0]);
      if (!m) return aoErro('Escolha a manga para onde o lote vai.');
      if (m.id === origem.manga_id) return aoErro(`O lote ${origem.numero} já está na manga ${m.nome}.`);
      setSalvando(true);
      const r = await lancar({ fazenda_id: pacote.fazenda.id, tipo: 'transferencia', dados: { modo: 'manga', lote_origem: origem.id, manga_destino: m.id, obs: obs.trim() }, fotos: [], resumo: `Troca de manga – lote ${origem.numero} para a manga ${m.nome}` });
      setSalvando(false);
      return aoLancar(`Lote ${origem.numero} para a manga ${m.nome}. Ao confirmar, o sistema muda o lote de manga.`, r.enviado);
    }
    if (!destino) return aoErro('Informe o nº do lote de destino (tem que existir; lote novo, o escritório cadastra).');
    if (destino.id === origem.id) return aoErro('O lote de destino é o mesmo de origem.');
    const porBrinco = como[0] === 'brinco';
    const n = porBrinco ? escolhidos.length : Number(qtd) || 0;
    if (n < 1) return aoErro(porBrinco ? 'Escolha os animais pelo brinco.' : 'Informe a quantidade de cabeças.');
    if (!porBrinco && n > disponivel) return aoErro(`O lote ${origem.numero} tem ${disponivel} ${sexo[0] === 'M' ? 'machos' : sexo[0] === 'F' ? 'fêmeas' : 'cabeças'} nos dados guardados.`);
    const sx = porBrinco ? null : sexo[0] === 'todos' ? null : sexo[0];
    if (destino.sexo && (sx ? sx !== destino.sexo : porBrinco ? escolhidos.some((a) => a.sexo !== destino.sexo) : origem.sexo !== destino.sexo && (destino.sexo === 'M' ? origem.femeas : origem.machos) > 0)) {
      return aoErro(`O lote ${destino.numero} é só de ${destino.sexo === 'M' ? 'machos' : 'fêmeas'}: escolha o sexo ou os animais certos.`);
    }
    setSalvando(true);
    const r = await lancar({
      fazenda_id: pacote.fazenda.id,
      tipo: 'transferencia',
      dados: { modo: 'lote', lote_origem: origem.id, lote_destino: destino.id, animais: porBrinco ? escolhidos.map((a) => a.id) : [], quantidade: porBrinco ? 0 : n, sexo: sx, obs: obs.trim() },
      fotos: [],
      resumo: `Troca de lote – ${n} cab. do lote ${origem.numero} para o lote ${destino.numero}`,
    });
    setSalvando(false);
    aoLancar(`${n} cab. do lote ${origem.numero} para o lote ${destino.numero}${destino.manga ? ` (manga ${destino.manga})` : ''}. Ao confirmar, o sistema faz a troca.`, r.enviado);
  }

  return (
    <>
      <Escolha rotulo="O que vai fazer *" opcoes={[{ valor: 'manga', rotulo: 'Mudar o lote de manga' }, { valor: 'lote', rotulo: 'Passar animais para outro lote' }]} valor={modo} aoMudar={setModo} />
      {!!modo[0] && (
        <Campo
          rotulo="Nº do lote de origem *"
          value={numOrigem}
          onChangeText={(t) => { setNumOrigem(t.replace(/\D/g, '').slice(0, 6)); setEscolhidos([]); }}
          keyboardType="number-pad"
          ajuda={origem ? `${formatarNumero(origem.cabecas)} cab. (${origem.machos} M · ${origem.femeas} F)${origem.manga ? ` · está na manga ${origem.manga}` : ' · sem manga'}` : numOrigem ? 'Lote não encontrado' : undefined}
        />
      )}
      {modo[0] === 'manga' && (
        pacote.mangas.length ? (
          <Escolha rotulo="Para a manga *" opcoes={pacote.mangas.filter((m) => m.id !== origem?.manga_id).map((m) => ({ valor: m.id, rotulo: m.nome }))} valor={mangaDestino} aoMudar={setMangaDestino} />
        ) : (
          <Text style={estilos.nota}>Nenhuma manga cadastrada nesta fazenda.</Text>
        )
      )}
      {modo[0] === 'lote' && (
        <>
          <Campo
            rotulo="Nº do lote de destino *"
            value={numDestino}
            onChangeText={(t) => setNumDestino(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            ajuda={destino ? `${formatarNumero(destino.cabecas)} cab.${destino.sexo ? ` · só ${destino.sexo === 'M' ? 'machos' : 'fêmeas'}` : ''}${destino.manga ? ` · manga ${destino.manga}` : ''}` : numDestino ? 'Lote não encontrado (lote novo, o escritório cadastra)' : undefined}
          />
          <Escolha rotulo="Quais animais" opcoes={[{ valor: 'quantidade', rotulo: 'Por quantidade' }, { valor: 'brinco', rotulo: 'Pelo brinco' }]} valor={como} aoMudar={(v) => v.length && setComo(v)} />
          {como[0] === 'quantidade' ? (
            <>
              <Escolha rotulo="Sexo" opcoes={[{ valor: 'todos', rotulo: 'Tanto faz' }, { valor: 'M', rotulo: 'Machos' }, { valor: 'F', rotulo: 'Fêmeas' }]} valor={sexo} aoMudar={(v) => v.length && setSexo(v)} />
              <Campo rotulo="Cabeças *" value={qtd} onChangeText={(t) => setQtd(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" ajuda={origem ? `Disponível: ${disponivel}` : undefined} />
            </>
          ) : (
            <>
              {escolhidos.map((a) => (
                <View key={a.id} style={estilos.pesada}>
                  <Text style={[estilos.pesadaTexto, { flex: 1 }]}>{a.brinco ?? a.nome ?? `Nº ${a.n}`}</Text>
                  <Text style={estilos.nota}>{a.sexo === 'M' ? 'Macho' : a.sexo === 'F' ? 'Fêmea' : ''}</Text>
                  <Pressable onPress={() => setEscolhidos((l) => l.filter((x) => x.id !== a.id))} hitSlop={10}>
                    <Text style={estilos.tirar}>Tirar</Text>
                  </Pressable>
                </View>
              ))}
              {origem ? (
                <BuscaAnimal pacote={pacote} loteId={origem.id} excluir={escolhidos.map((a) => a.id)} valor={null} aoMudar={(a) => a && setEscolhidos((l) => [...l, a])} rotulo={escolhidos.length ? 'Mais um brinco' : 'Brinco do animal'} />
              ) : (
                <Text style={estilos.nota}>Informe primeiro o lote de origem.</Text>
              )}
            </>
          )}
        </>
      )}
      {!!modo[0] && <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline />}
      {!!modo[0] && <Botao titulo="Lançar transferência" onPress={salvar} carregando={salvando} />}
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  total: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 12 },
  totalTexto: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  pesada: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, paddingHorizontal: 12, paddingVertical: 10 },
  ord: { width: 28, fontSize: tam.pequeno, fontWeight: '800', color: cores.textoSuave },
  pesadaTexto: { flex: 1, fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  pesadaPeso: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  pesadaArr: { width: 70, textAlign: 'right', fontSize: tam.pequeno, color: cores.textoSuave },
  tirar: { fontSize: tam.pequeno + 1, color: cores.erro, fontWeight: '700' },
});

// ------------------------------------------------------------------ V187: trato do dia (dieta e leitura de cocho)
const LEITURAS = ['Limpo (comeu tudo)', 'Pouca sobra', 'Muita sobra', 'Não comeu'];
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ontemIso = () => {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function TratoCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const dietas = pacote.dietas ?? [];
  const [loteId, setLoteId] = useState<string[]>(dietas.length === 1 ? [dietas[0].lote_id] : []);
  const [dia, setDia] = useState<string[]>(['hoje']);
  const [como, setComo] = useState<string[]>(['igual']);
  const [kgs, setKgs] = useState<Record<string, string>>({});
  const [leitura, setLeitura] = useState<string[]>([]);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  if (!dietas.length) return <Text style={estilos.nota}>Nenhum lote com dieta de trato automático nesta fazenda. A dieta é feita no sistema (Pecuário › Dietas), com "fornecer sozinho" marcado.</Text>;
  const d = dietas.find((x) => x.lote_id === loteId[0]) ?? null;
  const lote = d ? pacote.lotes.find((l) => l.id === d.lote_id) ?? null : null;
  const cab = d?.hoje?.cabecas ?? lote?.cabecas ?? 0;
  const itens = d?.itens ?? [];

  async function salvar() {
    aoErro(null);
    if (!d || !lote) return aoErro('Escolha o lote.');
    if (!leitura[0] && como[0] !== 'nao') return aoErro('Marque a leitura de cocho (como estava o cocho antes de tratar).');
    const sem = como[0] === 'nao';
    const igual = como[0] === 'igual';
    const lista = itens.map((i) => ({ alimento_id: i.alimento_id, nome: i.nome, kg: igual ? Math.round(i.kg_cab * cab * 100) / 100 : lerNumero(kgs[i.alimento_id] ?? '') ?? 0 }));
    if (!sem && !igual && lista.every((x) => !x.kg)) return aoErro('Informe quanto foi servido de cada alimento (kg no dia).');
    setSalvando(true);
    const data = dia[0] === 'ontem' ? ontemIso() : hojeIso();
    const r = await lancar({
      fazenda_id: pacote.fazenda.id,
      tipo: 'trato',
      dados: { lote_id: d.lote_id, data, sem_trato: sem, igual, leitura: leitura[0] ?? null, itens: lista, obs: obs.trim() },
      fotos: [],
      resumo: `Trato do lote ${lote.numero}: ${sem ? 'não tratou' : igual ? 'como previsto' : 'diferente do previsto'}${leitura[0] ? ` · cocho ${leitura[0].toLowerCase()}` : ''}`,
    });
    setSalvando(false);
    aoLancar(`Trato do lote ${lote.numero} lançado${leitura[0] ? ` (cocho: ${leitura[0].toLowerCase()})` : ''}. ${igual ? 'O estoque já baixou pelo previsto.' : 'Ao confirmar, o sistema corrige o que foi servido e o estoque.'}`, r.enviado);
  }

  return (
    <>
      <Escolha rotulo="Lote *" opcoes={dietas.map((x) => ({ valor: x.lote_id, rotulo: `Lote ${pacote.lotes.find((l) => l.id === x.lote_id)?.numero ?? '?'}` }))} valor={loteId} aoMudar={(v) => { setLoteId(v); setKgs({}); }} />
      {d && lote && (
        <>
          <Escolha rotulo="Dia" opcoes={[{ valor: 'hoje', rotulo: 'Hoje' }, { valor: 'ontem', rotulo: 'Ontem' }]} valor={dia} aoMudar={(v) => v.length && setDia(v)} />
          {dia[0] === 'hoje' && d.hoje?.leitura && <Text style={estilos.nota}>Hoje já foi lançada a leitura "{d.hoje.leitura}" para este lote.</Text>}
          <View style={estilos.cartao}>
            <Text style={estilos.pesadaTexto}>
              Dieta nº {d.numero}{d.descricao ? ` · ${d.descricao}` : ''} · {formatarNumero(cab)} cab. · {d.tratos_dia} {d.tratos_dia === 1 ? 'trato' : 'tratos'} por dia
            </Text>
            {itens.map((i) => {
              const total = i.kg_cab * cab;
              return (
                <View key={i.alimento_id} style={estilos.pesada}>
                  <Text style={estilos.pesadaTexto}>{i.nome}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={estilos.pesadaPeso}>{formatarNumero(total, 1)} kg no dia</Text>
                    {d.tratos_dia > 1 && <Text style={estilos.nota}>{formatarNumero(total / d.tratos_dia, 1)} kg por trato</Text>}
                  </View>
                </View>
              );
            })}
          </View>
          <Escolha rotulo="Leitura de cocho (antes de tratar) *" opcoes={LEITURAS.map((x) => ({ valor: x, rotulo: x }))} valor={leitura} aoMudar={setLeitura} />
          <Escolha rotulo="Como foi servido" opcoes={[{ valor: 'igual', rotulo: 'Como previsto' }, { valor: 'diferente', rotulo: 'Diferente' }, { valor: 'nao', rotulo: 'Não tratou' }]} valor={como} aoMudar={(v) => v.length && setComo(v)} />
          {como[0] === 'diferente' &&
            itens.map((i) => (
              <Campo
                key={i.alimento_id}
                rotulo={`${i.nome} – servido no dia (kg)`}
                value={kgs[i.alimento_id] ?? ''}
                onChangeText={(t) => setKgs((k) => ({ ...k, [i.alimento_id]: t.replace(/[^\d,]/g, '').slice(0, 8) }))}
                keyboardType="decimal-pad"
                placeholder={`Previsto ${formatarNumero(i.kg_cab * cab, 1)}`}
              />
            ))}
          <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline placeholder={como[0] === 'nao' ? 'Por que não tratou' : 'Ex.: faltou silagem, chuva molhou o cocho'} />
          <Botao titulo="Lançar trato" onPress={salvar} carregando={salvando} />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ V187: chuva (pluviômetro)
export function ChuvaCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const locais = (pacote.pluviometros ?? []).filter((x) => x);
  const [dia, setDia] = useState<string[]>(['hoje']);
  const [mm, setMm] = useState('');
  const [local, setLocal] = useState<string[]>(locais.length === 1 ? [locais[0]] : []);
  const [outro, setOutro] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    aoErro(null);
    const v = lerNumero(mm);
    if (v == null || v < 0) return aoErro('Informe os milímetros do pluviômetro (0 se não choveu).');
    if (v > 500) return aoErro('Confira os milímetros: mais de 500 mm num dia não é comum.');
    const lc = (local[0] === '__outro' ? outro : local[0] ?? '').trim();
    setSalvando(true);
    const data = dia[0] === 'ontem' ? ontemIso() : hojeIso();
    const r = await lancar({ fazenda_id: pacote.fazenda.id, tipo: 'chuva', dados: { data, mm: v, local: lc, obs: obs.trim() }, fotos: [], resumo: `Chuva: ${formatarNumero(v, 1)} mm${lc ? ` (${lc})` : ''}` });
    setSalvando(false);
    aoLancar(`Chuva de ${formatarNumero(v, 1)} mm lançada${lc ? ` (${lc})` : ''}.`, r.enviado);
  }
  return (
    <>
      <Escolha rotulo="Dia da chuva" opcoes={[{ valor: 'hoje', rotulo: 'Hoje' }, { valor: 'ontem', rotulo: 'Ontem' }]} valor={dia} aoMudar={(v) => v.length && setDia(v)} />
      <Campo rotulo="Milímetros (mm) *" value={mm} onChangeText={(t) => setMm(t.replace(/[^\d,]/g, '').slice(0, 5))} keyboardType="decimal-pad" style={{ fontSize: 28, fontWeight: '800' }} ajuda="0 se não choveu" />
      <Escolha rotulo="Pluviômetro" opcoes={[...locais.map((x) => ({ valor: x, rotulo: x })), { valor: '__outro', rotulo: locais.length ? 'Outro' : 'Dar um nome' }]} valor={local} aoMudar={setLocal} />
      {local[0] === '__outro' && <Campo rotulo="Nome do pluviômetro" value={outro} onChangeText={setOutro} placeholder="Ex.: Sede, Retiro, Manga do rio" />}
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} />
      <Botao titulo="Lançar chuva" onPress={salvar} carregando={salvando} />
    </>
  );
}
