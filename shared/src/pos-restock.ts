import { BIDON_LITERS } from "./constants";

/**
 * Bidones a pedir a fábrica para cubrir un faltante en litros.
 *
 * El surtido de líquidos siempre viaja en bidones completos, así que el
 * faltante se redondea **por mitad de bidón**: se pide otro bidón cuando falta
 * más de la mitad de uno. Con bidones de 20 L: 18 L → 1, 45 L → 2, 50 L → 3.
 *
 * Por debajo de media carga NO se pide nada (9 L → 0): la sucursal casi está en
 * su nivel ideal y mandarle un bidón completo cada corte le acumularía producto
 * que no vendió.
 */
export function bidonesToOrder(
  shortageLiters: number,
  litersPerBidon: number = BIDON_LITERS
): number {
  const perBidon = litersPerBidon > 0 ? litersPerBidon : BIDON_LITERS;
  if (!Number.isFinite(shortageLiters) || shortageLiters <= 0) return 0;
  return Math.round(shortageLiters / perBidon);
}

/** Piezas a pedir para un producto que no se inventaría en litros. */
export function piecesToOrder(shortage: number): number {
  if (!Number.isFinite(shortage) || shortage <= 0) return 0;
  return Math.ceil(shortage);
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
