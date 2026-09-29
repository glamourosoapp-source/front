"use client";

import { Button, Chip } from "@mui/material";
import { Check, Eye, FileDown, Truck, X } from "lucide-react";
import Link from "next/link";
import {
  FACTORY_RETURN_REASON_LABELS,
  RESTOCK_ORDER_STATUS,
  RESTOCK_ORIGIN,
} from "@glamouroso/shared/constants";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import type { FactoryReturn, FactoryReturnItem, RestockOrder } from "@/types";
import {
  BRANCH_TYPE_COPY,
  RESTOCK_ORIGIN_LABELS,
  RESTOCK_STATUS_COLORS,
  RESTOCK_STATUS_LABELS,
  formatDateTime,
  packQtyLabel,
  restockOrderSheetHref,
  restockItemAmount,
} from "./pos-labels";
import { useFactoryFormDownload } from "./useFactoryFormDownload";

const RETURN_RED = "#b91c1c";

/** Partida devuelta con el folio de su devolución, para decir de dónde salió. */
type ReturnedLine = FactoryReturnItem & { folio: string };

function returnedLabel(line: ReturnedLine): string {
  const unit = line.saleUnit === "liter" ? "L" : "pz";
  const reason = FACTORY_RETURN_REASON_LABELS[line.reason] ?? line.reason;
  return `Devuelto: ${formatQuantity(line.quantity)} ${unit} de ${line.productName} (${reason}) · ${line.folio}`;
}

/**
 * Las partidas de un pedido de surtido: lo pedido contra lo despachado, las
 * notas de las dos puntas (quien pidió y fábrica) y lo devuelto en rojo. Lo
 * usan la tarjeta (Fábrica, Franquicias) y la pestaña "Partidas" de la hoja
 * del pedido.
 */
export function RestockOrderDetail({ order }: { order: RestockOrder }) {
  const isFranchise = order.origin === RESTOCK_ORIGIN.FRANCHISE;
  const isSentOrReceived =
    order.status === RESTOCK_ORDER_STATUS.SENT || order.status === RESTOCK_ORDER_STATUS.RECEIVED;
  const items = order.items ?? [];
  // Lo que el transportista se llevó de regreso: cada partida devuelta cae en la
  // del pedido con su mismo producto o línea; lo que el pedido no traía va aparte.
  const returns: FactoryReturn[] = order.returns ?? [];
  const returnedLines: ReturnedLine[] = returns.flatMap((ret) =>
    (ret.items ?? []).map((item) => ({ ...item, folio: ret.folio }))
  );
  const returnedByItem = new Map<string, ReturnedLine[]>();
  for (const line of returnedLines) {
    if (!line.restockOrderItemId) continue;
    returnedByItem.set(line.restockOrderItemId, [...(returnedByItem.get(line.restockOrderItemId) ?? []), line]);
  }
  const returnedElsewhere = returnedLines.filter((line) => !line.restockOrderItemId);
  const returnsTotal = returns.reduce((sum, ret) => sum + Number(ret.total ?? 0), 0);
  const totalFrozen = isFranchise
    ? items.reduce((sum, item) => sum + restockItemAmount(item, item.requestedQty), 0)
    : null;

  return (
    <>
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
              const returned = returnedByItem.get(item.id) ?? [];
              return (
                <tr key={item.id} style={returned.length ? { background: "#fef2f2" } : undefined}>
                  <td>
                    <span style={returned.length ? { color: RETURN_RED, fontWeight: 700 } : undefined}>
                      {item.productName}
                    </span>
                    {item.notes ? (
                      <div className="page-kicker" style={{ margin: 0, color: "#92400e" }}>
                        {item.notes}
                      </div>
                    ) : null}
                    {returned.map((line) => (
                      <div key={line.id} style={{ margin: 0, color: RETURN_RED, fontSize: 12, fontWeight: 600 }}>
                        {returnedLabel(line)}
                      </div>
                    ))}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {packQtyLabel(requested, item.unit, item.unitsPerPackage)}
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
            {returnedElsewhere.map((line) => (
              <tr key={line.id} style={{ background: "#fef2f2" }}>
                <td colSpan={isFranchise ? 5 : 4} style={{ color: RETURN_RED, fontWeight: 600 }}>
                  {returnedLabel(line)}
                  <span style={{ fontWeight: 400 }}> — no venía en este pedido</span>
                </td>
              </tr>
            ))}
          </tbody>
          {!isFranchise && order.total != null ? (
            <tfoot>
              <tr>
                <td colSpan={2} style={{ textAlign: "right", fontWeight: 700 }}>
                  Total del pedido
                  <div className="page-kicker" style={{ margin: 0, fontWeight: 400 }}>
                    precio de tienda del formato, con bidones y cajas azules
                  </div>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(order.total)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
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
      {returns.length ? (
        <div className="page-kicker" style={{ marginBottom: 0, color: RETURN_RED }}>
          <strong>Devuelto a fábrica:</strong>{" "}
          {returns
            .map((ret) => `${ret.folio} (${formatDateTime(ret.createdAt)}${ret.user?.name ? `, ${ret.user.name}` : ""})`)
            .join(" · ")}
          {" · "}valor a precio de tienda <strong>{formatMoney(returnsTotal)}</strong> (informativo, no cambia el total)
          {returns.some((ret) => ret.notes) ? (
            <div>
              {returns
                .filter((ret) => ret.notes)
                .map((ret) => `${ret.folio}: ${ret.notes}`)
                .join(" · ")}
            </div>
          ) : null}
        </div>
      ) : null}
      {order.dispatchNotes ? (
        <p className="page-kicker" style={{ marginBottom: 0, color: "#92400e" }}>
          <strong>Nota de fábrica:</strong> {order.dispatchNotes}
        </p>
      ) : null}
    </>
  );
}

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
 * Un pedido de surtido completo en tarjeta, como lo ven Fábrica y Franquicias
 * (módulos detrás de bandera): quién lo pidió, en qué va y sus partidas. Las
 * sucursales usan la tabla de pedidos (`RestockOrdersTable`) y la hoja.
 */
export function RestockOrderCard({
  order,
  canUpdate,
  onApprove,
  onCancel,
  showBranch = true,
  linkBranch = false,
}: RestockOrderCardProps) {
  const { download: downloadForm, downloading: downloadingForm } = useFactoryFormDownload();
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDown size={14} />}
            disabled={downloadingForm}
            onClick={() => void downloadForm(`/pos/restock/orders/${order.id}/form`)}
            title="El formato de pedido a fábrica en PDF, con las partidas de este pedido"
          >
            {downloadingForm ? "Generando..." : "Descargar formato"}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Eye size={14} />}
            component={Link}
            href={restockOrderSheetHref(order.id)}
            title="La hoja del pedido: formato y partidas"
          >
            Ver pedido
          </Button>
          {canUpdate && order.status === RESTOCK_ORDER_STATUS.PENDING ? (
            <>
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
            </>
          ) : null}
        </div>
      </div>

      <RestockOrderDetail order={order} />
    </div>
  );
}
