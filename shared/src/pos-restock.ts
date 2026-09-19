import { BIDON_LITERS, RESTOCK_SHORTAGE_THRESHOLD } from "./constants";

/**
 * Empaques a pedir a fábrica para cubrir un faltante.
 *
 * Regla del 30 % (2026-09-19): fábrica surte en **empaques completos** (bidón
 * de 20 L, garrafa de 5 L, caja de 24 latas, bolsa de 6,000 tapas…). Se pide
 * cuando el faltante alcanza el **30 % del stock mínimo** de la sucursal, y
 * entonces se piden los empaques necesarios para cubrirlo completo: siempre
 * sobra, nunca falta. Por debajo del umbral no se pide nada: la sucursal casi
 * está en su nivel ideal y mandarle un empaque cada corte le acumularía
 * producto que no vendió.
 *
 * Mínimo 40 pz en cajas de 20: faltan 12 → 1 caja; faltan 25 → 2; faltan 11 → 0.
 * Mínimo 20 L en bidón:        faltan 6 L → 1 bidón; faltan 5 L → 0.
 */
export function packagesToOrder(shortage: number, minStock: number, packSize: number): number {
  const missing = Number(shortage);
  const min = Number(minStock);
  if (!Number.isFinite(missing) || missing <= 0) return 0;
  if (!Number.isFinite(min) || min <= 0) return 0;
  // 0.3 × 3 = 0.8999999999999999 en punto flotante: el epsilon evita que un
  // faltante exactamente en el umbral se quede sin pedir.
  if (missing + 1e-9 < min * RESTOCK_SHORTAGE_THRESHOLD) return 0;
  const size = Number(packSize) > 0 ? Number(packSize) : 1;
  return Math.ceil(missing / size - 1e-9);
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
