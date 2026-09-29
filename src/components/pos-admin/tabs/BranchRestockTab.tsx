"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, IconButton, MenuItem, TextField, Tooltip } from "@mui/material";
import { FileDown, Lock, PackagePlus, RefreshCw, Sheet, Truck } from "lucide-react";
import Link from "next/link";
import { BRANCH_TYPES, RESTOCK_ORDER_STATUS } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { Branch, BranchShortage, ListResponse, RestockOrder } from "@/types";
import { toast } from "sonner";
import { RestockOrdersTable } from "../RestockOrdersTable";
import { isAwaitingRestockOrder } from "../RestockOrderActions";
import { RestockAwaitingDialog, blockingRestockOrder, isAwaitingOrderError } from "../RestockAwaitingDialog";
import { FilterBar, FilterDateRange, FilterMeta, type DateRangeOption } from "../FilterBar";
import { RESTOCK_STATUS_LABELS, formatDateTime, packQtyLabel, packTotals, unitLabel } from "../pos-labels";
import { useFactoryFormDownload } from "../useFactoryFormDownload";

/** Aquí sí hay "Todo": el historial completo de la sucursal es lo normal. */
const RANGES: DateRangeOption[] = [
  { key: "todo", label: "Todo", days: null },
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
];

/** El historial es lo que ya terminó: lo abierto vive arriba en "Por recibir". */
const HISTORY_STATUSES = [RESTOCK_ORDER_STATUS.RECEIVED, RESTOCK_ORDER_STATUS.CANCELLED];

