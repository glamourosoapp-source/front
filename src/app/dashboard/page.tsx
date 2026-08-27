"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/ui/DataTable";
import { MONTH_LONG, SalesByPeriodChart } from "@/components/dashboard/SalesByPeriodChart";
import type { DashboardOverview } from "@glamouroso/shared/schemas/dashboard";
import { httpClient } from "@/services/http-client";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { ShoppingBag, TrendingUp, DollarSign, Activity, Sparkles, Users, Wallet } from "lucide-react";
import type { PermissionModule } from "@glamouroso/shared";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";

// Primera ruta a la que se redirige a quien no puede ver el Overview (orden del sidebar).
const NAV_ROUTES: { module: PermissionModule; href: string }[] = [
  { module: "orders", href: "/dashboard/orders" },
  { module: "customers", href: "/dashboard/customers" },
  { module: "products", href: "/dashboard/products" },
  { module: "conversations", href: "/dashboard/conversations" },
  { module: "prospects", href: "/dashboard/prospeccion?tab=buscar" },
  { module: "outreach", href: "/dashboard/prospeccion?tab=contactar" },
  { module: "agent", href: "/dashboard/agent" },
  { module: "faqs", href: "/dashboard/faqs" },
  { module: "notifications", href: "/dashboard/notifications" },
  { module: "users", href: "/dashboard/users" },
  { module: "settings", href: "/dashboard/settings" },
];

