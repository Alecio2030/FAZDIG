// Fazenda Digital – V184: guarda o app no aparelho para abrir sem sinal (Modo Vaqueiro).
// Com sinal, sempre busca a versão nova (o que está guardado só é usado quando a rede falha).
const CACHE = 'fazenda-digital-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html']).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // só o próprio site (o banco de dados e os serviços de fora seguem direto)
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'default')) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => undefined);
        }
        return resp;
      })
      .catch(async () => {
        const c = await caches.open(CACHE);
        const achado = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (achado) return achado;
        if (req.mode === 'navigate') return (await c.match('/index.html')) || (await c.match('/')) || Response.error();
        return Response.error();
      }),
  );
});
