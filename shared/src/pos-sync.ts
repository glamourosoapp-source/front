import type { PosPaymentMethod, PosSaleUnit, PricingTier } from "./constants";

/**
 * Contrato de la caja *local-first*: todo lo que ocurre en el mostrador es un
 * EVENTO con id generado en la PC, no una llamada al servidor.
 *
 * La caja escribe el evento en su base local, imprime y sigue cobrando; el
 * motor de sincronización lo sube cuando hay red. Con internet eso tarda menos
 * de un segundo y el cajero no nota diferencia: el modo "en línea" es el mismo
 * camino con sincronización inmediata, así que el código que salva la venta
 * cuando se cae el wifi es el que se ejercita todos los días.
 *
 * Reglas que hacen que subir dos veces sea inofensivo:
 * - `id` del evento es la clave de idempotencia: aplicar dos veces = un ticket.
 * - El FOLIO lo asigna la caja (una PC por sucursal) y el servidor lo respeta:
 *   el ticket que se lleva el cliente siempre coincide con el del sistema.
 * - Los PRECIOS que viajan son los que se cobraron. El servidor re-cotiza para
 *   detectar diferencias, pero guarda lo que entró a la caja.
 * - `soldAt` es la hora en que se cobró, no la de sincronización: un ticket del
 *   martes subido el jueves cae en el martes en reportes y cortes.
 *
 * Detalle: docs/exec-plans/active/pos-offline.md
 */

export const POS_SYNC_EVENT_TYPES = {
  SALE_CREATED: "sale.created",
  SALE_VOIDED: "sale.voided",
  CUSTOMER_CREATED: "customer.created",
  /** "Abrir tienda" / "Reabrir": lo primero del día en la caja. */
  STORE_OPENED: "store.opened",
  /** "Cerré la tienda": la caja no cobra hasta el día siguiente o reabrir. */
  STORE_CLOSED: "store.closed",
} as const;

export type PosSyncEventType = (typeof POS_SYNC_EVENT_TYPES)[keyof typeof POS_SYNC_EVENT_TYPES];

/** Partida tal como la cobró la caja: con su precio ya resuelto localmente. */
export interface PosSaleEventItem {
  saleUnit: PosSaleUnit;
  productId?: string | null;
  lineId?: string | null;
  quantity: number;
  priceTier: PricingTier;
  /** Precio unitario con el que se cobró en el mostrador. */
  unitPrice: number;
  /** Importe de la partida tal como salió impreso. */
  total: number;
  /** Desglose de bidones + litros sueltos cuando se cobró por litro. */
  pricingBreakdown?: Record<string, unknown> | null;
  notes?: string | null;
}

/**
 * Cliente capturado sin red. Viaja DENTRO de la venta además de como evento
 * propio: así el servidor lo resuelve por teléfono sin depender del orden en
 * que suban los eventos, y `findOrCreateByPhone` evita el duplicado.
 */
export interface PosSaleEventCustomer {
  /** Id local de la caja; el servidor devuelve con qué id real quedó. */
  localId: string;
  name: string;
  phone: string;
  email?: string | null;
  birthday?: string | null;
}

export interface PosSaleEventPayload {
  /** Folio definitivo, asignado por la caja: `SUC01-20260918-0007`. */
  ticketNumber: string;
  /** Hora en que se cobró (ISO). */
  soldAt: string;
  /** Cliente ya registrado en el servidor. */
  customerId?: string | null;
  /** Cliente capturado en la caja sin red; se resuelve por teléfono. */
  customer?: PosSaleEventCustomer | null;
  items: PosSaleEventItem[];
  subtotal: number;
  discount: number;
  total: number;
  /** Con tarjeta o transferencia, `amountTendered` = total y `changeAmount` = 0. */
  paymentMethod: PosPaymentMethod;
  amountTendered: number;
  changeAmount: number;
  notes?: string | null;
  /** Versión del catálogo con la que se cobró: explica una diferencia de precio. */
  catalogVersion?: string | null;
  /** true si el cobro ocurrió sin conexión. */
  recordedOffline: boolean;
  /**
   * Ticket que nació anulado: se cobró y se anuló sin red, antes de subir.
   * Se guarda para que el folio exista, SIN mover kardex ni contadores: no hay
   * nada que revertir porque nunca se aplicó.
   */
  voided?: {
    at: string;
    reason: string;
  } | null;
}

export interface PosVoidEventPayload {
  /** Id del ticket en el servidor (el ticket ya había subido). */
  saleId: string;
  reason: string;
  voidedAt: string;
}

export interface PosCustomerEventPayload {
  localId: string;
  name: string;
  phone: string;
  email?: string | null;
  birthday?: string | null;
}

/**
 * Apertura o cierre de tienda. La hora es `occurredAt` (el clic). `businessDate`
 * es el día que se abre o se cierra: un cierre pasada la medianoche sigue
 * cerrando el día que se abrió.
 */
export interface PosStoreEventPayload {
  /** "YYYY-MM-DD" en la zona de la organización. */
  businessDate: string;
  /** true si ocurrió sin conexión. */
  recordedOffline: boolean;
}

export type PosSyncEventPayload =
  | PosSaleEventPayload
  | PosVoidEventPayload
  | PosCustomerEventPayload
  | PosStoreEventPayload;

export interface PosSyncEvent<T extends PosSyncEventPayload = PosSyncEventPayload> {
  /** uuid generado en la caja: es la clave de idempotencia del evento. */
  id: string;
  type: PosSyncEventType;
  /** Cuándo ocurrió en el mostrador (ISO). */
  occurredAt: string;
  payload: T;
}

