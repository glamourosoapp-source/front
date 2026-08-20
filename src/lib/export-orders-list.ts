import { orderCreatorLabel, orderStatusLabel, orderTeamLabel, paymentStatusLabel } from "@/constants/orders";
import { businessTimeZone } from "@/lib/business-time";
import { formatDateOnly } from "@/lib/format-date-only";
import type { Order } from "@/types";

/** Paleta de marca Glamouroso (misma que AppThemeProvider). */
export const BRAND = {
  blue: "#06a6e0",
  navy: "#262d60",
  yellow: "#ffe443",
  rowAlt: "#f4f7fb",
  text: "#172033",
  textMuted: "#687084",
  divider: "#e6ebf3",
} as const;

const LOGO_URL = "/branding/glamouroso-logo-azul-sobre-blanco.svg";
/** viewBox del SVG del logo: 477.68 × 117.25. */
const LOGO_ASPECT = 477.68 / 117.25;

export interface OrdersExportContext {
  /** Etiqueta del tab o filtro activo, ej. "Hoy", "Todos". */
  scopeLabel: string;
}

// Timestamp en la timezone del negocio, no la del navegador que exporta.
function formatCreatedAt(value: string | Date | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", {
    timeZone: businessTimeZone(),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const ORDERS_EXPORT_HEADERS = [
  "Folio",
  "Creado",
  "Entrega",
  "Ventana",
  "Cliente",
  "Teléfono",
  "Creado por",
  "Equipo",
  "Estado",
  "Pago",
  "Subtotal",
  "Bidones",
  "Total",
];

/** Índice (0-based) de la columna Total; los formatos numéricos dependen de él. */
export const ORDERS_EXPORT_TOTAL_INDEX = ORDERS_EXPORT_HEADERS.length - 1;

/** Columnas de dinero (Subtotal, Bidones, Total), en orden. */
export const ORDERS_EXPORT_MONEY_INDEXES = [
  ORDERS_EXPORT_TOTAL_INDEX - 2,
  ORDERS_EXPORT_TOTAL_INDEX - 1,
  ORDERS_EXPORT_TOTAL_INDEX,
];

export function orderToExportRow(order: Order): (string | number)[] {
  return [
    order.orderNumber,
    formatCreatedAt(order.createdAt),
    order.scheduledDeliveryDate ? formatDateOnly(order.scheduledDeliveryDate) : "Sin fecha",
    order.deliveryTimeWindow || "",
    order.customer?.name || "",
    order.customer?.phone || "",
    orderCreatorLabel(order),
    orderTeamLabel(order),
    orderStatusLabel(order.status),
    paymentStatusLabel(order.paymentStatus),
    // Pedidos previos a la columna subtotal caen al total (mismo criterio que el detalle).
    Number(order.subtotal ?? order.total ?? 0),
    Number(order.containersFee || 0),
    Number(order.total || 0),
  ];
}

/** Sumas de las columnas de dinero, en el mismo orden que ORDERS_EXPORT_MONEY_INDEXES. */
export function ordersMoneySums(orders: Order[]): [number, number, number] {
  return orders.reduce<[number, number, number]>(
    (sums, order) => [
      sums[0] + Number(order.subtotal ?? order.total ?? 0),
      sums[1] + Number(order.containersFee || 0),
      sums[2] + Number(order.total || 0),
    ],
    [0, 0, 0]
  );
}

export function exportFileStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Rasteriza el logo SVG a PNG (el SVG no se puede incrustar directo en jsPDF/exceljs). */
async function loadLogoPng(widthPx: number): Promise<string | null> {
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;
    const svgBlob = await response.blob();
    const url = URL.createObjectURL(svgBlob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      const heightPx = Math.round(widthPx / LOGO_ASPECT);
      const canvas = document.createElement("canvas");
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0, widthPx, heightPx);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/** "#rrggbb" → "FFRRGGBB" (formato ARGB de exceljs). */
function argb(hex: string) {
  return `FF${hex.slice(1).toUpperCase()}`;
}

function triggerDownload(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportOrdersToXlsx(orders: Order[], context: OrdersExportContext) {
  const ExcelJS = (await import("exceljs")).default;
  const [logoPng] = await Promise.all([loadLogoPng(480)]);
  const generatedAt = new Date().toLocaleString("es-MX");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pedidos", {
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 26 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];

  // Filas 1-4: encabezado con logo y título.
  if (logoPng) {
    const imageId = workbook.addImage({ base64: logoPng, extension: "png" });
    sheet.addImage(imageId, {
      tl: { col: 0.2, row: 0.4 },
      ext: { width: 180, height: Math.round(180 / LOGO_ASPECT) },
    });
  }
  sheet.mergeCells("D2:M2");
  const titleCell = sheet.getCell("D2");
  titleCell.value = `Pedidos — ${context.scopeLabel}`;
  titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: argb(BRAND.navy) } };
  titleCell.alignment = { horizontal: "right", vertical: "middle" };
  sheet.mergeCells("D3:M3");
  const subtitleCell = sheet.getCell("D3");
  subtitleCell.value = `Generado: ${generatedAt} · ${orders.length} pedidos`;
  subtitleCell.font = { name: "Calibri", size: 10, color: { argb: argb(BRAND.textMuted) } };
  subtitleCell.alignment = { horizontal: "right", vertical: "middle" };
  sheet.getRow(2).height = 22;

  // Fila 5: franja amarilla de marca.
  sheet.mergeCells("A5:M5");
  sheet.getCell("A5").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: argb(BRAND.yellow) },
  };
  sheet.getRow(5).height = 4;

  // Fila 6: encabezados de tabla.
  const headerRow = sheet.getRow(6);
  ORDERS_EXPORT_HEADERS.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(BRAND.navy) } };
    cell.alignment = {
      vertical: "middle",
      horizontal: ORDERS_EXPORT_MONEY_INDEXES.includes(index) ? "right" : "left",
    };
  });
  headerRow.height = 20;

  // Datos con zebra striping.
  orders.forEach((order, index) => {
    const row = sheet.getRow(7 + index);
    orderToExportRow(order).forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.font = { name: "Calibri", size: 10, color: { argb: argb(BRAND.text) } };
      if (index % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(BRAND.rowAlt) } };
      }
      cell.border = { bottom: { style: "thin", color: { argb: argb(BRAND.divider) } } };
    });
    ORDERS_EXPORT_MONEY_INDEXES.forEach((moneyIndex) => {
      const moneyCell = row.getCell(moneyIndex + 1);
      moneyCell.numFmt = '"$"#,##0.00';
      moneyCell.alignment = { horizontal: "right" };
    });
  });

  // Fila de totales generales (Subtotal, Bidones, Total).
  const totalRow = sheet.getRow(7 + orders.length);
  const totalLabelCell = totalRow.getCell(ORDERS_EXPORT_MONEY_INDEXES[0]);
  totalLabelCell.value = "Totales";
  totalLabelCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: argb(BRAND.navy) } };
  totalLabelCell.alignment = { horizontal: "right" };
  const sums = ordersMoneySums(orders);
  const sumCells = ORDERS_EXPORT_MONEY_INDEXES.map((moneyIndex, position) => {
    const cell = totalRow.getCell(moneyIndex + 1);
    cell.value = Number(sums[position].toFixed(2));
    cell.numFmt = '"$"#,##0.00';
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: argb(BRAND.navy) } };
    cell.alignment = { horizontal: "right" };
    return cell;
  });
  [totalLabelCell, ...sumCells].forEach((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(BRAND.yellow) } };
    cell.border = { top: { style: "medium", color: { argb: argb(BRAND.navy) } } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer as ArrayBuffer, `pedidos-${exportFileStamp()}.xlsx`);
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export async function exportOrdersToPdf(orders: Order[], context: OrdersExportContext) {
  const [{ default: jsPDF }, { default: autoTable }, logoPng] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadLogoPng(480),
  ]);
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toLocaleString("es-MX");

  // Encabezado: logo a la izquierda, título a la derecha, franja amarilla debajo.
  const logoWidth = 52;
  const logoHeight = logoWidth / LOGO_ASPECT;
  if (logoPng) {
    doc.addImage(logoPng, "PNG", 14, 10, logoWidth, logoHeight);
  }
  doc.setFontSize(15);
  doc.setTextColor(...hexToRgb(BRAND.navy));
  doc.setFont("helvetica", "bold");
  doc.text(`Pedidos — ${context.scopeLabel}`, pageWidth - 14, 16, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...hexToRgb(BRAND.textMuted));
  doc.text(`Generado: ${generatedAt} · ${orders.length} pedidos`, pageWidth - 14, 22, {
    align: "right",
  });
  doc.setFillColor(...hexToRgb(BRAND.yellow));
  doc.rect(14, 26, pageWidth - 28, 1.5, "F");

  autoTable(doc, {
    startY: 31,
    head: [ORDERS_EXPORT_HEADERS],
    body: orders.map((order) => {
      const row = orderToExportRow(order);
      ORDERS_EXPORT_MONEY_INDEXES.forEach((moneyIndex) => {
        row[moneyIndex] = `$${Number(row[moneyIndex]).toFixed(2)}`;
      });
      return row.map(String);
    }),
    foot: [
      [
        ...Array.from({ length: ORDERS_EXPORT_MONEY_INDEXES[0] - 1 }, () => ""),
        "Totales",
        ...ordersMoneySums(orders).map((sum) => `$${sum.toFixed(2)}`),
      ],
    ],
    styles: { fontSize: 8, textColor: hexToRgb(BRAND.text) },
    headStyles: { fillColor: hexToRgb(BRAND.navy), textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: hexToRgb(BRAND.rowAlt) },
    footStyles: {
      fillColor: hexToRgb(BRAND.yellow),
      textColor: hexToRgb(BRAND.navy),
      fontStyle: "bold",
    },
    columnStyles: Object.fromEntries(
      ORDERS_EXPORT_MONEY_INDEXES.map((moneyIndex) => [moneyIndex, { halign: "right" as const }])
    ),
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(...hexToRgb(BRAND.textMuted));
      doc.text("Glamouroso — glamouroso.app", 14, pageHeight - 8);
      doc.text(
        `Página ${doc.getCurrentPageInfo().pageNumber}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: "right" }
      );
    },
  });

  doc.save(`pedidos-${exportFileStamp()}.pdf`);
}
