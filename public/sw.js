/*
 * Service worker del punto de venta.
 *
 * La caja tiene que ABRIR sin internet, no solo seguir abierta: una sucursal
 * incomunicada reinicia la PC y el cajero da clic al icono de Glamouroso igual
 * que cualquier otro día. Lo que se cobra ahí se guarda en IndexedDB y sube
 * cuando vuelve la red (`src/lib/pos-offline/`); este archivo solo se encarga de
 * que la pantalla exista para poder cobrar.
 *
 * Dos estrategias, por lo que es cada cosa:
 *
 * - `/_next/static/*` va **primero al caché**. Son archivos con hash en el
 *   nombre: si el nombre es el mismo, el contenido es el mismo, así que ir a la
 *   red a confirmarlo solo agrega espera —y offline, agrega una espera que
 *   siempre termina en error.
 * - El HTML va **primero a la red**, con el caché de respaldo. Así una versión
 *   nueva de la caja entra sin trucos, y sin red se abre la última que se vio.
 *
 * `/api` NUNCA se cachea: existencias, tickets y sincronización tienen que ser
 * frescos o no ser.
 */

const CACHE = "glamouroso-pos-v3";

// Lo que la caja necesita para arrancar en frío. Los chunks de Next no se
// pueden listar aquí (llevan hash del build), pero se cachean al primer uso y
// como son inmutables ya no se vuelven a pedir.
const SHELL = [
  "/pos",
  "/pos/configuracion",
  "/login",
  "/branding/glamouroso-logo-azul-sobre-blanco.svg",
  "/icons/pos-192.png",
  "/icons/pos-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Una a una: si un recurso falta (un icono renombrado), `addAll` aborta
      // el install entero y la caja se queda sin shell cacheado.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
  );
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

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Navegación sin red y sin esa página cacheada: se abre la caja, que es a
    // donde va el cajero de todos modos.
    if (request.mode === "navigate") {
      const shell = await caches.match("/pos");
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;

  event.respondWith(isImmutableAsset(url) ? cacheFirst(request) : networkFirst(request));
});
