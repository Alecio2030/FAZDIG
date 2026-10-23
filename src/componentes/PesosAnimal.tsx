import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Aviso from './Aviso';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { doBanco } from '../lib/datas';
import { formatarNumero } from '../lib/formatos';
import { gmd, textoGmd } from '../lib/pesagens';
import { cores, tam } from '../tema';

type Peso = { id: string; data: string; peso_kg: number; origem: string; pesagem: number | null };
const um = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Todos os pesos guardados do animal (cadastro e pesagens), do mais novo para o mais antigo, com o ganho entre eles. */
export default function PesosAnimal({ animalId }: { animalId: string }) {
  const [pesos, setPesos] = useState<Peso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    consulta<any[]>(
      supabase
        .from('animal_pesos')
        .select('id, data, peso_kg, origem, item:pesagem_itens ( pesagem:pesagens ( numero ) )')
        .eq('animal_id', animalId)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false }),
    )
      .then((d) => setPesos(d.map((x) => ({ id: x.id, data: x.data, peso_kg: Number(x.peso_kg), origem: x.origem, pesagem: um(um(x.item)?.pesagem)?.numero ?? null }))))
      .catch((e) => setErro(traduzirErro(e)));
  }, [animalId]);

  if (erro) return <Aviso tipo="erro" texto={erro} />;
  if (!pesos) return <ActivityIndicator color={cores.primaria} />;
  if (!pesos.length) return <Text style={estilos.nota}>Nenhum peso guardado ainda. O peso informado aqui e as pesadas com o brinco dele entram neste histórico.</Text>;

  const primeiro = pesos[pesos.length - 1];
  const ultimo = pesos[0];
  const geral = pesos.length > 1 ? textoGmd(gmd(primeiro.peso_kg, primeiro.data, ultimo.peso_kg, ultimo.data)) : null;

  return (
    <View style={estilos.cartao}>
      {pesos.map((p, i) => {
        const anterior = pesos[i + 1];
        const g = anterior ? textoGmd(gmd(anterior.peso_kg, anterior.data, p.peso_kg, p.data)) : null;
        return (
          <View key={p.id} style={[estilos.linha, i > 0 && estilos.divisa]}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.data}>{doBanco(p.data)}</Text>
              <Text style={estilos.nota}>{p.origem === 'pesagem' ? (p.pesagem ? `Pesagem nº ${p.pesagem}` : 'Pesagem') : 'Informado no cadastro'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={estilos.peso}>{formatarNumero(p.peso_kg, 1)} kg</Text>
              {g ? <Text style={estilos.nota}>{g}</Text> : null}
            </View>
          </View>
        );
      })}
      {geral && (
        <Text style={estilos.total}>
          {pesos.length} pesos · do primeiro ao último: {geral}
        </Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, paddingHorizontal: tam.espaco, paddingVertical: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  divisa: { borderTopWidth: 1, borderTopColor: cores.borda },
  data: { fontSize: tam.texto, fontWeight: '600', color: cores.texto },
  peso: { fontSize: tam.texto, fontWeight: '800', color: cores.cafe },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave },
  total: { fontSize: tam.pequeno + 1, fontWeight: '700', color: cores.primariaEscura, paddingVertical: 8, borderTopWidth: 1, borderTopColor: cores.borda },
});
