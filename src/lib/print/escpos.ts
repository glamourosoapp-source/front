import type { PosSale, PosSaleItem } from "@/types";
import type { TicketSettings } from "@glamouroso/shared";

/**
 * Ticket térmico en comandos ESC/POS.
 *
 * Se genera en el navegador y se manda al agente local, que lo escribe en RAW a
 * la impresora USB de la sucursal. Así el ticket sale sin diálogo, como en
 * eleventa, en vez de pasar por la hoja de impresión del navegador.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Columnas por ancho de papel en fuente A (12x24). */
const COLUMNS: Record<number, number> = { 58: 32, 80: 48 };

class EscPosBuilder {
  private bytes: number[] = [];
  readonly columns: number;

  constructor(paperWidthMm: number) {
    this.columns = COLUMNS[paperWidthMm] ?? 48;
  }

  raw(...values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  /**
   * CP850 es la tabla que traen casi todas las térmicas económicas; sin esto los
   * acentos y la ñ salen como basura. Los caracteres fuera de la tabla se
   * transliteran a su versión sin acento antes de codificar.
   */
  text(value: string): this {
    const normalized = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "?");
    for (let i = 0; i < normalized.length; i += 1) {
      this.bytes.push(normalized.charCodeAt(i) & 0xff);
    }
    return this;
  }

  line(value = ""): this {
    return this.text(value).raw(0x0a);
  }

  init(): this {
    // Reset + tabla de caracteres PC850 (multilingüe latino).
    return this.raw(ESC, 0x40).raw(ESC, 0x74, 0x02);
  }

  align(mode: "left" | "center" | "right"): this {
    const value = mode === "center" ? 1 : mode === "right" ? 2 : 0;
    return this.raw(ESC, 0x61, value);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Doble alto y ancho: solo para el total, que el cliente debe poder leer. */
  double(on: boolean): this {
    return this.raw(GS, 0x21, on ? 0x11 : 0x00);
  }

  separator(char = "-"): this {
    return this.line(char.repeat(this.columns));
  }

  /** Etiqueta a la izquierda e importe a la derecha, rellenando con espacios. */
  row(left: string, right: string): this {
    const room = this.columns - right.length;
    const label = left.length > room ? `${left.slice(0, Math.max(0, room - 1))} ` : left;
    return this.line(`${label.padEnd(Math.max(0, room))}${right}`);
  }

  feedAndCut(): this {
    return this.raw(0x0a, 0x0a, 0x0a).raw(GS, 0x56, 0x42, 0x00);
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

function money(value: string | number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function quantity(value: string | number): string {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function itemLabel(item: PosSaleItem): string {
  return item.saleUnit === "liter" ? `${item.productName}` : item.productName;
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

export function buildTicketEscPos(
  sale: PosSale,
  settings: TicketSettings,
  options: { reprint?: boolean } = {}
): Uint8Array {
  const builder = new EscPosBuilder(settings.paperWidthMm);
  const items = sale.items ?? [];

  builder.init().align("center").bold(true);
  builder.line(sale.branch?.name || "GLAMOUROSO");
  builder.bold(false);
  for (const headerLine of settings.headerLines) builder.line(headerLine);
  builder.separator();

  builder.align("left");
  builder.line(`Ticket: ${sale.ticketNumber}`);
  builder.line(
    `Fecha: ${new Date(sale.soldAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`
  );
  if (sale.cashier?.name) builder.line(`Le atiende: ${sale.cashier.name}`);
  builder.line(`Cliente: ${sale.customer?.name || "Mostrador"}`);
  if (options.reprint) builder.line("** REIMPRESION **");
  builder.separator();

  for (const item of items) {
    builder.line(itemLabel(item));
    const detail = `${quantity(item.quantity)}${item.saleUnit === "liter" ? " L" : ""} x ${money(item.unitPrice)}`;
    builder.row(`  ${detail}`, money(item.total));
    const breakdown = breakdownLine(item);
    if (breakdown) builder.line(breakdown);
  }

  builder.separator();
  if (Number(sale.discount) > 0) {
    builder.row("Subtotal", money(sale.subtotal));
    builder.row("Descuento", `-${money(sale.discount)}`);
  }

  builder.bold(true).double(true);
  builder.row("TOTAL", money(sale.total));
  builder.double(false).bold(false);
  builder.row("Pago con", money(sale.amountTendered));
  builder.row("Cambio", money(sale.changeAmount));
  builder.separator();

  builder.align("center");
  if (settings.footerMessage) builder.line(settings.footerMessage);
  builder.feedAndCut();

  return builder.build();
}

/** Vista previa en texto del mismo ticket, para la pantalla de configuración. */
export function ticketPreviewText(sale: PosSale, settings: TicketSettings): string {
  const bytes = buildTicketEscPos(sale, settings);
  let output = "";
  for (const byte of bytes) {
    if (byte === 0x0a) output += "\n";
    else if (byte >= 0x20 && byte <= 0x7e) output += String.fromCharCode(byte);
  }
  return output;
}
