import * as XLSX from "xlsx";
import { paymentMethodLabel, paymentStatusLabel } from "@/constants/orders";
import type { Order } from "@/types";

const statusLabels: Record<string, string> = {
  new: "Nuevo",
  processing: "En proceso",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

function formatDate(value: string | Date | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(value: string | number | undefined) {
  return Number(value || 0).toFixed(2);
}

export function exportOrderToXlsx(order: Order) {
  const customer = order.customer;
  const items = order.items || [];

  const infoRows: (string | number)[][] = [
    ["Folio", order.orderNumber],
    ["Fecha", formatDate(order.createdAt)],
    ["Estado", statusLabels[order.status] || order.status],
    ["Estado de pago", paymentStatusLabel(order.paymentStatus)],
    ["Metodo de pago", paymentMethodLabel(order.paymentMethod)],
    ["Cliente", customer?.name || "—"],
    ["WhatsApp", customer?.phone || "—"],
    ["Direccion de entrega", order.deliveryAddress || "—"],
    ["Zona de entrega", (order as { deliveryZone?: string }).deliveryZone || "—"],
    ["Notas del cliente", (order as { customerNotes?: string }).customerNotes || "—"],
    ["Notas internas", (order as { internalNotes?: string }).internalNotes || "—"],
    [],
    ["Producto", "Unidad", "Cantidad", "Precio unit.", "Subtotal"],
  ];

  const itemRows = items.map((item) => [
    item.productName,
    (item as { unit?: string }).unit || "—",
    Number(item.quantity),
    Number(item.unitPrice),
    Number(item.total),
  ]);

  const subtotal = (order as { subtotal?: string | number }).subtotal;
  const deliveryFee = (order as { deliveryFee?: string | number }).deliveryFee;
  const discount = (order as { discount?: string | number }).discount;

  const totalsRows: (string | number)[][] = [
    [],
    ["", "", "", "Subtotal", money(subtotal ?? order.total)],
  ];

  if (Number(deliveryFee || 0) > 0) {
    totalsRows.push(["", "", "", "Envio", money(deliveryFee)]);
  }
  if (Number(discount || 0) > 0) {
    totalsRows.push(["", "", "", "Descuento", money(discount)]);
  }
  totalsRows.push(["", "", "", "Total", money(order.total)]);

  const sheetData = [...infoRows, ...itemRows, ...totalsRows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pedido");

  const filename = `${order.orderNumber.replace(/[^\w-]/g, "_")}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
