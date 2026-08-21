export const PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "Sin especificar" },
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "spei", label: "SPEI" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "deposito", label: "Depósito" },
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  { value: "unpaid", label: "Sin pagar" },
  { value: "paid", label: "Pagado" },
  { value: "partial", label: "Parcial" },
  { value: "refunded", label: "Reembolsado" },
] as const;

/** Estados elegibles en selects; "draft" queda fuera: solo se entra/sale por guardar borrador y confirmar. */
export const ORDER_STATUS_OPTIONS = [
  { value: "new", label: "Nuevo" },
  { value: "processing", label: "En proceso" },
  { value: "delivered", label: "Entregado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

export function orderStatusLabel(value: string | null | undefined) {
  if (value === "draft") return "Borrador";
  // Eliminado: no está en el select porque no se llega por edición, sino con
  // el botón de eliminar (y se sale restaurando desde la papelera).
  if (value === "deleted") return "Eliminado";
  if (!value) return "—";
  return ORDER_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function paymentMethodLabel(value: string | null | undefined) {
  if (!value) return "—";
  const found = PAYMENT_METHOD_OPTIONS.find((o) => o.value === value);
  return found?.label ?? value;
}

export function paymentStatusLabel(value: string | null | undefined) {
  if (!value) return "—";
  const found = PAYMENT_STATUS_OPTIONS.find((o) => o.value === value);
  return found?.label ?? value;
}

export function orderCreatorLabel(order: {
  source?: string;
  creator?: { name: string } | null;
}) {
  if (order.source === "whatsapp") return "Agente IA";
  return order.creator?.name ?? "—";
}

/** Equipo del creador; los pedidos históricos de WhatsApp sin creador caen a "Glamouroso IA". */
export function orderTeamLabel(order: {
  source?: string;
  creator?: { team?: { name: string } | null } | null;
}) {
  if (order.creator?.team?.name) return order.creator.team.name;
  return order.source === "whatsapp" ? "Glamouroso IA" : "—";
}
