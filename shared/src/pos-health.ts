import { BRANCH_TYPES, type BranchType } from "./constants";
import { POS_CLOCK_SKEW_WARN_MS, type BranchSyncState } from "./pos-sync";
import { storeOpenHoursBetween, type BranchOpeningHours, type StoreDayEvaluation } from "./pos-store-hours";

/**
 * Salud de una sucursal o franquicia, para la tabla y el detalle del panel.
 *
 * No es un score: son señales concretas que el administrador puede actuar. Cada
 * señal dice qué pasa ("ventas 40% abajo") y el nivel global es el peor de
 * todos. Sin señales, la sucursal está bien.
 *
 * El inventario bajo su stock NO es señal: se vacía vendiendo y se repone con
 * el pedido semanal a fábrica, así que alarmar por eso es alarmar por vender.
 */
export type BranchHealthLevel = "good" | "warning" | "critical";

export interface BranchHealthInput {
  type: BranchType | string;
  isActive: boolean;
  /** Ventas cobradas en los últimos 30 días y en los 30 anteriores. */
  last30Total: number;
  prev30Total: number;
  /** Tickets cobrados en toda la historia: sin ellos no hay caída que medir. */
  lifetimeTickets: number;
  /** Última venta cobrada (ISO) o null. */
  lastSaleAt: string | null;
  /** Pedidos a fábrica sin enviar (pending/approved/preparing) y el más viejo. */
  openRestockCount: number;
  oldestOpenRestockAt: string | null;
  /** Último pedido a fábrica creado (ISO) o null; lo usan las franquicias. */
  lastRestockAt: string | null;
  /**
   * Lo que la caja reportó en su último contacto (`branches.sync_state`).
   * Ausente = la sucursal nunca usó la caja offline; no se mide.
   */
  syncState?: BranchSyncState | null;
  /**
   * Horario de la tienda y su día de hoy: con él, la caja callada y las ventas
   * sin subir se miden en horas de tienda abierta, no de reloj (de noche o en
   * descanso la PC apagada es lo normal). Ausente o sin horario capturado =
   * tiempo corrido.
   */
  storeHours?: {
    hours: BranchOpeningHours | null | undefined;
    timeZone: string;
    today?: StoreDayEvaluation | null;
  } | null;
  /** "Ahora", inyectable para tests. */
  now?: Date;
}

export interface BranchHealthSignal {
  level: Exclude<BranchHealthLevel, "good">;
  code:
    | "inactive"
    | "sales_drop"
    | "no_recent_sales"
    | "stale_restock"
    | "no_recent_orders"
    | "sync_pending"
    | "sync_offline"
    | "sync_rejected"
    | "clock_skew";
  message: string;
}

