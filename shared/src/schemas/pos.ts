import { z } from "zod";
import { paginationSchema } from "./common";
import {
  POS_PAYMENT_METHODS,
  POS_SALE_STATUS,
  POS_SALE_UNITS,
  PRICING_TIERS,
} from "../constants";

const optionalString = z.union([z.string(), z.literal(""), z.null()]).optional();

/** Máximo de decimales de una cantidad en litros (mililitro más cercano no aplica en caja). */
const LITER_DECIMALS = 2;

function hasTooManyDecimals(value: number, decimals: number): boolean {
  const factor = 10 ** decimals;
  return Math.abs(value * factor - Math.round(value * factor)) > 1e-9;
}

/**
 * Partida del ticket. Dos formas:
 * - `piece`: `productId` + cantidad entera (envase cerrado del catálogo).
 * - `liter`: `lineId` + litros con hasta dos decimales (servidos del bidón).
 *
 * El precio NUNCA viaja en el body: lo resuelve el servidor con
 * `priceBulkLiters`/`pricePieces` contra el catálogo de la organización.
 */
export const posSaleItemSchema = z
  .object({
    saleUnit: z.enum([POS_SALE_UNITS.PIECE, POS_SALE_UNITS.LITER]),
    productId: z.union([z.string().uuid(), z.null()]).optional(),
    lineId: z.union([z.string().uuid(), z.null()]).optional(),
    quantity: z.coerce.number().positive().max(100_000),
    priceTier: z.enum([PRICING_TIERS.RETAIL, PRICING_TIERS.WHOLESALE]).optional(),
    notes: optionalString,
  })
  .superRefine((value, ctx) => {
    if (value.saleUnit === POS_SALE_UNITS.PIECE) {
      if (!value.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Una partida por pieza necesita productId",
          path: ["productId"],
        });
      }
      if (!Number.isInteger(value.quantity)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Las piezas se venden en cantidades enteras",
          path: ["quantity"],
        });
      }
      return;
    }
    if (!value.lineId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Una partida por litro necesita lineId",
        path: ["lineId"],
      });
    }
    if (hasTooManyDecimals(value.quantity, LITER_DECIMALS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Los litros admiten hasta dos decimales",
        path: ["quantity"],
      });
    }
  });

export const createPosSaleSchema = z.object({
  /** Solo la manda un admin sin sucursal fija; el cajero la toma de su usuario. */
  branchId: z.union([z.string().uuid(), z.null()]).optional(),
  /** Generada por la caja al abrir el modal de cobro: reintentar no duplica el ticket. */
  idempotencyKey: z.string().min(8).max(120),
  /** null o ausente = venta de mostrador (cliente genérico). */
  customerId: z.union([z.string().uuid(), z.null()]).optional(),
  items: z.array(posSaleItemSchema).min(1).max(200),
  discount: z.coerce.number().min(0).max(1_000_000).default(0),
  paymentMethod: z.enum([POS_PAYMENT_METHODS.CASH]).default(POS_PAYMENT_METHODS.CASH),
  amountTendered: z.coerce.number().min(0).max(1_000_000),
  notes: optionalString,
});

export const voidPosSaleSchema = z.object({
  reason: z.string().min(3).max(200),
});

export const markPosSalePrintedSchema = z.object({
  /** Por dónde salió el ticket: agente local, diálogo del navegador, o no se imprimió. */
  target: z.enum(["agent", "browser", "none"]).default("agent"),
});

export const queryPosSalesSchema = paginationSchema.extend({
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  customerId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  cashierUserId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  status: z
    .union([
      z.enum([POS_SALE_STATUS.COMPLETED, POS_SALE_STATUS.VOIDED]),
      z.literal(""),
      z.null(),
    ])
    .optional(),
  /** Día de negocio (YYYY-MM-DD) en la zona de la organización. */
  date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional(),
  from: z.union([z.string(), z.literal(""), z.null()]).optional(),
  to: z.union([z.string(), z.literal(""), z.null()]).optional(),
});

export const queryPosCatalogSchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  /** Versión que ya tiene la caja: si coincide, el server responde sin cuerpo. */
  version: z.union([z.string().max(64), z.literal(""), z.null()]).optional(),
});

export const lookupPosProductSchema = z.object({
  /** Código de barras, sku de eleventa o posId. */
  code: z.string().min(1).max(64),
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
});

export const searchPosProductsSchema = z.object({
  q: z.string().min(1).max(80),
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

/** Alta rápida de cliente desde la caja: lo que se puede pedir sin frenar la fila. */
export const posCustomerSchema = z.object({
  name: z.string().min(2).max(140),
  phone: z.string().min(7).max(24),
  birthday: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
});

export const lookupPosCustomerSchema = z.object({
  phone: z.string().min(4).max(24),
});

export type CreatePosSaleInput = z.infer<typeof createPosSaleSchema>;
export type PosSaleItemInput = z.infer<typeof posSaleItemSchema>;
