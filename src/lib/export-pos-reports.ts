import type ExcelJSTypes from "exceljs";
import { formatMoney } from "@/lib/format-money";

/**
 * Exportación de cortes y reportes del POS.
 *
 * Mismo enfoque que `export-orders-list.ts`: el Excel se arma en el cliente con
 * exceljs y el PDF con jspdf, para no meter generación de archivos al Back.
 */

export interface ReportSummary {
  total: number;
  ticketsCount: number;
  itemsCount: number;
  avgTicket: number;
  products: Array<{ name: string; saleUnit: string; quantity: number; revenue: number; tickets: number }>;
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
  resumen.addRow(["Total vendido", formatMoney(params.summary.total)]);
  resumen.addRow(["Tickets", params.summary.ticketsCount]);
  resumen.addRow(["Ticket promedio", formatMoney(params.summary.avgTicket)]);
  resumen.addRow(["Artículos vendidos", params.summary.itemsCount]);

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
      ["Total vendido", formatMoney(params.summary.total)],
      ["Tickets", String(params.summary.ticketsCount)],
      ["Ticket promedio", formatMoney(params.summary.avgTicket)],
      ["Artículos vendidos", String(params.summary.itemsCount)],
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
