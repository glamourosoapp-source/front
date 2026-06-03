import { z } from "zod";
import { paginationSchema } from "./common";

export const createCategorySchema = z.object({
  name: z.string().min(2).max(90),
  description: z.union([z.string(), z.literal(""), z.null()]).optional(),
  externalCode: z.union([z.string().max(40), z.literal(""), z.null()]).optional(),
  sortOrder: z.number().int().default(0),
});

export const createProductSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  sku: z.union([z.string(), z.literal(""), z.null()]).optional(),
  name: z.string().min(2).max(140),
  description: z.union([z.string(), z.literal(""), z.null()]).optional(),
  unit: z.string().max(30).default("pieza"),
  unitType: z.union([z.string().max(50), z.literal(""), z.null()]).optional(),
  unitsPerPackage: z.number().int().positive().nullable().optional(),
  price: z.number().min(0),
  wholesalePrice: z.number().min(0).optional(),
  cost: z.number().min(0).default(0),
  stock: z.number().min(0).default(0),
  minStock: z.number().min(0).default(0),
  isAvailable: z.boolean().default(true),
  imageUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  variants: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const updateProductSchema = createProductSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

export const queryProductSchema = paginationSchema.extend({
  categoryId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  available: z.coerce.boolean().optional(),
});
