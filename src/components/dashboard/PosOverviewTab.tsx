"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  ChevronDown,
  Receipt,
  Store,
  Ticket,
  Truck,
  Wallet,
} from "lucide-react";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { BranchHealthChip } from "@/components/pos-admin/BranchHealthChip";
import { FilterSegmented } from "@/components/pos-admin/FilterBar";
import {
  BRANCH_TYPE_COPY,
  businessWeekStart,
  relativeDays,
  shiftDateOnly,
  todayInMexico,
} from "@/components/pos-admin/pos-labels";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import type { ReportSummary } from "@/lib/export-pos-reports";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { BranchStats } from "@/types";

interface SeriesPoint {
  day: string;
  total: number;
  tickets: number;
}

interface BranchSeriesRow {
  day: string;
  branchId: string;
  code: string;
  total: number;
  tickets: number;
}

type PivotGranularity = "day" | "week" | "month" | "year";

const PIVOT_OPTIONS: Array<{ value: PivotGranularity; label: string }> = [
  { value: "day", label: "Días" },
  { value: "week", label: "Semanas" },
  { value: "month", label: "Meses" },
  { value: "year", label: "Años" },
];

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Columnas de la tabla de ventas por periodo: las últimas N de cada
 * granularidad, terminando en la de hoy. Las claves son las mismas que manda
 * el Back (`YYYY-MM-DD` del día o del sábado, `YYYY-MM`, `YYYY`).
 */
function pivotBuckets(granularity: PivotGranularity, today: string): { keys: string[]; from: string; to: string } {
  if (granularity === "day") {
    const keys = Array.from({ length: 14 }, (_, i) => shiftDateOnly(today, i - 13));
    return { keys, from: keys[0]!, to: today };
  }
  if (granularity === "week") {
    const thisWeek = businessWeekStart(today);
    const keys = Array.from({ length: 12 }, (_, i) => shiftDateOnly(thisWeek, (i - 11) * 7));
    return { keys, from: keys[0]!, to: today };
  }
  const [year, month] = today.split("-").map(Number) as [number, number];
  if (granularity === "month") {
    const keys = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(year, month - 1 - (11 - i), 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });
    return { keys, from: `${keys[0]}-01`, to: today };
  }
  const keys = Array.from({ length: 5 }, (_, i) => String(year - 4 + i));
  return { keys, from: `${keys[0]}-01-01`, to: today };
}

function pivotLabel(granularity: PivotGranularity, key: string): string {
  if (granularity === "year") return key;
  if (granularity === "month") {
    const [y, m] = key.split("-").map(Number) as [number, number];
    return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
  }
  const [, m, d] = key.split("-").map(Number) as [number, number, number];
  if (granularity === "week") return `sáb ${d} ${MONTH_SHORT[m - 1]}`;
  return weekdayLabel(key);
}

/** Una línea por tienda: colores distinguibles entre sí y con la marca al frente. */
const LINE_COLORS = ["#06a6e0", "#262d60", "#15803d", "#d97706", "#c62828", "#7c3aed", "#0f766e", "#db2777"];

/** "+12 %" / "−8 %" contra el periodo anterior; null cuando no hay con qué comparar. */
function changePct(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function changeLabel(change: number | null): string {
  if (change == null) return "—";
  return `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(0)} %`;
}

function changeColor(change: number | null): string | undefined {
  if (change == null) return undefined;
  return change < 0 ? "#c62828" : "#15803d";
}

type RankPeriod = "today" | "week" | "month" | "last30";

const RANK_PERIODS: Array<{ value: RankPeriod; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "last30", label: "30 días" },
];

/** Cuántas sucursales se ven en el panel antes del "Ver todas". */
const RANK_PREVIEW = 5;

const TOOLTIP_STYLE = {
  background: "rgba(23, 32, 51, 0.95)",
  border: "0",
  borderRadius: "8px",
  color: "white",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
};

/** "vie 15" para el eje: la fecha viene DATEONLY y no debe correrse de día. */
function weekdayLabel(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return dateOnly;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, row) => acc + (pick(row) || 0), 0);
}

/**
 * Pestaña "Punto de venta" del Overview: lo que venden las sucursales en caja,
 * sumado y por sucursal, con la salud de cada una, el surtido abierto y lo que
 * más se vende en el mes. Todo sale de endpoints que ya existen: las cifras por
 * sucursal de `/pos/branches/stats` y la gráfica y el top de `/pos/reports/*`.
 * Los pedidos del CRM (WhatsApp) no entran aquí: son la otra pestaña.
 */
