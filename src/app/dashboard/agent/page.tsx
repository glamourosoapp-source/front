"use client";

import { useEffect, useState } from "react";
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
} from "recharts";
import { Bot, Coins, MessageCircle, PhoneForwarded, ShoppingBag, Users } from "lucide-react";
import { httpClient } from "@/services/http-client";

interface DashboardMetrics {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  avgResponseTimeMs: number;
  totalTokensUsed: number;
  handoffRate: number;
  orderConversionRate: number;
  quoteConversionRate: number;
  topTools: Array<{ tool: string; count: number }>;
  conversationsByDay: Array<{ date: string; count: number }>;
}

const EMPTY: DashboardMetrics = {
  totalConversations: 0,
  activeConversations: 0,
  totalMessages: 0,
  avgResponseTimeMs: 0,
  totalTokensUsed: 0,
  handoffRate: 0,
  orderConversionRate: 0,
  quoteConversionRate: 0,
  topTools: [],
  conversationsByDay: [],
};

function formatDay(value: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AgentMetricsPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    httpClient
      .get<DashboardMetrics>("/metrics/dashboard")
      .then((data) => {
        setMetrics({ ...EMPTY, ...data });
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const toolChartData = metrics.topTools.map((t) => ({
    name: t.tool.length > 16 ? `${t.tool.slice(0, 16)}…` : t.tool,
    usos: t.count,
  }));

  const dayChartData = metrics.conversationsByDay.map((d) => ({
    day: formatDay(d.date),
    conversaciones: d.count,
  }));

  return (
    <div className="page-stack">
      <div className="mb-2">
        <h1 className="page-title">Métricas del Agente IA</h1>
        <p className="page-kicker">
          Actividad del asistente de WhatsApp: conversaciones, consumo de tokens, derivaciones a humano y conversión a pedidos.
        </p>
      </div>

      {loading && <div className="card metric"><span>Cargando métricas…</span></div>}

      {!loading && error && (
        <div className="card metric">
          <span>No se pudieron cargar las métricas</span>
          <small>Verifica que el backend esté disponible y que existan conversaciones registradas.</small>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="grid grid-4">
            <div className="card metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>Conversaciones</span>
                <MessageCircle size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{metrics.totalConversations}</strong>
              <small>{metrics.activeConversations} activas</small>
            </div>

            <div className="card metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>Mensajes</span>
                <Users size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{metrics.totalMessages}</strong>
              <small>Entrantes y salientes</small>
            </div>

            <div className="card metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>Tokens usados</span>
                <Coins size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{metrics.totalTokensUsed.toLocaleString("es-MX")}</strong>
              <small>Consumo acumulado del LLM</small>
            </div>

            <div className="card metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>Derivación a humano</span>
                <PhoneForwarded size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{metrics.handoffRate}%</strong>
              <small>Conversaciones escaladas</small>
            </div>
          </section>

          <section className="grid grid-4">
            <div className="card metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>Conversión a pedido</span>
                <ShoppingBag size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{metrics.orderConversionRate}%</strong>
              <small>Pedidos creados por el agente</small>
            </div>

            <div className="card metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>Conversión a cotización</span>
                <Bot size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{metrics.quoteConversionRate}%</strong>
              <small>Cotizaciones generadas</small>
            </div>

            <div className="card metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>Tiempo de respuesta</span>
                <MessageCircle size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{metrics.avgResponseTimeMs} ms</strong>
              <small>Promedio del agente</small>
            </div>

            <div className="card metric">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span>Activas ahora</span>
                <Bot size={18} style={{ color: "var(--glam-blue)" }} />
              </div>
              <strong>{metrics.activeConversations}</strong>
              <small>Sin finalizar</small>
            </div>
          </section>

          <section className="grid grid-2" style={{ gap: "20px" }}>
            <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
              <div style={{ marginBottom: "16px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--glam-navy)" }}>Conversaciones por día</h2>
                <p className="page-kicker">Volumen diario de conversaciones atendidas por el agente.</p>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {dayChartData.length === 0 ? (
                  <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
                    Sin datos de conversaciones todavía.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dayChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                      <ChartTooltip
                        contentStyle={{ background: "rgba(23, 32, 51, 0.95)", border: "0", borderRadius: "8px", color: "white" }}
                        itemStyle={{ color: "var(--glam-blue)" }}
                        labelStyle={{ color: "#9aa3b5", fontWeight: 800 }}
                      />
                      <Area type="monotone" dataKey="conversaciones" stroke="var(--glam-blue)" strokeWidth={3} fillOpacity={1} fill="rgba(6, 166, 224, 0.08)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
              <div style={{ marginBottom: "16px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--glam-navy)" }}>Herramientas más usadas</h2>
                <p className="page-kicker">Tools de function calling ejecutadas por el agente.</p>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {toolChartData.length === 0 ? (
                  <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
                    El agente aún no ha ejecutado herramientas.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={toolChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                      <ChartTooltip
                        contentStyle={{ background: "rgba(23, 32, 51, 0.95)", border: "0", borderRadius: "8px", color: "white" }}
                        itemStyle={{ color: "var(--glam-blue)" }}
                      />
                      <Bar dataKey="usos" fill="var(--glam-navy)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
