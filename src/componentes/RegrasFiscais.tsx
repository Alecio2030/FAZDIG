import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Aviso from './Aviso';
import Botao from './Botao';
import Campo from './Campo';
import Escolha from './Escolha';
import { consulta, supabase, traduzirErro } from '../lib/supabase';
import { CSOSN, CST_ICMS } from '../lib/nfe';
import { lerNumero, numeroParaCampo, somenteDigitos } from '../lib/formatos';
import { cores, tam } from '../tema';

type Regra = {
  produto: 'cafe' | 'bovinos' | 'outros';
  destino: 'interna' | 'interestadual';
  natureza: string;
  ncm: string;
  cfop: string;
  cst_icms: string;
  aliquota_icms: number;
  reducao_bc: number;
  cst_pis: string;
  cst_cofins: string;
  texto_legal: string | null;
};
const PRODUTO = { cafe: 'Café', bovinos: 'Bovinos', outros: 'Outros produtos' };
const DESTINO = { interna: 'dentro do estado', interestadual: 'para outro estado' };

/**
 * V157: tributação padrão da NF-e por produto (dentro do estado e para fora). Vale para todas as fazendas;
 * na conferência de cada nota dá para trocar só daquela nota. A contabilidade confere estes valores.
 */
export default function RegrasFiscais({ simples }: { simples: boolean }) {
  const [regras, setRegras] = useState<Regra[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setRegras(await consulta<Regra[]>(supabase.from('nfe_regras').select('*').order('produto').order('destino')));
    } catch (e: any) {
      setErro(/nfe_regras/i.test(String(e?.message ?? '')) ? 'Falta atualizar o banco: rode o arquivo "V157-banco.sql" no Supabase.' : traduzirErro(e));
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrir(r: Regra) {
    const k = `${r.produto}-${r.destino}`;
    setErro(null);
    setAviso(null);
    if (aberta === k) return setAberta(null);
    setAberta(k);
    setF({
      natureza: r.natureza, ncm: r.ncm === '00000000' ? '' : r.ncm, cfop: r.cfop, cst_icms: r.cst_icms,
      aliquota_icms: numeroParaCampo(r.aliquota_icms), reducao_bc: numeroParaCampo(r.reducao_bc), cst_pis: r.cst_pis, cst_cofins: r.cst_cofins, texto_legal: r.texto_legal ?? '',
    });
  }

  async function gravar(r: Regra) {
    setErro(null);
    setGravando(true);
    const { error } = await supabase.rpc('salvar_nfe_regra', {
      p: {
        produto: r.produto, destino: r.destino, natureza: f.natureza, ncm: somenteDigitos(f.ncm), cfop: somenteDigitos(f.cfop), cst_icms: f.cst_icms,
        aliquota_icms: lerNumero(f.aliquota_icms ?? '') ?? 0, reducao_bc: lerNumero(f.reducao_bc ?? '') ?? 0, cst_pis: somenteDigitos(f.cst_pis), cst_cofins: somenteDigitos(f.cst_cofins), texto_legal: f.texto_legal,
      },
    });
    setGravando(false);
    if (error) return setErro(traduzirErro(error));
    setAberta(null);
    setAviso(`${PRODUTO[r.produto]} ${DESTINO[r.destino]}: gravado.`);
    carregar();
  }

  if (!regras) return erro ? <Aviso tipo="erro" texto={erro} /> : null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={estilos.nota}>Sugestão inicial para conferir com a contabilidade. Toque para alterar.</Text>
      {aviso && <Aviso tipo="sucesso" texto={aviso} />}
      {regras.map((r) => {
        const k = `${r.produto}-${r.destino}`;
        return (
          <View key={k} style={estilos.caixa}>
            <Pressable onPress={() => abrir(r)} accessibilityRole="button">
              <Text style={estilos.titulo}>
                {PRODUTO[r.produto]} {DESTINO[r.destino]}
              </Text>
              <Text style={estilos.nota}>
                CFOP {r.cfop} · CST {r.cst_icms}
                {Number(r.aliquota_icms) ? ` · ${numeroParaCampo(r.aliquota_icms)}%` : ''} · NCM {r.ncm === '00000000' ? 'a informar na nota' : r.ncm}
              </Text>
            </Pressable>
            {aberta === k && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Campo rotulo="Natureza da operação" value={f.natureza} onChangeText={(t) => setF({ ...f, natureza: t })} />
                <View style={estilos.linha}>
                  <View style={{ flex: 1 }}>
                    <Campo rotulo="NCM" value={f.ncm} onChangeText={(t) => setF({ ...f, ncm: somenteDigitos(t).slice(0, 8) })} keyboardType="number-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Campo rotulo="CFOP" value={f.cfop} onChangeText={(t) => setF({ ...f, cfop: somenteDigitos(t).slice(0, 4) })} keyboardType="number-pad" />
                  </View>
                </View>
                <Escolha rotulo={simples ? 'CSOSN' : 'CST do ICMS'} opcoes={simples ? CSOSN : CST_ICMS} valor={[f.cst_icms]} aoMudar={(v) => setF({ ...f, cst_icms: v[0] ?? f.cst_icms })} />
                {['00', '20'].includes(f.cst_icms) && (
                  <View style={estilos.linha}>
                    <View style={{ flex: 1 }}>
                      <Campo rotulo="Alíquota (%)" value={f.aliquota_icms} onChangeText={(t) => setF({ ...f, aliquota_icms: t })} keyboardType="decimal-pad" />
                    </View>
                    {f.cst_icms === '20' && (
                      <View style={{ flex: 1 }}>
                        <Campo rotulo="Redução da base (%)" value={f.reducao_bc} onChangeText={(t) => setF({ ...f, reducao_bc: t })} keyboardType="decimal-pad" />
                      </View>
                    )}
                  </View>
                )}
                <View style={estilos.linha}>
                  <View style={{ flex: 1 }}>
                    <Campo rotulo="CST do PIS" value={f.cst_pis} onChangeText={(t) => setF({ ...f, cst_pis: somenteDigitos(t).slice(0, 2) })} keyboardType="number-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Campo rotulo="CST da COFINS" value={f.cst_cofins} onChangeText={(t) => setF({ ...f, cst_cofins: somenteDigitos(t).slice(0, 2) })} keyboardType="number-pad" />
                  </View>
                </View>
                <Campo rotulo="Texto legal (vai nas informações complementares)" value={f.texto_legal} onChangeText={(t) => setF({ ...f, texto_legal: t })} multiline />
                {erro && <Aviso tipo="erro" texto={erro} />}
                <Botao titulo="Gravar" onPress={() => gravar(r)} carregando={gravando} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19 },
  caixa: { borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.cartao, padding: 12 },
  titulo: { fontSize: tam.texto, fontWeight: '700', color: cores.texto },
  linha: { flexDirection: 'row', gap: 10 },
});
