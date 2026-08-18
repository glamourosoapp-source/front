import type { ProductImportRow } from "@glamouroso/shared/schemas/product";

export interface ParsedProductImportFile {
  rows: ProductImportRow[];
  /** Filas con datos parciales (sin ID o sin nombre) que se descartaron. */
  skippedRows: number;
  /** Headers requeridos que no se encontraron; si trae algo, no llamar al Back. */
  missingColumns: string[];
}

const REQUIRED_COLUMNS = ["Descripcion", "Precio Venta"];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Parsea el Excel del punto de venta (.xls/.xlsx) mapeando columnas por nombre de
 * header (tolerante a acentos/mayúsculas), no por posición. El ID del POS es la
 * columna "id"/"clave" o, como en el export real, la primera columna sin header.
 */
export async function parseProductImportFile(file: File): Promise<ParsedProductImportFile> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], skippedRows: 0, missingColumns: REQUIRED_COLUMNS };

  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" });
  if (!grid.length) return { rows: [], skippedRows: 0, missingColumns: REQUIRED_COLUMNS };

  const headers = (grid[0] ?? []).map(normalizeHeader);
  const col = (...names: string[]) => {
    for (const name of names) {
      const index = headers.indexOf(name);
      if (index !== -1) return index;
    }
    return -1;
  };

  const idCol = col("id", "clave");
  const columns = {
    posId: idCol !== -1 ? idCol : 0,
    name: col("descripcion"),
    price: col("precio venta"),
    wholesalePrice: col("precio mayoreo"),
    cost: col("costo"),
    stock: col("inventario"),
    minStock: col("inv. minimo", "inv minimo"),
    department: col("departamento"),
  };

  const missingColumns: string[] = [];
  if (columns.name === -1) missingColumns.push("Descripcion");
  if (columns.price === -1) missingColumns.push("Precio Venta");
  if (missingColumns.length) return { rows: [], skippedRows: 0, missingColumns };

  const rows: ProductImportRow[] = [];
  let skippedRows = 0;
  for (const cells of grid.slice(1)) {
    const posId = String(cells[columns.posId] ?? "").trim();
    const name = String(cells[columns.name] ?? "").trim();
    if (!posId && !name) continue; // fila totalmente vacía
    if (!posId || name.length < 2) {
      skippedRows += 1;
      continue;
    }
    const numberAt = (index: number) => (index === -1 ? null : parseNumber(cells[index]));
    rows.push({
      posId: posId.slice(0, 60),
      name: name.slice(0, 140),
      price: numberAt(columns.price) ?? 0,
      wholesalePrice: numberAt(columns.wholesalePrice) ?? 0,
      cost: numberAt(columns.cost),
      stock: numberAt(columns.stock),
      minStock: numberAt(columns.minStock),
      department: columns.department === -1 ? "" : String(cells[columns.department] ?? "").trim().slice(0, 60),
    });
  }

  return { rows, skippedRows, missingColumns: [] };
}
