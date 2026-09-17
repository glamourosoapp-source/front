import { TICKET_PAPER_WIDTHS, type TicketPaperWidth } from "../constants";

/** Tamaño de la letra del cuerpo del ticket. */
export const TICKET_FONT_SIZES = ["small", "normal", "large"] as const;
export type TicketFontSize = (typeof TICKET_FONT_SIZES)[number];

/** Realce de una línea destacada (nombre del negocio, total). */
export const TICKET_EMPHASIS_SIZES = ["normal", "large", "xlarge"] as const;
export type TicketEmphasis = (typeof TICKET_EMPHASIS_SIZES)[number];

/** Dónde se imprime el logo del negocio. */
export const TICKET_LOGO_POSITIONS = ["header", "footer", "none"] as const;
export type TicketLogoPosition = (typeof TICKET_LOGO_POSITIONS)[number];

/** Separación entre renglones. */
export const TICKET_LINE_SPACINGS = ["tight", "normal", "loose"] as const;
export type TicketLineSpacing = (typeof TICKET_LINE_SPACINGS)[number];

/**
 * Configuración del ticket térmico: default de la organización
 * (`organizations.brand_settings.pos.ticket`) + override por sucursal
 * (`branches.ticket_settings`).
 *
 * En el JSONB de la sucursal, `null` significa **heredar**: el resolutor lo
 * trata igual que un campo ausente y cae al valor de la organización. Por eso el
 * formulario del panel manda `null` en cada campo que la sucursal no personaliza.
 */
export interface TicketSettings {
  paperWidthMm: TicketPaperWidth;

  // --- Identidad y datos de facturación -------------------------------------
  /** Nombre comercial impreso arriba. `null` = el nombre de la sucursal. */
  businessName: string | null;
  /** Razón social para efectos fiscales. */
  legalName: string | null;
  /** RFC / identificador fiscal. */
  taxId: string | null;
  /** Régimen fiscal (texto libre, p. ej. "601 - General de Ley Personas Morales"). */
  taxRegime: string | null;
  /** Domicilio impreso. Vacío = se arma con el domicilio de la sucursal. */
  addressLines: string[];
  /** Teléfono impreso. `null` = el teléfono de la sucursal. */
  phone: string | null;
  email: string | null;
  website: string | null;
  /** Líneas libres extra del encabezado (van después de los datos fiscales). */
  headerLines: string[];
  /** Leyenda al pie: aviso fiscal, política de devoluciones, etc. */
  legalNotice: string | null;
  footerMessage: string;
  /**
   * Imagen del logo. Admite una URL completa o una ruta del propio dashboard
   * (`/branding/...`), que es como se sirve el logotipo de Glamouroso.
   */
  logoUrl: string | null;
  /** Arriba del nombre del negocio, al pie del ticket, o sin imprimir. */
  logoPosition: TicketLogoPosition;

  // --- Formato --------------------------------------------------------------
  fontSize: TicketFontSize;
  /** Tamaño del nombre del negocio. */
  headerSize: TicketEmphasis;
  /** Tamaño del renglón del TOTAL. */
  totalSize: TicketEmphasis;
  lineSpacing: TicketLineSpacing;
  /** Carácter con el que se dibujan las líneas divisorias. */
  separatorChar: string;

  // --- Qué se imprime -------------------------------------------------------
  showTaxData: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showItemCodes: boolean;
  showBreakdown: boolean;
  /** Renglones "Pagó con" y "Cambio". */
  showPaymentDetail: boolean;
  /** Código de barras CODE39 con el folio, al pie. */
  showFolioBarcode: boolean;

  // --- Impresión ------------------------------------------------------------
  /** Copias por venta (1 cliente, 2 con copia para la sucursal). */
  copies: number;
  /** Renglones en blanco antes del corte. */
  feedLines: number;
  cutPaper: boolean;
  /** Impresora elegida en la PC de la sucursal (la guarda el agente, nunca se hereda). */
  defaultPrinterName: string | null;
}

