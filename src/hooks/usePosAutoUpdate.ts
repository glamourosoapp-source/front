"use client";

import { useEffect } from "react";
import { usePosStore } from "@/stores/pos.store";

const CHECK_EVERY_MS = 5 * 60_000;
const TICK_MS = 30_000;
/** Sin teclas ni clics en este rato, el cajero no está a media captura. */
const IDLE_MS = 60_000;

/**
 * La caja se queda abierta todo el día y nunca recarga, así que sin esto un
 * deploy solo llega cuando alguien presiona F5. Cada 5 minutos (y al volver a
 * la ventana) pregunta a `/version` qué build sirve el servidor; si cambió,
 * espera un momento seguro y recarga.
 *
 * Momento seguro: en la pantalla de venta, con internet, el ticket activo
 * vacío, ningún diálogo abierto y un minuto sin actividad. Recargar no pierde
 * nada aunque haya pendientes: los tickets viven en `localStorage` y las ventas
 * sin subir en la cola de IndexedDB.
 */
export function usePosAutoUpdate() {
  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
    const current = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!current) return;

    let lastActivity = Date.now();
    let lastCheck = 0;
    let updateReady = false;

    const markActivity = () => {
      lastActivity = Date.now();
    };

    const check = async () => {
      if (updateReady || !navigator.onLine) return;
      lastCheck = Date.now();
      try {
        const response = await fetch("/version", { cache: "no-store" });
        if (!response.ok) return;
        const { buildId } = (await response.json()) as { buildId: string | null };
        if (buildId && buildId !== current) updateReady = true;
      } catch {
        /* sin red o servidor reiniciando: se vuelve a intentar en el siguiente ciclo */
      }
    };

    const isSafeToReload = () => {
      if (window.location.pathname !== "/pos") return false;
      if (!navigator.onLine) return false;
      if (Date.now() - lastActivity < IDLE_MS) return false;
      // El candado de abrir/cerrar tienda (`.pos-store-gate`) no estorba: si nadie
      // ha tecleado en un minuto, recargar solo lo vuelve a mostrar.
      if (document.querySelector('.MuiDialog-root, [role="dialog"]:not(.pos-store-gate)')) return false;
      const focused = document.activeElement;
      if (
        (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) &&
        focused.value.trim() !== ""
      ) {
        return false;
      }
      const { tickets, activeTicketId } = usePosStore.getState();
      const active = tickets.find((ticket) => ticket.id === activeTicketId);
      return !active || active.lines.length === 0;
    };

    const tick = () => {
      if (!updateReady && Date.now() - lastCheck >= CHECK_EVERY_MS) void check();
      if (updateReady && isSafeToReload()) window.location.reload();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    const activityEvents = ["keydown", "pointerdown", "wheel"] as const;
    activityEvents.forEach((name) => window.addEventListener(name, markActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(tick, TICK_MS);
    void check();

    return () => {
      activityEvents.forEach((name) => window.removeEventListener(name, markActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);
}
