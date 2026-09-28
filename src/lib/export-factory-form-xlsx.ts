import type ExcelJSTypes from "exceljs";
import type { FactoryFormAdmin, FactoryFormAdminRow } from "@glamouroso/shared";

/**
 * El formato de pedido a tiendas en Excel, en blanco y con las reglas
 * bloqueadas: la misma hoja del negocio ("FORMATO PEDIDO TIENDAS", 4 hojas con
 * bloques `Producto | Cant | Impor | E`), armada desde los renglones que se
 * administran en Punto de venta → Formato de pedido.
 *
 * Las reglas son fórmulas en celdas bloqueadas (la hoja va protegida): el
 * importe de cada renglón (`Cant × precio a tienda`), los bidones
 * transparentes y de color, las cajas azules, la publicidad y los totales.
 * Solo se pueden escribir la fecha, el nombre, las cantidades, la palomita
 * `E`, el flete y los renglones en blanco.
 */

const FONT = { name: "Arial", size: 9 };
const MONEY = '"$"#,##0.00;-"$"#,##0.00;""';
const INPUT_FILL: ExcelJSTypes.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8DC" } };
const SHADE_FILL: ExcelJSTypes.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E4" } };
const THIN: Partial<ExcelJSTypes.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
/** Columnas por bloque: Producto, Cant, Impor, E. */
const BLOCK_COLS = 4;

function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function unlock(cell: ExcelJSTypes.Cell) {
  cell.protection = { locked: false };
  cell.fill = INPUT_FILL;
}