export const DEFAULT_TICKET_SETTINGS: TicketSettings = {
  paperWidthMm: 80,
  businessName: null,
  legalName: null,
  taxId: null,
  taxRegime: null,
  addressLines: [],
  phone: null,
  email: null,
  website: null,
  headerLines: [],
  legalNotice: null,
  footerMessage: "¡Gracias por su compra!",
  // El logotipo de Glamouroso ya convertido a negro sobre blanco para la
  // térmica (`bun run logo:ticket`). Se sirve desde el propio dashboard.
  logoUrl: "/branding/glamouroso-logo-ticket.png",
  logoPosition: "header",
  fontSize: "normal",
  headerSize: "normal",
  totalSize: "xlarge",
  lineSpacing: "normal",
  separatorChar: "-",
  showTaxData: true,
  showAddress: true,
  showPhone: true,
  showCashier: true,
  showCustomer: true,
  showItemCodes: false,
  showBreakdown: true,
  showPaymentDetail: true,
  showFolioBarcode: false,
  copies: 1,
  feedLines: 3,
  cutPaper: true,
  defaultPrinterName: null,
};

/**
 * Ticket a nivel organización: el mismo contrato sin la impresora, que es de la
 * PC de cada sucursal y nunca se hereda.
 */
export type OrganizationTicketSettings = Omit<TicketSettings, "defaultPrinterName">;

/** Defaults del POS de la organización (`brand_settings.pos`). */
export interface PosSettings {
  ticket: OrganizationTicketSettings;
  walkInCustomerName: string;
}

/** Nombre del cliente genérico de mostrador cuando la venta no se registra a nadie. */
export const DEFAULT_WALK_IN_CUSTOMER_NAME = "Mostrador";

/** Domicilio y teléfono de la sucursal, para rellenar lo que el ticket no define. */
export interface TicketBranchInfo {
  name?: string | null;
  street?: string | null;
  colony?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const lines = value
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim())
    .filter(Boolean);
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

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Enum tolerante: cualquier valor fuera de la lista cae al siguiente nivel. */
function asOption<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function asInt(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= min && rounded <= max ? rounded : null;
}

/** Un carácter visible para las divisorias; cualquier otra cosa cae al default. */
function asSeparator(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length === 1 && text !== " " ? text : null;
}

/**
 * Resuelve el ticket de una sucursal: lo que define la sucursal gana, luego el
 * default de la organización (`brand_settings.pos.ticket`) y al final el
 * default del sistema. Nunca lanza: cualquier JSONB mal formado cae al default,
 * y `null` en la sucursal significa "heredar".
 */
export function resolveTicketSettings(
  organizationPos: unknown,
  branchTicket: unknown
): TicketSettings {
  const orgTicket =
    organizationPos && typeof organizationPos === "object"
      ? ((organizationPos as Record<string, unknown>).ticket as Record<string, unknown> | undefined)
      : undefined;
  const branch = (branchTicket && typeof branchTicket === "object" ? branchTicket : {}) as Record<
    string,
    unknown
  >;
  const org = (orgTicket ?? {}) as Record<string, unknown>;
  const fallback = DEFAULT_TICKET_SETTINGS;

  const text = (key: keyof TicketSettings & string, defaultValue: string | null) =>
    asText(branch[key]) ?? asText(org[key]) ?? defaultValue;
  const flag = (key: keyof TicketSettings & string, defaultValue: boolean) =>
    asBool(branch[key]) ?? asBool(org[key]) ?? defaultValue;
  const option = <T extends string>(
    key: keyof TicketSettings & string,
    options: readonly T[],
    defaultValue: T
  ) => asOption(branch[key], options) ?? asOption(org[key], options) ?? defaultValue;

  return {
    paperWidthMm:
      asPaperWidth(branch.paperWidthMm) ?? asPaperWidth(org.paperWidthMm) ?? fallback.paperWidthMm,

    businessName: text("businessName", fallback.businessName),
    legalName: text("legalName", fallback.legalName),
    taxId: text("taxId", fallback.taxId),
    taxRegime: text("taxRegime", fallback.taxRegime),
    addressLines:
      asStringArray(branch.addressLines) ??
      asStringArray(org.addressLines) ??
      fallback.addressLines,
    phone: text("phone", fallback.phone),
    email: text("email", fallback.email),
    website: text("website", fallback.website),
    headerLines:
      asStringArray(branch.headerLines) ?? asStringArray(org.headerLines) ?? fallback.headerLines,
    legalNotice: text("legalNotice", fallback.legalNotice),
    footerMessage: text("footerMessage", fallback.footerMessage) ?? "",
    logoUrl: text("logoUrl", fallback.logoUrl),
    logoPosition: option("logoPosition", TICKET_LOGO_POSITIONS, fallback.logoPosition),

    fontSize: option("fontSize", TICKET_FONT_SIZES, fallback.fontSize),
    headerSize: option("headerSize", TICKET_EMPHASIS_SIZES, fallback.headerSize),
    totalSize: option("totalSize", TICKET_EMPHASIS_SIZES, fallback.totalSize),
    lineSpacing: option("lineSpacing", TICKET_LINE_SPACINGS, fallback.lineSpacing),
    separatorChar:
      asSeparator(branch.separatorChar) ??
      asSeparator(org.separatorChar) ??
      fallback.separatorChar,

    showTaxData: flag("showTaxData", fallback.showTaxData),
    showAddress: flag("showAddress", fallback.showAddress),
    showPhone: flag("showPhone", fallback.showPhone),
    showCashier: flag("showCashier", fallback.showCashier),
    showCustomer: flag("showCustomer", fallback.showCustomer),
    showItemCodes: flag("showItemCodes", fallback.showItemCodes),
    showBreakdown: flag("showBreakdown", fallback.showBreakdown),
    showPaymentDetail: flag("showPaymentDetail", fallback.showPaymentDetail),
    showFolioBarcode: flag("showFolioBarcode", fallback.showFolioBarcode),

    copies: asInt(branch.copies, 1, 3) ?? asInt(org.copies, 1, 3) ?? fallback.copies,
    feedLines: asInt(branch.feedLines, 0, 8) ?? asInt(org.feedLines, 0, 8) ?? fallback.feedLines,
    cutPaper: flag("cutPaper", fallback.cutPaper),

    // La impresora es de la PC de la sucursal: jamás se hereda de la organización.
    defaultPrinterName: asText(branch.defaultPrinterName),
  };
}

