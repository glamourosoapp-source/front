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
import { DollarSign, Receipt, ShoppingBag, Users } from "lucide-react";
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

const SELECT_STYLE = { width: "auto", minHeight: "36px", padding: "6px 10px" };

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
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const [week, setWeek] = useState("");
  const [metric, setMetric] = useState<Metric>("sales");
  const [data, setData] = useState<DashboardTeamPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    httpClient
      .get<DashboardTeamPerformance>("/dashboard/team-performance", {
        year,
        ...(month ? { month } : {}),
        ...(month && week ? { week } : {}),
      })
      .then((result) => {
        setData(result);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [canView, year, month, week]);

  if (!canView) {
    return (
      <div className="page-stack">
        <h1 className="page-title">Desempeño del equipo</h1>
        <p className="page-kicker">Tu perfil no tiene acceso al overview.</p>
      </div>
    );
  }

  const years = data?.availableYears?.length ? data.availableYears : [year];
  const sellers = data?.sellers ?? [];
  const totals = data?.totals;
  const granularity = data?.granularity ?? "week";
  const buckets = data?.buckets ?? [];
  const avgTicket = totals && totals.orders > 0 ? totals.sales / totals.orders : 0;
  const metricName = metric === "sales" ? "Ventas" : "Pedidos";

  const selectedWeek = week ? data?.monthWeeks.find((w) => w.weekStart === week) : undefined;
  const periodTitle = selectedWeek
    ? weekBucketTitle({ ...selectedWeek, sales: 0, orders: 0 })
    : month
      ? `${MONTH_LONG[month - 1]} ${year}`
      : `Año ${year}`;
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Desempeño del equipo</h1>
          <p className="page-kicker">
            Pedidos y ventas de cada vendedor. Solo cuentan los vendedores (perfiles que levantan pedidos y ven los
            suyos): supervisores, cajas de sucursal, almacén, dirección y el agente IA no aparecen. Pedidos cancelados
            excluidos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input"
            style={SELECT_STYLE}
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            aria-label="Métrica"
          >
            <option value="sales">Ver ventas</option>
            <option value="orders">Ver pedidos</option>
          </select>
          <select
            className="input"
            style={SELECT_STYLE}
            value={month ?? ""}
            onChange={(e) => {
              setMonth(e.target.value ? Number(e.target.value) : null);
              setWeek("");
            }}
            aria-label="Mes"
          >
            <option value="">Todo el año</option>
            {MONTH_LONG.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          {month ? (
            <select
              className="input"
              style={SELECT_STYLE}
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              aria-label="Semana"
            >
              <option value="">Todo el mes</option>
              {(data?.monthWeeks ?? []).map((w) => (
                <option key={w.weekStart} value={w.weekStart}>
                  {weekBucketTitle({ ...w, sales: 0, orders: 0 })}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className="input"
            style={SELECT_STYLE}
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setWeek("");
            }}
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
