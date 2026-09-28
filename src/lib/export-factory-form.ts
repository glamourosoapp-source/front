import type { jsPDF } from "jspdf";
import type { FactoryForm, FactoryFormRow } from "@glamouroso/shared";
import { formatMoney, formatQuantity } from "@/lib/format-money";

/**
 * Formato de pedido a fábrica en PDF: la hoja de papel que Glamouroso usa hoy,
 * redibujada con jspdf (carta vertical, 4 hojas, bloques de columnas
 * `Producto | Cant | Impor | E`, secciones y pies con totales).
 *
 * Mismo enfoque que `export-pos-reports.ts`: el archivo se arma en el cliente;
 * el Back solo resuelve los datos (`GET .../form` → `FactoryForm`). El dibujo
 * (`drawFactoryForm`) va separado de la descarga para poder generarlo en Bun
 * sin navegador y revisarlo a ojo.
 *
 * Cuántos bloques lleva cada hoja y de qué ancho sale de `LAYOUTS`: las hojas
 * 1–3 llevan 4 bloques iguales; la hoja 4 lleva 3, el primero ancho con la
 * columna `Impor` grande. Los renglones sin cantidad se imprimen con `Cant` e
 * `Impor` vacíos: la hoja también sirve para llenarla a mano.
 */

const PAGE_W = 215.9;
const PAGE_H = 279.4;
const MARGIN = 6;
/** Encabezado compacto: marca, fecha y nombre en una sola línea. */
const HEADER_H = 9;
const BLOCK_GAP = 1.5;
const USABLE_W = PAGE_W - 2 * MARGIN;
/** Ancho de un bloque normal: 4 iguales a lo ancho de la hoja. */
const BLOCK_W = (USABLE_W - BLOCK_GAP * 3) / 4;
/** Alto máximo de renglón; con bloques largos se comprime para que quepa la hoja. */
const MAX_ROW_H = 4.8;
const HEADER_ROW_H = 4.6;
const CELL_PAD = 0.7;
const THIN = 0.2;
const THICK = 0.5;
const SHADE: [number, number, number] = [228, 228, 228];

const FONT_PRODUCT_MAX = 5.5;
const FONT_PRODUCT_MIN = 4;
const FONT_BLOCK_HEADER = 6;
const FONT_SECTION = 6.5;

interface ColumnWidths {
  product: number;
  qty: number;
  amount: number;
  check: number;
}

interface BlockLayout {
  /** Borde izquierdo del bloque, en mm. */
  x: number;
  cols: ColumnWidths;
}

interface PageLayout {
  blocks: BlockLayout[];
  /** Índice del bloque donde va el pie (totales). */
  footerBlock: number;
  /** Bloques, en orden, donde se acomodan los `extras` (sección OTROS). */
  extrasBlocks: number[];
}

function columns(product: number, qty: number, amount: number, check: number): ColumnWidths {
  return { product, qty, amount, check };
}

function blockWidth(cols: ColumnWidths): number {
  return cols.product + cols.qty + cols.amount + cols.check;
}

const NORMAL_COLS = columns(BLOCK_W - 6.5 - 9 - 3.5, 6.5, 9, 3.5);

/** Cuatro bloques iguales a lo ancho, pie en el último. */
const DEFAULT_LAYOUT: PageLayout = {
  blocks: [0, 1, 2, 3].map((index) => ({ x: MARGIN + index * (BLOCK_W + BLOCK_GAP), cols: NORMAL_COLS })),
  footerBlock: 3,
  extrasBlocks: [],
};

/**
 * Hoja 4: bloque 1 ancho con `Impor` grande y los bloques 2 y 3 normales a
 * continuación; como en el original, sobra hueco a la derecha.
 */
const PAGE4_WIDE_COLS = columns(34, 7, 20, 4);
const PAGE4_LAYOUT: PageLayout = {
  blocks: [
    { x: MARGIN, cols: PAGE4_WIDE_COLS },
    { x: MARGIN + blockWidth(PAGE4_WIDE_COLS) + BLOCK_GAP, cols: NORMAL_COLS },
    { x: MARGIN + blockWidth(PAGE4_WIDE_COLS) + BLOCK_W + 2 * BLOCK_GAP, cols: NORMAL_COLS },
  ],
  footerBlock: 2,
  extrasBlocks: [0, 2],
};

