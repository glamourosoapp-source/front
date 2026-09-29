"use client";

import { Chip } from "@mui/material";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format-money";
import type { RestockOrder } from "@/types";
import {
  RESTOCK_ORIGIN_LABELS,
  RESTOCK_STATUS_COLORS,
  RESTOCK_STATUS_LABELS,
  formatDateTime,
  relativeDays,
  restockOrderSheetHref,
} from "./pos-labels";
import { RestockOrderActions, isOpenRestockOrder } from "./RestockOrderActions";

interface RestockOrdersTableProps {
  orders: RestockOrder[];
  canUpdate: boolean;
  canDispatch: boolean;
  onChanged: () => void;
  /** En la bandeja de todas las sucursales se pinta la columna Sucursal. */
  showBranch?: boolean;
  /** Pedidos por recibir: la antigüedad importa más que la fecha exacta. */
  showAge?: boolean;
  emptyText: string;
  loading?: boolean;
}

/** "Llegó 28 sep" / "Enviado 12 sep" / "—". */
function arrivalLabel(order: RestockOrder): string {
  if (order.receivedAt) return `Recibido ${formatDateTime(order.receivedAt)}`;
  if (order.sentAt) return `Enviado ${formatDateTime(order.sentAt)}`;
  return "—";
}

/**
 * Pedidos a fábrica en una fila cada uno: fecha, estado, partidas, total y la
 * acción que le toca. Clic en la fila abre la hoja del pedido (partidas,
 * devoluciones y formato); la tarjeta completa de antes dejaba el historial
 * como un scroll infinito donde un cancelado pesaba lo mismo que un pendiente.
 */
export function RestockOrdersTable({
  orders,
  canUpdate,
  canDispatch,
  onChanged,
  showBranch = false,
  showAge = false,
  emptyText,
  loading = false,
}: RestockOrdersTableProps) {
  const router = useRouter();

  return (
    <div className="table-container-premium">
      <table className="table restock-orders-table">
        <thead>
          <tr>
            {showBranch ? <th>Sucursal</th> : null}
            <th>Pedido</th>
            <th>Estado</th>
            <th style={{ textAlign: "right" }}>Partidas</th>
            <th style={{ textAlign: "right" }}>Total</th>
            <th>Llegada</th>
            <th style={{ textAlign: "right" }} aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const items = order.items ?? [];
            const shortItems = items.filter(
              (item) => item.dispatchedQty != null && Number(item.dispatchedQty) < Number(item.requestedQty)
            ).length;
            const returns = order.returns ?? [];
            const href = restockOrderSheetHref(order.id);
            return (
              <tr
                key={order.id}
                className="clickable-row"
                onClick={() => router.push(href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.target === event.currentTarget) router.push(href);
                }}
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                {showBranch ? (
                  <td>
                    <strong>{order.branch?.code}</strong>
                    <div className="page-kicker" style={{ margin: 0 }}>
                      {order.branch?.name}
                    </div>
                  </td>
                ) : null}
                <td style={{ whiteSpace: "nowrap" }}>
                  <strong>{formatDateTime(order.createdAt)}</strong>
                  <div className="page-kicker" style={{ margin: 0 }}>
                    {RESTOCK_ORIGIN_LABELS[order.origin] ?? order.origin}
                    {showAge && isOpenRestockOrder(order) ? ` · ${relativeDays(order.createdAt)}` : ""}
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <Chip
                      size="small"
                      label={RESTOCK_STATUS_LABELS[order.status] ?? order.status}
                      color={RESTOCK_STATUS_COLORS[order.status] ?? "default"}
                    />
                    {returns.length ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={returns.length === 1 ? "Devolución" : `${returns.length} devoluciones`}
                        sx={{ color: "#b91c1c", borderColor: "#fecaca" }}
                      />
                    ) : null}
                  </div>
                </td>
                <td style={{ textAlign: "right" }}>
                  {items.length}
                  {shortItems ? (
                    <div className="page-kicker" style={{ margin: 0, color: "#92400e", whiteSpace: "nowrap" }}>
                      {shortItems} incompleta{shortItems === 1 ? "" : "s"}
                    </div>
                  ) : null}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>
                  {order.total != null ? formatMoney(order.total) : "—"}
                </td>
                <td className="page-kicker" style={{ margin: 0, whiteSpace: "nowrap" }}>
                  {arrivalLabel(order)}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <RestockOrderActions
                    order={order}
                    canUpdate={canUpdate}
                    canDispatch={canDispatch}
                    onChanged={onChanged}
                  />
                </td>
              </tr>
            );
          })}
          {!orders.length ? (
            <tr>
              <td colSpan={showBranch ? 7 : 6} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
                {loading ? "Cargando..." : emptyText}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
