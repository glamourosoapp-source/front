"use client";

import Link from "next/link";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import {
  POS_PAYMENT_METHODS,
  POS_RETURN_REASON_LABELS,
  POS_SALE_STATUS,
  posPaymentMethodLabel,
} from "@glamouroso/shared/constants";
import { DetailField } from "@/components/ui/DetailField";
import { isHomeDeliverySale } from "@/lib/pos/delivery-ticket";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import type { PosSale } from "@/types";
import { formatDateTime } from "./pos-labels";

/**
 * Ticket completo de una venta de caja: partidas, pago, anulación y
 * devoluciones. Lo abren las ventas de la sucursal y el detalle del cliente.
 */
export function PosSaleDialog({ sale, onClose }: { sale: PosSale | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(sale)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Ticket {sale?.ticketNumber}</DialogTitle>
      <DialogContent dividers>
        {sale ? (
          <div className="page-stack">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Fecha y hora" value={formatDateTime(sale.soldAt)} />
              {sale.branch ? (
                <DetailField label="Sucursal" value={`${sale.branch.code} · ${sale.branch.name}`} />
              ) : null}
              <DetailField label="Cajero" value={sale.cashier?.name ?? "—"} />
              <DetailField label="Cliente" value={sale.customer?.name ?? "Mostrador"} />
              <DetailField label="Forma de pago" value={posPaymentMethodLabel(sale.paymentMethod)} />
              {isHomeDeliverySale(sale) ? (
                <>
                  <DetailField
                    label="Venta a domicilio"
                    value={
                      sale.deliveryOrder ? (
                        <Link href={`/dashboard/orders/${sale.deliveryOrder.id}`}>
                          Pedido {sale.deliveryOrder.orderNumber}
                        </Link>
                      ) : (
                        "Sin pedido"
                      )
                    }
                  />
                  <DetailField label="Domicilio" value={sale.deliveryOrder?.deliveryAddress ?? "—"} />
                </>
              ) : null}
              {sale.paymentMethod === POS_PAYMENT_METHODS.CASH ? (
                <DetailField
                  label="Pagó con / cambio"
                  value={`${formatMoney(sale.amountTendered)} / ${formatMoney(sale.changeAmount)}`}
                />
              ) : null}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Cant.</th>
                  <th style={{ textAlign: "right" }}>Precio</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {(sale.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.productName}
                      {item.priceTier === "wholesale" ? (
                        <span className="page-kicker" style={{ margin: "0 0 0 6px", color: "#c62828" }}>
                          mayoreo
                        </span>
                      ) : null}
                      {item.containerWarning ? (
                        <p className="page-kicker" style={{ margin: "2px 0 0", color: "#b45309" }}>
                          {item.containerWarning}
                        </p>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatQuantity(item.quantity)} {item.saleUnit === "liter" ? "L" : "pz"}
                    </td>
                    <td style={{ textAlign: "right" }}>{formatMoney(item.unitPrice)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ color: "var(--muted)" }}>
                    {formatQuantity(sale.itemsCount)}{" "}
                    {Number(sale.itemsCount) === 1 ? "producto" : "productos"}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>Total</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(sale.total)}</td>
                </tr>
              </tfoot>
            </table>
            {sale.status === POS_SALE_STATUS.VOIDED ? (
              <p className="page-kicker" style={{ color: "#c62828" }}>
                Anulado {formatDateTime(sale.voidedAt)}
                {sale.voidReason ? `: ${sale.voidReason}` : ""}
              </p>
            ) : null}
            {sale.returns?.length ? (
              <div className="page-stack" style={{ gap: 6 }}>
                <strong style={{ color: "#c62828" }}>Devoluciones de cliente</strong>
                {[...sale.returns]
                  .sort((a, b) => a.returnedAt.localeCompare(b.returnedAt))
                  .map((ret) => (
                  <div key={ret.id} className="page-kicker" style={{ margin: 0, color: "#7f1d1d" }}>
                    <b>{ret.returnNumber}</b> · {formatDateTime(ret.returnedAt)} · regresó{" "}
                    {formatMoney(ret.total)} en {posPaymentMethodLabel(ret.paymentMethod).toLowerCase()}
                    {(ret.items ?? []).map((item) => (
                      <div key={item.id} style={{ marginLeft: 12 }}>
                        {formatQuantity(item.quantity)} {item.productName} ·{" "}
                        {POS_RETURN_REASON_LABELS[item.reason] ?? item.reason} ·{" "}
                        {item.restock ? "volvió al anaquel" : "merma"}
                      </div>
                    ))}
                  </div>
                ))}
                <p className="page-kicker" style={{ margin: 0 }}>
                  El ticket no cambia: lo devuelto resta en Cortes el día en que se devolvió.
                </p>
              </div>
            ) : null}
            {sale.recordedOffline ? (
              <p className="page-kicker" style={{ color: "#b45309" }}>
                Cobrado sin internet en la caja de la sucursal
                {sale.syncedAt ? `, subió el ${formatDateTime(sale.syncedAt)}` : ""}.
              </p>
            ) : null}
            {sale.priceMismatch ? (
              <p className="page-kicker" style={{ color: "#c62828" }}>
                El precio cobrado no coincide con el del catálogo actual. Manda lo que se cobró: el cliente
                ya pagó ese importe.
              </p>
            ) : null}
            {sale.syncConflict ? (
              <p className="page-kicker" style={{ color: "#c62828" }}>
                El folio que traía la caja ({String(sale.syncConflict.proposed)}) ya estaba usado, así
                que este ticket quedó con otro.
              </p>
            ) : null}
            {sale.notes ? <DetailField label="Notas" value={sale.notes} /> : null}
          </div>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