/** Layout por número de hoja; las que no aparecen usan el de 4 bloques. */
const LAYOUTS: Record<number, PageLayout> = { 4: PAGE4_LAYOUT };

/** Renglón del pie de un bloque (BID TRANSPARENT, Total=, TOTAL PEDIDO=…). */
interface FooterRow {
  label: string;
  qty?: string;
  amount?: string;
  shaded?: boolean;
  bold?: boolean;
}

/** Una hoja lista para dibujar: sus bloques, su layout y el pie que le toca. */
interface RenderPage {
  page: number;
  layout: PageLayout;
  blocks: FactoryFormRow[][];
  footer: FooterRow[];
}

/**
 * Variantes del mismo dibujo. El formato de stock mínimo usa la misma hoja
 * pero con `Mín` en vez de `Cant`, sin pies de totales (no hay importes) y
 * con un rótulo en el encabezado para no confundirlo con un pedido.
 */
export interface FactoryFormDrawOptions {
  /** Rótulo junto a la marca (p. ej. "STOCK MÍNIMO"). */
  title?: string;
  /** Encabezado de la columna de cantidad; `Cant` por omisión. */
  qtyHeader?: string;
  /** `false` omite los pies (BID TRANSPARENT, Total=, TOTAL PEDIDO=…). */
  footers?: boolean;
}

const DEFAULT_OPTIONS: Required<FactoryFormDrawOptions> = { title: "", qtyHeader: "Cant", footers: true };

const BLOCK_TOP = MARGIN + HEADER_H;
const ROWS_AREA_H = PAGE_H - MARGIN - BLOCK_TOP - HEADER_ROW_H;

function layoutFor(page: number, blockCount: number): PageLayout {
  const layout = LAYOUTS[page] ?? DEFAULT_LAYOUT;
  // Si el Back manda más bloques de los que el layout contempla, mejor dibujar
  // todo en el de 4 que perder renglones.
  return blockCount > layout.blocks.length ? DEFAULT_LAYOUT : layout;
}

function sectionRow(label: string, page: number, block: number): FactoryFormRow {
  return {
    page,
    block,
    row: 0,
    kind: "section",
    label,
    packSize: 1,
    packLabel: "pieza",
    qty: null,
    unitCost: null,
    amount: null,
  };
}

function footerFor(form: FactoryForm, page: number, total: number, footers: boolean): FooterRow[] {
  if (!footers) return [];
  if (page === 1) {
    const { transparent, color } = form.bidones;
    return [
      { label: "BID TRANSPARENT", qty: formatQty(transparent.qty) },
      { label: "", amount: formatMoney(transparent.amount) },
      { label: "BIDON COLOR", qty: formatQty(color.qty) },
      { label: "", amount: formatMoney(color.amount) },
      { label: "Total=", amount: formatMoney(total), bold: true },
    ];
  }
  if (page === 4) {
    // Publicidad y cajas azules: cantidad y precio los manda el Back (Excel de tiendas).
    const publicity = form.publicity;
    const blue = form.blueBoxes;
    return [
      {
        label: "Publicidad",
        bold: true,
        qty: publicity?.qty ? formatQty(publicity.qty) : undefined,
        amount: publicity?.amount ? formatMoney(publicity.amount) : undefined,
      },
      { label: "Flete", bold: true },
      { label: "CAJAS AZULES", shaded: true, qty: blue ? formatQty(blue.qty) : undefined },
      { label: "", shaded: true, amount: blue ? formatMoney(blue.amount) : undefined },
      { label: "TOTAL=", amount: formatMoney(total), shaded: true, bold: true },
      { label: "TOTAL PEDIDO=", amount: formatMoney(form.grandTotal), shaded: true, bold: true },
    ];
  }
  if (page === 2 || page === 3) {
    return [{ label: "Total=", amount: formatMoney(total), shaded: true, bold: true }];
  }
  return [];
}

/** Renglones que caben en un bloque con este alto de fila. */
function rowsThatFit(rowH: number): number {
  return Math.max(1, Math.floor(ROWS_AREA_H / rowH + 1e-6));
}

