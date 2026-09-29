import type { FactoryForm, FactoryFormCharges, FactoryFormRow } from "@glamouroso/shared";
import {
  allRows,
  isLinked,
  packsOf,
  round2,
  rowKey,
  targetKey,
  toBase,
  uniqueTargets,
  type SheetValues,
} from "./FactoryFormSheet";

/**
 * Cuentas de una hoja del formato capturada en pantalla (entrada de surtido y
 * hoja de un pedido): lo capturado por renglón, los cargos del pie y el
 * `FactoryForm` con esas cantidades para bajarlo en PDF.
 */

export interface CapturedRow {
  row: FactoryFormRow;
  packs: number;
  /** Litros o piezas que representan los empaques. */
  base: number;
  /** A precio del renglón (o costo del catálogo si el renglón no trae precio). */
  amount: number;
}

export interface SheetCharges {
  transparent: number;
  color: number;
  bidones: number;
  blue: number;
  blueAmount: number;
  publicityQty: number;
  publicityAmount: number;
  total: number;
}

/** Una entrada por línea o producto con cantidad (el formato puede repetir un producto). */
export function capturedRows(rows: FactoryFormRow[], values: SheetValues): CapturedRow[] {
  const list: CapturedRow[] = [];
  for (const row of rows) {
    const packs = packsOf(values[targetKey(row)]);
    if (packs <= 0) continue;
    const base = toBase(values[targetKey(row)], row.packSize);
    list.push({ row, packs, base, amount: round2(base * (row.unitCost ?? 0)) });
  }
  return list;
}

export function capturedTotals(captured: CapturedRow[]) {
  return captured.reduce(
    (acc, item) => ({
      liters: round2(acc.liters + (item.row.lineId ? item.base : 0)),
      pieces: round2(acc.pieces + (item.row.lineId ? 0 : item.base)),
      amount: round2(acc.amount + item.amount),
    }),
    { liters: 0, pieces: 0, amount: 0 }
  );
}

/** Cargos del pie con lo capturado: bidones vacíos, cajas azules y publicidad (reglas del formato de tiendas). */
export function sheetCharges(
  captured: CapturedRow[],
  prices: FactoryFormCharges | undefined,
  publicity: string | number
): SheetCharges {
  let transparent = 0;
  let color = 0;
  let blue = 0;
  for (const { row, packs } of captured) {
    if (row.bidon === "transparent") transparent += packs;
    if (row.bidon === "color") color += packs;
    if (row.blueBox) blue += packs;
  }
  const publicityQty = Math.max(0, Math.floor(Number(publicity) || 0));
  const bidones = round2(transparent * (prices?.bidonTransparent ?? 0) + color * (prices?.bidonColor ?? 0));
  const blueAmount = round2(blue * (prices?.blueBox ?? 0));
  const publicityAmount = round2(publicityQty * (prices?.publicity ?? 0));
  return {
    transparent,
    color,
    bidones,
    blue,
    blueAmount,
    publicityQty,
    publicityAmount,
    total: round2(bidones + blueAmount + publicityAmount),
  };
}

/**
 * El formato con las cantidades de la pantalla, listo para `exportFactoryFormPdf`.
 * Sin `canSeeCosts` salen las cantidades sin importes.
 */
export function formWithValues(
  form: FactoryForm,
  values: SheetValues,
  charges: SheetCharges,
  canSeeCosts: boolean
): FactoryForm {
  // Un producto repetido en el formato lleva su cantidad solo en el primer renglón.
  const firstRows = new Set(uniqueTargets(allRows(form)).map(rowKey));
  const withValues = (row: FactoryFormRow): FactoryFormRow => {
    if (!isLinked(row)) return row;
    if (!firstRows.has(rowKey(row))) return { ...row, qty: null, amount: null };
    const packs = packsOf(values[targetKey(row)]);
    const amount = packs > 0 && canSeeCosts ? round2(packs * row.packSize * (row.unitCost ?? 0)) : null;
    return { ...row, qty: packs > 0 ? round2(packs) : null, amount, unitCost: canSeeCosts ? row.unitCost : null };
  };
  const pages = form.pages.map((p) => ({ ...p, blocks: p.blocks.map((block) => block.map(withValues)) }));
  const rowsTotal = (blocks: FactoryFormRow[][]) => blocks.flat().reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const extras = form.extras.map(withValues);
  const last = pages.length - 1;
  const priced = pages.map((p, index) => ({
    ...p,
    total: canSeeCosts
      ? round2(
          rowsTotal(p.blocks) +
            (p.page === 1 ? charges.bidones : 0) +
            (index === last ? rowsTotal([extras]) + charges.blueAmount + charges.publicityAmount : 0)
        )
      : 0,
  }));
  return {
    ...form,
    pages: priced,
    extras,
    bidones: {
      transparent: {
        qty: charges.transparent,
        amount: canSeeCosts ? round2(charges.transparent * (form.charges?.bidonTransparent ?? 0)) : 0,
      },
      color: {
        qty: charges.color,
        amount: canSeeCosts ? round2(charges.color * (form.charges?.bidonColor ?? 0)) : 0,
      },
    },
    blueBoxes: { qty: charges.blue, amount: canSeeCosts ? charges.blueAmount : 0 },
    publicity: { qty: charges.publicityQty, amount: canSeeCosts ? charges.publicityAmount : 0 },
    grandTotal: canSeeCosts ? round2(priced.reduce((sum, p) => sum + p.total, 0)) : 0,
  };
}

/** Valores iniciales de la hoja: la cantidad de cada línea o producto (solo el primer renglón la trae). */
export function initialValues(form: FactoryForm): SheetValues {
  const initial: SheetValues = {};
  for (const row of uniqueTargets(allRows(form))) {
    initial[targetKey(row)] = row.qty ? String(round2(row.qty)) : "";
  }
  return initial;
}
