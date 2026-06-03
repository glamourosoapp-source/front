import { z } from "zod";

export const idSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  search: z.union([z.string(), z.null()]).optional().transform((v) => v ?? ""),
});

export const idParamSchema = z.object({ id: idSchema });
