import { z } from "zod";

/** Query de GET /dashboard/sales: año obligatorio; con `month` la serie baja a semanas del mes. */
export const queryDashboardSalesSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type QueryDashboardSales = z.infer<typeof queryDashboardSalesSchema>;

/**
 * Punto de la serie de ventas: `key` es el mes (1-12) o, en granularidad "week",
 * el número de semana de negocio dentro del año (la semana 1 es la que contiene
 * el 1 de enero). Las semanas van de sábado a viernes y siempre **completas**: la
 * serie de un mes trae las semanas que lo tocan, aunque empiecen en el mes
 * anterior o terminen en el siguiente, y cada una suma sus 7 días.
 */
export interface DashboardSalesPoint {
  key: number;
  sales: number;
  orders: number;
  /** Solo granularidad "week": sábado donde empieza la semana ("YYYY-MM-DD"); puede caer en el mes anterior. */
  weekStart?: string;
  /** Solo granularidad "week": viernes donde termina la semana ("YYYY-MM-DD"); puede caer en el mes siguiente. */
  weekEnd?: string;
}

export interface DashboardSales {
  granularity: "month" | "week";
  year: number;
  month: number | null;
  /** Años con pedidos registrados (incluye siempre el año en curso del negocio). */
  availableYears: number[];
  points: DashboardSalesPoint[];
  /** Suma de los puntos mostrados. En "week" es la suma de las semanas completas, que no tiene por qué cuadrar con el total del mes. */
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

/** Criterio de orden del top de productos: por dinero facturado o por unidades vendidas. */
export type DashboardTopProductsOrderBy = "total" | "quantity";

/** Tope duro de productos que devuelve GET /dashboard/top-products. */
export const DASHBOARD_TOP_PRODUCTS_MAX_LIMIT = 50;

/** Cuántos productos devuelve el endpoint si no se pide un límite. */
export const DASHBOARD_TOP_PRODUCTS_DEFAULT_LIMIT = 5;

/**
 * Query de GET /dashboard/top-products. El periodo es acumulativo hacia arriba:
 * sin `year` es todo el histórico, con `year` es ese año y con `year` + `month` ese mes.
 */
export const queryDashboardTopProductsSchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    limit: z.coerce.number().int().min(1).max(DASHBOARD_TOP_PRODUCTS_MAX_LIMIT).optional(),
    orderBy: z.enum(["total", "quantity"]).optional(),
  })
  .refine((query) => query.month === undefined || query.year !== undefined, {
    message: "month requiere year",
    path: ["month"],
  });

export type QueryDashboardTopProducts = z.infer<typeof queryDashboardTopProductsSchema>;

/**
 * Respuesta de GET /dashboard/top-products: los productos más vendidos del periodo.
 * Mismo criterio de venta que el resto del dashboard: se excluyen pedidos cancelados,
 * draft y eliminados, y el corte de fecha usa `orders.created_at` en la timezone del
 * negocio.
 */
export interface DashboardTopProducts {
  /** Año del periodo, o `null` cuando se pidió todo el histórico. */
  year: number | null;
  month: number | null;
  /** Cuántos productos se pidieron (los devueltos pueden ser menos). */
  limit: number;
  orderBy: DashboardTopProductsOrderBy;
  /** Años con pedidos registrados (incluye siempre el año en curso del negocio). */
  availableYears: number[];
  /** Productos del periodo ordenados por `orderBy`, de mayor a menor. */
  products: DashboardTopProduct[];
  /** Ingreso de todos los productos del periodo, no solo de los devueltos. */
  totalSales: number;
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
  /** Últimos 7 días civiles, incluye hoy. */
  weeklyTrend: DashboardTrendPoint[];
  /** Sábado a viernes de la semana de negocio en curso. */
  currentWeek: DashboardTrendPoint[];
  /** Ventas del mes en curso por semanas (misma serie que /dashboard/sales con year+month actuales). */
  currentMonth: DashboardSales;
  /** Ventas del mes en curso agrupadas por equipo, de mayor a menor facturación. */
  salesByTeam: DashboardTeamSales[];
}
