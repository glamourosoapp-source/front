import type ExcelJSTypes from "exceljs";

/**
 * Excel del inventario de una o varias sucursales. Igual que los cortes, se
 * arma en el cliente con exceljs a partir de `GET /pos/inventory`: el
 * inventario completo de las sucursales elegidas, sin los filtros de búsqueda.
 *
 * Tres hojas:
 * - "Existencias": un renglón por línea/producto y una columna por sucursal
 *   (lo que se compara de un vistazo), con el total al final.
 * - "Faltantes": misma forma, con lo que le falta a cada sucursal para su stock.
 * - "Detalle": un renglón por sucursal × producto con existencia, stock y
 *   faltante, para filtrar o hacer tablas dinámicas.
 *
 * Con permiso de ver costos lleva además el costo de compra por litro/pieza y
 * su importe: el valor de la existencia (lo negativo no resta) y lo que cuesta
 * el faltante.
 */

export interface InventoryExportBranch {
  id: string;
  code: string;
  name: string;
}

export interface InventoryExportCell {
  stock: number;
  minStock: number;
}

export interface InventoryExportRow {
  kind: "line" | "product";
  name: string;
  sku: string | null;
  categoryName: string | null;
  byBranch: Record<string, InventoryExportCell>;
  /** Costo de compra por litro/pieza; null = sin costo capturado. */
  unitCost?: number | null;
}

const BRAND = { navy: "FF262D60", rowAlt: "FFF4F7FB", warn: "FFFFEDD5", warnText: "FF9A3412" };
const QTY_FORMAT = "#,##0.##";
const MONEY_FORMAT = '"$"#,##0.00';

function unitOf(row: InventoryExportRow): string {
  return row.kind === "line" ? "L" : "pz";
}

function cellOf(row: InventoryExportRow, branchId: string): InventoryExportCell {
  return row.byBranch[branchId] ?? { stock: 0, minStock: 0 };
}

function shortageOf(cell: InventoryExportCell): number {
  return Math.max(0, cell.minStock - cell.stock);
}

function styleHeader(row: ExcelJSTypes.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.navy } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 30;
}

/** Hoja con una columna por sucursal; `valueOf` decide qué número va en cada celda. */
function matrixSheet(
  workbook: ExcelJSTypes.Workbook,
  title: string,
  branches: InventoryExportBranch[],
  rows: InventoryExportRow[],
  valueOf: (cell: InventoryExportCell) => number,
  highlightShortage: boolean,
  /** Encabezado de la columna de importe (cantidad × costo); null = sin costos. */
  amountTitle: string | null
): void {
  const sheet = workbook.addWorksheet(title, { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  sheet.columns = [
    { width: 40 },
    { width: 8 },
    { width: 22 },
    ...branches.map(() => ({ width: 12 })),
    { width: 12 },
    ...(amountTitle ? [{ width: 12 }, { width: 14 }] : []),
  ];
  styleHeader(
    sheet.addRow([
      "Producto",
      "Unidad",
      "Categoría",
      ...branches.map((branch) => `${branch.code}\n${branch.name}`),
      "Total",
      ...(amountTitle ? ["Costo", amountTitle] : []),
    ])
  );
  let amountTotal = 0;
  rows.forEach((row, index) => {
    const values = branches.map((branch) => valueOf(cellOf(row, branch.id)));
    const cost = row.unitCost ?? null;
    const amount = cost == null ? null : values.reduce((sum, value) => sum + Math.max(0, value), 0) * cost;
    amountTotal += amount ?? 0;
    const added = sheet.addRow([
      row.name,
      unitOf(row),
      row.categoryName ?? "Sin categoría",
      ...values,
      values.reduce((sum, value) => sum + value, 0),
      ...(amountTitle ? [cost, amount] : []),
    ]);
    if (index % 2 === 1) added.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.rowAlt } };
    branches.forEach((branch, column) => {
      const cell = cellOf(row, branch.id);
      const target = added.getCell(4 + column);
      target.numFmt = QTY_FORMAT;
      if (highlightShortage && shortageOf(cell) > 0) {
        target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.warn } };
        target.font = { color: { argb: BRAND.warnText }, bold: true };
      }
    });
    const total = added.getCell(4 + branches.length);
    total.numFmt = QTY_FORMAT;
    total.font = { bold: true };
    if (amountTitle) {
      added.getCell(5 + branches.length).numFmt = MONEY_FORMAT;
      added.getCell(6 + branches.length).numFmt = MONEY_FORMAT;
      added.getCell(6 + branches.length).font = { bold: true };
    }
  });
  if (amountTitle) {
    const footer = sheet.addRow([]);
    footer.getCell(1).value = `${amountTitle} total`;
    footer.getCell(6 + branches.length).value = amountTotal;
    footer.getCell(6 + branches.length).numFmt = MONEY_FORMAT;
    footer.font = { bold: true };
  }
  const lastColumn = 3 + branches.length + 1 + (amountTitle ? 2 : 0);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lastColumn } };
}

export async function exportInventoryToXlsx(params: {
  branches: InventoryExportBranch[];
  rows: InventoryExportRow[];
  /** "Todas las sucursales", "Zapopan y Tonalá"… va en el nombre del archivo. */
  label: string;
  /** Costo e importes solo con permiso de ver costos. */
  withCost?: boolean;
}): Promise<void> {
  const withCost = Boolean(params.withCost);
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glamouroso";

  // Existencias con el faltante marcado en naranja: el mismo aviso que la pantalla.
  matrixSheet(workbook, "Existencias", params.branches, params.rows, (cell) => cell.stock, true, withCost ? "Valor" : null);
  matrixSheet(workbook, "Faltantes", params.branches, params.rows, shortageOf, false, withCost ? "Importe" : null);

  const detalle = workbook.addWorksheet("Detalle", { views: [{ state: "frozen", ySplit: 1 }] });
  detalle.columns = [
    { width: 10 },
    { width: 26 },
    { width: 10 },
    { width: 40 },
    { width: 14 },
    { width: 22 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    ...(withCost ? [{ width: 12 }, { width: 14 }] : []),
  ];
  styleHeader(
    detalle.addRow([
      "Código",
      "Sucursal",
      "Tipo",
      "Producto",
      "SKU",
      "Categoría",
      "Unidad",
      "Existencia",
      "Stock",
      "Faltante",
      ...(withCost ? ["Costo", "Valor"] : []),
    ])
  );
  for (const branch of params.branches) {
    for (const row of params.rows) {
      const cell = cellOf(row, branch.id);
      const added = detalle.addRow([
        branch.code,
        branch.name,
        row.kind === "line" ? "Líquido" : "Pieza",
        row.name,
        row.sku ?? "",
        row.categoryName ?? "Sin categoría",
        unitOf(row),
        cell.stock,
        cell.minStock,
        shortageOf(cell),
        ...(withCost
          ? [row.unitCost ?? null, row.unitCost == null ? null : Math.max(0, cell.stock) * row.unitCost]
          : []),
      ]);
      for (const column of [8, 9, 10]) added.getCell(column).numFmt = QTY_FORMAT;
      if (withCost) for (const column of [11, 12]) added.getCell(column).numFmt = MONEY_FORMAT;
    }
  }
  detalle.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: withCost ? 12 : 10 } };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const slug = params.label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `inventario-${slug || "sucursales"}-${today}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
