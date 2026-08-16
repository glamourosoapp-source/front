"use client";

import { useEffect, useState } from "react";
import { httpClient } from "@/services/http-client";
import type { DashboardSales } from "@glamouroso/shared/schemas/dashboard";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
} from "recharts";

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_LONG = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function formatMoney(value: number): string {
  return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Gráfica grande de ventas: por mes del año seleccionado, o por semanas del mes
 * al elegir un mes (o hacer clic en su barra). Excluye pedidos cancelados.
 */
export function SalesByPeriodChart() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const [data, setData] = useState<DashboardSales | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    httpClient
      .get<DashboardSales>("/dashboard/sales", month ? { year, month } : { year })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [year, month]);

  const isWeekly = data?.granularity === "week";
  const years = data?.availableYears?.length ? data.availableYears : [year];
  const chartData = (data?.points ?? []).map((point) => ({
    ...point,
    label: isWeekly ? `Sem ${point.key} (${point.startDay}–${point.endDay})` : MONTH_SHORT[point.key - 1],
  }));
  const hasSales = chartData.some((point) => point.orders > 0);

  const drillIntoMonth = (entry: unknown) => {
    const key = (entry as { payload?: { key?: number } })?.payload?.key;
    if (!month && typeof key === "number") setMonth(key);
  };

  return (
    <section className="panel p-5" style={{ height: "460px", display: "flex", flexDirection: "column" }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>
            {month ? `Ventas por Semana — ${MONTH_LONG[month - 1]} ${year}` : `Ventas por Mes — ${year}`}
          </h2>
          <p className="page-kicker">
            {month
              ? "Facturación por semana del mes seleccionado (pedidos cancelados excluidos)."
              : "Facturación mensual del año seleccionado. Haz clic en un mes para ver sus semanas."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!loading && data && (
            <span className="pill warning">
              {formatMoney(data.totalSales)} · {data.totalOrders} pedidos
            </span>
          )}
          <select
            className="input"
            style={{ width: "auto", minHeight: "36px", padding: "6px 10px" }}
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
            aria-label="Mes"
          >
            <option value="">Todo el año</option>
            {MONTH_LONG.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: "auto", minHeight: "36px", padding: "6px 10px" }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Año"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
            Cargando ventas…
          </div>
        ) : !hasSales ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
            Sin ventas registradas en este periodo.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                style={{ fontSize: "11px", fill: "var(--glam-muted)" }}
                tickFormatter={(value) => `$${Number(value).toLocaleString("es-MX")}`}
                width={80}
              />
              <ChartTooltip
                contentStyle={{
                  background: "rgba(23, 32, 51, 0.95)",
                  border: "0",
                  borderRadius: "8px",
                  color: "white",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                }}
                itemStyle={{ color: "var(--glam-blue)" }}
                labelStyle={{ color: "#9aa3b5", fontWeight: 700 }}
                formatter={(value) => [formatMoney(Number(value)), "Ventas"]}
                labelFormatter={(label, payload) =>
                  `${label} · ${payload?.[0]?.payload?.orders ?? 0} pedidos`
                }
              />
              <Bar
                dataKey="sales"
                fill="var(--glam-blue)"
                radius={[6, 6, 0, 0]}
                maxBarSize={64}
                cursor={month ? "default" : "pointer"}
                onClick={drillIntoMonth}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
