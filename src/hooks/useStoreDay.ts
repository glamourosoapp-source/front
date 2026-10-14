"use client";

import { useCallback, useEffect, useState } from "react";
import {
  POS_SYNC_EVENT_TYPES,
  isPastStoreAutoClose,
  storeAutoCloseAt,
  storeCivilDate,
  type PosSyncEvent,
  type StoreDayEvaluation,
  type StoreDayStatus,
} from "@glamouroso/shared";
import { posSync } from "@/lib/pos-offline/sync";
import { readKey, writeKey } from "@/lib/pos-offline/db";
import { readMeta } from "@/lib/pos-offline/store";
import { monotonicNow } from "@/lib/pos-offline/clock";
import { businessTimeZone } from "@/lib/business-time";

/** Lo que la PC recuerda del día: sobrevive a reinicios y a días sin red. */
interface LocalStoreDay {
  date: string;
  status: StoreDayStatus;
  openedAt: string | null;
  closedAt: string | null;
  /** La cerró el sistema a las 9:00 p.m., no el cajero. */
  autoClosed?: boolean;
}

const KEY = "storeDay";

function todayDate(): string {
  return storeCivilDate(new Date(), businessTimeZone());
}

/**
 * Apertura y cierre de tienda en la caja (2026-10-04).
 *
 * Lo primero del día es "Abrir tienda": sin eso la caja no cobra. "Cerré la
 * tienda" la bloquea hasta el día siguiente o hasta "Reabrir". La hora es la del
 * clic y el evento viaja por la misma cola que las ventas, así que funciona sin
 * internet. El estado del día vive en la PC; si la PC no sabe nada de hoy pero
 * el servidor sí (se abrió en otra PC o se reinstaló), manda el servidor.
 *
 * Desde las 9:00 p.m. (2026-10-13) la tienda abierta se da por cerrada y ya no
 * se puede abrir ni reabrir hasta el día siguiente. El cierre lo registra el
 * servidor; la caja solo se bloquea, con su hora corregida por el desfase que
 * midió contra el servidor en el último sync (así funciona sin internet y
 * mover el reloj de Windows no la deja abierta).
 */
export function useStoreDay(serverDay: StoreDayEvaluation | null | undefined) {
  const [local, setLocal] = useState<LocalStoreDay | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(todayDate);
  const [clockOffsetMs, setClockOffsetMs] = useState(() => posSync.getStatus().clockOffsetMs);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    readKey<LocalStoreDay>(KEY)
      .then((value) => {
        if (!cancelled) setLocal(value ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    // El desfase del último sync, aunque esta carga todavía no haya subido nada.
    readMeta()
      .then((meta) => {
        if (!cancelled && !posSync.getStatus().lastSyncedAt) setClockOffsetMs(meta.clockOffsetMs ?? 0);
      })
      .catch(() => undefined);
    const unsubscribe = posSync.subscribe((status) => {
      if (status.lastSyncedAt) setClockOffsetMs(status.clockOffsetMs);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // A medianoche cambia el día y la caja vuelve a pedir "Abrir tienda"; a las
  // 9:00 p.m. se cierra sola.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday(todayDate());
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const localToday = local?.date === today ? local : null;
  const serverToday = serverDay?.date === today ? serverDay : null;
  const stored: LocalStoreDay = localToday ?? {
    date: today,
    status: serverToday?.status ?? "not_opened",
    openedAt: serverToday?.openedAt ?? null,
    closedAt: serverToday?.closedAt ?? null,
    autoClosed: serverToday?.autoClosed ?? false,
  };

  // Hora del servidor según la PC: el desfase es (PC − servidor).
  const timeZone = businessTimeZone();
  const pastAutoClose = isPastStoreAutoClose(stored.date, new Date(nowMs - clockOffsetMs), timeZone);
  const current: LocalStoreDay =
    pastAutoClose && stored.status === "open"
      ? {
          ...stored,
          status: "closed",
          closedAt: storeAutoCloseAt(stored.date, timeZone).toISOString(),
          autoClosed: true,
        }
      : stored;

  // Se guarda en la PC para que al recargar siga cerrada aunque no haya red.
  const autoClosedNow = current !== stored;
  useEffect(() => {
    if (!autoClosedNow || !loaded) return;
    setLocal(current);
    void writeKey(KEY, current).catch(() => undefined);
    // `current` cambia de identidad en cada render; basta con el momento del cierre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClosedNow, loaded]);

  const record = useCallback(
    async (kind: "opened" | "closed") => {
      // Pasadas las 9:00 p.m. ya no se abre: el botón no se muestra, pero un
      // clic que llegue justo al dar la hora tampoco cuenta.
      if (kind === "opened" && pastAutoClose) return current;
      // La hora de la PC es para la pantalla; la que cuenta la calcula el
      // servidor con el reloj interno (`clock`), por si movieron el de Windows.
      const clock = monotonicNow();
      const at = new Date();
      const date = current.date;
      const next: LocalStoreDay = {
        date,
        status: kind === "opened" ? "open" : "closed",
        openedAt: kind === "opened" ? (current.openedAt ?? at.toISOString()) : current.openedAt,
        closedAt: kind === "closed" ? at.toISOString() : null,
        autoClosed: false,
      };
      const event: PosSyncEvent = {
        id: crypto.randomUUID(),
        type: kind === "opened" ? POS_SYNC_EVENT_TYPES.STORE_OPENED : POS_SYNC_EVENT_TYPES.STORE_CLOSED,
        occurredAt: at.toISOString(),
        payload: { businessDate: date, recordedOffline: !posSync.getStatus().online, clock },
      };
      // Primero la PC (lo que bloquea o libera la caja) y luego la cola.
      setLocal(next);
      await writeKey(KEY, next).catch(() => undefined);
      await posSync.push(event);
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current.date, current.openedAt, pastAutoClose]
  );

  return {
    loaded,
    date: current.date,
    status: current.status,
    openedAt: current.openedAt,
    closedAt: current.closedAt,
    /** La cerró el sistema a las 9:00 p.m. */
    autoClosed: Boolean(current.autoClosed),
    /** Desde las 9:00 p.m. no se abre ni se reabre hasta mañana. */
    canOpen: !pastAutoClose,
    open: () => record("opened"),
    close: () => record("closed"),
  };
}