function formatMoney(value: number): string {
  return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Etiqueta "vie 15" para una fecha DATEONLY sin correrla de día por timezone. */
function weekdayLabel(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return dateOnly;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { can } = usePermissions();
  const canSeeOverview = can("dashboard", "view");

  useEffect(() => {
    // Perfiles sin acceso al Overview (ej. vendedor) van a su primera sección permitida.
    if (user && !canSeeOverview) {
      const target = NAV_ROUTES.find((route) => can(route.module));
      router.replace(target?.href ?? "/dashboard/orders");
    }
  }, [user, canSeeOverview, can, router]);

  useEffect(() => {
    if (!canSeeOverview) return;
    setLoading(true);
    httpClient
      .get<DashboardOverview>("/dashboard/overview")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [canSeeOverview]);

  // Métricas en vivo: ante pedidos nuevos/cambiados o notificaciones se
  // refresca el overview en silencio, con throttle para absorber ráfagas.
  const { subscribe } = useRealtime();
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    if (!canSeeOverview) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      lastRefreshRef.current = Date.now();
      httpClient
        .get<DashboardOverview>("/dashboard/overview")
        .then(setData)
        .catch(() => undefined);
    };
    const off = subscribe((event) => {
      if (event.type !== "orders_changed" && !("notification" in event)) return;
      if (timer) return;
      const wait = Math.max(0, 5_000 - (Date.now() - lastRefreshRef.current));
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, wait);
    });
    return () => {
      if (timer) clearTimeout(timer);
      off();
    };
  }, [canSeeOverview, subscribe]);

  const totals = data?.totals;
  const products = data?.topProducts || [];

  // Parse chart data for top products
  const productChartData = products.map((p) => ({
    name: p.name.length > 15 ? p.name.slice(0, 15) + "..." : p.name,
    ventas: Number(p.total || 0),
    cantidad: Number(p.quantity || 0),
  }));

  const weeklySalesData = (data?.weeklyTrend || []).map((point) => ({
    day: weekdayLabel(String(point.date)),
    ventas: Number(point.sales || 0),
    pedidos: Number(point.orders || 0),
  }));

  // Semana en curso (lunes a domingo) y semanas del mes en curso.
  const currentWeekData = (data?.currentWeek || []).map((point) => ({
    day: weekdayLabel(point.date),
    ventas: point.sales,
    pedidos: point.orders,
  }));
  const monthWeeksData = (data?.currentMonth?.points || []).map((point) => ({
    label: `Sem ${point.key} (${point.startDay}–${point.endDay})`,
    ventas: point.sales,
    pedidos: point.orders,
  }));
  const currentMonthName = data?.currentMonth?.month ? MONTH_LONG[data.currentMonth.month - 1] : "";
  const teamSalesData = (data?.salesByTeam || []).map((team) => ({
    team: team.team,
    ventas: team.sales,
    pedidos: team.orders,
  }));

  const firstName = user?.name?.trim().split(/\s+/)[0] || "equipo";

  return (
    <div className="page-stack">
      <section className="dashboard-welcome" aria-label="Bienvenida al dashboard">
        <div className="dashboard-welcome-bg" aria-hidden="true">
          <span className="dashboard-welcome-bubble dashboard-welcome-bubble-1" />
          <span className="dashboard-welcome-bubble dashboard-welcome-bubble-2" />
          <span className="dashboard-welcome-bubble dashboard-welcome-bubble-3" />
          <span className="dashboard-welcome-glow" />
        </div>

        <div className="dashboard-welcome-copy">
          <span className="dashboard-welcome-badge">
            <Sparkles size={14} />
            Operación en tiempo real
          </span>
          <p className="dashboard-welcome-greeting">
            Hola, <strong>{firstName}</strong>
          </p>
          <h1 className="page-title dashboard-welcome-title">Overview Ejecutivo</h1>
          <p className="page-kicker dashboard-welcome-kicker">
            Análisis de facturación, volumen de pedidos y métricas clave del CRM.
          </p>
          {!loading && (
            <div className="dashboard-welcome-chips">
              <span className="pill warning">{totals?.orders_today ?? 0} pedidos hoy</span>
              <span className="pill">{totals?.new_orders ?? 0} por atender</span>
            </div>
          )}
        </div>

        <figure className="dashboard-welcome-mascot">
          <img
            src="/branding/don-glamouroso.svg"
            alt=""
            aria-hidden="true"
            width={119}
            height={198}
          />
        </figure>
      </section>

      {/* Grid de Tarjetas Métricas */}
      <section className="grid grid-5">
        <div className="card metric">
          <div className="metric-head">
            <span>Pedidos Hoy</span>
            <div className="metric-icon">
              <Activity size={22} />
            </div>
          </div>
          <strong>{totals?.orders_today ?? 0}</strong>
          <small>Flujo diario activo</small>
        </div>

        <div className="card metric">
          <div className="metric-head">
            <span>Ventas de Hoy</span>
            <div className="metric-icon">
              <Wallet size={22} />
            </div>
          </div>
          <strong>{formatMoney(totals?.sales_today ?? 0)}</strong>
          <small>Facturación del día</small>
        </div>

        <div className="card metric">
          <div className="metric-head">
            <span>Pedidos Nuevos</span>
            <div className="metric-icon">
              <ShoppingBag size={22} />
            </div>
          </div>
          <strong>{totals?.new_orders ?? 0}</strong>
          <small>Por atender en cola</small>
        </div>

        <div className="card metric">
          <div className="metric-head">
            <span>Pedidos Totales</span>
            <div className="metric-icon">
              <TrendingUp size={22} />
            </div>
          </div>
          <strong>{totals?.total_orders ?? 0}</strong>
          <small>Historial acumulado</small>
        </div>

        <div className="card metric">
          <div className="metric-head">
            <span>Ventas Totales</span>
            <div className="metric-icon">
              <DollarSign size={22} />
            </div>
          </div>
          <strong>{formatMoney(totals?.total_sales ?? 0)}</strong>
          <small>Facturación total</small>
        </div>
      </section>

      {/* Gráfica grande de ventas por mes / semanas del mes */}
      <SalesByPeriodChart />

      {/* Semana en curso (por día) y mes en curso (por semana) */}
      <section className="grid grid-2" style={{ gap: "20px" }}>
        <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>Ventas por Día — Semana Actual</h2>
            <p className="page-kicker">Facturación de lunes a domingo de la semana en curso (cancelados excluidos).</p>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={currentWeekData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
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
                  labelFormatter={(label, payload) => `${label} · ${payload?.[0]?.payload?.pedidos ?? 0} pedidos`}
                />
                <Bar dataKey="ventas" fill="var(--glam-blue)" radius={[4, 4, 0, 0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>
              Ventas por Semana{currentMonthName ? ` — ${currentMonthName}` : " — Mes Actual"}
            </h2>
            <p className="page-kicker">Facturación por semana del mes en curso (cancelados excluidos).</p>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthWeeksData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
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
                  labelFormatter={(label, payload) => `${label} · ${payload?.[0]?.payload?.pedidos ?? 0} pedidos`}
                />
                <Bar dataKey="ventas" fill="var(--glam-blue)" radius={[4, 4, 0, 0]} maxBarSize={64} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Ventas por equipo del mes en curso */}
      <section className="panel p-5" style={{ height: "320px", display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="metric-icon" style={{ width: "36px", height: "36px" }}>
            <Users size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>
              Ventas por Equipo{currentMonthName ? ` — ${currentMonthName}` : ""}
            </h2>
            <p className="page-kicker">Facturación del mes en curso según el equipo del creador del pedido.</p>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {teamSalesData.length === 0 ? (
            <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
              Sin ventas registradas este mes.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamSalesData} layout="vertical" margin={{ top: 4, right: 24, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  style={{ fontSize: "11px", fill: "var(--glam-muted)" }}
                  tickFormatter={(value) => `$${Number(value).toLocaleString("es-MX")}`}
                />
                <YAxis
                  type="category"
                  dataKey="team"
                  tickLine={false}
                  axisLine={false}
                  width={140}
                  style={{ fontSize: "12px", fill: "var(--glam-muted)" }}
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
                  labelFormatter={(label, payload) => `${label} · ${payload?.[0]?.payload?.pedidos ?? 0} pedidos`}
                />
                <Bar dataKey="ventas" fill="var(--glam-navy)" radius={[0, 4, 4, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Grid de Gráficos de Alta Fidelidad */}
      <section className="grid grid-2" style={{ gap: "20px" }}>
        {/* Gráfico 1: Tendencia de Ventas Semanales */}
        <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>Facturación Semanal</h2>
            <p className="page-kicker">Histórico de ingresos monetarios por ventas acumuladas en los últimos 7 días.</p>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklySalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
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
                  formatter={(value) => [`$${value}`, "Ventas"]}
                />
                <Area type="monotone" dataKey="ventas" stroke="var(--glam-blue)" strokeWidth={3} fillOpacity={1} fill="rgba(6, 166, 224, 0.08)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Ventas por Producto Popular */}
        <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>Ingresos por Producto Popular</h2>
            <p className="page-kicker">Distribución de ingresos generados por los productos más comercializados.</p>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {productChartData.length === 0 ? (
              <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
                Sin suficientes datos para generar gráfica.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                  <ChartTooltip
                    contentStyle={{
                      background: "rgba(23, 32, 51, 0.95)",
                      border: "0",
                      borderRadius: "8px",
                      color: "white",
                    }}
                    itemStyle={{ color: "var(--glam-blue)" }}
                    formatter={(value) => [`$${Number(value).toFixed(2)}`, "Ingreso"]}
                  />
                  <Bar dataKey="ventas" fill="var(--glam-navy)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Panel de Tabla de Productos */}
      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>Catálogo de Artículos más Demandados</h2>
            <p className="page-kicker">Desglose completo de unidades vendidas e importe monetario acumulado.</p>
          </div>
          <span className="pill warning">{products.length} productos populares</span>
        </div>
        <DataTable
          rows={products}
          getKey={(row: any) => row.name}
          columns={[
            { key: "name", label: "Producto" },
            { key: "quantity", label: "Unidades Solicitadas" },
            { key: "total", label: "Ingreso Total", render: (row: any) => `$${Number(row.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          ]}
        />
      </section>
    </div>
  );
}
