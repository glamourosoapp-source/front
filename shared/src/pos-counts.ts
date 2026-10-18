import { INVENTORY_COUNT_DEFAULTS, INVENTORY_COUNT_SELECTION } from "./constants";
import type { AbcClass, InventoryCountSelection } from "./constants";

/**
 * Lógica pura de los conteos cíclicos (inventarios aleatorios), compartida por
 * el Back (arma la lista y decide el reconteo) y el Front (convierte lo que se
 * captura). Plan: docs/exec-plans/active/pos-inventarios-ciclicos.md.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Clase ABC por venta en pesos (decisión D6): ordenado de mayor a menor venta,
 * es A mientras la venta acumulada no pase el 80 %, B hasta el 95 % y C el
 * resto. El renglón que cruza el corte se queda en la clase de arriba. Sin
 * venta, C.
 */
export function classifyAbc(
  rows: Array<{ key: string; salesAmount: number }>,
  cutoffs: { a: number; b: number } = {
    a: INVENTORY_COUNT_DEFAULTS.ABC_A_CUTOFF,
    b: INVENTORY_COUNT_DEFAULTS.ABC_B_CUTOFF,
  }
): Map<string, AbcClass> {
  const result = new Map<string, AbcClass>();
  const selling = rows.filter((row) => row.salesAmount > 0).sort((x, y) => y.salesAmount - x.salesAmount);
  const total = selling.reduce((sum, row) => sum + row.salesAmount, 0);
  let before = 0;
  for (const row of selling) {
    const share = total > 0 ? before / total : 1;
    result.set(row.key, share < cutoffs.a ? "A" : share < cutoffs.b ? "B" : "C");
    before += row.salesAmount;
  }
  for (const row of rows) if (!result.has(row.key)) result.set(row.key, "C");
  return result;
}

export interface CountCandidate {
  key: string;
  abcClass: AbcClass;
  /** Último conteo cerrado del renglón en esta sucursal (ISO), o null si nunca. */
  lastCountedAt: string | null;
  /** Diferencias fuera de tolerancia en conteos previos o existencia negativa. */
  risk: boolean;
}

export interface SelectedCountItem {
  key: string;
  abcClass: AbcClass;
  reason: InventoryCountSelection;
}

function daysBetween(fromIso: string, now: Date): number {
  return (now.getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

/** Le toca contarse: nunca se ha contado o ya pasó la frecuencia de su clase. */
export function isCountDue(candidate: CountCandidate, now: Date): boolean {
  if (!candidate.lastCountedAt) return true;
  return daysBetween(candidate.lastCountedAt, now) >= INVENTORY_COUNT_DEFAULTS.FREQUENCY_DAYS[candidate.abcClass];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const CLASS_ORDER: Record<AbcClass, number> = { A: 0, B: 1, C: 2 };

/**
 * La lista sorpresa del conteo. Reparto (60/20/20): **vencidos** primero (A
 * antes que B y C, y entre iguales el que lleva más tiempo sin contarse, con
 * azar para desempatar), luego **riesgo** y el resto **al azar**. Lo contado
 * en los últimos 7 días no se repite salvo que sea de riesgo. Si una cubeta no
 * alcanza, el hueco lo llena la siguiente. `random` se inyecta para los tests.
 */
export function selectCountItems(
  candidates: CountCandidate[],
  options: { size?: number; now?: Date; random?: () => number } = {}
): SelectedCountItem[] {
  const size = Math.max(1, options.size ?? INVENTORY_COUNT_DEFAULTS.ITEMS);
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;
  const recent = (candidate: CountCandidate) =>
    candidate.lastCountedAt !== null && daysBetween(candidate.lastCountedAt, now) < INVENTORY_COUNT_DEFAULTS.RECENT_DAYS;

  const chosen = new Map<string, SelectedCountItem>();
  const take = (list: CountCandidate[], limit: number, reason: InventoryCountSelection) => {
    for (const candidate of list) {
      if (chosen.size >= size || limit <= 0) break;
      if (chosen.has(candidate.key)) continue;
      chosen.set(candidate.key, { key: candidate.key, abcClass: candidate.abcClass, reason });
      limit -= 1;
    }
  };

  const shuffled = shuffle(candidates, random);
  const due = shuffled
    .filter((candidate) => !recent(candidate) && isCountDue(candidate, now))
    .sort((x, y) => {
      const byClass = CLASS_ORDER[x.abcClass] - CLASS_ORDER[y.abcClass];
      if (byClass) return byClass;
      const xAge = x.lastCountedAt ? daysBetween(x.lastCountedAt, now) : Number.POSITIVE_INFINITY;
      const yAge = y.lastCountedAt ? daysBetween(y.lastCountedAt, now) : Number.POSITIVE_INFINITY;
      return yAge - xAge;
    });
  const risky = shuffled.filter((candidate) => candidate.risk);
  const rest = shuffled.filter((candidate) => !recent(candidate) || candidate.risk);

  const dueSlots = Math.round(size * INVENTORY_COUNT_DEFAULTS.DUE_SHARE);
  const riskSlots = Math.round(size * INVENTORY_COUNT_DEFAULTS.RISK_SHARE);
  take(due, dueSlots, INVENTORY_COUNT_SELECTION.DUE);
  take(risky, riskSlots, INVENTORY_COUNT_SELECTION.RISK);
  take(rest, size - chosen.size, INVENTORY_COUNT_SELECTION.RANDOM);
  // Si aún falta (catálogo chico), vencidos y riesgo que no cupieron.
  take(due, size - chosen.size, INVENTORY_COUNT_SELECTION.DUE);
  take(risky, size - chosen.size, INVENTORY_COUNT_SELECTION.RISK);
  return [...chosen.values()];
}

/**
 * ¿La diferencia pide reconteo? (decisión D4) Fuera de ±1 L / ±1 pieza o de
 * ±2 % de lo esperado, lo que sea mayor.
 */
export function countNeedsRecount(expected: number, counted: number): boolean {
  const tolerance = Math.max(
    INVENTORY_COUNT_DEFAULTS.TOLERANCE_UNITS,
    Math.abs(expected) * INVENTORY_COUNT_DEFAULTS.TOLERANCE_RATIO
  );
  return Math.abs(round2(counted - expected)) > tolerance + 1e-9;
}

/**
 * Lo que se captura en la tienda, convertido a la unidad del inventario:
 * líquidos = envases llenos × litros por envase + litros del envase abierto;
 * piezas = cajas × piezas por caja + piezas sueltas.
 */
export function countedQuantity(input: { packs?: number | null; packSize?: number | null; loose?: number | null }): number {
  const packs = Math.max(0, Number(input.packs ?? 0) || 0);
  const packSize = Math.max(1, Number(input.packSize ?? 1) || 1);
  const loose = Math.max(0, Number(input.loose ?? 0) || 0);
  return round2(packs * packSize + loose);
}
