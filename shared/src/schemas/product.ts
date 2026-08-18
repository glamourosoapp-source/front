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

export const improveProductDescriptionSchema = z.object({
  name: z.string().min(2).max(140),
  categoryName: z.union([z.string().max(90), z.literal(""), z.null()]).optional(),
  description: z.union([z.string().max(2000), z.literal(""), z.null()]).optional(),
});

// --- Importación de catálogo desde Excel de punto de venta ---

export const productImportRowSchema = z.object({
  posId: z.string().min(1).max(60),
  name: z.string().min(2).max(140),
  price: z.number().min(0),
  wholesalePrice: z.number().min(0),
  cost: z.number().min(0).nullable().optional(),
  // null = la celda vino vacía en el Excel → no tocar el valor existente
  stock: z.number().min(0).nullable().optional(),
  minStock: z.number().min(0).nullable().optional(),
  department: z.union([z.string().max(60), z.literal(""), z.null()]).optional(),
});

export const productImportRequestSchema = z.object({
  rows: z.array(productImportRowSchema).min(1).max(3000),
  dryRun: z.boolean().default(false),
});

export const productImportChangeSchema = z.object({
  field: z.enum(["price", "wholesalePrice", "cost", "stock", "minStock", "category", "sku"]),
  from: z.union([z.string(), z.number(), z.null()]),
  to: z.union([z.string(), z.number(), z.null()]),
});

export const productImportWarningsSchema = z.object({
  duplicatePosIds: z.array(z.string()),
  duplicateNames: z.array(z.string()),
  missingDepartment: z.array(z.string()),
  newWithoutDescription: z.array(z.string()),
  costIgnored: z.boolean(),
  createSkipped: z.boolean(),
});

export const productImportPreviewSchema = z.object({
  totalRows: z.number().int(),
  toCreate: z.array(
    z.object({
      posId: z.string(),
      name: z.string(),
      department: z.string().nullable(),
      price: z.number(),
      wholesalePrice: z.number(),
      hasDescription: z.boolean(),
    })
  ),
  toUpdate: z.array(
    z.object({
      productId: z.string().uuid(),
      posId: z.string(),
      name: z.string(),
      matchedBy: z.enum(["sku", "name"]),
      willRestore: z.boolean(),
      changes: z.array(productImportChangeSchema),
    })
  ),
  unchanged: z.number().int(),
  categoriesToCreate: z.array(z.string()),
  warnings: productImportWarningsSchema,
});

export const productImportResultSchema = z.object({
  created: z.array(
    z.object({ id: z.string().uuid(), posId: z.string(), name: z.string(), hasDescription: z.boolean() })
  ),
  updated: z.array(
    z.object({
      id: z.string().uuid(),
      posId: z.string(),
      name: z.string(),
      restored: z.boolean(),
      changes: z.array(productImportChangeSchema),
    })
  ),
  unchanged: z.number().int(),
  skipped: z.array(z.object({ posId: z.string(), name: z.string(), reason: z.string() })),
  errors: z.array(z.object({ posId: z.string(), name: z.string(), message: z.string() })),
  categoriesCreated: z.number().int(),
  embeddingsPending: z.number().int(),
  warnings: productImportWarningsSchema,
});

export type ProductImportRow = z.infer<typeof productImportRowSchema>;
export type ProductImportRequest = z.infer<typeof productImportRequestSchema>;
export type ProductImportChange = z.infer<typeof productImportChangeSchema>;
export type ProductImportWarnings = z.infer<typeof productImportWarningsSchema>;
export type ProductImportPreview = z.infer<typeof productImportPreviewSchema>;
export type ProductImportResult = z.infer<typeof productImportResultSchema>;
