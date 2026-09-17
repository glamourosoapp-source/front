import type { PosSale, PosSaleItem } from "@/types";
import type { TicketEmphasis, TicketSettings } from "@glamouroso/shared";
import { ticketFooterLines, ticketHeaderBlock } from "@glamouroso/shared";

/**
 * Ticket térmico en comandos ESC/POS.
 *
 * Se genera en el navegador y se manda al agente local, que lo escribe en RAW a
 * la impresora USB de la sucursal. Así el ticket sale sin diálogo, como en
 * eleventa, en vez de pasar por la hoja de impresión del navegador.
 *
 * Todo lo que se imprime sale de `TicketSettings` (datos de facturación,
 * tipografía y qué bloques se muestran), ya resuelto por el servidor: default de
 * la organización + override de la sucursal.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Columnas por ancho de papel: fuente A (12x24) y fuente B (9x17), más angosta. */
const COLUMNS: Record<number, { a: number; b: number }> = {
  58: { a: 32, b: 42 },
  80: { a: 48, b: 64 },
};

/** Separación entre renglones en puntos (`ESC 3 n`). */
const LINE_SPACING_DOTS = { tight: 24, normal: 30, loose: 42 } as const;

/** `GS ! n`: bits altos ancho, bits bajos alto. 0x01 doble alto, 0x11 doble todo. */
const EMPHASIS_BYTES: Record<TicketEmphasis, number> = {
  normal: 0x00,
  large: 0x01,
  xlarge: 0x11,
};

class EscPosBuilder {
  private bytes: number[] = [];
  /**
   * Lo que se va a leer en el papel, renglón por renglón.
   *
   * No se puede sacar de `bytes`: los parámetros de los comandos son bytes
   * imprimibles (`ESC t 2` deja un "t" y un "2" sueltos), así que la vista
   * previa saldría con basura. Se anota aparte, al escribir cada renglón.
   */
  private transcript: string[] = [];
  readonly columns: number;
  /** Tamaño del cuerpo: al que se vuelve tras una línea destacada. */
  private readonly baseSize: number;

  constructor(private readonly settings: TicketSettings) {
    const widths = COLUMNS[settings.paperWidthMm] ?? COLUMNS[80];
    const smallFont = settings.fontSize === "small";
    this.columns = smallFont ? widths.b : widths.a;
    this.baseSize = settings.fontSize === "large" ? 0x01 : 0x00;
  }

