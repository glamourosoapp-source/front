"use client";

import { useCallback, useEffect, useState } from "react";
import { posSync, type SyncStatus } from "@/lib/pos-offline/sync";
import {
  isAvailable as localDbAvailable,
} from "@/lib/pos-offline/db";
import {
  readCatalog,
  readMeta,
  readSession,
  writeSession,
  pending,
  readCounter,
  writeCounter,
  type OfflineMeta,
} from "@/lib/pos-offline/store";
import { pullBackup, pushBackup } from "@/lib/pos-offline/backup";
import { loadPrintAgentConfig } from "@/lib/print/print-agent-client";
import { enqueue } from "@/lib/pos-offline/store";
import type { PosCatalog, PosSession } from "@/types";

/**
 * Engancha la caja a su base local.
 *
 * Devuelve el estado que pinta la barra superior y las funciones que la caja
 * necesita para arrancar sin servidor: qué había guardado, si hay que restaurar
 * del agente de impresión, y el motor de sincronización corriendo.
 */
export function usePosOffline(options: {
  onCatalog: (catalog: PosCatalog) => void;
  onSession: (session: PosSession) => void;
}) {
  const { onCatalog, onSession } = options;
  const [status, setStatus] = useState<SyncStatus>(posSync.getStatus());
  const [meta, setMeta] = useState<OfflineMeta | null>(null);
  /** false = este navegador no puede guardar ventas; hay que decirlo fuerte. */
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => posSync.subscribe(setStatus), []);

  useEffect(() => {
    posSync.setCatalogHandler(onCatalog);
    return () => posSync.setCatalogHandler(null);
  }, [onCatalog]);

  /**
   * Arranque: primero lo guardado (para pintar la caja sin esperar al servidor),
   * después el servidor.
   */
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const available = await localDbAvailable();
      if (cancelled) return;
      setStorageReady(available);
      if (!available) return;

      const [catalog, session, current] = await Promise.all([
        readCatalog(),
        readSession<PosSession>(),
        readMeta(),
      ]);
      if (cancelled) return;

      if (catalog) onCatalog(catalog);
      if (session) onSession(session);
      setMeta(current);

      // Base local vacía con respaldo en el agente: alguien borró los datos del
      // navegador y ahí adentro había ventas cobradas.
      const queue = await pending();
      if (!queue.length) {
        const backup = await pullBackup(loadPrintAgentConfig());
        if (!cancelled && backup?.outbox?.length) {
          for (const entry of backup.outbox) await enqueue(entry.event);
          if (backup.counter) {
            const counter = await readCounter();
            const localSeq =
              counter && counter.businessDate === backup.counter.businessDate ? counter.seq : 0;
            if (backup.counter.seq > localSeq) await writeCounter(backup.counter);
          }
          setRestored(true);
        }
      }

      await posSync.refreshCounters();
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [onCatalog, onSession]);

  useEffect(() => posSync.start(), []);

  /** Deja copia en el agente de impresión tras cada cambio de la cola. */
  const backup = useCallback(async () => {
    const [queue, counter, current] = await Promise.all([pending(), readCounter(), readMeta()]);
    await pushBackup(loadPrintAgentConfig(), { outbox: queue, counter, meta: current });
  }, []);

  /** Guarda la sesión para poder abrir la caja sin servidor. */
  const persistSession = useCallback(async (session: PosSession) => {
    await writeSession(session);
  }, []);

  return { status, meta, storageReady, restored, backup, persistSession };
}
