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
