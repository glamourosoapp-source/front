import { z } from "zod";
import { paginationSchema } from "./common";
import { PRICING_TIERS } from "../constants";

const optionalString = z.union([z.string(), z.literal(""), z.null()]).optional();
const optionalText = (max: number) => z.union([z.string().max(max), z.literal(""), z.null()]).optional();

/**
 * Datos de facturación (receptor CFDI 4.0). Aquí solo la forma de cada campo;
 * la regla todo-o-nada y la coherencia RFC ↔ régimen ↔ uso las aplica
 * `validateBillingInfo` en el servicio, porque en un PUT hay que evaluarlas
 * sobre el registro ya mergeado y no sobre lo que llegó en el body.
 */
const billingPayload = {
  taxId: optionalText(20),
  legalName: optionalText(254),
  taxRegime: optionalText(10),
  cfdiUse: optionalText(10),
  taxPostalCode: optionalText(10),
  billingEmail: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
};

const customerPayload = {
  name: z.string().min(2).max(140),
  phone: z.string().min(7).max(24),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  street: optionalString,
  colony: optionalString,
  postalCode: z.union([z.string().max(10), z.literal(""), z.null()]).optional(),
  address: optionalString,
  city: optionalString,
  zone: optionalString,
  notes: optionalString,
  source: optionalString,
  pricingTier: z.enum([PRICING_TIERS.RETAIL, PRICING_TIERS.WHOLESALE]).default(PRICING_TIERS.RETAIL),
  tagIds: z.array(z.string().uuid()).default([]),
  ...billingPayload,
};

export const createCustomerSchema = z.object(customerPayload);

export const updateCustomerSchema = z.object({
  name: customerPayload.name.optional(),
  phone: customerPayload.phone.optional(),
  email: customerPayload.email,
  street: optionalString,
  colony: optionalString,
  postalCode: customerPayload.postalCode,
  address: optionalString,
  city: optionalString,
  zone: optionalString,
  notes: optionalString,
  source: optionalString,
  pricingTier: customerPayload.pricingTier.optional(),
  tagIds: customerPayload.tagIds.optional(),
  /** Reasignación de equipo; el router solo la acepta para roles admin. */
  teamId: z.union([z.string().uuid(), z.null()]).optional(),
  ...billingPayload,
});

export const queryCustomerSchema = paginationSchema.extend({
  tag: optionalString,
  zone: optionalString,
  teamId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
});
