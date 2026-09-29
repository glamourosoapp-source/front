import { config } from "@/config";
import { BRANCH_TYPES, RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import type { BranchHealthLevel } from "@glamouroso/shared";
import { formatQuantity } from "@/lib/format-money";

/** Etiquetas y colores compartidos por las pantallas del POS en el panel. */

export const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const RESTOCK_STATUS_LABELS: Record<string, string> = {
  [RESTOCK_ORDER_STATUS.PENDING]: "Pendiente de aprobar",
  [RESTOCK_ORDER_STATUS.APPROVED]: "Aprobado",
  [RESTOCK_ORDER_STATUS.PREPARING]: "En preparación",
  [RESTOCK_ORDER_STATUS.SENT]: "Enviado",
  [RESTOCK_ORDER_STATUS.RECEIVED]: "Recibido",
  [RESTOCK_ORDER_STATUS.CANCELLED]: "Cancelado",
};

export const RESTOCK_STATUS_COLORS: Record<
  string,
  "default" | "primary" | "warning" | "success" | "error"
> = {
  [RESTOCK_ORDER_STATUS.PENDING]: "warning",
  [RESTOCK_ORDER_STATUS.APPROVED]: "primary",
  [RESTOCK_ORDER_STATUS.PREPARING]: "primary",
  [RESTOCK_ORDER_STATUS.SENT]: "success",
  [RESTOCK_ORDER_STATUS.RECEIVED]: "success",
  [RESTOCK_ORDER_STATUS.CANCELLED]: "error",
};

export const RESTOCK_ORIGIN_LABELS: Record<string, string> = {
  [RESTOCK_ORIGIN.SHORTAGE_AUTO]: "Corte automático",
  [RESTOCK_ORIGIN.SHORTAGE_MANUAL]: "Manual",
  [RESTOCK_ORIGIN.FRANCHISE]: "Franquicia",
  [RESTOCK_ORIGIN.MANUAL_ENTRY]: "Entrada en sucursal",
};

export const HEALTH_COLORS: Record<BranchHealthLevel, string> = {
  good: "#15803d",
  warning: "#d97706",
  critical: "#c62828",
};

export const HEALTH_BG: Record<BranchHealthLevel, string> = {
  good: "#e7f6ec",
  warning: "#fff4e0",
  critical: "#fde7e7",
};

/** Copia que cambia según el tipo: la tabla y el detalle son los mismos para ambos. */
export const BRANCH_TYPE_COPY = {
  [BRANCH_TYPES.BRANCH]: {
    singular: "sucursal",
    plural: "sucursales",
    Singular: "Sucursal",
    Plural: "Sucursales",
    listHref: "/dashboard/pos/sucursales",
    kicker:
      "Cada sucursal tiene su caja, su inventario, su ticket y su día de corte de faltantes. Da clic en una para ver sus ventas, pedidos, cortes, inventario, usuarios y clientes.",
  },
  [BRANCH_TYPES.FRANCHISE]: {
    singular: "franquicia",
    plural: "franquicias",
    Singular: "Franquicia",
    Plural: "Franquicias",
    listHref: "/dashboard/franquicias",
    kicker:
      "Una franquicia levanta pedidos a fábrica con precio de mayoreo y lleva su propio inventario fuera del sistema. Da clic en una para ver sus pedidos, usuarios y datos.",
  },
} as const;

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", { dateStyle: "medium" });
}