/** Arma el libro (sin descargarlo): así se puede generar y revisar fuera del navegador. */
export async function buildFactoryFormWorkbook(
  ExcelJS: typeof ExcelJSTypes,
  form: FactoryFormAdmin
): Promise<ExcelJSTypes.Workbook> {
  const { charges } = form;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Glamouroso";
  const ws = workbook.addWorksheet("GLAMOUROSO", {
    pageSetup: { paperSize: 1 as ExcelJSTypes.PaperSize, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  for (let b = 0; b < 4; b += 1) {
    ws.getColumn(b * BLOCK_COLS + 1).width = 30;
    ws.getColumn(b * BLOCK_COLS + 2).width = 6;
    ws.getColumn(b * BLOCK_COLS + 3).width = 11;
    ws.getColumn(b * BLOCK_COLS + 4).width = 3;
  }

  const pages = [...new Set(form.rows.map((row) => row.page))].sort((a, b) => a - b);
  const cantCells = { transparent: [] as string[], color: [] as string[], blue: [] as string[] };
  const bidonRows: Array<{ label: string; cell: string; color: boolean }> = [];
  const pageTotals: string[] = [];
  let top = 1;

  for (const page of pages) {
    const rows = form.rows.filter((row) => row.page === page);
    const blocks = [...new Set(rows.map((row) => row.block))].sort((a, b) => a - b);
    const lastBlock = blocks[blocks.length - 1] ?? 0;

    // Encabezado: marca, fecha y nombre (la fecha y el nombre se escriben en la primera hoja).
    const header = ws.getRow(top);
    header.getCell(1).value = "GlamourOso";
    header.getCell(1).font = { ...FONT, size: 16, bold: true };
    header.getCell(5).value = "FECHA:";
    header.getCell(9).value = "NOMBRE";
    header.getCell(5).font = header.getCell(9).font = { ...FONT, bold: true };
    if (top === 1) {
      unlock(header.getCell(6));
      unlock(header.getCell(10));
      header.getCell(6).numFmt = "dd/mm/yyyy";
    } else {
      header.getCell(6).value = { formula: "$F$1" };
      header.getCell(10).value = { formula: "$J$1" };
    }
    const heads = ws.getRow(top + 1);
    for (const block of blocks) {
      const base = block * BLOCK_COLS;
      ["Producto", "Cant", "Impor", "E"].forEach((title, i) => {
        const cell = heads.getCell(base + i + 1);
        cell.value = title;
        cell.font = { ...FONT, bold: true };
        cell.border = THIN;
        cell.alignment = { horizontal: i === 0 ? "left" : "center" };
      });
    }

    const first = top + 2;
    let maxRows = 0;
    const amountRanges: string[] = [];
    for (const block of blocks) {
      const base = block * BLOCK_COLS;
      const blockRows = rows.filter((row) => row.block === block).sort((a, b) => a.row - b.row);
      maxRows = Math.max(maxRows, blockRows.length);
      blockRows.forEach((row: FactoryFormAdminRow, i) => {
        const r = first + i;
        const label = ws.getCell(r, base + 1);
        const cant = ws.getCell(r, base + 2);
        const amount = ws.getCell(r, base + 3);
        const check = ws.getCell(r, base + 4);
        [label, cant, amount, check].forEach((cell) => {
          cell.border = THIN;
          cell.font = FONT;
        });
        if (row.kind === "section") {
          ws.mergeCells(r, base + 1, r, base + 4);
          label.value = row.label;
          label.font = { ...FONT, bold: true };
          label.alignment = { horizontal: "center" };
          return;
        }
        if (row.kind === "blank") {
          // Renglón en blanco: para escribir a mano algo que no está en la hoja.
          [label, cant, amount, check].forEach(unlock);
          amount.numFmt = MONEY;
          return;
        }
        label.value = row.label;
        unlock(cant);
        unlock(check);
        const cantRef = `${colLetter(base + 2)}${r}`;
        amount.numFmt = MONEY;
        amount.value = row.unitPrice != null
          ? { formula: `IF(${cantRef}="","",${cantRef}*${row.unitPrice})` }
          : null;
        if (row.bidon === "transparent") cantCells.transparent.push(cantRef);
        if (row.bidon === "color") cantCells.color.push(cantRef);
        if (row.bidon) bidonRows.push({ label: row.label, cell: cantRef, color: row.bidon === "color" });
        if (row.blueBox) cantCells.blue.push(cantRef);
      });
      if (blockRows.length) {
        const col = colLetter(base + 3);
        amountRanges.push(`${col}${first}:${col}${first + blockRows.length - 1}`);
      }
    }

    // Pie de la hoja, en el último bloque, debajo del renglón más largo.
    const base = lastBlock * BLOCK_COLS;
    const qtyCol = colLetter(base + 2);
    const amountCol = colLetter(base + 3);
    let f = first + maxRows + 1;
    const footer = (label: string, qty?: ExcelJSTypes.CellValue, amount?: ExcelJSTypes.CellValue, opts: { unlockQty?: boolean; unlockAmount?: boolean; shaded?: boolean } = {}) => {
      const labelCell = ws.getCell(f, base + 1);
      labelCell.value = label;
      labelCell.font = { ...FONT, bold: true };
      const q = ws.getCell(f, base + 2);
      const a = ws.getCell(f, base + 3);
      if (qty !== undefined) q.value = qty;
      if (amount !== undefined) a.value = amount;
      a.numFmt = MONEY;
      q.font = a.font = { ...FONT, bold: true };
      if (opts.unlockQty) unlock(q);
      if (opts.unlockAmount) unlock(a);
      if (opts.shaded) [labelCell, q, a, ws.getCell(f, base + 4)].forEach((cell) => (cell.fill = SHADE_FILL));
      const row = f;
      f += 1;
      return row;
    };
    const sumOf = (cells: string[]) => (cells.length ? `SUM(${cells.join(",")})` : "0");
    const extras: string[] = [];
    if (page === pages[0]) {
      const t = footer("BID TRANSPARENTE", { formula: sumOf(cantCells.transparent) }, undefined);
      ws.getCell(t, base + 3).value = { formula: `${qtyCol}${t}*${charges.bidonTransparent}` };
      const c = footer("BIDON COLOR", { formula: sumOf(cantCells.color) }, undefined);
      ws.getCell(c, base + 3).value = { formula: `${qtyCol}${c}*${charges.bidonColor}` };
      extras.push(`${amountCol}${t}`, `${amountCol}${c}`);
    }
    if (page === pages[pages.length - 1]) {
      const p = footer("Publicidad", undefined, undefined, { unlockQty: true });
      ws.getCell(p, base + 3).value = { formula: `IF(${qtyCol}${p}="","",${qtyCol}${p}*${charges.publicity})` };
      const fl = footer("Flete", undefined, undefined, { unlockAmount: true });
      const b = footer("CAJAS AZULES", { formula: sumOf(cantCells.blue) }, undefined, { shaded: true });
      ws.getCell(b, base + 3).value = { formula: `${qtyCol}${b}*${charges.blueBox}` };
      extras.push(`${amountCol}${p}`, `${amountCol}${fl}`, `${amountCol}${b}`);
    }
    const totalRow = footer(page === pages[pages.length - 1] ? "TOTAL=" : "Total=", undefined, undefined, { shaded: true });
    ws.getCell(totalRow, base + 3).value = { formula: `SUM(${[...amountRanges, ...extras].join(",")})` };
    pageTotals.push(`${amountCol}${totalRow}`);
    if (page === pages[pages.length - 1]) {
      const g = footer("TOTAL PEDIDO=", undefined, undefined, { shaded: true });
      ws.getCell(g, base + 3).value = { formula: pageTotals.join("+") };
    }
    top = f + 1;
    ws.getRow(top - 1).addPageBreak();
  }

  // Hoja de bidones (la "Hoja3" del Excel de tiendas): cuánto llenar de cada uno.
  const sheet = workbook.addWorksheet("BIDONES");
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 10;
  sheet.getRow(1).values = ["Producto", "Bidones"];
  sheet.getRow(1).font = { ...FONT, bold: true };
  bidonRows.forEach((row, i) => {
    const r = sheet.getRow(i + 2);
    r.getCell(1).value = row.color ? `${row.label} (color)` : row.label;
    r.getCell(2).value = { formula: `IF(GLAMOUROSO!${row.cell}="","",GLAMOUROSO!${row.cell})` };
    r.font = FONT;
    if (row.color) [r.getCell(1), r.getCell(2)].forEach((cell) => (cell.fill = SHADE_FILL));
  });
  const totalRow = sheet.getRow(bidonRows.length + 3);
  totalRow.getCell(1).value = "BIDONES";
  totalRow.getCell(2).value = { formula: `SUM(B2:B${bidonRows.length + 1})` };
  totalRow.font = { ...FONT, bold: true };

  // Reglas bloqueadas: nombres, precios y fórmulas no se pueden cambiar en el archivo.
  const options = {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: true,
    formatRows: true,
    insertRows: false,
    insertColumns: false,
    deleteRows: false,
    deleteColumns: false,
    sort: false,
    autoFilter: false,
  };
  await ws.protect("", options);
  await sheet.protect("", options);
  return workbook;
}

/** Descarga el formato en blanco. */
export async function exportFactoryFormXlsx(form: FactoryFormAdmin): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = await buildFactoryFormWorkbook(ExcelJS, form);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const today = new Date();
  const stamp = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getFullYear()).slice(2)}`;
  link.download = `formato-pedido-tiendas-${stamp}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
