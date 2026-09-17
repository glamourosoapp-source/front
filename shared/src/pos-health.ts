import { BRANCH_TYPES, type BranchType } from "./constants";

/**
 * Salud de una sucursal o franquicia, para la tabla y el detalle del panel.
 *
 * No es un score: son señales concretas que el administrador puede actuar. Cada
 * señal dice qué pasa ("3 productos bajo mínimo") y el nivel global es el peor
 * de todos. Sin señales, la sucursal está bien.
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
  /** Líneas y productos con existencia por debajo de su mínimo. */
  belowMinCount: number;
  /** Pedidos a fábrica sin enviar (pending/approved/preparing) y el más viejo. */
  openRestockCount: number;
  oldestOpenRestockAt: string | null;
  /** Último pedido a fábrica creado (ISO) o null; lo usan las franquicias. */
  lastRestockAt: string | null;
  /** "Ahora", inyectable para tests. */
  now?: Date;
}

export interface BranchHealthSignal {
  level: Exclude<BranchHealthLevel, "good">;
  code:
    | "inactive"
    | "sales_drop"
    | "no_recent_sales"
    | "below_min"
    | "stale_restock"
    | "no_recent_orders";
  message: string;
}

export interface BranchHealth {
  level: BranchHealthLevel;
  signals: BranchHealthSignal[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.floor((now.getTime() - then) / DAY_MS);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
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

  // Inventario: solo sucursales; la franquicia lleva el suyo fuera del sistema.
  if (!isFranchise && input.belowMinCount > 0) {
    signals.push({
      level: input.belowMinCount >= 10 ? "critical" : "warning",
      code: "below_min",
      message: `${plural(input.belowMinCount, "producto", "productos")} bajo stock mínimo`,
    });
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
