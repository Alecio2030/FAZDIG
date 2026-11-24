import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Botao from '../../componentes/Botao';
import Campo from '../../componentes/Campo';
import Escolha from '../../componentes/Escolha';
import Aviso from '../../componentes/Aviso';
import { escolherImagem } from '../../lib/fotos';
import { formatarNumero, lerNumero, numeroParaCampo } from '../../lib/formatos';
import { lancar, textoIdade, type AnimalCampo, type FotoLocal, type LoteCampo, type MedicamentoCampo, type PacoteCampo } from '../../lib/campo';
import { cores, tam } from '../../tema';

/**
 * V185 – Modo Vaqueiro: lançamentos de animais (sanidade, nascimento, morte, sumido/achado e cio).
 * Tudo funciona sem sinal (inclusive as fotos, que ficam no celular até subir).
 */

export type PropsLancar = { pacote: PacoteCampo; aoLancar: (texto: string, enviado: boolean) => void; aoErro: (m: string | null) => void };
const SEXO: Record<string, string> = { M: 'Macho', F: 'Fêmea' };
const nomeAnimal = (a: AnimalCampo) => a.brinco ?? a.nome ?? `Nº ${a.n}`;

// ------------------------------------------------------------------ fotos (com ou sem sinal)
export function FotosCampo({ fotos, aoMudar, aoErro, max = 3, rotulo = 'Foto' }: { fotos: FotoLocal[]; aoMudar: (f: FotoLocal[]) => void; aoErro: (m: string) => void; max?: number; rotulo?: string }) {
  async function tirar() {
    try {
      const r = await escolherImagem(true, { quality: 0.5, ladoWeb: 1280 });
      if ('negado' in r) return aoErro('Sem permissão para usar a câmera. Libere nos Ajustes do celular.');
      if (r.foto) aoMudar([...fotos, { base64: r.foto.base64, mimeType: r.foto.mimeType || 'image/jpeg' }]);
    } catch (e: any) {
      aoErro(String(e?.message ?? e));
    }
  }
  return (
    <View style={{ gap: 8 }}>
      {fotos.length > 0 && (
        <View style={estilos.fotos}>
          {fotos.map((f, i) => (
            <View key={i} style={{ alignItems: 'center', gap: 4 }}>
              <Image source={{ uri: `data:${f.mimeType};base64,${f.base64}` }} style={estilos.miniatura} />
              <Text style={estilos.linkSuave} onPress={() => aoMudar(fotos.filter((_, j) => j !== i))}>
                Tirar
              </Text>
            </View>
          ))}
        </View>
      )}
      {fotos.length < max && (
        <Text style={estilos.link} onPress={tirar}>
          📷 {fotos.length ? 'Mais uma foto' : rotulo}
        </Text>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ escolher animal ou lote
export type Alvo = { animal: AnimalCampo | null; lote: LoteCampo | null; quantidade: number };

export function BuscaAnimal({ pacote, sexo, valor, aoMudar, rotulo = 'Brinco ou número do animal', loteId, excluir }: { pacote: PacoteCampo; sexo?: 'M' | 'F'; valor: AnimalCampo | null; aoMudar: (a: AnimalCampo | null) => void; rotulo?: string; loteId?: string | null; excluir?: string[] }) {
  const [busca, setBusca] = useState('');
  const t = busca.trim().toUpperCase().replace(/\s+/g, '');
  const achados = useMemo(
    () =>
      t
        ? pacote.animais
            .filter((a) => (!sexo || a.sexo === sexo) && (!loteId || a.lote_id === loteId) && !(excluir ?? []).includes(a.id) && (String(a.n) === t || (a.brinco ?? '').toUpperCase().replace(/\s+/g, '').includes(t) || (a.nome ?? '').toUpperCase().includes(busca.trim().toUpperCase())))
            .slice(0, 8)
        : [],
    [pacote, t, sexo, busca, loteId, excluir],
  );
  const lote = (id: string | null) => pacote.lotes.find((l) => l.id === id);
  if (valor) {
    const l = lote(valor.lote_id);
    return (
      <View style={estilos.escolhido}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.escolhidoTitulo}>{nomeAnimal(valor)}</Text>
          <Text style={estilos.nota}>
            {[valor.sexo ? SEXO[valor.sexo] : null, valor.raca, textoIdade(valor.nasc, valor.nasc_aprox), l ? `lote ${l.numero}` : null, valor.peso ? `${formatarNumero(Number(valor.peso))} kg` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={estilos.link} onPress={() => aoMudar(null)}>
          Trocar
        </Text>
      </View>
    );
  }
  return (
    <>
      <Campo rotulo={rotulo} value={busca} onChangeText={setBusca} autoCapitalize="characters" autoCorrect={false} />
      {achados.map((a) => (
        <Pressable key={a.id} onPress={() => { aoMudar(a); setBusca(''); }} style={estilos.opcao}>
          <Text style={estilos.opcaoTitulo}>{nomeAnimal(a)}</Text>
          <Text style={estilos.nota}>{[a.sexo ? SEXO[a.sexo] : null, a.raca, lote(a.lote_id) ? `lote ${lote(a.lote_id)!.numero}` : null].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}
      {!!t && achados.length === 0 && <Text style={estilos.nota}>Nenhum {sexo === 'F' ? 'fêmea' : 'animal'} com "{busca}" nos dados guardados.</Text>}
    </>
  );
}

function EscolherAlvo({ pacote, valor, aoMudar, permiteLote = true }: { pacote: PacoteCampo; valor: Alvo; aoMudar: (a: Alvo) => void; permiteLote?: boolean }) {
  const [modo, setModo] = useState<string[]>(['animal']);
  const [num, setNum] = useState('');
  const [qtd, setQtd] = useState('1');
  const usarLote = permiteLote && modo[0] === 'lote';
  function mudarLote(n: string, q: string) {
    setNum(n);
    setQtd(q);
    const l = pacote.lotes.find((x) => String(x.numero) === n.trim()) ?? null;
    aoMudar({ animal: null, lote: l, quantidade: Math.max(1, Number(q) || 1) });
  }
  return (
    <>
      {permiteLote && (
        <Escolha
          rotulo="De quem"
          opcoes={[{ valor: 'animal', rotulo: 'Animal identificado' }, { valor: 'lote', rotulo: 'Do lote (sem brinco)' }]}
          valor={modo}
          aoMudar={(v) => {
            if (!v.length) return;
            setModo(v);
            aoMudar({ animal: null, lote: null, quantidade: 1 });
          }}
        />
      )}
      {usarLote ? (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo
              rotulo="Nº do lote *"
              value={num}
              onChangeText={(t) => mudarLote(t.replace(/\D/g, '').slice(0, 6), qtd)}
              keyboardType="number-pad"
              ajuda={valor.lote ? `${formatarNumero(valor.lote.cabecas)} cab.${valor.lote.manga ? ` · manga ${valor.lote.manga}` : ''}` : num ? 'Lote não encontrado' : undefined}
            />
          </View>
          <View style={{ width: 120 }}>
            <Campo rotulo="Cabeças *" value={qtd} onChangeText={(t) => mudarLote(num, t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" />
          </View>
        </View>
      ) : (
        <BuscaAnimal pacote={pacote} valor={valor.animal} aoMudar={(a) => aoMudar({ animal: a, lote: a ? pacote.lotes.find((l) => l.id === a.lote_id) ?? null : null, quantidade: 1 })} />
      )}
    </>
  );
}

const alvoVazio: Alvo = { animal: null, lote: null, quantidade: 1 };
const alvoTexto = (a: Alvo) => (a.animal ? nomeAnimal(a.animal) : a.lote ? `${a.quantidade} cab. do lote ${a.lote.numero}` : '');
function validarAlvo(a: Alvo, permiteLote = true): string | null {
  if (a.animal) return null;
  if (!permiteLote) return 'Escolha o animal.';
  if (!a.lote) return 'Escolha o animal ou informe o nº do lote.';
  if (a.quantidade > a.lote.cabecas) return `O lote ${a.lote.numero} tem ${a.lote.cabecas} cabeças nos dados guardados.`;
  return null;
}
const dadosAlvo = (a: Alvo) => ({ animal_id: a.animal?.id ?? null, lote_id: a.animal ? a.animal.lote_id : a.lote?.id ?? null, quantidade: a.animal ? 1 : a.quantidade });

// ------------------------------------------------------------------ sanidade
type MedLinha = { id: string | null; dose: string; editada: boolean };
const doseCalc = (m: MedicamentoCampo, peso: number | null): number | null => {
  if (!m.dose) return null;
  if (m.dose_por !== 'kg') return Number(m.dose);
  if (!m.cada_kg || !peso) return null;
  return Math.round(((peso / Number(m.cada_kg)) * Number(m.dose)) * 100) / 100;
};
/** quanto da dose sai do estoque (ex.: mL → frasco de 50 mL) */
const paraEstoque = (m: MedicamentoCampo, qtdDose: number) => (m.unidade_dose && m.unidade_dose !== m.unidade && m.conteudo ? qtdDose / Number(m.conteudo) : qtdDose);

export function SanidadeCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const [alvo, setAlvo] = useState<Alvo>(alvoVazio);
  const [tipo, setTipo] = useState<string[]>(['tratamento']);
  const [diag, setDiag] = useState('');
  const [peso, setPeso] = useState('');
  const [aplicou, setAplicou] = useState<string[]>([]);
  const [meds, setMeds] = useState<MedLinha[]>([{ id: null, dose: '', editada: false }]);
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [salvando, setSalvando] = useState(false);
  const catalogo = (pacote.medicamentos ?? []).filter((m) => (tipo[0] === 'vacina' ? m.categoria === 'vacina' : tipo[0] === 'outro' ? true : m.categoria === 'medicamento'));
  const pesoNum = lerNumero(peso) ?? (alvo.animal?.peso ? Number(alvo.animal.peso) : null);
  const cab = alvo.animal ? 1 : alvo.quantidade;

  function mudarMed(i: number, x: Partial<MedLinha>) {
    setMeds((l) => l.map((m, j) => (j === i ? { ...m, ...x } : m)));
  }

  async function salvar() {
    aoErro(null);
    const e = validarAlvo(alvo);
    if (e) return aoErro(e);
    if (!aplicou[0]) return aoErro('Diga se aplicou medicamento ou se só identificou o problema.');
    if (aplicou[0] === 'nao' && !diag.trim()) return aoErro('Escreva o que o animal tem (diagnóstico provável), para o gerente.');
    const usados: { insumo_id: string; nome: string; dose: number; unidade: string }[] = [];
    if (aplicou[0] === 'sim') {
      for (const [i, l] of meds.entries()) {
        if (!l.id) continue;
        const m = catalogo.find((x) => x.id === l.id)!;
        const d = lerNumero(l.dose) ?? doseCalc(m, pesoNum);
        if (!d || d <= 0) return aoErro(`Medicamento ${i + 1}: informe a dose${m.dose_por === 'kg' && !pesoNum ? ' (ou o peso estimado, para calcular)' : ''}.`);
        usados.push({ insumo_id: m.id, nome: m.nome, dose: d, unidade: m.unidade_dose });
      }
      if (!usados.length) return aoErro('Escolha o medicamento aplicado (ou marque "Só identifiquei").');
    }
    setSalvando(true);
    const r = await lancar(
      {
        fazenda_id: pacote.fazenda.id,
        tipo: 'sanidade',
        dados: { ...dadosAlvo(alvo), tipo: tipo[0], diagnostico: diag.trim(), peso: pesoNum, medicamentos: usados, obs: obs.trim() },
        fotos: [],
        resumo: `${usados.length ? 'Sanidade' : 'Problema de saúde'} – ${alvoTexto(alvo)}${diag.trim() ? `: ${diag.trim()}` : ''}`,
      },
      fotos,
    );
    setSalvando(false);
    aoLancar(
      usados.length
        ? `Aplicação lançada (${usados.map((u) => u.nome).join(', ')}). Ao confirmar, o gerente lança na Sanidade e baixa o estoque.`
        : 'Problema anotado: o gerente e o produtor recebem o aviso na agenda.',
      r.enviado,
    );
  }

  return (
    <>
      <EscolherAlvo pacote={pacote} valor={alvo} aoMudar={setAlvo} />
      <Campo rotulo="Diagnóstico provável" value={diag} onChangeText={setDiag} placeholder="Ex.: bicheira, tristeza, pneumonia, casco" />
      <Campo
        rotulo="Peso estimado (kg)"
        value={peso}
        onChangeText={(t) => setPeso(t.replace(/[^\d,]/g, '').slice(0, 6))}
        keyboardType="decimal-pad"
        placeholder={alvo.animal?.peso ? `Último peso: ${formatarNumero(Number(alvo.animal.peso))} kg` : 'Para calcular a dose'}
      />
      <Escolha rotulo="Aplicou medicamento? *" opcoes={[{ valor: 'sim', rotulo: 'Sim, apliquei' }, { valor: 'nao', rotulo: 'Só identifiquei' }]} valor={aplicou} aoMudar={setAplicou} />
      {aplicou[0] === 'nao' && <Text style={estilos.nota}>Vai como aviso para o gerente e o produtor, na agenda, com a foto.</Text>}
      {aplicou[0] === 'sim' && (
        <>
          <Escolha rotulo="Tipo" opcoes={[{ valor: 'vacina', rotulo: 'Vacina' }, { valor: 'vermifugo', rotulo: 'Vermífugo' }, { valor: 'tratamento', rotulo: 'Tratamento' }]} valor={tipo} aoMudar={(v) => v.length && setTipo(v)} />
          {catalogo.length === 0 ? (
            <Aviso tipo="erro" texto="Nenhum produto com dose recomendada nos dados guardados. Peça para o escritório completar o cadastro em Pecuário › Medicamentos e vacinas e atualize com sinal." />
          ) : (
            meds.map((l, i) => {
              const m = catalogo.find((x) => x.id === l.id) ?? null;
              const calc = m ? doseCalc(m, pesoNum) : null;
              const dose = lerNumero(l.dose) ?? calc;
              const gasto = m && dose ? paraEstoque(m, dose * cab) : 0;
              return (
                <View key={i} style={estilos.cartao}>
                  <Text style={estilos.medTitulo}>Medicamento {i + 1}</Text>
                  <Escolha rotulo="Produto" opcoes={catalogo.map((x) => ({ valor: x.id, rotulo: x.nome }))} valor={l.id ? [l.id] : []} aoMudar={(v) => mudarMed(i, { id: v[0] ?? null, dose: '', editada: false })} />
                  {m && (
                    <>
                      <Text style={estilos.nota}>
                        Dose do cadastro: {formatarNumero(Number(m.dose), 2)} {m.unidade_dose}
                        {m.dose_por === 'kg' ? ` a cada ${formatarNumero(Number(m.cada_kg))} kg` : ' por cabeça'}
                        {m.via ? ` · ${m.via}` : ''}
                      </Text>
                      <Campo
                        rotulo={`Dose aplicada por cabeça (${m.unidade_dose})`}
                        value={l.editada ? l.dose : calc != null ? numeroParaCampo(calc) : ''}
                        onChangeText={(t) => mudarMed(i, { dose: t.replace(/[^\d,]/g, ''), editada: true })}
                        keyboardType="decimal-pad"
                        ajuda={calc == null ? 'Informe o peso estimado para o sistema calcular' : l.editada ? `Calculada: ${numeroParaCampo(calc)} ${m.unidade_dose}` : 'Calculada pelo peso'}
                      />
                      {gasto > Number(m.saldo) + 0.0001 && <Text style={estilos.alerta}>Atenção: no estoque havia {formatarNumero(Number(m.saldo), 2)} {m.unidade} (na última atualização).</Text>}
                      {(m.carencia_carne || m.carencia_leite) && (
                        <Text style={estilos.alerta}>
                          Carência: {[m.carencia_carne ? `carne ${m.carencia_carne} dias` : null, m.carencia_leite ? `leite ${m.carencia_leite} dias` : null].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </>
                  )}
                  {meds.length > 1 && (
                    <Text style={estilos.linkSuave} onPress={() => setMeds((x) => x.filter((_, j) => j !== i))}>
                      Tirar este medicamento
                    </Text>
                  )}
                </View>
              );
            })
          )}
          {catalogo.length > 0 && meds.length < 4 && <Botao titulo="Mais um medicamento" tipo="secundario" onPress={() => setMeds((x) => [...x, { id: null, dose: '', editada: false }])} />}
        </>
      )}
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline />
      <FotosCampo fotos={fotos} aoMudar={setFotos} aoErro={(m) => aoErro(m)} />
      <Botao titulo={aplicou[0] === 'nao' ? 'Mandar o aviso' : 'Lançar a aplicação'} onPress={salvar} carregando={salvando} />
    </>
  );
}

// ------------------------------------------------------------------ nascimento
export function NascimentoCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const [mae, setMae] = useState<AnimalCampo | null>(null);
  const [semMae, setSemMae] = useState(false);
  const [numLote, setNumLote] = useState('');
  const [sexo, setSexo] = useState<string[]>([]);
  const [vivo, setVivo] = useState<string[]>(['vivo']);
  const [parto, setParto] = useState<string[]>(['normal']);
  const [peso, setPeso] = useState('');
  const [brinco, setBrinco] = useState('');
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [salvando, setSalvando] = useState(false);
  const loteDigitado = pacote.lotes.find((l) => String(l.numero) === numLote.trim()) ?? null;
  const lote = semMae ? loteDigitado : mae ? pacote.lotes.find((l) => l.id === mae.lote_id) ?? null : null;

  async function salvar() {
    aoErro(null);
    if (!semMae && !mae) return aoErro('Escolha a mãe (ou marque "Não sei a mãe" e informe o lote).');
    if (!lote) return aoErro(semMae ? 'Informe o nº do lote do bezerro.' : 'A mãe está sem lote nos dados guardados: marque "Não sei a mãe" e informe o lote.');
    const natimorto = vivo[0] === 'morto';
    if (!natimorto && !sexo[0]) return aoErro('Informe o sexo do bezerro.');
    setSalvando(true);
    const r = await lancar(
      {
        fazenda_id: pacote.fazenda.id,
        tipo: 'nascimento',
        dados: { mae_id: mae?.id ?? null, lote_id: lote.id, sexo: sexo[0] ?? null, natimorto, parto: parto[0], peso: lerNumero(peso), brinco: brinco.trim(), obs: obs.trim() },
        fotos: [],
        resumo: `Nascimento – ${sexo[0] === 'M' ? 'macho' : sexo[0] === 'F' ? 'fêmea' : 'bezerro'}${mae ? `, mãe ${nomeAnimal(mae)}` : ''}${natimorto ? ' (nasceu morto)' : ''}`,
      },
      fotos,
    );
    setSalvando(false);
    aoLancar(natimorto ? 'Parto lançado (nasceu morto).' : `Nascimento lançado: ${sexo[0] === 'M' ? 'macho' : 'fêmea'} no lote ${lote.numero}. Ao confirmar, o bezerro entra no rebanho.`, r.enviado);
  }

  return (
    <>
      {!semMae && <BuscaAnimal pacote={pacote} sexo="F" valor={mae} aoMudar={setMae} rotulo="Mãe (brinco ou número)" />}
      <Text style={estilos.link} onPress={() => { setSemMae(!semMae); setMae(null); }}>
        {semMae ? 'Sei a mãe' : 'Não sei a mãe'}
      </Text>
      {semMae && <Campo rotulo="Nº do lote do bezerro *" value={numLote} onChangeText={(t) => setNumLote(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" ajuda={loteDigitado ? `Lote ${loteDigitado.numero}${loteDigitado.manga ? ` · manga ${loteDigitado.manga}` : ''}` : numLote ? 'Lote não encontrado' : undefined} />}
      {!semMae && lote && <Text style={estilos.nota}>O bezerro fica no lote {lote.numero}, ao pé da mãe.</Text>}
      <Escolha rotulo="Nasceu" opcoes={[{ valor: 'vivo', rotulo: 'Vivo' }, { valor: 'morto', rotulo: 'Morto' }]} valor={vivo} aoMudar={(v) => v.length && setVivo(v)} />
      <Escolha rotulo={vivo[0] === 'morto' ? 'Sexo' : 'Sexo *'} opcoes={[{ valor: 'M', rotulo: 'Macho' }, { valor: 'F', rotulo: 'Fêmea' }]} valor={sexo} aoMudar={setSexo} />
      <Escolha rotulo="Parto" opcoes={[{ valor: 'normal', rotulo: 'Normal' }, { valor: 'assistido', rotulo: 'Precisou de ajuda' }]} valor={parto} aoMudar={(v) => v.length && setParto(v)} />
      {vivo[0] === 'vivo' && (
        <View style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Peso ao nascer (kg)" value={peso} onChangeText={(t) => setPeso(t.replace(/[^\d,]/g, '').slice(0, 5))} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Brinco do bezerro" value={brinco} onChangeText={setBrinco} autoCapitalize="characters" placeholder="Se já pôs" />
          </View>
        </View>
      )}
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline />
      <FotosCampo fotos={fotos} aoMudar={setFotos} aoErro={(m) => aoErro(m)} />
      <Botao titulo="Lançar nascimento" onPress={salvar} carregando={salvando} />
    </>
  );
}

// ------------------------------------------------------------------ morte
const CAUSAS = ['Doença', 'Picada de cobra', 'Raio', 'Parto', 'Atolado', 'Acidente', 'Não sei'];

export function MorteCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const [alvo, setAlvo] = useState<Alvo>(alvoVazio);
  const [causa, setCausa] = useState<string[]>([]);
  const [detalhe, setDetalhe] = useState('');
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    aoErro(null);
    const e = validarAlvo(alvo);
    if (e) return aoErro(e);
    if (!causa[0]) return aoErro('Escolha a causa provável.');
    if (!fotos.length) return aoErro('Tire ao menos uma foto do animal morto: é o comprovante da morte.');
    const c = [causa[0], detalhe.trim()].filter(Boolean).join(': ');
    setSalvando(true);
    const r = await lancar({ fazenda_id: pacote.fazenda.id, tipo: 'morte', dados: { ...dadosAlvo(alvo), causa: c, obs: obs.trim() }, fotos: [], resumo: `Morte – ${alvoTexto(alvo)}: ${c}` }, fotos);
    setSalvando(false);
    aoLancar(`Morte lançada (${alvoTexto(alvo)}). O gerente e o produtor recebem o aviso; ao confirmar, sai do rebanho.`, r.enviado);
  }
  return (
    <>
      <EscolherAlvo pacote={pacote} valor={alvo} aoMudar={setAlvo} />
      <Escolha rotulo="Causa provável *" opcoes={CAUSAS.map((c) => ({ valor: c, rotulo: c }))} valor={causa} aoMudar={setCausa} />
      <Campo rotulo="Detalhe da causa" value={detalhe} onChangeText={setDetalhe} placeholder="O que viu" />
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline placeholder="Onde estava, há quanto tempo" />
      <FotosCampo fotos={fotos} aoMudar={setFotos} aoErro={(m) => aoErro(m)} rotulo="Foto do animal *" />
      <Botao titulo="Lançar morte" onPress={salvar} carregando={salvando} />
    </>
  );
}

// ------------------------------------------------------------------ sumido / achado
export function SumidoCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const [qual, setQual] = useState<string[]>(['sumido']);
  const [alvo, setAlvo] = useState<Alvo>(alvoVazio);
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    aoErro(null);
    const e = validarAlvo(alvo);
    if (e) return aoErro(e);
    const t = qual[0] as 'sumido' | 'achado';
    setSalvando(true);
    const r = await lancar({ fazenda_id: pacote.fazenda.id, tipo: t, dados: { ...dadosAlvo(alvo), obs: obs.trim() }, fotos: [], resumo: `${t === 'sumido' ? 'Sumido' : 'Achado'} – ${alvoTexto(alvo)}` }, fotos);
    setSalvando(false);
    aoLancar(t === 'sumido' ? `Sumido lançado (${alvoTexto(alvo)}): o gerente recebe o aviso.` : `Achado lançado (${alvoTexto(alvo)}).`, r.enviado);
  }
  return (
    <>
      <Escolha rotulo="O que aconteceu" opcoes={[{ valor: 'sumido', rotulo: 'Sumiu' }, { valor: 'achado', rotulo: 'Achei' }]} valor={qual} aoMudar={(v) => v.length && setQual(v)} />
      <EscolherAlvo pacote={pacote} valor={alvo} aoMudar={setAlvo} />
      <Campo rotulo={qual[0] === 'sumido' ? 'Onde foi visto por último' : 'Onde estava'} value={obs} onChangeText={setObs} multiline />
      <FotosCampo fotos={fotos} aoMudar={setFotos} aoErro={(m) => aoErro(m)} />
      <Botao titulo="Lançar" onPress={salvar} carregando={salvando} />
    </>
  );
}

// ------------------------------------------------------------------ cio
export function CioCampo({ pacote, aoLancar, aoErro }: PropsLancar) {
  const [femea, setFemea] = useState<AnimalCampo | null>(null);
  const [inicio, setInicio] = useState<string[]>(['agora']);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    aoErro(null);
    if (!femea) return aoErro('Escolha a fêmea.');
    setSalvando(true);
    const quando = inicio[0] === 'manha' ? 'cio desde de manhã' : inicio[0] === 'tarde' ? 'cio desde a tarde' : 'cio visto agora';
    const r = await lancar({ fazenda_id: pacote.fazenda.id, tipo: 'cio', dados: { animal_id: femea.id, inicio: inicio[0], obs: [quando, obs.trim()].filter(Boolean).join('. ') }, fotos: [], resumo: `Cio – ${nomeAnimal(femea)}` });
    setSalvando(false);
    aoLancar(`Cio de ${nomeAnimal(femea)} lançado: o gerente recebe o aviso para inseminar ou cobrir.`, r.enviado);
  }
  return (
    <>
      <BuscaAnimal pacote={pacote} sexo="F" valor={femea} aoMudar={setFemea} rotulo="Fêmea (brinco ou número) *" />
      <Escolha rotulo="Desde quando" opcoes={[{ valor: 'agora', rotulo: 'Vi agora' }, { valor: 'manha', rotulo: 'De manhã' }, { valor: 'tarde', rotulo: 'À tarde' }]} valor={inicio} aoMudar={(v) => v.length && setInicio(v)} />
      <Campo rotulo="Observação" value={obs} onChangeText={setObs} multiline placeholder="Ex.: aceitando monta, muco" />
      <Text style={estilos.nota}>Pela regra AM/PM, a inseminação é feita umas 12 horas depois do início do cio.</Text>
      <Botao titulo="Lançar cio" onPress={salvar} carregando={salvando} />
    </>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  alerta: { fontSize: tam.pequeno + 1, color: cores.cafe, fontWeight: '700' },
  link: { fontSize: tam.pequeno + 2, color: cores.primaria, fontWeight: '700' },
  linkSuave: { fontSize: tam.pequeno + 1, color: cores.textoSuave, fontWeight: '600' },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  miniatura: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#DDD' },
  escolhido: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.sucessoFundo, borderRadius: tam.raio, padding: 12 },
  escolhidoTitulo: { fontSize: tam.subtitulo, fontWeight: '800', color: cores.texto },
  opcao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 2 },
  opcaoTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.texto },
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 6 },
  medTitulo: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
});
