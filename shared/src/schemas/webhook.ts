import { z } from "zod";

export const kapsoWebhookSchema = z
  .object({
    id: z.union([z.string(), z.null()]).optional(),
    type: z.union([z.string(), z.null()]).optional(),
    event: z.union([z.string(), z.null()]).optional(),
    message: z.record(z.unknown()).optional(),
    contact: z.record(z.unknown()).optional(),
    data: z.record(z.unknown()).optional(),
  })
  .passthrough();
