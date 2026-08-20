import { z } from "zod";

const dayOverrideSchema = z.object({
  cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm").optional(),
  offsetBeforeCutoffDays: z.number().int().min(0).max(14).optional(),
  offsetAfterCutoffDays: z.number().int().min(0).max(14).optional(),
});

export const deliveryScheduleSchema = z.object({
  cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm"),
  offsetBeforeCutoffDays: z.number().int().min(0).max(14),
  offsetAfterCutoffDays: z.number().int().min(0).max(14),
  timezone: z.string().min(1),
  skipSundays: z.boolean(),
  // Reglas por día (p. ej. fin de semana); null elimina la regla default de ese día.
  dayOverrides: z
    .record(
      z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]),
      dayOverrideSchema.nullable()
    )
    .optional(),
});

export const whatsappConfigSchema = z.object({
  phoneNumberId: z.union([z.string(), z.literal(""), z.null()]).optional(),
  displayPhone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  webhookSecret: z.union([z.string(), z.literal(""), z.null()]).optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
});
