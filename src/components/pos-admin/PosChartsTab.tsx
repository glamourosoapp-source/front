"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Tooltip } from "@mui/material";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Clock, Crown, Droplets, TrendingDown, TrendingUp } from "lucide-react";
import { BRANCH_TYPES, POS_PAYMENT_METHODS, posPaymentMethodLabel } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatMoneyShort, formatQuantity } from "@/lib/format-money";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { ReportSummary } from "@/lib/export-pos-reports";
import type { Branch } from "@/types";
import { toast } from "sonner";
import { periodBounds, previousPeriod, type PeriodValue } from "./PeriodPicker";
import { shiftDateOnly, todayInMexico } from "./pos-labels";

/* ---- Datos que llegan del Back ---- */

interface BranchSalesRow {
  branchId: string;
  code: string;
  name: string;
  total: number;
  ticketsCount: number;
  avgTicket: number;
}

interface SeriesPoint {
  day: string;
  total: number;
  tickets: number;
}

interface HourPoint {
  hour: number;
  total: number;
  tickets: number;
}

interface HeatCell {
  dow: number;
  hour: number;
  total: number;
  tickets: number;
}

interface BranchDayRow {
  day: string;
  branchId: string;
  paymentMethod: string;
  total: number;
}

interface ChartData {
  branches: BranchSalesRow[];
  prevBranches: BranchSalesRow[];
  summary: ReportSummary | null;
  prevSummary: ReportSummary | null;
  series: SeriesPoint[];
  prevSeries: SeriesPoint[];
  hours: HourPoint[];
  prevHours: HourPoint[];
  heat: HeatCell[];
  payments: BranchDayRow[];
}

/* ---- Paleta ----
   Una serie = un color (navy). La comparación va en gris de contexto. Las
   formas de pago usan los mismos tres colores que las tarjetas de día
   (validados: CVD ΔE ≥ 16; el azul pide etiqueta visible, que la llevan).
   Subir y bajar son estado: siempre con flecha y texto, nunca solo color. */
const NAVY = "#262d60";
const CONTEXT = "#b8c0cc";
const UP = "#15803d";
const DOWN = "#c62828";
const PAYMENTS = [
  { key: POS_PAYMENT_METHODS.CASH, color: "#16a34a" },
  { key: POS_PAYMENT_METHODS.CARD, color: "#06a6e0" },
  { key: POS_PAYMENT_METHODS.TRANSFER, color: "#7c3aed" },
];

const TOOLTIP_STYLE = {
  background: "rgba(23, 32, 51, 0.95)",
  border: "0",
  borderRadius: "8px",
  color: "white",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
};
const AXIS_STYLE = { fontSize: "11px", fill: "var(--glam-muted)" };

/** Semana del punto de venta: los renglones del mapa de calor van de viernes a jueves. */
const HEAT_ROWS = [5, 6, 0, 1, 2, 3, 4];
const DOW_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DOW_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Más días que esto y la tendencia va por semana, no por día. */
const MAX_DAILY_POINTS = 92;

const dayLabel = (day: string) =>
  `${DOW_SHORT[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${Number(day.slice(8, 10))} ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}`;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Cambio porcentual; `null` cuando antes no hubo venta (no hay contra qué comparar). */
function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

const pct = (value: number) => `${value.toLocaleString("es-MX", { maximumFractionDigits: 0 })}%`;

function currentHourInMexico(): number {
  return Number(
    new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hour12: false })
  ) % 24;
}

/* ---- Piezas ---- */

/** Subió / bajó con flecha y texto: el color acompaña, no carga el significado solo. */
export function Delta({ value, emptyLabel = "sin venta antes" }: { value: number | null; emptyLabel?: string }) {
  if (value === null) return <span className="chart-delta is-neutral">{emptyLabel}</span>;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="chart-delta is-neutral">igual</span>;
  const up = rounded > 0;
  return (
    <span className={`chart-delta ${up ? "is-up" : "is-down"}`}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {up ? "+" : "−"}
      {pct(Math.abs(rounded))}
    </span>
  );
}

