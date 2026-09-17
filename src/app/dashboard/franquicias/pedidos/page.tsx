"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import { Handshake, PackageCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { BRANCH_TYPES, RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { RestockOrderCard } from "@/components/pos-admin/RestockOrderCard";
import {
  FilterBar,
  FilterDateRange,
  FilterMeta,
  type DateRangeOption,
} from "@/components/pos-admin/FilterBar";
import { RESTOCK_STATUS_LABELS } from "@/components/pos-admin/pos-labels";
import { formatMoney } from "@/lib/format-money";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { Branch, ListResponse, RestockOrder } from "@/types";
import { toast } from "sonner";

/** Rango por fecha del pedido; "Todo" es el default. */
const RANGES: DateRangeOption[] = [
  { key: "todo", label: "Todo", days: null },
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
];

const OPEN = new Set<string>([
  RESTOCK_ORDER_STATUS.PENDING,
  RESTOCK_ORDER_STATUS.APPROVED,
  RESTOCK_ORDER_STATUS.PREPARING,
]);

/** Importe congelado del pedido: precio de mayoreo × lo pedido, partida por partida. */
function orderTotal(order: RestockOrder): number {
  return (order.items ?? []).reduce(
    (sum, item) => sum + Number(item.unitPrice ?? 0) * Number(item.requestedQty ?? 0),
    0
  );
}

/**
 * Pedidos a fábrica de las franquicias (módulo Franquicias del panel): lo que
 * cada franquicia levantó desde su portal, con precio de mayoreo congelado,
 * para aprobarlo y seguirlo. Los de sucursal viven en Punto de venta →
 * Faltantes y surtido; fábrica ve los dos orígenes juntos en su módulo.
 */
export default function FranchiseOrdersPage() {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canView = can("posRestock", "view");
  const canUpdate = can("posRestock", "update");

  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [franchises, setFranchises] = useState<Branch[]>([]);
  const [status, setStatus] = useState<string>("open");
  const [branchId, setBranchId] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canView) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200, type: BRANCH_TYPES.FRANCHISE })
      .then((res) => setFranchises(res.items))
      .catch(() => setFranchises([]));
  }, [canView]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      // El endpoint filtra por un estado a la vez: "abiertos" y "todos" se
      // resuelven aquí sobre los últimos 200.
      const result = await httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", {
        limit: 200,
        origin: RESTOCK_ORIGIN.FRANCHISE,
        ...(branchId ? { branchId } : {}),
        ...(status && status !== "open" && status !== "all" ? { status } : {}),
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
      });
      setOrders(result.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los pedidos"));
    } finally {
      setLoading(false);
    }
  }, [canView, branchId, status, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "restock_orders_changed") void load();
    });
  }, [subscribe, load]);

  const visible = useMemo(
    () => orders.filter((order) => status !== "open" || OPEN.has(order.status)),
    [orders, status]
  );

  const counts = useMemo(
    () => ({
      pending: orders.filter((o) => o.status === RESTOCK_ORDER_STATUS.PENDING).length,
      inProgress: orders.filter(
        (o) => o.status === RESTOCK_ORDER_STATUS.APPROVED || o.status === RESTOCK_ORDER_STATUS.PREPARING
      ).length,
      sent: orders.filter(
        (o) => o.status === RESTOCK_ORDER_STATUS.SENT || o.status === RESTOCK_ORDER_STATUS.RECEIVED
      ).length,
      // Lo facturable: los cancelados no cuentan.
      amount: orders
        .filter((o) => o.status !== RESTOCK_ORDER_STATUS.CANCELLED)
        .reduce((sum, o) => sum + orderTotal(o), 0),
    }),
    [orders]
  );

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Los pedidos de franquicias necesitan el permiso de Faltantes y surtido.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function act(order: RestockOrder, action: "approve" | "cancel") {
    try {
      if (action === "approve") {
        await httpClient.put(`/pos/restock/orders/${order.id}`, { status: RESTOCK_ORDER_STATUS.APPROVED });
        toast.success(`Pedido de ${order.branch?.code} aprobado: fábrica ya lo ve`);
      } else {
        await httpClient.post(`/pos/restock/orders/${order.id}/cancel`, {});
        toast.success("Pedido cancelado");
      }
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo actualizar el pedido"));
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Handshake size={22} style={{ color: "var(--glam-blue)" }} /> Pedidos de franquicias
          </h1>
          <p className="page-kicker">
            Lo que cada franquicia pidió a fábrica desde su portal, con el precio de mayoreo
            congelado al pedir. Aquí se aprueban y se sigue su estado.
          </p>
        </div>
        <Button
          variant="outlined"
          startIcon={<RefreshCw size={16} />}
          onClick={() => void load()}
          sx={{ whiteSpace: "nowrap" }}
        >
          Actualizar
        </Button>
      </div>

      <section className="grid grid-4">
        <div className="card metric">
          <div className="metric-head">
            <span>Por aprobar</span>
          </div>
          <strong style={{ color: counts.pending ? "#d97706" : undefined }}>{counts.pending}</strong>
          <small>Fábrica no los ve hasta aprobarlos</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>En fábrica</span>
          </div>
          <strong>{counts.inProgress}</strong>
          <small>Aprobados o en preparación</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Enviados</span>
          </div>
          <strong>{counts.sent}</strong>
          <small>En lo consultado</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Importe a mayoreo</span>
          </div>
          <strong>{formatMoney(counts.amount)}</strong>
          <small>Pedidos consultados, sin cancelados</small>
        </div>
      </section>

      <FilterBar>
        <TextField
          select
          size="small"
          label="Estado"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="open">Por enviar (abiertos)</MenuItem>
          <MenuItem value="all">Todos los estados</MenuItem>
          {Object.entries(RESTOCK_STATUS_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Franquicia"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
          sx={{ minWidth: 215 }}
        >
          <MenuItem value="">Todas las franquicias</MenuItem>
          {franchises.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </MenuItem>
          ))}
        </TextField>
        <FilterDateRange
          label="Fecha del pedido"
          options={RANGES}
          from={range.from}
          to={range.to}
          onChange={setRange}
          collapsible
        />
        <FilterMeta>
          <strong>{visible.length}</strong> {visible.length === 1 ? "pedido" : "pedidos"}
        </FilterMeta>
      </FilterBar>

      {visible.map((order) => (
        <RestockOrderCard
          key={order.id}
          order={order}
          canUpdate={canUpdate}
          linkBranch
          onApprove={(o) => void act(o, "approve")}
          onCancel={(o) => void act(o, "cancel")}
        />
      ))}
      {loading ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !visible.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PackageCheck size={30} style={{ color: "#15803d" }} />
          </div>
          <h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>No hay pedidos con este filtro</h2>
          <p className="page-kicker" style={{ margin: 0 }}>
            Cuando una franquicia levante un pedido desde su portal, aparecerá aquí.
          </p>
        </div>
      ) : null}
    </div>
  );
}