/** Alto de fila de una hoja: 4.8 mm, o menos si algún bloque (más su pie) no cabe. */
function rowHeightFor(page: RenderPage): number {
  const maxRows = Math.max(
    1,
    ...page.blocks.map((rows, index) => rows.length + (index === page.layout.footerBlock ? page.footer.length : 0))
  );
  return Math.min(MAX_ROW_H, ROWS_AREA_H / maxRows);
}

/** Renglones libres de un bloque, descontando el pie si le toca. */
function freeRows(page: RenderPage, blockIndex: number, rowH: number): number {
  const footer = blockIndex === page.layout.footerBlock ? page.footer.length : 0;
  return rowsThatFit(rowH) - footer - page.blocks[blockIndex].length;
}

/** Mete `OTROS` + los renglones que quepan en el bloque; devuelve lo que sobró. */
function fillBlock(page: RenderPage, blockIndex: number, pending: FactoryFormRow[], free: number): FactoryFormRow[] {
  // Un encabezado solo no sirve de nada: hace falta lugar para al menos un renglón.
  if (free < 2 || !pending.length) return pending;
  const block = page.blocks[blockIndex];
  block.push(sectionRow("OTROS", page.page, blockIndex + 1));
  block.push(...pending.slice(0, free - 1));
  return pending.slice(free - 1);
}

/**
 * Arma las hojas del formato y acomoda `extras` (sección OTROS) donde el layout
 * de la última hoja lo indica (hoja 4: bloque 1 y luego bloque 3, antes del
 * pie); lo que no quepa va a hojas nuevas con el mismo encabezado.
 */
function layoutPages(form: FactoryForm, footers: boolean): RenderPage[] {
  const pages: RenderPage[] = [...form.pages]
    .sort((a, b) => a.page - b.page)
    .map((page) => {
      const layout = layoutFor(page.page, page.blocks.length);
      const blocks = layout.blocks.map((_block, index) => [...(page.blocks[index] ?? [])]);
      return { page: page.page, layout, blocks, footer: footerFor(form, page.page, page.total, footers) };
    });

  let pending = form.extras.filter((row) => row.kind !== "blank" || row.label);
  if (!pending.length) return pages;

  const last = pages.find((page) => page.page === 4) ?? pages[pages.length - 1];
  if (last) {
    const rowH = rowHeightFor(last);
    for (const blockIndex of last.layout.extrasBlocks) {
      pending = fillBlock(last, blockIndex, pending, freeRows(last, blockIndex, rowH));
    }
  }

  let pageNumber = (last?.page ?? 0) + 1;
  while (pending.length) {
    const page: RenderPage = {
      page: pageNumber,
      layout: DEFAULT_LAYOUT,
      blocks: DEFAULT_LAYOUT.blocks.map(() => []),
      footer: [],
    };
    for (let blockIndex = 0; blockIndex < page.blocks.length && pending.length; blockIndex += 1) {
      pending = fillBlock(page, blockIndex, pending, rowsThatFit(MAX_ROW_H));
    }
    pages.push(page);
    pageNumber += 1;
  }
  return pages;
}

function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return formatQuantity(value);
}

