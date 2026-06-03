import { z } from "zod";

export const whatsappConfigSchema = z.object({
  phoneNumberId: z.union([z.string(), z.literal(""), z.null()]).optional(),
  displayPhone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  webhookSecret: z.union([z.string(), z.literal(""), z.null()]).optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
});
