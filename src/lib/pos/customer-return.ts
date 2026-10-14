import {
  POS_SALE_KINDS,
  POS_SALE_STATUS,
  POS_SALE_UNITS,
  type PosPaymentMethod,
  type PosReturnReason,
  type PosSaleUnit,
} from "@glamouroso/shared/constants";
import {
  canRestock,
  isWithinReturnWindow,
  POS_RETURN_WINDOW_DAYS,
  refundForQuantity,
  remainingQuantity,
  saleRefundFactor,
} from "@glamouroso/shared/pos-returns";
import {
  POS_SYNC_EVENT_TYPES,
  posTicketBusinessDate,
  type PosReturnEventPayload,
  type PosSyncEvent,
} from "@glamouroso/shared/pos-sync";
import type { PosSale } from "@/types";

/**
 * Devolución de cliente en la caja: de un ticket ya cobrado, qué se puede
 * regresar, cuánto dinero sale y qué evento sube.
 *
 * Igual que el cobro, se escribe en la PC primero y sube después: funciona sin
 * red mientras el ticket esté guardado en esta caja. Las reglas (plazo,
 * reembolso con el descuento repartido, litros siempre a merma) son las mismas
 * que aplica el servidor: viven en `@glamouroso/shared/pos-returns`.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Una partida devuelta, tal como se guarda en la PC y viaja en el evento. */
export interface ReturnLine {
  saleUnit: PosSaleUnit;
  productId: string | null;
  lineId: string | null;
  /** Precio unitario con que se vendió: distingue dos partidas del mismo producto. */
  saleUnitPrice: number;
  quantity: number;
  /** Lo que se le regresó al cliente por esta partida. */
  refund: number;
}

/** Devolución hecha en esta caja, guardada junto a su ticket. */
export interface LocalReturnRecord {
  /** Id del evento con que sube; el servidor lo devuelve en `sale.returns`. */
  eventId: string;
  returnNumber: string;
  returnedAt: string;
  total: number;
  lines: ReturnLine[];
}

/** Lo que se pinta por renglón en el diálogo de devolución. */
export interface ReturnableRow {
  key: string;
  saleUnit: PosSaleUnit;
  productId: string | null;
  lineId: string | null;
  name: string;
  code: string | null;
  unitPrice: number;
  soldQuantity: number;
  soldTotal: number;
  returnedQuantity: number;
  refundedTotal: number;
  remaining: number;
}

/** Lo que el cajero eligió devolver de un renglón. */
export interface ReturnSelection {
  quantity: number;
  reason: PosReturnReason;
  restock: boolean;
}

/** El ticket que se imprime: dos ejemplares, cliente y sucursal. */
export interface CustomerReturnTicket {
  returnNumber: string;
  returnedAt: string;
  saleTicketNumber: string;
  saleSoldAt: string;
  branch: { code: string; name: string } | null;
  cashierName: string | null;
  customerName: string | null;
  paymentMethod: PosPaymentMethod;
  total: number;
  notes: string | null;
  items: Array<{
    name: string;
    code: string | null;
    saleUnit: PosSaleUnit;
    quantity: number;
    total: number;
    reason: PosReturnReason;
    restock: boolean;
  }>;
}

/** Piezas por producto, litros por línea, y el precio con que se cobró. */
function rowKey(saleUnit: string, productId: string | null, lineId: string | null, unitPrice: number): string {
  const target = saleUnit === POS_SALE_UNITS.LITER ? `l:${lineId}` : `p:${productId}`;
  return `${saleUnit}|${target}|${round2(unitPrice).toFixed(2)}`;
}

/**
 * Lo ya devuelto de un ticket, como líneas: las que conoce el servidor más las
 * de esta caja que todavía no le constan (sin red, o recién hechas).
 */
