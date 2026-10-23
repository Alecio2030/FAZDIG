import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Botao from './Botao';
import { doBanco } from '../lib/datas';
import { formatarNumero } from '../lib/formatos';
import { textoMm } from '../lib/clima';
import { FATOR_ESGOTAMENTO, type AguaTalhao } from '../lib/irrigacao';
import { cores, tam } from '../tema';

/** Água no solo de um talhão: barra do quanto ainda tem, se é hora de irrigar e quanto repor. */
export default function QuadroAgua({ t, comNome = true, aoLancar }: { t: AguaTalhao; comNome?: boolean; aoLancar?: (lamina: number) => void }) {
  const cor = t.precisa ? cores.erro : t.perc < 65 ? cores.cafe : cores.primaria;
  const limite = (1 - FATOR_ESGOTAMENTO) * 100;
  const chuvaAjuda = t.precisa && t.chuvaPrevista >= t.deficit * 0.6;
  return (
    <View style={estilos.caixa}>
      {comNome && (
        <Text style={estilos.nome}>
          {t.nome}
          <Text style={estilos.nota}>  {t.irrigado_sistema ? t.metodo ?? 'Irrigada' : 'Sequeiro'}</Text>
        </Text>
      )}
      <View style={estilos.barra}>
        <View style={[estilos.cheio, { width: `${Math.max(2, Math.min(100, t.perc))}%`, backgroundColor: cor }]} />
        <View style={[estilos.marca, { left: `${limite}%` }]} />
      </View>
      <Text style={[estilos.forte, { color: cor }]}>
        Água no solo: {formatarNumero(t.perc)}% ({textoMm(t.agua)} de {textoMm(t.cad)} mm)
      </Text>

      {t.irrigado_sistema ? (
        t.precisa ? (
          <>
            <Text style={estilos.acao}>Irrigar: {textoMm(t.laminaBruta)} mm</Text>
            <Text style={estilos.nota}>
              Repõe os {textoMm(t.laminaLiquida)} mm que faltam, contando {formatarNumero(t.eficiencia * 100)}% de eficiência do sistema.
              {t.litrosPlanta != null ? ` Dá uns ${formatarNumero(t.litrosPlanta, 1)} litros por planta` : ''}
              {t.m3 != null ? `${t.litrosPlanta != null ? ' e' : ' Dá'} ${formatarNumero(t.m3)} m³ no talhão` : ''}
              {t.litrosPlanta != null || t.m3 != null ? '.' : ''}
            </Text>
            {chuvaAjuda && <Text style={[estilos.nota, { color: cores.info, fontWeight: '700' }]}>Há {textoMm(t.chuvaPrevista)} mm de chuva previstos para os próximos 3 dias: dá para irrigar menos ou esperar para ver.</Text>}
          </>
        ) : (
          <Text style={estilos.nota}>
            Não precisa irrigar agora.
            {t.diasAteIrrigar != null ? ` Sem chuva, chega ao ponto de irrigar em uns ${t.diasAteIrrigar} ${t.diasAteIrrigar === 1 ? 'dia' : 'dias'}.` : ''}
            {t.chuvaPrevista >= 1 ? ` Chuva prevista em 3 dias: ${textoMm(t.chuvaPrevista)} mm.` : ''}
          </Text>
        )
      ) : (
        <Text style={estilos.nota}>{t.precisa ? 'Lavoura de sequeiro com falta de água no solo: sinal de estresse hídrico.' : 'Lavoura de sequeiro: o solo ainda tem água para a planta.'}{t.chuvaPrevista >= 1 ? ` Chuva prevista em 3 dias: ${textoMm(t.chuvaPrevista)} mm.` : ''}</Text>
      )}

      <Text style={estilos.nota}>
        Consumo da lavoura: {textoMm(t.consumoDia)} mm por dia (Kc {String(t.kc).replace('.', ',')}, {t.fase}). Solo {t.textura}, raízes até {t.raizCm} cm.
        {t.ultimaIrrigacao ? ` Última irrigação lançada: ${doBanco(t.ultimaIrrigacao.data)} (${textoMm(t.ultimaIrrigacao.mm)} mm).` : t.irrigado_sistema ? ' Nenhuma irrigação lançada nos últimos 60 dias.' : ''}
      </Text>
      {t.irrigado_sistema && aoLancar && <Botao titulo={t.precisa ? `Lançar irrigação de ${textoMm(t.laminaBruta)} mm` : 'Lançar irrigação'} tipo={t.precisa ? 'primario' : 'secundario'} onPress={() => aoLancar(t.precisa ? t.laminaBruta : 0)} />}
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { backgroundColor: cores.cartao, borderRadius: tam.raio, borderWidth: 1, borderColor: cores.borda, padding: 12, gap: 8 },
  nome: { fontSize: tam.texto, fontWeight: '800', color: cores.primariaEscura },
  nota: { fontSize: tam.pequeno, color: cores.textoSuave, lineHeight: 19, fontWeight: '400' },
  forte: { fontSize: tam.pequeno + 1, fontWeight: '800' },
  acao: { fontSize: tam.subtitulo + 2, fontWeight: '800', color: cores.erro },
  barra: { height: 16, borderRadius: 8, backgroundColor: cores.fundo, borderWidth: 1, borderColor: cores.borda, overflow: 'hidden' },
  cheio: { height: '100%' },
  marca: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: cores.texto },
});