export const POS_SYNC_STATUSES = {
  APPLIED: "applied",
  DUPLICATE: "duplicate",
  REJECTED: "rejected",
} as const;

export type PosSyncStatus = (typeof POS_SYNC_STATUSES)[keyof typeof POS_SYNC_STATUSES];

export interface PosSyncEventResult {
  id: string;
  status: PosSyncStatus;
  /** Id que quedó en el servidor (venta o cliente), para que la caja lo guarde. */
  serverId?: string | null;
  /** Id local del cliente que este evento resolvió, si aplica. */
  localId?: string | null;
  /** Motivo cuando `rejected`; la caja lo saca de la cola y lo ve el admin. */
  code?: string | null;
  message?: string | null;
  /** El servidor cotizó distinto a lo que se cobró (se guarda lo cobrado). */
  priceMismatch?: boolean;
  /** Partidas que NO descontaron envase (p. ej. polietileno de 2 L sin regla); la caja lo avisa. */
  containerWarnings?: string[];
}

export interface PosSyncRequest {
  /** Identificador de la PC, estable entre reinicios. */
  deviceId: string;
  /** Desfase del reloj de la PC contra el servidor, en ms (informativo). */
  clockOffsetMs?: number;
  events: PosSyncEvent[];
  /** Lo que la caja reporta de sí misma en cada sync. */
  heartbeat?: PosSyncHeartbeat;
}

export interface PosSyncHeartbeat {
  pendingCount: number;
  oldestPendingAt?: string | null;
  lastSaleAt?: string | null;
  appVersion?: string | null;
  catalogVersion?: string | null;
}

export interface PosSyncResponse {
  results: PosSyncEventResult[];
  /** Hora del servidor: la caja calcula su desfase con esto. */
  serverTime: string;
  state: PosSyncState;
}

/** Lo que la caja necesita al reconectar para no repetir folios ni datos. */
export interface PosSyncState {
  branchId: string;
  branchCode: string;
  /** Día de negocio (YYYYMMDD) en la zona de la organización. */
  businessDate: string;
  /** Último consecutivo usado ESE día según el servidor; 0 si no hay ventas. */
  lastTicketSeq: number;
  catalogVersion: string;
  /** Cursor de clientes (ISO de `updatedAt`) para pedir solo el delta. */
  customersCursor: string | null;
  serverTime: string;
}

/**
 * Lo que el panel sabe de la caja de una sucursal. Vive en `branches.sync_state`
 * (JSONB, SIEMPRE merge) y lo escribe el heartbeat de cada sync.
 */
export interface BranchSyncState {
  deviceId?: string | null;
  /** Último contacto de la caja con el servidor (ISO). */
  lastSeenAt?: string | null;
  /** Última vez que la cola quedó vacía (ISO). */
  lastSyncedAt?: string | null;
  /** Tickets que la caja dice tener sin subir. */
  pendingCount?: number;
  oldestPendingAt?: string | null;
  lastSaleAt?: string | null;
  appVersion?: string | null;
  catalogVersion?: string | null;
  /** Desfase del reloj de la PC en ms, para avisarlo en el panel. */
  clockOffsetMs?: number | null;
  /** Eventos que el servidor rechazó y siguen sin resolver. */
  rejectedCount?: number;
}

const TICKET_SEQ_PAD = 4;

/**
 * Folio de ticket: `SUC01-20260918-0007`.
 *
 * Vive en `shared` porque ahora lo arma la CAJA (que lo imprime) y lo valida el
 * servidor (que lo guarda). Dos implementaciones distintas serían dos formatos
 * de folio en cuanto una cambiara.
 */
export function posTicketNumber(branchCode: string, businessDate: string, seq: number): string {
  return `${branchCode}-${businessDate}-${String(seq).padStart(TICKET_SEQ_PAD, "0")}`;
}

/** Consecutivo de un folio, o `null` si no tiene la forma esperada. */
export function posTicketSeq(ticketNumber: string): number | null {
  const match = /-(\d{8})-(\d+)$/.exec(ticketNumber);
  if (!match) return null;
  const seq = Number.parseInt(match[2]!, 10);
  return Number.isFinite(seq) ? seq : null;
}

/** Día de negocio (YYYYMMDD) que declara un folio, o `null`. */
export function posTicketBusinessDate(ticketNumber: string): string | null {
  const match = /-(\d{8})-(\d+)$/.exec(ticketNumber);
  return match ? match[1]! : null;
}

/**
 * Valida que un folio propuesto por la caja sea de ESA sucursal y ESE día.
 *
 * El servidor no lo recalcula (la caja manda), pero sí se niega a guardar un
 * folio de otra sucursal: sería un ticket que aparece donde no se cobró.
 */
export function isValidPosTicketNumber(
  ticketNumber: string,
  branchCode: string,
  businessDate?: string
): boolean {
  const expectedPrefix = `${branchCode}-`;
  if (!ticketNumber.startsWith(expectedPrefix)) return false;
  const date = posTicketBusinessDate(ticketNumber);
  const seq = posTicketSeq(ticketNumber);
  if (date === null || seq === null || seq < 1) return false;
  return businessDate ? date === businessDate : true;
}

/** Desfase de reloj a partir del cual la caja lo avisa (no bloquea nada). */
export const POS_CLOCK_SKEW_WARN_MS = 10 * 60 * 1000;
