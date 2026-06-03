"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { httpClient } from "@/services/http-client";
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
import { ShoppingBag, TrendingUp, DollarSign, Activity } from "lucide-react";

// Mock data for executive weekly trend visual
const weeklySalesData = [
  { day: "Lun", ventas: 1200, pedidos: 14 },
  { day: "Mar", ventas: 1900, pedidos: 22 },
  { day: "Mié", ventas: 1700, pedidos: 18 },
  { day: "Jue", ventas: 2400, pedidos: 29 },
  { day: "Vie", ventas: 3100, pedidos: 35 },
  { day: "Sáb", ventas: 2800, pedidos: 30 },
  { day: "Dom", ventas: 3500, pedidos: 42 },
];

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    httpClient
      .get("/dashboard/overview")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const totals = data?.totals || {};
  const products = data?.topProducts || [];

  // Parse chart data for top products
  const productChartData = products.map((p: any) => ({
    name: p.name.length > 15 ? p.name.slice(0, 15) + "..." : p.name,
    ventas: Number(p.total || 0),
    cantidad: Number(p.quantity || 0),
  }));

  return (
    <div className="page-stack">
      <div className="mb-2">
        <h1 className="page-title">Overview Ejecutivo</h1>
        <p className="page-kicker">
          Análisis en tiempo real de facturación, volumen de pedidos y métricas clave del CRM.
        </p>
      </div>

      {/* Grid de Tarjetas Métricas */}
      <section className="grid grid-4">
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Pedidos Hoy</span>
            <Activity size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{totals.orders_today || 0}</strong>
          <small>Flujo diario activo</small>
        </div>

        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Pedidos Nuevos</span>
            <ShoppingBag size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{totals.new_orders || 0}</strong>
          <small>Por atender en cola</small>
        </div>

        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Pedidos Totales</span>
            <TrendingUp size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{totals.total_orders || 0}</strong>
          <small>Historial acumulado</small>
        </div>

        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Ventas Totales</span>
            <DollarSign size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>${Number(totals.total_sales || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          <small>Facturación total</small>
        </div>
      </section>

      {/* Grid de Gráficos de Alta Fidelidad */}
      <section className="grid grid-2" style={{ gap: "20px" }}>
        {/* Gráfico 1: Tendencia de Ventas Semanales */}
        <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--glam-navy)" }}>Facturación Semanal</h2>
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
                  labelStyle={{ color: "#9aa3b5", fontWeight: 800 }}
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
            <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--glam-navy)" }}>Ingresos por Producto Popular</h2>
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
            <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--glam-navy)" }}>Catálogo de Artículos más Demandados</h2>
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
