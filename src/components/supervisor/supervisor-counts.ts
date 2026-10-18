import { INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import type { InventoryCount, InventoryCountItem } from "@glamouroso/shared";
import { formatQuantity } from "@/lib/format-money";

/**
 * Ayudas de la sección Conteos de la app del supervisor (inventarios
 * cíclicos). Plan: docs/exec-plans/active/pos-inventarios-ciclicos.md.
 *
 * Conteo ciego: nada de aquí lee ni muestra `expectedQty`.
 */

export type CountGroupKey = "liquids" | "packs" | "pieces" | "containers";

export const COUNT_GROUPS: Array<{ key: CountGroupKey; label: string; hint: string }> = [
  { key: "liquids", label: "Líquidos", hint: "Bidones o garrafas llenos y los litros del que está abierto" },
  { key: "packs", label: "Cajas y bolsas", hint: "Cajas cerradas y piezas sueltas" },
  { key: "pieces", label: "Piezas", hint: "Piezas sueltas" },
  { key: "containers", label: "Envases y tapas", hint: "Envases vacíos, tapas y atomizadores" },
];

/** Envases vacíos, tapas y atomizadores del catálogo ("ENVASE PET 1", "TAPA P/ENVASE GALON", "E. POLIET. GALON"). */
const CONTAINER_NAME = /^\s*(envase|tapa|tapón|tapon|e\.\s*poliet|atomizador|gatillo|v[aá]lvula)\b/i;

export function countGroupOf(item: Pick<InventoryCountItem, "unit" | "packSize" | "name">): CountGroupKey {
  if (item.unit === "liters") return "liquids";
  if (Number(item.packSize) > 1) return "packs";
  return CONTAINER_NAME.test(item.name) ? "containers" : "pieces";
}

/** El servidor pidió reconteo y todavía no se hace. */
export function pendingRecount(item: InventoryCountItem): boolean {
  return Boolean(item.needsRecount) && item.recountQty === null;
}

/** Contado, y recontado si se pidió: listo para cerrar. */
export function isCountItemDone(item: InventoryCountItem): boolean {
  return item.countedQty !== null && !pendingRecount(item);
}

/** Lo que manda del renglón: el reconteo si lo hubo. */
export function finalCountedQty(item: InventoryCountItem): number | null {
  return item.recountQty ?? item.countedQty;
}

export function unitShort(unit: InventoryCountItem["unit"]): string {
  return unit === "liters" ? "L" : "pz";
}

/** "62.5 L", "3 pz". */
export function formatCountQty(qty: number | null | undefined, unit: InventoryCountItem["unit"]): string {
  return `${formatQuantity(qty ?? 0)} ${unitShort(unit)}`;
}

/** "+2 L", "−1 pz", "0 pz": la diferencia con signo (menos tipográfico). */
export function formatVariance(qty: number | null | undefined, unit: InventoryCountItem["unit"]): string {
  const value = Number(qty ?? 0);
  const rounded = Math.round(value * 100) / 100;
  if (!rounded) return `0 ${unitShort(unit)}`;
  return `${rounded > 0 ? "+" : "−"}${formatQuantity(Math.abs(rounded))} ${unitShort(unit)}`;
}

/** Exactitud en % (el servidor la manda de 0 a 100). */
export function accuracyPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 10) / 10;
}

/** Renglones con diferencia de un conteo cerrado (`varianceItems` del servidor). */
export function itemsWithDifference(count: InventoryCount): number | null {
  if (typeof count.varianceItems === "number") return count.varianceItems;
  if (count.items) return count.items.filter((item) => Number(item.varianceQty ?? 0) !== 0).length;
  return null;
}

export function countProgress(count: InventoryCount): { counted: number; total: number } {
  if (count.items) {
    return { counted: count.items.filter(isCountItemDone).length, total: count.items.length };
  }
  return { counted: count.countedItems ?? 0, total: count.totalItems ?? 0 };
}

export function isInProgress(count: Pick<InventoryCount, "status">): boolean {
  return count.status === INVENTORY_COUNT_STATUS.IN_PROGRESS;
}

/** Texto del número capturado ("2,5" → 2.5); vacío o inválido → null. */
export function parseCountInput(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Cifra para el campo: sin ceros de relleno y con punto decimal. */
export function inputValue(n: number): string {
  return String(Math.round(n * 100) / 100);
}
