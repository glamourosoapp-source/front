import { z } from "zod";

/** Lista de precios de una ciudad (Tepic, Tapachula…). */
export const createPriceListSchema = z.object({
  name: z.string().trim().min(2).max(80),
  notes: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
});

export const updatePriceListSchema = createPriceListSchema.partial();

const priceSchema = z.coerce.number().min(0).max(1_000_000);

/**
 * Renglones a guardar en la lista (crea o reemplaza el del producto). Lo que
 * no viene no se toca: quitar un renglón es su propio endpoint.
 */
export const upsertPriceListItemsSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        price: priceSchema.refine((value) => value > 0, "El precio debe ser mayor a cero"),
        wholesalePrice: z.union([priceSchema, z.null()]).optional(),
        /** Renglón de eleventa del que vino: empata solo la siguiente importación. */
        sourceName: z.union([z.string().max(200), z.null()]).optional(),
        sourceCode: z.union([z.string().max(60), z.null()]).optional(),
      })
    )
    .min(1)
    .max(5000),
});

/** Renglones del Excel de eleventa para la vista previa (no escribe nada). */
export const previewPriceListImportSchema = z.object({
  rows: z
    .array(
      z.object({
        row: z.coerce.number().int().optional(),
        posId: z.union([z.string().max(60), z.null()]).optional(),
        name: z.string().trim().min(1).max(200),
        price: priceSchema,
        wholesalePrice: z.union([priceSchema, z.null()]).optional(),
      })
    )
    .min(1)
    .max(5000),
});

export const priceListItemParamsSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
});

/** Cambiar la lista de varias sucursales de una vez (null = precio general). */
export const assignPriceListBranchesSchema = z.object({
  assignments: z
    .array(
      z.object({
        branchId: z.string().uuid(),
        priceListId: z.union([z.string().uuid(), z.null()]),
      })
    )
    .min(1)
    .max(500),
});
