// MANTENER EN SYNC: este archivo se duplica en Front/shared/src/utils/delivery-schedule.ts
// y en Agent/agent/lib/delivery-schedule.ts. Cualquier cambio debe replicarse en los tres.

/** Regla específica de un día de la semana; lo no definido cae al corte/offsets generales. */
export interface DayScheduleOverride {
  cutoffTime?: string;
  offsetBeforeCutoffDays?: number;
  offsetAfterCutoffDays?: number;
}

export const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface DeliveryScheduleConfig {
  /** Hora de corte "HH:mm" en la timezone del negocio. El corte es inclusivo: >= cutoff aplica el offset "después". */
  cutoffTime: string;
  offsetBeforeCutoffDays: number;
  offsetAfterCutoffDays: number;
  timezone: string;
  skipSundays: boolean;
  /** Reglas por día de la semana (del pedido) que pisan el corte/offsets generales. */
  dayOverrides: Partial<Record<WeekdayKey, DayScheduleOverride>>;
}

const CUTOFF_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_DELIVERY_SCHEDULE: DeliveryScheduleConfig = {
  cutoffTime: "15:00",
  offsetBeforeCutoffDays: 1,
  offsetAfterCutoffDays: 2,
  timezone: "America/Mexico_City",
  skipSundays: true,
  // Regla de fin de semana del negocio: el sábado corta a las 14:00 (antes → lunes,
  // después → martes) y todo pedido registrado en domingo sale el martes.
  dayOverrides: {
    saturday: { cutoffTime: "14:00", offsetBeforeCutoffDays: 2, offsetAfterCutoffDays: 3 },
    sunday: { offsetBeforeCutoffDays: 2, offsetAfterCutoffDays: 2 },
  },
};

function sanitizeDayOverride(raw: unknown): DayScheduleOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: DayScheduleOverride = {};
  if (typeof r.cutoffTime === "string" && CUTOFF_RE.test(r.cutoffTime)) {
    out.cutoffTime = r.cutoffTime;
  }
  if (
    typeof r.offsetBeforeCutoffDays === "number" &&
    Number.isInteger(r.offsetBeforeCutoffDays) &&
    r.offsetBeforeCutoffDays >= 0
  ) {
    out.offsetBeforeCutoffDays = r.offsetBeforeCutoffDays;
  }
  if (
    typeof r.offsetAfterCutoffDays === "number" &&
    Number.isInteger(r.offsetAfterCutoffDays) &&
    r.offsetAfterCutoffDays >= 0
  ) {
    out.offsetAfterCutoffDays = r.offsetAfterCutoffDays;
  }
  return Object.keys(out).length ? out : null;
}

/** Merge tolerante de brand_settings.delivery (JSON libre) sobre los defaults. */
export function resolveDeliveryScheduleConfig(raw: unknown): DeliveryScheduleConfig {
  const cfg = {
    ...DEFAULT_DELIVERY_SCHEDULE,
    dayOverrides: { ...DEFAULT_DELIVERY_SCHEDULE.dayOverrides },
  };
  if (!raw || typeof raw !== "object") return cfg;
  const r = raw as Record<string, unknown>;
  if (typeof r.cutoffTime === "string" && CUTOFF_RE.test(r.cutoffTime)) {
    cfg.cutoffTime = r.cutoffTime;
  }
  if (typeof r.offsetBeforeCutoffDays === "number" && Number.isInteger(r.offsetBeforeCutoffDays) && r.offsetBeforeCutoffDays >= 0) {
    cfg.offsetBeforeCutoffDays = r.offsetBeforeCutoffDays;
  }
  if (typeof r.offsetAfterCutoffDays === "number" && Number.isInteger(r.offsetAfterCutoffDays) && r.offsetAfterCutoffDays >= 0) {
    cfg.offsetAfterCutoffDays = r.offsetAfterCutoffDays;
  }
  if (typeof r.timezone === "string" && r.timezone.trim()) cfg.timezone = r.timezone.trim();
  if (typeof r.skipSundays === "boolean") cfg.skipSundays = r.skipSundays;
  if (r.dayOverrides && typeof r.dayOverrides === "object") {
    // Por día: null elimina la regla default de ese día; un objeto válido la reemplaza.
    const rawOverrides = r.dayOverrides as Record<string, unknown>;
    for (const day of WEEKDAY_KEYS) {
      if (!(day in rawOverrides)) continue;
      if (rawOverrides[day] === null) {
        delete cfg.dayOverrides[day];
        continue;
      }
      const sanitized = sanitizeDayOverride(rawOverrides[day]);
      if (sanitized) cfg.dayOverrides[day] = sanitized;
    }
  }
  return cfg;
}

export function civilDateAndMinutes(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    minutes: get("hour") * 60 + get("minute"),
  };
}

/**
 * Fecha de entrega "YYYY-MM-DD" para un pedido recibido en `now`, evaluando la
 * hora de corte en la timezone del negocio (nunca la del servidor). El día de la
 * semana del pedido puede tener su propia regla vía `dayOverrides`.
 */
export function computeScheduledDeliveryDate(
  now: Date,
  config?: Partial<DeliveryScheduleConfig> | null
): string {
  const cfg = { ...DEFAULT_DELIVERY_SCHEDULE, ...(config ?? {}) };
  const { year, month, day, minutes } = civilDateAndMinutes(now, cfg.timezone);
  // getUTCDay() siempre es 0..6, pero tsconfigs con noUncheckedIndexedAccess no lo saben.
  const weekday = WEEKDAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] as WeekdayKey;
  const override = cfg.dayOverrides?.[weekday] ?? {};
  const cutoff = override.cutoffTime ?? cfg.cutoffTime;
  const beforeDays = override.offsetBeforeCutoffDays ?? cfg.offsetBeforeCutoffDays;
  const afterDays = override.offsetAfterCutoffDays ?? cfg.offsetAfterCutoffDays;
  const [ch = 0, cm = 0] = cutoff.split(":").map(Number);
  const offset = minutes >= ch * 60 + cm ? afterDays : beforeDays;

  // Aritmética sobre la fecha civil pura en UTC: inmune a DST.
  const result = new Date(Date.UTC(year, month - 1, day + offset));
  if (cfg.skipSundays && result.getUTCDay() === 0) {
    result.setUTCDate(result.getUTCDate() + 1);
  }
  const y = result.getUTCFullYear();
  const m = String(result.getUTCMonth() + 1).padStart(2, "0");
  const d = String(result.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
