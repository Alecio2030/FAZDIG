// Versão do WebView para o navegador (PC e celular pelo site): a página do mapa abre num quadro (iframe)
// e conversa com a tela por mensagens, do mesmo jeito que no celular.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

export type WebViewMessageEvent = { nativeEvent: { data: string } };

type Props = {
  source: { html: string; baseUrl?: string };
  onMessage?: (e: WebViewMessageEvent) => void;
  style?: any;
  [outras: string]: any;
};

export type VisorRef = { injectJavaScript: (codigo: string) => void };

let contador = 0;

const VisorWeb = forwardRef<VisorRef, Props>(function VisorWeb({ source, onMessage }, ref) {
  const quadro = useRef<any>(null);
  const aoReceber = useRef(onMessage);
  aoReceber.current = onMessage;
  const canal = useMemo(() => `visor${++contador}_${Date.now()}`, []);

  // A página ganha o mesmo "ReactNativeWebView.postMessage" do celular e passa a aceitar comandos por mensagem.
  const html = useMemo(() => {
    const ponte =
      '<script>(function(){' +
      `var canal=${JSON.stringify(canal)};` +
      'window.ReactNativeWebView={postMessage:function(d){parent.postMessage({canal:canal,dados:String(d)},"*");}};' +
      'window.addEventListener("message",function(e){var m=e.data;if(m&&m.canal===canal&&typeof m.executar==="string"){try{(0,eval)(m.executar);}catch(x){}}});' +
      '})();</script>';
    const h = source.html;
    const i = h.indexOf('<head>');
    return i >= 0 ? h.slice(0, i + 6) + ponte + h.slice(i + 6) : ponte + h;
  }, [source.html, canal]);

  useEffect(() => {
    const w = globalThis as any;
    const ouvir = (e: any) => {
      const m = e?.data;
      if (m && m.canal === canal && typeof m.dados === 'string') aoReceber.current?.({ nativeEvent: { data: m.dados } });
    };
    w.addEventListener?.('message', ouvir);
    return () => w.removeEventListener?.('message', ouvir);
  }, [canal]);

  useImperativeHandle(ref, () => ({
    injectJavaScript: (codigo: string) => {
      quadro.current?.contentWindow?.postMessage({ canal, executar: codigo }, '*');
    },
  }));

  return React.createElement('iframe', {
    ref: quadro,
    srcDoc: html,
    title: 'Mapa',
    allow: 'geolocation',
    style: { border: 0, width: '100%', height: '100%', flex: 1, minHeight: 320, display: 'block' },
  } as any);
});

export default VisorWeb;
