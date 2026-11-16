import {
  FACTORY_AREAS,
  FACTORY_ITEM_MARKS,
  FACTORY_LIQUIDS_SHEET,
  RESTOCK_ORDER_STATUS,
} from "./constants";
import type { FactoryArea } from "./constants";

/**
 * Reglas puras del pedido a fábrica v2 (Richi elige, Alex separa, Richi carga,
 * la oficina confirma). Las comparten el Back, el panel y las dos apps.
 * Plan: docs/exec-plans/active/pos-estados-pedido-fabrica-v2.md.
 */

/** Color de un renglón en la tablet de fábrica. */
export type FactoryLineColor = "none" | "blue" | "green" | "yellow" | "red";

export interface FactoryLineState {
  requestedQty: number | string;
  factoryMark?: string | null;
  /** Lo que se separó o se cargó, en empaques; null = lo pedido. */
  factoryQty?: number | string | null;
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Empaques que salen del renglón según su marca: rojo 0, sin cantidad = lo pedido. */
export function factoryLineQty(line: FactoryLineState): number {
  if (line.factoryMark === FACTORY_ITEM_MARKS.MISSING) return 0;
  return line.factoryQty == null ? num(line.requestedQty) : num(line.factoryQty);
}

/**
 * Azul = separado, verde = cargado completo, amarillo = separado o cargado con
 * más o menos de lo pedido, rojo = no hubo. El amarillo no se guarda: sale de
 * comparar la cantidad con lo pedido (como hoy en la app).
 */
export function factoryLineColor(line: FactoryLineState): FactoryLineColor {
  switch (line.factoryMark) {
    case FACTORY_ITEM_MARKS.MISSING:
      return "red";
    case FACTORY_ITEM_MARKS.SEPARATED:
    case FACTORY_ITEM_MARKS.LOADED: {
      const changed = Math.abs(factoryLineQty(line) - num(line.requestedQty)) > 1e-9;
      if (changed) return "yellow";
      return line.factoryMark === FACTORY_ITEM_MARKS.LOADED ? "green" : "blue";
    }
    default:
      return "none";
  }
}

/** Un renglón listo para enviar: cargado (verde o amarillo) o rojo. */
export function factoryLineReady(line: FactoryLineState): boolean {
  return line.factoryMark === FACTORY_ITEM_MARKS.LOADED || line.factoryMark === FACTORY_ITEM_MARKS.MISSING;
}

/** Cuántos renglones faltan para poder enviar (0 = se puede). */
export function factoryLinesPending(lines: FactoryLineState[]): number {
  return lines.filter((line) => !factoryLineReady(line)).length;
}

/** Bodega que surte una hoja del formato: la 1 es líquidos; 2–4, jarcería. */
export function factoryAreaOfSheet(sheet: number | null | undefined): FactoryArea {
  return (sheet ?? FACTORY_LIQUIDS_SHEET) <= FACTORY_LIQUIDS_SHEET ? FACTORY_AREAS.LIQUIDS : FACTORY_AREAS.HARDWARE;
}

/** Avance de un pedido en preparación, para la tarjeta y la tabla de fábrica. */
export function factoryProgress(lines: FactoryLineState[]) {
  const counts = { total: lines.length, none: 0, blue: 0, green: 0, yellow: 0, red: 0 };
  for (const line of lines) counts[factoryLineColor(line)] += 1;
  return { ...counts, pending: factoryLinesPending(lines) };
}

/**
 * Nombre del estado en pantalla con el flujo v2: En preparación, En camino,
 * Recibido, Cancelado. El faltante sin elegir es "Por preparar" (no es un
 * pedido); un pedido viejo pendiente o mandado a fábrica también se muestra así
 * hasta que alguien lo elija. Sin el flujo v2, cada pantalla usa sus etiquetas.
 */
export function restockStatusLabelV2(status: string): string {
  switch (status) {
    case RESTOCK_ORDER_STATUS.PENDING:
    case RESTOCK_ORDER_STATUS.APPROVED:
      return "Por preparar";
    case RESTOCK_ORDER_STATUS.PREPARING:
      return "En preparación";
    case RESTOCK_ORDER_STATUS.SENT:
      return "En camino";
    case RESTOCK_ORDER_STATUS.RECEIVED:
      return "Recibido";
    case RESTOCK_ORDER_STATUS.CANCELLED:
      return "Cancelado";
    default:
      return status;
  }
}
