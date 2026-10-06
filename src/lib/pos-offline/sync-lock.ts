/**
 * Candado entre pestañas para subir la cola de la caja.
 *
 * La cola vive en IndexedDB, que comparten todas las pestañas del mismo
 * origen, pero el "una subida a la vez" del motor es memoria de cada pestaña.
 * Con la caja abierta en dos pestañas, las dos leían la cola y mandaban el
 * mismo evento a la vez (VDG-20261005-0021, 2026-10-05). Web Locks es el
 * candado que el navegador comparte entre pestañas: la segunda espera a que la
 * primera termine y relee la cola, ya sin lo que la otra subió.
 */

export const POS_SYNC_LOCK = "glamouroso-pos-sync";

/** Lo que se usa de `navigator.locks`; se inyecta en los tests. */
export interface TabLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

function browserLocks(): TabLockManager | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { locks?: TabLockManager }).locks ?? null;
}

/**
 * Corre `task` con el candado tomado. Sin Web Locks (navegador viejo o
 * contexto no seguro) corre directo: la caja sigue subiendo, y el servidor
 * absorbe un evento repetido como duplicado.
 */
export function withTabLock<T>(
  task: () => Promise<T>,
  locks: TabLockManager | null = browserLocks(),
  name: string = POS_SYNC_LOCK
): Promise<T> {
  if (!locks) return task();
  return locks.request(name, task);
}
