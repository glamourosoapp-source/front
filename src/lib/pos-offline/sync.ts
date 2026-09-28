"use client";

import { httpClient, getApiErrorMessage } from "@/services/http-client";
import type {
  PosSyncEvent,
  PosSyncEventResult,
  PosSyncState,
} from "@glamouroso/shared/pos-sync";
import { POS_SYNC_STATUSES } from "@glamouroso/shared/pos-sync";
import type { PosCatalog } from "@/types";
import { toast } from "sonner";
import {
  dequeue,
  localSales,
  markAttempt,
  patchMeta,
  pending,
  pruneSales,
  readMeta,
  reconcileFolio,
  saveCustomers,
  saveSale,
  writeCatalog,
  type LocalCustomer,
  type LocalSale,
  type OutboxEntry,
} from "./store";

/**
 * Motor de sincronización de la caja.
 *
 * Sube la cola en orden y en un solo lote. No hay "modo offline": la caja
 * siempre escribe local y este motor siempre intenta subir, así que el camino
 * que salva la venta cuando se cae el wifi es el mismo que corre todo el día.
 *
 * Nunca borra un evento que no haya sido resuelto por el servidor. Un rechazo
 * sí sale de la cola, porque ya quedó en la bandeja del administrador: dejarlo
 * dando vueltas taparía las ventas que vienen detrás.
 */

export interface SyncStatus {
  /** Hay red y el último intento funcionó. */
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  oldestPendingAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Eventos que el servidor rechazó en este dispositivo, sin resolver. */
  rejectedCount: number;
  /** Desfase del reloj de la PC contra el servidor, en ms. */
  clockOffsetMs: number;
}

const INITIAL: SyncStatus = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pendingCount: 0,
  oldestPendingAt: null,
  lastSyncedAt: null,
  lastError: null,
  rejectedCount: 0,
  clockOffsetMs: 0,
};

type Listener = (status: SyncStatus) => void;

class PosSyncEngine {
  private status: SyncStatus = { ...INITIAL };
  private listeners = new Set<Listener>();
  /** Una sola subida a la vez: dos lotes en paralelo repetirían eventos. */
  private running: Promise<void> | null = null;
  private timer: number | null = null;
  private onCatalog: ((catalog: PosCatalog) => void) | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  /** La caja pasa aquí qué hacer cuando el catálogo cambió en el servidor. */
  setCatalogHandler(handler: ((catalog: PosCatalog) => void) | null): void {
    this.onCatalog = handler;
  }

  private emit(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((listener) => listener(this.status));
  }

