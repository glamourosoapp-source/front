import { POS_SALE_KINDS } from "@glamouroso/shared/constants";
import { formatDateOnly } from "@/lib/format-date-only";
import type { PosSale } from "@/types";

export function isHomeDeliverySale(sale: Pick<PosSale, "kind">): boolean {
  return sale.kind === POS_SALE_KINDS.HOME_DELIVERY;
}

/**
 * Renglones de entrega del ticket de una venta a domicilio: pedido, día de
 * entrega, domicilio y nota para el repartidor. Los usan la térmica y la hoja
 * del navegador, para que digan lo mismo. Vacío si el ticket es de mostrador.
 */
export function deliveryTicketLines(sale: PosSale): string[] {
  if (!isHomeDeliverySale(sale)) return [];
  const order = sale.deliveryOrder;
  if (!order) return ["Entrega a domicilio: la surte la fábrica"];
  const lines = [`Pedido: ${order.orderNumber}`];
  const day = formatDateOnly(order.scheduledDeliveryDate ?? null, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (day) lines.push(`Entrega: ${day}`);
  if (order.deliveryAddress) lines.push(`Domicilio: ${order.deliveryAddress}`);
  if (order.customerNotes) lines.push(`Nota: ${order.customerNotes}`);
  return lines;
}
