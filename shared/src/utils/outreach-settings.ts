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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
  const weeks = Math.max(0, Math.floor((now.getTime() - firstSendAt.getTime()) / WEEK_MS));
  const cap = startCap + weeks * weeklyIncrease;
  return Math.min(cap, maxCap, settings.dailyCap);
}

/**
 * Estado de la rampa de calentamiento, para mostrarlo en el dashboard: en qué
 * semana va, cuánto falta para la capacidad plena y cuándo sube el cupo.
 *
 * El techo real es `min(warmup.maxCap, dailyCap)`: si alguien baja `dailyCap`
 * por debajo de `maxCap`, la rampa termina ahí y no en el maxCap teórico.
 */
export interface WarmupProgress {
  enabled: boolean;
  /** Cupo diario de hoy. */
  effectiveCap: number;
  /** Techo al que llega la rampa. */
  maxCap: number;
  /** Semana de la rampa, 1-based. */
  week: number;
  /** Semanas totales hasta la capacidad plena. */
  totalWeeks: number;
  atFullCapacity: boolean;
  /** Primer envío frío exitoso: la rampa cuenta desde ahí. Null si aún no arranca. */
  startedAt: string | null;
  /** Cuándo sube el cupo la próxima vez (null si ya está al tope o no arrancó). */
  nextIncreaseAt: string | null;
  /** Cupo tras el próximo aumento. */
  nextCap: number;
}

export function warmupProgress(
  settings: OutreachSettings,
  firstSendAt: Date | null,
  now: Date
): WarmupProgress {
  const { enabled, startCap, weeklyIncrease, maxCap } = settings.warmup;
  const ceiling = Math.min(maxCap, settings.dailyCap);
  const effectiveCap = effectiveDailyCap(settings, firstSendAt, now);

  if (!enabled) {
    return {
      enabled: false,
      effectiveCap,
      maxCap: ceiling,
      week: 1,
      totalWeeks: 1,
      atFullCapacity: true,
      startedAt: firstSendAt?.toISOString() ?? null,
      nextIncreaseAt: null,
      nextCap: effectiveCap,
    };
  }

  // Semanas de aumento necesarias para alcanzar el techo desde el cupo inicial.
  const missing = Math.max(0, ceiling - Math.min(startCap, ceiling));
  const increases = weeklyIncrease > 0 ? Math.ceil(missing / weeklyIncrease) : 0;
  const totalWeeks = increases + 1;

  const weeksElapsed = firstSendAt
    ? Math.max(0, Math.floor((now.getTime() - firstSendAt.getTime()) / WEEK_MS))
    : 0;
  const week = Math.min(weeksElapsed + 1, totalWeeks);
  const atFullCapacity = effectiveCap >= ceiling;

  return {
    enabled: true,
    effectiveCap,
    maxCap: ceiling,
    week,
    totalWeeks,
    atFullCapacity,
    startedAt: firstSendAt?.toISOString() ?? null,
    // Sin envíos aún la rampa no ha arrancado: no hay fecha que prometer.
    nextIncreaseAt:
      atFullCapacity || !firstSendAt
        ? null
        : new Date(firstSendAt.getTime() + (weeksElapsed + 1) * WEEK_MS).toISOString(),
    nextCap: atFullCapacity
      ? effectiveCap
      : Math.min(startCap + (weeksElapsed + 1) * weeklyIncrease, ceiling),
  };
}
