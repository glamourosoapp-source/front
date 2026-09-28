import { z } from "zod";
import { paginationSchema } from "./common";
import { BIDON_LITERS, CONTAINER_MATERIALS } from "../constants";

/**
 * Línea de líquido. Los dos SKU son explícitos —no se deducen del nombre—
 * porque de ellos sale el precio: `bidonProductId` cobra los 20 L completos y
 * `literProductId` los litros sueltos. Una línea sin ambos SKU existe (agrupa
 * inventario) pero no habilita la venta por litro.
 */
const productLinePayload = {
  name: z.string().min(3).max(120),
  categoryId: z.union([z.string().uuid(), z.null()]).optional(),
  bidonProductId: z.union([z.string().uuid(), z.null()]).optional(),
  literProductId: z.union([z.string().uuid(), z.null()]).optional(),
  litersPerBidon: z.coerce.number().positive().max(1000).default(BIDON_LITERS),
  containerMaterial: z.enum([CONTAINER_MATERIALS.PET, CONTAINER_MATERIALS.POLYETHYLENE]).optional(),
};

export const createProductLineSchema = z.object(productLinePayload);

export const updateProductLineSchema = z.object({
  name: productLinePayload.name.optional(),
  categoryId: productLinePayload.categoryId,
  bidonProductId: productLinePayload.bidonProductId,
  literProductId: productLinePayload.literProductId,
  litersPerBidon: productLinePayload.litersPerBidon.optional(),
  containerMaterial: productLinePayload.containerMaterial,
  isActive: z.boolean().optional(),
});

/** Regla de envase y tapa (material × litros) que edita el administrador. */
export const upsertContainerRuleSchema = z.object({
  material: z.enum([CONTAINER_MATERIALS.PET, CONTAINER_MATERIALS.POLYETHYLENE]),
  liters: z.coerce.number().positive().max(1000),
  containerProductId: z.union([z.string().uuid(), z.null()]),
  capProductId: z.union([z.string().uuid(), z.null()]),
});

export const queryProductLineSchema = paginationSchema.extend({
  /** "true" = solo las que pueden venderse por litro (con los dos SKU). */
  sellableByLiter: z.union([z.enum(["true", "false"]), z.literal(""), z.null()]).optional(),
  isActive: z.union([z.enum(["true", "false"]), z.literal(""), z.null()]).optional(),
});

/** Asigna o quita la línea de un producto, con sus litros por unidad. */
export const assignProductLineSchema = z.object({
  lineId: z.union([z.string().uuid(), z.null()]),
  litersPerUnit: z.union([z.null(), z.coerce.number().positive().max(1000)]).optional(),
});

export type CreateProductLineInput = z.infer<typeof createProductLineSchema>;
export type UpdateProductLineInput = z.infer<typeof updateProductLineSchema>;
