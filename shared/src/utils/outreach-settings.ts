/**
 * Configuración del guardián de outbound (envíos fríos de WhatsApp).
 *
 * Vive en `organizations.brand_settings.outreach` (JSONB compartido: al
 * escribir SIEMPRE merge, nunca reemplazo). Este resolver aplica defaults
 * seguros para que el Back y el Front interpreten la config igual.
 *
 * El warm-up protege el quality rating de Meta: un número nuevo (o que nunca
 * ha hecho envíos fríos) arranca con un cupo diario bajo que crece semana a
 * semana hasta el tope configurado.
 */

export interface OutreachWarmupConfig {
  enabled: boolean;
  /** Cupo diario de la primera semana de envíos fríos. */
  startCap: number;
  /** Cuánto crece el cupo diario por semana transcurrida. */
  weeklyIncrease: number;
  /** Tope del cupo diario una vez completado el warm-up. */
  maxCap: number;
}

/** Ventana local (horas 0-23) en la que NO se despachan envíos fríos. */
export interface OutreachQuietHours {
  /** Hora local a la que dejan de salir mensajes (inclusive). */
  start: number;
  /** Hora local a la que vuelven a salir mensajes. */
  end: number;
}

export interface OutreachFollowupConfig {
  /** Días de espera tras un toque sin respuesta antes de sugerir seguimiento. */
  waitDays: number;
  /** Toques totales máximos (primer contacto incluido) antes de agotar el prospecto. */
  maxTouches: number;
}

export interface OutreachSettings {
  /** Tope duro de envíos fríos por día (el warm-up puede reducirlo). */
  dailyCap: number;
  /** Máximo de envíos fríos por minuto (se reparte con jitter). */
  perMinuteCap: number;
  warmup: OutreachWarmupConfig;
  quietHours: OutreachQuietHours;
  followup: OutreachFollowupConfig;
  /** Pausa total de envíos fríos (manual o por el circuit breaker). */
  paused: boolean;
  /** Motivo legible de la pausa (breaker, manual, calidad). */
  pausedReason: string | null;
  /**
   * Offset de zona horaria local en minutos vs UTC (México centro: -360).
   * México eliminó el horario de verano en 2022, así que es constante.
   */
  timezoneOffsetMinutes: number;
}

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  dailyCap: 250,
  perMinuteCap: 6,
  warmup: { enabled: true, startCap: 20, weeklyIncrease: 25, maxCap: 250 },
  quietHours: { start: 20, end: 9 },
  followup: { waitDays: 3, maxTouches: 2 },
  paused: false,
  pausedReason: null,
  timezoneOffsetMinutes: -360,
};

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Aplica defaults campo a campo sobre lo guardado en brand_settings.outreach. */
export function resolveOutreachSettings(raw: unknown): OutreachSettings {
  const d = DEFAULT_OUTREACH_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d, warmup: { ...d.warmup }, quietHours: { ...d.quietHours }, followup: { ...d.followup } };
  const r = raw as Record<string, unknown>;
  const warmup = (r.warmup && typeof r.warmup === "object" ? r.warmup : {}) as Record<string, unknown>;
  const quiet = (r.quietHours && typeof r.quietHours === "object" ? r.quietHours : {}) as Record<string, unknown>;
  const followup = (r.followup && typeof r.followup === "object" ? r.followup : {}) as Record<string, unknown>;
  return {
    dailyCap: Math.max(1, asNumber(r.dailyCap, d.dailyCap)),
    perMinuteCap: Math.max(1, asNumber(r.perMinuteCap, d.perMinuteCap)),
    warmup: {
      enabled: asBoolean(warmup.enabled, d.warmup.enabled),
      startCap: Math.max(1, asNumber(warmup.startCap, d.warmup.startCap)),
      weeklyIncrease: Math.max(0, asNumber(warmup.weeklyIncrease, d.warmup.weeklyIncrease)),
      maxCap: Math.max(1, asNumber(warmup.maxCap, d.warmup.maxCap)),
    },
    quietHours: {
      start: Math.min(23, Math.max(0, asNumber(quiet.start, d.quietHours.start))),
      end: Math.min(23, Math.max(0, asNumber(quiet.end, d.quietHours.end))),
    },
    followup: {
      waitDays: Math.max(1, asNumber(followup.waitDays, d.followup.waitDays)),
      maxTouches: Math.max(1, asNumber(followup.maxTouches, d.followup.maxTouches)),
    },
    paused: asBoolean(r.paused, d.paused),
    pausedReason: typeof r.pausedReason === "string" && r.pausedReason ? r.pausedReason : null,
    timezoneOffsetMinutes: asNumber(r.timezoneOffsetMinutes, d.timezoneOffsetMinutes),
  };
}

/**
 * Cupo diario efectivo considerando el warm-up: crece con las semanas
 * transcurridas desde el PRIMER envío frío exitoso de la organización.
 */
export function effectiveDailyCap(
  settings: OutreachSettings,
  firstSendAt: Date | null,
  now: Date
): number {
  if (!settings.warmup.enabled) return settings.dailyCap;
  const { startCap, weeklyIncrease, maxCap } = settings.warmup;
  if (!firstSendAt) return Math.min(startCap, settings.dailyCap, maxCap);
  const msElapsed = now.getTime() - firstSendAt.getTime();
  const weeks = Math.max(0, Math.floor(msElapsed / (7 * 24 * 60 * 60 * 1000)));
  const cap = startCap + weeks * weeklyIncrease;
  return Math.min(cap, maxCap, settings.dailyCap);
}
