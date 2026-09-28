"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import { FileDown, PackagePlus, RefreshCw, Truck } from "lucide-react";
import Link from "next/link";
import { BRANCH_TYPES, RESTOCK_ORDER_STATUS } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { Branch, BranchShortage, ListResponse, RestockOrder } from "@/types";
import { toast } from "sonner";
import { RestockOrderCard } from "../RestockOrderCard";
import { FilterBar, FilterDateRange, FilterMeta, type DateRangeOption } from "../FilterBar";
import { RESTOCK_STATUS_LABELS, packQtyLabel, packTotals } from "../pos-labels";
import { useFactoryFormDownload } from "../useFactoryFormDownload";

/** Aquí sí hay "Todo": el historial completo de la sucursal es lo normal. */
const RANGES: DateRangeOption[] = [
  { key: "todo", label: "Todo", days: null },
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
];

/**
 * Pedidos a fábrica de la sucursal, y para las sucursales con inventario el
 * faltante calculado en vivo con "Confirmar pedido a fábrica".
 */
export function BranchRestockTab({ branch }: { branch: Branch }) {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canRestock = can("posRestock", "view");
  const canCreate = can("posRestock", "create");
  const canUpdate = can("posRestock", "update");
  const isFranchise = branch.type === BRANCH_TYPES.FRANCHISE;
  // Registrar la entrada sube inventario: pide surtido e inventario.
  const canRegisterEntry = !isFranchise && canUpdate && can("posInventory", "update");
  const entryHref = `/dashboard/pos/sucursales/${branch.id}/entrada`;

  const [status, setStatus] = useState("");
  /** Rango por fecha del pedido; vacío = sin filtrar. */
  const [range, setRange] = useState({ from: "", to: "" });
  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [shortages, setShortages] = useState<BranchShortage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { download: downloadForm, downloading: downloadingForm } = useFactoryFormDownload();

  const load = useCallback(async () => {
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
      setOrders(result.items);
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

  useEffect(() => {
    void load();
    void loadShortages();
  }, [load, loadShortages]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "restock_orders_changed" && event.branchId === branch.id) void load();
      if (event.type === "pos_sales_changed" && event.branchId === branch.id) void loadShortages();
    });
  }, [subscribe, branch.id, load, loadShortages]);

  if (!canRestock) {
    return (
      <div className="panel p-5" style={{ color: "var(--muted)" }}>
        Los pedidos a fábrica necesitan el permiso de Faltantes y surtido.
      </div>
    );
  }

  async function generate() {
    try {
      const result = await httpClient.post<RestockOrder | { created: false; message: string }>(
        `/pos/restock/branches/${branch.id}/generate`,
        {}
      );
      if ("created" in result && result.created === false) {
        toast.info(result.message);
        return;
      }
      toast.success("Pedido de surtido generado");
      await Promise.all([load(), loadShortages()]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el pedido"));
    }
  }

  async function act(order: RestockOrder, action: "approve" | "cancel") {
    try {
      if (action === "approve") {
        await httpClient.put(`/pos/restock/orders/${order.id}`, { status: RESTOCK_ORDER_STATUS.APPROVED });
        toast.success("Pedido aprobado: fábrica ya lo ve");
      } else {
        await httpClient.post(`/pos/restock/orders/${order.id}/cancel`, {});
        toast.success("Pedido cancelado");
      }
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo actualizar el pedido"));
    }
  }

  const totals = packTotals(shortages ?? []);

  return (
    <div className="page-stack">
      {canRegisterEntry ? (
        <section className="panel p-5">
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <div>
              <h2 style={{ margin: 0 }}>Entrada de surtido</h2>
              <p className="page-kicker" style={{ margin: 0 }}>
                Cuando llega producto de fábrica, captura lo que llegó en la hoja de fábrica. Viene
                precargada con el último pedido de la sucursal y se puede corregir o llenar.
              </p>
            </div>
            <Button variant="contained" color="success" startIcon={<PackagePlus size={16} />} component={Link} href={entryHref}>
              Registrar entrada de surtido
            </Button>
          </div>
        </section>
      ) : null}
      {!isFranchise ? (
        <section className="panel p-5">
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <div>
              <h2 style={{ margin: 0 }}>Faltante de hoy</h2>
              <p className="page-kicker" style={{ margin: 0 }}>
                Contra el stock mínimo de esta sucursal: se pide en empaques completos cuando el
                faltante alcanza el 30 % del mínimo.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="page-kicker" style={{ margin: 0 }}>
                <strong style={{ color: "var(--glam-navy)" }}>{totals.bidones}</strong> bidones ·{" "}
                <strong style={{ color: "var(--glam-navy)" }}>{totals.cajas}</strong> cajas ·{" "}
                <strong style={{ color: "var(--glam-navy)" }}>{totals.piezas}</strong> piezas
              </span>
              <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={() => void loadShortages()}>
                Recalcular
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
                  startIcon={<Truck size={14} />}
                  disabled={!shortages?.length}
                  onClick={() => void generate()}
                >
                  Confirmar pedido a fábrica
                </Button>
              ) : null}
            </div>
          </div>
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
                        {row.stock} {row.unit === "bidon" ? "L" : "pz"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {row.minStock} {row.unit === "bidon" ? "L" : "pz"}
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

      <h2 style={{ margin: "4px 0 0" }}>Pedidos a fábrica</h2>

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
          sx={{ minWidth: 230 }}
        >
          <MenuItem value="">Todos los estados</MenuItem>
          {Object.entries(RESTOCK_STATUS_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <FilterMeta>
          <strong>{orders.length}</strong> {orders.length === 1 ? "pedido" : "pedidos"}
        </FilterMeta>
      </FilterBar>

      {orders.map((order) => (
        <RestockOrderCard
          key={order.id}
          order={order}
          canUpdate={canUpdate}
          showBranch={false}
          entryHref={canRegisterEntry ? `${entryHref}?order=${order.id}` : null}
          onApprove={(o) => void act(o, "approve")}
          onCancel={(o) => void act(o, "cancel")}
        />
      ))}
      {loading ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !orders.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          {isFranchise
            ? "Esta franquicia todavía no ha levantado pedidos."
            : "No hay pedidos a fábrica con este filtro."}
        </div>
      ) : null}
    </div>
  );
}
