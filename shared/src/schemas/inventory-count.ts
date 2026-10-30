import { z } from "zod";
import { paginationSchema } from "./common";
import { INVENTORY_COUNT_STATUS } from "../constants";

/** Iniciar un conteo cíclico en una sucursal (la lista sorpresa la arma el servidor). */
export const startInventoryCountSchema = z.object({
  branchId: z.string().uuid(),
});

/**
 * Captura de un renglón. `countedQty` ya convertido a la unidad del inventario
 * (litros o piezas; ver `countedQuantity`). `recount: true` guarda el reconteo.
 */
export const recordInventoryCountItemSchema = z.object({
  countedQty: z.coerce.number().min(0).max(1_000_000),
  recount: z.boolean().optional(),
  /**
   * Hora en que se contó, para la app del supervisor que guarda sin señal y
   * sube después. Sin ella cuenta la hora del servidor (la web). El Back la
   * recorta entre el inicio del conteo y la hora de llegada.
   */
  countedAt: z.coerce.date().optional(),
});

export const closeInventoryCountSchema = z.object({
  notes: z.string().max(500).nullable().optional(),
});

export const cancelInventoryCountSchema = z.object({
  reason: z.string().min(3).max(300),
});

/** Revertir el ajuste de un renglón (error de conteo): movimiento contrario en el kardex. */
export const revertInventoryCountItemSchema = z.object({
  reason: z.string().min(3).max(300),
});

export const queryInventoryCountsSchema = paginationSchema.extend({
  branchId: z.string().uuid().optional(),
  status: z
    .enum([INVENTORY_COUNT_STATUS.IN_PROGRESS, INVENTORY_COUNT_STATUS.CLOSED, INVENTORY_COUNT_STATUS.CANCELLED])
    .optional(),
  /** Día de negocio (YYYY-MM-DD) del inicio del conteo, inclusive. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const queryInventoryCountStatsSchema = z.object({
  branchId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
