/**
 * Excel de stock de una sucursal: la misma hoja de pedido a tiendas
 * ("FORMATO PEDIDO ROSA STOCK.xlsx") con la columna Cant llena con lo que la
 * sucursal debe tener siempre, en empaques (2 = dos bidones).
 *
 * Funciones puras sobre la cuadrícula de celdas (lo que da `sheet_to_json` con
 * `header: 1`), sin depender de la librería de Excel: el Front lee el archivo y
 * aquí se interpreta y se empata con los renglones del formato.
 */

/** Un renglón del Excel con cantidad. */
export interface StockSheetEntry {
  /** Hoja del formato (1..4): la n-ésima fila de encabezados "Producto / Cant". */
  page: number;
  label: string;
  /** Empaques, como se escriben en el papel. */
  qty: number;
  /** Celda de la cantidad ("B3"), para decirle al usuario dónde mirar. */
  cell: string;
}

export interface StockSheetRead {
  entries: StockSheetEntry[];
  /** Cantidades que no son número (texto, negativos): no se cargan. */
  invalid: Array<{ page: number; label: string; cell: string; value: string }>;
  /** Hojas del formato encontradas. */
  pages: number;
}

/** Pies de hoja del formato: traen número en Cant pero no son producto. */
const FOOTER_LABELS = new Set([
  "BID TRANSPARENTE",
  "BIDON TRANSPARENTE",
  "BIDON COLOR",
  "PUBLICIDAD",
  "FLETE",
  "CAJAS AZULES",
  "TOTAL",
  "TOTAL PEDIDO",
]);

/** "  C.  SANITARIO  gde " → "C. SANITARIO GDE": sin acentos, mayúsculas y un solo espacio. */
export function normalizeSheetLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function isFooter(label: string): boolean {
  return FOOTER_LABELS.has(label.replace(/[=:]+$/, "").trim());
}

/**
 * Lee la cuadrícula del Excel. Cada hoja empieza con una fila de encabezados
 * con uno o más "Producto" y su "Cant" a la derecha; la columna de Producto
 * puede venir combinada (la hoja 4 lo trae en A:B y G:I), así que la Cant de
 * cada bloque es el primer "Cant" después de su "Producto".
 */
export function readStockSheet(grid: unknown[][]): StockSheetRead {
  const entries: StockSheetEntry[] = [];
  const invalid: StockSheetRead["invalid"] = [];
  let page = 0;
  let blocks: Array<{ labelCol: number; qtyCol: number }> = [];

  for (const [r, raw] of grid.entries()) {
    const row = Array.isArray(raw) ? raw : [];
    const texts = row.map((value) => normalizeSheetLabel(cellText(value)));

    const productCols = texts.flatMap((text, col) => (text === "PRODUCTO" ? [col] : []));
    if (productCols.length) {
      page += 1;
      blocks = productCols.flatMap((labelCol, i) => {
        const end = productCols[i + 1] ?? texts.length;
        const qtyCol = texts.findIndex((text, col) => col > labelCol && col < end && text === "CANT");
        return qtyCol === -1 ? [] : [{ labelCol, qtyCol }];
      });
      continue;
    }
    if (!page) continue;

    for (const { labelCol, qtyCol } of blocks) {
      const label = cellText(row[labelCol]);
      const value = row[qtyCol];
      if (!label || value == null || cellText(value) === "") continue;
      const normalized = normalizeSheetLabel(label);
      if (isFooter(normalized)) continue;
      const cell = `${columnLetter(qtyCol)}${r + 1}`;
      const qty = typeof value === "number" ? value : Number(cellText(value).replace(",", "."));
      if (!Number.isFinite(qty) || qty < 0) {
        invalid.push({ page, label, cell, value: cellText(value) });
        continue;
      }
      if (qty === 0) continue;
      entries.push({ page, label, qty, cell });
    }
  }

  return { entries, invalid, pages: page };
}

/** Lo mínimo que se necesita de un renglón del formato para empatarlo. */
export interface StockSheetFormRow {
  page: number;
  label: string;
  kind: string;
}

export interface StockSheetMatch<R extends StockSheetFormRow> {
  /** Renglón del Excel → renglón del formato. */
  matched: Array<{ entry: StockSheetEntry; row: R }>;
  /** Etiquetas del Excel que no están en el formato. */
  unknown: StockSheetEntry[];
}

/**
 * Empata cada renglón del Excel con un renglón de producto del formato por su
 * etiqueta (normalizada). Primero en la misma hoja y luego en cualquiera, y
 * cada renglón del formato se usa una sola vez: dos renglones iguales del
 * Excel van a los dos renglones iguales del formato, en orden.
 */
export function matchStockSheet<R extends StockSheetFormRow>(
  entries: StockSheetEntry[],
  rows: R[]
): StockSheetMatch<R> {
  const byLabel = new Map<string, R[]>();
  for (const row of rows) {
    if (row.kind !== "product") continue;
    const key = normalizeSheetLabel(row.label);
    byLabel.set(key, [...(byLabel.get(key) ?? []), row]);
  }
  const used = new Set<R>();
  const matched: StockSheetMatch<R>["matched"] = [];
  const unknown: StockSheetEntry[] = [];

  for (const entry of entries) {
    const candidates = (byLabel.get(normalizeSheetLabel(entry.label)) ?? []).filter((row) => !used.has(row));
    const row = candidates.find((candidate) => candidate.page === entry.page) ?? candidates[0];
    if (!row) {
      unknown.push(entry);
      continue;
    }
    used.add(row);
    matched.push({ entry, row });
  }

  return { matched, unknown };
}
