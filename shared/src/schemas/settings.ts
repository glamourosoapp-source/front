import { z } from "zod";
import { ticketSettingsSchema } from "./branch";

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

/**
 * Defaults del punto de venta de la organización (`brand_settings.pos`).
 *
 * Es el mismo contrato del ticket de una sucursal **sin la impresora**: esa vive
 * en la PC de cada sucursal y no tiene sentido heredarla. Todo lo que se manda
 * aquí se mergea sobre lo guardado.
 */
export const posSettingsSchema = z.object({
  ticket: ticketSettingsSchema.omit({ defaultPrinterName: true }).optional(),
  /** Nombre del cliente genérico cuando la venta no se registra a nadie. */
  walkInCustomerName: z.union([z.string().max(60), z.literal(""), z.null()]).optional(),
});

export type PosSettingsInput = z.infer<typeof posSettingsSchema>;
