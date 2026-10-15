"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip } from "@mui/material";
import { ArrowRight, ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/format-money";
import type { RestockOrder } from "@/types";
import { RestockOrderDetail } from "./RestockOrderCard";
import { RestockOrderActions } from "./RestockOrderActions";
import {
  RESTOCK_ORIGIN_LABELS,
  RESTOCK_STATUS_COLORS,
  RESTOCK_STATUS_LABELS,
  formatDate,
  formatDateTime,
  restockOrderSheetHref,
} from "./pos-labels";

interface RestockOrderRowsProps {
  orders: RestockOrder[];
  canUpdate: boolean;
  canDispatch: boolean;
  onChanged: () => void;
  emptyText: string;
  loading?: boolean;
}

/** Partidas que llegaron con menos de lo pedido. */
function shortCount(order: RestockOrder): number {
  return (order.items ?? []).filter(
    (item) => item.dispatchedQty != null && Number(item.dispatchedQty) < Number(item.requestedQty)
  ).length;
}

/** "Recibido 16 oct, 10:24 a.m." / "Cancelado: se pidió de más" / "Enviado a fábrica 14 oct". */
function outcome(order: RestockOrder): string {
  if (order.receivedAt) return `Recibido ${formatDateTime(order.receivedAt)}`;
  if (order.status === "cancelled") {
    return order.cancelReason ? `Cancelado: ${order.cancelReason}` : "Cancelado";
  }
  if (order.sentAt) return `Salió ${formatDateTime(order.sentAt)}`;
  return RESTOCK_ORIGIN_LABELS[order.origin] ?? order.origin;
}

/**
 * Historial de pedidos a fábrica como tarjetas desplegables, igual que los
 * cortes por sucursal: el encabezado resume el pedido (fecha, estado, cuántos
 * productos, si faltó algo, total) y al abrirlo se ve lo pedido contra lo que
 * llegó, con sus notas y devoluciones.
 */
export function RestockOrderRows({ orders, canUpdate, canDispatch, onChanged, emptyText, loading = false }: RestockOrderRowsProps) {
  const [open, setOpen] = useState<string | null>(null);

  if (!orders.length) {
    return (
      <p className="page-kicker" style={{ margin: 0, padding: "8px 2px" }}>
        {loading ? "Cargando..." : emptyText}
      </p>
    );
  }

  return (
    <div className="restock-rows">
      {orders.map((order) => {
        const isOpen = open === order.id;
        const short = shortCount(order);
        const returns = order.returns?.length ?? 0;
        return (
          <section key={order.id} className={`pos-day pos-cut${isOpen ? " is-open" : ""}`}>
            <button
              type="button"
              className="pos-day-head"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : order.id)}
            >
              <span className="pos-day-chevron">
                <ChevronDown size={18} />
              </span>
              <span className="pos-day-date">
                <span className="pos-day-weekday">
                  Pedido del {formatDate(order.createdAt)}
                  <Chip
                    size="small"
                    label={RESTOCK_STATUS_LABELS[order.status] ?? order.status}
                    color={RESTOCK_STATUS_COLORS[order.status] ?? "default"}
                    sx={{ fontStyle: "normal" }}
                  />
                </span>
                <span className="pos-day-fulldate">{outcome(order)}</span>
              </span>
              <span className="pos-branch-status">
                <span>
                  {(order.items?.length ?? 0) === 1 ? "1 producto" : `${order.items?.length ?? 0} productos`}
                  {short ? (
                    <strong style={{ color: "#92400e", marginLeft: 6 }}>
                      · {short === 1 ? "1 llegó incompleto" : `${short} llegaron incompletos`}
                    </strong>
                  ) : null}
                </span>
                {returns ? (
                  <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                    {returns === 1 ? "1 devolución a fábrica" : `${returns} devoluciones a fábrica`}
                  </span>
                ) : null}
              </span>
              <span className="pos-day-stats">
                <span className="pos-day-stat is-total">
                  <small>Total</small>
                  <b>{order.total != null ? formatMoney(order.total) : "—"}</b>
                </span>
              </span>
            </button>
            {isOpen ? (
              <>
                <div className="pos-day-body" style={{ padding: 16 }}>
                  <RestockOrderDetail order={order} />
                </div>
                <div className="pos-cut-footer" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Link href={restockOrderSheetHref(order.id)}>
                    Ver pedido <ArrowRight size={14} />
                  </Link>
                  <RestockOrderActions order={order} canUpdate={canUpdate} canDispatch={canDispatch} onChanged={onChanged} />
                </div>
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
