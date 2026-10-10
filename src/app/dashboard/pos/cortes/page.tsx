"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Tab, Tabs, Tooltip } from "@mui/material";
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
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { FilterBar, FilterDivider } from "@/components/pos-admin/FilterBar";
import { PeriodPicker, periodBounds, previousPeriod } from "@/components/pos-admin/PeriodPicker";
import { Delta, PosChartsTab } from "@/components/pos-admin/PosChartsTab";
import { BranchPicker, branchSelectionLabel } from "@/components/pos-admin/BranchPicker";
import {
  exportPosReportToPdf,
  exportPosReportToXlsx,
  paymentBreakdownLabel,
  type BranchRow,
  type ReportSummary,
} from "@/lib/export-pos-reports";
import { BranchCutRows, type BranchCutPeriod } from "@/components/pos-admin/BranchCutRows";
import { Branch, ListResponse } from "@/types";
import { toast } from "sonner";

type Granularity = "day" | "week" | "month" | "range";

/** Hoy en la zona del negocio, que es la que usan los cortes. */
function todayInMexico(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

/** "▲ +12% vs semana anterior" bajo la cifra de cada tarjeta. */
function KpiChange({ current, previous, label }: { current: number; previous: number; label: string }) {
  return (
    <span className="metric-change">
      <Delta value={previous ? ((current - previous) / previous) * 100 : null} emptyLabel="sin venta antes" />
      <span>{label}</span>
    </span>
  );
}

export default function PosCortesPage() {
  const { can } = usePermissions();
  const canView = can("posReports", "view");
  const canFreeze = can("posReports", "create");

  const [branches, setBranches] = useState<Branch[]>([]);
  /** Sucursales elegidas; vacío = todas. */
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [anchor, setAnchor] = useState(todayInMexico());
  const [rangeTo, setRangeTo] = useState(todayInMexico());
  const [tab, setTab] = useState(0);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [byBranch, setByBranch] = useState<BranchRow[]>([]);
  /** Mismo resumen del periodo anterior, para el "vs …" de las tarjetas. */
  const [prevSummary, setPrevSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);

  /* La pestaña Por sucursal con "Día" muestra el día, el anterior y la semana;
     con semana, mes o rango, lo de ese periodo. */
  const cutPeriod = useMemo<BranchCutPeriod>(
    () =>
      granularity === "day"
        ? { mode: "day", day: anchor }
        : { mode: "range", ...periodBounds({ granularity, anchor, rangeTo }) },
    [granularity, anchor, rangeTo]
  );

  const range = useMemo(() => periodBounds({ granularity, anchor, rangeTo }), [granularity, anchor, rangeTo]);
  const previous = useMemo(() => previousPeriod({ granularity, anchor, rangeTo }), [granularity, anchor, rangeTo]);

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
    const scope = branchIds.length ? { branchIds: branchIds.join(",") } : {};
    const params = { ...range, ...scope };
    try {
      const [summaryRes, branchRes, prevRes] = await Promise.all([
        httpClient.get<ReportSummary>("/pos/reports/summary", params),
        httpClient.get<BranchRow[]>("/pos/reports/sales-by-branch", params),
        httpClient.get<ReportSummary>("/pos/reports/summary", { from: previous.from, to: previous.to, ...scope }),
      ]);
      setSummary(summaryRes);
      setByBranch(branchRes);
      setPrevSummary(prevRes);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar el corte"));
    } finally {
      setLoading(false);
    }
  }, [canView, range, previous.from, previous.to, branchIds]);

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

  // Para el encabezado del Excel y el PDF: con varias se listan los códigos.
  const branchLabel =
    branchIds.length > 2
      ? `${branchIds.length} sucursales: ${branchIds
          .map((id) => branches.find((b) => b.id === id)?.code ?? "")
          .join(", ")}`
      : branchSelectionLabel(branches, branchIds);
  // Un corte congelado es de una sucursal o de todas (`cash_cuts.branch_id`).
  const canFreezeSelection = branchIds.length <= 1;
  const periodLabel = range.from === range.to ? range.from : `${range.from} a ${range.to}`;

  async function freeze() {
    try {
      await httpClient.post("/pos/cash-cuts", {
        ...(branchIds.length === 1 ? { branchId: branchIds[0] } : {}),
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
          <Tooltip title={canFreezeSelection ? "" : "Un corte se genera de una sucursal o de todas"}>
            <span>
              <Button
                variant="contained"
                startIcon={<Lock size={16} />}
                disabled={!canFreezeSelection}
                onClick={() => void freeze()}
              >
                Generar corte
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </div>

      <FilterBar>
        <BranchPicker branches={branches} value={branchIds} onChange={setBranchIds} />
        <PeriodPicker
          value={{ granularity, anchor, rangeTo }}
          onChange={(next) => {
            setGranularity(next.granularity);
            setAnchor(next.anchor);
            setRangeTo(next.rangeTo);
          }}
        />
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
          <KpiChange current={summary?.total ?? 0} previous={prevSummary?.total ?? 0} label={previous.label} />
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
          <KpiChange current={summary?.ticketsCount ?? 0} previous={prevSummary?.ticketsCount ?? 0} label={previous.label} />
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
          <KpiChange current={summary?.avgTicket ?? 0} previous={prevSummary?.avgTicket ?? 0} label={previous.label} />
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
          <KpiChange current={summary?.itemsCount ?? 0} previous={prevSummary?.itemsCount ?? 0} label={previous.label} />
          <small>Piezas y litros sumados</small>
        </div>
      </section>

      <Tabs value={tab} onChange={(_e, value) => setTab(value)}>
        <Tab label="Por sucursal" />
        <Tab label="Gráficas" />
      </Tabs>

      {tab === 0 ? <BranchCutRows branches={branches} branchIds={branchIds} period={cutPeriod} /> : null}

      {tab === 1 ? (
        <PosChartsTab period={{ granularity, anchor, rangeTo }} branchIds={branchIds} branches={branches} />
      ) : null}

      {loading ? <p className="page-kicker">Cargando...</p> : null}
    </div>
  );
}
