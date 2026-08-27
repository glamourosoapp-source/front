import { z } from "zod";

/** Query de GET /dashboard/sales: año obligatorio; con `month` la serie baja a semanas del mes. */
export const queryDashboardSalesSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type QueryDashboardSales = z.infer<typeof queryDashboardSalesSchema>;

/** Punto de la serie de ventas: `key` es mes (1-12) o semana del mes (1-5). */
export interface DashboardSalesPoint {
  key: number;
  sales: number;
  orders: number;
  /** Solo granularidad "week": día del mes donde empieza la semana. */
  startDay?: number;
  /** Solo granularidad "week": día del mes donde termina la semana. */
  endDay?: number;
}

export interface DashboardSales {
  granularity: "month" | "week";
  year: number;
  month: number | null;
  /** Años con pedidos registrados (incluye siempre el año en curso del negocio). */
  availableYears: number[];
  points: DashboardSalesPoint[];
  totalSales: number;
  totalOrders: number;
}

/** Totales del overview. Criterio único en todo el dashboard: se excluyen pedidos cancelados (y drafts/eliminados), igual que /dashboard/sales. */
export interface DashboardOverviewTotals {
  orders_today: number;
  new_orders: number;
  total_orders: number;
  /** Facturación histórica acumulada. */
  total_sales: number;
  /** Facturación de hoy en la timezone del negocio. */
  sales_today: number;
}

/** Punto de una serie diaria de ventas (fecha civil del negocio, "YYYY-MM-DD"). */
export interface DashboardTrendPoint {
  date: string;
  sales: number;
  orders: number;
}

export interface DashboardTopProduct {
  name: string;
  quantity: number;
  total: number;
}

/** Ventas agrupadas por el equipo del creador del pedido. */
export interface DashboardTeamSales {
  /** Nombre del equipo; "Glamouroso IA" para pedidos de WhatsApp sin creador y "Sin equipo" para el resto sin equipo. */
  team: string;
  sales: number;
  orders: number;
}

/** Respuesta de GET /dashboard/overview (el servicio normaliza los numeric de PG a number). */
export interface DashboardOverview {
  totals: DashboardOverviewTotals;
  topProducts: DashboardTopProduct[];
  /** Últimos 7 días civiles, incluye hoy. */
  weeklyTrend: DashboardTrendPoint[];
  /** Lunes a domingo de la semana en curso. */
  currentWeek: DashboardTrendPoint[];
  /** Ventas del mes en curso por semanas (misma serie que /dashboard/sales con year+month actuales). */
  currentMonth: DashboardSales;
  /** Ventas del mes en curso agrupadas por equipo, de mayor a menor facturación. */
  salesByTeam: DashboardTeamSales[];
}