export function returnedLines(sale: PosSale, local: LocalReturnRecord[] = []): ReturnLine[] {
  const itemsById = new Map((sale.items ?? []).map((item) => [item.id, item]));
  const lines: ReturnLine[] = [];
  const known = new Set<string>();

  for (const ret of sale.returns ?? []) {
    if (ret.clientEventId) known.add(ret.clientEventId);
    for (const item of ret.items ?? []) {
      const saleItem = itemsById.get(item.saleItemId);
      if (!saleItem) continue;
      lines.push({
        saleUnit: saleItem.saleUnit,
        productId: saleItem.saleUnit === POS_SALE_UNITS.LITER ? null : (saleItem.productId ?? null),
        lineId: saleItem.saleUnit === POS_SALE_UNITS.LITER ? (saleItem.lineId ?? null) : null,
        saleUnitPrice: Number(saleItem.unitPrice),
        quantity: Number(item.quantity),
        refund: Number(item.total),
      });
    }
  }

  for (const record of local) {
    if (known.has(record.eventId)) continue;
    lines.push(...record.lines);
  }
  return lines;
}

/**
 * Renglones del ticket con lo que queda por devolver. Las partidas del mismo
 * producto al mismo precio se juntan: para el cliente son lo mismo.
 */
export function returnableRows(sale: PosSale, returned: ReturnLine[]): ReturnableRow[] {
  const rows = new Map<string, ReturnableRow>();
  for (const item of sale.items ?? []) {
    const saleUnit = item.saleUnit;
    const productId = saleUnit === POS_SALE_UNITS.LITER ? null : (item.productId ?? null);
    const lineId = saleUnit === POS_SALE_UNITS.LITER ? (item.lineId ?? null) : null;
    const unitPrice = Number(item.unitPrice);
    const key = rowKey(saleUnit, productId, lineId, unitPrice);
    const current = rows.get(key);
    if (current) {
      current.soldQuantity = round2(current.soldQuantity + Number(item.quantity));
      current.soldTotal = round2(current.soldTotal + Number(item.total));
    } else {
      rows.set(key, {
        key,
        saleUnit,
        productId,
        lineId,
        name: item.productName,
        code: item.sku ?? null,
        unitPrice,
        soldQuantity: Number(item.quantity),
        soldTotal: Number(item.total),
        returnedQuantity: 0,
        refundedTotal: 0,
        remaining: 0,
      });
    }
  }

  for (const line of returned) {
    const row = rows.get(rowKey(line.saleUnit, line.productId, line.lineId, line.saleUnitPrice));
    if (!row) continue;
    row.returnedQuantity = round2(row.returnedQuantity + line.quantity);
    row.refundedTotal = round2(row.refundedTotal + line.refund);
  }

  return Array.from(rows.values()).map((row) => ({
    ...row,
    remaining: remainingQuantity({ quantity: row.soldQuantity, returnedQuantity: row.returnedQuantity }),
  }));
}

/** Cuánto se regresa por devolver `quantity` de un renglón (con el descuento del ticket). */
export function rowRefund(sale: PosSale, row: ReturnableRow, quantity: number): number {
  const factor = saleRefundFactor({ subtotal: Number(sale.subtotal), total: Number(sale.total) });
  return refundForQuantity(
    {
      quantity: row.soldQuantity,
      total: row.soldTotal,
      returnedQuantity: row.returnedQuantity,
      refundedTotal: row.refundedTotal,
    },
    factor,
    quantity,
  );
}

/**
 * ¿Se puede devolver este ticket en esta caja? `null` = sí; si no, el porqué
 * con el que el cajero sabe qué hacer.
 */
