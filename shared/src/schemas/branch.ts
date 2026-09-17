import { z } from "zod";
import { paginationSchema } from "./common";
import { BRANCH_TYPES, TICKET_PAPER_WIDTHS } from "../constants";
import {
  TICKET_EMPHASIS_SIZES,
  TICKET_FONT_SIZES,
  TICKET_LINE_SPACINGS,
  TICKET_LOGO_POSITIONS,
} from "../utils/pos-ticket-settings";

const optionalString = z.union([z.string(), z.literal(""), z.null()]).optional();

/**
 * Configuración del ticket térmico.
 *
 * La usan los dos niveles: el default de la organización
 * (`brand_settings.pos.ticket`) y el override de una sucursal
 * (`branches.ticket_settings`). Siempre se guarda con **merge**.
 *
 * Cada campo admite `null` a propósito: en una sucursal `null` significa
 * **heredar** el valor de la organización, y el resolutor lo trata igual que un
 * campo ausente.
 */
const nullableText = (max: number) =>
  z.union([z.string().max(max), z.literal(""), z.null()]).optional();

export const ticketSettingsSchema = z.object({
  paperWidthMm: z
    .union([
      z.literal(TICKET_PAPER_WIDTHS[0]),
      z.literal(TICKET_PAPER_WIDTHS[1]),
      z.null(),
    ])
    .optional(),

  businessName: nullableText(60),
  legalName: nullableText(120),
  taxId: nullableText(20),
  taxRegime: nullableText(80),
  addressLines: z.union([z.array(z.string().max(60)).max(4), z.null()]).optional(),
  phone: nullableText(24),
  email: nullableText(80),
  website: nullableText(80),
  headerLines: z.union([z.array(z.string().max(60)).max(6), z.null()]).optional(),
  legalNotice: nullableText(200),
  footerMessage: nullableText(160),
  /** URL completa, o ruta del propio dashboard (`/branding/logo.png`). */
  logoUrl: z
    .union([
      z.string().url().max(500),
      z.string().regex(/^\/[\w\-./]*$/, "Debe ser una URL o una ruta que empiece con /").max(500),
      z.literal(""),
      z.null(),
    ])
    .optional(),
  logoPosition: z.union([z.enum(TICKET_LOGO_POSITIONS), z.null()]).optional(),

  fontSize: z.union([z.enum(TICKET_FONT_SIZES), z.null()]).optional(),
  headerSize: z.union([z.enum(TICKET_EMPHASIS_SIZES), z.null()]).optional(),
  totalSize: z.union([z.enum(TICKET_EMPHASIS_SIZES), z.null()]).optional(),
  lineSpacing: z.union([z.enum(TICKET_LINE_SPACINGS), z.null()]).optional(),
  separatorChar: z.union([z.string().length(1), z.literal(""), z.null()]).optional(),

  showTaxData: z.union([z.boolean(), z.null()]).optional(),
  showAddress: z.union([z.boolean(), z.null()]).optional(),
  showPhone: z.union([z.boolean(), z.null()]).optional(),
  showCashier: z.union([z.boolean(), z.null()]).optional(),
  showCustomer: z.union([z.boolean(), z.null()]).optional(),
  showItemCodes: z.union([z.boolean(), z.null()]).optional(),
  showBreakdown: z.union([z.boolean(), z.null()]).optional(),
  showPaymentDetail: z.union([z.boolean(), z.null()]).optional(),
  showFolioBarcode: z.union([z.boolean(), z.null()]).optional(),

  // `z.null()` va PRIMERO: `z.coerce.number()` convierte null en 0, y con el
  // orden inverso "heredar" (null) quedaba como 0 renglones de avance.
  copies: z.union([z.null(), z.coerce.number().int().min(1).max(3)]).optional(),
  feedLines: z.union([z.null(), z.coerce.number().int().min(0).max(8)]).optional(),
  cutPaper: z.union([z.boolean(), z.null()]).optional(),

  /** La guarda la PC de la sucursal; el formulario del panel no la manda. */
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

/** Resumen por sucursal del panel: todas, o solo sucursales / solo franquicias. */
export const queryBranchStatsSchema = z.object({
  type: z.union([z.enum([BRANCH_TYPES.BRANCH, BRANCH_TYPES.FRANCHISE]), z.literal(""), z.null()]).optional(),
});

/** Clientes registrados en una sucursal (los que compraron ahí con teléfono). */
export const queryBranchCustomersSchema = paginationSchema.extend({
  search: z.union([z.string().max(120), z.literal(""), z.null()]).optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type TicketSettingsInput = z.infer<typeof ticketSettingsSchema>;
