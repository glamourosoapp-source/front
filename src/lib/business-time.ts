import { DEFAULT_DELIVERY_SCHEDULE } from "@glamouroso/shared";
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
