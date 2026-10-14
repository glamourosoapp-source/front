import { POS_SALE_UNITS } from "./constants";

/**
 * Devoluciones de cliente en la caja: reglas que la caja aplica sin red y el
 * servidor vuelve a aplicar al recibir el evento.
 *
 * Viven en `shared` porque las dos partes tienen que llegar al mismo número:
 * el papel que firma el cliente dice cuánto se le regresó, y el servidor no
 * puede contar otra cosa. Decisiones del negocio (2026-10-14) en
 * docs/product-specs/pos-devoluciones-cliente.md.
 */

/** Días de negocio que tiene el cajero para aceptar una devolución; un administrador, sin límite. */
export const POS_RETURN_WINDOW_DAYS = 7;

/** Prefijo del folio de devolución: `DCL-SUC01-20261014-0001`. */
export const POS_RETURN_PREFIX = "DCL";

const SEQ_PAD = 4;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Folio de una devolución de cliente. Serie propia por sucursal y día, como la
 * de los tickets: la asigna la caja (funciona sin red) y no choca con las ventas.
 */
export function posReturnNumber(branchCode: string, businessDate: string, seq: number): string {
  return `${POS_RETURN_PREFIX}-${branchCode}-${businessDate}-${String(seq).padStart(SEQ_PAD, "0")}`;
}

/** Consecutivo de un folio de devolución, o `null` si no tiene la forma esperada. */
export function posReturnSeq(returnNumber: string): number | null {
  if (!returnNumber.startsWith(`${POS_RETURN_PREFIX}-`)) return null;
  const match = /-(\d{8})-(\d+)$/.exec(returnNumber);
  if (!match) return null;
  const seq = Number.parseInt(match[2]!, 10);
  return Number.isFinite(seq) ? seq : null;
}

/** El folio es de devolución y de ESA sucursal (nunca se guarda uno de otra tienda). */
export function isValidPosReturnNumber(returnNumber: string, branchCode: string): boolean {
  if (!returnNumber.startsWith(`${POS_RETURN_PREFIX}-${branchCode}-`)) return false;
  const seq = posReturnSeq(returnNumber);
  return seq !== null && seq >= 1;
}

/** Días naturales entre dos días de negocio `YYYYMMDD` (o `YYYY-MM-DD`). */
export function businessDaysBetween(from: string, to: string): number {
  const parse = (stamp: string) => {
    const digits = stamp.replace(/-/g, "");
    return Date.UTC(
      Number(digits.slice(0, 4)),
      Number(digits.slice(4, 6)) - 1,
      Number(digits.slice(6, 8))
    );
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/**
 * ¿El cajero puede aceptar la devolución? Del día de la venta al de la
 * devolución caben `POS_RETURN_WINDOW_DAYS` días: una compra del lunes se
 * devuelve hasta el lunes siguiente.
 */
export function isWithinReturnWindow(
  saleBusinessDate: string,
  returnBusinessDate: string,
  days: number = POS_RETURN_WINDOW_DAYS
): boolean {
  const elapsed = businessDaysBetween(saleBusinessDate, returnBusinessDate);
  return elapsed >= 0 && elapsed <= days;
}

/**
 * Los litros sueltos se devuelven, pero siempre a merma: el granel no se puede
 * revisar ni volver a servir. Envases y piezas los decide el cajero.
 */
export function canRestock(saleUnit: string): boolean {
  return saleUnit !== POS_SALE_UNITS.LITER;
}

/**
 * Qué parte del importe de las partidas pagó de verdad el cliente: un ticket
 * con descuento global regresa lo pagado, no el precio de lista.
 */
export function saleRefundFactor(sale: { subtotal: number; total: number }): number {
  const subtotal = Number(sale.subtotal) || 0;
  const total = Number(sale.total) || 0;
  if (subtotal <= 0) return 1;
  return Math.min(1, Math.max(0, total / subtotal));
}

/** Una partida del ticket original con lo que ya se devolvió de ella. */
export interface ReturnableItem {
  quantity: number;
  total: number;
  /** Cantidad ya devuelta en devoluciones anteriores. */
  returnedQuantity: number;
  /** Dinero ya regresado por esta partida en devoluciones anteriores. */
  refundedTotal: number;
}

/** Lo que todavía se puede devolver de una partida. */
export function remainingQuantity(item: Pick<ReturnableItem, "quantity" | "returnedQuantity">): number {
  return Math.max(0, round2(Number(item.quantity) - Number(item.returnedQuantity)));
}

/**
 * Cuánto se regresa por devolver `quantity` de una partida.
 *
 * Proporcional a lo que pagó (precio de la partida × factor de descuento). La
 * devolución que agota la partida regresa exactamente lo que faltaba, así que
 * varias devoluciones parciales nunca suman un centavo más ni menos que la venta.
 */
export function refundForQuantity(item: ReturnableItem, factor: number, quantity: number): number {
  const sold = Number(item.quantity) || 0;
  if (sold <= 0 || quantity <= 0) return 0;
  const refundable = round2(Number(item.total) * factor);
  const remaining = remainingQuantity(item);
  if (Math.abs(quantity - remaining) < 0.005) {
    return Math.max(0, round2(refundable - Number(item.refundedTotal)));
  }
  return round2((refundable * quantity) / sold);
}
