import {
  matchStockSheet,
  readStockSheet,
  type FactoryForm,
  type StockSheetEntry,
  type StockSheetRead,
} from "@glamouroso/shared";
import { httpClient } from "@/services/http-client";
import { isLinked, rowKey, targetLabel, targetTotals, type SheetValues } from "@/components/pos-admin/FactoryFormSheet";

/** El Excel leído en el navegador, antes de mandarlo a una sucursal. */
export interface StockSheetFile extends StockSheetRead {
  fileName: string;
}

export interface StockSheetResult {
  /** Líneas y productos con Stock guardado. */
  saved: number;
  liters: number;
  pieces: number;
  /** null = no se pidió cargar inventario. */
  inventory: { applied: number; errors: Array<{ label: string; message: string }> } | null;
  /** Etiquetas del Excel que no están en el formato de pedido. */
  unknown: StockSheetEntry[];
  /** Renglones del formato que no están ligados a un producto del catálogo. */
  unlinked: StockSheetEntry[];
  invalid: StockSheetRead["invalid"];
}

/**
 * Lee el Excel de stock (la hoja de pedido a tiendas con la Cant llena). Busca
 * la hoja que traiga los encabezados "Producto / Cant", normalmente GLAMOUROSO.
 */
export async function readStockSheetFile(file: File): Promise<StockSheetFile> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    const read = readStockSheet(grid);
    if (read.pages) return { ...read, fileName: file.name };
  }
  throw new Error("El archivo no trae la hoja del formato de pedido (encabezados Producto y Cant).");
}

/**
 * Guarda el Excel como Stock de la sucursal (cant × empaque de cada renglón,
 * sumando los renglones de un mismo producto, igual que la captura a mano) y,
 * si se pide, también como inventario de hoy: un movimiento `initial` por
 * línea o producto que deja la existencia igual a esa cantidad.
 *
 * Solo toca lo que trae el Excel; lo demás conserva su Stock.
 */
export async function applyStockSheet(
  branchId: string,
  sheet: StockSheetFile,
  { asInventory }: { asInventory: boolean }
): Promise<StockSheetResult> {
  const form = await httpClient.get<FactoryForm>(`/pos/branches/${branchId}/min-stock-form`);
  const formRows = form.pages.flatMap((page) => page.blocks.flat());
  const { matched, unknown } = matchStockSheet(sheet.entries, formRows);

  const values: SheetValues = {};
  const unlinked: StockSheetEntry[] = [];
  for (const { entry, row } of matched) {
    if (isLinked(row)) values[rowKey(row)] = String(entry.qty);
    else unlinked.push(entry);
  }
  const totals = [...targetTotals(formRows, values).values()].filter((total) => total.base > 0);
  if (!totals.length) {
    throw new Error("Ningún renglón del Excel coincide con el formato de pedido: revisa que sea el formato de tiendas.");
  }
  const target = (total: (typeof totals)[number]) =>
    total.lineId ? { lineId: total.lineId } : { productId: total.productId };

  await httpClient.put(`/pos/branches/${branchId}/min-stock`, {
    rows: totals.map((total) => ({ ...target(total), minStock: total.base })),
  });

  let inventory: StockSheetResult["inventory"] = null;
  if (asInventory) {
    const result = await httpClient.post<{ applied: number; errors: Array<{ index: number; message: string }> }>(
      `/pos/branches/${branchId}/inventory/bulk`,
      {
        rows: totals.map((total) => ({ ...target(total), stock: total.base })),
        reason: `Inventario inicial desde Excel: ${sheet.fileName}`.slice(0, 200),
      }
    );
    inventory = {
      applied: result.applied,
      errors: result.errors.map(({ index, message }) => ({
        label: totals[index] ? targetLabel(totals[index]) : `Renglón ${index + 1}`,
        message,
      })),
    };
  }

  return {
    saved: totals.length,
    liters: totals.filter((total) => total.lineId).reduce((sum, total) => sum + total.base, 0),
    pieces: totals.filter((total) => !total.lineId).reduce((sum, total) => sum + total.base, 0),
    inventory,
    unknown,
    unlinked,
    invalid: sheet.invalid,
  };
}