export function returnBlocker(
  sale: PosSale,
  options: { isAdmin: boolean; branchId: string | null; today: string },
): string | null {
  if (sale.status === POS_SALE_STATUS.VOIDED) {
    return `El ticket ${sale.ticketNumber} está anulado: no hay nada que devolver.`;
  }
  if (sale.kind === POS_SALE_KINDS.HOME_DELIVERY) {
    return "Una venta a domicilio no se devuelve en la caja: se anula desde Ventas del día.";
  }
  if (options.branchId && sale.branchId && sale.branchId !== options.branchId) {
    return "Este ticket es de otra sucursal: solo se devuelve en la tienda donde se compró.";
  }
  const saleDay = posTicketBusinessDate(sale.ticketNumber);
  if (!options.isAdmin && saleDay && !isWithinReturnWindow(saleDay, options.today)) {
    return `El ticket tiene más de ${POS_RETURN_WINDOW_DAYS} días. Pide a un administrador que haga la devolución.`;
  }
  return null;
}

export { canRestock };

export interface BuildReturnInput {
  sale: PosSale;
  rows: ReturnableRow[];
  selections: Record<string, ReturnSelection>;
  returnNumber: string;
  returnedAt: Date;
  notes: string | null;
  recordedOffline: boolean;
  serverSaleId: string | null;
}

/** Partidas elegidas, con su reembolso y su destino ya resueltos. */
export function chosenLines(input: Pick<BuildReturnInput, "sale" | "rows" | "selections">) {
  return input.rows
    .map((row) => {
      const selection = input.selections[row.key];
      if (!selection || selection.quantity <= 0) return null;
      const quantity = Math.min(selection.quantity, row.remaining);
      if (quantity <= 0) return null;
      return {
        row,
        quantity,
        refund: rowRefund(input.sale, row, quantity),
        reason: selection.reason,
        restock: selection.restock && canRestock(row.saleUnit),
      };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);
}

/** El evento que sube, el registro que se guarda junto al ticket y el papel que se imprime. */
export function buildCustomerReturn(input: BuildReturnInput, eventId: string) {
  const lines = chosenLines(input);
  const total = round2(lines.reduce((sum, line) => sum + line.refund, 0));
  const returnedAt = input.returnedAt.toISOString();

  const payload: PosReturnEventPayload = {
    returnNumber: input.returnNumber,
    returnedAt,
    saleTicketNumber: input.sale.ticketNumber,
    saleId: input.serverSaleId,
    items: lines.map((line) => ({
      saleUnit: line.row.saleUnit,
      productId: line.row.productId,
      lineId: line.row.lineId,
      quantity: line.quantity,
      saleUnitPrice: line.row.unitPrice,
      refund: line.refund,
      reason: line.reason,
      restock: line.restock,
    })),
    total,
    paymentMethod: input.sale.paymentMethod,
    notes: input.notes,
    recordedOffline: input.recordedOffline,
  };

  const event: PosSyncEvent = {
    id: eventId,
    type: POS_SYNC_EVENT_TYPES.RETURN_CREATED,
    occurredAt: returnedAt,
    payload,
  };

  const record: LocalReturnRecord = {
    eventId,
    returnNumber: input.returnNumber,
    returnedAt,
    total,
    lines: lines.map((line) => ({
      saleUnit: line.row.saleUnit,
      productId: line.row.productId,
      lineId: line.row.lineId,
      saleUnitPrice: line.row.unitPrice,
      quantity: line.quantity,
      refund: line.refund,
    })),
  };

  const ticket: CustomerReturnTicket = {
    returnNumber: input.returnNumber,
    returnedAt,
    saleTicketNumber: input.sale.ticketNumber,
    saleSoldAt: input.sale.soldAt,
    branch: input.sale.branch ? { code: input.sale.branch.code, name: input.sale.branch.name } : null,
    cashierName: null,
    customerName: input.sale.customer?.name ?? null,
    paymentMethod: input.sale.paymentMethod,
    total,
    notes: input.notes,
    items: lines.map((line) => ({
      name: line.row.name,
      code: line.row.code,
      saleUnit: line.row.saleUnit,
      quantity: line.quantity,
      total: line.refund,
      reason: line.reason,
      restock: line.restock,
    })),
  };

  return { event, record, ticket, total };
}
