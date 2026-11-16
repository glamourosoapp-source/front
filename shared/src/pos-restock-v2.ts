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
export type FactoryLineColor = "none" | "blue" | "green" | "red";

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
 * Azul = separado, verde = va en el camión (aunque haya cambiado la cantidad),
 * rojo = no hubo. Que la cantidad cambió no es un color: se marca aparte con
 * `factoryLineChanged` (decisión 2026-11-16: todo lo que va en el camión, verde).
 */
export function factoryLineColor(line: FactoryLineState): FactoryLineColor {
  switch (line.factoryMark) {
    case FACTORY_ITEM_MARKS.MISSING:
      return "red";
    case FACTORY_ITEM_MARKS.SEPARATED:
      return "blue";
    case FACTORY_ITEM_MARKS.LOADED:
      return "green";
    default:
      return "none";
  }
}

/**
 * ¿Se separó o se cargó otra cantidad que la pedida (o un producto que no
 * venía)? No se guarda: sale de comparar con lo pedido. Rojo no cuenta.
 */
export function factoryLineChanged(line: FactoryLineState): boolean {
  if (line.factoryMark !== FACTORY_ITEM_MARKS.SEPARATED && line.factoryMark !== FACTORY_ITEM_MARKS.LOADED) return false;
  return Math.abs(factoryLineQty(line) - num(line.requestedQty)) > 1e-9;
}

/** Un renglón listo para enviar: cargado (verde) o rojo. */
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

/** Avance de un pedido: renglones de cada color y cuántos faltan para poder enviar. */
export interface FactoryProgress {
  total: number;
  none: number;
  blue: number;
  green: number;
  red: number;
  /** Separados o cargados con otra cantidad que la pedida. */
  changed: number;
  pending: number;
}

/** Avance de un pedido en preparación, para la tarjeta y la tabla de fábrica. */
export function factoryProgress(lines: FactoryLineState[]): FactoryProgress {
  const counts = { total: lines.length, none: 0, blue: 0, green: 0, red: 0 };
  for (const line of lines) counts[factoryLineColor(line)] += 1;
  return { ...counts, changed: lines.filter(factoryLineChanged).length, pending: factoryLinesPending(lines) };
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

/** Quién ajustó el faltante, en palabras. */
export function editedSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "cashier":
      return "Editado por la caja";
    case "office":
      return "Editado por la oficina";
    case "supervisor":
      return "Editado por supervisora";
    default:
      return "Editado";
  }
}

/** Una fila de la tabla de fábrica (`GET /factory/board` y `/pos/restock/board`). */
export interface FactoryBoardRow {
  branch: { id: string; code: string; name: string };
  /** to_prepare: libre para elegir; preparing: En preparación; on_the_way: En camino. */
  state: "to_prepare" | "preparing" | "on_the_way";
  order: {
    id: string;
    status: string;
    flow: string | null;
    pickedAt: string | null;
    hardwareReadyAt: string | null;
    sentAt: string | null;
    submittedAt: string | null;
    progress: FactoryProgress;
  } | null;
  shortage: { lines: number; bidones: number; packages: number };
  edited: { source: string | null; by?: { id: string; name: string } | null; at: string } | null;
}

/** Renglón de "Por preparar": el faltante en vivo con el ajuste encima. */
export interface ToPrepareLine {
  lineId: string | null;
  productId: string | null;
  name: string;
  unit: string;
  packLabel: string;
  sheet: number;
  stock: number | null;
  minStock: number | null;
  computedQty: number;
  qty: number;
  edited: { source: string; by: string | null; at: string } | null;
}

/** `GET /pos/restock/branches/:id/to-prepare`. */
export interface ToPrepareView {
  branch: { id: string; code: string; name: string };
  /** Fábrica ya lo eligió (o está en camino): solo lectura. */
  locked: boolean;
  order: { id: string; status: string; flow: string | null; pickedAt: string | null } | null;
  edited: { source: string; by: { id: string; name: string } | null; at: string } | null;
  items: ToPrepareLine[];
}

/** Un nombre de las listas de envío. */
export interface FactoryCatalogEntry {
  id: string;
  kind: "sender" | "truck" | "driver";
  name: string;
  active: boolean;
  sort: number;
}

/** Resultado de elegir sucursales: una que falla no detiene a las demás. */
export interface FactoryPickResult {
  results: Array<{ branchId: string; ok: boolean; orderId?: string; error?: string }>;
}