  /**
   * Arranca los disparadores: al volver la red, al enfocar la ventana y cada
   * minuto. El latido periódico no es para subir (eso pasa al cobrar) sino para
   * que el panel sepa que esta sucursal sigue viva mientras acumula ventas.
   */
  start(): () => void {
    if (typeof window === "undefined") return () => {};

    const onOnline = () => {
      this.emit({ online: true });
      void this.sync();
    };
    const onOffline = () => this.emit({ online: false });
    const onFocus = () => void this.sync();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    this.timer = window.setInterval(() => void this.sync(), 60_000);

    void this.refreshCounters();
    void this.sync();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      if (this.timer !== null) window.clearInterval(this.timer);
      this.timer = null;
    };
  }

  /** Recalcula lo que la barra muestra sin hablar con el servidor. */
  async refreshCounters(): Promise<void> {
    const queue = await pending();
    const sales = await localSales();
    this.emit({
      pendingCount: queue.length,
      oldestPendingAt: queue[0]?.occurredAt ?? null,
      rejectedCount: sales.filter((row) => row.syncStatus === "rejected").length,
    });
  }

  /** Sube la cola. Devuelve cuando el intento terminó, con éxito o sin él. */
  sync(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<void> {
    const queue = await pending();
    const meta = await readMeta();
    this.emit({
      syncing: true,
      pendingCount: queue.length,
      oldestPendingAt: queue[0]?.occurredAt ?? null,
    });

    // Lotes acotados: una caja que estuvo una semana sin red puede tener cientos
    // de tickets, y un único POST gigante es el que se cae por timeout.
    const batch = queue.slice(0, 50);

    try {
      const response = await httpClient.post<{
        results: PosSyncEventResult[];
        serverTime: string;
        state: PosSyncState;
      }>("/pos/sync", {
        deviceId: meta.deviceId,
        clockOffsetMs: meta.clockOffsetMs,
        events: batch.map((entry) => entry.event),
        heartbeat: {
          pendingCount: queue.length,
          oldestPendingAt: queue[0]?.occurredAt ?? null,
          lastSaleAt: (await localSales())[0]?.soldAt ?? null,
          catalogVersion: null,
        },
      });

      await this.applyResults(batch, response.results);
      await this.afterSync(response);

      const left = await pending();
      this.emit({
        online: true,
        lastError: null,
        pendingCount: left.length,
        oldestPendingAt: left[0]?.occurredAt ?? null,
        lastSyncedAt: left.length === 0 ? new Date().toISOString() : this.status.lastSyncedAt,
      });

      // Quedaban más de un lote: sigue de inmediato en vez de esperar al minuto.
      if (left.length && left.length < queue.length) {
        this.running = null;
        void this.sync();
      }
    } catch (error) {
      // Sin red no es un error que reportar al cajero: es el estado normal de
      // una sucursal con el internet caído, y la caja sigue cobrando.
      this.emit({
        online: false,
        lastError: getApiErrorMessage(error, "Sin conexión con el servidor"),
      });
    } finally {
      this.emit({ syncing: false });
      await this.refreshCounters();
    }
  }

  /**
   * Un evento sale de la cola cuando el servidor dijo qué pasó con él. Los que
   * no vinieron en la respuesta se quedan y se reintentan.
   */
  private async applyResults(
    batch: OutboxEntry[],
    results: PosSyncEventResult[]
  ): Promise<void> {
    const byId = new Map(results.map((result) => [result.id, result]));
    const done: string[] = [];
    const sales = await localSales();

    for (const entry of batch) {
      const result = byId.get(entry.id);
      if (!result) continue;

      const sale = sales.find((row) => row.eventId === entry.id);
      if (sale) {
        await saveSale({
          ...sale,
          serverId: result.serverId ?? sale.serverId,
          syncStatus:
            result.status === POS_SYNC_STATUSES.REJECTED ? "rejected" : "synced",
        });
      }

      if (result.status === POS_SYNC_STATUSES.REJECTED) {
        // Ya está en la bandeja del administrador: dejarlo en la cola solo
        // taparía las ventas que vienen detrás.
        done.push(entry.id);
        continue;
      }
      // La venta se aplicó pero alguna partida no descontó envase (no hay
      // envase configurado para ese tamaño): que el cajero lo sepa.
      if (result.containerWarnings?.length) {
        toast.warning(
          `Ticket ${sale?.ticketNumber ?? ""}: ${result.containerWarnings.join(" ")}`.trim(),
          { duration: 8000 }
        );
      }
      done.push(entry.id);
    }

    await dequeue(done);

    // Lo que el servidor no respondió se reintenta, con el motivo a la vista.
    for (const entry of batch) {
      if (!byId.has(entry.id)) await markAttempt(entry, "El servidor no respondió este evento");
    }
  }

  /** Lo que se aprende de cada sync: hora del servidor, folio y catálogo. */
  private async afterSync(response: {
    serverTime: string;
    state: PosSyncState;
  }): Promise<void> {
    const drift = Date.now() - new Date(response.serverTime).getTime();
    await patchMeta({
      clockOffsetMs: drift,
      lastSyncedAt: new Date().toISOString(),
      branchCode: response.state.branchCode,
    });
    this.emit({ clockOffsetMs: drift });

    // El servidor puede tener folios que esta PC no conoce (navegador limpiado,
    // PC reinstalada): el consecutivo solo avanza, nunca retrocede.
    await reconcileFolio(response.state.businessDate, response.state.lastTicketSeq);
    await pruneSales();
  }

  /**
   * Trae el catálogo si cambió, y los clientes nuevos de la sucursal.
   *
   * Los dos son "lo que la caja necesita para trabajar sin red". Fallan en
   * silencio: si no hay red, la caja sigue con lo que ya tiene guardado.
   */
  async refreshOfflineData(currentVersion: string | null): Promise<PosCatalog | null> {
    try {
      const result = await httpClient.get<{ changed: boolean; catalog?: PosCatalog }>(
        "/pos/catalog",
        currentVersion ? { version: currentVersion } : undefined
      );
      if (result.catalog) {
        await writeCatalog(result.catalog);
        await patchMeta({ catalogFetchedAt: new Date().toISOString() });
        this.onCatalog?.(result.catalog);
        await this.refreshCustomers();
        return result.catalog;
      }
      await this.refreshCustomers();
      return null;
    } catch {
      return null;
    }
  }

  /** Clientes de la sucursal, por delta: solo los que cambiaron desde el cursor. */
  private async refreshCustomers(): Promise<void> {
    try {
      const meta = await readMeta();
      const result = await httpClient.get<{
        customers: LocalCustomer[];
        cursor: string | null;
      }>("/pos/customers/snapshot", meta.customersCursor ? { since: meta.customersCursor } : {});
      if (result.customers.length) {
        await saveCustomers(result.customers);
        await patchMeta({ customersCursor: result.cursor });
      }
    } catch {
      /* sin red la caja busca en lo que ya tiene */
    }
  }

  /** Encola un evento y trata de subirlo de inmediato. */
  async push(event: PosSyncEvent, sale?: LocalSale): Promise<void> {
    const { enqueue } = await import("./store");
    await enqueue(event);
    if (sale) await saveSale(sale);
    await this.refreshCounters();
    void this.sync();
  }
}

export const posSync = new PosSyncEngine();
