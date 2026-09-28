"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Chip, MenuItem, Tab, Tabs, TextField } from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calculator,
  FileDown,
  FileText,
  Lock,
  Package,
  Receipt,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatMoneyShort, formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { FilterBar, FilterDivider, FilterMeta } from "@/components/pos-admin/FilterBar";
import {
  exportPosReportToPdf,
  exportPosReportToXlsx,
  paymentBreakdownLabel,
  type BranchRow,
  type ReportSummary,
} from "@/lib/export-pos-reports";
import { posWeekStart } from "@/components/pos-admin/pos-labels";
import { Branch, CashCut, ListResponse } from "@/types";
import { toast } from "sonner";

type Granularity = "day" | "week" | "month" | "range";

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

/** Hoy en la zona del negocio, que es la que usan los cortes. */
function todayInMexico(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function rangeFor(granularity: Granularity, anchor: string): { from: string; to: string } {
  if (granularity === "day") return { from: anchor, to: anchor };
  if (granularity === "week") {
    const from = posWeekStart(anchor);
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    return { from, to: end.toISOString().slice(0, 10) };
  }
  if (granularity === "month") {
    const from = `${anchor.slice(0, 7)}-01`;
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    return { from, to: end.toISOString().slice(0, 10) };
  }
  return { from: anchor, to: anchor };
}

/** El corte guarda la granularidad en inglés; la etiqueta la lee una persona. */
const GRANULARITY_LABELS: Record<string, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  range: "Periodo",
};

/* Estilo de las gráficas: el mismo del Overview (`/dashboard`), para que las
   dos pantallas se lean como una sola. Si cambia allá, cambia aquí. */
const TOOLTIP_STYLE = {
  background: "rgba(23, 32, 51, 0.95)",
  border: "0",
  borderRadius: "8px",
  color: "white",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
};
const TOOLTIP_LABEL_STYLE = { color: "#9aa3b5", fontWeight: 700 };
const AXIS_STYLE = { fontSize: "11px", fill: "var(--glam-muted)" };
const GRID_STROKE = "#f1f5f9";
/** Alto fijo del panel de gráfica, como los del Overview. */
const CHART_PANEL: CSSProperties = {
  height: "340px",
  display: "flex",
  flexDirection: "column",
};

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Etiqueta del eje de la evolución. La serie viene con la clave del Back
 * (`YYYY-MM-DD` del día o del viernes de la semana, `YYYY-MM` del mes) y no
 * debe pasar por `new Date("YYYY-MM-DD")`, que corre el día por timezone.
 */
function seriesLabel(granularity: Granularity, key: string): string {
  const parts = key.split("-").map(Number);
  const [year, month, day] = parts as [number, number, number?];
  if (!year || !month) return key;
  if (granularity === "month") return `${MONTH_SHORT[month - 1]} ${String(year).slice(2)}`;
  if (!day) return key;
  if (granularity === "week") return `vie ${day} ${MONTH_SHORT[month - 1]}`;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Mensaje centrado cuando una gráfica se queda sin datos que pintar. */
function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100%",
        color: "var(--glam-muted)",
        fontSize: "13px",
      }}
    >
      {children}
    </div>
  );
}

/** Cabecera de panel de gráfica: título y bajada, igual que en el Overview. */
function ChartHeader({ title, kicker }: { title: string; kicker: string }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--glam-navy)", margin: 0 }}>{title}</h2>
      <p className="page-kicker" style={{ margin: 0 }}>
        {kicker}
      </p>
    </div>
  );
}