/** Nombre del cliente de mostrador configurado en la organización. */
export function resolveWalkInCustomerName(organizationPos: unknown): string {
  const pos = (organizationPos && typeof organizationPos === "object" ? organizationPos : {}) as Record<
    string,
    unknown
  >;
  return asText(pos.walkInCustomerName) ?? DEFAULT_WALK_IN_CUSTOMER_NAME;
}

/** Domicilio de la sucursal en dos renglones: "Calle 123, Col. Centro" / "Ciudad, CP 44100". */
export function branchAddressLines(branch: TicketBranchInfo | null | undefined): string[] {
  if (!branch) return [];
  const first = [asText(branch.street), asText(branch.colony)].filter(Boolean).join(", ");
  const postal = asText(branch.postalCode);
  const second = [asText(branch.city), postal ? `CP ${postal}` : null].filter(Boolean).join(", ");
  return [first, second].filter(Boolean);
}

/**
 * Encabezado y pie ya resueltos, para que la hoja del navegador y el ticket
 * ESC/POS impriman exactamente lo mismo.
 *
 * Los datos que el ticket no define se toman de la sucursal: así el admin captura
 * el domicilio y el teléfono una sola vez, en la sucursal, y el ticket los usa.
 */
export function ticketHeaderBlock(
  settings: TicketSettings,
  branch?: TicketBranchInfo | null
): { title: string; lines: string[] } {
  const title = settings.businessName || branch?.name || "Glamouroso";
  const lines: string[] = [];

  if (settings.showTaxData) {
    if (settings.legalName) lines.push(settings.legalName);
    if (settings.taxId) lines.push(`RFC: ${settings.taxId}`);
    if (settings.taxRegime) lines.push(settings.taxRegime);
  }
  if (settings.showAddress) {
    const address = settings.addressLines.length
      ? settings.addressLines
      : branchAddressLines(branch);
    lines.push(...address);
  }
  if (settings.showPhone) {
    const phone = settings.phone || asText(branch?.phone);
    if (phone) lines.push(`Tel. ${phone}`);
  }
  if (settings.email) lines.push(settings.email);
  if (settings.website) lines.push(settings.website);
  lines.push(...settings.headerLines);

  return { title, lines };
}

/** Renglones del pie: mensaje de agradecimiento y leyenda fiscal. */
export function ticketFooterLines(settings: TicketSettings): string[] {
  return [settings.footerMessage, settings.legalNotice].filter(
    (line): line is string => Boolean(line && line.trim())
  );
}
