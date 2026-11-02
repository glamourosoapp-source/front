"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  Tooltip as ChartTooltip,
} from "recharts";
import { ChevronLeft, ChevronRight, DollarSign, Receipt, ShoppingBag, Users } from "lucide-react";
import type {
  DashboardSellerPerformance,
  DashboardTeamPerformance,
  DashboardTeamPerformanceBucket,
} from "@glamouroso/shared/schemas/dashboard";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatMoney } from "@/lib/format-money";
import {
  MONTH_LONG,
  MONTH_SHORT,
  WeekAxisTick,
  weekBucketLabel,
  weekBucketTitle,
} from "@/components/dashboard/SalesByPeriodChart";

type Metric = "sales" | "orders";

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "rgba(23, 32, 51, 0.95)",
    border: "0",
    borderRadius: "8px",
    color: "white",
    boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  },
  itemStyle: { color: "var(--glam-blue)" },
  labelStyle: { color: "#9aa3b5", fontWeight: 700 },
};

type PeriodMode = "week" | "month" | "year";

const PERIOD_MODES: { value: PeriodMode; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "year", label: "Año" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(dateOnly: string): number {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function addDays(dateOnly: string, days: number): string {
  return new Date(parseDateOnly(dateOnly) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Hoy en el reloj del navegador, "YYYY-MM-DD". */
function todayDateOnly(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Sábado que abre la semana de negocio (sábado a viernes) de la fecha dada. */
function saturdayOf(dateOnly: string): string {
  const dow = new Date(parseDateOnly(dateOnly)).getUTCDay();
  return addDays(dateOnly, -((dow + 1) % 7));
}

/** Primera semana de negocio cuyo viernes cae en el mes (la que el Back cuenta como del mes). */
function firstWeekOfMonth(year: number, month: number): string {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const saturday = saturdayOf(first);
  return addDays(saturday, 6) < first ? addDays(saturday, 7) : saturday;
}

/** "sáb 3" para una fecha DATEONLY sin correrla de día por timezone. */
function dayLabel(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function asWeekPoint(bucket: { from: string; to: string; weekNumber?: number }) {
  return { key: bucket.weekNumber ?? 0, sales: 0, orders: 0, weekStart: bucket.from, weekEnd: bucket.to };
}

/** Etiqueta del eje X según la granularidad: mes, semana de negocio o día. */
function bucketLabel(granularity: DashboardTeamPerformance["granularity"], bucket: DashboardTeamPerformanceBucket) {
  if (granularity === "month") return MONTH_SHORT[Number(bucket.key) - 1];
  if (granularity === "week") return weekBucketLabel(asWeekPoint(bucket));
  return dayLabel(bucket.key);
}

/** Encabezado del tooltip de una barra de la serie. */
function bucketTitle(
  granularity: DashboardTeamPerformance["granularity"],
  bucket: DashboardTeamPerformanceBucket,
  year: number
) {
  if (granularity === "month") return `${MONTH_LONG[Number(bucket.key) - 1]} ${year}`;
  if (granularity === "week") return weekBucketTitle(asWeekPoint(bucket));
  return dayLabel(bucket.key);
}

function metricValue(metric: Metric, value: number) {
  return metric === "sales" ? formatMoney(value) : `${value} ${value === 1 ? "pedido" : "pedidos"}`;
}

function sellerLabel(seller: DashboardSellerPerformance) {
  return seller.isActive ? seller.name : `${seller.name} (baja)`;
}

/**
 * Desempeño del equipo de ventas: ranking, una gráfica por vendedor y el detalle.
 * Solo vendedores (perfiles que crean pedidos y ven los suyos); supervisores,
 * cajas de sucursal, almacén, dirección y el agente IA no aparecen.
 */
export default function TeamPerformancePage() {
  const { can } = usePermissions();
  const canView = can("dashboard", "view");
  const today = todayDateOnly();
  const current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), week: saturdayOf(today) };
  const [mode, setMode] = useState<PeriodMode>("month");
  const [year, setYear] = useState(current.year);
  const [month, setMonth] = useState(current.month);
  // Sábado que abre la semana de negocio elegida; solo cuenta en modo "week".
  const [week, setWeek] = useState(current.week);
  const [metric, setMetric] = useState<Metric>("sales");

  // En modo semana el año y el mes salen del viernes, el mismo criterio con el que
  // el Back numera las semanas, para que la semana venga en `monthWeeks`.
  const weekFriday = addDays(week, 6);
  const query =
    mode === "year"
      ? { year }
      : mode === "month"
        ? { year, month }
        : { year: Number(weekFriday.slice(0, 4)), month: Number(weekFriday.slice(5, 7)), week };
  const queryKey = JSON.stringify(query);

  const isCurrent =
    mode === "year"
      ? year === current.year
      : mode === "month"
        ? year === current.year && month === current.month
        : week === current.week;
  const canGoNext =
    mode === "year"
      ? year < current.year
      : mode === "month"
        ? year * 12 + month < current.year * 12 + current.month
        : week < current.week;

  const shiftPeriod = (delta: number) => {
    if (mode === "year") setYear(year + delta);
    else if (mode === "week") setWeek(addDays(week, 7 * delta));
    else {
      const index = year * 12 + (month - 1) + delta;
      setYear(Math.floor(index / 12));
      setMonth((index % 12) + 1);
    }
  };

  const goToCurrent = () => {
    setYear(current.year);
    setMonth(current.month);
    setWeek(current.week);
  };

  // Al cambiar de modo se conserva el periodo: la semana pasa a su mes (por su
  // viernes) y el mes a su semana en curso, o a su primera semana si es otro mes.
  const changeMode = (next: PeriodMode) => {
    if (next === mode) return;
    if (mode === "week") {
      setYear(Number(weekFriday.slice(0, 4)));
      setMonth(Number(weekFriday.slice(5, 7)));
    }
    if (next === "week" && mode !== "week") {
      const sameMonth = year === current.year && month === current.month;
      setWeek(sameMonth ? current.week : firstWeekOfMonth(year, month));
    }
    setMode(next);
  };
  const [data, setData] = useState<DashboardTeamPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    httpClient
      .get<DashboardTeamPerformance>("/dashboard/team-performance", query)
      .then((result) => {
        setData(result);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, queryKey]);

  if (!canView) {
    return (
      <div className="page-stack">
        <h1 className="page-title">Desempeño del equipo</h1>
        <p className="page-kicker">Tu perfil no tiene acceso al overview.</p>
      </div>
    );
  }

  const minYear = data?.availableYears?.[0] ?? current.year;
  const canGoPrev =
    mode === "year"
      ? year > minYear
      : mode === "month"
        ? year * 12 + month > minYear * 12 + 1
        : Number(addDays(week, -1).slice(0, 4)) >= minYear;
  const sellers = data?.sellers ?? [];
  const totals = data?.totals;
  const granularity = data?.granularity ?? "week";
  const buckets = data?.buckets ?? [];
  const avgTicket = totals && totals.orders > 0 ? totals.sales / totals.orders : 0;
  const metricName = metric === "sales" ? "Ventas" : "Pedidos";

  const selectedWeek = data?.week === week ? data.monthWeeks.find((w) => w.weekStart === week) : undefined;
  const weekRange = weekBucketLabel(asWeekPoint({ from: week, to: addDays(week, 6) }));
  const periodLabel =
    mode === "week" ? weekRange : mode === "month" ? `${MONTH_LONG[month - 1]} ${year}` : String(year);
  const periodSub = mode === "week" && selectedWeek ? `Semana ${selectedWeek.key}` : "";
  const periodTitle =
    mode === "week" ? (selectedWeek ? weekBucketTitle({ ...selectedWeek, sales: 0, orders: 0 }) : weekRange) : periodLabel;
  const periodHint =
    granularity === "day"
      ? "Día por día de la semana de negocio (sábado a viernes)."
      : granularity === "week"
        ? "Semanas completas de sábado a viernes que tocan el mes; la primera y la última pueden cruzar de mes."
        : "Mes por mes del año seleccionado.";

  // El Back ordena por ventas; el ranking se reordena por la métrica elegida.
  const rankingData = [...sellers]
    .sort((a, b) => b[metric] - a[metric])
    .map((seller) => ({
      name: sellerLabel(seller),
      value: seller[metric],
      orders: seller.orders,
      avgTicket: seller.avgTicket,
    }));
  const rankingHeight = Math.max(200, rankingData.length * 40 + 30);
  // Misma escala en todas las gráficas por vendedor, para que se comparen de un vistazo.
  const maxPoint = Math.max(1, ...sellers.flatMap((seller) => seller.points.map((point) => point[metric])));

  return (
    <div className="page-stack">
      <div>
        <h1 className="page-title">Desempeño del equipo</h1>
        <p className="page-kicker">
          Pedidos y ventas de cada vendedor. Solo cuentan los vendedores (perfiles que levantan pedidos y ven los
          suyos): supervisores, cajas de sucursal, almacén, dirección y el agente IA no aparecen. Pedidos cancelados
          excluidos.
        </p>
      </div>

      <div className="perf-filters" role="toolbar" aria-label="Filtros de desempeño">
        <div className="perf-filters-group">
          <div className="perf-segmented" role="group" aria-label="Periodo">
            {PERIOD_MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                onClick={() => changeMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="perf-period">
            <button
              type="button"
              className="perf-period-btn"
              onClick={() => shiftPeriod(-1)}
              disabled={!canGoPrev}
              aria-label="Periodo anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="perf-period-label" aria-live="polite">
              {periodLabel}
              {periodSub ? <small>{periodSub}</small> : null}
            </div>
            <button
              type="button"
              className="perf-period-btn"
              onClick={() => shiftPeriod(1)}
              disabled={!canGoNext}
              aria-label="Periodo siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <button type="button" className="perf-today" onClick={goToCurrent} disabled={isCurrent}>
            {mode === "week" ? "Esta semana" : mode === "month" ? "Este mes" : "Este año"}
          </button>
        </div>
        <div className="perf-segmented" role="group" aria-label="Métrica">
          <button type="button" aria-pressed={metric === "sales"} onClick={() => setMetric("sales")}>
            <DollarSign size={14} />
            Ventas
          </button>
          <button type="button" aria-pressed={metric === "orders"} onClick={() => setMetric("orders")}>
            <ShoppingBag size={14} />
            Pedidos
          </button>
        </div>
      </div>

      {error && !loading ? (
        <div className="card metric">
          <span>No se pudo cargar el desempeño del equipo</span>
          <small>Intenta de nuevo en un momento.</small>
        </div>
      ) : null}

      <section className="grid grid-4">
        <div className="card metric">
          <div className="metric-head">
            <span>Ventas del equipo</span>
            <div className="metric-icon">
              <DollarSign size={22} />
            </div>
          </div>
          <strong>{loading ? "…" : formatMoney(totals?.sales ?? 0)}</strong>
          <small>{periodTitle}</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Pedidos levantados</span>
            <div className="metric-icon">
              <ShoppingBag size={22} />
            </div>
          </div>
          <strong>{loading ? "…" : (totals?.orders ?? 0)}</strong>
          <small>{totals?.customers ?? 0} clientes distintos</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Ticket promedio</span>
            <div className="metric-icon">
              <Receipt size={22} />
            </div>
          </div>
          <strong>{loading ? "…" : formatMoney(avgTicket)}</strong>
          <small>Ventas entre pedidos</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Vendedores con ventas</span>
            <div className="metric-icon">
              <Users size={22} />
            </div>
          </div>
          <strong>{loading ? "…" : `${totals?.sellersWithSales ?? 0} de ${sellers.length}`}</strong>
          <small>Levantaron al menos un pedido</small>
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4">
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>
            Ranking de vendedores — {metricName} · {periodTitle}
          </h2>
          <p className="page-kicker">De mayor a menor. Los vendedores activos aparecen aunque no hayan vendido.</p>
        </div>
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", height: "200px", color: "var(--glam-muted)", fontSize: "13px" }}>
            Cargando vendedores…
          </div>
        ) : sellers.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", height: "200px", color: "var(--glam-muted)", fontSize: "13px" }}>
            No hay vendedores registrados.
          </div>
        ) : !totals?.orders ? (
          <div style={{ display: "grid", placeItems: "center", height: "200px", color: "var(--glam-muted)", fontSize: "13px" }}>
            Ningún vendedor levantó pedidos en este periodo.
          </div>
        ) : (
          <div style={{ height: `${rankingHeight}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankingData} layout="vertical" margin={{ top: 0, right: 90, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  style={{ fontSize: "11px", fill: "var(--glam-muted)" }}
                  tickFormatter={(value) =>
                    metric === "sales" ? `$${Number(value).toLocaleString("es-MX")}` : String(value)
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={150}
                  interval={0}
                  style={{ fontSize: "12px", fill: "var(--glam-navy)", fontWeight: 600 }}
                />
                <ChartTooltip
                  {...TOOLTIP_STYLE}
                  cursor={{ fill: "rgba(6, 166, 224, 0.06)" }}
                  formatter={(value) => [metricValue(metric, Number(value)), metricName]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as (typeof rankingData)[number] | undefined;
                    if (!row) return String(label);
                    return `${label} · ${row.orders} pedidos · ticket ${formatMoney(row.avgTicket)}`;
                  }}
                />
                <Bar dataKey="value" fill="var(--glam-blue)" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(value: unknown) =>
                      metric === "sales" ? formatMoney(Number(value)) : String(value)
                    }
                    style={{ fontSize: "12px", fill: "var(--glam-navy)", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>
            {metricName} por vendedor — {periodTitle}
          </h2>
          <p className="page-kicker">{periodHint} Todas las gráficas usan la misma escala.</p>
        </div>
        <div className="team-performance-grid">
          {sellers.map((seller) => {
            const share = totals && totals.sales > 0 ? Math.round((seller.sales / totals.sales) * 1000) / 10 : 0;
            const chartData = buckets.map((bucket, i) => ({
              label: bucketLabel(granularity, bucket),
              title: bucketTitle(granularity, bucket, year),
              value: seller.points[i]?.[metric] ?? 0,
              orders: seller.points[i]?.orders ?? 0,
            }));
            return (
              <article key={seller.id} className="panel p-4 team-performance-card">
                <header className="flex items-start justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--glam-navy)" }}>{seller.name}</h3>
                    <p style={{ fontSize: "12px", color: "var(--glam-muted)" }}>
                      {seller.team ?? "Sin equipo"}
                      {seller.isActive ? "" : " · dado de baja"}
                    </p>
                  </div>
                  <span className="pill">{share}% del equipo</span>
                </header>
                <div style={{ marginTop: "10px" }}>
                  <strong style={{ fontSize: "22px", color: "var(--glam-navy)" }}>{formatMoney(seller.sales)}</strong>
                  <p style={{ fontSize: "12px", color: "var(--glam-muted)" }}>
                    {seller.orders} {seller.orders === 1 ? "pedido" : "pedidos"} · ticket {formatMoney(seller.avgTicket)}{" "}
                    · {seller.customers} {seller.customers === 1 ? "cliente" : "clientes"}
                  </p>
                </div>
                <div style={{ height: granularity === "week" ? "150px" : "130px", marginTop: "8px" }}>
                  {seller.orders === 0 ? (
                    <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "12px" }}>
                      Sin pedidos en este periodo.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        {granularity === "week" ? (
                          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} height={36} tick={<WeekAxisTick />} />
                        ) : (
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                            style={{ fontSize: "10px", fill: "var(--glam-muted)" }}
                          />
                        )}
                        <YAxis hide domain={[0, maxPoint]} />
                        <ChartTooltip
                          {...TOOLTIP_STYLE}
                          cursor={{ fill: "rgba(6, 166, 224, 0.06)" }}
                          formatter={(value) => [metricValue(metric, Number(value)), metricName]}
                          labelFormatter={(label, payload) => {
                            const row = payload?.[0]?.payload as (typeof chartData)[number] | undefined;
                            if (!row) return String(label);
                            return metric === "sales" ? `${row.title} · ${row.orders} pedidos` : row.title;
                          }}
                        />
                        <Bar dataKey="value" fill="var(--glam-blue)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {sellers.length > 0 ? (
        <section className="panel p-5">
          <h2 className="mb-3" style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>
            Detalle — {periodTitle}
          </h2>
          <div className="table-container-premium" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
              <thead>
                <tr>
                  <th className="table-head-cell" style={{ textAlign: "left" }}>#</th>
                  <th className="table-head-cell" style={{ textAlign: "left" }}>Vendedor</th>
                  <th className="table-head-cell" style={{ textAlign: "left" }}>Equipo</th>
                  <th className="table-head-cell" style={{ textAlign: "right" }}>Pedidos</th>
                  <th className="table-head-cell" style={{ textAlign: "right" }}>Ventas</th>
                  <th className="table-head-cell" style={{ textAlign: "right" }}>Ticket promedio</th>
                  <th className="table-head-cell" style={{ textAlign: "right" }}>Clientes</th>
                  <th className="table-head-cell" style={{ textAlign: "right" }}>% de ventas</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((seller, i) => (
                  <tr key={seller.id}>
                    <td className="table-body-cell">{i + 1}</td>
                    <td className="table-body-cell" style={{ fontWeight: 600 }}>
                      {sellerLabel(seller)}
                    </td>
                    <td className="table-body-cell">{seller.team ?? "Sin equipo"}</td>
                    <td className="table-body-cell" style={{ textAlign: "right" }}>{seller.orders}</td>
                    <td className="table-body-cell" style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatMoney(seller.sales)}
                    </td>
                    <td className="table-body-cell" style={{ textAlign: "right" }}>{formatMoney(seller.avgTicket)}</td>
                    <td className="table-body-cell" style={{ textAlign: "right" }}>{seller.customers}</td>
                    <td className="table-body-cell" style={{ textAlign: "right" }}>
                      {totals && totals.sales > 0 ? `${Math.round((seller.sales / totals.sales) * 1000) / 10}%` : "0%"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
