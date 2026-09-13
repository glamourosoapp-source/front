import { TICKET_PAPER_WIDTHS, type TicketPaperWidth } from "../constants";

/** Configuración del ticket térmico: default de la organización + override por sucursal. */
export interface TicketSettings {
  paperWidthMm: TicketPaperWidth;
  /** Líneas de encabezado (nombre comercial, domicilio, teléfono). */
  headerLines: string[];
  footerMessage: string;
  logoUrl: string | null;
  /** Nombre de la impresora elegida en la PC de la sucursal (lo usa el agente). */
  defaultPrinterName: string | null;
}

export const DEFAULT_TICKET_SETTINGS: TicketSettings = {
  paperWidthMm: 80,
  headerLines: [],
  footerMessage: "¡Gracias por su compra!",
  logoUrl: null,
  defaultPrinterName: null,
};

/** Nombre del cliente genérico de mostrador cuando la venta no se registra a nadie. */
export const DEFAULT_WALK_IN_CUSTOMER_NAME = "Mostrador";

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const lines = value.filter((line): line is string => typeof line === "string");
  return lines.length ? lines : null;
}

function asPaperWidth(value: unknown): TicketPaperWidth | null {
  const width = Number(value);
  return TICKET_PAPER_WIDTHS.includes(width as TicketPaperWidth)
    ? (width as TicketPaperWidth)
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Resuelve el ticket de una sucursal: lo que define la sucursal gana, luego el
 * default de la organización (`brand_settings.pos.ticket`) y al final el
 * default del sistema. Nunca lanza: cualquier JSONB mal formado cae al default.
 */
export function resolveTicketSettings(
  organizationPos: unknown,
  branchTicket: unknown
): TicketSettings {
  const orgTicket =
    organizationPos && typeof organizationPos === "object"
      ? ((organizationPos as Record<string, unknown>).ticket as Record<string, unknown> | undefined)
      : undefined;
  const branch = (branchTicket ?? {}) as Record<string, unknown>;
  const org = (orgTicket ?? {}) as Record<string, unknown>;

  return {
    paperWidthMm:
      asPaperWidth(branch.paperWidthMm) ??
      asPaperWidth(org.paperWidthMm) ??
      DEFAULT_TICKET_SETTINGS.paperWidthMm,
    headerLines:
      asStringArray(branch.headerLines) ??
      asStringArray(org.headerLines) ??
      DEFAULT_TICKET_SETTINGS.headerLines,
    footerMessage:
      asText(branch.footerMessage) ??
      asText(org.footerMessage) ??
      DEFAULT_TICKET_SETTINGS.footerMessage,
    logoUrl: asText(branch.logoUrl) ?? asText(org.logoUrl) ?? DEFAULT_TICKET_SETTINGS.logoUrl,
    defaultPrinterName: asText(branch.defaultPrinterName),
  };
}

/** Nombre del cliente de mostrador configurado en la organización. */
export function resolveWalkInCustomerName(organizationPos: unknown): string {
  const pos = (organizationPos ?? {}) as Record<string, unknown>;
  return asText(pos.walkInCustomerName) ?? DEFAULT_WALK_IN_CUSTOMER_NAME;
}
