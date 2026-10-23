import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Campo from './Campo';
import Escolha from './Escolha';
import { cores, tam } from '../tema';

// Dados técnicos que dependem da categoria do produto (guardados juntos no campo "atributos").
export type Atributos = Record<string, string>;

type Def = {
  chave: string;
  rotulo: string;
  teclado?: 'decimal-pad';
  opcoes?: string[];
  largura?: 'meia';
  multiplo?: boolean;
  /** só aparece quando outro campo tem este valor (ex.: PRNT só no corretivo) */
  quando?: [string, string];
};

/** Valores marcados num campo de várias opções (gravados juntos, separados por vírgula). */
export const listaMarcada = (v: string | undefined | null): string[] => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : []);

export const DEFS: Record<string, { titulo: string; campos: Def[] }> = {
  fertilizante: {
    titulo: 'Dados do fertilizante (químico)',
    campos: [
      { chave: 'natureza', rotulo: 'Natureza', opcoes: ['Mineral simples', 'Mineral misto / formulado', 'Mineral complexo', 'Organomineral', 'Corretivo de solo', 'Bioestimulante / condicionador'] },
      { chave: 'estado', rotulo: 'Estado físico', opcoes: ['Sólido', 'Líquido'] },
      { chave: 'modo', rotulo: 'Aplicação (pode marcar mais de uma)', multiplo: true, opcoes: ['Solo', 'Fertirrigação', 'Foliar'] },
      { chave: 'prnt', rotulo: 'PRNT %', teclado: 'decimal-pad', largura: 'meia', quando: ['natureza', 'Corretivo de solo'] },
      { chave: 'cao', rotulo: 'CaO %', teclado: 'decimal-pad', largura: 'meia', quando: ['natureza', 'Corretivo de solo'] },
      { chave: 'mgo', rotulo: 'MgO %', teclado: 'decimal-pad', largura: 'meia', quando: ['natureza', 'Corretivo de solo'] },
      { chave: 'densidade', rotulo: 'Densidade (kg/L)', teclado: 'decimal-pad', largura: 'meia', quando: ['estado', 'Líquido'] },
      { chave: 'n', rotulo: 'N – Nitrogênio %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'p', rotulo: 'P – Fósforo (P₂O₅) %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'k', rotulo: 'K – Potássio (K₂O) %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'ca', rotulo: 'Ca – Cálcio %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'mg', rotulo: 'Mg – Magnésio %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 's', rotulo: 'S – Enxofre %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'b', rotulo: 'B – Boro %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'zn', rotulo: 'Zn – Zinco %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'cu', rotulo: 'Cu – Cobre %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'mn', rotulo: 'Mn – Manganês %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'outros', rotulo: 'Outros (Mo, Fe, Ni, Si…)' },
      { chave: 'registro_mapa', rotulo: 'Nº registro MAPA' },
    ],
  },
  adubo: {
    titulo: 'Dados do adubo orgânico',
    campos: [
      {
        chave: 'origem',
        rotulo: 'Origem',
        opcoes: ['Esterco bovino', 'Cama de frango / esterco de galinha', 'Esterco suíno', 'Composto orgânico', 'Palha de café', 'Torta (mamona, filtro…)', 'Húmus de minhoca', 'Biofertilizante', 'Outro'],
      },
      { chave: 'estado', rotulo: 'Estado físico', opcoes: ['Sólido', 'Líquido'] },
      { chave: 'mo', rotulo: 'Matéria orgânica %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'c', rotulo: 'Carbono orgânico %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'umidade', rotulo: 'Umidade %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'cn', rotulo: 'Relação C/N', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'n', rotulo: 'N – Nitrogênio %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'p', rotulo: 'P – Fósforo (P₂O₅) %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'k', rotulo: 'K – Potássio (K₂O) %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'ca', rotulo: 'Ca – Cálcio %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'mg', rotulo: 'Mg – Magnésio %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'outros', rotulo: 'Outros nutrientes' },
      { chave: 'registro_mapa', rotulo: 'Nº registro MAPA (se houver)' },
    ],
  },
  defensivo: {
    titulo: 'Dados do defensivo',
    campos: [
      { chave: 'principio', rotulo: 'Princípio ativo' },
      { chave: 'concentracao', rotulo: 'Concentração (ex.: 480 g/L)' },
      {
        chave: 'classe',
        rotulo: 'Classe (pode marcar mais de uma)',
        multiplo: true,
        opcoes: ['Herbicida', 'Inseticida', 'Fungicida', 'Acaricida', 'Nematicida', 'Bactericida', 'Cupinicida', 'Formicida', 'Raticida', 'Adjuvante', 'Regulador de crescimento', 'Outro'],
      },
      { chave: 'registro_mapa', rotulo: 'Nº registro MAPA' },
    ],
  },
  semente: {
    titulo: 'Dados da semente ou muda',
    campos: [
      { chave: 'cultivar', rotulo: 'Cultivar / clone' },
      { chave: 'pureza', rotulo: 'Pureza %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'germinacao', rotulo: 'Germinação %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'registro_mapa', rotulo: 'Registro MAPA / RENASEM' },
    ],
  },
  vacina: {
    titulo: 'Classificação',
    campos: [{ chave: 'classe', rotulo: 'Classe terapêutica', opcoes: ['Vacina viral', 'Vacina bacteriana', 'Vacina reprodutiva', 'Outra'] }],
  },
  medicamento: {
    titulo: 'Classificação',
    campos: [{ chave: 'classe', rotulo: 'Classe terapêutica', opcoes: ['Antibiótico', 'Antiparasitário', 'Anti-inflamatório', 'Hormônio', 'Vitamina / suplemento', 'Outro'] }],
  },
  semen: {
    titulo: 'Dados do sêmen',
    campos: [
      { chave: 'touro', rotulo: 'Nome do touro' },
      { chave: 'registro', rotulo: 'Registro (RGN / RGD)' },
      { chave: 'raca', rotulo: 'Raça', largura: 'meia' },
      { chave: 'grau_sangue', rotulo: 'Grau de sangue', largura: 'meia' },
      { chave: 'tipo', rotulo: 'Tipo', opcoes: ['Convencional', 'Sexado fêmea', 'Sexado macho'] },
      { chave: 'central', rotulo: 'Central' },
      { chave: 'iabcz', rotulo: 'iABCZ', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'mgte', rotulo: 'MGTe', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'pta_leite', rotulo: 'PTA leite (kg)', teclado: 'decimal-pad', largura: 'meia' },
    ],
  },
  sal_mineral: {
    titulo: 'Níveis de garantia',
    campos: [
      { chave: 'fosforo', rotulo: 'Fósforo (g/kg)', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'consumo', rotulo: 'Consumo (g/cab/dia)', teclado: 'decimal-pad', largura: 'meia' },
    ],
  },
  racao: {
    titulo: 'Níveis de garantia',
    campos: [
      { chave: 'pb', rotulo: 'Proteína bruta %', teclado: 'decimal-pad', largura: 'meia' },
      { chave: 'ndt', rotulo: 'NDT %', teclado: 'decimal-pad', largura: 'meia' },
    ],
  },
  peca: {
    titulo: 'Dados da peça',
    campos: [
      { chave: 'codigo_peca', rotulo: 'Código da peça (fabricante)' },
      { chave: 'aplicacao', rotulo: 'Aplicação (máquina / implemento)' },
    ],
  },
};

