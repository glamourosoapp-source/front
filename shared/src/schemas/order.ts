import { z } from "zod";
import { ORDER_STATUS, PAYMENT_STATUS, PRICING_TIERS } from "../constants";
import { paginationSchema } from "./common";

// Estados "activos": los únicos aceptados como destino en el PUT genérico.
// El paso draft -> new es exclusivo de POST /orders/:id/confirm, y un pedido
// confirmado nunca regresa a borrador.
const orderStatus = z.enum([
  ORDER_STATUS.NEW,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
]);

// Para filtros de listado (incluye borradores y eliminados). `deleted` solo lo
// acepta el server para administradores; a cualquier otro rol le responde 403.
const orderStatusFilter = z.enum([
  ORDER_STATUS.DRAFT,
  ORDER_STATUS.NEW,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.DELETED,
]);

const paymentStatus = z.enum([
  PAYMENT_STATUS.UNPAID,
  PAYMENT_STATUS.PAID,
  PAYMENT_STATUS.PARTIAL,
  PAYMENT_STATUS.REFUNDED,
]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .optional();

const itemSchema = z
  .object({
    productId: z.string().uuid().nullable().optional(),
    productName: z.string().max(140).optional(),
    quantity: z.number().positive(),
    /**
     * Solo se respeta en partidas sin productId (producto borrado del
     * catálogo): con productId el server siempre reprecia con la lista de la
     * partida. El panel ya no captura precios.
     */
    unitPrice: z.number().min(0).optional(),
    /**
     * Lista de precios de ESTA partida (mayoreo/menudeo). Si no viene, el
     * server usa la del cliente. Pedir mayoreo sobre un producto sin precio de
     * mayoreo cae a menudeo y la partida se guarda como menudeo.
     */
    priceTier: z.enum([PRICING_TIERS.RETAIL, PRICING_TIERS.WHOLESALE]).optional(),
    unit: z.string().max(30).optional(),
    notes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  })
  .refine((item) => Boolean(item.productId) || Boolean(item.productName), {
    message: "Each item requires productId or productName",
  });

export const createOrderSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    customer: z
      .object({
        name: z.string().min(2).max(140),
        phone: z.string().min(7).max(24),
        address: z.union([z.string(), z.literal(""), z.null()]).optional(),
        city: z.union([z.string(), z.literal(""), z.null()]).optional(),
        zone: z.union([z.string(), z.literal(""), z.null()]).optional(),
      })
      .optional(),
    conversationId: z.string().uuid().nullable().optional(),
    items: z.array(itemSchema).min(1),
    deliveryAddress: z.union([z.string(), z.literal(""), z.null()]).optional(),
    /** Domicilio guardado del cliente; si no viene dirección, se deriva de él. */
    customerLocationId: z.union([z.string().uuid(), z.null()]).optional(),
    deliveryZone: z.union([z.string(), z.literal(""), z.null()]).optional(),
    deliveryFee: z.number().min(0).default(0),
    /** Ignorado: el server deriva los bidones del catálogo (1 por unidad 20L líquida). */
    containersCount: z.number().int().min(0).max(999).default(0),
    discount: z.number().min(0).default(0),
    paymentMethod: z.union([z.string(), z.literal(""), z.null()]).optional(),
    paymentStatus: paymentStatus.default(PAYMENT_STATUS.UNPAID),
    customerNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
    internalNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
    scheduledDeliveryDate: isoDate,
    deliveryTimeWindow: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
    source: z.string().default("manual"),
    asDraft: z.boolean().default(false),
  })
  .refine((data) => Boolean(data.customerId) !== Boolean(data.customer), {
    message: "Provide customerId or customer, not both",
  });

export const updateOrderSchema = z.object({
  status: orderStatus.optional(),
  paymentStatus: paymentStatus.optional(),
  paymentMethod: z.union([z.string(), z.literal(""), z.null()]).optional(),
  deliveryAddress: z.union([z.string(), z.literal(""), z.null()]).optional(),
  customerLocationId: z.union([z.string().uuid(), z.null()]).optional(),
  deliveryZone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  scheduledDeliveryDate: z.union([isoDate.unwrap(), z.null()]).optional(),
  deliveryTimeWindow: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
  customerNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  internalNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  // Editar partidas y cargos recalcula totales server-side; en un pedido ya
  // confirmado además refresca los acumulados del cliente.
  items: z.array(itemSchema).min(1).optional(),
  deliveryFee: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  /** Ignorado: el server deriva los bidones del catálogo. */
  containersCount: z.number().int().min(0).max(999).optional(),
});

/**
 * Body de POST /orders/:id/confirm (draft -> new). Todo opcional: `{}`
 * convierte el borrador tal cual está; los campos presentes sobreescriben
 * el contenido del borrador en el mismo paso.
 */
export const confirmOrderSchema = z.object({
  items: z.array(itemSchema).min(1).optional(),
  deliveryFee: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  /** Ignorado: el server deriva los bidones del catálogo. */
  containersCount: z.number().int().min(0).max(999).optional(),
  paymentMethod: z.union([z.string(), z.literal(""), z.null()]).optional(),
  paymentStatus: paymentStatus.optional(),
  deliveryAddress: z.union([z.string(), z.literal(""), z.null()]).optional(),
  customerLocationId: z.union([z.string().uuid(), z.null()]).optional(),
  deliveryZone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  scheduledDeliveryDate: isoDate,
  deliveryTimeWindow: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
  customerNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  internalNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
});

export const queryOrderSchema = paginationSchema.extend({
  status: z.union([orderStatusFilter, z.literal(""), z.null()]).optional(),
  paymentStatus: z.union([paymentStatus, z.literal(""), z.null()]).optional(),
  customerId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  dateFrom: isoDate,
  dateTo: isoDate,
  deliveryFrom: isoDate,
  deliveryTo: isoDate,
  unscheduled: z.coerce.boolean().optional(),
  sortBy: z.enum(["createdAt", "deliveryDate"]).optional(),
  undelivered: z.coerce.boolean().optional(),
});

/**
 * Body de POST /orders/print: los pedidos cuyas notas se van a imprimir.
 * El tope acompaña al del listado (200 por página × 50 páginas es el máximo
 * que el front puede juntar, pero una impresión real nunca llega ahí).
 */
export const printOrdersSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500),
});