/** Tabla Producto / Faltante en CSV, la que fábrica imprime. */
function exportShortagesCsv(shortages: BranchShortage[], code: string) {
  const rows = [
    ["Producto", "Faltante", "Unidad", "Piezas por empaque"],
    ...shortages.map((row) => [
      row.name,
      String(row.requestedQty),
      unitLabel(row.requestedQty, row.unit, row.packLabel),
      row.unit === "bidon" ? "" : String(Number(row.unitsPerPackage ?? 1) || 1),
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `faltantes-${code}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Pedidos a fábrica de la sucursal, en el orden en que se trabajan:
 * 1. **Faltante de hoy** → "Confirmar pedido a fábrica" (donde empieza el ciclo);
 * 2. **Por recibir**: lo pedido que no ha llegado, con "Registrar llegada";
 * 3. **Historial**: lo recibido y lo cancelado, con filtros.
 * La entrada sin pedido (llegó algo que nadie pidió) es la excepción y va
 * como botón secundario en "Por recibir".
 */
export function BranchRestockTab({ branch }: { branch: Branch }) {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canRestock = can("posRestock", "view");
  const canCreate = can("posRestock", "create");
  const canUpdate = can("posRestock", "update");
  const isFranchise = branch.type === BRANCH_TYPES.FRANCHISE;
  // Registrar la llegada sube inventario: pide surtido e inventario.
  const canDispatch = !isFranchise && canUpdate && can("posInventory", "update");

  const [status, setStatus] = useState("");
  /** Rango por fecha del pedido; vacío = sin filtrar. */
  const [range, setRange] = useState({ from: "", to: "" });
  const [awaiting, setAwaiting] = useState<RestockOrder[]>([]);
  const [history, setHistory] = useState<RestockOrder[]>([]);
  const [shortages, setShortages] = useState<BranchShortage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  /** Pedido en camino que impide confirmar otro: abre el modal de alerta. */
  const [blockedBy, setBlockedBy] = useState<RestockOrder | null>(null);
  const { download: downloadForm, downloading: downloadingForm } = useFactoryFormDownload();

  const loadAwaiting = useCallback(async (): Promise<RestockOrder[]> => {
    if (!canRestock) return [];
    try {
      const result = await httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", {
        branchId: branch.id,
        limit: 100,
      });
      const list = result.items.filter(isAwaitingRestockOrder);
      setAwaiting(list);
      return list;
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los pedidos"));
      return [];
    }
  }, [canRestock, branch.id]);

  const loadHistory = useCallback(async () => {
    if (!canRestock) return;
    setLoading(true);
    try {
      const result = await httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", {
        branchId: branch.id,
        limit: 100,
        ...(status ? { status } : {}),
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
      });
      setHistory(result.items.filter((order) => !isAwaitingRestockOrder(order)));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los pedidos"));
    } finally {
      setLoading(false);
    }
  }, [canRestock, branch.id, status, range.from, range.to]);

  const loadShortages = useCallback(async () => {
    if (!canRestock || isFranchise) return;
    try {
      setShortages(
        await httpClient.get<BranchShortage[]>(`/pos/restock/branches/${branch.id}/shortages`)
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo calcular el faltante"));
    }
  }, [canRestock, isFranchise, branch.id]);

  const reloadAll = useCallback(() => {
    void loadAwaiting();
    void loadHistory();
    void loadShortages();
  }, [loadAwaiting, loadHistory, loadShortages]);

  useEffect(() => {
    void loadAwaiting();
    void loadShortages();
  }, [loadAwaiting, loadShortages]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "restock_orders_changed" && event.branchId === branch.id) {
        void loadAwaiting();
        void loadHistory();
      }
      if (event.type === "pos_sales_changed" && event.branchId === branch.id) void loadShortages();
    });
  }, [subscribe, branch.id, loadAwaiting, loadHistory, loadShortages]);

  const totals = useMemo(() => packTotals(shortages ?? []), [shortages]);

  if (!canRestock) {
    return (
      <div className="panel p-5" style={{ color: "var(--muted)" }}>
        Los pedidos a fábrica necesitan el permiso de Faltantes y surtido.
      </div>
    );
  }

  const blocking = blockingRestockOrder(awaiting);

  async function generate() {
    // Un pedido a la vez: con uno en camino no se confirma otro (el Back
    // también lo rechaza con 409; aquí se explica antes de intentarlo).
    if (blocking) {
      setBlockedBy(blocking);
      return;
    }
    setGenerating(true);
    try {
      const result = await httpClient.post<RestockOrder | { created: false; message: string }>(
        `/pos/restock/branches/${branch.id}/generate`,
        {}
      );
      if ("created" in result && result.created === false) {
        toast.info(result.message);
        return;
      }
      toast.success("Pedido a fábrica confirmado: quedó en Por recibir");
      reloadAll();
    } catch (error) {
      if (isAwaitingOrderError(error)) {
        // Alguien lo creó en otra pestaña o el corte automático se adelantó.
        setBlockedBy(blockingRestockOrder(await loadAwaiting()));
      } else {
        toast.error(getApiErrorMessage(error, "No se pudo generar el pedido"));
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="page-stack">
      {!isFranchise ? (
        <section className="panel p-5">
          <div className="toolbar" style={{ marginBottom: 8, alignItems: "flex-start" }}>
            <div>
              <h2 style={{ margin: 0 }}>1 · Faltante de hoy</h2>
              <p className="page-kicker" style={{ margin: 0 }}>
                Contra el stock mínimo de esta sucursal: se pide en empaques completos cuando el
                faltante alcanza el 30 % del mínimo.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className="page-kicker" style={{ margin: 0 }}>
                <strong style={{ color: "var(--glam-navy)" }}>{totals.bidones}</strong> bidones ·{" "}
                <strong style={{ color: "var(--glam-navy)" }}>{totals.cajas}</strong> cajas ·{" "}
                <strong style={{ color: "var(--glam-navy)" }}>{totals.piezas}</strong> piezas
              </span>
              <Tooltip title="Recalcular contra la existencia de ahorita">
                <IconButton size="small" aria-label="Recalcular faltante" onClick={() => void loadShortages()}>
                  <RefreshCw size={16} />
                </IconButton>
              </Tooltip>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Sheet size={14} />}
                disabled={!shortages?.length}
                onClick={() => exportShortagesCsv(shortages ?? [], branch.code)}
              >
                CSV
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FileDown size={14} />}
                disabled={shortages === null || downloadingForm}
                onClick={() => void downloadForm(`/pos/restock/branches/${branch.id}/shortages/form`)}
                title="El formato de pedido a fábrica en PDF, con los faltantes ya puestos"
              >
                {downloadingForm ? "Generando..." : "Descargar formato"}
              </Button>
              {canCreate ? (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={blocking ? <Lock size={14} /> : <Truck size={14} />}
                  disabled={!shortages?.length || generating}
                  onClick={() => void generate()}
                  title={blocking ? "Hay un pedido en camino: se podrá confirmar otro cuando se reciba" : undefined}
                >
                  {generating ? "Confirmando..." : "Confirmar pedido a fábrica"}
                </Button>
              ) : null}
            </div>
          </div>
          {blocking && shortages?.length ? (
            <p className="page-kicker" style={{ margin: "0 0 8px", color: "#92400e", display: "flex", alignItems: "center", gap: 6 }}>
              <Lock size={14} /> Hay un pedido del {formatDateTime(blocking.createdAt)} en camino: no se puede confirmar
              otro hasta que ese se registre como recibido.
            </p>
          ) : null}
          {shortages?.length ? (
            <div className="table-container-premium">
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th style={{ textAlign: "right" }}>Pedir</th>
                    <th style={{ textAlign: "right" }}>Existencia</th>
                    <th style={{ textAlign: "right" }}>Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {shortages.map((row) => (
                    <tr key={row.lineId ?? row.productId}>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "var(--glam-navy)" }}>
                        {packQtyLabel(row.requestedQty, row.unit, row.unitsPerPackage, row.packLabel)}
                      </td>
                      <td style={{ textAlign: "right", color: row.stock < 0 ? "#ef4444" : undefined }}>
                        {formatQuantity(row.stock)} {row.unit === "bidon" ? "L" : "pz"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {formatQuantity(row.minStock)} {row.unit === "bidon" ? "L" : "pz"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="page-kicker" style={{ margin: 0 }}>
              {shortages === null ? "Calculando..." : "Está por encima de su stock mínimo: no hay nada que pedir."}
            </p>
          )}
        </section>
      ) : null}

      <section className="panel p-5">
        <div className="toolbar" style={{ marginBottom: 8, alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0 }}>{isFranchise ? "Pedidos abiertos" : "2 · Por recibir"}</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              {isFranchise
                ? "Lo que la franquicia pidió y todavía no se le entrega."
                : "Lo que se pidió a fábrica y no ha llegado. Cuando llegue, \"Registrar llegada\" abre la hoja precargada con el pedido: se corrige con lo que de verdad llegó y sube al inventario."}
            </p>
          </div>
          {canDispatch ? (
            <Button
              variant="outlined"
              startIcon={<PackagePlus size={16} />}
              component={Link}
              href={`/dashboard/pos/sucursales/${branch.id}/entrada?basis=blank`}
              title="Llegó producto que no estaba en ningún pedido: se captura en la hoja en blanco"
              sx={{ whiteSpace: "nowrap" }}
            >
              Llegada sin pedido
            </Button>
          ) : null}
        </div>
        <RestockOrdersTable
          orders={awaiting}
          canUpdate={canUpdate}
          canDispatch={canDispatch}
          onChanged={reloadAll}
          showAge
          emptyText="Nada por recibir: no hay pedidos abiertos."
        />
      </section>

      <section className="panel p-5" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>{isFranchise ? "Historial" : "3 · Historial"}</h2>
        <FilterBar>
          <FilterDateRange
            label="Fecha del pedido"
            options={RANGES}
            from={range.from}
            to={range.to}
            onChange={setRange}
            collapsible
          />
          <TextField
            select
            size="small"
            label="Estado"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ displayEmpty: true }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Recibidos y cancelados</MenuItem>
            {HISTORY_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {RESTOCK_STATUS_LABELS[value] ?? value}
              </MenuItem>
            ))}
          </TextField>
          <FilterMeta>
            <strong>{history.length}</strong> {history.length === 1 ? "pedido" : "pedidos"}
          </FilterMeta>
        </FilterBar>
        <RestockOrdersTable
          orders={history}
          canUpdate={canUpdate}
          canDispatch={canDispatch}
          onChanged={reloadAll}
          loading={loading}
          emptyText="No hay pedidos terminados con este filtro."
        />
      </section>

      <RestockAwaitingDialog
        order={blockedBy}
        branchLabel={`${branch.code} · ${branch.name}`}
        onClose={() => setBlockedBy(null)}
      />
    </div>
  );
}
