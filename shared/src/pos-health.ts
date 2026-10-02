import { BRANCH_TYPES, type BranchType } from "./constants";
import { POS_CLOCK_SKEW_WARN_MS, type BranchSyncState } from "./pos-sync";

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

/**
 * Señales de la caja offline: ventas cobradas que siguen en la PC de la
 * sucursal y no en la base. Es lo único que el administrador no puede ver de
 * ninguna otra forma, porque esas ventas no existen todavía para el sistema.
 *
 * Una franquicia no tiene caja, así que no se mide.
 */
function syncSignals(sync: BranchSyncState, now: Date): BranchHealthSignal[] {
  const signals: BranchHealthSignal[] = [];
  const pending = sync.pendingCount ?? 0;

  if (pending > 0) {
    const waiting = hoursSince(sync.oldestPendingAt, now);
    if (waiting !== null && waiting >= 24) {
      signals.push({
        level: "critical",
        code: "sync_pending",
        message: `${plural(pending, "venta sin subir", "ventas sin subir")} desde ${agoLabel(waiting)}`,
      });
    } else if (waiting === null || waiting >= 1) {
      signals.push({
        level: "warning",
        code: "sync_pending",
        message: `${plural(pending, "venta sin subir", "ventas sin subir")}${waiting === null ? "" : ` desde ${agoLabel(waiting)}`}`,
      });
    }
  }

  const silence = hoursSince(sync.lastSeenAt, now);
  if (silence !== null && silence >= 24) {
    signals.push({
      level: "critical",
      code: "sync_offline",
      message: `La caja no se comunica desde ${agoLabel(silence)}`,
    });
  } else if (silence !== null && silence >= 2) {
    signals.push({
      level: "warning",
      code: "sync_offline",
      message: `La caja no se comunica desde ${agoLabel(silence)}`,
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
    signals.push(...syncSignals(input.syncState, now));
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