export interface BranchHealth {
  level: BranchHealthLevel;
  signals: BranchHealthSignal[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.floor((now.getTime() - then) / DAY_MS);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return (now.getTime() - then) / HOUR_MS;
}

/** "hace 3 horas" / "hace 2 días", para un lapso en horas. */
function agoLabel(hours: number): string {
  if (hours < 1) return "hace menos de una hora";
  if (hours < 24) return `hace ${plural(Math.floor(hours), "hora", "horas")}`;
  return `hace ${plural(Math.floor(hours / 24), "día", "días")}`;
}

const SYNC_PENDING_WARN_HOURS = 1;
const SYNC_OFFLINE_WARN_HOURS = 2;
/** Crítico en tiempo corrido: un día entero. */
const SYNC_CRITICAL_HOURS = 24;
/**
 * Crítico en horas de tienda abierta: una jornada. 24 horas de horario serían
 * dos o tres días de ventas fuera del sistema.
 */
const SYNC_CRITICAL_OPEN_HOURS = 8;

/** Cuánto lleva algo de la caja esperando, en horas de tienda o de reloj. */
interface SyncLapse {
  hours: number;
  /** true = medido en horas de tienda abierta (la sucursal tiene horario). */
  openHours: boolean;
  /** true = se descontó tiempo con la tienda cerrada: "hace N horas" mentiría. */
  discounted: boolean;
}

function syncLapse(
  iso: string | null | undefined,
  now: Date,
  store: BranchHealthInput["storeHours"]
): SyncLapse | null {
  const wall = hoursSince(iso, now);
  if (wall === null) return null;
  const open = store
    ? storeOpenHoursBetween({ since: iso!, now, hours: store.hours, timeZone: store.timeZone, today: store.today })
    : null;
  if (open === null) return { hours: wall, openHours: false, discounted: false };
  // Menos de media hora de diferencia: todo el lapso fue con la tienda abierta.
  return { hours: open, openHours: true, discounted: wall - open >= 0.5 };
}

function lapseIsCritical(lapse: SyncLapse): boolean {
  return lapse.hours >= (lapse.openHours ? SYNC_CRITICAL_OPEN_HOURS : SYNC_CRITICAL_HOURS);
}

/** " desde hace 3 horas", o ": 3 horas en horario de la tienda" si se descontó lo cerrado. */
function lapseLabel(lapse: SyncLapse): string {
  if (!lapse.discounted) return ` desde ${agoLabel(lapse.hours)}`;
  const hours = lapse.hours < 1 ? "menos de una hora" : plural(Math.floor(lapse.hours), "hora", "horas");
  return `: ${hours} en horario de la tienda`;
}

/**
 * Señales de la caja offline: ventas cobradas que siguen en la PC de la
 * sucursal y no en la base. Es lo único que el administrador no puede ver de
 * ninguna otra forma, porque esas ventas no existen todavía para el sistema.
 *
 * Con horario, el tiempo cuenta solo con la tienda abierta: la venta de las
 * 8:55 p.m. que no subió antes de apagar la PC no alarma en la noche.
 *
 * Una franquicia no tiene caja, así que no se mide.
 */
function syncSignals(
  sync: BranchSyncState,
  now: Date,
  store: BranchHealthInput["storeHours"]
): BranchHealthSignal[] {
  const signals: BranchHealthSignal[] = [];
  const pending = sync.pendingCount ?? 0;

  if (pending > 0) {
    const waiting = syncLapse(sync.oldestPendingAt, now, store);
    const what = plural(pending, "venta sin subir", "ventas sin subir");
    if (waiting !== null && lapseIsCritical(waiting)) {
      signals.push({ level: "critical", code: "sync_pending", message: `${what}${lapseLabel(waiting)}` });
    } else if (waiting === null || waiting.hours >= SYNC_PENDING_WARN_HOURS) {
      signals.push({
        level: "warning",
        code: "sync_pending",
        message: `${what}${waiting === null ? "" : lapseLabel(waiting)}`,
      });
    }
  }

  const silence = syncLapse(sync.lastSeenAt, now, store);
  if (silence !== null && silence.hours >= SYNC_OFFLINE_WARN_HOURS) {
    signals.push({
      level: lapseIsCritical(silence) ? "critical" : "warning",
      code: "sync_offline",
      message: `La caja no se comunica${lapseLabel(silence)}`,
    });
  }

  if ((sync.rejectedCount ?? 0) > 0) {
    signals.push({
      level: "warning",
      code: "sync_rejected",
      message: `${plural(sync.rejectedCount!, "venta requiere", "ventas requieren")} atención`,
    });
  }

  // El reloj no bloquea la caja (decisión del negocio): solo se avisa, porque
  // un reloj corrido mete tickets en un día de negocio equivocado.
  const skew = Math.abs(sync.clockOffsetMs ?? 0);
  if (skew >= POS_CLOCK_SKEW_WARN_MS) {
    signals.push({
      level: "warning",
      code: "clock_skew",
      message: `El reloj de la PC está ${agoLabel(skew / HOUR_MS).replace("hace ", "")} fuera de hora`,
    });
  }

  return signals;
}

export function computeBranchHealth(input: BranchHealthInput): BranchHealth {
  const now = input.now ?? new Date();
  const signals: BranchHealthSignal[] = [];
  const isFranchise = input.type === BRANCH_TYPES.FRANCHISE;

  if (!input.isActive) {
    return {
      level: "warning",
      signals: [{ level: "warning", code: "inactive", message: "Sucursal inactiva" }],
    };
  }

  // Ventas: solo para quien tiene caja. Una franquicia no vende en el sistema.
  if (!isFranchise && input.lifetimeTickets > 0) {
    const idle = daysSince(input.lastSaleAt, now);
    if (idle !== null && idle >= 7) {
      signals.push({
        level: "critical",
        code: "no_recent_sales",
        message: `Sin ventas desde hace ${plural(idle, "día", "días")}`,
      });
    } else if (idle !== null && idle >= 3) {
      signals.push({
        level: "warning",
        code: "no_recent_sales",
        message: `Sin ventas desde hace ${plural(idle, "día", "días")}`,
      });
    }

    if (input.prev30Total > 0) {
      const drop = 1 - input.last30Total / input.prev30Total;
      if (drop >= 0.4) {
        signals.push({
          level: "critical",
          code: "sales_drop",
          message: `Ventas ${Math.round(drop * 100)}% abajo de los 30 días anteriores`,
        });
      } else if (drop >= 0.2) {
        signals.push({
          level: "warning",
          code: "sales_drop",
          message: `Ventas ${Math.round(drop * 100)}% abajo de los 30 días anteriores`,
        });
      }
    }
  }

  // Surtido atorado: un pedido sin enviar en más de 3 días es un faltante que sigue.
  if (input.openRestockCount > 0) {
    const age = daysSince(input.oldestOpenRestockAt, now) ?? 0;
    if (age >= 7) {
      signals.push({
        level: "critical",
        code: "stale_restock",
        message: `${plural(input.openRestockCount, "pedido a fábrica", "pedidos a fábrica")} sin enviar, el más viejo de hace ${plural(age, "día", "días")}`,
      });
    } else if (age >= 3) {
      signals.push({
        level: "warning",
        code: "stale_restock",
        message: `${plural(input.openRestockCount, "pedido a fábrica", "pedidos a fábrica")} sin enviar desde hace ${plural(age, "día", "días")}`,
      });
    }
  }

  // Una franquicia que dejó de pedir es una franquicia que se está yendo.
  if (isFranchise && input.lastRestockAt) {
    const idle = daysSince(input.lastRestockAt, now);
    if (idle !== null && idle >= 45) {
      signals.push({
        level: "critical",
        code: "no_recent_orders",
        message: `Sin pedidos a fábrica desde hace ${plural(idle, "día", "días")}`,
      });
    } else if (idle !== null && idle >= 21) {
      signals.push({
        level: "warning",
        code: "no_recent_orders",
        message: `Sin pedidos a fábrica desde hace ${plural(idle, "día", "días")}`,
      });
    }
  }

  // La caja: ventas cobradas que aún viven en la PC de la sucursal.
  if (!isFranchise && input.syncState) {
    signals.push(...syncSignals(input.syncState, now, input.storeHours));
  }

  const level: BranchHealthLevel = signals.some((s) => s.level === "critical")
    ? "critical"
    : signals.length
      ? "warning"
      : "good";

  return { level, signals };
}

export const BRANCH_HEALTH_LABELS: Record<BranchHealthLevel, string> = {
  good: "Sana",
  warning: "Atención",
  critical: "Crítica",
};
