"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, IconButton, MenuItem, TextField, Tooltip } from "@mui/material";
import { ChevronDown, FileDown, PackagePlus, RefreshCw, Sheet, Truck } from "lucide-react";
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
import { RESTOCK_STATUS_LABELS, packQtyLabel, packSummary, packTotals, unitLabel } from "../pos-labels";
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

/**
 * Pedidos a fábrica de la sucursal. Arriba va **el paso en que está**:
 * - sin pedido en camino → **Faltante de hoy** con "Confirmar pedido a fábrica";
 * - con pedido en camino → **Pedido en camino** con "Recibir", y el faltante
 *   plegado: no descuenta lo que viene, así que mostrarlo abierto con un
 *   candado parecía que no se había pedido nada.
 * Abajo, el **Historial** (recibidos y cancelados). "Recibir algo que no se
 * pidió" (la hoja en blanco) es la excepción y va como botón secundario.
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
  /** Con un pedido en camino el faltante va plegado; se abre a mano. */
  const [showShortages, setShowShortages] = useState(false);
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
      toast.success("Pedido a fábrica confirmado: ya aparece como pedido en camino");
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

  // Llegó producto que no estaba en ningún pedido: la hoja en blanco.
  const receiveBlankButton = canDispatch ? (
    <Button
      size="small"
      variant="outlined"
      startIcon={<PackagePlus size={14} />}
      component={Link}
      href={`/dashboard/pos/sucursales/${branch.id}/entrada?basis=blank`}
      title="Llegó producto que no estaba en ningún pedido: se captura en la hoja en blanco"
      sx={{ whiteSpace: "nowrap" }}
    >
      Recibir algo que no se pidió
    </Button>
  ) : null;

  return (
    <div className="page-stack">
      {!isFranchise ? (
        blocking ? (
          <section className="panel p-5">
            <div className="toolbar" style={{ marginBottom: 8, alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <Truck size={20} style={{ color: "var(--glam-blue)" }} />
                  {awaiting.length === 1 ? "Pedido en camino" : `${awaiting.length} pedidos en camino`}
                </h2>
                <p className="page-kicker" style={{ margin: 0 }}>
                  Ya se pidió a fábrica. Cuando llegue, presiona <strong>Recibir</strong>: la hoja viene con lo pedido
                  y solo corriges lo que llegó distinto. El siguiente pedido se podrá hacer cuando este se reciba.
                </p>
              </div>
              {receiveBlankButton}
            </div>
            <RestockOrdersTable
              orders={awaiting}
              canUpdate={canUpdate}
              canDispatch={canDispatch}
              onChanged={reloadAll}
              showAge
              emptyText="Nada en camino."
            />
            {shortages?.length ? (
              <div style={{ marginTop: 12 }}>
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => setShowShortages((open) => !open)}
                  endIcon={
                    <ChevronDown
                      size={16}
                      style={{ transform: showShortages ? "rotate(180deg)" : undefined, transition: "transform .2s" }}
                    />
                  }
                  aria-expanded={showShortages}
                >
                  Ver faltante de hoy ({packSummary(shortages)})
                </Button>
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
        ) : (
          <section className="panel p-5">
            <div className="toolbar" style={{ marginBottom: 8, alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0 }}>Faltante de hoy</h2>
                <p className="page-kicker" style={{ margin: 0 }}>
                  Contra el stock que esta sucursal debe tener siempre: se pide un empaque completo por cada
                  empaque del que ya se vendió la mitad.
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
                  title="El faltante en la hoja del formato, para revisarlo: todavía no es un pedido"
                >
                  {downloadingForm ? "Generando..." : "Ver en formato"}
                </Button>
                {canCreate ? (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Truck size={14} />}
                    disabled={!shortages?.length || generating}
                    onClick={() => void generate()}
                  >
                    {generating ? "Confirmando..." : "Confirmar pedido a fábrica"}
                  </Button>
                ) : null}
              </div>
            </div>
            {shortages?.length ? (
              <ShortagesTable shortages={shortages} />
            ) : (
              <p className="page-kicker" style={{ margin: 0 }}>
                {shortages === null ? "Calculando..." : "Está completa en su stock: no hay nada que pedir."}
              </p>
            )}
            {receiveBlankButton ? <div style={{ marginTop: 12 }}>{receiveBlankButton}</div> : null}
          </section>
        )
      ) : (
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
      )}

      <section className="panel p-5" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Historial</h2>
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
