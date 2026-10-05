import { civilDateAndMinutes, WEEKDAY_KEYS, type WeekdayKey } from "./utils/delivery-schedule";

/**
 * Apertura y cierre de tienda (2026-10-04, decisiones del negocio):
 *
 * - Lo primero del día en la caja es "Abrir tienda": sin eso no se cobra.
 * - "Cerré la tienda" bloquea la caja hasta el día siguiente; el cajero puede
 *   reabrir ese mismo día y queda registrado.
 * - La hora la pone el sistema (el clic), también sin internet: viaja por la
 *   cola de la caja como cualquier venta.
 * - Cada sucursal tiene horario por día de la semana; el panel marca abrió
 *   tarde, cerró temprano, no abrió y sin cierre, con 15 min de tolerancia.
 *
 * Funciones puras: las usan la caja (¿está abierta hoy?), el back y el panel
 * (marcas del día). Detalle: docs/product-specs/pos-apertura-cierre.md
 */

export const STORE_EVENT_KINDS = {
  OPENED: "opened",
  CLOSED: "closed",
} as const;

export type StoreEventKind = (typeof STORE_EVENT_KINDS)[keyof typeof STORE_EVENT_KINDS];

/** Minutos de gracia antes de marcar "abrió tarde" o "cerró temprano". */
export const STORE_HOURS_TOLERANCE_MINUTES = 15;

/** Horario de un día: "HH:mm" en la zona de la organización. */
export interface StoreDayHours {
  open: string;
  close: string;
}

/** Horario semanal de una sucursal; `null` o ausente = ese día no abre. */
export type BranchOpeningHours = Partial<Record<WeekdayKey, StoreDayHours | null>>;

export interface StoreEventLike {
  kind: StoreEventKind;
  occurredAt: string;
}

export type StoreDayStatus = "not_opened" | "open" | "closed";

export type StoreDayFlagCode = "not_opened" | "late_open" | "early_close" | "no_close";

export interface StoreDayFlag {
  code: StoreDayFlagCode;
  label: string;
  /** Minutos de diferencia contra el horario (tarde / temprano). */
  minutes?: number;
}

