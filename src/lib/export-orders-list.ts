import { paymentStatusLabel } from "@/constants/orders";
import { formatDateOnly } from "@/lib/format-date-only";
import type { Order } from "@/types";

export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  processing: "En proceso",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export interface OrdersExportContext {
  /** Etiqueta del tab o filtro activo, ej. "Hoy", "Todos". */
  scopeLabel: string;
}

function formatCreatedAt(value: string | Date | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export const ORDERS_EXPORT_HEADERS = [
  "Folio",
  "Creado",
  "Entrega",
  "Ventana",
  "Cliente",
  "Teléfono",
  "Estado",
  "Pago",
  "Total",
];

export function orderToExportRow(order: Order): (string | number)[] {
  return [
    order.orderNumber,
    formatCreatedAt(order.createdAt),
    order.scheduledDeliveryDate ? formatDateOnly(order.scheduledDeliveryDate) : "Sin fecha",
    order.deliveryTimeWindow || "",
    order.customer?.name || "",
    order.customer?.phone || "",
    ORDER_STATUS_LABELS[order.status] || order.status,
    paymentStatusLabel(order.paymentStatus),
    Number(order.total || 0),
  ];
}

export function ordersTotalSum(orders: Order[]) {
  return orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
}

export function exportFileStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function exportOrdersToXlsx(orders: Order[], context: OrdersExportContext) {
  const XLSX = await import("xlsx");
  const generatedAt = new Date().toLocaleString("es-MX");
  const sheetData: (string | number)[][] = [
    [`Pedidos — ${context.scopeLabel}`],
    [`Generado: ${generatedAt}`],
    [],
    ORDERS_EXPORT_HEADERS,
    ...orders.map(orderToExportRow),
    [],
    ["", "", "", "", "", "", "", "Total", Number(ordersTotalSum(orders).toFixed(2))],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 26 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pedidos");
  XLSX.writeFile(workbook, `pedidos-${exportFileStamp()}.xlsx`);
}

export async function exportOrdersToPdf(orders: Order[], context: OrdersExportContext) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });
  const generatedAt = new Date().toLocaleString("es-MX");

  doc.setFontSize(14);
  doc.text(`Pedidos — ${context.scopeLabel}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generado: ${generatedAt} · ${orders.length} pedidos`, 14, 22);

  autoTable(doc, {
    startY: 27,
    head: [ORDERS_EXPORT_HEADERS],
    body: orders.map((order) => {
      const row = orderToExportRow(order);
      row[8] = `$${Number(row[8]).toFixed(2)}`;
      return row.map(String);
    }),
    foot: [["", "", "", "", "", "", "", "Total", `$${ordersTotalSum(orders).toFixed(2)}`]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [31, 41, 55] },
  });

  doc.save(`pedidos-${exportFileStamp()}.pdf`);
}
