import { z } from "zod";
import { paginationSchema } from "./common";

export const createFAQSchema = z.object({
  question: z.string().min(3),
  answer: z.string().min(3),
  category: z.string().max(60).default("general"),
  order: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

export const updateFAQSchema = createFAQSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

export const queryFAQSchema = paginationSchema.extend({
  category: z.union([z.string(), z.literal(""), z.null()]).optional(),
  q: z.union([z.string(), z.literal(""), z.null()]).optional(),
});

export const searchFAQSchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
