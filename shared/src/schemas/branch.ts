import { z } from "zod";
import { paginationSchema } from "./common";
import { BRANCH_TYPES, TICKET_PAPER_WIDTHS } from "../constants";

const optionalString = z.union([z.string(), z.literal(""), z.null()]).optional();

/**
 * Configuración del ticket térmico de una sucursal. Se guarda en
 * `branches.ticket_settings` (JSONB) y SIEMPRE se mergea: el formulario del
 * panel no manda la impresora elegida, que la guarda la PC de la sucursal.
 */
export const ticketSettingsSchema = z.object({
  paperWidthMm: z.union([z.literal(TICKET_PAPER_WIDTHS[0]), z.literal(TICKET_PAPER_WIDTHS[1])]).optional(),
  headerLines: z.array(z.string().max(60)).max(6).optional(),
  footerMessage: z.string().max(160).optional(),
  logoUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  defaultPrinterName: z.union([z.string().max(120), z.literal(""), z.null()]).optional(),
});

const branchPayload = {
  /** Prefijo del folio de ticket: corto, sin espacios y en mayúsculas. */
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, "El código solo admite mayúsculas, números y guiones"),
  name: z.string().min(2).max(120),
  type: z.enum([BRANCH_TYPES.BRANCH, BRANCH_TYPES.FRANCHISE]).default(BRANCH_TYPES.BRANCH),
  street: optionalString,
  colony: optionalString,
  city: optionalString,
  postalCode: z.union([z.string().max(10), z.literal(""), z.null()]).optional(),
  phone: z.union([z.string().min(7).max(24), z.literal(""), z.null()]).optional(),
  /** 0 domingo … 6 sábado; null = la sucursal no genera faltantes automáticos. */
  /**
   * 0 domingo … 6 sábado; null = la sucursal no genera faltantes automáticos.
   * `z.null()` va PRIMERO a propósito: `z.coerce.number()` convierte null en 0,
   * así que con el orden inverso una sucursal sin corte quedaba con domingo.
   */
  restockCutoffDow: z.union([z.null(), z.coerce.number().int().min(0).max(6)]).optional(),
  ticketSettings: ticketSettingsSchema.optional(),
  notes: optionalString,
};

export const createBranchSchema = z.object(branchPayload);

export const updateBranchSchema = z.object({
  code: branchPayload.code.optional(),
  name: branchPayload.name.optional(),
  type: branchPayload.type.optional(),
  street: optionalString,
  colony: optionalString,
  city: optionalString,
  postalCode: branchPayload.postalCode,
  phone: branchPayload.phone,
  restockCutoffDow: branchPayload.restockCutoffDow,
  ticketSettings: branchPayload.ticketSettings,
  notes: optionalString,
  isActive: z.boolean().optional(),
});

export const queryBranchSchema = paginationSchema.extend({
  type: z.union([z.enum([BRANCH_TYPES.BRANCH, BRANCH_TYPES.FRANCHISE]), z.literal(""), z.null()]).optional(),
  isActive: z.union([z.enum(["true", "false"]), z.literal(""), z.null()]).optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type TicketSettingsInput = z.infer<typeof ticketSettingsSchema>;
