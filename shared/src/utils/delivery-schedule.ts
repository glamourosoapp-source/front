// MANTENER EN SYNC: este archivo se duplica en Front/shared/src/utils/delivery-schedule.ts
// y en Agent/agent/lib/delivery-schedule.ts. Cualquier cambio debe replicarse en los tres.

export interface DeliveryScheduleConfig {
  /** Hora de corte "HH:mm" en la timezone del negocio. El corte es inclusivo: >= cutoff aplica el offset "después". */
  cutoffTime: string;
  offsetBeforeCutoffDays: number;
  offsetAfterCutoffDays: number;
  timezone: string;
  skipSundays: boolean;
}

export const DEFAULT_DELIVERY_SCHEDULE: DeliveryScheduleConfig = {
  cutoffTime: "15:00",
  offsetBeforeCutoffDays: 1,
  offsetAfterCutoffDays: 2,
  timezone: "America/Mexico_City",
  skipSundays: true,
};

/** Merge tolerante de brand_settings.delivery (JSON libre) sobre los defaults. */
export function resolveDeliveryScheduleConfig(raw: unknown): DeliveryScheduleConfig {
  const cfg = { ...DEFAULT_DELIVERY_SCHEDULE };
  if (!raw || typeof raw !== "object") return cfg;
  const r = raw as Record<string, unknown>;
  if (typeof r.cutoffTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.cutoffTime)) {
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
  return cfg;
}

function civilDateAndMinutes(now: Date, timeZone: string) {
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
 * hora de corte en la timezone del negocio (nunca la del servidor).
 */
export function computeScheduledDeliveryDate(
  now: Date,
  config?: Partial<DeliveryScheduleConfig> | null
): string {
  const cfg = { ...DEFAULT_DELIVERY_SCHEDULE, ...(config ?? {}) };
  const { year, month, day, minutes } = civilDateAndMinutes(now, cfg.timezone);
  const [ch = 0, cm = 0] = cfg.cutoffTime.split(":").map(Number);
  const offset = minutes >= ch * 60 + cm ? cfg.offsetAfterCutoffDays : cfg.offsetBeforeCutoffDays;

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