  raw(...values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  /** Bloque ya armado (el logo rasterizado): se copia byte a byte, sin spread. */
  rawBytes(values: Uint8Array): this {
    for (const value of values) this.bytes.push(value);
    return this;
  }

  /**
   * CP850 es la tabla que traen casi todas las térmicas económicas; sin esto los
   * acentos y la ñ salen como basura. Los caracteres fuera de la tabla se
   * transliteran a su versión sin acento antes de codificar.
   */
  text(value: string): this {
    const normalized = EscPosBuilder.plain(value);
    for (let i = 0; i < normalized.length; i += 1) {
      this.bytes.push(normalized.charCodeAt(i) & 0xff);
    }
    return this;
  }

  static plain(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      // La apertura de exclamación y de interrogación no existe en ASCII y salía
      // impresa como "?": mejor quitarla, "Gracias!" se lee bien y "?Gracias!" no.
      .replace(/[¡¿]/g, "")
      .replace(/[^\x20-\x7E]/g, "?");
  }

  line(value = ""): this {
    this.transcript.push(EscPosBuilder.plain(value));
    return this.text(value).raw(0x0a);
  }

  init(): this {
    // Reset + tabla de caracteres PC850 (multilingüe latino) + fuente y
    // separación de renglones elegidas en la configuración.
    this.raw(ESC, 0x40).raw(ESC, 0x74, 0x02);
    this.raw(ESC, 0x4d, this.settings.fontSize === "small" ? 0x01 : 0x00);
    this.raw(ESC, 0x33, LINE_SPACING_DOTS[this.settings.lineSpacing]);
    return this.size("normal");
  }

  align(mode: "left" | "center" | "right"): this {
    const value = mode === "center" ? 1 : mode === "right" ? 2 : 0;
    return this.raw(ESC, 0x61, value);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Tamaño de una línea destacada; "normal" vuelve al tamaño del cuerpo. */
  size(mode: TicketEmphasis): this {
    const value = mode === "normal" ? this.baseSize : EMPHASIS_BYTES[mode];
    return this.raw(GS, 0x21, value);
  }

  separator(): this {
    return this.line(this.settings.separatorChar.repeat(this.columns));
  }

  /** Etiqueta a la izquierda e importe a la derecha, rellenando con espacios. */
  row(left: string, right: string): this {
    const room = this.columns - right.length;
    const label = left.length > room ? `${left.slice(0, Math.max(0, room - 1))} ` : left;
    return this.line(`${label.padEnd(Math.max(0, room))}${right}`);
  }

  /**
   * Código de barras del folio (CODE39, función A).
   *
   * CODE39 solo admite mayúsculas, dígitos y `- . $ / + %`: el folio
   * (`SUC01-20260912-0007`) entra tal cual, y cualquier otro carácter se
   * descarta para no mandar a la impresora un código que no puede dibujar.
   */
  barcode(value: string): this {
    const data = EscPosBuilder.plain(value)
      .toUpperCase()
      .replace(/[^0-9A-Z\-. $/+%]/g, "");
    if (!data) return this;
    this.raw(GS, 0x68, 60); // alto en puntos
    this.raw(GS, 0x77, this.settings.paperWidthMm === 58 ? 0x02 : 0x03); // ancho de módulo
    this.raw(GS, 0x48, 0x02); // texto legible debajo
    this.raw(GS, 0x6b, 0x04); // m = 4: CODE39, terminado en NUL
    this.text(data).raw(0x00);
    this.transcript.push(data);
    return this;
  }

  /** Avance configurado y corte (si la impresora de la sucursal lo tiene). */
  feedAndCut(): this {
    for (let i = 0; i < this.settings.feedLines; i += 1) this.raw(0x0a);
    if (this.settings.cutPaper) this.raw(GS, 0x56, 0x42, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  /** El ticket como texto, con las columnas reales del rollo. */
  preview(): string {
    return this.transcript.join("\n");
  }
}

function money(value: string | number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function quantity(value: string | number): string {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/** Desglose del granel: "1 bidon x $178.00 + 5 L x $16.00". */
function breakdownLine(item: PosSaleItem): string | null {
  const breakdown = item.pricingBreakdown as
    | { bidones?: number; restLiters?: number; bidonPrice?: number; literPrice?: number }
    | null
    | undefined;
  if (!breakdown) return null;
  const parts: string[] = [];
  if (Number(breakdown.bidones) > 0) {
    parts.push(`${breakdown.bidones} bidon x ${money(breakdown.bidonPrice)}`);
  }
  if (Number(breakdown.restLiters) > 0) {
    parts.push(`${quantity(Number(breakdown.restLiters))} L x ${money(breakdown.literPrice)}`);
  }
  return parts.length ? `  ${parts.join(" + ")}` : null;
}

export interface BuildTicketOptions {
  reprint?: boolean;
  /** Nombre a imprimir cuando la venta no tiene cliente (configurable). */
  walkInCustomerName?: string;
  /** Logo ya rasterizado en comandos ESC/POS (ver `logo-raster.ts`). */
  logo?: Uint8Array | null;
}

/** Un ejemplar del ticket; `copyLabel` marca las copias para la sucursal. */
function appendTicket(
  builder: EscPosBuilder,
  sale: PosSale,
  settings: TicketSettings,
  options: BuildTicketOptions,
  copyLabel: string | null
): void {
  const items = sale.items ?? [];
  const header = ticketHeaderBlock(settings, sale.branch ?? null);

  builder.init().align("center");
  if (settings.logoPosition === "header" && options.logo?.length) builder.rawBytes(options.logo);

  builder.bold(true).size(settings.headerSize);
  builder.line(header.title);
  builder.size("normal").bold(false);
  for (const headerLine of header.lines) builder.line(headerLine);
  builder.separator();

  builder.align("left");
  builder.line(`Ticket: ${sale.ticketNumber}`);
  builder.line(
    `Fecha: ${new Date(sale.soldAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`
  );
  if (settings.showCashier && sale.cashier?.name) builder.line(`Le atiende: ${sale.cashier.name}`);
  if (settings.showCustomer) {
    builder.line(`Cliente: ${sale.customer?.name || options.walkInCustomerName || "Mostrador"}`);
  }
  if (options.reprint) builder.line("** REIMPRESION **");
  if (copyLabel) builder.line(copyLabel);
  builder.separator();

  for (const item of items) {
    const code = settings.showItemCodes && item.sku ? `${item.sku} ` : "";
    builder.line(`${code}${item.productName}`);
    const detail = `${quantity(item.quantity)}${item.saleUnit === "liter" ? " L" : ""} x ${money(item.unitPrice)}`;
    builder.row(`  ${detail}`, money(item.total));
    if (settings.showBreakdown) {
      const breakdown = breakdownLine(item);
      if (breakdown) builder.line(breakdown);
    }
  }

  builder.separator();
  if (Number(sale.discount) > 0) {
    builder.row("Subtotal", money(sale.subtotal));
    builder.row("Descuento", `-${money(sale.discount)}`);
  }

  builder.bold(true).size(settings.totalSize);
  builder.row("TOTAL", money(sale.total));
  builder.size("normal").bold(false);
  if (settings.showPaymentDetail) {
    builder.row("Pago con", money(sale.amountTendered));
    builder.row("Cambio", money(sale.changeAmount));
  }
  builder.separator();

  builder.align("center");
  if (settings.logoPosition === "footer" && options.logo?.length) builder.rawBytes(options.logo);
  for (const footerLine of ticketFooterLines(settings)) builder.line(footerLine);
  if (settings.showFolioBarcode) builder.line().barcode(sale.ticketNumber);
  builder.feedAndCut();
}

export function buildTicketEscPos(
  sale: PosSale,
  settings: TicketSettings,
  options: BuildTicketOptions = {}
): Uint8Array {
  const builder = new EscPosBuilder(settings);
  // Cada copia se imprime completa y con su propio corte: la primera es del
  // cliente y las siguientes quedan marcadas como copia de la sucursal.
  for (let copy = 0; copy < settings.copies; copy += 1) {
    appendTicket(builder, sale, settings, options, copy === 0 ? null : "** COPIA **");
  }
  return builder.build();
}

/**
 * Vista previa en texto del mismo ticket, para la pantalla de configuración.
 *
 * Solo muestra el primer ejemplar: las copias son idénticas salvo la marca.
 */
export function ticketPreviewText(sale: PosSale, settings: TicketSettings): string {
  const builder = new EscPosBuilder(settings);
  appendTicket(builder, sale, settings, {}, null);
  return builder.preview();
}

/** Columnas que caben con la configuración actual (para dibujar la vista previa). */
export function ticketColumns(settings: TicketSettings): number {
  const widths = COLUMNS[settings.paperWidthMm] ?? COLUMNS[80];
  return settings.fontSize === "small" ? widths.b : widths.a;
}
