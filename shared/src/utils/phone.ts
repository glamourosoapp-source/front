/**
 * Normalización y validación de teléfonos mexicanos, compartidas entre
 * Back y Front (copia duplicada; mantener ambas en sync).
 */

/** Deja solo dígitos y lleva a formato E.164 sin "+" (52XXXXXXXXXX). */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return digits;
  // Formato móvil viejo +52 1 XX XXXX XXXX: quitar el "1" extra
  if (digits.length === 13 && digits.startsWith("521")) return `52${digits.slice(3)}`;
  return digits;
}

/** Un teléfono MX válido normaliza a 12 dígitos con prefijo 52. */
export function isValidMexicanPhone(phone: string | null | undefined): boolean {
  const normalized = normalizePhone(phone);
  return normalized.length === 12 && normalized.startsWith("52");
}
