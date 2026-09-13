/*
 * Service worker mínimo del punto de venta.
 *
 * Solo cachea el app shell para que la caja arranque rápido en la PC de la
 * sucursal. Las ventas NO son offline: `POST /pos/sales` siempre va a la red,
 * porque el folio y el descuento de inventario los resuelve el servidor. Lo que
 * protege de una red intermitente es la clave de idempotencia del ticket.
 */

const CACHE = "glamouroso-pos-v2";
// Lo que la caja pinta en el primer frame: la pantalla, el logo de la barra
// superior y los iconos de la app instalada. El logo de la G ya no se precachea
// porque la barra usa el logotipo completo.
const SHELL = [
  "/pos",
  "/branding/glamouroso-logo-azul-sobre-blanco.svg",
  "/icons/pos-192.png",
  "/icons/pos-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Nada de la API se sirve de caché: existencias y tickets deben ser frescos.
  if (url.pathname.startsWith("/api")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
  );
});
