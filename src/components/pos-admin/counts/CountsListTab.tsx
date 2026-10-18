"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import { toast } from "sonner";
import { INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import type { Branch, ListResponse } from "@/types";
import { posBranches } from "../BranchPicker";
import { FilterBar, FilterDateRange, FilterMeta, FilterSegmented, type DateRangeOption } from "../FilterBar";
import { shiftDateOnly, todayInMexico } from "../pos-labels";
import { CountCard } from "./CountCard";
import { percentLabel, signedMoney, type CountListRow } from "./count-labels";
import "./counts.css";

const RANGES: DateRangeOption[] = [
  { key: "todo", label: "Todo", days: null },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
  { key: "90d", label: "90 días", days: 89 },
];

type StatusFilter = "all" | (typeof INVENTORY_COUNT_STATUS)[keyof typeof INVENTORY_COUNT_STATUS];

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: INVENTORY_COUNT_STATUS.IN_PROGRESS, label: "En curso" },
  { value: INVENTORY_COUNT_STATUS.CLOSED, label: "Cerrados" },
  { value: INVENTORY_COUNT_STATUS.CANCELLED, label: "Cancelados" },
];

const PAGE_SIZE = 50;

/**
 * Pestaña Conteos: cifras del periodo arriba y una tarjeta por conteo, la más
 * reciente primero. Las cifras salen de los conteos cargados con los filtros
 * de la barra (sucursal, estado y fechas).
 */
export function CountsListTab({ initialBranchId = "" }: { initialBranchId?: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(initialBranchId);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [range, setRange] = useState(() => {
    const today = todayInMexico();
    return { from: shiftDateOnly(today, -29), to: today };
  });
  const [rows, setRows] = useState<CountListRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setBranchId(initialBranchId);
  }, [initialBranchId]);

  useEffect(() => {
    // Las sucursales solo alimentan el filtro: si no se pueden leer, salen de los conteos.
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200 })
      .then((result) => setBranches(posBranches(result.items)))
      .catch(() => setBranches([]));
  }, []);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        const result = await httpClient.get<ListResponse<CountListRow>>("/pos/counts", {
          page: nextPage,
          limit: PAGE_SIZE,
          ...(branchId ? { branchId } : {}),
          ...(status !== "all" ? { status } : {}),
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {}),
        });
        setRows((prev) => (nextPage === 1 ? result.items : [...prev, ...result.items]));
        setPage(result.page ?? nextPage);
        setTotal(result.total ?? result.items.length);
        setTotalPages(result.totalPages ?? 1);
      } catch (error) {
        toast.error(getApiErrorMessage(error, "No se pudieron cargar los conteos"));
      } finally {
        setLoading(false);
      }
    },
    [branchId, status, range.from, range.to]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const branchOptions = useMemo(() => {
    if (branches.length) return branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }));
    const seen = new Map<string, { id: string; code: string; name: string }>();
    for (const row of rows) if (row.branch && !seen.has(row.branch.id)) seen.set(row.branch.id, row.branch);
    return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [branches, rows]);

  const kpis = useMemo(() => {
    const closed = rows.filter((row) => row.status === INVENTORY_COUNT_STATUS.CLOSED);
    const inProgress = rows.filter((row) => row.status === INVENTORY_COUNT_STATUS.IN_PROGRESS).length;
    // Exactitud promedio ponderada por renglones: un conteo de 30 pesa más que uno de 5.
    const withAccuracy = closed.filter((row) => row.accuracy != null);
    const weight = withAccuracy.reduce((sum, row) => sum + (row.totalItems || 1), 0);
    const accuracy = weight
      ? withAccuracy.reduce((sum, row) => sum + Number(row.accuracy) * (row.totalItems || 1), 0) / weight
      : null;
    const amounts = closed.filter((row) => row.netVarianceAmount != null);
    const net = amounts.length ? amounts.reduce((sum, row) => sum + Number(row.netVarianceAmount), 0) : null;
    const revertedKnown = closed.some((row) => row.revertedItems != null);
    const reverted = closed.reduce((sum, row) => sum + Number(row.revertedItems ?? 0), 0);
    const rowsAdjusted = closed.reduce((sum, row) => sum + Number(row.totalItems ?? 0), 0);
    return { closed: closed.length, inProgress, accuracy, net, revertedKnown, reverted, rowsAdjusted };
  }, [rows]);

  const partial = rows.length < total;

  return (
    <>
      <section className="grid grid-4 counts-metrics">
        <div className="card metric">
          <div className="metric-head">
            <span>Conteos en el periodo</span>
          </div>
          <strong>{total}</strong>
          <small>
            {kpis.inProgress} en curso · {kpis.closed} cerrados
          </small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Exactitud promedio</span>
          </div>
          <strong
            style={{
              color:
                kpis.accuracy == null ? undefined : kpis.accuracy >= 95 ? "#15803d" : kpis.accuracy >= 85 ? "#b45309" : "#c62828",
            }}
          >
            {percentLabel(kpis.accuracy)}
          </strong>
          <small>Renglones dentro de tolerancia en los cerrados</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Merma neta</span>
          </div>
          <strong className={kpis.net != null && kpis.net < 0 ? "count-negative" : undefined}>
            {kpis.net == null ? "—" : signedMoney(kpis.net)}
          </strong>
          <small>{kpis.net == null ? "Sin conteos cerrados" : "A precio de tienda · negativo = faltante"}</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Renglones revertidos</span>
          </div>
          <strong>{kpis.revertedKnown ? kpis.reverted : "—"}</strong>
          <small>De {kpis.rowsAdjusted} renglones ajustados al cerrar</small>
        </div>
      </section>

      <FilterBar>
        <TextField
          select
          size="small"
          label="Sucursal"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">Todas</MenuItem>
          {branchOptions.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </MenuItem>
          ))}
        </TextField>
        <FilterSegmented label="Estado" options={STATUS_FILTERS} value={status} onChange={setStatus} />
        <FilterDateRange
          label="Fecha del conteo"
          options={RANGES}
          from={range.from}
          to={range.to}
          onChange={setRange}
          collapsible
        />
        <FilterMeta>
          <strong>{total}</strong> {total === 1 ? "conteo" : "conteos"}
          {partial ? ` · cifras de los ${rows.length} cargados` : ""}
        </FilterMeta>
      </FilterBar>

      <div className="count-rows">
        {rows.map((row) => (
          <CountCard key={row.id} count={row} />
        ))}
        {loading ? <p className="page-kicker">Cargando conteos...</p> : null}
        {!loading && !rows.length ? (
          <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
            No hay conteos con este filtro. Los inicia el supervisor de caja desde su app, en la visita a la sucursal.
          </div>
        ) : null}
        {!loading && page < totalPages ? (
          <div className="count-load-more">
            <Button variant="outlined" onClick={() => void load(page + 1)}>
              Ver más conteos
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
