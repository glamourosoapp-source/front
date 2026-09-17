"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, MenuItem, TextField } from "@mui/material";
import { ExternalLink, Factory, PackageCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { RestockOrderCard } from "@/components/pos-admin/RestockOrderCard";
import {
  FilterBar,
  FilterDateRange,
  FilterMeta,
  type DateRangeOption,
} from "@/components/pos-admin/FilterBar";
import { RESTOCK_STATUS_LABELS } from "@/components/pos-admin/pos-labels";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { Branch, ListResponse, RestockOrder } from "@/types";
import { toast } from "sonner";

type OriginFilter = "" | "branch" | "franchise";

/** Rango por fecha del pedido; "Todo" es el default de fábrica. */
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

/**
 * Fábrica en el panel: todos los pedidos de surtido de sucursales y
 * franquicias en una sola lista, con filtros y aprobación. Lo que fábrica
 * prepara y despacha sigue en la app de la tablet (`/fabrica`).
 */
export default function FactoryPanelPage() {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canView = can("posRestock", "view");
  const canUpdate = can("posRestock", "update");
  const canOpenApp = can("factory", "view");

  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [origin, setOrigin] = useState<OriginFilter>("");
  const [status, setStatus] = useState<string>("open");
  const [branchId, setBranchId] = useState("");
  /** Rango por fecha del pedido; vacío = sin filtrar. */
  const [range, setRange] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(false);

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
    try {
      // El endpoint filtra por un estado a la vez: "abiertos" y "todos" se
      // resuelven aquí sobre los últimos 200.
      const result = await httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", {
        limit: 200,
        ...(branchId ? { branchId } : {}),
        ...(origin === "franchise" ? { origin: RESTOCK_ORIGIN.FRANCHISE } : {}),
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
  }, [canView, branchId, origin, status, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "restock_orders_changed") void load();
    });
  }, [subscribe, load]);

  const visible = useMemo(
    () =>
      orders.filter((order) => {
        if (origin === "branch" && order.origin === RESTOCK_ORIGIN.FRANCHISE) return false;
        if (status === "open" && !OPEN.has(order.status)) return false;
        return true;
      }),
    [orders, origin, status]
  );

  const counts = useMemo(() => {
    const base = orders.filter((order) =>
      origin === "branch"
        ? order.origin !== RESTOCK_ORIGIN.FRANCHISE
        : origin === "franchise"
          ? order.origin === RESTOCK_ORIGIN.FRANCHISE
          : true
    );
    return {
      pending: base.filter((o) => o.status === RESTOCK_ORDER_STATUS.PENDING).length,
      approved: base.filter((o) => o.status === RESTOCK_ORDER_STATUS.APPROVED).length,
      preparing: base.filter((o) => o.status === RESTOCK_ORDER_STATUS.PREPARING).length,
      sent: base.filter(
        (o) => o.status === RESTOCK_ORDER_STATUS.SENT || o.status === RESTOCK_ORDER_STATUS.RECEIVED
      ).length,
      franchise: base.filter((o) => o.origin === RESTOCK_ORIGIN.FRANCHISE && OPEN.has(o.status)).length,
    };
  }, [orders, origin]);

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Fábrica necesita el permiso de Faltantes y surtido.
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
            <Factory size={22} style={{ color: "var(--glam-blue)" }} /> Fábrica
          </h1>
          <p className="page-kicker">
            Todos los pedidos de surtido de sucursales y franquicias. Aquí se aprueban y se sigue su
            estado; fábrica los prepara y despacha desde su tablet.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            onClick={() => void load()}
            sx={{ whiteSpace: "nowrap" }}
          >
            Actualizar
          </Button>
          {canOpenApp ? (
            <Button
              component={Link}
              href="/fabrica"
              target="_blank"
              variant="text"
              endIcon={<ExternalLink size={14} />}
              sx={{ whiteSpace: "nowrap" }}
            >
              Abrir app de fábrica
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid grid-4">
        <div className="card metric">
          <div className="metric-head">
            <span>Por aprobar</span>
          </div>
          <strong style={{ color: counts.pending ? "#d97706" : undefined }}>{counts.pending}</strong>
          <small>Nadie los ve en fábrica hasta aprobarlos</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Aprobados</span>
          </div>
          <strong>{counts.approved}</strong>
          <small>Esperando que fábrica los tome</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>En preparación</span>
          </div>
          <strong>{counts.preparing}</strong>
          <small>Alguien ya los está surtiendo</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>De franquicias abiertos</span>
          </div>
          <strong>{counts.franchise}</strong>
          <small>{counts.sent} enviados en lo consultado</small>
        </div>
      </section>

      <FilterBar>
        <TextField
          select
          size="small"
          label="Origen"
          value={origin}
          onChange={(event) => setOrigin(event.target.value as OriginFilter)}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">Sucursales y franquicias</MenuItem>
          <MenuItem value="branch">Solo sucursales</MenuItem>
          <MenuItem value="franchise">Solo franquicias</MenuItem>
        </TextField>
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
          label="Sucursal"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
          sx={{ minWidth: 215 }}
        >
          <MenuItem value="">Todas las sucursales</MenuItem>
          {branches
            .filter((branch) =>
              origin === "franchise"
                ? branch.type === "franchise"
                : origin === "branch"
                  ? branch.type !== "franchise"
                  : true
            )
            .map((branch) => (
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
          {/* El icono va en su propio flex: como hijo suelto se pegaba a la izquierda. */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PackageCheck size={30} style={{ color: "#15803d" }} />
          </div>
          <h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>No hay pedidos con este filtro</h2>
          <p className="page-kicker" style={{ margin: 0 }}>
            Cuando una sucursal haga su corte de faltantes o una franquicia pida, aparecerá aquí.
          </p>
        </div>
      ) : null}
    </div>
  );
}
