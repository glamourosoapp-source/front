"use client";

import { useCallback, useEffect, useState } from "react";
import {
  POS_SYNC_EVENT_TYPES,
  storeCivilDate,
  type PosSyncEvent,
  type StoreDayEvaluation,
  type StoreDayStatus,
} from "@glamouroso/shared";
import { posSync } from "@/lib/pos-offline/sync";
import { readKey, writeKey } from "@/lib/pos-offline/db";
import { businessTimeZone } from "@/lib/business-time";

/** Lo que la PC recuerda del día: sobrevive a reinicios y a días sin red. */
interface LocalStoreDay {
  date: string;
  status: StoreDayStatus;
  openedAt: string | null;
  closedAt: string | null;
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
 */
export function useStoreDay(serverDay: StoreDayEvaluation | null | undefined) {
  const [local, setLocal] = useState<LocalStoreDay | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(todayDate);

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
    return () => {
      cancelled = true;
    };
  }, []);

  // A medianoche cambia el día y la caja vuelve a pedir "Abrir tienda".
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayDate()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const localToday = local?.date === today ? local : null;
  const serverToday = serverDay?.date === today ? serverDay : null;
  const current: LocalStoreDay = localToday ?? {
    date: today,
    status: serverToday?.status ?? "not_opened",
    openedAt: serverToday?.openedAt ?? null,
    closedAt: serverToday?.closedAt ?? null,
  };

  const record = useCallback(
    async (kind: "opened" | "closed") => {
      const at = new Date();
      const date = current.date;
      const next: LocalStoreDay = {
        date,
        status: kind === "opened" ? "open" : "closed",
        openedAt: kind === "opened" ? (current.openedAt ?? at.toISOString()) : current.openedAt,
        closedAt: kind === "closed" ? at.toISOString() : null,
      };
      const event: PosSyncEvent = {
        id: crypto.randomUUID(),
        type: kind === "opened" ? POS_SYNC_EVENT_TYPES.STORE_OPENED : POS_SYNC_EVENT_TYPES.STORE_CLOSED,
        occurredAt: at.toISOString(),
        payload: { businessDate: date, recordedOffline: !posSync.getStatus().online },
      };
      // Primero la PC (lo que bloquea o libera la caja) y luego la cola.
      setLocal(next);
      await writeKey(KEY, next).catch(() => undefined);
      await posSync.push(event);
      return next;
    },
    [current.date, current.openedAt]
  );

  return {
    loaded,
    date: current.date,
    status: current.status,
    openedAt: current.openedAt,
    closedAt: current.closedAt,
    open: () => record("opened"),
    close: () => record("closed"),
  };
}
