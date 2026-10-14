import type ExcelJSTypes from "exceljs";
import { POS_PAYMENT_METHOD_VALUES, POS_SALE_KINDS, posPaymentMethodLabel } from "@glamouroso/shared/constants";
import { formatMoney } from "@/lib/format-money";

/**
 * Exportación de cortes y reportes del POS.
 *
 * Mismo enfoque que `export-orders-list.ts`: el Excel se arma en el cliente con
 * exceljs y el PDF con jspdf, para no meter generación de archivos al Back.
 */

export interface ReportSummary {
  /** Neto: lo vendido menos las devoluciones de cliente del periodo. */
  total: number;
  /** Lo vendido sin restar devoluciones (ausente en cortes congelados antes de 2026-10-14). */
  grossTotal?: number;
  /** Devoluciones de cliente hechas en el periodo (restan el día en que se devolvió). */
  returns?: { total: number; count: number };
  ticketsCount: number;
  itemsCount: number;
  avgTicket: number;
  /** Cuánto entró por cada forma de pago (efectivo = lo que hay en el cajón). */
  byPaymentMethod?: Array<{
    paymentMethod: string;
    total: number;
    tickets: number;
    /** Devuelto por esa forma de pago (ya restado de `total`). */
    returnsTotal?: number;
  }>;
  /** Mostrador y venta a domicilio; la de domicilio ya va dentro del total. */
  byKind?: Array<{ kind: string; total: number; tickets: number }>;
  products: Array<{ name: string; saleUnit: string; quantity: number; revenue: number; tickets: number }>;
}

/**
 * "Efectivo $1,200.00 · Tarjeta $300.00": una línea, en el orden fijo de los
 * métodos. Si hubo venta a domicilio se agrega cuánto fue (ya va en el total).
 */
export function paymentBreakdownLabel(
  summary: Pick<ReportSummary, "byPaymentMethod" | "byKind" | "returns">
): string {
  const rows = summary.byPaymentMethod ?? [];
  if (!rows.length) return "";
  const methods = POS_PAYMENT_METHOD_VALUES.map((method) => {
    const row = rows.find((item) => item.paymentMethod === method);
    return `${posPaymentMethodLabel(method)} ${formatMoney(row?.total ?? 0)}`;
  });
  const delivery = summary.byKind?.find((item) => item.kind === POS_SALE_KINDS.HOME_DELIVERY);
  if (delivery?.tickets) methods.push(`a domicilio ${formatMoney(delivery.total)}`);
  // Las formas de pago ya vienen netas: se dice cuánto se devolvió.
  if (summary.returns?.count) methods.push(`devoluciones -${formatMoney(summary.returns.total)}`);
  return methods.join(" · ");
}

/** Renglones "Vendido" y "Devoluciones de cliente" del corte; vacío si no hubo devoluciones. */
export function returnsRowsOf(summary: Pick<ReportSummary, "returns" | "grossTotal">): Array<[string, string]> {
  const returns = summary.returns;
  if (!returns?.count) return [];
  return [
    ["Vendido (antes de devoluciones)", formatMoney(summary.grossTotal ?? 0)],
    [
      `Devoluciones de cliente (${returns.count})`,
      `-${formatMoney(returns.total)}`,
    ],
  ];
}

/** Renglón "De ello, venta a domicilio" del corte; null si no hubo. */
export function deliveryRowOf(summary: Pick<ReportSummary, "byKind">): [string, string] | null {
  const row = summary.byKind?.find((item) => item.kind === POS_SALE_KINDS.HOME_DELIVERY);
  if (!row || !row.tickets) return null;
  return [
    `De ello, venta a domicilio (${row.tickets} ${row.tickets === 1 ? "ticket" : "tickets"})`,
    formatMoney(row.total),
  ];
}

export interface BranchRow {
  code: string;
  name: string;
  total: number;
  ticketsCount: number;
  avgTicket: number;
}

const BRAND = { blue: "FF06A6E0", navy: "FF262D60", rowAlt: "FFF4F7FB" };

function headerRow(sheet: ExcelJSTypes.Worksheet, values: string[]): void {
  const row = sheet.addRow(values);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.navy } };
}

