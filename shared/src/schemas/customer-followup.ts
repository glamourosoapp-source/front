import { z } from "zod";
import { idSchema, paginationSchema } from "./common";
import { CUSTOMER_FOLLOWUP } from "../constants";

/** Cubo excluyente de días sin comprar: 15 (15-29), 30 (30-59) o 60 (60-65). */
export const customerFollowupBucketSchema = z.union([z.literal(15), z.literal(30), z.literal(60)]);

export const customerFollowupQuerySchema = paginationSchema.extend({
  /** Sin cubo se devuelve toda la ventana (MIN_DAYS..MAX_DAYS). */
  bucket: z.coerce.number().pipe(customerFollowupBucketSchema).optional(),
  /** Filtrar por vendedor: admin, cualquiera; scope team, solo miembros de su equipo; scope own, prohibido (403). */
  sellerId: idSchema.optional(),
});

export const customerFollowupSummaryQuerySchema = z.object({
  sellerId: idSchema.optional(),
});

export const customerFollowupRowSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string().nullable(),
  zone: z.string().nullable(),
  /** Fecha del último pedido efectivo (ni borrador, ni eliminado, ni cancelado). */
  lastSaleAt: z.string(),
  daysSinceLastSale: z.number().int(),
  bucket: customerFollowupBucketSchema,
  effectiveOrders: z.number().int(),
  seller: z.object({ id: idSchema, name: z.string() }),
});

export const customerFollowupListResponseSchema = z.object({
  items: z.array(customerFollowupRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

export const customerFollowupSummaryResponseSchema = z.object({
  total: z.number().int(),
  buckets: z.object({ 15: z.number().int(), 30: z.number().int(), 60: z.number().int() }),
  minDays: z.number().int().default(CUSTOMER_FOLLOWUP.MIN_DAYS),
  maxDays: z.number().int().default(CUSTOMER_FOLLOWUP.MAX_DAYS),
  /** Vendedores con clientes en la ventana, dentro del alcance del usuario (para el filtro). */
  sellers: z.array(z.object({ id: idSchema, name: z.string() })),
});

export type CustomerFollowupQuery = z.infer<typeof customerFollowupQuerySchema>;
export type CustomerFollowupSummaryQuery = z.infer<typeof customerFollowupSummaryQuerySchema>;
export type CustomerFollowupRow = z.infer<typeof customerFollowupRowSchema>;
export type CustomerFollowupListResponse = z.infer<typeof customerFollowupListResponseSchema>;
export type CustomerFollowupSummaryResponse = z.infer<typeof customerFollowupSummaryResponseSchema>;
