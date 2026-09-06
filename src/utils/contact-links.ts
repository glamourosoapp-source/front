import { normalizePhone } from "@glamouroso/shared";

/**
 * Links para que el vendedor contacte a un cliente desde SU propio teléfono:
 * WhatsApp personal (wa.me) y llamada. No pasan por el número de la empresa
 * ni por el guardián de outbound, así que no gastan cupo ni piden plantilla.
 * Devuelven null si el teléfono no normaliza a un móvil MX (52 + 10 dígitos).
 */
function mxDigits(phone: string | null | undefined): string | null {
  const digits = normalizePhone(phone);
  return digits.length === 12 && digits.startsWith("52") ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const digits = mxDigits(phone);
  if (!digits) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export function telLink(phone: string | null | undefined): string | null {
  const digits = mxDigits(phone);
  return digits ? `tel:+${digits}` : null;
}
