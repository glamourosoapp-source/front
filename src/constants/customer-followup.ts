import { CUSTOMER_FOLLOWUP } from "@glamouroso/shared/constants";
import type { CustomerFollowupBucket } from "@glamouroso/shared/constants";

/** Etiqueta del cubo excluyente de días sin comprar. */
export const FOLLOWUP_BUCKET_LABELS: Record<CustomerFollowupBucket, string> = {
  15: "15 a 29 días",
  30: "30 a 59 días",
  60: `60 a ${CUSTOMER_FOLLOWUP.MAX_DAYS} días`,
};

/** Texto corto para chips y tarjetas. */
export const FOLLOWUP_BUCKET_SHORT: Record<CustomerFollowupBucket, string> = {
  15: "15+ días",
  30: "30+ días",
  60: "60+ días",
};

/** Saludo prellenado del wa.me: el vendedor lo ajusta antes de enviar. */
export function followupWhatsappMessage(options: {
  customerName: string;
  sellerName?: string | null;
  days: number;
}): string {
  const firstName = options.customerName.trim().split(/\s+/)[0] || "";
  const who = options.sellerName ? `soy ${options.sellerName.trim().split(/\s+/)[0]} de Glamouroso` : "te saludo de Glamouroso";
  return `Hola ${firstName}, ${who}. Ya pasaron ${options.days} días desde tu último pedido, ¿te preparo el de siempre?`;
}
