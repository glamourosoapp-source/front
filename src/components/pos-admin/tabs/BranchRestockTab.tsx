"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Chip, IconButton, MenuItem, TextField, Tooltip } from "@mui/material";
import { ArrowRight, CheckCircle2, ChevronDown, FileDown, PackagePlus, RefreshCw, Sheet, Truck } from "lucide-react";
import Link from "next/link";
import { BRANCH_TYPES, RESTOCK_ORDER_STATUS } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { Branch, BranchShortage, ListResponse, RestockOrder } from "@/types";
import { toast } from "sonner";
import { RestockOrdersTable } from "../RestockOrdersTable";
import { RestockOrderRows } from "../RestockOrderRows";
import { RestockOrderActions, isAwaitingRestockOrder } from "../RestockOrderActions";
import { RestockSteps } from "../RestockSteps";
import { FilterBar, FilterDateRange, FilterMeta, type DateRangeOption } from "../FilterBar";
import {
  RESTOCK_STATUS_COLORS,
  RESTOCK_STATUS_LABELS,
  formatDate,
  formatDateTime,
  packQtyLabel,
  packSummary,
  packTotals,
  relativeDays,
  restockOrderSheetHref,
  restockReviewHref,
  unitLabel,
} from "../pos-labels";
import { useFactoryFormDownload } from "../useFactoryFormDownload";

/** Aquí sí hay "Todo": el historial completo de la sucursal es lo normal. */
const RANGES: DateRangeOption[] = [
  { key: "todo", label: "Todo", days: null },
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
];

/** El historial es lo que ya terminó: lo abierto vive arriba, en el paso actual. */
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

/** Faltante de hoy: lo que se pediría, contra la existencia y el stock. */
function ShortagesTable({ shortages }: { shortages: BranchShortage[] }) {
  return (
    <div className="table-container-premium">
      <table className="table">
        <thead>
          <tr>
            <th>Producto</th>
            <th style={{ textAlign: "right" }}>Pedir</th>
            <th style={{ textAlign: "right" }}>Existencia</th>
            <th style={{ textAlign: "right" }}>Stock</th>
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
  );
}

/** Abre y cierra una sección dentro de la tarjeta (el faltante completo). */
function Toggle({ open, onClick, children }: { open: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      size="small"
      color="inherit"
      onClick={onClick}
      aria-expanded={open}
      endIcon={<ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />}
    >
      {children}
    </Button>
  );
}

/**
 * Pedidos a fábrica de la sucursal, en 3 pasos (Revisar y enviar → En camino →
 * Recibido). Arriba, **una tarjeta con el paso en que está**:
 * - con faltante y nada en camino → "Por pedir", con **Revisar y enviar**;
 * - con un pedido en camino → ese pedido, con **Recibir** (el faltante va
 *   plegado: no descuenta lo que viene, así que abierto parecía que no se
 *   había pedido nada);
 * - completa → "Al día".
 * Abajo, el **historial** (recibidos y cancelados) como tarjetas desplegables,
 * igual que Cortes. "Recibir algo que no se pidió" es la excepción.
 */
