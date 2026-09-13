"use client";

import { useEffect } from "react";

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

/** Teclas que el navegador o el sistema usan y que la caja necesita interceptar. */
const CAPTURED = new Set([
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "Insert",
  "Delete",
]);

/**
 * Atajos de la caja, con la misma asignación que eleventa para que nadie tenga
 * que reaprender: F12 cobra, F10 busca, F11 alterna mayoreo, INS captura varios.
 *
 * `enabled` se apaga mientras un diálogo tiene el foco, para que ahí manden sus
 * propios atajos (F1/F2 dentro del cobro, ESC para cancelar).
 */
export function usePosShortcuts(map: ShortcutMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      const handlerForKey = map[event.key];
      if (!handlerForKey) return;
      // F5 recargaría la página y F11 pondría el navegador en pantalla completa
      // en plena venta: la caja se queda con esas teclas.
      if (CAPTURED.has(event.key)) event.preventDefault();
      handlerForKey(event);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map, enabled]);
}
