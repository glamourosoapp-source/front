"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@mui/material";
import { httpClient } from "@/services/http-client";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { DataTable } from "@/components/ui/DataTable";
import { MONTH_LONG } from "@/components/dashboard/SalesByPeriodChart";
import { TopProductsDialog } from "@/components/dashboard/TopProductsDialog";
import type { DashboardTopProducts } from "@glamouroso/shared/schemas/dashboard";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
} from "recharts";

/** Cuántos productos se pintan en la gráfica y en la tabla resumen del panel. */
const SUMMARY_LIMIT = 5;

function formatMoney(value: number): string {
  return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Los nombres del catálogo son largos y en mayúsculas: el eje X solo aguanta un pedazo. */
function shortName(name: string): string {
  return name.length > 15 ? `${name.slice(0, 15)}…` : name;
}

/**
 * Top de productos por ingreso del periodo elegido: un mes, un año completo o todo el
 * histórico. Arranca en el mes en curso y comparte periodo entre la gráfica, la tabla
 * resumen y la lista larga de "Ver más". Excluye cancelados, igual que el resto del
 * dashboard.
 */
export function TopProductsByPeriod() {
  const now = new Date();
  // `year: null` es "Todo el tiempo"; con año, `month: null` es el año completo.
  const [year, setYear] = useState<number | null>(() => now.getFullYear());
  const [month, setMonth] = useState<number | null>(() => now.getMonth() + 1);
  const [data, setData] = useState<DashboardTopProducts | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const fetchTopProducts = useCallback(
    (silent: boolean) => {
      if (!silent) setLoading(true);
      const params: Record<string, unknown> = { limit: SUMMARY_LIMIT };
      if (year !== null) params.year = year;
      if (year !== null && month !== null) params.month = month;
      return httpClient
        .get<DashboardTopProducts>("/dashboard/top-products", params)
        .then((result) => {
          setData(result);
          setFailed(false);
        })
        .catch(() => {
          // Un refresco silencioso que falla deja lo que ya estaba en pantalla; una carga
          // normal que falla lo dice, porque "sin ventas" y "no cargó" no son lo mismo.
          if (silent) return;
          setData(null);
          setFailed(true);
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [year, month]
  );

  useEffect(() => {
    fetchTopProducts(false);
  }, [fetchTopProducts]);

  // Un periodo que no incluye hoy no puede cambiar en vivo: no vale la pena refetchear.
  const today = new Date();
  const showsToday =
    year === null || (year === today.getFullYear() && (month === null || month === today.getMonth() + 1));

  const { subscribe } = useRealtime();
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    if (!showsToday) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribe((event) => {
      if (event.type !== "orders_changed") return;
      if (timer) return;
      const wait = Math.max(0, 5_000 - (Date.now() - lastRefreshRef.current));
      timer = setTimeout(() => {
        timer = null;
        lastRefreshRef.current = Date.now();
        fetchTopProducts(true);
      }, wait);
    });
    return () => {
      if (timer) clearTimeout(timer);
      off();
    };
  }, [showsToday, subscribe, fetchTopProducts]);

  const periodLabel = year === null ? "Todo el tiempo" : month ? `${MONTH_LONG[month - 1]} ${year}` : `${year}`;
  const years = data?.availableYears?.length ? data.availableYears : year !== null ? [year] : [];
  const products = data?.products ?? [];
  const chartData = products.map((product) => ({
    name: shortName(product.name),
    fullName: product.name,
    ingreso: product.total,
    cantidad: product.quantity,
  }));
  const tableRows = products.map((product, index) => ({
    rank: index + 1,
    name: product.name,
    quantity: product.quantity,
    total: product.total,
  }));

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>
            Ingresos por Producto Popular — {periodLabel}
          </h2>
          <p className="page-kicker">
            Top {SUMMARY_LIMIT} productos por ingreso en el periodo (pedidos cancelados excluidos).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!loading && data && <span className="pill warning">{formatMoney(data.totalSales)} en productos</span>}
          <select
            className="input"
            style={{ width: "auto", minHeight: "36px", padding: "6px 10px" }}
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
            disabled={year === null}
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
            value={year ?? ""}
            onChange={(e) => {
              // "Todo el tiempo" no admite mes: el histórico completo cruza años.
              if (!e.target.value) {
                setYear(null);
                setMonth(null);
                return;
              }
              setYear(Number(e.target.value));
            }}
            aria-label="Año"
          >
            <option value="">Todo el tiempo</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ height: "280px" }}>
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
            Cargando productos…
          </div>
        ) : failed ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
            No se pudieron cargar los productos. Revisa la conexión con el servidor.
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
            Sin ventas registradas en {periodLabel.toLowerCase()}.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
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
                formatter={(value) => [formatMoney(Number(value)), "Ingreso"]}
                labelFormatter={(label, payload) => {
                  const row = payload?.[0]?.payload as { fullName?: string; cantidad?: number } | undefined;
                  return `${row?.fullName ?? label} · ${row?.cantidad ?? 0} unidades`;
                }}
              />
              <Bar dataKey="ingreso" fill="var(--glam-navy)" radius={[4, 4, 0, 0]} maxBarSize={64} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--glam-navy)" }}>
              Catálogo de Artículos más Demandados — {periodLabel}
            </h3>
            <p className="page-kicker">Desglose de unidades vendidas e importe monetario del periodo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill warning">{products.length} productos populares</span>
            {/* Siempre habilitado: el diálogo trae su propio filtro, así que se puede abrir
                en un mes vacío justamente para irse a otro periodo. */}
            <Button variant="outlined" size="small" onClick={() => setListOpen(true)}>
              Ver más
            </Button>
          </div>
        </div>
        <DataTable
          rows={tableRows}
          getKey={(row: any) => row.name}
          columns={[
            { key: "rank", label: "Lugar", render: (row: any) => `#${row.rank}` },
            { key: "name", label: "Producto" },
            { key: "quantity", label: "Unidades Solicitadas" },
            { key: "total", label: "Ingreso Total", render: (row: any) => formatMoney(Number(row.total || 0)) },
          ]}
        />
      </div>

      {/* Se monta al abrir para que cada apertura arranque en el periodo del panel. */}
      {listOpen ? (
        <TopProductsDialog
          onClose={() => setListOpen(false)}
          initialYear={year}
          initialMonth={month}
          availableYears={years}
        />
      ) : null}
    </section>
  );
}
