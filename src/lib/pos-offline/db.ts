"use client";

/**
 * Base local de la caja.
 *
 * La caja es *local-first*: una venta se escribe AQUÍ primero, se imprime, y el
 * motor de sincronización la sube cuando hay red. Con internet eso tarda menos
 * de un segundo y el cajero no nota nada; sin internet se acumula y la caja
 * sigue cobrando igual.
 *
 * IndexedDB y no `localStorage` porque esto guarda la cola de ventas cobradas:
 * `localStorage` es síncrono, tiene ~5 MB y no soporta transacciones, y aquí lo
 * que está en juego es dinero que ya entró al cajón.
 *
 * Lo que vive en cada almacén está en `STORES`. Todo es por PC: una sucursal,
 * una caja (decisión del negocio, 2026-09-18).
 */

const DB_NAME = "glamouroso-pos";
const DB_VERSION = 1;

export const STORES = {
  /** Eventos por subir, en orden: ventas, anulaciones y altas de cliente. */
  OUTBOX: "outbox",
  /** Tickets de los últimos días: alimentan F4, la reimpresión y la última venta. */
  SALES: "sales",
  /** Clientes de la sucursal para buscar por teléfono sin red. */
  CUSTOMERS: "customers",
  /** Catálogo, contadores de folio, sesión y metadatos: una fila por clave. */
  KV: "kv",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador no tiene IndexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
        const outbox = db.createObjectStore(STORES.OUTBOX, { keyPath: "id" });
        // La cola se vacía en el orden en que ocurrieron las cosas: una
        // anulación no puede subir antes que la venta que anula.
        outbox.createIndex("occurredAt", "occurredAt");
      }
      if (!db.objectStoreNames.contains(STORES.SALES)) {
        const sales = db.createObjectStore(STORES.SALES, { keyPath: "localId" });
        sales.createIndex("soldAt", "soldAt");
        sales.createIndex("ticketNumber", "ticketNumber", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        const customers = db.createObjectStore(STORES.CUSTOMERS, { keyPath: "id" });
        customers.createIndex("phoneNormalized", "phoneNormalized", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.KV)) {
        db.createObjectStore(STORES.KV, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la caja local"));
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Error en la caja local"));
      })
  );
}

export async function put<T>(store: string, value: T): Promise<void> {
  await run(store, "readwrite", (s) => s.put(value as unknown as IDBValidKey & T));
}

export async function putMany<T>(store: string, values: T[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    values.forEach((value) => objectStore.put(value as unknown as IDBValidKey & T));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Error al guardar en la caja local"));
  });
}

export function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function getAll<T>(store: string, index?: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const objectStore = tx.objectStore(store);
        const source = index ? objectStore.index(index) : objectStore;
        const request = source.getAll() as IDBRequest<T[]>;
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Error al leer la caja local"));
      })
  );
}

export async function remove(store: string, key: IDBValidKey): Promise<void> {
  await run(store, "readwrite", (s) => s.delete(key));
}

export async function removeMany(store: string, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    keys.forEach((key) => objectStore.delete(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Error al limpiar la caja local"));
  });
}

export function count(store: string): Promise<number> {
  return run<number>(store, "readonly", (s) => s.count());
}

/** Una fila del almacén de claves: catálogo, contadores, sesión, metadatos. */
export async function readKey<T>(key: string): Promise<T | null> {
  const row = await get<{ key: string; value: T }>(STORES.KV, key);
  return row ? row.value : null;
}

export async function writeKey<T>(key: string, value: T): Promise<void> {
  await put(STORES.KV, { key, value });
}

/**
 * ¿Se puede usar la base local?
 *
 * En una ventana privada, con datos de sitio bloqueados o en un navegador viejo
 * IndexedDB puede no existir o fallar al abrir. La caja tiene que decirlo en voz
 * alta —cobrar sin red ahí perdería las ventas—, no descubrirlo al primer cobro.
 */
export async function isAvailable(): Promise<boolean> {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}
