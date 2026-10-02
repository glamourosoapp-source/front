import { BIDON_LITERS, RESTOCK_ORDER_STATUS } from "./constants";

/**
 * Empaques a pedir a fábrica para cubrir un faltante.
 *
 * Regla del medio empaque (2026-09-30, sustituye a la del 30 %): fábrica surte
 * en **empaques completos** (bidón de 20 L, garrafa de 5 L, caja de 20 rollos,
 * bolsa de 6,000 tapas…) y la sucursal vuelve a su mínimo pidiendo un empaque
 * nuevo **por cada empaque del que ya se acabó la mitad**: el faltante en
 * empaques se redondea por mitad (½ hacia arriba). Menos de medio empaque
 * vendido no pide nada.
 *
 * Mínimo 10 bidones (200 L): faltan ½ → 1; faltan 2¼ → 2; faltan 4¾ → 5.
 * Mínimo 2 cajas de 20 (40 pz): faltan 5 → 0; faltan 10 → 1; faltan 13 → 1; faltan 30 → 2.
 */
export function packagesToOrder(shortage: number, minStock: number, packSize: number): number {
  const missing = Number(shortage);
  const min = Number(minStock);
  if (!Number.isFinite(missing) || missing <= 0) return 0;
  if (!Number.isFinite(min) || min <= 0) return 0;
  const size = Number(packSize) > 0 ? Number(packSize) : 1;
  // El epsilon evita que medio empaque exacto (10 L / 20 = 0.5) se pierda por
  // punto flotante en litros con decimales.
  return Math.floor(missing / size + 0.5 + 1e-9);
}

/** Bidones (o garrafas) a pedir para una línea de líquido, en litros. */
export function bidonesToOrder(
  shortageLiters: number,
  minStockLiters: number,
  litersPerBidon: number = BIDON_LITERS
): number {
  const perBidon = litersPerBidon > 0 ? litersPerBidon : BIDON_LITERS;
  return packagesToOrder(shortageLiters, minStockLiters, perBidon);
}

/** Cajas o piezas a pedir para un producto que no se inventaría en litros. */
export function piecesToOrder(shortage: number, minStock: number, unitsPerPackage: number = 1): number {
  return packagesToOrder(shortage, minStock, unitsPerPackage > 0 ? unitsPerPackage : 1);
}

/**
 * Faltante crudo: lo que separa la existencia actual del stock mínimo de la
 * sucursal. Las existencias negativas (venta en negativo) suman al faltante por
 * construcción, así que el surtido siempre repone hasta el nivel ideal.
 */
export function shortageAmount(minStock: number, stock: number): number {
  const min = Number(minStock) || 0;
  const current = Number(stock) || 0;
  if (min <= 0) return 0;
  return Math.max(0, min - current);
}

/**
 * Lo que entra al inventario de la sucursal por cada empaque despachado:
 * litros para bidones/garrafas, piezas para cajas y piezas sueltas.
 */
export function unitsPerRestockPackage(item: {
  unit: string;
  litersPerUnit?: string | number | null;
  unitsPerPackage?: string | number | null;
}): number {
  if (item.unit === "bidon") {
    const liters = Number(item.litersPerUnit);
    return liters > 0 ? liters : BIDON_LITERS;
  }
  const units = Number(item.unitsPerPackage);
  return units > 0 ? units : 1;
}

/**
 * Por qué un pedido a fábrica ya no se puede cancelar, o `null` si sí se puede.
 *
 * Solo se cancela mientras nadie lo ha empezado a trabajar (decisión de
 * Ramiro, 2026-10-01): sigue en su estado inicial (pendiente) y su formato no
 * se ha impreso. Con la hoja impresa fábrica ya pudo empezar a surtirlo.
 */
export function restockCancelBlocker(order: {
  status: string;
  formPrintedAt?: string | Date | null;
}): string | null {
  if (order.status === RESTOCK_ORDER_STATUS.CANCELLED) return "Este pedido ya está cancelado";
  if (order.status !== RESTOCK_ORDER_STATUS.PENDING) {
    return "Solo se puede cancelar un pedido pendiente: este ya avanzó";
  }
  if (order.formPrintedAt) return "Ya se imprimió su formato: fábrica pudo empezar a surtirlo";
  return null;
}
