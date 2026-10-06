import { describe, expect, it } from "bun:test";
import { withTabLock, type TabLockManager } from "./sync-lock";

/** Web Locks en exclusivo: cada `request` espera a que suelte el anterior. */
function fakeLocks(): TabLockManager {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const previous = tails.get(name) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(callback);
      tails.set(name, next);
      return next;
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/**
 * Dos pestañas vaciando la MISMA cola (IndexedDB es una para el origen): cada
 * una lee la cola, la sube y borra lo que el servidor respondió.
 */
function tab(queue: string[], uploads: string[][]) {
  return async () => {
    const batch = [...queue];
    await tick(); // el POST /pos/sync
    uploads.push(batch);
    queue.splice(0, batch.length);
  };
}

describe("withTabLock — una subida a la vez entre pestañas", () => {
  it("con el candado, dos pestañas no mandan el mismo evento", async () => {
    const locks = fakeLocks();
    const queue = ["venta-0021"];
    const uploads: string[][] = [];

    await Promise.all([
      withTabLock(tab(queue, uploads), locks),
      withTabLock(tab(queue, uploads), locks),
    ]);

    // La segunda esperó y releyó la cola ya vacía.
    expect(uploads).toEqual([["venta-0021"], []]);
  });

  it("sin el candado es justo el choque del 2026-10-05", async () => {
    const queue = ["venta-0021"];
    const uploads: string[][] = [];

    await Promise.all([tab(queue, uploads)(), tab(queue, uploads)()]);

    expect(uploads).toEqual([["venta-0021"], ["venta-0021"]]);
  });

  it("una subida que falla suelta el candado para la siguiente", async () => {
    const locks = fakeLocks();
    const failing = withTabLock(async () => {
      throw new Error("sin red");
    }, locks);
    const next = withTabLock(async () => "subió", locks);

    await expect(failing).rejects.toThrow("sin red");
    expect(await next).toBe("subió");
  });

  it("sin Web Locks (navegador viejo) sube igual", async () => {
    expect(await withTabLock(async () => 42, null)).toBe(42);
  });
});
