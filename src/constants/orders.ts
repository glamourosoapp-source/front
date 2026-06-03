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