export async function exportPosReportToXlsx(params: {
  summary: ReportSummary;
  branches: BranchRow[];
  periodLabel: string;
  branchLabel: string;
}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glamouroso";

  const resumen = workbook.addWorksheet("Resumen");
  resumen.columns = [{ width: 30 }, { width: 22 }];
  resumen.addRow(["Corte de caja", params.periodLabel]).font = { bold: true, size: 14 };
  resumen.addRow(["Sucursal", params.branchLabel]);
  resumen.addRow([]);
  headerRow(resumen, ["Concepto", "Valor"]);
  for (const row of returnsRowsOf(params.summary)) resumen.addRow(row);
  resumen.addRow(["Total vendido", formatMoney(params.summary.total)]);
  resumen.addRow(["Tickets", params.summary.ticketsCount]);
  resumen.addRow(["Ticket promedio", formatMoney(params.summary.avgTicket)]);
  resumen.addRow(["Artículos vendidos", params.summary.itemsCount]);
  for (const row of params.summary.byPaymentMethod ?? []) {
    resumen.addRow([`Cobrado con ${posPaymentMethodLabel(row.paymentMethod).toLowerCase()}`, formatMoney(row.total)]);
  }
  const deliveryRow = deliveryRowOf(params.summary);
  if (deliveryRow) resumen.addRow(deliveryRow);

  const porSucursal = workbook.addWorksheet("Por sucursal");
  porSucursal.columns = [{ width: 12 }, { width: 28 }, { width: 16 }, { width: 12 }, { width: 16 }];
  headerRow(porSucursal, ["Código", "Sucursal", "Total", "Tickets", "Ticket promedio"]);
  params.branches.forEach((row, index) => {
    const added = porSucursal.addRow([row.code, row.name, row.total, row.ticketsCount, row.avgTicket]);
    if (index % 2 === 1) {
      added.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.rowAlt } };
    }
  });
  porSucursal.getColumn(3).numFmt = '"$"#,##0.00';
  porSucursal.getColumn(5).numFmt = '"$"#,##0.00';

  const productos = workbook.addWorksheet("Productos vendidos");
  productos.columns = [{ width: 44 }, { width: 12 }, { width: 14 }, { width: 16 }, { width: 10 }];
  headerRow(productos, ["Producto", "Unidad", "Cantidad", "Importe", "Tickets"]);
  params.summary.products.forEach((row) => {
    productos.addRow([
      row.name,
      row.saleUnit === "liter" ? "litro" : "pieza",
      row.quantity,
      row.revenue,
      row.tickets,
    ]);
  });
  productos.getColumn(4).numFmt = '"$"#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `corte-${params.periodLabel.replace(/[^\w-]+/g, "-")}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportPosReportToPdf(params: {
  summary: ReportSummary;
  branches: BranchRow[];
  periodLabel: string;
  branchLabel: string;
}): Promise<void> {
  const { default: JsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new JsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  doc.setFontSize(16);
  doc.text("Corte de caja", 40, 48);
  doc.setFontSize(10);
  doc.text(`${params.branchLabel} · ${params.periodLabel}`, 40, 66);

  autoTable(doc, {
    startY: 86,
    head: [["Concepto", "Valor"]],
    body: [
      ...returnsRowsOf(params.summary),
      ["Total vendido", formatMoney(params.summary.total)],
      ["Tickets", String(params.summary.ticketsCount)],
      ["Ticket promedio", formatMoney(params.summary.avgTicket)],
      ["Artículos vendidos", String(params.summary.itemsCount)],
      ...(params.summary.byPaymentMethod ?? []).map((row) => [
        `Cobrado con ${posPaymentMethodLabel(row.paymentMethod).toLowerCase()}`,
        formatMoney(row.total),
      ]),
      ...(deliveryRowOf(params.summary) ? [deliveryRowOf(params.summary)!] : []),
    ],
    headStyles: { fillColor: [38, 45, 96] },
    theme: "grid",
  });

  autoTable(doc, {
    head: [["Código", "Sucursal", "Total", "Tickets", "Promedio"]],
    body: params.branches.map((row) => [
      row.code,
      row.name,
      formatMoney(row.total),
      String(row.ticketsCount),
      formatMoney(row.avgTicket),
    ]),
    headStyles: { fillColor: [6, 166, 224] },
    theme: "striped",
  });

  autoTable(doc, {
    head: [["Producto", "Unidad", "Cantidad", "Importe"]],
    body: params.summary.products
      .slice(0, 200)
      .map((row) => [
        row.name,
        row.saleUnit === "liter" ? "litro" : "pieza",
        String(row.quantity),
        formatMoney(row.revenue),
      ]),
    headStyles: { fillColor: [6, 166, 224] },
    theme: "striped",
  });

  doc.save(`corte-${params.periodLabel.replace(/[^\w-]+/g, "-")}.pdf`);
}