export function PosOverviewTab() {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const seesBranches = can("posBranches", "view");
  const seesReports = can("posReports", "view");

  const [stats, setStats] = useState<BranchStats[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [branchSeries, setBranchSeries] = useState<BranchSeriesRow[]>([]);
  const [monthSummary, setMonthSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankPeriod, setRankPeriod] = useState<RankPeriod>("month");
  const [rankingOpen, setRankingOpen] = useState(false);
  const [pivotGranularity, setPivotGranularity] = useState<PivotGranularity>("month");
  const [pivotRows, setPivotRows] = useState<BranchSeriesRow[]>([]);
  const [pivotLoading, setPivotLoading] = useState(false);

  const load = useCallback(async () => {
    const today = todayInMexico();
    const monthFrom = `${today.slice(0, 7)}-01`;
    const tasks: Promise<void>[] = [];
    if (seesBranches) {
      tasks.push(
        httpClient
          .get<BranchStats[]>("/pos/branches/stats", { type: BRANCH_TYPES.BRANCH })
          .then((rows) => setStats(rows.filter((row) => row.isActive)))
          .catch(() => setStats([]))
      );
    }
    if (seesReports) {
      tasks.push(
        httpClient
          .get<SeriesPoint[]>("/pos/reports/timeseries", {
            from: shiftDateOnly(today, -6),
            to: today,
            granularity: "day",
          })
          .then(setSeries)
          .catch(() => setSeries([])),
        httpClient
          .get<BranchSeriesRow[]>("/pos/reports/timeseries-by-branch", {
            from: shiftDateOnly(today, -6),
            to: today,
          })
          .then(setBranchSeries)
          .catch(() => setBranchSeries([])),
        httpClient
          .get<ReportSummary>("/pos/reports/summary", { from: monthFrom, to: today })
          .then(setMonthSummary)
          .catch(() => setMonthSummary(null))
      );
    }
    await Promise.all(tasks);
    setLoading(false);
  }, [seesBranches, seesReports]);

  // La tabla por periodo pide su propio rango: cambia con la granularidad.
  const loadPivot = useCallback(async () => {
    if (!seesReports) return;
    const { from, to } = pivotBuckets(pivotGranularity, todayInMexico());
    setPivotLoading(true);
    try {
      setPivotRows(
        await httpClient.get<BranchSeriesRow[]>("/pos/reports/timeseries-by-branch", {
          from,
          to,
          granularity: pivotGranularity,
        })
      );
    } catch {
      setPivotRows([]);
    } finally {
      setPivotLoading(false);
    }
  }, [seesReports, pivotGranularity]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPivot();
  }, [loadPivot]);

  // Una venta en caja o un pedido de surtido mueven todo lo de esta pestaña.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "pos_sales_changed" || event.type === "restock_orders_changed") {
        void load();
        void loadPivot();
      }
    });
  }, [subscribe, load, loadPivot]);

  const totals = useMemo(() => {
    const last30 = sum(stats, (row) => row.sales?.last30.total ?? 0);
    const prev30 = sum(stats, (row) => row.sales?.prev30.total ?? 0);
    const last30Tickets = sum(stats, (row) => row.sales?.last30.tickets ?? 0);
    const prev30Tickets = sum(stats, (row) => row.sales?.prev30.tickets ?? 0);
    const avgTicket30 = last30Tickets ? last30 / last30Tickets : 0;
    const avgTicketPrev30 = prev30Tickets ? prev30 / prev30Tickets : 0;
    return {
      avgTicket30,
      avgTicketChange: changePct(avgTicket30, avgTicketPrev30),
      today: sum(stats, (row) => row.sales?.today.total ?? 0),
      ticketsToday: sum(stats, (row) => row.sales?.today.tickets ?? 0),
      week: sum(stats, (row) => row.sales?.week.total ?? 0),
      ticketsWeek: sum(stats, (row) => row.sales?.week.tickets ?? 0),
      month: sum(stats, (row) => row.sales?.month.total ?? 0),
      ticketsMonth: sum(stats, (row) => row.sales?.month.tickets ?? 0),
      last30,
      change30: changePct(last30, prev30),
      alerts: stats.filter((row) => row.health.level !== "good").length,
      critical: stats.filter((row) => row.health.level === "critical").length,
      openRestock: sum(stats, (row) => row.restock.openCount),
      belowMin: sum(stats, (row) => row.inventory?.belowMinCount ?? 0),
    };
  }, [stats]);

  const seriesData = useMemo(
    () =>
      series.map((point) => ({
        day: weekdayLabel(point.day),
        ventas: Number(point.total || 0),
        tickets: Number(point.tickets || 0),
      })),
    [series]
  );

  const branchLines = useMemo(() => {
    const today = todayInMexico();
    const days = Array.from({ length: 7 }, (_, i) => shiftDateOnly(today, i - 6));
    // Orden de las líneas: la que más vendió en la semana primero, así la
    // leyenda y los colores coinciden con el ranking.
    const totals = new Map<string, number>();
    for (const row of branchSeries) totals.set(row.code, (totals.get(row.code) ?? 0) + row.total);
    const codes = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);
    const data = days.map((day) => {
      const point: Record<string, number | string> = { day: weekdayLabel(day) };
      for (const code of codes) point[code] = 0;
      for (const row of branchSeries) if (row.day === day) point[row.code] = row.total;
      return point;
    });
    return { codes, data };
  }, [branchSeries]);

  const pivot = useMemo(() => {
    const { keys } = pivotBuckets(pivotGranularity, todayInMexico());
    // Filas: las sucursales activas (aunque no hayan vendido) más cualquier
    // código que aparezca en la serie y ya no esté activo.
    const branchRows = new Map<string, { code: string; name: string; branchId: string | null }>();
    for (const row of stats) branchRows.set(row.code, { code: row.code, name: row.name, branchId: row.branchId });
    for (const row of pivotRows) {
      if (!branchRows.has(row.code)) branchRows.set(row.code, { code: row.code, name: "", branchId: row.branchId });
    }
    const cells = new Map<string, number>();
    for (const row of pivotRows) cells.set(`${row.code}|${row.day}`, row.total);
    const rows = [...branchRows.values()]
      .map((branch) => {
        const values = keys.map((key) => cells.get(`${branch.code}|${key}`) ?? 0);
        return { ...branch, values, total: values.reduce((acc, value) => acc + value, 0) };
      })
      .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
    const columnTotals = keys.map((_, i) => rows.reduce((acc, row) => acc + row.values[i]!, 0));
    return { keys, rows, columnTotals, grandTotal: columnTotals.reduce((acc, value) => acc + value, 0) };
  }, [stats, pivotRows, pivotGranularity]);

  const topProducts = useMemo(
    () => [...(monthSummary?.products ?? [])].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    [monthSummary]
  );

  /** Ranking de sucursales por lo vendido en el periodo elegido, con su parte del total. */
  const ranking = useMemo(() => {
    const rows = stats.map((row) => {
      const period = row.sales?.[rankPeriod];
      return {
        branchId: row.branchId,
        code: row.code,
        name: row.name,
        health: row.health,
        lastSaleAt: row.sales?.lastSaleAt ?? null,
        change30: changePct(row.sales?.last30.total ?? 0, row.sales?.prev30.total ?? 0),
        belowMin: row.inventory?.belowMinCount ?? null,
        total: period?.total ?? 0,
        tickets: period?.tickets ?? 0,
        avgTicket: period?.avgTicket ?? 0,
      };
    });
    const grand = rows.reduce((acc, row) => acc + row.total, 0);
    return rows
      .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))
      .map((row) => ({ ...row, share: grand > 0 ? (row.total / grand) * 100 : 0 }));
  }, [stats, rankPeriod]);
  const rankingTop = ranking[0]?.total ?? 0;

  /** La misma tabla para el panel (recortada) y el modal (completa). */
  function renderRankingTable(rows: typeof ranking, full = false) {
    return (
          <div className="table-container-premium">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Sucursal</th>
                  <th style={{ textAlign: "right" }}>Ventas</th>
                  <th style={{ textAlign: "right" }}>Tickets</th>
                  <th style={{ textAlign: "right" }}>Ticket prom.</th>
                  <th style={{ minWidth: 140 }}>Parte del total</th>
                  <th style={{ textAlign: "right" }}>vs 30 ant.</th>
                  <th>Última venta</th>
                  {full ? <th style={{ textAlign: "right" }}>Bajo mínimo</th> : null}
                  <th>Salud</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.branchId}>
                    <td style={{ fontWeight: 700, color: index < 3 ? "var(--glam-blue)" : "var(--muted)" }}>
                      {index + 1}
                    </td>
                    <td>
                      <Link
                        href={`${BRANCH_TYPE_COPY.branch.listHref}/${row.branchId}`}
                        style={{ color: "var(--glam-navy)", fontWeight: 700, textDecoration: "none" }}
                      >
                        {row.code}
                      </Link>
                      <div className="page-kicker" style={{ margin: 0 }}>{row.name}</div>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--glam-navy)" }}>
                      {formatMoney(row.total)}
                    </td>
                    <td style={{ textAlign: "right" }}>{row.tickets}</td>
                    <td style={{ textAlign: "right" }}>{row.tickets ? formatMoney(row.avgTicket) : "—"}</td>
                    <td>
                      {/* Barra proporcional al primero: se ve la distancia sin comparar cifras. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#eef2f7", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${rankingTop > 0 ? (row.total / rankingTop) * 100 : 0}%`,
                              height: "100%",
                              background: index === 0 ? "var(--glam-blue)" : "var(--glam-navy)",
                              opacity: index === 0 ? 1 : 0.55,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 38, textAlign: "right" }}>
                          {row.share.toFixed(0)} %
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: changeColor(row.change30) }}>
                      {changeLabel(row.change30)}
                    </td>
                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{relativeDays(row.lastSaleAt)}</td>
                    {full ? (
                      <td style={{ textAlign: "right", fontWeight: 700, color: row.belowMin ? "#c62828" : undefined }}>
                        {row.belowMin == null ? "—" : row.belowMin}
                      </td>
                    ) : null}
                    <td>
                      <BranchHealthChip health={row.health} />
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={full ? 10 : 9} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                      {loading ? "Cargando..." : seesBranches ? "No hay sucursales activas." : "Necesita el permiso de sucursales."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
    );
  }

  if (!seesBranches && !seesReports) {
    return (
      <div className="panel p-5" style={{ color: "var(--muted)" }}>
        Tu perfil no tiene acceso a las cifras del punto de venta.
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="grid grid-5">
        <div className="card metric">
          <div className="metric-head">
            <span>Ventas en caja hoy</span>
            <div className="metric-icon">
              <Wallet size={22} />
            </div>
          </div>
          <strong>{formatMoney(totals.today)}</strong>
          <small>
            {totals.ticketsToday} {totals.ticketsToday === 1 ? "ticket" : "tickets"} en {stats.length}{" "}
            {stats.length === 1 ? "sucursal" : "sucursales"}
          </small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Semana en curso</span>
            <div className="metric-icon">
              <CalendarDays size={22} />
            </div>
          </div>
          <strong>{formatMoney(totals.week)}</strong>
          <small>{totals.ticketsWeek} tickets, sábado a viernes</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Mes en curso</span>
            <div className="metric-icon">
              <Receipt size={22} />
            </div>
          </div>
          <strong>{formatMoney(totals.month)}</strong>
          <small>{totals.ticketsMonth} tickets este mes</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Últimos 30 días</span>
            <div className="metric-icon">
              <Store size={22} />
            </div>
          </div>
          <strong>{formatMoney(totals.last30)}</strong>
          <small
            style={{
              color:
                totals.change30 == null ? undefined : totals.change30 < 0 ? "#c62828" : "#15803d",
            }}
          >
            {totals.change30 == null
              ? "Sin 30 días anteriores para comparar"
              : `${totals.change30 >= 0 ? "+" : ""}${totals.change30.toFixed(0)} % contra los 30 anteriores`}
          </small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Atención</span>
            <div className="metric-icon">
              <AlertTriangle size={22} />
            </div>
          </div>
          <strong style={{ color: totals.critical ? "#c62828" : totals.alerts ? "#d97706" : undefined }}>
            {totals.alerts}
          </strong>
          <small>
            {totals.critical
              ? `${totals.critical} en estado crítico`
              : totals.alerts
                ? "Sucursales con aviso"
                : "Todas las sucursales sanas"}
          </small>
        </div>
      </section>

      <section className="grid grid-2-even" style={{ gap: "20px" }}>
        <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>
              Ventas en caja — Últimos 7 días
            </h2>
            <p className="page-kicker">Todas las sucursales, por día de negocio, anulados excluidos.</p>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {!seesReports ? (
              <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
                Necesita el permiso de cortes y reportes.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={seriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                  <ChartTooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "var(--glam-blue)" }}
                    labelStyle={{ color: "#9aa3b5", fontWeight: 700 }}
                    formatter={(value) => [formatMoney(Number(value)), "Ventas"]}
                    labelFormatter={(label, payload) => `${label} · ${payload?.[0]?.payload?.tickets ?? 0} tickets`}
                  />
                  <Area type="monotone" dataKey="ventas" stroke="var(--glam-blue)" strokeWidth={3} fillOpacity={1} fill="rgba(6, 166, 224, 0.08)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="panel p-5" style={{ height: "340px", display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)" }}>Por sucursal — Últimos 7 días</h2>
            <p className="page-kicker">Una línea por tienda: quién bajó y qué día.</p>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {!seesReports ? (
              <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
                Necesita el permiso de cortes y reportes.
              </div>
            ) : branchLines.codes.length === 0 ? (
              <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--glam-muted)", fontSize: "13px" }}>
                {loading ? "Cargando..." : "Sin ventas en caja en los últimos 7 días."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={branchLines.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: "11px", fill: "var(--glam-muted)" }} />
                  <ChartTooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "#9aa3b5", fontWeight: 700 }}
                    formatter={(value, name) => [formatMoney(Number(value)), String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {branchLines.codes.map((code, index) => (
                    <Line
                      key={code}
                      type="monotone"
                      dataKey={code}
                      stroke={LINE_COLORS[index % LINE_COLORS.length]}
                      strokeWidth={index === 0 ? 3 : 2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar" style={{ padding: "16px 20px 0", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)", margin: 0 }}>Ventas por periodo</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Cada sucursal y el total de todas, por{" "}
              {pivotGranularity === "day"
                ? "día de negocio (últimos 14)"
                : pivotGranularity === "week"
                  ? "semana de negocio, sábado a viernes (últimas 12)"
                  : pivotGranularity === "month"
                    ? "mes (últimos 12)"
                    : "año (últimos 5)"}
              . El último periodo es el que está en curso.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <FilterSegmented label="Periodo" options={PIVOT_OPTIONS} value={pivotGranularity} onChange={setPivotGranularity} />
            <Link href="/dashboard/pos/cortes" style={{ color: "var(--glam-blue)", fontSize: 13, fontWeight: 600 }}>
              Ver reportes
            </Link>
          </div>
        </div>
        <div className="table-container-premium" style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "inherit", zIndex: 1 }}>Sucursal</th>
                {pivot.keys.map((key, i) => (
                  <th
                    key={key}
                    style={{
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      color: i === pivot.keys.length - 1 ? "var(--glam-blue)" : undefined,
                    }}
                  >
                    {pivotLabel(pivotGranularity, key)}
                  </th>
                ))}
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map((row) => (
                <tr key={row.code}>
                  <td style={{ position: "sticky", left: 0, background: "var(--card)", zIndex: 1, whiteSpace: "nowrap" }}>
                    {row.branchId ? (
                      <Link
                        href={`${BRANCH_TYPE_COPY.branch.listHref}/${row.branchId}`}
                        style={{ color: "var(--glam-navy)", fontWeight: 700, textDecoration: "none" }}
                      >
                        {row.code}
                      </Link>
                    ) : (
                      <strong>{row.code}</strong>
                    )}
                    {row.name ? <div className="page-kicker" style={{ margin: 0 }}>{row.name}</div> : null}
                  </td>
                  {row.values.map((value, i) => (
                    <td
                      key={pivot.keys[i]}
                      style={{
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        color: value ? undefined : "var(--muted)",
                        fontWeight: i === pivot.keys.length - 1 && value ? 700 : 400,
                      }}
                    >
                      {value ? formatMoney(value) : "—"}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--glam-navy)", whiteSpace: "nowrap" }}>
                    {formatMoney(row.total)}
                  </td>
                </tr>
              ))}
              {!pivot.rows.length ? (
                <tr>
                  <td colSpan={pivot.keys.length + 2} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                    {pivotLoading || loading ? "Cargando..." : seesReports ? "Sin ventas en el periodo." : "Necesita el permiso de cortes y reportes."}
                  </td>
                </tr>
              ) : null}
            </tbody>
            {pivot.rows.length ? (
              <tfoot>
                <tr style={{ background: "#f4f7fb" }}>
                  <td style={{ position: "sticky", left: 0, background: "#f4f7fb", zIndex: 1, fontWeight: 700 }}>
                    Todas las sucursales
                  </td>
                  {pivot.columnTotals.map((value, i) => (
                    <td key={pivot.keys[i]} style={{ textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {value ? formatMoney(value) : "—"}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", fontWeight: 800, color: "var(--glam-navy)", whiteSpace: "nowrap" }}>
                    {formatMoney(pivot.grandTotal)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card metric">
          <div className="metric-head">
            <span>Surtido abierto</span>
            <div className="metric-icon">
              <Truck size={22} />
            </div>
          </div>
          <strong style={{ color: totals.openRestock ? "#d97706" : undefined }}>{totals.openRestock}</strong>
          <small>
            <Link href="/dashboard/fabrica" style={{ color: "var(--glam-blue)" }}>
              Pedidos a fábrica sin enviar
            </Link>
          </small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Bajo mínimo</span>
            <div className="metric-icon">
              <Boxes size={22} />
            </div>
          </div>
          <strong style={{ color: totals.belowMin ? "#c62828" : undefined }}>{totals.belowMin}</strong>
          <small>
            <Link href="/dashboard/pos/surtido" style={{ color: "var(--glam-blue)" }}>
              Productos por debajo del mínimo, todas las sucursales
            </Link>
          </small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Ticket promedio</span>
            <div className="metric-icon">
              <Ticket size={22} />
            </div>
          </div>
          <strong>{formatMoney(totals.avgTicket30)}</strong>
          <small style={{ color: changeColor(totals.avgTicketChange) }}>
            {totals.avgTicketChange == null
              ? "Últimos 30 días, sin comparación"
              : `${changeLabel(totals.avgTicketChange)} contra los 30 días anteriores`}
          </small>
        </div>
      </section>

      <section className="page-stack">
        <div className="panel">
          <div className="toolbar" style={{ padding: "16px 20px 0", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)", margin: 0 }}>Top de sucursales</h2>
              <p className="page-kicker" style={{ margin: 0 }}>Las que más venden en caja, de mayor a menor.</p>
            </div>
            <FilterSegmented label="Periodo" options={RANK_PERIODS} value={rankPeriod} onChange={setRankPeriod} />
          </div>
          {renderRankingTable(ranking.slice(0, RANK_PREVIEW))}
          {ranking.length > RANK_PREVIEW ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 14px" }}>
              <Button
                variant="text"
                endIcon={<ChevronDown size={16} />}
                onClick={() => setRankingOpen(true)}
                sx={{ fontWeight: 700 }}
              >
                Ver todas ({ranking.length})
              </Button>
            </div>
          ) : null}
        </div>

        <Dialog open={rankingOpen} onClose={() => setRankingOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <span>Top de sucursales · {RANK_PERIODS.find((option) => option.value === rankPeriod)?.label}</span>
            <FilterSegmented label="Periodo" options={RANK_PERIODS} value={rankPeriod} onChange={setRankPeriod} />
          </DialogTitle>
          <DialogContent sx={{ p: 0 }}>{renderRankingTable(ranking, true)}</DialogContent>
          <DialogActions>
            <Button onClick={() => setRankingOpen(false)}>Cerrar</Button>
          </DialogActions>
        </Dialog>

        <div className="panel">
          <div className="toolbar" style={{ padding: "16px 20px 0" }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)", margin: 0 }}>Lo más vendido en caja</h2>
              <p className="page-kicker" style={{ margin: 0 }}>Mes en curso, todas las sucursales, por importe.</p>
            </div>
            <Link href="/dashboard/pos/cortes" style={{ color: "var(--glam-blue)", fontSize: 13, fontWeight: 600 }}>
              Ver reportes
            </Link>
          </div>
          <div className="table-container-premium">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product) => (
                  <tr key={`${product.name}-${product.saleUnit}`}>
                    <td>
                      <strong>{product.name}</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatQuantity(product.quantity)} {product.saleUnit === "liter" ? "L" : "pz"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(product.revenue)}</td>
                  </tr>
                ))}
                {!topProducts.length ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                      {loading ? "Cargando..." : seesReports ? "Sin ventas este mes." : "Necesita el permiso de cortes y reportes."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
