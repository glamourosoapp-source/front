import { z } from "zod";
import { paginationSchema } from "./common";
import { PRICING_TIERS } from "../constants";

const optionalString = z.union([z.string(), z.literal(""), z.null()]).optional();

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
});

export const queryCustomerSchema = paginationSchema.extend({
  tag: optionalString,
  zone: optionalString,
});