function Panel({
  title,
  kicker,
  children,
  aside,
  className = "",
}: {
  title: string;
  kicker: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel chart-panel ${className}`}>
      <header className="chart-panel-head">
        <div>
          <h2>{title}</h2>
          <p>{kicker}</p>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="chart-empty">{children}</div>;
}

/** Leyenda de dos o más series: siempre presente, con la marca al lado del texto. */
function Legend({ items }: { items: Array<{ label: string; color: string; line?: boolean }> }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label}>
          <i className={item.line ? "is-line" : ""} style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Pestaña Gráficas de Cortes, pensada para el dueño de varias sucursales:
 * cómo va contra el periodo anterior, qué tienda empuja y cuál se cae, el
 * ritmo del periodo, cuándo entra la gente, qué se vende y cuánto efectivo
 * debe llegar. Respeta los mismos filtros de sucursales y periodo que el resto
 * de la página.
 */
export function PosChartsTab({
  period,
  branchIds,
  branches,
}: {
  period: PeriodValue;
  branchIds: string[];
  branches: Branch[];
}) {
  const { subscribe } = useRealtime();
  const today = todayInMexico();
  const isDay = period.granularity === "day";
  const { from, to } = periodBounds(period);
  const prev = useMemo(() => previousPeriod(period, today), [period, today]);
  // Lo que todavía no pasa no se dibuja: una semana en curso termina hoy.
  const end = to > today ? today : to;
  const length = from > end ? 1 : daysBetween(from, end);
  const weekly = length > MAX_DAILY_POINTS;
  // Con menos de una semana el mapa de calor no dice nada: se miran las 4 semanas que cierran el periodo.
  const heatFrom = length < 7 ? shiftDateOnly(end, -27) : from;

  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const scope = branchIds.length ? { branchIds: branchIds.join(",") } : {};
    const current = { from, to: end, ...scope };
    const previous = { from: prev.from, to: prev.to, ...scope };
    const granularity = weekly ? "week" : "day";
    try {
      const [branchesRes, prevBranchesRes, summary, prevSummary, series, prevSeries, heat, payments, hours, prevHours] =
        await Promise.all([
          httpClient.get<BranchSalesRow[]>("/pos/reports/sales-by-branch", current),
          httpClient.get<BranchSalesRow[]>("/pos/reports/sales-by-branch", previous),
          httpClient.get<ReportSummary>("/pos/reports/summary", current),
          httpClient.get<ReportSummary>("/pos/reports/summary", previous),
          httpClient.get<SeriesPoint[]>("/pos/reports/timeseries", { ...current, granularity }),
          httpClient.get<SeriesPoint[]>("/pos/reports/timeseries", { ...previous, granularity }),
          httpClient.get<HeatCell[]>("/pos/reports/heatmap", { ...current, from: heatFrom }),
          httpClient.get<BranchDayRow[]>("/pos/reports/branch-days", current),
          isDay ? httpClient.get<HourPoint[]>("/pos/reports/hours", current) : Promise.resolve([]),
          isDay ? httpClient.get<HourPoint[]>("/pos/reports/hours", previous) : Promise.resolve([]),
        ]);
      setData({
        branches: branchesRes,
        prevBranches: prevBranchesRes,
        summary,
        prevSummary,
        series,
        prevSeries,
        hours,
        prevHours,
        heat,
        payments,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las gráficas"));
    } finally {
      setLoading(false);
    }
  }, [branchIds, from, end, prev.from, prev.to, weekly, heatFrom, isDay]);

  useEffect(() => {
    void load();
  }, [load]);

  // Un cobro mueve las cifras; varios seguidos se juntan en una sola recarga.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== "pos_sales_changed") return;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void load(), 3000);
    });
    return () => {
      unsubscribe();
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [subscribe, load]);

  /* ---- Ranking de sucursales ---- */
  const ranking = useMemo(() => {
    if (!data) return { rows: [], total: 0, prevTotal: 0 };
    const known = new Map(branches.map((branch) => [branch.id, branch]));
    const prevById = new Map(data.prevBranches.map((row) => [row.branchId, row]));
    const rows = data.branches
      .filter((row) => {
        const branch = known.get(row.branchId);
        if (branch?.type === BRANCH_TYPES.FRANCHISE) return false;
        // Una tienda dada de baja solo estorba si no vendió nada.
        return branch?.isActive !== false || row.total > 0;
      })
      .map((row) => {
        const before = prevById.get(row.branchId);
        return { ...row, prevTotal: before?.total ?? 0, delta: change(row.total, before?.total ?? 0) };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
    return {
      rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
      prevTotal: rows.reduce((sum, row) => sum + row.prevTotal, 0),
    };
  }, [data, branches]);
  const maxBranch = Math.max(1, ...ranking.rows.map((row) => row.total));

  /* ---- Tendencia: por día (o semana) contra el periodo anterior, alineados por posición ---- */
  const trend = useMemo(() => {
    if (!data) return [];
    if (isDay) {
      // Acumulado por hora: dice si el día va arriba o abajo del mismo día de la semana pasada.
      const nowHour = period.anchor === today ? currentHourInMexico() : 23;
      const active = [...data.hours, ...data.prevHours].filter((point) => point.tickets > 0).map((p) => p.hour);
      // Una hora antes de la primera venta, para que las dos líneas salgan de cero.
      const first = active.length ? Math.max(0, Math.min(...active) - 1) : 8;
      const last = active.length ? Math.max(...active, period.anchor === today ? nowHour : 0) : 20;
      let current = 0;
      let before = 0;
      const rows: Array<{ label: string; current: number | null; previous: number; hint: string }> = [];
      for (let hour = 0; hour <= 23; hour++) {
        current += data.hours.find((point) => point.hour === hour)?.total ?? 0;
        before += data.prevHours.find((point) => point.hour === hour)?.total ?? 0;
        if (hour < first || hour > last) continue;
        rows.push({
          label: `${hour}h`,
          current: hour <= nowHour ? current : null,
          previous: before,
          hint: `hasta las ${hour + 1}:00`,
        });
      }
      return rows;
    }
    const step = weekly ? 7 : 1;
    const count = Math.ceil(length / step);
    const byKey = (points: SeriesPoint[]) => new Map(points.map((point) => [point.day, point.total]));
    const currentMap = byKey(data.series);
    const prevMap = byKey(data.prevSeries);
    const rows = [];
    for (let i = 0; i < count; i++) {
      const day = shiftDateOnly(from, i * step);
      const prevDay = shiftDateOnly(prev.from, i * step);
      // Por semana, el Back devuelve la clave del viernes de cada semana.
      const currentKey = weekly ? [...currentMap.keys()].find((key) => key <= day && shiftDateOnly(key, 6) >= day) : day;
      const prevKey = weekly ? [...prevMap.keys()].find((key) => key <= prevDay && shiftDateOnly(key, 6) >= prevDay) : prevDay;
      rows.push({
        label: weekly ? `sem ${dayLabel(day).slice(4)}` : dayLabel(day),
        current: currentMap.get(currentKey ?? "") ?? 0,
        previous: prevDay <= prev.to ? (prevMap.get(prevKey ?? "") ?? 0) : 0,
        hint: weekly ? "" : `vs ${dayLabel(prevDay)}`,
      });
    }
    return rows;
  }, [data, isDay, period.anchor, today, weekly, length, from, prev.from, prev.to]);

  /* ---- Mapa de calor ---- */
  const heat = useMemo(() => {
    const cells = data?.heat ?? [];
    const hours = cells.map((cell) => cell.hour);
    const first = hours.length ? Math.min(...hours) : 8;
    const last = hours.length ? Math.max(...hours) : 20;
    const max = Math.max(1, ...cells.map((cell) => cell.tickets));
    const lookup = new Map(cells.map((cell) => [`${cell.dow}-${cell.hour}`, cell]));
    const peak = cells.reduce<HeatCell | null>((best, cell) => (!best || cell.tickets > best.tickets ? cell : best), null);
    return {
      hours: Array.from({ length: last - first + 1 }, (_, i) => first + i),
      max,
      lookup,
      peak,
      empty: !cells.length,
    };
  }, [data]);

  /* ---- Productos ---- */
  const products = useMemo(() => {
    const all = [...(data?.summary?.products ?? [])].sort((a, b) => b.revenue - a.revenue);
    const total = all.reduce((sum, row) => sum + row.revenue, 0);
    const top = all.slice(0, 10);
    const topShare = total ? (top.reduce((sum, row) => sum + row.revenue, 0) / total) * 100 : 0;
    const bulk = all.filter((row) => row.saleUnit === "liter").reduce((sum, row) => sum + row.revenue, 0);
    return { top, total, count: all.length, topShare, bulkShare: total ? (bulk / total) * 100 : 0, bulk };
  }, [data]);
  const maxProduct = Math.max(1, ...products.top.map((row) => row.revenue));

  /* ---- Formas de pago por sucursal ---- */
  const payments = useMemo(() => {
    if (!data) return [];
    const byBranch = new Map<string, Record<string, number>>();
    for (const row of data.payments) {
      const entry = byBranch.get(row.branchId) ?? {};
      entry[row.paymentMethod] = (entry[row.paymentMethod] ?? 0) + row.total;
      byBranch.set(row.branchId, entry);
    }
    return ranking.rows
      .map((row) => {
        const methods = byBranch.get(row.branchId) ?? {};
        const total = Object.values(methods).reduce((sum, value) => sum + value, 0);
        return { branch: row, methods, total, cash: methods[POS_PAYMENT_METHODS.CASH] ?? 0 };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.cash - a.cash);
  }, [data, ranking.rows]);
  const cashTotal = payments.reduce((sum, row) => sum + row.cash, 0);

  /* ---- Hallazgos: lo primero que un dueño quiere saber, en una línea cada uno ---- */
  const totalNow = data?.summary?.total ?? 0;
  const totalBefore = data?.prevSummary?.total ?? 0;
  const salesDelta = change(totalNow, totalBefore);
  const leader = ranking.rows[0] && ranking.rows[0].total > 0 ? ranking.rows[0] : null;
  const faller = [...ranking.rows]
    .filter((row) => row.delta !== null && row.delta < -5)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  const riser = [...ranking.rows]
    .filter((row) => row.delta !== null && row.delta > 5)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];

  if (!data && loading) return <p className="page-kicker">Cargando gráficas...</p>;
  if (!data) return null;

  const noSales = totalNow === 0;

  return (
    <div className={`page-stack chart-tab${loading ? " is-refreshing" : ""}`}>
      {/* Hallazgos */}
      <section className="chart-insights" aria-label="Hallazgos del periodo">
        <div className="chart-insight">
          {salesDelta !== null && salesDelta < 0 ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
          <div>
            <small>Venta {prev.label}</small>
            <b>
              {formatMoney(totalNow)} <Delta value={salesDelta} emptyLabel="sin venta antes" />
            </b>
            <span>Antes: {formatMoney(totalBefore)}</span>
          </div>
        </div>
        <div className="chart-insight">
          <Crown size={18} />
          <div>
            <small>Sucursal que más vende</small>
            <b>{leader ? leader.name : "—"}</b>
            <span>
              {leader && ranking.total ? `${pct((leader.total / ranking.total) * 100)} de la venta · ${formatMoney(leader.total)}` : "Sin ventas en el periodo"}
            </span>
          </div>
        </div>
        <div className={`chart-insight${faller ? " is-alert" : ""}`}>
          {faller ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
          <div>
            <small>{faller ? "La que más cayó" : "La que más creció"}</small>
            <b>
              {faller ? faller.name : riser ? riser.name : "Sin cambios fuertes"}{" "}
              {faller ? <Delta value={faller.delta} /> : riser ? <Delta value={riser.delta} /> : null}
            </b>
            <span>
              {faller
                ? `${formatMoney(faller.total)} contra ${formatMoney(faller.prevTotal)} antes`
                : riser
                  ? `${formatMoney(riser.total)} contra ${formatMoney(riser.prevTotal)} antes`
                  : "Ninguna sucursal se movió más de 5%"}
            </span>
          </div>
        </div>
        <div className="chart-insight">
          <Clock size={18} />
          <div>
            <small>Hora pico</small>
            <b>
              {heat.peak ? `${capitalize(DOW_LONG[heat.peak.dow]!)} ${heat.peak.hour}:00–${(heat.peak.hour + 1) % 24}:00` : "—"}
            </b>
            <span>{heat.peak ? `${heat.peak.tickets} tickets en esa franja` : "Sin tickets"}</span>
          </div>
        </div>
        <div className="chart-insight">
          <Droplets size={18} />
          <div>
            <small>Granel (por litro)</small>
            <b>{products.total ? pct(products.bulkShare) : "—"} de la venta</b>
            <span>{products.total ? `${formatMoney(products.bulk)} vendidos a granel` : "Sin ventas"}</span>
          </div>
        </div>
      </section>

      {/* Ranking */}
      <Panel
        title="Ranking de sucursales"
        kicker={`Lo vendido por cada tienda, su parte del total, su ticket promedio y cómo va ${prev.label}.`}
      >
        {!ranking.rows.length ? (
          <Empty>No hay sucursales con caja en este filtro.</Empty>
        ) : (
          <div className="rank-table" role="table" aria-label="Ranking de sucursales">
            <div className="rank-row is-head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">Sucursal</span>
              <span role="columnheader" className="rank-bar-col">
                Venta
              </span>
              <span role="columnheader" className="is-num">
                Parte
              </span>
              <span role="columnheader" className="is-num">
                Tickets
              </span>
              <span role="columnheader" className="is-num">
                Ticket prom.
              </span>
              <span role="columnheader" className="is-num">
                Cambio
              </span>
            </div>
            {ranking.rows.map((row, index) => (
              <div key={row.branchId} className="rank-row" role="row">
                <span role="cell" className="rank-pos">
                  {index + 1}
                </span>
                <span role="cell" className="rank-name">
                  <b>{row.name}</b>
                  <small>{row.code}</small>
                </span>
                <span role="cell" className="rank-bar-col">
                  <span className="rank-bar">
                    <i style={{ width: `${(row.total / maxBranch) * 100}%` }} />
                  </span>
                  <b className="rank-amount">{formatMoney(row.total)}</b>
                </span>
                <span role="cell" className="is-num">
                  {ranking.total ? pct((row.total / ranking.total) * 100) : "—"}
                </span>
                <span role="cell" className="is-num">
                  {row.ticketsCount}
                </span>
                <span role="cell" className="is-num">
                  {row.ticketsCount ? formatMoney(row.avgTicket) : "—"}
                </span>
                <span role="cell" className="is-num">
                  {row.total || row.prevTotal ? <Delta value={row.delta} emptyLabel="nueva" /> : "—"}
                </span>
              </div>
            ))}
            <div className="rank-row is-foot" role="row">
              <span role="cell" />
              <span role="cell" className="rank-name">
                <b>Total</b>
              </span>
              <span role="cell" className="rank-bar-col">
                <span className="rank-bar is-ghost" aria-hidden />
                <b className="rank-amount">{formatMoney(ranking.total)}</b>
              </span>
              <span role="cell" className="is-num">
                100%
              </span>
              <span role="cell" className="is-num">
                {ranking.rows.reduce((sum, row) => sum + row.ticketsCount, 0)}
              </span>
              <span role="cell" className="is-num">
                {formatMoney(data.summary?.avgTicket ?? 0)}
              </span>
              <span role="cell" className="is-num">
                <Delta value={change(ranking.total, ranking.prevTotal)} />
              </span>
            </div>
          </div>
        )}
      </Panel>

      <section className="grid grid-2-even chart-grid">
        {/* Tendencia */}
        <Panel
          title={isDay ? "Cómo va el día" : weekly ? "Ventas por semana" : "Ventas por día"}
          kicker={
            isDay
              ? `Venta acumulada hora por hora, ${prev.label}.`
              : `Cada ${weekly ? "semana" : "día"} del periodo junto a su par del periodo anterior.`
          }
        >
          <Legend
            items={[
              { label: isDay ? "Este día" : "Este periodo", color: NAVY, line: true },
              { label: prev.label.replace(/^vs /, ""), color: CONTEXT, line: true },
            ]}
          />
          <div className="chart-plot">
            {trend.every((row) => !row.current && !row.previous) ? (
              <Empty>Sin ventas en este periodo ni en el anterior.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 12, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke="#eef1f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: "#e6ebf3" }}
                    style={AXIS_STYLE}
                    interval="preserveStartEnd"
                    minTickGap={18}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    style={AXIS_STYLE}
                    width={64}
                    tickFormatter={(value) => formatMoneyShort(value as number)}
                  />
                  <ChartTooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "#9aa3b5", fontWeight: 700 }}
                    cursor={{ stroke: "#c9d6e8", strokeWidth: 1 }}
                    formatter={(value, name) => [
                      formatMoney(Number(value)),
                      name === "current" ? (isDay ? "Este día" : "Este periodo") : "Periodo anterior",
                    ]}
                    labelFormatter={(label, payload) => {
                      const hint = payload?.[0]?.payload?.hint as string | undefined;
                      return hint ? `${label} · ${hint}` : String(label);
                    }}
                  />
                  <Line
                    type="linear"
                    dataKey="previous"
                    stroke={CONTEXT}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="current"
                    stroke={NAVY}
                    strokeWidth={2}
                    dot={trend.length <= 14 ? { r: 4, fill: NAVY, stroke: "#fff", strokeWidth: 2 } : false}
                    activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        {/* Mapa de calor */}
        <Panel
          title="Cuándo entra la gente"
          kicker={`Tickets por día y hora${heatFrom !== from ? " en las últimas 4 semanas" : " del periodo"}. Sirve para turnos y horario de apertura.`}
        >
          {heat.empty ? (
            <Empty>Sin tickets para armar el mapa.</Empty>
          ) : (
            <div className="heatmap">
              <div className="heatmap-grid" style={{ gridTemplateColumns: `40px repeat(${heat.hours.length}, minmax(18px, 1fr))` }}>
                <span />
                {heat.hours.map((hour) => (
                  <span key={hour} className="heatmap-hour">
                    {hour % 2 === 0 ? hour : ""}
                  </span>
                ))}
                {HEAT_ROWS.map((dow) => (
                  <HeatRow key={dow} dow={dow} hours={heat.hours} lookup={heat.lookup} max={heat.max} />
                ))}
              </div>
              <div className="heatmap-scale" aria-hidden>
                <span>Menos</span>
                {[0.08, 0.3, 0.55, 0.8, 1].map((step) => (
                  <i key={step} style={{ background: heatColor(step) }} />
                ))}
                <span>Más tickets</span>
              </div>
            </div>
          )}
        </Panel>
      </section>

      <section className="grid grid-2-even chart-grid">
        {/* Productos */}
        <Panel
          title="Qué se vende"
          kicker={
            products.count
              ? `Los 10 primeros hacen el ${pct(products.topShare)} de la venta, de ${products.count} productos vendidos.`
              : "Los productos con más importe en el periodo."
          }
        >
          {!products.top.length ? (
            <Empty>Sin ventas en este periodo.</Empty>
          ) : (
            <>
              <div className="mix-bar" aria-label="Granel contra envasado">
                <span style={{ flexGrow: products.bulk || 0.0001, background: NAVY }} />
                <span style={{ flexGrow: products.total - products.bulk || 0.0001, background: "#8fa1c4" }} />
              </div>
              <Legend
                items={[
                  { label: `Granel ${pct(products.bulkShare)}`, color: NAVY },
                  { label: `Envasado ${pct(100 - products.bulkShare)}`, color: "#8fa1c4" },
                ]}
              />
              <ol className="product-bars">
                {products.top.map((row) => (
                  <li key={`${row.name}-${row.saleUnit}`}>
                    <span className="product-name" title={row.name}>
                      {row.name}
                      <small>
                        {formatQuantity(row.quantity)} {row.saleUnit === "liter" ? "L" : "pz"}
                      </small>
                    </span>
                    <span className="product-bar">
                      <i style={{ width: `${(row.revenue / maxProduct) * 100}%` }} />
                    </span>
                    <span className="product-value">
                      <b>{formatMoney(row.revenue)}</b>
                      <small>{products.total ? pct((row.revenue / products.total) * 100) : ""}</small>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Panel>

        {/* Formas de pago */}
        <Panel
          title="Efectivo y pagos por sucursal"
          kicker="El efectivo es lo que debe llegar al depósito; tarjeta y transferencia entran por el banco."
          aside={
            cashTotal ? (
              <div className="chart-aside-stat">
                <small>Efectivo total</small>
                <b>{formatMoney(cashTotal)}</b>
              </div>
            ) : null
          }
        >
          {!payments.length ? (
            <Empty>Sin cobros en este periodo.</Empty>
          ) : (
            <>
              <Legend items={PAYMENTS.map((item) => ({ label: posPaymentMethodLabel(item.key), color: item.color }))} />
              <ul className="pay-bars">
                {payments.map((row) => (
                  <li key={row.branch.branchId}>
                    <span className="pay-name">{row.branch.name}</span>
                    <Tooltip
                      title={PAYMENTS.filter((item) => row.methods[item.key])
                        .map(
                          (item) =>
                            `${posPaymentMethodLabel(item.key)}: ${formatMoney(row.methods[item.key])} (${pct(
                              (row.methods[item.key]! / row.total) * 100
                            )})`
                        )
                        .join(" · ")}
                    >
                      <span className="pay-bar">
                        {PAYMENTS.map((item) =>
                          row.methods[item.key] ? (
                            <i key={item.key} style={{ flexGrow: row.methods[item.key], background: item.color }} />
                          ) : null
                        )}
                      </span>
                    </Tooltip>
                    <span className="pay-value">
                      <b>{formatMoney(row.cash)}</b>
                      <small>{pct((row.cash / row.total) * 100)} en efectivo</small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </section>

      {noSales ? (
        <p className="page-kicker" style={{ textAlign: "center" }}>
          No hubo ventas en este periodo; las gráficas muestran lo que hay para comparar.
        </p>
      ) : null}
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Escala secuencial de un solo tono: casi blanco → navy. */
function heatColor(ratio: number): string {
  if (ratio <= 0) return "#f3f6fa";
  return `color-mix(in oklab, ${NAVY} ${Math.round(12 + ratio * 88)}%, #eef9fd)`;
}

function HeatRow({
  dow,
  hours,
  lookup,
  max,
}: {
  dow: number;
  hours: number[];
  lookup: Map<string, HeatCell>;
  max: number;
}) {
  return (
    <>
      <span className="heatmap-day">{DOW_SHORT[dow]}</span>
      {hours.map((hour) => {
        const cell = lookup.get(`${dow}-${hour}`);
        const ratio = cell ? cell.tickets / max : 0;
        const label = `${capitalize(DOW_LONG[dow]!)} ${hour}:00–${(hour + 1) % 24}:00 · ${cell?.tickets ?? 0} tickets · ${formatMoney(cell?.total ?? 0)}`;
        return (
          <Tooltip key={hour} title={label} disableInteractive>
            <span className="heatmap-cell" style={{ background: heatColor(ratio) }} aria-label={label} role="img" />
          </Tooltip>
        );
      })}
    </>
  );
}
