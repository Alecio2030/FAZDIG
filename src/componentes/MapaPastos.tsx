import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from './VisorWeb';
import type { Ponto } from '../lib/pastos';

// Mapa com Leaflet + OpenStreetMap (gratuito, sem chave de API), dentro de um WebView.
// A tela conversa com o mapa por mensagens: manda os pastos e o modo de desenho; recebe toques e pontos.

export type PastoMapa = { id: string; nome: string; cor: string; pontos: Ponto[]; rotulo: string };

export type MapaRef = {
  mostrarPastos: (p: PastoMapa[], ajustar?: boolean) => void;
  desenhar: (ativo: boolean, pontos?: Ponto[]) => void;
  desfazer: () => void;
  limpar: () => void;
  /** "alfinete": marca o lugar com um alfinete (usado na busca por coordenadas e na escolha de um lugar achado) */
  irPara: (lat: number, lng: number, zoom?: number, alfinete?: boolean) => void;
  /** Busca o lugar pelo nome. "contexto" (município, UF e um ponto da fazenda) ajuda a achar distritos e lugares pequenos. */
  buscar: (texto: string, contexto?: ContextoBusca) => void;
  focarPasto: (id: string) => void;
};

export type ContextoBusca = { municipio?: string | null; uf?: string | null; lat?: number | null; lng?: number | null };
/** Lugar achado na busca. "aproximado" = não achou o que foi pedido; é só a cidade (ou a parte) mais perto do texto. */
export type LugarMapa = { nome: string; lat: number; lng: number; aproximado: boolean };

type Props = {
  /** Lugares achados na busca (o mapa já foi para o primeiro). Lista vazia = nada achado. */
  aoLugares?: (lista: LugarMapa[], pedido: string) => void;
  aoTocarPasto?: (id: string) => void;
  aoMudarPontos?: (p: Ponto[]) => void;
  aoAviso?: (texto: string) => void;
  aoPronto?: () => void;
};

