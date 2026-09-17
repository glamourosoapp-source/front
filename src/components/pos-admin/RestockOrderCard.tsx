"use client";

import { Button, Chip } from "@mui/material";
import { Check, Truck, X } from "lucide-react";
import Link from "next/link";
import { RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import type { RestockOrder } from "@/types";
import {
  BRANCH_TYPE_COPY,
  RESTOCK_ORIGIN_LABELS,
  RESTOCK_STATUS_COLORS,
  RESTOCK_STATUS_LABELS,
  formatDateTime,
  unitLabel,
} from "./pos-labels";

interface RestockOrderCardProps {
  order: RestockOrder;
  /** Aprobar y cancelar piden `posRestock:update`; sin él no se pintan. */
  canUpdate: boolean;
  onApprove?: (order: RestockOrder) => void;
  onCancel?: (order: RestockOrder) => void;
  /** En el detalle de la sucursal el encabezado no repite la sucursal. */
  showBranch?: boolean;
  /** Abre el detalle de la sucursal desde el módulo de fábrica. */
  linkBranch?: boolean;
}

/**
 * Un pedido de surtido tal como lo ve el administrador: quién lo pidió, en qué
 * va, sus partidas con lo pedido y lo despachado, y las notas de las dos
 * puntas (quien pidió y fábrica).
 */
export function RestockOrderCard({
  order,
  canUpdate,
  onApprove,
  onCancel,
  showBranch = true,
  linkBranch = false,
}: RestockOrderCardProps) {
  const isFranchise = order.origin === RESTOCK_ORIGIN.FRANCHISE;
  const isSentOrReceived =
    order.status === RESTOCK_ORDER_STATUS.SENT || order.status === RESTOCK_ORDER_STATUS.RECEIVED;
  const items = order.items ?? [];
  const totalFrozen = isFranchise
    ? items.reduce(
        (sum, item) => sum + Number(item.unitPrice ?? 0) * Number(item.requestedQty ?? 0),
        0
      )
    : null;
  const branchHref = order.branch
    ? `${
        order.branch.type === "franchise"
          ? BRANCH_TYPE_COPY.franchise.listHref
          : BRANCH_TYPE_COPY.branch.listHref
      }/${order.branch.id}`
    : null;

  return (
    <div className="panel p-5">
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Truck size={18} style={{ color: "var(--glam-blue)" }} />
          {showBranch ? (
            linkBranch && branchHref ? (
              <Link href={branchHref} style={{ fontWeight: 700, color: "var(--glam-navy)" }}>
                {order.branch?.code} · {order.branch?.name}
              </Link>
            ) : (
              <strong>
                {order.branch?.code} · {order.branch?.name}
              </strong>
            )
          ) : (
            <strong>Pedido del {formatDateTime(order.createdAt)}</strong>
          )}
          <Chip
            label={RESTOCK_STATUS_LABELS[order.status] ?? order.status}
            size="small"
            color={RESTOCK_STATUS_COLORS[order.status] ?? "default"}
          />
          <Chip
            label={RESTOCK_ORIGIN_LABELS[order.origin] ?? order.origin}
            size="small"
            variant="outlined"
          />
          {showBranch ? (
            <span className="page-kicker" style={{ margin: 0 }}>
              {formatDateTime(order.createdAt)}
            </span>
          ) : null}
          {order.sentAt ? (
            <span className="page-kicker" style={{ margin: 0 }}>
              · enviado {formatDateTime(order.sentAt)}
            </span>
          ) : null}
          {order.receivedAt ? (
            <span className="page-kicker" style={{ margin: 0 }}>
              · recibido {formatDateTime(order.receivedAt)}
            </span>
          ) : null}
        </div>
        {canUpdate && order.status === RESTOCK_ORDER_STATUS.PENDING ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<Check size={14} />}
              onClick={() => onApprove?.(order)}
            >
              Aprobar
            </Button>
            <Button size="small" color="error" startIcon={<X size={14} />} onClick={() => onCancel?.(order)}>
              Cancelar
            </Button>
          </div>
        ) : null}
      </div>

      {order.notes ? (
        <p className="page-kicker" style={{ marginTop: 0 }}>
          <strong>Nota de quien pidió:</strong> {order.notes}
        </p>
      ) : null}

      <div className="table-container-premium">
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style={{ textAlign: "right" }}>Pedido</th>
              <th style={{ textAlign: "right" }}>Despachado</th>
              {isFranchise ? <th style={{ textAlign: "right" }}>Precio mayoreo</th> : null}
              <th>Preparado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const requested = Number(item.requestedQty);
              const dispatched =
                item.dispatchedQty != null
                  ? Number(item.dispatchedQty)
                  : isSentOrReceived
                    ? requested
                    : null;
              const short = dispatched != null && dispatched < requested;
              return (
                <tr key={item.id}>
                  <td>
                    {item.productName}
                    {item.notes ? (
                      <div className="page-kicker" style={{ margin: 0, color: "#92400e" }}>
                        {item.notes}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatQuantity(requested)} {unitLabel(requested, item.unit)}
                  </td>
                  <td style={{ textAlign: "right", color: short ? "#92400e" : undefined, fontWeight: short ? 700 : 400 }}>
                    {dispatched == null ? "—" : formatQuantity(dispatched)}
                  </td>
                  {isFranchise ? (
                    <td style={{ textAlign: "right" }}>
                      {item.unitPrice ? formatMoney(item.unitPrice) : "—"}
                    </td>
                  ) : null}
                  <td>{item.prepared ? "Sí" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          {totalFrozen != null ? (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: "right", fontWeight: 700 }}>
                  Total al precio congelado
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(totalFrozen)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {order.dispatchNotes ? (
        <p className="page-kicker" style={{ marginBottom: 0, color: "#92400e" }}>
          <strong>Nota de fábrica:</strong> {order.dispatchNotes}
        </p>
      ) : null}
    </div>
  );
}
