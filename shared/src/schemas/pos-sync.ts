import { z } from "zod";
import {
  POS_PAYMENT_METHOD_VALUES,
  POS_SALE_UNITS,
  PRICING_TIERS,
} from "../constants";
import { POS_SYNC_EVENT_TYPES } from "../pos-sync";

const optionalString = z.union([z.string(), z.literal(""), z.null()]).optional();
const isoDate = z.string().datetime({ offset: true });

/**
 * Partida de una venta sincronizada. A diferencia de `posSaleItemSchema`, ESTA
 * sí acepta precios: son los que el cliente ya pagó en el mostrador y el papel
 * que se llevó. El servidor re-cotiza para detectar diferencias, pero guarda lo
 * que entró a la caja (decisión del negocio, 2026-09-18).
 */
export const posSyncSaleItemSchema = z.object({
  saleUnit: z.enum([POS_SALE_UNITS.PIECE, POS_SALE_UNITS.LITER]),
  productId: z.union([z.string().uuid(), z.null()]).optional(),
  lineId: z.union([z.string().uuid(), z.null()]).optional(),
  quantity: z.coerce.number().positive().max(100_000),
  priceTier: z.enum([PRICING_TIERS.RETAIL, PRICING_TIERS.WHOLESALE]),
  unitPrice: z.coerce.number().min(0).max(1_000_000),
  total: z.coerce.number().min(0).max(10_000_000),
  pricingBreakdown: z.union([z.record(z.unknown()), z.null()]).optional(),
  notes: optionalString,
});

export const posSyncCustomerSchema = z.object({
  localId: z.string().min(8).max(64),
  name: z.string().min(2).max(140),
  phone: z.string().min(7).max(24),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  birthday: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional(),
});

export const posSyncSalePayloadSchema = z.object({
  ticketNumber: z.string().min(5).max(40),
  soldAt: isoDate,
  customerId: z.union([z.string().uuid(), z.null()]).optional(),
  customer: z.union([posSyncCustomerSchema, z.null()]).optional(),
  items: z.array(posSyncSaleItemSchema).min(1).max(200),
  subtotal: z.coerce.number().min(0).max(10_000_000),
  discount: z.coerce.number().min(0).max(1_000_000).default(0),
  total: z.coerce.number().min(0).max(10_000_000),
  paymentMethod: z.enum(POS_PAYMENT_METHOD_VALUES).default(POS_PAYMENT_METHOD_VALUES[0]),
  amountTendered: z.coerce.number().min(0).max(10_000_000),
  changeAmount: z.coerce.number().min(0).max(10_000_000),
  notes: optionalString,
  catalogVersion: optionalString,
  recordedOffline: z.boolean().default(false),
  voided: z
    .union([z.object({ at: isoDate, reason: z.string().min(3).max(200) }), z.null()])
    .optional(),
});

export const posSyncVoidPayloadSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(3).max(200),
  voidedAt: isoDate,
});

export const posSyncEventSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid(),
    type: z.literal(POS_SYNC_EVENT_TYPES.SALE_CREATED),
    occurredAt: isoDate,
    payload: posSyncSalePayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal(POS_SYNC_EVENT_TYPES.SALE_VOIDED),
    occurredAt: isoDate,
    payload: posSyncVoidPayloadSchema,
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal(POS_SYNC_EVENT_TYPES.CUSTOMER_CREATED),
    occurredAt: isoDate,
    payload: posSyncCustomerSchema,
  }),
]);

export const posSyncHeartbeatSchema = z.object({
  pendingCount: z.coerce.number().int().min(0).max(1_000_000),
  oldestPendingAt: z.union([isoDate, z.null()]).optional(),
  lastSaleAt: z.union([isoDate, z.null()]).optional(),
  appVersion: optionalString,
  catalogVersion: optionalString,
});

export const posSyncRequestSchema = z.object({
  branchId: z.union([z.string().uuid(), z.null()]).optional(),
  deviceId: z.string().min(8).max(64),
  clockOffsetMs: z.coerce.number().int().min(-31_536_000_000).max(31_536_000_000).optional(),
  /** Un lote vacío es válido: sirve de heartbeat cuando no hay nada que subir. */
  events: z.array(posSyncEventSchema).max(200).default([]),
  heartbeat: posSyncHeartbeatSchema.optional(),
});

export const posSyncStateQuerySchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
});

export const posCustomersSnapshotSchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  /** Cursor: solo clientes con `updatedAt` posterior. */
  since: z.union([isoDate, z.literal(""), z.null()]).optional(),
  limit: z.coerce.number().int().min(1).max(2_000).default(1_000),
});

export const queryPosRejectionsSchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  includeResolved: z.coerce.boolean().optional(),
});

export const resolvePosRejectionSchema = z.object({
  action: z.enum(["retry", "discard"]),
  notes: optionalString,
});

export type PosSyncRequestInput = z.infer<typeof posSyncRequestSchema>;