export interface StoreDayEvaluation {
  /** "YYYY-MM-DD" del día de negocio. */
  date: string;
  status: StoreDayStatus;
  /** Primera apertura del día (ISO). */
  openedAt: string | null;
  /** Último cierre, solo si la tienda quedó cerrada (ISO). */
  closedAt: string | null;
  /** Veces que se reabrió después de cerrar. */
  reopenCount: number;
  /** Horario de ese día, o `null` si no abre. */
  hours: StoreDayHours | null;
  /** false = la sucursal no tiene ningún horario capturado (no es descanso). */
  hasSchedule: boolean;
  flags: StoreDayFlag[];
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidStoreTime(value: unknown): value is string {
  return typeof value === "string" && HHMM.test(value);
}

export function storeTimeToMinutes(value: string): number {
  const match = HHMM.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Día de la semana de una fecha civil "YYYY-MM-DD". */
export function weekdayOfDate(date: string): WeekdayKey {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAY_KEYS[new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay()]!;
}

/** Fecha civil "YYYY-MM-DD" de un instante en la zona dada. */
export function storeCivilDate(at: Date, timeZone: string): string {
  const { year, month, day } = civilDateAndMinutes(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Horario de ese día; descarta horarios mal formados (cierre antes de abrir). */
export function storeHoursFor(hours: BranchOpeningHours | null | undefined, date: string): StoreDayHours | null {
  const day = hours?.[weekdayOfDate(date)];
  if (!day || !isValidStoreTime(day.open) || !isValidStoreTime(day.close)) return null;
  if (storeTimeToMinutes(day.close) <= storeTimeToMinutes(day.open)) return null;
  return { open: day.open, close: day.close };
}

/**
 * Estado del día con sus eventos: abierta si el último evento es una apertura,
 * cerrada si es un cierre, sin abrir si no hay eventos.
 */
export function storeDayStatus(events: StoreEventLike[]): StoreDayStatus {
  if (!events.length) return "not_opened";
  const last = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)!;
  return last.kind === STORE_EVENT_KINDS.OPENED ? "open" : "closed";
}

function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

/**
 * Evalúa un día de una sucursal contra su horario.
 *
 * - `not_opened`: le tocaba abrir y no abrió (hoy, solo después de la hora de
 *   apertura + tolerancia).
 * - `late_open`: la primera apertura fue después de la hora + tolerancia.
 * - `early_close`: quedó cerrada antes de la hora de cierre − tolerancia.
 * - `no_close`: quedó abierta y ya pasó el día (o, hoy, la hora de cierre +
 *   tolerancia).
 *
 * Un día sin horario (descanso) no marca nada salvo `no_close` de días pasados.
 */
export function evaluateStoreDay(input: {
  date: string;
  events: StoreEventLike[];
  hours: BranchOpeningHours | null | undefined;
  timeZone: string;
  now?: Date;
  toleranceMinutes?: number;
}): StoreDayEvaluation {
  const { date, timeZone } = input;
  const now = input.now ?? new Date();
  const tolerance = input.toleranceMinutes ?? STORE_HOURS_TOLERANCE_MINUTES;
  const events = [...input.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const hours = storeHoursFor(input.hours, date);
  const hasSchedule = WEEKDAY_KEYS.some((day) => {
    const value = input.hours?.[day];
    return Boolean(value && isValidStoreTime(value.open) && isValidStoreTime(value.close));
  });
  const status = storeDayStatus(events);

  const opens = events.filter((event) => event.kind === STORE_EVENT_KINDS.OPENED);
  const closes = events.filter((event) => event.kind === STORE_EVENT_KINDS.CLOSED);
  const openedAt = opens[0]?.occurredAt ?? null;
  const closedAt = status === "closed" ? (closes.at(-1)?.occurredAt ?? null) : null;
  const reopenCount = Math.max(0, opens.length - 1);

  const today = storeCivilDate(now, timeZone);
  const isPast = date < today;
  const isToday = date === today;
  const nowMinutes = civilDateAndMinutes(now, timeZone).minutes;
  const minutesOf = (iso: string) => civilDateAndMinutes(new Date(iso), timeZone).minutes;

  const flags: StoreDayFlag[] = [];
  if (hours) {
    const openAt = storeTimeToMinutes(hours.open);
    const closeAt = storeTimeToMinutes(hours.close);
    if (!openedAt) {
      if (isPast || (isToday && nowMinutes > openAt + tolerance)) {
        flags.push({ code: "not_opened", label: "No abrió" });
      }
    } else {
      const late = minutesOf(openedAt) - openAt;
      if (late > tolerance) flags.push({ code: "late_open", label: `Abrió ${formatMinutes(late)} tarde`, minutes: late });
      if (closedAt) {
        // Cerrar pasada la medianoche nunca es "temprano".
        const sameDay = storeCivilDate(new Date(closedAt), timeZone) === date;
        const early = sameDay ? closeAt - minutesOf(closedAt) : 0;
        if (early > tolerance) {
          flags.push({ code: "early_close", label: `Cerró ${formatMinutes(early)} antes`, minutes: early });
        }
      } else if (isPast || (isToday && nowMinutes > closeAt + tolerance)) {
        flags.push({ code: "no_close", label: "Sin cierre" });
      }
    }
  } else if (openedAt && !closedAt && isPast) {
    flags.push({ code: "no_close", label: "Sin cierre" });
  }

  return { date, status, openedAt, closedAt, reopenCount, hours, hasSchedule, flags };
}

/** Un evento del día como lo ve el panel: quién y a qué hora. */
export interface StoreEventView {
  kind: StoreEventKind;
  occurredAt: string;
  recordedOffline: boolean;
  user: { id: string; name: string } | null;
}

/** Día del historial de aperturas y cierres (`GET /pos/branches/:id/store-days`). */
export interface StoreDayView extends StoreDayEvaluation {
  events: StoreEventView[];
}