export function BranchRestockTab({ branch }: { branch: Branch }) {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canRestock = can("posRestock", "view");
  const canCreate = can("posRestock", "create");
  const canUpdate = can("posRestock", "update");
  const canSeeCosts = can("productCosts", "view");
  const isFranchise = branch.type === BRANCH_TYPES.FRANCHISE;
  // Recibir sube inventario: pide surtido e inventario.
  const canDispatch = !isFranchise && canUpdate && can("posInventory", "update");

  const [status, setStatus] = useState("");
  /** Rango por fecha del pedido; vacío = sin filtrar. */
  const [range, setRange] = useState({ from: "", to: "" });
  const [awaiting, setAwaiting] = useState<RestockOrder[]>([]);
  const [history, setHistory] = useState<RestockOrder[]>([]);
  const [shortages, setShortages] = useState<BranchShortage[] | null>(null);
  const [loading, setLoading] = useState(false);
  /** El faltante completo va plegado; se abre a mano. */
  const [showShortages, setShowShortages] = useState(false);
  const { download: downloadForm, downloading: downloadingForm } = useFactoryFormDownload();

  const loadAwaiting = useCallback(async (): Promise<RestockOrder[]> => {
    if (!canRestock) return [];
    try {
      const result = await httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", {
        branchId: branch.id,
        limit: 100,
      });
      // El más viejo primero: es el que bloquea el siguiente pedido.
      const list = result.items.filter(isAwaitingRestockOrder).reverse();
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
      setShortages(await httpClient.get<BranchShortage[]>(`/pos/restock/branches/${branch.id}/shortages`));
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
        void loadShortages();
      }
      if (event.type === "pos_sales_changed" && event.branchId === branch.id) void loadShortages();
    });
  }, [subscribe, branch.id, loadAwaiting, loadHistory, loadShortages]);

  const totals = useMemo(() => packTotals(shortages ?? []), [shortages]);
  const lastReceived = useMemo(
    () => history.find((order) => order.status === RESTOCK_ORDER_STATUS.RECEIVED) ?? null,
    [history]
  );

  if (!canRestock) {
    return (
      <div className="panel p-5" style={{ color: "var(--muted)" }}>
        Los pedidos a fábrica necesitan el permiso de Faltantes y surtido.
      </div>
    );
  }

  const inTransit = awaiting[0] ?? null;
  const others = awaiting.slice(1);

  // Llegó producto que no estaba en ningún pedido: la hoja en blanco.
  const receiveBlankLink = canDispatch ? (
    <Link href={`/dashboard/pos/sucursales/${branch.id}/entrada?basis=blank`}>
      <PackagePlus size={14} /> Recibir algo que no se pidió
    </Link>
  ) : null;

  let current: React.ReactNode = null;
  if (!isFranchise) {
    if (inTransit) {
      current = (
        <section className="pos-day pos-cut is-overall restock-current">
          <div className="restock-current-steps">
            <RestockSteps current="transit" />
          </div>
          <div className="pos-day-head">
            <span className="pos-day-chevron restock-current-icon is-transit">
              <Truck size={18} />
            </span>
            <span className="pos-day-date">
              <span className="pos-day-weekday">
                Pedido en camino
                <Chip
                  size="small"
                  label={RESTOCK_STATUS_LABELS[inTransit.status] ?? inTransit.status}
                  color={RESTOCK_STATUS_COLORS[inTransit.status] ?? "default"}
                  sx={{ fontStyle: "normal" }}
                />
              </span>
              <span className="pos-day-fulldate">
                Pedido del {formatDateTime(inTransit.createdAt)} · {relativeDays(inTransit.createdAt)}
              </span>
            </span>
            <span className="pos-branch-status">
              <span>
                {inTransit.status === RESTOCK_ORDER_STATUS.PENDING
                  ? "Todavía no se marca como enviado a fábrica: envíalo o, si ya llegó, recíbelo desde el menú."
                  : "Cuando llegue, presiona Recibir: viene con lo pedido y solo corriges lo que llegó distinto."}
              </span>
            </span>
            <span className="pos-day-stats">
              <span className="pos-day-stat">
                <small>Productos</small>
                <b>{inTransit.items?.length ?? 0}</b>
              </span>
              {inTransit.total != null && canSeeCosts ? (
                <span className="pos-day-stat is-total">
                  <small>Total</small>
                  <b>{formatMoney(inTransit.total)}</b>
                </span>
              ) : null}
            </span>
          </div>
          <div className="pos-cut-footer restock-current-footer">
            <Link href={restockOrderSheetHref(inTransit.id)}>
              Ver pedido <ArrowRight size={14} />
            </Link>
            {receiveBlankLink}
            <span style={{ flex: 1 }} />
            <RestockOrderActions order={inTransit} canUpdate={canUpdate} canDispatch={canDispatch} onChanged={reloadAll} size="medium" />
          </div>
          {others.length ? (
            <div className="pos-day-body" style={{ padding: 16 }}>
              <p className="page-kicker" style={{ marginTop: 0 }}>
                También en camino ({others.length}):
              </p>
              <RestockOrdersTable
                orders={others}
                canUpdate={canUpdate}
                canDispatch={canDispatch}
                onChanged={reloadAll}
                showAge
                emptyText=""
              />
            </div>
          ) : null}
          {shortages?.length ? (
            <div className="pos-day-body" style={{ padding: "10px 16px 14px" }}>
              <Toggle open={showShortages} onClick={() => setShowShortages((open) => !open)}>
                Ver faltante de hoy ({packSummary(shortages)})
              </Toggle>
              {showShortages ? (
                <>
                  <p className="page-kicker" style={{ margin: "4px 0 8px" }}>
                    No descuenta lo que viene en camino: lo que llegue con este pedido ya no saldrá aquí.
                  </p>
                  <ShortagesTable shortages={shortages} />
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      );
    } else if (shortages?.length) {
      const top = shortages.slice(0, 6);
      current = (
        <section className="pos-day pos-cut is-overall restock-current">
          <div className="restock-current-steps">
            <RestockSteps current="review" />
          </div>
          <div className="pos-day-head">
            <span className="pos-day-chevron restock-current-icon is-pending">
              <Truck size={18} />
            </span>
            <span className="pos-day-date">
              <span className="pos-day-weekday">
                Por pedir
                <span className="pos-day-badge restock-badge-pending">
                  {shortages.length === 1 ? "1 producto" : `${shortages.length} productos`}
                </span>
              </span>
              <span className="pos-day-fulldate">
                Faltante de hoy contra su Stock: un empaque por cada empaque del que ya se vendió la mitad.
              </span>
            </span>
            <span className="pos-branch-status restock-top">
              {top.map((row) => (
                <span key={row.lineId ?? row.productId}>
                  <strong>{packQtyLabel(row.requestedQty, row.unit, row.unitsPerPackage, row.packLabel)}</strong>
                  &nbsp;{row.name}
                </span>
              ))}
              {shortages.length > top.length ? (
                <span className="pos-branch-muted">y {shortages.length - top.length} más</span>
              ) : null}
            </span>
            <span className="pos-day-stats">
              <span className="pos-day-stat">
                <small>Bidones</small>
                <b>{totals.bidones}</b>
              </span>
              <span className="pos-day-stat">
                <small>Cajas</small>
                <b>{totals.cajas}</b>
              </span>
              <span className="pos-day-stat">
                <small>Piezas</small>
                <b>{totals.piezas}</b>
              </span>
            </span>
          </div>
          <div className="pos-cut-footer restock-current-footer">
            <Tooltip title="Recalcular contra la existencia de ahorita">
              <IconButton size="small" aria-label="Recalcular faltante" onClick={() => void loadShortages()}>
                <RefreshCw size={16} />
              </IconButton>
            </Tooltip>
            <Button size="small" variant="outlined" startIcon={<Sheet size={14} />} onClick={() => exportShortagesCsv(shortages, branch.code)}>
              CSV
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDown size={14} />}
              disabled={downloadingForm}
              onClick={() => void downloadForm(`/pos/restock/branches/${branch.id}/shortages/form`)}
              title="El faltante en la hoja del formato, para revisarlo: todavía no es un pedido"
            >
              {downloadingForm ? "Generando..." : "Ver en formato"}
            </Button>
            {receiveBlankLink}
            <span style={{ flex: 1 }} />
            {canCreate ? (
              <Button variant="contained" startIcon={<Truck size={16} />} component={Link} href={restockReviewHref(branch.id)}>
                Revisar y enviar
              </Button>
            ) : null}
          </div>
          <div className="pos-day-body" style={{ padding: "10px 16px 14px" }}>
            <Toggle open={showShortages} onClick={() => setShowShortages((open) => !open)}>
              Ver todo el faltante ({packSummary(shortages)})
            </Toggle>
            {showShortages ? <ShortagesTable shortages={shortages} /> : null}
          </div>
        </section>
      );
    } else {
      current = (
        <section className="pos-day pos-cut is-overall restock-current">
          <div className="restock-current-steps">
            <RestockSteps current="received" />
          </div>
          <div className="pos-day-head">
            <span className="pos-day-chevron restock-current-icon is-done">
              <CheckCircle2 size={18} />
            </span>
            <span className="pos-day-date">
              <span className="pos-day-weekday">Al día</span>
              <span className="pos-day-fulldate">
                {shortages === null
                  ? "Calculando el faltante…"
                  : `Está completa en su stock: no hay nada que pedir.${
                      lastReceived?.receivedAt ? ` Último surtido recibido el ${formatDate(lastReceived.receivedAt)}.` : ""
                    }`}
              </span>
            </span>
            <span />
            <span />
          </div>
          <div className="pos-cut-footer restock-current-footer">
            {receiveBlankLink}
            <span style={{ flex: 1 }} />
            {canCreate && shortages !== null ? (
              <Button variant="outlined" startIcon={<Truck size={16} />} component={Link} href={restockReviewHref(branch.id)}>
                Hacer un pedido de todos modos
              </Button>
            ) : null}
          </div>
        </section>
      );
    }
  }

  return (
    <div className="page-stack">
      {isFranchise ? (
        <section className="panel p-5">
          <div className="toolbar" style={{ marginBottom: 8, alignItems: "flex-start" }}>
            <div>
              <h2 style={{ margin: 0 }}>Pedidos abiertos</h2>
              <p className="page-kicker" style={{ margin: 0 }}>
                Lo que la franquicia pidió y todavía no se le entrega.
              </p>
            </div>
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
      ) : (
        current
      )}

      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Historial</h2>
        <FilterBar>
          <FilterDateRange label="Fecha del pedido" options={RANGES} from={range.from} to={range.to} onChange={setRange} collapsible />
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
        <RestockOrderRows
          orders={history}
          canUpdate={canUpdate}
          canDispatch={canDispatch}
          onChanged={reloadAll}
          loading={loading}
          emptyText="No hay pedidos terminados con este filtro."
        />
      </section>
    </div>
  );
}
