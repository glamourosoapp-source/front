import { z } from "zod";
import { paginationSchema } from "./common";
import { INVENTORY_MOVEMENT_TYPES } from "../constants";

/** Una fila del inventario apunta a una línea de líquido O a un producto, nunca a las dos. */
const inventoryTarget = {
  productId: z.union([z.string().uuid(), z.null()]).optional(),
  lineId: z.union([z.string().uuid(), z.null()]).optional(),
};

function exactlyOneTarget(
  value: { productId?: string | null; lineId?: string | null },
  ctx: z.RefinementCtx
): void {
  const hasProduct = Boolean(value.productId);
  const hasLine = Boolean(value.lineId);
  if (hasProduct === hasLine) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Indica productId o lineId, no ambos",
    });
  }
}

/**
 * Ajuste manual del inventario de una sucursal. Fija la existencia y/o el stock
 * mínimo; el servicio lo convierte en un movimiento de kardex con el delta, que
 * es la única forma de escribir `stock`.
 */
export const adjustBranchInventorySchema = z
  .object({
    ...inventoryTarget,
    stock: z.coerce.number().min(-1_000_000).max(1_000_000).optional(),
    minStock: z.coerce.number().min(0).max(1_000_000).optional(),
    reason: z.string().min(3).max(200),
  })
  .superRefine((value, ctx) => {
    exactlyOneTarget(value, ctx);
    if (value.stock === undefined && value.minStock === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Manda stock, minStock o ambos",
      });
    }
  });

/** Carga inicial de existencias de una sucursal (Excel parseado en el cliente). */
export const bulkBranchInventorySchema = z.object({
  rows: z
    .array(
      z
        .object({
          ...inventoryTarget,
          stock: z.coerce.number().min(-1_000_000).max(1_000_000),
          minStock: z.coerce.number().min(0).max(1_000_000).optional(),
        })
        .superRefine(exactlyOneTarget)
    )
    .min(1)
    .max(3000),
  reason: z.string().min(3).max(200).default("Carga inicial de inventario"),
});

export const queryBranchInventorySchema = paginationSchema.extend({
  /** "lines" = líquidos en litros; "products" = lo que se cuenta por pieza. */
  kind: z.union([z.enum(["lines", "products", "all"]), z.literal(""), z.null()]).optional(),
  categoryId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  /** "true" = solo lo que está por debajo de su stock mínimo. */
  belowMin: z.union([z.enum(["true", "false"]), z.literal(""), z.null()]).optional(),
});

export const queryInventoryMovementsSchema = paginationSchema.extend({
  productId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  lineId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  type: z
    .union([
      z.enum([
        INVENTORY_MOVEMENT_TYPES.SALE,
        INVENTORY_MOVEMENT_TYPES.SALE_VOID,
        INVENTORY_MOVEMENT_TYPES.RESTOCK_IN,
        INVENTORY_MOVEMENT_TYPES.ADJUSTMENT,
        INVENTORY_MOVEMENT_TYPES.INITIAL,
      ]),
      z.literal(""),
      z.null(),
    ])
    .optional(),
  from: z.union([z.string(), z.literal(""), z.null()]).optional(),
  to: z.union([z.string(), z.literal(""), z.null()]).optional(),
});