/** `YYYY-MM-DD` → `DD/MM/YYYY` sin pasar por `Date` (correría el día por timezone). */
function formatFormDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return value ?? "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Encoge la fuente hasta que el texto quepa en una línea; si ni al mínimo cabe, recorta. */
function fitText(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number
): { text: string; size: number } {
  let size = maxSize;
  doc.setFontSize(size);
  while (doc.getTextWidth(text) > maxWidth && size > minSize) {
    size = Math.max(minSize, size - 0.25);
    doc.setFontSize(size);
  }
  let fitted = text;
  while (fitted.length > 1 && doc.getTextWidth(fitted) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return { text: fitted, size };
}

function drawHeader(doc: jsPDF, form: FactoryForm, title: string): void {
  const baseline = MARGIN + 5.5;
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("GlamourOso", MARGIN, baseline);
  const brandWidth = doc.getTextWidth("GlamourOso");

  doc.setFontSize(8);
  let x = MARGIN + brandWidth + 8;
  if (title) {
    doc.text(title, x, baseline);
    x += doc.getTextWidth(title) + 8;
  }
  doc.text("FECHA:", x, baseline);
  x += doc.getTextWidth("FECHA:") + 1.5;
  doc.setFont("helvetica", "normal");
  const date = formatFormDate(form.date);
  doc.text(date, x, baseline);
  x += doc.getTextWidth(date) + 8;
  doc.setFont("helvetica", "bold");
  doc.text("NOMBRE", x, baseline);
  x += doc.getTextWidth("NOMBRE") + 1.5;
  doc.setFont("helvetica", "normal");
  const name = form.code ? `${form.name} (${form.code})` : form.name;
  const fitted = fitText(doc, name, PAGE_W - MARGIN - x, 8, 6);
  doc.text(fitted.text, x, baseline);
}

function drawBlockHeader(doc: jsPDF, x: number, y: number, cols: ColumnWidths, qtyHeader: string): void {
  doc.setLineWidth(THIN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_BLOCK_HEADER);
  const cells: Array<[string, number, "left" | "center"]> = [
    ["Producto", cols.product, "left"],
    [qtyHeader, cols.qty, "center"],
    ["Impor", cols.amount, "center"],
    ["E", cols.check, "center"],
  ];
  let cx = x;
  for (const [label, width, align] of cells) {
    doc.rect(cx, y, width, HEADER_ROW_H);
    const tx = align === "left" ? cx + CELL_PAD : cx + width / 2;
    doc.text(label, tx, y + HEADER_ROW_H / 2, { align, baseline: "middle" });
    cx += width;
  }
}

function drawCells(doc: jsPDF, x: number, y: number, rowH: number, cols: ColumnWidths, shaded = false): void {
  doc.setLineWidth(THIN);
  let cx = x;
  for (const width of [cols.product, cols.qty, cols.amount, cols.check]) {
    if (shaded) {
      doc.setFillColor(...SHADE);
      doc.rect(cx, y, width, rowH, "FD");
    } else {
      doc.rect(cx, y, width, rowH);
    }
    cx += width;
  }
}

/** Cant centrada e Impor a la derecha, en sus columnas. */
function drawQtyAndAmount(
  doc: jsPDF,
  x: number,
  middle: number,
  cols: ColumnWidths,
  qty: string,
  amount: string
): void {
  doc.setFontSize(FONT_PRODUCT_MAX);
  if (qty) doc.text(qty, x + cols.product + cols.qty / 2, middle, { align: "center", baseline: "middle" });
  if (amount) {
    const fitted = fitText(doc, amount, cols.amount - 2 * CELL_PAD, FONT_PRODUCT_MAX, FONT_PRODUCT_MIN);
    doc.text(fitted.text, x + cols.product + cols.qty + cols.amount - CELL_PAD, middle, {
      align: "right",
      baseline: "middle",
    });
  }
}

function drawProductRow(doc: jsPDF, row: FactoryFormRow, x: number, y: number, rowH: number, cols: ColumnWidths): void {
  drawCells(doc, x, y, rowH, cols);
  const middle = y + rowH / 2;
  doc.setFont("helvetica", "normal");
  const label = fitText(doc, row.label, cols.product - 2 * CELL_PAD, FONT_PRODUCT_MAX, FONT_PRODUCT_MIN);
  if (label.text) doc.text(label.text, x + CELL_PAD, middle, { baseline: "middle" });
  const amount = row.amount != null && Number.isFinite(row.amount) ? formatMoney(row.amount) : "";
  drawQtyAndAmount(doc, x, middle, cols, formatQty(row.qty), amount);
}

function drawSectionRow(doc: jsPDF, row: FactoryFormRow, x: number, y: number, rowH: number, cols: ColumnWidths): void {
  const width = blockWidth(cols);
  doc.setLineWidth(THICK);
  doc.rect(x, y, width, rowH);
  doc.setLineWidth(THIN);
  doc.setFont("helvetica", "bold");
  const label = fitText(doc, row.label.toUpperCase(), width - 2 * CELL_PAD, FONT_SECTION, FONT_PRODUCT_MIN);
  doc.text(label.text, x + width / 2, y + rowH / 2, { align: "center", baseline: "middle" });
}

/** El pie va sin bordes de celda, como en el original; lo sombreado se rellena sin trazo. */
function drawFooterRow(doc: jsPDF, row: FooterRow, x: number, y: number, rowH: number, cols: ColumnWidths): void {
  if (row.shaded) {
    doc.setFillColor(...SHADE);
    doc.rect(x, y, blockWidth(cols), rowH, "F");
  }
  const middle = y + rowH / 2;
  doc.setFont("helvetica", row.bold ? "bold" : "normal");
  const label = fitText(doc, row.label, cols.product - 2 * CELL_PAD, FONT_SECTION, FONT_PRODUCT_MIN);
  if (label.text) doc.text(label.text, x + CELL_PAD, middle, { baseline: "middle" });
  // Sin celdas, el importe puede usar Cant + Impor: así el total se lee sin lupa.
  doc.setFontSize(FONT_SECTION);
  if (row.qty) doc.text(row.qty, x + cols.product + cols.qty / 2, middle, { align: "center", baseline: "middle" });
  if (row.amount) {
    const amount = fitText(doc, row.amount, cols.qty + cols.amount - 2 * CELL_PAD, FONT_SECTION, FONT_PRODUCT_MIN);
    doc.text(amount.text, x + cols.product + cols.qty + cols.amount - CELL_PAD, middle, { align: "right", baseline: "middle" });
  }
}

function drawPage(
  doc: jsPDF,
  form: FactoryForm,
  page: RenderPage,
  pageIndex: number,
  pageCount: number,
  options: Required<FactoryFormDrawOptions>
): void {
  drawHeader(doc, form, options.title);
  const rowH = rowHeightFor(page);

  page.blocks.forEach((rows, blockIndex) => {
    const { x, cols } = page.layout.blocks[blockIndex];
    drawBlockHeader(doc, x, BLOCK_TOP, cols, options.qtyHeader);

    let y = BLOCK_TOP + HEADER_ROW_H;
    for (const row of rows) {
      if (row.kind === "section") drawSectionRow(doc, row, x, y, rowH, cols);
      else if (row.kind === "blank") drawCells(doc, x, y, rowH, cols);
      else drawProductRow(doc, row, x, y, rowH, cols);
      y += rowH;
    }

    // El pie va pegado al fondo de su bloque; `rowHeightFor` ya garantiza que
    // no se encime con los renglones.
    if (blockIndex === page.layout.footerBlock && page.footer.length) {
      const top = PAGE_H - MARGIN - page.footer.length * rowH;
      let fy = top;
      for (const row of page.footer) {
        drawFooterRow(doc, row, x, fy, rowH, cols);
        fy += rowH;
      }
      // Recuadro alrededor del tramo sombreado (CAJAS AZULES … TOTAL PEDIDO=).
      const first = page.footer.findIndex((row) => row.shaded);
      if (first >= 0) {
        const count = page.footer.filter((row) => row.shaded).length;
        doc.setLineWidth(THICK);
        doc.rect(x, top + first * rowH, blockWidth(cols), count * rowH);
        doc.setLineWidth(THIN);
      }
    }
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.text(`Hoja ${pageIndex + 1}/${pageCount}`, PAGE_W - MARGIN, PAGE_H - 2, { align: "right" });
}

/** Dibuja el formato completo en `doc` (carta vertical, en mm). */
export function drawFactoryForm(doc: jsPDF, form: FactoryForm, options: FactoryFormDrawOptions = {}): void {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const pages = layoutPages(form, resolved.footers);
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage("letter", "portrait");
    drawPage(doc, form, page, index, pages.length, resolved);
  });
  // Hoja de llenado (la "Hoja3" del Excel de tiendas): solo en pedidos y entradas.
  if (resolved.footers) drawBidonSheet(doc, form);
}

/**
 * Resumen de bidones de 20 L: cada renglón que viaja en bidón, en el orden del
 * formato, con su cantidad, y el total de bidones transparentes y de color.
 * Es la hoja que usa quien llena los bidones.
 */
function drawBidonSheet(doc: jsPDF, form: FactoryForm): void {
  const rows = form.pages
    .flatMap((page) => page.blocks.flat())
    .filter((row) => row.kind === "product" && row.bidon);
  if (!rows.length) return;
  doc.addPage("letter", "portrait");
  drawHeader(doc, form, "BIDONES");
  const columns = 3;
  const perColumn = Math.ceil(rows.length / columns);
  const gap = 4;
  const colW = (USABLE_W - gap * (columns - 1)) / columns;
  const rowH = Math.min(MAX_ROW_H, (PAGE_H - BLOCK_TOP - 30) / (perColumn + 1));
  const cols = { product: colW - 14, qty: 14 };
  for (let c = 0; c < columns; c += 1) {
    const x = MARGIN + c * (colW + gap);
    let y = BLOCK_TOP;
    doc.setLineWidth(THIN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_BLOCK_HEADER);
    doc.rect(x, y, cols.product, HEADER_ROW_H);
    doc.rect(x + cols.product, y, cols.qty, HEADER_ROW_H);
    doc.text("Producto", x + CELL_PAD, y + HEADER_ROW_H / 2, { baseline: "middle" });
    doc.text("Bidones", x + cols.product + cols.qty / 2, y + HEADER_ROW_H / 2, { align: "center", baseline: "middle" });
    y += HEADER_ROW_H;
    for (const row of rows.slice(c * perColumn, (c + 1) * perColumn)) {
      if (row.bidon === "color") {
        doc.setFillColor(...SHADE);
        doc.rect(x, y, cols.product + cols.qty, rowH, "F");
      }
      doc.rect(x, y, cols.product, rowH);
      doc.rect(x + cols.product, y, cols.qty, rowH);
      doc.setFont("helvetica", row.bidon === "color" ? "bold" : "normal");
      const label = fitText(doc, row.label + (row.bidon === "color" ? " (color)" : ""), cols.product - 2 * CELL_PAD, FONT_PRODUCT_MAX + 1, FONT_PRODUCT_MIN);
      doc.text(label.text, x + CELL_PAD, y + rowH / 2, { baseline: "middle" });
      const qty = formatQty(row.qty && row.qty > 0 ? row.qty : null);
      if (qty) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(FONT_PRODUCT_MAX + 1);
        doc.text(qty, x + cols.product + cols.qty / 2, y + rowH / 2, { align: "center", baseline: "middle" });
      }
      y += rowH;
    }
  }
  const { transparent, color } = form.bidones;
  const y = PAGE_H - MARGIN - 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`BID TRANSPARENTE: ${formatQty(transparent.qty) || "0"}`, MARGIN, y);
  doc.text(`BIDON COLOR: ${formatQty(color.qty) || "0"}`, MARGIN, y + 6);
  doc.text(`BIDONES: ${formatQty(transparent.qty + color.qty) || "0"}`, MARGIN, y + 12);
}