const HTML = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
 html,body,#m{height:100%;margin:0;padding:0;background:#dfe6dc}
 .rot{background:rgba(255,255,255,.88);border:none;border-radius:6px;padding:2px 6px;font:600 12px sans-serif;color:#1b2320;box-shadow:none;text-align:center}
 .rot:before{display:none}
 .vert{width:14px;height:14px;border-radius:7px;background:#fff;border:3px solid #6B4226;margin:-7px 0 0 -7px}
</style></head><body><div id="m"></div>
<script>
 function env(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
 var mapa = L.map('m', { zoomControl: true }).setView([-15.8, -47.9], 4);
 var ruas = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
 // maxNativeZoom: na roça a imagem nem sempre existe no zoom máximo; em vez de ficar em branco, amplia a última que tem
 var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 17, attribution: 'Imagens © Esri' });
 // nomes de lugares e estradas por cima da foto de satélite, para se localizar
 var nomes = L.layerGroup([
   L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 17 }),
   L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 17 })
 ]);
 // a mesma foto sem o limite: onde existe imagem mais fina, mostra mais detalhe; onde não existe, fica em branco de perto
 var satFino = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagens © Esri' });
 sat.addTo(mapa); nomes.addTo(mapa);
 L.control.layers({ 'Satélite': sat, 'Satélite (mais detalhe)': satFino, 'Mapa': ruas }, { 'Nomes e estradas': nomes }, { position: 'topright' }).addTo(mapa);
 L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa);
 var alfinete = null;
 function marcar(lat, lng) {
   if (alfinete) mapa.removeLayer(alfinete);
   alfinete = L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#C62828', fillOpacity: 1, interactive: false }).addTo(mapa);
 }

 // ---------- busca de lugar ----------
 function pedir(url) { return fetch(url, { headers: { 'Accept-Language': 'pt-BR' } }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return null; }); }
 function nominatim(q, ctx) {
   var u = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=br&q=' + encodeURIComponent(q);
   if (ctx && ctx.lat != null && ctx.lng != null) u += '&viewbox=' + (ctx.lng - 0.8) + ',' + (ctx.lat + 0.8) + ',' + (ctx.lng + 0.8) + ',' + (ctx.lat - 0.8);
   return pedir(u).then(function (d) {
     if (d === null) return null;
     return (d || []).map(function (x) { return { nome: x.display_name, lat: +x.lat, lng: +x.lon }; });
   });
 }
 function photon(q, ctx) {
   var u = 'https://photon.komoot.io/api/?limit=8&q=' + encodeURIComponent(q);
   if (ctx && ctx.lat != null && ctx.lng != null) u += '&lat=' + ctx.lat + '&lon=' + ctx.lng;
   return pedir(u).then(function (d) {
     if (d === null) return null;
     return ((d && d.features) || []).filter(function (f) { return f.properties && f.properties.countrycode === 'BR' && f.geometry; }).slice(0, 6).map(function (f) {
       var p = f.properties;
       var partes = [p.name, p.district, p.city, p.county, p.state].filter(function (v, i, a) { return v && a.indexOf(v) === i; });
       return { nome: partes.join(', '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
     });
   });
 }
 function sem(t) { return String(t || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); }
 function buscarLugar(texto, ctx) {
   ctx = ctx || {};
   var local = [ctx.municipio, ctx.uf].filter(Boolean).join(', ');
   var temCidade = ctx.municipio && sem(texto).indexOf(sem(ctx.municipio)) >= 0;
   // 1º o texto como veio (com o município da fazenda, se faltar); depois as buscas de reserva
   var exatas = [];
   if (local && !temCidade) exatas.push(texto + ', ' + local);
   exatas.push(texto);
   var partes = texto.split(/\\s+[-–]\\s+|[,;]|\\//).map(function (s) { return s.trim(); }).filter(Boolean);
   // reserva: sem achar o distrito, mostra a cidade (a última parte do que foi digitado, ou o município da fazenda)
   var reservas = [];
   if (partes.length > 1) reservas.push(partes.slice(1).join(', '));
   if (partes.length > 2) reservas.push(partes[partes.length - 1]);
   if (local && !temCidade) reservas.push(local);
   if (ctx.uf) reservas = reservas.map(function (q) { return new RegExp('[ ,-]' + ctx.uf + '$', 'i').test(q) ? q : q + ', ' + ctx.uf; });
   var fila = [];
   exatas.forEach(function (q) { fila.push({ f: nominatim, q: q, aprox: false }); });
   exatas.forEach(function (q) { fila.push({ f: photon, q: q, aprox: false }); });
   reservas.forEach(function (q) { fila.push({ f: nominatim, q: q, aprox: true }); });
   var falhou = false;
   function proxima(i) {
     if (i >= fila.length) {
       if (falhou) env({ tipo: 'aviso', texto: 'Sem internet para buscar o lugar.' });
       else env({ tipo: 'lugares', pedido: texto, lista: [] });
       return;
     }
     var it = fila[i];
     it.f(it.q, ctx).then(function (lista) {
       if (lista === null) falhou = true;
       if (!lista || !lista.length) { setTimeout(function () { proxima(i + 1); }, it.f === nominatim ? 1100 : 0); return; }
       lista.forEach(function (x) { x.aproximado = it.aprox; });
       mapa.setView([lista[0].lat, lista[0].lng], it.aprox ? 13 : 15);
       if (!it.aprox) marcar(lista[0].lat, lista[0].lng);
       env({ tipo: 'lugares', pedido: texto, lista: lista });
     });
   }
   proxima(0);
 }

 var camadaPastos = L.layerGroup().addTo(mapa);
 var poligonos = {};
 var desenhando = false, pontos = [], camadaDesenho = L.layerGroup().addTo(mapa);

 function mostrarPastos(lista, ajustar) {
   camadaPastos.clearLayers(); poligonos = {};
   var limites = [];
   lista.forEach(function (p) {
     if (!p.pontos || p.pontos.length < 3) return;
     var pol = L.polygon(p.pontos, { color: p.cor, weight: 2, fillColor: p.cor, fillOpacity: desenhando ? 0.12 : 0.38 });
     pol.bindTooltip(p.rotulo, { permanent: true, direction: 'center', className: 'rot' });
     pol.on('click', function (e) { if (desenhando) { adicionar(e.latlng); return; } L.DomEvent.stopPropagation(e); env({ tipo: 'toquePasto', id: p.id }); });
     pol.addTo(camadaPastos); poligonos[p.id] = pol;
     p.pontos.forEach(function (x) { limites.push(x); });
   });
   if (ajustar && limites.length) mapa.fitBounds(limites, { padding: [24, 24] });
 }
 function redesenhar() {
   camadaDesenho.clearLayers();
   if (pontos.length >= 3) L.polygon(pontos, { color: '#6B4226', weight: 3, dashArray: '6 4', fillOpacity: 0.2 }).addTo(camadaDesenho);
   else if (pontos.length === 2) L.polyline(pontos, { color: '#6B4226', weight: 3 }).addTo(camadaDesenho);
   pontos.forEach(function (x, i) {
     var mk = L.marker(x, { draggable: true, icon: L.divIcon({ className: '', html: '<div class="vert"></div>' }) });
     mk.on('drag', function (e) { pontos[i] = [e.latlng.lat, e.latlng.lng]; });
     mk.on('dragend', function () { redesenhar(); env({ tipo: 'pontos', pontos: pontos }); });
     mk.addTo(camadaDesenho);
   });
 }
 function adicionar(ll) { pontos.push([ll.lat, ll.lng]); redesenhar(); env({ tipo: 'pontos', pontos: pontos }); }
 mapa.on('click', function (e) { if (desenhando) adicionar(e.latlng); });

 window.receber = function (m) {
   try {
     if (m.tipo === 'pastos') mostrarPastos(m.lista, m.ajustar);
     else if (m.tipo === 'desenhar') {
       desenhando = m.ativo; pontos = m.pontos || [];
       redesenhar();
       Object.keys(poligonos).forEach(function (k) { poligonos[k].setStyle({ fillOpacity: desenhando ? 0.12 : 0.38 }); });
       if (desenhando && pontos.length >= 3) mapa.fitBounds(pontos, { padding: [40, 40] });
     }
     else if (m.tipo === 'desfazer') { pontos.pop(); redesenhar(); env({ tipo: 'pontos', pontos: pontos }); }
     else if (m.tipo === 'limpar') { pontos = []; redesenhar(); env({ tipo: 'pontos', pontos: pontos }); }
     else if (m.tipo === 'irPara') { mapa.setView([m.lat, m.lng], m.zoom || 16); if (m.alfinete) marcar(m.lat, m.lng); }
     else if (m.tipo === 'focar') { var p = poligonos[m.id]; if (p) mapa.fitBounds(p.getBounds(), { padding: [40, 40] }); }
     else if (m.tipo === 'buscar') buscarLugar(m.texto, m.contexto);
   } catch (e) { env({ tipo: 'aviso', texto: String(e) }); }
 };
 env({ tipo: 'pronto' });
</script></body></html>`;

/** Mapa dos pastos (satélite ou mapa de ruas), com toque nos pastos e desenho por toques. */
const MapaPastos = forwardRef<MapaRef, Props>(function MapaPastos({ aoTocarPasto, aoMudarPontos, aoAviso, aoPronto, aoLugares }, ref) {
  const web = useRef<any>(null);
  const mandar = (m: object) => web.current?.injectJavaScript(`window.receber && window.receber(${JSON.stringify(m)}); true;`);

  useImperativeHandle(ref, () => ({
    mostrarPastos: (lista, ajustar) => mandar({ tipo: 'pastos', lista, ajustar: !!ajustar }),
    desenhar: (ativo, pontos) => mandar({ tipo: 'desenhar', ativo, pontos: pontos ?? [] }),
    desfazer: () => mandar({ tipo: 'desfazer' }),
    limpar: () => mandar({ tipo: 'limpar' }),
    irPara: (lat, lng, zoom, alfinete) => mandar({ tipo: 'irPara', lat, lng, zoom, alfinete: !!alfinete }),
    buscar: (texto, contexto) => mandar({ tipo: 'buscar', texto, contexto: contexto ?? null }),
    focarPasto: (id) => mandar({ tipo: 'focar', id }),
  }));

  function receber(e: WebViewMessageEvent) {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.tipo === 'pronto') aoPronto?.();
      else if (m.tipo === 'toquePasto') aoTocarPasto?.(m.id);
      else if (m.tipo === 'pontos') aoMudarPontos?.(m.pontos);
      else if (m.tipo === 'aviso') aoAviso?.(m.texto);
      else if (m.tipo === 'lugares') {
        const lista = (m.lista ?? []) as LugarMapa[];
        if (aoLugares) aoLugares(lista, m.pedido);
        // tela que não mostra a lista: só avisa onde o mapa foi parar
        else if (!lista.length) aoAviso?.('Lugar não encontrado.');
        else aoAviso?.(lista[0].aproximado ? `Não achei "${m.pedido}". Mostrando ${lista[0].nome}.` : lista[0].nome);
      }
    } catch {
      // mensagem desconhecida: ignora
    }
  }

  return (
    <View style={estilos.caixa}>
      <WebView
        ref={web}
        source={{ html: HTML, baseUrl: 'https://fazendadigital.app/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={receber}
        style={{ flex: 1 }}
        setSupportMultipleWindows={false}
      />
    </View>
  );
});

export default MapaPastos;

const estilos = StyleSheet.create({
  caixa: { flex: 1, borderRadius: 10, overflow: 'hidden', minHeight: 320 },
});
