import { z } from "zod";
import { paginationSchema } from "./common";

/**
 * Catálogo que ve una franquicia: productos disponibles con precio de mayoreo y
 * las líneas que se surten en bidón. Nunca incluye existencias (ni suyas ni de
 * otras sucursales): el inventario de franquicias lo lleva la franquicia.
 */
export const queryFranchiseCatalogSchema = paginationSchema.extend({
  categoryId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  /**
   * El portal pide el catálogo **completo** de una sola vez (~850 renglones) y
   * busca del lado del cliente: un pedido de franquicia trae decenas de
   * partidas y una consulta por tecleo lo volvía lento. Por eso este endpoint
   * sube el tope de `limit` del `paginationSchema` (200) sin tocarlo para el
   * resto de la API.
   */
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export const queryFranchiseOrdersSchema = paginationSchema.extend({
  status: z.union([z.string().max(20), z.literal(""), z.null()]).optional(),
});
