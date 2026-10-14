"use client";

import type { PosMonotonicClock } from "@glamouroso/shared/pos-sync";

/**
 * Reloj interno de la caja para que el servidor calcule la hora real de
 * apertura y cierre aunque alguien mueva la hora de Windows.
 *
 * `performance.now()` cuenta desde que cargó la página y no lo afecta cambiar
 * la hora de la PC. `bootId` identifica esta carga: el servidor solo resta dos
 * lecturas con el mismo id (al recargar, el contador vuelve a cero).
 * Detalle: docs/product-specs/pos-apertura-cierre.md
 */
let bootId: string | null = null;

export function monotonicNow(): PosMonotonicClock {
  bootId ??= crypto.randomUUID();
  return { bootId, monoMs: Math.round(performance.now()) };
}
