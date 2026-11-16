import { z } from "zod";
import { FACTORY_AREAS, FACTORY_CATALOG_KINDS, FACTORY_ITEM_MARKS } from "../constants";

/**
 * Contrato del pedido a fábrica v2 (Richi elige, Alex separa, Richi carga, la
 * oficina confirma). Plan: docs/exec-plans/active/pos-estados-pedido-fabrica-v2.md.
 */

const uuid = z.string().uuid();
const optionalNote = z.union([z.string().max(500), z.literal(""), z.null()]).optional();
const chargeQty = z.union([z.null(), z.coerce.number().min(0).max(100_000)]).optional();

/** Un renglón del faltante: una línea de líquido o un producto (solo uno). */
const targetSchema = z
  .object({
    lineId: z.union([uuid, z.null()]).optional(),
    productId: z.union([uuid, z.null()]).optional(),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.lineId) === Boolean(value.productId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indica lineId o productId (solo uno)" });
    }
  });

/**
 * Ajustes de la supervisora (o la caja, o la oficina) sobre el faltante en
 * vivo, en empaques. 0 = quitar el renglón. Los ajustados quedan fijos.
 */
export const saveShortageOverridesSchema = z.object({
  items: z
    .array(
      z
        .object({
          lineId: z.union([uuid, z.null()]).optional(),
          productId: z.union([uuid, z.null()]).optional(),
          qty: z.coerce.number().min(0).max(100_000),
        })
        .superRefine((value, ctx) => {
          if (Boolean(value.lineId) === Boolean(value.productId)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indica lineId o productId (solo uno)" });
          }
        })
    )
    .min(1)
    .max(500),
});

/** Regresar un renglón al calculado. */
export const clearShortageOverrideSchema = targetSchema;

/** Richi (o la oficina) elige sucursales: cada una pasa a En preparación. */
export const factoryPickSchema = z.object({
  branchIds: z.array(uuid).min(1).max(60),
});

/**
 * Marca de un renglón: azul (separado), verde (cargado), rojo (no hubo) o
 * `null` para quitarla. `qty` en empaques: distinta de lo pedido pinta amarillo.
 */
export const factoryMarkItemSchema = z.object({
  mark: z.union([
    z.enum([FACTORY_ITEM_MARKS.SEPARATED, FACTORY_ITEM_MARKS.LOADED, FACTORY_ITEM_MARKS.MISSING]),
    z.null(),
  ]),
  qty: z.union([z.null(), z.coerce.number().min(0).max(100_000)]).optional(),
  /** Por qué sale menos (obligatorio al enviar si sale menos de lo pedido). */
  notes: optionalNote,
});

/** Producto que fábrica agrega a un pedido en preparación (pedido en 0). */
export const factoryAddItemSchema = z
  .object({
    lineId: z.union([uuid, z.null()]).optional(),
    productId: z.union([uuid, z.null()]).optional(),
    qty: z.coerce.number().positive().max(100_000),
    mark: z
      .enum([FACTORY_ITEM_MARKS.SEPARATED, FACTORY_ITEM_MARKS.LOADED])
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.lineId) === Boolean(value.productId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indica lineId o productId (solo uno)" });
    }
  });

/** "Jarcería lista" (o deshacerla). */
export const factoryHardwareReadySchema = z.object({
  ready: z.boolean(),
});

/**
 * Enviar (En camino): quién lo envía, camión y chofer, obligatorios. Los
 * cargos (bidones vacíos, cajas azules, publicidad, envío) los ajusta Richi
 * aquí; sin mandarlos se quedan como se calcularon.
 */
export const factoryDispatchSchema = z.object({
  senderId: uuid,
  truckId: uuid,
  driverId: uuid,
  notes: optionalNote,
  bidonTransparentQty: chargeQty,
  bidonColorQty: chargeQty,
  blueBoxQty: chargeQty,
  publicityQty: z.union([z.null(), z.coerce.number().int().min(0).max(100_000)]).optional(),
  publicityAmount: chargeQty,
  shippingAmount: chargeQty,
});

export const factoryCatalogKindSchema = z.enum([
  FACTORY_CATALOG_KINDS.SENDER,
  FACTORY_CATALOG_KINDS.TRUCK,
  FACTORY_CATALOG_KINDS.DRIVER,
]);

/** Alta de un nombre en la lista de quién envía, camiones o choferes. */
export const createFactoryCatalogEntrySchema = z.object({
  kind: factoryCatalogKindSchema,
  name: z.string().trim().min(1).max(60),
  sort: z.coerce.number().int().min(0).max(10_000).optional(),
});

/** Renombrar, ordenar u ocultar (no se borra: el historial lo nombra). */
export const updateFactoryCatalogEntrySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    sort: z.coerce.number().int().min(0).max(10_000).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nada que cambiar" });

export const factoryAreaSchema = z.union([z.enum([FACTORY_AREAS.LIQUIDS, FACTORY_AREAS.HARDWARE]), z.null()]);

export type SaveShortageOverridesInput = z.infer<typeof saveShortageOverridesSchema>;
export type FactoryMarkItemInput = z.infer<typeof factoryMarkItemSchema>;
export type FactoryAddItemInput = z.infer<typeof factoryAddItemSchema>;
export type FactoryDispatchInput = z.infer<typeof factoryDispatchSchema>;