const visivel = (c: Def, a: Atributos) => !c.quando || a[c.quando[0]] === c.quando[1];

/** Texto curto dos dados técnicos, para a consulta. */
export function textoAtributos(categoria: string, a: Atributos | null | undefined): string | null {
  const d = DEFS[categoria];
  if (!d || !a) return null;
  const partes = d.campos.filter((c) => a[c.chave] && visivel(c, a)).map((c) => `${c.rotulo.replace(/ \(.*\)| %$/g, '')}: ${a[c.chave]}${c.rotulo.endsWith('%') ? '%' : ''}`);
  if (categoria === 'adubo' || categoria === 'fertilizante') {
    const npk = ['n', 'p', 'k'].map((k) => a[k] || '0');
    if (npk.some((x) => x !== '0')) return `NPK ${npk.join('-')}${partes.filter((p) => !/^(N|P|K) /.test(p)).length ? ' · ' + partes.filter((p) => !/^(N|P|K) /.test(p)).join(' · ') : ''}`;
  }
  return partes.length ? partes.join(' · ') : null;
}

export default function AtributosProduto({ categoria, valor, aoMudar }: { categoria: string; valor: Atributos; aoMudar: (a: Atributos) => void }) {
  const d = DEFS[categoria];
  if (!d) return null;
  const mudar = (k: string, v: string) => aoMudar({ ...valor, [k]: v });
  const blocos: Def[][] = [];
  for (const c of d.campos.filter((x) => visivel(x, valor))) {
    const ultimo = blocos[blocos.length - 1];
    if (c.largura === 'meia' && ultimo && ultimo.length === 1 && ultimo[0].largura === 'meia') ultimo.push(c);
    else blocos.push([c]);
  }
  return (
    <View style={{ gap: 12 }}>
      <Text style={estilos.titulo}>{d.titulo}</Text>
      {blocos.map((b) => (
        <View key={b.map((c) => c.chave).join()} style={estilos.linha}>
          {b.map((c) => (
            <View key={c.chave} style={{ flex: 1 }}>
              {c.opcoes ? (
                c.multiplo ? (
                  <Escolha
                    rotulo={c.rotulo}
                    multiplo
                    opcoes={c.opcoes.map((o) => ({ valor: o, rotulo: o }))}
                    valor={listaMarcada(valor[c.chave])}
                    // grava na ordem da lista de opções (ex.: "Acaricida, Inseticida")
                    aoMudar={(v) => mudar(c.chave, c.opcoes!.filter((o) => v.includes(o)).join(', '))}
                  />
                ) : (
                  <Escolha rotulo={c.rotulo} opcoes={c.opcoes.map((o) => ({ valor: o, rotulo: o }))} valor={valor[c.chave] ? [valor[c.chave]] : []} aoMudar={(v) => mudar(c.chave, valor[c.chave] === v[0] ? '' : v[0])} />
                )
              ) : (
                <Campo rotulo={c.rotulo} value={valor[c.chave] ?? ''} onChangeText={(t) => mudar(c.chave, t)} keyboardType={c.teclado} autoCapitalize={c.teclado ? undefined : 'sentences'} />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.texto },
  linha: { flexDirection: 'row', gap: 12 },
});
