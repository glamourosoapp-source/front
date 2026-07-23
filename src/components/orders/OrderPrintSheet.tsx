"use client";

import { paymentMethodLabel, paymentStatusLabel } from "@/constants/orders";
import { formatDateOnly } from "@/lib/format-date-only";
import type { Order } from "@/types";

const statusLabels: Record<string, string> = {
  new: "Nuevo",
  processing: "En proceso",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

function money(value: string | number | undefined) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatCreatedAt(value: string | Date | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PrintableOrder extends Order {
  paymentMethod?: string | null;
  customerNotes?: string | null;
  items?: Array<{
    id: string;
    productName: string;
    unit?: string;
    quantity: string | number;
    unitPrice: string | number;
    total: string | number;
    notes?: string | null;
  }>;
}

/** Hoja imprimible del pedido: solo visible al imprimir (clase print-only). */
export function OrderPrintSheet({ order }: { order: PrintableOrder }) {
  const items = order.items || [];
  return (
    <div className="print-only" style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: 12 }}>
      <div style={{ borderBottom: "2px solid #111", paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Glamouroso</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>Pedido {order.orderNumber}</div>
        <div>Creado: {formatCreatedAt(order.createdAt)}</div>
      </div>

      <div
        style={{
          border: "2px solid #111",
          padding: 10,
          marginBottom: 12,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        Entrega:{" "}
        {order.scheduledDeliveryDate
          ? formatDateOnly(order.scheduledDeliveryDate, {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : "Sin fecha asignada"}
        {order.deliveryTimeWindow ? ` · ${order.deliveryTimeWindow}` : ""}
      </div>

      <table style={{ width: "100%", marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: "top", paddingRight: 16 }}>
              <strong>Cliente:</strong> {order.customer?.name || "—"}
              <br />
              <strong>WhatsApp:</strong> {order.customer?.phone || "—"}
            </td>
            <td style={{ verticalAlign: "top" }}>
              <strong>Dirección:</strong> {order.deliveryAddress || order.customer?.address || "—"}
              <br />
              <strong>Zona:</strong> {order.deliveryZone || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            {["Producto", "Unidad", "Cantidad", "Precio unit.", "Subtotal"].map((h, i) => (
              <th
                key={h}
                style={{
                  borderBottom: "1px solid #111",
                  textAlign: i >= 2 ? "right" : "left",
                  padding: "4px 6px",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccc" }}>
                {item.productName}
                {item.notes ? <div style={{ fontSize: 10, color: "#555" }}>{item.notes}</div> : null}
              </td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccc" }}>{item.unit || "—"}</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccc", textAlign: "right" }}>
                {Number(item.quantity)}
              </td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccc", textAlign: "right" }}>
                {money(item.unitPrice)}
              </td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccc", textAlign: "right" }}>
                {money(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ textAlign: "right", marginBottom: 12 }}>
        <div>Subtotal: {money(order.subtotal ?? order.total)}</div>
        {Number(order.deliveryFee || 0) > 0 ? <div>Envío: {money(order.deliveryFee)}</div> : null}
        {Number(order.discount || 0) > 0 ? <div>Descuento: -{money(order.discount)}</div> : null}
        <div style={{ fontSize: 16, fontWeight: 700 }}>Total: {money(order.total)}</div>
      </div>

      <div>
        <strong>Estado:</strong> {statusLabels[order.status] || order.status} ·{" "}
        <strong>Pago:</strong> {paymentStatusLabel(order.paymentStatus)} (
        {paymentMethodLabel(order.paymentMethod)})
      </div>
      {order.customerNotes ? (
        <div style={{ marginTop: 8 }}>
          <strong>Notas del cliente:</strong> {order.customerNotes}
        </div>
      ) : null}
    </div>
  );
}
