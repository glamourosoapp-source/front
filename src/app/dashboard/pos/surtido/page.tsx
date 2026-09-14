"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Chip, MenuItem, Tab, Tabs, TextField } from "@mui/material";
import { Check, FileDown, Printer, RefreshCw, ShieldAlert, Truck, X } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { Branch, BranchShortage, ListResponse, RestockOrder } from "@/types";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  preparing: "En preparación",
  sent: "Enviado",
  received: "Recibido",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, "default" | "primary" | "warning" | "success" | "error"> = {
  pending: "warning",
  approved: "primary",
  preparing: "primary",
  sent: "success",
  received: "success",
  cancelled: "error",
};

export default function PosSurtidoPage() {
  const { can } = usePermissions();
  const canView = can("posRestock", "view");
  const canCreate = can("posRestock", "create");
  const canUpdate = can("posRestock", "update");

  const [tab, setTab] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [shortages, setShortages] = useState<BranchShortage[]>([]);
  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canView) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" })
      .then((res) => {
        setBranches(res.items);
        const firstBranch = res.items.find((b) => b.type === "branch");
        if (firstBranch && !branchId) setBranchId(firstBranch.id);
      })
      .catch(() => setBranches([]));
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const loadShortages = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      setShortages(
        await httpClient.get<BranchShortage[]>(`/pos/restock/branches/${branchId}/shortages`)
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al calcular los faltantes"));
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const loadOrders = useCallback(
    async (origin?: string) => {
      // "branch" agrupa los dos orígenes de sucursal; el endpoint filtra por
      // un solo `origin`, así que se descartan las franquicias al recibir.
      const wantBranch = origin === "branch";
      if (wantBranch) origin = undefined;
      setLoading(true);
      try {
        const result = await httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", {
          limit: 100,
          ...(origin ? { origin } : {}),
        });
        setOrders(
          wantBranch
            ? result.items.filter((order) => order.origin !== RESTOCK_ORIGIN.FRANCHISE)
            : result.items
        );
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Error al cargar los pedidos"));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!canView) return;
    if (tab === 0) void loadShortages();
    // Sin filtro, la segunda pestaña traía también los de franquicia y el
    // mismo pedido salía en las dos. Surtido = lo que sale del corte de
    // faltantes de una sucursal, automático o manual.
    else if (tab === 1) void loadOrders("branch");
    else void loadOrders(RESTOCK_ORIGIN.FRANCHISE);
  }, [canView, tab, loadShortages, loadOrders]);

  const totals = useMemo(
    () => ({
      bidones: shortages.filter((row) => row.unit === "bidon").reduce((sum, row) => sum + row.requestedQty, 0),
      piezas: shortages.filter((row) => row.unit === "pieza").reduce((sum, row) => sum + row.requestedQty, 0),
    }),
    [shortages]
  );

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Faltantes y surtido necesitan el permiso correspondiente del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function generateOrder() {
    try {
      const result = await httpClient.post<RestockOrder | { created: false; message: string }>(
        `/pos/restock/branches/${branchId}/generate`,
        {}
      );
      if ("created" in result && result.created === false) {
        toast.info(result.message);
        return;
      }
      toast.success("Pedido de surtido generado");
      setTab(1);
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
      await loadOrders(tab === 2 ? RESTOCK_ORIGIN.FRANCHISE : "branch");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo actualizar el pedido"));
    }
  }

  /** Tabla Producto / Faltante de dos columnas, la que fábrica imprime. */
  function exportShortagesCsv() {
    const branch = branches.find((b) => b.id === branchId);
    const rows = [
      ["Producto", "Faltante", "Unidad"],
      ...shortages.map((row) => [row.name, String(row.requestedQty), row.unit === "bidon" ? "bidones" : "piezas"]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `faltantes-${branch?.code ?? "sucursal"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Faltantes y surtido</h1>
          <p className="page-kicker">
            El faltante sale del stock mínimo de cada sucursal. Los líquidos se piden en bidones
            completos, redondeando por mitad.
          </p>
        </div>
      </div>

      <Tabs value={tab} onChange={(_e, value) => setTab(value)}>
        <Tab label="Faltantes" />
        <Tab label="Pedidos de surtido" />
        <Tab label="Pedidos de franquicias" />
      </Tabs>

      {tab === 0 ? (
        <>
          <div className="toolbar">
            <TextField
              select
              label="Sucursal"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              sx={{ minWidth: 250 }}
            >
              {branches
                .filter((branch) => branch.type === "branch")
                .map((branch) => (
                  <MenuItem key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </MenuItem>
                ))}
            </TextField>
            <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => void loadShortages()}>
              Calcular ahora
            </Button>
            <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={exportShortagesCsv} disabled={!shortages.length}>
              CSV
            </Button>
            <Button variant="outlined" startIcon={<Printer size={16} />} onClick={() => window.print()} disabled={!shortages.length}>
              Imprimir
            </Button>
            {canCreate ? (
              <Button variant="contained" startIcon={<Truck size={16} />} onClick={() => void generateOrder()} disabled={!shortages.length}>
                Confirmar pedido a fábrica
              </Button>
            ) : null}
            <span className="page-kicker">
              {totals.bidones} bidones · {totals.piezas} piezas
            </span>
          </div>

          <div className="table-container-premium print-only-block">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Faltante</th>
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
                      {row.requestedQty} {row.unit === "bidon" ? "bidones" : "piezas"}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: row.stock < 0 ? "#ef4444" : undefined,
                        fontWeight: row.stock < 0 ? 700 : 400,
                      }}
                    >
                      {formatQuantity(row.stock)} {row.unit === "bidon" ? "L" : "pz"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatQuantity(row.minStock)} {row.unit === "bidon" ? "L" : "pz"}
                    </td>
                  </tr>
                ))}
                {!shortages.length && !loading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                      Esta sucursal está por encima de su stock mínimo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab > 0 ? (
        <div className="page-stack">
          {orders.map((order) => (
            <div key={order.id} className="panel p-5">
              <div className="toolbar" style={{ marginBottom: 8 }}>
                <div>
                  <strong>
                    {order.branch?.code} · {order.branch?.name}
                  </strong>
                  <Chip
                    label={STATUS_LABELS[order.status] ?? order.status}
                    size="small"
                    color={STATUS_COLORS[order.status] ?? "default"}
                    sx={{ ml: 1 }}
                  />
                  <Chip
                    label={
                      order.origin === RESTOCK_ORIGIN.FRANCHISE
                        ? "franquicia"
                        : order.origin === RESTOCK_ORIGIN.SHORTAGE_AUTO
                          ? "corte automático"
                          : "manual"
                    }
                    size="small"
                    variant="outlined"
                    sx={{ ml: 1 }}
                  />
                  <div className="page-kicker">
                    {order.createdAt
                      ? new Date(order.createdAt).toLocaleString("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""}
                    {order.sentAt
                      ? ` · enviado ${new Date(order.sentAt).toLocaleDateString("es-MX")}`
                      : ""}
                  </div>
                </div>
                {canUpdate && order.status === RESTOCK_ORDER_STATUS.PENDING ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="small" variant="contained" startIcon={<Check size={14} />} onClick={() => void act(order, "approve")}>
                      Aprobar
                    </Button>
                    <Button size="small" color="error" startIcon={<X size={14} />} onClick={() => void act(order, "cancel")}>
                      Cancelar
                    </Button>
                  </div>
                ) : null}
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th style={{ textAlign: "right" }}>Pedido</th>
                    <th style={{ textAlign: "right" }}>Despachado</th>
                    {order.origin === RESTOCK_ORIGIN.FRANCHISE ? (
                      <th style={{ textAlign: "right" }}>Precio mayoreo</th>
                    ) : null}
                    <th>Preparado</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.productName}
                        {/* El motivo que escribió fábrica al mandar menos. */}
                        {item.notes ? (
                          <div className="page-kicker" style={{ margin: 0, color: "#92400e" }}>
                            {item.notes}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {formatQuantity(item.requestedQty)}{" "}
                        {item.unit === "bidon"
                          ? Number(item.requestedQty) === 1
                            ? "bidón"
                            : "bidones"
                          : "pz"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {/*
                          Sin captura de fábrica se despacha lo pedido: en un
                          pedido ya enviado, "—" leía como "no se mandó nada".
                        */}
                        {item.dispatchedQty != null
                          ? formatQuantity(item.dispatchedQty)
                          : order.status === RESTOCK_ORDER_STATUS.SENT ||
                              order.status === RESTOCK_ORDER_STATUS.RECEIVED
                            ? formatQuantity(item.requestedQty)
                            : "—"}
                      </td>
                      {order.origin === RESTOCK_ORIGIN.FRANCHISE ? (
                        <td style={{ textAlign: "right" }}>
                          {item.unitPrice ? formatMoney(item.unitPrice) : "—"}
                        </td>
                      ) : null}
                      <td>{item.prepared ? "Sí" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {order.dispatchNotes ? (
                <p className="page-kicker" style={{ marginBottom: 0, color: "#92400e" }}>
                  <strong>Nota de fábrica:</strong> {order.dispatchNotes}
                </p>
              ) : null}
            </div>
          ))}
          {!orders.length && !loading ? (
            <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
              No hay pedidos con este filtro.
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <p className="page-kicker">Cargando...</p> : null}
    </div>
  );
}
