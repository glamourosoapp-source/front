"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { Lock } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { DetailField } from "@/components/ui/DetailField";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import type { CashCut, ListResponse } from "@/types";
import { toast } from "sonner";
import { FilterDivider } from "../FilterBar";
import { businessWeekStart, formatDateTime, shiftDateOnly, todayInMexico } from "../pos-labels";

type Granularity = "day" | "week" | "month" | "range";

const GRANULARITY_LABELS: Record<string, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  range: "Periodo",
};

function rangeFor(granularity: Granularity, anchor: string, rangeTo: string) {
  if (granularity === "day") return { from: anchor, to: anchor };
  if (granularity === "week") {
    const from = businessWeekStart(anchor);
    return { from, to: shiftDateOnly(from, 6) };
  }
  if (granularity === "month") {
    const from = `${anchor.slice(0, 7)}-01`;
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    return { from, to: end.toISOString().slice(0, 10) };
  }
  return { from: anchor, to: rangeTo };
}

/**
 * Cortes congelados de la sucursal y el formulario para generar uno nuevo.
 * Un corte es el reporte de un periodo que se guarda tal cual: no cambia si
 * después se anula un ticket.
 */
export function BranchCutsTab({ branchId }: { branchId: string }) {
  const { can } = usePermissions();
  const canView = can("posReports", "view");
  const canFreeze = can("posReports", "create");

  const [cuts, setCuts] = useState<CashCut[]>([]);
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [anchor, setAnchor] = useState(todayInMexico());
  const [rangeTo, setRangeTo] = useState(todayInMexico());
  const [selected, setSelected] = useState<CashCut | null>(null);
  const [freezing, setFreezing] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const result = await httpClient.get<ListResponse<CashCut>>("/pos/cash-cuts", { branchId, limit: 100 });
      setCuts(result.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los cortes"));
    } finally {
      setLoading(false);
    }
  }, [canView, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return (
      <div className="panel p-5" style={{ color: "var(--muted)" }}>
        Los cortes necesitan el permiso de Cortes y reportes.
      </div>
    );
  }

  const range = rangeFor(granularity, anchor, rangeTo);

  async function freeze() {
    setFreezing(true);
    try {
      await httpClient.post("/pos/cash-cuts", { branchId, ...range, granularity });
      toast.success("Corte generado y congelado");
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el corte"));
    } finally {
      setFreezing(false);
    }
  }

  const summary = (selected?.summary ?? {}) as Record<string, unknown>;
  const products = (summary.products ?? []) as Array<{
    name: string;
    saleUnit: string;
    quantity: number;
    revenue: number;
    tickets: number;
  }>;

  return (
    <div className="page-stack">
      {canFreeze ? (
        <section className="panel p-5">
          <h2 style={{ margin: "0 0 12px" }}>Generar corte</h2>
          <div className="filter-bar is-plain">
            <TextField
              select
              size="small"
              label="Periodo"
              value={granularity}
              onChange={(event) => setGranularity(event.target.value as Granularity)}
              sx={{ minWidth: 170 }}
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
            />
            {granularity === "range" ? (
              <TextField
                size="small"
                label="Hasta"
                type="date"
                value={rangeTo}
                onChange={(event) => setRangeTo(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            ) : null}
            <FilterDivider />
            <span className="page-kicker" style={{ margin: 0 }}>
              {range.from === range.to ? range.from : `${range.from} a ${range.to}`}
            </span>
            <Button
              variant="contained"
              startIcon={<Lock size={16} />}
              disabled={freezing}
              onClick={() => void freeze()}
              sx={{ ml: "auto", height: 40, whiteSpace: "nowrap" }}
            >
              {freezing ? "Generando..." : "Congelar corte"}
            </Button>
          </div>
        </section>
      ) : null}

      {cuts.length ? (
      <DataTable
        rows={cuts}
        getKey={(cut: CashCut) => cut.id}
        onRowClick={(cut: CashCut) => setSelected(cut)}
        columns={[
          { key: "createdAt", label: "Generado", render: (cut: CashCut) => formatDateTime(cut.createdAt) },
          {
            key: "period",
            label: "Periodo",
            render: (cut: CashCut) => {
              const s = cut.summary as Record<string, unknown>;
              return (
                <>
                  {String(s.from ?? "")} a {String(s.to ?? "")}
                  <Chip
                    label={GRANULARITY_LABELS[cut.granularity] ?? cut.granularity}
                    size="small"
                    sx={{ ml: 1, height: 18, fontSize: 10 }}
                  />
                </>
              );
            },
          },
          {
            key: "total",
            label: "Total",
            render: (cut: CashCut) => <strong>{formatMoney(Number((cut.summary as Record<string, unknown>).total ?? 0))}</strong>,
          },
          {
            key: "tickets",
            label: "Tickets",
            render: (cut: CashCut) => String((cut.summary as Record<string, unknown>).ticketsCount ?? 0),
          },
          {
            key: "avg",
            label: "Ticket promedio",
            render: (cut: CashCut) => formatMoney(Number((cut.summary as Record<string, unknown>).avgTicket ?? 0)),
          },
          { key: "by", label: "Por", render: (cut: CashCut) => cut.generatedByUser?.name ?? "—" },
        ]}
      />
      ) : null}
      {loading ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !cuts.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          Esta sucursal todavía no tiene cortes congelados.
        </div>
      ) : null}

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md">
        <DialogTitle>
          Corte {String(summary.from ?? "")} a {String(summary.to ?? "")}
        </DialogTitle>
        <DialogContent dividers>
          <div className="grid gap-3 sm:grid-cols-4" style={{ marginBottom: 16 }}>
            <DetailField label="Total" value={formatMoney(Number(summary.total ?? 0))} />
            <DetailField label="Tickets" value={String(summary.ticketsCount ?? 0)} />
            <DetailField label="Ticket promedio" value={formatMoney(Number(summary.avgTicket ?? 0))} />
            <DetailField label="Artículos" value={formatQuantity(Number(summary.itemsCount ?? 0))} />
          </div>
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
              {products.map((row) => (
                <tr key={`${row.name}-${row.saleUnit}`}>
                  <td>{row.name}</td>
                  <td>{row.saleUnit === "liter" ? "litro" : "pieza"}</td>
                  <td style={{ textAlign: "right" }}>{formatQuantity(row.quantity)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(row.revenue)}</td>
                  <td style={{ textAlign: "right" }}>{row.tickets}</td>
                </tr>
              ))}
              {!products.length ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}>
                    Sin ventas en ese periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
