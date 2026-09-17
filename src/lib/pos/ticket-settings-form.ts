import type {
  OrganizationTicketSettings,
  TicketEmphasis,
  TicketLogoPosition,
  TicketFontSize,
  TicketLineSpacing,
  TicketPaperWidth,
  TicketSettings,
} from "@glamouroso/shared";

/**
 * Puente entre `TicketSettings` (lo que resuelve el servidor) y el formulario
 * del panel.
 *
 * El borrador guarda siempre los **valores efectivos**: los textos como strings
 * y los arreglos como texto de varios renglones. Lo que decide si una sucursal
 * personaliza o hereda es el grupo, no el campo: un grupo apagado manda `null`
 * en todas sus claves, y el resolutor del servidor trata `null` como "heredar".
 */

export interface TicketDraft {
  paperWidthMm: TicketPaperWidth;

  businessName: string;
  legalName: string;
  taxId: string;
  taxRegime: string;
  /** Un renglón del domicilio por línea. */
  addressLines: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  logoPosition: TicketLogoPosition;

  /** Líneas libres del encabezado, una por renglón. */
  headerLines: string;
  footerMessage: string;
  legalNotice: string;

  fontSize: TicketFontSize;
  headerSize: TicketEmphasis;
  totalSize: TicketEmphasis;
  lineSpacing: TicketLineSpacing;
  separatorChar: string;

  showTaxData: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showItemCodes: boolean;
  showBreakdown: boolean;
  showPaymentDetail: boolean;
  showFolioBarcode: boolean;

  copies: number;
  feedLines: number;
  cutPaper: boolean;
}

export type TicketGroupKey = "negocio" | "textos" | "formato" | "contenido" | "impresion";

/** Qué campos viajan en cada grupo: apagar el grupo los manda todos en `null`. */
export const TICKET_GROUP_FIELDS: Record<TicketGroupKey, Array<keyof TicketDraft>> = {
  negocio: [
    "businessName",
    "legalName",
    "taxId",
    "taxRegime",
    "addressLines",
    "phone",
    "email",
    "website",
    "logoUrl",
    "logoPosition",
  ],
  textos: ["headerLines", "footerMessage", "legalNotice"],
  formato: ["paperWidthMm", "fontSize", "headerSize", "totalSize", "lineSpacing", "separatorChar"],
  contenido: [
    "showTaxData",
    "showAddress",
    "showPhone",
    "showCashier",
    "showCustomer",
    "showItemCodes",
    "showBreakdown",
    "showPaymentDetail",
    "showFolioBarcode",
  ],
  impresion: ["copies", "feedLines", "cutPaper"],
};

export const TICKET_GROUPS: Array<{ key: TicketGroupKey; title: string; description: string }> = [
  {
    key: "negocio",
    title: "Datos del negocio y facturación",
    description:
      "Lo que va arriba del ticket: nombre, razón social, RFC, domicilio y teléfono. Lo que dejes vacío se toma del domicilio y el teléfono de la sucursal.",
  },
  {
    key: "textos",
    title: "Textos del ticket",
    description: "Líneas libres del encabezado, mensaje de despedida y leyenda legal del pie.",
  },
  {
    key: "formato",
    title: "Papel y tamaño de letra",
    description: "Ancho del rollo, tamaño de la letra, del nombre del negocio y del total.",
  },
  {
    key: "contenido",
    title: "Qué se imprime",
    description: "Bloques que aparecen o se omiten en el ticket.",
  },
  {
    key: "impresion",
    title: "Impresión",
    description: "Copias por venta, avance de papel y corte automático.",
  },
];

export type TicketGroupState = Record<TicketGroupKey, boolean>;

const ALL_OFF: TicketGroupState = {
  negocio: false,
  textos: false,
  formato: false,
  contenido: false,
  impresion: false,
};

function textOf(value: string | null): string {
  return value ?? "";
}

/**
 * Borrador a partir del ticket ya resuelto (el de la organización, o el de una
 * sucursal con su herencia aplicada). La impresora no entra: no se edita aquí.
 */
