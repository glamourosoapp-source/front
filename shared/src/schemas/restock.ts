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
        RESTOCK_ORIGIN.MANUAL_ENTRY,
      ]),
      z.literal(""),
      z.null(),
    ])
    .optional(),
  /** Día de negocio del pedido (YYYY-MM-DD), inclusive en ambos extremos. */
  from: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD"), z.literal(""), z.null()])
    .optional(),
  to: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD"), z.literal(""), z.null()])
    .optional(),
});

/** Fábrica marca una partida como preparada y captura lo que realmente despacha. */
export const prepareRestockItemSchema = z.object({
  prepared: z.boolean().optional(),
  // null = fábrica aún no captura cuánto despacha (se usa lo pedido). Sin
  // poner z.null() primero, z.coerce lo volvería 0 = "no mandé nada".
  dispatchedQty: z.union([z.null(), z.coerce.number().min(0).max(100_000)]).optional(),
  /** Por qué se manda distinto de lo pedido; lo ve quien hizo el pedido. */
  notes: z.union([z.null(), z.string().max(500)]).optional(),
});

/**
 * Con qué se precarga la entrada de surtido: `latest` (default) toma el pedido
 * abierto más reciente de la sucursal y, si no hay, el faltante de hoy.
 */
export const queryRestockEntryFormSchema = z.object({
  basis: z.enum(["latest", "order", "shortages", "blank"]).default("latest"),
  orderId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
});

/**
 * Entrada de surtido capturada en el formato: cantidades en **empaques** (2 =
 * dos bidones), como en el papel. Con `orderId` cierra ese pedido abierto
 * (lo capturado es lo despachado); sin él crea un pedido `manual_entry`.
 */
export const registerRestockEntrySchema = z
  .object({
    orderId: z.union([z.string().uuid(), z.null()]).optional(),
    items: z
      .array(
        z
          .object({
            lineId: z.union([z.string().uuid(), z.null()]).optional(),
            productId: z.union([z.string().uuid(), z.null()]).optional(),
            qty: z.coerce.number().min(0).max(100_000),
          })
          .superRefine((value, ctx) => {
            if (Boolean(value.lineId) === Boolean(value.productId)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indica lineId o productId, no ambos" });
            }
          })
      )
      .max(2000),
    notes: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
    /** Publicidad que viene con la entrada (pie del formato). */
    publicityQty: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.items.some((item) => item.qty > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Captura al menos un renglón con cantidad" });
    }
  });

const formRowFields = {
  label: z.string().trim().min(1).max(120),
  lineId: z.union([z.string().uuid(), z.null()]).optional(),
  productId: z.union([z.string().uuid(), z.null()]).optional(),
  packSize: z.coerce.number().int().min(1).max(100_000).optional(),
  packLabel: z.string().trim().max(20).optional(),
  unitPrice: z.union([z.null(), z.coerce.number().min(0).max(1_000_000)]).optional(),
  bidon: z.union([z.enum(["transparent", "color"]), z.null()]).optional(),
  blueBox: z.boolean().optional(),
};

/** Renglón nuevo del formato: se inserta debajo de `afterRow` (-1 = arriba del bloque). */
export const createFactoryFormRowSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(20),
    block: z.coerce.number().int().min(0).max(5),
    afterRow: z.coerce.number().int().min(-1),
    kind: z.enum(["product", "section", "blank"]).default("product"),
    ...formRowFields,
    label: z.string().trim().max(120).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.lineId && value.productId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indica lineId o productId, no ambos" });
    if (value.kind === "section" && !value.label) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La sección necesita un título" });
    if (value.kind === "product" && !value.label) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El renglón necesita un nombre" });
  });

/** Cambios a un renglón del formato (nombre, producto ligado, empaque, precio, bidón, caja azul). */
export const updateFactoryFormRowSchema = z
  .object({ ...formRowFields, label: formRowFields.label.optional() })
  .superRefine((value, ctx) => {
    if (value.lineId && value.productId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indica lineId o productId, no ambos" });
  });

/**
 * Liga al formato un producto que se vendió sin renglón (pestaña "Productos no
 * ligados" de Faltantes y surtido): en un renglón vacío o en uno nuevo, y en el
 * mismo paso fija el mínimo y el conteo real de cada sucursal donde se vendió.
 * `minStock` y `stock` van en litros (línea) o piezas (producto); `stock`
 * vacío deja la existencia como está.
 */
export const linkUnlinkedToFormSchema = z
  .object({
    lineId: z.union([z.string().uuid(), z.null()]).optional(),
    productId: z.union([z.string().uuid(), z.null()]).optional(),
    placement: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("row"), rowId: z.string().uuid() }),
      z.object({
        mode: z.literal("new"),
        page: z.coerce.number().int().min(1).max(20),
        block: z.coerce.number().int().min(0).max(5),
        afterRow: z.coerce.number().int().min(-1),
        label: z.string().trim().min(1).max(120),
      }),
    ]),
    packSize: formRowFields.packSize,
    packLabel: formRowFields.packLabel,
    unitPrice: formRowFields.unitPrice,
    branches: z
      .array(
        z.object({
          branchId: z.string().uuid(),
          minStock: z.coerce.number().min(0).max(1_000_000),
          stock: z.union([z.null(), z.coerce.number().min(0).max(1_000_000)]).optional(),
        })
      )
      .max(200),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.lineId) === Boolean(value.productId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indica lineId o productId, no ambos" });
    }
    const ids = value.branches.map((branch) => branch.branchId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Una sucursal viene repetida" });
    }
  });

export const queryFactoryFormTargetsSchema = z.object({
  search: z.union([z.string().max(120), z.literal("")]).optional(),
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
export type LinkUnlinkedToFormInput = z.infer<typeof linkUnlinkedToFormSchema>;
