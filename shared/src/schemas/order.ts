import { z } from "zod";
import { ORDER_STATUS, PAYMENT_STATUS } from "../constants";
import { paginationSchema } from "./common";

const orderStatus = z.enum([
  ORDER_STATUS.NEW,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
]);

const paymentStatus = z.enum([
  PAYMENT_STATUS.UNPAID,
  PAYMENT_STATUS.PAID,
  PAYMENT_STATUS.PARTIAL,
  PAYMENT_STATUS.REFUNDED,
]);

const itemSchema = z
  .object({
    productId: z.string().uuid().nullable().optional(),
    productName: z.string().max(140).optional(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0).optional(),
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
    deliveryZone: z.union([z.string(), z.literal(""), z.null()]).optional(),
    deliveryFee: z.number().min(0).default(0),
    discount: z.number().min(0).default(0),
    paymentMethod: z.union([z.string(), z.literal(""), z.null()]).optional(),
    paymentStatus: paymentStatus.default(PAYMENT_STATUS.UNPAID),
    customerNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
    internalNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
    source: z.string().default("manual"),
  })
  .refine((data) => Boolean(data.customerId) !== Boolean(data.customer), {
    message: "Provide customerId or customer, not both",
  });

export const updateOrderSchema = z.object({
  status: orderStatus.optional(),
  paymentStatus: paymentStatus.optional(),
  paymentMethod: z.union([z.string(), z.literal(""), z.null()]).optional(),
  deliveryAddress: z.union([z.string(), z.literal(""), z.null()]).optional(),
  deliveryZone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  customerNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  internalNotes: z.union([z.string(), z.literal(""), z.null()]).optional(),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .optional();

export const queryOrderSchema = paginationSchema.extend({
  status: z.union([orderStatus, z.literal(""), z.null()]).optional(),
  paymentStatus: z.union([paymentStatus, z.literal(""), z.null()]).optional(),
  customerId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  dateFrom: isoDate,
  dateTo: isoDate,
  undelivered: z.coerce.boolean().optional(),
});
