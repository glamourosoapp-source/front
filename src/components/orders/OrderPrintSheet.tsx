"use client";

import { Fragment, type CSSProperties } from "react";
import {
  orderCreatorLabel,
  orderStatusLabel,
  orderTeamLabel,
  paymentMethodLabel,
  paymentStatusLabel,
} from "@/constants/orders";
import { formatDateOnly } from "@/lib/format-date-only";
import type { Order } from "@/types";

function money(value: string | number | undefined) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatCreatedAt(value: string | Date | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PrintableOrder extends Omit<Order, "items"> {
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

const labelCell: CSSProperties = {
  background: "#d9d9d9",
  border: "1px solid #111",
  padding: "2px 6px",
  fontWeight: 700,
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 0.3,
  textAlign: "center",
};

const valueCell: CSSProperties = {
  border: "1px solid #111",
  padding: "3px 6px",
  fontSize: 11,
  textAlign: "center",
  minHeight: 18,
};

const productHeadCell: CSSProperties = {
  background: "#404040",
  color: "#fff",
  border: "1px solid #111",
  padding: "3px 6px",
  fontWeight: 700,
  fontSize: 9,
  textTransform: "uppercase",
};

const productCell: CSSProperties = {
  border: "1px solid #111",
  padding: "3px 6px",
  fontSize: 11,
};

/**
 * Hoja imprimible del pedido: solo visible al imprimir (clase print-only).
 * Replica el acomodo de la nota de remisión física de Glamouroso. Sin logo ni
 * folio de remisión: se imprime sobre hojas membretadas que ya los traen
 * preimpresos, por eso el bloque de datos arranca con espacio arriba.
 */
export function OrderPrintSheet({ order }: { order: PrintableOrder }) {
  const items = order.items || [];
  const customer = order.customer;
  const deliveryDate = order.scheduledDeliveryDate
    ? formatDateOnly(order.scheduledDeliveryDate, {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Sin fecha";

  // Cada fila del bloque de datos es un par [etiqueta gris, valor], en 3 columnas.
  const infoRows: Array<Array<[string, string]>> = [
    [
      ["Nombre", customer?.name || "—"],
      ["Teléfono", customer?.phone || "—"],
      ["Número de pedido", order.orderNumber],
    ],
    [
      ["Calle y número", customer?.street || customer?.address || "—"],
      ["Colonia", customer?.colony || "—"],
      ["Fecha", formatCreatedAt(order.createdAt)],
    ],
    [
      ["Municipio", customer?.city || "—"],
      ["Código postal", customer?.postalCode || "—"],
      ["Estatus", `${orderStatusLabel(order.status)} · ${paymentStatusLabel(order.paymentStatus)}`],
    ],
    [
      ["Zona de entrega", order.deliveryZone || "—"],
      ["Fecha de entrega", deliveryDate],
      ["Horario", order.deliveryTimeWindow || "—"],
    ],
    [
      ["Asesor", orderCreatorLabel(order)],
      ["Teléfono asesor", order.creator?.phone || "—"],
      ["Equipo", orderTeamLabel(order)],
    ],
  ];

  return (
    <div
      className="print-only"
      style={{
        fontFamily: "Arial, sans-serif",
        color: "#111",
        fontSize: 11,
        // Deja libre la franja superior donde la hoja membretada trae el
        // logotipo y el folio de la nota de remisión.
        paddingTop: 90,
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          {infoRows.map((row, i) => (
            <Fragment key={i}>
              <tr>
                {row.map(([label]) => (
                  <td key={label} style={{ ...labelCell, width: "33.33%" }}>
                    {label}
                  </td>
                ))}
              </tr>
              <tr>
                {row.map(([label, value]) => (
                  <td key={label} style={valueCell}>
                    {value}
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
          <tr>
            <td style={labelCell} colSpan={2}>
              Dirección de entrega
            </td>
            <td style={labelCell}>Método de pago</td>
          </tr>
          <tr>
            <td style={valueCell} colSpan={2}>
              {order.deliveryAddress || customer?.address || "—"}
            </td>
            <td style={valueCell}>{paymentMethodLabel(order.paymentMethod)}</td>
          </tr>
          {order.customerNotes || order.internalNotes ? (
            <>
              <tr>
                <td style={labelCell} colSpan={3}>
                  Notas
                </td>
              </tr>
              <tr>
                <td style={{ ...valueCell, textAlign: "left" }} colSpan={3}>
                  {order.customerNotes ? <div>Cliente: {order.customerNotes}</div> : null}
                  {order.internalNotes ? <div>Internas: {order.internalNotes}</div> : null}
                </td>
              </tr>
            </>
          ) : null}
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <thead>
          <tr>
            <th style={{ ...productHeadCell, width: 70 }}>Cantidad</th>
            <th style={{ ...productHeadCell, width: 90 }}>Presentación</th>
            <th style={{ ...productHeadCell, textAlign: "left" }}>Producto</th>
            {/* Columna vacía para palomear a la entrega, como en la nota física. */}
            <th style={{ ...productHeadCell, width: 24 }}>✓</th>
            <th style={{ ...productHeadCell, width: 90, textAlign: "right" }}>Precio unitario</th>
            <th style={{ ...productHeadCell, width: 90, textAlign: "right" }}>Precio total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ ...productCell, textAlign: "center" }}>{Number(item.quantity)}</td>
              <td style={{ ...productCell, textAlign: "center" }}>{item.unit || "—"}</td>
              <td style={productCell}>
                {item.productName}
                {item.notes ? <div style={{ fontSize: 9, color: "#555" }}>{item.notes}</div> : null}
              </td>
              <td style={productCell} />
              <td style={{ ...productCell, textAlign: "right" }}>{money(item.unitPrice)}</td>
              <td style={{ ...productCell, textAlign: "right" }}>{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: "top", paddingRight: 16, fontSize: 9, color: "#333" }}>
              <div>
                Al recibir confirmo que el producto está completo; si algo no se entrega o no está
                en condiciones de recibir, solicitar descontar de la nota o hacer la anotación para
                la reposición.
              </div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>
                Una vez recibido no hay cambios ni devoluciones.
              </div>
            </td>
            <td style={{ width: 220, verticalAlign: "top" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={labelCell}>Subtotal</td>
                    <td style={{ ...valueCell, textAlign: "right" }}>
                      {money(order.subtotal ?? order.total)}
                    </td>
                  </tr>
                  {Number(order.containersFee || 0) > 0 ? (
                    <tr>
                      <td style={labelCell}>
                        Bidones ({Number(order.containersCount || 0)} ×{" "}
                        {money(
                          Number(order.containersFee) /
                            Math.max(1, Number(order.containersCount || 0))
                        )}
                        )
                      </td>
                      <td style={{ ...valueCell, textAlign: "right" }}>
                        {money(order.containersFee)}
                      </td>
                    </tr>
                  ) : null}
                  {Number(order.deliveryFee || 0) > 0 ? (
                    <tr>
                      <td style={labelCell}>Envío</td>
                      <td style={{ ...valueCell, textAlign: "right" }}>{money(order.deliveryFee)}</td>
                    </tr>
                  ) : null}
                  {Number(order.discount || 0) > 0 ? (
                    <tr>
                      <td style={labelCell}>Descuento</td>
                      <td style={{ ...valueCell, textAlign: "right" }}>-{money(order.discount)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td style={{ ...labelCell, fontSize: 11 }}>Total</td>
                    <td style={{ ...valueCell, textAlign: "right", fontWeight: 700, fontSize: 13 }}>
                      {money(order.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