/** Opciones con las que se imprime el formato de stock mínimo. */
export const MIN_STOCK_FORM_OPTIONS: FactoryFormDrawOptions = {
  title: "STOCK MÍNIMO",
  qtyHeader: "Mín",
  footers: false,
};

/** Opciones de la hoja de entrada de surtido (lo que llegó a la sucursal). */
export const RESTOCK_ENTRY_FORM_OPTIONS: FactoryFormDrawOptions = {
  title: "ENTRADA DE SURTIDO",
  qtyHeader: "Cant",
  footers: false,
};

function fileSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function factoryFormFileName(form: FactoryForm): string {
  const who = fileSlug(form.code || form.name || "sucursal") || "sucursal";
  const prefix =
    form.source.kind === "min_stock"
      ? "stock-minimo"
      : form.source.kind === "entry"
        ? "entrada-surtido"
        : "pedido-fabrica";
  return `${prefix}-${who}-${form.date}.pdf`;
}

/** Genera y descarga el formato de pedido a fábrica (o el de stock mínimo, según `options`). */
export async function exportFactoryFormPdf(form: FactoryForm, options?: FactoryFormDrawOptions): Promise<void> {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const fallback =
    form.source.kind === "min_stock"
      ? MIN_STOCK_FORM_OPTIONS
      : form.source.kind === "entry"
        ? RESTOCK_ENTRY_FORM_OPTIONS
        : {};
  drawFactoryForm(doc, form, options ?? fallback);
  doc.save(factoryFormFileName(form));
}