/** "hace 3 días", "hoy", "ayer": lo que el administrador lee de un vistazo. */
export function relativeDays(value: string | null | undefined): string {
  if (!value) return "nunca";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

/** Día de negocio (YYYY-MM-DD) de un instante ISO, en la zona del negocio. */
export function businessDayOf(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

/** "Sábado, 13 de septiembre de 2026" para el encabezado de cada día. */
export function formatBusinessDayLong(dateOnly: string): string {
  if (!dateOnly) return "—";
  // Mediodía UTC: con T00:00:00Z el día se recorría hacia atrás al formatear.
  const label = new Date(`${dateOnly}T12:00:00Z`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
  // Solo la inicial: `text-transform: capitalize` en CSS dejaba "13 De
  // Septiembre De 2026", con las preposiciones en mayúscula.
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Hora del ticket en la zona del negocio: "10:18 a.m.". */
export function formatBusinessTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
}

/** Hoy en la zona del negocio (la misma que usan cortes y reportes). */
export function todayInMexico(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

export function shiftDateOnly(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Viernes de la semana del punto de venta que contiene la fecha. En el POS la
 * semana va de **viernes a jueves** (el pedido a fábrica sale el jueves); los
 * pedidos del CRM usan otra, de sábado a viernes. Misma regla que
 * `posWeekStart` en `Back/src/utils/business-week.util.ts`: las claves de
 * semana que manda el Back deben coincidir con las que arma el cliente.
 */
export function posWeekStart(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  const diff = (date.getUTCDay() + 2) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

const PACK_PLURALS: Record<string, string> = {
  bidón: "bidones",
  garrafa: "garrafas",
  caja: "cajas",
  bolsa: "bolsas",
  paquete: "paquetes",
  pieza: "piezas",
};

/**
 * Nombre del empaque de una partida o faltante: "bidón"/"bidones",
 * "caja"/"cajas", "pieza"/"piezas". Si el Back manda `packLabel` (bidón,
 * garrafa, caja, bolsa…) se usa ese; si no, sale de `unit`.
 */
export function unitLabel(quantity: number, unit: string, packLabel?: string | null): string {
  const singular =
    packLabel?.trim().toLowerCase() || (unit === "bidon" ? "bidón" : unit === "paquete" ? "caja" : "pieza");
  const plural =
    PACK_PLURALS[singular] ?? (singular.endsWith("ón") ? `${singular.slice(0, -2)}ones` : `${singular}s`);
  return quantity === 1 ? singular : plural;
}

/** "cajas × 24", "bidones", "pieza": el empaque y, si trae más de una pieza, cuántas. */
export function packUnitLabel(
  quantity: number,
  unit: string,
  unitsPerPackage?: string | number | null,
  packLabel?: string | null
): string {
  const perPack = Number(unitsPerPackage ?? 0);
  const label = unitLabel(quantity, unit, packLabel);
  return unit !== "bidon" && perPack > 1 ? `${label} × ${formatQuantity(perPack)}` : label;
}

/** "2 cajas × 24", "3 bidones", "5 piezas": la cantidad con su empaque y las piezas que trae. */
export function packQtyLabel(
  quantity: number,
  unit: string,
  unitsPerPackage?: string | number | null,
  packLabel?: string | null
): string {
  return `${formatQuantity(quantity)} ${packUnitLabel(quantity, unit, unitsPerPackage, packLabel)}`;
}

/**
 * Importe de una partida de franquicia: el precio de mayoreo congelado es POR
 * PIEZA (o por bidón), y la cantidad son empaques, así que una caja × 24 vale
 * `qty × 24 × precio`. `quantity` permite valuar lo despachado en vez de lo pedido.
 */
/** Hoja de un pedido de surtido: cómo quedó (`edit` = editar lo que se envía). */
export function restockOrderSheetHref(orderId: string, edit = false): string {
  return `/dashboard/pos/surtido/pedidos/${orderId}${edit ? "?modo=editar" : ""}`;
}

/**
 * Aviso al aprobar un pedido. Con el módulo de fábrica apagado nadie "lo ve"
 * en la tablet: el pedido espera a que el panel lo marque como enviado.
 */
export function approvedRestockMessage(prefix = "Pedido aprobado"): string {
  return config.factoryModuleEnabled
    ? `${prefix}: fábrica ya lo ve`
    : `${prefix}. Cuando salga de fábrica, márcalo como enviado a la sucursal`;
}

export function restockItemAmount(
  item: { unit: string; unitPrice?: string | number | null; unitsPerPackage?: string | number | null },
  quantity: string | number | null | undefined
): number {
  const perPack = item.unit === "bidon" ? 1 : Number(item.unitsPerPackage ?? 1) || 1;
  return Number(item.unitPrice ?? 0) * Number(quantity ?? 0) * perPack;
}

/** Totales de una lista de faltantes por tipo de empaque, para la barra "X bidones · Y cajas · Z piezas". */
export function packTotals(rows: Array<{ unit: string; requestedQty: number }>): {
  bidones: number;
  cajas: number;
  piezas: number;
} {
  const totals = { bidones: 0, cajas: 0, piezas: 0 };
  for (const row of rows) {
    if (row.unit === "bidon") totals.bidones += row.requestedQty;
    else if (row.unit === "paquete") totals.cajas += row.requestedQty;
    else totals.piezas += row.requestedQty;
  }
  return totals;
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** "18 sep – 24 sep" (o "28 ago – 3 sep"); el año solo si cambia entre extremos. */
export function formatDateOnlyRange(from: string, to: string): string {
  const part = (d: string, withYear: boolean) =>
    `${Number(d.slice(8, 10))} ${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}${withYear ? ` ${d.slice(0, 4)}` : ""}`;
  const crossYear = from.slice(0, 4) !== to.slice(0, 4);
  return `${part(from, crossYear)} – ${part(to, crossYear)}`;
}

/**
 * Qué fechas abarca cada tarjeta del resumen de ventas. Mismos periodos que
 * `branch-overview.service.ts` en el Back: semana vie–jue, mes calendario y
 * últimos 30 días contando hoy.
 */
export function salesPeriodLabels(today: string = todayInMexico()) {
  const weekStart = posWeekStart(today);
  return {
    today: formatBusinessDayLong(today).replace(/ de \d{4}$/, ""),
    week: formatDateOnlyRange(weekStart, shiftDateOnly(weekStart, 6)),
    month: `${MONTHS_LONG[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`,
    last30: formatDateOnlyRange(shiftDateOnly(today, -29), today),
  };
}
