"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Chip, MenuItem, Tab, Tabs, TextField } from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  type BranchRow,
  type ReportSummary,
} from "@/lib/export-pos-reports";
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

/** Sábado de la semana de negocio que contiene la fecha (la semana va sáb→vie). */
function businessWeekStart(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  const diff = (date.getUTCDay() + 1) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function rangeFor(granularity: Granularity, anchor: string): { from: string; to: string } {
  if (granularity === "day") return { from: anchor, to: anchor };
  if (granularity === "week") {
    const from = businessWeekStart(anchor);
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

  const topProducts = (summary?.products ?? []).slice(0, 10);

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Cortes de caja y reportes</h1>
          <p className="page-kicker">
            Ventas del punto de venta por sucursal y periodo. La semana va de sábado a viernes, como
            el resto del CRM.
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
          <MenuItem value="week">Semana (sáb–vie)</MenuItem>
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
          <small>{periodLabel}</small>
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
          <div className="panel p-5">
            <h3 style={{ marginTop: 0 }}>Ventas por sucursal</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byBranch}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf3" />
                <XAxis dataKey="code" />
                <YAxis tickFormatter={(value) => formatMoneyShort(value as number)} />
                <ChartTooltip formatter={(value) => formatMoney(value as number)} />
                <Bar dataKey="total" name="Vendido" fill="#06a6e0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel p-5">
            <h3 style={{ marginTop: 0 }}>Evolución</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf3" />
                <XAxis dataKey="day" />
                <YAxis tickFormatter={(value) => formatMoneyShort(value as number)} />
                <ChartTooltip formatter={(value) => formatMoney(value as number)} />
                <Legend />
                <Bar dataKey="total" name="Vendido" fill="#262d60" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid-2">
            <div className="panel p-5">
              <h3 style={{ marginTop: 0 }}>Horarios de mayor actividad</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={hours}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf3" />
                  <XAxis dataKey="hour" tickFormatter={(value) => `${value}h`} />
                  <YAxis />
                  <ChartTooltip
                    formatter={(value, name) =>
                      name === "total" ? formatMoney(value as number) : String(value)
                    }
                  />
                  <Bar dataKey="tickets" name="Tickets" fill="#ffe443" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="panel p-5">
              <h3 style={{ marginTop: 0 }}>Más vendidos</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf3" />
                  <XAxis type="number" tickFormatter={(value) => formatMoneyShort(value as number)} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                  <ChartTooltip formatter={(value) => formatMoney(value as number)} />
                  <Bar dataKey="revenue" name="Importe" fill="#06a6e0" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
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
