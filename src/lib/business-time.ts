import { DEFAULT_DELIVERY_SCHEDULE, civilDateAndMinutes } from "@glamouroso/shared";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Timezone del negocio para mostrar timestamps (fecha de creación, "Impreso",
 * exports, nota de remisión): la de la organización si hay sesión, la default
 * si no. Sin esto los timestamps se pintan en la zona horaria del navegador y
 * un usuario fuera de México vería fecha/hora corridas.
 */
export function businessTimeZone(): string {
  return (
    useAuthStore.getState().user?.organization?.timezone ?? DEFAULT_DELIVERY_SCHEDULE.timezone
  );
}

/**
 * Sello YYYYMMDD del día de negocio, que es lo que lleva el folio del ticket.
 *
 * La caja arma su propio folio, así que necesita el mismo día que usaría el
 * servidor: la zona de la organización, no la del navegador. Una PC configurada
 * en otra zona pondría el ticket en el día equivocado.
 */
export function businessStamp(at: Date = new Date()): string {
  const { year, month, day } = civilDateAndMinutes(at, businessTimeZone());
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}