export default function PosCortesPage() {
  const { can } = usePermissions();
  const canView = can("posReports", "view");
  const canFreeze = can("posReports", "create");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [anchor, setAnchor] = useState(todayInMexico());
  const [rangeTo, setRangeTo] = useState(todayInMexico());
  const [tab, setTab] = useState(0);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [byBranch, setByBranch] = useState<BranchRow[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [hours, setHours] = useState<HourPoint[]>([]);
  const [cuts, setCuts] = useState<CashCut[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(
    () => (granularity === "range" ? { from: anchor, to: rangeTo } : rangeFor(granularity, anchor)),
    [granularity, anchor, rangeTo]
  );

  useEffect(() => {
    if (!canView) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200 })
      .then((res) => setBranches(res.items))
      .catch(() => setBranches([]));
  }, [canView]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    const params = { ...range, ...(branchId ? { branchId } : {}) };
    try {
      const [summaryRes, branchRes, seriesRes, hoursRes, cutsRes] = await Promise.all([
        httpClient.get<ReportSummary>("/pos/reports/summary", params),
        httpClient.get<BranchRow[]>("/pos/reports/sales-by-branch", params),
        httpClient.get<SeriesPoint[]>("/pos/reports/timeseries", {
          ...params,
          granularity: granularity === "range" ? "day" : granularity,
        }),
        httpClient.get<HourPoint[]>("/pos/reports/hours", params),
        httpClient.get<ListResponse<CashCut>>("/pos/cash-cuts", {
          limit: 20,
          ...(branchId ? { branchId } : {}),
        }),
      ]);
      setSummary(summaryRes);
      setByBranch(branchRes);
      setSeries(seriesRes);
      setHours(hoursRes);
      setCuts(cutsRes.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar el corte"));
    } finally {
      setLoading(false);
    }
  }, [canView, range, branchId, granularity]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Solo administradores</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Los cortes de caja necesitan el permiso de Cortes y reportes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const branchLabel = branchId
    ? `${branches.find((b) => b.id === branchId)?.code ?? ""} · ${branches.find((b) => b.id === branchId)?.name ?? ""}`
    : "Todas las sucursales";
  const periodLabel = range.from === range.to ? range.from : `${range.from} a ${range.to}`;

  async function freeze() {
    try {
      await httpClient.post("/pos/cash-cuts", {
        ...(branchId ? { branchId } : {}),
        from: range.from,
        to: range.to,
        granularity,
      });
      toast.success("Corte generado y congelado");
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el corte"));
    }
  }

  /* Datos listos para recharts: la serie trae la clave cruda del periodo y el
     eje necesita la etiqueta corta; los productos se ordenan por importe. */
  const seriesData = series.map((point) => ({
    label: seriesLabel(granularity === "range" ? "day" : granularity, point.day),
    key: point.day,
    total: Number(point.total || 0),
    tickets: Number(point.tickets || 0),
  }));
  const hoursData = hours.map((point) => ({
    label: `${point.hour}h`,
    total: Number(point.total || 0),
    tickets: Number(point.tickets || 0),
  }));
  const topProducts = [...(summary?.products ?? [])]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((row) => ({
      ...row,
      label: row.name.length > 26 ? `${row.name.slice(0, 25)}…` : row.name,
    }));

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Cortes de caja y reportes</h1>
          <p className="page-kicker">
            Ventas del punto de venta por sucursal y periodo. La semana va de viernes a jueves (en
            pedidos del CRM va de sábado a viernes).
          </p>
        </div>
        {canFreeze ? (
          <Button variant="contained" startIcon={<Lock size={16} />} onClick={() => void freeze()}>
            Generar corte
          </Button>
        ) : null}
      </div>

      <FilterBar>
        <TextField
          select
          size="small"
          label="Sucursal"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
          sx={{ minWidth: 250 }}
        >
          <MenuItem value="">Todas las sucursales</MenuItem>
          {branches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Periodo"
          value={granularity}
          onChange={(event) => setGranularity(event.target.value as Granularity)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 185 }}
        >
          <MenuItem value="day">Día</MenuItem>
          <MenuItem value="week">Semana (vie–jue)</MenuItem>
          <MenuItem value="month">Mes</MenuItem>
          <MenuItem value="range">Rango</MenuItem>
        </TextField>
        <TextField
          size="small"
          label={granularity === "range" ? "Desde" : "Fecha"}
          type="date"
          value={anchor}
          onChange={(event) => setAnchor(event.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 165 }}
        />
        {granularity === "range" ? (
          <TextField
            size="small"
            label="Hasta"
            type="date"
            value={rangeTo}
            onChange={(event) => setRangeTo(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 165 }}
          />
        ) : null}
        <FilterDivider />
        {/* Exportar es acción del periodo elegido: va junto a los filtros. */}
        <Button
          variant="outlined"
          startIcon={<FileDown size={16} />}
          disabled={!summary}
          sx={{ height: 40 }}
          onClick={() =>
            summary &&
            void exportPosReportToXlsx({ summary, branches: byBranch, periodLabel, branchLabel })
          }
        >
          Excel
        </Button>
        <Button
          variant="outlined"
          startIcon={<FileText size={16} />}
          disabled={!summary}
          sx={{ height: 40 }}
          onClick={() =>
            summary &&
            void exportPosReportToPdf({ summary, branches: byBranch, periodLabel, branchLabel })
          }
        >
          PDF
        </Button>
        <FilterMeta>{periodLabel}</FilterMeta>
      </FilterBar>

      {/*
        Mismo armado que las tarjetas del Overview: `grid` pone el display,
        `grid-4` las columnas y `card` el recuadro. Antes iba `grid-4` y
        `metric` a secas, con `metric-small`/`metric-strong` que no existen en
        ninguna hoja, y las cuatro cifras salían apiladas y sin tarjeta.
      */}
      <section className="grid grid-4">
        <div className="card metric">
          <div className="metric-head">
            <span>Total vendido</span>
            <div className="metric-icon">
              <Wallet size={22} />
            </div>
          </div>
          <strong>{formatMoney(summary?.total ?? 0)}</strong>
          <small>{summary && paymentBreakdownLabel(summary) ? paymentBreakdownLabel(summary) : periodLabel}</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Tickets</span>
            <div className="metric-icon">
              <Receipt size={22} />
            </div>
          </div>
          <strong>{summary?.ticketsCount ?? 0}</strong>
          <small>Cobrados, sin los anulados</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Ticket promedio</span>
            <div className="metric-icon">
              <Calculator size={22} />
            </div>
          </div>
          <strong>{formatMoney(summary?.avgTicket ?? 0)}</strong>
          <small>Vendido entre tickets</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Artículos</span>
            <div className="metric-icon">
              <Package size={22} />
            </div>
          </div>
          <strong>{formatQuantity(summary?.itemsCount ?? 0)}</strong>
          <small>Piezas y litros sumados</small>
        </div>
      </section>

      <Tabs value={tab} onChange={(_e, value) => setTab(value)}>
        <Tab label="Productos vendidos" />
        <Tab label="Gráficas" />
        <Tab label={`Cortes generados (${cuts.length})`} />
      </Tabs>

      {tab === 0 ? (
        <div className="table-container-premium">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Unidad</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th style={{ textAlign: "right" }}>Tickets</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.products ?? []).map((row) => (
                <tr key={`${row.name}-${row.saleUnit}`}>
                  <td>{row.name}</td>
                  <td>{row.saleUnit === "liter" ? "litro" : "pieza"}</td>
                  <td style={{ textAlign: "right" }}>{formatQuantity(row.quantity)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(row.revenue)}</td>
                  <td style={{ textAlign: "right" }}>{row.tickets}</td>
                </tr>
              ))}
              {!summary?.products.length ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                    Sin ventas en este periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 1 ? (
        <div className="page-stack">
          <section className="grid grid-2-even" style={{ gap: "20px" }}>
            <div className="panel p-5" style={CHART_PANEL}>
              <ChartHeader
                title="Ventas por sucursal"
                kicker="Lo cobrado en caja por cada sucursal en el periodo elegido, anulados excluidos."
              />
              <div style={{ flex: 1, minHeight: 0 }}>
                {!byBranch.length ? (
                  <ChartEmpty>{loading ? "Cargando..." : "Sin ventas en este periodo."}</ChartEmpty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byBranch} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="code" tickLine={false} axisLine={false} style={AXIS_STYLE} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        style={AXIS_STYLE}
                        tickFormatter={(value) => formatMoneyShort(value as number)}
                      />
                      <ChartTooltip
                        cursor={{ fill: "rgba(6, 166, 224, 0.06)" }}
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: "var(--glam-blue)" }}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(value) => [formatMoney(Number(value)), "Vendido"]}
                        labelFormatter={(label, payload) =>
                          `${payload?.[0]?.payload?.name || label} · ${payload?.[0]?.payload?.ticketsCount ?? 0} tickets`
                        }
                      />
                      <Bar dataKey="total" name="Vendido" fill="var(--glam-blue)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="panel p-5" style={CHART_PANEL}>
              <ChartHeader
                title="Evolución"
                kicker={
                  granularity === "month"
                    ? "Lo vendido mes a mes dentro del periodo."
                    : granularity === "week"
                      ? "Lo vendido por semana del punto de venta (viernes a jueves)."
                      : "Lo vendido por día de negocio dentro del periodo."
                }
              />
              <div style={{ flex: 1, minHeight: 0 }}>
                {!seriesData.length ? (
                  <ChartEmpty>{loading ? "Cargando..." : "Sin ventas en este periodo."}</ChartEmpty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={seriesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} style={AXIS_STYLE} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        style={AXIS_STYLE}
                        tickFormatter={(value) => formatMoneyShort(value as number)}
                      />
                      <ChartTooltip
                        cursor={{ fill: "rgba(38, 45, 96, 0.06)" }}
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: "var(--glam-blue)" }}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(value) => [formatMoney(Number(value)), "Vendido"]}
                        labelFormatter={(label, payload) =>
                          `${label} · ${payload?.[0]?.payload?.tickets ?? 0} tickets`
                        }
                      />
                      <Bar dataKey="total" name="Vendido" fill="var(--glam-navy)" radius={[4, 4, 0, 0]} maxBarSize={64} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>

          {/* `grid-2-even` solo reparte las columnas: el `display: grid` lo pone
              `grid`. Sin esa clase las dos gráficas salían apiladas a lo ancho. */}
          <section className="grid grid-2-even" style={{ gap: "20px" }}>
            <div className="panel p-5" style={CHART_PANEL}>
              <ChartHeader
                title="Horarios de mayor actividad"
                kicker="Tickets cobrados por hora del día, sumando todo el periodo."
              />
              <div style={{ flex: 1, minHeight: 0 }}>
                {!hoursData.length ? (
                  <ChartEmpty>{loading ? "Cargando..." : "Sin ventas en este periodo."}</ChartEmpty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hoursData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} style={AXIS_STYLE} interval={0} />
                      <YAxis tickLine={false} axisLine={false} style={AXIS_STYLE} allowDecimals={false} />
                      <ChartTooltip
                        cursor={{ fill: "rgba(6, 166, 224, 0.06)" }}
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: "var(--glam-blue)" }}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(value) => [String(value), "Tickets"]}
                        labelFormatter={(label, payload) =>
                          `${label} · ${formatMoney(Number(payload?.[0]?.payload?.total ?? 0))}`
                        }
                      />
                      <Bar dataKey="tickets" name="Tickets" fill="var(--glam-blue)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="panel p-5" style={CHART_PANEL}>
              <ChartHeader title="Más vendidos" kicker="Los ocho productos de mayor importe en el periodo." />
              <div style={{ flex: 1, minHeight: 0 }}>
                {!topProducts.length ? (
                  <ChartEmpty>{loading ? "Cargando..." : "Sin ventas en este periodo."}</ChartEmpty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical" margin={{ top: 4, right: 24, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        style={AXIS_STYLE}
                        tickFormatter={(value) => formatMoneyShort(value as number)}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        width={150}
                        style={{ fontSize: "11px", fill: "var(--glam-muted)" }}
                      />
                      <ChartTooltip
                        cursor={{ fill: "rgba(38, 45, 96, 0.06)" }}
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: "var(--glam-blue)" }}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(value) => [formatMoney(Number(value)), "Importe"]}
                        labelFormatter={(_label, payload) => {
                          const row = payload?.[0]?.payload;
                          if (!row) return "";
                          const unit = row.saleUnit === "liter" ? "L" : "pz";
                          return `${row.name} · ${formatQuantity(row.quantity)} ${unit}`;
                        }}
                      />
                      <Bar dataKey="revenue" name="Importe" fill="var(--glam-navy)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === 2 ? (
        <div className="table-container-premium">
          <table className="table">
            <thead>
              <tr>
                <th>Generado</th>
                <th>Sucursal</th>
                <th>Periodo</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Tickets</th>
                <th>Por</th>
              </tr>
            </thead>
            <tbody>
              {cuts.map((cut) => {
                const s = cut.summary as Record<string, unknown>;
                return (
                  <tr key={cut.id}>
                    <td>
                      {cut.createdAt
                        ? new Date(cut.createdAt).toLocaleString("es-MX", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td>{cut.branch ? `${cut.branch.code} · ${cut.branch.name}` : "Todas"}</td>
                    <td>
                      {String(s.from ?? "")} a {String(s.to ?? "")}
                      <Chip
                        label={GRANULARITY_LABELS[cut.granularity] ?? cut.granularity}
                        size="small"
                        sx={{ ml: 1, height: 18, fontSize: 10 }}
                      />
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {formatMoney(Number(s.total ?? 0))}
                    </td>
                    <td style={{ textAlign: "right" }}>{String(s.ticketsCount ?? 0)}</td>
                    <td>{cut.generatedByUser?.name ?? "—"}</td>
                  </tr>
                );
              })}
              {!cuts.length ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                    Todavía no hay cortes congelados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {loading ? <p className="page-kicker">Cargando...</p> : null}
    </div>
  );
}
