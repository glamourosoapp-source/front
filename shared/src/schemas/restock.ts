import { z } from "zod";
import { paginationSchema } from "./common";
import { RESTOCK_ITEM_UNITS, RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "../constants";

const optionalString = z.union([z.string(), z.literal(""), z.null()]).optional();

/**
 * Partida de surtido: bidones de una línea de líquido, o piezas de un producto.
 * Los litros no viajan: fábrica despacha bidones completos y el servidor
 * convierte con `litersPerBidon` de la línea.
 */
export const restockItemSchema = z
  .object({
    lineId: z.union([z.string().uuid(), z.null()]).optional(),
    productId: z.union([z.string().uuid(), z.null()]).optional(),
    requestedQty: z.coerce.number().positive().max(100_000),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.lineId) === Boolean(value.productId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica lineId o productId, no ambos",
      });
    }
  });

export const createRestockOrderSchema = z.object({
  branchId: z.union([z.string().uuid(), z.null()]).optional(),
  origin: z
    .enum([RESTOCK_ORIGIN.SHORTAGE_MANUAL, RESTOCK_ORIGIN.FRANCHISE])
    .default(RESTOCK_ORIGIN.SHORTAGE_MANUAL),
  items: z.array(restockItemSchema).min(1).max(500),
  notes: optionalString,
});

export const updateRestockOrderSchema = z.object({
  items: z.array(restockItemSchema).min(1).max(500).optional(),
  status: z
    .enum([RESTOCK_ORDER_STATUS.PENDING, RESTOCK_ORDER_STATUS.APPROVED])
    .optional(),
  notes: optionalString,
});

/** Genera el pedido de faltantes de una sucursal a mano (mismo cálculo que el scheduler). */
export const generateShortageOrderSchema = z.object({
  notes: optionalString,
});

export const queryRestockOrdersSchema = paginationSchema.extend({
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  status: z
    .union([
      z.enum([
        RESTOCK_ORDER_STATUS.PENDING,
        RESTOCK_ORDER_STATUS.APPROVED,
        RESTOCK_ORDER_STATUS.PREPARING,
        RESTOCK_ORDER_STATUS.SENT,
        RESTOCK_ORDER_STATUS.RECEIVED,
        RESTOCK_ORDER_STATUS.CANCELLED,
      ]),
      z.literal(""),
      z.null(),
    ])
    .optional(),
  origin: z
    .union([
      z.enum([
        RESTOCK_ORIGIN.SHORTAGE_AUTO,
        RESTOCK_ORIGIN.SHORTAGE_MANUAL,
        RESTOCK_ORIGIN.FRANCHISE,
      ]),
      z.literal(""),
      z.null(),
    ])
    .optional(),
  from: z.union([z.string(), z.literal(""), z.null()]).optional(),
  to: z.union([z.string(), z.literal(""), z.null()]).optional(),
});

/** Fábrica marca una partida como preparada y captura lo que realmente despacha. */
export const prepareRestockItemSchema = z.object({
  prepared: z.boolean().optional(),
  // null = fábrica aún no captura cuánto despacha (se usa lo pedido). Sin
  // poner z.null() primero, z.coerce lo volvería 0 = "no mandé nada".
  dispatchedQty: z.union([z.null(), z.coerce.number().min(0).max(100_000)]).optional(),
});

export const sendRestockOrderSchema = z.object({
  notes: optionalString,
});

export const queryFactoryStatsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
});

export const restockItemUnitSchema = z.enum([
  RESTOCK_ITEM_UNITS.PIECE,
  RESTOCK_ITEM_UNITS.BIDON,
]);

export type CreateRestockOrderInput = z.infer<typeof createRestockOrderSchema>;