export function draftFromSettings(settings: OrganizationTicketSettings): TicketDraft {
  return {
    paperWidthMm: settings.paperWidthMm,
    businessName: textOf(settings.businessName),
    legalName: textOf(settings.legalName),
    taxId: textOf(settings.taxId),
    taxRegime: textOf(settings.taxRegime),
    addressLines: settings.addressLines.join("\n"),
    phone: textOf(settings.phone),
    email: textOf(settings.email),
    website: textOf(settings.website),
    logoUrl: textOf(settings.logoUrl),
    logoPosition: settings.logoPosition,
    headerLines: settings.headerLines.join("\n"),
    footerMessage: settings.footerMessage,
    legalNotice: textOf(settings.legalNotice),
    fontSize: settings.fontSize,
    headerSize: settings.headerSize,
    totalSize: settings.totalSize,
    lineSpacing: settings.lineSpacing,
    separatorChar: settings.separatorChar,
    showTaxData: settings.showTaxData,
    showAddress: settings.showAddress,
    showPhone: settings.showPhone,
    showCashier: settings.showCashier,
    showCustomer: settings.showCustomer,
    showItemCodes: settings.showItemCodes,
    showBreakdown: settings.showBreakdown,
    showPaymentDetail: settings.showPaymentDetail,
    showFolioBarcode: settings.showFolioBarcode,
    copies: settings.copies,
    feedLines: settings.feedLines,
    cutPaper: settings.cutPaper,
  };
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Ticket que resultaría del borrador, para la vista previa sin ir al servidor.
 * La impresora no se edita aquí: la guarda la PC de la sucursal.
 */
export function settingsFromDraft(draft: TicketDraft): TicketSettings {
  const text = (value: string) => (value.trim() ? value.trim() : null);
  return {
    paperWidthMm: draft.paperWidthMm,
    businessName: text(draft.businessName),
    legalName: text(draft.legalName),
    taxId: text(draft.taxId),
    taxRegime: text(draft.taxRegime),
    addressLines: lines(draft.addressLines),
    phone: text(draft.phone),
    email: text(draft.email),
    website: text(draft.website),
    logoUrl: text(draft.logoUrl),
    logoPosition: draft.logoPosition,
    headerLines: lines(draft.headerLines),
    footerMessage: draft.footerMessage.trim(),
    legalNotice: text(draft.legalNotice),
    fontSize: draft.fontSize,
    headerSize: draft.headerSize,
    totalSize: draft.totalSize,
    lineSpacing: draft.lineSpacing,
    separatorChar: draft.separatorChar || "-",
    showTaxData: draft.showTaxData,
    showAddress: draft.showAddress,
    showPhone: draft.showPhone,
    showCashier: draft.showCashier,
    showCustomer: draft.showCustomer,
    showItemCodes: draft.showItemCodes,
    showBreakdown: draft.showBreakdown,
    showPaymentDetail: draft.showPaymentDetail,
    showFolioBarcode: draft.showFolioBarcode,
    copies: draft.copies,
    feedLines: draft.feedLines,
    cutPaper: draft.cutPaper,
    defaultPrinterName: null,
  };
}

/** Valor de una clave listo para el JSONB (los arreglos se parten por renglón). */
function valueFor(draft: TicketDraft, field: keyof TicketDraft): unknown {
  const value = draft[field];
  if (field === "addressLines" || field === "headerLines") return lines(value as string);
  if (typeof value === "string") return value.trim();
  return value;
}

/**
 * Cuerpo de `PUT /settings/pos`: todo el ticket de la organización.
 * Es el nivel base, así que no hay nada que heredar.
 */
export function organizationPayload(draft: TicketDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const fields of Object.values(TICKET_GROUP_FIELDS)) {
    for (const field of fields) payload[field] = valueFor(draft, field);
  }
  return payload;
}

/**
 * Cuerpo de `PUT /pos/branches/:id/ticket-settings`.
 *
 * Los grupos apagados van con `null` campo por campo: así el merge del servidor
 * **borra** el override anterior y la sucursal vuelve a heredar, en vez de
 * quedarse con el valor viejo.
 */
export function branchPayload(
  draft: TicketDraft,
  groups: TicketGroupState
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, fields] of Object.entries(TICKET_GROUP_FIELDS) as Array<
    [TicketGroupKey, Array<keyof TicketDraft>]
  >) {
    for (const field of fields) {
      payload[field] = groups[key] ? valueFor(draft, field) : null;
    }
  }
  return payload;
}

/**
 * Qué grupos personaliza hoy la sucursal: los que tienen al menos una clave
 * guardada con valor propio (`null` y ausente cuentan como heredado).
 */
export function groupsFromRaw(raw: Record<string, unknown> | null | undefined): TicketGroupState {
  const stored = raw ?? {};
  const state = { ...ALL_OFF };
  for (const [key, fields] of Object.entries(TICKET_GROUP_FIELDS) as Array<
    [TicketGroupKey, Array<keyof TicketDraft>]
  >) {
    state[key] = fields.some((field) => {
      const value = stored[field];
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "string") return value.trim().length > 0;
      return true;
    });
  }
  return state;
}

export const TICKET_FONT_SIZE_LABELS: Record<TicketFontSize, string> = {
  small: "Chica (más renglones por ticket)",
  normal: "Normal",
  large: "Grande (más legible)",
};

export const TICKET_EMPHASIS_LABELS: Record<TicketEmphasis, string> = {
  normal: "Igual que el texto",
  large: "Grande",
  xlarge: "Muy grande",
};

export const TICKET_LINE_SPACING_LABELS: Record<TicketLineSpacing, string> = {
  tight: "Junta (ahorra papel)",
  normal: "Normal",
  loose: "Separada",
};

export const TICKET_CONTENT_LABELS: Array<{ field: keyof TicketDraft; label: string; hint: string }> = [
  { field: "showTaxData", label: "Datos fiscales", hint: "Razón social, RFC y régimen." },
  { field: "showAddress", label: "Domicilio", hint: "El del ticket o, si está vacío, el de la sucursal." },
  { field: "showPhone", label: "Teléfono", hint: "El del ticket o el de la sucursal." },
  { field: "showCashier", label: "Quién atiende", hint: "Nombre del cajero que cobró." },
  { field: "showCustomer", label: "Cliente", hint: "Nombre del cliente o el de mostrador." },
  { field: "showItemCodes", label: "Código del producto", hint: "El SKU antes del nombre de cada partida." },
  { field: "showBreakdown", label: "Desglose del granel", hint: "\"1 bidón × $178 + 5 L × $16\"." },
  { field: "showPaymentDetail", label: "Pagó con y cambio", hint: "Útil para que el cliente verifique el cambio." },
  { field: "showFolioBarcode", label: "Código de barras del folio", hint: "Para escanear el ticket en devoluciones." },
];

export const TICKET_LOGO_POSITION_LABELS: Record<TicketLogoPosition, string> = {
  header: "Arriba, antes del nombre del negocio",
  footer: "Abajo, junto al mensaje final",
  none: "No imprimir el logo",
};

/** Logotipo de Glamouroso ya listo para térmica (`bun run logo:ticket`). */
export const GLAMOUROSO_TICKET_LOGO = "/branding/glamouroso-logo-ticket.png";
