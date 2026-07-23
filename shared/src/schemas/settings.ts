import { z } from "zod";

export const deliveryScheduleSchema = z.object({
  cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm"),
  offsetBeforeCutoffDays: z.number().int().min(0).max(14),
  offsetAfterCutoffDays: z.number().int().min(0).max(14),
  timezone: z.string().min(1),
  skipSundays: z.boolean(),
});

export const whatsappConfigSchema = z.object({
  phoneNumberId: z.union([z.string(), z.literal(""), z.null()]).optional(),
  displayPhone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  webhookSecret: z.union([z.string(), z.literal(""), z.null()]).optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
});
