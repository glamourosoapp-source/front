/**
 * Muestra un teléfono mexicano en formato local legible (33 1234 5678),
 * sin importar si viene en 10 dígitos o con prefijo 52/521.
 */
export function formatMxPhone(phone: string | null | undefined): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "-";

  let local = digits;
  if (digits.length === 13 && digits.startsWith("521")) local = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("52")) local = digits.slice(2);

  if (local.length === 10) {
    return `${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
  }
  return digits;
}
