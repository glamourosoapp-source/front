import { BRANCH_TYPES, RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import type { BranchHealthLevel } from "@glamouroso/shared";

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

/** Sábado de la semana de negocio que contiene la fecha (la semana va sáb→vie). */
export function businessWeekStart(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  const diff = (date.getUTCDay() + 1) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

export function unitLabel(quantity: number, unit: string): string {
  if (unit === "bidon") return quantity === 1 ? "bidón" : "bidones";
  return quantity === 1 ? "pieza" : "piezas";
}
