"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { InventoryCountBranchStats, InventoryCountStats } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { FilterBar, FilterMeta, FilterSegmented } from "../FilterBar";
import { formatDateOnlyRange, relativeDays, shiftDateOnly, todayInMexico } from "../pos-labels";
import { accuracyTone, percentLabel, signedMoney, signedQty } from "./count-labels";
import "./counts.css";

type Period = "7" | "30" | "90";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
];

function Meter({ value, tone }: { value: number | null; tone?: string }) {
  if (value == null) return <span className="pos-branch-muted">—</span>;
  const width = Math.max(0, Math.min(100, value));
  return (
    <span className="count-meter">
      <span className={`count-meter-bar${tone ? ` is-${tone}` : ""}`}>
        <i style={{ width: `${width}%` }} />
      </span>
      <b>{percentLabel(value)}</b>
    </span>
  );
}

/** Peor exactitud primero; las sucursales sin conteos en el periodo, al final. */
function byWorstAccuracy(a: InventoryCountBranchStats, b: InventoryCountBranchStats): number {
  if (a.accuracy == null && b.accuracy == null) return a.code.localeCompare(b.code);
  if (a.accuracy == null) return 1;
  if (b.accuracy == null) return -1;
  return a.accuracy - b.accuracy || a.netVarianceAmount - b.netVarianceAmount;
}

/**
 * Pestaña Indicadores: exactitud, merma neta y cobertura por sucursal en el
 * periodo (de peor a mejor exactitud) y los 10 productos con más diferencia.
 * Clic en una sucursal abre sus conteos.
 */
export function CountsStatsTab({ onOpenBranch }: { onOpenBranch: (branchId: string) => void }) {
  const [period, setPeriod] = useState<Period>("30");
  const [stats, setStats] = useState<InventoryCountStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const to = todayInMexico();
    const from = shiftDateOnly(to, -(Number(period) - 1));
    try {
      setStats(await httpClient.get<InventoryCountStats>("/pos/counts/stats", { from, to }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los indicadores"));
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const branches = useMemo(() => [...(stats?.branches ?? [])].sort(byWorstAccuracy), [stats]);

  const totals = useMemo(() => {
    const counted = branches.filter((row) => row.counts > 0);
    const items = counted.reduce((sum, row) => sum + row.itemsCounted, 0);
    const accuracyWeight = counted.filter((row) => row.accuracy != null);
    const weight = accuracyWeight.reduce((sum, row) => sum + (row.itemsCounted || 1), 0);
    const coverageRows = branches.filter((row) => row.coverage != null);
    return {
      counts: branches.reduce((sum, row) => sum + row.counts, 0),
      items,
      withoutCounts: branches.length - counted.length,
      accuracy: weight
        ? accuracyWeight.reduce((sum, row) => sum + Number(row.accuracy) * (row.itemsCounted || 1), 0) / weight
        : null,
      net: branches.reduce((sum, row) => sum + Number(row.netVarianceAmount ?? 0), 0),
      coverage: coverageRows.length
        ? coverageRows.reduce((sum, row) => sum + Number(row.coverage), 0) / coverageRows.length
        : null,
    };
  }, [branches]);

  const top = stats?.topVariances ?? [];

  return (
    <>
      <FilterBar>
        <FilterSegmented label="Periodo" options={PERIODS} value={period} onChange={setPeriod} />
        <FilterMeta>{stats ? formatDateOnlyRange(stats.from.slice(0, 10), stats.to.slice(0, 10)) : null}</FilterMeta>
      </FilterBar>

      <section className="grid grid-4 counts-metrics">
        <div className="card metric">
          <div className="metric-head">
            <span>Exactitud de inventario</span>
          </div>
          <strong
            style={{
              color:
                totals.accuracy == null
                  ? undefined
                  : { good: "#15803d", warn: "#b45309", bad: "#c62828", none: undefined }[accuracyTone(totals.accuracy)],
            }}
          >
            {percentLabel(totals.accuracy)}
          </strong>
          <small>{totals.items} renglones contados, dentro de tolerancia</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Merma neta</span>
          </div>
          <strong className={totals.net < 0 ? "count-negative" : undefined}>{signedMoney(totals.net)}</strong>
          <small>Todas las sucursales, a precio de tienda</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Cobertura promedio</span>
          </div>
          <strong>{percentLabel(totals.coverage)}</strong>
          <small>Del catálogo de cada sucursal contado en el periodo</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Conteos</span>
          </div>
          <strong>{totals.counts}</strong>
          <small style={{ color: totals.withoutCounts ? "#b45309" : undefined }}>
            {totals.withoutCounts
              ? `${totals.withoutCounts} ${totals.withoutCounts === 1 ? "sucursal" : "sucursales"} sin contar`
              : "Todas las sucursales con conteo"}
          </small>
        </div>
      </section>

      <h2 className="count-section-title">Por sucursal · de peor a mejor exactitud</h2>
      <div className="counts-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Sucursal</th>
              <th>Exactitud</th>
              <th className="is-num">Merma neta</th>
              <th>Cobertura</th>
              <th className="is-num">Conteos</th>
              <th className="is-num">Renglones</th>
              <th>Último conteo</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((row) => (
              <tr
                key={row.branchId}
                className="clickable-row"
                tabIndex={0}
                onClick={() => onOpenBranch(row.branchId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpenBranch(row.branchId);
                }}
              >
                <td>
                  <strong style={{ color: "var(--glam-navy)" }}>{row.code}</strong> · {row.name}
                </td>
                <td>
                  <Meter value={row.accuracy} tone={accuracyTone(row.accuracy)} />
                </td>
                <td className={`is-num${row.netVarianceAmount < 0 ? " count-negative" : ""}`}>
                  {row.counts ? signedMoney(row.netVarianceAmount) : "—"}
                </td>
                <td>
                  <Meter value={row.coverage} />
                </td>
                <td className="is-num">{row.counts}</td>
                <td className="is-num">{row.itemsCounted}</td>
                <td>
                  {row.lastCountAt ? (
                    relativeDays(row.lastCountAt)
                  ) : (
                    <span style={{ color: "#b45309", fontWeight: 600 }}>Sin conteos</span>
                  )}
                </td>
              </tr>
            ))}
            {!branches.length ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>
                  {loading ? "Cargando indicadores..." : "Sin sucursales en el periodo."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2 className="count-section-title">Top 10 productos con más diferencia</h2>
      <div className="counts-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="is-num">#</th>
              <th>Producto</th>
              <th className="is-num">Diferencia</th>
              <th className="is-num">Valor</th>
              <th className="is-num">Veces contado</th>
            </tr>
          </thead>
          <tbody>
            {top.slice(0, 10).map((row, index) => (
              <tr key={row.lineId ?? row.productId ?? `${row.name}-${index}`}>
                <td className="is-num">{index + 1}</td>
                <td className="count-name">
                  <b>{row.name}</b>
                  <small>{row.unit === "liters" ? "Líquido por línea (litros)" : "Piezas"}</small>
                </td>
                <td className={`is-num${row.varianceQty < 0 ? " count-negative" : ""}`}>
                  {signedQty(row.varianceQty, row.unit)}
                </td>
                <td className={`is-num${row.varianceAmount < 0 ? " count-negative" : ""}`}>
                  <strong>{signedMoney(row.varianceAmount)}</strong>
                </td>
                <td className="is-num">{row.counts}</td>
              </tr>
            ))}
            {!top.length ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>
                  {loading ? "Cargando..." : "Sin diferencias en el periodo."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
