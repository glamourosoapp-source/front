"use client";

import type { PosCatalog, PosSale } from "@/types";
import type { PosSyncEvent, PosSaleEventPayload } from "@glamouroso/shared/pos-sync";
import { posTicketNumber } from "@glamouroso/shared/pos-sync";
import {
  STORES,
  getAll,
  put,
  putMany,
  readKey,
  remove,
  removeMany,
  writeKey,
} from "./db";

/**
 * Lo que la caja guarda en la PC y cómo se lee.
 *
 * Todo lo que el mostrador necesita para seguir trabajando sin servidor: el
 * catálogo con el que cobra, los clientes que puede buscar por teléfono, el
 * consecutivo del folio, los tickets del día y la cola de lo que falta subir.
 */

export const KEYS = {
  CATALOG: "catalog",
  COUNTER: "counter",
  SESSION: "session",
  META: "meta",
} as const;

/** Ticket guardado en la PC, esté subido o no. */
export interface LocalSale {
  /** Id de la caja: existe desde antes de que el servidor sepa del ticket. */
  localId: string;
  /** Id del evento con el que sube; es su idempotencia. */
  eventId: string;
  ticketNumber: string;
  soldAt: string;
  total: number;
  amountTendered: number;
  changeAmount: number;
  itemsCount: number;
  customerName: string | null;
  cashierName: string | null;
  status: "completed" | "voided";
  recordedOffline: boolean;
  /** Id en el servidor, cuando ya subió. */
  serverId: string | null;
  syncStatus: "pending" | "synced" | "rejected";
  /** El ticket completo tal como se imprimió, para reimprimir sin servidor. */
  sale: PosSale;
}

/** Cliente de la sucursal, con lo mínimo para encontrarlo por teléfono. */
export interface LocalCustomer {
  id: string;
  name: string;
  phone: string | null;
  phoneNormalized: string;
  pricingTier: string | null;
  updatedAt: string;
  /** true mientras el servidor no confirme que existe (alta sin red). */
  local?: boolean;
}

/** Consecutivo del folio: por día de negocio, porque el folio lo lleva la fecha. */
export interface FolioCounter {
  businessDate: string;
  seq: number;
}

export interface OfflineMeta {
  deviceId: string;
  clockOffsetMs: number;
  customersCursor: string | null;
  lastSyncedAt: string | null;
  catalogFetchedAt: string | null;
  branchCode: string | null;
}

export interface OutboxEntry {
  id: string;
  event: PosSyncEvent;
  occurredAt: string;
  attempts: number;
  lastError: string | null;
}

// ---- Cola ----

export async function enqueue(event: PosSyncEvent): Promise<void> {
  await put<OutboxEntry>(STORES.OUTBOX, {
    id: event.id,
    event,
    occurredAt: event.occurredAt,
    attempts: 0,
    lastError: null,
  });
}

