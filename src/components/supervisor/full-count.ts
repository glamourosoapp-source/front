import type { InventoryCount, InventoryCountItem } from "@glamouroso/shared";
import { countGroupOf } from "./supervisor-counts";

/**
 * Ayudas del inventario completo de la app del supervisor (`kind: "full"`):
 * todo lo vivo de la sucursal, contado por categoría. Ciego y con ajuste al
 * cerrar como el cíclico, pero sin reconteo: contado es contado.
 */

export const FULL_COUNTS_HREF = "/supervisor/inventarios";

export const fullCountHref = (id: string) => `${FULL_COUNTS_HREF}/${id}`;

/** Estado de un renglón, que es también su color: verde contado, gris por contar. */
export type FullItemState = "done" | "todo";

export function fullItemState(item: InventoryCountItem): FullItemState {
  return finalQty(item) !== null ? "done" : "todo";
}

/** Lo capturado del renglón (el reconteo, si un inventario viejo lo trae). */
export function finalQty(item: InventoryCountItem): number | null {
  return item.recountQty ?? item.countedQty;
}

/**
 * Categoría con que se agrupa el renglón: la del catálogo y, si no tiene,
 * una por cómo se cuenta (líquidos, envases o el resto).
 */
export function fullCategoryOf(item: InventoryCountItem): string {
  const category = item.category?.trim();
  if (category) return category;
  const group = countGroupOf(item);
  if (group === "liquids") return "Líquidos";
  if (group === "containers") return "Envases y tapas";
  return "Otros";
}

export interface FullCategory {
  name: string;
  items: InventoryCountItem[];
  done: number;
}

/** Categorías en el orden de la lista del servidor (líquidos primero, luego por categoría y nombre). */
export function fullCategories(items: InventoryCountItem[]): FullCategory[] {
  const map = new Map<string, FullCategory>();
  for (const item of items) {
    const name = fullCategoryOf(item);
    const group = map.get(name) ?? { name, items: [], done: 0 };
    group.items.push(item);
    if (fullItemState(item) === "done") group.done += 1;
    map.set(name, group);
  }
  return [...map.values()];
}

/** Avance de la lista: contados y lo que falta. */
export function fullProgress(count: InventoryCount): { done: number; todo: number; total: number } {
  if (!count.items) {
    const total = count.totalItems ?? 0;
    const done = count.countedItems ?? 0;
    return { done, todo: Math.max(0, total - done), total };
  }
  const done = count.items.filter((item) => fullItemState(item) === "done").length;
  const total = count.items.length;
  return { done, todo: total - done, total };
}

export function percentOf(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}
