import { INVENTORY_COUNT_ITEM_STATUS, INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import { countNeedsRecount } from "@glamouroso/shared";
import type { InventoryCount, InventoryCountItem } from "@glamouroso/shared";
import { formatMoney, formatQuantity } from "@/lib/format-money";

/**
 * Textos y formatos de los conteos cíclicos del panel. Plan:
 * docs/exec-plans/active/pos-inventarios-ciclicos.md (sección 4).
 */

export const COUNTS_HREF = "/dashboard/pos/conteos";

export const countHref = (id: string) => `${COUNTS_HREF}/${id}`;

export const COUNT_STATUS_LABELS: Record<string, string> = {
  [INVENTORY_COUNT_STATUS.IN_PROGRESS]: "En curso",
  [INVENTORY_COUNT_STATUS.CLOSED]: "Cerrado",
  [INVENTORY_COUNT_STATUS.CANCELLED]: "Cancelado",
};

/** Por qué entró el renglón a la lista sorpresa. */
export const COUNT_SELECTION_LABELS: Record<string, { label: string; hint: string }> = {
  due: { label: "Vencido", hint: "Le tocaba por su clase ABC (A cada mes, B cada 2, C cada 3) o nunca se había contado." },
  risk: { label: "Riesgo", hint: "Tuvo diferencias en conteos anteriores o existencia negativa." },
  random: { label: "Azar", hint: "Elegido al azar para que la lista no se pueda adivinar." },
};

/**
 * Renglón del conteo **con** la marca opcional de revertidos que el listado
 * puede traer. El contrato no la incluye todavía: si no llega se muestra "—".
 */
export type CountListRow = InventoryCount & { revertedItems?: number | null };

export const unitSuffix = (unit: string) => (unit === "liters" ? "L" : "pz");

/** "12.5 L" / "3 pz" / "—". */
export function qtyLabel(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  return `${formatQuantity(value)} ${unitSuffix(unit)}`;
}

/** Con signo: "+2 L", "−3 pz", "0 pz". */
export function signedQty(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  const amount = Number(value);
  if (!amount) return `0 ${unitSuffix(unit)}`;
  return `${amount > 0 ? "+" : "−"}${formatQuantity(Math.abs(amount))} ${unitSuffix(unit)}`;
}

/** Con signo: "−$1,234.00" (faltante) o "+$80.00" (sobrante). */
export function signedMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  const amount = Number(value);
  if (!amount) return formatMoney(0);
  return `${amount > 0 ? "+" : "−"}${formatMoney(Math.abs(amount))}`;
}

/** `accuracy` llega como porcentaje 0–100. */
export function percentLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Math.round(Number(value))} %`;
}

export type AccuracyTone = "good" | "warn" | "bad" | "none";

/** Verde desde 95 %, ámbar desde 85 %, rojo abajo. */
export function accuracyTone(value: number | null | undefined): AccuracyTone {
  if (value == null) return "none";
  if (value >= 95) return "good";
  if (value >= 85) return "warn";
  return "bad";
}

/** Lo que quedó del renglón: el reconteo manda sobre el primer conteo. */
export const finalQty = (item: InventoryCountItem) => item.recountQty ?? item.countedQty;

/**
 * ¿Quedó dentro de tolerancia? Solo se sabe con lo esperado (quien ve
 * existencias); sin él, `null` y la exactitud se toma de la del conteo.
 */
export function withinTolerance(item: InventoryCountItem): boolean | null {
  const counted = finalQty(item);
  if (item.expectedQty == null || counted == null) return null;
  return !countNeedsRecount(Number(item.expectedQty), Number(counted));
}

export const isRevertible = (count: InventoryCount, item: InventoryCountItem) =>
  count.status === INVENTORY_COUNT_STATUS.CLOSED &&
  item.status === INVENTORY_COUNT_ITEM_STATUS.ADJUSTED &&
  Number(item.varianceQty ?? 0) !== 0;