/** La cola en el orden en que ocurrieron las cosas, no en el que se guardaron. */
export async function pending(): Promise<OutboxEntry[]> {
  const rows = await getAll<OutboxEntry>(STORES.OUTBOX);
  return rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function dequeue(ids: string[]): Promise<void> {
  await removeMany(STORES.OUTBOX, ids);
}

export async function markAttempt(entry: OutboxEntry, error: string | null): Promise<void> {
  await put<OutboxEntry>(STORES.OUTBOX, {
    ...entry,
    attempts: entry.attempts + 1,
    lastError: error,
  });
}

// ---- Tickets ----

export async function saveSale(sale: LocalSale): Promise<void> {
  await put(STORES.SALES, sale);
}

export async function localSales(): Promise<LocalSale[]> {
  const rows = await getAll<LocalSale>(STORES.SALES);
  return rows.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export async function findSaleByEvent(eventId: string): Promise<LocalSale | null> {
  const rows = await getAll<LocalSale>(STORES.SALES);
  return rows.find((row) => row.eventId === eventId) ?? null;
}

/**
 * Tira los tickets viejos ya subidos. Se quedan 14 días: la reimpresión y las
 * ventas del día no miran más atrás, y una PC de sucursal no tiene por qué
 * guardar el historial completo —para eso está el servidor.
 */
export async function pruneSales(days = 14): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await getAll<LocalSale>(STORES.SALES);
  const stale = rows
    .filter((row) => row.syncStatus === "synced" && row.soldAt < cutoff)
    .map((row) => row.localId);
  await removeMany(STORES.SALES, stale);
}

// ---- Clientes ----

export async function saveCustomers(customers: LocalCustomer[]): Promise<void> {
  await putMany(STORES.CUSTOMERS, customers);
}

export async function allCustomers(): Promise<LocalCustomer[]> {
  return getAll<LocalCustomer>(STORES.CUSTOMERS);
}

/** Busca por teléfono en la copia local; el servidor se consulta aparte si hay red. */
export async function findCustomerByPhone(
  phoneNormalized: string
): Promise<LocalCustomer | null> {
  const rows = await getAll<LocalCustomer>(STORES.CUSTOMERS);
  return rows.find((row) => row.phoneNormalized === phoneNormalized) ?? null;
}

/** El alta sin red guarda al cliente con su id local hasta que el servidor responde. */
export async function replaceLocalCustomer(localId: string, real: LocalCustomer): Promise<void> {
  await remove(STORES.CUSTOMERS, localId);
  await put(STORES.CUSTOMERS, real);
}

// ---- Catálogo, sesión, metadatos ----

export const readCatalog = () => readKey<PosCatalog>(KEYS.CATALOG);
export const writeCatalog = (catalog: PosCatalog) => writeKey(KEYS.CATALOG, catalog);

export const readSession = <T>() => readKey<T>(KEYS.SESSION);
export const writeSession = <T>(session: T) => writeKey(KEYS.SESSION, session);

export async function readMeta(): Promise<OfflineMeta> {
  const meta = await readKey<OfflineMeta>(KEYS.META);
  if (meta?.deviceId) return meta;
  // El id de la PC se genera una vez y no cambia: es como el panel distingue
  // una caja reinstalada de la misma caja de siempre.
  const fresh: OfflineMeta = {
    deviceId: crypto.randomUUID(),
    clockOffsetMs: 0,
    customersCursor: null,
    lastSyncedAt: null,
    catalogFetchedAt: null,
    branchCode: null,
  };
  await writeKey(KEYS.META, fresh);
  return fresh;
}

export async function patchMeta(patch: Partial<OfflineMeta>): Promise<OfflineMeta> {
  const current = await readMeta();
  const next = { ...current, ...patch };
  await writeKey(KEYS.META, next);
  return next;
}

// ---- Folio ----

/**
 * Siguiente folio de la caja.
 *
 * Lo asigna la PC, no el servidor: sin red no hay a quién pedírselo, y un folio
 * provisional significaría que el papel que se lleva el cliente no coincide con
 * el sistema. Una caja por sucursal, así que el consecutivo no se pelea con
 * nadie; al reconectar, `reconcileFolio` lo empuja por encima de lo que el
 * servidor ya tenga, que es lo que cubre una PC nueva o un navegador limpiado.
 */
export async function nextFolio(branchCode: string, businessDate: string): Promise<string> {
  const counter = await readKey<FolioCounter>(KEYS.COUNTER);
  const seq = counter && counter.businessDate === businessDate ? counter.seq + 1 : 1;
  await writeKey<FolioCounter>(KEYS.COUNTER, { businessDate, seq });
  return posTicketNumber(branchCode, businessDate, seq);
}

/** Tras hablar con el servidor: nunca retroceder, solo adelantar el consecutivo. */
export async function reconcileFolio(businessDate: string, serverSeq: number): Promise<void> {
  const counter = await readKey<FolioCounter>(KEYS.COUNTER);
  const localSeq = counter && counter.businessDate === businessDate ? counter.seq : 0;
  if (serverSeq > localSeq) {
    await writeKey<FolioCounter>(KEYS.COUNTER, { businessDate, seq: serverSeq });
  }
}

export const readCounter = () => readKey<FolioCounter>(KEYS.COUNTER);
export const writeCounter = (counter: FolioCounter) => writeKey(KEYS.COUNTER, counter);

/** El payload de venta de un evento en cola, para reconstruir el ticket. */
export function salePayloadOf(entry: OutboxEntry): PosSaleEventPayload | null {
  return entry.event.type === "sale.created"
    ? (entry.event.payload as PosSaleEventPayload)
    : null;
}
